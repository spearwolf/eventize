# AGENTS.md

Canonical guide for coding agents in this repo. `CLAUDE.md` is a symlink to this file — edit only this one.

`@spearwolf/eventize` makes any JS/TS object a **synchronous** event emitter. Zero runtime deps, ESM + CJS, opt-in typed event maps. All development happens in `src/`; `lib/` is build output.

## Versioning right now

`package.json` carries **`6.0.0-dev`**. The registry is on `v5.1.0` — no `6.x` has ever been published, and the `-dev` suffix is what keeps it that way: `scripts/publishPackage.cjs` exits before `npm publish` for any version ending in `-dev`. **Do not drop the suffix, and do not bump the version.** Releasing is a human's call.

Two consequences:

- **Everything unreleased goes under `## \`v6.0.0\` (unreleased)` in `CHANGELOG.md`** — one section, no new version headings above it. A change that would ordinarily demand a major only widens what that section already carries; nothing inside it can break a consumer who has never had a `6.x`.
- **Version references in prose are `v5.1.0` or `v6.0.0`, never anything between.** "Since v6.0.0" for what this release introduces, "up to v5.1.0" for what it replaces. The intermediate versions reached nobody, and naming one sends a reader looking for an upgrade path that does not exist.

## Verification

`npm run cbt` — clean → build → `typecheck` (`tsc --noEmit`) → `attw --pack` → test with coverage → lint → format check. Run it before declaring a task done.

Two things about it worth knowing:

- **`typecheck` is the only type check that reads *every* source file.** esbuild (the JS bundle) never type-checks and `attw --pack` only checks that already-emitted declarations resolve — but tsup's dts pass *does* type-check, and fails the build on a semantic error anywhere reachable from `src/index.ts`. What it never sees is the rest of `src/`: the specs and `src/__test-utils__/`. `tsc --noEmit` against `include: ["src"]` is what reads those too.
- **`cbt` is the only local run where `coverageThreshold` binds** — it runs `test:coverage`. Bare `npm test` collects no coverage on purpose, so a narrow loop over one spec file doesn't fail a global threshold. CI runs `cbt` too, so the threshold is enforced in exactly one place. Raise the numbers when coverage rises; never lower them to make a build pass.

Narrower loops: `npm test -- src/once.spec.ts`, `npm test -- -t "retains the last value"`, `npm run watch`.

**`npm run clean` clears the ts-jest cache too, and that is not optional.** Besides `lib/`, `build/`, `dist/`, `types/`, `tmp/` and `coverage/` it runs `jest --clearCache`, because ts-jest's transform cache lives outside the repo — `/tmp/jest_rs` on Linux — and used to survive every clean, every `npm ci` and every `cbt`. A stale cache serves previously compiled output and hides type errors a fresh checkout hits immediately; it once produced a green `cbt` for a change that broke 13 of 25 spec suites, and the breakage survived two reviews because both trusted the green bar. `cbt` runs `clean` first, so the gate can no longer be passed by a cache. Don't take it back out to make `cbt` faster — the seconds it costs are the seconds that bought that bug.

**`typecheck` and the test compile don't use the same module resolution.** `tsc` honors `tsconfig.json` (`module: esnext`, `moduleResolution: bundler`); ts-jest forces `module: commonjs` and, because `bundler` only pairs with `commonjs` on TypeScript ≥ 6, silently substitutes `node10`. They agree only because every import in `src/` is relative and extension-free. A `nodenext`-style subpath import or a `paths` remap would break that, and `typecheck` passing would stop guaranteeing the test compile does.

**TypeScript is pinned below 7, on purpose.** `ts-jest` compiles every spec and peers on `typescript: ">=4.3 <7"`; `typescript-eslint` caps at `<6.1.0`. Check both with `npm view <pkg> peerDependencies` before retrying, and do not force past a real peer conflict with `--legacy-peer-deps`, `--force` or an `overrides` entry — that trades a known state for one nothing in the toolchain has agreed to support.

## Change rules

What the library does is stated in `docs/`, in `skills/using-eventize/` and in the specs, and the reasoning behind each mechanism sits in a doc comment beside it. What follows is only the part that lives nowhere else: decisions that look like defects, things that were tried and reverted, and the places where a plausible edit breaks something no test names. Each entry says where the reasoning is, and does not repeat it.

**The internals boundary.** The eventized marker is a property keyed by `NAMESPACE` (`Symbol.for('eventize')`) holding `{protocol, keeper, store}`, and that hidden slot _is_ the definition of an emitter. In the types the slot is opaque: the real shape lives in `src/internals.ts`, which `src/index.ts` does not re-export, and every reader that wants that shape back out of the slot goes through `readMarker()` — which holds **the one cast** this boundary costs. Two doors stand on it and only two: `readMarker()` reads and asks nothing, `internalsOf()` adds the protocol compare and is the only one that hands out an `EventizeInternals`. A second cast naming a field of the payload means the boundary is drawn in the wrong place and belongs redrawn, not patched. What is not that cast, and stays allowed: a probe *onto* the slot whose result reads as `unknown` — `isEventized()` asks whether anything is there and declares nothing a renamed field could invalidate. `npm run check:dts` enforces the consequence: `Eventize` is the only class the published declarations may carry. Reasoning: `src/internals.ts`, `src/asEventized.ts`, `src/constants.ts`.

**`EventStore` clone-on-mutate.** `forEach()` walks the live buckets; the protection sits on the mutating side. Five rules hold it up. The first four were each paid for once; the fifth arrived with the index that needs it, before anyone had the chance to:

- **Every array that can become a bucket is born in `createBucket()`**, the clone included. A hand-rolled `slice(0)` arrives without the held-count field, reads as *held*, and buys one copy it does not owe — which installs a well-formed clone and hides the mistake for good.
- **Route every content change through `bucketForMutation()`, and call it only once a mutation is certain.** Splicing a live array directly makes a mid-dispatch subscription visible to the running emit again; calling it speculatively is the opposite failure, because "identity changed" then stops meaning "the registry changed" and the specs that measure clone counts stop measuring anything.
- **The truncation exception.** `removeByEventName()` and `removeAllListeners()` let go of a bucket rather than changing it, and both skip the courtesy `length = 0` while a walk is stepping through that very array. Cloning a bucket in order to truncate the clone and drop it would be theatre — don't "fix" these two into the routed path.
- **Compare buckets by identity and length.** The held count rides on a module-private symbol, which `Object.keys()` and array spread do not see but `Reflect.ownKeys()` and Jest's `toEqual` / `toStrictEqual` do, so a bucket never equals a plain array literal. The dedup index rides on a second one.
- **Every splice is paired with the dedup index**, and the two halves fail differently. A missing `indexAdd()` after an insert stops the next identical subscription from aggregating, which is a count and dispatch error several spec files report at once — and, since identity removal was rerouted through the same index, it also stops `off()` on that subscription from finding anything to remove. A missing `indexRemove()` — it belongs ahead of the `detach()` that follows a removal, which nulls the slot the entry is keyed by — breaks no dispatch and no count, so almost nothing goes red; what it leaves behind is the consumer's own object, held by an emitter they have unsubscribed from.

Two reading doors, deliberately different: `getListenersForEventName()` creates a bucket lazily and hands out a live reference, `peekListeners()` creates nothing and promises no mutation through its return type. Neither promises the reference stays fresh — one held across a mutation may be the pre-clone array. Keep `forEach()` small: it sits at TurboFan's inlining budget, so anything added there is paid on every dispatch, including those that never reach the new code. Reasoning: `src/bucket.ts` (bucket lifetime and the stand-ins), `src/dedupIndex.ts` (the index and its pairing rule), `src/walk.ts` (both walks) and `src/EventStore.ts` (the register), throughout.

**Three API surfaces, one implementation** (`eventize-api.ts`, `emit-api.ts`, `retain-api.ts` → `eventize.ts`). Standalone functions, `eventize.inject(obj)` methods and `class Eventize` all delegate to the same `on`/`emit`/`off`. Never fork logic into a surface. `class Eventize` declares no members of its own — a method in the class body wins over the inherited one, which is exactly how the class surface came to accept event names the map never declared.

**The two dispatch paths in `emit` move in lockstep.** `_emit` handles eventized targets, `_duckEmit` non-eventized ones. Both must reject `'*'`, both must funnel return values through the same `returnValue` callback, and both must resolve the event-named member through `dispatchableMember()` rather than reading `target[eventName]` raw. A path that skips one of the three makes `emitAsync` aggregate differently on the two sides. Reasoning: `src/utils.ts`.

**`subscribeTo` and `types.ts` move in lockstep.** Changing the API means changing `SubscribeArgs` _and_ the positional decoding in `_subscribeTo()`. A new listener shape is added in `detectListenerType()`, not at the call site, or it is rejected before it reaches a listener instance. The priority check is `Number.isNaN`, never `Number.isFinite` — `Priority.Max` / `Priority.Min` are `±Infinity`. Each branch names the `SubscribeArgs` arms it decodes; nothing enforces that, the naming only shortens the distance between a change and the place it has to be mirrored.

**`isBulkRemoval()` mirrors `EventStore.remove()`'s _effective_ array behaviour, not its condition.** The store forwards each element back into itself with a null listener object, so one nullish element lands in the wipe-everything branch. Anything else deciding "is this argument bulk?" has to reproduce that, not merely test for `'*'`.

**The retain write stays after the dispatch.** That is what keeps a throwing listener from destroying the previously retained value. Its ordering consequence for nested emits is a documented quirk, not an accident — see `docs/retain.md`.

**An unsubscribe handle keeps emitter and listener in one slot**, nulled together, and the nulled capture doubles as the consumed flag. A separate boolean would leave the emitter in the closure of every kept handle, which is the leak this design exists to prevent. An emitter subscribed to itself parks the back-reference in a different slot per spelling — `listener` for `on(ε, 'foo', ε)`, `listenerObject` for `on(ε, 'foo', 'method', ε)` — so a release that clears one field and not the other frees some of those and leaks the rest.

**Counters are per module instance.** `EventListener.lastId`, `EventKeeper.nextOrderId` and `nextObligationSequence` are module-global. The first two are safe that way, because every comparison they feed stays inside one emitter. The third is not: the marker is realm-wide, so a store from one module instance can receive a listener built by the other, and an obligation stamped by a foreign counter never satisfies `sequence < watermark` — a `once()` that fires on every emit instead of settling once. **Loading the ESM and the CJS build against the same eventized objects is unsupported for exactly this reason**, and the protocol check cannot catch it: both builds of one version carry the same `PROTOCOL_VERSION`. Reasoning: `src/EventListener.ts`, at the obligation counter.

### Known asymmetries

Verified, deliberate, and each one looks like a bug. Don't "fix" any of them without a `CHANGELOG.md` entry. The behaviour itself is documented where a consumer meets it — `docs/off.md`, `docs/retain.md`, `docs/lifecycle.md` and the `using-eventize` skill; what is recorded here is only that it is intended.

- **No recursion guard.** `A → B → A` forwarding and same-event re-emission overflow the stack by design. v4.2 shipped a guard, it forbade legitimate patterns, and it was reverted — don't build it again.
- **`off(ε, eventName, listenerObject)` unretains the whole event name**, value and policy, while detaching only that one listener object's subscription. Intended API rather than a defect held back for a major: the call means "detach this listener object and reset the event". Unchanged since the 4.0.0 functional API and not scheduled to change. The array sibling `off(ε, [eventName, …], listenerObject)` is a complete no-op on both halves instead — don't fold the two together, the named form detaches via `forceRemove` and the array form never did.
- **`retain(ε, [name, …])` rejects a wildcard atomically, `emit(ε, [name, …])` does not** — it dispatches the names preceding `'*'` and then throws. Unify them only with a CHANGELOG entry.
- **The "equal priorities keep insertion order" guarantee holds only within a bucket.** The merge in `EventStore.forEach()` compares priority alone and never looks at `id`, so at equal priority the named listener always goes first, independent of registration order. Deliberate scope limit: `forEach()` is not to be changed to consult `id` across the bucket boundary.
- **The `Object.prototype` boundary covers two of the three member lookups**, on purpose. The method-name branch `on(ε, 'evt', 'toString', obj)` spells the method out, so the inherited hit is the caller's choice.
- **A holey bucket throws on one dispatch path and stays silent on the other.** `mergeWalk()` treats a hole as a corrupted array and throws; the named-only walk in `walkBucket()` skips it the way `Array.prototype.forEach` always has. The same corrupted emitter is loud or quiet depending only on whether a wildcard listener happens to be subscribed too. A hole cannot arise through `on()`/`off()`, so this is an internal-invariant asymmetry, not a path a consumer's own code can trigger — the guard exists for the case where something else has, and the two dispatch paths simply disagree on how to react. Same reason it alone has no entry in `docs/` or the skill.
- **`off(ε)` does not reach a pending `onceAsync()`'s abort listener.** Deliberate: the `AbortSignal` given to `onceAsync()` knows nothing about the emitter, and `off()` knows nothing about the signal. Documented at the consumer-facing level in `docs/lifecycle.md` and the `using-eventize` skill; the mechanism sits in a doc comment beside `onceAsync()` in `src/eventize-api.ts`.
- **A throwing retained replay is the one throw the library swallows.** `publishReplays()` isolates each replay of a batch and reports it through `warn()`; everywhere else a throwing listener unwinds into the caller, `emitAsync()`'s catch included — that one only claims the promises it had already collected and rethrows unchanged. Don't unify the two, and don't let the throw out of `subscribeTo()` again — the second half of the same decision is that `on()` / `once()` return their handle for a registration that is complete either way. Consequence, deliberate and pinned: a `once()` whose replay throws settles nothing, so the next replay of the same batch fires it a second time. Mechanism in the doc comment at `publishReplays()`, consumer view in `docs/retain.md`.
- **A retained replay reads the keeper when it runs, but only for the value.** Which names a batch carries, and in which order, is settled before the first replay of it starts. So the two halves answer a mid-batch write differently: unretain a name and its queued replay finds nothing and stays silent, retain one and it does not join the batch it interrupted. Deliberate, not a job left unfinished — membership is what the subscription was promised, the value is what the emitter holds at the moment of delivery. Mechanism in the doc comment at `replayTo()` in `src/EventKeeper.ts`.
- **A `once()` listener that re-emits its own event before returning fires twice.** Falls directly out of two other intended decisions — no recursion guard, and a throwing listener keeps its one-shot — and isn't cheaper to fix than to state. Documented in `docs/lifecycle.md` and the `using-eventize` skill; the mechanism sits in a doc comment beside `EventListener.apply()` in `src/EventListener.ts`.
- **An eventized prototype shares one emitter with every instance.** `isEventized()`'s read is a plain property lookup and walks the prototype chain like any other: `eventize(SomeClass.prototype)` makes every instance answer `true`, `asEventized()` hands each one back unchanged, and all of them read the same `EventStore` and `EventKeeper` — `on()` on one instance is reachable from `emit()` on another, and `getSubscriptionCount()` cannot tell them apart. Not scheduled to change: the marker being a property rather than a registry entry is what the internals boundary relies on. Documented in the doc comment beside `isEventized()` in `src/isEventized.ts`, in `README.md` and in the `using-eventize` skill; pinned by `src/marker-integrity.spec.ts`.

## Conventions

- Specs live next to sources as `*.spec.ts`; Jest `testMatch` is restricted to `src/**`.
- Every feature or bugfix gets a spec.
- **This file states rules, never behaviour and never coverage.** What the library does belongs in `docs/` and in `skills/using-eventize/`; how a mechanism works belongs in a doc comment beside it; which spec pins either does not belong in prose at all. Any of the three written down twice goes stale the moment someone moves a case, and it goes stale silently — a reader who finds one such claim wrong has no way to tell which of the others still hold. Guarantees are the specs' job, and a spec that needs explaining explains itself in a comment beside the case.
- **Important enough to state is important enough to test.** A constraint that matters gets a spec. A constraint that does not matter gets no spec, no documentation and no line here. There is no third category, and "documented but untested" is the shape every stale claim starts as. The public API is the law; the specs interrogate the behaviour, including the parts no signature shows.
- Relative imports carry no extension — `tsup` writes the output extensions.
- `lib/` is generated and git-ignored. Never edit it, never read it to answer a question about behavior.
- **No issue identifiers in the repo.** `PERF-001`, `BUG-123` and the like belong to whatever tracker or report produced them and mean nothing once it is gone. A comment must say what it means on its own, and work that outlives the conversation is described rather than numbered.

## Documentation obligations

Progressive disclosure applies to this repo's own docs — the deep material lives in `docs/` and the agent-facing reference in `skills/using-eventize/references/`. Touch what the change actually affects:

| Change | Update |
| --- | --- |
| Public API or runtime behavior | `CHANGELOG.md`, under `## \`v6.0.0\` (unreleased)` |
| Anything breaking against `v5.1.0` | `docs/migration.md` as well — with the grep pattern and the replacement, not just the fact |
| Documented behavior or an example | `README.md`, plus the matching `docs/*.md` if the detail lives there |
| Dispatch semantics, retain behavior, or any quirk above | `skills/using-eventize/` — `SKILL.md` for the summary, `references/*.md` for detail |
| Cleanup, retain lifetime, or handle semantics | `docs/lifecycle.md`, plus a case in `src/lifecycle.spec.ts` |
| Deferring a fix, or accepting a known defect | the place a reader meets it — a doc comment at the code, a caveat in the `docs/*.md` that owns the topic, or the audit's accepted-points appendix when it belongs to no file. There is no backlog file; a list nobody reads while working is where a decision goes to rot |
| Purely internal refactor | nothing |

Two rules about how, not what:

- **`skills/using-eventize/` must stay self-contained.** It gets symlinked into a user's agent directory, where a path out of the folder resolves to nothing. Everything it references lives under `skills/`; duplicating a paragraph from `docs/` is the correct trade.
- **`CHANGELOG.md` is a record, not an essay.** One to three lines per entry: what changed, and for a breaking change what to write instead. Rationale, benchmark numbers and internal mechanics belong in a code comment beside the mechanism they explain.

Docs are English. Prefer stating the gotcha over restating the signature.
