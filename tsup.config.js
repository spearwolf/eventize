import {defineConfig} from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  outDir: 'build',
  splitting: false,
  sourcemap: false,
  minify: true,
  clean: true,
});
