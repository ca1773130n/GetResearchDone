# Contributing

Thank you for your interest in contributing to GRD (Get Research Done). This guide covers the project architecture, how to add new features, running tests, and submitting pull requests.

## Architecture Overview

GRD is a Claude Code plugin that automates R&D workflows. It is built as a zero-runtime-dependency Node.js CLI tool with a modular architecture.

### Directory Structure

```
bin/
  *.ts                 Entry-point implementations (gd, grd-tools, grd-mcp-server)
  *.js                 Thin CJS proxies that `register tsx` for direct .ts resolution
lib/                   TypeScript modules under strict mode (24 top-level + 4 sub-dirs):
  utils.ts               Shared helpers, KNOWN_CONFIG_KEYS, validation, git
  frontmatter.ts         YAML frontmatter parse/serialize/validate
  state.ts               STATE.md read/write/patch
  roadmap.ts             ROADMAP.md parsing, schedule computation
  phase.ts               Phase lifecycle
  tracker.ts             GitHub/Jira issue tracker sync
  verify.ts              Verification suite (incl. `verify mechanical` bundle)
  scheduler.ts           Cross-backend rate-limit scheduler with EWMA prediction
  autopilot.ts           Multi-phase orchestration (decomposed into 4 modules)
  drift.ts               Project drift score + ontology convergence
  dead-ends.ts           DEAD-ENDS.md registry read/write + Reflection promotion
  genome.ts              GENOME.md strategy registry + auto-snapshot helper
  plan-tournament.ts     Score candidate PLAN.md files against phase goal
  think.ts               One-shot project briefing aggregator
  markdown-split.ts      GRD-INDEX split-format handling (safeReadMarkdown)
  ...                    (~28 modules total + cli/, commands/, context/, evolve/ subdirs)
agents/                Claude agent definitions (20 .md files)
commands/              Skill definitions (43 .md files)
examples/              Tutorial projects (e.g. examples/taskmark/)
.planning/             Project planning state (not shipped)
tests/                 Jest test suite (unit + integration)
```

Entry points use [tsx](https://github.com/privatenumber/tsx) so `.ts`
files run directly without a compile step. All source is TypeScript
with `strict: true` and CommonJS modules.

## How to Add a New Command

1. Create a `cmdMyCommand(cwd, args, raw)` function in the appropriate `lib/*.ts` module
2. Register the subcommand in `bin/grd-tools.ts` (tool-mode) or `lib/cli/index.ts` (`TOOL_COMMANDS`)
3. Create `commands/my-command.md` if the command should expose an agent skill
4. Add a unit test in `tests/unit/*.test.ts`
5. Add an integration test in `tests/integration/cli.test.ts` if it has user-facing output

### Command Function Conventions

- All command functions follow the signature `cmdMyCommand(cwd, args, raw)`
  - `cwd` -- working directory (absolute path)
  - `args` -- array of positional arguments after the command name
  - `raw` -- boolean, true for JSON output, false for human-readable
- Use `output(data, raw)` from `lib/utils.ts` to emit results
- Validate inputs at the top of the function using `validatePhaseArg`, `validateFileArg`, `validateSubcommand`, or `validateRequiredArg` from `lib/utils.ts`
- Use `safeReadMarkdown` (not `safeReadFile`) when reading planning docs that might be GRD-INDEX split-format
- Throw errors for validation failures (the router catches and formats them)
- For non-CLI consumers (other modules), extract a pure helper that returns instead of calling `output()`/`error()` (which exit the process). See `runGenomeSnapshot` for the pattern.

## How to Add a New Agent

1. Create `agents/grd-my-agent.md` with role, tools, and execution flow
2. Add a model profile entry in the `MODEL_PROFILES` table in `lib/utils.js`
3. Create an orchestrator command in `commands/` that spawns the agent

## Running Tests

```bash
npm test               # Run full test suite (~4,200 tests) with coverage
npm run test:unit      # Run unit tests only
npm run test:integration  # Run integration tests only
npm run test:watch     # Run tests in watch mode
npm run lint           # Run ESLint on bin/ and lib/
npm run lint:fix       # Run ESLint with auto-fix
npm run build:check    # Type-check (tsc --noEmit)
npm run format         # Auto-format with Prettier
npm run format:check   # Check formatting without writing
```

### Test Organization

- `tests/unit/` -- Unit tests for each `lib/*.ts` module (one test file per module)
- `tests/integration/cli.test.ts` -- End-to-end CLI tests that shell out to the built binaries
- `tests/golden/` -- Golden snapshot files for CLI output stability

### Writing Tests

- Place unit tests in `tests/unit/{module}.test.ts`
- Use the existing test helpers: `captureOutput`, `parseFirstJson`, fixtures in `tests/fixtures/`
- Each module has a per-file coverage threshold in `jest.config.js` -- new modules should target >= 80% line coverage. Do not lower existing thresholds.

## PR Guidelines

- All PRs must pass CI (lint + test + type-check + format check)
- New features require unit tests
- CLI changes require integration tests
- Follow existing code style (enforced by Prettier + ESLint)
- Keep `lib/` modules under 500 lines where feasible
- Use argument-array spawning for shell commands -- never string interpolation
- Zero runtime dependencies -- dev dependencies only
- `gd scan` runs in CI (`docs-check` job) -- any prompt-injection patterns in bundled markdown will block the PR. Suppress known false positives in `.prompt-injection-scanignore`.
- Run a second-opinion review on the branch before merge (project policy: `CODEX_HOME=~/.codex-personal1 codex exec review --base main < /dev/null` and address findings before merging).

## Code Style

- TypeScript `strict: true`, CommonJS modules (`require` / `module.exports`)
- Prefix unused args with `_` (enforced by ESLint `no-unused-vars`)
- Zero `any` -- use `Record<string, unknown>` or specific interfaces
- Typed require: `const { fn } = require('./module') as { fn: (arg: Type) => ReturnType }`
- 2-space indent, single quotes, semicolons (configured in `.prettierrc`)
- ESLint recommended rules (configured in `eslint.config.js`)
- All exported functions must have JSDoc comments with `@param` and `@returns`

## Security

- All shell commands use argument-array spawning -- never shell-string interpolation
- File path arguments are validated against path traversal (use `path.relative` for containment, not prefix-string checks)
- Git refs are validated against flag injection
- Git operations use a whitelist of allowed commands
- Use `safeReadMarkdown` for reading planning docs (handles GRD-INDEX split format)

## Reporting Issues

Open an issue on the GitHub repository with:

- Steps to reproduce
- Expected behavior
- Actual behavior
- Node.js version (`node --version`)
