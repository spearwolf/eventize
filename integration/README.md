# Integration tests: eventize vs. signalize

Runs `@spearwolf/signalize`'s test suite against the **local, unreleased**
eventize build, inside a container. Not part of CI, not part of `cbt`. Local,
on demand.

    npm run test:integrations

Flags: `--phase=baseline|patched|both` (default `both`), `--ref=<git-ref>`,
`--no-build` (reuse the existing tarball), `--rebuild-image`.

Artifacts land in `tmp/integration/<phase>/`. Note that `npm run clean` — and
therefore `cbt` — wipes `tmp/`, tarball included; the next run without
`--no-build` rebuilds it anyway.

## What the two phases mean

- **baseline** — patches are not applied. Measures what breaks with no
  adaptation at all. A red baseline is the measurement, not a failure.
- **patched** — applies `patches/signalize/*.patch` first. Measures what still
  breaks after adaptation.

The difference between them is the migration cost for a real consumer.

## Exit codes (from `entrypoint.sh`)

| Code | Meaning |
| --- | --- |
| `0` | all green |
| `10` | `pnpm install` failed — a resolution problem, not an API problem |
| `11` | wrong eventize resolved; the override missed. A green run against the wrong eventize must be impossible |
| `12` | signalize's `pnpm-workspace.yaml` already declares `overrides`/`peerDependencyRules` |
| `13` | a patch no longer applies — the pinned ref moved out from under the patch set |
| `20` | `tsc --noEmit` failed |
| `30` | vitest failed |

## Artifacts

Per phase, under `tmp/integration/<phase>/`: `install.log`, `typecheck.log`,
`vitest.log`, `vitest.json`, `patches.log` (patched phase only) and
`result.json`. Read `result.json`; drop into the raw logs only for detail.

```jsonc
{
  "phase": "baseline",
  "signalize": {"ref": "359d939a…", "commit": "359d939a…"},
  "eventize":  {"version": "6.0.0-dev", "resolvedVersion": "6.0.0-dev"},
  "patches":   {"applied": [], "failed": []},
  "steps": [
    {"name": "install",        "exitCode": 0, "durationMs": 1933, "log": "install.log"},
    {"name": "assert-version", "exitCode": 0, "durationMs": 0,    "log": "install.log"},
    {"name": "typecheck",      "exitCode": 0, "durationMs": 4210, "log": "typecheck.log"},
    {"name": "test",           "exitCode": 0, "durationMs": 6180, "log": "vitest.log"}
  ],
  "exitCode": 0
}
```

`exitCode` is the highest failure code any step reached. `patches.failed`
being non-empty is a first-class signal, not a warning: the pinned ref moved
out from under the patch set.

## Why the ref is a SHA

signalize pushes no release tags; `v0.0.1` is the only one that exists. So
`v0.31.1` names a commit message, not a fetchable ref, and pinning to it fails
the image build outright. `signalize.config.json` therefore carries the commit
SHA. The image uses `git init` + `git fetch --depth 1 origin <ref>` rather than
`git clone --branch`, because that form accepts a tag, a branch *and* a SHA.

## Why the eventize wiring lives in `pnpm-workspace.yaml`

pnpm 11 no longer reads the `pnpm` field in `package.json` — it warns and
ignores it. `entrypoint.sh` appends `overrides` and `peerDependencyRules` to
`pnpm-workspace.yaml` instead, and bails with exit `12` if signalize ever
declares those keys itself, rather than emitting a duplicate.

`overrides` is what redirects the dependency. `peerDependencyRules` only
silences the peer mismatch against signalize's `^5.0.0` range; an unsatisfied
peer is a warning by default, and silencing the expected one keeps a real peer
error visible.

The wiring is not a patch and never counts as migration effort.

## Why `tsc --noEmit` runs separately

signalize transpiles through SWC, which strips types without checking them. A
green vitest run proves nothing about the type surface, and the type surface is
exactly what eventize v6 changed. This was not hypothetical during
implementation: the first full baseline recorded `typecheck 1` alongside
`test 0`.

It runs with `--skipLibCheck` against the default `tsconfig.json`. Without the
flag, six `TS2307`s from `unplugin` and `webpack-virtual-modules` — optional
peers signalize never installs — bury every real finding. The flag does not
weaken the measurement: errors in signalize's own source, including every use
of an eventize type and a failure to resolve the module at all, are still
reported. `tsconfig.lib.json` would dodge the noise too, but it excludes
`*.spec.ts`, and those specs are the heaviest eventize consumers in the repo.

## Proving the harness still bites

A green run is only worth something if a break would have been caught. Three
throwaway fixtures do that; none of them belongs in a commit.

**Is the version assertion live?** Change the injected override in
`entrypoint.sh` from `file:${EVENTIZE_TARBALL}` to `^5.0.0`, rebuild, run.
Expected: exit `11`, `FATAL: expected eventize 6.0.0-dev, resolved '5.0.0'`.

**Is the typecheck live?** Drop in this canary and run the patched phase:

```
# changelog: none — deliberate test fixture, removed after verification
# signalize-ref: none
diff --git a/src/zz-canary.ts b/src/zz-canary.ts
new file mode 100644
--- /dev/null
+++ b/src/zz-canary.ts
@@ -0,0 +1,4 @@
+import {on} from '@spearwolf/eventize';
+
+// Deliberately wrong: `on` is a function, not a number.
+export const canary: number = on;
```

Expected: exit `20` and a `TS2322` quoting eventize's own overload signature
(`EventizedObject`, `ListenerFor`, `UnsubscribeFunc`). A `TS2307` instead means
the module does not resolve at all, which is a finding about eventize's
`exports` map rather than a passing canary.

The fixture creates a new file on purpose: no context lines, so it cannot go
stale when the pinned ref moves.

**Is a stale patch caught?** Drop in a patch that cannot possibly apply and run
the patched phase:

```
# changelog: none — deliberate test fixture
# signalize-ref: none
--- a/src/does-not-exist.ts
+++ b/src/does-not-exist.ts
@@ -1,1 +1,1 @@
-nonsense
+more nonsense
```

Expected: exit `13`, the filename in `patches.failed`, and no test run at all.
The same fixture proves the baseline phase ignores patches entirely — run it
with `--phase=baseline` and both `patches` arrays stay empty.

## Why this stays manual

Wired into no pipeline, on purpose: `npm run test:integrations`, by hand, or
not at all. The run needs Docker and takes far longer than the unit suite —
folding it into `cbt` or the CI matrix would make the fast gate slow for
everyone.

If it is ever automated, it belongs in a workflow of its own — push to
`main`, `workflow_dispatch`, a nightly schedule — ahead of the deploy job,
not folded into `cbt`.

One gap the harness leaves as is: signalize consumes the ESM build, so
nothing in a baseline or patched run touches CJS at runtime, and
`attw --pack` checks type resolution rather than behaviour. A companion smoke
test that `require()`s `lib/index.js` would close it.

## Patches

`patches/signalize/NNN-<slug>.patch`, applied in filename order, each carrying:

    # changelog: <the v6.0.0 CHANGELOG entry that causes this>
    # signalize-ref: <ref the patch was authored against>

Patches are written **only** for breakages a CHANGELOG entry explains. An
undocumented breakage gets a report entry instead — patching it would hide the
finding this harness exists to surface.

Nothing here is ever committed to signalize. Adapting signalize is signalize's
job; this measures what that job costs.
