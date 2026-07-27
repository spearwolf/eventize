# Integration tests: eventize v6 against @spearwolf/signalize

**Status:** design approved, not yet implemented
**Date:** 2026-07-27

## Why

`@spearwolf/eventize` is at `6.0.0-dev`; the registry still serves `5.1.0`. The v6 line
changed the published type surface, the unsubscribe handle, `off()` bulk semantics and
several dispatch details. Nothing in this repository's own test suite can answer the
question that actually matters before a release: **what does a real consumer have to
change, and does anything break that we never wrote down?**

`@spearwolf/signalize` is that consumer. It depends on eventize as a peer, uses
`eventize`, `on`, `once`, `onceAsync`, `emit`, `off`, `retain`, `retainClear`,
`Priority`, `getSubscriptionCount` and `type EventizedObject`, and carries ~50 spec
files of its own. Running signalize's suite against an unreleased eventize build turns
a guess into a measurement.

The output is not a green checkmark. The output is a classified list of breakages, and
specifically the ones that are *not* in `CHANGELOG.md`.

## Non-goals

- **Not part of CI.** No workflow file, no entry in `cbt`, no push trigger. Local, on
  demand, via `npm run test:integrations`.
- **No changes to signalize are committed.** Not to the upstream repo, not to the local
  checkout at `~/spaceland/signalize` — that directory is never read and never written.
  Adapting signalize to a new eventize is signalize's own job; this harness only measures
  what that job costs.
- **eventize is never published.** It is built and packed locally; the tarball goes into
  a container and nowhere else.
- **No automatic patch migration.** If a patch stops applying because the pinned
  signalize ref moved, `git apply` fails loudly and the skill rewrites it.

## Architecture

Two layers with a hard boundary.

**`npm run test:integrations` is mechanical.** It builds, packs, builds the image, runs
containers, collects artifacts, returns an exit code. It interprets nothing, decides
nothing, writes no patch. A human can run it alone and read the logs.

**The skill decides.** It invokes the script, reads its artifacts, maps every breakage
onto a CHANGELOG entry, writes patches, re-invokes, writes the report. It never calls
`docker` itself.

The split exists because a run only an agent can start is not reproducible, and a patch
a script guessed is not trustworthy.

## File layout

```
integration/
  Dockerfile              node:24-slim + git + corepack/pnpm 11
  signalize.config.json   {repo, ref}  — pinned, default v0.31.1
  entrypoint.sh           in-container: patch → wire → install → typecheck → test
  run.mjs                 on-host: build → pack → docker build → docker run ×2
  patches/signalize/      *.patch — semantic migrations only, versioned
  README.md               how to use it without an agent

tmp/integration/          artifacts, gitignored
.claude/skills/eventize-integration-tests/SKILL.md
```

The skill lives under `.claude/skills/` and **not** under `skills/`: the latter is listed
in `package.json`'s `files` field and ships in the npm tarball. `skills/using-eventize/`
belongs there; a developer tool does not.

**`docs/` is also in `files`.** This spec therefore ships with the package unless
`package.json` gains a negated pattern (`"!docs/superpowers"`). Add it as part of the
implementation.

## Container design

Base `node:24-slim` — signalize declares `engines.node: ">=24.13"`. Debian rather than
Alpine because signalize's test transform runs on SWC, whose native binaries are less
trouble on glibc. `git` is required twice: to clone, and for `git apply`.

pnpm comes from corepack, honoring signalize's `packageManager: pnpm@11.17.0`.

**The clone happens in the image**, with the ref as a build `ARG`. Changing the ref
invalidates the layer on its own; nobody has to remember `--no-cache`.

**`pnpm install` runs in the image against the unmodified manifest**, i.e. against
eventize `5.0.0` from the registry, with `--frozen-lockfile`. The v6 tarball is
deliberately *not* baked in: it changes on every eventize rebuild and would invalidate
the expensive layer every time. Both `node_modules` and the pnpm store stay in the image,
so the runtime install only has to add one package from a local tarball. No store volume
— mounting one would shadow the warm store the image already carries.

Each run resets signalize to its pristine state with `git checkout -- . && git clean -fd`
rather than restoring a copied tree: pnpm links `node_modules` out of the store, and
`cp -a` would break those links for hundreds of megabytes. `git clean` without `-x`
leaves ignored paths, so `node_modules` survives the reset while every source edit,
patch and YAML merge from a previous run is gone.

### Wiring eventize in

Host side: `npm run build`, then `npm pack --pack-destination tmp/integration`. The
tarball is mounted read-only at `/opt/eventize/pkg.tgz`.

Container side, `entrypoint.sh` merges into signalize's **`pnpm-workspace.yaml`**:

```yaml
overrides:
  '@spearwolf/eventize': file:/opt/eventize/pkg.tgz
peerDependencyRules:
  allowedVersions:
    '@spearwolf/eventize': '*'
```

**Not `package.json`.** pnpm 11 no longer reads the `pnpm` field there; signalize's own
`pnpm-workspace.yaml` carries a comment saying so, and it is verified empirically —
`pnpm.overrides` in `package.json` produces
`[WARN] The "pnpm" field in package.json is no longer read by pnpm` and leaves the
dependency graph untouched, while the same override in `pnpm-workspace.yaml` takes
effect. The file already exists (it holds `allowBuilds` for `@swc/core`, which the SWC
native binding needs), so the entrypoint **merges** rather than overwrites.

`overrides` is what redirects the dependency; without it the dev dependency pulls v5
from the registry no matter what the peer range says. `peerDependencyRules` only
silences the peer mismatch — `strict-peer-dependencies` defaults to false, so an
unsatisfied peer is a warning, not a failure. It is set anyway so that a real peer
error stays visible in the log instead of drowning in expected noise.

The runtime install must **not** use `--frozen-lockfile`: the override changes the
resolution, so the lockfile legitimately differs. The image-layer install does use it,
because there nothing is overridden.

This wiring is **not** a patch file. It is required on every run, has nothing to do with
breaking changes, must never be counted as migration effort, and must survive a ref bump.
A YAML merge does; a context diff does not.

### Steps

Four steps per phase, each with its own exit code and its own log. All run even if an
earlier one fails, except that a failed install or a failed version assertion aborts the
rest.

1. **`pnpm install`** — a failure here is a resolution problem, not an API problem.
1b. **Version assertion** — read `node_modules/@spearwolf/eventize/package.json` and
   abort with exit `11` unless its `version` equals the host's `package.json` version.
   This is the most dangerous failure mode in the whole harness: if the override
   silently misses, signalize resolves eventize `5.0.0` from the registry and the suite
   goes **green** while proving nothing. A green run must never be possible against the
   wrong eventize.
2. **`pnpm exec tsc --noEmit`** — the actual guard. signalize's vitest setup transpiles
   through SWC, which strips types without checking them, so a green vitest run proves
   nothing about the type surface. This step compiles signalize under
   `module/moduleResolution: NodeNext` and TypeScript 7.0.2 against `.d.ts` files that
   tsup emitted with TypeScript 5.9 — the real-world test of the dual-format type
   boundary, and the place where the opaque `EventizedObject` slot will show up first.
3. **`pnpm vitest run --reporter=json`** — runtime behaviour, machine-readable.

Exit code of the entrypoint is the highest failure code encountered:
`0` all green, `10` install, `11` wrong eventize resolved, `20` typecheck, `30` tests.

### Phases

Two `docker run --rm` invocations against the same image, distinguished by `PHASE`:

- **`baseline`** — patches are not applied. Measures what breaks with no adaptation at
  all. A red baseline is the measurement, not a failure.
- **`patched`** — `git apply` over `patches/signalize/*.patch` before step 1. Measures
  what still breaks after adaptation.

`run.mjs`'s own exit code follows the patched phase.

### Runtime interface

Mounts:

| Host | Container | Mode |
| --- | --- | --- |
| `tmp/integration/<pkg>.tgz` | `/opt/eventize/pkg.tgz` | ro |
| `integration/patches/signalize/` | `/opt/patches` | ro |
| `tmp/integration/<phase>/` | `/out` | rw |

Environment: `PHASE`, `EVENTIZE_VERSION` (the version the assertion demands),
`SIGNALIZE_REF`, `EVENTIZE_TARBALL`, `PATCHES_DIR`, `OUT_DIR`.

`run.mjs` flags: `--phase=baseline|patched|both` (default `both`), `--ref=<git-ref>`
(overrides the config file), `--no-build` (reuse an existing tarball),
`--rebuild-image` (`docker build --no-cache`).

## Artifacts

Per phase, under `tmp/integration/<phase>/`: `install.log`, `typecheck.log`,
`vitest.log`, `vitest.json`, and `result.json`. The skill reads `result.json` and drops
into the raw logs only when it needs the detail.

```jsonc
{
  "phase": "baseline",
  "signalize": {"repo": "…", "ref": "v0.31.1", "commit": "359d939…"},
  "eventize":  {"version": "6.0.0-dev", "resolvedVersion": "6.0.0-dev",
                "tarballSha256": "…"},
  "patches":   {"applied": [], "failed": []},
  "steps": [
    {"name": "install",   "exitCode": 0, "durationMs": 0, "log": "install.log"},
    {"name": "assert-version", "exitCode": 0, "durationMs": 0, "log": "install.log"},
    {"name": "typecheck", "exitCode": 2, "durationMs": 0, "log": "typecheck.log",
     "errorCount": 0},
    {"name": "test",      "exitCode": 1, "durationMs": 0, "log": "vitest.log",
     "report": "vitest.json"}
  ],
  "exitCode": 30
}
```

`patches.failed` being non-empty is a first-class signal: the pinned ref moved out from
under the patch set.

## Patch conventions

`integration/patches/signalize/NNN-<slug>.patch`, applied in filename order. Header of
every patch carries two lines:

```
# changelog: <the v6.0.0 CHANGELOG entry that causes this>
# signalize-ref: <ref the patch was authored against>
```

Patches are written **only** for breakages that a CHANGELOG entry explains. A breakage
with no documented cause gets a report entry instead — patching it would hide the finding,
which is the one thing this harness exists to prevent.

## The skill

`.claude/skills/eventize-integration-tests/SKILL.md`, seven steps.

1. **Preflight.** Docker reachable, `src/` builds, ref read from `signalize.config.json`.
2. **Baseline.** `npm run test:integrations`, both phases. A red baseline is expected.
3. **Read before guessing.** `CHANGELOG.md` under `## \`v6.0.0\` (unreleased)` and
   `skills/using-eventize/references/migration.md` are read *before* a single error
   message is interpreted. The order is binding — reversed, you write patches that paper
   over a genuine regression.
4. **Classify.** Every baseline breakage gets exactly one category:

   | | Finding | Consequence |
   | --- | --- | --- |
   | **A** | breaks, documented, trivial patch | migration is cheap; a number in the report |
   | **B** | breaks, documented, expensive patch | the migration note understates the cost; sharpen `references/migration.md` |
   | **C** | breaks, **not** documented | gap in `CHANGELOG.md`; the action belongs in eventize |
   | **D** | breaks, no patch fixes it | regression in v6, or a feature v6 dropped outright; the action belongs in eventize |
   | **E** | no break, but changed behaviour signalize's tests happen to miss | note for a future spec, on both sides |

   C and D justify the whole exercise. A is bookkeeping.
5. **Patches** for A and B only, named after the CHANGELOG entry they serve.
6. **Iterate** phase 2 until green, or until only C and D remain. Stopping on C/D is a
   legitimate end state, not a failure.
7. **Report** to `tmp/integration/REPORT.md` plus a chat summary: baseline vs. patched,
   the classification table with concrete sites, and a list of actions that belong in
   eventize.

## Known risks

- **The pinned ref goes stale.** Handled by design: `git apply` fails, `patches.failed`
  records it, the skill rewrites. No automation.
- **eventize's `exports` map has no `types` condition**; the top-level `types` field
  carries it. `attw --pack` passes today, but signalize resolves under `NodeNext` with
  TypeScript 7, which is a stricter reader than `attw`'s matrix. If step 2 fails on
  module resolution rather than on API shape, that is a finding about eventize's package
  manifest, not about signalize.
- **TypeScript version skew is intentional, not accidental.** eventize is pinned below 7
  because ts-jest and typescript-eslint cap there; signalize already runs 7.0.2. This
  harness is the only place where the emitted declarations meet a TS 7 compiler.
- **SWC and decorators.** signalize's vitest config lowers decorators via SWC. Nothing
  in eventize touches that, but a container-only decorator failure is a signalize
  toolchain issue and must not be classified as A–D.

## Verification

The implementation is done when:

- `npm run test:integrations` completes both phases on a clean checkout with no patches
  present, and writes a `result.json` per phase.
- Deleting `tmp/integration/` and re-running reproduces both `result.json` files apart
  from timings and the commit hash.
- A deliberately broken patch (garbage context) surfaces in `patches.failed` and does
  not silently produce a green phase 2.
- Removing the `overrides` entry from the wiring makes the run fail with exit `11`,
  not pass. A green run against eventize 5.0.0 must be impossible.
- `npm run cbt` is unaffected: no new dependency in the runtime path, no new step.
- `npm pack --dry-run` does not list `docs/superpowers/` or `.claude/`.
