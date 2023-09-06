/*
 * For a detailed explanation regarding each configuration property and type check, visit:
 * https://jestjs.io/docs/en/configuration.html
 */

export default {
  // Automatically clear mock calls and instances between every test
  clearMocks: true,

  // An array of file extensions your modules use
  moduleFileExtensions: ['js', 'json', 'ts'],

  // Activates notifications for test results
  notify: false,

  // A preset that is used as a base for Jest's configuration
  preset: 'ts-jest',

  // The root directory that Jest should scan for tests and modules within
  rootDir: ".",

  // A list of paths to directories that Jest should use to search for files in
  // roots: ['<rootDir>', './tests'],
  roots: ['<rootDir>'],

  // The glob patterns Jest uses to detect test files
  testMatch: [
    '**/src/**/?(*.)+(spec|test).[tj]s?(x)',
  ],

  // A map from regular expressions to paths to transformers
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', {tsconfig: './tsconfig.spec.json'}],
  }
};
