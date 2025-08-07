import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier/flat';
import globals from 'globals';

export default tseslint.config(
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
      'no-fallthrough': 0,
      'no-undef-init': 0,
      'no-use-before-define': 0,
      'prefer-rest-params': 0,

      '@typescript-eslint/ban-ts-comment': 0,
      '@typescript-eslint/ban-ts-ignore': 0,
      '@typescript-eslint/ban-types': 0,
      '@typescript-eslint/explicit-function-return-type': 0,
      '@typescript-eslint/interface-name-prefix': 0,
      '@typescript-eslint/no-empty-function': 0,
      '@typescript-eslint/no-empty-interface': 0,
      '@typescript-eslint/no-empty-object-type': 0,
      '@typescript-eslint/no-explicit-any': 0,
      '@typescript-eslint/no-non-null-assertion': 0,
      '@typescript-eslint/no-this-alias': 0,
      '@typescript-eslint/no-unsafe-declaration-merging': 0,
      '@typescript-eslint/no-unsafe-function-type': 0,
      '@typescript-eslint/no-var-requires': 0,

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
);
