/* eslint-env jest */
import eventize from '../eventize';

describe('retain()', () => {
  it('calls the listener function after registration with on()', () => {
    const obj = eventize({});
    const subscriber = jest.fn();

    obj.retain('foo');
    obj.emit('foo', 'bar', [1, 2, 3]);

    expect(subscriber).not.toHaveBeenCalled();

    obj.on('foo', subscriber);

    expect(subscriber).toHaveBeenCalledWith('bar', [1, 2, 3]);
  });

  it('calls the listener object after registration with on()', () => {
    const obj = eventize({});
    const subscriber = {
      foo: jest.fn(),
    };

    obj.retain('foo');
    obj.emit('foo', 'bar', [1, 2, 3]);

    expect(subscriber.foo).not.toHaveBeenCalled();

    obj.on('foo', subscriber);

    expect(subscriber.foo).toHaveBeenCalledWith('bar', [1, 2, 3]);
  });

  it('calls the catch-em-all listener object', () => {
    const obj = eventize({});
    const subscriber = {
      foo: jest.fn(),
      plah: jest.fn(),
      bar: jest.fn(),
    };

    const sub2 = {
      foo: jest.fn(),
    };

    obj.on(sub2);

    obj.retain('foo');

    obj.emit('foo', 'bar', [1, 2, 3]);
    obj.emit('plah', 'foo!');

    expect(subscriber.foo).not.toHaveBeenCalled();
    expect(subscriber.plah).not.toHaveBeenCalled();
    expect(sub2.foo).toHaveBeenCalledTimes(1);

    obj.on(subscriber);

    expect(subscriber.foo).toHaveBeenCalledWith('bar', [1, 2, 3]);
    expect(subscriber.plah).not.toHaveBeenCalled();
    expect(sub2.foo).toHaveBeenCalledTimes(1);
  });

  it('multiple event signals', () => {
    const obj = eventize({});
    const subscriber = {
      foo: jest.fn(),
    };

    obj.retain('foo');
    obj.emit('foo', 'bar', [1, 2, 3]);

    expect(subscriber.foo).not.toHaveBeenCalled();

    obj.on('foo', subscriber);

    expect(subscriber.foo).toHaveBeenCalledWith('bar', [1, 2, 3]);

    obj.emit('foo', ['a']);

    expect(subscriber.foo).toHaveBeenCalledWith(['a']);
  });
});
