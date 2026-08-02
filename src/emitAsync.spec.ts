import {emitAsync, eventize, on, Priority} from './index';

describe('emitAsync()', () => {
  it('should work as expected', async () => {
    const o = eventize();

    on(o, 'foo', () => 123);
    on(o, 'foo', (): object | null => null);
    on(o, 'foo', () => 'abc');
    on(o, 'foo', (): unknown => undefined);
    on(o, 'foo', () => Promise.resolve('xyz'));
    on(o, 'foo', () => '');
    on(o, 'foo', Priority.AAA, () => false);
    on(o, 'foo', () => [1, Promise.resolve(2), '3']);

    const results = await emitAsync(o, 'foo');

    expect(results).toEqual([false, 123, 'abc', 'xyz', '', [1, 2, '3']]);
  });

  // A named listener and a '*' listener on the same emit is the only shape
  // that walks both buckets at once, and the collector has to survive that
  // walk as well — a dispatch over one bucket reaches it by a different route.
  // At equal priority the named listener goes first, which is why the wildcard
  // value comes second.
  it('collects the return values of named and wildcard listeners together', async () => {
    const o = eventize();

    on(o, 'foo', (n: number) => `named:${n}`);
    on(o, '*', (n: number) => `wildcard:${n}`);

    const results = await emitAsync(o, 'foo', 7);

    expect(results).toEqual(['named:7', 'wildcard:7']);
  });

  it('should work as expected even if there is no subscriber', async () => {
    const o = eventize();

    const results = await emitAsync(o, 'foo');

    expect(results).toEqual(undefined);
  });

  describe('when the synchronous dispatch throws', () => {
    // The values emitAsync() collects live in a local array, so nothing outside
    // can attach a handler to them once the dispatch aborts. What these cases
    // watch for is the process-level report: run the throwing emit, let Node
    // reach the turn in which it decides a rejection is unowned, and collect
    // whatever it announces. The listener is removed again in `finally` —
    // a process-global handler left behind would swallow the reports of every
    // suite that runs after this one.
    const unhandledRejectionsDuring = async (
      run: () => void,
    ): Promise<unknown[]> => {
      const reported: unknown[] = [];
      const collect = (reason: unknown) => {
        reported.push(reason);
      };
      process.on('unhandledRejection', collect);
      try {
        run();
        // Two turns: the first drains the microtask queue the rejection sits
        // in, the second is the one Node reports from.
        await new Promise((resolve) => setImmediate(resolve));
        await new Promise((resolve) => setImmediate(resolve));
      } finally {
        process.off('unhandledRejection', collect);
      }
      return reported;
    };

    it('leaves no unhandled rejection behind when a later listener throws', async () => {
      const o = eventize();

      // AAA puts the promise-returning listener ahead of the throwing one, so
      // the rejected promise is already in the collector when the walk aborts.
      on(o, 'foo', Priority.AAA, () => Promise.reject(new Error('rejected')));
      on(o, 'foo', () => Promise.reject(new Error('rejected too')));
      on(o, 'foo', () => [Promise.reject(new Error('rejected in an array'))]);
      on(o, 'foo', Priority.Min, () => {
        throw new Error('listener exploded');
      });

      const reported = await unhandledRejectionsDuring(() => {
        expect(() => emitAsync(o, 'foo')).toThrow('listener exploded');
      });

      expect(reported).toEqual([]);
    });

    it("leaves no unhandled rejection behind when '*' aborts a name array", async () => {
      const o = eventize();

      on(o, 'foo', () => Promise.reject(new Error('rejected')));

      const reported = await unhandledRejectionsDuring(() => {
        expect(() => emitAsync(o, ['foo', '*', 'bar'])).toThrow(
          "'*' is reserved",
        );
      });

      expect(reported).toEqual([]);
    });

    it('rethrows the original error, unwrapped', () => {
      const o = eventize();
      const boom = new Error('listener exploded');

      on(o, 'foo', Priority.AAA, () => Promise.resolve('collected'));
      on(o, 'foo', () => {
        throw boom;
      });

      let caught: unknown;
      try {
        emitAsync(o, 'foo');
      } catch (err) {
        caught = err;
      }

      expect(caught).toBe(boom);
      expect((caught as {cause?: unknown}).cause).toBeUndefined();
    });
  });
});
