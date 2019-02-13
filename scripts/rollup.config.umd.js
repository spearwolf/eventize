import path from 'path';
import babel from 'rollup-plugin-babel';
import { terser } from 'rollup-plugin-terser';

import bannerPlugin from './bannerPlugin';

const root = path.resolve(__dirname, '..');

export default {
  input: 'src/eventize.umd.js',
  output: {
    file: path.join(root, 'dist', 'eventize.umd.js'),
    sourcemap: true,
    sourcemapFile: path.join(root, 'dist', 'eventize.umd.js.map'),
    format: 'umd',
    name: 'eventize',
    exports: 'default',
  },
  plugins: [
    bannerPlugin,
    babel({
      presets: [[
        '@babel/preset-env', {
          debug: false,
          modules: false,
          useBuiltIns: 'entry',
          targets: {
            browsers: ['> 2%', 'not dead'],
          },
        },
      ]],
    }),
    terser({
      output: { comments: /^!/ },
    }),
  ],
};
