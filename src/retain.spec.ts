import sinon from 'sinon';

import eventize from '.';

describe('retain()', () => {
  it('calls the listener function after registration with on()', () => {
    const obj = eventize({});
    const subscriber = sinon.fake();

    obj.retain('foo');
    obj.emit('foo', 'bar', [1, 2, 3]);

    expect(subscriber.called).toBeFalsy();

    obj.on('foo', subscriber);

    expect(subscriber.calledWith('bar', [1, 2, 3])).toBeTruthy();
  });

  it('calls the listener object after registration with on()', () => {
    const obj = eventize({});
    const subscriber = {
      foo: sinon.fake(),
    };

    obj.retain('foo');
    obj.emit('foo', 'bar', [1, 2, 3]);

    expect(subscriber.foo.called).toBeFalsy();

    obj.on('foo', subscriber);

    expect(subscriber.foo.calledWith('bar', [1, 2, 3])).toBeTruthy();
  });

  it('calls the catch-em-all listener object', () => {
    const obj = eventize({});
    const subscriber = {
      foo: sinon.fake(),
      plah: sinon.fake(),
      bar: sinon.fake(),
    };

    const sub2 = {
      foo: sinon.fake(),
    };

    obj.on(sub2);

    obj.retain('foo');

    obj.emit('foo', 'bar', [1, 2, 3]);
    obj.emit('plah', 'foo!');

    expect(subscriber.foo.called).toBeFalsy();
    expect(subscriber.plah.called).toBeFalsy();
    expect(sub2.foo.callCount).toBe(1);

    obj.on(subscriber);

    expect(subscriber.foo.calledWith('bar', [1, 2, 3])).toBeTruthy();
    expect(subscriber.plah.called).toBeFalsy();
    expect(sub2.foo.callCount).toBe(1);
  });

  it('multiple event signals', () => {
    const obj = eventize({});
    const subscriber = {
      foo: sinon.fake(),
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
