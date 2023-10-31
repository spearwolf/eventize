import {fake, replace} from 'sinon';

import {eventize} from './index';

describe('retain()', () => {
  it('calls the listener function after registration with on()', () => {
    const obj = eventize();
    const subscriber = fake();

    obj.retain('foo');
    obj.emit('foo', 'bar', [1, 2, 3]);

    expect(subscriber.called).toBeFalsy();

    obj.on('foo', subscriber);

    expect(subscriber.calledWith('bar', [1, 2, 3])).toBeTruthy();
  });

  it('calls the listener object after registration with on()', () => {
    const obj = eventize();
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
    const obj = eventize();

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
    const obj = eventize();
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
    const e = eventize();

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
    const e = eventize();

    const sub = fake();

    e.retain('foo');
    e.emit('foo');

    e.once('foo', sub);

    expect(sub.called).toBeTruthy();
  });

  it('retain the original event order', () => {
    const e = eventize();

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
});
