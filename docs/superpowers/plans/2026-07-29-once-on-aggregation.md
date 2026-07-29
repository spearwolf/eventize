# once/on Aggregation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One listener identity on one event at one priority is one registration, dispatched once per emit, whatever mixture of `on()` and `once()` produced it and in whatever order.

**Architecture:** Lifetime moves from the caller onto the listener. `EventListener` gains `onceCount` (pending one-shot obligations) beside `refCount` (persistent registrations) plus a monotonic `settleId`; a listener lives while the two counters sum above zero. `EventStore.add()` takes the kind of registration instead of a `noDedup` boolean and increments the matching counter on the inserted or the found listener. After a dispatch, `callAfterApply` discharges all pending obligations at once and bumps `settleId`, which is what keeps a spent `once()` handle from decrementing a counter it no longer owns.

**Tech Stack:** TypeScript (pinned `<7`), Jest via ts-jest, tsup/esbuild for the build, sinon `fake()` in specs.

**Design doc:** `docs/superpowers/specs/2026-07-29-once-on-aggregation-design.md`

## Global Constraints

- `package.json` stays at **`6.0.0-dev`**. Do not drop the suffix, do not bump the version.
- Every changelog entry goes in the existing `## \`v6.0.0\` (unreleased)` section of `CHANGELOG.md`. No new version headings.
- Version references in prose are `v5.1.0` or `v6.0.0`, never anything between.
- **No issue identifiers anywhere in the repo** (`COR-001`, `PERF-002`, …). Descriptive names only.
- Specs live next to sources as `*.spec.ts`. Every behaviour change gets a spec.
- Relative imports carry **no file extension**.
- **Never compare a `ListenerBucket` to a plain array literal.** Buckets carry an own symbol key that Jest's `toEqual`/`toStrictEqual` compares. Assert identity (`toBe` / `not.toBe`) and `toHaveLength`.
- Every bucket content change routes through `EventStore.bucketForMutation()`, and only once a mutation is certain.
- `lib/` is build output. Never edit it, never read it to answer a question about behaviour.
- Run `npx jest --clearCache` before any verification run in this plan. The ts-jest cache lives outside the repo and survives `npm run clean`.
- The gate for every task is `npm run cbt` (clean → build → typecheck → attw → test with coverage → lint → format check). Never lower `coverageThreshold` to make it pass.
- Commits must pass `--no-gpg-sign`; the global git config would otherwise block on a passphrase prompt.
- Docs are English.
- `skills/using-eventize/` must stay self-contained: it may not reference any path outside `skills/`.

---

### Task 1: The aggregation engine

Replaces the one-sided `noDedup` guard with two counters on the listener, wires
settlement into the dispatch, and gives the unsubscribe handles their own
release path. This is one green-to-green unit: the signature of
`EventStore.add()` changes, so the callers and the affected specs move with it.

**Files:**
- Create: `src/once_on_aggregation.spec.ts`
- Modify: `src/constants.ts`, `src/EventListener.ts`, `src/EventStore.ts`, `src/subscribeTo.ts`, `src/eventize-api.ts`
- Modify (spec updates): `src/once.spec.ts:226-316`, `src/on_multiple_times.spec.ts:13-100`, `src/EventStore.spec.ts:300-319`, `src/off.spec.ts:823-835`, `src/retain.spec.ts:481-487`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `REGISTER_PERSISTENT = 0`, `REGISTER_ONE_SHOT = 1`, `type RegisterKind` in `src/constants.ts`
  - `EventListener.refCount: number`, `.onceCount: number`, `.settleId: number`
  - `EventStore.add(listener: EventListener, kind?: RegisterKind): EventListener`
  - `EventStore.release(listener: EventListener, kind: RegisterKind, settleId: number): void`
  - `EventStore.settleOneShots(listener: EventListener): void`
  - `interface Registration {listener: EventListener; settleId: number}` in `src/subscribeTo.ts`
  - `subscribeTo(store, keeper, args, kind): Registration | Registration[]`
  - `EventStore.removeByEventListener()` and `subscribeToDeferred()` no longer exist

- [ ] **Step 1: Write the failing spec**

Create `src/once_on_aggregation.spec.ts`:

```ts
import {fake} from 'sinon';

import {emit, eventize, getSubscriptionCount, on, once, retain} from './index';
import {storeOf} from './__test-utils__/listeners';

describe('on()/once() aggregate by listener identity', () => {
  describe('the registration order does not change the behaviour', () => {
    it('once() then on(): one registration, one call per emit', () => {
      const ε = eventize();
      const listenerObject = {foo: fake()};

      once(ε, 'foo', listenerObject);
      on(ε, 'foo', listenerObject);

      expect(getSubscriptionCount(ε)).toBe(1);

      emit(ε, 'foo');
      expect(listenerObject.foo.callCount).toBe(1);
      expect(getSubscriptionCount(ε)).toBe(1);

      emit(ε, 'foo');
      expect(listenerObject.foo.callCount).toBe(2);
      expect(getSubscriptionCount(ε)).toBe(1);
    });

    it('on() then once(): the same, field for field', () => {
      const ε = eventize();
      const listenerObject = {foo: fake()};

      on(ε, 'foo', listenerObject);
      once(ε, 'foo', listenerObject);

      expect(getSubscriptionCount(ε)).toBe(1);

      emit(ε, 'foo');
      expect(listenerObject.foo.callCount).toBe(1);
      expect(getSubscriptionCount(ε)).toBe(1);

      emit(ε, 'foo');
      expect(listenerObject.foo.callCount).toBe(2);
      expect(getSubscriptionCount(ε)).toBe(1);
    });

    it('the method-name form aggregates in both orders', () => {
      const first = eventize();
      const second = eventize();
      const a = {handler: fake()};
      const b = {handler: fake()};

      once(first, 'foo', 'handler', a);
      on(first, 'foo', 'handler', a);

      on(second, 'foo', 'handler', b);
      once(second, 'foo', 'handler', b);

      expect(getSubscriptionCount(first)).toBe(1);
      expect(getSubscriptionCount(second)).toBe(1);

      emit(first, 'foo');
      emit(second, 'foo');

      expect(a.handler.callCount).toBe(1);
      expect(b.handler.callCount).toBe(1);
      expect(getSubscriptionCount(first)).toBe(1);
      expect(getSubscriptionCount(second)).toBe(1);
    });

    it('the catch-em-all form aggregates in both orders', () => {
      const first = eventize();
      const second = eventize();
      const a = {foo: fake()};
      const b = {foo: fake()};

      once(first, a);
      on(first, a);

      on(second, b);
      once(second, b);

      expect(getSubscriptionCount(first)).toBe(1);
      expect(getSubscriptionCount(second)).toBe(1);

      emit(first, 'foo');
      emit(second, 'foo');

      expect(a.foo.callCount).toBe(1);
      expect(b.foo.callCount).toBe(1);
    });
  });

  describe('two once() registrations', () => {
    it('collapse into one obligation and one call', () => {
      const ε = eventize();
      const listenerObject = {foo: fake()};

      once(ε, 'foo', listenerObject);
      once(ε, 'foo', listenerObject);

      expect(getSubscriptionCount(ε)).toBe(1);

      emit(ε, 'foo');
      expect(listenerObject.foo.callCount).toBe(1);
      expect(getSubscriptionCount(ε)).toBe(0);

      emit(ε, 'foo');
      expect(listenerObject.foo.callCount).toBe(1);
    });

    it('a duplicated event name in one call aggregates onto itself', () => {
      const ε = eventize();
      const listenerObject = {foo: fake()};

      once(ε, ['foo', 'foo'], listenerObject);

      expect(getSubscriptionCount(ε)).toBe(1);

      emit(ε, 'foo');
      expect(listenerObject.foo.callCount).toBe(1);
      expect(getSubscriptionCount(ε)).toBe(0);
    });
  });

  describe('the handles stay independent', () => {
    it('releasing the once() handle leaves the on() registration', () => {
      const ε = eventize();
      const listenerObject = {foo: fake()};

      const unsubOnce = once(ε, 'foo', listenerObject);
      on(ε, 'foo', listenerObject);

      unsubOnce();
      expect(getSubscriptionCount(ε)).toBe(1);

      emit(ε, 'foo');
      emit(ε, 'foo');
      expect(listenerObject.foo.callCount).toBe(2);
    });

    it('releasing the on() handle leaves the once() obligation', () => {
      const ε = eventize();
      const listenerObject = {foo: fake()};

      once(ε, 'foo', listenerObject);
      const unsubOn = on(ε, 'foo', listenerObject);

      unsubOn();
      expect(getSubscriptionCount(ε)).toBe(1);

      emit(ε, 'foo');
      expect(listenerObject.foo.callCount).toBe(1);
      expect(getSubscriptionCount(ε)).toBe(0);

      emit(ε, 'foo');
      expect(listenerObject.foo.callCount).toBe(1);
    });

    it('releasing both detaches the listener', () => {
      const ε = eventize();
      const listenerObject = {foo: fake()};

      const unsubOnce = once(ε, 'foo', listenerObject);
      const unsubOn = on(ε, 'foo', listenerObject);

      unsubOnce();
      unsubOn();

      expect(getSubscriptionCount(ε)).toBe(0);
      emit(ε, 'foo');
      expect(listenerObject.foo.callCount).toBe(0);
    });

    it('a once() handle is inert once the dispatch discharged it', () => {
      const ε = eventize();
      const listenerObject = {foo: fake()};

      const unsubOnce = once(ε, 'foo', listenerObject);
      on(ε, 'foo', listenerObject);

      emit(ε, 'foo');
      unsubOnce();

      expect(getSubscriptionCount(ε)).toBe(1);
      emit(ε, 'foo');
      expect(listenerObject.foo.callCount).toBe(2);
    });

    it('a spent once() handle does not discharge a later obligation', () => {
      const ε = eventize();
      const listenerObject = {foo: fake()};

      const unsubOnce = once(ε, 'foo', listenerObject);
      on(ε, 'foo', listenerObject);

      emit(ε, 'foo');
      once(ε, 'foo', listenerObject);
      unsubOnce();

      // the second obligation is still standing: it is discharged by the emit,
      // not by the handle of the first one
      emit(ε, 'foo');
      expect(listenerObject.foo.callCount).toBe(3);
      expect(getSubscriptionCount(ε)).toBe(1);
    });

    it('calling a handle twice stays inert', () => {
      const ε = eventize();
      const listenerObject = {foo: fake()};

      const first = on(ε, 'foo', listenerObject);
      on(ε, 'foo', listenerObject);

      first();
      first();

      expect(getSubscriptionCount(ε)).toBe(1);
      emit(ε, 'foo');
      expect(listenerObject.foo.callCount).toBe(1);
    });
  });

  describe('what does not aggregate', () => {
    it('two different priorities stay two registrations', () => {
      const ε = eventize();
      const listenerObject = {foo: fake()};

      once(ε, 'foo', listenerObject);
      on(ε, 'foo', 10, listenerObject);

      expect(getSubscriptionCount(ε)).toBe(2);

      emit(ε, 'foo');
      expect(listenerObject.foo.callCount).toBe(2);
      expect(getSubscriptionCount(ε)).toBe(1);
    });

    it('two different listener objects stay two registrations', () => {
      const ε = eventize();
      const a = {foo: fake()};
      const b = {foo: fake()};

      once(ε, 'foo', a);
      on(ε, 'foo', b);

      expect(getSubscriptionCount(ε)).toBe(2);
    });

    it('function listeners never aggregate', () => {
      const ε = eventize();
      const listener = fake();

      once(ε, 'foo', listener);
      on(ε, 'foo', listener);

      expect(getSubscriptionCount(ε)).toBe(2);

      emit(ε, 'foo');
      expect(listener.callCount).toBe(2);
      expect(getSubscriptionCount(ε)).toBe(1);
    });

    it('two different event names stay two registrations', () => {
      const ε = eventize();
      const listenerObject = {foo: fake(), bar: fake()};

      once(ε, 'foo', listenerObject);
      on(ε, 'bar', listenerObject);

      expect(getSubscriptionCount(ε)).toBe(2);
    });
  });

  describe('retained events', () => {
    it('a once() aggregating onto an on() still receives the replay', () => {
      const ε = eventize();
      const listenerObject = {foo: fake()};

      retain(ε, 'foo');
      emit(ε, 'foo', 'RETAINED');

      on(ε, 'foo', listenerObject);
      expect(listenerObject.foo.callCount).toBe(1);

      once(ε, 'foo', listenerObject);
      expect(listenerObject.foo.callCount).toBe(2);
      expect(listenerObject.foo.calledWith('RETAINED')).toBe(true);

      // the replay discharged the obligation; the on() is what remains
      expect(getSubscriptionCount(ε)).toBe(1);
    });

    it('an on() aggregating onto an on() does not replay again', () => {
      const ε = eventize();
      const listenerObject = {foo: fake()};

      retain(ε, 'foo');
      emit(ε, 'foo', 'RETAINED');

      on(ε, 'foo', listenerObject);
      on(ε, 'foo', listenerObject);

      expect(listenerObject.foo.callCount).toBe(1);
      expect(getSubscriptionCount(ε)).toBe(1);
    });

    it('a once() on a retained event never reaches an aggregate', () => {
      const ε = eventize();
      const listenerObject = {foo: fake()};

      retain(ε, 'foo');
      emit(ε, 'foo', 'RETAINED');

      // the first obligation is discharged by its own replay, before the
      // second registration exists — so both insert, and both replay
      once(ε, 'foo', listenerObject);
      once(ε, 'foo', listenerObject);

      expect(listenerObject.foo.callCount).toBe(2);
      expect(getSubscriptionCount(ε)).toBe(0);
    });
  });

  describe('settlement inside a running dispatch', () => {
    it('clones the bucket the walk is holding', () => {
      const ε = eventize();
      const persistent = {foo: fake()};
      const oneShot = {foo: fake()};

      on(ε, 'foo', persistent);
      once(ε, 'foo', oneShot);

      const before = storeOf(ε).getListenersForEventName('foo');
      expect(before).toHaveLength(2);

      emit(ε, 'foo');

      const after = storeOf(ε).getListenersForEventName('foo');
      expect(after).not.toBe(before);
      expect(after).toHaveLength(1);
      // the array the walk stepped through is left intact
      expect(before).toHaveLength(2);
      expect(persistent.foo.callCount).toBe(1);
      expect(oneShot.foo.callCount).toBe(1);
    });

    it('an aggregate subscribed from inside its own dispatch is not called twice', () => {
      const ε = eventize();
      const listenerObject = {
        foo: fake(() => {
          on(ε, 'foo', listenerObject);
        }),
      };

      once(ε, 'foo', listenerObject);

      emit(ε, 'foo');
      expect(listenerObject.foo.callCount).toBe(1);
      // the on() from inside the callback aggregated onto the listener the
      // walk was dispatching, so the settlement leaves it standing
      expect(getSubscriptionCount(ε)).toBe(1);

      emit(ε, 'foo');
      expect(listenerObject.foo.callCount).toBe(2);
    });
  });
});
```

- [ ] **Step 2: Run the spec and confirm it fails**

```bash
npx jest --clearCache && npm test -- src/once_on_aggregation.spec.ts
```

Expected: failures in the order-independence, two-once and handle blocks. The
negative controls and the two "does not aggregate" retained cases already pass.

- [ ] **Step 3: Add the registration kinds**

Append to `src/constants.ts`:

```ts
// How long a registration lives, decided by the call that made it. The store
// keeps one listener per identity and counts the two kinds separately, so a
// listener survives exactly as long as one of its registrations still wants it.
export const REGISTER_PERSISTENT = 0;
export const REGISTER_ONE_SHOT = 1;

export type RegisterKind =
  | typeof REGISTER_PERSISTENT
  | typeof REGISTER_ONE_SHOT;
```

`src/index.ts` re-exports only `EVENT_CATCH_EM_ALL` from this module, so nothing
here reaches `lib/index.d.ts`. Do not add these to the public exports.

- [ ] **Step 4: Give the listener two counters and a settle generation**

In `src/EventListener.ts`, replace the `refCount: number;` field declaration
with:

```ts
  // Two counters, not one, because two kinds of registration share a listener:
  // refCount is what on() adds, onceCount is the pending obligations once()
  // adds. The listener lives while their sum is above zero. Folding them into
  // one number is what made the registration order decide the behaviour.
  refCount: number;
  onceCount: number;
  // Bumped every time a dispatch discharges the pending obligations. An
  // unsubscribe handle captures it at registration and compares on release: a
  // handle whose obligation is already discharged must not decrement a counter
  // that now belongs to somebody else.
  settleId: number;
```

and in the constructor replace `this.refCount = 1;` with:

```ts
    this.refCount = 0;
    this.onceCount = 0;
    this.settleId = 0;
```

The counters start at zero because `EventStore.add()` counts every
registration, the inserted one included.

Extend the `detach()` doc comment with one sentence:

```ts
   * The counters are left as they are: a detached listener is out of its
   * bucket, so no dedup search finds it again, and every reader bails on
   * `isRemoved` first.
```

Update the doc comment on `callAfterApply` (above the field) to:

```ts
  // Runs after a dispatch that actually invoked the listener. It means "settle
  // the pending one-shot obligations", not "release a handle" — one listener
  // can carry several once() registrations, and a single closure per handle
  // could only ever speak for the last one.
  callAfterApply: CallAfterApplyFnType;
```

- [ ] **Step 5: Make `EventStore.add()` kind-aware**

In `src/EventStore.ts`, add to the imports from `./constants`:
`REGISTER_ONE_SHOT`, `REGISTER_PERSISTENT`, and `type RegisterKind`.

Add above the `EventStore` class:

```ts
const countRegistration = (listener: EventListener, kind: RegisterKind) => {
  if (kind === REGISTER_ONE_SHOT) {
    listener.onceCount += 1;
  } else {
    listener.refCount += 1;
  }
};
```

Replace the whole `add()` method with:

```ts
  /**
   * Returns the listener the registration landed on: the given one when it was
   * inserted, or an existing one with the same identity. Either way the
   * counter for `kind` is incremented on it, which is what makes `on()` and
   * `once()` aggregate in both registration orders.
   *
   * The `noDedup` flag this replaced only ever guarded the incoming call, so a
   * later `on()` still folded onto a pending `once()` while the reverse order
   * did not. Identity decides which listener, the counters decide how long.
   */
  add(
    listener: EventListener,
    kind: RegisterKind = REGISTER_PERSISTENT,
  ): EventListener {
    const bucket = listener.isCatchEmAll
      ? this.catchEmAllBucket
      : this.getListenersForEventName(listener.eventName);

    const similarListener = findSimilarListener(listener, bucket);
    if (similarListener) {
      // An aggregation bumps a counter and touches no array, so it owes no
      // clone. Searching the live bucket is safe for the same reason.
      countRegistration(similarListener, kind);
      return similarListener;
    }

    countRegistration(listener, kind);
    const target = this.bucketForMutation(listener.eventName, bucket);
    target.splice(findInsertIndex(target, listener), 0, listener);
    return listener;
  }
```

- [ ] **Step 6: Replace `removeByEventListener()` with `release()`, `settleOneShots()` and `dropListener()`**

In `src/EventStore.ts`, delete the `private removeByEventListener()` method
whole and put these three in its place:

```ts
  /**
   * Gives one registration back. The handle returned by `on()` / `once()` is
   * the only caller, and it knows which kind it holds.
   *
   * A one-shot release compares the generation it was registered in: a dispatch
   * that already discharged the obligation bumped `settleId`, and decrementing
   * `onceCount` from a spent handle would take a count that now belongs to a
   * later registration — the shape that once let one handle unsubscribe
   * another's listener.
   */
  release(
    listener: EventListener,
    kind: RegisterKind,
    settleId: number,
  ): void {
    if (listener.isRemoved) return;

    if (kind === REGISTER_ONE_SHOT) {
      if (listener.settleId !== settleId) return;
      listener.onceCount -= 1;
    } else {
      listener.refCount -= 1;
    }

    if (listener.refCount + listener.onceCount > 0) return;
    this.dropListener(listener);
  }

  /**
   * Discharges every pending one-shot obligation of a listener that has just
   * been dispatched. All of them at once: they were satisfied by the same call,
   * and counting them down one per dispatch would make a second `once()` on the
   * same identity fire on the next emit instead of this one.
   *
   * Runs from inside `EventListener.apply()`, so from inside a live `forEach()`
   * walk. `dropListener()` routes through `bucketForMutation()`, which is what
   * keeps the walk's array intact.
   */
  settleOneShots(listener: EventListener): void {
    if (listener.onceCount === 0) return;

    listener.onceCount = 0;
    listener.settleId += 1;
    listener.callAfterApply = undefined;

    if (listener.refCount === 0) {
      this.dropListener(listener);
    }
  }

  /**
   * Takes a listener out of the registry, unconditionally. A listener lives in
   * exactly one bucket: the catch-em-all array, or the named array for its own
   * eventName. A multi-event `on()` creates one EventListener per name, so
   * there is never more than one home to visit.
   */
  private dropListener(listener: EventListener): void {
    if (listener.isCatchEmAll) {
      this.removeItem(listener.eventName, this.catchEmAllBucket, listener);
    } else {
      const bucket = this.namedListeners.get(listener.eventName);
      if (bucket) {
        const remaining = this.removeItem(listener.eventName, bucket, listener);
        if (remaining.length === 0) {
          this.namedListeners.delete(listener.eventName);
        }
      }
    }

    listener.detach();
  }
```

Then delete this branch from `remove()`, comment included:

```ts
    // off(EventListener) — used by the unsubscribe function returned from on()
    if (listener instanceof EventListener) {
      this.removeByEventListener(listener);
      return;
    }
```

The handles call `release()` directly from Step 8 on, and `.listener` came off
the public handle in v6.0.0, so no `EventListener` instance can reach `remove()`
any more. If `EventListener` is now only used as a type in this file, change its
import to `import type`.

- [ ] **Step 7: Thread the kind through `subscribeTo`, install the settle hook, widen the replay rule**

In `src/subscribeTo.ts`, add `REGISTER_ONE_SHOT`, `REGISTER_PERSISTENT` and
`type RegisterKind` to the `./constants` import, then export the registration
shape and rewrite `registerEventListener()`:

```ts
/**
 * What a subscription hands back to its unsubscribe handle. The listener alone
 * is not enough: a one-shot release has to prove it is giving back the
 * obligation it registered, not one a later `once()` made on the same listener.
 * `settleId` is read before the retained replay runs, because that replay can
 * discharge the obligation on the spot.
 */
export interface Registration {
  listener: EventListener;
  settleId: number;
}

const registerEventListener = (
  store: EventStore,
  keeper: EventKeeper,
  eventName: EventName,
  priority: number,
  listener: unknown,
  listenerObject: ListenerObjectType,
  retainedEvents: KeeperEvent[],
  kind: RegisterKind,
): Registration => {
  const newListener = new EventListener(
    eventName,
    priority,
    listener,
    listenerObject,
  );
  const el = store.add(newListener, kind);
  const settleId = el.settleId;

  if (kind === REGISTER_ONE_SHOT && el.callAfterApply === undefined) {
    // One hook per listener, however many once() registrations it carries. It
    // outlives none of them: settleOneShots() clears it when it discharges.
    el.callAfterApply = () => store.settleOneShots(el);
  }

  // An aggregating on() gets no replay — the handler already saw that value.
  // An aggregating once() does: its obligation is new, and without the replay
  // whether a once() fires on a retained event would depend on the incidental
  // existence of an on() with the same handler.
  if (el === newListener || kind === REGISTER_ONE_SHOT) {
    keeper.replayTo(eventName, el, retainedEvents);
  }

  return {listener: el, settleId};
};
```

Change `_subscribeTo`'s last parameter from `noDedup: boolean` to
`kind: RegisterKind`, its return type to `Registration | Array<Registration>`,
and pass `kind` in place of `noDedup` inside `register`.

Replace both exported entry points with a single one:

```ts
export const subscribeTo = (
  store: EventStore,
  keeper: EventKeeper,
  args: EventArgs,
  kind: RegisterKind = REGISTER_PERSISTENT,
): Registration | Array<Registration> => {
  const retainedEvents: KeeperEvent[] = [];
  const registrations = _subscribeTo(store, keeper, args, retainedEvents, kind);
  EventKeeper.publish(retainedEvents);
  return registrations;
};
```

Delete `subscribeToDeferred()` entirely. Its only reason to exist was giving
`once()` a window to install `callAfterApply` before the retained replay fired;
the hook now goes in during registration, ahead of the publish.

- [ ] **Step 8: Give the handles their own release path**

In `src/eventize-api.ts`, delete the `afterApply` helper at the top of the file
and import `REGISTER_ONE_SHOT`, `REGISTER_PERSISTENT` and `type RegisterKind`
from `./constants`, plus `type Registration` from `./subscribeTo`. Replace the
comment block above `makeUnsubscribe` and the function itself with:

```ts
// The handle is idempotent by construction: a second call is inert, not a
// second release. Without the guard a shared registration was decremented
// twice by the same handle, which released a sibling handle's count. Cleanup
// code that calls a stored handle defensively ("call it again, it's a no-op")
// is exactly the shape that hit it, and `docs/off.md` promised that no-op.
//
// The nulled capture *is* the consumed flag, and that is what stops a handle
// kept after its call from pinning anything — the emitter, and with it the
// store, the keeper and every retained payload. A separate boolean would leave
// both references in the closure forever. Both go in one slot so a single null
// test releases them together and TypeScript narrows both at once.
//
// Releasing goes through the store rather than the public `off()`: a handle
// gives back the one registration it made, which is a different operation from
// `off(ε, 'foo', obj)` force-removing everything under an identity. The kind
// and the settle generation travel with the capture because only the handle
// knows them.
const makeUnsubscribe = (
  host: EventizedObject,
  registrations: Registration | Array<Registration>,
  kind: RegisterKind,
): UnsubscribeFunc => {
  let held: {
    host: EventizedObject;
    registrations: Registration | Array<Registration>;
  } | null = {host, registrations};

  return () => {
    const target = held;
    if (target === null) return;
    held = null;
    const {store} = internalsOf(target.host);
    if (Array.isArray(target.registrations)) {
      target.registrations.forEach((registration) =>
        store.release(registration.listener, kind, registration.settleId),
      );
    } else {
      store.release(
        target.registrations.listener,
        kind,
        target.registrations.settleId,
      );
    }
  };
};
```

Replace the body of `on()`:

```ts
export function on(obj: object, ...args: SubscribeArgs): UnsubscribeFunc {
  const eventizedObj = asEventized(obj);
  const {store, keeper} = internalsOf(eventizedObj);
  return makeUnsubscribe(
    eventizedObj,
    subscribeTo(store, keeper, args, REGISTER_PERSISTENT),
    REGISTER_PERSISTENT,
  );
}
```

and the body of `once()`:

```ts
export function once(obj: object, ...args: SubscribeArgs): UnsubscribeFunc {
  const eventizedObj = asEventized(obj);
  const {store, keeper} = internalsOf(eventizedObj);
  // The auto-unsubscribe is not this handle's job any more: the store settles
  // every pending obligation on the listener after a dispatch, which is what
  // lets two once() calls on one identity share a single registration. A
  // retained event therefore fires inside subscribeTo(), before this handle
  // exists — release() bails on `isRemoved` if it already took the listener.
  return makeUnsubscribe(
    eventizedObj,
    subscribeTo(store, keeper, args, REGISTER_ONE_SHOT),
    REGISTER_ONE_SHOT,
  );
}
```

Remove the now-unused `subscribeToDeferred` from the import at the top of the
file.

- [ ] **Step 9: Run the new spec**

```bash
npm test -- src/once_on_aggregation.spec.ts
```

Expected: PASS, all blocks.

- [ ] **Step 10: Update `src/once.spec.ts`**

Rename the `describe` at line 226 from `'no dedup between once() registrations'`
to `'once() aggregates like on()'` and replace its first three cases with:

```ts
    it('two once() on the same listener object fire once, then detach', () => {
      const obj = eventize();
      const listenerObject = {foo: fake()};

      once(obj, 'foo', listenerObject);
      once(obj, 'foo', listenerObject);
      expect(getSubscriptionCount(obj)).toBe(1);

      emit(obj, 'foo', 'first');

      expect(listenerObject.foo.callCount).toBe(1);
      expect(getSubscriptionCount(obj)).toBe(0);

      emit(obj, 'foo', 'second');
      expect(listenerObject.foo.callCount).toBe(1);
    });

    it('the same holds for the method-name form', () => {
      const obj = eventize();
      const listenerObject = {handler: fake()};

      once(obj, 'foo', 'handler', listenerObject);
      once(obj, 'foo', 'handler', listenerObject);
      expect(getSubscriptionCount(obj)).toBe(1);

      emit(obj, 'foo');

      expect(listenerObject.handler.callCount).toBe(1);
      expect(getSubscriptionCount(obj)).toBe(0);
    });

    it('each returned handle releases its own obligation', () => {
      const obj = eventize();
      const listenerObject = {foo: fake()};

      const first = once(obj, 'foo', listenerObject);
      const second = once(obj, 'foo', listenerObject);

      first();
      expect(getSubscriptionCount(obj)).toBe(1);

      second();
      expect(getSubscriptionCount(obj)).toBe(0);

      emit(obj, 'foo');
      expect(listenerObject.foo.callCount).toBe(0);
    });
```

In the case at line 287, `'a once() and an on() on the same object stay
independent'`, rename it to `'a once() and an on() on the same object share one
registration'` and replace its body with:

```ts
      const obj = eventize();
      const listenerObject = {foo: fake()};

      on(obj, 'foo', listenerObject);
      once(obj, 'foo', listenerObject);
      expect(getSubscriptionCount(obj)).toBe(1);

      emit(obj, 'foo');
      expect(listenerObject.foo.callCount).toBe(1);
      expect(getSubscriptionCount(obj)).toBe(1);

      emit(obj, 'foo');
      expect(listenerObject.foo.callCount).toBe(2);
```

Leave `'on() still deduplicates'` and `'two once() on a retained event both
receive the replay'` as they are — both stay green.

- [ ] **Step 11: Update `src/on_multiple_times.spec.ts`**

Three cases pass a `once()` alongside a deduplicated `on()` pair. In each, the
`once()` now joins the same registration instead of adding a second.

In `'on(eventName, listenerObject)'` (line 6): replace the comment at lines
13-14 with

```ts
    // once() aggregates onto the same registration: one listener, and the
    // pending obligation is discharged by the first emit.
```

change `expect(getSubscriptionCount(obj)).toBe(2)` to `.toBe(1)`, replace the
comment at line 21 with `// one call for the single registration`, and change
`expect(obj.foo.callCount).toBe(2)` to `.toBe(1)`.

In `'on(eventName, listenerFuncName, listenerObject)'` (line 42) and
`'on(listenerObject)'` (line 88): replace the `// not deduplicated against the
on() pair — its own subscription` comment with `// aggregates onto the on()
pair: one registration`, and change the first `expect(obj.foo.callCount).toBe(2)`
in each to `.toBe(1)`.

The later assertions in all three cases (`unsubscribe0()` then one call,
`unsubscribe1()` then none) stay as they are.

- [ ] **Step 12: Update `src/EventStore.spec.ts`**

Add `REGISTER_ONE_SHOT` to the `./constants` import. Replace the case at line
300 with:

```ts
    it('aggregates a one-shot registration onto a similar listener', () => {
      const store = new EventStore();
      const listenerObject = {};
      const first = store.add(new EventListener('foo', 0, listenerObject));
      // what once() passes: the identity is already registered, so the
      // obligation joins it instead of inserting a second listener
      const second = store.add(
        new EventListener('foo', 0, listenerObject),
        REGISTER_ONE_SHOT,
      );

      expect(second).toBe(first);
      expect(first.refCount).toBe(1);
      expect(first.onceCount).toBe(1);
      expect(store.getSubscriptionCount()).toBe(1);

      store.release(first, REGISTER_ONE_SHOT, 0);
      expect(store.getSubscriptionCount()).toBe(1);
      store.release(first, REGISTER_PERSISTENT, 0);
      expect(store.getSubscriptionCount()).toBe(0);
    });

    it('a settled obligation cannot be released by its old generation', () => {
      const store = new EventStore();
      const listenerObject = {};
      const listener = store.add(
        new EventListener('foo', 0, listenerObject),
        REGISTER_ONE_SHOT,
      );
      store.add(new EventListener('foo', 0, listenerObject));

      store.settleOneShots(listener);
      expect(listener.onceCount).toBe(0);
      expect(listener.settleId).toBe(1);

      store.release(listener, REGISTER_ONE_SHOT, 0);

      expect(listener.refCount).toBe(1);
      expect(store.getSubscriptionCount()).toBe(1);
    });
```

Add `REGISTER_PERSISTENT` to the same import.

- [ ] **Step 13: Update `src/off.spec.ts` and `src/retain.spec.ts`**

In `src/off.spec.ts`, the case at line 823: replace the comment
`// once() is exempt from dedup: two listeners, one bucket.` with
`// the two once() calls aggregate: one listener in the wildcard bucket.` and
change `expect(getSubscriptionCount(ε)).toBe(2)` to `.toBe(1)`.

In `src/retain.spec.ts`, replace the comment block above the case at line 487
with:

```ts
    // A once() next to an existing on() joins its registration, and still gets
    // the replay: the obligation is new even though the listener is not.
    // Without that, whether a once() fires on a retained event would depend on
    // an unrelated on() with the same handler. The guard against an
    // unconditional replay lives in the first case of this block.
```

The two issue identifiers in the old comment come out with it — the repo keeps
no tracker ids in the tree. The assertions in that case stay unchanged.

- [ ] **Step 14: Run the whole suite and clear what is left**

```bash
npm test
```

Any further failures are in specs that read `refCount` directly or count
subscriptions for a once/on pair. Find them with:

```bash
grep -rn "refCount\|noDedup\|subscribeToDeferred\|removeByEventListener" src/
```

Fix each by the rule in Step 4: `refCount` counts `on()` registrations only,
`onceCount` the pending `once()` obligations. Do not weaken an assertion to make
it pass; if a case pinned the old order-dependent behaviour, rewrite it to pin
the aggregation instead.

- [ ] **Step 15: Full verification**

```bash
npx jest --clearCache && npm run cbt
```

Expected: PASS, coverage thresholds included. If coverage dropped, the missing
lines are in `release()` / `settleOneShots()` — add the case, do not lower the
threshold.

- [ ] **Step 16: Commit**

```bash
git add src/
git commit --no-gpg-sign -m "$(cat <<'EOF'
fix(store): aggregate on() and once() by listener identity

once() guarded deduplication on the caller side only, so a later on() folded
onto a pending once() while the reverse order registered a second listener.
The same two calls produced one or two invocations depending on which came
first.

Lifetime moves onto the listener: refCount counts on() registrations,
onceCount the pending once() obligations, and a dispatch discharges all of
them at once. A monotonic settleId keeps a spent once() handle from
decrementing a count that has since passed to another registration.
EOF
)"
```

---

### Task 2: Rebuild the lifecycle case the change invalidates

`src/lifecycle.spec.ts:579` proves that a consumed handle releases the emitter
even when the surviving listener leads back to it. Its second sub-case builds
that chain out of an `on()` that deduplicated onto a pending `once()`, and reads
the back-reference through `callAfterApply` being the once handle's closure.
After Task 1 that closure captures the store, which holds no reference to the
host, so the case still passes while proving something else. Task 1 leaves it
green, which is exactly why it needs its own gate.

**Files:**
- Modify: `src/lifecycle.spec.ts:595-616`

**Interfaces:**
- Consumes: `EventStore.release()`, the settle hook from Task 1.
- Produces: nothing other tasks rely on.

- [ ] **Step 1: Find out whether the shape is still covered elsewhere**

```bash
grep -n "WeakRef\|collect(" src/lifecycle.spec.ts | head -40
grep -n "on(obj, 'foo', obj)\|on(ε, 'foo', ε)\|on(obj, obj)" src/lifecycle.spec.ts
```

The question to answer: does any remaining case build a *surviving* listener
that holds the emitter, after a consumed handle only decremented a count?

- [ ] **Step 2: Replace the sub-case**

Replace `onDedupedOntoAPendingOnce` and its comment (lines 595-615) with the
self-subscription shape, which still carries a genuine back-reference to the
emitter:

```ts
      // The hard case: the surviving listener *is* the emitter, subscribed as
      // its own listener object. Consuming one of the two deduplicated handles
      // takes the count from 2 to 1 and detaches nothing, which used to leave
      // the chain handle -> closure -> listener -> listener object -> ε hanging
      // off the consumed handle. Nulling the capture cuts it at the first link.
      //
      // Up to the aggregation change this case was built from an on() that
      // deduplicated onto a pending once(), reading the back-reference through
      // callAfterApply. That hook now closes over the store, which holds no
      // reference back to the emitter, so the chain it tested no longer exists.
      const selfSubscribedTwice = () => {
        const obj = eventize();
        on(obj, 'foo', obj);
        const handle = on(obj, 'foo', obj); // aggregates, refCount = 2
        handle();
        return {handle, ref: new WeakRef(obj)};
      };

      const selfSubscribed = selfSubscribedTwice();
      const selfVerdict = await collect(selfSubscribed.ref);

      expect(typeof selfSubscribed.handle).toBe('function');
      expect(selfVerdict).toMatch(/^collected/);
```

If Step 1 showed that an existing case already pins this exact shape, delete the
sub-case instead of replacing it, and note in the comment above
`plainSharedRegistration` which case took it over. Do not leave both.

- [ ] **Step 3: Run the lifecycle spec**

```bash
npm test -- src/lifecycle.spec.ts
```

Expected: PASS, including the control group at the end. The control asserting
`/^still reachable.*harness ok/` must stay green — if it reports `collected`,
the other assertions are measuring an emitter nothing held in the first place.

- [ ] **Step 4: Commit**

```bash
git add src/lifecycle.spec.ts
git commit --no-gpg-sign -m "test(lifecycle): pin the release guarantee on a chain that still exists

The deduplicated-onto-a-pending-once shape stopped building a path from the
listener back to the emitter once the settle hook moved to the store. The
self-subscribed emitter still does."
```

---

### Task 3: Documentation

Every doc that describes deduplication currently states the v6 rule "`once()`
never deduplicates", which this change reverses. The changelog entry is replaced
rather than added to: `6.x` is unpublished, so there is no earlier state to
preserve.

**Files:**
- Modify: `CHANGELOG.md:7,11,44`, `docs/migration.md:86`, `docs/off.md:253-262`, `docs/backlog.md:18-36`, `docs/lifecycle.md`, `README.md:453`, `AGENTS.md`, `skills/using-eventize/SKILL.md:118`, `skills/using-eventize/references/api-details.md:106-112`, `skills/using-eventize/references/migration.md:13-17,25-30`

**Interfaces:**
- Consumes: the behaviour from Task 1.
- Produces: nothing.

- [ ] **Step 1: Rewrite the changelog entry**

In `CHANGELOG.md`, replace the entry at line 11 with:

```markdown
- **`on()` and `once()` aggregate by listener identity.** A listener object — or a `(methodName, listenerObject)` pair — subscribed to the same event at the same priority is one registration, however many `on()` and `once()` calls produced it, and it is dispatched once per emit. The first dispatch discharges every pending `once()`; the registration survives while an `on()` still holds it. Up to `v5.1.0` the collapse happened in one registration order only, and the collapsed listener then fired on every emit and could not be released through its own handles. _Migration:_ where two calls were meant to produce two invocations, subscribe two distinct handlers. Function listeners are unaffected — they never aggregate.
```

At line 7, the summary names "`once()` no longer deduplicating" as one of the
two widest-reaching changes. Replace that clause with "`on()` and `once()`
aggregating by listener identity", and re-count the breaking changes in the
section; the number in that sentence must match what the list actually holds.

At line 44, the entry about retained events and deduplication needs the
exception: append one sentence — "A `once()` joining an existing registration is
the one case that still replays: its obligation is new even though the listener
is not."

- [ ] **Step 2: Rewrite `docs/migration.md`**

Retitle the section at line 86 to `### \`on()\` and \`once()\` aggregate by
listener identity` and rewrite its body to state the rule, the two affected call
shapes, and the grep pattern. It must carry both the pattern and the
replacement:

```markdown
Grep for a listener object subscribed with both calls on the same event:

```bash
grep -rn "once(.*,.*)" src | grep -v "once(.*function"
```

Two calls on one identity used to mean two invocations in one registration
order and one in the other. They now always mean one. Where two invocations
were the point, give the second subscription its own handler:

```js
// before — two invocations only if the on() came first
on(ε, 'ready', handlers);
once(ε, 'ready', handlers);

// after — two invocations in either order
on(ε, 'ready', handlers);
once(ε, 'ready', {ready: () => handlers.ready()});
```
```

- [ ] **Step 3: Rewrite `skills/using-eventize/references/migration.md`**

Delete the "Not fixed in v6" paragraph at lines 13-17 whole. Replace the
`**\`once()\` no longer deduplicates.**` bullet at lines 25-30 with the
aggregation rule in the same voice, including that both registration orders now
behave identically and that function listeners never aggregate. Keep the file
free of any path outside `skills/`.

- [ ] **Step 4: Rewrite the remaining reference docs**

- `skills/using-eventize/SKILL.md:118` — the numbered rule currently reads
  "Listener-objects dedupe under `on()`, functions never do, `once()` never
  does". It becomes: listener-object forms aggregate across `on()` and `once()`
  alike, functions never do.
- `skills/using-eventize/references/api-details.md:106-112` — rewrite the three
  paragraphs: the identity key is unchanged, `once()` now joins it, a joining
  `once()` still receives the retained replay while a joining `on()` does not,
  and the paragraph at line 112 about the known asymmetry is deleted.
- `docs/off.md:253-262` — the blockquote about `once()` never deduplicating
  becomes the aggregation rule, with the reference-counting section it sits in
  gaining the second counter.
- `README.md:453` — the note about de-duplication; keep the sentence about plain
  function listeners, replace the `once()` half.
- `docs/lifecycle.md` — check with `grep -n "once\|dedup" docs/lifecycle.md` and
  update every passage describing a `once()` handle as the thing that
  auto-unsubscribes. The store settles the obligation now; the handle only
  releases an undischarged one.

- [ ] **Step 5: Delete the backlog entry**

Remove `### \`on()\` deduplicates onto a pending \`once()\`` and its body from
`docs/backlog.md` (lines 18-36). It is done, not deferred.

- [ ] **Step 6: Update `AGENTS.md`**

Under "Known asymmetries", replace the two bullets that describe
reference-counted dedup as an `on()` property and `on()` deduplicating onto a
pending `once()` with one bullet stating the aggregation rule and the two
counters. Under "Architecture invariants", the paragraph on the two collaborators
gains the settlement rule: `callAfterApply` means "discharge pending one-shot
obligations", it runs inside the dispatch walk, and the drop routes through
`bucketForMutation()` like every other bucket change. The bullet about
unsubscribe handles keeps its single-shot reasoning and gains the settle
generation.

- [ ] **Step 7: Verify and commit**

```bash
npm run cbt
git add -A
git commit --no-gpg-sign -m "docs: record the on()/once() aggregation rule"
```

`cbt` covers the format check that the markdown edits have to satisfy.

---

## Verification

After Task 3, the whole change is one `npm run cbt` away from done. Two extra
checks worth making by hand:

```bash
grep -c '^declare class' lib/index.d.ts   # must print 1
grep -rn "noDedup\|subscribeToDeferred" src/ docs/ skills/   # must print nothing
```

The first pins the type boundary: only `Eventize` may appear as a class in the
published declarations. The second proves the old mechanism is gone from the
tree rather than merely unused.
