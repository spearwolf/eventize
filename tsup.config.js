import {defineConfig} from 'tsup';
import {banner} from './scripts/createBanner.mjs';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  outDir: 'lib',
  banner: {js: banner},
  target: 'es2022',
  // tsconfig.json sets removeComments: true, which also strips JSDoc (e.g.
  // @deprecated) from tsup's own dts-generation pass — verified by comparing
  // the raw tsc output with and without the flag. Overriding it here only for
  // the declaration build keeps the flag intact for the JS bundle (esbuild
  // ignores it anyway) and for ts-jest, while letting editors see @deprecated
  // and every other doc comment on the published .d.ts / .d.mts (INFO-001).
  dts: {compilerOptions: {removeComments: false}},
  splitting: false,
  sourcemap: true,
  minify: false,
  clean: true,
});
