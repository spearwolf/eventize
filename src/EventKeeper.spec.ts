import {EventKeeper} from './EventKeeper';
import type {EventName} from './types';

const bar = Symbol('bar');

describe('EventKeeper', () => {
  it('is instanceable', () => {
    const keeper = new EventKeeper();
    expect(keeper).toBeDefined();
  });

  it('add(eventName)', () => {
    const keeper = new EventKeeper();
    keeper.add('foo');
    keeper.add(bar);

    expect(keeper.isKnown('foo')).toBe(true);
    expect(keeper.isKnown(bar)).toBe(true);
    expect(keeper.isKnown('plah')).toBe(false);
  });

  it('add([eventNames])', () => {
    const keeper = new EventKeeper();
    keeper.add(['foo', 'plah']);

    expect(keeper.isKnown('foo')).toBe(true);
    expect(keeper.isKnown(bar)).toBe(false);
    expect(keeper.isKnown('plah')).toBe(true);
  });

  it('remove(eventName)', () => {
    const keeper = new EventKeeper();

    keeper.add('foo');
    expect(keeper.isKnown('foo')).toBe(true);

    keeper.remove('foo');
    expect(keeper.isKnown('foo')).toBe(false);
  });

  it('remove(eventName as symbol)', () => {
    const keeper = new EventKeeper();

    keeper.add(bar);
    expect(keeper.isKnown(bar)).toBe(true);

    keeper.remove(bar);
    expect(keeper.isKnown(bar)).toBe(false);
  });

  it('remove([eventNames])', () => {
    const keeper = new EventKeeper();

    keeper.add(['foo', bar]);
    keeper.add('plah');

    expect(keeper.isKnown('foo')).toBe(true);
    expect(keeper.isKnown(bar)).toBe(true);
    expect(keeper.isKnown('plah')).toBe(true);

    keeper.remove([bar, 'foo', 'plah']);

    expect(keeper.isKnown('foo')).toBe(false);
    expect(keeper.isKnown(bar)).toBe(false);
    expect(keeper.isKnown('plah')).toBe(false);
  });

  it('retain (a previously unknown eventName) should not retain event arguments', () => {
    const keeper = new EventKeeper();
    expect(keeper.isKnown('foo')).toBe(false);

    keeper.retain('foo', [1, 2, 3]);

    const emitter = {apply: jest.fn()};
    EventKeeper.publish(keeper.replayTo('foo', emitter));

    expect(emitter.apply).not.toHaveBeenCalled();
  });

  it('replayTo (a known and retained event) should replay the event with retained arguments', () => {
    const keeper = new EventKeeper();
    keeper.add('foo');
    expect(keeper.isKnown('foo')).toBe(true);

    keeper.retain('foo', [1, 2, 3]);

    const emitter = {apply: jest.fn()};
    EventKeeper.publish(keeper.replayTo('foo', emitter));

    expect(emitter.apply.mock.calls[0]).toEqual(['foo', [1, 2, 3]]);
  });

  it('clear(eventName) removes stored event but keeps event name known', () => {
    const keeper = new EventKeeper();
    keeper.add('foo');
    keeper.retain('foo', [1, 2, 3]);

    keeper.clear('foo');

    expect(keeper.isKnown('foo')).toBe(true); // Still known
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

    expect(keeper.isKnown(bar)).toBe(true);
    expect(keeper.events.has(bar)).toBe(false);
  });

  it('remove also clears retained event data', () => {
    const keeper = new EventKeeper();
    keeper.add('foo');
    keeper.retain('foo', [1, 2, 3]);

    expect(keeper.isKnown('foo')).toBe(true);
    expect(keeper.events.has('foo')).toBe(true);

    keeper.remove('foo');

    expect(keeper.isKnown('foo')).toBe(false);
    expect(keeper.events.has('foo')).toBe(false);
  });

  it('retaining same event multiple times overwrites previous value', () => {
    const keeper = new EventKeeper();
    keeper.add('foo');

    keeper.retain('foo', ['first']);
    keeper.retain('foo', ['second']);
    keeper.retain('foo', ['third']);

    const emitter = {apply: jest.fn()};
    EventKeeper.publish(keeper.replayTo('foo', emitter));

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
    EventKeeper.publish(keeper.replayTo('*', emitter));

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

    EventKeeper.publish(keeper.replayTo('*', emitter));

    expect(order).toEqual(['first', 'second', 'third']);
  });

  it('replayTo accumulates to provided sortedEvents array', () => {
    const keeper = new EventKeeper();
    keeper.add('foo');
    keeper.retain('foo', ['data']);

    const existingEvents = [{order: 0, replay: jest.fn()}];
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
    EventKeeper.publish(keeper.replayTo('foo', emitter));

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
    expect(keeper.isKnown('foo')).toBe(false);
    expect(keeper.isKnown(bar)).toBe(false);

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
    expect(keeper.isKnown('foo')).toBe(true);
    expect(keeper.isKnown(bar)).toBe(true);
    expect(keeper.isKnown('plah')).toBe(true);

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
    keeper.events.set('*', {order: -1, args: []});
    keeper.add('foo');
    keeper.retain('foo', ['payload']);

    const emitter = {apply: jest.fn()};
    const result = keeper.replayTo('*', emitter);

    // returned at all — the point of the guard
    expect(result.length).toBe(1);

    EventKeeper.publish(result);

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
    EventKeeper.publish(keeper.replayTo('*', emitter));

    expect(emitter.apply).toHaveBeenCalledTimes(1);
    expect(emitter.apply.mock.calls[0]).toEqual(['policy-137', ['onlyValue']]);
  });
});
