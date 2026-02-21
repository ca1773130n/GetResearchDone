# GRD — Get Research Done

R&D workflow automation for Claude Code. Paper-driven development, tiered evaluation, autonomous iteration loops.

## Commands

| Command | Description |
|---------|-------------|
| `npm test` | Run all tests with coverage (1,631 tests) |
| `npm run test:unit` | Unit tests only with coverage |
| `npm run test:integration` | Integration + E2E tests |
| `npm run test:watch` | Watch mode for development |
| `npm run lint` | ESLint on `bin/` and `lib/` |
| `npm run lint:fix` | Auto-fix lint issues |
| `npm run format:check` | Prettier check (CI-safe) |
| `npm run format` | Prettier auto-format |

Single test file: `npx jest tests/unit/state.test.js`
Single test name: `npx jest -t "should parse frontmatter"`

## Source Architecture

```
bin/
├── grd-tools.js            # Main CLI — all deterministic operations
├── grd-mcp-server.js       # MCP server for tool exposure
├── grd-manifest.js         # SHA256 file tracking for self-update
└── postinstall.js          # npm postinstall hook
lib/                        # 19 modules (pure logic, no I/O side effects in tests)
├── backend.js              # Claude Code backend detection + capabilities
├── cleanup.js              # Phase-boundary quality analysis
├── commands.js             # CLI command routing + argument parsing
├── context.js              # Context optimization (plan index, snapshots)
├── deps.js                 # Dependency management
├── frontmatter.js          # YAML frontmatter CRUD
├── gates.js                # Research + confirmation gates
├── long-term-roadmap.js    # LT milestone CRUD + protection rules
├── mcp-server.js           # MCP tool registration
├── parallel.js             # Parallel execution engine
├── paths.js                # Milestone-scoped path resolution for .planning/
├── phase.js                # Phase lifecycle (add/insert/remove/complete)
├── roadmap.js              # ROADMAP.md parsing + manipulation
├── scaffold.js             # Directory/file scaffolding
├── state.js                # STATE.md read/write/patch
├── tracker.js              # GitHub Issues / MCP Atlassian sync
├── utils.js                # Shared utilities (slug, date, markdown)
├── verify.js               # Plan/phase/commit verification suite
└── worktree.js             # Git worktree parallel execution
commands/                   # 39 skill definitions (markdown with frontmatter)
agents/                     # 19 subagent definitions (markdown with frontmatter)
tests/
├── unit/                   # Unit tests — one per lib/ module
├── integration/            # CLI + E2E workflow tests
├── golden/                 # Golden output snapshot tests
├── fixtures/               # Shared test fixtures
└── helpers/                # Test utilities
docs/                       # Tutorials, quickstart, diagrams
.claude-plugin/plugin.json  # Claude Code plugin manifest
```

## Key Files

- `bin/grd-tools.js` — Entry point for all CLI operations; commands call this
- `.planning/config.json` — Project configuration (gates, tracker, eval, execution settings)
- `.planning/STATE.md` — Living memory; always read this first to understand project state
- `.planning/ROADMAP.md` — Phase structure; source of truth for what to build
- `jest.config.js` — Per-file coverage thresholds (enforced in CI)
- `eslint.config.js` — ESLint flat config with `no-unused-vars` (prefix unused args with `_`)

## Testing

- Tests mirror `lib/` structure: `lib/state.js` → `tests/unit/state.test.js`
- Per-file coverage thresholds in `jest.config.js` — do not lower them
- Golden tests (`tests/golden/`) use `capture.sh` to snapshot CLI output
- Pre-commit hook runs `npm run lint` — commits fail if lint errors exist
- Integration tests (`tests/integration/`) spawn real CLI processes
- Test timeout: 15s (configured in `jest.config.js`)

## Code Style

- CommonJS (`require`/`module.exports`), not ESM
- `'use strict'` at top of every file
- ESLint flat config with `@eslint/js` recommended rules
- Prefix unused function args with `_` (e.g., `function handler(_req, res)`)
- Prettier for formatting (no config file — uses defaults)
- Node >=18 required

## Planning Directory

```
.planning/
├── PROJECT.md              # Product vision, research objectives, quality targets
├── ROADMAP.md              # Phase structure with verification levels
├── STATE.md                # Living memory with baselines, deferred validations
├── BASELINE.md             # Current quantitative performance metrics
├── PRODUCT-QUALITY.md      # Product-level quality targets and gaps
├── PRINCIPLES.md           # Project principles that shape agent behavior (optional)
├── REQUIREMENTS.md         # Requirements with traceability
├── config.json             # GRD configuration
├── TRACKER.md              # Issue tracker mapping (created at runtime)
├── standards/              # Discovered codebase standards (from /grd:discover)
│   ├── index.yml           # Standard catalog with area/tag metadata
│   └── {area}/             # Standards grouped by area (api, database, etc.)
│       └── {pattern}.md    # Individual standard definition
└── milestones/
    ├── {milestone}/                    # e.g., v0.2.1 (active milestone)
    │   ├── phases/
    │   │   └── {NN}-{name}/
    │   │       ├── {NN}-RESEARCH.md    # Phase research with paper references
    │   │       ├── {NN}-CONTEXT.md     # User decisions from discuss-phase
    │   │       ├── {NN}-{MM}-PLAN.md   # Execution plan with verification_level
    │   │       ├── {NN}-{MM}-SUMMARY.md # Execution results with experiment data
    │   │       ├── {NN}-{MM}-REVIEW.md # Code review findings (per wave)
    │   │       ├── {NN}-EVAL.md        # Tiered evaluation plan and results
    │   │       └── {NN}-VERIFICATION.md # Tiered verification report
    │   ├── research/                   # Milestone-scoped research knowledge base
    │   │   ├── LANDSCAPE.md            # SoTA map (methods, benchmarks, trends)
    │   │   ├── PAPERS.md               # Paper index with summaries
    │   │   ├── BENCHMARKS.md           # Evaluation metrics and datasets
    │   │   ├── KNOWHOW.md              # Paper-to-production gap knowledge
    │   │   └── deep-dives/             # Individual paper analyses
    │   │       └── {paper-slug}.md
    │   ├── codebase/                   # Codebase analysis (from map-codebase)
    │   └── todos/                      # Milestone-scoped captured ideas
    │       ├── pending/
    │       └── completed/
    └── anonymous/                      # Operations without a milestone
        ├── quick/
        │   └── {N}-{slug}/
        │       └── {N}-SUMMARY.md
        ├── research/
        └── todos/
```

## R&D Workflow

```
Idea → Survey → Feasibility → Product Plan → Roadmap
  → [per phase: Research → Plan → Execute → Review → Eval → Iterate?]
  → Integration → Product Verification → Done
         ↑                                    ↑
         └──── LANDSCAPE.md continuously ─────┘
```

## Tiered Verification

R&D phases use three verification levels:

| Level | Name | When | Example |
|-------|------|------|---------|
| 1 | Sanity | Always in-phase | Format checks, crash tests, distribution viz |
| 2 | Proxy | Indirect in-phase | Small-subset eval, ablation reproduction |
| 3 | Deferred | Integration only | Full PSNR/SSIM/LPIPS on complete pipeline |

Deferred validations are tracked in STATE.md and automatically collected at integration phases.

## Scale-Adaptive Ceremony

Three ceremony levels control which agents run during planning and execution:

| Level | When | Agents Used |
|-------|------|-------------|
| Light | Small scope, ≤1 plan | planner (quick mode) + executor |
| Standard | Normal phase, 2-4 plans | researcher + planner + checker + executor + verifier |
| Full | Complex R&D, 5+ plans, experiments | All agents, all gates, review, eval, verification |

Auto-inferred from phase signals (plan count, research refs, eval targets). Override via:
- Config: `ceremony.default_level` or `ceremony.phase_overrides`
- CLI: `/grd:plan-phase N --ceremony light`
- Quick toggle: `/grd:settings ceremony <level>`

Ceremony controls WHICH agents are skipped, not WHICH model they use. When an agent runs, it runs at full quality.

## Autonomous Mode (YOLO)

Toggle with `/grd:settings yolo`. When enabled:
- All research gates → disabled
- All confirmation gates → disabled
- Agent makes its own decisions using available context
- All decisions are logged for review

## Tracker Integration (GitHub / MCP Atlassian)

When `tracker.provider` is `"github"` or `"mcp-atlassian"` in config:
- One-way push: GRD → Tracker (GRD is source of truth)
- Mapping: Milestone → Epic, Phase → Task (child of Epic), Plan → Sub-task (child of Task)
- Status updates, eval results, and verification posted as comments on phase Tasks
- Idempotency via `.planning/TRACKER.md` mapping file
- All tracker calls non-blocking (never blocks workflow)
- MCP Atlassian uses prepare/execute/record pattern (agents call MCP tools directly)
- Date scheduling: milestone `**Start:**`/`**Target:**` + phase `**Duration:** Nd` → computed dates synced to Jira Plans timeline
- Cascade reschedule: phase add/insert → automatic date shift for subsequent phases via `prepare-reschedule`

## Key Commands

### Research
- `/grd:survey <topic>` — SoTA landscape scan
- `/grd:deep-dive <paper>` — Paper deep analysis
- `/grd:compare-methods` — Method comparison matrix
- `/grd:feasibility <approach>` — Paper→production gap analysis

### Planning & Execution
- `/grd:new-project` — Initialize R&D project
- `/grd:product-plan` — Product-level planning
- `/grd:long-term-roadmap [list|add|remove|update|refine|link|unlink|display|init]` — Manage LT milestones
- `/grd:discuss-phase <N>` — Brainstorming with no-solutions-before-questions protocol
- `/grd:plan-phase <N>` — Phase planning with research context (flags: `--research-only`, `--eval-only`)
- `/grd:execute-phase <N>` — Phase execution (supports Agent Teams)
- `/grd:plan-milestone-gaps` — Create phases to close gaps from milestone audit

### Evaluation
- `/grd:assess-baseline` — Current performance baseline
- `/grd:eval-report <N>` — Collect and analyze results
- `/grd:iterate <N>` — Iteration loop on failed metrics

### Project Configuration
- `/grd:settings` — Configure workflow settings (subcommands: `yolo`, `profile`, `ceremony`)
- `/grd:principles` — Create/edit PRINCIPLES.md project principles
- `/grd:discover [area]` — Discover and extract codebase standards
- `/grd:progress` — Project progress (modes: `dashboard`, `health`, `phase <N>`)

### Integration
- `/grd:sync [roadmap | phase <N> | status | reschedule]` — Sync GRD state to issue tracker
- `/grd:tracker-setup` — Configure GitHub Issues or MCP Atlassian integration

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
- `ceremony` — Scale-adaptive ceremony (default_level: auto/light/standard/full, phase_overrides)
- `code_review` — Auto code review (enabled, timing, severity gate)
- `execution` — Agent Teams toggle, timeout, concurrency limits
- `git` — Worktree isolation (enabled, worktree_dir, base_branch, branch_template)
- `phase_cleanup` — Phase-boundary quality analysis (complexity, dead exports, file size, doc drift, test coverage gaps, export consistency, doc staleness, config schema drift)
- Standard GSD settings (parallelization, gates, safety)

## Git Isolation

When `git.enabled` is `true` in `.planning/config.json`, phase execution runs in an isolated git worktree:
- Worktree created in project-local `.worktrees/` directory (added to `.gitignore` automatically)
- Branch naming follows `git.branch_template` (default: `grd/{milestone}/{phase}-{slug}`)
- Base branch configurable via `git.base_branch` (default: `main`)
- After execution, 4 completion options: merge locally, push and create PR, keep branch, discard work
- Merge and PR paths run test gate before proceeding; test failures block the action
- Internally, the init JSON uses `branching_strategy` field (values: `"none"`, `"phase"`, etc.) derived from `git.enabled`

## CLI Tooling (`grd-tools.js`)

Deterministic operations delegated from commands to `bin/grd-tools.js`. All commands output JSON (with `--raw` for plain text).

### State Management
- `state load` — Full config + state + roadmap status
- `state get [section]` — Read STATE.md field or section
- `state patch --field val` — Batch update fields
- `state advance-plan` — Increment plan counter
- `state record-metric --phase N --plan M --duration Xmin` — Record execution metrics
- `state add-decision --summary "..." [--phase N]` — Log decision
- `state add-blocker / resolve-blocker` — Track blockers

### Verification Suite
- `verify plan-structure <file>` — Validate PLAN.md structure + frontmatter
- `verify phase-completeness <phase>` — Check plans have summaries
- `verify references <file>` — Validate @-refs and file paths
- `verify commits <hash>...` — Batch verify git commits
- `verify artifacts <plan>` — Check must_haves.artifacts exist
- `verify key-links <plan>` — Validate must_haves.key_links

### Phase & Roadmap
- `phase add/insert/remove/complete` — Phase lifecycle operations
- `roadmap get-phase <N> / analyze` — Roadmap queries
- `milestone complete [--name]` — Archive milestone
- `validate consistency` — Phase numbering + disk/roadmap sync
- `long-term-roadmap list/add/remove/update/refine/link/unlink/display/init/history/parse/validate` — LT milestone CRUD

### Scaffold
- `scaffold context/uat/verification/phase-dir/research-dir/eval/baseline`

### Context Optimization
- `phase-plan-index <N>` — Index plans with waves and status
- `state-snapshot` — Structured STATE.md parse
- `summary-extract <path> [--fields]` — Extract structured summary data
- `history-digest` — Aggregate all SUMMARY.md metrics
- `progress [json|table|bar]` — Render progress in multiple formats

### Frontmatter CRUD
- `frontmatter get/set/merge/validate` — YAML frontmatter operations

### Tracker
- `tracker get-config/sync-roadmap/sync-phase/update-status/add-comment/sync-status/prepare-roadmap-sync/prepare-phase-sync/record-mapping/record-status/schedule/prepare-reschedule`

### Workflow Init (21 workflows)
- `init execute-phase/plan-phase/new-project/new-milestone/quick/resume/verify-work/phase-op/todos/milestone-op/plan-milestone-gaps/map-codebase/progress`
- `init survey/deep-dive/feasibility/eval-plan/eval-report/assess-baseline/product-plan/iterate`

## Self-Update

- `/grd:update` — Check for updates, display changelog, backup modifications, pull latest
- `/grd:reapply-patches` — Restore local modifications after update
- `bin/grd-manifest.js` — SHA256-based file tracking (`generate`, `detect`, `save-patches`, `load-patches`)
