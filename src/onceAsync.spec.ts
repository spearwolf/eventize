import {
  emit,
  eventize,
  Eventize,
  getSubscriptionCount,
  off,
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

  // ---------------------------------------------------------------------------------------------
  // once() throws synchronously for an empty array of event names — and
  // because that call sits inside the Promise executor here, the throw turns
  // into a rejection instead of propagating out of onceAsync() itself. Before
  // the fix, once(ε, []) subscribed nothing and the returned promise never
  // settled: no resolve, no reject, just a dangling await forever.
  it('rejects instead of hanging on an empty array of event names', async () => {
    const e = eventize();
    await expect(onceAsync(e, [])).rejects.toThrow(/insufficient arguments/);
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
      expect(addSpy).toHaveBeenCalledTimes(1);
      const [addCall] = addSpy.mock.calls;
      expect(addCall).toBeDefined();
      if (addCall === undefined) return;
      const [, handler] = addCall;
      expect(removeSpy).toHaveBeenCalledWith(
        'abort',
        handler as EventListenerOrEventListenerObject,
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

    // off(ε) empties the store but has no path back into this closure — the
    // abort listener lives on the signal, not on the emitter.
    // The promise, and everything it closed over, stay alive until the
    // signal itself fires. See docs/lifecycle.md ("onceAsync and off()").
    it('off(ε) does not detach the abort handler — the pending promise outlives the emitter', async () => {
      const obj = eventize();
      const controller = new AbortController();
      const addSpy = jest.spyOn(controller.signal, 'addEventListener');
      const removeSpy = jest.spyOn(controller.signal, 'removeEventListener');

      const promise = onceAsync(obj, 'foo', {signal: controller.signal});
      expect(getSubscriptionCount(obj)).toBe(1);
      expect(addSpy).toHaveBeenCalledTimes(1);

      off(obj); // clears the store directly, bypassing onceAsync()'s own unsubscribe

      expect(getSubscriptionCount(obj)).toBe(0); // the listener is gone from the store
      expect(removeSpy).not.toHaveBeenCalled(); // off() never reaches the abort handler

      // the promise stays pending until the signal itself is told to abort —
      // off(ε) had no way to reach it
      controller.abort();

      await expect(promise).rejects.toMatchObject({name: 'AbortError'});
      // the abort path never calls removeEventListener itself — {once: true}
      // is what detaches the listener, and this spy cannot observe that
      expect(removeSpy).not.toHaveBeenCalled();
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
