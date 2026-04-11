# GRD — Get Research Done

## Commands

### Context-Mode MCP (prefer over Bash/Read for large output)

| Tool                  | Use Instead Of          | Description                                              |
| --------------------- | ----------------------- | -------------------------------------------------------- |
| `ctx_batch_execute`   | Multiple Bash calls     | Run multiple commands + search results in ONE call       |
| `ctx_execute`         | Bash (>20 lines output) | Run code in sandbox; only printed summary enters context |
| `ctx_execute_file`    | Read/cat for analysis   | Read file into sandbox; process and print summary only   |
| `ctx_search`          | Grep (follow-up)        | Search previously indexed content with multiple queries  |
| `ctx_index`           | Read (large docs)       | Index markdown/docs into searchable knowledge base       |
| `ctx_fetch_and_index` | WebFetch                | Fetch URL, convert to markdown, index for search         |
| `ctx_stats`           | —                       | Show session context consumption statistics              |
| `ctx_doctor`          | —                       | Diagnose context-mode installation                       |
| `ctx_upgrade`         | —                       | Upgrade context-mode to latest version                   |

### Dev

| Command               | Description                 |
| --------------------- | --------------------------- |
| `npm test`            | Run all tests with coverage |
| `npm run test:unit`   | Unit tests only             |
| `npm run lint`        | ESLint on `bin/` and `lib/` |
| `npm run build:check` | Type-check (`tsc --noEmit`) |

Single test: `npx jest tests/unit/state.test.ts`
By name: `npx jest -t "should parse frontmatter"`

### GD CLI (`gd <command> [args] [--json]`)

| Command                | Description                      |
| ---------------------- | -------------------------------- |
| `gd progress`          | Project status and next action   |
| `gd state load`        | Load full project config + state |
| `gd plan-phase <N>`    | Plan a phase                     |
| `gd execute-phase <N>` | Execute a phase                  |
| `gd autopilot`         | Run phases autonomously          |
| `gd evolve`            | Self-improvement loop            |
| `gd quick <desc>`      | Ad-hoc task with GRD guarantees  |
| `gd health`            | Blockers, velocity, risk         |
| `gd settings`          | Configure workflow               |
| `gd help`              | Full command reference           |

## Architecture

- `bin/*.js` — Entry points (register tsx, load `.ts`). `bin/*.ts` — Actual implementations.
- `lib/` — 24 TypeScript modules + 4 subdirectories (`cli/`, `commands/`, `context/`, `evolve/`)
- `commands/` — 43 skill definitions (markdown). `agents/` — 20 subagent definitions (markdown).
- `tests/unit/` — One test file per `lib/` module. `tests/integration/` — CLI + E2E tests.
- `examples/` — Tutorial projects. `examples/taskmark/` — hands-on GRD tutorial (Quick + Deep paths).
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
- Pre-commit hook (optional, installed via `npm run hooks:install`) runs `gd scan` on staged markdown to block prompt injection patterns before commit. No other pre-commit hooks are installed by default.
- Timeout: 15s

## Backend Capabilities

Capability flags per backend. Source: `BACKEND_CAPABILITIES` in `lib/backend.ts`.

| Flag                        | claude   | codex | gemini | opencode |
| --------------------------- | -------- | ----- | ------ | -------- |
| `subagents`                 | true     | true  | true   | true     |
| `parallel`                  | true     | true  | true   | true     |
| `teams`                     | true     | true  | false  | false    |
| `hooks`                     | true     | true  | true   | true     |
| `mcp`                       | true     | true  | true   | true     |
| `native_worktree_isolation` | true     | false | false  | false    |
| `effort`                    | true     | false | false  | false    |
| `http_hooks`                | true     | false | false  | false    |
| `cron`                      | true     | false | false  | false    |
| `smart_approvals`           | false    | true  | false  | false    |
| `plan_mode`                 | false    | false | true   | false    |
| `sandbox_gvisor`            | false    | false | true   | false    |
| `sandbox_lxc`               | false    | false | false  | false    |
| `mcp_elicitation`           | true     | false | false  | false    |
| `model_overrides`           | true     | true  | true   | true     |
| `max_output_tokens`         | 64K/128K | null  | null   | null     |

## Agent Frontmatter

Three fields control per-agent behavior (Claude Code v2.1.68+ for `effort`):

- **`effort`** (`low` / `medium` / `high`) — Controls reasoning depth. Set per agent per profile from `EFFORT_PROFILES` in `lib/backend.ts`.
- **`maxTurns`** — Caps the number of turns an agent can take before stopping.
- **`disallowedTools`** — Restricts which tools an agent may call (e.g. `["Bash", "Write"]`).

### Effort Profiles (from EFFORT_PROFILES)

| Agent               | quality     | balanced   | budget |
| ------------------- | ----------- | ---------- | ------ |
| grd-planner         | high        | high       | low    |
| grd-executor        | high        | medium     | low    |
| grd-verifier        | medium      | low        | low    |
| grd-debugger        | high        | medium     | low    |
| grd-codebase-mapper | medium      | low        | low    |
| (others)            | high/medium | medium/low | low    |

### /effort Slash Command

- `/effort` (Claude Code v2.1.76+) lets users override effort level mid-session.
- GRD sets effort via agent frontmatter using `EFFORT_PROFILES`; user `/effort` overrides take precedence.
- A user can lower effort for fast iteration or raise it for thorough analysis, independent of GRD's profile system.

## Plugin Data

Clear boundary between project state and plugin state:

- **`.planning/`** — Project-scoped state: plans, roadmap, config, research, state. Lives in the repo, committed with the project.
- **`CLAUDE_PLUGIN_DATA`** — Plugin-scoped state that survives plugin updates. Used for cross-project config (scheduler state, evolve global config). Set by Claude Code, points to a persistent directory outside the project.
- Rule: project artifacts go in `.planning/`; plugin infrastructure goes in `CLAUDE_PLUGIN_DATA`.

## Backend-Specific Notes

### Codex CLI (v0.115.0+)

- Realtime websocket sessions and filesystem RPC capabilities are available but not currently used by GRD.
- Smart approvals (`smart_approvals: true`) route code review requests through a guardian subagent before applying changes.
- `CODEX_THREAD_ID` kept for backward compatibility; may be deprecated in newer versions.

### Gemini CLI (v0.31–v0.34)

- **v0.34**: Tracker CRUD MCP tools added; plan mode enabled by default (`plan_mode: true`).
- **v0.32**: Generalist agent added.
- **v0.31**: Browser agent added (experimental).
- A2A agent timeout increased to 30 minutes (was shorter in earlier versions).
- gVisor sandboxing available (`sandbox_gvisor: true`); LXC sandboxing not yet supported.

### OpenCode (v1.2.25–v1.2.27)

- **v1.2.27**: Fix for lost sessions across worktrees and orphan branches — directly relevant to GRD's worktree isolation mode.
- 5-minute chunk timeout (increased from 2 minutes in earlier versions).
- Multi-account workspace authentication support.
- Non-OpenAI Azure completions endpoint support.

### Token profile (Spec 4)

`token_profile` is a user preference in `.planning/config.json` orthogonal
to `model_profile`. Values: `frugal`, `balanced` (default), `quality`.
Controls adaptive model-tier downgrade under budget pressure or low task
complexity. Set via `gd settings token_profile <value>`.

- `quality`: never downgrade unless budget pressure is >=95% (critical).
- `balanced`: downgrade 0-2 steps based on (pressure, complexity).
- `frugal`: aggressively downgrade non-high-complexity tasks even at
  low pressure.

Budget pressure is classified as `none` / `warning` (>=60%) / `high`
(>=80%) / `critical` (>=95%) per account. Autopilot, evolve, and
autoresearch check this before each agent dispatch. Thresholds are
configurable via `.planning/config.json`
`scheduler.budget_pressure_thresholds`.

### LLM fallback for phase completion (Spec 3B)

`phase_complete_llm_fallback` is an opt-in config flag (default `false`).
When `true`, both `gd autopilot`'s phase-finalize step and `gd phase complete N`
fall back to asking Claude to perform the ROADMAP.md and STATE.md edits
directly via the scheduler, if the regex-based mechanical path throws or
gate-fails. Verification is shallow: ROADMAP.md is re-read and checked for a
ticked `- [x] Phase N` checkbox.

Set via `gd settings phase_complete_llm_fallback true`. Opt-in only —
existing users see no change.

The fallback respects `token_profile`, budget pressure, and the idle
watchdog just like any other scheduler spawn.

### Scheduler idle watchdog (Spec 2B)

`scheduler.idle_timeout_seconds` (default 900) kills a spawned backend
subprocess if it produces no stdout/stderr data for the configured
number of seconds. Distinct from the total-timeout upper bound: the
idle timeout only fires when the subprocess is completely silent, so
legitimate streaming inference is unaffected. On trip: SIGTERM →
5-second grace → SIGKILL. Result carries `idleTimedOut: true` flag
so callers can distinguish idle-kills from total-timeout kills.

## Gotchas

- **zsh `!` escaping**: Never use `node -e` with `!=`/`!==` — zsh mangles them. Use `gd` subcommands instead of ad-hoc JSON parsing.
- **CLI output**: `gd` tool commands output JSON by default (`--json` flag, `--raw` for plain text via grd-tools).
- **Config**: `.planning/config.json` controls all workflow behavior (gates, scheduler, ceremony, tracker, code review).
