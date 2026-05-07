import {fake} from 'sinon';

import {
  emit,
  EVENT_CATCH_EM_ALL,
  eventize,
  getSubscriptionCount,
  off,
  on,
  once,
} from './index';

describe('getSubscriptionCount()', () => {
  describe('on non-eventized inputs', () => {
    it('returns 0 for a plain object', () => {
      expect(getSubscriptionCount({})).toBe(0);
    });

    it('returns 0 for an array', () => {
      expect(getSubscriptionCount([])).toBe(0);
    });

    it('returns 0 for a class instance that was never eventized', () => {
      class Foo {}
      expect(getSubscriptionCount(new Foo())).toBe(0);
    });
  });

  describe('on a freshly eventized object', () => {
    it('returns 0 when no listeners are registered', () => {
      const obj = eventize();
      expect(getSubscriptionCount(obj)).toBe(0);
    });

    it('still returns 0 after off() on an empty object', () => {
      const obj = eventize();
      off(obj);
      expect(getSubscriptionCount(obj)).toBe(0);
    });

    it('still returns 0 after off(eventName) on an empty object', () => {
      const obj = eventize();
      off(obj, 'foo');
      expect(getSubscriptionCount(obj)).toBe(0);
    });

    it('still returns 0 after off("*") on an empty object', () => {
      const obj = eventize();
      off(obj, EVENT_CATCH_EM_ALL);
      expect(getSubscriptionCount(obj)).toBe(0);
    });
  });

  describe('with named listeners', () => {
    it('counts a single subscription', () => {
      const obj = eventize();
      on(obj, 'foo', fake());
      expect(getSubscriptionCount(obj)).toBe(1);
    });

    it('counts multiple listeners on the same event', () => {
      const obj = eventize();
      on(obj, 'foo', fake());
      on(obj, 'foo', fake());
      on(obj, 'foo', fake());
      expect(getSubscriptionCount(obj)).toBe(3);
    });

    it('counts listeners across different event names', () => {
      const obj = eventize();
      on(obj, 'foo', fake());
      on(obj, 'bar', fake());
      on(obj, 'baz', fake());
      expect(getSubscriptionCount(obj)).toBe(3);
    });

    it('does not double-count a deduplicated listener-object (refCount)', () => {
      const obj = eventize();
      const listenerObject = {foo: fake()};
      on(obj, 'foo', listenerObject);
      on(obj, 'foo', listenerObject);
      expect(getSubscriptionCount(obj)).toBe(1);
    });

    it('does not double-count a deduplicated named-method listener (refCount)', () => {
      const obj = eventize();
      const listenerObject = {bar: fake()};
      on(obj, 'foo', 'bar', listenerObject);
      on(obj, 'foo', 'bar', listenerObject);
      expect(getSubscriptionCount(obj)).toBe(1);
    });

    it('decrements when an unsubscribe function is called', () => {
      const obj = eventize();
      on(obj, 'foo', fake());
      const unsubscribe = on(obj, 'bar', fake());
      expect(getSubscriptionCount(obj)).toBe(2);
      unsubscribe();
      expect(getSubscriptionCount(obj)).toBe(1);
    });

    it('decrements when off(eventName) removes all listeners for that event', () => {
      const obj = eventize();
      on(obj, 'foo', fake());
      on(obj, 'foo', fake());
      on(obj, 'bar', fake());
      expect(getSubscriptionCount(obj)).toBe(3);
      off(obj, 'foo');
      expect(getSubscriptionCount(obj)).toBe(1);
    });

    it('drops to 0 when off(obj) is called', () => {
      const obj = eventize();
      on(obj, 'foo', fake());
      on(obj, 'bar', fake());
      on(obj, 'baz', fake());
      expect(getSubscriptionCount(obj)).toBe(3);
      off(obj);
      expect(getSubscriptionCount(obj)).toBe(0);
    });

    it('decrements after a once() listener fires', () => {
      const obj = eventize();
      once(obj, 'foo', fake());
      expect(getSubscriptionCount(obj)).toBe(1);
      emit(obj, 'foo');
      expect(getSubscriptionCount(obj)).toBe(0);
    });

    it('counts a wildcard listener-object as a single subscription regardless of method count', () => {
      const obj = eventize();
      const listenerObject = {
        foo: fake(),
        bar: fake(),
        baz: fake(),
      };
      on(obj, listenerObject);
      expect(getSubscriptionCount(obj)).toBe(1);
    });
  });

  describe('with wildcard (catch-em-all) listeners', () => {
    it('counts a single wildcard listener subscribed via "*"', () => {
      const obj = eventize();
      on(obj, EVENT_CATCH_EM_ALL, fake());
      expect(getSubscriptionCount(obj)).toBe(1);
    });

    it('counts a wildcard listener subscribed via on(obj, listenerFunc) shorthand', () => {
      const obj = eventize();
      on(obj, fake());
      expect(getSubscriptionCount(obj)).toBe(1);
    });

    it('counts multiple wildcard listeners', () => {
      const obj = eventize();
      on(obj, EVENT_CATCH_EM_ALL, fake());
      on(obj, EVENT_CATCH_EM_ALL, fake());
      on(obj, fake());
      expect(getSubscriptionCount(obj)).toBe(3);
    });

    it('sums wildcard and named listeners', () => {
      const obj = eventize();
      on(obj, 'foo', fake());
      on(obj, 'bar', fake());
      on(obj, EVENT_CATCH_EM_ALL, fake());
      on(obj, fake());
      expect(getSubscriptionCount(obj)).toBe(4);
    });

    it('off("*") clears every subscription — equivalent to off(obj)', () => {
      const obj = eventize();
      on(obj, 'foo', fake());
      on(obj, 'bar', fake());
      on(obj, EVENT_CATCH_EM_ALL, fake());
      on(obj, fake());
      expect(getSubscriptionCount(obj)).toBe(4);
      off(obj, EVENT_CATCH_EM_ALL);
      expect(getSubscriptionCount(obj)).toBe(0);
    });

    it('off(obj) clears wildcard and named listeners alike', () => {
      const obj = eventize();
      on(obj, 'foo', fake());
      on(obj, EVENT_CATCH_EM_ALL, fake());
      expect(getSubscriptionCount(obj)).toBe(2);
      off(obj);
      expect(getSubscriptionCount(obj)).toBe(0);
    });
  });
});
