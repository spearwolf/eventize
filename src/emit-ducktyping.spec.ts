import {fake} from 'sinon';

import {unhandledRejectionsDuring} from './__test-utils__/unhandledRejections';
import {emit, emitAsync, retainClear, unretain} from './index';

describe('emit() duck-typing on non-eventized targets (v5+)', () => {
  describe('plain object with a matching method', () => {
    it('calls obj[eventName] with the args', () => {
      const foo = fake();
      const target = {foo};

      emit(target, 'foo', 'a', 1, {x: 2});

      expect(foo.calledOnce).toBe(true);
      expect(foo.calledWith('a', 1, {x: 2})).toBe(true);
    });

    it('invokes the method with `this` === target', () => {
      const seenThis: unknown[] = [];
      const target = {
        foo(this: unknown) {
          seenThis.push(this);
        },
      };

      emit(target, 'foo');

      expect(seenThis).toHaveLength(1);
      expect(seenThis[0]).toBe(target);
    });

    it('supports symbol event names', () => {
      const SYM = Symbol('evt');
      const fn = fake();
      const target: Record<symbol, unknown> = {[SYM]: fn};

      emit(target, SYM, 42);

      expect(fn.calledOnceWith(42)).toBe(true);
    });

    it('propagates exceptions thrown by the method', () => {
      const target = {
        boom() {
          throw new Error('boom from method');
        },
      };

      expect(() => emit(target, 'boom')).toThrow('boom from method');
    });
  });

  describe('plain object without a matching method', () => {
    it('is a silent no-op when neither obj[eventName] nor obj.emit exists', () => {
      const target = {unrelated: 1};

      expect(() => emit(target, 'foo', 'bar')).not.toThrow();
    });

    it('is a silent no-op when obj[eventName] exists but is not a function', () => {
      const target = {foo: 42};

      expect(() => emit(target, 'foo')).not.toThrow();
    });

    it('falls back to obj.emit(eventName, ...args) when obj[eventName] is not a function', () => {
      const emitFn = fake();
      const target = {emit: emitFn};

      emit(target, 'foo', 1, 'two');

      expect(emitFn.calledOnceWith('foo', 1, 'two')).toBe(true);
    });

    it('does NOT call obj.emit when obj[eventName] is a function (named method wins)', () => {
      const foo = fake();
      const emitFn = fake();
      const target = {foo, emit: emitFn};

      emit(target, 'foo', 'X');

      expect(foo.calledOnceWith('X')).toBe(true);
      expect(emitFn.called).toBe(false);
    });

    it('does not call obj.emit when it is not a function', () => {
      const target = {emit: 'not-a-function'};

      expect(() => emit(target, 'foo', 1)).not.toThrow();
    });
  });

  // An event name coming out of external data — a JSON key, a message type, a
  // DOM attribute — hits Object.prototype on *every* plain object. The named
  // member lookup ignores what the target merely inherits, exactly as the
  // eventized listener-object path does.
  describe('event names colliding with Object.prototype', () => {
    const inheritedMethodNames = Object.getOwnPropertyNames(
      Object.prototype,
    ).filter(
      (name) =>
        typeof (Object.prototype as Record<string, unknown>)[name] ===
        'function',
    );

    it.each(inheritedMethodNames)(
      'does not dispatch to the inherited %s',
      (eventName) => {
        const emitFn = fake();
        const target = {emit: emitFn};

        expect(() => emit(target, eventName)).not.toThrow();
        // The name found nothing, so the fallback chain continues.
        expect(emitFn.calledOnceWith(eventName)).toBe(true);
      },
    );

    it('is a silent no-op without an emit() fallback', () => {
      const target = {};

      expect(() => emit(target, 'toString', 'a')).not.toThrow();
    });

    it('still calls an own override of an inherited member', () => {
      const toString = fake();
      const emitFn = fake();
      const target = {toString, emit: emitFn};

      emit(target, 'toString', 'X');

      expect(toString.calledOnceWith('X')).toBe(true);
      expect(emitFn.called).toBe(false);
    });

    it('still calls a class override of an inherited member', () => {
      const seen: unknown[][] = [];
      class Adapter {
        toString(...args: unknown[]) {
          seen.push(args);
          return '';
        }
      }

      emit(new Adapter(), 'toString', 1, 2);

      expect(seen).toEqual([[1, 2]]);
    });

    // `constructor` is never a legitimate handler name, yet the identity test
    // alone cannot see that: a class instance's `constructor` is the class
    // itself, never identical to `Object.prototype.constructor`, so on a
    // class instance (unlike on a plain `{}`) the naive identity check let it
    // through as dispatchable and `apply()` called the class as a plain
    // function — a TypeError from inside dispatch instead of the emit()
    // fallback an unanswered name should reach.
    it('does not invoke the class constructor for the event name "constructor"', () => {
      class Thing {}
      const emitFn = fake();
      const target = Object.assign(new Thing(), {emit: emitFn});

      expect(() => emit(target, 'constructor', 1, 2)).not.toThrow();
      expect(emitFn.calledOnceWith('constructor', 1, 2)).toBe(true);
    });

    // Deliberate trade-off, not an oversight: every other name in this
    // describe block lets an own property win over the inherited one (see
    // 'still calls a class override' above), but `constructor` is carved out
    // unconditionally because no handler under that name is legitimate — so
    // an own `constructor` handler is skipped too, unlike an own `toString`.
    it('skips an own "constructor" handler and falls back instead', () => {
      const myHandler = fake();
      const emitFn = fake();
      const target = {constructor: myHandler, emit: emitFn};

      emit(target, 'constructor', 1, 2);

      expect(myHandler.called).toBe(false);
      expect(emitFn.calledOnceWith('constructor', 1, 2)).toBe(true);
    });

    // Identity, not ownership: an own property holding the very same function
    // is skipped here too, so both dispatch paths agree on the edge as well.
    it('skips an own property aliasing the inherited function', () => {
      const emitFn = fake();
      const target = {toString: Object.prototype.toString, emit: emitFn};

      emit(target, 'toString');

      expect(emitFn.calledOnceWith('toString')).toBe(true);
    });

    it('skips a prototype-chain alias of the inherited function', () => {
      const emitFn = fake();
      class Weird {
        emit = emitFn;
      }
      Weird.prototype.toString = Object.prototype.toString;

      emit(new Weird(), 'toString');

      expect(emitFn.calledOnceWith('toString')).toBe(true);
    });

    it('works on a null-prototype target', () => {
      const target = Object.create(null) as Record<string, unknown>;
      const foo = fake();
      target['foo'] = foo;

      emit(target, 'foo', 3);
      expect(foo.calledOnceWith(3)).toBe(true);

      expect(() => emit(target, 'toString')).not.toThrow();
    });
  });

  describe('array event names', () => {
    it('dispatches each event in order via duck-typing', () => {
      const calls: string[] = [];
      const target = {
        a() {
          calls.push('a');
        },
        b() {
          calls.push('b');
        },
      };

      emit(target, ['a', 'b']);

      expect(calls).toEqual(['a', 'b']);
    });

    it('mixes named methods and emit() fallback within one array call', () => {
      const calls: Array<[string, unknown[]]> = [];
      const target = {
        a(...args: unknown[]) {
          calls.push(['a', args]);
        },
        emit(eventName: string, ...args: unknown[]) {
          calls.push([eventName, args]);
        },
      };

      emit(target, ['a', 'b'], 1, 2);

      expect(calls).toEqual([
        ['a', [1, 2]],
        ['b', [1, 2]],
      ]);
    });

    it('skips events with no matching method or .emit() silently', () => {
      const a = fake();
      const target = {a};

      expect(() => emit(target, ['a', 'b'], 7)).not.toThrow();
      expect(a.calledOnceWith(7)).toBe(true);
    });
  });

  describe('wildcard event names still throw', () => {
    it("throws when emit() is called with '*' on a non-eventized object", () => {
      const target = {emit: fake()};

      expect(() => emit(target, '*', 'data')).toThrow(/concrete event name/);
    });

    it("throws when '*' appears in a multi-event array — earlier events still fire", () => {
      const a = fake();
      const target = {a};

      expect(() => emit(target, ['a', '*'], 1)).toThrow(/concrete event name/);
      expect(a.callCount).toBe(1);
    });
  });

  describe('non-object targets', () => {
    it('silently no-ops on null', () => {
      expect(() => emit(null as unknown as object, 'foo')).not.toThrow();
    });

    it('silently no-ops on undefined', () => {
      expect(() => emit(undefined as unknown as object, 'foo')).not.toThrow();
    });
  });

  describe('retainClear / unretain remain strict', () => {
    it('retainClear() still throws on non-eventized objects', () => {
      expect(() => retainClear({}, 'foo')).toThrow('object is not eventized');
    });

    it('unretain() still throws on non-eventized objects', () => {
      expect(() => unretain({}, 'foo')).toThrow('object is not eventized');
    });
  });
});

describe('emitAsync() duck-typing on non-eventized targets (v5+)', () => {
  it('resolves to a flattened array of non-null returns from the duck method', async () => {
    const target = {
      foo() {
        return 'sync-value';
      },
    };

    const result = await emitAsync(target, 'foo');

    expect(result).toEqual(['sync-value']);
  });

  it('awaits a promise returned by the duck method', async () => {
    const target = {
      load() {
        return Promise.resolve(42);
      },
    };

    const result = await emitAsync(target, 'load');

    expect(result).toEqual([42]);
  });

  it('flattens an array of promises returned by the duck method', async () => {
    const target = {
      multi() {
        return [Promise.resolve(1), Promise.resolve(2)];
      },
    };

    const result = await emitAsync(target, 'multi');

    expect(result).toEqual([[1, 2]]);
  });

  it('returns Promise<void> (resolves to undefined) when the duck method returns null', async () => {
    const target = {
      foo(): null {
        return null;
      },
    };

    const result = await emitAsync(target, 'foo');

    expect(result).toBeUndefined();
  });

  it('returns Promise<void> when the duck method returns undefined', async () => {
    const target = {
      foo(): void {
        /* implicit undefined */
      },
    };

    const result = await emitAsync(target, 'foo');

    expect(result).toBeUndefined();
  });

  it('returns Promise<void> when no method and no .emit() exist (no-op)', async () => {
    const target = {unrelated: 1};

    const result = await emitAsync(target, 'foo');

    expect(result).toBeUndefined();
  });

  it('captures the return value of the .emit() fallback', async () => {
    const target = {
      emit(_eventName: string, ...args: number[]) {
        return args.reduce((sum, n) => sum + n, 0);
      },
    };

    const result = await emitAsync(target, 'whatever', 1, 2, 3);

    expect(result).toEqual([6]);
  });

  it('silently resolves to undefined on non-object targets', async () => {
    await expect(
      emitAsync(null as unknown as object, 'foo'),
    ).resolves.toBeUndefined();
    await expect(
      emitAsync(undefined as unknown as object, 'foo'),
    ).resolves.toBeUndefined();
  });

  it('aggregates returns across multiple event names in array form', async () => {
    const target = {
      a() {
        return 'A';
      },
      b() {
        return 'B';
      },
    };

    const result = await emitAsync(target, ['a', 'b']);

    expect(result).toEqual(['A', 'B']);
  });

  it('aggregates nothing from an inherited Object.prototype member', async () => {
    await expect(emitAsync({}, 'toString')).resolves.toBeUndefined();
  });

  it('does not call the Object constructor for the event name "constructor"', async () => {
    await expect(emitAsync({}, 'constructor')).resolves.toBeUndefined();
  });

  it("throws on '*' wildcard", async () => {
    const target = {emit: fake()};

    expect(() => emitAsync(target, '*')).toThrow(/concrete event name/);
  });

  // The eventized half of this promise is pinned in emitAsync.spec.ts. Both
  // dispatch paths feed one collector inside a single try, so the claim that
  // both are covered is a structural one — these two cases are what turns it
  // into a measured one. Only the array form can reach the failure here: a
  // duck dispatch of a single name collects at most one value, and there is no
  // later listener left to throw after it.
  describe('when a duck-typed dispatch throws', () => {
    it('leaves no unhandled rejection behind when a later duck method throws', async () => {
      const target = {
        first: () => Promise.reject(new Error('rejected')),
        second: () => [Promise.reject(new Error('rejected in an array'))],
        third: () => {
          throw new Error('duck exploded');
        },
      };

      const reported = await unhandledRejectionsDuring(() => {
        expect(() => emitAsync(target, ['first', 'second', 'third'])).toThrow(
          'duck exploded',
        );
      });

      expect(reported).toEqual([]);
    });

    it("leaves no unhandled rejection behind when '*' aborts a name array", async () => {
      const target = {
        first: () => Promise.reject(new Error('rejected')),
        second: fake(),
      };

      const reported = await unhandledRejectionsDuring(() => {
        expect(() => emitAsync(target, ['first', '*', 'second'])).toThrow(
          /concrete event name/,
        );
      });

      expect(reported).toEqual([]);
      expect(target.second.called).toBe(false);
    });
  });
});
