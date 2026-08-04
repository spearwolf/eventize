// `warn` is bound to `console.warn` at module load, so a `jest.spyOn(console,
// 'warn')` installed from a spec never sees the call. Replacing the export
// itself is the only way to observe it; everything else stays the real module.
jest.mock('./utils', () => ({
  // Spreading a module namespace drops the non-enumerable `__esModule` flag,
  // and a default or namespace import of the mocked module would then be sent
  // through the CJS interop wrapper. Nothing under src/ imports it that way
  // today; restating the flag keeps this file from becoming the reason the day
  // one does.
  __esModule: true,
  ...jest.requireActual('./utils'),
  warn: jest.fn(),
}));

import {fake, replace} from 'sinon';

import {warn} from './utils';
import {
  Eventize,
  eventize,
  getRetainedCount,
  getRetainedEventNames,
  getSubscriptionCount,
  isEventized,
  off,
  on,
  once,
  emit,
  retain,
  retainClear,
  unretain,
} from './index';
import {keeperOf} from './__test-utils__/listeners';

describe('retain()', () => {
  it('calls the listener function after registration with on()', () => {
    const obj = new (class extends Eventize {})();
    const subscriber = fake();

    obj.retain('foo');
    obj.emit('foo', 'bar', [1, 2, 3]);

    expect(subscriber.called).toBeFalsy();

    obj.on('foo', subscriber);

    expect(subscriber.calledWith('bar', [1, 2, 3])).toBeTruthy();
  });

  it('calls the listener object after registration with on()', () => {
    const obj = new (class extends Eventize {})();
    const subscriber = {
      foo: fake(),
    };

    obj.retain('foo');
    obj.emit('foo', 'bar', [1, 2, 3]);
    obj.emit('foo', 'plah', [4, 5, 6]);

    expect(subscriber.foo.called).toBeFalsy();

    obj.on('foo', subscriber);

    expect(subscriber.foo.calledWith('plah', [4, 5, 6])).toBeTruthy();
    expect(subscriber.foo.callCount).toBe(1);
  });

  it('calls the catch-em-all listener object', () => {
    const obj = new (class extends Eventize {})();

    const subscriber0 = {
      foo: fake(),
      plah: fake(),
      bar: fake(),
    };

    const subscriber1 = {
      foo: fake(),
    };

    obj.on(subscriber1);

    obj.retain('foo');

    obj.emit('foo', 'bar', [1, 2, 3]);
    obj.emit('plah', 'foo!');

    expect(subscriber0.foo.called).toBeFalsy();
    expect(subscriber0.plah.called).toBeFalsy();
    expect(subscriber1.foo.callCount).toBe(1);

    obj.on(subscriber0);

    expect(subscriber0.foo.calledWith('bar', [1, 2, 3])).toBeTruthy();
    expect(subscriber0.plah.called).toBeFalsy();
    expect(subscriber1.foo.callCount).toBe(1);
  });

  it('multiple event signals', () => {
    const obj = new (class extends Eventize {})();
    const subscriber = {
      foo: fake(),
    };

    obj.retain('foo');
    obj.emit('foo', 'bar', [1, 2, 3]);

    expect(subscriber.foo.called).toBeFalsy();

    obj.on('foo', subscriber);

    expect(subscriber.foo.calledWith('bar', [1, 2, 3])).toBeTruthy();

    obj.emit('foo', ['a']);

    expect(subscriber.foo.calledWith(['a'])).toBeTruthy();
  });

  it('the retained value is passed on to all new subscribers', () => {
    const e = eventize.inject();

    const sub0 = fake();
    const sub1 = fake();
    const sub2 = fake();

    e.retain('foo');

    e.emit('foo', 'bar');

    expect(sub0.called).toBeFalsy();
    expect(sub1.called).toBeFalsy();
    expect(sub2.called).toBeFalsy();

    e.on('foo', sub0);

    expect(sub0.calledWith('bar')).toBeTruthy();
    expect(sub1.called).toBeFalsy();
    expect(sub2.called).toBeFalsy();

    e.on('foo', sub1);

    expect(sub0.callCount).toBe(1);
    expect(sub1.calledWith('bar')).toBeTruthy();
    expect(sub2.called).toBeFalsy();

    e.emit('foo', 'plah');

    expect(sub0.callCount).toBe(2);
    expect(sub0.calledWith('plah')).toBeTruthy();
    expect(sub1.callCount).toBe(2);
    expect(sub1.calledWith('plah')).toBeTruthy();
    expect(sub2.called).toBeFalsy();

    e.on('foo', sub2);

    expect(sub0.callCount).toBe(2);
    expect(sub1.callCount).toBe(2);
    expect(sub2.calledWith('plah')).toBeTruthy();
    expect(sub2.callCount).toBe(1);
  });

  it('together with once()', () => {
    const e = eventize.inject();

    const sub = fake();

    e.retain('foo');
    e.emit('foo');

    e.once('foo', sub);

    expect(sub.called).toBeTruthy();
  });

  it('retain the original event order', () => {
    const e = eventize.inject();

    const publishedEvents: string[] = [];

    const subscriber = {
      foo: () => publishedEvents.push('foo'),
      bar: () => publishedEvents.push('bar'),
      plah: () => publishedEvents.push('plah'),
      xyz: () => publishedEvents.push('xyz'),
    };

    const foo = replace(subscriber, 'foo', fake(subscriber.foo));
    const bar = replace(subscriber, 'bar', fake(subscriber.bar));
    const plah = replace(subscriber, 'plah', fake(subscriber.plah));
    const xyz = replace(subscriber, 'xyz', fake(subscriber.xyz));

    e.retain(['foo', 'bar', 'plah', 'xyz']);

    e.emit('plah');
    e.emit('foo');
    e.emit('xyz');
    e.emit('bar');

    e.retainClear('xyz');
    e.emit('xyz');

    e.on(subscriber);

    expect(foo.called).toBeTruthy();
    expect(bar.called).toBeTruthy();
    expect(plah.called).toBeTruthy();
    expect(xyz.called).toBeTruthy();

    expect(publishedEvents).toEqual(['plah', 'foo', 'bar', 'xyz']);
  });

  it('works with symbol event names', () => {
    const e = eventize.inject();
    const myEvent = Symbol('myEvent');
    const sub = fake();

    e.retain(myEvent);
    e.emit(myEvent, 'hello', 123);

    expect(sub.called).toBeFalsy();

    e.on(myEvent, sub);

    expect(sub.calledWith('hello', 123)).toBeTruthy();
    expect(sub.callCount).toBe(1);
  });

  it('works with an array of symbol event names', () => {
    const e = eventize.inject();
    const event1 = Symbol('event1');
    const event2 = Symbol('event2');
    const sub1 = fake();
    const sub2 = fake();

    e.retain([event1, event2]);

    e.emit(event1, 'data1');
    e.emit(event2, 'data2');

    e.on(event1, sub1);
    e.on(event2, sub2);

    expect(sub1.calledWith('data1')).toBeTruthy();
    expect(sub2.calledWith('data2')).toBeTruthy();
  });

  it('calling retain multiple times for same event does not cause issues', () => {
    const e = eventize.inject();
    const sub = fake();

    e.retain('foo');
    e.retain('foo');
    e.retain('foo');

    e.emit('foo', 'bar');

    e.on('foo', sub);

    expect(sub.callCount).toBe(1);
    expect(sub.calledWith('bar')).toBeTruthy();
  });

  it('retain works with functional API', () => {
    const obj = eventize();
    const sub = fake();

    retain(obj, 'test');
    emit(obj, 'test', 'value');

    on(obj, 'test', sub);

    expect(sub.calledWith('value')).toBeTruthy();
  });

  it('retain can eventize a plain object automatically', () => {
    const obj = {};
    const sub = fake();

    retain(obj, 'foo');
    emit(obj, 'foo', 'bar');
    on(obj, 'foo', sub);

    expect(sub.calledWith('bar')).toBeTruthy();
  });

  it('events not marked for retain are not retained', () => {
    const e = eventize.inject();
    const sub = fake();

    e.retain('foo');
    e.emit('bar', 'data'); // bar is not retained
    e.emit('foo', 'fooData');

    e.on('bar', sub);
    e.on('foo', sub);

    // Only foo should be replayed (from retain)
    expect(sub.callCount).toBe(1);
    expect(sub.calledWith('fooData')).toBeTruthy();
  });

  it('retained event with no arguments', () => {
    const e = eventize.inject();
    const sub = fake();

    e.retain('ping');
    e.emit('ping');

    e.on('ping', sub);

    expect(sub.called).toBeTruthy();
    expect(sub.callCount).toBe(1);
  });

  it('retained event with complex arguments', () => {
    const e = eventize.inject();
    const sub = fake();

    const complexArg = {nested: {deep: {value: 42}}, array: [1, 2, 3]};

    e.retain('data');
    e.emit('data', complexArg, null, undefined, 0, false);

    e.on('data', sub);

    expect(sub.calledWith(complexArg, null, undefined, 0, false)).toBeTruthy();
  });

  it('works with onceAsync', async () => {
    const e = eventize.inject();

    e.retain('async-event');
    e.emit('async-event', 'async-data');

    const result = await e.onceAsync('async-event');

    expect(result).toBe('async-data');
  });

  it('wildcard listener receives retained events for catch-all subscription', () => {
    const e = eventize.inject();
    const calls: unknown[][] = [];

    e.retain('event1');
    e.retain('event2');

    e.emit('event1', 'data1');
    e.emit('event2', 'data2');

    e.on('*', (...args: unknown[]) => {
      calls.push(args);
    });

    expect(calls.length).toBe(2);
    // Note: Wildcard function listeners do NOT receive the event name as first argument
    // They receive just the args passed to emit
    expect(calls).toContainEqual(['data1']);
    expect(calls).toContainEqual(['data2']);
  });

  it('retain does not store events emitted before retain is called', () => {
    const e = eventize.inject();
    const sub = fake();

    e.emit('foo', 'before');
    e.retain('foo');

    e.on('foo', sub);

    expect(sub.called).toBeFalsy();
  });

  it('new emissions after subscriber joins still work normally', () => {
    const e = eventize.inject();
    const sub = fake();

    e.retain('foo');
    e.emit('foo', 'first');

    e.on('foo', sub);

    expect(sub.callCount).toBe(1);
    expect(sub.calledWith('first')).toBeTruthy();

    e.emit('foo', 'second');

    expect(sub.callCount).toBe(2);
    expect(sub.calledWith('second')).toBeTruthy();

    e.emit('foo', 'third');

    expect(sub.callCount).toBe(3);
    expect(sub.calledWith('third')).toBeTruthy();
  });

  it('mixed string and symbol event names in array', () => {
    const e = eventize.inject();
    const symEvent = Symbol('symEvent');
    const sub1 = fake();
    const sub2 = fake();

    e.retain(['strEvent', symEvent]);

    e.emit('strEvent', 'strData');
    e.emit(symEvent, 'symData');

    e.on('strEvent', sub1);
    e.on(symEvent, sub2);

    expect(sub1.calledWith('strData')).toBeTruthy();
    expect(sub2.calledWith('symData')).toBeTruthy();
  });

  it('retain with priority listeners', () => {
    const e = eventize.inject();
    const order: number[] = [];

    e.retain('prioritized');
    e.emit('prioritized');

    e.on('prioritized', 10, () => order.push(1)); // higher priority
    e.on('prioritized', 0, () => order.push(2)); // default priority
    e.on('prioritized', -10, () => order.push(3)); // lower priority

    // The retained event should be delivered to all three listeners
    // but each in their own priority order as they subscribe
    expect(order.length).toBe(3);
  });

  describe("wildcard '*'", () => {
    it('rejects retain(ε, "*")', () => {
      const obj = eventize();
      expect(() => retain(obj, '*')).toThrow(/subscrib/i);
    });

    it('rejects an array containing "*"', () => {
      const obj = eventize();
      expect(() => retain(obj, ['foo', '*'])).toThrow(/subscrib/i);
    });

    it('does not register "*" as a retained name after a rejected call', () => {
      const obj = eventize();
      expect(() => retain(obj, '*')).toThrow();

      // the crash this guards against: a wildcard subscribe used to recurse
      // through the '*' entry in eventNames until the stack blew
      const listener = fake();
      expect(() => on(obj, '*', listener)).not.toThrow();
    });
  });

  // retain() used to pass any value straight to EventKeeper.add(), which
  // dumps it into a Set unchecked — retain(ε, 42) filed a policy under `42`
  // that no emit() could ever fill and getRetainedEventNames() would still
  // report. on() has rejected the equivalent shapes since v6.0.0
  // (subscribeTo.ts's assertEventNameIsUsable()); retain() now matches, atom
  // for atom, with the same cause vocabulary but its own message — the
  // subscribeTo helper is private to that module and its message literally
  // says "subscribeTo() called...", which would misname the call here.
  describe('argument validation', () => {
    it('rejects a non-name single value', () => {
      const obj = eventize();
      expect(() => retain(obj, 42 as any)).toThrow(Error);
    });

    it('rejects null', () => {
      const obj = eventize();
      expect(() => retain(obj, null as any)).toThrow(Error);
    });

    it('carries the "invalid-name" cause for a non-name single value', () => {
      const obj = eventize();
      let caught: unknown;
      try {
        retain(obj, 42 as any);
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(Error);
      expect(caught).not.toBeInstanceOf(TypeError);
      expect((caught as Error).cause).toBe('invalid-name');
    });

    // Second half of the API-006 asymmetry: on(ε, [], fn) throws, but
    // retain(ε, []) used to be a silent no-op — EventKeeper.add() returned
    // early without building a container. It now throws instead, the same
    // 'empty-names' cause on() uses for the equivalent shape.
    it('rejects an empty array instead of silently doing nothing', () => {
      const obj = eventize();
      let caught: unknown;
      try {
        retain(obj, []);
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(Error);
      expect(caught).not.toBeInstanceOf(TypeError);
      expect((caught as Error).cause).toBe('empty-names');
    });

    it('rejects a sparse array of event names', () => {
      const obj = eventize();
      let caught: unknown;
      try {
        retain(
          obj,
          Object.assign(new Array(3), {0: 'a', 2: 'b'}) as unknown as string[],
        );
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(Error);
      expect(caught).not.toBeInstanceOf(TypeError);
      expect((caught as Error).cause).toBe('sparse-names');
    });

    it('rejects an array entry that is not an event name', () => {
      const obj = eventize();
      let caught: unknown;
      try {
        retain(obj, ['a', 123, 'c'] as any);
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(Error);
      expect((caught as Error).cause).toBe('invalid-name');
    });

    // Atomicity: none of the rejections above may leave a trace in the
    // keeper, whether the object already carried retained state or not.
    it('leaves an already-retaining emitter unchanged after each rejection', () => {
      const obj = eventize();
      retain(obj, 'existing');
      emit(obj, 'existing', 'payload');

      const namesBefore = getRetainedEventNames(obj);
      const countBefore = getRetainedCount(obj);

      expect(() => retain(obj, 42 as any)).toThrow();
      expect(() => retain(obj, [])).toThrow();
      expect(() =>
        retain(
          obj,
          Object.assign(new Array(2), {0: 'x'}) as unknown as string[],
        ),
      ).toThrow();
      expect(() => retain(obj, ['x', 123] as any)).toThrow();

      expect(getRetainedEventNames(obj)).toEqual(namesBefore);
      expect(getRetainedCount(obj)).toBe(countBefore);
    });

    // And a genuinely plain object — never eventize()d, never touched by
    // retain() before — must not become eventized as a side effect of a
    // call that is going to throw either way. This is the assertion the
    // ordering comment above (validate before asEventized()) actually
    // buys: a refactor that moved assertRetainNamesAreUsable() below
    // asEventized() would still throw the same Error, still leave the
    // keeper empty, and only this check would go red.
    it('does not eventize a plain object through a rejected call', () => {
      const obj = {};

      expect(isEventized(obj)).toBe(false);
      expect(() => retain(obj, 42 as any)).toThrow();

      expect(isEventized(obj)).toBe(false);
      expect(getRetainedEventNames(obj)).toEqual([]);
      expect(getRetainedCount(obj)).toBe(0);
    });
  });

  describe('deduplicated listener objects', () => {
    it('replays a retained event only once when on() dedups the listener', () => {
      const obj = eventize();
      const listenerObject = {foo: fake()};

      retain(obj, 'foo');
      emit(obj, 'foo', 'RETAINED');

      on(obj, 'foo', listenerObject);
      on(obj, 'foo', listenerObject);

      expect(getSubscriptionCount(obj)).toBe(1);
      expect(listenerObject.foo.callCount).toBe(1);
      expect(listenerObject.foo.calledWith('RETAINED')).toBe(true);
    });

    it('still replays to a genuinely new listener', () => {
      const obj = eventize();
      const first = {foo: fake()};
      const second = {foo: fake()};

      retain(obj, 'foo');
      emit(obj, 'foo', 'RETAINED');

      on(obj, 'foo', first);
      on(obj, 'foo', second);

      expect(getSubscriptionCount(obj)).toBe(2);
      expect(first.foo.callCount).toBe(1);
      expect(second.foo.callCount).toBe(1);
    });

    // Behaviour pin, not a dedup guard: each event name builds its own
    // EventListener, so both registrations insert either way.
    it('replays each retained event once for a multi-event subscription', () => {
      const obj = eventize();
      const listenerObject = {a: fake(), b: fake()};

      retain(obj, ['a', 'b']);
      emit(obj, 'a', 'A');
      emit(obj, 'b', 'B');

      on(obj, ['a', 'b'], listenerObject);

      expect(listenerObject.a.callCount).toBe(1);
      expect(listenerObject.b.callCount).toBe(1);
      expect(listenerObject.a.calledWith('A')).toBe(true);
      expect(listenerObject.b.calledWith('B')).toBe(true);
    });

    // A once() next to an existing on() joins its registration, and still gets
    // the replay: the obligation is new even though the listener is not.
    // Without that, whether a once() fires on a retained event would depend on
    // an unrelated on() with the same handler. The guard against an
    // unconditional replay lives in the first case of this block.
    it('replays to a once() registered next to an existing on()', () => {
      const obj = eventize();
      const listenerObject = {foo: fake()};

      retain(obj, 'foo');
      emit(obj, 'foo', 'RETAINED');

      on(obj, 'foo', listenerObject);
      expect(listenerObject.foo.callCount).toBe(1);

      once(obj, 'foo', listenerObject);
      expect(listenerObject.foo.callCount).toBe(2);
      // the once() consumed itself on the replay; only the on() is left
      expect(getSubscriptionCount(obj)).toBe(1);
    });

    // Behaviour pin, not a dedup guard: off() splices the listener out, so
    // the second on() inserts either way. Guards against a future
    // "remember what was already replayed" implementation.
    it('replays again after the listener was removed and re-registered', () => {
      const obj = eventize();
      const listenerObject = {foo: fake()};

      retain(obj, 'foo');
      emit(obj, 'foo', 'RETAINED');

      on(obj, 'foo', listenerObject);
      expect(listenerObject.foo.callCount).toBe(1);

      off(obj, listenerObject);
      expect(getSubscriptionCount(obj)).toBe(0);

      on(obj, 'foo', listenerObject);
      expect(listenerObject.foo.callCount).toBe(2);
    });
  });

  describe('the retain index is built on demand', () => {
    // The keeper builds its Map and its Set at the first write, so an emitter
    // that never retains anything carries neither. Nothing observable from
    // outside says so — getRetainedCount() reports 0 in both cases — which is
    // why this reads the fields directly. Without it, a future change that
    // materializes a container somewhere on the on/emit/off path would give up
    // the whole saving and every other spec would stay green.
    it('an emitter driven only by on/once/emit/off keeps both stand-ins', () => {
      const pristine = keeperOf(eventize({}));
      const obj = eventize({});
      const handler = fake();
      const listenerObject = {foo: fake()};

      on(obj, 'foo', handler);
      once(obj, 'bar', handler);
      on(obj, '*', handler);
      on(obj, 'foo', listenerObject);
      emit(obj, 'foo', 'payload');
      emit(obj, 'bar', 'payload');
      off(obj, 'foo');
      off(obj, listenerObject);

      const keeper = keeperOf(obj);
      expect(keeper.events).toBe(pristine.events);
      expect(keeper.eventNames).toBe(pristine.eventNames);

      // Asserted before the bulk wipe on purpose: off(ε) releases both
      // containers, so it would hide anything the calls above had built.
      off(obj);
      expect(keeperOf(obj).events).toBe(pristine.events);
      expect(keeperOf(obj).eventNames).toBe(pristine.eventNames);
    });

    // The two containers are independent: a policy is not a held value, so
    // retain() alone must not build the value side.
    it('retain() builds the policy container, the first emit builds the value one', () => {
      const pristine = keeperOf(eventize({}));
      const obj = eventize({});

      retain(obj, 'foo');
      expect(keeperOf(obj).eventNames).not.toBe(pristine.eventNames);
      expect(keeperOf(obj).events).toBe(pristine.events);

      emit(obj, 'foo', 'payload');
      expect(keeperOf(obj).events).not.toBe(pristine.events);
    });

    // An emit on a name carrying no retain policy is the common case on an
    // emitter that uses retain() for something else entirely.
    it('an emit on an unretained name builds nothing', () => {
      const pristine = keeperOf(eventize({}));
      const obj = eventize({});

      emit(obj, 'foo', 'payload');

      expect(keeperOf(obj).events).toBe(pristine.events);
      expect(keeperOf(obj).eventNames).toBe(pristine.eventNames);
    });
  });

  // once(ε, '*') is where both new conditions meet: the catch-em-all branch of
  // the keeper's "is anything held" test, and the once() obligation that
  // guards the replay. Named once() and plain on('*') are pinned elsewhere;
  // neither covers the pair.
  describe("once(ε, '*') on retained values", () => {
    it('fires exactly once, however many values are held', () => {
      const obj = eventize({});
      const subscriber = fake();

      retain(obj, ['foo', 'bar', 'plah']);
      emit(obj, 'foo', 'fooData');
      emit(obj, 'bar', 'barData');
      emit(obj, 'plah', 'plahData');

      once(obj, '*', subscriber);

      expect(subscriber.callCount).toBe(1);
      // the obligation settled on the replay, so nothing is left to fire
      expect(getSubscriptionCount(obj)).toBe(0);

      emit(obj, 'foo', 'afterwards');
      expect(subscriber.callCount).toBe(1);
    });

    // Documents the API, not a guard on the pre-check above: replayTo('*')
    // walks `events` regardless of what `hasRetainedFor('*')` consulted, so
    // this stays green even if that pre-check reads the wrong field — the
    // unit case in EventKeeper.spec.ts is what would catch that.
    it('stays armed while nothing is held, then fires on the next emit', () => {
      const obj = eventize({});
      const subscriber = fake();

      retain(obj, 'foo');
      once(obj, '*', subscriber);

      expect(subscriber.callCount).toBe(0);
      expect(getSubscriptionCount(obj)).toBe(1);

      emit(obj, 'foo', 'payload');

      expect(subscriber.calledWith('payload')).toBeTruthy();
      expect(subscriber.callCount).toBe(1);
    });
  });
});

// A retained replay runs consumer code at a moment the on() caller did not
// ask for: the value was produced by whoever emitted it, possibly long ago,
// and the subscription is already in the store by the time the replay runs.
// So a throw here is reported and stepped over, where the same throw during
// emit() unwinds into the caller that caused the event (pinned in
// emit-throwing-listener.spec.ts).
describe('a throwing retained replay', () => {
  const warnMock = warn as unknown as jest.Mock;

  beforeEach(() => {
    warnMock.mockClear();
  });

  it('does not stop the rest of its batch, and keeps the batch order', () => {
    const obj = eventize({});
    const seen: string[] = [];
    const boom = new Error('boom');

    retain(obj, ['a', 'b', 'c']);
    emit(obj, 'a', 'A');
    emit(obj, 'b', 'B');
    emit(obj, 'c', 'C');

    const unsubscribe = on(obj, ['a', 'b', 'c'], (value: string) => {
      seen.push(value);
      if (value === 'A') throw boom;
    });

    expect(seen).toEqual(['A', 'B', 'C']);

    // the handle exists, covers every name, and still works
    expect(getSubscriptionCount(obj)).toBe(3);
    unsubscribe();
    expect(getSubscriptionCount(obj)).toBe(0);

    emit(obj, 'b', 'AFTERWARDS');
    expect(seen).toEqual(['A', 'B', 'C']);

    expect(warnMock).toHaveBeenCalledTimes(1);
    expect(warnMock.mock.calls[0][1]).toBe('a');
    expect(warnMock.mock.calls[0][2]).toBe(boom);
  });

  it('leaves a single-replay subscription registered and unsubscribable', () => {
    const obj = eventize({});
    let calls = 0;

    retain(obj, 'foo');
    emit(obj, 'foo', 'RETAINED');

    const unsubscribe = on(obj, 'foo', () => {
      calls += 1;
      throw new Error('boom');
    });

    expect(calls).toBe(1);
    expect(warnMock).toHaveBeenCalledTimes(1);
    expect(getSubscriptionCount(obj)).toBe(1);

    unsubscribe();
    expect(getSubscriptionCount(obj)).toBe(0);
  });

  // The catch is as wide as the replay: everything the replayed listener sets
  // off synchronously is inside it, so a throw from a listener on a different
  // event is caught too — and reported under the name that was being replayed,
  // which is what makes the logged error the only thing that says where it came
  // from.
  it('also catches a throw from an emit() the replayed listener made itself', () => {
    const obj = eventize({});

    on(obj, 'other', () => {
      throw new Error('boom');
    });

    retain(obj, 'a');
    emit(obj, 'a', 'A');

    expect(() =>
      on(obj, 'a', () => {
        emit(obj, 'other');
      }),
    ).not.toThrow();

    expect(warnMock).toHaveBeenCalledTimes(1);
    // the replayed name, not the one whose listener actually threw
    expect(warnMock.mock.calls[0][1]).toBe('a');
    expect((warnMock.mock.calls[0][2] as Error).message).toBe('boom');
  });

  // A once() spends its one shot in `callAfterApply`, which apply() runs only
  // *after* the listener returned — so a throwing replay settles nothing, and
  // the next replay of the same batch finds the obligation still open. Two
  // intended decisions meet here: a throwing listener keeps its one-shot, and
  // the replays of one batch no longer stop at the first throw. The result is
  // a once() that fires twice for one subscription, which no non-throwing
  // path can produce.
  it('leaves a once() obligation open, so the next replay of the batch fires it again', () => {
    const obj = eventize({});
    const seen: string[] = [];

    retain(obj, ['a', 'b']);
    emit(obj, 'a', 'A');
    emit(obj, 'b', 'B');

    once(obj, ['a', 'b'], (value: string) => {
      seen.push(value);
      if (value === 'A') throw new Error('boom');
    });

    expect(seen).toEqual(['A', 'B']);
    // the second replay returned normally, so it settled the obligation
    expect(getSubscriptionCount(obj)).toBe(0);

    emit(obj, 'a', 'AFTERWARDS');
    expect(seen).toEqual(['A', 'B']);
  });

  // The counterpart: nothing in the batch returned normally, so the one shot
  // is still owed and the subscription stays.
  it('keeps a once() armed when every replay of the batch throws', () => {
    const obj = eventize({});
    const seen: string[] = [];

    retain(obj, ['a', 'b']);
    emit(obj, 'a', 'A');
    emit(obj, 'b', 'B');

    once(obj, ['a', 'b'], (value: string) => {
      seen.push(value);
      throw new Error('boom');
    });

    expect(seen).toEqual(['A', 'B']);
    expect(warnMock).toHaveBeenCalledTimes(2);
    expect(getSubscriptionCount(obj)).toBe(2);
  });
});

// A replay batch is ordered up front and then run; since v6.0.0 each replay
// asks the keeper what it holds at the moment that replay runs. Everything a
// handler does to the retained state therefore reaches the replays still ahead
// of it — the direction `off(ε)` was already taking through listener detach,
// now taken by the retain-side spellings too.
describe('a write during a retained replay batch', () => {
  const warnMock = warn as unknown as jest.Mock;

  beforeEach(() => {
    warnMock.mockClear();
  });

  it('does not deliver a name the running replay unretained', () => {
    const obj = eventize({});
    const seen: string[] = [];

    retain(obj, ['a', 'b']);
    emit(obj, 'a', 'A');
    emit(obj, 'b', 'B');

    on(obj, ['a', 'b'], (value: string) => {
      seen.push(value);
      if (value === 'A') unretain(obj, 'b');
    });

    expect(seen).toEqual(['A']);
    expect(getRetainedEventNames(obj)).toEqual(['a']);
  });

  it('does not deliver the rest of the batch after retainClear(ε, "*")', () => {
    const obj = eventize({});
    const seen: string[] = [];

    retain(obj, ['a', 'b']);
    emit(obj, 'a', 'A');
    emit(obj, 'b', 'B');

    on(obj, ['a', 'b'], (value: string) => {
      seen.push(value);
      if (value === 'A') retainClear(obj, '*');
    });

    expect(seen).toEqual(['A']);
    // retainClear drops the values and keeps the policies
    expect(getRetainedEventNames(obj).sort()).toEqual(['a', 'b']);
    expect(getRetainedCount(obj)).toBe(0);
  });

  // The control. `off(ε)` has taken this direction since v6.0.0 by a different
  // route: it detaches the listeners and `EventListener.apply()` bails on
  // `isRemoved`, so the queued replay finds nothing to call. Both spellings of
  // "stop delivering this to me" now agree.
  it('does not deliver the rest of the batch after off(ε)', () => {
    const obj = eventize({});
    const seen: string[] = [];

    retain(obj, ['a', 'b']);
    emit(obj, 'a', 'A');
    emit(obj, 'b', 'B');

    on(obj, ['a', 'b'], (value: string) => {
      seen.push(value);
      if (value === 'A') off(obj);
    });

    expect(seen).toEqual(['A']);
    expect(getSubscriptionCount(obj)).toBe(0);
    expect(getRetainedEventNames(obj)).toEqual([]);
  });

  // The stale-args window: a queued replay used to close over the value read
  // when it was queued, so a name re-emitted mid-batch replayed the value it
  // had *before*. It now replays what the keeper holds when it runs — the same
  // value a subscriber arriving one moment later would get.
  it('replays the value a mid-batch emit wrote, not the one held at queue time', () => {
    const obj = eventize({});
    const seen: string[] = [];

    retain(obj, ['a', 'b']);
    emit(obj, 'a', 'A');
    emit(obj, 'b', 'B1');

    on(obj, ['a', 'b'], (value: string) => {
      seen.push(value);
      if (value === 'A') emit(obj, 'b', 'B2');
    });

    // 'B2' twice: once live, because every name of the call is registered
    // before the first replay runs, and once from 'b's own queued replay —
    // which now carries the value that emit left behind.
    expect(seen).toEqual(['A', 'B2', 'B2']);
  });

  // Where the new re-check meets the one throw the library swallows: the
  // isolation is unchanged, and so is what the throwing handler managed to do
  // before it threw. The unthrown half of the pair — a throwing replay leaving
  // its once() armed for the next replay of the same batch — is pinned above.
  it('isolates the throw of a replay that unretained the rest of its batch', () => {
    const obj = eventize({});
    const seen: string[] = [];

    retain(obj, ['a', 'b']);
    emit(obj, 'a', 'A');
    emit(obj, 'b', 'B');

    const unsubscribe = once(obj, ['a', 'b'], (value: string) => {
      seen.push(value);
      unretain(obj, 'b');
      throw new Error('boom');
    });

    expect(seen).toEqual(['A']);
    expect(warnMock).toHaveBeenCalledTimes(1);
    // the throwing replay settled nothing and the suppressed one never ran, so
    // the once() is still owed its one shot on both names
    expect(getSubscriptionCount(obj)).toBe(2);

    unsubscribe();
    expect(getSubscriptionCount(obj)).toBe(0);
  });
});
