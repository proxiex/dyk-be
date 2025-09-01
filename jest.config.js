module.exports = {
  // Test environment
  testEnvironment: 'node',

  // Test file patterns
  testMatch: [
    '**/tests/**/*.test.js',
    '**/tests/**/*.spec.js',
    '**/__tests__/**/*.js',
  ],

  // Coverage collection
  collectCoverage: true,
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/server.js', // Exclude server startup file
    '!src/**/*.test.js',
    '!src/**/*.spec.js',
    '!**/node_modules/**',
  ],

  // Coverage directory
  coverageDirectory: 'coverage',

  // Coverage reporters
  coverageReporters: [
    'text',
    'lcov',
    'html',
    'json',
  ],

  // Coverage thresholds
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },

  // Setup files to run before tests
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],

  // Module directories
  moduleDirectories: ['node_modules', 'src'],

  // Test timeout
  testTimeout: 30000,

  // Verbose output
  verbose: true,

  // Clear mocks between tests
  clearMocks: true,

  // Reset modules between tests
  resetModules: true,

  // Transform configuration for ES modules
  transform: {
    '^.+\\.js$': 'babel-jest',
  },

  // Module name mapping for absolute imports
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@tests/(.*)$': '<rootDir>/tests/$1',
  },

  // Global variables
  globals: {
    'process.env': {
      NODE_ENV: 'test',
      JWT_SECRET: 'test-jwt-secret',
      JWT_REFRESH_SECRET: 'test-refresh-secret',
      DATABASE_URL: 'postgresql://test:test@localhost:5432/dailyfacts_test',
    },
  },

  // Files to ignore
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/coverage/',
  ],

  // Watch ignore patterns
  watchPathIgnorePatterns: [
    '/node_modules/',
    '/coverage/',
    '/logs/',
  ],
};
