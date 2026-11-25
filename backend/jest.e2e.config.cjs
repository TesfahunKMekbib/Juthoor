/** E2E config: needs MONGODB_URI (a MongoDB server; tests create and drop their own random database). */
const base = require('./jest.config.cjs');
module.exports = {
  ...base,
  testMatch: ['<rootDir>/test/**/*.e2e-spec.ts'],
  testTimeout: 30000,
  collectCoverage: false,
  coverageThreshold: undefined,
};
