# Backlog

Known, accepted, and deliberately deferred items. Everything here is a
decision that outlived the conversation that produced it — either because the
work was postponed on purpose, or because the current behaviour looks like a
defect and is not one.

This file replaces the temporary issue identifiers (`PERF-001`, `MEM-002`, …)
that earlier audit reports handed out. Those reports were point-in-time
snapshots and are gone; entries here are named for what they are and stand on
their own.

Close an entry by deleting it, and record the change in `CHANGELOG.md` if a
consumer can observe it.

## Deferred to the next major

### `off(ε, eventName, listenerObject)` unretains the whole event name

The form detaches one listener object's subscription to one event, and drops
that event's retained value *and* retain policy — even when a sibling listener
for the same name stays subscribed. The bulk `off()` forms were aligned with
the keeper in v6.0.0; this one was left alone.

**Deferred on purpose.** The branch is unchanged since the 4.0.0 functional
API, so code may already depend on it — reversing a `retain()` alongside the
detach is plausibly what a caller means by "detach this listener and reset the
event". Changing it is breaking, and v6.0.0 already carries enough of those.
Documented in `docs/lifecycle.md`.

### `Priority`'s legacy aliases

`AAA`, `BB`, `C` and `Default` are still on the `Priority` object and on
`EventizePriority`, marked `@deprecated` with a pointer at "a future major".
The current release *is* a major, so either drop them here or name a concrete
target version instead of deferring the announcement across another one.

## Open

### `Priority` is a mutable exported object

`Priority` is a plain object literal with no `Object.freeze()`, and
`EventizePriority` declares its members without `readonly`. A consumer can
write `Priority.Normal = 999`, and from then on every emitter served by that
module instance sorts differently — including emitters belonging to other
libraries that loaded the same package. `Object.freeze()` plus `readonly`
costs nothing at runtime and breaks no documented use; reads are unchanged and
writes were never API.

### `on(ε, [], fn)` subscribes to nothing, silently

An empty name array walks the array branch of `_subscribeTo()`, builds an
empty entry list, and hands back a valid unsubscribe handle for zero
registrations. No warning, no error. That is out of line with the rest of the
release: a non-dispatchable listener throws, a `NaN` priority throws, and both
warn first. A runtime-assembled name list that comes out empty is the way in.
A `warn()` line in the array branch would be enough; throwing would be
breaking.

### `eventize.inject()` overwrites existing members silently

`inject()` `Object.assign`s nine methods onto the target. An existing `on`,
`off`, `emit` or any of the others is replaced without a word — and existing
objects that already carry an emitter-ish surface are exactly what `inject()`
is for. A `warn()` per collision, in the wording of the package's other
warnings, plus a sentence in the README naming the overwrite as intended.

### The marker slot is `configurable`

`defineHiddenPropertyRO()` creates the `Symbol.for('eventize')` property with
`configurable: true`, so it can be `delete`d. The object then reads as
non-eventized while its listeners and retained values sit in collaborators
nothing can reach any more, and a later `on()` quietly builds a second, empty
set. Not a security concern — the symbol is reachable through `Symbol.for()`
anyway — but the function name promises read-only, which holds for the value
and not for the property's existence. `configurable: false` unless something
needs to remove the slot; `asEventized()`, the only caller, does not.

### Unreachable branches sit under the coverage threshold

Three spots stay uncovered, two of them provably unreachable.
`EventListener.apply()` tests `this.isCatchEmAll || this.eventName ===
eventName`, but `EventStore.forEach()` only ever yields listeners from the
emitted name's bucket plus the wildcard list, and `EventKeeper.replayTo()`
calls with the retained name — the condition is always true. The `args:
EventArgs = []` default is never needed by either caller, as the comment there
says. In `utils.ts` it is the `console.warn` / `console.log` selection and the
no-console fallback. Branch coverage runs a fraction of a point over its
threshold of 98, so the next dead branch fails `cbt` for a reason unrelated to
whatever change triggered it. Either reduce the reachable condition (with a
CHANGELOG line under Internal) or add `istanbul ignore` with a reason.

### The double-release guard has no spec of its own

`EventStore.release()` opens with `if (listener.isRemoved) return;`, which stops
an `on()` handle from decrementing a listener that some other route already
removed. Two cases in `EventStore.spec.ts` reach the line incidentally —
"replaces the named bucket when a listener unsubscribes mid-dispatch" and its
wildcard twin both fail if it is turned into a throw — but nothing asserts what
it buys, so deleting it leaves the suite green.

The reachable recipe: two `on()` calls with the same listener object share one
listener at `refCount = 2`; `off(ε, 'foo')` force-removes it through
`EventListener.detach()`, and calling both handles afterwards must leave the
count where it is. Assert `refCount` on the detached listener (grab it with
`latestListener()` before the `off()`), not `getSubscriptionCount(ε)` — the
subscription count is already zero either way, and the count staying put is the
whole point. Without the guard the two calls take it to zero and the second
runs `dropListener()` over a listener that is out of every bucket.

The parallel guard on the `once()` side, `releaseObligation()`'s
`if (obligation.settled) return;`, is covered: `EventStore.spec.ts` →
"releasing an already-settled obligation is a no-op".

### `tsconfig.json` sets no `noEmit`

`npm run typecheck` passes `--noEmit` on the command line instead. A bare
`tsc` — from an editor, a new script, a slip — writes JavaScript next to the
sources in `src/`, and `.gitignore` covers `lib`, `build`, `dist` and `types`
but nothing inside `src/`. `tsup` builds through esbuild and its own dts
pipeline, `ts-jest` compiles in memory; neither is affected by the flag.

### `format:check` only covers `src/**`

Both Prettier scripts are scoped to `src/**/*.{ts,js,json,md}`, which leaves
out every root document, all of `docs/`, `skills/`, `integration/` and the
config files — i.e. most of the prose in the repository. `cbt` reports
formatting as checked while the bulk of it is not. Widening the glob and
excluding through `.prettierignore` is the order that keeps a formatter
honest; do the one-off `format:write` as its own commit so the switch does not
mix with content changes.

### `typescript-eslint` runs without type information

The config pulls in `tseslint.configs.recommended`, not
`recommendedTypeChecked`, so every rule that needs the type checker is off —
`no-floating-promises`, `no-misused-promises`, `await-thenable`,
`no-unnecessary-condition`. The first two are squarely relevant to a library
whose API hands back promises from `emitAsync()` and `onceAsync()` that a
caller can drop on the floor. The `disableTypeChecked` block for `**/*.js` is
inert today and only makes sense once type-checked rules are on.

### CI hardening

Four small workflow items, none of them behavioural:

- `main.yml` grants `id-token: write` at workflow level, so the test job —
  which runs `npm ci` and third-party code from the dependency tree — carries
  the permission to request a publish identity token. Move it to the deploy
  job and give the test job `contents: read`.
- `dev.yml` declares no `permissions` block at all and inherits the repository
  default. It needs read access and nothing else.
- No workflow declares a `concurrency` group. Two quick pushes to `main` run
  two full pipelines into the deploy job; nothing but `publishPackage.cjs`'s
  registry check stands between them, and that is a check with a window, not a
  lock. Per-branch group with `cancel-in-progress: true` in `dev.yml`, same
  grouping with `cancel-in-progress: false` in `main.yml`.
- Published versions get no git tag and no GitHub release, so a registry
  version can only be traced back to a commit by date. Tag after a successful
  `publish:pkg` — and gate the tag step on whether the script actually
  published, since it exits early for `-dev` and for already-published
  versions.

## Accepted, not scheduled

### The integration harness stays manual

`integration/` builds the package, packs a tarball, installs it into
`@spearwolf/signalize` and runs that project's typecheck and tests, baseline
versus patched. It is wired into no pipeline: `npm run test:integrations`, by
hand, or not at all.

**This is the decision, not an oversight.** The run needs Docker and takes far
longer than the unit suite. If it is ever automated, it belongs in a workflow
of its own — push to `main`, `workflow_dispatch`, a nightly schedule — ahead
of the deploy job, not folded into the `cbt` matrix. A companion smoke test
that `require()`s `lib/index.js` would close the one gap the harness leaves:
signalize consumes the ESM build, so nothing in the run touches CJS at
runtime, and `attw --pack` checks type resolution rather than behaviour.

### TypeScript stays at 5.9

`ts-jest` compiles every spec and declares `typescript: ">=4.3 <7"`;
`typescript-eslint` is tighter still at `<6.1.0`. Both are hard blocks, not
warnings. Do not force past them with `--legacy-peer-deps`, `--force` or an
`overrides` entry — that trades a known state for one no part of the toolchain
has agreed to support. Re-check with `npm view <pkg> peerDependencies` before
trying again.

### Dev-dependency advisories and versions

`npm audit` reports advisories in the dev tree, rooted in
`npm-run-all`/`minimatch` and `esbuild`; `npm audit --omit=dev` reports none.
The package ships no runtime dependencies, so only CI runners are exposed.
`npm-run-all` has had no release since 2018 and carries the one advisory copy
that cannot be patched. `sinon` and `@types/sinon` sit a major behind.

All of this is held for a build-system reboot that is intended but not
scheduled.

### `_subscribeTo`'s argument heuristic is comment-structured

Which overload a call matches is decided by a chain of length and `typeof`
tests, and the mapping from branch to call shape lives only in comments. The
overload set in `types.ts` has to agree with it, and nothing enforces that —
which is why `AGENTS.md` requires the two to be changed together. A
declarative shape table checked against `SubscribeArgs` would make the mapping
mechanical. Large, and not urgent.
