# Audit Backlog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve all 35 findings from `audit.html` (2026-07-25) across five phases and two releases, v5.2.0 and v6.0.0.

**Architecture:** `@spearwolf/eventize` makes any object a synchronous event emitter. `asEventized(obj)` attaches a hidden property keyed by `Symbol.for('eventize')` holding `{store, keeper}` — an `EventStore` (listener registry, binary-search insertion by priority, reference-counted dedup) and an `EventKeeper` (retained-events log). Three public surfaces (standalone functions, `eventize.inject()`, `class Eventize`) all delegate to the same `on`/`emit`/`off` in `eventize-api.ts`. Most findings live in the interplay of refCount dedup, `callAfterApply`, and the keeper.

**Tech Stack:** TypeScript 5.9, tsup (ESM + CJS + types), Jest 30 / ts-jest, ESLint 9 flat config, sinon for fakes, Node ≥ 18.16, zero runtime dependencies.

**Decisions:** `notes/superpowers/specs/2026-07-25-audit-backlog-design.md`
**Findings:** `audit.html` (open in a browser; IDs referenced below match its backlog table)

## Global Constraints

- Every task commits directly to `main`. One commit per finding, with the finding ID in the message: `fix(off): … (MEM-003)`.
- **Always pass `--no-gpg-sign` to `git commit` and `git tag`.** The repo has `commit.gpgsign = true` globally, and a signed commit blocks on an interactive passphrase prompt that a subagent cannot answer. Every `git commit` in this plan is to be run as `git commit --no-gpg-sign -m "…"`, and every `git tag` as `git tag --no-sign`.
- Specs live next to sources as `*.spec.ts`. Jest `testMatch` is restricted to `src/**`.
- Relative imports carry no extension — `tsup` writes the output extensions. (Fixing the four violations is task 1c.)
- `lib/` is generated and git-ignored. Never edit it, never read it to answer a question about behaviour.
- Never let anything the emitter attaches become enumerable on a user object.
- `npm run cbt` (clean → build → `attw --pack` → test → lint → format check) is the only gate that catches dual-format type breakage. Run it at the end of every phase. Individual tasks run `npm test` unless stated otherwise.
- **`npm run cbt` alone is not a cold gate.** `npm run clean` removes `lib/`, `build/`, `dist/`, `types/` and `tmp/` — it does not touch ts-jest's transform cache, which lives outside the repository (`/tmp/jest_rs` on Linux). A stale cache serves previously compiled output and hides type errors that a fresh checkout or a CI runner will hit immediately. This is not hypothetical: it produced a green `cbt` for a change that broke 13 of 25 spec suites. **Any task that touches `package.json` dependencies, `tsconfig.json`, or a `.d.ts` boundary must run `npx jest --clearCache` before its verification run**, and say so in its report.
- Any change to public API or runtime behaviour needs a `CHANGELOG.md` entry under `## Unreleased`.
- Documentation is English. `CLAUDE.md` is a symlink to `AGENTS.md` — edit only `AGENTS.md`.
- Node floor is `>=18.16`. Do not use syntax or globals newer than ES2022 in `src/`.

## Model assignment

Each task names the model to dispatch its subagent with. Mechanical edits go to Haiku, well-specified fixes to Sonnet, semantics and restructuring to Opus.

---

# Phase 0 — Foundation

No behavioural change. Everything here is independent of every other phase.

## Task 1: Dead code, orphaned TODO, import extensions

**Model:** Haiku
**Findings:** IMPL-001, ARCH-002, DX-001

**Files:**
- Modify: `src/utils.ts:26-49` (delete two functions)
- Modify: `src/EventStore.ts:47` (delete comment)
- Modify: `src/types.ts:1-3`, `src/getSubscriptionCount.ts:4` (drop `.js` extensions)

**Interfaces:**
- Consumes: nothing
- Produces: nothing. `definePublicPropertyRO` and `definePublicPropertiesRO` cease to exist; they were never exported from `src/index.ts`.

- [ ] **Step 1: Verify the two functions really are unused**

```bash
grep -rn "definePublicPropertyRO\|definePublicPropertiesRO" src/ docs/ README.md AGENTS.md skills/
```

Expected: hits only in `src/utils.ts` itself (the definition of `definePublicPropertiesRO` calls `definePublicPropertyRO` on line 46). If anything else matches, stop and report — do not delete.

- [ ] **Step 2: Delete both functions from `src/utils.ts`**

Remove lines 23-49 — the `PropertyKey` / `PropertyValue` type aliases are used by `defineHiddenPropertyRO` too, so keep those two lines and delete only the two functions:

```ts
type PropertyKey = string | symbol;
type PropertyValue = any;

export const defineHiddenPropertyRO = <T extends object>(
  obj: T,
  name: PropertyKey,
  value: PropertyValue,
): T => {
  Object.defineProperty(obj, name, {
    value,
    configurable: true,
  });
  return obj;
};
```

That is the entire tail of the file after the change.

- [ ] **Step 3: Delete the orphaned TODO in `src/EventStore.ts`**

Line 47 reads `// TODO removeSimilarListener()` and sits between `isSimilarListenerType` and `removeListenerFromArray`. Delete the line and the blank line that follows it, so `isSimilarListenerType` is followed directly by `const removeListenerFromArray = (`.

Do **not** touch the TODO in `src/subscribeTo.ts:21` — that one is substantive and belongs to task 9.

- [ ] **Step 4: Drop the four `.js` import extensions**

`src/types.ts` lines 1-3:

```ts
import type {EventKeeper} from './EventKeeper';
import type {EventStore} from './EventStore';
import type {NAMESPACE} from './constants';
```

`src/getSubscriptionCount.ts` line 4:

```ts
import {EventizedObject} from './types';
```

- [ ] **Step 5: Run the full gate**

Run: `npm run cbt`
Expected: PASS. `utils.ts` should now be at 100% function coverage; the previous 50%/70.37% was these two functions.

- [ ] **Step 6: Commit**

```bash
git add src/utils.ts src/EventStore.ts src/types.ts src/getSubscriptionCount.ts
git commit -m "chore: drop dead helpers, orphaned TODO and stray .js import extensions (IMPL-001, ARCH-002, DX-001)"
```

---

## Task 2: Bring `@types/sinon` up to the sinon major

**Model:** Sonnet
**Finding:** DEP-001

**Files:**
- Modify: `package.json` (devDependencies)
- Modify: `package-lock.json` (regenerated)

**Interfaces:**
- Consumes: nothing
- Produces: nothing

> **The audit was wrong about the cause, and this task was rewritten mid-execution.** DEP-001 claimed that `sinon` ships its own type definitions from v17 onwards and that `@types/sinon` is therefore redundant. It is not: `node_modules/sinon/package.json` at v21.0.0 has no `types` field, no `typings` field, no `exports["."].types` condition, and the package contains no `.d.ts` file at all. Removing `@types/sinon` broke 13 of 25 spec suites with `TS7016: Could not find a declaration file for module 'sinon'`.
>
> That breakage was not caught for three tasks, because ts-jest's transform cache lives in `/tmp/jest_rs`, outside everything `npm run clean` removes. The cache kept serving output compiled while the old types were still installed, so `npm run cbt` reported green against a tree that could not compile from cold. See the corresponding Global Constraint.
>
> What survives of the finding is its measurable half: `@types/sinon@^17` against `sinon@^21` is five majors of drift, and a `@types` package that stale describes an API the runtime no longer has. The fix is to update it, not to delete it.

- [ ] **Step 1: Verify the premise before acting**

```bash
node -e "const p=require('./node_modules/sinon/package.json'); console.log('version:', p.version, '| types:', p.types ?? p.typings ?? '(none)');"
find node_modules/sinon -name '*.d.ts' | head
```

If `types` reports a path or the `find` returns any file, sinon *does* ship declarations after all — stop and report, because then the original finding was right and this rewrite is wrong.

- [ ] **Step 2: Update the package to the matching major**

```bash
npm install --save-dev @types/sinon@^21.0.1
```

Match the major of the **installed** `sinon`, not the newest `@types/sinon` on the registry. `sinon` is pinned at `^21` here; `@types/sinon@22.0.0` describes `sinon@22`, so installing it would trade a five-major lag for a one-major lead — the same skew DEP-001 objected to, inverted. `@types/sinon@21.0.1` is the exact counterpart. When `sinon` moves to 22 (task 28 or later), `@types/sinon` moves with it, in the same commit.

Verify the pairing rather than assuming it:

```bash
node -e "console.log('sinon:', require('./node_modules/sinon/package.json').version, '| @types/sinon:', require('./node_modules/@types/sinon/package.json').version)"
```

The two majors must match.

- [ ] **Step 3: Clear the transform cache, then run the full gate**

```bash
npx jest --clearCache
npm run cbt
```

Expected: PASS, 25 suites, 414 tests.

The `--clearCache` is not optional. Without it this step proves nothing: a stale cache is precisely what hid the original breakage.

If type errors appear in spec files, they are **real** — five majors of drift means signatures moved. Fix the call sites to match sinon 21's actual API rather than pinning the types back to v17. Report each fix in the commit body.

- [ ] **Step 4: Confirm the suite compiles from cold a second time**

```bash
npx jest --clearCache
npx cross-env NODE_ENV=test npx jest 2>&1 | tail -5
```

Expected: `Tests: 414 passed, 414 total`. Two cold runs, not one — the first proves the fix, the second proves the first was not itself cached.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/
git commit --no-gpg-sign -m "chore(deps): update @types/sinon 17 -> 22 to match sinon 21 (DEP-001)"
```

---

## Task 3: `files` allowlist replaces `.npmignore`

**Model:** Sonnet
**Findings:** PKG-001, DX-002

**Files:**
- Modify: `package.json` (add `files`)
- Delete: `.npmignore`

**Interfaces:**
- Consumes: nothing
- Produces: nothing

`npm pack --dry-run` currently ships 30 files including `audit.html` (39.8 kB of a 112.2 kB tarball) — an internal quality report with a backlog and finding list, sent to every consumer. The cause is a denylist that only knows the files that existed when it was written.

- [ ] **Step 1: Record the current tarball contents**

```bash
npm pack --dry-run 2>&1 | tee /tmp/pack-before.txt
```

Note the file count and unpacked size for the commit message.

- [ ] **Step 2: Add the `files` allowlist to `package.json`**

Insert directly after the `"sideEffects": false,` line:

```json
  "files": [
    "lib",
    "docs",
    "skills",
    "README.md",
    "CHANGELOG.md",
    "LICENSE"
  ],
```

`package.json`, `README.md` and `LICENSE` are always included by npm regardless; listing the latter two is harmless and documents intent.

- [ ] **Step 3: Delete `.npmignore`**

```bash
git rm .npmignore
```

- [ ] **Step 4: Verify the tarball**

```bash
npm pack --dry-run
```

Expected: `audit.html` gone, `src/`, `scripts/`, `.github/`, `AGENTS.md`, `CLAUDE.md`, `eslint.config.mjs`, `tsconfig.json`, `tsup.config.js`, `jest.config.ts` all gone. `lib/`, `docs/`, `skills/`, `README.md`, `CHANGELOG.md`, `LICENSE`, `package.json` present.

If `lib/` is missing, run `npm run build` first — the allowlist can only ship what exists.

- [ ] **Step 5: Commit**

```bash
git add package.json .npmignore
git commit -m "build: ship an npm files allowlist instead of a stale .npmignore denylist (PKG-001, DX-002)"
```

---

## Task 4: Publish script reports failure to CI

**Model:** Sonnet
**Finding:** BUILD-001

**Files:**
- Modify: `scripts/publishPackage.cjs` (full rewrite, 41 lines)

**Interfaces:**
- Consumes: nothing
- Produces: nothing. The script keeps its two documented behaviours — skip `-dev` versions, skip already-released versions — and its `npm run publish:pkg` entry point.

Two paths currently exit 0 without publishing. If `npm show` fails (registry timeout, auth problem), the code lands in the `else` branch, writes to stderr, and never calls `process.exit` — Node exits 0 and the deploy job goes green with no release. And `process.exit(!error ? 0 : error)` hands an `Error` object to `process.exit`, which throws `ERR_INVALID_ARG_TYPE` on Node ≥ 20, burying the real publish failure under a misleading TypeError.

- [ ] **Step 1: Rewrite the script**

Replace the entire contents of `scripts/publishPackage.cjs`:

```js
#!/usr/bin/env node

const {execFileSync} = require('node:child_process');
const process = require('node:process');

const pkgJson = require('../package.json');

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

if (pkgJson.version.endsWith('-dev')) {
  console.log(
    'skip publishing, version',
    pkgJson.version,
    'is marked as a *development* version',
  );
  process.exit(0);
}

let versions;
try {
  const stdout = execFileSync(
    npm,
    ['show', pkgJson.name, 'versions', '--json'],
    {encoding: 'utf8'},
  );
  versions = JSON.parse(stdout);
} catch (error) {
  const stderr = String(error.stderr ?? '');
  if (stderr.includes('E404') || stderr.includes('404 Not Found')) {
    // package has never been published — this is the first release
    versions = [];
  } else {
    console.error(
      `failed to query the registry for ${pkgJson.name}:`,
      error.message,
    );
    if (stderr) console.error(stderr);
    process.exit(1);
  }
}

// `npm show … versions --json` returns a bare string when exactly one
// version exists, an array otherwise.
const released = Array.isArray(versions) ? versions : [versions];

if (released.includes(pkgJson.version)) {
  console.log(
    'skip publishing, version',
    pkgJson.version,
    'is already released',
  );
  process.exit(0);
}

try {
  execFileSync(npm, ['publish', '--access', 'public'], {stdio: 'inherit'});
} catch (error) {
  console.error('npm publish failed:', error.message);
  process.exit(1);
}
```

- [ ] **Step 2: Verify the already-released path**

The working tree is at a released version, so the script must skip and exit 0:

```bash
node scripts/publishPackage.cjs; echo "exit=$?"
```

Expected: `skip publishing, version 5.1.0 is already released` and `exit=0`.

- [ ] **Step 3: Verify the `-dev` path**

```bash
node -e "
const fs=require('fs');
const p=JSON.parse(fs.readFileSync('package.json','utf8'));
const orig=p.version; p.version=orig+'-dev';
fs.writeFileSync('package.json',JSON.stringify(p,null,2)+'\n');
"
node scripts/publishPackage.cjs; echo "exit=$?"
git checkout package.json
```

Expected: `is marked as a *development* version` and `exit=0`. The `git checkout` restores `package.json` — confirm with `git diff --stat package.json` that it is clean afterwards.

- [ ] **Step 4: Verify the registry-failure path exits non-zero**

```bash
node -e "
const {execFileSync}=require('node:child_process');
try {
  execFileSync('node',['scripts/publishPackage.cjs'],{
    env:{...process.env, npm_config_registry:'http://127.0.0.1:1'},
    stdio:'pipe',
  });
  console.log('UNEXPECTED: exited 0');
} catch (e) {
  console.log('exit code:', e.status);
}
"
```

Expected: `exit code: 1`. Before the fix this printed `UNEXPECTED: exited 0` — that is the whole finding.

- [ ] **Step 5: Lint**

Run: `npm run lint`
Expected: PASS. `eslint.config.mjs` already sets `@typescript-eslint/no-require-imports: 0` for `**/*.cjs`.

- [ ] **Step 6: Commit**

```bash
git add scripts/publishPackage.cjs
git commit -m "build(release): exit non-zero when publish or registry lookup fails (BUILD-001)"
```

---

## Task 5: Align both workflows, add a Node matrix

**Model:** Sonnet
**Findings:** BUILD-002, BUILD-003, DX-003

**Files:**
- Modify: `.github/workflows/dev.yml` (full rewrite)
- Modify: `.github/workflows/main.yml` (full rewrite)

**Interfaces:**
- Consumes: task 6 adds `--coverage` to the test step. Write the workflows **with** `npm test -- --coverage` already in place; task 6 only adds the Jest-side threshold. If task 6 runs first, this task's file contents still apply verbatim.
- Produces: nothing

`dev.yml` uses `actions/checkout@v3` / `actions/setup-node@v3` on Node 18, `main.yml` the v4 actions on Node 24. The v3 actions run on a retired Node 16 runner and warn on every run. `engines.node` promises `>=18.16`, so 20 and 22 are never exercised. And the deploy job installs with `npm i`, which may mutate the lockfile and publish an artifact built from a tree no test ever saw.

- [ ] **Step 1: Rewrite `.github/workflows/dev.yml`**

```yaml
name: Continuous Integration

on:
  push:
    branches-ignore: [ "main" ]

jobs:
  test:
    name: Run tests (node ${{ matrix.node }})
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        node: [18, 20, 22, 24]
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node }}
          cache: 'npm'

      - run: npm ci
        name: Install dependencies

      - run: npm test -- --coverage
        name: Run tests

      - run: npm run build
        name: Run build

      - run: npm run lint
        name: Check linting

      - run: npm run format:check
        name: Check formatting

      - run: npm run checkPkgTypes
        name: Check package type definitions
```

- [ ] **Step 2: Rewrite `.github/workflows/main.yml`**

Identical `test` job, plus the deploy job with `npm ci`:

```yaml
name: Build and Deployment

on:
  push:
    branches: [ "main" ]

permissions:
  id-token: write  # Required for OIDC
  contents: read

jobs:
  test:
    name: Run tests (node ${{ matrix.node }})
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        node: [18, 20, 22, 24]
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node }}
          cache: 'npm'

      - run: npm ci
        name: Install dependencies

      - run: npm test -- --coverage
        name: Run tests

      - run: npm run build
        name: Run build

      - run: npm run lint
        name: Check linting

      - run: npm run format:check
        name: Check formatting

      - run: npm run checkPkgTypes
        name: Check package type definitions

  deploy:
    name: Deploy package
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: 'npm'
          always-auth: true
          registry-url: https://registry.npmjs.org
          scope: '@spearwolf'

      - run: npm ci
        name: Install dependencies

      - run: npm run build
        name: Build package

      - run: npm run publish:pkg
        name: Publish package
```

`needs: test` waits for every matrix leg, so deploy only runs when all four Node versions passed.

- [ ] **Step 3: Verify the YAML parses**

```bash
node -e "
const fs=require('fs');
for (const f of ['.github/workflows/dev.yml','.github/workflows/main.yml']) {
  const s=fs.readFileSync(f,'utf8');
  if (s.includes('@v3')) throw new Error(f+' still references a v3 action');
  if (/^\s+- run: npm i\s*$/m.test(s)) throw new Error(f+' still uses npm i');
  console.log(f, 'ok');
}
"
```

Expected: both files report `ok`.

- [ ] **Step 4: Verify locally that the test command works with the matrix syntax**

Run: `npm test -- --coverage`
Expected: PASS, coverage table printed.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/dev.yml .github/workflows/main.yml
git commit -m "ci: v4 actions, node 18/20/22/24 matrix, npm ci in deploy (BUILD-002, BUILD-003, DX-003)"
```

---

## Task 6: Coverage threshold

**Model:** Sonnet
**Finding:** TEST-001

**Files:**
- Modify: `jest.config.ts`

**Interfaces:**
- Consumes: task 1 (dead-code removal raises `utils.ts` coverage; the threshold is set against the post-task-1 numbers)
- Produces: a binding coverage floor. Later tasks that add code must add specs or the gate fails.

414 tests at 96.13% statements / 94.32% branches / 93.07% functions is a good number that nothing protects. `jest.config.ts` has neither `collectCoverageFrom` nor `coverageThreshold`, and no workflow ran Jest with `--coverage`.

- [ ] **Step 1: Measure the current numbers**

Run: `npm test -- --coverage`

Record the four `All files` percentages. Task 1 must be committed first, otherwise the numbers are lower than the threshold assumes.

- [ ] **Step 2: Add coverage configuration to `jest.config.ts`**

Insert after the `clearMocks: true,` line:

```ts
  // Which files count towards coverage — sources only, no specs, no fixtures
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.spec.ts',
    '!src/__test-utils__/**',
  ],

  // Set just below the measured state so the threshold binds instead of
  // decorating. Raise it when coverage rises; never lower it to make a
  // build pass.
  coverageThreshold: {
    global: {
      statements: 97,
      branches: 93,
      functions: 93,
      lines: 97,
    },
  },
```

These numbers replace the 95/93/92/95 the audit proposed. The audit measured 96.13 / 94.32 / 93.07 against the tree as it stood; task 1 deleted two uncovered functions from `src/utils.ts`, and the state measured **within the `collectCoverageFrom` scope above** is now **97.52 statements / 94.32 branches / 94.01 functions / 98 lines**. Against that, 95/93/92/95 leaves two to three points of slack and decorates rather than binds.

Measure inside the scope, not from the unfiltered run. The full-tree figures are about a tenth of a point higher (97.62 / 94.32 / 94.53 / 98.08) because they include `src/__test-utils__`, which the config excludes — and the threshold binds against the filtered number.

`branches` and `functions` deliberately keep a wider margin than `statements` and `lines`. At 93 against 94.32 and 94.01 they hold roughly a point each; at 94 the functions gate would hold 0.02 points, meaning a single uncovered function anywhere turns the build red. Both metrics are the volatile ones, and phases 1 and 3 add a lot of conditional code and a lot of small functions.

- [ ] **Step 3: Verify the threshold passes**

Run: `npm test -- --coverage`
Expected: PASS, no `Jest: "global" coverage threshold … not met` line.

- [ ] **Step 4: Verify the threshold actually binds**

Temporarily raise `statements` to `99` and re-run:

```bash
npm test -- --coverage 2>&1 | grep -i "coverage threshold"
```

Expected: a failure message naming the statements threshold. Then restore `95`. This step proves the gate is wired; without it a typo in the config key would go unnoticed.

- [ ] **Step 5: Commit**

```bash
git add jest.config.ts
git commit -m "test: bind coverage with collectCoverageFrom and a global threshold (TEST-001)"
```

---

## Phase 0 gate

- [ ] Run `npm run cbt` — expected PASS
- [ ] Run `npm pack --dry-run` — expected: no `audit.html`, no `src/`

---

# Phase 1 — Verified defects and additive API → v5.2.0

## Task 7: `off(ε, eventName, listenerObject)` removes the method-name form

**Model:** Sonnet
**Finding:** MEM-003 (high)

**Files:**
- Modify: `src/EventStore.ts:63-80` (`removeSimilarListenersFromArray`)
- Test: `src/off.spec.ts` (new describe block)

**Interfaces:**
- Consumes: nothing
- Produces: nothing. `removeSimilarListenersFromArray` keeps its signature `(fromArray, eventName, listenerObject)`.

`on(ε,'foo','foo',lo)` followed by `off(ε,'foo',lo)` leaves the subscription at 1. The filter tests `listener.eventName === eventName && listener.listener === listenerObject`, but in the method-name form `listener.listener` is the string `'foo'` — the object sits in `listener.listenerObject`. `docs/off.md:18` and `README.md` present `off(emitter, eventName, listenerObject)` without qualification as *the* way to detach a listener object from a single event.

- [ ] **Step 1: Write the failing test**

Append to `src/off.spec.ts`, inside the top-level `describe('off()', …)`:

```ts
  describe('by event name and listener object', () => {
    it('removes the listener-object form', () => {
      const obj = eventize();
      const listenerObject = {foo: fake()};

      on(obj, 'foo', listenerObject);
      expect(getSubscriptionCount(obj)).toBe(1);

      off(obj, 'foo', listenerObject);
      expect(getSubscriptionCount(obj)).toBe(0);
    });

    it('removes the method-name form', () => {
      const obj = eventize();
      const listenerObject = {foo: fake()};

      on(obj, 'foo', 'foo', listenerObject);
      expect(getSubscriptionCount(obj)).toBe(1);

      off(obj, 'foo', listenerObject);
      expect(getSubscriptionCount(obj)).toBe(0);
    });

    it('leaves listeners on other event names alone', () => {
      const obj = eventize();
      const listenerObject = {foo: fake(), bar: fake()};

      on(obj, 'foo', 'foo', listenerObject);
      on(obj, 'bar', 'bar', listenerObject);
      expect(getSubscriptionCount(obj)).toBe(2);

      off(obj, 'foo', listenerObject);
      expect(getSubscriptionCount(obj)).toBe(1);

      emit(obj, 'bar');
      expect(listenerObject.bar.callCount).toBe(1);
    });
  });
```

Add `getSubscriptionCount` to the import at the top of the file — it currently reads `import {emit, eventize, off, on, once, retain} from './index';`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/off.spec.ts -t "by event name and listener object"`
Expected: `removes the method-name form` FAILS with `expect(received).toBe(expected) // Expected: 0, Received: 1`. The other two pass.

- [ ] **Step 3: Fix the filter**

In `src/EventStore.ts`, `removeSimilarListenersFromArray`:

```ts
const removeSimilarListenersFromArray = (
  fromArray: Array<EventListener>,
  eventName: unknown,
  listenerObject: unknown,
) => {
  const similarListeners: EventListener[] = [];
  for (const listener of fromArray) {
    if (
      (eventName == null && listener.listenerObject === listenerObject) ||
      // Both subscription shapes must match: on(ε, name, listenerObject)
      // parks the object in `listener`, on(ε, name, methodName, listenerObject)
      // parks it in `listenerObject`.
      (listener.eventName === eventName &&
        (listener.listener === listenerObject ||
          listener.listenerObject === listenerObject))
    ) {
      similarListeners.push(listener);
    }
  }
  for (const listener of similarListeners) {
    removeListenerFromArray(fromArray, listener, undefined);
  }
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/off.spec.ts`
Expected: PASS.

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: PASS. `removeSimilarListenersFromArray` is also reached from `removeByListener` with `eventName === undefined`, which the first branch handles — that path is unchanged.

- [ ] **Step 6: Update the CHANGELOG**

Under `## Unreleased` in `CHANGELOG.md`:

```markdown
- **Fix:** `off(ε, eventName, listenerObject)` now detaches listeners registered in the method-name form `on(ε, eventName, methodName, listenerObject)`. The filter in `removeSimilarListenersFromArray` compared `listener.listener` against the listener object, which only matches the `on(ε, eventName, listenerObject)` shape — in the method-name form `listener.listener` holds the method name and the object sits in `listener.listenerObject`. Code following `docs/off.md` believed it had cleaned up while the emitter kept holding the listener object and everything reachable from it. Affects `src/EventStore.ts`.
```

- [ ] **Step 7: Commit**

```bash
git add src/EventStore.ts src/off.spec.ts CHANGELOG.md
git commit -m "fix(off): detach the method-name listener form by event name and object (MEM-003)"
```

---

## Task 8: Wildcard handling in the retain API

**Model:** Opus
**Finding:** BUG-001 (high), plus the bulk-clear half of MEM-001

**Files:**
- Modify: `src/EventKeeper.ts` (add `removeAll()`, `clearAll()`, harden `replayTo`)
- Modify: `src/eventize-api.ts` (`retain`, `unretain`, `retainClear`)
- Test: `src/retain.spec.ts`, `src/unretain.spec.ts`, `src/retainClear.spec.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `EventKeeper.removeAll(): void` — clears both `eventNames` and `events`. Used by task 23 (MEM-001).
  - `EventKeeper.clearAll(): void` — clears `events` only, leaving retain policies intact.

`retain(ε,'*')` files `'*'` in `eventNames` as an ordinary name. A later `on(ε,'*',fn)` calls `replayTo('*')`, which walks every known name through the `isCatchEmAll` branch — including `'*'` itself — and recurses without bound. Result: `RangeError: Maximum call stack size exceeded`, taking the process with it. `emit()` and `_duckEmit()` both reject `'*'` with an explicit message; `retain()` passes it through silently.

Per the design doc, `unretain(ε,'*')` and `retainClear(ε,'*')` get bulk semantics in the same pass — they were no-ops before, so this is additive, and it means task 23 has nothing to undo.

- [ ] **Step 1: Write the failing tests**

Append to `src/retain.spec.ts`:

```ts
  describe("wildcard '*'", () => {
    it('rejects retain(ε, "*")', () => {
      const obj = eventize();
      expect(() => retain(obj, '*')).toThrow(/subscribe/i);
    });

    it('rejects an array containing "*"', () => {
      const obj = eventize();
      expect(() => retain(obj, ['foo', '*'])).toThrow(/subscribe/i);
    });

    it('does not register "*" as a retained name after a rejected call', () => {
      const obj = eventize();
      expect(() => retain(obj, '*')).toThrow();

      // the crash this guards against: a wildcard subscribe used to recurse
      // through the '*' entry in eventNames until the stack blew
      const listener = fake();
      expect(() => on(obj, '*', listener)).not.toThrow();
    });
  });
```

Append to `src/unretain.spec.ts`:

```ts
  describe("bulk form unretain(ε, '*')", () => {
    it('drops every retain policy and every retained value', () => {
      const obj = eventize();

      retain(obj, 'a');
      retain(obj, 'b');
      emit(obj, 'a', 1);
      emit(obj, 'b', 2);

      unretain(obj, '*');

      const listener = fake();
      on(obj, 'a', listener);
      on(obj, 'b', listener);
      expect(listener.callCount).toBe(0);

      // policy is gone too: a later emit is not retained either
      emit(obj, 'a', 3);
      const late = fake();
      on(obj, 'a', late);
      expect(late.callCount).toBe(0);
    });
  });
```

Append to `src/retainClear.spec.ts`:

```ts
  describe("bulk form retainClear(ε, '*')", () => {
    it('drops every retained value but keeps the retain policies', () => {
      const obj = eventize();

      retain(obj, 'a');
      retain(obj, 'b');
      emit(obj, 'a', 1);
      emit(obj, 'b', 2);

      retainClear(obj, '*');

      const listener = fake();
      on(obj, 'a', listener);
      expect(listener.callCount).toBe(0);

      // policy survived: the next emit is retained again
      emit(obj, 'a', 3);
      const late = fake();
      on(obj, 'a', late);
      expect(late.calledWith(3)).toBe(true);
    });
  });
```

Check each file's import line and add whatever it is missing from `{emit, eventize, fake, on, retain, retainClear, unretain}` — `fake` comes from `sinon`, the rest from `./index`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/retain.spec.ts src/unretain.spec.ts src/retainClear.spec.ts`
Expected: the three new describe blocks FAIL. The `retain` ones fail with "Received function did not throw"; the bulk ones fail because the listeners still receive replayed values.

Do **not** write a test that actually triggers the stack overflow — a `RangeError` at that depth is not reliably catchable and can take the worker down. The third `retain` test covers the same ground safely by proving `'*'` never enters `eventNames`.

- [ ] **Step 3: Add the keeper methods and harden `replayTo`**

In `src/EventKeeper.ts`, add two methods after `clear()`:

```ts
  /** Drops every retain policy and every retained value. */
  removeAll(): void {
    this.eventNames.clear();
    this.events.clear();
  }

  /** Drops every retained value, keeping the retain policies in place. */
  clearAll(): void {
    this.events.clear();
  }
```

And guard the catch-em-all branch of `replayTo`:

```ts
    } else {
      this.eventNames.forEach((name) => {
        // '*' can never be a retained name — retain() rejects it — but the
        // guard costs nothing and stops any future path that lets it in from
        // recursing through this branch forever.
        if (!isCatchEmAll(name)) {
          this.replayTo(name, eventListener, sortedEvents);
        }
      });
    }
```

- [ ] **Step 4: Reject and route the wildcard in `src/eventize-api.ts`**

Add a helper next to `isDuckTarget` (around line 126):

```ts
const hasWildcard = (eventNames: unknown): boolean =>
  Array.isArray(eventNames)
    ? eventNames.some((name) => name === EVENT_CATCH_EM_ALL)
    : eventNames === EVENT_CATCH_EM_ALL;
```

Then the three implementations:

```ts
// implementation
export function retain(obj: object, eventNames: any): void {
  if (hasWildcard(eventNames)) {
    throw new Error(
      "retain() must be called with a concrete event name — '*' is reserved for subscribing to all events and cannot be retained",
    );
  }
  const eventizedObj = asEventized(obj);
  const {keeper} = eventizedObj[NAMESPACE];
  keeper.add(eventNames);
}
```

```ts
// implementation
export function retainClear(eventizedObj: object, eventNames: any): void {
  if (!isEventized(eventizedObj)) {
    throw new Error('object is not eventized');
  }
  const {keeper} = eventizedObj[NAMESPACE];
  if (hasWildcard(eventNames)) {
    keeper.clearAll();
    return;
  }
  keeper.clear(eventNames);
}
```

```ts
// implementation
export function unretain(eventizedObj: object, eventNames: any): void {
  if (!isEventized(eventizedObj)) {
    throw new Error('object is not eventized');
  }
  const {keeper} = eventizedObj[NAMESPACE];
  if (hasWildcard(eventNames)) {
    keeper.removeAll();
    return;
  }
  keeper.remove(eventNames);
}
```

An array containing `'*'` clears everything rather than the listed names — the wildcard wins. That is the same rule `off()` follows and keeps the behaviour predictable.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- src/retain.spec.ts src/unretain.spec.ts src/retainClear.spec.ts src/EventKeeper.spec.ts`
Expected: PASS.

- [ ] **Step 6: Run the whole suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Update docs and CHANGELOG**

`docs/retain.md` — add to the notes section:

```markdown
`'*'` is subscribe-only. `retain(ε, '*')` throws, matching `emit()`. On
`unretain()` and `retainClear()` the wildcard means *all retained events*:
`unretain(ε, '*')` drops every retain policy and every retained value,
`retainClear(ε, '*')` drops the values and keeps the policies. An array
containing `'*'` is treated as the wildcard, whatever else it lists.
```

`CHANGELOG.md`, under `## Unreleased`:

```markdown
- **Fix:** `retain(ε, '*')` now throws instead of filing `'*'` as an ordinary retained name. It used to be accepted silently, and a later `on(ε, '*', fn)` then recursed through the `'*'` entry in `EventKeeper.replayTo()` until the stack overflowed — a `RangeError` that took the whole process with it and gave no hint of the cause. `'*'` remains subscribe-only, exactly as `emit()` already enforced. `EventKeeper.replayTo()` additionally skips wildcard names in its catch-em-all branch, so no future path can reintroduce the recursion. Affects `src/eventize-api.ts`, `src/EventKeeper.ts`.
- **Feature:** `unretain(ε, '*')` and `retainClear(ε, '*')` gained bulk semantics — the former drops every retain policy and every retained value, the latter drops the values and keeps the policies. Both were silent no-ops before, so nothing that worked stops working. An array containing `'*'` is treated as the wildcard regardless of what else it lists.
```

- [ ] **Step 8: Commit**

```bash
git add src/EventKeeper.ts src/eventize-api.ts src/retain.spec.ts src/unretain.spec.ts src/retainClear.spec.ts docs/retain.md CHANGELOG.md
git commit -m "fix(retain): reject the wildcard, add bulk unretain/retainClear (BUG-001)"
```

---

## Task 9: Replay retained events only on actual insertion

**Model:** Opus
**Finding:** CORR-001 (high)

**Files:**
- Modify: `src/subscribeTo.ts:9-23` (`registerEventListener`)
- Test: `src/retain.spec.ts`

**Interfaces:**
- Consumes: nothing
- Produces: nothing. `store.add()` keeps its signature — the insert-vs-dedup distinction is made by identity comparison at the call site, which needs no API change.

`retain(ε,'foo'); emit(ε,'foo','RETAINED')` followed by two `on(ε,'foo',lo)` calls delivers `'RETAINED'` twice, although the store holds one subscription with `refCount = 2`. `registerEventListener` calls `keeper.replayTo()` unconditionally, even when `store.add()` merely bumped an existing listener's counter. The TODO on `src/subscribeTo.ts:21` names exactly this gap. In reducer or counting patterns it double-books values.

- [ ] **Step 1: Write the failing test**

Append to `src/retain.spec.ts`:

```ts
  describe('deduplicated listener objects', () => {
    it('replays a retained event only once when on() dedups the listener', () => {
      const obj = eventize();
      const listenerObject = {foo: fake()};

      retain(obj, 'foo');
      emit(obj, 'foo', 'RETAINED');

      on(obj, 'foo', listenerObject);
      on(obj, 'foo', listenerObject);

      expect(getSubscriptionCount(obj)).toBe(1);
      expect(listenerObject.foo.callCount).toBe(1);
      expect(listenerObject.foo.calledWith('RETAINED')).toBe(true);
    });

    it('still replays to a genuinely new listener', () => {
      const obj = eventize();
      const first = {foo: fake()};
      const second = {foo: fake()};

      retain(obj, 'foo');
      emit(obj, 'foo', 'RETAINED');

      on(obj, 'foo', first);
      on(obj, 'foo', second);

      expect(getSubscriptionCount(obj)).toBe(2);
      expect(first.foo.callCount).toBe(1);
      expect(second.foo.callCount).toBe(1);
    });
  });
```

Add `getSubscriptionCount` and `off` to the file's `./index` import if missing.

- [ ] **Step 2: Run the tests to verify the first fails**

Run: `npm test -- src/retain.spec.ts -t "deduplicated listener objects"`
Expected: `replays a retained event only once` FAILS with `Expected: 1, Received: 2`. The second test passes already.

- [ ] **Step 3: Replay only when a new listener was inserted**

In `src/subscribeTo.ts`:

```ts
const registerEventListener = (
  store: EventStore,
  keeper: EventKeeper,
  eventName: EventName,
  priority: number,
  listener: unknown,
  listenerObject: ListenerObjectType,
  retainedEvents: KeeperEvent[],
): EventListener => {
  const newListener = new EventListener(
    eventName,
    priority,
    listener,
    listenerObject,
  );
  const el = store.add(newListener);
  // store.add() returns the argument when it inserted, or an existing similar
  // listener whose refCount it bumped. Replaying to the latter would deliver
  // the retained event a second time to a listener that already got it.
  if (el === newListener) {
    keeper.replayTo(eventName, el, retainedEvents);
  }
  return el;
};
```

The TODO comment on the old line 21 goes away with this change.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/retain.spec.ts`
Expected: PASS.

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: PASS. Watch `src/on_multiple_times.spec.ts` in particular — it exercises the dedup path directly.

- [ ] **Step 6: Update the CHANGELOG**

```markdown
- **Fix:** A retained event is no longer replayed twice when `on()` deduplicates the subscription. Registering the same listener object for the same event a second time bumps an existing listener's reference count instead of inserting a new one, but `registerEventListener` called `keeper.replayTo()` either way — so the listener received the retained value once per `on()` call while the store reported a single subscription. Reducer and counting patterns double-booked as a result. The replay now runs only when `store.add()` actually inserted. Affects `src/subscribeTo.ts`.
```

- [ ] **Step 7: Commit**

```bash
git add src/subscribeTo.ts src/retain.spec.ts CHANGELOG.md
git commit -m "fix(retain): replay retained events only when the listener is newly inserted (CORR-001)"
```

---

## Task 10: `once()` must not consume itself on a missed dispatch

**Model:** Opus
**Finding:** BUG-002 (medium)

**Files:**
- Modify: `src/EventListener.ts:15-34` (`apply` / `emit` helpers return a boolean), `:97-137` (`EventListener.apply`)
- Test: `src/once.spec.ts`

**Interfaces:**
- Consumes: nothing
- Produces: the module-level helpers in `EventListener.ts` now return `boolean` (`true` = something was actually called). Task 20 rewrites this file's dispatch switch and must preserve that contract.

`once(ε,'foo',{})` followed by `emit(ε,'foo')` unsubscribes the listener although nothing ran — the object has neither a `foo` method nor an `emit`. Supply the method afterwards and nothing fires. In the `LISTENER_IS_OBJ` branch `callAfterApply()` sits outside the `typeof func === 'function'` check and also runs when the `emit()` fallback found nothing either. Late-initialised listener objects are a normal pattern; there the `once()` evaporates silently.

Per the design doc this is fixed for `LISTENER_IS_NAMED_FUNC` too — `listenerObject[methodName]` can be absent the same way, and fixing one branch would create a fresh asymmetry. `LISTENER_IS_FUNC` needs no change: `listener` is a function by construction.

- [ ] **Step 1: Write the failing tests**

Append to `src/once.spec.ts`:

```ts
  describe('when nothing was actually called', () => {
    it('keeps the subscription for a listener object without a matching method', () => {
      const obj = eventize();
      const listenerObject: {foo?: () => void} = {};

      once(obj, 'foo', listenerObject);
      emit(obj, 'foo');

      expect(getSubscriptionCount(obj)).toBe(1);

      // the method arrives late — the once() must still be live
      const handler = fake();
      listenerObject.foo = handler;
      emit(obj, 'foo', 'payload');

      expect(handler.calledWith('payload')).toBe(true);
      expect(getSubscriptionCount(obj)).toBe(0);
    });

    it('keeps the subscription for a method name that does not exist yet', () => {
      const obj = eventize();
      const listenerObject: {handler?: () => void} = {};

      once(obj, 'foo', 'handler', listenerObject);
      emit(obj, 'foo');

      expect(getSubscriptionCount(obj)).toBe(1);

      const handler = fake();
      listenerObject.handler = handler;
      emit(obj, 'foo', 'payload');

      expect(handler.calledWith('payload')).toBe(true);
      expect(getSubscriptionCount(obj)).toBe(0);
    });

    it('still consumes the once when the emit() fallback runs', () => {
      const obj = eventize();
      const emitFake = fake();
      const listenerObject = {emit: emitFake};

      once(obj, 'foo', listenerObject);
      emit(obj, 'foo', 'payload');

      expect(emitFake.calledWith('foo', 'payload')).toBe(true);
      expect(getSubscriptionCount(obj)).toBe(0);
    });
  });
```

Add `getSubscriptionCount` to the `./index` import if missing.

- [ ] **Step 2: Run the tests to verify the first two fail**

Run: `npm test -- src/once.spec.ts -t "when nothing was actually called"`
Expected: the first two FAIL with `Expected: 1, Received: 0` at the first assertion. The third passes already.

- [ ] **Step 3: Make the helpers report whether they called anything**

In `src/EventListener.ts`:

```ts
/** Returns true when `func` was actually callable and got invoked. */
const apply = (
  context: unknown,
  func: EmitFnType,
  args: EventArgs,
  returnValue?: ReturnValue,
): boolean => {
  if (typeof func === 'function') {
    const retVal = func.apply(context, args);
    if (retVal != null) {
      returnValue?.(retVal);
    }
    return true;
  }
  return false;
};

const emit = (
  eventName: EventName,
  listener: {emit: EmitFnType},
  args: EventArgs,
  returnValue?: ReturnValue,
): boolean =>
  apply(listener, listener.emit, [eventName].concat(args), returnValue);
```

- [ ] **Step 4: Gate `callAfterApply` on an actual call**

Rewrite the switch in `EventListener.apply`:

```ts
    switch (this.listenerType) {
      case LISTENER_IS_FUNC:
        // @ts-expect-error listenerType discriminant guarantees `listener` is a callable; TS can't infer that from a numeric tag.
        apply(listenerObject, listener, args, returnValue);
        if (this.callAfterApply) this.callAfterApply();
        break;

      case LISTENER_IS_NAMED_FUNC: {
        const didCall = apply(
          listenerObject,
          // @ts-expect-error listenerType discriminant guarantees `listener` is a string/symbol method key on `listenerObject`.
          listenerObject[listener],
          args,
          returnValue,
        );
        // A once() must survive a dispatch that found no method — late-bound
        // listener objects are a normal pattern.
        if (didCall && this.callAfterApply) this.callAfterApply();
        break;
      }

      case LISTENER_IS_OBJ: {
        // @ts-expect-error listenerType discriminant guarantees `listener` is an indexable object whose own keys are event names.
        const func = listener[eventName];
        if (this.isCatchEmAll || this.eventName === eventName) {
          const didCall =
            apply(listener, func, args, returnValue) ||
            // @ts-expect-error listenerType discriminant guarantees `listener` is an object that may expose an `emit` method.
            emit(eventName, listener, args, returnValue);
          if (didCall && this.callAfterApply) this.callAfterApply();
        }
        break;
      }
    }
```

`LISTENER_IS_FUNC` keeps the unconditional `callAfterApply` — a function listener is always callable, so gating it would only add a branch that is never false.

Note the `||` short-circuit in `LISTENER_IS_OBJ`: the `emit` fallback runs only when `apply` found no method, which is the existing behaviour. The previous code inlined the `func.apply` call; routing it through the shared `apply` helper is equivalent and removes the duplication.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- src/once.spec.ts`
Expected: PASS.

- [ ] **Step 6: Run the whole suite**

Run: `npm test`
Expected: PASS. `src/emit-ducktyping.spec.ts` and `src/EventListener.spec.ts` exercise all three branches; a failure there means the `||` short-circuit changed dispatch order.

- [ ] **Step 7: Update the CHANGELOG**

```markdown
- **Fix:** `once()` no longer consumes itself when the dispatch found nothing to call. `once(ε, 'foo', {})` followed by `emit(ε, 'foo')` unsubscribed the listener even though the object had neither a `foo` method nor an `emit` fallback — supplying the method afterwards then fired nothing. `callAfterApply` now runs only when a method or the `emit` fallback actually executed. The same guard applies to the method-name form `once(ε, 'foo', 'handler', obj)`, where `obj.handler` can be absent in exactly the same way; fixing only the listener-object branch would have created a fresh asymmetry. Function listeners are unaffected — they are callable by construction. Affects `src/EventListener.ts`.
```

- [ ] **Step 8: Commit**

```bash
git add src/EventListener.ts src/once.spec.ts CHANGELOG.md
git commit -m "fix(once): keep the subscription when no listener method was called (BUG-002)"
```

---

## Task 11: `once()` honours the `UnsubscribeFunc` contract

**Model:** Sonnet
**Finding:** API-001 (medium)

**Files:**
- Modify: `src/eventize-api.ts:386-405` (`once` implementation)
- Test: `src/once.spec.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `once()` returns a function carrying `.listener` (single event) or `.listeners` (array form), matching what `on()` already returns via `makeUnsubscribe`.

`UnsubscribeFunc` is declared as a function **with** `.listener` or `.listeners`. `on()` delivers that; `once()` wraps the handle in its own closure and returns it with `as UnsubscribeFunc` without forwarding the properties. `Object.keys(on(…))` yields `["listener"]`, `Object.keys(once(…))` yields `[]`. TypeScript promises a field that is `undefined` at runtime, so `off(ε, unsub.listener)` fails silently with no compiler warning.

- [ ] **Step 1: Write the failing test**

Append to `src/once.spec.ts`:

```ts
  describe('UnsubscribeFunc contract', () => {
    it('exposes .listener for a single event name', () => {
      const obj = eventize();
      const unsubscribe = once(obj, 'foo', fake());

      expect(Object.keys(unsubscribe)).toEqual(['listener']);
      expect((unsubscribe as any).listener).toBeDefined();
    });

    it('exposes .listeners for an array of event names', () => {
      const obj = eventize();
      const unsubscribe = once(obj, ['foo', 'bar'], fake());

      expect(Object.keys(unsubscribe)).toEqual(['listeners']);
      expect((unsubscribe as any).listeners).toHaveLength(2);
    });

    it('allows off(ε, unsubscribe.listener) as a cleanup path', () => {
      const obj = eventize();
      const unsubscribe = once(obj, 'foo', fake());

      expect(getSubscriptionCount(obj)).toBe(1);
      off(obj, (unsubscribe as any).listener);
      expect(getSubscriptionCount(obj)).toBe(0);
    });

    it('stays idempotent', () => {
      const obj = eventize();
      const listener = fake();
      const unsubscribe = once(obj, 'foo', listener);

      unsubscribe();
      unsubscribe();

      expect(getSubscriptionCount(obj)).toBe(0);
      emit(obj, 'foo');
      expect(listener.callCount).toBe(0);
    });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/once.spec.ts -t "UnsubscribeFunc contract"`
Expected: the first three FAIL — `Object.keys` returns `[]`. The idempotence test passes and must keep passing.

- [ ] **Step 3: Forward the properties to the outer closure**

In `src/eventize-api.ts`, the `once` implementation:

```ts
// implementation
export function once(obj: object, ...args: SubscribeArgs): UnsubscribeFunc {
  const eventizedObj = asEventized(obj);
  const {store, keeper} = eventizedObj[NAMESPACE];
  const {listeners, publishRetained} = subscribeToDeferred(store, keeper, args);
  const unsubscribeFn = makeUnsubscribe(eventizedObj, listeners);
  let unsubscribeCalled = false;
  const unsubscribe = () => {
    if (!unsubscribeCalled) {
      unsubscribeFn();
      unsubscribeCalled = true;
    }
  };
  // The idempotence wrapper would otherwise swallow the .listener /
  // .listeners properties that UnsubscribeFunc declares and on() delivers.
  Object.assign(
    unsubscribe,
    Array.isArray(listeners) ? {listeners} : {listener: listeners},
  );
  if (Array.isArray(listeners)) {
    listeners.forEach(afterApply(unsubscribe));
  } else {
    afterApply(unsubscribe)(listeners);
  }
  publishRetained();
  return unsubscribe as UnsubscribeFunc;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/once.spec.ts`
Expected: PASS.

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Update the CHANGELOG**

```markdown
- **Fix:** `once()` now returns an unsubscribe function carrying `.listener` (or `.listeners` for the array form), as `UnsubscribeFunc` declares and `on()` has always delivered. The idempotence wrapper around the handle dropped both properties, so TypeScript promised a field that was `undefined` at runtime and `off(ε, unsub.listener)` failed silently. Affects `src/eventize-api.ts`.
```

- [ ] **Step 7: Commit**

```bash
git add src/eventize-api.ts src/once.spec.ts CHANGELOG.md
git commit -m "fix(once): forward .listener/.listeners to the returned unsubscribe (API-001)"
```

---

## Task 12: Detach removed listeners from their references

**Model:** Sonnet
**Finding:** MEM-006 (medium)

**Files:**
- Modify: `src/EventListener.ts` (drop `readonly` on two fields, add `detach()`)
- Modify: `src/EventStore.ts` (three removal paths call `detach()`)
- Test: `src/off.spec.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `EventListener.detach(): void` — sets `isRemoved`, then nulls `listener`, `listenerObject` and `callAfterApply`. Task 14 and task 20 both call it.

After `unsubscribe()`, `unsubscribe.listener.listenerObject` still points at the listener object and the closure still holds `host`. The `EventListener` is only flagged `isRemoved = true`, never decoupled. One handle is harmless; the usual `const subs = []; subs.push(on(…))` pattern followed by `subs.forEach(u => u())` is not — as long as the array lives, it pins the emitter, every listener function and every listener object of every subscription ever made.

Per the design doc, all three removal paths get the same treatment, not just the two the audit names.

- [ ] **Step 1: Write the failing test**

Append to `src/off.spec.ts`:

```ts
  describe('reference release after unsubscribe', () => {
    it('drops the listener references from a consumed handle', () => {
      const obj = eventize();
      const listenerObject = {foo: fake()};
      const unsubscribe = on(obj, 'foo', 'foo', listenerObject) as any;

      expect(unsubscribe.listener.listenerObject).toBe(listenerObject);

      unsubscribe();

      expect(unsubscribe.listener.isRemoved).toBe(true);
      expect(unsubscribe.listener.listener).toBeNull();
      expect(unsubscribe.listener.listenerObject).toBeNull();
      expect(unsubscribe.listener.callAfterApply).toBeUndefined();
    });

    it('drops references on off(ε, eventName) too', () => {
      const obj = eventize();
      const listenerFunc = fake();
      const unsubscribe = on(obj, 'foo', listenerFunc) as any;

      off(obj, 'foo');

      expect(unsubscribe.listener.isRemoved).toBe(true);
      expect(unsubscribe.listener.listener).toBeNull();
    });

    it('drops references on off(ε) too', () => {
      const obj = eventize();
      const listenerFunc = fake();
      const unsubscribe = on(obj, 'foo', listenerFunc) as any;

      off(obj);

      expect(unsubscribe.listener.isRemoved).toBe(true);
      expect(unsubscribe.listener.listener).toBeNull();
    });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/off.spec.ts -t "reference release after unsubscribe"`
Expected: all three FAIL at the `toBeNull()` assertions.

- [ ] **Step 3: Add `detach()` to `EventListener`**

In `src/EventListener.ts`, drop `readonly` from two fields:

```ts
export class EventListener {
  readonly id: number;
  readonly eventName: EventName;
  readonly isCatchEmAll: boolean;
  readonly priority: number | undefined;
  // Not readonly: detach() nulls these on removal so a retained unsubscribe
  // handle can't keep the emitter graph alive. Internal contract only —
  // nothing outside this package writes to them.
  listener: unknown;
  listenerObject: ListenerObjectType;
  readonly listenerType: number;
  callAfterApply: CallAfterApplyFnType;
  isRemoved: boolean;
  refCount: number;
```

And add the method after `isEqual`:

```ts
  /**
   * Marks the listener as removed and releases everything it holds. Removed
   * listeners are spliced out of their bucket, so nothing looks them up
   * again; `apply()` bails on `isRemoved` before touching any of the nulled
   * fields.
   */
  detach(): void {
    this.isRemoved = true;
    this.listener = null;
    this.listenerObject = null;
    this.callAfterApply = undefined;
  }
```

- [ ] **Step 4: Route all three removal paths through `detach()`**

In `src/EventStore.ts`, `removeListenerFromArray`:

```ts
  if (idx > -1) {
    listeners[idx].detach();
    listeners.splice(idx, 1);
  }
```

`removeAll`:

```ts
const removeAll = (fromArray: Array<EventListener>) => {
  if (fromArray) {
    fromArray.forEach((listener) => listener.detach());
    fromArray.length = 0;
  }
};
```

(The commented-out `// listener.refCount = 0;` goes away with this.)

`removeByEventListener` — the `detach()` call must come **after** the bucket scan, which reads `listener.eventName`:

```ts
  private removeByEventListener(listener: EventListener): void {
    if (listener.isRemoved) return;
    listener.refCount -= 1;
    if (listener.refCount >= 1) return;
    this.namedListeners.forEach((namedListeners, name) => {
      removeItemFromArray(namedListeners, listener);
      if (namedListeners.length === 0) {
        this.namedListeners.delete(name);
      }
    });
    removeItemFromArray(this.catchEmAllListeners, listener);
    listener.detach();
  }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- src/off.spec.ts`
Expected: PASS.

- [ ] **Step 6: Run the whole suite**

Run: `npm test`
Expected: PASS. `src/EventListener.spec.ts` and `src/EventStore.spec.ts` are the ones to watch — if a test asserts on `listener.listener` after removal, it was asserting the leak.

- [ ] **Step 7: Update the CHANGELOG**

```markdown
- **Fix:** Removed listeners now release their references. An `EventListener` was only flagged `isRemoved = true` on unsubscribe, so a consumed handle kept pointing at the listener function, the listener object and — through its closure — the emitter. The common `subs.push(on(…))` / `subs.forEach(u => u())` pattern therefore pinned every listener object it had ever registered for as long as the handle array lived. The new `EventListener.detach()` nulls `listener`, `listenerObject` and `callAfterApply`, and all three removal paths in `EventStore` use it. `listener` and `listenerObject` lost their `readonly` marker as a result — an internal class contract, not a public one. Affects `src/EventListener.ts`, `src/EventStore.ts`.
```

- [ ] **Step 8: Commit**

```bash
git add src/EventListener.ts src/EventStore.ts src/off.spec.ts CHANGELOG.md
git commit -m "fix(off): release listener references on removal via detach() (MEM-006)"
```

---

## Task 13: `getListenersForEventName` becomes a prototype method

**Model:** Haiku
**Finding:** MEM-007 (low)

**Files:**
- Modify: `src/EventStore.ts:140-147`

**Interfaces:**
- Consumes: nothing
- Produces: nothing. Same name, same signature, same call sites.

The function sits as an own property on every `EventStore` instance rather than on the prototype — the only one of the class; everything else is a regular method. One store exists per eventized object, so this is a redundant closure per emitter. Irrelevant at a handful of emitters, measurable at tens of thousands, which is precisely the entity-system and scene-graph domain this package comes from. It needs no `this` binding: it is only ever called as `this.getListenersForEventName(…)`.

- [ ] **Step 1: Confirm there is no external caller relying on the bound form**

```bash
grep -rn "getListenersForEventName" src/
```

Expected: the definition plus the call in `add()`. If a spec destructures it off an instance (`const {getListenersForEventName} = store`), that call site must be changed too — the unbound method would lose `this`.

- [ ] **Step 2: Convert to a method**

In `src/EventStore.ts`, delete the field at lines 140-147 and add the method after the constructor:

```ts
export class EventStore {
  readonly namedListeners: Map<EventName, Array<EventListener>>;
  readonly catchEmAllListeners: Array<EventListener>;

  constructor() {
    this.namedListeners = new Map();
    this.catchEmAllListeners = [];
  }

  getListenersForEventName(eventName: string | symbol): EventListener[] {
    let namedListeners = this.namedListeners.get(eventName);
    if (!namedListeners) {
      namedListeners = [];
      this.namedListeners.set(eventName, namedListeners);
    }
    return namedListeners;
  }
```

- [ ] **Step 3: Verify it is on the prototype**

```bash
npx ts-node -e "
import {EventStore} from './src/EventStore';
const s = new EventStore();
console.log('own property:', Object.prototype.hasOwnProperty.call(s, 'getListenersForEventName'));
console.log('on prototype:', 'getListenersForEventName' in Object.getPrototypeOf(s));
"
```

Expected: `own property: false`, `on prototype: true`.

If `ts-node` is awkward here, the equivalent check after `npm run build` is:

```bash
node -e "
const {eventize} = require('./lib/index.js');
const NS = Symbol.for('eventize');
const store = eventize({})[NS].store;
console.log('own property:', Object.prototype.hasOwnProperty.call(store, 'getListenersForEventName'));
"
```

- [ ] **Step 4: Run the whole suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/EventStore.ts
git commit -m "perf(store): make getListenersForEventName a prototype method (MEM-007)"
```

---

## Task 14: Address the listener's bucket directly on removal

**Model:** Opus
**Finding:** PERF-001 (medium)

**Files:**
- Modify: `src/EventStore.ts` (`removeByEventListener`, `removeByEventNameAndListenerObject`)
- Test: `src/EventStore.spec.ts`

**Interfaces:**
- Consumes: task 12 (`EventListener.detach()`)
- Produces: nothing

`removeByEventListener` walks `this.namedListeners.forEach(…)` over **every** event name to remove a listener whose `eventName` it holds as a field. A multi-event `on()` creates one `EventListener` instance per name, and each sits in exactly one bucket. `removeByEventNameAndListenerObject` does the same even though the event name arrives as a parameter and the inner filter checks it anyway. Every unsubscribe costs O(number of names) instead of O(1); over cyclical subscribe/unsubscribe it compounds quadratically.

- [ ] **Step 1: Write the test**

Append inside `describe('EventStore', …)` in `src/EventStore.spec.ts`:

```ts
  describe('removal addresses the bucket directly', () => {
    it('removes a named listener without scanning other buckets', () => {
      const store = new EventStore();
      for (let i = 0; i < 100; i++) {
        store.add(new EventListener(`other-${i}`, 0, () => {}));
      }
      const target = store.add(new EventListener('target', 0, () => {}));
      expect(store.namedListeners.size).toBe(101);

      store.remove(target, null);

      expect(store.namedListeners.has('target')).toBe(false);
      expect(store.namedListeners.size).toBe(100);
      expect(store.getSubscriptionCount()).toBe(100);
    });

    it('removes a catch-em-all listener', () => {
      const store = new EventStore();
      const target = store.add(
        new EventListener(EVENT_CATCH_EM_ALL, 0, () => {}),
      );
      store.add(new EventListener('named', 0, () => {}));

      store.remove(target, null);

      expect(store.catchEmAllListeners).toHaveLength(0);
      expect(store.getSubscriptionCount()).toBe(1);
    });

    it('removes by event name and listener object without touching other names', () => {
      const store = new EventStore();
      const listenerObject = {};
      store.add(new EventListener('foo', 0, listenerObject));
      store.add(new EventListener('bar', 0, listenerObject));

      store.remove('foo', listenerObject, true);

      expect(store.namedListeners.has('foo')).toBe(false);
      expect(store.namedListeners.has('bar')).toBe(true);
      expect(store.getSubscriptionCount()).toBe(1);
    });

    it('honours refCount before removing anything', () => {
      const store = new EventStore();
      const listenerObject = {};
      const first = store.add(new EventListener('foo', 0, listenerObject));
      const second = store.add(new EventListener('foo', 0, listenerObject));
      expect(second).toBe(first);
      expect(first.refCount).toBe(2);

      store.remove(first, null);
      expect(store.getSubscriptionCount()).toBe(1);

      store.remove(first, null);
      expect(store.getSubscriptionCount()).toBe(0);
    });
  });
```

- [ ] **Step 2: Run the tests to verify they pass before the change**

Run: `npm test -- src/EventStore.spec.ts -t "removal addresses the bucket directly"`
Expected: PASS. This is a refactor, not a bug fix — the tests pin current behaviour so the rewrite cannot change it. If any fails now, stop and report: the premise is wrong.

- [ ] **Step 3: Rewrite `removeByEventListener`**

```ts
  private removeByEventListener(listener: EventListener): void {
    if (listener.isRemoved) return;
    listener.refCount -= 1;
    if (listener.refCount >= 1) return;

    // A listener lives in exactly one bucket: the catch-em-all array, or the
    // named array for its own eventName. A multi-event on() creates one
    // EventListener per name, so there is never more than one home to visit.
    if (listener.isCatchEmAll) {
      removeItemFromArray(this.catchEmAllListeners, listener);
    } else {
      const bucket = this.namedListeners.get(listener.eventName);
      if (bucket) {
        removeItemFromArray(bucket, listener);
        if (bucket.length === 0) {
          this.namedListeners.delete(listener.eventName);
        }
      }
    }

    listener.detach();
  }
```

- [ ] **Step 4: Rewrite `removeByEventNameAndListenerObject`**

```ts
  private removeByEventNameAndListenerObject(
    eventName: EventName,
    listenerObject: unknown,
  ): void {
    // The event name is known, and the filter checks it anyway — no reason to
    // walk every other bucket. Catch-em-all listeners were never reachable
    // from this path (they live in their own array, not in namedListeners),
    // and still aren't.
    const bucket = this.namedListeners.get(eventName);
    if (!bucket) return;
    removeSimilarListenersFromArray(bucket, eventName, listenerObject);
    if (bucket.length === 0) {
      this.namedListeners.delete(eventName);
    }
  }
```

- [ ] **Step 5: Run the tests to verify they still pass**

Run: `npm test -- src/EventStore.spec.ts`
Expected: PASS, including the existing `does not leak with many unique event names (1000 add/remove cycles)` at line 129, which covers exactly this path.

- [ ] **Step 6: Run the whole suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Update the CHANGELOG**

```markdown
- **Performance:** Unsubscribing no longer scans every event-name bucket. `removeByEventListener` walked the full `namedListeners` map to find a listener whose `eventName` it already held, and `removeByEventNameAndListenerObject` did the same with the name sitting right there in its parameter list. Both now address the one bucket a listener can live in, falling back to nothing when it is absent. Removal drops from O(number of event names) to O(1), which matters for the cyclical subscribe/unsubscribe patterns in entity systems and scene graphs. No behavioural change. Affects `src/EventStore.ts`.
```

- [ ] **Step 8: Commit**

```bash
git add src/EventStore.ts src/EventStore.spec.ts CHANGELOG.md
git commit -m "perf(store): address the listener bucket directly instead of scanning (PERF-001)"
```

---

## Task 15: `onceAsync()` accepts an `AbortSignal`

**Model:** Opus
**Finding:** MEM-004 (medium)

**Files:**
- Modify: `src/eventize-api.ts:410-429` (`onceAsync` overloads and implementation)
- Modify: `src/types.ts` (export `OnceAsyncOptions`)
- Test: `src/onceAsync.spec.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `OnceAsyncOptions = {signal?: AbortSignal}`, exported from the package root via `src/types.ts`. `onceAsync(obj, eventNames, options?)` — the third parameter is optional, so no existing call changes.

`onceAsync(ε,'never')` registers a listener and returns a promise, and that is all. If the event never fires, the listener, the `resolve` closure and the caller's entire await-continuation frame stay attached to the emitter for as long as it lives. No unsubscribe handle, no `AbortSignal`, no timeout. This is exactly the shape that unmount-before-event and cancelled-request produce, and the only way out — `off(ε, …)` — needs a reference the caller never received.

- [ ] **Step 1: Write the failing tests**

Append to `src/onceAsync.spec.ts`:

```ts
  describe('AbortSignal support', () => {
    it('unsubscribes and rejects when the signal aborts', async () => {
      const obj = eventize();
      const controller = new AbortController();

      const promise = onceAsync(obj, 'never', {signal: controller.signal});
      expect(getSubscriptionCount(obj)).toBe(1);

      controller.abort();

      await expect(promise).rejects.toMatchObject({name: 'AbortError'});
      expect(getSubscriptionCount(obj)).toBe(0);
    });

    it('rejects immediately when the signal is already aborted', async () => {
      const obj = eventize();
      const controller = new AbortController();
      controller.abort();

      const promise = onceAsync(obj, 'never', {signal: controller.signal});

      await expect(promise).rejects.toMatchObject({name: 'AbortError'});
      expect(getSubscriptionCount(obj)).toBe(0);
    });

    it('rejects with the signal reason when one was given', async () => {
      const obj = eventize();
      const controller = new AbortController();
      const reason = new Error('caller went away');

      const promise = onceAsync(obj, 'never', {signal: controller.signal});
      controller.abort(reason);

      await expect(promise).rejects.toBe(reason);
    });

    it('resolves normally and detaches the abort handler', async () => {
      const obj = eventize();
      const controller = new AbortController();

      const promise = onceAsync(obj, 'foo', {signal: controller.signal});
      emit(obj, 'foo', 'payload');

      await expect(promise).resolves.toBe('payload');
      expect(getSubscriptionCount(obj)).toBe(0);

      // aborting after the fact must not produce an unhandled rejection
      controller.abort();
      await Promise.resolve();
    });

    it('works without options, as before', async () => {
      const obj = eventize();
      const promise = onceAsync(obj, 'foo');
      emit(obj, 'foo', 'payload');
      await expect(promise).resolves.toBe('payload');
    });
  });
```

Add `getSubscriptionCount` to the file's `./index` import if missing.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/onceAsync.spec.ts -t "AbortSignal support"`
Expected: the first four FAIL — the promise never settles, so the `rejects` assertions time out. The last one passes.

- [ ] **Step 3: Add `OnceAsyncOptions` to `src/types.ts`**

Place it next to `UnsubscribeFunc` (around line 126):

```ts
/**
 * Options for `onceAsync()`. Passing a `signal` gives the caller a way to
 * cancel a subscription that may never fire — without one, an event that
 * never arrives pins the listener, the resolve closure and the caller's
 * await continuation to the emitter for its whole lifetime.
 */
export type OnceAsyncOptions = {
  signal?: AbortSignal;
};
```

`src/index.ts` already re-exports everything from `types.ts` via `export type * from './types';`, so no change is needed there.

- [ ] **Step 4: Rewrite `onceAsync` in `src/eventize-api.ts`**

Add `OnceAsyncOptions` to the type import block at the top of the file, then:

```ts
// ---------------------------------------------------------------------------
// onceAsync() — typed overload first; falls back to the loose v4 signature.
// An optional AbortSignal cancels the subscription and rejects the promise,
// mirroring fetch(). Without it, an event that never fires keeps the listener
// and the caller's continuation alive for the emitter's whole lifetime.
// ---------------------------------------------------------------------------

const abortReason = (signal: AbortSignal): unknown =>
  signal.reason ??
  new DOMException('This operation was aborted', 'AbortError');

export function onceAsync<
  TEvents extends EventMap,
  K extends EventKeysOf<TEvents>,
>(
  obj: EventizedObject<TEvents>,
  eventName: K,
  options?: OnceAsyncOptions,
): Promise<TEvents[K] extends [infer A, ...any[]] ? A : void>;
export function onceAsync<ReturnType = void, T extends object = object>(
  obj: NonTypedEmitter<T>,
  eventNames: AnyEventNames,
  options?: OnceAsyncOptions,
): Promise<ReturnType>;
// implementation
export function onceAsync<ReturnType = void>(
  obj: object,
  eventNames: AnyEventNames,
  options?: OnceAsyncOptions,
): Promise<ReturnType> {
  const signal = options?.signal;
  return new Promise<ReturnType>((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortReason(signal));
      return;
    }
    let onAbort: (() => void) | undefined;
    const unsubscribe = once(obj, eventNames, ((...args: EventArgs) => {
      if (signal != null && onAbort != null) {
        signal.removeEventListener('abort', onAbort);
      }
      resolve(args[0] as ReturnType);
    }) as ListenerFuncType);
    if (signal != null) {
      onAbort = () => {
        unsubscribe();
        reject(abortReason(signal));
      };
      signal.addEventListener('abort', onAbort, {once: true});
    }
  });
}
```

`DOMException` is a global from Node 17 onwards, so the `>=18.16` floor covers it. `AbortSignal` and `AbortController` are globals from Node 15.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- src/onceAsync.spec.ts`
Expected: PASS.

- [ ] **Step 6: Run the whole suite and the type gate**

Run: `npm test && npm run build && npm run checkPkgTypes`
Expected: PASS in all four attw resolution modes. A new exported type is the kind of change that breaks dual-format types, so do not skip `checkPkgTypes` here.

- [ ] **Step 7: Document it**

Add to `README.md` where `onceAsync` is described, and to `skills/using-eventize/references/api-details.md`:

```markdown
`onceAsync()` takes an optional `{signal}`. Without it, an event that never
fires keeps the listener, the resolve closure and the caller's `await`
continuation attached to the emitter for as long as the emitter lives —
there is no other handle to release them with.

```js
const controller = new AbortController();
try {
  const value = await onceAsync(emitter, 'ready', {signal: controller.signal});
} catch (err) {
  if (err.name === 'AbortError') { /* cancelled */ }
}
// somewhere in teardown:
controller.abort();
```
```

- [ ] **Step 8: Update the CHANGELOG**

```markdown
- **Feature:** `onceAsync(ε, eventNames, {signal})` accepts an `AbortSignal`. Aborting unsubscribes the internal `once()` handle and rejects the promise with the signal's `reason`, or an `AbortError` `DOMException` when none was given — the same contract as `fetch()`. Without a signal, an event that never fires kept the listener, the `resolve` closure and the caller's entire await continuation attached to the emitter for its whole lifetime, with no handle to release them: the unmount-before-event and cancelled-request shape. The parameter is optional, so no existing call changes. New exported type `OnceAsyncOptions`. Affects `src/eventize-api.ts`, `src/types.ts`.
```

- [ ] **Step 9: Commit**

```bash
git add src/eventize-api.ts src/types.ts src/onceAsync.spec.ts README.md skills/using-eventize/references/api-details.md CHANGELOG.md
git commit -m "feat(onceAsync): accept an AbortSignal to cancel a subscription that may never fire (MEM-004)"
```

---

## Task 16: Retained-state inspection API

**Model:** Sonnet
**Findings:** API-002 (info), MEM-005 (medium, the API half)

**Files:**
- Create: `src/getRetainedCount.ts`
- Create: `src/getRetainedCount.spec.ts`
- Modify: `src/index.ts` (export)

**Interfaces:**
- Consumes: nothing
- Produces:
  - `getRetainedCount(o: object): number` — how many events currently hold a retained value (`keeper.events.size`). `0` for non-eventized objects.
  - `getRetainedEventNames(o: object): EventName[]` — every name carrying a retain policy (`keeper.eventNames`), whether or not it has fired yet. `[]` for non-eventized objects.

`getSubscriptionCount()` exists explicitly so cleanup can be verified — the README calls it "useful for debugging, testing, or verifying that cleanup actually happened". The other half of the emitter's state has no counterpart: how many events are retained, which names carry a policy, and how much hangs off them is unknowable without reaching into `ε[Symbol.for('eventize')].keeper`. That blind spot is what makes MEM-001 and MEM-005 invisible in someone else's code, and it is what this audit had to work around.

The two functions report different things on purpose: a name can carry a retain policy without having fired yet, so `getRetainedEventNames().length >= getRetainedCount()` always holds.

- [ ] **Step 1: Write the failing test**

Create `src/getRetainedCount.spec.ts`:

```ts
import {fake} from 'sinon';

import {
  emit,
  eventize,
  getRetainedCount,
  getRetainedEventNames,
  off,
  on,
  retain,
  retainClear,
  unretain,
} from './index';

describe('getRetainedCount() / getRetainedEventNames()', () => {
  it('returns 0 and [] for a fresh emitter', () => {
    const obj = eventize();
    expect(getRetainedCount(obj)).toBe(0);
    expect(getRetainedEventNames(obj)).toEqual([]);
  });

  it('returns 0 and [] for a non-eventized object', () => {
    expect(getRetainedCount({})).toBe(0);
    expect(getRetainedEventNames({})).toEqual([]);
  });

  it('counts a retain policy before the event ever fires', () => {
    const obj = eventize();
    retain(obj, 'foo');

    expect(getRetainedEventNames(obj)).toEqual(['foo']);
    expect(getRetainedCount(obj)).toBe(0);
  });

  it('counts a retained value after the event fires', () => {
    const obj = eventize();
    retain(obj, 'foo');
    emit(obj, 'foo', 'payload');

    expect(getRetainedCount(obj)).toBe(1);
    expect(getRetainedEventNames(obj)).toEqual(['foo']);
  });

  it('reports symbol event names', () => {
    const obj = eventize();
    const name = Symbol('foo');
    retain(obj, name);
    emit(obj, name, 1);

    expect(getRetainedEventNames(obj)).toEqual([name]);
    expect(getRetainedCount(obj)).toBe(1);
  });

  it('tracks dynamically generated names', () => {
    const obj = eventize();
    for (let i = 0; i < 100; i++) {
      retain(obj, `item-${i}`);
      emit(obj, `item-${i}`, {i});
    }

    expect(getRetainedCount(obj)).toBe(100);
    expect(getRetainedEventNames(obj)).toHaveLength(100);
  });

  it('drops to zero after unretain(ε, "*")', () => {
    const obj = eventize();
    retain(obj, 'a');
    retain(obj, 'b');
    emit(obj, 'a', 1);
    emit(obj, 'b', 2);
    expect(getRetainedCount(obj)).toBe(2);

    unretain(obj, '*');

    expect(getRetainedCount(obj)).toBe(0);
    expect(getRetainedEventNames(obj)).toEqual([]);
  });

  it('retainClear(ε, "*") clears values but keeps policies', () => {
    const obj = eventize();
    retain(obj, 'a');
    emit(obj, 'a', 1);

    retainClear(obj, '*');

    expect(getRetainedCount(obj)).toBe(0);
    expect(getRetainedEventNames(obj)).toEqual(['a']);
  });

  it('is unaffected by listener subscriptions', () => {
    const obj = eventize();
    on(obj, 'foo', fake());
    expect(getRetainedCount(obj)).toBe(0);
    off(obj, 'foo');
    expect(getRetainedCount(obj)).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/getRetainedCount.spec.ts`
Expected: FAIL at import — `getRetainedCount` is not exported from `./index`.

- [ ] **Step 3: Create `src/getRetainedCount.ts`**

```ts
import {EventKeeper} from './EventKeeper';
import {NAMESPACE} from './constants';
import {isEventized} from './isEventized';
import type {EventizedObject, EventName} from './types';

const keeperOf = (o: object): EventKeeper | undefined =>
  isEventized(o)
    ? ((o as EventizedObject)[NAMESPACE]?.keeper as EventKeeper | undefined)
    : undefined;

/**
 * How many events currently hold a retained value.
 *
 * The counterpart to `getSubscriptionCount()` for the other half of an
 * emitter's state. A name that carries a retain policy but has never been
 * emitted is *not* counted here — see `getRetainedEventNames()`.
 */
export const getRetainedCount = (o: object): number =>
  keeperOf(o)?.events.size ?? 0;

/**
 * Every event name carrying a retain policy, whether or not it has fired.
 *
 * `getRetainedEventNames(ε).length >= getRetainedCount(ε)` always holds.
 * Useful when retain() is used with dynamically generated names and the
 * caller needs to know what is still being held.
 */
export const getRetainedEventNames = (o: object): EventName[] => {
  const keeper = keeperOf(o);
  return keeper ? Array.from(keeper.eventNames) : [];
};
```

- [ ] **Step 4: Export from `src/index.ts`**

Add after the `getSubscriptionCount` line:

```ts
export * from './getRetainedCount';
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- src/getRetainedCount.spec.ts`
Expected: PASS.

- [ ] **Step 6: Run the whole gate**

Run: `npm run cbt`
Expected: PASS in all four attw modes.

- [ ] **Step 7: Document**

`README.md` — next to `getSubscriptionCount()`:

```markdown
### Inspecting emitter state

- `getSubscriptionCount(ε)` — how many listeners are registered.
- `getRetainedCount(ε)` — how many events hold a retained value.
- `getRetainedEventNames(ε)` — every name carrying a retain policy, fired or not.

All three return `0` / `[]` for objects that were never eventized, so they are
safe to call on anything. They exist for debugging, testing, and verifying
that cleanup actually happened.
```

Add the same three-line summary to `skills/using-eventize/SKILL.md` and the detail to `skills/using-eventize/references/api-details.md`.

- [ ] **Step 8: Update the CHANGELOG**

```markdown
- **Feature:** `getRetainedCount(ε)` and `getRetainedEventNames(ε)` join `getSubscriptionCount(ε)`. The first reports how many events hold a retained value, the second every name carrying a retain policy whether or not it has fired — so `getRetainedEventNames(ε).length >= getRetainedCount(ε)` always holds. Until now the retained half of an emitter's state was only reachable through `ε[Symbol.for('eventize')].keeper`, which made retained-payload growth invisible from outside. Both return `0` / `[]` for non-eventized objects. New file `src/getRetainedCount.ts`.
```

- [ ] **Step 9: Commit**

```bash
git add src/getRetainedCount.ts src/getRetainedCount.spec.ts src/index.ts README.md skills/using-eventize/ CHANGELOG.md
git commit -m "feat: add getRetainedCount() and getRetainedEventNames() (API-002, MEM-005)"
```

---

## Task 17: Lifecycle regression spec

**Model:** Sonnet
**Finding:** TEST-002 (low)

**Files:**
- Create: `src/lifecycle.spec.ts`

**Interfaces:**
- Consumes: tasks 7-16. Every assertion here must pass against the fixed code.
- Produces: nothing. This file becomes the executable description of what cleanup means in this library; tasks 23 and 24 extend it.

The suite is dense at 414 cases, but the six reproducible defects of this audit all sat in the same blind zone: the interplay of refCount dedup, `callAfterApply` and the keeper. `EventStore.spec.ts:129` ("does not leak with many unique event names") is exactly the right idea and stands alone.

- [ ] **Step 1: Create `src/lifecycle.spec.ts`**

```ts
import {fake} from 'sinon';

import {
  emit,
  eventize,
  getRetainedCount,
  getRetainedEventNames,
  getSubscriptionCount,
  off,
  on,
  once,
  onceAsync,
  retain,
  retainClear,
  unretain,
} from './index';

/**
 * What cleanup means in this library, as executable assertions.
 *
 * Every case here corresponds to a finding from the 2026-07-25 audit. They
 * live together rather than in the per-function specs because they describe
 * one subject — what an emitter holds, and what releases it.
 */
describe('lifecycle', () => {
  describe('subscription count after each off() form', () => {
    it('off(ε) clears every listener', () => {
      const obj = eventize();
      on(obj, 'foo', fake());
      on(obj, 'bar', fake());
      on(obj, '*', fake());
      expect(getSubscriptionCount(obj)).toBe(3);

      off(obj);

      expect(getSubscriptionCount(obj)).toBe(0);
    });

    it('off(ε, eventName) clears only that name', () => {
      const obj = eventize();
      on(obj, 'foo', fake());
      on(obj, 'bar', fake());

      off(obj, 'foo');

      expect(getSubscriptionCount(obj)).toBe(1);
    });

    it('off(ε, [names]) clears each listed name', () => {
      const obj = eventize();
      on(obj, 'foo', fake());
      on(obj, 'bar', fake());
      on(obj, 'baz', fake());

      off(obj, ['foo', 'bar']);

      expect(getSubscriptionCount(obj)).toBe(1);
    });

    it('off(ε, listenerFunc) clears that function everywhere', () => {
      const obj = eventize();
      const listener = fake();
      on(obj, 'foo', listener);
      on(obj, 'bar', listener);

      off(obj, listener);

      expect(getSubscriptionCount(obj)).toBe(0);
    });

    it('off(ε, listenerObject) clears both subscription shapes', () => {
      const obj = eventize();
      const listenerObject = {foo: fake(), handler: fake()};
      on(obj, 'foo', listenerObject);
      on(obj, 'bar', 'handler', listenerObject);
      expect(getSubscriptionCount(obj)).toBe(2);

      off(obj, listenerObject);

      expect(getSubscriptionCount(obj)).toBe(0);
    });

    it('off(ε, eventName, listenerObject) clears both subscription shapes', () => {
      const obj = eventize();
      const listenerObject = {foo: fake()};
      on(obj, 'foo', listenerObject);
      off(obj, 'foo', listenerObject);
      expect(getSubscriptionCount(obj)).toBe(0);

      const other = {handler: fake()};
      on(obj, 'foo', 'handler', other);
      off(obj, 'foo', other);
      expect(getSubscriptionCount(obj)).toBe(0);
    });

    it('the unsubscribe handle clears its own subscription', () => {
      const obj = eventize();
      const unsubscribe = on(obj, 'foo', fake());

      unsubscribe();

      expect(getSubscriptionCount(obj)).toBe(0);
    });

    it('the multi-event unsubscribe handle clears all of them', () => {
      const obj = eventize();
      const unsubscribe = on(obj, ['foo', 'bar'], fake());
      expect(getSubscriptionCount(obj)).toBe(2);

      unsubscribe();

      expect(getSubscriptionCount(obj)).toBe(0);
    });
  });

  describe('keeper size', () => {
    it('off(ε, eventName) drops the retained value and the policy', () => {
      const obj = eventize();
      retain(obj, 'foo');
      emit(obj, 'foo', 'payload');
      expect(getRetainedCount(obj)).toBe(1);

      off(obj, 'foo');

      expect(getRetainedCount(obj)).toBe(0);
      expect(getRetainedEventNames(obj)).toEqual([]);
    });

    it('unretain(ε, "*") drops everything', () => {
      const obj = eventize();
      retain(obj, ['a', 'b', 'c']);
      emit(obj, 'a', 1);
      emit(obj, 'b', 2);

      unretain(obj, '*');

      expect(getRetainedCount(obj)).toBe(0);
      expect(getRetainedEventNames(obj)).toEqual([]);
    });

    it('retainClear(ε, "*") drops values and keeps policies', () => {
      const obj = eventize();
      retain(obj, ['a', 'b']);
      emit(obj, 'a', 1);

      retainClear(obj, '*');

      expect(getRetainedCount(obj)).toBe(0);
      expect(getRetainedEventNames(obj)).toHaveLength(2);
    });

    it('does not grow when the same name is re-emitted', () => {
      const obj = eventize();
      retain(obj, 'foo');
      for (let i = 0; i < 100; i++) {
        emit(obj, 'foo', i);
      }
      expect(getRetainedCount(obj)).toBe(1);
    });

    it('grows once per distinct name — the caller owns the cleanup', () => {
      const obj = eventize();
      for (let i = 0; i < 500; i++) {
        retain(obj, `item-${i}`);
        emit(obj, `item-${i}`, {i});
      }
      expect(getRetainedCount(obj)).toBe(500);

      unretain(obj, '*');

      expect(getRetainedCount(obj)).toBe(0);
    });
  });

  describe('repeated once() on the same listener object', () => {
    it('does not degenerate into a permanent listener', () => {
      const obj = eventize();
      const listenerObject = {foo: fake()};

      once(obj, 'foo', listenerObject);
      once(obj, 'foo', listenerObject);

      emit(obj, 'foo');
      emit(obj, 'foo');
      emit(obj, 'foo');

      // whatever the dedup semantics, the listener must not survive three
      // emits still subscribed
      expect(getSubscriptionCount(obj)).toBe(0);
    });
  });

  describe('wildcard', () => {
    it('retain(ε, "*") is rejected, so a wildcard subscribe cannot recurse', () => {
      const obj = eventize();
      expect(() => retain(obj, '*')).toThrow();
      expect(() => on(obj, '*', fake())).not.toThrow();
    });
  });

  describe('handle lifetime', () => {
    it('a consumed handle holds no listener references', () => {
      const obj = eventize();
      const listenerObject = {foo: fake()};
      const unsubscribe = on(obj, 'foo', listenerObject) as any;

      unsubscribe();

      expect(unsubscribe.listener.listener).toBeNull();
      expect(unsubscribe.listener.listenerObject).toBeNull();
    });

    it('an array of consumed handles releases everything', () => {
      const obj = eventize();
      const subs: Array<() => void> = [];
      const objects = Array.from({length: 50}, (_, i) => ({
        [`e-${i}`]: fake(),
      }));

      objects.forEach((lo, i) => subs.push(on(obj, `e-${i}`, lo)));
      expect(getSubscriptionCount(obj)).toBe(50);

      subs.forEach((u) => u());

      expect(getSubscriptionCount(obj)).toBe(0);
      subs.forEach((u) => {
        expect((u as any).listener.listener).toBeNull();
      });
    });

    it('onceAsync with an aborted signal leaves nothing behind', async () => {
      const obj = eventize();
      const controller = new AbortController();
      const promise = onceAsync(obj, 'never', {signal: controller.signal});

      controller.abort();
      await expect(promise).rejects.toMatchObject({name: 'AbortError'});

      expect(getSubscriptionCount(obj)).toBe(0);
    });
  });

  describe('the store empties its buckets', () => {
    it('leaves no empty named-listener buckets behind', () => {
      const obj = eventize() as any;
      const store = obj[Symbol.for('eventize')].store;

      for (let i = 0; i < 200; i++) {
        const unsubscribe = on(obj, `e-${i}`, fake());
        unsubscribe();
      }

      expect(store.namedListeners.size).toBe(0);
      expect(getSubscriptionCount(obj)).toBe(0);
    });
  });
});
```

The one case that reaches through `Symbol.for('eventize')` is deliberate and is the only one — everything else goes through public API, which is the point of task 16.

- [ ] **Step 2: Run the spec**

Run: `npm test -- src/lifecycle.spec.ts`
Expected: PASS, **except** `repeated once() on the same listener object` — that is MEM-002, fixed in task 24.

- [ ] **Step 3: Mark the known-failing case**

Change that one `it(` to `it.failing(` with a comment:

```ts
    // MEM-002: two once() calls on the same listener object collapse into one
    // EventListener with refCount = 2, and the surviving handle is blocked by
    // its own idempotence guard. Fixed in v6.0.0 — task 24 flips this back to
    // a normal `it`.
    it.failing('does not degenerate into a permanent listener', () => {
```

- [ ] **Step 4: Run the spec again**

Run: `npm test -- src/lifecycle.spec.ts`
Expected: PASS, with the `it.failing` case reported as passing (Jest passes an `it.failing` when the body throws).

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Update the CHANGELOG**

```markdown
- **Tests:** New `src/lifecycle.spec.ts` — one place that states, as executable assertions, what an emitter holds and what releases it: the subscription count after every `off()` form, keeper size after each retain-clearing call, keeper growth under dynamically generated names, handle lifetime after unsubscribe, and the wildcard guard. Every case corresponds to a finding from the 2026-07-25 audit.
```

- [ ] **Step 7: Commit**

```bash
git add src/lifecycle.spec.ts CHANGELOG.md
git commit -m "test: add lifecycle.spec.ts as the executable description of cleanup (TEST-002)"
```

---

## Task 18: `docs/lifecycle.md` and the v5.2.0 release

**Model:** Sonnet
**Findings:** the audit's "Optimierungspotenzial" lifecycle-doc item; closes phase 1

**Files:**
- Create: `docs/lifecycle.md`
- Modify: `README.md` (link), `skills/using-eventize/SKILL.md` (link), `AGENTS.md` (doc table)
- Modify: `CHANGELOG.md`, `package.json` (version bump)

**Interfaces:**
- Consumes: tasks 7-17
- Produces: the released v5.2.0

- [ ] **Step 1: Write `docs/lifecycle.md`**

Cover, in this order, and describe the **v5.2.0** state — task 27 revises it for v6.0.0:

1. **What an emitter holds.** The hidden `Symbol.for('eventize')` slot, `EventStore` (listener registry) and `EventKeeper` (retained values, held by strong reference — no cloning, by design).
2. **What each `off()` form releases.** A table mirroring the `describe` blocks of `src/lifecycle.spec.ts`, with a row per form and columns for "listeners" and "retained state". State plainly that `off(ε)` does **not** currently clear retained state and that this changes in v6.0.0.
3. **Retain semantics.** `retain()` is a `ReplaySubject(1)` per event name. `off(ε, name)` drops the value *and the policy*. `unretain(ε,'*')` and `retainClear(ε,'*')` are the bulk forms. `retain(ε,'*')` throws.
4. **Dynamically generated names.** Supported, with the caller owning cleanup. No eviction, no cap — an event library does not guess what is still needed. Point at `getRetainedCount()` / `getRetainedEventNames()`.
5. **Which handles to keep.** `on()` and `once()` both return an `UnsubscribeFunc` carrying `.listener` / `.listeners`. Consumed handles release their references, so keeping an array of them is safe.
6. **`onceAsync` and cancellation.** The `{signal}` option and why an unsignalled `onceAsync` on an event that never fires is a leak.
7. **Verifying cleanup.** The three inspection functions, with a short snippet asserting a component teardown released everything.

Every claim must have a witness in `src/lifecycle.spec.ts`. If a claim has none, either add the case or drop the claim.

- [ ] **Step 2: Link it**

`README.md` — in the documentation index: `- [Lifecycle & cleanup](./docs/lifecycle.md) — what an emitter holds and what releases it`

`skills/using-eventize/SKILL.md` — same line in its pointer list.

`AGENTS.md` — in the "Documentation obligations" table, add a row:

```markdown
| Cleanup, retain lifetime, or handle semantics | `docs/lifecycle.md`, plus a case in `src/lifecycle.spec.ts` |
```

- [ ] **Step 3: Update `AGENTS.md` known asymmetries**

Two entries there are now stale:

- The `off(ε, name)` / `unretain()` entry stays as is — still true.
- Add: `retain()`, `unretain()` and `retainClear()` treat `'*'` specially — `retain('*')` throws, the other two mean "all retained events".

- [ ] **Step 4: Turn `## Unreleased` into the release section**

In `CHANGELOG.md`, rename the heading:

```markdown
## `v5.2.0` (YYYY-MM-DD) — Lifecycle fixes: cleanup, wildcards, and retained state
```

Use the actual date. Add a short lead paragraph above the bullets naming the theme: six verified resource and lifecycle defects, plus the API needed to see them from outside. Then re-open an empty `## Unreleased` above it.

- [ ] **Step 5: Bump the version**

```bash
npm version 5.2.0 --no-git-tag-version
```

- [ ] **Step 6: Run the full gate**

Run: `npm run cbt`
Expected: PASS.

- [ ] **Step 7: Verify the tarball one more time**

```bash
npm pack --dry-run
```

Expected: `docs/lifecycle.md` present, `audit.html` absent.

- [ ] **Step 8: Commit and tag**

```bash
git add -A
git commit -m "chore: v5.2.0 release"
git tag v5.2.0
```

Do **not** push or publish. Report to the user that the release is staged and awaits their `git push --follow-tags`.

---

## Phase 1 gate

- [ ] `npm run cbt` PASS
- [ ] `src/lifecycle.spec.ts` green with exactly one `it.failing` (MEM-002)
- [ ] Every finding MEM-003, MEM-004, MEM-006, MEM-007, BUG-001, BUG-002, CORR-001, API-001, API-002, PERF-001 has a CHANGELOG entry
- [ ] v5.2.0 tagged, not pushed

---

# Phase 2 — Types and structure

No user-facing change. Ships with v6.0.0.

**Release latitude, granted 2026-07-26.** v5.2.0 is tagged and its content is settled, but it is not a constraint on what follows. If work in this phase or the next uncovers a defect whose honest fix changes behaviour, fix it — do not defer it, do not water it down to preserve a non-breaking story. Everything from here lands in v6.0.0, which is a major precisely so it can absorb that. The one thing that stays forbidden is a silent behaviour change: every one gets a `CHANGELOG.md` entry under `## Unreleased` marked **BREAKING**, with migration notes.

This matters most for `strictNullChecks` below. The flag exists to surface nullability the code was lying about, and some of what it surfaces will be real defects rather than type noise. Those are the point of the exercise, not a distraction from it.

## Task 19: `strictNullChecks: true`

**Model:** Opus
**Findings:** TYPE-001 (medium), ARCH-003 (low)

**Files:**
- Modify: `tsconfig.json:17`
- Modify: whatever the compiler flags — expect `src/EventKeeper.ts` (`replayTo`), `src/EventListener.ts` (`detectListenerType`), `src/EventStore.ts` (`getListenersForEventName` return type), `src/eventize-api.ts`

**Interfaces:**
- Consumes: tasks 7-16 (the fixed code is what gets migrated)
- Produces: `detectListenerType(listener: unknown): number | undefined` with an explicit `default` branch. Task 20 replaces this function entirely — do not over-invest in it here.

`"strict": true` sits directly next to `"strictNullChecks": false`, which switches off the most important check `strict` enables. Visible consequences: `EventKeeper.replayTo` dereferences `this.events.get(eventName)` without a check, `detectListenerType` can return `undefined` without its return type showing it, and the `as UnsubscribeFunc` cast in `once()` hid the missing properties that were API-001. Under 800 lines of production code, and the errors point with high accuracy at the places already in the backlog.

- [ ] **Step 1: Produce the error list before changing anything**

```bash
npx tsc --noEmit --strictNullChecks 2>&1 | tee /tmp/snc-errors.txt
wc -l /tmp/snc-errors.txt
```

Read the whole list before editing. Report the count and the affected files to the user in the task summary.

- [ ] **Step 2: Flip the flag**

`tsconfig.json` line 17:

```json
    "strictNullChecks": true,
```

- [ ] **Step 3: Fix `EventKeeper.replayTo`**

```ts
  replayTo(
    eventName: EventName,
    eventListener: {apply: (eventName: EventName, args?: EventArgs) => void},
    sortedEvents: KeeperEvent[] = [],
  ): KeeperEvent[] {
    if (!isCatchEmAll(eventName)) {
      const event = this.events.get(eventName);
      if (event != null) {
        const {order, args} = event;
        sortedEvents.push({
          order,
          replay: () => eventListener.apply(eventName, args),
        });
      }
    } else {
      this.eventNames.forEach((name) => {
        if (!isCatchEmAll(name)) {
          this.replayTo(name, eventListener, sortedEvents);
        }
      });
    }
    return sortedEvents;
  }
```

The `has()` + `get()` pair becomes a single `get()` with a null check — one map lookup instead of two, and the type is honest.

- [ ] **Step 4: Give `detectListenerType` a default branch**

```ts
/**
 * Returns the LISTENER_IS_* tag for a listener, or undefined for a type that
 * cannot be one. `_subscribeTo()` rejects those before they reach here, so
 * the undefined branch is unreachable in practice — but the type must say so
 * rather than lie about it.
 */
const detectListenerType = (listener: unknown): number | undefined => {
  switch (typeof listener) {
    case 'function':
      return LISTENER_IS_FUNC;
    case 'string':
    case 'symbol':
      return LISTENER_IS_NAMED_FUNC;
    case 'object':
      return listener === null ? undefined : LISTENER_IS_OBJ;
    default:
      return undefined;
  }
};
```

`typeof null === 'object'`, so the explicit null check matters. `EventListener.listenerType` becomes `number | undefined`; the `switch` in `apply()` simply matches no branch when it is `undefined`, which is the correct no-op.

That widening propagates: the local type literal in `EventStore.isSimilar` (`src/EventStore.ts:92-101`) declares `listenerType: number` and will no longer accept an `EventListener`. Widen it to match:

```ts
const isSimilar = (
  a: {
    listenerType: number | undefined;
    priority: number | undefined;
    eventName: string | symbol;
    listenerObject: any;
    listener: any;
  },
  b: EventListener,
) => {
```

`priority` is already `number | undefined` on the class and needs the same treatment in this literal. `isSimilarListenerType(listenerType: number)` at line 44 likewise takes `number | undefined` — an `undefined` tag is similar to nothing, and the two `===` comparisons already return `false` for it.

- [ ] **Step 4b: Expect `src/getRetainedCount.spec.ts` to need four `@ts-expect-error` directives back**

Task 16 added a case named `is safe on null, undefined and primitives at runtime`. It calls `getRetainedCount(null)`, `getRetainedCount(undefined)`, `getRetainedEventNames(null)` and `getRetainedEventNames(undefined)` — all four written *without* a suppression, because under `strictNullChecks: false` those arguments are assignable to `object` and a `@ts-expect-error` there fails with `TS2578: Unused directive`.

Flipping the flag reverses that: the four calls become genuine type errors and each needs its directive back. The two primitive cases (`42`, `'nope'`) already carry one and must keep it.

This is not incidental — it is the finding measuring itself. A signature reading `(o: object)` that silently accepted `null` is exactly the nullability blindness TYPE-001 describes, and this spec is where it becomes visible.

- [ ] **Step 5: Work through the remaining errors**

Fix them one file at a time, re-running `npx tsc --noEmit` after each. Rules:

- Prefer a real null check over `!` or `as`. Every non-null assertion added here is a finding the next audit will report.
- If a value genuinely cannot be null and the compiler cannot see it, add a comment explaining why before the assertion.
- Do not change runtime behaviour. If a fix would, stop and report it — that is a defect the flag just uncovered, and it needs its own task.

- [ ] **Step 6: Run the full gate**

Run: `npm run cbt`
Expected: PASS.

- [ ] **Step 7: Update the CHANGELOG**

```markdown
- **Types:** `strictNullChecks` is on. It had been switched off directly beside `"strict": true`, disabling the most valuable check `strict` enables — which is why `EventKeeper.replayTo()` dereferenced a map lookup without checking it, `detectListenerType()` could return `undefined` behind a `number` return type, and the `as UnsubscribeFunc` cast in `once()` could hide missing properties. `detectListenerType()` now has an explicit `default` branch and returns `number | undefined`; `replayTo()` does one map lookup instead of `has()` plus `get()`. No runtime behaviour changed. Affects `tsconfig.json` and the files the compiler flagged.
```

- [ ] **Step 8: Commit**

```bash
git add tsconfig.json src/ CHANGELOG.md
git commit -m "types: enable strictNullChecks and fix the resulting errors (TYPE-001, ARCH-003)"
```

---

## Task 20: `EventListener` as a discriminated union

**Model:** Opus
**Finding:** TYPE-003 (low)

**Files:**
- Modify: `src/EventListener.ts`
- Test: `src/EventListener.spec.ts`

**Interfaces:**
- Consumes: task 12 (`detach()`), task 10 (helpers return `boolean`), task 19 (`strictNullChecks`)
- Produces: `EventListener.variant: ListenerVariant | undefined`. `listenerType` stays as the numeric tag `EventStore.isSimilar()` compares, and `listener` / `listenerObject` keep their current meaning and mutability.

`apply()` switches on the numeric `listenerType` and has to overrule TypeScript in four places, because a number is not a discriminator you can narrow `listener` from. The comments each explain correctly why the access is safe — but four suppressed errors in a 138-line file is the price of a modelling choice that need not be made.

**Abort condition:** if the rewrite trades the four `@ts-expect-error` for four or more new `as` casts elsewhere, revert it, leave TYPE-003 open, and record why in the CHANGELOG. The point is fewer suppressions, not relocated ones.

- [ ] **Step 1: Add the variant types**

In `src/EventListener.ts`, after the existing type aliases:

```ts
type FuncListener = (...args: any[]) => any;
type ObjListener = Record<EventName, unknown> & {emit?: EmitFnType};

/**
 * The listener, modelled as a discriminated union so `apply()` can narrow it.
 * The numeric `listenerType` stays alongside as the tag `EventStore.isSimilar()`
 * compares — this union exists purely so the dispatch switch type-checks
 * without suppressions.
 */
type ListenerVariant =
  | {kind: 'func'; fn: FuncListener}
  | {kind: 'named'; methodName: EventName}
  | {kind: 'obj'; target: ObjListener};

const toVariant = (listener: unknown): ListenerVariant | undefined => {
  switch (typeof listener) {
    case 'function':
      return {kind: 'func', fn: listener as FuncListener};
    case 'string':
    case 'symbol':
      return {kind: 'named', methodName: listener};
    case 'object':
      return listener === null
        ? undefined
        : {kind: 'obj', target: listener as ObjListener};
    default:
      return undefined;
  }
};
```

- [ ] **Step 2: Hold the variant on the instance**

Add the field and populate it in the constructor:

```ts
  readonly listenerType: number | undefined;
  variant: ListenerVariant | undefined;
```

```ts
    this.listenerType = detectListenerType(listener);
    this.variant = toVariant(listener);
```

And null it in `detach()`:

```ts
  detach(): void {
    this.isRemoved = true;
    this.listener = null;
    this.listenerObject = null;
    this.variant = undefined;
    this.callAfterApply = undefined;
  }
```

- [ ] **Step 3: Rewrite `apply()` against the variant**

```ts
  apply(
    eventName: EventName,
    args?: EventArgs,
    returnValue?: ReturnValue,
  ): void {
    if (this.isRemoved) return;

    const {variant, listenerObject} = this;
    if (variant == null) return;

    switch (variant.kind) {
      case 'func':
        apply(listenerObject, variant.fn, args, returnValue);
        if (this.callAfterApply) this.callAfterApply();
        break;

      case 'named': {
        const target = listenerObject as ObjListener | null;
        const didCall =
          target != null &&
          apply(target, target[variant.methodName] as EmitFnType, args, returnValue);
        // A once() must survive a dispatch that found no method — late-bound
        // listener objects are a normal pattern.
        if (didCall && this.callAfterApply) this.callAfterApply();
        break;
      }

      case 'obj': {
        if (this.isCatchEmAll || this.eventName === eventName) {
          const {target} = variant;
          const didCall =
            apply(target, target[eventName] as EmitFnType, args, returnValue) ||
            emit(eventName, target, args, returnValue);
          if (didCall && this.callAfterApply) this.callAfterApply();
        }
        break;
      }
    }
  }
```

The `emit` helper's parameter type needs widening to accept `ObjListener`:

```ts
const emit = (
  eventName: EventName,
  listener: {emit?: EmitFnType},
  args: EventArgs,
  returnValue?: ReturnValue,
): boolean =>
  apply(listener, listener.emit, [eventName].concat(args), returnValue);
```

- [ ] **Step 4: Confirm no `@ts-expect-error` remains in the file**

```bash
grep -c "@ts-expect-error" src/EventListener.ts
```

Expected: `0`. If TypeScript now reports the removed suppressions as unused, that is the compiler confirming the narrowing works.

- [ ] **Step 5: Count the casts you added**

```bash
grep -c " as " src/EventListener.ts
```

Compare against `git show HEAD:src/EventListener.ts | grep -c " as "`. If the number rose by four or more, apply the abort condition: `git checkout src/EventListener.ts`, and report.

- [ ] **Step 6: Run the whole suite**

Run: `npm test`
Expected: PASS. `src/EventListener.spec.ts`, `src/emit-ducktyping.spec.ts` and `src/once.spec.ts` are the ones that exercise all three dispatch shapes.

- [ ] **Step 7: Run the full gate**

Run: `npm run cbt`
Expected: PASS.

- [ ] **Step 8: Update the CHANGELOG**

```markdown
- **Types:** `EventListener` dispatch now narrows through a discriminated union (`kind: 'func' | 'named' | 'obj'`) instead of a numeric tag, removing all four `@ts-expect-error` suppressions from `src/EventListener.ts`. The numeric `listenerType` remains as the tag `EventStore.isSimilar()` compares. No runtime behaviour changed; the compiler now keeps apart the branches that only a number distinguished before.
```

- [ ] **Step 9: Commit**

```bash
git add src/EventListener.ts CHANGELOG.md
git commit -m "types: model listener dispatch as a discriminated union (TYPE-003)"
```

---

## Task 21: ESLint rule hygiene

**Model:** Sonnet
**Finding:** TYPE-002 (low)

**Files:**
- Modify: `eslint.config.mjs:46-94`

**Interfaces:**
- Consumes: task 20 (removes the four `@ts-expect-error` from `src/`)
- Produces: the `**/*.spec.ts` override block that task 22 relies on

14 `@typescript-eslint` rules sit at `0`. Some are defensible here — the dispatch logic works with `unknown` and `any` by construction — but the list also carries rules that no longer exist under those names (`ban-ts-ignore`, `interface-name-prefix`, `no-var-requires`, and `ban-types` / `no-empty-interface`, both split up in typescript-eslint v8). A disabled rule with a reason is a decision; one without is an accident.

- [ ] **Step 1: Identify which entries are dead**

```bash
npx eslint --print-config src/EventStore.ts > /tmp/eslint-config.json
node -e "
const cfg = require('/tmp/eslint-config.json');
const names = ['@typescript-eslint/ban-ts-ignore','@typescript-eslint/ban-types','@typescript-eslint/interface-name-prefix','@typescript-eslint/no-empty-interface','@typescript-eslint/no-var-requires'];
const plugin = require('typescript-eslint');
for (const n of names) {
  const short = n.split('/')[1];
  const exists = Boolean(plugin.plugin?.rules?.[short] ?? plugin.plugins?.['@typescript-eslint']?.rules?.[short]);
  console.log(n, exists ? 'EXISTS' : 'DEAD');
}
"
```

If the introspection is awkward, the reliable fallback is empirical: delete a candidate entry, run `npm run lint`, and see whether anything new is reported. A dead rule changes nothing when removed.

- [ ] **Step 2: Rewrite the `**/*.ts` rules block**

Remove the dead entries and annotate the survivors:

```ts
  {
    files: ['**/*.ts'],
    rules: {
      eqeqeq: [2, 'smart'],
      // `== null` / `!= null` is the intended nullish test throughout the
      // dispatch code; `no-fallthrough` would flag the deliberate
      // string/symbol case grouping in detectListenerType().
      'no-fallthrough': 0,
      'no-undef-init': 0,
      'no-use-before-define': 0,
      'prefer-rest-params': 0,

      // The public surface is a set of overloads over `unknown` args that the
      // implementation decodes positionally — `any` is the type of the thing
      // being decoded, not a shortcut around one.
      '@typescript-eslint/no-explicit-any': 0,
      '@typescript-eslint/no-unsafe-function-type': 0,

      // Listener objects are described structurally by their method names;
      // an empty object type is a legitimate listener.
      '@typescript-eslint/no-empty-object-type': 0,
      '@typescript-eslint/no-empty-function': 0,

      // Warn rather than error: each remaining use should be justified in a
      // comment, but a stray one must not block the build.
      '@typescript-eslint/ban-ts-comment': 1,
      '@typescript-eslint/no-non-null-assertion': 1,
      '@typescript-eslint/no-this-alias': 1,
      '@typescript-eslint/no-unsafe-declaration-merging': 1,
      '@typescript-eslint/explicit-function-return-type': 0,

      '@typescript-eslint/no-use-before-define': [
        2,
        {
          functions: false,
        },
      ],

      '@typescript-eslint/no-unused-vars': [
        2,
        {
          vars: 'all',
          args: 'after-used',
          argsIgnorePattern: '^_',
        },
      ],

      '@typescript-eslint/consistent-type-assertions': [
        2,
        {
          assertionStyle: 'as',
          objectLiteralTypeAssertions: 'allow-as-parameter',
        },
      ],
    },
  },
```

- [ ] **Step 3: Add the spec-file override**

Append as the last block of the config array, after the `**/*.ts` block so it wins:

```ts
  {
    files: ['**/*.spec.ts'],
    rules: {
      // Specs test the type layer as much as the runtime. @ts-expect-error
      // fails when the error disappears and is therefore itself an
      // assertion; @ts-ignore is silent in both directions.
      '@typescript-eslint/ban-ts-comment': [
        2,
        {'ts-ignore': true, 'ts-expect-error': false},
      ],
    },
  },
```

This will report every remaining `@ts-ignore` in the specs as an error. Task 22 removes them — until then, run `npm run lint` expecting those failures.

- [ ] **Step 4: Verify src/ is clean**

```bash
npx eslint src --ignore-pattern '**/*.spec.ts'
```

Expected: no errors. After task 20 there are no `@ts-expect-error` left in `src/` production files, so `ban-ts-comment: 1` should be silent.

- [ ] **Step 5: Commit (lint will still fail on specs — that is task 22)**

```bash
git add eslint.config.mjs
git commit -m "chore(lint): drop rules that no longer exist, justify the rest, ban @ts-ignore in specs (TYPE-002)"
```

---

## Task 22: `@ts-ignore` → `@ts-expect-error` in specs

**Model:** Haiku
**Finding:** TEST-003 (low)

**Files:**
- Modify: `src/on.spec.ts` (79 occurrences), `src/eventize.spec.ts` (2 occurrences)

**Interfaces:**
- Consumes: task 21 (the ESLint rule that keeps this from drifting back)
- Produces: nothing

81 `@ts-ignore` against 13 `@ts-expect-error`. The difference matters here: `@ts-expect-error` fails as soon as the error disappears and is therefore itself a test of the types, while `@ts-ignore` is silent in both directions — if a type change starts permitting a call that used to be rejected, nobody notices. For a library whose type layer is a headline feature, that is 81 free assertions left on the table.

- [ ] **Step 1: Confirm the exact locations**

```bash
grep -rn "@ts-ignore" src/ | wc -l
grep -rln "@ts-ignore" src/
```

Expected: 81 across `src/on.spec.ts` and `src/eventize.spec.ts`. If other files appear, include them.

- [ ] **Step 2: Replace mechanically**

```bash
sed -i 's/@ts-ignore/@ts-expect-error/g' src/on.spec.ts src/eventize.spec.ts
grep -rn "@ts-ignore" src/ | wc -l
```

Expected: `0`.

- [ ] **Step 3: Run the suite — every failure is a finding**

Run: `npm test`

Two kinds of failure can appear:

- **`Unused '@ts-expect-error' directive.`** — the line below it no longer produces a type error. That is a real result: either the type genuinely got more permissive (worth a look and possibly a CHANGELOG note), or the comment was always in the wrong place. Remove the directive.
- **A test that stops compiling** — unlikely, but treat as a real defect and report rather than reinstating `@ts-ignore`.

List every directive you removed and why in the commit body.

- [ ] **Step 4: Run lint**

Run: `npm run lint`
Expected: PASS. The `**/*.spec.ts` override from task 21 now has nothing to complain about.

- [ ] **Step 5: Run the full gate**

Run: `npm run cbt`
Expected: PASS.

- [ ] **Step 6: Update the CHANGELOG**

```markdown
- **Tests:** All 81 `@ts-ignore` directives in the specs became `@ts-expect-error`, which fails when the suppressed error disappears and therefore doubles as an assertion about the types. `@typescript-eslint/ban-ts-comment` now rejects `@ts-ignore` in `**/*.spec.ts` so it cannot drift back.
```

- [ ] **Step 7: Commit**

```bash
git add src/on.spec.ts src/eventize.spec.ts CHANGELOG.md
git commit -m "test: replace @ts-ignore with @ts-expect-error across the specs (TEST-003)"
```

---

## Phase 2 gate

- [ ] `npm run cbt` PASS
- [ ] `grep -rn "@ts-ignore\|@ts-expect-error" src/*.ts` — no suppressions in production files
- [ ] `tsconfig.json` has `"strictNullChecks": true`

---

# Phase 3 — Semantics → v6.0.0

## Task 23: `off(ε)` clears retained state

**Model:** Opus
**Finding:** MEM-001 (high) — **BREAKING**

**Files:**
- Modify: `src/eventize-api.ts:437-462` (`off`)
- Test: `src/lifecycle.spec.ts`, `src/off.spec.ts`

**Interfaces:**
- Consumes: task 8 (`EventKeeper.removeAll()`)
- Produces: nothing

After `retain(ε,'data'); emit(ε,'data',payload); off(ε)`, `getSubscriptionCount()` reads 0 but `keeper.events.size` still reads 1 — the payload stays strongly referenced, and a subscriber arriving afterwards still gets it replayed. The keeper is only touched when `off()` is called with an event name or an array of them. The cleanup call everyone reads as "everything gone" is precisely the one that clears nothing.

- [ ] **Step 1: Write the failing test**

Append to `src/off.spec.ts`:

```ts
  describe('off(ε) clears retained state', () => {
    it('drops retained values and policies', () => {
      const obj = eventize();
      retain(obj, 'data');
      emit(obj, 'data', {big: 'payload'});
      expect(getRetainedCount(obj)).toBe(1);

      off(obj);

      expect(getRetainedCount(obj)).toBe(0);
      expect(getRetainedEventNames(obj)).toEqual([]);
    });

    it('a later subscriber receives nothing', () => {
      const obj = eventize();
      retain(obj, 'data');
      emit(obj, 'data', 'payload');

      off(obj);

      const late = fake();
      on(obj, 'data', late);
      expect(late.callCount).toBe(0);
    });

    it("off(ε, '*') behaves the same", () => {
      const obj = eventize();
      retain(obj, 'data');
      emit(obj, 'data', 'payload');

      off(obj, '*');

      expect(getRetainedCount(obj)).toBe(0);
      expect(getRetainedEventNames(obj)).toEqual([]);
    });

    it('leaves other emitters alone', () => {
      const a = eventize();
      const b = eventize();
      retain(a, 'x');
      retain(b, 'x');
      emit(a, 'x', 1);
      emit(b, 'x', 2);

      off(a);

      expect(getRetainedCount(a)).toBe(0);
      expect(getRetainedCount(b)).toBe(1);
    });
  });
```

Add `getRetainedCount`, `getRetainedEventNames` and `retain` to the file's `./index` import if missing.

Also flip the corresponding case in `src/lifecycle.spec.ts` — the "keeper size" describe block gains:

```ts
    it('off(ε) drops every retained value and policy', () => {
      const obj = eventize();
      retain(obj, ['a', 'b']);
      emit(obj, 'a', 1);
      emit(obj, 'b', 2);

      off(obj);

      expect(getRetainedCount(obj)).toBe(0);
      expect(getRetainedEventNames(obj)).toEqual([]);
    });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/off.spec.ts -t "off(ε) clears retained state"`
Expected: the first three FAIL. The fourth passes (isolation was never broken).

- [ ] **Step 3: Clear the keeper on the wipe-everything path**

In `src/eventize-api.ts`, `off()`:

```ts
export function off(
  eventizedObj: unknown,
  listener?: unknown,
  listenerObject?: unknown,
): void {
  if (!isEventized(eventizedObj)) {
    return;
  }
  const {store, keeper} = eventizedObj[NAMESPACE];
  const listenerType = typeof listener;
  const forceRemove =
    listenerObject != null &&
    (listenerType === 'string' || listenerType === 'symbol');
  store.remove(listener, listenerObject, forceRemove);

  // off(ε) and off(ε, '*') wipe the store completely; the keeper follows.
  // Leaving retained payloads behind after "remove everything" kept them
  // strongly referenced and still replayed them to later subscribers.
  if (
    listener == null ||
    (listenerObject == null && listener === EVENT_CATCH_EM_ALL)
  ) {
    keeper.removeAll();
    return;
  }

  if (Array.isArray(listener)) {
    // Only the event-name elements are meaningful to the keeper. Arrays reach
    // this branch from two directions: an explicit off(ε, [name, …]) call, and
    // the unsubscribe function returned by a multi-event on(), which passes an
    // array of EventListener instances. Filtering by isEventName keeps symbol
    // event names — which the old `typeof === 'string'` test silently dropped —
    // while still ignoring listener instances.
    keeper.remove(listener.filter(isEventName));
  } else if (isEventName(listener)) {
    keeper.remove(listener);
  }
}
```

The new guard must sit before the array/name branches, and it must mirror `EventStore.remove()`'s own wipe-everything condition exactly — `listener == null` or a bare `'*'` with no listener object. Re-read `EventStore.remove()` lines 179-185 and confirm the two conditions match.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/off.spec.ts src/lifecycle.spec.ts`
Expected: PASS.

- [ ] **Step 5: Run the whole suite**

Run: `npm test`

Expect failures in existing specs that asserted retained state survives `off(ε)`. Each one must be examined individually: if it asserted the old behaviour, update it and note the file in the commit body. If it asserted something else that broke, stop and report.

- [ ] **Step 6: Update docs and CHANGELOG**

`docs/off.md`, `docs/retain.md`, `docs/lifecycle.md` and `AGENTS.md` all describe the old asymmetry. Update every one — `AGENTS.md` under "Known asymmetries" loses the entry entirely, since the asymmetry is gone.

`CHANGELOG.md` under `## Unreleased`:

```markdown
- **BREAKING:** `off(ε)` and `off(ε, '*')` now clear retained state as well as listeners. Previously they emptied the listener registry completely and left the `EventKeeper` untouched, so retained payloads stayed strongly referenced and were still replayed to any subscriber arriving afterwards — the call everyone reads as "everything gone" was precisely the one that cleared nothing, while `off(ε, eventName)` had always dropped both the value and the policy for its name. **Migration:** code that relied on retained values surviving a bulk `off(ε)` must re-`retain()` and re-`emit()` afterwards, or switch to the targeted `off(ε, eventName)` / `off(ε, [names])` forms, which are unchanged. `getRetainedCount(ε)` makes the difference visible in a test. Affects `src/eventize-api.ts`.
```

- [ ] **Step 7: Commit**

```bash
git add src/eventize-api.ts src/off.spec.ts src/lifecycle.spec.ts docs/ AGENTS.md CHANGELOG.md
git commit -m "fix(off)!: clear retained state on off(ε) and off(ε, '*') (MEM-001)"
```

---

## Task 24: `once()` is exempt from listener dedup

**Model:** Opus
**Finding:** MEM-002 (high) — **BREAKING**

**Files:**
- Modify: `src/EventStore.ts` (`add` takes a `noDedup` flag)
- Modify: `src/subscribeTo.ts` (thread the flag through)
- Modify: `src/eventize-api.ts` (`once` passes it)
- Test: `src/once.spec.ts`, `src/lifecycle.spec.ts`

**Interfaces:**
- Consumes: task 9 (the identity comparison in `registerEventListener` — it keeps working unchanged, because with `noDedup` the returned listener is always the new one)
- Produces:
  - `EventStore.add(listener: EventListener, noDedup?: boolean): EventListener`
  - `subscribeTo(store, keeper, args, noDedup?)` and `subscribeToDeferred(store, keeper, args, noDedup?)`

Two `once(ε,'foo',listenerObject)` calls on the same object — or the method-name form — collapse into **one** `EventListener` with `refCount = 2` via `insertOrFindSimilarListener`. Both `once()` calls set `callAfterApply` in turn; the second overwrites the first. After the first emit only one `unsubscribe` runs, dropping `refCount` from 2 to 1, and its own `unsubscribeCalled` guard stops the surviving handle from ever decrementing again. In the audit's test the listener fired on three consecutive emits and stayed subscribed. `once()` is then not a once at all but an `on()` whose returned handles can no longer release it — only an external `off(ε, listenerObject)` gets rid of it.

Reference counting is documented and intended for `on()`. For `once()` it makes little sense: two one-shot subscriptions should mean two firings.

- [ ] **Step 1: Write the failing tests**

Append to `src/once.spec.ts`:

```ts
  describe('no dedup between once() registrations', () => {
    it('two once() on the same listener object fire twice, then detach', () => {
      const obj = eventize();
      const listenerObject = {foo: fake()};

      once(obj, 'foo', listenerObject);
      once(obj, 'foo', listenerObject);
      expect(getSubscriptionCount(obj)).toBe(2);

      emit(obj, 'foo', 'first');

      expect(listenerObject.foo.callCount).toBe(2);
      expect(getSubscriptionCount(obj)).toBe(0);

      emit(obj, 'foo', 'second');
      expect(listenerObject.foo.callCount).toBe(2);
    });

    it('the same holds for the method-name form', () => {
      const obj = eventize();
      const listenerObject = {handler: fake()};

      once(obj, 'foo', 'handler', listenerObject);
      once(obj, 'foo', 'handler', listenerObject);
      expect(getSubscriptionCount(obj)).toBe(2);

      emit(obj, 'foo');

      expect(listenerObject.handler.callCount).toBe(2);
      expect(getSubscriptionCount(obj)).toBe(0);
    });

    it('each returned handle releases its own subscription', () => {
      const obj = eventize();
      const listenerObject = {foo: fake()};

      const first = once(obj, 'foo', listenerObject);
      const second = once(obj, 'foo', listenerObject);

      first();
      expect(getSubscriptionCount(obj)).toBe(1);

      second();
      expect(getSubscriptionCount(obj)).toBe(0);

      emit(obj, 'foo');
      expect(listenerObject.foo.callCount).toBe(0);
    });

    it('on() still deduplicates', () => {
      const obj = eventize();
      const listenerObject = {foo: fake()};

      on(obj, 'foo', listenerObject);
      on(obj, 'foo', listenerObject);

      expect(getSubscriptionCount(obj)).toBe(1);
      emit(obj, 'foo');
      expect(listenerObject.foo.callCount).toBe(1);
    });

    it('a once() and an on() on the same object stay independent', () => {
      const obj = eventize();
      const listenerObject = {foo: fake()};

      on(obj, 'foo', listenerObject);
      once(obj, 'foo', listenerObject);
      expect(getSubscriptionCount(obj)).toBe(2);

      emit(obj, 'foo');
      expect(listenerObject.foo.callCount).toBe(2);
      expect(getSubscriptionCount(obj)).toBe(1);

      emit(obj, 'foo');
      expect(listenerObject.foo.callCount).toBe(3);
    });

    it('two once() on a retained event both receive the replay', () => {
      const obj = eventize();
      const listenerObject = {foo: fake()};

      retain(obj, 'foo');
      emit(obj, 'foo', 'RETAINED');

      once(obj, 'foo', listenerObject);
      once(obj, 'foo', listenerObject);

      expect(listenerObject.foo.callCount).toBe(2);
      expect(getSubscriptionCount(obj)).toBe(0);
    });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/once.spec.ts -t "no dedup between once"`
Expected: the first three FAIL. `on() still deduplicates` passes and must keep passing — it is the guard that this change does not spill into `on()`.

- [ ] **Step 3: Give `EventStore.add` a `noDedup` flag**

```ts
  /**
   * Returns the given listener, or — when an identical one is already
   * registered and `noDedup` is false — the existing one with its reference
   * count increased.
   *
   * `once()` passes `noDedup: true`: two one-shot subscriptions mean two
   * firings, and collapsing them leaves a listener whose own idempotence
   * guard blocks its handles from ever releasing it.
   */
  add(listener: EventListener, noDedup = false): EventListener {
    const bucket = listener.isCatchEmAll
      ? this.catchEmAllListeners
      : this.getListenersForEventName(listener.eventName);
    if (noDedup) {
      bucket.splice(findInsertIndex(bucket, listener), 0, listener);
      return listener;
    }
    return insertOrFindSimilarListener(listener, bucket);
  }
```

- [ ] **Step 4: Thread the flag through `subscribeTo.ts`**

`registerEventListener` gains a `noDedup` parameter and passes it to `store.add`:

```ts
const registerEventListener = (
  store: EventStore,
  keeper: EventKeeper,
  eventName: EventName,
  priority: number,
  listener: unknown,
  listenerObject: ListenerObjectType,
  retainedEvents: KeeperEvent[],
  noDedup: boolean,
): EventListener => {
  const newListener = new EventListener(
    eventName,
    priority,
    listener,
    listenerObject,
  );
  const el = store.add(newListener, noDedup);
  // store.add() returns the argument when it inserted, or an existing similar
  // listener whose refCount it bumped. Replaying to the latter would deliver
  // the retained event a second time to a listener that already got it.
  if (el === newListener) {
    keeper.replayTo(eventName, el, retainedEvents);
  }
  return el;
};
```

`_subscribeTo` gains the same parameter and forwards it in its `register` closure:

```ts
const _subscribeTo = (
  store: EventStore,
  keeper: EventKeeper,
  args: EventArgs,
  retainedEvents: KeeperEvent[],
  noDedup: boolean,
): EventListener | Array<EventListener> => {
```

```ts
  const register = (prio: number) => (event: EventName) =>
    registerEventListener(
      store,
      keeper,
      event,
      prio,
      listener,
      listenerObject,
      retainedEvents,
      noDedup,
    );
```

And both exported entry points:

```ts
export const subscribeTo = (
  store: EventStore,
  keeper: EventKeeper,
  args: EventArgs,
  noDedup = false,
): EventListener | Array<EventListener> => {
  const retainedEvents: KeeperEvent[] = [];
  const listener = _subscribeTo(store, keeper, args, retainedEvents, noDedup);
  EventKeeper.publish(retainedEvents);
  return listener;
};

export const subscribeToDeferred = (
  store: EventStore,
  keeper: EventKeeper,
  args: EventArgs,
  noDedup = false,
): {
  listeners: EventListener | Array<EventListener>;
  publishRetained: () => void;
} => {
  const retainedEvents: KeeperEvent[] = [];
  const listeners = _subscribeTo(store, keeper, args, retainedEvents, noDedup);
  return {
    listeners,
    publishRetained: () => EventKeeper.publish(retainedEvents),
  };
};
```

- [ ] **Step 5: Pass `true` from `once()`**

In `src/eventize-api.ts`, the `once` implementation, one line changes:

```ts
  const {listeners, publishRetained} = subscribeToDeferred(
    store,
    keeper,
    args,
    true,
  );
```

`on()` keeps calling `subscribeTo(store, keeper, args)` with the default `false`.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test -- src/once.spec.ts`
Expected: PASS.

- [ ] **Step 7: Flip the `it.failing` in `src/lifecycle.spec.ts`**

Change `it.failing('does not degenerate into a permanent listener'` back to `it(` and delete the MEM-002 comment above it.

Run: `npm test -- src/lifecycle.spec.ts`
Expected: PASS. An `it.failing` whose body now succeeds is itself a failure, so this step is not optional.

- [ ] **Step 8: Run the whole suite**

Run: `npm test`

Watch `src/on_multiple_times.spec.ts` and `src/onceAsync.spec.ts`. Any spec asserting that two `once()` calls produce one subscription asserted the defect — update it and list the file in the commit body.

- [ ] **Step 9: Update docs and CHANGELOG**

`docs/off.md`, `docs/lifecycle.md`, `skills/using-eventize/references/api-details.md` and `AGENTS.md` all describe reference-counted dedup. Each needs the qualification that it applies to `on()` only.

```markdown
- **BREAKING:** `once()` no longer deduplicates against existing listeners. Two `once(ε, 'foo', listenerObject)` calls on the same object used to collapse into one `EventListener` with `refCount = 2`; both set `callAfterApply` in turn, the second overwrote the first, and after the first emit only one `unsubscribe` ran — dropping the count to 1 while its own idempotence guard stopped the surviving handle from ever decrementing again. The result fired on every subsequent emit and could only be removed by an external `off(ε, listenerObject)`. Each `once()` now gets its own listener instance, so two one-shot subscriptions mean two firings and each returned handle releases exactly its own. **Migration:** code that registered the same listener object with `once()` more than once and expected a single call now receives one call per registration. `on()` is unchanged — reference-counted dedup there is documented and intended. Affects `src/EventStore.ts`, `src/subscribeTo.ts`, `src/eventize-api.ts`.
```

- [ ] **Step 10: Commit**

```bash
git add src/EventStore.ts src/subscribeTo.ts src/eventize-api.ts src/once.spec.ts src/lifecycle.spec.ts docs/ skills/ AGENTS.md CHANGELOG.md
git commit -m "fix(once)!: exempt once() registrations from listener dedup (MEM-002)"
```

---

## Task 25: Deprecate the legacy priority aliases

**Model:** Sonnet
**Finding:** INFO-001 (info)

**Files:**
- Modify: `src/types.ts:309-321` (`EventizePriority`)
- Modify: `src/Priority.ts`
- Test: `src/Priority.spec.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `Priority.Medium = 1e3` — the modern name for the value `C` carries.

`AAA`, `BB`, `C` and `Default` still sit beside the speaking names `Max` / `Critical` / `High` / `Normal` / `Low` / `Min` and are pinned into the exported interface through `EventizePriority`. A comment marks them legacy, but nothing warns at the point of use — and `C: 1e3` has no modern counterpart at all. Its value falls between `High` (1e6) and `Normal` (0), so it is not an alias of anything.

- [ ] **Step 1: Write the test**

Append to `src/Priority.spec.ts`:

```ts
  describe('Medium', () => {
    it('carries the value the legacy C alias always had', () => {
      expect(Priority.Medium).toBe(1e3);
      expect(Priority.C).toBe(Priority.Medium);
    });

    it('sorts between High and Normal', () => {
      expect(Priority.High).toBeGreaterThan(Priority.Medium);
      expect(Priority.Medium).toBeGreaterThan(Priority.Normal);
    });
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/Priority.spec.ts -t "Medium"`
Expected: FAIL — `Priority.Medium` is `undefined`, and TypeScript rejects the property access.

- [ ] **Step 3: Add `Medium` and deprecate the four aliases in `src/types.ts`**

```ts
export interface EventizePriority {
  Max: number;
  Critical: number;
  High: number;
  Medium: number;
  Normal: number;
  Low: number;
  Min: number;
  /** @deprecated Use `Critical`. Slated for removal in a future major. */
  AAA: number;
  /** @deprecated Use `High`. Slated for removal in a future major. */
  BB: number;
  /** @deprecated Use `Medium`. Slated for removal in a future major. */
  C: number;
  /** @deprecated Use `Normal`. Slated for removal in a future major. */
  Default: number;
}
```

- [ ] **Step 4: Add the value in `src/Priority.ts`**

```ts
export const Priority: EventizePriority = {
  Max: Number.POSITIVE_INFINITY,
  Critical: 1e9,
  High: 1e6,
  Medium: 1e3,
  Normal: 0,
  Low: -1e4,
  Min: Number.NEGATIVE_INFINITY,
  // Legacy aliases — deprecated, see EventizePriority. `C` is the reason
  // `Medium` exists: its value sits between High and Normal and was never an
  // alias of anything.
  AAA: 1e9,
  BB: 1e6,
  C: 1e3,
  Default: 0,
};
```

- [ ] **Step 5: Run the tests**

Run: `npm test -- src/Priority.spec.ts`
Expected: PASS.

- [ ] **Step 6: Run the full gate**

Run: `npm run cbt`
Expected: PASS. `@deprecated` on interface members must survive into the emitted `.d.ts` — check `lib/index.d.ts` after the build:

```bash
grep -A 1 "@deprecated" lib/index.d.ts | head -20
```

Expected: four `@deprecated` lines. If `removeComments: true` in `tsconfig.json` strips them from the declarations, the deprecation is invisible to editors and the finding is not closed — report that rather than declaring victory.

- [ ] **Step 7: Update docs and CHANGELOG**

`README.md` and `skills/using-eventize/references/api-details.md` where priorities are listed: add `Medium`, mark the four aliases deprecated.

```markdown
- **Feature:** `Priority.Medium` (`1e3`) fills the gap the legacy `C` alias occupied — a value between `High` (`1e6`) and `Normal` (`0`) that no speaking name covered. The four legacy aliases `AAA`, `BB`, `C` and `Default` are now marked `@deprecated` in `EventizePriority`, so editors strike them through, and are slated for removal in a future major. They keep working.
```

- [ ] **Step 8: Commit**

```bash
git add src/types.ts src/Priority.ts src/Priority.spec.ts README.md skills/ CHANGELOG.md
git commit -m "feat(priority): add Medium, deprecate the four legacy aliases (INFO-001)"
```

---

## Task 26: Documentation-only findings

**Model:** Sonnet
**Findings:** ARCH-001 (medium), INFO-002 (info), MEM-008 (info), MEM-005 (doc half)

**Files:**
- Modify: `AGENTS.md` (architecture invariants)
- Modify: `src/subscribeTo.ts:39-56` (comments only)
- Modify: `docs/retain.md`

**Interfaces:**
- Consumes: nothing
- Produces: nothing. No runtime or type change in this task.

- [ ] **Step 1: ARCH-001 — document the module-global counter boundary**

`nextOrderId` (`src/EventKeeper.ts:14`) and `lastId` (`src/EventListener.ts:48`) are module-global `let` variables. `lastId` decides secondary sorting among equal priorities, `nextOrderId` the replay order of retained events. Load the ESM and CJS builds in the same process — which a dual-format package explicitly permits — and two independent counter pairs run, so the ordering guarantee only holds within one instance.

Add to `AGENTS.md` under "Architecture invariants":

```markdown
**Counters are per module instance.** `EventListener.lastId` (secondary sort
among equal priorities) and `EventKeeper.nextOrderId` (replay order of
retained events) are module-global `let` variables. Loading the ESM and the
CJS build in the same process — which the dual-format package permits —
gives you two independent counter pairs, so ordering stability is guaranteed
per loaded module instance, not per realm. This is deliberate: the
`Symbol.for('eventize')` marker is realm-wide because identity must be, the
counters are not because sorting only ever compares listeners on the same
emitter, and one emitter comes from one module instance.
```

The audit offers a realm-wide registry as the alternative and calls documentation "the more honest and cheaper solution". That is the choice here.

- [ ] **Step 2: INFO-002 — number the branches in `_subscribeTo`**

Eighteen `on()` overloads are destructured onto four variables by a cascade of length checks and `typeof` tests. The code is correct and broadly covered by specs, but the overload → branch mapping exists only in the reader's head. The comment block at `src/eventize-api.ts:128-138` already numbers them; make the numbers visible at the second place they concern.

In `src/subscribeTo.ts`, one line above each branch:

```ts
  if (len >= 2 && len <= 3 && typeOfFirstArg === 'number') {
    // (4) catch-all with priority: on(priority, listener[, listenerObject])
    eventName = EVENT_CATCH_EM_ALL;
    [priority, listener, listenerObject] = args;
  } else if (len >= 3 && len <= 4 && typeof args[1] === 'number') {
    // (1)-(3) with an explicit priority: on(eventNames, priority, …)
    [eventName, priority, listener, listenerObject] = args;
  } else {
    priority = Priority.Default;
    if (
      typeOfFirstArg === 'string' ||
      typeOfFirstArg === 'symbol' ||
      Array.isArray(args[0])
    ) {
      // (1)-(3) at default priority: on(eventNames, listener|methodName|obj[, obj])
      [eventName, listener, listenerObject] = args;
    } else {
      // (4) catch-all at default priority: on(listener|obj[, listenerObject])
      eventName = EVENT_CATCH_EM_ALL;
      [listener, listenerObject] = args;
    }
  }
```

Verify each number against the comment block in `eventize-api.ts` before committing — a wrong cross-reference is worse than none.

- [ ] **Step 3: MEM-008 and MEM-005 — retained payloads are strong references**

`keeper.events.get(name).args[0]` is identical to the object passed in; the keeper makes no copy. That is the only sensible implementation — an event library must not clone payloads — but it has a consequence written nowhere: one `retain()` on an event that once carried a large buffer, a DOM element or an object graph keeps it alive until the next emit of that event, until `retainClear()`, or until the emitter dies.

Add to `docs/retain.md` under "Notes":

```markdown
### Retained payloads are strong references

The keeper stores the emit arguments as they were passed — no copy, no clone.
An event library must not clone payloads, so this is the only sensible
implementation, but it means a single `retain()` on an event that once
carried a large buffer, a DOM node or an object graph keeps that object alive
until the next emit of the same event, until `retainClear()`, or until the
emitter itself is collected. For large payloads, `retainClear(ε, eventName)`
is the antidote and worth calling deliberately.

### Dynamically generated event names

`retain()` with per-entity names — `item:${id}` — is supported, and cleanup is
the caller's job. There is no eviction, no cap and no LRU: an event library
does not get to guess what you still need. What it gives you instead is
visibility and a bulk switch:

```js
getRetainedCount(emitter);        // how many events hold a value
getRetainedEventNames(emitter);   // which names carry a policy
unretain(emitter, '*');           // drop every policy and value
retainClear(emitter, '*');        // drop the values, keep the policies
```

A thousand `retain(ε, 'item-' + n)` rounds leave a thousand entries with their
full payloads. That is not a leak in the library; it is a ledger you opened.
```

- [ ] **Step 4: Verify nothing but comments and docs changed**

```bash
git diff --stat
npm test
```

Expected: PASS, with `src/subscribeTo.ts` showing only comment additions in the diff.

- [ ] **Step 5: Update the CHANGELOG**

```markdown
- **Docs:** Three behaviours that were true but unrecorded are now written down. Retained payloads are held by strong reference and are not cloned, so one `retain()` on an event carrying a large buffer or a DOM node pins it until the next emit, `retainClear()`, or the emitter's death (`docs/retain.md`). `retain()` with dynamically generated names is a supported pattern in which cleanup belongs to the caller — no eviction, no cap, but `getRetainedCount()`, `getRetainedEventNames()` and the `'*'` bulk forms to manage it with (`docs/retain.md`). And ordering stability from the module-global id counters holds per loaded module instance, not per realm, so mixing the ESM and CJS builds in one process gives two independent counter pairs (`AGENTS.md`). `src/subscribeTo.ts` gained per-branch comments naming the `on()` overload numbers each branch decodes, matching the numbering already in `src/eventize-api.ts`.
```

- [ ] **Step 6: Commit**

```bash
git add AGENTS.md src/subscribeTo.ts docs/retain.md CHANGELOG.md
git commit -m "docs: record retained-payload lifetime, dynamic names, counter scope, overload branches (ARCH-001, INFO-002, MEM-008, MEM-005)"
```

---

## Task 27: `docs/lifecycle.md` final and the v6.0.0 release

**Model:** Sonnet

**Files:**
- Modify: `docs/lifecycle.md`, `README.md`, `AGENTS.md`, `skills/using-eventize/`
- Modify: `CHANGELOG.md`, `package.json`

**Interfaces:**
- Consumes: tasks 19-26
- Produces: the released v6.0.0

- [ ] **Step 1: Revise `docs/lifecycle.md` for the new semantics**

Two sections written in task 18 are now wrong:

- The `off()` table's "retained state" column: `off(ε)` and `off(ε,'*')` now clear it. Remove the "changes in v6.0.0" note.
- Anything describing reference-counted dedup must say it applies to `on()` only; `once()` registrations are independent.

Re-read the whole file against `src/lifecycle.spec.ts` and fix every claim that no longer has a witness.

- [ ] **Step 2: Write the migration section**

Add a "Migrating from v5" section to `docs/lifecycle.md` covering both breaks with before/after snippets:

```markdown
## Migrating from v5

### `off(ε)` now clears retained state

```js
// v5 — the retained value survived
retain(ε, 'config');
emit(ε, 'config', settings);
off(ε);
on(ε, 'config', fn);   // fn received `settings`

// v6 — off(ε) clears everything
retain(ε, 'config');
emit(ε, 'config', settings);
off(ε);
on(ε, 'config', fn);   // fn receives nothing

// if you wanted the old behaviour, name what you're removing:
off(ε, 'someOtherEvent');   // targeted forms are unchanged
```

### `once()` no longer deduplicates

```js
// v5 — collapsed into one listener that then never stopped firing
once(ε, 'ready', handlerObject);
once(ε, 'ready', handlerObject);
emit(ε, 'ready');   // one call, still subscribed, handles could not release it

// v6 — two independent one-shot subscriptions
once(ε, 'ready', handlerObject);
once(ε, 'ready', handlerObject);
emit(ε, 'ready');   // two calls, both detached
```
```

- [ ] **Step 3: Add the bundle-size line to the README**

Measure it first:

```bash
npm run build
ls -l lib/index.mjs lib/index.js
```

Then, near the top of `README.md`:

```markdown
Zero runtime dependencies, `sideEffects: false`, tree-shakeable. The ESM
build is about NN kB unminified.
```

Use the measured number rounded to one decimal. The audit measured 22.4 kB at v5.1.0; re-measure rather than copying it.

- [ ] **Step 4: Sweep the docs for stale claims**

```bash
grep -rn "refCount\|reference count\|retained" README.md docs/ skills/ AGENTS.md
```

Read every hit against the v6 behaviour. `AGENTS.md` "Known asymmetries" in particular: the `off(ε, name)` / `unretain()` entry stays, the `off(ε)` keeper asymmetry entry must be gone (task 23), and the wildcard entry from task 8 must be there.

- [ ] **Step 5: Close the release section in the CHANGELOG**

```markdown
## `v6.0.0` (YYYY-MM-DD) — Cleanup means cleanup
```

Lead with a paragraph naming the two breaking changes and pointing at `docs/lifecycle.md#migrating-from-v5`. Order the bullets: BREAKING first, then features, fixes, types, tests, docs. Re-open an empty `## Unreleased` above.

- [ ] **Step 6: Bump the version**

```bash
npm version 6.0.0 --no-git-tag-version
```

- [ ] **Step 7: Run the full gate**

Run: `npm run cbt`
Expected: PASS.

- [ ] **Step 8: Verify the tarball**

```bash
npm pack --dry-run
```

Expected: `lib/`, `docs/` (including `lifecycle.md`), `skills/`, `README.md`, `CHANGELOG.md`, `LICENSE`, `package.json`. Nothing else.

- [ ] **Step 9: Commit and tag**

```bash
git add -A
git commit -m "chore: v6.0.0 release"
git tag v6.0.0
```

Do not push or publish. Report that the release is staged.

---

## Phase 3 gate

- [ ] `npm run cbt` PASS
- [ ] `src/lifecycle.spec.ts` fully green, no `it.failing` left
- [ ] Both breaking changes have migration snippets in `docs/lifecycle.md`
- [ ] v6.0.0 tagged, not pushed

---

# Phase 4 — Dependencies

**Versioning, clarified 2026-07-26.** Whether a change is breaking no longer decides where it lands. The version bump is decided once, at the end of the backlog, by looking at what actually accumulated. So: never soften a fix to keep a release non-breaking, never defer one to a later release for that reason, and never spend effort arguing whether something "counts" as breaking.

`CHANGELOG.md` entries keep their **BREAKING** markers — those describe the *nature* of a change and are what the final versioning decision will be read off. They no longer imply a release boundary.

Consequence for the tags already placed: `v5.2.0` and `v6.0.0` exist locally and neither is pushed. Work from here lands after `v6.0.0`, so that tag no longer points at `HEAD`. Do not move or delete either tag inside a task — the final versioning step resolves them.

## Task 28: Minor and patch updates

**Model:** Sonnet
**Finding:** DEP-002 (low, the minor half)

**Files:**
- Modify: `package.json`, `package-lock.json`

**Interfaces:**
- Consumes: nothing
- Produces: nothing

`npm outdated` reports 14 packages. Most are minor lags: `@arethetypeswrong/cli` 0.18.2 → 0.18.5, `@eslint/js` 9.32 → 9.39, `cross-env` 10.0 → 10.1, `jest` 30.0.5 → 30.4.2, `prettier` 3.6.2 → 3.9.6, `rimraf` 6.0.1 → 6.1.3, `sinon` 21.0 → 21.1, `ts-jest` 29.4.1 → 29.4.12, `tsup` 8.5.0 → 8.5.1, `typescript-eslint` 8.39 → 8.65, `typescript` 5.9.2 → 5.9.3. `npm audit` reports zero vulnerabilities — this is about currency, not security, and with zero runtime dependencies the published package's attack surface is unaffected either way.

- [ ] **Step 1: Record the starting state**

```bash
npm outdated > /tmp/outdated-before.txt; cat /tmp/outdated-before.txt
```

- [ ] **Step 2: Pull the minors**

```bash
npm update
```

This respects the `^` ranges, so it will not cross a major.

- [ ] **Step 3: Run the full gate**

Run: `npm run cbt`
Expected: PASS.

`prettier` 3.6 → 3.9 is the likeliest to fail `format:check` — formatting defaults do shift between minors. If it does:

```bash
npm run format:write
git diff --stat
```

Review the diff. Pure whitespace and line-break churn is fine; anything else, stop and report.

- [ ] **Step 4: Confirm what moved**

```bash
npm outdated
```

Expected: only `eslint`, `@eslint/js`, `globals` and `typescript` remain, all showing major gaps.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/
git commit -m "chore(deps): pull dev-dependency minors and patches (DEP-002)"
```

---

## Task 29: `globals` and `eslint` majors

**Model:** Sonnet
**Finding:** DEP-002 (low, two of three majors)

**Files:**
- Modify: `package.json`, `package-lock.json`, possibly `eslint.config.mjs`

**Interfaces:**
- Consumes: task 21 (the current ESLint config), task 28
- Produces: nothing

One major per commit, each with its own gate. If one fails and cannot be resolved within the task, revert that one and continue with the next — a blocked major is not a reason to leave the others behind.

- [ ] **Step 1: `globals` 16 → 17**

```bash
npm install --save-dev globals@^17
npm run lint
```

Expected: PASS. `globals` only ships environment key sets; a major bump usually means removed legacy environments. If `globals.node`, `globals.jest` or `globals.browser` disappeared, consult the package's changelog for the replacement key and update `eslint.config.mjs` accordingly.

- [ ] **Step 2: Gate and commit `globals`**

Run: `npm run cbt`
Expected: PASS.

```bash
git add package.json package-lock.json eslint.config.mjs
git commit -m "chore(deps): globals 16 -> 17 (DEP-002)"
```

- [ ] **Step 3: `eslint` 9 → 10**

```bash
npm install --save-dev eslint@^10 @eslint/js@^10
npm run lint
```

The flat config format is already in use, so the migration surface is small. Expect churn around: `tseslint.config()` compatibility (`typescript-eslint` must support ESLint 10 — check its peer range with `npm ls eslint`), and rules promoted or removed in the major.

- [ ] **Step 4: Gate and commit `eslint`**

Run: `npm run cbt`
Expected: PASS.

If `typescript-eslint` does not yet declare ESLint 10 in its peer range, revert this step:

```bash
git checkout package.json package-lock.json && npm ci
```

and record it in the CHANGELOG as deliberately deferred with the reason. A forced install that leaves an unsupported peer combination is worse than an outdated one.

```bash
git add package.json package-lock.json eslint.config.mjs
git commit -m "chore(deps): eslint 9 -> 10 (DEP-002)"
```

---

## Task 30: TypeScript 7

**Model:** Opus
**Finding:** DEP-002 (low, the risky major)

**Files:**
- Modify: `package.json`, `package-lock.json`, possibly `tsconfig.json`, `tsup.config.js`, `jest.config.ts`

**Interfaces:**
- Consumes: tasks 19, 20, 28, 29
- Produces: nothing

TypeScript 7 ships the native compiler. It re-measures the behaviour of `attw`, `ts-jest` and the generated `.d.ts` — for a dual-format package with hand-tuned overload sets, that is the one upgrade in this backlog that can break the shipped product without breaking a test.

**Abort condition:** if `npm run cbt` is not green after one focused attempt, revert, leave the dependency at 5.9, and record the reason in the CHANGELOG. An outdated TypeScript is a known state; a half-migrated one is not.

- [ ] **Step 1: Establish the baseline**

```bash
npm run cbt
npx attw --pack > /tmp/attw-before.txt; cat /tmp/attw-before.txt
ls -l lib/
cp lib/index.d.ts /tmp/index.d.ts.before
```

All four resolution modes (node10, node16 CJS, node16 ESM, bundler) must be green before you start, or you are debugging two things at once.

- [ ] **Step 2: Install**

```bash
npm install --save-dev typescript@^7
npx tsc --version
```

- [ ] **Step 3: Type-check first, in isolation**

```bash
npx tsc --noEmit
```

Fix what appears. `strictNullChecks` (task 19) is already on, so the remaining surprises are mostly stricter inference on the conditional types in `src/types.ts` — `NonTypedEmitter<T>`, `ArgsFor`, `ListenerFor`, `EventKeysOf`.

Do **not** loosen a type to make an error go away. If a conditional type no longer resolves as intended, that is a real change in what the public API accepts, and it needs the overload set revisited rather than a cast.

- [ ] **Step 4: Build and diff the declarations**

```bash
npm run build
diff /tmp/index.d.ts.before lib/index.d.ts
```

Read the whole diff. Cosmetic reordering is fine. A changed signature, a widened parameter or a dropped overload is a public API change and must be either reverted or written into the CHANGELOG as such.

- [ ] **Step 5: Verify the dual-format types**

```bash
npx attw --pack
```

Expected: all four modes green, matching `/tmp/attw-before.txt`. This is the check that exists precisely for this class of breakage.

- [ ] **Step 6: Run tests and the full gate**

```bash
npm test
npm run cbt
```

`ts-jest` compiles the specs, so a `ts-jest` incompatibility with TypeScript 7 surfaces here. Check `npm ls typescript` for a peer conflict before debugging anything else.

- [ ] **Step 7: Either commit or abort**

On success:

```markdown
- **Chore:** TypeScript 5.9 → 7. The generated declarations were diffed against the 5.9 output and `attw --pack` verified green in all four resolution modes; no public signature changed.
```

```bash
git add package.json package-lock.json tsconfig.json src/ CHANGELOG.md
git commit -m "chore(deps): typescript 5.9 -> 7 (DEP-002)"
```

On abort:

```bash
git checkout package.json package-lock.json tsconfig.json src/
npm ci
npm run cbt
```

Then record the reason in `CHANGELOG.md` under `## Unreleased` and report it to the user with the specific failure. Do not leave the tree in a partially migrated state.

---

## Task 31: Check in the Dependabot configuration

**Model:** Haiku
**Finding:** DEP-002 (the configuration half)

**Files:**
- Create: `.github/dependabot.yml`

**Interfaces:**
- Consumes: nothing
- Produces: nothing

Dependabot is active on the repository (see commit a0ba6bc) but without a checked-in `.github/dependabot.yml`. Configuration that only exists in the GitHub UI cannot be reviewed, diffed or reasoned about from the repo.

- [ ] **Step 1: Create the file**

```yaml
version: 2

updates:
  - package-ecosystem: npm
    directory: "/"
    schedule:
      interval: weekly
    open-pull-requests-limit: 5
    groups:
      # Minors and patches arrive as one PR per week; majors stay separate so
      # each gets its own review and its own cbt run.
      dev-dependencies:
        dependency-type: development
        update-types:
          - minor
          - patch

  - package-ecosystem: github-actions
    directory: "/"
    schedule:
      interval: monthly
```

- [ ] **Step 2: Verify it parses**

```bash
node -e "
const fs=require('fs');
const s=fs.readFileSync('.github/dependabot.yml','utf8');
if (!s.startsWith('version: 2')) throw new Error('missing version key');
console.log('ok, ' + s.split('\n').length + ' lines');
"
```

GitHub validates the schema on push; a syntax error shows up in the repository's Insights → Dependency graph → Dependabot tab.

- [ ] **Step 3: Commit**

```bash
git add .github/dependabot.yml
git commit -m "chore: check in the dependabot configuration (DEP-002)"
```

---

## Phase 4 gate

- [ ] `npm run cbt` PASS
- [ ] `npm outdated` — empty, or only entries deliberately deferred with a CHANGELOG note
- [ ] `npm audit` — 0 vulnerabilities

---

# Final verification

- [ ] `npm run cbt` PASS
- [ ] `npm test -- --coverage` — coverage at or above the thresholds from task 6
- [ ] `npm pack --dry-run` — `lib/`, `docs/`, `skills/`, `README.md`, `CHANGELOG.md`, `LICENSE`, `package.json`, nothing else
- [ ] Every one of the 35 audit findings has either a commit or a CHANGELOG note explaining why it was deliberately deferred
- [ ] `git log --oneline` — one commit per finding, each carrying its ID
- [ ] v5.2.0 and v6.0.0 tagged locally, neither pushed nor published

## Finding coverage map

| Finding | Task | Finding | Task |
| --- | --- | --- | --- |
| MEM-001 | 8 (bulk), 23 (breaking) | TYPE-001 | 19 |
| MEM-002 | 24 | TYPE-002 | 21 |
| MEM-003 | 7 | TYPE-003 | 20 |
| MEM-004 | 15 | TEST-001 | 6 |
| MEM-005 | 16 (API), 26 (docs) | TEST-002 | 17 |
| MEM-006 | 12 | TEST-003 | 22 |
| MEM-007 | 13 | ARCH-001 | 26 |
| MEM-008 | 26 | ARCH-002 | 1 |
| BUG-001 | 8 | ARCH-003 | 19 |
| BUG-002 | 10 | DX-001 | 1 |
| CORR-001 | 9 | DX-002 | 3 |
| API-001 | 11 | DX-003 | 5 |
| API-002 | 16 | DEP-001 | 2 |
| PERF-001 | 14 | DEP-002 | 28, 29, 30, 31 |
| PKG-001 | 3 | INFO-001 | 25 |
| BUILD-001 | 4 | INFO-002 | 26 |
| BUILD-002 | 5 | IMPL-001 | 1 |
| BUILD-003 | 5 | | |

35 findings, 31 tasks, nothing unassigned.
