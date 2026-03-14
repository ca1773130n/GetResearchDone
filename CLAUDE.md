# GRD — Get Research Done

Prefer the **context-mode** MCP server for file reading, searching, and codebase navigation.

## Commands

### Dev
| Command | Description |
|---------|-------------|
| `npm test` | Run all tests with coverage |
| `npm run test:unit` | Unit tests only |
| `npm run lint` | ESLint on `bin/` and `lib/` |
| `npm run build:check` | Type-check (`tsc --noEmit`) |

Single test: `npx jest tests/unit/state.test.ts`
By name: `npx jest -t "should parse frontmatter"`

### GD CLI (`gd <command> [args] [--json]`)
| Command | Description |
|---------|-------------|
| `gd progress` | Project status and next action |
| `gd state load` | Load full project config + state |
| `gd plan-phase <N>` | Plan a phase |
| `gd execute-phase <N>` | Execute a phase |
| `gd autopilot` | Run phases autonomously |
| `gd evolve` | Self-improvement loop |
| `gd quick <desc>` | Ad-hoc task with GRD guarantees |
| `gd health` | Blockers, velocity, risk |
| `gd settings` | Configure workflow |
| `gd help` | Full command reference |

## Architecture

- `bin/*.js` — Entry points (register tsx, load `.ts`). `bin/*.ts` — Actual implementations.
- `lib/` — 24 TypeScript modules + 4 subdirectories (`cli/`, `commands/`, `context/`, `evolve/`)
- `commands/` — 43 skill definitions (markdown). `agents/` — 20 subagent definitions (markdown).
- `tests/unit/` — One test file per `lib/` module. `tests/integration/` — CLI + E2E tests.
- `.planning/` — Project plans, roadmap, state, and config. Read `.planning/STATE.md` first.

## Code Style

- TypeScript `strict: true`, CommonJS (`require`/`module.exports`, not ESM)
- `tsx` at entry points for direct `.ts` resolution — no CJS proxy files
- `'use strict'` at top of every file
- Prefix unused args with `_` (enforced by ESLint `no-unused-vars`)
- Zero `any` — use `Record<string, unknown>` or specific interfaces
- Typed require: `const { fn } = require('./module') as { fn: (arg: Type) => ReturnType }`

## Testing

- Tests mirror `lib/`: `lib/state.ts` → `tests/unit/state.test.ts`
- Per-file coverage thresholds in `jest.config.js` — do not lower them
- Pre-commit hook runs lint — commits fail on lint errors
- Timeout: 15s

## Gotchas

- **zsh `!` escaping**: Never use `node -e` with `!=`/`!==` — zsh mangles them. Use `gd` subcommands instead of ad-hoc JSON parsing.
- **CLI output**: `gd` tool commands output JSON by default (`--json` flag, `--raw` for plain text via grd-tools).
- **Config**: `.planning/config.json` controls all workflow behavior (gates, scheduler, ceremony, tracker, code review).
