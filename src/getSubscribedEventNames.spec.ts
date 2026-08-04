import {fake} from 'sinon';

import {
  emit,
  EVENT_CATCH_EM_ALL,
  eventize,
  getSubscribedEventNames,
  getSubscriptionCount,
  off,
  on,
  once,
} from './index';

describe('getSubscribedEventNames()', () => {
  describe('on non-eventized inputs', () => {
    it('returns [] for a plain object', () => {
      expect(getSubscribedEventNames({})).toEqual([]);
    });

    it('returns [] for an array', () => {
      expect(getSubscribedEventNames([])).toEqual([]);
    });

    it('returns [] for a class instance that was never eventized', () => {
      class Foo {}
      expect(getSubscribedEventNames(new Foo())).toEqual([]);
    });
  });

  describe('on a freshly eventized object', () => {
    it('returns [] when no listeners are registered', () => {
      const obj = eventize();
      expect(getSubscribedEventNames(obj)).toEqual([]);
    });

    it('still returns [] after off() on an empty object', () => {
      const obj = eventize();
      off(obj);
      expect(getSubscribedEventNames(obj)).toEqual([]);
    });
  });

  describe('with named listeners', () => {
    it('lists a single subscribed name', () => {
      const obj = eventize();
      on(obj, 'foo', fake());
      expect(getSubscribedEventNames(obj)).toEqual(['foo']);
    });

    it('lists every distinct subscribed name once, regardless of listener count', () => {
      const obj = eventize();
      on(obj, 'foo', fake());
      on(obj, 'foo', fake());
      on(obj, 'bar', fake());
      // arrayContaining rather than a fixed-order toEqual on purpose: order
      // is explicitly unspecified, see the doc comment at
      // getSubscribedEventNames().
      expect(getSubscribedEventNames(obj)).toEqual(
        expect.arrayContaining(['foo', 'bar']),
      );
      expect(getSubscribedEventNames(obj)).toHaveLength(2);
    });

    it('reports symbol event names', () => {
      const obj = eventize();
      const name = Symbol('foo');
      on(obj, name, fake());
      expect(getSubscribedEventNames(obj)).toEqual([name]);
    });

    it('drops a name once every listener for it is gone', () => {
      const obj = eventize();
      const unsubscribe = on(obj, 'foo', fake());
      on(obj, 'bar', fake());
      unsubscribe();
      expect(getSubscribedEventNames(obj)).toEqual(['bar']);
    });

    it('drops a name after off(eventName)', () => {
      const obj = eventize();
      on(obj, 'foo', fake());
      on(obj, 'bar', fake());
      off(obj, 'foo');
      expect(getSubscribedEventNames(obj)).toEqual(['bar']);
    });

    it('drops a name once a once() listener has fired', () => {
      const obj = eventize();
      once(obj, 'foo', fake());
      expect(getSubscribedEventNames(obj)).toEqual(['foo']);
      emit(obj, 'foo');
      expect(getSubscribedEventNames(obj)).toEqual([]);
    });

    it('returns [] after off(obj)', () => {
      const obj = eventize();
      on(obj, 'foo', fake());
      on(obj, 'bar', fake());
      off(obj);
      expect(getSubscribedEventNames(obj)).toEqual([]);
    });
  });

  describe('with wildcard (catch-em-all) listeners', () => {
    it('includes EVENT_CATCH_EM_ALL when a wildcard listener is registered', () => {
      const obj = eventize();
      on(obj, EVENT_CATCH_EM_ALL, fake());
      expect(getSubscribedEventNames(obj)).toEqual([EVENT_CATCH_EM_ALL]);
    });

    it('includes EVENT_CATCH_EM_ALL alongside named events, not instead of them', () => {
      const obj = eventize();
      on(obj, 'foo', fake());
      on(obj, EVENT_CATCH_EM_ALL, fake());
      expect(getSubscribedEventNames(obj)).toEqual(
        expect.arrayContaining(['foo', EVENT_CATCH_EM_ALL]),
      );
      expect(getSubscribedEventNames(obj)).toHaveLength(2);
    });

    it('drops EVENT_CATCH_EM_ALL once the last wildcard listener is gone', () => {
      const obj = eventize();
      const unsubscribe = on(obj, EVENT_CATCH_EM_ALL, fake());
      on(obj, 'foo', fake());
      unsubscribe();
      expect(getSubscribedEventNames(obj)).toEqual(['foo']);
    });

    // The 2026-08-04 decision this function exists to satisfy: a length-0
    // check has to cover both halves of subscription state, the same way
    // getSubscriptionCount(ε) === 0 already does — not just the named half.
    it('length agrees with getSubscriptionCount() being 0, for the wildcard-only case too', () => {
      const obj = eventize();
      const unsubscribe = on(obj, EVENT_CATCH_EM_ALL, fake());

      expect(getSubscriptionCount(obj)).toBe(1);
      expect(getSubscribedEventNames(obj)).toHaveLength(1);

      unsubscribe();

      expect(getSubscriptionCount(obj)).toBe(0);
      expect(getSubscribedEventNames(obj)).toHaveLength(0);
    });

    it('off("*") clears the wildcard name — equivalent to off(obj)', () => {
      const obj = eventize();
      on(obj, 'foo', fake());
      on(obj, EVENT_CATCH_EM_ALL, fake());
      off(obj, EVENT_CATCH_EM_ALL);
      expect(getSubscribedEventNames(obj)).toEqual([]);
    });
  });

  it('is safe on null, undefined and primitives at runtime', () => {
    // The signature says `object`, so every one of these is a type error —
    // that is the point. They document what an untyped or typo'd JS call
    // site can still push through at runtime, and that it degrades to an
    // empty answer instead of throwing.
    // @ts-expect-error null is not an `object` under strictNullChecks
    expect(getSubscribedEventNames(null)).toEqual([]);
    // @ts-expect-error undefined is not an `object` under strictNullChecks
    expect(getSubscribedEventNames(undefined)).toEqual([]);
    // @ts-expect-error a number is not an `object`
    expect(getSubscribedEventNames(42)).toEqual([]);
  });
});
