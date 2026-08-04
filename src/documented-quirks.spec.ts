import {emitAsync, emit} from './emit-api';
import {off, on} from './eventize-api';
import {retain} from './retain-api';
import {eventize} from './eventize';
import {Priority} from './Priority';
import {listenersOf} from './__test-utils__/listeners';
import type {OnEventNames} from './types';

// Guards for behaviors that README / docs / the using-eventize skill promise
// but that had no coverage of their own. Sam Vimes' rule: a claim without a
// witness is just a rumour.
describe('documented quirks', () => {
  describe('per-event priority tuples in the array form', () => {
    it('overrides the call-level priority per event', () => {
      const ε = eventize();
      const calls: string[] = [];

      on(ε, [['foo', Priority.Low]], () => calls.push('low-foo'));
      on(ε, [['foo', Priority.Critical]], () => calls.push('critical-foo'));

      emit(ε, 'foo');
      expect(calls).toEqual(['critical-foo', 'low-foo']);
    });

    it('assigns a separate priority to each event of the call', () => {
      const ε = eventize();
      const calls: string[] = [];

      on(
        ε,
        [
          ['a', Priority.High],
          ['b', Priority.Low],
        ],
        (v: unknown) => calls.push(`tuple:${v}`),
      );
      on(ε, 'a', (v: unknown) => calls.push(`plain:${v}`));
      on(ε, 'b', (v: unknown) => calls.push(`plain:${v}`));

      emit(ε, 'a', 1);
      expect(calls).toEqual(['tuple:1', 'plain:1']); // High beats Normal

      calls.length = 0;
      emit(ε, 'b', 2);
      expect(calls).toEqual(['plain:2', 'tuple:2']); // Normal beats Low
    });

    // A one-element tuple is not an EventNameWithPriority, so the typed API
    // rejects it — only untyped JS (or a suppressed call site) produces this
    // shape. It used to pass `undefined` straight into EventListener.priority,
    // where `b.priority - a.priority` turns into NaN. Every comparison against
    // NaN is false, so the binary-search insertion appended the listener
    // wherever it happened to land and priority ordering quietly stopped
    // holding — no error, no warning, just the wrong call order.
    it('falls back to the call-level priority when a tuple carries none', () => {
      const ε = eventize();

      // @ts-expect-error a one-element tuple is not an EventNameWithPriority
      on(ε, [['foo']], () => {});

      const listeners = listenersOf(ε, 'foo');
      expect(listeners).toHaveLength(1);
      const [firstListener] = listeners;
      expect(firstListener).toBeDefined();
      if (firstListener === undefined) return;
      expect(firstListener.priority).toBe(Priority.Normal);
      expect(Number.isNaN(firstListener.priority)).toBe(false);
    });

    it('keeps a priority-less tuple in the right place in the call order', () => {
      const ε = eventize();
      const calls: string[] = [];

      on(ε, 'foo', Priority.Low, () => calls.push('low'));
      // @ts-expect-error a one-element tuple is not an EventNameWithPriority
      on(ε, [['foo']], () => calls.push('no-priority'));
      on(ε, 'foo', Priority.High, () => calls.push('high'));

      emit(ε, 'foo');
      expect(calls).toEqual(['high', 'no-priority', 'low']);
    });

    it('mixes tuples and bare names in one array', () => {
      const ε = eventize();
      const calls: string[] = [];

      // OnEventNames allows the mixed form — no cast needed
      const eventNames: OnEventNames = [['a', Priority.High], 'b'];
      on(ε, eventNames, (v: unknown) => calls.push(String(v)));

      emit(ε, 'a', 1);
      emit(ε, 'b', 2);
      expect(calls).toEqual(['1', '2']);
    });

    it('mixes tuples and bare names inline', () => {
      const ε = eventize();
      const calls: string[] = [];

      on(ε, [['a', Priority.High], 'b'], (v: unknown) => calls.push(String(v)));

      emit(ε, 'a', 1);
      emit(ε, 'b', 2);
      expect(calls).toEqual(['1', '2']);
    });
  });

  describe('off() and retained state', () => {
    it('clears the retained value for a scalar symbol event name', () => {
      const EVENT = Symbol('event');
      const ε = eventize();

      retain(ε, EVENT);
      emit(ε, EVENT, 'value');
      off(ε, EVENT);

      const seen: unknown[] = [];
      on(ε, EVENT, (v: unknown) => seen.push(v));
      expect(seen).toEqual([]);
    });

    it('clears the retained value for an array of symbol names', () => {
      const EVENT = Symbol('event');
      const ε = eventize();

      retain(ε, EVENT);
      emit(ε, EVENT, 'value');
      off(ε, [EVENT]);

      const seen: unknown[] = [];
      on(ε, EVENT, (v: unknown) => seen.push(v));
      expect(seen).toEqual([]);
    });

    it('treats the array and scalar forms identically for mixed names', () => {
      const EVENT = Symbol('event');
      const ε = eventize();

      retain(ε, ['status', EVENT]);
      emit(ε, 'status', 'a');
      emit(ε, EVENT, 'b');

      off(ε, ['status', EVENT]);

      const seen: unknown[] = [];
      on(ε, 'status', (v: unknown) => seen.push(v));
      on(ε, EVENT, (v: unknown) => seen.push(v));
      expect(seen).toEqual([]);
    });

    it('ignores an array element that is not an event name', () => {
      const ε = eventize();

      retain(ε, ['kept', 'dropped']);
      emit(ε, 'kept', 'K');
      emit(ε, 'dropped', 'D');

      // off()'s array branch takes whatever the caller assembled, and the
      // isEventName filter in front of the keeper is what keeps a stray
      // element from being read as a name. It is not a bulk marker either —
      // isBulkRemoval() only reads null, undefined and '*' that way — so
      // 'kept' survives untouched.
      //
      // Until v6.0.0 this branch had a second caller: the unsubscribe handle
      // of a multi-event on() passed an array of EventListener instances
      // through off(). It gives its registrations back through the store now
      // and never enters off() at all, so a user-supplied array is the only
      // thing the filter still has to survive.
      off(ε, ['dropped', 42 as unknown as string]);

      const seen: unknown[] = [];
      on(ε, 'kept', (v: unknown) => seen.push(v));
      on(ε, 'dropped', (v: unknown) => seen.push(v));
      expect(seen).toEqual(['K']);
    });

    it('clears the retained value for an array of string names', () => {
      const ε = eventize();

      retain(ε, 'status');
      emit(ε, 'status', 'value');
      off(ε, ['status']);

      const seen: unknown[] = [];
      on(ε, 'status', (v: unknown) => seen.push(v));
      expect(seen).toEqual([]);
    });
  });

  describe('per-event priorities on a typed emitter', () => {
    interface Events {
      a: [n: number];
      b: [n: number];
    }

    it('accepts tuples, bare names, and a mix of both', () => {
      const ε = eventize<Events>();
      const calls: string[] = [];

      on(
        ε,
        [
          ['a', Priority.High],
          ['b', Priority.Low],
        ],
        (n) => calls.push(`tuple:${n}`),
      );
      on(ε, [['a', Priority.Critical], 'b'], (n) => calls.push(`mixed:${n}`));
      on(ε, ['a', 'b'], (n) => calls.push(`plain:${n}`));

      emit(ε, 'a', 1);
      expect(calls).toEqual(['mixed:1', 'tuple:1', 'plain:1']);

      calls.length = 0;
      emit(ε, 'b', 2);
      expect(calls).toEqual(['mixed:2', 'plain:2', 'tuple:2']);
    });

    it('accepts a call-level priority alongside the array form', () => {
      const ε = eventize<Events>();
      const calls: string[] = [];

      on(ε, ['a', 'b'], Priority.High, (n) => calls.push(`high:${n}`));
      on(ε, ['a', 'b'], (n) => calls.push(`normal:${n}`));

      emit(ε, 'a', 1);
      expect(calls).toEqual(['high:1', 'normal:1']);
    });

    it('still rejects unknown event names inside tuples', () => {
      const ε = eventize<Events>();
      // @ts-expect-error 'nope' is not a key of Events
      on(ε, [['nope', Priority.High]], () => {});
      // @ts-expect-error 'nope' is not a key of Events
      on(ε, [['a', Priority.High], 'nope'], () => {});
    });
  });

  describe('emitAsync() with nothing to collect', () => {
    it('resolves undefined when there are no listeners', async () => {
      const ε = eventize();
      await expect(emitAsync(ε, 'foo')).resolves.toBeUndefined();
    });

    it('resolves undefined when every listener returns null or undefined', async () => {
      const ε = eventize();
      on(ε, 'foo', (): unknown => null);
      on(ε, 'foo', (): unknown => undefined);
      await expect(emitAsync(ε, 'foo')).resolves.toBeUndefined();
    });

    // The declared return type used to be `Promise<any>`, which let
    // the line below compile and then throw at runtime — on exactly the quirk
    // the two cases above pin. `Promise<any[] | undefined>` makes the compiler
    // say so. This case fails if anyone widens the signature back to `any`:
    // the directive goes unused and TS2578 breaks the build.
    it('does not let the result be used without checking for undefined', async () => {
      const ε = eventize();
      const results = await emitAsync(ε, 'foo');

      expect(results).toBeUndefined();
      expect(() => {
        // @ts-expect-error results may be undefined
        results.map((value: unknown) => value);
      }).toThrow(TypeError);
    });
  });

  describe('eventize.is()', () => {
    it('is the same guard as isEventized', () => {
      expect(eventize.is(eventize())).toBe(true);
      expect(eventize.is({})).toBe(false);
    });
  });
});
