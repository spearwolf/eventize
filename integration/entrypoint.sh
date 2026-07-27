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

# Writes $OUT_DIR/result.json from the accumulated STEPS_JSON.
write_result() {
  local commit
  commit=$(git rev-parse HEAD 2>/dev/null || echo 'unknown')
  jq -n \
    --arg phase "$PHASE" \
    --arg ref "${SIGNALIZE_REF:-unknown}" \
    --arg commit "$commit" \
    --arg version "$EVENTIZE_VERSION" \
    --arg resolved "$RESOLVED" \
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

# --- typecheck --------------------------------------------------------------
# The actual guard. signalize transpiles through SWC, which strips types
# without checking them, so a green vitest run proves nothing about the type
# surface. This compiles signalize under module/moduleResolution NodeNext with
# TypeScript 7 against .d.ts files tsup emitted with TypeScript 5.9 — the only
# place those two ever meet.
#
# --skipLibCheck, and the default tsconfig.json rather than tsconfig.lib.json:
#   - Without it the run drowns in six TS2307s from unplugin's and
#     webpack-virtual-modules' own .d.ts files, which reference optional peers
#     (@farmfe/core, @rspack/core, esbuild, webpack, unloader) that signalize
#     never installs. That is signalize toolchain noise, not an eventize
#     finding, and it would mask every real one.
#   - It does not weaken the measurement: errors in signalize's *own* source,
#     including every use of an eventize type and a failure to resolve the
#     module at all, are still reported. Only the internal consistency of
#     third-party declarations is skipped, and eventize's own declarations are
#     covered by `attw --pack` in this repo's cbt gate.
#   - tsconfig.lib.json would dodge the noise too, but it excludes *.spec.ts —
#     and those spec files are the heaviest eventize consumers in the repo.
run_step typecheck typecheck.log pnpm exec tsc --noEmit --skipLibCheck
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
