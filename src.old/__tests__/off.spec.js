/* eslint-env jest */
import eventize from '../eventize';

describe('off()', () => {
  describe('by function', () => {
    const obj = eventize({});
    const listenerFunc = jest.fn();
    const otherListener = jest.fn();

    obj.on('foo', listenerFunc);
    obj.on('foo', otherListener);

    obj.emit('foo', 'bar', 666);

    it('emit() calls the listeners', () => {
      expect(listenerFunc).toHaveBeenCalledWith('bar', 666);
      expect(otherListener).toHaveBeenCalledWith('bar', 666);
    });

    it('off() removes the listener from the list of subscribers', () => {
      listenerFunc.mockClear();
      otherListener.mockClear();

      obj.off(listenerFunc);
      obj.emit('foo', 'bar', 666);

      expect(listenerFunc).not.toHaveBeenCalled();
      expect(otherListener).toHaveBeenCalled();
    });
  });

  describe('by function and object', () => {
    const obj = eventize({});
    const listenerObject = {};
    const listenerFunc = jest.fn();
    const otherListener = jest.fn();

    obj.on('foo', listenerFunc, listenerObject);
    obj.on('foo', otherListener);

    obj.emit('foo', 'bar', 666);

    it('emit() calls the listeners', () => {
      expect(listenerFunc).toHaveBeenCalledWith('bar', 666);
      expect(otherListener).toHaveBeenCalledWith('bar', 666);
    });

    it('off() removes the listener from the list of subscribers', () => {
      listenerFunc.mockClear();
      otherListener.mockClear();

      obj.off(listenerFunc, listenerObject);
      obj.emit('foo', 'bar', 666);

      expect(listenerFunc).not.toHaveBeenCalled();
      expect(otherListener).toHaveBeenCalled();
    });
  });

  describe('by eventName', () => {
    const obj = eventize({});
    const listenerFunc0 = jest.fn();
    const listenerFunc1 = jest.fn();

    obj.on('foo', listenerFunc0);
    obj.on('foo', listenerFunc1);

    obj.emit('foo', 'bar', 666);

    it('emit() calls the listeners', () => {
      expect(listenerFunc0).toHaveBeenCalledWith('bar', 666);
      expect(listenerFunc1).toHaveBeenCalledWith('bar', 666);
    });

    it('off() removes the listeners from the list of subscribers', () => {
      listenerFunc0.mockClear();
      listenerFunc1.mockClear();

      obj.off('foo');
      obj.emit('foo', 'bar', 666);

      expect(listenerFunc0).not.toHaveBeenCalled();
      expect(listenerFunc1).not.toHaveBeenCalled();
    });
  });

  describe('by object', () => {
    const obj = eventize({});
    const listener = {
      foo: jest.fn(),
      bar: jest.fn(),
    };

    obj.on('foo', listener);
    obj.on('bar', listener);

    obj.emit('foo', 'bar', 666);
    obj.emit('bar', 'foo', 666);

    it('emit() calls the listeners', () => {
      expect(listener.foo).toHaveBeenCalledWith('bar', 666);
      expect(listener.bar).toHaveBeenCalledWith('foo', 666);
    });

    it('off() removes the listeners from the list of subscribers', () => {
      listener.foo.mockClear();
      listener.bar.mockClear();

      obj.off(listener);
      obj.emit('foo', 'bar', 666);
      obj.emit('bar', 'foo', 666);

      expect(listener.foo).not.toHaveBeenCalled();
      expect(listener.bar).not.toHaveBeenCalled();
    });
  });

  describe('without arguments', () => {
    const obj = eventize({});
    const listenerFunc0 = jest.fn();
    const listenerFunc1 = jest.fn();

    obj.on('foo', listenerFunc0);
    obj.on('foo', listenerFunc1);

    obj.emit('foo', 'bar', 666);

    it('emit() calls the listeners', () => {
      expect(listenerFunc0).toHaveBeenCalledWith('bar', 666);
      expect(listenerFunc1).toHaveBeenCalledWith('bar', 666);
    });

    it('off() removes the listeners from the list of subscribers', () => {
      listenerFunc0.mockClear();
      listenerFunc1.mockClear();

      obj.off();
      obj.emit('foo', 'bar', 666);

      expect(listenerFunc0).not.toHaveBeenCalled();
      expect(listenerFunc1).not.toHaveBeenCalled();
    });
  });

  describe('off() inside on()', () => {
    const obj = eventize({});
    const firstListener = jest.fn();
    const listenerFunc = jest.fn();
    const otherListener = jest.fn();

    obj.on('foo', 3, firstListener);
    obj.once('foo', 2, listenerFunc);
    obj.on('foo', otherListener);

    obj.emit('foo', 'bar', 666);

    it('emit() calls the listeners', () => {
      expect(firstListener).toHaveBeenCalledWith('bar', 666);
      expect(listenerFunc).toHaveBeenCalledWith('bar', 666);
      expect(otherListener).toHaveBeenCalledWith('bar', 666);
    });

    it('calling off() inside on() should remove the listeners', () => {
      firstListener.mockClear();
      listenerFunc.mockClear();
      otherListener.mockClear();

      obj.on('foo', 1, () => obj.off('foo'));
      obj.emit('foo', 'bar', 666);

      expect(firstListener).toHaveBeenCalled();
      expect(listenerFunc).not.toHaveBeenCalled();
      expect(otherListener).not.toHaveBeenCalled();
    });
  });
});
