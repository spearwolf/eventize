import {defineConfig} from 'tsup';
import {banner} from './scripts/createBanner.mjs';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  outDir: 'lib',
  banner: {js: banner},
  target: 'es2021',
  dts: true,
  splitting: false,
  sourcemap: true,
  minify: false,
  clean: true,
});
