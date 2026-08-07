/**
 * Jest config for @qis/api.
 *
 * NOTE: apps/api had `"test": "jest --passWithNoTests"` in package.json but
 * no jest.config anywhere in the repo, so it was silently a no-op — any
 * .spec.ts file placed here would never have been picked up or transformed.
 * This file wires up ts-jest so NestJS service-level unit tests actually run.
 *
 * .cjs extension is used deliberately: apps/api/package.json declares
 * "type": "module", so a plain .js config here would be parsed as ESM and
 * break Jest's CommonJS config loader.
 */

/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  moduleFileExtensions: ['js', 'json', 'ts'],
  // Workspace packages (packages/*) declare "exports": { ".": { "import":
  // "./dist/index.js" } } with no "require" condition, so Jest's default
  // CJS resolver can't find them even though dist/index.js exists on disk.
  // Map @qis/<name> straight to the built file to bypass the exports map.
  // NOTE: this same import/require-condition mismatch is a real concern
  // for `nest start`/production too, not just tests — see audit notes.
  moduleNameMapper: {
    '^@qis/core$': '<rootDir>/../../../packages/core/dist/index.js',
    '^@qis/shared$': '<rootDir>/../../../packages/shared/dist/index.js',
    '^@qis/logger$': '<rootDir>/../../../packages/logger/dist/index.js',
    '^@qis/ai-engine$': '<rootDir>/../../../packages/engines/ai-engine/dist/index.js',
    '^@qis/analytics-engine$': '<rootDir>/../../../packages/engines/analytics-engine/dist/index.js',
    '^@qis/backtest-engine$': '<rootDir>/../../../packages/engines/backtest-engine/dist/index.js',
    '^@qis/exchange-engine$': '<rootDir>/../../../packages/engines/exchange-engine/dist/index.js',
    '^@qis/execution-engine$': '<rootDir>/../../../packages/engines/execution-engine/dist/index.js',
    '^@qis/grid-engine$': '<rootDir>/../../../packages/engines/grid-engine/dist/index.js',
    '^@qis/market-engine$': '<rootDir>/../../../packages/engines/market-engine/dist/index.js',
    '^@qis/notification-engine$': '<rootDir>/../../../packages/engines/notification-engine/dist/index.js',
    '^@qis/portfolio-engine$': '<rootDir>/../../../packages/engines/portfolio-engine/dist/index.js',
    '^@qis/strategy-engine$': '<rootDir>/../../../packages/engines/strategy-engine/dist/index.js',
    '^@qis/providers-ai$': '<rootDir>/../../../packages/providers/ai/dist/index.js',
    '^@qis/providers-exchange$': '<rootDir>/../../../packages/providers/exchange/dist/index.js',
  },
  // ccxt (via @noble/curves, @noble/hashes, @scure/*) ships ESM-only files in
  // node_modules that Jest's default transformIgnorePatterns would skip, causing
  // "Cannot use import statement outside a module". Allow those packages to be
  // transpiled by ts-jest. The negative lookahead examines whatever follows
  // `node_modules/` anywhere in the path — without it, pnpm's root
  // `node_modules/.pnpm/...` prefix would make the ignore pattern match
  // unconditionally and the ESM files would never be transformed.
  transformIgnorePatterns: ['node_modules/(?!.*(?:@noble|@scure)/)'],
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', { isolatedModules: true, tsconfig: '<rootDir>/../tsconfig.json' }],
  },
  collectCoverageFrom: ['**/*.(t|j)s', '!**/*.spec.ts', '!**/main.ts'],
  coverageDirectory: '../coverage',
};
