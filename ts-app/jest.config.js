/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts'],
  clearMocks: true,
  transform: {
    '^.+\\.ts$': ['ts-jest', { diagnostics: false }],
  },
  collectCoverageFrom: [
    'src/*/index.ts',
    '!src/**/*.test.ts',
    '!src/types/**',
  ],
};
