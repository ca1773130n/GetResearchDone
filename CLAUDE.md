# GRD — Get Research Done

R&D workflow automation for Claude Code. Paper-driven development, tiered evaluation, autonomous iteration loops.

## Tool Preference

When available, prefer the **context-mode** MCP server for file reading, searching, and codebase navigation over raw shell commands.

## Commands

| Command | Description |
|---------|-------------|
| `npm test` | Run all tests with coverage (3,000+ tests) |
| `npm run test:unit` | Unit tests only with coverage |
| `npm run test:integration` | Integration + E2E tests |
| `npm run test:watch` | Watch mode for development |
| `npm run lint` | ESLint on `bin/` and `lib/` |
| `npm run lint:fix` | Auto-fix lint issues |
| `npm run format:check` | Prettier check (CI-safe) |
| `npm run format` | Prettier auto-format |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run build:check` | Type-check without emitting (`tsc --noEmit`) |

Single test file: `npx jest tests/unit/state.test.ts`
Single test name: `npx jest -t "should parse frontmatter"`

## Source Architecture

```
bin/
├── grd-tools.js            # Entry point (registers tsx, loads grd-tools.ts)
├── grd-tools.ts            # Main CLI — all deterministic operations
├── gd.js                   # Entry point for gd CLI
├── gd.ts                   # Unified CLI — agent + tool commands
├── grd-mcp-server.js       # Entry point for MCP server
├── grd-mcp-server.ts       # MCP server for tool exposure
├── grd-manifest.js         # Entry point for manifest tool
├── grd-manifest.ts         # SHA256 file tracking for self-update
├── postinstall.js          # Entry point for postinstall
└── postinstall.ts          # npm postinstall hook
lib/
├── autopilot.ts            # Autopilot orchestration
├── autoplan.ts             # Auto-generate milestones from discoveries
├── backend.ts              # Backend detection + capabilities
├── cleanup.ts              # Phase-boundary quality analysis
├── cli/                    # gd CLI internals
│   ├── index.ts            # Arg parser, command routing
│   ├── adapters.ts         # Per-backend CLI adapters (derives from scheduler)
│   ├── agent.ts            # Agent command handler
│   ├── output.ts           # JSON envelope formatting
│   └── tools.ts            # Tool command delegation
├── commands/               # CLI command routing
│   ├── index.ts            # Barrel re-export + routing
│   └── ... (12 sub-modules)
├── context/                # Context optimization
│   ├── index.ts            # Barrel re-export
│   └── ... (7 sub-modules)
├── deps.ts                 # Dependency management
├── evolve/                 # Self-evolution loop
│   ├── index.ts            # Barrel re-export
│   ├── orchestrator.ts     # Evolution orchestration
│   └── ... (10 sub-modules)
├── frontmatter.ts          # YAML frontmatter CRUD
├── gates.ts                # Research + confirmation gates
├── long-term-roadmap.ts    # LT milestone CRUD + protection rules
├── markdown-split.ts       # Markdown file splitting for context
├── mcp-server.ts           # MCP tool registration
├── overstory.ts            # Overstory backend adapter
├── parallel.ts             # Parallel execution engine
├── paths.ts                # Milestone-scoped path resolution
├── phase.ts                # Phase lifecycle
├── requirements.ts         # Requirements parsing + traceability
├── roadmap.ts              # ROADMAP.md parsing + manipulation
├── scaffold.ts             # Directory/file scaffolding
├── scheduler.ts            # Cross-backend rate limit scheduler
├── state.ts                # STATE.md read/write/patch
├── tracker.ts              # GitHub Issues / MCP Atlassian sync
├── types.ts                # Shared TypeScript type definitions
├── utils.ts                # Shared utilities
├── verify.ts               # Plan/phase/commit verification suite
└── worktree.ts             # Git worktree parallel execution
commands/                   # Skill definitions (markdown with frontmatter)
agents/                     # Subagent definitions (markdown with frontmatter)
tests/
├── unit/                   # Unit tests — one per lib/ module (.test.ts)
├── integration/            # CLI + E2E workflow tests (.test.ts)
├── golden/                 # Golden output snapshot tests
├── fixtures/               # Shared test fixtures
└── helpers/                # Test utilities (.ts)
docs/                       # Tutorials, quickstart, diagrams
.claude-plugin/plugin.json  # Claude Code plugin manifest
```

## Key Files

- `bin/grd-tools.ts` — Main CLI (all deterministic operations)
- `bin/gd.ts` — Unified CLI (agent commands + tool commands)
- `.planning/config.json` — Project configuration
- `.planning/STATE.md` — Living memory; read this first to understand project state
- `.planning/ROADMAP.md` — Phase structure; source of truth for what to build
- `jest.config.js` — Per-file coverage thresholds (enforced in CI)
- `eslint.config.js` — ESLint flat config

## Testing

- Tests mirror `lib/` structure: `lib/state.ts` → `tests/unit/state.test.ts`
- All test files are TypeScript (.test.ts), transformed via ts-jest
- Per-file coverage thresholds in `jest.config.js` — do not lower them
- Pre-commit hook runs `npm run lint` — commits fail if lint errors exist
- Test timeout: 15s (configured in `jest.config.js`)

## Shell Safety (zsh)

zsh escapes `!` inside strings, breaking `!=` and `!==` in inline shell scripts.

- NEVER use `node -e` or `python3 -c` with `!=` or `!==` operators
- NEVER pipe `--raw` JSON through inline one-liner scripts
- Prefer `grd-tools.js` subcommands over ad-hoc JSON parsing

## Code Style

- TypeScript with `strict: true` (all lib/ and bin/ files are .ts)
- CommonJS `require()`/`module.exports` pattern (not ESM)
- `tsx` registered at entry points for direct `.ts` resolution (no CJS proxy files)
- `'use strict'` at top of every file
- Prefix unused function args with `_`
- Zero `any` types in core lib/ (use `Record<string, unknown>` or specific interfaces)
- Typed `require()` pattern: `const { fn } = require('./module') as { fn: (arg: Type) => ReturnType }`
- Node >=18 required

## R&D Workflow

```
Idea → Survey → Feasibility → Product Plan → Roadmap
  → [per phase: Research → Plan → Execute → Review → Eval → Iterate?]
  → Integration → Product Verification → Done
```

## Tiered Verification

| Level | Name | When | Example |
|-------|------|------|---------|
| 1 | Sanity | Always in-phase | Format checks, crash tests |
| 2 | Proxy | Indirect in-phase | Small-subset eval, ablation reproduction |
| 3 | Deferred | Integration only | Full PSNR/SSIM/LPIPS on complete pipeline |

## Scale-Adaptive Ceremony

| Level | When | Agents Used |
|-------|------|-------------|
| Light | Small scope, ≤1 plan | planner (quick) + executor |
| Standard | Normal phase, 2-4 plans | researcher + planner + checker + executor + verifier |
| Full | Complex R&D, 5+ plans | All agents, all gates, review, eval, verification |

## Cross-Backend Scheduler

Multi-backend rate limit scheduler with EWMA token prediction:
- Priority-ordered backend list with automatic failover
- Per-backend token budgets and cooldown tracking
- Concurrency accounting for in-flight tasks
- Pass-through mode when no scheduler config present
- Supported backends: claude, codex, gemini, opencode, overstory

## Agent Model Profiles

| Agent | Quality | Balanced | Budget |
|-------|---------|----------|--------|
| grd-planner | opus | opus | sonnet |
| grd-executor | opus | sonnet | sonnet |
| grd-surveyor | opus | sonnet | sonnet |
| grd-deep-diver | opus | sonnet | haiku |
| grd-eval-planner | opus | opus | sonnet |
| grd-product-owner | opus | opus | sonnet |
| grd-code-reviewer | opus | sonnet | haiku |
| grd-verifier | sonnet | sonnet | haiku |

## Configuration

`.planning/config.json` controls:
- `research_gates` — Human review points for research decisions
- `autonomous_mode` — YOLO mode toggle
- `tracker` — Issue tracker integration (GitHub Issues / MCP Atlassian)
- `eval_config` — Default metrics and baseline tracking
- `ceremony` — Scale-adaptive ceremony levels
- `code_review` — Auto code review (enabled, timing, severity gate)
- `execution` — Agent Teams toggle, timeout, concurrency
- `git` — Worktree isolation settings
- `scheduler` — Cross-backend rate limit scheduler config
- `phase_cleanup` — Phase-boundary quality analysis

## CLI Tooling (`grd-tools.js`)

All commands output JSON by default (pass `--raw` for plain text).

### State Management
- `state load/get/patch/advance-plan/record-metric/add-decision/add-blocker/resolve-blocker`

### Verification Suite
- `verify plan-structure/phase-completeness/references/commits/artifacts/key-links`

### Phase & Roadmap
- `phase add/insert/remove/complete`
- `roadmap get-phase/analyze`
- `milestone complete`
- `validate consistency`
- `long-term-roadmap list/add/remove/update/refine/link/unlink/display/init/history/parse/validate`

### Scaffold
- `scaffold context/uat/verification/phase-dir/research-dir/eval/baseline`

### Context Optimization
- `phase-plan-index/state-snapshot/summary-extract/history-digest/progress`

### Frontmatter CRUD
- `frontmatter get/set/merge/validate`

### Tracker
- `tracker get-config/sync-roadmap/sync-phase/update-status/add-comment/schedule/prepare-reschedule`

### Workflow Init (21 workflows)
- `init execute-phase/plan-phase/new-project/new-milestone/quick/resume/verify-work/phase-op/todos/milestone-op/plan-milestone-gaps/map-codebase/progress`
- `init survey/deep-dive/feasibility/eval-plan/eval-report/assess-baseline/product-plan/iterate`

## Self-Update

- `/grd:update` — Check for updates, display changelog, pull latest
- `/grd:reapply-patches` — Restore local modifications after update
- `bin/grd-manifest.ts` — SHA256-based file tracking
