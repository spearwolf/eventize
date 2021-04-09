/* eslint-env jest */
import EventListener from '../EventListener';

import {
  EVENT_CATCH_EM_ALL,
  LISTENER_IS_OBJ,
} from '../constants';

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
      expect(obj.foo).toHaveBeenCalledWith(null, 'plah!', 666);
      expect(obj.emit).not.toHaveBeenCalled();
    });

    it('call() calls the emit listener function', () => {
      const obj = { emit: jest.fn() };
      const listener = new EventListener(EVENT_CATCH_EM_ALL, 0, obj);
      expect(listener.listenerType).toBe(LISTENER_IS_OBJ);
      listener.apply('bar', [null, 'plah!', 666]);
      expect(obj.emit).toHaveBeenCalledWith('bar', null, 'plah!', 666);
    });
  });

  describe('function as listener without context', () => {
    it('call() calls the listener function', () => {
      const fn = jest.fn();
      const listener = new EventListener('foo', 0, fn);
      listener.apply('foo', [null, 'plah!', 666]);
      expect(fn).toHaveBeenCalledWith(null, 'plah!', 666);
    });
    it('apply() calls the listener function', () => {
      const fn = jest.fn();
      const listener = new EventListener('foo', 0, fn);
      listener.apply('foo', [null, 'plah!', 666]);
      expect(fn).toHaveBeenCalledWith(null, 'plah!', 666);
    });
  });
});
