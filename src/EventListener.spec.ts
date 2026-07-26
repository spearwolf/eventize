import {EventListener} from './EventListener';
import {
  emit,
  emitAsync,
  eventize,
  getSubscriptionCount,
  on,
  once,
} from './index';
import {
  EVENT_CATCH_EM_ALL,
  LISTENER_IS_NAMED_FUNC,
  LISTENER_IS_OBJ,
  NAMESPACE,
} from './constants';

const bar = Symbol('bar');

describe('EventListener', () => {
  describe('catch em all', () => {
    describe('isCatchEmAll property', () => {
      it('is true if event name is an asterisk', () => {
        const listener = new EventListener(EVENT_CATCH_EM_ALL, 0, null);
        expect(listener.isCatchEmAll).toBe(true);
      });

      it('is false if event name is not an asterisk', () => {
        const listener = new EventListener('a', 0, null);
        expect(listener.isCatchEmAll).toBe(false);
      });
    });

    it('call() calls the named listener function (and ignores the emit method)', () => {
      const obj = {
        foo: jest.fn(),
        emit: jest.fn(),
      };
      const listener = new EventListener(EVENT_CATCH_EM_ALL, 0, obj);
      expect(listener.listenerType).toBe(LISTENER_IS_OBJ);
      listener.apply('foo', [null, 'plah!', 666]);
      // expect(obj.foo).toHaveBeenCalledWith(null, 'plah!', 666);
      expect(obj.foo.mock.calls[0]).toEqual([null, 'plah!', 666]);
      expect(obj.emit).not.toHaveBeenCalled();
    });

    it('call() calls the named (as symbol) listener function (and ignores the emit method)', () => {
      const obj = {
        [bar]: jest.fn(),
        emit: jest.fn(),
      };
      const listener = new EventListener(EVENT_CATCH_EM_ALL, 0, obj);
      expect(listener.listenerType).toBe(LISTENER_IS_OBJ);
      listener.apply(bar, [null, 'plah!', 666]);
      // expect(obj[bar]).toHaveBeenCalledWith(null, 'plah!', 666);
      expect(obj[bar].mock.calls[0]).toEqual([null, 'plah!', 666]);
      expect(obj.emit).not.toHaveBeenCalled();
    });

    it('call() calls the emit() listener function', () => {
      const obj = {emit: jest.fn()};
      const listener = new EventListener(EVENT_CATCH_EM_ALL, 0, obj);
      expect(listener.listenerType).toBe(LISTENER_IS_OBJ);
      listener.apply('bar', [null, 'plah!', 666]);
      // expect(obj.emit).toHaveBeenCalledWith('bar', null, 'plah!', 666);
      expect(obj.emit.mock.calls[0]).toEqual(['bar', null, 'plah!', 666]);
    });
  });

  describe('a listener that is not a listener', () => {
    // `typeof null === 'object'`, so a null listener used to be tagged
    // LISTENER_IS_OBJ — and apply() then dereferenced it. It has no type now,
    // which makes apply() a no-op. Unreachable through on()/once(), which
    // reject a falsy listener outright.
    it('gives null no listener type and makes apply() a no-op', () => {
      const listener = new EventListener('foo', 0, null);
      expect(listener.listenerType).toBeUndefined();
      expect(() => listener.apply('foo', [1, 2, 3])).not.toThrow();
    });

    it('gives undefined no listener type either', () => {
      const listener = new EventListener('foo', 0, undefined);
      expect(listener.listenerType).toBeUndefined();
      expect(() => listener.apply('foo', [1, 2, 3])).not.toThrow();
    });

    // A primitive is non-nullish, and its prototype is full of methods whose
    // names an event can collide with — `(42).toFixed` is a real function.
    // Reaching it would dispatch to `Number.prototype`, feed its result into
    // the emitAsync aggregation and consume a once(). detectListenerType()
    // gives a primitive no listener type; the dispatch has to agree.
    it('does not dispatch to a prototype member of a primitive listener', () => {
      const listener = new EventListener('toFixed', 0, 42);
      expect(listener.listenerType).toBeUndefined();
      const returnValue = jest.fn();
      listener.apply('toFixed', [2], returnValue);
      expect(returnValue).not.toHaveBeenCalled();
    });

    it('does not consume a once() through a primitive listener', () => {
      const listener = new EventListener('toString', 0, true);
      const callAfterApply = jest.fn();
      listener.callAfterApply = callAfterApply;
      listener.apply('toString', []);
      expect(callAfterApply).not.toHaveBeenCalled();
    });

    it('collects nothing from a primitive listener through emitAsync()', async () => {
      const obj = eventize();
      // No longer reachable through on(): _subscribeTo() rejects anything
      // detectListenerType() gives no tag, truthy or not. Registering the
      // listener by hand is what still puts a primitive in front of a real
      // dispatch, which is the case this asserts.
      obj[NAMESPACE].store.add(new EventListener('toFixed', 0, 42), true);
      // Anchors the assertion below: without this, the same expectation would
      // stay green if the listener had never landed in the bucket the dispatch
      // reads. The sibling case underneath proves the path does collect.
      expect(getSubscriptionCount(obj)).toBe(1);
      await expect(emitAsync(obj, 'toFixed', 2)).resolves.toBeUndefined();
    });

    it('collects from a real listener registered the same way', async () => {
      const obj = eventize();
      obj[NAMESPACE].store.add(
        new EventListener('toFixed', 0, {toFixed: () => 'COLLECTED'}),
        true,
      );
      await expect(emitAsync(obj, 'toFixed', 2)).resolves.toEqual([
        'COLLECTED',
      ]);
    });

    it('is no longer reachable through on() at all', () => {
      const obj = eventize();
      expect(() => on(obj, 'toFixed', 42 as any)).toThrow(Error);
      expect(getSubscriptionCount(obj)).toBe(0);
    });
  });

  // Every object inherits toString, valueOf, constructor and friends, so an
  // event name colliding with one of them found a callable member on *any*
  // listener object — dispatching to code the subscriber never wrote, feeding
  // its result into the emitAsync aggregation and consuming a once(). Same
  // reasoning as the primitive guard above, one prototype up.
  describe('inherited Object.prototype members', () => {
    const inheritedMethodNames = Object.getOwnPropertyNames(
      Object.prototype,
    ).filter(
      (name) =>
        typeof (Object.prototype as Record<string, unknown>)[name] ===
        'function',
    );

    it('sees all seven names the audit listed', () => {
      expect(inheritedMethodNames).toEqual(
        expect.arrayContaining([
          'toString',
          'toLocaleString',
          'valueOf',
          'constructor',
          'hasOwnProperty',
          'isPrototypeOf',
          'propertyIsEnumerable',
        ]),
      );
    });

    describe.each(inheritedMethodNames)('%s', (eventName) => {
      it('is not invoked on a named listener-object subscription', () => {
        const listener = new EventListener(eventName, 0, {});
        const callAfterApply = jest.fn();
        listener.callAfterApply = callAfterApply;
        const returnValue = jest.fn();
        expect(() => listener.apply(eventName, [], returnValue)).not.toThrow();
        expect(callAfterApply).not.toHaveBeenCalled();
        expect(returnValue).not.toHaveBeenCalled();
      });

      it('is not invoked through a wildcard listener-object subscription', () => {
        const listener = new EventListener(EVENT_CATCH_EM_ALL, 0, {});
        const callAfterApply = jest.fn();
        listener.callAfterApply = callAfterApply;
        const returnValue = jest.fn();
        expect(() => listener.apply(eventName, [], returnValue)).not.toThrow();
        expect(callAfterApply).not.toHaveBeenCalled();
        expect(returnValue).not.toHaveBeenCalled();
      });
    });

    it('collects nothing from an inherited member through emitAsync()', async () => {
      const obj = eventize();
      on(obj, 'toString', {});
      await expect(emitAsync(obj, 'toString')).resolves.toBeUndefined();
    });

    it('collects nothing from the Object constructor through emitAsync()', async () => {
      const obj = eventize();
      on(obj, 'constructor', {});
      await expect(emitAsync(obj, 'constructor')).resolves.toBeUndefined();
    });

    it('does not consume a once() that only the prototype would have answered', () => {
      const obj = eventize();
      once(obj, 'toString', {});
      emit(obj, 'toString');
      expect(getSubscriptionCount(obj)).toBe(1);
    });

    it('does not consume a wildcard once() either', () => {
      const obj = eventize();
      once(obj, {});
      emit(obj, 'toString');
      expect(getSubscriptionCount(obj)).toBe(1);
    });

    // The guard tests function identity, so a target that defines its own
    // method under that name dispatches as normal — that is the shape saying
    // "yes, here".
    it('still dispatches to an own override', () => {
      const toString = jest.fn(() => 'own');
      const listener = new EventListener('toString', 0, {toString});
      const returnValue = jest.fn();
      listener.apply('toString', [1, 2], returnValue);
      expect(toString.mock.calls[0]).toEqual([1, 2]);
      expect(returnValue).toHaveBeenCalledWith('own');
    });

    it('still dispatches to a class override on the prototype chain', () => {
      const calls: unknown[][] = [];
      class Handler {
        toString(...args: unknown[]) {
          calls.push(args);
          return 'from class';
        }
      }
      const listener = new EventListener('toString', 0, new Handler());
      const returnValue = jest.fn();
      listener.apply('toString', ['x'], returnValue);
      expect(calls).toEqual([['x']]);
      expect(returnValue).toHaveBeenCalledWith('from class');
    });

    // The flip side of testing identity rather than ownership: re-declaring
    // the *same function* under its own name is indistinguishable from
    // inheriting it, so it is skipped as well. Pinned because the docs promise
    // "your own method still dispatches" and this is the one shape where an own
    // property does not.
    it('skips an own property that is Object.prototype’s own function', () => {
      const listener = new EventListener('toString', 0, {
        toString: Object.prototype.toString,
      });
      const returnValue = jest.fn();
      listener.apply('toString', [], returnValue);
      expect(returnValue).not.toHaveBeenCalled();
    });

    it('skips a prototype-chain alias of the same function too', () => {
      class Weird {}
      Weird.prototype.toString = Object.prototype.toString;
      const listener = new EventListener('toString', 0, new Weird());
      const returnValue = jest.fn();
      listener.apply('toString', [], returnValue);
      expect(returnValue).not.toHaveBeenCalled();
    });

    it('reaches the emit() fallback when only the prototype matched', () => {
      const obj = {emit: jest.fn()};
      const listener = new EventListener(EVENT_CATCH_EM_ALL, 0, obj);
      listener.apply('toString', [666]);
      expect(obj.emit.mock.calls[0]).toEqual(['toString', 666]);
    });

    it('consumes a once() when the emit() fallback answered instead', () => {
      const obj = {emit: jest.fn()};
      const listener = new EventListener(EVENT_CATCH_EM_ALL, 0, obj);
      const callAfterApply = jest.fn();
      listener.callAfterApply = callAfterApply;
      listener.apply('toString', []);
      expect(callAfterApply).toHaveBeenCalledTimes(1);
    });

    it('keeps a null-prototype listener object working', () => {
      const listenerObject = Object.create(null) as Record<string, unknown>;
      const foo = jest.fn();
      listenerObject['foo'] = foo;

      const named = new EventListener('foo', 0, listenerObject);
      named.apply('foo', [7]);
      expect(foo.mock.calls[0]).toEqual([7]);

      const inherited = new EventListener('toString', 0, listenerObject);
      const returnValue = jest.fn();
      expect(() => inherited.apply('toString', [], returnValue)).not.toThrow();
      expect(returnValue).not.toHaveBeenCalled();
    });
  });

  describe('method name as listener', () => {
    it('no-ops when there is no listener object to read the method off', () => {
      const listener = new EventListener('foo', 0, 'handler', null);
      expect(listener.listenerType).toBe(LISTENER_IS_NAMED_FUNC);
      expect(() => listener.apply('foo', [1, 2, 3])).not.toThrow();
    });

    it('does not consume a once() when there is no listener object', () => {
      const listener = new EventListener('foo', 0, 'handler', null);
      const callAfterApply = jest.fn();
      listener.callAfterApply = callAfterApply;
      listener.apply('foo', [1, 2, 3]);
      expect(callAfterApply).not.toHaveBeenCalled();
    });

    // A function is assignable to `ListenerObjectType`, and reading a method
    // off one has always worked — on(ε, 'foo', 'reset', SomeClass) is the
    // shape. The dispatch guard must not narrow that away.
    it('reads the method off a function used as the listener object', () => {
      const target = Object.assign(jest.fn(), {handler: jest.fn()});
      const listener = new EventListener('foo', 0, 'handler', target);
      listener.apply('foo', [null, 'plah!', 666]);
      expect(target.handler.mock.calls[0]).toEqual([null, 'plah!', 666]);
    });

    // The prototype guard on the listener-object path stops deliberately at
    // this one: `on(ε, 'evt', 'toString', obj)` names the method, so the
    // inherited hit is the caller's choice, not an accident.
    it('reads an inherited Object.prototype method when the call names it', () => {
      const listener = new EventListener('evt', 0, 'toString', {});
      const returnValue = jest.fn();
      listener.apply('evt', [], returnValue);
      expect(returnValue).toHaveBeenCalledWith('[object Object]');
    });
  });

  describe('function as listener without context', () => {
    it('call() calls the listener function', () => {
      const fn = jest.fn();
      const listener = new EventListener('foo', 0, fn);
      listener.apply('foo', [null, 'plah!', 666]);
      // expect(fn).toHaveBeenCalledWith(null, 'plah!', 666);
      expect(fn.mock.calls[0]).toEqual([null, 'plah!', 666]);
    });
    it('apply() calls the listener function (symbol)', () => {
      const fn = jest.fn();
      const listener = new EventListener(bar, 0, fn);
      listener.apply(bar, [null, 'plah!', 666]);
      // expect(fn).toHaveBeenCalledWith(null, 'plah!', 666);
      expect(fn.mock.calls[0]).toEqual([null, 'plah!', 666]);
    });
  });
});
