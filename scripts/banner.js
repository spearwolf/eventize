import path from 'path';
import fs from 'fs';

import packageJson from '../package.json';

export default {
  banner:
    fs.readFileSync(path.join(__dirname, '../src/LICENSE.js'), { encoding: 'utf-8' })
      .replace('#NPM_NAME#', packageJson.name)
      .replace('#NPM_VERSION#', packageJson.version)
      .replace('#NPM_URL#', packageJson.repository.url)
      .replace('#NPM_COPYRIGHT_YEAR#', new Date().getFullYear()),
};
