// `warn` is bound to `console.warn` at module load, so a `jest.spyOn(console,
// 'warn')` installed from a spec never sees the call. Replacing the export
// itself is the only way to observe it; everything else stays the real module.
// Same workaround as EventKeeper.spec.ts and retain.spec.ts, for the same
// reason. This file needs it for the opposite claim the other guarded specs
// make: a strict dispatch must reach the caller and *not* the console.
jest.mock('./utils', () => ({
  __esModule: true,
  ...jest.requireActual('./utils'),
  warn: jest.fn(),
}));

import {
  emit,
  emitAsync,
  emitSafe,
  emitStrict,
  emitStrictAsync,
  eventize,
  on,
  once,
  retain,
} from './index';
import {apiSurfaces} from './__test-utils__/expect2ImplEventizeApi';
import {storeOf} from './__test-utils__/listeners';
import {unhandledRejectionsDuring} from './__test-utils__/unhandledRejections';
import {warn} from './utils';

const warnSpy = warn as unknown as jest.Mock;

// Reading the thrown value instead of matching it: every case here is about
// *which* error arrives, and `toThrow()` compares messages, which an
// AggregateError can satisfy by accident through one of its entries.
const catchError = (run: () => void): unknown => {
  try {
    run();
  } catch (error) {
    return error;
  }
  throw new Error('expected the call to throw, but it returned');
};

const aggregateOf = (run: () => void): AggregateError => {
  const error = catchError(run);
  expect(error).toBeInstanceOf(AggregateError);
  return error as AggregateError;
};

describe('emitStrict()', () => {
  beforeEach(() => {
    warnSpy.mockClear();
  });

  it('runs the listeners queued behind a throwing one', () => {
    const ε = eventize();
    const calls: string[] = [];

    on(ε, 'foo', () => {
      calls.push('first');
    });
    on(ε, 'foo', () => {
      throw new Error('boom');
    });
    on(ε, 'foo', () => {
      calls.push('third');
    });

    expect(() => emitStrict(ε, 'foo')).toThrow('boom');
    expect(calls).toEqual(['first', 'third']);
  });

  it('returns normally when no listener threw', () => {
    const ε = eventize();
    const listener = jest.fn();

    on(ε, 'foo', listener);

    expect(() => emitStrict(ε, 'foo', 42)).not.toThrow();
    expect(listener).toHaveBeenCalledWith(42);
  });

  it('rethrows a single failure unchanged', () => {
    const ε = eventize();
    const boom = new Error('boom');

    on(ε, 'foo', () => {
      throw boom;
    });

    // Identity, not message: this is the promise that lets a consumer swap
    // emit() for emitStrict() without touching an existing assertion.
    expect(catchError(() => emitStrict(ε, 'foo'))).toBe(boom);
  });

  it('rethrows a thrown non-Error unchanged too', () => {
    const ε = eventize();

    on(ε, 'foo', () => {
      throw 'a string, not an Error';
    });

    expect(catchError(() => emitStrict(ε, 'foo'))).toBe(
      'a string, not an Error',
    );
  });

  it('collects two failures into an AggregateError in dispatch order', () => {
    const ε = eventize();
    const first = new Error('first');
    const second = new Error('second');
    const between = jest.fn();

    on(ε, 'foo', () => {
      throw first;
    });
    on(ε, 'foo', between);
    on(ε, 'foo', () => {
      throw second;
    });

    const error = aggregateOf(() => emitStrict(ε, 'foo'));

    expect(error.errors).toEqual([first, second]);
    expect(between).toHaveBeenCalledTimes(1);
  });

  it('reports nothing through console.warn — the failures go to the caller', () => {
    const ε = eventize();

    on(ε, 'foo', () => {
      throw new Error('boom');
    });

    expect(() => emitStrict(ε, 'foo')).toThrow('boom');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('keeps priority order across a throwing listener', () => {
    const ε = eventize();
    const calls: string[] = [];

    on(ε, 'foo', -1, () => {
      calls.push('low');
    });
    on(ε, 'foo', 10, () => {
      throw new Error('boom');
    });
    on(ε, 'foo', 5, () => {
      calls.push('middle');
    });

    expect(() => emitStrict(ε, 'foo')).toThrow('boom');
    expect(calls).toEqual(['middle', 'low']);
  });

  it('writes the retained value even though a listener threw', () => {
    const ε = eventize();

    retain(ε, 'foo');
    on(ε, 'foo', () => {
      throw new Error('boom');
    });

    expect(() => emitStrict(ε, 'foo', 42)).toThrow('boom');

    const late = jest.fn();
    on(ε, 'foo', late);

    expect(late).toHaveBeenCalledWith(42);
  });

  it('spends a once() queued behind a throwing listener', () => {
    const ε = eventize();
    const later = jest.fn();

    on(ε, 'foo', () => {
      throw new Error('boom');
    });
    once(ε, 'foo', later);

    expect(() => emitStrict(ε, 'foo')).toThrow('boom');
    expect(() => emitStrict(ε, 'foo')).toThrow('boom');
    expect(later).toHaveBeenCalledTimes(1);
  });

  it('leaves a throwing once() subscribed, exactly as emit() does', () => {
    const ε = eventize();
    const boom = jest.fn(() => {
      throw new Error('boom');
    });

    once(ε, 'foo', boom);

    expect(() => emitStrict(ε, 'foo')).toThrow('boom');
    expect(() => emitStrict(ε, 'foo')).toThrow('boom');
    expect(boom).toHaveBeenCalledTimes(2);
  });

  it('rejects the wildcard name with the plain error, not an AggregateError', () => {
    const ε = eventize();

    const error = catchError(() => emitStrict(ε, '*'));

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(AggregateError);
    expect((error as Error).message).toMatch(/cannot be emitted/);
  });

  it('dispatches the names ahead of a wildcard and then throws', () => {
    const ε = eventize();
    const foo = jest.fn();
    const bar = jest.fn();

    on(ε, 'foo', foo);
    on(ε, 'bar', bar);

    expect(() => emitStrict(ε, ['foo', '*', 'bar'])).toThrow(
      /cannot be emitted/,
    );
    expect(foo).toHaveBeenCalledTimes(1);
    expect(bar).not.toHaveBeenCalled();
  });

  it('keeps the failures a name array collected ahead of its wildcard', () => {
    const ε = eventize();
    const boom = new Error('boom');

    on(ε, 'foo', () => {
      throw boom;
    });

    const error = aggregateOf(() => emitStrict(ε, ['foo', '*']));

    expect(error.errors).toHaveLength(2);
    expect(error.errors[0]).toBe(boom);
    expect((error.errors[1] as Error).message).toMatch(/cannot be emitted/);
  });

  it('collects a corrupted bucket rather than letting it bypass the report', () => {
    const ε = eventize();
    const boom = new Error('boom');

    on(ε, 'foo', () => {
      throw boom;
    });
    // A wildcard listener is what puts the dispatch on the merging walk, the
    // one of the two that treats a hole as corruption. The named-only walk
    // skips holes in silence — the asymmetry AGENTS.md records, unchanged here.
    on(ε, '*', () => {});

    const bucket = storeOf(ε).getListenersForEventName('foo');
    (bucket as unknown as {length: number}).length = 3;

    const error = aggregateOf(() => emitStrict(ε, 'foo'));

    expect(error.errors[0]).toBe(boom);
    expect((error.errors[1] as Error).message).toMatch(
      'EventStore: forEach encountered a hole',
    );
  });

  it('leaves emit() untouched: a throw still aborts the dispatch', () => {
    const ε = eventize();
    const second = jest.fn();

    on(ε, 'foo', () => {
      throw new Error('boom');
    });
    on(ε, 'foo', second);

    expect(() => emit(ε, 'foo')).toThrow('boom');
    expect(second).not.toHaveBeenCalled();
  });

  describe('nested inside another dispatch', () => {
    it('does not collect what a nested emitSafe() swallowed', () => {
      const ε = eventize();
      const inner = eventize();
      const outer = new Error('outer');

      on(inner, 'bar', () => {
        throw new Error('inner');
      });
      on(ε, 'foo', () => {
        emitSafe(inner, 'bar');
      });
      on(ε, 'foo', () => {
        throw outer;
      });

      // One failure, not two: the nested call asked for execution and got a
      // console line for its trouble. The strict caller is handed only what
      // its own listeners failed with.
      expect(catchError(() => emitStrict(ε, 'foo'))).toBe(outer);
      expect(warnSpy).toHaveBeenCalledTimes(1);
    });

    it('folds a nested emitStrict() in as a single failure of the outer one', () => {
      const ε = eventize();
      const inner = eventize();

      on(inner, 'bar', () => {
        throw new Error('first');
      });
      on(inner, 'bar', () => {
        throw new Error('second');
      });
      on(ε, 'foo', () => {
        emitStrict(inner, 'bar');
      });

      // The inner call raises its own AggregateError, which is the outer
      // call's one and only failure — so it arrives unchanged rather than
      // nested inside a second aggregate.
      const error = aggregateOf(() => emitStrict(ε, 'foo'));

      expect(error.errors).toHaveLength(2);
      expect((error.errors[0] as Error).message).toBe('first');
      expect((error.errors[1] as Error).message).toBe('second');
    });

    it('restores the report sink after a frame unwinds', () => {
      const ε = eventize();

      on(ε, 'foo', () => {
        throw new Error('boom');
      });

      expect(() => emitStrict(ε, 'foo')).toThrow('boom');
      warnSpy.mockClear();

      emitSafe(ε, 'foo');

      expect(warnSpy).toHaveBeenCalledTimes(1);
    });

    it('collects what a nested unguarded emit() let unwind', () => {
      const ε = eventize();
      const inner = eventize();
      const boom = new Error('boom');

      on(inner, 'bar', () => {
        throw boom;
      });
      on(ε, 'foo', () => {
        emit(inner, 'bar');
      });

      expect(catchError(() => emitStrict(ε, 'foo'))).toBe(boom);
    });
  });

  describe('on a non-eventized (duck-typed) target', () => {
    it('collects a throwing event-named method and keeps dispatching later names', () => {
      const calls: string[] = [];
      const boom = new Error('boom');
      const target = {
        foo() {
          throw boom;
        },
        bar() {
          calls.push('bar');
        },
      };

      expect(catchError(() => emitStrict(target, ['foo', 'bar']))).toBe(boom);
      expect(calls).toEqual(['bar']);
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('collects a throwing .emit() fallback', () => {
      const target = {
        emit(eventName: string) {
          throw new Error(`boom: ${eventName}`);
        },
      };

      expect(() => emitStrict(target, 'foo')).toThrow('boom: foo');
    });

    it('aggregates two failures of a name array in dispatch order', () => {
      const target = {
        foo() {
          throw new Error('first');
        },
        bar() {
          throw new Error('second');
        },
      };

      const error = aggregateOf(() => emitStrict(target, ['foo', 'bar']));

      expect(error.errors.map((each) => (each as Error).message)).toEqual([
        'first',
        'second',
      ]);
    });

    it('still rejects the wildcard name', () => {
      const target = {
        foo() {
          throw new Error('boom');
        },
      };

      expect(() => emitStrict(target, '*')).toThrow(/cannot be emitted/);
    });

    it('stays a silent no-op for a target nothing can be dispatched to', () => {
      // A primitive is neither eventized nor attachable, so there is no
      // listener to serve and nothing to report. Same silence `emit()` keeps.
      expect(() => emitStrict(42 as unknown as object, 'foo')).not.toThrow();
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('dispatches the names ahead of a wildcard and then throws', () => {
      const bar = jest.fn();
      const target = {foo: jest.fn(), bar};

      expect(() => emitStrict(target, ['foo', '*'])).toThrow(
        /cannot be emitted/,
      );
      expect(target.foo).toHaveBeenCalledTimes(1);
      expect(bar).not.toHaveBeenCalled();
    });
  });
});

describe('emitStrictAsync()', () => {
  beforeEach(() => {
    warnSpy.mockClear();
  });

  it('resolves what emitAsync() would have resolved', async () => {
    const ε = eventize();

    on(ε, 'load', () => 'first');
    on(ε, 'load', () => Promise.resolve('second'));
    on(ε, 'load', () => [Promise.resolve('third')]);

    await expect(emitStrictAsync(ε, 'load')).resolves.toEqual([
      'first',
      'second',
      ['third'],
    ]);
    await expect(emitAsync(ε, 'load')).resolves.toEqual([
      'first',
      'second',
      ['third'],
    ]);
  });

  it('resolves undefined when nothing was collected', async () => {
    const ε = eventize();

    on(ε, 'load', () => {});

    await expect(emitStrictAsync(ε, 'load')).resolves.toBeUndefined();
  });

  it('rejects with a single rejection reason, unchanged', async () => {
    const ε = eventize();
    const rejection = new Error('nope');

    on(ε, 'load', () => 'first');
    on(ε, 'load', () => Promise.reject(rejection));

    await expect(emitStrictAsync(ε, 'load')).rejects.toBe(rejection);
  });

  it('reports every rejection, where emitAsync() reports one', async () => {
    const ε = eventize();
    const slow = new Error('slow');
    const fast = new Error('fast');

    on(
      ε,
      'load',
      () => new Promise((_, reject) => setTimeout(() => reject(slow), 10)),
    );
    on(ε, 'load', () => Promise.reject(fast));

    const error: AggregateError = await emitStrictAsync(ε, 'load').then(
      () => {
        throw new Error('expected a rejection');
      },
      (reason: AggregateError) => reason,
    );

    expect(error).toBeInstanceOf(AggregateError);
    // Dispatch order, not settle order: `fast` rejected first in time.
    expect(error.errors).toEqual([slow, fast]);
    await expect(emitAsync(ε, 'load')).rejects.toBe(fast);
  });

  it('sorts a synchronous throw ahead of a later rejection', async () => {
    const ε = eventize();
    const thrown = new Error('thrown');
    const rejected = new Error('rejected');

    on(ε, 'load', () => Promise.reject(rejected));
    on(ε, 'load', () => {
      throw thrown;
    });

    const error: AggregateError = await emitStrictAsync(ε, 'load').then(
      () => {
        throw new Error('expected a rejection');
      },
      (reason: AggregateError) => reason,
    );

    expect(error.errors).toEqual([thrown, rejected]);
  });

  it('sees the rejections inside an array a listener returned', async () => {
    const ε = eventize();
    const first = new Error('first');
    const second = new Error('second');

    on(ε, 'load', () => [Promise.reject(first), Promise.reject(second)]);

    const error: AggregateError = await emitStrictAsync(ε, 'load').then(
      () => {
        throw new Error('expected a rejection');
      },
      (reason: AggregateError) => reason,
    );

    expect(error.errors).toEqual([first, second]);
  });

  it('resolves no partial array when something failed', async () => {
    const ε = eventize();

    on(ε, 'load', () => 'kept');
    on(ε, 'load', () => Promise.reject(new Error('nope')));

    await expect(emitStrictAsync(ε, 'load')).rejects.toThrow('nope');
  });

  it('rejects for a wildcard name instead of throwing synchronously', async () => {
    const ε = eventize();
    let promise: Promise<unknown> | undefined;

    expect(() => {
      promise = emitStrictAsync(ε, '*');
    }).not.toThrow();

    await expect(promise).rejects.toThrow(/cannot be emitted/);
  });

  it('rejects for a wildcard inside a name array, after the names ahead of it ran', async () => {
    const ε = eventize();
    const foo = jest.fn();
    let promise: Promise<unknown> | undefined;

    on(ε, 'foo', foo);

    expect(() => {
      promise = emitStrictAsync(ε, ['foo', '*']);
    }).not.toThrow();

    await expect(promise).rejects.toThrow(/cannot be emitted/);
    expect(foo).toHaveBeenCalledTimes(1);
  });

  it('owns every promise it collected, even when the dispatch aborted', async () => {
    const ε = eventize();

    on(ε, 'foo', () => Promise.reject(new Error('claimed')));

    const reported = await unhandledRejectionsDuring(() => {
      emitStrictAsync(ε, ['foo', '*']).catch(() => {});
    });

    expect(reported).toEqual([]);
  });

  it('guards the duck-typed path too', async () => {
    const boom = new Error('boom');
    const target = {
      foo() {
        throw boom;
      },
      bar() {
        return 'value';
      },
    };

    await expect(emitStrictAsync(target, ['foo', 'bar'])).rejects.toBe(boom);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('resolves undefined for a target nothing can be dispatched to', async () => {
    await expect(
      emitStrictAsync(42 as unknown as object, 'foo'),
    ).resolves.toBeUndefined();
  });

  it('restores the report sink for a later guarded dispatch', async () => {
    const ε = eventize();

    on(ε, 'foo', () => {
      throw new Error('boom');
    });

    await expect(emitStrictAsync(ε, 'foo')).rejects.toThrow('boom');
    warnSpy.mockClear();

    emitSafe(ε, 'foo');

    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});

describe.each(apiSurfaces)('$name — emitStrict()', ({create}) => {
  it('serves every listener and reports every failure on each surface', () => {
    const ε = create();
    const calls: string[] = [];

    ε.on('foo', () => {
      throw new Error('first');
    });
    ε.on('foo', () => {
      calls.push('second');
    });
    ε.on('foo', () => {
      throw new Error('third');
    });

    const error = aggregateOf(() => ε.emitStrict('foo'));

    expect(error.errors.map((each) => (each as Error).message)).toEqual([
      'first',
      'third',
    ]);
    expect(calls).toEqual(['second']);
  });
});

describe.each(apiSurfaces)('$name — emitStrictAsync()', ({create}) => {
  it('rejects with the collected failures on each surface', async () => {
    const ε = create();
    const rejection = new Error('nope');

    ε.on('foo', () => 'first');
    ε.on('foo', () => Promise.reject(rejection));

    await expect(ε.emitStrictAsync('foo')).rejects.toBe(rejection);
  });
});
