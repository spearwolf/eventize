import {fake} from 'sinon';

import {emit, eventize, off, on, once, retain} from './index';

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

  describe('error handling', () => {
    it('throws an error when called on a non-eventized object', () => {
      const plainObj = {};
      expect(() => off(plainObj)).toThrow('object is not eventized');
    });

    it('throws an error when called on null', () => {
      expect(() => off(null as any)).toThrow();
    });

    it('throws an error when called on undefined', () => {
      expect(() => off(undefined as any)).toThrow();
    });
  });

  describe('by wildcard "*"', () => {
    it('off("*") removes all listeners', () => {
      const ε = eventize();
      const fn0 = fake();
      const fn1 = fake();
      const fn2 = fake();

      on(ε, 'foo', fn0);
      on(ε, 'bar', fn1);
      on(ε, fn2); // wildcard listener

      emit(ε, 'foo', 'test');
      emit(ε, 'bar', 'test');

      expect(fn0.called).toBeTruthy();
      expect(fn1.called).toBeTruthy();
      expect(fn2.callCount).toBe(2);

      fn0.resetHistory();
      fn1.resetHistory();
      fn2.resetHistory();

      off(ε, '*');

      emit(ε, 'foo', 'test');
      emit(ε, 'bar', 'test');

      expect(fn0.called).toBeFalsy();
      expect(fn1.called).toBeFalsy();
      expect(fn2.called).toBeFalsy();
    });
  });

  describe('by Symbol event name', () => {
    it('off(Symbol) removes listeners for that symbol event', () => {
      const ε = eventize();
      const MyEvent = Symbol('MyEvent');
      const fn0 = fake();
      const fn1 = fake();
      const otherFn = fake();

      on(ε, MyEvent, fn0);
      on(ε, MyEvent, fn1);
      on(ε, 'foo', otherFn);

      emit(ε, MyEvent, 'test');
      emit(ε, 'foo', 'test');

      expect(fn0.calledWith('test')).toBeTruthy();
      expect(fn1.calledWith('test')).toBeTruthy();
      expect(otherFn.calledWith('test')).toBeTruthy();

      fn0.resetHistory();
      fn1.resetHistory();
      otherFn.resetHistory();

      off(ε, MyEvent);

      emit(ε, MyEvent, 'test');
      emit(ε, 'foo', 'test');

      expect(fn0.called).toBeFalsy();
      expect(fn1.called).toBeFalsy();
      expect(otherFn.called).toBeTruthy();
    });
  });

  describe('by eventName and listenerObject', () => {
    it('off("eventName", listenerObject) removes only listeners for that event and object', () => {
      const ε = eventize();
      const objA = {foo: fake(), bar: fake()};
      const objB = {foo: fake()};

      // Use object listeners subscribed to specific events
      on(ε, 'foo', objA);
      on(ε, 'bar', objA);
      on(ε, 'foo', objB);

      emit(ε, 'foo', 'test');
      emit(ε, 'bar', 'test');

      expect(objA.foo.called).toBeTruthy();
      expect(objA.bar.called).toBeTruthy();
      expect(objB.foo.called).toBeTruthy();

      objA.foo.resetHistory();
      objA.bar.resetHistory();
      objB.foo.resetHistory();

      // Remove only objA's 'foo' listener
      off(ε, 'foo', objA);

      emit(ε, 'foo', 'test');
      emit(ε, 'bar', 'test');

      expect(objA.foo.called).toBeFalsy();
      expect(objA.bar.called).toBeTruthy();
      expect(objB.foo.called).toBeTruthy();
    });

    it('off(Symbol, listenerObject) removes listener for symbol event and object', () => {
      const ε = eventize();
      const MyEvent = Symbol('MyEvent');
      const objA = {[MyEvent]: fake()};
      const objB = {[MyEvent]: fake()};

      on(ε, MyEvent, objA);
      on(ε, MyEvent, objB);

      emit(ε, MyEvent, 'test');

      expect(objA[MyEvent].called).toBeTruthy();
      expect(objB[MyEvent].called).toBeTruthy();

      objA[MyEvent].resetHistory();
      objB[MyEvent].resetHistory();

      off(ε, MyEvent, objA);

      emit(ε, MyEvent, 'test');

      expect(objA[MyEvent].called).toBeFalsy();
      expect(objB[MyEvent].called).toBeTruthy();
    });
  });

  describe('using unsubscribe function', () => {
    it('unsubscribe function from on() removes the listener', () => {
      const ε = eventize();
      const fn0 = fake();
      const fn1 = fake();

      const unsubscribe = on(ε, 'foo', fn0);
      on(ε, 'foo', fn1);

      emit(ε, 'foo', 'test');

      expect(fn0.called).toBeTruthy();
      expect(fn1.called).toBeTruthy();

      fn0.resetHistory();
      fn1.resetHistory();

      unsubscribe();

      emit(ε, 'foo', 'test');

      expect(fn0.called).toBeFalsy();
      expect(fn1.called).toBeTruthy();
    });

    it('calling unsubscribe multiple times is safe', () => {
      const ε = eventize();
      const fn0 = fake();

      const unsubscribe = on(ε, 'foo', fn0);

      emit(ε, 'foo', 'test');
      expect(fn0.callCount).toBe(1);

      fn0.resetHistory();

      unsubscribe();
      unsubscribe(); // Should not throw
      unsubscribe(); // Should not throw

      emit(ε, 'foo', 'test');
      expect(fn0.called).toBeFalsy();
    });

    it('unsubscribe function from on() with multiple event names removes all listeners', () => {
      const ε = eventize();
      const fn0 = fake();

      const unsubscribe = on(ε, ['foo', 'bar'], fn0);

      emit(ε, 'foo', 'test');
      emit(ε, 'bar', 'test');

      expect(fn0.callCount).toBe(2);

      fn0.resetHistory();

      unsubscribe();

      emit(ε, 'foo', 'test');
      emit(ε, 'bar', 'test');

      expect(fn0.called).toBeFalsy();
    });
  });

  describe('wildcard listeners', () => {
    it('off(wildcardListenerFunc) removes only that wildcard listener', () => {
      const ε = eventize();
      const wildcardFn = fake();
      const namedFn = fake();

      on(ε, '*', wildcardFn);
      on(ε, 'foo', namedFn);

      emit(ε, 'foo', 'test');

      // Wildcard listener is called exactly once per emit
      expect(wildcardFn.callCount).toBe(1);
      expect(namedFn.called).toBeTruthy();

      wildcardFn.resetHistory();
      namedFn.resetHistory();

      off(ε, wildcardFn);

      emit(ε, 'foo', 'test');

      expect(wildcardFn.called).toBeFalsy();
      expect(namedFn.called).toBeTruthy();
    });

    it('off(wildcardListenerObject) removes object from wildcard listeners', () => {
      const ε = eventize();
      const wildcardObj = {foo: fake(), bar: fake()};
      const namedFn = fake();

      on(ε, wildcardObj);
      on(ε, 'foo', namedFn);

      emit(ε, 'foo', 'test');
      emit(ε, 'bar', 'test');

      expect(wildcardObj.foo.called).toBeTruthy();
      expect(wildcardObj.bar.called).toBeTruthy();
      expect(namedFn.called).toBeTruthy();

      wildcardObj.foo.resetHistory();
      wildcardObj.bar.resetHistory();
      namedFn.resetHistory();

      off(ε, wildcardObj);

      emit(ε, 'foo', 'test');
      emit(ε, 'bar', 'test');

      expect(wildcardObj.foo.called).toBeFalsy();
      expect(wildcardObj.bar.called).toBeFalsy();
      expect(namedFn.called).toBeTruthy();
    });
  });

  describe('with array of event names', () => {
    it('off(["foo", "bar"]) removes listeners for multiple events', () => {
      const ε = eventize();
      const fn0 = fake();
      const fn1 = fake();
      const fn2 = fake();

      on(ε, 'foo', fn0);
      on(ε, 'bar', fn1);
      on(ε, 'baz', fn2);

      emit(ε, 'foo', 'test');
      emit(ε, 'bar', 'test');
      emit(ε, 'baz', 'test');

      expect(fn0.called).toBeTruthy();
      expect(fn1.called).toBeTruthy();
      expect(fn2.called).toBeTruthy();

      fn0.resetHistory();
      fn1.resetHistory();
      fn2.resetHistory();

      off(ε, ['foo', 'bar']);

      emit(ε, 'foo', 'test');
      emit(ε, 'bar', 'test');
      emit(ε, 'baz', 'test');

      expect(fn0.called).toBeFalsy();
      expect(fn1.called).toBeFalsy();
      expect(fn2.called).toBeTruthy();
    });
  });

  describe('interaction with retain()', () => {
    it('off() by eventName clears retained events', () => {
      const ε = eventize();
      const fn0 = fake();

      retain(ε, 'foo');
      emit(ε, 'foo', 'retained value');

      // New listener should receive retained event
      on(ε, 'foo', fn0);
      expect(fn0.calledWith('retained value')).toBeTruthy();

      fn0.resetHistory();

      // Remove all listeners and retained event for 'foo'
      off(ε, 'foo');

      // New listener should NOT receive retained event (it was cleared)
      const fn1 = fake();
      on(ε, 'foo', fn1);

      // The listener should not have been called with retained value
      expect(fn1.called).toBeFalsy();
    });

    it('off() with array of event names clears retained events for those events', () => {
      const ε = eventize();

      retain(ε, ['foo', 'bar', 'baz']);
      emit(ε, 'foo', 'foo-value');
      emit(ε, 'bar', 'bar-value');
      emit(ε, 'baz', 'baz-value');

      off(ε, ['foo', 'bar']);

      // New listeners for foo and bar should NOT receive retained events
      const fnFoo = fake();
      const fnBar = fake();
      const fnBaz = fake();

      on(ε, 'foo', fnFoo);
      on(ε, 'bar', fnBar);
      on(ε, 'baz', fnBaz);

      expect(fnFoo.called).toBeFalsy();
      expect(fnBar.called).toBeFalsy();
      expect(fnBaz.calledWith('baz-value')).toBeTruthy();
    });
  });

  describe('reference counting with similar listeners', () => {
    it('similar listeners share refCount and are removed correctly', () => {
      const ε = eventize();
      const listenerObj = {foo: fake()};

      // Subscribe the same object listener multiple times
      const unsub1 = on(ε, 'foo', listenerObj);
      const unsub2 = on(ε, 'foo', listenerObj);

      emit(ε, 'foo', 'test');

      // Due to reference counting, the listener is only called once
      expect(listenerObj.foo.callCount).toBe(1);

      listenerObj.foo.resetHistory();

      // First unsubscribe reduces refCount
      unsub1();

      emit(ε, 'foo', 'test');
      // Listener should still be active because refCount > 0
      expect(listenerObj.foo.callCount).toBe(1);

      listenerObj.foo.resetHistory();

      // Second unsubscribe removes the listener completely
      unsub2();

      emit(ε, 'foo', 'test');
      expect(listenerObj.foo.called).toBeFalsy();
    });
  });

  describe('edge cases', () => {
    it('off() is safe when called on an emitter with no listeners', () => {
      const ε = eventize();

      // Should not throw
      expect(() => off(ε)).not.toThrow();
      expect(() => off(ε, 'nonexistent')).not.toThrow();
      expect(() => off(ε, () => {})).not.toThrow();
    });

    it('off() during emit does not affect current emit cycle for listeners with higher priority', () => {
      const ε = eventize();
      const calls: string[] = [];

      on(ε, 'foo', 10, () => {
        calls.push('high-priority');
      });

      on(ε, 'foo', 5, () => {
        calls.push('mid-priority');
        off(ε, 'foo'); // Remove all 'foo' listeners
      });

      on(ε, 'foo', 0, () => {
        calls.push('low-priority');
      });

      emit(ε, 'foo');

      // High and mid priority should be called, low priority should not
      // (because off() was called before it)
      expect(calls).toContain('high-priority');
      expect(calls).toContain('mid-priority');
      expect(calls).not.toContain('low-priority');
    });

    it('off(listener) removes listener from all events it was subscribed to', () => {
      const ε = eventize();
      const fn = fake();

      on(ε, 'foo', fn);
      on(ε, 'bar', fn);
      on(ε, 'baz', fn);

      emit(ε, 'foo');
      emit(ε, 'bar');
      emit(ε, 'baz');

      expect(fn.callCount).toBe(3);

      fn.resetHistory();

      // Remove the function listener entirely
      off(ε, fn);

      emit(ε, 'foo');
      emit(ε, 'bar');
      emit(ε, 'baz');

      expect(fn.called).toBeFalsy();
    });
  });
});
