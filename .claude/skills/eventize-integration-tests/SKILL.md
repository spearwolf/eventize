---
name: eventize-integration-tests
description: Use when running or interpreting the signalize integration tests for eventize — "integration tests", "test:integrations", "läuft signalize noch gegen v6", checking whether local eventize changes break a real consumer, or triaging a red baseline into CHANGELOG gaps and regressions.
---

# eventize ↔ signalize integration tests

Runs signalize's suite against the local working-tree eventize build and turns the
result into a classified list of breakages. The green run is not the product;
the classification is.

Mechanics live in `integration/` and are described in `integration/README.md`.
Never call `docker` directly — the script owns that, this skill owns judgement.

## Steps

1. **Preflight.** `docker info` succeeds; `integration/signalize.config.json`
   read; note the pinned ref (a commit SHA, not a tag — signalize pushes none).

2. **Measure.** `npm run test:integrations`. A red baseline is expected and is
   not a failure. Read `tmp/integration/<phase>/result.json`, not the raw logs,
   and drop into `typecheck.log` / `vitest.log` only for detail.

   Exit `11`, `12` or `13` means the harness itself is broken or stale — fix
   that before interpreting anything. Exit `11` in particular means the run
   proved nothing.

3. **Read before guessing.** Read the newest section of `CHANGELOG.md` — down to
   and including `` ## `v6.0.0` ``, the release the local build descends from —
   and `docs/migration.md` **before** interpreting a single error message. The order is binding: reversed, you write patches that
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
   lowering, biome, coverage thresholds, missing optional peers of `unplugin`).
   Those are signalize's business and must not be reported as eventize findings.

   One special case that looks like B but is C: if `tsc` fails on **module
   resolution** rather than on API shape, the finding is about eventize's
   package manifest, not about signalize's code. eventize's `exports` map
   carries no `types` condition — the top-level `types` field does. `attw
   --pack` passes today, but signalize resolves under `NodeNext` with
   TypeScript 7, a stricter reader than attw's matrix. No patch to signalize is
   the right answer there.

5. **Patch A and B only.** Write to `integration/patches/signalize/`, named
   after the CHANGELOG entry served, with the two header lines from
   `integration/README.md`. Never patch a C or D — that hides the finding.

6. **Iterate.** Re-run the patched phase until green, or until only C and D
   remain. Stopping on C/D is a legitimate end state.

7. **Report** to `tmp/integration/REPORT.md`: baseline vs. patched exit codes
   and step table, the classification table with concrete file:line sites, and
   a closing list of actions that belong in **eventize** (CHANGELOG gaps,
   migration-note gaps, regressions). Summarize the same in chat.

## When everything is green

A fully green baseline is a real result — it was the outcome the first time
this harness ran against signalize v0.31.1 — but report it as a measurement,
not as an absence of work. State which eventize version resolved, how many
tests and suites ran, and that `tsc` was clean. If the run looks *too* clean,
`integration/README.md` has two throwaway fixtures that prove the version
assertion and the typecheck still bite. Use them rather than trusting a green
bar.

## Boundaries

- Never commit, push or open a PR in signalize.
- Never read or write `~/spaceland/signalize`. The container clones from GitHub.
- Never add this to `cbt` or to a workflow.
- Never publish eventize, and never change the version in `package.json`. Both
  are a human's call, and `v6.0.0` being released means the `-dev` suffix no
  longer stands between a stray command and the registry.
