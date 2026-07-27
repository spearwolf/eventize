# Signalize Integration-Test Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run `@spearwolf/signalize`'s test suite against an unreleased local eventize build inside a container, twice — once unpatched, once patched — so the difference measures what a real consumer must change.

**Architecture:** A mechanical host script (`integration/run.mjs`) builds and packs eventize, builds a Docker image that clones signalize at a pinned ref, and runs two containers. A bash entrypoint wires the eventize tarball in via `pnpm-workspace.yaml`, asserts the resolved version, then runs install → typecheck → tests, writing one `result.json` per phase. A project-local skill reads those artifacts, classifies breakages against `CHANGELOG.md`, and writes patches.

**Tech Stack:** Docker, `node:24-slim`, pnpm 11.17.0 via corepack, bash, `jq`, Node ESM for the host runner.

**Spec:** `docs/superpowers/specs/2026-07-27-eventize-integration-tests-design.md`

## Global Constraints

- `package.json` version stays **`6.0.0-dev`**. Never bump it, never drop the suffix.
- **Nothing is added to `cbt`** and no GitHub workflow is created. `npm run cbt` must still pass unchanged after every task.
- The local signalize checkout at `~/spaceland/signalize` is **never read and never written**. The container clones from GitHub.
- **No commits, pushes or PRs in signalize.** Patches live in this repo only.
- Docs and code comments are **English**.
- `eslint` lints `**/*.{mjs,cjs}` with node globals, so `integration/run.mjs` is inside the `lint` gate. `prettier --check` only covers `src/**`, so `integration/` is not format-gated — match the repo style anyway: single quotes, no bracket spacing (`import {x} from 'y'`).
- Pinned signalize ref for all tasks: **`v0.31.1`**.
- Expected eventize tarball name: **`spearwolf-eventize-6.0.0-dev.tgz`**.

## File Structure

| File | Responsibility |
| --- | --- |
| `integration/signalize.config.json` | The pinned target: repo URL + ref. Single source of truth, read by `run.mjs`. |
| `integration/Dockerfile` | Image: node 24 + git + jq + pnpm, clone at `ARG SIGNALIZE_REF`, warm `pnpm install` against unmodified manifest. |
| `integration/entrypoint.sh` | In-container run: reset → patch → wire → install → assert → typecheck → test → `result.json`. Owns all exit codes. |
| `integration/run.mjs` | On-host orchestration: build, pack, `docker build`, `docker run` per phase. Decides nothing. |
| `integration/patches/signalize/` | Semantic migration patches, applied in filename order. |
| `integration/README.md` | How to use the harness without an agent. |
| `.claude/skills/eventize-integration-tests/SKILL.md` | The decision layer: classify, patch, report. |
| `package.json` | Adds `test:integrations` script and excludes `docs/superpowers` from the npm tarball. |

## Exit code contract (owned by `entrypoint.sh`)

| Code | Meaning |
| --- | --- |
| `0` | all steps green |
| `10` | `pnpm install` failed |
| `11` | wrong eventize version resolved — the override silently missed |
| `12` | wiring conflict: signalize already declares `overrides`/`peerDependencyRules` |
| `13` | `git apply` failed for at least one patch |
| `20` | `tsc --noEmit` failed |
| `30` | vitest failed |

Highest code encountered wins. `10`, `11`, `12` and `13` abort the remaining steps; `20` does not.

---

### Task 1: Config, npm script, package hygiene

**Files:**
- Create: `integration/signalize.config.json`
- Create: `integration/patches/signalize/.gitkeep`
- Modify: `package.json` (scripts + files)

**Interfaces:**
- Produces: `integration/signalize.config.json` with keys `repo` (string) and `ref` (string), read by `run.mjs` in Task 6.
- Produces: npm script `test:integrations` → `node integration/run.mjs`.

- [ ] **Step 1: Verify the packaging problem exists**

Run: `npm pack --dry-run 2>&1 | grep -c 'docs/superpowers'`
Expected: a number `> 0` — the spec currently ships in the npm tarball. That is the defect this step fixes.

- [ ] **Step 2: Create the config file**

Create `integration/signalize.config.json`:

```json
{
  "repo": "https://github.com/spearwolf/signalize.git",
  "ref": "v0.31.1"
}
```

- [ ] **Step 3: Create the patch directory placeholder**

```bash
mkdir -p integration/patches/signalize
touch integration/patches/signalize/.gitkeep
```

- [ ] **Step 4: Add the npm script**

In `package.json`, inside `"scripts"`, after the `"test:coverage"` line:

```json
    "test:integrations": "node integration/run.mjs",
```

- [ ] **Step 5: Exclude the spec directory from the tarball**

In `package.json`, replace the `"files"` array with:

```json
  "files": [
    "lib",
    "docs",
    "!docs/superpowers",
    "skills",
    "README.md",
    "CHANGELOG.md",
    "LICENSE"
  ],
```

- [ ] **Step 6: Verify the exclusion works**

Run: `npm pack --dry-run 2>&1 | grep -c 'docs/superpowers'`
Expected: `0`

Run: `npm pack --dry-run 2>&1 | grep -c 'docs/lifecycle.md'`
Expected: `1` — the real docs still ship. If this is `0`, the negated pattern killed the whole `docs` entry and the order in the array is wrong.

Run: `npm pack --dry-run 2>&1 | grep -c 'skills/using-eventize'`
Expected: `4`

Both readings were confirmed empirically against this exact `files` array before the plan was written; a deviation means the array was mistyped, not that npm behaves differently.

- [ ] **Step 7: Verify the gate is untouched**

Run: `npm run cbt`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add integration/signalize.config.json integration/patches/signalize/.gitkeep package.json
git commit --no-gpg-sign -m "build: add integration-test config and keep specs out of the tarball"
```

---

### Task 2: The container image

**Files:**
- Create: `integration/Dockerfile`

**Interfaces:**
- Consumes: `integration/signalize.config.json` values, passed as build args by Task 6.
- Produces: image with signalize checked out at `/work/signalize`, `node_modules` installed against eventize 5.x, pnpm store warm. Build args: `SIGNALIZE_REPO`, `SIGNALIZE_REF`. Env defaults: `OUT_DIR=/out`, `EVENTIZE_TARBALL=/opt/eventize/pkg.tgz`, `PATCHES_DIR=/opt/patches`.
- Produces: entrypoint at `/usr/local/bin/entrypoint.sh` (written in Task 3; a placeholder is created here so the image builds).

- [ ] **Step 1: Write the Dockerfile**

Create `integration/Dockerfile`:

```dockerfile
# syntax=docker/dockerfile:1

# signalize declares engines.node ">=24.13". Debian rather than Alpine: the
# vitest transform runs on @swc/core, whose native binding is less trouble on
# glibc than on musl.
FROM node:24-slim

ARG SIGNALIZE_REPO=https://github.com/spearwolf/signalize.git
ARG SIGNALIZE_REF=v0.31.1

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0

RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates jq \
 && rm -rf /var/lib/apt/lists/*

RUN corepack enable

WORKDIR /work

# init + fetch rather than "clone --branch": this form accepts a tag, a branch
# *and* a commit SHA. SIGNALIZE_REF is an ARG, so bumping it invalidates this
# layer on its own — nobody has to remember --no-cache.
RUN git init -q signalize \
 && cd signalize \
 && git remote add origin "${SIGNALIZE_REPO}" \
 && git fetch --depth 1 origin "${SIGNALIZE_REF}" \
 && git checkout -q FETCH_HEAD

WORKDIR /work/signalize

# Baseline install against the UNMODIFIED manifest: eventize 5.x from the
# registry. The v6 tarball arrives at runtime, so this expensive layer stays
# warm across eventize rebuilds. node_modules and the pnpm store both live in
# the image, which is why no store volume is mounted at runtime — one would
# shadow the warm store.
RUN pnpm install --frozen-lockfile

COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

ENV OUT_DIR=/out
ENV EVENTIZE_TARBALL=/opt/eventize/pkg.tgz
ENV PATCHES_DIR=/opt/patches

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
```

- [ ] **Step 2: Create a placeholder entrypoint so the image builds**

Create `integration/entrypoint.sh`:

```bash
#!/usr/bin/env bash
echo "entrypoint not implemented yet" >&2
exit 99
```

- [ ] **Step 3: Build the image**

Run:
```bash
docker build -t eventize-integration:test integration/
```
Expected: build succeeds. The `pnpm install` layer is the slow one (a few minutes on a cold cache).

- [ ] **Step 4: Verify the clone landed at the right ref**

Run:
```bash
docker run --rm --entrypoint git eventize-integration:test \
  -C /work/signalize log --oneline -1
```
Expected: `359d939 chore: release v0.31.1`

- [ ] **Step 5: Verify the baseline install resolved eventize 5.x**

Run:
```bash
docker run --rm --entrypoint node eventize-integration:test \
  -p "require('/work/signalize/node_modules/@spearwolf/eventize/package.json').version"
```
Expected: `5.0.0`

This is the control reading. Task 3's assertion exists to turn this value into `6.0.0-dev`.

- [ ] **Step 6: Verify pnpm is the pinned version**

Run:
```bash
docker run --rm --entrypoint pnpm eventize-integration:test --version
```
Expected: `11.17.0`

- [ ] **Step 7: Commit**

```bash
git add integration/Dockerfile integration/entrypoint.sh
git commit --no-gpg-sign -m "build: add the integration-test container image"
```

---

### Task 3: Entrypoint — reset, wiring, install, version assertion

**Files:**
- Modify: `integration/entrypoint.sh` (replace the placeholder entirely)

**Interfaces:**
- Consumes: env `PHASE`, `EVENTIZE_VERSION`, `EVENTIZE_TARBALL`, `PATCHES_DIR`, `OUT_DIR`; mount of the tarball at `$EVENTIZE_TARBALL`.
- Produces: `$OUT_DIR/install.log`; exit codes `0`, `10`, `11`, `12`.
- Produces: shell functions `now_ms`, `record_step <name> <exitCode> <durationMs> <log> [extraJson]`, `run_step <name> <logfile> <cmd...>` and the accumulator variable `STEPS_JSON`, all consumed by Task 4.

- [ ] **Step 1: Write the failing check first**

Before writing any implementation, establish the failure this task must produce. Run:

```bash
npm run build && npm pack --pack-destination tmp/integration
docker run --rm \
  -e PHASE=baseline -e EVENTIZE_VERSION=6.0.0-dev \
  -v "$PWD/tmp/integration/spearwolf-eventize-6.0.0-dev.tgz:/opt/eventize/pkg.tgz:ro" \
  -v "$PWD/tmp/integration/baseline:/out" \
  eventize-integration:test
```
Expected: exit code `99` from the placeholder. Confirm with `echo $?`.

- [ ] **Step 2: Write the entrypoint**

Replace `integration/entrypoint.sh` entirely:

```bash
#!/usr/bin/env bash
# In-container driver for the eventize↔signalize integration harness.
# Owns every exit code; see integration/README.md for the table.
set -uo pipefail

PHASE="${PHASE:-baseline}"
SIGNALIZE_DIR=/work/signalize
OUT_DIR="${OUT_DIR:-/out}"
EVENTIZE_TARBALL="${EVENTIZE_TARBALL:-/opt/eventize/pkg.tgz}"
PATCHES_DIR="${PATCHES_DIR:-/opt/patches}"

if [ -z "${EVENTIZE_VERSION:-}" ]; then
  echo "FATAL: EVENTIZE_VERSION is not set" >&2
  exit 1
fi

mkdir -p "$OUT_DIR"
cd "$SIGNALIZE_DIR" || exit 1

STEPS_JSON='[]'
PATCHES_JSON='{"applied":[],"failed":[]}'
RESOLVED=''
WORST=0

now_ms() { date +%s%3N; }

# Track the highest failure code seen. 0 never lowers an existing failure.
note_failure() {
  if [ "$1" -gt "$WORST" ]; then WORST="$1"; fi
}

# record_step <name> <exitCode> <durationMs> <log> [extraJsonObject]
record_step() {
  # Written out rather than as a ${5:-{}} default: the brace inside a
  # parameter expansion needs escaping and reads as a syntax error waiting
  # to happen.
  local extra="${5:-}"
  [ -z "$extra" ] && extra='{}'
  STEPS_JSON=$(jq -c \
    --arg n "$1" --argjson c "$2" --argjson d "$3" --arg l "$4" --argjson x "$extra" \
    '. + [{name: $n, exitCode: $c, durationMs: $d, log: $l} + $x]' <<<"$STEPS_JSON")
}

# run_step <name> <logfile> <cmd...> — tees to both the log and stdout, and
# reports the command's status, not tee's.
run_step() {
  local name="$1" log="$2"
  shift 2
  local t0 t1 rc
  t0=$(now_ms)
  "$@" 2>&1 | tee "$OUT_DIR/$log"
  rc=${PIPESTATUS[0]}
  t1=$(now_ms)
  record_step "$name" "$rc" "$((t1 - t0))" "$log"
  return "$rc"
}

# Reset to pristine. Not a copied tree: pnpm hardlinks node_modules out of the
# store and `cp -a` would break those links for hundreds of megabytes. `git
# clean` without -x leaves ignored paths, so node_modules survives while every
# source edit, patch and YAML merge from a previous run is gone.
git checkout -q -- .
git clean -qfd

# --- wire the local eventize tarball in -------------------------------------
# pnpm 11 no longer reads the "pnpm" field in package.json; settings live in
# pnpm-workspace.yaml. Appending is valid YAML as long as the keys are absent,
# so bail loudly rather than emit a duplicate key.
if grep -qE '^(overrides|peerDependencyRules):' pnpm-workspace.yaml; then
  echo "FATAL: signalize's pnpm-workspace.yaml already declares overrides or" >&2
  echo "       peerDependencyRules. The wiring would produce a duplicate key." >&2
  exit 12
fi

cat >>pnpm-workspace.yaml <<EOF

# --- injected by the eventize integration harness, not by signalize ---
overrides:
  '@spearwolf/eventize': file:${EVENTIZE_TARBALL}
peerDependencyRules:
  allowedVersions:
    '@spearwolf/eventize': '*'
EOF

# --- install ----------------------------------------------------------------
# No --frozen-lockfile: the override legitimately changes resolution.
if ! run_step install install.log pnpm install --no-frozen-lockfile; then
  note_failure 10
  write_result
  exit "$WORST"
fi

# --- version assertion ------------------------------------------------------
# The most dangerous failure mode in the harness: if the override misses,
# signalize resolves eventize 5.x from the registry and the suite goes green
# while proving nothing. A green run against the wrong eventize is impossible.
RESOLVED=$(node -p \
  "require('${SIGNALIZE_DIR}/node_modules/@spearwolf/eventize/package.json').version" \
  2>/dev/null || echo '')

if [ "$RESOLVED" != "$EVENTIZE_VERSION" ]; then
  echo "FATAL: expected eventize ${EVENTIZE_VERSION}, resolved '${RESOLVED}'" \
    | tee -a "$OUT_DIR/install.log" >&2
  record_step assert-version 11 0 install.log
  note_failure 11
  write_result
  exit "$WORST"
fi
record_step assert-version 0 0 install.log
echo "eventize ${RESOLVED} resolved — assertion passed"
```

- [ ] **Step 3: Add the result writer**

`write_result` is referenced above and must be defined before first use. Insert it directly after the `run_step` definition:

```bash
# Writes $OUT_DIR/result.json from the accumulated STEPS_JSON.
write_result() {
  local commit
  commit=$(git rev-parse HEAD 2>/dev/null || echo 'unknown')
  jq -n \
    --arg phase "$PHASE" \
    --arg ref "${SIGNALIZE_REF:-unknown}" \
    --arg commit "$commit" \
    --arg version "$EVENTIZE_VERSION" \
    --arg resolved "${RESOLVED:-}" \
    --argjson steps "$STEPS_JSON" \
    --argjson patches "$PATCHES_JSON" \
    --argjson exitCode "$WORST" \
    '{phase: $phase,
      signalize: {ref: $ref, commit: $commit},
      eventize: {version: $version, resolvedVersion: $resolved},
      patches: $patches,
      steps: $steps,
      exitCode: $exitCode}' \
    >"$OUT_DIR/result.json"
}
```

`RESOLVED` and `PATCHES_JSON` are already declared next to `STEPS_JSON` in Step 2, so the writer never reads an unset variable under `set -u`. Verify that with `grep -n "^RESOLVED=\|^PATCHES_JSON=" integration/entrypoint.sh` — expected: two lines.

- [ ] **Step 4: Run it and verify the assertion passes**

Run:
```bash
rm -rf tmp/integration/baseline && mkdir -p tmp/integration/baseline
docker build -t eventize-integration:test integration/
docker run --rm \
  -e PHASE=baseline -e EVENTIZE_VERSION=6.0.0-dev -e SIGNALIZE_REF=v0.31.1 \
  -v "$PWD/tmp/integration/spearwolf-eventize-6.0.0-dev.tgz:/opt/eventize/pkg.tgz:ro" \
  -v "$PWD/tmp/integration/baseline:/out" \
  eventize-integration:test
echo "exit=$?"
```
Expected: the log ends with `eventize 6.0.0-dev resolved — assertion passed`, exit `0`.

- [ ] **Step 5: Verify the assertion actually catches a miss**

This is the test that matters. Temporarily change the injected override line in `entrypoint.sh` from `file:${EVENTIZE_TARBALL}` to `^5.0.0`, rebuild, and re-run the command from Step 4.

Expected: `FATAL: expected eventize 6.0.0-dev, resolved '5.0.0'`, exit `11`.

Then revert the line, rebuild, and confirm Step 4 passes again. Do not commit the broken version.

- [ ] **Step 6: Verify result.json is well-formed**

Run: `jq -e '.eventize.resolvedVersion == "6.0.0-dev" and .exitCode == 0' tmp/integration/baseline/result.json`
Expected: `true`

- [ ] **Step 7: Commit**

```bash
git add integration/entrypoint.sh
git commit --no-gpg-sign -m "build: wire the eventize tarball in and assert the resolved version"
```

---

### Task 4: Entrypoint — typecheck, tests, result

**Files:**
- Modify: `integration/entrypoint.sh` (append after the version assertion)

**Interfaces:**
- Consumes: `run_step`, `record_step`, `note_failure`, `write_result`, `STEPS_JSON`, `WORST` from Task 3.
- Produces: `$OUT_DIR/typecheck.log`, `$OUT_DIR/vitest.log`, `$OUT_DIR/vitest.json`, and a complete `$OUT_DIR/result.json`; exit codes `20`, `30`.

- [ ] **Step 1: Append the typecheck and test steps**

At the end of `integration/entrypoint.sh`:

```bash
# --- typecheck --------------------------------------------------------------
# The actual guard. signalize transpiles through SWC, which strips types
# without checking them, so a green vitest run proves nothing about the type
# surface. This compiles signalize under module/moduleResolution NodeNext with
# TypeScript 7 against .d.ts files tsup emitted with TypeScript 5.9 — the only
# place those two ever meet.
run_step typecheck typecheck.log pnpm exec tsc --noEmit
TSC_RC=$?
[ "$TSC_RC" -ne 0 ] && note_failure 20

# --- tests ------------------------------------------------------------------
# No --coverage: signalize's own script runs it, but its thresholds would add
# a second, unrelated failure on top of every real one.
run_step test vitest.log pnpm exec vitest run \
  --reporter=default --reporter=json --outputFile.json="$OUT_DIR/vitest.json"
VITEST_RC=$?
[ "$VITEST_RC" -ne 0 ] && note_failure 30

write_result
exit "$WORST"
```

- [ ] **Step 2: Run the full baseline**

Run:
```bash
rm -rf tmp/integration/baseline && mkdir -p tmp/integration/baseline
docker build -t eventize-integration:test integration/
docker run --rm \
  -e PHASE=baseline -e EVENTIZE_VERSION=6.0.0-dev -e SIGNALIZE_REF=v0.31.1 \
  -v "$PWD/tmp/integration/spearwolf-eventize-6.0.0-dev.tgz:/opt/eventize/pkg.tgz:ro" \
  -v "$PWD/tmp/integration/baseline:/out" \
  eventize-integration:test
echo "exit=$?"
```
Expected: it completes and writes all four logs. The exit code may be `0`, `20` or `30` — this is the first real measurement and any of them is a valid result. **Record which it was**; the skill's first report starts here.

- [ ] **Step 3: Verify every step is recorded**

Run: `jq -r '.steps[] | "\(.name) \(.exitCode)"' tmp/integration/baseline/result.json`
Expected: four lines — `install`, `assert-version`, `typecheck`, `test`.

- [ ] **Step 4: Verify the vitest JSON report exists and parses**

Run: `jq -e '.numTotalTests > 0' tmp/integration/baseline/vitest.json`
Expected: `true`

If this fails with a parse error, the `--outputFile.json=` form is wrong for the installed vitest; check `pnpm exec vitest run --help` inside the container and adjust.

- [ ] **Step 5: Verify a typecheck failure does not swallow the test run**

Run: `jq -e '[.steps[].name] | index("test") != null' tmp/integration/baseline/result.json`
Expected: `true` — even if `typecheck` reported non-zero. Losing the test run to a type error would throw away half the measurement.

- [ ] **Step 6: Commit**

```bash
git add integration/entrypoint.sh
git commit --no-gpg-sign -m "build: run signalize typecheck and tests, emit result.json"
```

---

### Task 5: Entrypoint — patch application and phases

**Files:**
- Modify: `integration/entrypoint.sh` (insert between the reset and the wiring)

**Interfaces:**
- Consumes: env `PHASE` (`baseline` | `patched`), `PATCHES_DIR`.
- Produces: `PATCHES_JSON` (`{"applied": [...], "failed": [...]}`) consumed by `write_result`; exit code `13`.

- [ ] **Step 1: Insert patch application after the reset, before the wiring**

In `integration/entrypoint.sh`, directly after `git clean -qfd`:

```bash
# --- patches ----------------------------------------------------------------
# Applied only in the patched phase, in filename order, before install: a
# patch may change dependencies. Patches are semantic migrations only — the
# pnpm wiring below is not a patch and never counts as migration effort.
PATCHES_APPLIED='[]'
PATCHES_FAILED='[]'

if [ "$PHASE" = "patched" ] && [ -d "$PATCHES_DIR" ]; then
  for patch in "$PATCHES_DIR"/*.patch; do
    [ -e "$patch" ] || continue
    name=$(basename "$patch")
    if git apply --verbose "$patch" >>"$OUT_DIR/patches.log" 2>&1; then
      PATCHES_APPLIED=$(jq -c --arg n "$name" '. + [$n]' <<<"$PATCHES_APPLIED")
      echo "applied $name"
    else
      PATCHES_FAILED=$(jq -c --arg n "$name" '. + [$n]' <<<"$PATCHES_FAILED")
      echo "FAILED to apply $name" >&2
    fi
  done
fi

PATCHES_JSON=$(jq -nc --argjson a "$PATCHES_APPLIED" --argjson f "$PATCHES_FAILED" \
  '{applied: $a, failed: $f}')

# A stale patch set is a first-class finding, not a warning to scroll past:
# the pinned signalize ref moved out from under the patches. Never proceed to
# a green run on a partially applied set.
if [ "$(jq -r '.failed | length' <<<"$PATCHES_JSON")" -gt 0 ]; then
  note_failure 13
  write_result
  exit "$WORST"
fi
```

- [ ] **Step 2: Verify the baseline phase ignores patches**

Create a deliberately broken patch:

```bash
cat > integration/patches/signalize/999-garbage.patch <<'EOF'
# changelog: none — deliberate test fixture
# signalize-ref: none
--- a/src/does-not-exist.ts
+++ b/src/does-not-exist.ts
@@ -1,1 +1,1 @@
-nonsense
+more nonsense
EOF
```

Run the baseline command from Task 4 Step 2.
Expected: exit is unchanged from Task 4's recorded value, and `jq '.patches' tmp/integration/baseline/result.json` shows both arrays empty. The baseline must not see patches at all.

- [ ] **Step 3: Verify the patched phase fails loudly on a bad patch**

Run:
```bash
rm -rf tmp/integration/patched && mkdir -p tmp/integration/patched
docker run --rm \
  -e PHASE=patched -e EVENTIZE_VERSION=6.0.0-dev -e SIGNALIZE_REF=v0.31.1 \
  -v "$PWD/tmp/integration/spearwolf-eventize-6.0.0-dev.tgz:/opt/eventize/pkg.tgz:ro" \
  -v "$PWD/integration/patches/signalize:/opt/patches:ro" \
  -v "$PWD/tmp/integration/patched:/out" \
  eventize-integration:test
echo "exit=$?"
```
Expected: exit `13`, and `jq -r '.patches.failed[]' tmp/integration/patched/result.json` prints `999-garbage.patch`.

- [ ] **Step 4: Remove the fixture**

```bash
rm integration/patches/signalize/999-garbage.patch
```

- [ ] **Step 5: Verify a patched run with no patches equals the baseline**

Re-run both commands (Task 4 Step 2 and Step 3 above).
Expected: both phases produce the same `exitCode` in `result.json`. With no patches present the two phases are the same measurement — if they differ, state is leaking between runs and the reset is broken.

- [ ] **Step 6: Commit**

```bash
git add integration/entrypoint.sh
git commit --no-gpg-sign -m "build: apply signalize patches in the patched phase"
```

---

### Task 6: The host runner

**Files:**
- Create: `integration/run.mjs`

**Interfaces:**
- Consumes: `integration/signalize.config.json`, root `package.json` version, `integration/Dockerfile`, `integration/entrypoint.sh`.
- Produces: `tmp/integration/<phase>/result.json` per phase; exit code follows the patched phase (or the only phase run).
- Flags: `--phase=baseline|patched|both` (default `both`), `--ref=<git-ref>`, `--no-build`, `--rebuild-image`.

- [ ] **Step 1: Write the runner**

Create `integration/run.mjs`:

```js
#!/usr/bin/env node
// Mechanical driver for the eventize↔signalize integration harness.
// Builds, packs, builds the image, runs one container per phase. Decides
// nothing: no interpretation, no patch authoring. See integration/README.md.

import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, readFileSync, rmSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const OUT_ROOT = join(ROOT, 'tmp', 'integration');
const IMAGE = 'eventize-integration:local';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const has = (name) => args.includes(`--${name}`);

const config = JSON.parse(
  readFileSync(join(HERE, 'signalize.config.json'), 'utf8'),
);
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

const ref = flag('ref', config.ref);
const phaseArg = flag('phase', 'both');
const phases =
  phaseArg === 'both' ? ['baseline', 'patched'] : [phaseArg];

for (const p of phases) {
  if (p !== 'baseline' && p !== 'patched') {
    console.error(`unknown phase: ${p}`);
    process.exit(2);
  }
}

const run = (cmd, cmdArgs, opts = {}) => {
  console.log(`\n$ ${cmd} ${cmdArgs.join(' ')}`);
  const r = spawnSync(cmd, cmdArgs, {stdio: 'inherit', ...opts});
  if (r.error) throw r.error;
  return r.status ?? 1;
};

const die = (msg, code = 1) => {
  console.error(`\n${msg}`);
  process.exit(code);
};

// --- 1. build + pack --------------------------------------------------------
mkdirSync(OUT_ROOT, {recursive: true});
const tarball = join(OUT_ROOT, `spearwolf-eventize-${pkg.version}.tgz`);

if (!has('no-build')) {
  if (run('npm', ['run', 'build'], {cwd: ROOT}) !== 0) die('eventize build failed');
  rmSync(tarball, {force: true});
  if (
    run('npm', ['pack', '--pack-destination', OUT_ROOT], {cwd: ROOT}) !== 0
  ) {
    die('npm pack failed');
  }
}

if (!existsSync(tarball)) {
  die(`expected tarball not found: ${tarball}\n(did the version change?)`);
}

const sha = createHash('sha256')
  .update(readFileSync(tarball))
  .digest('hex');
console.log(`\neventize ${pkg.version}  sha256=${sha.slice(0, 16)}…`);

// --- 2. build the image -----------------------------------------------------
const buildArgs = [
  'build',
  '-t',
  IMAGE,
  '--build-arg',
  `SIGNALIZE_REPO=${config.repo}`,
  '--build-arg',
  `SIGNALIZE_REF=${ref}`,
];
if (has('rebuild-image')) buildArgs.push('--no-cache');
buildArgs.push(HERE);

if (run('docker', buildArgs) !== 0) die('docker build failed');

// --- 3. run each phase ------------------------------------------------------
const results = {};

for (const phase of phases) {
  const outDir = join(OUT_ROOT, phase);
  rmSync(outDir, {recursive: true, force: true});
  mkdirSync(outDir, {recursive: true});

  console.log(`\n${'='.repeat(70)}\n  phase: ${phase}\n${'='.repeat(70)}`);

  const status = run('docker', [
    'run',
    '--rm',
    '-e',
    `PHASE=${phase}`,
    '-e',
    `EVENTIZE_VERSION=${pkg.version}`,
    '-e',
    `SIGNALIZE_REF=${ref}`,
    '-v',
    `${tarball}:/opt/eventize/pkg.tgz:ro`,
    '-v',
    `${join(HERE, 'patches', 'signalize')}:/opt/patches:ro`,
    '-v',
    `${outDir}:/out`,
    IMAGE,
  ]);

  results[phase] = status;
  console.log(`\nphase ${phase} finished with exit ${status}`);
}

// --- 4. summary -------------------------------------------------------------
console.log(`\n${'='.repeat(70)}`);
for (const phase of phases) {
  const file = join(OUT_ROOT, phase, 'result.json');
  if (!existsSync(file)) {
    console.log(`  ${phase.padEnd(9)} exit ${results[phase]}  (no result.json)`);
    continue;
  }
  const r = JSON.parse(readFileSync(file, 'utf8'));
  const steps = r.steps
    .map((s) => `${s.name}=${s.exitCode}`)
    .join(' ');
  console.log(`  ${phase.padEnd(9)} exit ${r.exitCode}  ${steps}`);
}
console.log(`${'='.repeat(70)}`);
console.log(`artifacts: ${OUT_ROOT}`);

// A red baseline is the measurement, not a failure. The exit code follows the
// patched phase when it ran, so `npm run test:integrations` is only green when
// the patch set actually carries signalize onto this eventize.
process.exit(results.patched ?? results.baseline ?? 1);
```

- [ ] **Step 2: Verify the flags parse without touching Docker**

Run: `node integration/run.mjs --phase=nonsense`
Expected: `unknown phase: nonsense`, exit `2`.

- [ ] **Step 3: Run the full harness**

Run: `npm run test:integrations`
Expected: both phases run, the summary block prints two lines with per-step exit codes, and `tmp/integration/{baseline,patched}/result.json` both exist.

- [ ] **Step 4: Verify `--no-build` reuses the tarball**

Run: `npm run test:integrations -- --no-build --phase=baseline`
Expected: no `npm run build` line in the output, the run proceeds, exit matches the previous baseline.

- [ ] **Step 5: Verify reproducibility**

Run:
```bash
jq -S 'del(.steps[].durationMs)' tmp/integration/baseline/result.json > /tmp/r1.json
rm -rf tmp/integration/baseline
npm run test:integrations -- --no-build --phase=baseline
jq -S 'del(.steps[].durationMs)' tmp/integration/baseline/result.json > /tmp/r2.json
diff /tmp/r1.json /tmp/r2.json && echo REPRODUCIBLE
```
Expected: `REPRODUCIBLE`

- [ ] **Step 6: Verify lint still passes**

Run: `npm run lint`
Expected: PASS — `run.mjs` is inside the eslint glob `**/*.{mjs,cjs}`.

- [ ] **Step 7: Verify the main gate is untouched**

Run: `npm run cbt`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add integration/run.mjs
git commit --no-gpg-sign -m "build: add the host runner for the integration harness"
```

---

### Task 7: The skill and the README

**Files:**
- Create: `.claude/skills/eventize-integration-tests/SKILL.md`
- Create: `integration/README.md`

**Interfaces:**
- Consumes: everything from Tasks 1–6. The skill invokes `npm run test:integrations` and reads `tmp/integration/<phase>/result.json`.
- Produces: `tmp/integration/REPORT.md`.

- [ ] **Step 1: Write the README**

Create `integration/README.md`:

```markdown
# Integration tests: eventize vs. signalize

Runs `@spearwolf/signalize`'s test suite against the **local, unreleased**
eventize build, inside a container. Not part of CI, not part of `cbt`. Local,
on demand.

    npm run test:integrations

Flags: `--phase=baseline|patched|both` (default `both`), `--ref=<git-ref>`,
`--no-build` (reuse the existing tarball), `--rebuild-image`.

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

## Why `tsc --noEmit` runs separately

signalize transpiles through SWC, which strips types without checking them. A
green vitest run proves nothing about the type surface, and the type surface is
exactly what eventize v6 changed.

## Patches

`patches/signalize/NNN-<slug>.patch`, applied in filename order, each carrying:

    # changelog: <the v6.0.0 CHANGELOG entry that causes this>
    # signalize-ref: <ref the patch was authored against>

Patches are written **only** for breakages a CHANGELOG entry explains. An
undocumented breakage gets a report entry instead — patching it would hide the
finding this harness exists to surface.

Nothing here is ever committed to signalize. Adapting signalize is signalize's
job; this measures what that job costs.
```

- [ ] **Step 2: Write the skill**

Create `.claude/skills/eventize-integration-tests/SKILL.md`:

```markdown
---
name: eventize-integration-tests
description: Use when running or interpreting the signalize integration tests for eventize — "integration tests", "test:integrations", "läuft signalize noch gegen v6", checking whether unreleased eventize changes break a real consumer, or triaging a red baseline into CHANGELOG gaps and regressions.
---

# eventize ↔ signalize integration tests

Runs signalize's suite against the local unreleased eventize build and turns the
result into a classified list of breakages. The green run is not the product;
the classification is.

Mechanics live in `integration/` and are described in `integration/README.md`.
Never call `docker` directly — the script owns that, this skill owns judgement.

## Steps

1. **Preflight.** `docker info` succeeds; `integration/signalize.config.json`
   read; note the pinned ref.

2. **Measure.** `npm run test:integrations`. A red baseline is expected and is
   not a failure. Read `tmp/integration/<phase>/result.json`, not the raw logs,
   and drop into `typecheck.log` / `vitest.log` only for detail.

   Exit `11`, `12` or `13` means the harness itself is broken or stale — fix
   that before interpreting anything. Exit `11` in particular means the run
   proved nothing.

3. **Read before guessing.** Read `CHANGELOG.md` under
   `` ## `v6.0.0` (unreleased) `` and
   `skills/using-eventize/references/migration.md` **before** interpreting a
   single error message. The order is binding: reversed, you write patches that
   paper over a genuine regression.

4. **Classify.** Every baseline breakage gets exactly one category:

   | | Finding | Consequence |
   | --- | --- | --- |
   | **A** | breaks, documented, trivial patch | migration is cheap; a number in the report |
   | **B** | breaks, documented, expensive patch | the migration note understates the cost; sharpen `references/migration.md` |
   | **C** | breaks, **not** documented | gap in `CHANGELOG.md`; the action belongs in eventize |
   | **D** | breaks, no patch fixes it | regression in v6, or a feature v6 dropped outright; the action belongs in eventize |
   | **E** | no break, but changed behaviour signalize's tests happen to miss | note for a future spec, on both sides |

   C and D justify the exercise. A is bookkeeping.

   Not a category: a failure from signalize's own toolchain (SWC decorator
   lowering, biome, coverage thresholds). Those are signalize's business and
   must not be reported as eventize findings.

   One special case that looks like B but is C: if `tsc` fails on **module
   resolution** rather than on API shape, the finding is about eventize's
   package manifest, not about signalize's code. eventize's `exports` map
   carries no `types` condition — the top-level `types` field does. `attw
   --pack` passes today, but signalize resolves under `NodeNext` with
   TypeScript 7, a stricter reader than attw's matrix. No patch to signalize
   is the right answer there.

5. **Patch A and B only.** Write to `integration/patches/signalize/`, named
   after the CHANGELOG entry served, with the two header lines from
   `integration/README.md`. Never patch a C or D — that hides the finding.

6. **Iterate.** Re-run the patched phase until green, or until only C and D
   remain. Stopping on C/D is a legitimate end state.

7. **Report** to `tmp/integration/REPORT.md`: baseline vs. patched exit codes
   and step table, the classification table with concrete file:line sites, and
   a closing list of actions that belong in **eventize** (CHANGELOG gaps,
   migration-note gaps, regressions). Summarize the same in chat.

## Boundaries

- Never commit, push or open a PR in signalize.
- Never read or write `~/spaceland/signalize`. The container clones from GitHub.
- Never add this to `cbt` or to a workflow.
- Never publish eventize.
- Never bump the version out of `6.0.0-dev`.
```

- [ ] **Step 3: Verify the skill is discoverable**

Run: `ls .claude/skills/eventize-integration-tests/SKILL.md`
Expected: the path exists. Confirm the frontmatter has both `name` and `description` keys and that `name` matches the directory name.

- [ ] **Step 4: Verify the skill does not ship in the package**

Run: `npm pack --dry-run 2>&1 | grep -c '\.claude'`
Expected: `0`

- [ ] **Step 5: Verify the gate is still untouched**

Run: `npm run cbt`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add integration/README.md .claude/skills/eventize-integration-tests/SKILL.md
git commit --no-gpg-sign -m "docs: add the integration-test skill and runbook"
```

---

## Final verification

Run these in order after Task 7. Every one is from the spec's verification section.

- [ ] `npm run test:integrations` completes both phases and writes a `result.json` per phase.
- [ ] `rm -rf tmp/integration && npm run test:integrations` reproduces both results apart from timings and the commit hash.
- [ ] A garbage patch surfaces in `patches.failed` with exit `13` and never yields a green patched phase.
- [ ] Removing the `overrides` block from the wiring produces exit `11`, not a pass.
- [ ] `npm run cbt` passes.
- [ ] `npm pack --dry-run` lists neither `docs/superpowers/` nor `.claude/`.
- [ ] `git status` is clean and `package.json` still reads `"version": "6.0.0-dev"`.
