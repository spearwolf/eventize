import {fake} from 'sinon';

import {emit, eventize, off, on, once} from './index';

describe('off()', () => {
  describe('by function', () => {
    const obj = eventize();
    const listenerFunc = fake();
    const otherListener = fake();

    on(obj, 'foo', listenerFunc);
    on(obj, 'foo', otherListener);

    emit(obj, 'foo', 'bar', 666);

    it('emit() calls the listeners', () => {
      expect(listenerFunc.calledWith('bar', 666)).toBeTruthy();
      expect(otherListener.calledWith('bar', 666)).toBeTruthy();
    });

    it('off() removes the listener from the list of subscribers', () => {
      listenerFunc.resetHistory();
      otherListener.resetHistory();

      off(obj, listenerFunc);
      emit(obj, 'foo', 'bar', 666);

      expect(listenerFunc.callCount).toBe(0);
      expect(otherListener.called).toBeTruthy();
    });
  });

  describe('by function and object', () => {
    const obj = eventize();
    const listenerObject = {};
    const listenerFunc = fake();
    const otherListener = fake();

    on(obj, 'foo', listenerFunc, listenerObject);
    on(obj, 'foo', otherListener);

    emit(obj, 'foo', 'bar', 666);

    it('emit() calls the listeners', () => {
      expect(listenerFunc.calledWith('bar', 666)).toBeTruthy();
      expect(otherListener.calledWith('bar', 666)).toBeTruthy();
    });

    it('off() removes the listener from the list of subscribers', () => {
      listenerFunc.resetHistory();
      otherListener.resetHistory();

      off(obj, listenerFunc, listenerObject);
      emit(obj, 'foo', 'bar', 666);

      expect(listenerFunc.called).toBeFalsy();
      expect(otherListener.called).toBeTruthy();
    });

    it('off by object context', () => {
      const broker = eventize();

      const a = {foo: fake()};
      const b = {foo: fake(), bar: fake()};
      const c = {onFoo: fake(), onBar: fake()};

      on(broker, 'foo', a);

      on(broker, ['foo', 'bar'], b);

      on(broker, 'foo', 'onFoo', c);
      on(broker, 'bar', 'onBar', c);

      emit(broker, 'foo', 'bar', 666);
      emit(broker, 'bar', 'plah!');
      emit(broker, 'plah', 'wtf?');

      expect(a.foo.calledWith('bar', 666)).toBeTruthy();

      expect(b.foo.calledWith('bar', 666)).toBeTruthy();
      expect(b.bar.calledWith('plah!')).toBeTruthy();

      expect(c.onFoo.calledWith('bar', 666)).toBeTruthy();
      expect(c.onBar.calledWith('plah!')).toBeTruthy();

      a.foo.resetHistory();

      b.foo.resetHistory();
      b.bar.resetHistory();

      c.onFoo.resetHistory();
      c.onBar.resetHistory();

      off(broker, b);
      off(broker, c);

      emit(broker, 'foo', 'bar', 666);
      emit(broker, 'bar', 'plah!');
      emit(broker, 'plah', 'wtf?');

      expect(a.foo.calledWith('bar', 666)).toBeTruthy();

      expect(b.foo.called).toBeFalsy();
      expect(b.bar.called).toBeFalsy();

      expect(c.onFoo.called).toBeFalsy();
      expect(c.onBar.called).toBeFalsy();
    });
  });

  describe('by eventName', () => {
    const ε = eventize();

    const fn0 = fake();
    const fn1 = fake();
    const fn2 = fake();

    on(ε, 'foo', fn0);
    on(ε, 'foo', fn1);
    on(ε, {foo: fn2});

    emit(ε, 'foo', 'bar', 666);

    it('emit() calls the listeners', () => {
      expect(fn0.calledWith('bar', 666)).toBeTruthy();
      expect(fn1.calledWith('bar', 666)).toBeTruthy();
      expect(fn2.calledWith('bar', 666)).toBeTruthy();
    });

    it('off() removes the listeners from the list of subscribers', () => {
      fn0.resetHistory();
      fn1.resetHistory();

      off(ε, 'foo');
      emit(ε, 'foo', 'bar', 666);

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

    on(ε, 'foo', objA);
    on(ε, 'bar', objA);
    on(ε, objB);

    emit(ε, 'foo', 'bar', 666);
    emit(ε, 'bar', 'foo', 666);

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

      off(ε, objA);

      emit(ε, 'foo', 'bar', 666);
      emit(ε, 'bar', 'foo', 666);

      expect(objA.foo.called).toBeFalsy();
      expect(objA.bar.called).toBeFalsy();
      expect(objB.foo.called).toBeTruthy();
      expect(objB.bar.called).toBeTruthy();

      objA.foo.resetHistory();
      objA.bar.resetHistory();
      objB.foo.resetHistory();
      objB.bar.resetHistory();

      off(ε, objB);

      emit(ε, 'foo', 'bar', 666);
      emit(ε, 'bar', 'foo', 666);

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

    on(ε, 'foo', fn0);
    on(ε, 'foo', fn1);
    on(ε, {foo: fn2});

    emit(ε, 'foo', 'bar', 666);

    it('emit() calls the listeners', () => {
      expect(fn0.calledWith('bar', 666)).toBeTruthy();
      expect(fn1.calledWith('bar', 666)).toBeTruthy();
      expect(fn2.calledWith('bar', 666)).toBeTruthy();
    });

    it('off() removes the listeners from the list of subscribers', () => {
      fn0.resetHistory();
      fn1.resetHistory();
      fn2.resetHistory();

      off(ε);
      emit(ε, 'foo', 'bar', 666);

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

    on(ε, 'foo', 3, fn0);
    once(ε, 'foo', 2, fn1);
    on(ε, 'foo', fn2);

    emit(ε, 'foo', 'bar', 666);

    it('emit() calls the listeners', () => {
      expect(fn0.calledWith('bar', 666)).toBeTruthy();
      expect(fn1.calledWith('bar', 666)).toBeTruthy();
      expect(fn2.calledWith('bar', 666)).toBeTruthy();
    });

    it('calling off() inside on() should remove the listeners', () => {
      fn0.resetHistory();
      fn1.resetHistory();
      fn2.resetHistory();

      on(ε, 'foo', 1, () => off(ε, 'foo'));
      emit(ε, 'foo', 'bar', 666);

      expect(fn0.called).toBeTruthy();
      expect(fn1.called).toBeFalsy();
      expect(fn2.called).toBeFalsy();
    });
  });
});
