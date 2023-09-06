/* eslint-env node */

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

import {makeVersionWithBuild} from './prependBanner/makeVersionWithBuild.mjs';
import makeBanner from './prependBanner/makeBanner.mjs';

const projectDir = path.resolve(
  path.join(url.fileURLToPath(import.meta.url), '../..'),
);

process.chdir(projectDir);

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));

const [, , buildType, inFile, outFile] = process.argv;

const version = makeVersionWithBuild(buildType)(packageJson.version);
const banner = makeBanner({
  ...packageJson,
  version,
});

if (!outFile) {
  console.log(
    `simple usage:\n  $ node ${path.basename(
      process.argv[1],
    )} <buildType> <inFile> <outFile>\n`,
  );
  console.log('buildType:', buildType);
  console.log('inFile:', inFile);
  console.log('outFile:', outFile);
  console.log('version:', version);
  console.log(`banner:\n${banner}`);
  process.exit(1);
}

if (!fs.existsSync(inFile)) {
  console.log('file does not exist:', inFile);
  process.exit(2);
}

console.log(fs.existsSync(outFile) ? 'override' : 'write', outFile);

const source = fs.readFileSync(inFile, 'utf8');
const output = `${banner}\n${source}`;

try {
  fs.mkdirSync(path.dirname(outFile), true);
} catch {}

fs.writeFileSync(outFile, output, 'utf8');
