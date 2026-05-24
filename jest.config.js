/** @type {import('jest').Config} */
module.exports = {
  testMatch: ['**/tests/**/*.test.js', '**/tests/**/*.test.ts'],
  // Benchmark task fixtures (tests/benchmark/tasks/**) are standalone
  // before/after code samples the internal-bench harness copies into a
  // sandbox and runs THERE. They reference sandbox-local modules
  // (e.g. ./_helpers) that don't exist in-tree, so they must not be
  // collected as part of the project test suite. (Mirror of the tsconfig
  // exclude; jest has its own discovery.)
  testPathIgnorePatterns: ['/node_modules/', '/tests/benchmark/tasks/'],
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
    './lib/discussion.ts': { lines: 85, functions: 100, branches: 85 },
    './lib/autoplan.ts': { lines: 90, functions: 90, branches: 75 },
    './lib/autopilot.ts': { lines: 83, functions: 85, branches: 75 },
    './lib/autopilot-waves.ts': { lines: 80, functions: 90, branches: 70 },
    './lib/autopilot-milestone.ts': { lines: 80, functions: 90, branches: 70 },
    './lib/autopilot-pipeline.ts': { lines: 75, functions: 85, branches: 65 },
    './lib/backend.ts': { lines: 92, functions: 85, branches: 83 },
    './lib/citations.ts': { lines: 85, functions: 85, branches: 75 },
    './lib/cleanup.ts': { lines: 92, functions: 96, branches: 80 },
    './lib/commands/index.ts': { lines: 90, functions: 95, branches: 70 },
    './lib/context/index.ts': { lines: 87, functions: 83, branches: 77 },
    './lib/deps.ts': { lines: 94, functions: 100, branches: 87 },
    './lib/evolve/_product-ideation.ts': { lines: 80, functions: 100, branches: 60 },
    './lib/evolve/index.ts': { lines: 85, functions: 94, branches: 70 },
    './lib/frontmatter.ts': { lines: 89, functions: 100, branches: 78 },
    './lib/gates.ts': { lines: 100, functions: 100, branches: 81 },
    './lib/got.ts': { lines: 80, functions: 85, branches: 70 },
    './lib/invariants.ts': { lines: 90, functions: 90, statements: 90, branches: 85 },
    './lib/knowledge.ts': { lines: 85, functions: 100, branches: 75 },
    './lib/long-term-roadmap.ts': { lines: 97, functions: 100, branches: 83 },
    './lib/markdown-split.ts': { lines: 95, functions: 100, branches: 90 },
    './lib/mcp-server.ts': { lines: 85, functions: 85, branches: 55 },
    './lib/parallel.ts': { lines: 85, functions: 100, branches: 80 },
    './lib/paths.ts': { lines: 95, functions: 100, branches: 94 },
    './lib/phase.ts': { lines: 91, functions: 94, branches: 70 },
    './lib/roadmap.ts': { lines: 91, functions: 94, branches: 83 },
    './lib/scaffold.ts': { lines: 90, functions: 100, branches: 70 },
    './lib/scheduler-wait.ts': { lines: 95, functions: 100, branches: 80 },
    './lib/state.ts': { lines: 85, functions: 88, branches: 77 },
    './lib/tracker.ts': { lines: 84, functions: 89, branches: 70 },
    './lib/utils.ts': { lines: 92, functions: 95, branches: 85 },
    './lib/verify.ts': { lines: 85, functions: 100, branches: 70 },
    './lib/wireup/index.ts': { lines: 85, functions: 85, branches: 70 },
    './lib/overstory.ts': { lines: 90, functions: 90, branches: 80 },
    './lib/worktree.ts': { lines: 74, functions: 80, branches: 66 },
    './lib/refinement.ts': { lines: 85, functions: 85, branches: 75 },
    './lib/benchmark.ts': { lines: 85, functions: 85, branches: 75 },
    './lib/phase-complete.ts': { lines: 93, functions: 100, branches: 61 },
    './lib/complexity.ts': { lines: 95, functions: 100, branches: 85 },
    './lib/commands/plan-lint.ts': { lines: 85, functions: 90, branches: 75 },
    './lib/commands/plan-phase.ts': { lines: 88, functions: 60, branches: 80 },
    './lib/commands/select-candidate.ts': { lines: 90, functions: 90, branches: 75 },
    './lib/commands/patterns.ts': { lines: 90, functions: 90, branches: 70 },
  },
  testTimeout: 15000,
};
