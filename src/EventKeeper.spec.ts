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

import {EventKeeper, publishReplays} from './EventKeeper';
import type {EventName} from './types';
import {warn} from './utils';

const warnMock = warn as unknown as jest.Mock;

const bar = Symbol('bar');

beforeEach(() => {
  warnMock.mockClear();
});

describe('EventKeeper', () => {
  it('is instanceable', () => {
    const keeper = new EventKeeper();
    expect(keeper).toBeDefined();
  });

  it('add(eventName)', () => {
    const keeper = new EventKeeper();
    keeper.add('foo');
    keeper.add(bar);

    expect(keeper.eventNames.has('foo')).toBe(true);
    expect(keeper.eventNames.has(bar)).toBe(true);
    expect(keeper.eventNames.has('plah')).toBe(false);
  });

  it('add([eventNames])', () => {
    const keeper = new EventKeeper();
    keeper.add(['foo', 'plah']);

    expect(keeper.eventNames.has('foo')).toBe(true);
    expect(keeper.eventNames.has(bar)).toBe(false);
    expect(keeper.eventNames.has('plah')).toBe(true);
  });

  it('remove(eventName)', () => {
    const keeper = new EventKeeper();

    keeper.add('foo');
    expect(keeper.eventNames.has('foo')).toBe(true);

    keeper.remove('foo');
    expect(keeper.eventNames.has('foo')).toBe(false);
  });

  it('remove(eventName as symbol)', () => {
    const keeper = new EventKeeper();

    keeper.add(bar);
    expect(keeper.eventNames.has(bar)).toBe(true);

    keeper.remove(bar);
    expect(keeper.eventNames.has(bar)).toBe(false);
  });

  it('remove([eventNames])', () => {
    const keeper = new EventKeeper();

    keeper.add(['foo', bar]);
    keeper.add('plah');

    expect(keeper.eventNames.has('foo')).toBe(true);
    expect(keeper.eventNames.has(bar)).toBe(true);
    expect(keeper.eventNames.has('plah')).toBe(true);

    keeper.remove([bar, 'foo', 'plah']);

    expect(keeper.eventNames.has('foo')).toBe(false);
    expect(keeper.eventNames.has(bar)).toBe(false);
    expect(keeper.eventNames.has('plah')).toBe(false);
  });

  it('retain (a previously unknown eventName) should not retain event arguments', () => {
    const keeper = new EventKeeper();
    expect(keeper.eventNames.has('foo')).toBe(false);

    keeper.retain('foo', [1, 2, 3]);

    const emitter = {apply: jest.fn()};
    publishReplays(keeper.replayTo('foo', emitter));

    expect(emitter.apply).not.toHaveBeenCalled();
  });

  it('replayTo (a known and retained event) should replay the event with retained arguments', () => {
    const keeper = new EventKeeper();
    keeper.add('foo');
    expect(keeper.eventNames.has('foo')).toBe(true);

    keeper.retain('foo', [1, 2, 3]);

    const emitter = {apply: jest.fn()};
    publishReplays(keeper.replayTo('foo', emitter));

    expect(emitter.apply.mock.calls[0]).toEqual(['foo', [1, 2, 3]]);
  });

  it('clear(eventName) removes stored event but keeps event name known', () => {
    const keeper = new EventKeeper();
    keeper.add('foo');
    keeper.retain('foo', [1, 2, 3]);

    keeper.clear('foo');

    expect(keeper.eventNames.has('foo')).toBe(true); // Still known
    expect(keeper.events.has('foo')).toBe(false); // But event data cleared
  });

  it('clear([eventNames]) removes multiple stored events', () => {
    const keeper = new EventKeeper();
    keeper.add(['foo', 'bar', 'baz']);
    keeper.retain('foo', ['fooData']);
    keeper.retain('bar', ['barData']);
    keeper.retain('baz', ['bazData']);

    keeper.clear(['foo', 'bar']);

    expect(keeper.events.has('foo')).toBe(false);
    expect(keeper.events.has('bar')).toBe(false);
    expect(keeper.events.has('baz')).toBe(true);
  });

  it('clear with symbol event name', () => {
    const keeper = new EventKeeper();
    keeper.add(bar);
    keeper.retain(bar, ['data']);

    keeper.clear(bar);

    expect(keeper.eventNames.has(bar)).toBe(true);
    expect(keeper.events.has(bar)).toBe(false);
  });

  it('remove also clears retained event data', () => {
    const keeper = new EventKeeper();
    keeper.add('foo');
    keeper.retain('foo', [1, 2, 3]);

    expect(keeper.eventNames.has('foo')).toBe(true);
    expect(keeper.events.has('foo')).toBe(true);

    keeper.remove('foo');

    expect(keeper.eventNames.has('foo')).toBe(false);
    expect(keeper.events.has('foo')).toBe(false);
  });

  it('retaining same event multiple times overwrites previous value', () => {
    const keeper = new EventKeeper();
    keeper.add('foo');

    keeper.retain('foo', ['first']);
    keeper.retain('foo', ['second']);
    keeper.retain('foo', ['third']);

    const emitter = {apply: jest.fn()};
    publishReplays(keeper.replayTo('foo', emitter));

    expect(emitter.apply).toHaveBeenCalledTimes(1);
    expect(emitter.apply.mock.calls[0]).toEqual(['foo', ['third']]);
  });

  it('replayTo with wildcard (*) publishes all retained events', () => {
    const keeper = new EventKeeper();
    keeper.add(['foo', 'bar', 'baz']);

    keeper.retain('foo', ['fooData']);
    keeper.retain('bar', ['barData']);
    keeper.retain('baz', ['bazData']);

    const emitter = {apply: jest.fn()};
    publishReplays(keeper.replayTo('*', emitter));

    expect(emitter.apply).toHaveBeenCalledTimes(3);
    const calls = emitter.apply.mock.calls.map((c) => c[0]);
    expect(calls).toContain('foo');
    expect(calls).toContain('bar');
    expect(calls).toContain('baz');
  });

  it('replayTo returns empty array for unknown event', () => {
    const keeper = new EventKeeper();
    const emitter = {apply: jest.fn()};

    const result = keeper.replayTo('unknown', emitter);

    expect(result).toEqual([]);
    expect(emitter.apply).not.toHaveBeenCalled();
  });

  it('replayTo returns empty array for known but not retained event', () => {
    const keeper = new EventKeeper();
    keeper.add('foo');
    // Not calling retain

    const emitter = {apply: jest.fn()};
    const result = keeper.replayTo('foo', emitter);

    expect(result).toEqual([]);
    expect(emitter.apply).not.toHaveBeenCalled();
  });

  it('publish sorts events by order before emitting', () => {
    const keeper = new EventKeeper();
    keeper.add(['first', 'second', 'third']);

    // Retain in specific order
    keeper.retain('first', ['1']);
    keeper.retain('second', ['2']);
    keeper.retain('third', ['3']);

    const order: EventName[] = [];
    const emitter = {
      apply: jest.fn((eventName: EventName) => {
        order.push(eventName);
      }),
    };

    publishReplays(keeper.replayTo('*', emitter));

    expect(order).toEqual(['first', 'second', 'third']);
  });

  it('replayTo accumulates to provided sortedEvents array', () => {
    const keeper = new EventKeeper();
    keeper.add('foo');
    keeper.retain('foo', ['data']);

    const existingEvents = [{order: 0, eventName: 'seed', replay: jest.fn()}];
    const emitter = {apply: jest.fn()};

    const result = keeper.replayTo('foo', emitter, existingEvents);

    expect(result.length).toBe(2);
    expect(result[0]).toBe(existingEvents[0]);
  });

  it('retain with empty arguments array', () => {
    const keeper = new EventKeeper();
    keeper.add('foo');
    keeper.retain('foo', []);

    const emitter = {apply: jest.fn()};
    publishReplays(keeper.replayTo('foo', emitter));

    expect(emitter.apply).toHaveBeenCalledWith('foo', []);
  });

  it('removeAll() drops every retain policy and every retained value', () => {
    const keeper = new EventKeeper();
    keeper.add(['foo', bar, 'plah']);
    keeper.retain('foo', ['fooData']);
    keeper.retain(bar, ['barData']);

    expect(keeper.eventNames.size).toBe(3);
    expect(keeper.events.size).toBe(2);

    keeper.removeAll();

    expect(keeper.eventNames.size).toBe(0);
    expect(keeper.events.size).toBe(0);
    expect(keeper.eventNames.has('foo')).toBe(false);
    expect(keeper.eventNames.has(bar)).toBe(false);

    // nothing left to replay, and a later retain() is a no-op without a policy
    keeper.retain('foo', ['afterwards']);
    expect(keeper.events.size).toBe(0);
  });

  it('clearAll() drops every retained value and keeps the retain policies', () => {
    const keeper = new EventKeeper();
    keeper.add(['foo', bar, 'plah']);
    keeper.retain('foo', ['fooData']);
    keeper.retain(bar, ['barData']);

    expect(keeper.eventNames.size).toBe(3);
    expect(keeper.events.size).toBe(2);

    keeper.clearAll();

    expect(keeper.events.size).toBe(0);
    expect(keeper.eventNames.size).toBe(3);
    expect(keeper.eventNames.has('foo')).toBe(true);
    expect(keeper.eventNames.has(bar)).toBe(true);
    expect(keeper.eventNames.has('plah')).toBe(true);

    // the policies survived, so the next retain() stores again
    keeper.retain('foo', ['afterwards']);
    expect(keeper.events.size).toBe(1);
  });

  it('removeAll() and clearAll() on an empty keeper do not throw', () => {
    const keeper = new EventKeeper();

    expect(() => keeper.removeAll()).not.toThrow();
    expect(() => keeper.clearAll()).not.toThrow();
    expect(keeper.eventNames.size).toBe(0);
    expect(keeper.events.size).toBe(0);
  });

  it('replayTo skips a wildcard name inside events instead of recursing', () => {
    const keeper = new EventKeeper();

    // retain() rejects '*' since v6.0.0, so this can only be reached by seeding
    // `events` by hand — since v6.0.0 the catch-em-all branch walks
    // `events` (not `eventNames`), so that's the structure the isCatchEmAll
    // guard now has to protect. Without it, a '*' entry here would recurse
    // into itself and blow the stack.
    //
    // The real retain has to come first: until something is held, `events` is
    // the shared empty stand-in, and writing into that one would seed a '*'
    // entry into every other keeper this module built rather than into this
    // one. The stand-in throws on set(), so getting this order wrong fails
    // here instead of somewhere downstream.
    keeper.add('foo');
    keeper.retain('foo', ['payload']);
    keeper.events.set('*', {order: -1, args: []});

    const emitter = {apply: jest.fn()};
    const result = keeper.replayTo('*', emitter);

    // returned at all — the point of the guard
    expect(result.length).toBe(1);

    publishReplays(result);

    expect(emitter.apply).toHaveBeenCalledTimes(1);
    expect(emitter.apply.mock.calls[0]).toEqual(['foo', ['payload']]);

    const replayedNames = emitter.apply.mock.calls.map((c) => c[0]);
    expect(replayedNames).toContain('foo');
    expect(replayedNames).not.toContain('*');
  });

  // replayTo('*') must replay exactly what's in `events`, no more
  // and no less, regardless of how many retain policies exist alongside it.
  // This pins result equivalence, not iteration cost — a bulk of policies
  // with a single retained value must still produce a single replay.
  it('replayTo(*) replays only the retained values, unaffected by the number of policies', () => {
    const keeper = new EventKeeper();

    const names = Array.from({length: 200}, (_, i) => `policy-${i}`);
    keeper.add(names);

    // only one of the many known policies actually holds a retained value
    keeper.retain('policy-137', ['onlyValue']);

    const emitter = {apply: jest.fn()};
    publishReplays(keeper.replayTo('*', emitter));

    expect(emitter.apply).toHaveBeenCalledTimes(1);
    expect(emitter.apply.mock.calls[0]).toEqual(['policy-137', ['onlyValue']]);
  });

  // The two containers are lazy, and until the first write both fields point
  // at one pair shared by every keeper this module instance built. That makes
  // every write path a place where a forgotten materialization would leak
  // entries into all of them at once — a corruption no behavioural spec can
  // see, because the emitter under test would still behave correctly. These
  // cases watch the stand-in itself instead.
  describe('the shared empty containers', () => {
    it('a fresh keeper builds no containers of its own', () => {
      const a = new EventKeeper();
      const b = new EventKeeper();

      expect(a.events).toBe(b.events);
      expect(a.eventNames).toBe(b.eventNames);
      expect(a.events.size).toBe(0);
      expect(a.eventNames.size).toBe(0);
    });

    it('the first write replaces the stand-in, and only for that keeper', () => {
      const a = new EventKeeper();
      const untouched = new EventKeeper();

      a.add('foo');
      expect(a.eventNames).not.toBe(untouched.eventNames);
      expect(a.events).toBe(untouched.events); // no value held yet

      a.retain('foo', ['payload']);
      expect(a.events).not.toBe(untouched.events);

      expect(untouched.eventNames.size).toBe(0);
      expect(untouched.events.size).toBe(0);
    });

    it('rejects mutation instead of corrupting every keeper this module built', () => {
      const keeper = new EventKeeper();

      expect(() => keeper.events.set('foo', {order: 0, args: []})).toThrow(
        /shared empty stand-in/,
      );
      expect(() => keeper.events.delete('foo')).toThrow();
      expect(() => keeper.events.clear()).toThrow();
      expect(() => keeper.eventNames.add('foo')).toThrow(
        /shared empty stand-in/,
      );
      expect(() => keeper.eventNames.delete('foo')).toThrow();
      expect(() => keeper.eventNames.clear()).toThrow();
    });

    it('removeAll() and clearAll() release the containers rather than emptying them', () => {
      const fresh = new EventKeeper();

      const removed = new EventKeeper();
      removed.add('foo');
      removed.retain('foo', ['payload']);
      removed.removeAll();

      expect(removed.events).toBe(fresh.events);
      expect(removed.eventNames).toBe(fresh.eventNames);

      const cleared = new EventKeeper();
      cleared.add('foo');
      cleared.retain('foo', ['payload']);
      cleared.clearAll();

      expect(cleared.events).toBe(fresh.events);
      // the policies survive clearAll(), so that container is not released
      expect(cleared.eventNames).not.toBe(fresh.eventNames);
    });

    it('a no-op remove(), clear() or retain() leaves the stand-in in place', () => {
      const fresh = new EventKeeper();

      const keeper = new EventKeeper();
      expect(() => keeper.remove('foo')).not.toThrow();
      expect(() => keeper.remove(['foo', bar])).not.toThrow();
      expect(() => keeper.clear('foo')).not.toThrow();
      expect(() => keeper.add([])).not.toThrow();
      // no retain policy, so nothing is stored
      expect(() => keeper.retain('foo', ['payload'])).not.toThrow();

      expect(keeper.events).toBe(fresh.events);
      expect(keeper.eventNames).toBe(fresh.eventNames);
    });
  });

  // A replay runs consumer code that the on() caller never asked to run at
  // this moment, so publishReplays() catches instead of unwinding the
  // registration it is the tail of. These cases watch the batch itself;
  // retain.spec.ts watches what an on() caller sees.
  describe('publishReplays() isolates a throwing replay', () => {
    it('runs the rest of the batch, in order, and warns for the one that threw', () => {
      const keeper = new EventKeeper();
      keeper.add(['first', 'second', 'third']);
      keeper.retain('first', ['1']);
      keeper.retain('second', ['2']);
      keeper.retain('third', ['3']);

      const seen: EventName[] = [];
      const boom = new Error('boom');
      const emitter = {
        apply: (eventName: EventName) => {
          seen.push(eventName);
          if (eventName === 'first') throw boom;
        },
      };

      expect(() => publishReplays(keeper.replayTo('*', emitter))).not.toThrow();

      // sorting happens before the first replay runs, so a throw in the
      // middle of the batch cannot reshuffle what is left of it
      expect(seen).toEqual(['first', 'second', 'third']);

      expect(warnMock).toHaveBeenCalledTimes(1);
      expect(warnMock.mock.calls[0]).toEqual([
        expect.stringContaining('retained replay'),
        'first',
        boom,
      ]);
    });

    it('warns once per throwing replay, not once per batch', () => {
      const keeper = new EventKeeper();
      keeper.add(['a', 'b']);
      keeper.retain('a', ['1']);
      keeper.retain('b', ['2']);

      const emitter = {
        apply: (eventName: EventName) => {
          throw new Error(`boom-${String(eventName)}`);
        },
      };

      publishReplays(keeper.replayTo('*', emitter));

      expect(warnMock).toHaveBeenCalledTimes(2);
      expect(warnMock.mock.calls.map((c) => c[1])).toEqual(['a', 'b']);
    });

    it('isolates a batch of exactly one replay too', () => {
      const keeper = new EventKeeper();
      keeper.add('foo');
      keeper.retain('foo', ['payload']);

      const emitter = {
        apply: () => {
          throw new Error('boom');
        },
      };

      expect(() =>
        publishReplays(keeper.replayTo('foo', emitter)),
      ).not.toThrow();
      expect(warnMock).toHaveBeenCalledTimes(1);
    });

    it('says nothing when no replay throws', () => {
      const keeper = new EventKeeper();
      keeper.add('foo');
      keeper.retain('foo', ['payload']);

      publishReplays(keeper.replayTo('foo', {apply: jest.fn()}));

      expect(warnMock).not.toHaveBeenCalled();
    });
  });

  describe('hasRetainedFor()', () => {
    it('answers for a name, and for the catch-em-all across every name', () => {
      const keeper = new EventKeeper();

      expect(keeper.hasRetainedFor('foo')).toBe(false);
      expect(keeper.hasRetainedFor('*')).toBe(false);

      // a policy without a value is nothing to replay yet
      keeper.add('foo');
      expect(keeper.hasRetainedFor('foo')).toBe(false);
      expect(keeper.hasRetainedFor('*')).toBe(false);

      keeper.retain('foo', ['payload']);
      expect(keeper.hasRetainedFor('foo')).toBe(true);
      expect(keeper.hasRetainedFor('bar')).toBe(false);
      // '*' asks about every held value, never about a value named '*'
      expect(keeper.hasRetainedFor('*')).toBe(true);

      keeper.clearAll();
      expect(keeper.hasRetainedFor('foo')).toBe(false);
      expect(keeper.hasRetainedFor('*')).toBe(false);
    });

    it('agrees with replayTo() on whether there is anything to queue', () => {
      const keeper = new EventKeeper();
      const emitter = {apply: jest.fn()};

      keeper.add(['foo', bar]);
      keeper.retain(bar, ['barData']);

      for (const name of ['foo', bar, 'plah', '*'] as const) {
        expect(keeper.hasRetainedFor(name)).toBe(
          keeper.replayTo(name, emitter).length > 0,
        );
      }
    });
  });
});
