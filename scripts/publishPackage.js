#!/usr/bin/env node

const {exec} = require('child_process');
const process = require('process');

const pkgJson = require('../package.json');

function publishPackage() {
  exec(`npm publish --access public`, (error, stdout, stderr) => {
    console.error(stderr);
    console.log(stdout);

    if (!error) {
      process.exit(0);
    } else {
      process.exit(error);
    }
  });
}

exec(`npm show ${pkgJson.name} versions --json`, (error, stdout, stderr) => {
  if (!error) {
    const versions = JSON.parse(stdout);
    if (versions.includes(pkgJson.version)) {
      console.log(
        'skipping publish, version',
        pkgJson.version,
        'already published',
      );
      process.exit(0);
    } else {
      publishPackage();
    }
  } else {
    console.error(`exec error: ${stderr}`);
  }
});
