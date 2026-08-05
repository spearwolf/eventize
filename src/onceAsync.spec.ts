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

  // A retained value replays into the listener synchronously, from inside
  // once() itself, before onceAsync() has returned a promise to anyone. If the
  // registration ever moves outside the Promise executor, `resolve` still has
  // to be assigned and reachable at that exact point — pin that here instead
  // of trusting it by inspection: `settled` must already be true after a
  // single microtask, with no emit() call in between to resolve it late.
  it('resolves synchronously during once() on a retained replay, not only eventually', async () => {
    const e = eventize();
    retain(e, 'foo');
    emit(e, 'foo', 'immediate');

    let settled = false;
    const promise = onceAsync(e, 'foo').then((value) => {
      settled = true;
      return value;
    });

    await Promise.resolve();
    expect(settled).toBe(true);
    await expect(promise).resolves.toBe('immediate');
  });

  it('with multiple event names', async () => {
    const e = eventize();

    retain(e, 'foo');
    emit(e, 'foo', 1001);

    expect(await onceAsync<number>(e, ['bar', 'foo'])).toBe(1001);
  });

  // ---------------------------------------------------------------------------------------------
  // once() throws synchronously for an argument error (empty array of event
  // names, NaN priority, ...). onceAsync() must let that throw reach the
  // caller synchronously too, at the call site — not swallow it into a Promise
  // executor and hand back a rejection instead. A fire-and-forget
  // `onceAsync(ε, [])` with no `await`/`catch` would otherwise become an
  // unhandled rejection under Node's default `--unhandled-rejections=throw`,
  // rather than failing at the line that has the bug.
  it('throws synchronously instead of rejecting on an empty array of event names', () => {
    const e = eventize();
    expect(() => onceAsync(e, [])).toThrow(/insufficient arguments/);
  });

  it('throws synchronously instead of rejecting on a NaN priority', () => {
    const e = eventize();
    expect(() => onceAsync(e, [['foo', NaN]] as unknown as string[])).toThrow(
      /NaN priority/,
    );
  });

  // Same treatment as the empty array above, and for the same reason: a
  // sparse array of event names is an argument error, not something to
  // resolve around, so onceAsync() must throw synchronously here too rather
  // than hand back a promise that never settles.
  it('throws synchronously instead of rejecting on a sparse array of event names', () => {
    const e = eventize();
    expect(() =>
      onceAsync(
        e,
        Object.assign(new Array(3), {
          0: 'foo',
          2: 'bar',
        }) as unknown as string[],
      ),
    ).toThrow(/insufficient arguments/);
  });

  it('throws synchronously instead of rejecting on an array of nothing but holes', () => {
    const e = eventize();
    expect(() => onceAsync(e, new Array(2) as unknown as string[])).toThrow(
      /insufficient arguments/,
    );
  });

  // The third member of the same family, and the one with a promise's worth of
  // consequence: a name that is not a name registers a bucket nothing can ever
  // emit to, so the promise would never settle either.
  it('throws synchronously instead of rejecting on an entry that is not an event name', () => {
    const e = eventize();
    let caught: unknown;
    try {
      onceAsync(e, [123] as unknown as string[]);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toMatch(/insufficient arguments/);
    expect((caught as Error).cause).toBe('invalid-name');
    expect(getSubscriptionCount(e)).toBe(0);
  });

  // The signal.aborted pre-check runs before once() is ever called, so an
  // already-aborted signal short-circuits before the argument validation
  // gets a chance to run at all. An empty array of event names — normally a
  // synchronous throw, per the two cases above — is swallowed here: the
  // call rejects with the abort reason instead. See the doc comment beside
  // onceAsync() for why this stays in that order rather than being "fixed".
  it('an already-aborted signal wins over an argument error: rejects with the abort reason, does not throw', async () => {
    const e = eventize();
    const controller = new AbortController();
    controller.abort();

    let thrown = false;
    let promise: Promise<unknown> | undefined;
    try {
      promise = onceAsync(e, [], {signal: controller.signal});
    } catch {
      thrown = true;
    }

    expect(thrown).toBe(false);
    await expect(promise).rejects.toMatchObject({name: 'AbortError'});
  });

  // The shape check runs before once(), for the same reason the aborted
  // check does: a value that cannot possibly work as a signal must not
  // leave a subscription behind that nobody got a handle to.
  it('throws synchronously and subscribes nothing when options.signal is not an AbortSignal', () => {
    const e = eventize();
    const notASignal: AbortSignal = {} as unknown as AbortSignal;

    expect(() => onceAsync(e, 'foo', {signal: notASignal})).toThrow(
      /options\.signal/,
    );
    expect(getSubscriptionCount(e)).toBe(0);
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
