import {fake} from 'sinon';

import eventize from '.';

describe('retain()', () => {
  it('calls the listener function after registration with on()', () => {
    const obj = eventize({});
    const subscriber = fake();

    obj.retain('foo');
    obj.emit('foo', 'bar', [1, 2, 3]);

    expect(subscriber.called).toBeFalsy();

    obj.on('foo', subscriber);

    expect(subscriber.calledWith('bar', [1, 2, 3])).toBeTruthy();
  });

  it('calls the listener object after registration with on()', () => {
    const obj = eventize({});
    const subscriber = {
      foo: fake(),
    };

    obj.retain('foo');
    obj.emit('foo', 'bar', [1, 2, 3]);

    expect(subscriber.foo.called).toBeFalsy();

    obj.on('foo', subscriber);

    expect(subscriber.foo.calledWith('bar', [1, 2, 3])).toBeTruthy();
  });

  it('calls the catch-em-all listener object', () => {
    const obj = eventize({});

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
    const obj = eventize({});
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
});
