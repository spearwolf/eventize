import {fake} from 'sinon';

import {emit, eventize, getSubscriptionCount, on, once, retain} from './index';

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
});
