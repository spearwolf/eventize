import {defineConfig} from 'eslint/config';
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier/flat';
import globals from 'globals';

export default defineConfig(
  {
    ignores: ['.vscode/*', '**/lib', '**/build', '**/node_modules'],
  },
  eslint.configs.recommended,
  tseslint.configs.recommended,
  eslintConfigPrettier,
  {
    files: ['**/*.{mjs,cjs}', 'scripts/*.{js,mjs,cjs}'],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: ['**/*.spec.{js,ts}'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
    },
  },
  {
    files: ['src/**/*.{js,ts}'],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
  },
  {
    files: ['**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    files: ['**/*.cjs'],
    rules: {
      '@typescript-eslint/no-require-imports': 0,
    },
  },
  {
    files: ['**/*.ts'],
    rules: {
      eqeqeq: [2, 'smart'],
      // `== null` / `!= null` is the intended nullish test throughout the
      // dispatch code; `no-fallthrough` would flag the deliberate
      // string/symbol case grouping in detectListenerType().
      'no-fallthrough': 0,
      'no-undef-init': 0,
      'no-use-before-define': 0,
      'prefer-rest-params': 0,

      // The public surface is a set of overloads over `unknown` args that the
      // implementation decodes positionally — `any` is the type of the thing
      // being decoded, not a shortcut around one.
      '@typescript-eslint/no-explicit-any': 0,
      '@typescript-eslint/no-unsafe-function-type': 0,

      // Listener objects are described structurally by their method names;
      // an empty object type is a legitimate listener.
      '@typescript-eslint/no-empty-object-type': 0,
      '@typescript-eslint/no-empty-function': 0,

      // `Eventize` and the composition-over-inheritance test fixture both
      // merge an empty `interface Foo extends Bar {}` with a same-named
      // class to graft the interface's type onto the class — a real,
      // deliberate pattern, not an oversight. This rule (unlike ban-types,
      // ban-ts-ignore, and interface-name-prefix, which were removed
      // outright) still exists in typescript-eslint v8 as a deprecated
      // alias for no-empty-object-type, and it still fires on both
      // declarations when enabled.
      '@typescript-eslint/no-empty-interface': 0,

      // Warn rather than error: each remaining use should be justified in a
      // comment, but a stray one must not block the build.
      '@typescript-eslint/ban-ts-comment': 1,
      '@typescript-eslint/no-non-null-assertion': 1,
      '@typescript-eslint/no-this-alias': 1,
      '@typescript-eslint/no-unsafe-declaration-merging': 1,
      '@typescript-eslint/explicit-function-return-type': 0,

      '@typescript-eslint/no-use-before-define': [
        2,
        {
          functions: false,
        },
      ],

      '@typescript-eslint/no-unused-vars': [
        2,
        {
          vars: 'all',
          args: 'after-used',
          argsIgnorePattern: '^_',
        },
      ],

      '@typescript-eslint/consistent-type-assertions': [
        2,
        {
          assertionStyle: 'as',
          objectLiteralTypeAssertions: 'allow-as-parameter',
        },
      ],
    },
  },
  {
    files: ['**/*.spec.ts'],
    rules: {
      // Specs test the type layer as much as the runtime. @ts-expect-error
      // fails when the error disappears and is therefore itself an
      // assertion; @ts-ignore is silent in both directions.
      '@typescript-eslint/ban-ts-comment': [
        2,
        {'ts-ignore': true, 'ts-expect-error': false},
      ],
    },
  },
);
