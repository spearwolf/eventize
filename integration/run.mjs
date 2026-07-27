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
const phases = phaseArg === 'both' ? ['baseline', 'patched'] : [phaseArg];

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
  if (run('npm', ['pack', '--pack-destination', OUT_ROOT], {cwd: ROOT}) !== 0) {
    die('npm pack failed');
  }
}

if (!existsSync(tarball)) {
  die(`expected tarball not found: ${tarball}\n(did the version change?)`);
}

const sha = createHash('sha256').update(readFileSync(tarball)).digest('hex');
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
  const steps = r.steps.map((s) => `${s.name}=${s.exitCode}`).join(' ');
  console.log(`  ${phase.padEnd(9)} exit ${r.exitCode}  ${steps}`);
}
console.log(`${'='.repeat(70)}`);
console.log(`artifacts: ${OUT_ROOT}`);

// A red baseline is the measurement, not a failure. The exit code follows the
// patched phase when it ran, so `npm run test:integrations` is only green when
// the patch set actually carries signalize onto this eventize.
process.exit(results.patched ?? results.baseline ?? 1);
