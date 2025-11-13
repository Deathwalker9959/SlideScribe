/**
 * Jest Configuration for Frontend Testing
 * Optimized for Office Add-in and React testing
 */

module.exports = {
  // Test environment
  testEnvironment: 'jsdom',

  // Setup files
  setupFilesAfterEnv: ['<rootDir>/tests/setupTests.ts'],

  // Test file patterns
  testMatch: [
    '<rootDir>/tests/**/*.test.(ts|tsx|js|jsx)',
    '<rootDir>/tests/**/*.spec.(ts|tsx|js|jsx)',
  ],

  // Coverage configuration
  collectCoverage: true,
  collectCoverageFrom: [
    'src/**/*.(ts|tsx|js|jsx)',
    '!src/**/*.d.ts',
    '!src/index.tsx',
    '!src/taskpane/index.tsx',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],

  // TypeScript compilation
  preset: 'ts-jest',
  transform: {
    '^.+\\.(ts|tsx)$': 'ts-jest',
    '^.+\\.(js|jsx)$': 'babel-jest',
  },

  // Module resolution
  moduleNameMapping: {
    '^@components/(.*)$': '<rootDir>/src/taskpane/components/$1',
    '^@ui/(.*)$': '<rootDir>/src/taskpane/components/ui/$1',
    '^@styles/(.*)$': '<rootDir>/src/taskpane/styles/$1',
    '^@utils/(.*)$': '<rootDir>/src/taskpane/utils/$1',
    '^@state/(.*)$': '<rootDir>/src/taskpane/state/$1',
  },

  // File extensions to process
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],

  // Ignore patterns
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/build/',
    '/build-smoke/',
  ],

  // Transform ignore patterns
  transformIgnorePatterns: [
    'node_modules/(?!(.*\\.mjs$))',
  ],

  // Mock files
  modulePathIgnorePatterns: [
    '<rootDir>/dist',
    '<rootDir>/build',
  ],

  // Global variables
  globals: {
    'ts-jest': {
      tsconfig: {
        jsx: 'react-jsx',
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
      },
    },
  },

  // Clear mocks between tests
  clearMocks: true,

  // Verbose output
  verbose: true,

  // Error reporting
  errorOnDeprecated: true,

  // Maximum workers
  maxWorkers: '50%',

  // Test timeout
  testTimeout: 10000,

  // Watch plugins
  watchPlugins: [
    'jest-watch-typeahead/filename',
    'jest-watch-typeahead/testname',
  ],

  // Reporter configuration
  reporters: [
    'default',
    [
      'jest-junit',
      {
        outputDirectory: 'test-results',
        outputName: 'junit.xml',
      },
    ],
  ],

  // Environment-specific settings
  projects: [
    {
      displayName: 'unit',
      testMatch: ['<rootDir>/tests/**/*.unit.test.(ts|tsx|js|jsx)'],
      setupFilesAfterEnv: ['<rootDir>/tests/setupTests.ts'],
    },
    {
      displayName: 'integration',
      testMatch: ['<rootDir>/tests/**/*.integration.test.(ts|tsx|js|jsx)'],
      setupFilesAfterEnv: ['<rootDir>/tests/setupTests.ts'],
      testTimeout: 15000,
    },
    {
      displayName: 'component',
      testMatch: ['<rootDir>/tests/**/*.component.test.(ts|tsx|js|jsx)'],
      setupFilesAfterEnv: ['<rootDir>/tests/setupTests.ts'],
    },
  ],
};