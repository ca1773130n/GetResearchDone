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
    './lib/autoplan.ts': { lines: 90, functions: 90, branches: 75 },
    './lib/autopilot.ts': { lines: 93, functions: 93, branches: 80 },
    './lib/backend.ts': { lines: 95, functions: 100, branches: 88 },
    './lib/cleanup.ts': { lines: 92, functions: 96, branches: 80 },
    './lib/commands/index.ts': { lines: 90, functions: 95, branches: 70 },
    './lib/context/index.ts': { lines: 87, functions: 83, branches: 77 },
    './lib/deps.ts': { lines: 94, functions: 100, branches: 87 },
    './lib/evolve/index.ts': { lines: 85, functions: 94, branches: 70 },
    './lib/frontmatter.ts': { lines: 89, functions: 100, branches: 78 },
    './lib/gates.ts': { lines: 98, functions: 100, branches: 82 },
    './lib/long-term-roadmap.ts': { lines: 97, functions: 100, branches: 83 },
    './lib/markdown-split.ts': { lines: 95, functions: 100, branches: 90 },
    './lib/mcp-server.ts': { lines: 90, functions: 85, branches: 55 },
    './lib/parallel.ts': { lines: 85, functions: 100, branches: 80 },
    './lib/paths.ts': { lines: 95, functions: 100, branches: 95 },
    './lib/phase.ts': { lines: 91, functions: 94, branches: 70 },
    './lib/roadmap.ts': { lines: 91, functions: 94, branches: 83 },
    './lib/scaffold.ts': { lines: 90, functions: 100, branches: 70 },
    './lib/state.ts': { lines: 85, functions: 88, branches: 77 },
    './lib/tracker.ts': { lines: 84, functions: 89, branches: 70 },
    './lib/utils.ts': { lines: 92, functions: 95, branches: 85 },
    './lib/verify.ts': { lines: 85, functions: 100, branches: 70 },
    './lib/worktree.ts': { lines: 84, functions: 100, branches: 72 },
  },
  testTimeout: 15000,
};
