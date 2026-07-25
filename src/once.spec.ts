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
    it('exposes .listener for a single event name', () => {
      const obj = eventize();
      const unsubscribe = once(obj, 'foo', fake());

      expect(Object.keys(unsubscribe)).toEqual(['listener']);
      expect((unsubscribe as any).listener).toBeDefined();
    });

    it('exposes .listeners for an array of event names', () => {
      const obj = eventize();
      const unsubscribe = once(obj, ['foo', 'bar'], fake());

      expect(Object.keys(unsubscribe)).toEqual(['listeners']);
      expect((unsubscribe as any).listeners).toHaveLength(2);
    });

    it('allows off(ε, unsubscribe.listener) as a cleanup path', () => {
      const obj = eventize();
      const survivor = fake();
      on(obj, 'bar', survivor);
      const unsubscribe = once(obj, 'foo', fake());

      expect(getSubscriptionCount(obj)).toBe(2);
      off(obj, (unsubscribe as any).listener);

      // exactly the once() subscription is gone, not the whole emitter —
      // pre-fix, `.listener` was undefined and off(ε, undefined) swept
      // everything, which a single-subscription emitter could not reveal
      expect(getSubscriptionCount(obj)).toBe(1);

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
});
