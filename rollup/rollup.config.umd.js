/* eslint-env node */
import path from 'path';

import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import replace from '@rollup/plugin-replace';
import typescript from '@rollup/plugin-typescript';
import {sizeSnapshot} from 'rollup-plugin-size-snapshot';
import {terser} from 'rollup-plugin-terser';

import createBannerPlugin from './bannerPlugin';
import {makeVersionWithBuild} from './makeVersionWithBuild';

const projectDir = path.resolve(path.join(path.dirname(__filename), '..'));
const outputDir = path.join(projectDir, 'build');

const packageJson = require(path.join(projectDir, 'package.json'));
const version = makeVersionWithBuild('es2017')(packageJson.version);
const name = 'eventize';

const extensions = ['.js', '.ts', '.json'];

export default {
  input: 'src/index.ts',
  output: {
    name,
    file: path.join(outputDir, `${name}.umd.js`),
    sourcemap: true,
    sourcemapFile: path.join(outputDir, `${name}.umd.js.map`),
    format: 'umd',
  },
  plugins: [
    typescript(),
    createBannerPlugin({...packageJson, version}),
    commonjs(),
    resolve({
      extensions,
    }),
    replace({
      preventAssignment: true,
      NODE_ENV: JSON.stringify('production'),
    }),
    terser({
      output: {comments: /^!/},
      ecma: 2017,
      safari10: true,
      compress: {
        global_defs: {
          DEBUG: false,
        },
      },
    }),
    sizeSnapshot(),
  ],
};
