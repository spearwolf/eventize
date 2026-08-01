import {emit, eventize, isEventized, on} from './index';
import type {
  ListenerObjectSlot,
  MultiArgsFor,
  SubscribeArgs,
  SubscribeImpl,
  UnsubscribeFunc,
} from './index';

// This file asserts things about the type layer. Every case is a compile-time
// assertion; the runtime expectations exist so jest has something to run.
// A `@ts-expect-error` that stops being necessary fails the build with TS2578,
// which is what makes these assertions rather than comments.

describe('SubscribeArgs as a forwarding contract', () => {
  it('forwards a spread through the sanctioned implementation signature', () => {
    const target = eventize();
    const rawOn = on as SubscribeImpl;
    const myOn = (...args: SubscribeArgs): UnsubscribeFunc =>
      rawOn(target, ...args);

    const fake = jest.fn();
    const unsubscribe = myOn('foo', fake);
    emit(target, 'foo', 1);

    expect(fake).toHaveBeenCalledWith(1);
    unsubscribe();
  });

  it('does not accept a spread into the public overload set', () => {
    const target = eventize();
    const forward = (...args: SubscribeArgs): UnsubscribeFunc =>
      // @ts-expect-error TS2556 — TypeScript refuses to spread a union of
      // tuples into a fixed-arity call, whatever the overloads say. This is
      // the reason SubscribeImpl exists; if the directive ever goes unused,
      // TypeScript changed and SubscribeImpl may be reconsidered.
      on(target, ...args);
    expect(typeof forward).toBe('function');
  });
});

// Both helpers stand in the published overloads, which is the reason they are
// exported: a wrapper reproducing one of those positions can name the
// constraint instead of re-deriving it. The guards behind them — IsLooseMap,
// LooseNames, LooseEmitNames — are not exported: each is shorter spelled out
// than imported, and they are the mechanism that closes an overload rather
// than vocabulary a consumer writes.
describe('the helper types a consumer can reach', () => {
  interface Diff {
    data: [payload: string, code: number];
    close: [];
  }

  it('lets a wrapper reproduce the object-listener slot', () => {
    const ε = eventize();
    const seen: string[] = [];
    const attach = <L>(
      listenerObject: ListenerObjectSlot<L>,
    ): UnsubscribeFunc => on(ε, 'data', listenerObject);

    attach({data: () => seen.push('object')});
    emit(ε, 'data');
    expect(seen).toEqual(['object']);

    // @ts-expect-error the slot rejects a function — that is what makes it the
    // *object* slot rather than "any listener"
    attach(() => seen.push('function'));
    // @ts-expect-error and it rejects an array, a mis-typed event-name list
    attach(['a', 'b']);
  });

  it('lets a wrapper spell a multi-name listener argument list', () => {
    const ε = eventize<Diff>();
    const seen: Array<string | number> = [];
    const onEither = (
      listener: (...args: MultiArgsFor<Diff, 'data' | 'close'>) => void,
    ): UnsubscribeFunc => on(ε, ['data', 'close'], listener);

    onEither((first) => {
      if (first !== undefined) seen.push(first);
    });
    emit(ε, 'data', 'x', 1);
    emit(ε, 'close');

    expect(seen).toEqual(['x']);
  });
});

describe('the listener slot rejects what the runtime rejects', () => {
  it('refuses a name array where a listener belongs', () => {
    const target = eventize();
    // @ts-expect-error an array here is a mis-typed event-name list; the
    // runtime throws "subscribeTo() called with insufficient arguments"
    expect(() => on(target, ['a', 'b'])).toThrow(
      'subscribeTo() called with insufficient arguments',
    );
  });

  it('refuses null and undefined where a listener belongs', () => {
    const target = eventize();
    // @ts-expect-error null is not a listener
    expect(() => on(target, null)).toThrow(
      'subscribeTo() called with insufficient arguments',
    );
    // @ts-expect-error undefined is not a listener
    expect(() => on(target, undefined)).toThrow(
      'subscribeTo() called with insufficient arguments',
    );
  });

  it('still accepts a nullish listener *object* in the trailing slot', () => {
    const target = eventize();
    // Late-bound listener objects are a documented shape: the method name is
    // resolved at dispatch, and a missing object dispatches to nothing.
    const unsubscribe = on(target, 'foo', 'handler', null);
    // `target` is `EventizedObject`, not `EventizeApi` — eventize() doesn't
    // inject `.emit`. Dispatch through the standalone function, matching the
    // rest of this file.
    expect(() => emit(target, 'foo')).not.toThrow();
    unsubscribe();
  });
});

describe('isEventized() keeps the event map it narrows', () => {
  interface MyEvents {
    data: [payload: string, code: number];
  }

  it('does not open the loose overload for a typed emitter', () => {
    const ε = eventize<MyEvents>();
    if (isEventized(ε)) {
      // @ts-expect-error 'nope' is not a key of MyEvents — and the guard is
      // not allowed to be what makes it acceptable
      emit(ε, 'nope', 1);
      // @ts-expect-error data is [string, number]
      emit(ε, 'data', 42, 'flipped');
      emit(ε, 'data', 'x', 1);
    }
    expect(isEventized(ε)).toBe(true);
  });

  it('still narrows an unknown', () => {
    const candidate: unknown = eventize();
    expect(isEventized(candidate)).toBe(true);
    if (isEventized(candidate)) {
      emit(candidate, 'whatever', 1, 2, 3);
    }
  });

  it('still answers false for a plain object', () => {
    expect(isEventized({})).toBe(false);
    expect(isEventized(null)).toBe(false);
  });
});

describe('a common listener for several event names', () => {
  interface Diff {
    data: [payload: string, code: number];
    close: [];
  }
  interface Same {
    a: [x: string];
    b: [x: string];
  }

  it('accepts a declared parameter when the tuples differ', () => {
    const ε = eventize<Diff>();
    const seen: Array<string | number> = [];
    on(ε, ['data', 'close'], (first) => {
      // Positional information does not exist for one function serving two
      // shapes, so `first` is the union of every element type — not `any`,
      // and not a compile error.
      if (first !== undefined) seen.push(first);
    });
    emit(ε, 'data', 'x', 1);
    emit(ε, 'close');
    expect(seen).toEqual(['x']);
  });

  it('keeps positional typing when the tuples agree', () => {
    const ε = eventize<Same>();
    on(ε, ['a', 'b'], (x) => {
      const asString: string = x;
      void asString;
    });
    // @ts-expect-error x is string, not number
    on(ε, ['a', 'b'], (x: number) => {
      void x;
    });
    expect(true).toBe(true);
  });

  it('still rejects a name the map does not declare', () => {
    const ε = eventize<Diff>();
    // @ts-expect-error 'typo' is not a key of Diff
    on(ε, ['data', 'typo'], () => {});
    expect(true).toBe(true);
  });

  it('leaves the untyped surface accepting any arity', () => {
    // With DefaultEventMap, ArgsFor is already `any[]` for every key — not a
    // union — so MergeArgs takes its identity branch and this stays exactly
    // as permissive as before MultiArgsFor existed.
    const ε = eventize();
    const seen: unknown[] = [];
    on(ε, ['a', 'b'], (x, y, z) => {
      seen.push(x, y, z);
    });
    emit(ε, 'a', 1, 2, 3);
    expect(seen).toEqual([1, 2, 3]);
  });
});
