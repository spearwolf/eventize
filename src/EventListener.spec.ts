/* eslint-env jest */
import {EventListener} from './EventListener';
import {
  EVENT_CATCH_EM_ALL,
  LISTENER_IS_NAMED_FUNC,
  LISTENER_IS_OBJ,
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
