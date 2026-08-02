const {readFileSync} = require('node:fs');

// The published type surface carries exactly one class. Everything the store,
// the keeper and the listener need stays behind internalsOf(), and a type that
// reaches any of them makes tsup inline all three into the declaration file —
// private method names and all. That boundary was documented and unchecked for
// as long as it existed; this is the check. See AGENTS.md, "the internals
// boundary".
//
// Both declaration files, not just the CJS one: tsup emits index.d.mts
// alongside index.d.ts, package.json#exports points at each from its own
// condition, and a leak reaches consumers through whichever one they resolve.
const FILES = ['lib/index.d.ts', 'lib/index.d.mts'];
const ALLOWED = new Set(['Eventize']);

let failed = false;

for (const file of FILES) {
  let source;
  try {
    source = readFileSync(file, 'utf8');
  } catch {
    console.error(`[dts] ${file} is missing — run "npm run build" first`);
    failed = true;
    continue;
  }

  // Names, not a count: a bare number says something slipped, this says what.
  const declared = [...source.matchAll(/^declare class (\w+)/gm)].map(
    (match) => match[1],
  );
  const leaked = declared.filter((name) => !ALLOWED.has(name));

  if (leaked.length > 0) {
    console.error(
      `[dts] ${file} declares ${declared.length} classes; these do not belong on the public surface: ${leaked.join(', ')}`,
    );
    failed = true;
  }
}

if (failed) {
  process.exit(1);
}

console.log('[dts] declaration surface ok');
