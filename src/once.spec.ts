import {fake} from 'sinon';

import {
  emit,
  eventize,
  getSubscriptionCount,
  off,
  on,
  once,
  retain,
} from './index';
import {latestListener} from './__test-utils__/listeners';

describe('once()', () => {
  describe('once() before on()', () => {
    const obj = eventize();

    const listenerFunc = fake();
    const otherListener = fake();

    beforeAll(() => {
      once(obj, 'foo', listenerFunc);
      on(obj, 'foo', otherListener);
    });

    it('emit() calls the listeners', () => {
      emit(obj, 'foo', 'bar', 666);

      expect(listenerFunc.callCount).toBe(1);
      expect(otherListener.callCount).toBe(1);
      expect(listenerFunc.calledWith('bar', 666)).toBeTruthy();
      expect(otherListener.calledWith('bar', 666)).toBeTruthy();
    });

    it('after the first call to emit() the listener is removed from the list of subscribers', () => {
      emit(obj, 'foo', 'bar', 666);

      expect(listenerFunc.callCount).toBe(1);
      expect(otherListener.callCount).toBe(2);
    });
  });

  it('called with multiple event names', () => {
    const e = eventize();

    const sub = jest.fn();

    // ---
    once(e, ['foo', 'bar'], sub);

    emit(e, 'foo', 42);
    expect(sub).toHaveBeenCalledWith(42);
    sub.mockClear();

    emit(e, 'bar');
    expect(sub).not.toHaveBeenCalled(); // is no longer called because 'foo' has already been called back

    // ---
    once(e, ['foo', 'bar'], sub);

    emit(e, 'bar', 666);
    expect(sub).toHaveBeenCalledTimes(1);
    expect(sub).toHaveBeenCalledWith(666);
    sub.mockClear();

    emit(e, 'foo');
    expect(sub).not.toHaveBeenCalled();
  });

  describe('with retained event', () => {
    it('unsubscribes after retained replay (single event name)', () => {
      const e = eventize();

      retain(e, 'foo');
      emit(e, 'foo', 42);

      const sub = jest.fn();
      once(e, 'foo', sub);

      expect(sub).toHaveBeenCalledTimes(1);
      expect(sub).toHaveBeenCalledWith(42);
      expect(getSubscriptionCount(e)).toBe(0);
    });

    it('unsubscribes after retained replay (array of event names)', () => {
      const e = eventize();

      retain(e, 'foo');
      emit(e, 'foo', 42);

      const sub = jest.fn();
      once(e, ['foo', 'bar'], sub);

      expect(sub).toHaveBeenCalledTimes(1);
      expect(sub).toHaveBeenCalledWith(42);
      expect(getSubscriptionCount(e)).toBe(0);
    });
  });

  describe('when nothing was actually called', () => {
    it('keeps the subscription for a listener object without a matching method', () => {
      const obj = eventize();
      const listenerObject: {foo?: () => void} = {};

      once(obj, 'foo', listenerObject);
      emit(obj, 'foo');

      expect(getSubscriptionCount(obj)).toBe(1);

      // the method arrives late — the once() must still be live
      const handler = fake();
      listenerObject.foo = handler;
      emit(obj, 'foo', 'payload');

      expect(handler.calledWith('payload')).toBe(true);
      expect(getSubscriptionCount(obj)).toBe(0);
    });

    it('keeps the subscription for a method name that does not exist yet', () => {
      const obj = eventize();
      const listenerObject: {handler?: () => void} = {};

      once(obj, 'foo', 'handler', listenerObject);
      emit(obj, 'foo');

      expect(getSubscriptionCount(obj)).toBe(1);

      const handler = fake();
      listenerObject.handler = handler;
      emit(obj, 'foo', 'payload');

      expect(handler.calledWith('payload')).toBe(true);
      expect(getSubscriptionCount(obj)).toBe(0);
    });

    it('keeps a wildcard listener object subscribed until it can handle an event', () => {
      const obj = eventize();
      const listenerObject: {foo?: () => void} = {};

      once(obj, listenerObject);

      // the object has no method for 'bar' and no emit fallback — nothing ran,
      // so the once() must survive
      emit(obj, 'bar');
      expect(getSubscriptionCount(obj)).toBe(1);

      const handler = fake();
      listenerObject.foo = handler;
      emit(obj, 'foo', 'payload');

      expect(handler.calledWith('payload')).toBe(true);
      expect(getSubscriptionCount(obj)).toBe(0);
    });

    it('still consumes the once when the emit() fallback runs', () => {
      const obj = eventize();
      const emitFake = fake();
      const listenerObject = {emit: emitFake};

      once(obj, 'foo', listenerObject);
      emit(obj, 'foo', 'payload');

      expect(emitFake.calledWith('foo', 'payload')).toBe(true);
      expect(getSubscriptionCount(obj)).toBe(0);
    });
  });

  describe('UnsubscribeFunc contract', () => {
    // The handle used to expose the internal EventListener as
    // `.listener` (single-name forms) or `.listeners` (array form). Both are
    // gone. The union that declared them made either access a TS2339 anyway,
    // and they handed out a class no consumer could construct or name.
    it('carries no properties for a single event name', () => {
      const obj = eventize();
      const unsubscribe = once(obj, 'foo', fake());

      expect(typeof unsubscribe).toBe('function');
      expect(Object.keys(unsubscribe)).toEqual([]);
      expect(Object.getOwnPropertyNames(unsubscribe)).not.toContain('listener');
    });

    it('carries no properties for an array of event names either', () => {
      const obj = eventize();
      const unsubscribe = once(obj, ['foo', 'bar'], fake());

      expect(getSubscriptionCount(obj)).toBe(2);
      expect(Object.keys(unsubscribe)).toEqual([]);
      expect(Object.getOwnPropertyNames(unsubscribe)).not.toContain(
        'listeners',
      );
    });

    // Up to v5.1.0, off() accepted the raw EventListener instance behind a
    // handle — the route the handle itself used to reach the store before
    // `.listener`/`.listeners` came off it. The handle now releases through
    // EventStore.release() directly, and remove() lost the branch that made an
    // instance special: it falls through to the identity comparison every
    // other unrecognized value hits, matches nothing, and off() no-ops.
    it('silently no-ops when off() is given a raw listener instance', () => {
      const obj = eventize();
      const survivor = fake();
      on(obj, 'bar', survivor);
      once(obj, 'foo', fake());
      const listener = latestListener(obj);

      expect(getSubscriptionCount(obj)).toBe(2);
      off(obj, listener);

      expect(getSubscriptionCount(obj)).toBe(2);

      emit(obj, 'bar');
      expect(survivor.callCount).toBe(1);
    });

    it('stays idempotent', () => {
      const obj = eventize();
      const listener = fake();
      const unsubscribe = once(obj, 'foo', listener);

      unsubscribe();
      unsubscribe();

      expect(getSubscriptionCount(obj)).toBe(0);
      emit(obj, 'foo');
      expect(listener.callCount).toBe(0);
    });
  });

  describe('once() aggregates like on()', () => {
    it('two once() on the same listener object fire once, then detach', () => {
      const obj = eventize();
      const listenerObject = {foo: fake()};

      once(obj, 'foo', listenerObject);
      once(obj, 'foo', listenerObject);
      expect(getSubscriptionCount(obj)).toBe(1);

      emit(obj, 'foo', 'first');

      expect(listenerObject.foo.callCount).toBe(1);
      expect(getSubscriptionCount(obj)).toBe(0);

      emit(obj, 'foo', 'second');
      expect(listenerObject.foo.callCount).toBe(1);
    });

    it('the same holds for the method-name form', () => {
      const obj = eventize();
      const listenerObject = {handler: fake()};

      once(obj, 'foo', 'handler', listenerObject);
      once(obj, 'foo', 'handler', listenerObject);
      expect(getSubscriptionCount(obj)).toBe(1);

      emit(obj, 'foo');

      expect(listenerObject.handler.callCount).toBe(1);
      expect(getSubscriptionCount(obj)).toBe(0);
    });

    it('each returned handle releases its own obligation', () => {
      const obj = eventize();
      const listenerObject = {foo: fake()};

      const first = once(obj, 'foo', listenerObject);
      const second = once(obj, 'foo', listenerObject);

      first();
      expect(getSubscriptionCount(obj)).toBe(1);

      second();
      expect(getSubscriptionCount(obj)).toBe(0);

      emit(obj, 'foo');
      expect(listenerObject.foo.callCount).toBe(0);
    });

    it('on() still deduplicates', () => {
      const obj = eventize();
      const listenerObject = {foo: fake()};

      on(obj, 'foo', listenerObject);
      on(obj, 'foo', listenerObject);

      expect(getSubscriptionCount(obj)).toBe(1);
      emit(obj, 'foo');
      expect(listenerObject.foo.callCount).toBe(1);
    });

    it('a once() and an on() on the same object share one registration', () => {
      const obj = eventize();
      const listenerObject = {foo: fake()};

      on(obj, 'foo', listenerObject);
      once(obj, 'foo', listenerObject);
      expect(getSubscriptionCount(obj)).toBe(1);

      emit(obj, 'foo');
      expect(listenerObject.foo.callCount).toBe(1);
      expect(getSubscriptionCount(obj)).toBe(1);

      emit(obj, 'foo');
      expect(listenerObject.foo.callCount).toBe(2);
    });

    it('two once() on a retained event both receive the replay', () => {
      const obj = eventize();
      const listenerObject = {foo: fake()};

      retain(obj, 'foo');
      emit(obj, 'foo', 'RETAINED');

      once(obj, 'foo', listenerObject);
      once(obj, 'foo', listenerObject);

      expect(listenerObject.foo.callCount).toBe(2);
      expect(getSubscriptionCount(obj)).toBe(0);
    });
  });
});
