/* eslint-env node */

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

import makeBanner from './createBanner/makeBanner.mjs';
import {makeVersionWithBuild} from './createBanner/makeVersionWithBuild.mjs';

const projectDir = path.resolve(
  path.join(url.fileURLToPath(import.meta.url), '../..'),
);

process.chdir(projectDir);

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));

const [, , buildType] = process.argv;

const version = makeVersionWithBuild(buildType)(packageJson.version);
const banner = makeBanner({
  ...packageJson,
  version,
});

export {banner};
