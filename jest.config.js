/** @type {import('jest').Config} */
module.exports = {
  testMatch: ['**/tests/**/*.test.js', '**/tests/**/*.test.ts'],
  collectCoverageFrom: ['lib/**/*.js', 'lib/**/*.ts', '!lib/**/*.d.ts'],
  coverageDirectory: 'coverage',
  // Only .ts files are transformed (via ts-jest). .js files have no transform
  // entry, so Jest loads them natively via Node's CommonJS require() — identical
  // to the pre-TypeScript behavior. This preserves all existing JS test behavior.
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  coverageThreshold: {
    // === Existing per-file thresholds (DO NOT MODIFY) ===
    './lib/autopilot.js': { lines: 93, functions: 93, branches: 80 },
    './lib/backend.ts': { lines: 95, functions: 100, branches: 88 },
    './lib/cleanup.ts': { lines: 92, functions: 96, branches: 80 },
    './lib/commands.js': { lines: 90, functions: 95, branches: 70 },
    './lib/context.js': { lines: 87, functions: 83, branches: 77 },
    './lib/deps.js': { lines: 94, functions: 100, branches: 87 },
    './lib/evolve.js': { lines: 85, functions: 94, branches: 70 },
    './lib/frontmatter.ts': { lines: 89, functions: 100, branches: 78 },
    './lib/gates.ts': { lines: 98, functions: 100, branches: 82 },
    './lib/long-term-roadmap.js': { lines: 97, functions: 100, branches: 83 },
    './lib/markdown-split.ts': { lines: 95, functions: 100, branches: 90 },
    './lib/mcp-server.js': { lines: 90, functions: 85, branches: 55 },
    './lib/parallel.js': { lines: 85, functions: 100, branches: 80 },
    './lib/paths.ts': { lines: 95, functions: 100, branches: 95 },
    './lib/phase.js': { lines: 91, functions: 94, branches: 70 },
    './lib/roadmap.ts': { lines: 91, functions: 94, branches: 83 },
    './lib/scaffold.js': { lines: 90, functions: 100, branches: 70 },
    './lib/state.ts': { lines: 85, functions: 88, branches: 77 },
    './lib/tracker.js': { lines: 85, functions: 89, branches: 70 },
    './lib/utils.ts': { lines: 92, functions: 95, branches: 85 },
    './lib/verify.js': { lines: 85, functions: 100, branches: 70 },
    './lib/worktree.js': { lines: 84, functions: 100, branches: 73 },

    // === TypeScript modules (added during migration) ===
    './lib/sample.ts': { lines: 90, functions: 100, branches: 80 },
  },
  testTimeout: 15000,
};
