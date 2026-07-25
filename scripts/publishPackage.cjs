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
