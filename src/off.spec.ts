import {fake} from 'sinon';

import {
  emit,
  eventize,
  getRetainedCount,
  getRetainedEventNames,
  getSubscriptionCount,
  off,
  on,
  once,
  retain,
} from './index';

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

  // off(ε, listenerObject) promises "every subscription of that object", and
  // removeListenerFromArray used to splice only the first findIndex match per
  // bucket. Anything that can put two similar listeners into one bucket — two
  // once() calls (v6.0.0), or two on() calls at differing priorities (always) —
  // left the rest subscribed and still firing.
  describe('by object, with duplicate registrations in one bucket', () => {
    it('off(ε, listenerObject) removes every once() subscription of that object', () => {
      const obj = eventize();
      const listenerObject = {foo: fake()};

      once(obj, 'foo', listenerObject);
      once(obj, 'foo', listenerObject);
      expect(getSubscriptionCount(obj)).toBe(2);

      off(obj, listenerObject);

      expect(getSubscriptionCount(obj)).toBe(0);
      emit(obj, 'foo');
      expect(listenerObject.foo.callCount).toBe(0);
    });

    it('the same holds for the catch-all once() form', () => {
      const obj = eventize();
      const listenerObject = {foo: fake()};

      once(obj, listenerObject);
      once(obj, listenerObject);
      expect(getSubscriptionCount(obj)).toBe(2);

      off(obj, listenerObject);

      expect(getSubscriptionCount(obj)).toBe(0);
    });

    it('removes multiple on() registrations of one object at differing priorities', () => {
      const obj = eventize();
      const listenerObject = {foo: fake()};

      on(obj, 'foo', 1, listenerObject);
      on(obj, 'foo', 2, listenerObject);
      expect(getSubscriptionCount(obj)).toBe(2);

      off(obj, listenerObject);

      expect(getSubscriptionCount(obj)).toBe(0);
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

  describe('non-eventized inputs', () => {
    it('silently does nothing when called on a non-eventized object', () => {
      const plainObj = {};
      expect(() => off(plainObj)).not.toThrow();
    });

    it('silently does nothing when called on null', () => {
      expect(() => off(null as any)).not.toThrow();
    });

    it('silently does nothing when called on undefined', () => {
      expect(() => off(undefined as any)).not.toThrow();
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

    it('a consumed handle called again does not release a sibling handle', () => {
      const ε = eventize();
      const listenerObject = {foo: fake()};

      const unsub1 = on(ε, 'foo', listenerObject);
      const unsub2 = on(ε, 'foo', listenerObject); // deduped, refCount = 2

      expect(getSubscriptionCount(ε)).toBe(1);

      unsub1();
      expect(getSubscriptionCount(ε)).toBe(1); // refCount 2 -> 1

      unsub1(); // consumed handle: inert, must not decrement again
      expect(getSubscriptionCount(ε)).toBe(1);

      emit(ε, 'foo');
      expect(listenerObject.foo.callCount).toBe(1);

      unsub2(); // the last outstanding handle releases it
      expect(getSubscriptionCount(ε)).toBe(0);
    });

    it('a single handle called twice still reaches zero', () => {
      const ε = eventize();
      const listenerObject = {foo: fake()};

      const unsubscribe = on(ε, 'foo', listenerObject);
      expect(getSubscriptionCount(ε)).toBe(1);

      unsubscribe();
      unsubscribe();

      expect(getSubscriptionCount(ε)).toBe(0);

      emit(ε, 'foo');
      expect(listenerObject.foo.callCount).toBe(0);
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

  // off(ε, '*', listenerObject) used to be a silent no-op: off() sets
  // forceRemove for a name with a listener object, and that branch only ever
  // searched namedListeners — where a wildcard listener never lives.
  describe('by wildcard "*" and listenerObject', () => {
    it("off(ε, '*', listenerObject) detaches the listener-object form", () => {
      const ε = eventize();
      const wildcardObj = {foo: fake()};

      on(ε, '*', wildcardObj);
      expect(getSubscriptionCount(ε)).toBe(1);

      off(ε, '*', wildcardObj);

      expect(getSubscriptionCount(ε)).toBe(0);
      emit(ε, 'foo');
      expect(wildcardObj.foo.callCount).toBe(0);
    });

    it("off(ε, '*', ctx) detaches the function-with-context form", () => {
      const ε = eventize();
      const ctx = {};
      const wildcardFn = fake();

      on(ε, '*', wildcardFn, ctx);
      expect(getSubscriptionCount(ε)).toBe(1);

      off(ε, '*', ctx);

      expect(getSubscriptionCount(ε)).toBe(0);
      emit(ε, 'foo');
      expect(wildcardFn.callCount).toBe(0);
    });

    it("off(ε, '*', ctx) detaches the method-name form", () => {
      const ε = eventize();
      const ctx = {onAny: fake()};

      on(ε, '*', 'onAny', ctx);
      expect(getSubscriptionCount(ε)).toBe(1);

      off(ε, '*', ctx);

      expect(getSubscriptionCount(ε)).toBe(0);
      emit(ε, 'foo');
      expect(ctx.onAny.callCount).toBe(0);
    });

    it("off(ε, '*', obj) detaches the bare catch-all form on(ε, obj)", () => {
      const ε = eventize();
      const wildcardObj = {foo: fake()};

      // on(ε, obj) registers under EVENT_CATCH_EM_ALL, exactly as on(ε, '*',
      // obj) does — same bucket, same event name, same removal.
      on(ε, wildcardObj);
      expect(getSubscriptionCount(ε)).toBe(1);

      off(ε, '*', wildcardObj);

      expect(getSubscriptionCount(ε)).toBe(0);
    });

    it("off(ε, '*', ctx) leaves other objects' wildcard subscriptions alone", () => {
      const ε = eventize();
      const objA = {foo: fake()};
      const objB = {foo: fake()};

      on(ε, '*', objA);
      on(ε, '*', objB);

      off(ε, '*', objA);

      expect(getSubscriptionCount(ε)).toBe(1);
      emit(ε, 'foo');
      expect(objA.foo.callCount).toBe(0);
      expect(objB.foo.callCount).toBe(1);
    });

    // Boundary 1: the targeted wildcard form is not the sweeping
    // off(ε, listenerObject) — a named subscription of the same object stays.
    it("off(ε, '*', ctx) keeps a named subscription of the same object", () => {
      const ε = eventize();
      const listenerObject = {foo: fake(), bar: fake()};

      on(ε, '*', listenerObject);
      on(ε, 'foo', listenerObject);
      expect(getSubscriptionCount(ε)).toBe(2);

      off(ε, '*', listenerObject);

      expect(getSubscriptionCount(ε)).toBe(1);
      emit(ε, 'foo');
      expect(listenerObject.foo.callCount).toBe(1);
      emit(ε, 'bar');
      expect(listenerObject.bar.callCount).toBe(0);
    });

    it('off(ε, listenerObject) is the form that takes both', () => {
      const ε = eventize();
      const listenerObject = {foo: fake()};

      on(ε, '*', listenerObject);
      on(ε, 'foo', listenerObject);

      off(ε, listenerObject);

      expect(getSubscriptionCount(ε)).toBe(0);
    });

    // Boundary 2: a targeted listener removal, not the bulk off(ε, '*') that
    // has wiped the keeper since v6.0.0.
    it("off(ε, '*', ctx) leaves retained state untouched", () => {
      const ε = eventize();
      const wildcardObj = {data: fake()};

      retain(ε, ['data', 'never-emitted']);
      emit(ε, 'data', 'payload');
      on(ε, '*', wildcardObj);

      const retainedCountBefore = getRetainedCount(ε);
      const retainedNamesBefore = getRetainedEventNames(ε);
      expect(retainedCountBefore).toBe(1);
      expect(retainedNamesBefore).toEqual(['data', 'never-emitted']);

      off(ε, '*', wildcardObj);

      expect(getSubscriptionCount(ε)).toBe(0);
      expect(getRetainedCount(ε)).toBe(retainedCountBefore);
      expect(getRetainedEventNames(ε)).toEqual(retainedNamesBefore);

      // still replayed to a later subscriber, policy still in force
      const late = fake();
      on(ε, 'data', late);
      expect(late.calledWith('payload')).toBeTruthy();
    });

    // Boundary 3: reference counting behaves exactly as in the named case —
    // removeSimilarListenersFromArray() detaches outright, refCount is not
    // consulted, so one off() call releases both on() registrations.
    it("off(ε, '*', ctx) releases a refCount-2 registration in one call, as the named form does", () => {
      const wildcardEmitter = eventize();
      const namedEmitter = eventize();
      const listenerObject = {foo: fake()};

      on(wildcardEmitter, '*', listenerObject);
      on(wildcardEmitter, '*', listenerObject); // deduped, refCount = 2
      on(namedEmitter, 'foo', listenerObject);
      on(namedEmitter, 'foo', listenerObject); // deduped, refCount = 2

      expect(getSubscriptionCount(wildcardEmitter)).toBe(1);
      expect(getSubscriptionCount(namedEmitter)).toBe(1);

      off(wildcardEmitter, '*', listenerObject);
      off(namedEmitter, 'foo', listenerObject);

      expect(getSubscriptionCount(wildcardEmitter)).toBe(0);
      expect(getSubscriptionCount(namedEmitter)).toBe(0);

      emit(wildcardEmitter, 'foo');
      emit(namedEmitter, 'foo');
      expect(listenerObject.foo.callCount).toBe(0);
    });

    it("off(ε, '*', ctx) removes every once() registration in that bucket", () => {
      const ε = eventize();
      const listenerObject = {foo: fake()};

      // once() is exempt from dedup: two listeners, one bucket.
      once(ε, '*', listenerObject);
      once(ε, '*', listenerObject);
      expect(getSubscriptionCount(ε)).toBe(2);

      off(ε, '*', listenerObject);

      expect(getSubscriptionCount(ε)).toBe(0);
    });

    it("off(ε, '*', ctx) is a no-op when that object has no wildcard subscription", () => {
      const ε = eventize();
      const listenerObject = {foo: fake()};
      const other = {foo: fake()};

      on(ε, 'foo', listenerObject);

      expect(() => off(ε, '*', other)).not.toThrow();
      expect(getSubscriptionCount(ε)).toBe(1);
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

    it('off(ε, <listener id>) is a no-op', () => {
      const ε = eventize();
      const listenerObject = {foo: fake()};

      const unsubscribe = on(ε, 'foo', listenerObject);
      // @ts-expect-error .listener is not on the multi-event arm of the union
      off(ε, unsubscribe.listener.id);

      // it used to detach the listener outright, skipping the reference count
      // that off(ε, unsubscribe.listener) and unsubscribe() both honour
      expect(getSubscriptionCount(ε)).toBe(1);

      emit(ε, 'foo');
      expect(listenerObject.foo.callCount).toBe(1);
    });
  });

  describe('by event name and listener object', () => {
    it('removes the listener-object form', () => {
      const obj = eventize();
      const listenerObject = {foo: fake()};

      on(obj, 'foo', listenerObject);
      expect(getSubscriptionCount(obj)).toBe(1);

      off(obj, 'foo', listenerObject);
      expect(getSubscriptionCount(obj)).toBe(0);
    });

    it('removes the method-name form', () => {
      const obj = eventize();
      const listenerObject = {foo: fake()};

      on(obj, 'foo', 'foo', listenerObject);
      expect(getSubscriptionCount(obj)).toBe(1);

      off(obj, 'foo', listenerObject);
      expect(getSubscriptionCount(obj)).toBe(0);
    });

    it('leaves listeners on other event names alone', () => {
      const obj = eventize();
      const listenerObject = {foo: fake(), bar: fake()};

      on(obj, 'foo', 'foo', listenerObject);
      on(obj, 'bar', 'bar', listenerObject);
      expect(getSubscriptionCount(obj)).toBe(2);

      off(obj, 'foo', listenerObject);
      expect(getSubscriptionCount(obj)).toBe(1);

      emit(obj, 'bar');
      expect(listenerObject.bar.callCount).toBe(1);
    });

    it('also detaches the function-with-context form sharing that object', () => {
      const obj = eventize();
      const ctx = {foo: fake()};
      const listenerFunc = fake();

      on(obj, 'foo', listenerFunc, ctx);
      on(obj, 'foo', 'foo', ctx);
      expect(getSubscriptionCount(obj)).toBe(2);

      off(obj, 'foo', ctx);

      // off(ε, ctx) has always swept function listeners bound to ctx as their
      // context; the named form now follows the same rule, scoped to one event.
      expect(getSubscriptionCount(obj)).toBe(0);
    });

    it('matches what the nameless off(ε, listenerObject) form does', () => {
      const withName = eventize();
      const withoutName = eventize();
      const ctx = {};

      on(withName, 'foo', fake(), ctx);
      on(withoutName, 'foo', fake(), ctx);

      off(withName, 'foo', ctx);
      off(withoutName, ctx);

      expect(getSubscriptionCount(withName)).toBe(0);
      expect(getSubscriptionCount(withoutName)).toBe(0);
    });
  });

  describe('reference release after unsubscribe', () => {
    it('drops the listener references from a consumed handle', () => {
      const obj = eventize();
      const listenerObject = {foo: fake()};
      const unsubscribe = on(obj, 'foo', 'foo', listenerObject) as any;

      expect(unsubscribe.listener.listenerObject).toBe(listenerObject);

      unsubscribe();

      expect(unsubscribe.listener.isRemoved).toBe(true);
      expect(unsubscribe.listener.listener).toBeNull();
      expect(unsubscribe.listener.listenerObject).toBeNull();
      expect(unsubscribe.listener.callAfterApply).toBeUndefined();
    });

    it('drops references on off(ε, eventName) too', () => {
      const obj = eventize();
      const listenerFunc = fake();
      const unsubscribe = on(obj, 'foo', listenerFunc) as any;

      off(obj, 'foo');

      expect(unsubscribe.listener.isRemoved).toBe(true);
      expect(unsubscribe.listener.listener).toBeNull();
    });

    it('drops references on off(ε) too', () => {
      const obj = eventize();
      const listenerFunc = fake();
      const unsubscribe = on(obj, 'foo', listenerFunc) as any;

      off(obj);

      expect(unsubscribe.listener.isRemoved).toBe(true);
      expect(unsubscribe.listener.listener).toBeNull();
    });
  });

  describe('off(ε) clears retained state', () => {
    it('drops retained values and policies', () => {
      const obj = eventize();
      retain(obj, 'data');
      emit(obj, 'data', {big: 'payload'});
      expect(getRetainedCount(obj)).toBe(1);

      off(obj);

      expect(getRetainedCount(obj)).toBe(0);
      expect(getRetainedEventNames(obj)).toEqual([]);
    });

    it('a later subscriber receives nothing', () => {
      const obj = eventize();
      retain(obj, 'data');
      emit(obj, 'data', 'payload');

      off(obj);

      const late = fake();
      on(obj, 'data', late);
      expect(late.callCount).toBe(0);
    });

    it("off(ε, '*') behaves the same", () => {
      const obj = eventize();
      retain(obj, 'data');
      emit(obj, 'data', 'payload');

      off(obj, '*');

      expect(getRetainedCount(obj)).toBe(0);
      expect(getRetainedEventNames(obj)).toEqual([]);
    });

    it('leaves other emitters alone', () => {
      const a = eventize();
      const b = eventize();
      retain(a, 'x');
      retain(b, 'x');
      emit(a, 'x', 1);
      emit(b, 'x', 2);

      off(a);

      expect(getRetainedCount(a)).toBe(0);
      expect(getRetainedCount(b)).toBe(1);
    });

    it("off(ε, ['*']) clears retained state like the bare wildcard", () => {
      const obj = eventize();
      retain(obj, 'data');
      emit(obj, 'data', 'payload');
      on(obj, 'data', fake());

      off(obj, ['*']);

      expect(getSubscriptionCount(obj)).toBe(0);
      expect(getRetainedCount(obj)).toBe(0);
      expect(getRetainedEventNames(obj)).toEqual([]);
    });

    it("off(ε, ['*', name]) clears everything, not just the named one", () => {
      const obj = eventize();
      retain(obj, ['foo', 'bar']);
      emit(obj, 'foo', 1);
      emit(obj, 'bar', 2);

      off(obj, ['*', 'foo']);

      expect(getRetainedCount(obj)).toBe(0);

      // the partial wipe used to leave 'bar' pinned and still replaying
      const late = fake();
      on(obj, 'bar', late);
      expect(late.callCount).toBe(0);
    });

    it.each([[[null]], [[undefined]]])(
      'off(ε, %p) wipes the keeper, matching the store wipe it performs',
      (names) => {
        const obj = eventize();
        retain(obj, ['foo', 'bar']);
        emit(obj, 'foo', 1);
        emit(obj, 'bar', 2);
        on(obj, 'foo', fake());
        on(obj, 'bar', fake());

        // EventStore.remove() forwards each element back into itself with a
        // null listenerObject, so a nullish element lands in the wipe-all
        // branch and takes every listener with it.
        off(obj, names);

        expect(getSubscriptionCount(obj)).toBe(0);
        expect(getRetainedCount(obj)).toBe(0);
        expect(getRetainedEventNames(obj)).toEqual([]);
      },
    );

    it("off(ε, ['foo', null]) clears everything, not just the named one", () => {
      const obj = eventize();
      retain(obj, ['foo', 'bar']);
      emit(obj, 'foo', 1);
      emit(obj, 'bar', 2);
      on(obj, 'foo', fake());
      on(obj, 'bar', fake());

      off(obj, ['foo', null]);

      expect(getSubscriptionCount(obj)).toBe(0);
      expect(getRetainedCount(obj)).toBe(0);

      // the partial wipe used to leave 'bar' pinned and still replaying
      const late = fake();
      on(obj, 'bar', late);
      expect(late.callCount).toBe(0);
    });

    it('leaves a multi-event unsubscribe handle on the name path', () => {
      const obj = eventize();
      retain(obj, 'keep');
      emit(obj, 'keep', 'value');
      const unsubscribe = on(obj, ['a', 'b'], fake());

      unsubscribe();

      expect(getSubscriptionCount(obj)).toBe(0);
      // the handle passes EventListener instances, not names — the bulk path
      // must not trigger, so 'keep' survives
      expect(getRetainedCount(obj)).toBe(1);
    });
  });
});
