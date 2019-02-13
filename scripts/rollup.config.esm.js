import path from 'path';
import babel from 'rollup-plugin-babel';
import { terser } from 'rollup-plugin-terser';

import bannerPlugin from './bannerPlugin';

const root = path.resolve(__dirname, '..');

export default {
  input: 'src/eventize.module.js',
  output: {
    file: path.join(root, 'dist', 'eventize.mjs'),
    sourcemap: true,
    sourcemapFile: path.join(root, 'dist', 'eventize.mjs.map'),
    format: 'esm',
  },
  plugins: [
    bannerPlugin,
    babel({
      presets: [[
        '@babel/preset-env', {
          debug: false,
          targets: {
            esmodules: true,
          },
        },
      ]],
    }),
    terser({
      output: { comments: /^!/ },
    }),
  ],
};
