# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

`AGENTS.md` is the canonical contributor guide for this repo. Read it first — it covers tech stack, source layout, and the basic dev workflow. This file adds Claude-specific notes and architectural context that aren't obvious from a single file read.

## Common commands

- `npm test` — run the full Jest suite
- `npm test -- src/once.spec.ts` — run a single spec file
- `npm test -- -t "retains the last value"` — run tests matching a name
- `npm run watch` — Jest in watch mode
- `npm run build` — `tsup` build to `lib/` (CJS + ESM + `.d.ts`)
- `npm run cbt` — clean → build → `attw --pack` (package types check) → test → lint → format check. **Run this before declaring any task done.**

## Architecture

The library is small but the indirection is deliberate. Three layers worth knowing:

**1. The "eventized" marker.** `asEventized(obj)` attaches a non-enumerable, symbol-keyed property (`NAMESPACE` from `constants.ts`) holding `{store: EventStore, keeper: EventKeeper}`. Any object with that hidden slot is an emitter. `isEventized()` is the type guard. This is why eventize works on existing objects, plain `{}`, or class instances interchangeably.

**2. Two collaborators behind every emitter:**
- `EventStore` — the listener registry. Holds `EventListener` instances, dispatches via `forEach(event, fn)`, handles removal with `(listener?, listenerObject?, forceRemove?)` semantics.
- `EventKeeper` — the retained-events log. When `retain(event)` is called, subsequent emits are remembered; new subscribers to a retained event get replayed past values immediately. `subscribeTo` collects retained events into `retainedEvents[]` and `EventKeeper.publish()` flushes them *after* registration completes (so the listener sees them in order).

**3. Three API surfaces over the same primitives** (`eventize-api.ts`):
- **Standalone functions:** `on(obj, …)`, `emit(obj, …)`, etc. — preferred style; tree-shakable.
- **Injected methods:** `eventize.inject(obj)` adds `obj.on(…)`, `obj.emit(…)`, … bound to that object.
- **Base class:** `class Eventize` — `extends Eventize` to get the methods via inheritance. Constructor calls `eventize(this)`.

All three call into the same `on`/`emit`/`off` functions; don't duplicate logic across them.

### Subscription parsing

`subscribeTo.ts` decodes the highly overloaded `on()` argument shapes (event name(s), optional priority, listener function or method-name + listener object, or just a listener object whose method names *are* the event names). When changing the API or types, update both `SubscribeArgs` in `types.ts` *and* the parsing in `_subscribeTo` — they must stay in lockstep, and the spec files exercise the corner cases.

### Emit, sync vs. async

`emit` and `emitAsync` share `_emit`. `emitAsync` passes a `returnValue` callback that collects each listener's return value; arrays-of-promises are flattened with `Promise.all`. Listener invocation order is always synchronous — async only describes how return values are aggregated.

### Wildcards and priorities

`EVENT_CATCH_EM_ALL` (in `constants.ts`) is the wildcard event; subscribing without an event name registers a catch-all listener. `Priority` enum values control dispatch order (higher first). Per-event priority can be set via `[eventName, priority]` tuples in the array form.

## Conventions

- Tests live next to sources as `*.spec.ts` (Jest config restricts `testMatch` to `src/**`).
- `lib/` is generated; never edit. `npm run clean` wipes it.
- ESM-style relative imports use bare paths (no `.js`) — `tsup` handles output extensions.
- Document every source change that affects the public API or runtime behavior in `CHANGELOG.md` (add migration notes if it's breaking). When the change alters documented behavior or examples, update `README.md` as well. Pure internal refactors that leave API and behavior untouched don't need either.
- `skills/using-eventize/SKILL.md` is a quick-reference skill for AI coding agents using the library. Whenever a change alters the public API, listener-dispatch semantics, retain behavior, or any of the documented quirks (auto-eventize asymmetry, wildcard rules, forwarding, recursion guard, refcount semantics, error semantics), update the skill to match. Pure internal refactors don't need it.
- When a task from `TODO.md` is completed, record it in both `CHANGELOG.md` (under `## Unreleased`) and `TODO.md` (mark the item as done, e.g. `~~strikethrough~~` or a ✅ note). If the task was fully resolved exactly as described — including any tests, docs, or follow-ups it lists — remove the entry from `TODO.md` entirely. Partial work stays in `TODO.md` with a note describing what's left.
- The package ships both CJS and ESM (`lib/index.js` / `lib/index.mjs`) plus `.d.ts`. `npm run checkPkgTypes` (via `attw`) verifies the dual-format types resolve correctly — failures here usually mean an `exports` map or `.d.ts` mismatch.
