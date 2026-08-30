# ROADMAP

Ideas that have earned a place in a future version, with the reasoning that got
them here. Nothing in this file is a commitment to a version or a date —
what ships, and what it is called, stays a human's call (`AGENTS.md` →
"Versioning right now").

## `emitStrict()` — serve every listener *and* report what failed

**Status:** proposed, not implemented. Motivated by a real consumer gap, see below.

### The gap

Since v6.1.0 a caller picks between two dispatches, and neither offers both
halves of what a teardown needs:

| | every listener served | failure reaches the caller |
| --- | --- | --- |
| `emit()` | no — the first throw ends the dispatch | yes, unchanged |
| `emitSafe()` | yes | no — `console.warn` only |

`emitSafe()` buys execution by spending the error. That is the right trade for
a broadcast nobody is waiting on. It is the wrong one for a dispatch whose
caller is contractually obliged to report: the call returns normally, and the
error is now in a console line that no `catch` can reach.

There is no third option, and the missing one is not exotic. It is the shape a
teardown wants: dismantle everything, then hand the caller everything that went
wrong.

### The consumer that ran into it

`@spearwolf/signalize` tears down effects, links and signal groups with

```js
collect(errors, () => emit(this, DESTROY, this));
// … three more steps, each collected …
throwCollectedErrors(errors, 'destroying an effect');
```

`collect()` isolates each teardown *step* from the others, so a throwing
`DESTROY` listener no longer costs the cleanup callback its run. What it cannot
isolate is the listeners of one emit against each other. Measured against
signalize `1.0.0-beta.0`:

```
group.clear(), two 'destroy' listeners, the first throws
→ second listener called: 0 times
```

The library's own JSDoc promises that a throwing `DESTROY` listener does not
abort the teardown. True for the teardown; not true for that listener's
siblings.

Swapping in `emitSafe()` there closes exactly that hole and breaks two pinned
tests in `src/EffectImpl.destroy.spec.ts`: one asserts `effect.destroy()` throws
`'listener boom'`, the other asserts an `AggregateError` whose four entries
begin with that same failure, in teardown order. Both go red because the error
never leaves the emit. So the consumer has a choice between two defects and
picks the one its tests describe.

### Why it cannot be fixed in the consumer

signalize solves the same problem on its *own* queues by catching inside the
listener it owns (`EffectImpl[RECALL]`), parking the failure, and re-raising it
once the delivery is complete. That works because it wrote the listener.

`emit(this, DESTROY, this)` dispatches to **foreign** listeners. There is no
place for the consumer to put a `catch`, and no way to recover the error
afterwards: a `try` around `emitSafe()` catches nothing, because nothing is
thrown any more, and eventize hands out no listener list — `getSubscriptionCount()`
and `getSubscribedEventNames()` answer counts and names, not callables. The
missing return path only exists inside the dispatch loop, so only eventize can
open it.

### The name

`emitStrict()` / `emitStrictAsync()`. Settled, and the alternatives are on
record because the reasoning outlives the choice: `emitGuarded()` was the
working title and is wrong, because `guarded` is already this repo's internal
word for what `emitSafe()` does (`dispatchGuarded`, and AGENTS.md's "guarded
and an unguarded variant") — a public `emitGuarded()` next to `emitSafe()`
would make one word mean two things a paragraph apart. `emitCollected()`
describes the mechanism rather than the contract, and `emitComplete()` reads
as a lifecycle hook.

`strict` names what the caller gets: nothing is dropped. Not the execution of a
listener, and not the report of a failure.

### Proposed API

Three overloads each, matching `emit()` / `emitSafe()` exactly:

```ts
declare function emitStrict<TEvents extends EventMap, K extends EventKeysOf<TEvents> | symbol>(
  obj: EventizedObject<TEvents>, eventName: K, ...args: ArgsFor<TEvents, K>): void;
declare function emitStrict<TEvents extends EventMap, K extends EventKeysOf<TEvents> | symbol>(
  obj: EventizedObject<TEvents>, eventNames: K[], ...args: ArgsFor<TEvents, K>): void;
declare function emitStrict<T extends object>(
  obj: NonTypedEmitter<T>, eventNames: AnyEventNames, ...args: EventArgs): void;
```

plus the standalone/`inject`/`class Eventize` surfaces every other emit variant
carries, and an `emitStrictAsync()` twin.

Behaviour:

- **Every listener runs.** Same guarantee as `emitSafe()`, drawn in the same
  place — the `try` goes around `listener.apply()` and not inside it, so a
  throwing `once()` stays subscribed exactly as it does under `emit()`.
- **Failures are collected in dispatch order and re-raised after the last
  listener returns.** None → normal return. One → rethrown unchanged, so the
  common case keeps the exact error the listener threw. Two or more →
  `AggregateError` holding them in dispatch order.
- **Retain is written and `once()` is spent**, for the same reason `emitSafe()`
  does both: the event *was* delivered.
- **The wildcard joins the collection instead of pre-empting it.** `'*'` as a
  name is still a caller error and still ends the dispatch — the names after it
  in an array do not run. What changes against `emit()` is only that the names
  *before* it have already collected their failures, and those are not thrown
  away: the `TypeError` enters the same list, last, and the one-or-many rule
  above decides the shape. A lone wildcard therefore still throws the plain
  `TypeError` a caller's `toThrow()` expects.

The single-error-unchanged rule is worth more than it looks. It is what lets a
consumer replace `emit()` with `emitStrict()` without rewriting a single
`toThrow('listener boom')` assertion — the behaviour only changes once a
*second* listener fails, which under `emit()` could not happen at all.

### `emitStrictAsync()`: `allSettled`, and one error channel

Two decisions, and they are the same decision seen from two sides: **nothing a
listener does gets lost, and everything the caller has to handle arrives
through the promise.**

**Why `Promise.all` is the wrong aggregation here.** `emitAsync()` and
`emitSafeAsync()` collect every non-nullish listener return value and hand the
lot to `Promise.all`, which is fail-fast. Two consequences follow, and neither
is a defect there:

- Of *n* rejected listener promises the caller sees exactly one — whichever
  rejected **first in time**, not first in dispatch order. The other *n-1*
  reasons are gone. They are not unhandled rejections (`Promise.all` attaches a
  handler to every element, so it owns them all), they are simply unreported.
- One level down it repeats. A listener may return an *array* of promises,
  which the aggregation unwraps with an inner `Promise.all`. So a listener that
  returns `[p1, p2]` where both reject reports only `p1`'s reason, before the
  outer aggregation has even seen it.

For `emitSafeAsync()` that is defensible and documented: the guard exists to
protect *execution*, and by the time any promise rejects every listener has
already run synchronously. A rejection prevents nothing.

For a variant whose entire contract is "report everything", it is a hole. The
sync half would collect four listener throws and re-raise all four, while the
async half quietly discards three rejections out of four.

**So `emitStrictAsync()` aggregates with `Promise.allSettled`, on both levels**
— the outer collection and the inner array unwrap. It then splits the results:

- every `fulfilled` value keeps its slot and forms the resolved array, exactly
  what `emitAsync()` would have resolved to;
- every `reason` joins the failure list built by the synchronous guard.

Three things fall out of that, and they are why this shape is worth its cost:

- **The failure order becomes deterministic.** `Promise.all` reports whoever
  lost the race; `allSettled` returns results positionally, so the rejections
  come back in the order the listeners were dispatched in. Sync throws first
  (they all happened before any promise settled), then the rejections in
  dispatch order. Same rule as the sync variant, extended over time rather than
  redefined.
- **The partially-filled result array stops being a question.** If anything
  failed, the promise rejects and there *is* no result array — so no one has to
  decide what a slot holds whose inner array half-rejected. Success resolves a
  complete array or `undefined`; failure resolves nothing at all.
- **`markCollectedAsHandled()` is no longer needed on this path.** It exists
  because a mid-walk throw abandons the values already collected, and an
  abandoned rejected promise is an unhandled rejection that takes the process
  down under Node's default. On the strict path nothing is ever abandoned:
  every collected value reaches `allSettled`, which owns it.

The cost is real and small: `allSettled` allocates one result object per
element, and a rejection is reported only once the *slowest* listener promise
has settled. A hung listener promise therefore delays the error report
indefinitely — which `Promise.all` already does for the success case, so this
extends an existing property rather than introducing one.

**The returned promise is the only error channel.** `emitStrictAsync()` never
throws synchronously — not for a wildcard name, not for a foreign protocol
marker, not for a corrupted bucket. All of it rejects instead, through the same
one-or-many rule the sync variant uses.

The reasoning is the one the platform already settled: a function that returns
a promise should not also throw, because a caller cannot handle both with one
construct. `await emitStrictAsync(…)` inside a `try` catches either — but
`emitStrictAsync(…).catch(report)` catches only the rejection, and that is the
idiomatic call in exactly the place this variant is for: a teardown that fires
the event, collects, and does not block on it. `fetch()` rejects on a malformed
URL rather than throwing for the same reason.

It also dissolves the awkward case rather than answering it. Under
`emitStrictAsync(ε, ['a', '*', 'b'])` the listeners of `'a'` have already
collected their failures when the wildcard is rejected; with a synchronous
throw the collection is lost and the promise never forms. Through the promise
channel there is nothing to decide: the `TypeError` is the last entry in the
list, and the caller gets an `AggregateError` holding what actually happened.

This is a deliberate asymmetry against `emitAsync()` and `emitSafeAsync()`,
which do throw synchronously on a wildcard and keep doing so — changing them
would be breaking, and their contract is not "report everything". When this
lands it needs an entry under AGENTS.md → "Known asymmetries", a note in
`docs/emit.md`, and a spec that pins `emitStrictAsync(ε, '*')` returning a
rejected promise rather than throwing.

### Implementation sketch

The existing shape already has the seam. `_emit()` and `_duckEmit()` take the
guard as a callback parameter (`ApplyListenerFn`), and `emitSafe()` differs from
`emit()` only in passing `applyListenerSafe` / `dispatchGuarded` instead of
`applyListener` / `dispatchToTarget`. A third pair slots in beside them without
forking the wildcard rejection, the `internals` accumulator or the hole-skipping
loops.

The one thing the collecting guard needs and the two existing ones don't is
state. A closure allocated per call would give it that, at the price of an
allocation on every dispatch and a fresh function identity at the `fn(listener,
a, b, c)` call site in `walk.ts`. The cheaper shape is a module-level slot with
save-and-restore around the dispatch, which keeps the guard a stable module
constant. Restore rather than a stack, and reentrant by construction: a listener
that emits during a guarded dispatch opens its own frame, and its failures
belong to *its* call site. signalize's `collect-errors.ts` implements precisely
this and is worth reading before writing it a second time.

For the async twin the wildcard rejection has to reach that same list rather
than unwind, so `_emit()`'s own `rejectWildcard()` throw is caught by the
`try` already wrapped around the dispatch in `emitStrictAsync()` and appended
there — the collection is in the module slot at that moment, so it is still
reachable. Nothing in `_emit()` changes.

### The cost, and the condition attached to it

`applyListenerSafe`'s doc comment measures what the second guard already cost:
once anything in a process calls `emitSafe()`, the shared call site in
`walkBucket()` / `mergeWalk()` goes bimorphic and every `emit()` in that process
pays roughly +29% — about 126 ns on a 64-listener dispatch, with non-overlapping
ranges. That surcharge is process-wide, not per-emitter.

A third guard makes the same site trimorphic. Nothing in the v6.1.0 measurement
predicts what that costs; V8's inline-cache behaviour is not linear in the
number of shapes, and the step from bimorphic to trimorphic is the one that
usually hurts. **Measure it before committing to the design**, with the same
methodology the bimorphic number used (one variant per process, 1e6 dispatches
to 64 listeners, 25 processes per cell, interleaved and re-run in the opposite
order). If the trimorphic penalty lands anywhere near the bimorphic one, the
callback-parameter seam is the wrong place for this variant and a duplicated
dispatch loop — paid for in source, not in every `emit()` — becomes the better
trade.

### Open questions

- **The trimorphic measurement above**, which gates the implementation shape and
  nothing else: the API and its semantics stand either way.
- **Whether `emitStrict()` earns a `retain`-style surface on `class Eventize`
  and `inject()` from day one**, or ships standalone first. Every other emit
  variant carries all three, so the answer is probably "all three", but the
  three surfaces are three more call sites for a variant that has not yet
  proven itself in a consumer.
