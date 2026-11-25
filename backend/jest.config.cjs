/**
 * Jest config for the Juthoor backend (ES modules — NestJS 12 is ESM-only, see ADR-0003).
 * Run through `npm test` / `npm run test:cov`, which start Node with --experimental-vm-modules.
 *
 * NFR-024: core business logic needs >= 80% branch coverage. The threshold applies to files the
 * tests load. When core modules exist, list them in collectCoverageFrom so untested core files
 * also count (docs/open-questions.md, Q-B1).
 */
/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>'],
  testMatch: ['**/*.spec.ts', '**/*.e2e-spec.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  extensionsToTreatAsEsm: ['.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { useESM: true, tsconfig: 'tsconfig.json', diagnostics: { ignoreCodes: [151002] } }],
  },
  // Source imports use ESM-style ".js" extensions; map them back to the .ts files.
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  collectCoverageFrom: [
    'apps/**/*.ts',
    'libs/**/*.ts',
    '!**/*.spec.ts',
    '!**/*.module.ts',
    '!**/*.schema.ts',
    '!**/dto/**',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text-summary', 'lcov', 'json-summary'],
  coverageThreshold: { global: { branches: 80 } },
};
