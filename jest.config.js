/** @type {import('jest').Config} */
module.exports = {
  testMatch: ['**/tests/**/*.test.js'],
  collectCoverageFrom: ['lib/**/*.js'],
  coverageDirectory: 'coverage',
  coverageThreshold: {
    // Per-file thresholds for tested modules (raised as coverage grows)
    './lib/utils.js': {
      lines: 85,
      functions: 90,
      branches: 65,
    },
    './lib/frontmatter.js': {
      lines: 65,
      functions: 80,
      branches: 55,
    },
    './lib/roadmap.js': {
      lines: 80,
      functions: 80,
      branches: 60,
    },
    './lib/state.js': {
      lines: 83,
      functions: 85,
      branches: 65,
    },
    './lib/verify.js': {
      lines: 75,
      functions: 90,
      branches: 50,
    },
    './lib/phase.js': {
      lines: 80,
      functions: 85,
      branches: 60,
    },
    './lib/tracker.js': {
      lines: 30,
      functions: 35,
      branches: 30,
    },
    './lib/context.js': {
      lines: 70,
      functions: 60,
      branches: 60,
    },
    './lib/scaffold.js': {
      lines: 75,
      functions: 100,
      branches: 55,
    },
    './lib/commands.js': {
      lines: 80,
      functions: 90,
      branches: 60,
    },
    './lib/backend.js': {
      lines: 90,
      functions: 100,
      branches: 90,
    },
    './lib/mcp-server.js': {
      lines: 80,
      functions: 80,
      branches: 60,
    },
  },
  testTimeout: 15000,
};
