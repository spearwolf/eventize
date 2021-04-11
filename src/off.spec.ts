import sinon from 'sinon';

import eventize from '.';

describe('off()', () => {
  describe('by function', () => {
    const obj = eventize({});
    const listenerFunc = sinon.fake();
    const otherListener = sinon.fake();

    obj.on('foo', listenerFunc);
    obj.on('foo', otherListener);

    obj.emit('foo', 'bar', 666);

    it('emit() calls the listeners', () => {
      expect(listenerFunc.calledWith('bar', 666)).toBeTruthy();
      expect(otherListener.calledWith('bar', 666)).toBeTruthy();
    });

    it('off() removes the listener from the list of subscribers', () => {
      listenerFunc.resetHistory();
      otherListener.resetHistory();

      obj.off(listenerFunc);
      obj.emit('foo', 'bar', 666);

      expect(listenerFunc.callCount).toBe(0);
      expect(otherListener.called).toBeTruthy();
    });
  });

  describe('by function and object', () => {
    const obj = eventize({});
    const listenerObject = {};
    const listenerFunc = sinon.fake();
    const otherListener = sinon.fake();

    obj.on('foo', listenerFunc, listenerObject);
    obj.on('foo', otherListener);

    obj.emit('foo', 'bar', 666);

    it('emit() calls the listeners', () => {
      expect(listenerFunc.calledWith('bar', 666)).toBeTruthy();
      expect(otherListener.calledWith('bar', 666)).toBeTruthy();
    });

    it('off() removes the listener from the list of subscribers', () => {
      listenerFunc.resetHistory();
      otherListener.resetHistory();

      obj.off(listenerFunc, listenerObject);
      obj.emit('foo', 'bar', 666);

      expect(listenerFunc.called).toBeFalsy();
      expect(otherListener.called).toBeTruthy();
    });
  });

  describe('by eventName', () => {
    const obj = eventize({});
    const listenerFunc0 = sinon.fake();
    const listenerFunc1 = sinon.fake();

    obj.on('foo', listenerFunc0);
    obj.on('foo', listenerFunc1);

    obj.emit('foo', 'bar', 666);

    it('emit() calls the listeners', () => {
      expect(listenerFunc0.calledWith('bar', 666)).toBeTruthy();
      expect(listenerFunc1.calledWith('bar', 666)).toBeTruthy();
    });

    it('off() removes the listeners from the list of subscribers', () => {
      listenerFunc0.resetHistory();
      listenerFunc1.resetHistory();

      obj.off('foo');
      obj.emit('foo', 'bar', 666);

      expect(listenerFunc0.called).toBeFalsy();
      expect(listenerFunc1.called).toBeFalsy();
    });
  });

  describe('by object', () => {
    const obj = eventize({});
    const listener = {
      foo: sinon.fake(),
      bar: sinon.fake(),
    };

    obj.on('foo', listener);
    obj.on('bar', listener);

    obj.emit('foo', 'bar', 666);
    obj.emit('bar', 'foo', 666);

    it('emit() calls the listeners', () => {
      expect(listener.foo.calledWith('bar', 666)).toBeTruthy();
      expect(listener.bar.calledWith('foo', 666)).toBeTruthy();
    });

    it('off() removes the listeners from the list of subscribers', () => {
      listener.foo.resetHistory();
      listener.bar.resetHistory();

      obj.off(listener);
      obj.emit('foo', 'bar', 666);
      obj.emit('bar', 'foo', 666);

      expect(listener.foo.called).toBeFalsy();
      expect(listener.bar.called).toBeFalsy();
    });
  });

  describe('without arguments', () => {
    const obj = eventize({});
    const listenerFunc0 = sinon.fake();
    const listenerFunc1 = sinon.fake();

    obj.on('foo', listenerFunc0);
    obj.on('foo', listenerFunc1);

    obj.emit('foo', 'bar', 666);

    it('emit() calls the listeners', () => {
      expect(listenerFunc0.calledWith('bar', 666)).toBeTruthy();
      expect(listenerFunc1.calledWith('bar', 666)).toBeTruthy();
    });

    it('off() removes the listeners from the list of subscribers', () => {
      listenerFunc0.resetHistory();
      listenerFunc1.resetHistory();

      obj.off();
      obj.emit('foo', 'bar', 666);

      expect(listenerFunc0.called).toBeFalsy();
      expect(listenerFunc1.called).toBeFalsy();
    });
  });

  describe('off() inside on()', () => {
    const obj = eventize({});
    const firstListener = sinon.fake();
    const listenerFunc = sinon.fake();
    const otherListener = sinon.fake();

    obj.on('foo', 3, firstListener);
    obj.once('foo', 2, listenerFunc);
    obj.on('foo', otherListener);

    obj.emit('foo', 'bar', 666);

    it('emit() calls the listeners', () => {
      expect(firstListener.calledWith('bar', 666)).toBeTruthy();
      expect(listenerFunc.calledWith('bar', 666)).toBeTruthy();
      expect(otherListener.calledWith('bar', 666)).toBeTruthy();
    });

    it('calling off() inside on() should remove the listeners', () => {
      firstListener.resetHistory();
      listenerFunc.resetHistory();
      otherListener.resetHistory();

      obj.on('foo', 1, () => obj.off('foo'));
      obj.emit('foo', 'bar', 666);

      expect(firstListener.called).toBeTruthy();
      expect(listenerFunc.called).toBeFalsy();
      expect(otherListener.called).toBeFalsy();
    });
  });
});
