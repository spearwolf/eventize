import {fake, replace} from 'sinon';

import {Eventize, eventize, on, emit, retain} from './index';

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
});
