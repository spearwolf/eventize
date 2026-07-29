# Design: one identity, one registration

Aggregating `on()` and `once()` for the same listener identity, so that the
order of registration stops deciding the behaviour.

## The defect

`EventStore.add()` guards deduplication on one side only. `once()` passes
`noDedup: true`, which means "I will not fold onto a foreign listener". It says
nothing about whether a later call may fold onto *this* one, and
`findSimilarListener()` compares listener type, priority, event name, `listener`
and `listenerObject` without ever asking whether the candidate ends its own
subscription after the first dispatch.

The result is an order-dependent emitter. With `h` the same listener object, the
same event name and the same priority:

```js
once(ε, 'foo', h); on(ε, 'foo', h);   // 1 registration, first emit calls h once
on(ε, 'foo', h); once(ε, 'foo', h);   // 2 registrations, first emit calls h twice
```

A one-sided guard on a symmetric relation is always an ordering bug.

The collapse is reachable only through the two dedup-eligible listener shapes,
`LISTENER_IS_OBJ` and `LISTENER_IS_NAMED_FUNC`, and only when priority and event
name match as well. A function listener never deduplicates.

## Goal

One listener identity on one event at one priority is exactly one registration,
whatever mixture of `on()` and `once()` produced it. It is dispatched once per
emit. The unsubscribe handles stay independent: each one releases what it
registered and nothing else.

This reverses the unreleased v6 decision "`once()` no longer deduplicates". That
change existed to escape a broken folding, in which the second `callAfterApply`
overwrote the first and the surviving handle could never release the listener.
The design below solves that properly instead of avoiding it, and no consumer has
ever seen either state: `6.x` is unpublished.

## Model

Lifetime moves onto the listener, where identity already lives.

```ts
class EventListener {
  refCount: number;   // persistent registrations from on(),  starts at 0
  onceCount: number;  // pending one-shot obligations from once(), starts at 0
  settleId: number;   // monotonic, +1 on every settlement
}
```

A listener stays in its bucket while `refCount + onceCount > 0`. That is the
whole lifetime rule. `isSimilar()` is unchanged and keeps deciding identity only.

## Registration

`store.add(listener, kind)` replaces `add(listener, noDedup)`, with `kind` being
`PERSISTENT` or `ONE_SHOT`. It searches for a similar listener in both cases and
increments the matching counter on whichever listener it returns, inserted or
found. The `noDedup` path disappears, and with it the asymmetry.

The replay rule in `registerEventListener()` gains one case:

```js
if (el === newListener || kind === ONE_SHOT) {
  keeper.replayTo(eventName, el, retainedEvents);
}
```

An aggregating `on()` still gets no replay, because the handler has already seen
that value (`src/retain.spec.ts:432`). An aggregating `once()` does, because its
obligation is new and would otherwise never be discharged. Without this, whether
a `once()` fires on a retained event would depend on the incidental existence of
an `on()` with the same handler, which is the same disease in a new spelling.

## Settlement

`callAfterApply` keeps its name and signature and changes meaning: not "release
this handle" but "a dispatch completed, discharge pending one-shot obligations".
The registration path installs it once per listener, when the first one-shot
obligation arrives.

```js
settleOneShots(listener) {
  if (listener.onceCount === 0) return;
  listener.onceCount = 0;
  listener.settleId += 1;
  listener.callAfterApply = undefined;
  if (listener.refCount === 0) this.dropListener(listener);
}
```

`dropListener()` is today's body of `removeByEventListener()` below the counter
check: splice through `bucketForMutation()`, `detach()`, drop an emptied bucket
from the map. It gets a name because it now has two callers.

Settlement runs inside `apply()`, hence inside a live `forEach()` walk. That is
what the held-count protocol exists for, and it is the path today's `once()`
already takes when its handle calls `off()` from `callAfterApply`. No new hazard,
but every bucket mutation must keep going through `bucketForMutation()`.

## Handles

`makeUnsubscribe()` captures the kind of registration and, for a one-shot, the
`settleId` at registration time. It releases through an internal path rather than
the public `off()`:

```js
release(listener, kind, settleId) {
  if (listener.isRemoved) return;
  if (kind === ONE_SHOT) {
    if (listener.settleId !== settleId) return;   // already discharged
    listener.onceCount -= 1;
  } else {
    listener.refCount -= 1;
  }
  if (listener.refCount + listener.onceCount === 0) this.dropListener(listener);
}
```

For a multi-event subscription, the handle captures one `settleId` per listener,
parallel to the listener array.

The `settleId` comparison is what keeps a spent `once()` handle from decrementing
a counter it no longer owns. Its hard case:

```js
const u1 = once(ε, 'foo', h);
on(ε, 'foo', h);
emit(ε, 'foo');        // u1 discharged, settleId = 1
once(ε, 'foo', h);     // new obligation, onceCount = 1, registered at settleId 1
u1();                  // 0 !== 1, inert; the new obligation survives
```

The existing single-shot guard stays: `makeUnsubscribe()` nulls its capture on
first call, so calling a handle twice remains inert. `isRemoved` covers handles
pointing at a listener that a targeted `off()` has already force-removed.

Public `off()` is untouched, force-removal included: `off(ε, 'foo', h)` consults
no counter and takes both of them with it.

Consequence: the `EventListener` branch of `store.remove()` and the
handle-direction of `off()`'s array branch lose their last internal caller. Since
v6 removed `.listener` from the handle, neither is reachable from consumer code,
so both are deleted rather than maintained. The `isEventName` filter in the array
branch stays, because the explicit `off(ε, [name, …])` form still needs it.

## Behaviour

Same listener object or same method-name pair, same priority, same event name:

| Case | today | after |
| --- | --- | --- |
| `once(h); on(h)` | count 1, emit calls once, `on()` survives | unchanged, but correctly counted |
| `on(h); once(h)` | count 2, first emit calls twice, then once | count 1, every emit calls once |
| `once(h); once(h)` | count 2, one emit calls twice | count 1, one emit calls once, then gone |
| `once(h); on(h)`, then `unsubOnce()` only | decrements a shared count, `on()` survives by luck | discharges the obligation, `on()` survives by rule |
| `once(h); on(h)`, emit, then `unsubOnce()` | decrements again and detaches the `on()` | inert via `settleId` |
| `on(h)` on a retained event, then `once(h)` | 2 calls, count 1 | unchanged (`src/retain.spec.ts:487`) |
| `once(h); once(h)` on a retained event | 2 calls, count 0 | unchanged: the first obligation is discharged before the second is made |
| different handlers, priorities, or function listeners | two registrations | unchanged |

The trigger case `once(h); on(h)` does not change observably. Order independence
arrives because `on(h); once(h)` catches up: both orders now produce the same
listener state, field for field.

## Affected code

- `src/constants.ts` — the two registration kinds.
- `src/EventListener.ts` — counters, `settleId`, `detach()`, the doc comment on
  `callAfterApply`.
- `src/EventStore.ts` — `add(listener, kind)`, `release()`, `settleOneShots()`,
  `dropListener()`, removal of the dead `remove()` branch.
- `src/subscribeTo.ts` — thread the kind, install the settle closure, the new
  replay rule.
- `src/eventize-api.ts` — `makeUnsubscribe()` captures kind and `settleId`,
  `once()` loses its `afterApply()` wiring.

`subscribeToDeferred()` becomes pointless once the closure is installed inside
`registerEventListener()`, ahead of the replay. Its only caller is `once()`. It is
folded back into `subscribeTo()` and deleted rather than left as a prop.

## Tests

New file next to `src/once.spec.ts`:

- the order matrix in both dedup-eligible spellings, `on(ε,'foo',obj)` and
  `on(ε,'foo','method',ctx)`, including the wildcard forms;
- the handle-independence table above, row by row;
- the `settleId` case: a new obligation registered after a settlement, released by
  neither the spent handle nor the wrong counter;
- a settlement that happens mid-dispatch, asserted against bucket identity and
  length (never against a plain array literal — a bucket carries an own symbol);
- aggregation across priorities and handler identities as the negative control.

Adjusted:

- `src/once.spec.ts` — the block from line 226 turns from "no dedup between
  `once()` registrations" into aggregation;
- `src/on_multiple_times.spec.ts` — three expectations and their comments;
- `src/EventStore.spec.ts:300` — `noDedup` no longer exists;
- `src/off.spec.ts:827` — comment and count;
- `src/retain.spec.ts:481` — comment only; the expectations stay green. The two
  issue identifiers in that comment come out, per the repo convention;
- `src/lifecycle.spec.ts:602` — see below.

The lifecycle case deliberately builds the chain handle → closure → listener →
`callAfterApply` → once-closure → emitter. The new `callAfterApply` captures the
store, not a handle, and the store holds no back-reference to the host, so the
chain may no longer be constructible at all. Analysis decides between rebuilding
the case around a different retaining shape and deleting it with a note. The
control group at line 623 stays either way; without it, a `collected` verdict
proves nothing.

## Documentation

- `CHANGELOG.md` — replace the "`once()` no longer deduplicates" entry in the
  `v6.0.0` (unreleased) section. Nothing to preserve; it never shipped.
- `docs/migration.md` and `skills/using-eventize/references/migration.md` — drop
  the "not fixed in v6" note, state the new rule with the affected call patterns.
- `docs/backlog.md` — delete the deferred entry at line 18.
- `AGENTS.md` — the "Known asymmetries" bullets on dedup and on handles, and the
  reference-counting paragraph.
- `skills/using-eventize/SKILL.md`, `references/api-details.md`,
  `docs/lifecycle.md`, `README.md` — the dedup passages.

## Risks

Settlement mutates a bucket a walk is stepping through, so `dropListener()` must
route through `bucketForMutation()`; a direct splice corrupts a running dispatch
and only shows up under nested emits. `refCount` changes meaning and several
specs read it directly, so every occurrence needs review, not only the ones that
turn red. Per `AGENTS.md`, run `npx jest --clearCache` before verifying, and
`npm run cbt` as the gate.

## Out of scope

`off(ε, eventName, listenerObject)` unretaining the whole event name stays as it
is, and so does the wildcard asymmetry between `retain()` and `emit()` on arrays.
Both are separate backlog entries.

## Amendment, 2026-07-29: the counting model above was replaced

Everything above this line describes what was *designed*, not what shipped.
Implementing the `refCount` / `onceCount` / `settleId` model surfaced a
documented behaviour the design never accounted for: `once(ε, ['foo', 'bar'],
handler)` has always removed the listener after the **first** of those names
to fire, pinned by two cases in `src/once.spec.ts`. A per-listener counter has
no way to express that race — `onceCount` lives on one listener, and a
multi-name call registers one listener per name. Hanging a group hook off the
single `callAfterApply` slot to reach the siblings would have reintroduced
exactly the registration-order dependence this whole change exists to remove.

A human ruled that the race semantics stay, so the counting model was
**replaced**, not extended, before implementation: `onceCount`, `settleId` and
the three `REGISTER_*` symbols the design above describes do not exist in the
shipped code. In their place, one `once()` call creates one `OnceObligation`
object (`{settled, members, sequence}`) that every listener the call registers
shares — a multi-name call pushes the *same* obligation onto each of its
listeners, so discharging it from any one of them discharges it for all. A
listener carries `refCount` (unchanged, for `on()`) plus a lazily-created
`onceObligations: OnceObligation[] | undefined` (for every `once()` riding on
it), and is alive while `refCount > 0 || onceObligations !== undefined`.
Settlement stamps each obligation with a `sequence` at creation and compares it
against a watermark `EventListener.apply()` reads before dispatching, rather
than trusting a count or an array position — both of which a mid-dispatch
release or force-removal can invalidate. See `AGENTS.md`, "Two collaborators
per emitter" and the "Known asymmetries" aggregation bullet, and
`src/EventListener.ts` for the mechanism as built.
