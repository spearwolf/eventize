import {
  emit,
  eventize,
  Eventize,
  getSubscriptionCount,
  onceAsync,
  retain,
} from './index';

describe('onceAsync()', () => {
  it('should work as expected', async () => {
    const ε = eventize();

    const p = onceAsync(ε, 'foo');

    emit(ε, 'foo', 42);

    await p;

    expect(p).resolves.toBe(42);
  });

  it('with retain', async () => {
    const e = eventize();

    retain(e, 'foo');
    emit(e, 'foo', 666);

    expect(await onceAsync(e, 'foo')).toBe(666);
  });

  it('with multiple event names', async () => {
    const e = eventize();

    retain(e, 'foo');
    emit(e, 'foo', 1001);

    expect(await onceAsync<number>(e, ['bar', 'foo'])).toBe(1001);
  });

  describe('AbortSignal support', () => {
    it('unsubscribes and rejects when the signal aborts', async () => {
      const obj = eventize();
      const controller = new AbortController();

      const promise = onceAsync(obj, 'never', {signal: controller.signal});
      expect(getSubscriptionCount(obj)).toBe(1);

      controller.abort();

      await expect(promise).rejects.toMatchObject({name: 'AbortError'});
      expect(getSubscriptionCount(obj)).toBe(0);
    });

    it('rejects immediately when the signal is already aborted', async () => {
      const obj = eventize();
      const controller = new AbortController();
      controller.abort();

      const promise = onceAsync(obj, 'never', {signal: controller.signal});

      await expect(promise).rejects.toMatchObject({name: 'AbortError'});
      expect(getSubscriptionCount(obj)).toBe(0);
    });

    it('rejects with the signal reason when one was given', async () => {
      const obj = eventize();
      const controller = new AbortController();
      const reason = new Error('caller went away');

      const promise = onceAsync(obj, 'never', {signal: controller.signal});
      controller.abort(reason);

      await expect(promise).rejects.toBe(reason);
    });

    it('resolves normally and detaches the abort handler', async () => {
      const obj = eventize();
      const controller = new AbortController();
      const addSpy = jest.spyOn(controller.signal, 'addEventListener');
      const removeSpy = jest.spyOn(controller.signal, 'removeEventListener');

      const promise = onceAsync(obj, 'foo', {signal: controller.signal});
      emit(obj, 'foo', 'payload');

      await expect(promise).resolves.toBe('payload');
      expect(getSubscriptionCount(obj)).toBe(0);

      // resolving must detach the very handler that was attached — removing
      // some other function would leave this one on the signal forever
      expect(removeSpy).toHaveBeenCalledTimes(1);
      expect(removeSpy).toHaveBeenCalledWith(
        'abort',
        addSpy.mock.calls[0][1] as EventListenerOrEventListenerObject,
      );

      // aborting after the fact must not produce an unhandled rejection
      controller.abort();
      await Promise.resolve();
    });

    it('falls back to an AbortError DOMException when the signal has no reason', async () => {
      const obj = eventize();
      // a spec-conforming signal is free to abort without a reason; the
      // built-in AbortController always fills one in, so it is hand-rolled here
      const signal = {
        aborted: true,
        reason: undefined,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      } as unknown as AbortSignal;

      const promise = onceAsync(obj, 'never', {signal});

      await expect(promise).rejects.toMatchObject({
        name: 'AbortError',
        message: 'This operation was aborted',
      });
      expect(getSubscriptionCount(obj)).toBe(0);
    });

    it('attaches no abort handler when a retained event resolves at once', async () => {
      const obj = eventize();
      retain(obj, 'foo');
      emit(obj, 'foo', 'payload');

      const controller = new AbortController();
      const addEventListener = jest.spyOn(
        controller.signal,
        'addEventListener',
      );

      const promise = onceAsync(obj, 'foo', {signal: controller.signal});

      await expect(promise).resolves.toBe('payload');
      expect(getSubscriptionCount(obj)).toBe(0);
      // the retained value resolves inside once(), so there is nothing left
      // to cancel — an 'abort' handler here would outlive the settled promise
      expect(addEventListener).not.toHaveBeenCalled();

      controller.abort();
      await Promise.resolve();
    });

    it('works without options, as before', async () => {
      const obj = eventize();
      const promise = onceAsync(obj, 'foo');
      emit(obj, 'foo', 'payload');
      await expect(promise).resolves.toBe('payload');
    });

    it('is available on the inject() surface', async () => {
      const obj = eventize.inject({});
      const controller = new AbortController();

      const promise = obj.onceAsync('never', {signal: controller.signal});
      expect(getSubscriptionCount(obj)).toBe(1);

      controller.abort();

      await expect(promise).rejects.toMatchObject({name: 'AbortError'});
      expect(getSubscriptionCount(obj)).toBe(0);
    });

    it('is available on the class surface', async () => {
      class Foo extends Eventize {}
      const obj = new Foo();
      const controller = new AbortController();

      const promise = obj.onceAsync('never', {signal: controller.signal});
      expect(getSubscriptionCount(obj)).toBe(1);

      controller.abort();

      await expect(promise).rejects.toMatchObject({name: 'AbortError'});
      expect(getSubscriptionCount(obj)).toBe(0);
    });
  });
});
