/*
 * For a detailed explanation regarding each configuration property and type check, visit:
 * https://jestjs.io/docs/en/configuration.html
 */

export default {
  // Automatically clear mock calls and instances between every test
  clearMocks: true,

  // Which files count towards coverage — sources only, no specs, no fixtures
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.spec.ts',
    '!src/__test-utils__/**',
  ],

  // Set just below the state measured within the collectCoverageFrom scope
  // above, so the threshold binds instead of decorating. The unfiltered
  // figures (i.e. without the collectCoverageFrom filter, which also pulls
  // in the fully-covered src/__test-utils__/) run about a tenth of a point
  // higher — don't use those as the reference when re-measuring.
  // Raise these when coverage rises; never lower them to make a build pass.
  coverageThreshold: {
    global: {
      statements: 99,
      branches: 98,
      functions: 99,
      lines: 99,
    },
  },

  // An array of file extensions your modules use
  moduleFileExtensions: ['js', 'ts'],

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
    '^.+\\.[tj]s$': ['ts-jest', {tsconfig: './tsconfig.json'}],
  }
};
