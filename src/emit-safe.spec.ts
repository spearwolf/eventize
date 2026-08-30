// `warn` is bound to `console.warn` at module load, so a `jest.spyOn(console,
// 'warn')` installed from a spec never sees the call. Replacing the export
// itself is the only way to observe it; everything else stays the real module.
// Same workaround as EventKeeper.spec.ts and retain.spec.ts, for the same
// reason.
jest.mock('./utils', () => ({
  // Spreading a module namespace drops the non-enumerable `__esModule` flag,
  // and a default or namespace import of the mocked module would then be sent
  // through the CJS interop wrapper. Nothing under src/ imports it that way
  // today; restating the flag keeps this file from becoming the reason the day
  // one does.
  __esModule: true,
  ...jest.requireActual('./utils'),
  warn: jest.fn(),
}));

import {
  emit,
  emitSafe,
  eventize,
  getSubscriptionCount,
  on,
  once,
  retain,
} from './index';
import {storeOf} from './__test-utils__/listeners';
import {warn} from './utils';

const warnSpy = warn as unknown as jest.Mock;

describe('emitSafe()', () => {
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

    expect(() => emitSafe(ε, 'foo')).not.toThrow();
    expect(calls).toEqual(['first', 'third']);
  });

  it('reports each throw through console.warn with the event name and the error', () => {
    const ε = eventize();
    const boom = new Error('boom');

    on(ε, 'foo', () => {
      throw boom;
    });

    emitSafe(ε, 'foo');

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]).toEqual(
      expect.arrayContaining(['foo', boom]),
    );
  });

  it('warns once per throwing listener and still completes the dispatch', () => {
    const ε = eventize();
    const last = jest.fn();

    on(ε, 'foo', () => {
      throw new Error('one');
    });
    on(ε, 'foo', () => {
      throw new Error('two');
    });
    on(ε, 'foo', last);

    emitSafe(ε, 'foo');

    expect(warnSpy).toHaveBeenCalledTimes(2);
    expect(last).toHaveBeenCalledTimes(1);
  });

  it('keeps priority order across a throwing listener', () => {
    const ε = eventize();
    const calls: string[] = [];

    on(ε, 'foo', 10, () => {
      calls.push('high');
    });
    on(ε, 'foo', 5, () => {
      calls.push('mid');
      throw new Error('boom');
    });
    on(ε, 'foo', 0, () => {
      calls.push('low');
    });

    emitSafe(ε, 'foo');

    expect(calls).toEqual(['high', 'mid', 'low']);
  });

  it('writes the retained value even though a listener threw', () => {
    const ε = eventize();
    retain(ε, 'foo');

    on(ε, 'foo', () => {
      throw new Error('boom');
    });
    emitSafe(ε, 'foo', 42);

    const late = jest.fn();
    on(ε, 'foo', late);

    expect(late).toHaveBeenCalledWith(42);
  });

  it('leaves a throwing once() subscribed, exactly as emit() does', () => {
    const ε = eventize();
    let calls = 0;

    once(ε, 'foo', () => {
      calls += 1;
      throw new Error('boom');
    });

    emitSafe(ε, 'foo');
    expect(getSubscriptionCount(ε)).toBe(1);

    emitSafe(ε, 'foo');
    expect(calls).toBe(2);
    expect(getSubscriptionCount(ε)).toBe(1);
  });

  it('spends a once() queued behind a throwing listener', () => {
    const ε = eventize();
    const later = jest.fn();

    on(ε, 'foo', () => {
      throw new Error('boom');
    });
    once(ε, 'foo', later);

    emitSafe(ε, 'foo');
    emitSafe(ε, 'foo');

    expect(later).toHaveBeenCalledTimes(1);
  });

  it('still throws for the wildcard name', () => {
    const ε = eventize();

    expect(() => emitSafe(ε, '*')).toThrow(/cannot be emitted/);
  });

  it('dispatches the names ahead of a wildcard and then throws', () => {
    const ε = eventize();
    const listener = jest.fn();
    on(ε, 'foo', listener);

    expect(() => emitSafe(ε, ['foo', '*'])).toThrow(/cannot be emitted/);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("does not swallow a corrupted bucket — that throw is not a listener's", () => {
    const ε = eventize();

    on(ε, 'foo', () => {});
    // A wildcard listener is what puts the dispatch on the merging walk, the
    // one of the two that treats a hole as corruption. The named-only walk
    // skips holes in silence — the asymmetry AGENTS.md records, unchanged
    // here.
    on(ε, '*', () => {});

    const bucket = storeOf(ε).getListenersForEventName('foo');
    (bucket as unknown as {length: number}).length = 3; // two holes behind the listener

    expect(() => emitSafe(ε, 'foo')).toThrow(
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

  describe('on a non-eventized (duck-typed) target', () => {
    it('isolates a throwing event-named method and keeps dispatching later names', () => {
      const calls: string[] = [];
      const target = {
        foo() {
          throw new Error('boom');
        },
        bar() {
          calls.push('bar');
        },
      };

      expect(() => emitSafe(target, ['foo', 'bar'])).not.toThrow();
      expect(calls).toEqual(['bar']);
      expect(warnSpy).toHaveBeenCalledTimes(1);
    });

    it('isolates a throwing .emit() fallback', () => {
      const target = {
        emit(eventName: string) {
          throw new Error(`boom: ${eventName}`);
        },
      };

      expect(() => emitSafe(target, 'foo')).not.toThrow();
      expect(warnSpy).toHaveBeenCalledTimes(1);
    });

    it('still throws for the wildcard name', () => {
      const target = {
        foo() {
          throw new Error('boom');
        },
      };

      expect(() => emitSafe(target, '*')).toThrow(/cannot be emitted/);
    });

    it('leaves emit() untouched: the throw still reaches the caller', () => {
      const target = {
        foo() {
          throw new Error('boom');
        },
      };

      expect(() => emit(target, 'foo')).toThrow('boom');
    });
  });
});
