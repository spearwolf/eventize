# Audit Backlog v5.1.0 — Design Decisions

**Source:** `audit.html` (2026-07-25, 35 findings, health score 39.5).
**Status:** approved 2026-07-25.
**Plan:** `docs/superpowers/plans/2026-07-25-audit-backlog.md`

The audit is the requirements document. This file records only the decisions
the audit left open, plus the phase cut that follows from them. Everything
else — finding text, locations, recommendations — stays in `audit.html`.

## The four open decisions

### 1. MEM-001 — `off(ε)` clears the keeper (breaking)

`off(ε)` and `off(ε, '*')` will clear `keeper.eventNames` and `keeper.events`
in addition to emptying the listener registry. The store is already wiped
completely in that path; the asymmetry has no justification and silently
retains payloads plus their replay-to-new-subscriber behaviour.

Rejected alternatives: keeping `off(ε)` listener-only and documenting the
asymmetry as intent (leaves the leak in place), and making `off(ε, name)`
value-only to match (breaks the retain-policy semantics documented in
v5.1.0).

This is a behavioural break and lands in **v6.0.0**.

### 2. MEM-002 — `once()` is exempt from listener dedup

`once()` registrations get their own `EventListener` instance instead of
collapsing into an existing similar listener with `refCount += 1`. Two
`once()` subscriptions therefore mean two firings, which matches both the
plain reading of `once` and the already-correct behaviour of function
listeners.

Rejected alternative: turning `callAfterApply` into a list so all handles
fire. It preserves the refCount collapse, which is the actual defect, and
keeps two `once()` calls resolving to one firing.

Behavioural break, lands in **v6.0.0**.

### 3. `retain()` with dynamically generated names is supported

Consequence: the keeper's cost must be inspectable and bulk-clearable from
outside. `getRetainedCount(ε)` and `getRetainedEventNames(ε)` become public
API alongside `getSubscriptionCount()`, and `unretain(ε, '*')` /
`retainClear(ε, '*')` get bulk semantics.

No eviction, no LRU, no size cap. An event library does not get to guess
what the caller still needs. `docs/retain.md` states the caller's obligation
instead.

### 4. Two releases

**v5.2.0** — everything non-breaking: the six verified defects that have no
contract behind them, the additive API, and all build, CI, test and doc work.

**v6.0.0** — the two semantic changes above, the deprecations, and the
remaining documentation.

## Wildcard handling — how BUG-001 and MEM-001 fit together

BUG-001 (`retain(ε,'*')` → stack overflow) and MEM-001 (bulk clear) both
touch `'*'` in the retain API. Handled in one pass in phase 1 so phase 3
does not have to undo anything:

| Call | v5.1.0 | v5.2.0 | v6.0.0 |
| --- | --- | --- | --- |
| `retain(ε,'*')` | crashes on later wildcard subscribe | throws | throws |
| `unretain(ε,'*')` | no-op | clears all retain policies + values | unchanged |
| `retainClear(ε,'*')` | no-op | clears all retained values | unchanged |
| `off(ε)` / `off(ε,'*')` | keeper untouched | keeper untouched | keeper cleared |

`retain('*')` stays an error because "retain everything" has no definable
meaning. The two bulk forms are additive — they replaced a no-op — so they
ship in the minor.

`EventKeeper.replayTo()` gets a defensive guard against `isCatchEmAll(name)`
in the catch-em-all branch regardless, so no future path can reintroduce the
recursion.

## Phase cut

| Phase | Content | Release |
| --- | --- | --- |
| 0 | Foundation: dead code, packaging, publish script, CI, coverage gate | — |
| 1 | Six verified defects + additive API + lifecycle spec | v5.2.0 |
| 2 | `strictNullChecks`, discriminated union, ESLint, `@ts-expect-error` | — |
| 3 | MEM-001, MEM-002, deprecations, `docs/lifecycle.md` | v6.0.0 |
| 4 | Dependency minors, then each major separately | — |

Phase 2 sits **behind** the v5.2.0 release, not in front of it: the six
verified defects should not wait on a type migration, and the discriminated
union is easier to build on corrected code. It ships with v6.0.0 as an
internal change with no user-facing surface.

## Deliberate extensions beyond the audit

- **BUG-002** is fixed for `LISTENER_IS_NAMED_FUNC` as well as
  `LISTENER_IS_OBJ`. `listenerObject[methodName]` can be missing exactly the
  same way, and fixing only one branch would create a fresh asymmetry.
- **MEM-006** field nulling is centralised in a new `EventListener.detach()`
  and applied to all three removal paths (`removeListenerFromArray`,
  `removeAll`, `removeByEventListener`), not just the two the audit names.

## Out of scope

- Keeper eviction / LRU (decision 3).
- `size-limit` in CI. A README line stating the bundle size is enough at
  zero runtime dependencies.
- Publishing the `lib/` artifact from the test job instead of rebuilding in
  deploy. `npm ci` closes the actual defect (BUILD-002); artifact hand-off is
  a separate improvement.
