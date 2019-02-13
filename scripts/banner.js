const path = require('path');
const fs = require('fs');
const packageJson = require('../package.json');

module.exports = {
  banner:
    fs.readFileSync(path.join(__dirname, '../src/LICENSE.js'), { encoding: 'utf-8' })
      .replace('#NPM_NAME#', packageJson.name)
      .replace('#NPM_VERSION#', packageJson.version)
      .replace('#NPM_URL#', packageJson.repository.url)
      .replace('#NPM_COPYRIGHT_YEAR#', new Date().getFullYear()),
};
