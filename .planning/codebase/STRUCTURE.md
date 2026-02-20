# Project Structure

**Analysis Date:** 2026-02-20

## Complete Directory Tree

```
GetResearchDone/                   # npm package root
├── .claude-plugin/
│   └── plugin.json                # Claude Code plugin manifest (hooks, version, description)
├── .planning/                     # Runtime state (created on npm install via postinstall)
│   ├── config.json                # GRD configuration (gates, tracker, eval, code review, exec)
│   ├── PROJECT.md                 # Product vision, research objectives
│   ├── ROADMAP.md                 # Phase structure — source of truth for workflow
│   ├── STATE.md                   # Living memory (position, decisions, blockers, deferred)
│   ├── BASELINE.md                # Quantitative performance baselines
│   ├── PRODUCT-QUALITY.md         # Product-level quality targets and gaps
│   ├── REQUIREMENTS.md            # Requirements with traceability
│   ├── LONG-TERM-ROADMAP.md       # Strategic multi-milestone roadmap
│   ├── MILESTONES.md              # Milestone index
│   ├── TRACKER.md                 # Issue tracker ID mapping (created at first sync)
│   ├── milestones/                # Per-milestone scoped directories (v0.2.1+)
│   │   ├── anonymous/             # Operations without a milestone
│   │   │   ├── phases/
│   │   │   ├── research/
│   │   │   │   └── deep-dives/
│   │   │   ├── codebase/
│   │   │   ├── todos/
│   │   │   │   ├── pending/
│   │   │   │   └── completed/
│   │   │   └── quick/
│   │   └── {version}/             # e.g., v0.2.2 (active milestone)
│   │       ├── phases/
│   │       │   └── {NN}-{name}/
│   │       │       ├── {NN}-RESEARCH.md      # Phase research with paper refs
│   │       │       ├── {NN}-CONTEXT.md       # User decisions from discuss-phase
│   │       │       ├── {NN}-{MM}-PLAN.md     # Execution plan with frontmatter
│   │       │       ├── {NN}-{MM}-SUMMARY.md  # Execution results with metrics
│   │       │       ├── {NN}-{MM}-REVIEW.md   # Code review findings (per wave)
│   │       │       ├── {NN}-EVAL.md          # Tiered evaluation plan/results
│   │       │       └── {NN}-VERIFICATION.md  # Tiered verification report
│   │       ├── research/                     # Milestone-scoped research knowledge base
│   │       │   ├── LANDSCAPE.md             # SoTA map (methods, benchmarks, trends)
│   │       │   ├── PAPERS.md                # Paper index with summaries
│   │       │   ├── BENCHMARKS.md            # Evaluation metrics and datasets
│   │       │   ├── KNOWHOW.md               # Paper-to-production gap knowledge
│   │       │   └── deep-dives/
│   │       │       └── {paper-slug}.md      # Individual paper analyses
│   │       ├── codebase/                    # Codebase analysis (from map-codebase)
│   │       │   ├── ARCHITECTURE.md
│   │       │   ├── STACK.md
│   │       │   ├── STRUCTURE.md
│   │       │   ├── CONVENTIONS.md
│   │       │   ├── TESTING.md
│   │       │   ├── INTEGRATIONS.md
│   │       │   └── CONCERNS.md
│   │       ├── todos/
│   │       │   ├── pending/
│   │       │   └── completed/
│   │       └── quick/                       # Quick task results
│   │           └── {N}-{slug}/
│   │               └── {N}-SUMMARY.md
│   └── (legacy flat layout for pre-v0.2.1 projects)
│       ├── phases/                          # Flat phases dir (backward compat)
│       ├── research/                        # Flat research dir (backward compat)
│       └── todos/                           # Flat todos dir (backward compat)
├── bin/                           # CLI binaries (npm package entry points)
│   ├── grd-tools.js               # Main CLI — thin router to lib/ modules (19716 bytes)
│   ├── grd-mcp-server.js          # MCP server stdio wire-up
│   ├── grd-manifest.js            # SHA256 file tracking for self-update
│   └── postinstall.js             # npm postinstall — creates .planning/ skeleton
├── lib/                           # Business logic modules (19 modules)
│   ├── backend.js                 # AI coding CLI detection + capability flags
│   ├── cleanup.js                 # Phase-boundary quality analysis (ESLint, dead exports, doc drift)
│   ├── commands.js                # Misc CLI command functions (slug, timestamp, todos, config, etc.)
│   ├── context.js                 # Workflow init context builders (20 workflows)
│   ├── deps.js                    # Phase dependency graph + parallel group computation
│   ├── frontmatter.js             # YAML frontmatter parse/reconstruct/validate
│   ├── gates.js                   # Pre-flight validation checks
│   ├── long-term-roadmap.js       # LONG-TERM-ROADMAP.md CRUD
│   ├── mcp-server.js              # McpServer class + COMMAND_DESCRIPTORS table
│   ├── parallel.js                # Multi-phase parallel execution context builder
│   ├── paths.js                   # Centralized .planning/ path resolution
│   ├── phase.js                   # Phase lifecycle (add/insert/remove/complete)
│   ├── roadmap.js                 # ROADMAP.md parsing + schedule computation
│   ├── scaffold.js                # Template selection + file scaffolding
│   ├── state.js                   # STATE.md read/write/patch
│   ├── tracker.js                 # GitHub Issues / MCP Atlassian sync
│   ├── utils.js                   # Shared utilities (config, git, slug, output)
│   ├── verify.js                  # Plan/phase/commit verification suite
│   └── worktree.js                # Git worktree lifecycle for phase isolation
├── commands/                      # 45 skill definitions (markdown prompt files)
│   ├── execute-phase.md           # Wave-based plan execution orchestrator
│   ├── plan-phase.md              # Research → Plan → Verify → Eval workflow
│   ├── new-project.md             # Project initialization with research landscape
│   ├── new-milestone.md           # Create milestone in ROADMAP.md
│   ├── survey.md                  # SoTA landscape scan
│   ├── deep-dive.md               # Paper deep analysis
│   ├── compare-methods.md         # Method comparison matrix
│   ├── feasibility.md             # Paper→production gap analysis
│   ├── discuss-phase.md           # Brainstorming (no-solutions-before-questions)
│   ├── product-plan.md            # Product-level planning
│   ├── add-phase.md               # Add phase to roadmap
│   ├── insert-phase.md            # Insert phase at position
│   ├── remove-phase.md            # Remove phase
│   ├── complete-milestone.md      # Archive milestone
│   ├── quick.md                   # Quick task with GRD guarantees
│   ├── resume-project.md          # Resume from STATE.md
│   ├── assess-baseline.md         # Current performance baseline
│   ├── eval-plan.md               # Design tiered evaluation
│   ├── eval-report.md             # Collect and analyze eval results
│   ├── iterate.md                 # Iteration loop on failed metrics
│   ├── verify-phase.md            # Run phase verification
│   ├── verify-work.md             # Verify recent work
│   ├── sync.md                    # Sync GRD state to issue tracker
│   ├── tracker-setup.md           # Configure tracker integration
│   ├── long-term-roadmap.md       # Manage LT milestones
│   ├── plan-milestone-gaps.md     # Create phases to close milestone audit gaps
│   ├── map-codebase.md            # Spawn codebase mapper subagents
│   ├── progress.md                # Progress visualization
│   ├── migrate.md                 # Directory migration skill
│   ├── settings.md                # Configuration management
│   ├── help.md                    # Command reference
│   ├── update.md                  # Self-update check + pull
│   ├── reapply-patches.md         # Restore local modifications after update
│   ├── yolo.md                    # Toggle autonomous mode
│   ├── debug.md                   # Debug workflow issues
│   ├── health.md                  # Project health check
│   ├── dashboard.md               # Project dashboard
│   ├── add-todo.md                # Capture idea as todo
│   ├── check-todos.md             # Review pending todos
│   ├── research-phase.md          # Phase research synthesis
│   ├── audit-milestone.md         # Milestone quality audit
│   ├── pause-work.md              # Save session state
│   ├── set-profile.md             # Set model profile
│   ├── phase-detail.md            # Phase detail view
│   ├── requirement.md             # Requirement operations
│   └── list-phase-assumptions.md  # List phase assumptions
├── agents/                        # 20 subagent definitions (markdown prompt files)
│   ├── grd-executor.md            # Executes PLAN.md files with atomic commits
│   ├── grd-planner.md             # Creates executable phase plans
│   ├── grd-roadmapper.md          # Roadmap creation/modification
│   ├── grd-verifier.md            # Post-execution verification
│   ├── grd-code-reviewer.md       # Automatic code review
│   ├── grd-plan-checker.md        # Plan structure verification
│   ├── grd-integration-checker.md # Integration readiness check
│   ├── grd-surveyor.md            # SoTA landscape scanning
│   ├── grd-deep-diver.md          # Deep paper analysis
│   ├── grd-phase-researcher.md    # Phase-specific research synthesis
│   ├── grd-project-researcher.md  # Project-level research synthesis
│   ├── grd-research-synthesizer.md # Cross-phase synthesis
│   ├── grd-feasibility-analyst.md # Paper→production gap analysis
│   ├── grd-eval-planner.md        # Tiered evaluation plan design
│   ├── grd-eval-reporter.md       # Eval results analysis
│   ├── grd-baseline-assessor.md   # Current performance baseline
│   ├── grd-product-owner.md       # Product-level planning
│   ├── grd-codebase-mapper.md     # Codebase analysis (this agent)
│   ├── grd-debugger.md            # Debug workflow issues
│   └── grd-migrator.md            # Directory migration agent
├── tests/                         # Test suite
│   ├── unit/                      # Unit tests — one per lib/ module
│   │   ├── backend.test.js
│   │   ├── backend-real-env.test.js
│   │   ├── cleanup.test.js
│   │   ├── cleanup-noninterference.test.js
│   │   ├── commands.test.js
│   │   ├── context.test.js
│   │   ├── context-backend-compat.test.js
│   │   ├── coverage-gaps.test.js
│   │   ├── deps.test.js
│   │   ├── frontmatter.test.js
│   │   ├── gates.test.js
│   │   ├── long-term-roadmap.test.js
│   │   ├── mcp-server.test.js
│   │   ├── parallel.test.js
│   │   ├── paths.test.js
│   │   ├── phase.test.js
│   │   ├── postinstall.test.js
│   │   ├── roadmap.test.js
│   │   ├── roadmap-roundtrip.test.js
│   │   ├── scaffold.test.js
│   │   ├── setup.test.js
│   │   ├── state.test.js
│   │   ├── tracker.test.js
│   │   ├── utils.test.js
│   │   ├── validation.test.js
│   │   ├── verify.test.js
│   │   └── worktree.test.js
│   ├── integration/               # CLI + E2E workflow tests
│   │   ├── cli.test.js            # End-to-end CLI invocation tests
│   │   ├── e2e-workflow.test.js   # Full workflow integration
│   │   ├── golden.test.js         # Golden output snapshot tests
│   │   ├── npm-pack.test.js       # npm pack validation
│   │   └── worktree-parallel-e2e.test.js # Worktree parallel execution
│   ├── golden/                    # Golden output snapshots
│   │   ├── capture.sh             # Script to regenerate snapshots
│   │   ├── README.md              # Golden test documentation
│   │   └── output/                # Snapshot JSON/text files
│   │       ├── mutating/          # Snapshots for mutating operations
│   │       └── *.json / *.txt     # Read-only operation snapshots
│   ├── fixtures/                  # Shared test fixtures
│   │   └── planning/              # Minimal .planning/ structure for tests
│   │       ├── config.json
│   │       ├── ROADMAP.md
│   │       ├── STATE.md
│   │       ├── REQUIREMENTS.md
│   │       └── milestones/
│   │           └── anonymous/phases/ + todos/
│   └── helpers/                   # Test utilities
│       ├── fixtures.js            # createFixtureDir() / cleanupFixtureDir()
│       └── setup.js               # captureOutput() / captureError() (process.exit mock)
├── templates/                     # Document templates (28 files)
│   ├── project.md                 # PROJECT.md template
│   ├── roadmap.md                 # ROADMAP.md template
│   ├── state.md                   # STATE.md template
│   ├── requirements.md            # REQUIREMENTS.md template
│   ├── summary.md                 # SUMMARY.md base template
│   ├── summary-standard.md        # Standard complexity summary
│   ├── summary-minimal.md         # Minimal complexity summary
│   ├── summary-complex.md         # Complex summary with decisions
│   ├── context.md                 # CONTEXT.md (user decisions)
│   ├── UAT.md                     # User acceptance testing
│   ├── milestone.md               # Milestone template
│   ├── milestone-archive.md       # Milestone archive template
│   ├── config.json                # Default config.json
│   ├── tracker-mapping.md         # TRACKER.md mapping template
│   ├── verification-report.md     # VERIFICATION.md template
│   ├── phase-prompt.md            # Phase prompt template
│   ├── research.md                # Research phase template
│   ├── discovery.md               # Discovery template
│   ├── continue-here.md           # Continuation template
│   ├── debug-subagent-prompt.md   # Debug subagent template
│   ├── research/                  # Research document templates
│   │   ├── landscape.md
│   │   ├── papers.md
│   │   ├── benchmarks.md
│   │   ├── knowhow.md
│   │   ├── deep-dive.md
│   │   ├── eval.md
│   │   └── baseline.md
│   ├── codebase/                  # Codebase analysis templates
│   │   ├── architecture.md
│   │   ├── stack.md
│   │   ├── structure.md
│   │   ├── conventions.md
│   │   ├── testing.md
│   │   ├── integrations.md
│   │   └── concerns.md
│   └── research-project/
│       └── PRODUCT-QUALITY.md
├── references/                    # Protocol documentation (17 files)
│   ├── mcp-tracker-protocol.md    # MCP Atlassian prepare/execute/record pattern
│   ├── tracker-integration.md     # GitHub Issues integration
│   ├── verification-patterns.md   # Tiered verification methodology
│   ├── research-methodology.md    # Research workflow patterns
│   ├── tdd.md                     # Test-driven development protocol
│   ├── checkpoints.md             # Checkpoint pause/resume protocol
│   ├── questioning.md             # Deep questioning methodology
│   ├── continuation-format.md     # Checkpoint continuation format
│   ├── execute-plan.md            # Plan execution protocol
│   ├── git-integration.md         # Git workflow patterns
│   ├── git-planning-commit.md     # Planning doc commit protocol
│   ├── model-profiles.md          # Agent model selection profiles
│   ├── model-profile-resolution.md # Model resolution algorithm
│   ├── phase-argument-parsing.md  # Phase number parsing
│   ├── decimal-phase-calculation.md # Decimal phase insertion logic
│   ├── planning-config.md         # Configuration schema
│   └── ui-brand.md                # UI conventions
├── docs/                          # User documentation
│   ├── quickstart.md
│   ├── CHANGELOG.md
│   ├── CONTRIBUTING.md
│   ├── SECURITY.md
│   ├── long-term-roadmap-tutorial.md
│   ├── mcp-server.md
│   ├── GRD-Dataflow.excalidraw.md
│   ├── GRD-Hierarchy.excalidraw.md
│   ├── GRD-Workflow.excalidraw.md
│   └── GRD-Workflow-Jira-Integration.md
├── CLAUDE.md                      # Main project instructions for Claude Code
├── README.md                      # Public documentation
├── VERSION                        # Current version string (e.g., "0.2.2")
├── grd-file-manifest.json         # SHA256 manifest for self-update
├── package.json                   # npm metadata + scripts
├── package-lock.json              # Lock file
├── jest.config.js                 # Jest config + per-file coverage thresholds
├── eslint.config.js               # ESLint flat config
└── .prettierrc                    # Prettier config
```

## File Naming Conventions

### lib/ Modules
**Pattern:** `{feature-area}.js` (lowercase, hyphenated)

**Examples:** `backend.js`, `long-term-roadmap.js`, `mcp-server.js`

**Rule:** One module per concern. Module name matches its primary responsibility.

### Command Files (`commands/`)
**Pattern:** `{command-name}.md` (lowercase, hyphenated)

**Examples:** `execute-phase.md`, `new-project.md`, `plan-milestone-gaps.md`

**Invocation in Claude Code:** `/grd:{command-name}`

**Structure inside file:**
```markdown
---
description: ...
argument-hint: <arg>
---

<purpose>...</purpose>
<process>
<step name="...">...</step>
</process>
```

### Agent Files (`agents/`)
**Pattern:** `grd-{agent-type}.md` (lowercase, hyphenated, always prefixed `grd-`)

**Examples:** `grd-executor.md`, `grd-planner.md`, `grd-codebase-mapper.md`

**Structure inside file:** YAML frontmatter (name, description, tools, color) + `<role>` section

### Test Files (`tests/`)
**Pattern:** `{lib-module}.test.js` for unit tests, mirroring `lib/` exactly

| lib/ module | test file |
|---|---|
| `lib/state.js` | `tests/unit/state.test.js` |
| `lib/roadmap.js` | `tests/unit/roadmap.test.js` |
| `lib/backend.js` | `tests/unit/backend.test.js` |

**Integration tests:** Descriptive names — `cli.test.js`, `e2e-workflow.test.js`, `golden.test.js`

**Supplementary unit tests:** `{module}-{aspect}.test.js` — e.g., `backend-real-env.test.js`, `cleanup-noninterference.test.js`, `context-backend-compat.test.js`, `roadmap-roundtrip.test.js`

### Template Files (`templates/`)
**Pattern:** `{document-name}.md` (lowercase, hyphenated)

**Matches output:** `project.md` template → generates `PROJECT.md`; `deep-dive.md` → generates `deep-dives/{slug}.md`

### Phase Directory Names
**Pattern:** `{NN}-{slug}/`
- `{NN}` = Zero-padded phase number (`01`, `02`, `37`)
- Decimal phases: `{NN}.{D}-{slug}/` (e.g., `37.1-quickdir-fix/`)
- `{slug}` = kebab-case name derived from phase description

**Examples:** `01-security-foundation/`, `37-quickdir-routing-and-migration-skill/`

**Generated by:** `lib/phase.js cmdPhaseAdd()` and `cmdPhaseInsert()`

### Phase Document Names (inside phase directories)
| File | Content |
|---|---|
| `{NN}-RESEARCH.md` | Phase research with paper references |
| `{NN}-CONTEXT.md` | User decisions from `/grd:discuss-phase` |
| `{NN}-{MM}-PLAN.md` | Execution plan (e.g., `37-01-PLAN.md`) |
| `{NN}-{MM}-SUMMARY.md` | Execution results with metrics |
| `{NN}-{MM}-REVIEW.md` | Code review findings |
| `{NN}-EVAL.md` | Tiered evaluation plan and results |
| `{NN}-VERIFICATION.md` | Tiered verification report |

### Codebase Analysis Documents (`codebase/`)
**Pattern:** `{AREA}.md` (UPPERCASE)

`STACK.md`, `ARCHITECTURE.md`, `STRUCTURE.md`, `CONVENTIONS.md`, `TESTING.md`, `INTEGRATIONS.md`, `CONCERNS.md`

### Research Documents (`research/`)
**Pattern:** `UPPERCASE.md` for index files, `{paper-slug}.md` for deep-dives

`LANDSCAPE.md`, `PAPERS.md`, `BENCHMARKS.md`, `KNOWHOW.md`, `deep-dives/{paper-slug}.md`

## Module Organization Pattern

GRD has two distinct organizational patterns:

### Markdown Content Layer (commands/, agents/, templates/, references/)
Organized by **responsibility + workflow phase**:
- `commands/` — user-facing workflow entry points (what to do)
- `agents/` — specialized worker agents (how to do it)
- `templates/` — document stencils grouped by type (`research/`, `codebase/`, root)
- `references/` — cross-cutting protocol documentation

### Code Layer (lib/)
Organized by **concern**:
- Foundation: `paths.js`, `backend.js`
- Infrastructure: `utils.js`, `frontmatter.js`, `gates.js`
- State: `state.js`, `roadmap.js`
- Domain: `phase.js`, `deps.js`, `parallel.js`, `worktree.js`, `tracker.js`, `long-term-roadmap.js`, `cleanup.js`
- Verification: `verify.js`, `scaffold.js`
- Integration: `context.js`, `commands.js`, `mcp-server.js`

## Configuration File Locations

| File | Purpose |
|---|---|
| `.planning/config.json` | Runtime GRD configuration — all feature flags |
| `.claude-plugin/plugin.json` | Claude Code plugin registration + hooks |
| `jest.config.js` | Jest test runner + per-file coverage thresholds |
| `eslint.config.js` | ESLint flat config with `no-unused-vars` rule |
| `.prettierrc` | Prettier formatting options |
| `.editorconfig` | Editor indentation/encoding defaults |
| `.gitignore` | Excludes `node_modules/`, `coverage/`, `.planning/milestones/` (runtime state) |
| `package.json` | npm metadata, bin entries, devDependencies, scripts |

### `.planning/config.json` Schema (key sections)
```json
{
  "model_profile": "balanced|quality|budget",
  "commit_docs": true,
  "autonomous_mode": false,
  "branching_strategy": "none|phase|milestone",
  "phase_branch_template": "grd/{milestone}/{phase}-{slug}",
  "parallelization": true,
  "research_gates": { "survey_approval": false, ... },
  "confirmation_gates": { "commit_confirmation": false, ... },
  "eval_config": { "default_metrics": [...], "baseline_tracking": true },
  "tracker": { "provider": "none|github|mcp-atlassian", ... },
  "code_review": { "enabled": true, "timing": "per_wave", "severity_gate": "blocker" },
  "execution": { "use_teams": false, "team_timeout_minutes": 30 },
  "phase_cleanup": { "enabled": false, "refactoring": false, ... }
}
```

## Generated vs Source Files

### Source (committed to git)
- `bin/` — CLI binaries
- `lib/` — business logic modules
- `commands/` — command definitions
- `agents/` — agent definitions
- `templates/` — document templates
- `references/` — protocol documentation
- `tests/` — test suite
- `docs/` — user documentation
- `grd-file-manifest.json` — SHA256 manifest (generated by `bin/grd-manifest.js`, committed)
- `VERSION` — version string
- `package.json`, `jest.config.js`, `eslint.config.js`, `.prettierrc`

### Generated/Runtime (not committed or gitignored)
- `.planning/STATE.md` — written by `grd-tools.js state patch/update/...`
- `.planning/ROADMAP.md` — written by phase add/complete operations
- `.planning/milestones/{version}/phases/*/` — written by agents during execution
- `.planning/milestones/{version}/research/` — written by research agents
- `.planning/TRACKER.md` — written by tracker sync commands
- `coverage/` — Jest coverage reports
- `node_modules/` — npm dependencies
- Worktree dirs at `os.tmpdir()/grd-worktree-{milestone}-{phase}` — created at runtime

## Key Files and Their Roles

| File | Role |
|---|---|
| `bin/grd-tools.js` | Entry point for all CLI operations; 19716 bytes; routes to lib/ |
| `bin/grd-mcp-server.js` | MCP stdio wire-up; reads from stdin, writes to stdout |
| `lib/paths.js` | Single source of truth for .planning/ path resolution |
| `lib/utils.js` | Foundation utilities; `loadConfig`, `execGit`, `output`, `error` |
| `lib/backend.js` | Backend detection; model tier → concrete name resolution |
| `lib/mcp-server.js` | McpServer class + ~80 COMMAND_DESCRIPTORS; 57150 bytes |
| `lib/commands.js` | Miscellaneous commands; 96029 bytes — largest lib/ module |
| `lib/context.js` | 20 workflow init functions; 43378 bytes |
| `lib/phase.js` | Phase lifecycle CRUD; 40828 bytes |
| `.planning/STATE.md` | Living project memory; always read first in workflow init |
| `.planning/ROADMAP.md` | Definitive phase structure; parsed by roadmap.js |
| `.planning/config.json` | All feature flags; read on every command invocation |
| `.claude-plugin/plugin.json` | Claude Code plugin registration |
| `jest.config.js` | Per-file coverage thresholds (enforced in CI) |
| `grd-file-manifest.json` | SHA256 hashes for self-update detection |

## Adding New Code

### To add a new lib/ module:
1. Create `lib/{module-name}.js` with `'use strict';` at top
2. Follow the `cwd`-parameter convention for all functions
3. Export with `module.exports = { fn1, fn2, ... }`
4. Import from foundation modules only (`utils.js`, `paths.js`, `frontmatter.js`) — check for circular dep potential
5. Add unit test at `tests/unit/{module-name}.test.js`
6. Add coverage threshold to `jest.config.js`
7. Import in `bin/grd-tools.js` and wire CLI commands
8. Import in `lib/mcp-server.js` and add to `COMMAND_DESCRIPTORS`

### To add a new CLI command:
1. Add function `cmdNewCommand(cwd, args, raw)` to the appropriate lib/ module
2. Export it from that module
3. Import it in `bin/grd-tools.js`
4. Add a `case 'new-command':` in the `routeCommand()` switch
5. Add a `COMMAND_DESCRIPTOR` entry in `lib/mcp-server.js`
6. Add to the usage string in `bin/grd-tools.js` (line ~128)

### To add a new command skill:
1. Create `commands/{command-name}.md`
2. Follow structure: frontmatter (`description`, `argument-hint`) + `<purpose>` + `<process>` with `<step>` elements
3. Add `cmdInit{CommandName}` in `lib/context.js` if context loading needed
4. Wire in `bin/grd-tools.js` under `init` subcommand routing
5. Reference in `commands/help.md`
6. Update `CLAUDE.md` command list

### To add a new agent:
1. Create `agents/grd-{agent-type}.md`
2. Include YAML frontmatter: `name`, `description`, `tools`, `color`
3. Define `<role>` section with spawning context
4. Add entry to `MODEL_PROFILES` table in `lib/utils.js`
5. Update `CLAUDE.md` agent model profiles table

### To add a new planning document type inside a phase:
1. Add template in `templates/{doc-name}.md`
2. Add scaffold command in `lib/scaffold.js cmdScaffold()`
3. Register scaffold subcommand in `bin/grd-tools.js`
4. Update relevant command files (`plan-phase.md`, `execute-phase.md`) to reference new doc

---

*Structure analysis: 2026-02-20*
