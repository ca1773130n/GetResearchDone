# Contributing

Thank you for your interest in contributing to GRD (Get Research Done). This guide covers the project architecture, how to add new features, running tests, and submitting pull requests.

## Architecture Overview

GRD is a Claude Code plugin that automates R&D workflows. It is built as a zero-runtime-dependency Node.js CLI tool with a modular architecture.

### Directory Structure

```
bin/grd-tools.js       Thin CLI router (~200 lines), dispatches to lib/ modules
lib/                   10 modules with clear responsibilities:
  utils.js               Shared helpers, constants, input validation, git operations
  frontmatter.js         YAML frontmatter parse/serialize/validate
  state.js               STATE.md read/write/patch operations
  roadmap.js             ROADMAP.md parsing, schedule computation
  phase.js               Phase lifecycle (add, insert, remove, complete)
  tracker.js             GitHub/Jira issue tracker sync
  verify.js              Verification suite (plan structure, references, artifacts)
  scaffold.js            Template scaffolding
  context.js             Init workflow context loading
  commands.js            Standalone utility commands
agents/                Claude agent definitions (.md files)
commands/              Command definitions (.md files)
.planning/             Project planning state (not shipped)
tests/                 Jest test suite with unit and integration tests
```

### Module Dependencies

```
utils.js            (leaf module -- no internal dependencies)
  ^
  |
frontmatter.js      (depends on utils.js)
  ^
  |
state.js            (depends on utils.js, frontmatter.js)
roadmap.js          (depends on utils.js)
phase.js            (depends on utils.js, frontmatter.js, state.js, roadmap.js)
verify.js           (depends on utils.js, frontmatter.js)
scaffold.js         (depends on utils.js, frontmatter.js)
tracker.js          (depends on utils.js, roadmap.js)
context.js          (depends on utils.js, frontmatter.js, state.js, roadmap.js, verify.js, phase.js, tracker.js)
commands.js         (depends on utils.js, frontmatter.js, state.js, roadmap.js, phase.js, verify.js, scaffold.js)
```

## How to Add a New Command

1. Create a command function `cmdMyCommand(cwd, args, raw)` in the appropriate `lib/*.js` module
2. Add a case to the switch statement in `bin/grd-tools.js`
3. Create `commands/my-command.md` with agent instructions
4. Add a unit test in `tests/unit/*.test.js`
5. Add an integration test in `tests/integration/cli.test.js`

### Command Function Conventions

- All command functions follow the signature `cmdMyCommand(cwd, args, raw)`
  - `cwd` -- working directory (absolute path)
  - `args` -- array of positional arguments after the command name
  - `raw` -- boolean, true for JSON output, false for human-readable
- Use `output(data, raw)` from `lib/utils.js` to emit results
- Validate inputs at the top of the function using `validatePhaseArg`, `validateFileArg`, `validateSubcommand`, or `validateRequiredArg` from `lib/utils.js`
- Throw errors for validation failures (the router catches and formats them)

## How to Add a New Agent

1. Create `agents/grd-my-agent.md` with role, tools, and execution flow
2. Add a model profile entry in the `MODEL_PROFILES` table in `lib/utils.js`
3. Create an orchestrator command in `commands/` that spawns the agent

## Running Tests

```bash
npm test              # Run full test suite with coverage
npm run test:unit     # Run unit tests only
npm run test:integration  # Run integration tests only
npm run test:watch    # Run tests in watch mode
npm run lint          # Run ESLint
npm run lint:fix      # Run ESLint with auto-fix
npm run format        # Auto-format with Prettier
npm run format:check  # Check formatting without writing
```

### Test Organization

- `tests/unit/` -- Unit tests for each `lib/*.js` module (one test file per module)
- `tests/integration/cli.test.js` -- End-to-end CLI tests via `child_process.execFileSync`
- `tests/golden/` -- Golden snapshot files for CLI output stability

### Writing Tests

- Place unit tests in `tests/unit/{module}.test.js`
- Use the existing test helpers: `captureOutput`, `parseFirstJson`, fixtures in `tests/fixtures/`
- Each module has a coverage threshold in `jest.config.js` -- new modules should target >= 80% line coverage

## PR Guidelines

- All PRs must pass CI (lint + test + format check on Node 18/20/22)
- New features require unit tests
- CLI changes require integration tests
- Follow existing code style (enforced by Prettier + ESLint)
- Keep `lib/` modules under 500 lines where feasible
- Use `execFileSync` with argument arrays for shell commands (never string interpolation)
- Zero runtime dependencies -- dev dependencies only

## Code Style

- 2-space indent, single quotes, semicolons (configured in `.prettierrc`)
- ESLint recommended rules (configured in `eslint.config.js`)
- All exported functions must have JSDoc comments with `@param` and `@returns`

## Security

- All shell commands use `execFileSync` with argument arrays -- never `execSync` with string interpolation
- File path arguments are validated against path traversal
- Git refs are validated against flag injection
- Git operations use a whitelist of allowed commands

## Reporting Issues

Open an issue on the GitHub repository with:

- Steps to reproduce
- Expected behavior
- Actual behavior
- Node.js version (`node --version`)
