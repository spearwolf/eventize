import {fake} from 'sinon';

import {eventize} from './index';

describe('off()', () => {
  describe('by function', () => {
    const obj = eventize();
    const listenerFunc = fake();
    const otherListener = fake();

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
    const obj = eventize();
    const listenerObject = {};
    const listenerFunc = fake();
    const otherListener = fake();

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

    it('off by object context', () => {
      const broker = eventize();

      const a = {foo: fake()};
      const b = {foo: fake(), bar: fake()};

      broker.on('foo', a);
      broker.on(['foo', 'bar'], b);

      broker.emit('foo', 'bar', 666);
      broker.emit('bar', 'plah!');
      broker.emit('plah', 'wtf?');

      expect(a.foo.calledWith('bar', 666)).toBeTruthy();
      expect(b.foo.calledWith('bar', 666)).toBeTruthy();
      expect(b.bar.calledWith('plah!')).toBeTruthy();

      a.foo.resetHistory();
      b.foo.resetHistory();
      b.bar.resetHistory();

      broker.off(b);

      broker.emit('foo', 'bar', 666);
      broker.emit('bar', 'plah!');
      broker.emit('plah', 'wtf?');

      expect(a.foo.calledWith('bar', 666)).toBeTruthy();
      expect(b.foo.called).toBeFalsy();
      expect(b.bar.called).toBeFalsy();
    });
  });

  describe('by eventName', () => {
    const ε = eventize();

    const fn0 = fake();
    const fn1 = fake();
    const fn2 = fake();

    ε.on('foo', fn0);
    ε.on('foo', fn1);
    ε.on({foo: fn2});

    ε.emit('foo', 'bar', 666);

    it('emit() calls the listeners', () => {
      expect(fn0.calledWith('bar', 666)).toBeTruthy();
      expect(fn1.calledWith('bar', 666)).toBeTruthy();
      expect(fn2.calledWith('bar', 666)).toBeTruthy();
    });

    it('off() removes the listeners from the list of subscribers', () => {
      fn0.resetHistory();
      fn1.resetHistory();

      ε.off('foo');
      ε.emit('foo', 'bar', 666);

      expect(fn0.called).toBeFalsy();
      expect(fn1.called).toBeFalsy();
      expect(fn2.called).toBeTruthy();
    });
  });

  describe('by object', () => {
    const ε = eventize();

    const objA = {
      foo: fake(),
      bar: fake(),
    };

    const objB = {
      foo: fake(),
      bar: fake(),
    };

    ε.on('foo', objA);
    ε.on('bar', objA);
    ε.on(objB);

    ε.emit('foo', 'bar', 666);
    ε.emit('bar', 'foo', 666);

    it('emit() calls the listeners', () => {
      expect(objA.foo.calledWith('bar', 666)).toBeTruthy();
      expect(objA.bar.calledWith('foo', 666)).toBeTruthy();
      expect(objB.foo.calledWith('bar', 666)).toBeTruthy();
      expect(objB.bar.calledWith('foo', 666)).toBeTruthy();
    });

    it('off() removes the listeners from the list of subscribers', () => {
      objA.foo.resetHistory();
      objA.bar.resetHistory();
      objB.foo.resetHistory();
      objB.bar.resetHistory();

      ε.off(objA);

      ε.emit('foo', 'bar', 666);
      ε.emit('bar', 'foo', 666);

      expect(objA.foo.called).toBeFalsy();
      expect(objA.bar.called).toBeFalsy();
      expect(objB.foo.called).toBeTruthy();
      expect(objB.bar.called).toBeTruthy();

      objA.foo.resetHistory();
      objA.bar.resetHistory();
      objB.foo.resetHistory();
      objB.bar.resetHistory();

      ε.off(objB);

      ε.emit('foo', 'bar', 666);
      ε.emit('bar', 'foo', 666);

      expect(objA.foo.called).toBeFalsy();
      expect(objA.bar.called).toBeFalsy();
      expect(objB.foo.called).toBeFalsy();
      expect(objB.bar.called).toBeFalsy();
    });
  });

  describe('without arguments', () => {
    const ε = eventize();

    const fn0 = fake();
    const fn1 = fake();
    const fn2 = fake();

    ε.on('foo', fn0);
    ε.on('foo', fn1);
    ε.on({foo: fn2});

    ε.emit('foo', 'bar', 666);

    it('emit() calls the listeners', () => {
      expect(fn0.calledWith('bar', 666)).toBeTruthy();
      expect(fn1.calledWith('bar', 666)).toBeTruthy();
      expect(fn2.calledWith('bar', 666)).toBeTruthy();
    });

    it('off() removes the listeners from the list of subscribers', () => {
      fn0.resetHistory();
      fn1.resetHistory();
      fn2.resetHistory();

      ε.off();
      ε.emit('foo', 'bar', 666);

      expect(fn0.called).toBeFalsy();
      expect(fn1.called).toBeFalsy();
      expect(fn2.called).toBeFalsy();
    });
  });

  describe('off() inside on()', () => {
    const ε = eventize();

    const fn0 = fake();
    const fn1 = fake();
    const fn2 = fake();

    ε.on('foo', 3, fn0);
    ε.once('foo', 2, fn1);
    ε.on('foo', fn2);

    ε.emit('foo', 'bar', 666);

    it('emit() calls the listeners', () => {
      expect(fn0.calledWith('bar', 666)).toBeTruthy();
      expect(fn1.calledWith('bar', 666)).toBeTruthy();
      expect(fn2.calledWith('bar', 666)).toBeTruthy();
    });

    it('calling off() inside on() should remove the listeners', () => {
      fn0.resetHistory();
      fn1.resetHistory();
      fn2.resetHistory();

      ε.on('foo', 1, () => ε.off('foo'));
      ε.emit('foo', 'bar', 666);

      expect(fn0.called).toBeTruthy();
      expect(fn1.called).toBeFalsy();
      expect(fn2.called).toBeFalsy();
    });
  });
});
