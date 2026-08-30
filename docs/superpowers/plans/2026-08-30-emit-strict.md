# emitStrict() / emitStrictAsync() Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `emitStrict()` and `emitStrictAsync()` — dispatch variants that serve every listener *and* hand the caller everything that failed — across all three API surfaces, shipped as `v6.2.0`.

**Architecture:** No new walk callback. The guarded pair `applyListenerSafe` / `dispatchGuarded` stays exactly as it is except for one line each: they report through `reportListenerThrow()`, which pushes into a module-level failure list when a strict frame is active and falls back to `warn()` when it is not. `emitStrict()` installs a fresh list around its dispatch (save-and-restore, so nesting is reentrant by construction), catches the dispatch's own throws — wildcard, corrupted bucket — into the same list, and applies the one-or-many rule: none returns, one is rethrown unchanged, several become an `AggregateError`. `emitStrictAsync()` does the same and then aggregates with `Promise.allSettled` on both levels, never throwing synchronously. `_emit()`, `_duckEmit()`, `EventStore`, `walk.ts` and `EventListener` are not touched.

**Tech Stack:** TypeScript (pinned `>=4.3 <7`), Jest + ts-jest, tsup, ESLint, Prettier. Zero runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-08-30-emit-strict-design.md` — read it before Task 1. It carries the reasoning and the rejected alternatives; this plan carries the steps. `ROADMAP.md`'s `emitStrict()` section carries the motivation and is deleted in Task 6.

## Global Constraints

- **Verification command is `npm run cbt`.** Clean → build → `typecheck` → `attw --pack` → `check:dts` → test with coverage → lint → format check. Run it before declaring any task done. It is also the only local run where `coverageThreshold` binds.
- **Never lower a coverage threshold to make a build pass.** New code gets covered instead.
- **`npm run clean` clearing the ts-jest cache is not optional.** Do not remove it from `cbt` to save time.
- **No issue identifiers anywhere in the repo** — not in code, comments, tests, test names, docs, specs or commit messages. Describe the thing; don't number it.
- **Relative imports carry no extension.** `tsup` writes the output extensions.
- **Never edit `lib/`.** It is generated and git-ignored.
- **Docs are English**, including this plan's outputs.
- **Version references in prose are `v5.1.0`, `v6.0.0`, `v6.1.0` or `v6.2.0`** — never anything between. "Since v6.2.0" for what this release introduces; `v6.1.0` is published (npm `latest`) and stays quotable.
- **`skills/using-eventize/` must stay self-contained.** It gets symlinked into a user's agent directory, so a path out of the folder resolves to nothing. Duplicating a paragraph from `docs/` is the correct trade.
- **`CHANGELOG.md` is a record, not an essay** — one to three lines per entry. Rationale belongs in a code comment beside the mechanism.
- **The wildcard rejection is an `Error`, not a `TypeError`.** `ROADMAP.md` says otherwise in three places and is wrong; `rejectWildcard()` in `src/utils.ts` is the authority. No spec case may assert `toThrow(TypeError)`.
- **The release version is `v6.2.0`.** `package.json` moves `6.1.0` → `6.2.0` in Task 6. **Do not run `npm run publish:pkg`** — publishing stays a separate, human-run step.

## File Structure

| File | Responsibility | Task |
| --- | --- | --- |
| `src/emit-api.ts` | modify: the failure slot, `reportListenerThrow()`, `collectedError()`, `emitStrict()`, `emitStrictAsync()`, save-and-restore in the two `emitSafe` variants | 1, 2, 3 |
| `src/emit-strict.spec.ts` | create: behaviour of `emitStrict()` / `emitStrictAsync()`, including nesting | 1, 2, 3 |
| `src/types.ts` | modify: `EventizeApi` gains two members | 4 |
| `src/eventize.ts` | modify: two loose aliases, two entries in `eventizeMethods`, the member count in three comments | 4 |
| `src/__test-utils__/expect2ImplEventizeApi.ts` | modify: `expect2ImplEventizeApi`, `ConformityApi`, the standalone `apiSurfaces` entry | 4 |
| `src/api-surfaces.spec.ts` | modify: the descriptor-shape case's member list, title and comments | 4 |
| `src/documented-quirks.spec.ts` | modify: a case for the new asymmetry | 4 |
| `AGENTS.md` | modify: lockstep rule, guard-placement rule, one new "Known asymmetries" entry | 6 |
| `CHANGELOG.md` | modify: new `v6.2.0` section | 6 |
| `package.json` | modify: `6.1.0` → `6.2.0` | 6 |
| `ROADMAP.md` | modify: delete the `emitStrict()` section | 6 |
| `README.md` | modify: doc index, API table, behaviour-families table, error-handling section | 7 |
| `docs/emit.md` | modify: four dispatch functions become six | 7 |
| `docs/retain.md` | modify: the guarded-write note covers the strict pair | 7 |
| `skills/using-eventize/SKILL.md` | modify: API surface table, behaviour families, the error pitfall | 8 |
| `skills/using-eventize/references/api-details.md` | modify: the dispatch section | 8 |

---

### Task 1: The collection frame and `emitStrict()` on the eventized path

**Files:**
- Modify: `src/emit-api.ts`
- Create: `src/emit-strict.spec.ts`

**Interfaces:**
- Consumes: `warnListenerThrew` (already in this module), `applyListenerSafe`, `_emit`, `isEventized`.
- Produces: `emitStrict(target, eventNames, ...args): void`, exported from `src/emit-api.ts` and therefore re-exported by `src/index.ts` through its existing `export * from './emit-api'`. Also the internal `collectedFailures` slot, `reportListenerThrow()` and `collectedError()`, which Tasks 2 and 3 reuse.

- [ ] **Step 1: Write the failing tests**

Create `src/emit-strict.spec.ts`. Copy the `jest.mock('./utils', …)` preamble from `src/emit-safe.spec.ts` verbatim — including its comment — because the nesting cases have to observe that `emitSafe()` inside a strict frame still reaches `warn()`.

Cases for this task (eventized path only):

```
describe('emitStrict()')
  it('runs every listener even though one threw')
  it('returns normally when nothing threw')
  it('rethrows a single failure unchanged')          // toBe on the error identity
  it('throws an AggregateError holding both failures in dispatch order')
  it('keeps priority order across a throwing listener')
  it('writes the retained value even though a listener threw')
  it('spends a once() queued behind a throwing listener')
  it('leaves a throwing once() subscribed, exactly as emit() does')
  it('does not warn — the failure goes to the caller, not the console')
  it('still rejects the wildcard name, with the error unchanged')
  it('dispatches the names ahead of a wildcard and then throws')
  it('aggregates a listener failure with a following wildcard rejection, in that order')
  it('collects a corrupted bucket rather than letting it bypass the report')
  it('leaves emit() untouched: a throw still aborts the dispatch')
```

Two of these are the ones that would silently not test what they claim, so write them precisely:

- **single failure unchanged** asserts identity, not message: throw a `const boom = new Error('boom')` and assert the caught error `toBe(boom)`. A `toThrow('boom')` also passes for an `AggregateError` whose message happens to contain it.
- **AggregateError order** asserts `err.errors` element identity, in dispatch order, and `err.errors.length === 2`.

For the corrupted bucket, reuse whatever `src/emit-safe.spec.ts`'s "does not swallow a corrupted bucket" case does to produce a hole (`storeOf()` from `./__test-utils__/listeners`), and assert the opposite outcome: the throw is *collected*, so a lone hole surfaces as that same `Error` unchanged, and a hole plus a listener failure surfaces as an `AggregateError`.

Run `npm test -- src/emit-strict.spec.ts` and watch every case fail on `emitStrict is not a function`.

- [ ] **Step 2: Implement**

In `src/emit-api.ts`, directly below `warnListenerThrew()`:

```ts
/**
 * The failure list of the innermost `emitStrict()` / `emitStrictAsync()` frame,
 * or `null` when no strict dispatch is running on this stack.
 *
 * A module-level slot rather than a parameter, and that is what keeps the
 * guarded callbacks module constants: a closure built per call would allocate
 * a JSFunction plus a context on every guarded emit and — worse — send a fresh
 * function identity through the one shared `fn(listener, a, b, c)` call site in
 * `walk.ts`, which is megamorphic by construction. A third callback identity
 * would be cheaper than that and still trimorphic, for a difference that exists
 * only inside a `catch`. So the callback stays one and the sink moves.
 *
 * Saved and restored rather than pushed and popped: a listener that emits
 * during a strict dispatch opens its own frame, and its failures belong to its
 * own call site. `finally` restores on every exit, so an unwinding frame leaves
 * nothing behind.
 *
 * Per module instance, like the counters in `EventListener.ts` — and harmless
 * for the same reason those two are: the slot and the callback that reads it
 * always come from the same module instance.
 */
let collectedFailures: unknown[] | null = null;

/**
 * Where a caught listener throw goes. Inside a strict frame it joins the
 * failure list the caller will receive; everywhere else it is reported through
 * `warn()` exactly as `emitSafe()` has always reported it.
 *
 * This indirection is the entire difference between the two guarded variants.
 * It sits in a `catch`, so it runs only when something already threw.
 */
const reportListenerThrow = (eventName: EventName, error: unknown): void => {
  if (collectedFailures !== null) {
    collectedFailures.push(error);
  } else {
    warnListenerThrew(eventName, error);
  }
};
```

Change `applyListenerSafe()`'s `catch` body to call `reportListenerThrow(eventName, error)`. Extend its doc comment by a sentence naming the sink — the existing paragraphs about `try` placement and the bimorphic cost stay exactly as they are, because neither changes.

Then the one-or-many rule and the function itself:

```ts
/**
 * The one-or-many rule, in one place because both strict variants apply it and
 * they must not drift: a single failure is handed back unchanged — same error,
 * same stack, no wrapping — so that replacing `emit()` with `emitStrict()`
 * leaves every existing `toThrow(…)` assertion intact. Only a second failure,
 * which `emit()` could never have produced, changes the shape.
 */
const collectedError = (failures: unknown[]): unknown =>
  failures.length === 1
    ? failures[0]
    : new AggregateError(failures, 'emitStrict(): one or more listeners failed');

export function emitStrict(…three overloads…): void;
export function emitStrict(
  target: object,
  eventNames: AnyEventNames,
  ...args: EventArgs
): void {
  const previousFailures = collectedFailures;
  const failures: unknown[] = [];
  collectedFailures = failures;
  try {
    if (isEventized(target)) {
      _emit(target, eventNames, args, applyListenerSafe);
    } else if (isDuckTarget(target)) {
      _duckEmit(target, eventNames, args, dispatchGuarded);   // Task 2
    }
  } catch (err) {
    // Not a listener's throw — the wildcard rejection or a corrupted bucket,
    // both raised outside `listener.apply()`. Under `emitSafe()` they leave the
    // call unguarded; here they join the same list, last, and the rule above
    // decides the shape. A lone wildcard therefore still throws the plain
    // `Error` a caller expects, and a wildcard behind failing listeners no
    // longer erases what the dispatch had already collected.
    failures.push(err);
  } finally {
    collectedFailures = previousFailures;
  }
  if (failures.length > 0) {
    throw collectedError(failures);
  }
}
```

The three overload signatures are `emitSafe()`'s with the name changed. The doc comment above them states the guarantee ("every listener runs *and* every failure reaches you"), the one-or-many rule, that retain is written and `once()` spent for the same reason `emitSafe()` does both, and that the guarded callback is shared with `emitSafe()` — so a program already calling `emitSafe()` pays nothing extra for this one.

Also in this step, give `emitSafe()` the save-and-restore:

```ts
  const previousFailures = collectedFailures;
  collectedFailures = null;   // a nested emitSafe() warns; it never feeds an
  try {                       // outer emitStrict() failures its caller never asked for
    …existing body…
  } finally {
    collectedFailures = previousFailures;
  }
```

`emit()` and `emitAsync()` are **not** touched. They never report, so they never read the slot, and a throw under a nested `emit()` correctly unwinds into whatever guard is above it.

- [ ] **Step 3: Verify**

`npm test -- src/emit-strict.spec.ts`, then `npm run cbt`. If ESLint flags `AggregateError` as undefined, check `eslint.config.mjs`'s globals set rather than adding a disable comment — `lib` is already `ES2022`, so the type side is settled.

---

### Task 2: The duck-typed dispatch path

**Files:**
- Modify: `src/emit-api.ts`
- Modify: `src/emit-strict.spec.ts`

The lockstep rule in `AGENTS.md` is the reason this is not folded into Task 1: both paths carry the behaviour or neither does.

- [ ] **Step 1: Write the failing tests**

Add to `src/emit-strict.spec.ts`, mirroring `src/emit-safe.spec.ts`'s `describe('on a non-eventized (duck-typed) target')`:

```
it('collects a throwing event-named method and keeps dispatching later names')
it('collects a throwing .emit() fallback')
it('rethrows a single duck-path failure unchanged')
it('aggregates two duck-path failures in dispatch order')
it('still rejects the wildcard name')
it('dispatches the names ahead of a wildcard and then throws')
it('does not warn on this path either')
```

- [ ] **Step 2: Implement**

`dispatchGuarded()`'s `catch` body calls `reportListenerThrow(eventName, error)`. That is the whole change — the `_duckEmit(…, dispatchGuarded)` branch was already written in Task 1's `emitStrict()`.

Extend `dispatchGuarded()`'s doc comment the way `applyListenerSafe()`'s was: same rule, same reason, same sink.

- [ ] **Step 3: Verify**

`npm test -- src/emit-strict.spec.ts`, then `npm run cbt`.

---

### Task 3: `emitStrictAsync()`

**Files:**
- Modify: `src/emit-api.ts`
- Modify: `src/emit-strict.spec.ts`

**Interfaces:**
- Consumes: everything Tasks 1 and 2 produced.
- Produces: `emitStrictAsync(target, eventNames, ...args): Promise<any[] | undefined>`.

- [ ] **Step 1: Write the failing tests**

```
describe('emitStrictAsync()')
  it('resolves the collected values exactly as emitAsync() would')
  it('resolves undefined when nothing was collected')
  it('rejects with a single rejected listener promise reason, unchanged')
  it('rejects with an AggregateError when two listener promises reject, in dispatch order')
  it('sorts a synchronous throw ahead of a later rejection')
  it('sees the rejections inside an array a listener returned')
  it('keeps the fulfilled slots out of the way: a failure means no result array')
  it('returns a rejected promise for a wildcard name instead of throwing synchronously')
  it('returns a rejected promise for a wildcard inside a name array, after dispatching the names ahead of it')
  it('reports no unhandled rejection while doing any of that')
  it('guards the duck-typed path too')
  it('restores the failure slot: a later emitSafe() warns again')
```

Two of these need care:

- **"instead of throwing synchronously"** must assert both halves: `expect(() => { promise = emitStrictAsync(ε, '*'); }).not.toThrow()` and then `await expect(promise).rejects.toBe(theError)`. Asserting only the rejection would pass for a function that throws synchronously inside an `async` wrapper — which this one is not, and the case exists to keep it that way.
- **unhandled rejections** uses the existing `unhandledRejectionsDuring()` helper from `./__test-utils__/unhandledRejections`, the same way `src/emit-safe.spec.ts` uses it.

- [ ] **Step 2: Implement**

```ts
/**
 * Splits `Promise.allSettled` results into the resolved array and the failure
 * list, positionally, so the report order is dispatch order rather than the
 * order promises happened to settle in. `values` is consulted only to tell an
 * inner-array slot from a plain one — an array slot was itself aggregated with
 * `allSettled`, so its result is fulfilled with a result array, never rejected.
 */
const splitSettled = (
  values: any[],
  results: PromiseSettledResult<any>[],
  failures: unknown[],
): any[] => { … };

export function emitStrictAsync(…three overloads…): Promise<any[] | undefined>;
export function emitStrictAsync(
  target: object,
  eventNames: AnyEventNames,
  ...args: EventArgs
): Promise<any[] | undefined> {
  const values: any[] = [];
  const returnValue = (val: unknown) => { values.push(val); };
  const previousFailures = collectedFailures;
  const failures: unknown[] = [];
  collectedFailures = failures;
  try {
    if (isEventized(target)) {
      _emit(target, eventNames, args, applyListenerSafe, returnValue);
    } else if (isDuckTarget(target)) {
      _duckEmit(target, eventNames, args, dispatchGuarded, returnValue);
    }
  } catch (err) {
    failures.push(err);
  } finally {
    collectedFailures = previousFailures;
  }
  if (values.length === 0) {
    return failures.length > 0
      ? Promise.reject(collectedError(failures))
      : Promise.resolve(undefined);
  }
  return Promise.allSettled(
    values.map((val: any) =>
      Array.isArray(val) ? Promise.allSettled(val) : Promise.resolve(val),
    ),
  ).then((results) => {
    const resolved = splitSettled(values, results, failures);
    if (failures.length > 0) {
      throw collectedError(failures);
    }
    return resolved;
  });
}
```

Three things the doc comment has to carry, because none of them is obvious from the code:

- **Why `allSettled` and not `Promise.all`.** `Promise.all` is fail-fast: of *n* rejections the caller sees the one that lost the race, and the other *n-1* reasons are gone — not unhandled, simply unreported. That is defensible for `emitSafeAsync()`, whose guard protects execution and where every listener has already run by the time any promise rejects. For a variant whose whole contract is "report everything" it is a hole: the synchronous half would collect four throws and re-raise all four while the asynchronous half discarded three rejections out of four.
- **Why `markCollectedAsHandled()` is not called here.** It exists because a mid-walk throw abandons already-collected promises and an abandoned rejected one takes the process down under Node's default. On this path nothing is abandoned: every collected value reaches `allSettled`, which owns it.
- **Why nothing is thrown synchronously.** A function that returns a promise should not also throw — `emitStrictAsync(…).catch(report)` is the idiomatic call in exactly the teardown this variant is for, and it cannot catch a synchronous throw. This is a deliberate asymmetry against `emitAsync()` / `emitSafeAsync()`; the entry in `AGENTS.md` is Task 6.

Also note the cost honestly, in the same comment: one result object per element, and the report waits for the slowest listener promise. `Promise.all` already waits that long for the success case.

Give `emitSafeAsync()` the same save-and-restore as `emitSafe()`, threaded through its existing `try`/`catch` with a `finally`.

- [ ] **Step 3: Verify**

`npm test -- src/emit-strict.spec.ts`, then `npm run cbt`.

---

### Task 4: The other two API surfaces

**Files:**
- Modify: `src/types.ts`, `src/eventize.ts`, `src/__test-utils__/expect2ImplEventizeApi.ts`, `src/api-surfaces.spec.ts`, `src/documented-quirks.spec.ts`
- Modify: `src/emit-strict.spec.ts`

Eleven members become thirteen.

- [ ] **Step 1: Write the failing tests**

- In `src/emit-strict.spec.ts`, add the two `describe.each(apiSurfaces)` blocks `src/emit-safe.spec.ts` ends with, one per variant: a throwing listener is collected and re-raised identically on all three surfaces.
- In `src/api-surfaces.spec.ts`, add `'emitStrict'` and `'emitStrictAsync'` to the member list of the descriptor-shape case, retitle it to thirteen, and update the two counting comments above the `describe`.
- In `src/__test-utils__/expect2ImplEventizeApi.ts`, add the two `it('.emitStrict()')` / `it('.emitStrictAsync()')` existence checks, the two `ConformityApi` members, the two loose aliases and the two entries of the standalone surface.
- In `src/documented-quirks.spec.ts`, add a case for the new asymmetry: `emitStrictAsync(ε, '*')` returns a rejected promise while `emitAsync(ε, '*')` and `emitSafeAsync(ε, '*')` throw synchronously. The three in one case, because the asymmetry *is* the comparison.

- [ ] **Step 2: Implement**

- `src/types.ts`: `EventizeApi` gains `emitStrict` and `emitStrictAsync`, three overloads each, copied from the `emitSafe` / `emitSafeAsync` blocks directly above them and placed next to them so the four guarded members read as a group.
- `src/eventize.ts`: two loose aliases (`emitStrictLoose`, `emitStrictAsyncLoose`) beside the existing ones, two entries in `eventizeMethods`, and the import line extended. Update the three comments that count members — "The eleven members, described once", "the same eleven names", "costs the same eleven function objects the eleven hand-written closures used to" — to thirteen.

- [ ] **Step 3: Verify**

`npm run cbt`. The conformity matrix is the point of this task: all three surfaces, both variants.

---

### Task 5: The performance confirmation

**Files:**
- Create: throwaway benchmark under the scratchpad directory. **Nothing in this task is committed** except the measured ranges, which go into a code comment in Task 6.

This is a confirmation, not a gate — the design deliberately adds no callback identity to the shared call site. What is being confirmed is exactly that: that the slot save-and-restore and the indirection in the `catch` cost nothing measurable.

- [ ] **Step 1: Build both variants**

```bash
BASE=$(git rev-parse v6.1.0^{commit} 2>/dev/null || git log --oneline | grep -m1 'prepare v6.1.0' | cut -d' ' -f1)
git worktree add /tmp/eventize-baseline "$BASE"
cd /tmp/eventize-baseline && npm ci && npm run build && cd -
npm run build
```

- [ ] **Step 2: Write the benchmark**

Reuse the v6.1.0 harness — `docs/superpowers/plans/2026-08-30-emit-safe.md`, Task 5, Step 2 — with one added workload:

- `emit-only` — never calls a guarded variant. Must stay inside the baseline's own spread.
- `mixed` — sends 1e5 `emitSafe()` calls through first, then times `emit()`. Must stay inside the baseline's *bimorphic* spread; this is the number the design claims not to move.
- `strict` — sends 1e5 `emitStrict()` calls through first, then times `emit()`. Recorded. If the design holds it lands on top of `mixed`, because the same two callbacks reached the call site.

Guard the new workload with `typeof emitStrict === 'function'` so the baseline build runs it as a plain `emit-only` cell rather than crashing.

- [ ] **Step 3: Run interleaved, then in the opposite order**

One variant per process, 1e6 dispatches to 64 listeners, 25 processes per cell, both orders. Two traps `walk.ts` records and this protocol avoids: loading two library variants into one process makes the call site polymorphic, and sequential runs put machine drift inside the comparison.

- [ ] **Step 4: Read the result**

- `emit-only` outside its baseline spread → something touched the unguarded path. Stop and find it; nothing in this design should.
- `mixed` outside the v6.1.0 bimorphic spread → make the save-and-restore conditional (`if (collectedFailures !== null)`) and re-measure before anything else is reconsidered.
- `strict` is recorded either way. Quote ranges across the 25 processes, never a single cell.

- [ ] **Step 5: Clean up**

```bash
git worktree remove /tmp/eventize-baseline
```

---

### Task 6: Version, changelog, the rules file and the roadmap

**Files:**
- Modify: `package.json`, `CHANGELOG.md`, `AGENTS.md` (`CLAUDE.md` is a symlink — edit only `AGENTS.md`), `ROADMAP.md`, `src/emit-api.ts`

- [ ] **Step 1: Record the measurement**

Put Task 5's ranges into the doc comment beside `reportListenerThrow()` — one variant per process, both workloads named, ranges not single values. Do not invent them; if Task 5 was skipped, this step is blocked.

- [ ] **Step 2: Bump the version**

`"version": "6.1.0"` → `"version": "6.2.0"` in `package.json`, and keep `package-lock.json` in sync (`npm install --package-lock-only`). **`npm run publish:pkg` is not run.**

- [ ] **Step 3: Add the changelog section**

At the top of `CHANGELOG.md`, above the `v6.1.0` section, one `## \`v6.2.0\`` heading with an `### Added` block. One to three lines per entry, no essay:

- the two functions, what they guarantee, all three surfaces;
- the one-or-many rule, single failure unchanged;
- retain written and `once()` spent, as with `emitSafe()`;
- `emitStrictAsync()` aggregates with `Promise.allSettled` and reports through the promise only — it never throws synchronously, unlike `emitAsync()` / `emitSafeAsync()`;
- the cost note: `emitStrict()` shares `emitSafe()`'s guarded callback, so it adds nothing to the process-wide surcharge documented in `v6.1.0`.

Nothing goes under `### Breaking` — this release adds only. `docs/migration.md` is therefore untouched.

- [ ] **Step 4: Update `AGENTS.md`**

Three edits, and no more:

- **"The dispatch paths in `emit` move in lockstep"** — the guarded/unguarded pair is now reached by four public entry points on each path. The rule text stays; the count and the naming of `emitStrict` join it.
- **"The guarded dispatch's `try` goes around `listener.apply()`"** — unchanged in substance, extended by the sink: where a caught throw goes is decided by `reportListenerThrow()`, which is what keeps the guarded callbacks a single pair. Say that a fifth variant belongs there too, not beside it.
- **"Known asymmetries"** — one new entry: `emitStrictAsync()` reports every failure through its promise and never throws synchronously, while `emitAsync()` and `emitSafeAsync()` throw on a wildcard name. Deliberate; changing the older two would be breaking, and their contract is not "report everything". Name where a consumer meets it (`docs/emit.md`) and where the mechanism is explained (the doc comment on `emitStrictAsync()`), per the file's own rule that it states rules and never behaviour.

Also extend the existing entry "A guarded dispatch writes the retained value, an aborted one does not" to name all four guarded functions rather than two.

- [ ] **Step 5: Delete the roadmap section**

Remove the whole `## emitStrict() — serve every listener *and* report what failed` section from `ROADMAP.md`, in this commit. The rule is explicit: a design that shipped is described by `docs/`, `CHANGELOG.md` and the specs, and a copy that outlives them is the second answer someone finds first. If that leaves `ROADMAP.md` with no proposals, keep the file and its preamble.

---

### Task 7: README, `docs/emit.md`, `docs/retain.md`

**Files:**
- Modify: `README.md`, `docs/emit.md`, `docs/retain.md`

- [ ] **Step 1: `docs/emit.md`**

The title and the opening table go from four functions to six. The table gains a third dimension in prose rather than a third column — the two axes are still "collects return values" and "what a throwing listener does", and the third value of the second axis is "is isolated and reported to the caller".

New section, between the guarded-dispatch section and the async half: **"When you need both halves"**, carrying the one-or-many rule with a runnable example, the retain/`once()` consequences (identical to `emitSafe()`, so state and cross-reference rather than repeat), and the caller-error rule — a lone wildcard still throws the plain `Error`, a wildcard behind failing listeners becomes the last entry of an `AggregateError`.

The async half gains the `allSettled` story: deterministic order, no partially-filled result array, and the promise as the only error channel with the `fetch()` precedent for why.

"Which one to reach for" gains a third entry: `emitStrict()` for a dispatch whose caller is contractually obliged to report — a teardown that must dismantle everything and then hand back everything that went wrong. And the surcharge paragraph gains one sentence: `emitStrict()` rides the same guarded callback as `emitSafe()`, so it does not deepen the cost, and a program calling either pays the same one step.

- [ ] **Step 2: `README.md`**

- the doc index line for `docs/emit.md` names all six;
- the API table gains `emitStrict` / `emitStrictAsync`;
- the behaviour-families table row that lists the duck-typing functions gains both, tagged `(v6.2.0)`;
- the error-handling section's "Two ways out" becomes three, with a short `emitStrict()` example and one line on what it throws.

- [ ] **Step 3: `docs/retain.md`**

The note that a guarded dispatch is a second catch site now covers four functions. One line, no new section.

- [ ] **Step 4: Verify**

`npm run cbt` (format check reaches `src/` only, but the build and the link-free prose still have to survive it), plus a read-through: no version number between `v6.1.0` and `v6.2.0`, no issue identifiers, no claim about which spec pins what.

---

### Task 8: The `using-eventize` skill

**Files:**
- Modify: `skills/using-eventize/SKILL.md`, `skills/using-eventize/references/api-details.md`

The folder must stay self-contained: no path out of `skills/`, and duplicating a paragraph from `docs/emit.md` is the correct trade.

- [ ] **Step 1: `SKILL.md`**

- the import line in the opening example gains both names;
- the API surface table gains two rows, with the return type column right (`void` and `Promise<any[] | undefined>`);
- the behaviour-families table row for duck-typing gains both;
- the error pitfall's "Two ways out" becomes three, and names the one that hands the error back.

- [ ] **Step 2: `references/api-details.md`**

Retitle the dispatch section to the six functions. Add the code line for each new variant, the one-or-many rule in one sentence, the never-throws-synchronously rule for the async twin, and the shared-callback cost note.

- [ ] **Step 3: Verify**

`npm run cbt`, then grep the skill folder for any path that leaves it.

---

### Task 9: The consumer check (optional, informative)

**Files:** none in this repo.

The whole feature exists for `@spearwolf/signalize`'s teardown. The integration harness can say whether it actually closes that hole.

- [ ] **Step 1:** `npm run test:integrations` for a baseline against the new build — a red baseline is a measurement, not a failure.
- [ ] **Step 2:** In a scratch checkout of signalize, swap the teardown's `emit(this, DESTROY, this)` for `emitStrict(…)` and run its `EffectImpl.destroy` suite. What the roadmap predicts: the two pinned tests stay green — one asserts the single `'listener boom'` throw, which the one-or-many rule hands back unchanged, the other asserts an `AggregateError` of four teardown failures, which is what `collect()` builds around it — while a second `'destroy'` listener now runs where it previously did not.
- [ ] **Step 3:** Whatever comes out, record it in the pull request description, not in this repo's docs. Nothing about signalize belongs in `AGENTS.md` or `CHANGELOG.md`.

---

### Final verification

- [ ] `npm run cbt` green from a clean tree.
- [ ] `git grep -n "emitStrict" ROADMAP.md` returns nothing.
- [ ] `git grep -nE "v6\.1\.[1-9]|v6\.2\.[1-9]"` returns nothing — no version between the published one and the prepared one.
- [ ] `git grep -nE "\b[A-Z]{3,4}-[0-9]{3}\b"` returns nothing — no issue identifiers.
- [ ] Coverage thresholds unchanged or raised, never lowered.
- [ ] `npm run publish:pkg` has not been run. Releasing is a human's call.
