import {emit, emitAsync, eventize, on, once} from './index';

/**
 * AGENTS.md ("The two dispatch paths in `emit` move in lockstep") states the
 * rule this spec pins down: the eventized listener-object dispatch
 * (`EventListener.apply()`, `LISTENER_IS_OBJ` branch) and the duck-typed
 * dispatch (`_duckEmitOne()`) resolve the same chain: reject `'*'`, resolve
 * the member through `dispatchableMember()`, fall back to `.emit()` built by
 * `prependEventName()`, and feed a return value through the same
 * `returnValue` callback so `emitAsync()` aggregates identically either way.
 * Since v6.0.0 the chain is shared in `dispatchToTarget()` in
 * `src/utils.ts`, called by both paths. The spec's reach has narrowed: any
 * divergence must now come from what is not shared — like the `'*'` rejection
 * each path makes itself. A red test below means the two paths have diverged,
 * not that one of them is "wrong": most assertions here compare path against
 * path rather than a hand-pinned absolute value, because the divergence is what
 * this spec exists to catch. A handful are absolute anchors instead, where a
 * pure comparison cannot see the failure it needs to see — each says so where it
 * appears.
 *
 * Function targets are deliberately not among the forms below, and the reason
 * is structural rather than a gap waiting to be filled. The duck path does
 * resolve members on a function since v6.0.0 (`isDuckTarget()` accepts
 * `typeof === 'function'`); the listener path never will. `on(ε, fn)` tags
 * `fn` as `LISTENER_IS_FUNC` (`detectListenerType()`), and
 * `EventListener.apply()`'s first branch calls `fn` itself — a function handed
 * to the listener side is a function *listener*, never a listener *object* to
 * resolve members on, and `isObjListener()` requires `typeof === 'object'` for
 * exactly that reason. So the function shape has no second side to compare
 * against: it is pinned as absolute cases of the duck path in
 * `emit-ducktyping.spec.ts`, the `Function.prototype` level of the member
 * boundary included. The one part of that level both paths can reach is the
 * aliasing edge `{bind: Function.prototype.bind}` on an *object*, pinned on
 * each side separately — in `emit-ducktyping.spec.ts` and in
 * `EventListener.spec.ts`. The one shape that does read a member off a
 * function listener object is the method-name form
 * `on(ε, 'evt', 'method', fn)`, through `canReadMembers()` — a different
 * branch entirely, called out here so it isn't mistaken for the
 * object-dispatch form this file compares.
 *
 * The duck path is exercised as `emit(target, ...)` / `emitAsync(target, ...)`
 * on a plain, non-eventized object. The listener path is exercised as
 * `on(ε, target)` — the bare two-argument form, which `_subscribeTo()`
 * decodes as a catch-all (`EVENT_CATCH_EM_ALL`) listener-object subscription
 * — followed by `emit(ε, eventName, ...)` on a fresh emitter. Both land on
 * the very same `target` object as the dispatch's `this` and the source of
 * the member lookup, so a call recorded on it means the same thing on either
 * path.
 *
 * Each side gets its own recorder and its own target instance — the two
 * dispatch paths run on separate objects, never the same one twice — so
 * `calls` (the argument lists) is what gets compared *across* paths, while
 * the `this` binding is checked *within* each side against its own target:
 * two distinct target objects are never `===` each other, so comparing
 * `this` across paths would fail for a reason that has nothing to do with
 * dispatch parity.
 */

const recorder = () => {
  const calls: unknown[][] = [];
  const thisValues: unknown[] = [];
  const fn = function (this: unknown, ...args: unknown[]) {
    thisValues.push(this);
    calls.push(args);
  };
  return {calls, thisValues, fn};
};

describe('dispatch parity: eventized listener-object vs. duck-typed target', () => {
  describe('own method under the event name', () => {
    it('calls the method with the same args on both paths, `this` bound to its own target', () => {
      const duck = recorder();
      const duckTarget = {foo: duck.fn};
      emit(duckTarget, 'foo', 'a', 1, {x: 2});

      const listener = recorder();
      const target = {foo: listener.fn};
      const ε = eventize();
      on(ε, target);
      emit(ε, 'foo', 'a', 1, {x: 2});

      expect(listener.calls).toEqual(duck.calls);
      // Not vacuous: something has to have actually been recorded, or the
      // comparison above would pass just as well on two silent no-ops.
      expect(duck.calls).toEqual([['a', 1, {x: 2}]]);
      expect(duck.thisValues).toEqual([duckTarget]);
      expect(listener.thisValues).toEqual([target]);
    });
  });

  describe('only an .emit() fallback', () => {
    it('calls .emit() with the event name prepended on both paths', () => {
      const duck = recorder();
      const duckTarget = {emit: duck.fn};
      emit(duckTarget, 'foo', 1, 'two');

      const listener = recorder();
      const target = {emit: listener.fn};
      const ε = eventize();
      on(ε, target);
      emit(ε, 'foo', 1, 'two');

      expect(listener.calls).toEqual(duck.calls);
      expect(duck.calls).toEqual([['foo', 1, 'two']]);
      expect(duck.thisValues).toEqual([duckTarget]);
      expect(listener.thisValues).toEqual([target]);
    });
  });

  describe('both a named method and .emit() (the named method must win)', () => {
    it('calls only the named method on both paths, .emit() untouched', () => {
      const duckFoo = recorder();
      const duckEmit = recorder();
      const duckTarget = {foo: duckFoo.fn, emit: duckEmit.fn};
      emit(duckTarget, 'foo', 'X');

      const listenerFoo = recorder();
      const listenerEmit = recorder();
      const target = {foo: listenerFoo.fn, emit: listenerEmit.fn};
      const ε = eventize();
      on(ε, target);
      emit(ε, 'foo', 'X');

      expect(listenerFoo.calls).toEqual(duckFoo.calls);
      expect(listenerEmit.calls).toEqual(duckEmit.calls);
      expect(duckFoo.calls).toEqual([['X']]);
      expect(duckEmit.calls).toEqual([]);
    });
  });

  describe('event name colliding with an Object.prototype member (toString)', () => {
    it('skips the inherited member and falls back to .emit() on both paths', () => {
      const duck = recorder();
      const duckTarget = {emit: duck.fn};
      emit(duckTarget, 'toString', 'a');

      const listener = recorder();
      const target = {emit: listener.fn};
      const ε = eventize();
      on(ε, target);
      emit(ε, 'toString', 'a');

      expect(listener.calls).toEqual(duck.calls);
      expect(duck.calls).toEqual([['toString', 'a']]);
    });

    it('still calls an own override of the inherited member on both paths', () => {
      const duck = recorder();
      const duckEmit = recorder();
      emit({toString: duck.fn, emit: duckEmit.fn}, 'toString', 'X');

      const listener = recorder();
      const listenerEmit = recorder();
      const target = {toString: listener.fn, emit: listenerEmit.fn};
      const ε = eventize();
      on(ε, target);
      emit(ε, 'toString', 'X');

      expect(listener.calls).toEqual(duck.calls);
      expect(listenerEmit.calls).toEqual(duckEmit.calls);
      expect(duck.calls).toEqual([['X']]);
      expect(duckEmit.calls).toEqual([]);
    });
  });

  describe('the "constructor" special case on a class instance', () => {
    it('never invokes the class itself and falls back to .emit() on both paths', () => {
      class Thing {}
      const duckEmit = recorder();
      emit(
        Object.assign(new Thing(), {emit: duckEmit.fn}),
        'constructor',
        1,
        2,
      );

      const listenerEmit = recorder();
      const target = Object.assign(new Thing(), {emit: listenerEmit.fn});
      const ε = eventize();
      on(ε, target);
      emit(ε, 'constructor', 1, 2);

      expect(listenerEmit.calls).toEqual(duckEmit.calls);
      expect(duckEmit.calls).toEqual([['constructor', 1, 2]]);
    });

    it('skips an own "constructor" property too, unlike any other own member', () => {
      const duckOwn = recorder();
      const duckEmit = recorder();
      emit({constructor: duckOwn.fn, emit: duckEmit.fn}, 'constructor', 1);

      const listenerOwn = recorder();
      const listenerEmit = recorder();
      const target = {constructor: listenerOwn.fn, emit: listenerEmit.fn};
      const ε = eventize();
      on(ε, target);
      emit(ε, 'constructor', 1);

      expect(listenerOwn.calls).toEqual(duckOwn.calls);
      expect(listenerEmit.calls).toEqual(duckEmit.calls);
      expect(duckOwn.calls).toEqual([]);
      expect(duckEmit.calls).toEqual([['constructor', 1]]);
    });
  });

  describe('no match at all', () => {
    it('silently does nothing on both paths', () => {
      const unrelated = recorder();
      expect(() => emit({unrelated: unrelated.fn}, 'foo', 'bar')).not.toThrow();

      const listenerUnrelated = recorder();
      const target = {unrelated: listenerUnrelated.fn};
      const ε = eventize();
      on(ε, target);
      expect(() => emit(ε, 'foo', 'bar')).not.toThrow();

      // The unrelated member is the assertion, not decoration: it proves the
      // no-op is a name miss, not an accident of an empty target — neither
      // path called it, and neither path invented a call on `foo` either.
      expect(unrelated.calls).toEqual([]);
      expect(listenerUnrelated.calls).toEqual([]);
    });
  });

  describe('a member under the event name that is not a function', () => {
    it('falls back to .emit() on both paths when the named member is not callable', () => {
      const duckEmit = recorder();
      emit({foo: 42, emit: duckEmit.fn}, 'foo');

      const listenerEmit = recorder();
      const target = {foo: 42, emit: listenerEmit.fn};
      const ε = eventize();
      on(ε, target);
      emit(ε, 'foo');

      expect(listenerEmit.calls).toEqual(duckEmit.calls);
      expect(duckEmit.calls).toEqual([['foo']]);
    });

    it('is a silent no-op on both paths without an .emit() fallback either', () => {
      const duckSibling = recorder();
      const duckTarget = {foo: 42, sibling: duckSibling.fn};
      expect(() => emit(duckTarget, 'foo')).not.toThrow();

      const listenerSibling = recorder();
      const target = {foo: 42, sibling: listenerSibling.fn};
      const ε = eventize();
      on(ε, target);
      expect(() => emit(ε, 'foo')).not.toThrow();

      // A sibling member is what turns "nothing happened" into a checked
      // fact: it stays untouched on both paths, so the no-op is the `foo`
      // dispatch finding nothing, not a target that never got wired up.
      expect(duckSibling.calls).toEqual([]);
      expect(listenerSibling.calls).toEqual([]);
    });
  });

  describe("wildcard event name ('*') is rejected on both paths", () => {
    it('throws the same "concrete event name" error on both paths', () => {
      expect(() => emit({unrelated: 1}, '*', 'data')).toThrow(
        /concrete event name/,
      );

      const target = {unrelated: 1};
      const ε = eventize();
      on(ε, target);
      expect(() => emit(ε, '*', 'data')).toThrow(/concrete event name/);
    });
  });
});

// Not a parity comparison — the duck path has no once() to compare it
// against, so a pure comparison between the two paths cannot see this
// failure at all. This is the absolute anchor for the load-bearing return
// value the remediation plan's package 6 will route through a shared
// helper: EventListener.apply()'s LISTENER_IS_OBJ branch decides whether a
// once() is consumed from whether the dispatch actually invoked something.
// A change that answers that question wrong — "yes" regardless of whether
// apply() or the .emit() fallback fired — would settle a once() on a
// dispatch that called nothing, and no comparison against the duck path
// would ever go red for it.
describe('once() on the listener path survives a dispatch that answers nothing', () => {
  it('keeps the once() subscription alive across a no-op dispatch and fires on the next one that answers', () => {
    const target: {foo?: () => void} = {};
    const ε = eventize();
    once(ε, target);

    // `target` answers neither `foo` nor `.emit()` yet — a silent no-op.
    // If that were wrongly counted as "handled", the once() below would
    // already be spent by the time the second emit runs.
    emit(ε, 'foo');

    const seen: string[] = [];
    target.foo = () => {
      seen.push('called');
    };

    // Now `target.foo` exists. The subscription must still be live: a
    // once() may survive any number of dispatches it didn't answer, and is
    // spent only by the one it does.
    emit(ε, 'foo');

    expect(seen).toEqual(['called']);
  });
});

describe('dispatch parity: emitAsync() aggregation', () => {
  // Each case below mirrors one of the sync forms above, but reads the
  // aggregated result `emitAsync()` resolves to instead of a recorded call —
  // the second half of what this spec compares.
  it("aggregates the named method's return value the same way on both paths", async () => {
    const duckResult = await emitAsync({foo: () => 'sync-value'}, 'foo');

    const ε = eventize();
    on(ε, {foo: () => 'sync-value'});
    const listenerResult = await emitAsync(ε, 'foo');

    expect(listenerResult).toEqual(duckResult);
    expect(duckResult).toEqual(['sync-value']);
  });

  it("aggregates the .emit() fallback's return value the same way on both paths", async () => {
    const duckResult = await emitAsync(
      {emit: (_name: string, n: number) => n * 2},
      'foo',
      21,
    );

    const ε = eventize();
    on(ε, {emit: (_name: string, n: number) => n * 2});
    const listenerResult = await emitAsync(ε, 'foo', 21);

    expect(listenerResult).toEqual(duckResult);
    expect(duckResult).toEqual([42]);
  });

  it('aggregates nothing for a name that matches no member and no .emit()', async () => {
    const duckResult = await emitAsync({unrelated: 1}, 'foo');

    const ε = eventize();
    on(ε, {unrelated: 1});
    const listenerResult = await emitAsync(ε, 'foo');

    expect(listenerResult).toEqual(duckResult);
    expect(duckResult).toBeUndefined();
  });

  it('aggregates nothing for the "constructor" name, falling back to .emit()', async () => {
    class Thing {}
    const duckResult = await emitAsync(
      Object.assign(new Thing(), {emit: () => 'fallback'}),
      'constructor',
    );

    const ε = eventize();
    on(ε, Object.assign(new Thing(), {emit: () => 'fallback'}));
    const listenerResult = await emitAsync(ε, 'constructor');

    expect(listenerResult).toEqual(duckResult);
    expect(duckResult).toEqual(['fallback']);
  });

  it('aggregates through .emit() when the named member is not callable', async () => {
    const duckResult = await emitAsync(
      {foo: 42, emit: (name: string) => `via-${name}`},
      'foo',
    );

    const ε = eventize();
    on(ε, {foo: 42, emit: (name: string) => `via-${name}`});
    const listenerResult = await emitAsync(ε, 'foo');

    expect(listenerResult).toEqual(duckResult);
    expect(duckResult).toEqual(['via-foo']);
  });
});
