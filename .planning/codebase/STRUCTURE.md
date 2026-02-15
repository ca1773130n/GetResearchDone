# Project Structure

**Analysis Date:** 2026-02-12

## Directory Layout

```
GRD/
├── .claude-plugin/          # Plugin manifest for Claude Code discovery
│   └── plugin.json          # Version, hooks, description
├── .planning/               # Runtime state (created on project init)
│   ├── config.json          # GRD configuration
│   ├── PROJECT.md           # Product vision, research objectives
│   ├── ROADMAP.md           # Phase structure
│   ├── STATE.md             # Living memory
│   ├── BASELINE.md          # Current performance metrics
│   ├── PRODUCT-QUALITY.md   # Product-level quality targets
│   ├── REQUIREMENTS.md      # Requirements with traceability
│   ├── TRACKER.md           # Issue tracker mapping (runtime)
│   ├── research/            # Persistent research knowledge base
│   │   ├── LANDSCAPE.md     # SoTA map
│   │   ├── PAPERS.md        # Paper index
│   │   ├── BENCHMARKS.md    # Evaluation metrics
│   │   ├── KNOWHOW.md       # Paper→production gap knowledge
│   │   └── deep-dives/      # Individual paper analyses
│   │       └── {paper-slug}.md
│   ├── phases/              # Phase execution artifacts
│   │   └── {NN}-{name}/
│   │       ├── {NN}-RESEARCH.md      # Phase research with paper refs
│   │       ├── {NN}-CONTEXT.md       # User decisions from discuss-phase
│   │       ├── {NN}-{MM}-PLAN.md     # Execution plan
│   │       ├── {NN}-{MM}-SUMMARY.md  # Execution results
│   │       ├── {NN}-{MM}-REVIEW.md   # Code review findings
│   │       ├── {NN}-EVAL.md          # Tiered evaluation plan/results
│   │       └── {NN}-VERIFICATION.md  # Verification report
│   ├── codebase/            # Codebase analysis (from map-codebase)
│   │   ├── STACK.md
│   │   ├── ARCHITECTURE.md
│   │   ├── STRUCTURE.md
│   │   ├── CONVENTIONS.md
│   │   ├── TESTING.md
│   │   ├── INTEGRATIONS.md
│   │   └── CONCERNS.md
│   ├── todos/               # Captured ideas
│   │   ├── pending/
│   │   └── completed/
│   └── experiments/         # Experiment tracking (runtime)
│       └── {NN}-{MM}-experiment.yaml
├── bin/                     # CLI tooling
│   ├── grd-tools.js         # Deterministic operations (5,632 lines)
│   └── grd-manifest.js      # SHA256 file tracking for self-update
├── commands/                # User-facing workflows (40 files)
│   ├── execute-phase.md
│   ├── plan-phase.md
│   ├── new-project.md
│   ├── survey.md
│   ├── deep-dive.md
│   ├── eval-plan.md
│   ├── eval-report.md
│   ├── sync.md
│   └── ... (32 more)
├── agents/                  # Specialized agents (19 files)
│   ├── grd-executor.md
│   ├── grd-planner.md
│   ├── grd-surveyor.md
│   ├── grd-deep-diver.md
│   ├── grd-eval-planner.md
│   ├── grd-verifier.md
│   ├── grd-code-reviewer.md
│   └── ... (12 more)
├── templates/               # Document templates (26 files)
│   ├── project.md
│   ├── roadmap.md
│   ├── state.md
│   ├── summary.md
│   ├── context.md
│   ├── config.json
│   ├── research/            # Research templates
│   │   ├── landscape.md
│   │   ├── papers.md
│   │   ├── benchmarks.md
│   │   ├── knowhow.md
│   │   ├── deep-dive.md
│   │   ├── eval.md
│   │   └── baseline.md
│   ├── codebase/            # Codebase analysis templates
│   │   ├── stack.md
│   │   ├── architecture.md
│   │   ├── structure.md
│   │   ├── conventions.md
│   │   ├── testing.md
│   │   ├── integrations.md
│   │   └── concerns.md
│   └── research-project/
│       └── PRODUCT-QUALITY.md
├── references/              # Protocol documentation (17 files)
│   ├── mcp-tracker-protocol.md
│   ├── tracker-integration.md
│   ├── verification-patterns.md
│   ├── research-methodology.md
│   ├── tdd.md
│   ├── checkpoints.md
│   └── ... (11 more)
├── docs/                    # User documentation
│   └── quickstart.md
├── CLAUDE.md                # Main project instructions (8,328 bytes)
├── README.md                # Public documentation
├── CHANGELOG.md             # Version history
├── VERSION                  # Current version (e.g., "0.0.3")
├── grd-file-manifest.json   # SHA256 manifest for self-update
└── GRD-*.excalidraw.md      # Architecture diagrams (3 files)
```

## Key Directories

### `.claude-plugin/`
**Purpose:** Claude Code plugin discovery and initialization

**Key files:**
- `plugin.json` — Plugin metadata (name, version, author, SessionStart hooks)

**Auto-discovery:** Claude Code scans for `.claude-plugin/plugin.json` on session start.

### `.planning/` (Runtime State)
**Purpose:** All project state, plans, research, and execution artifacts

**Created by:** `/grd:new-project` command

**Key files:**
- `config.json` — GRD configuration (gates, parallelization, tracker, eval, code review)
- `PROJECT.md` — Product vision, research objectives, quality targets
- `ROADMAP.md` — Phase structure with success criteria
- `STATE.md` — Living memory (position, decisions, blockers, deferred validations)
- `BASELINE.md` — Current quantitative performance metrics
- `REQUIREMENTS.md` — Requirements with traceability
- `TRACKER.md` — Issue tracker mapping (created at runtime when syncing)

**Subdirectories:**
- `research/` — Persistent research knowledge base
- `phases/` — Phase execution artifacts
- `codebase/` — Codebase analysis (from `/grd:map-codebase`)
- `todos/` — Captured ideas (pending/ and completed/)
- `experiments/` — Experiment tracking YAML files (runtime)

### `bin/`
**Purpose:** CLI tooling for deterministic operations

**Key files:**
- `grd-tools.js` — 5,632 lines, 64 commands (state management, phase operations, frontmatter CRUD, tracker integration, workflow initialization)
- `grd-manifest.js` — SHA256-based file tracking for self-update system

**Invocation:** Called by commands/agents via bash (e.g., `node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js state load`)

### `commands/`
**Purpose:** User-facing workflow entry points (40 markdown files, ~10,404 lines total)

**Structure:** Each command is a markdown file with `<purpose>`, `<process>`, and step-by-step instructions.

**Grouped by function:**

**Research commands:**
- `survey.md` — SoTA landscape scan
- `deep-dive.md` — Paper deep analysis
- `compare-methods.md` — Method comparison matrix
- `feasibility.md` — Paper→production gap analysis

**Planning commands:**
- `new-project.md` — Initialize R&D project
- `product-plan.md` — Product-level planning
- `discuss-phase.md` — Brainstorming with no-solutions-before-questions protocol
- `plan-phase.md` — Phase planning with research context
- `new-milestone.md` — Create milestone in roadmap
- `add-phase.md` / `insert-phase.md` / `remove-phase.md` — Phase lifecycle

**Execution commands:**
- `execute-phase.md` — Wave-based plan execution
- `quick.md` — Quick task with GRD guarantees
- `resume-project.md` — Resume from STATE.md

**Evaluation commands:**
- `assess-baseline.md` — Current performance baseline
- `eval-plan.md` — Design tiered evaluation
- `eval-report.md` — Collect and analyze results
- `iterate.md` — Iteration loop on failed metrics

**Verification commands:**
- `verify-phase.md` — Run phase verification
- `verify-work.md` — Verify recent work

**Integration commands:**
- `sync.md` — Sync GRD state to issue tracker (roadmap, phase, status, reschedule)
- `tracker-setup.md` — Configure GitHub Issues or MCP Atlassian integration

**Utility commands:**
- `progress.md` — Progress visualization
- `settings.md` — Configuration management
- `help.md` — Command reference
- `update.md` / `reapply-patches.md` — Self-update system
- `yolo.md` — Toggle autonomous mode
- `debug.md` — Debug workflow issues

### `agents/`
**Purpose:** Specialized agents spawned by command orchestrators (19 markdown files, ~10,939 lines total)

**Structure:** Each agent is a markdown file with YAML frontmatter (name, description, tools, color) and `<role>` sections.

**Core agents:**
- `grd-executor.md` — Executes PLAN.md files with atomic commits
- `grd-planner.md` — Creates executable phase plans with research context
- `grd-roadmapper.md` — Roadmap creation/modification
- `grd-verifier.md` — Post-execution verification

**Research agents:**
- `grd-surveyor.md` — SoTA landscape scanning (arXiv, GitHub, Papers with Code)
- `grd-deep-diver.md` — Deep paper analysis
- `grd-phase-researcher.md` — Phase-specific research synthesis
- `grd-project-researcher.md` — Project-level research synthesis
- `grd-research-synthesizer.md` — Cross-phase research synthesis
- `grd-feasibility-analyst.md` — Paper→production gap analysis

**Evaluation agents:**
- `grd-eval-planner.md` — Designs tiered evaluation plans
- `grd-eval-reporter.md` — Collects and analyzes eval results
- `grd-baseline-assessor.md` — Assesses current performance baseline

**Quality agents:**
- `grd-code-reviewer.md` — Automatic code review (spec compliance + quality)
- `grd-plan-checker.md` — Plan structure verification
- `grd-integration-checker.md` — Integration readiness check

**Planning agents:**
- `grd-product-owner.md` — Product-level planning and quality targets
- `grd-codebase-mapper.md` — Codebase analysis

**Utility agents:**
- `grd-debugger.md` — Debug workflow issues

### `templates/`
**Purpose:** Markdown templates for all GRD documents (26 files)

**Structure:**

**Root-level templates:**
- `project.md` — PROJECT.md template
- `roadmap.md` — ROADMAP.md template
- `state.md` — STATE.md template
- `requirements.md` — REQUIREMENTS.md template
- `summary.md` — SUMMARY.md template
- `summary-standard.md` / `summary-minimal.md` — Summary variants
- `context.md` — CONTEXT.md template (user decisions)
- `UAT.md` — User acceptance testing template
- `milestone.md` — Milestone template
- `config.json` — Default configuration
- `tracker-mapping.md` — TRACKER.md template

**Research templates (`research/`):**
- `landscape.md` — LANDSCAPE.md template
- `papers.md` — PAPERS.md template
- `benchmarks.md` — BENCHMARKS.md template
- `knowhow.md` — KNOWHOW.md template
- `deep-dive.md` — Deep-dive template
- `eval.md` — EVAL.md template
- `baseline.md` — BASELINE.md template

**Codebase templates (`codebase/`):**
- `stack.md`, `architecture.md`, `structure.md`, `conventions.md`, `testing.md`, `integrations.md`, `concerns.md`

**Research project templates (`research-project/`):**
- `PRODUCT-QUALITY.md` — Product-level quality targets

**Usage:** CLI tool `template fill` commands substitute placeholders with runtime data.

### `references/`
**Purpose:** Cross-cutting protocol documentation (17 markdown files)

**Key files:**
- `mcp-tracker-protocol.md` — MCP Atlassian integration protocol (prepare/execute/record pattern)
- `tracker-integration.md` — GitHub Issues integration
- `verification-patterns.md` — Tiered verification methodology
- `research-methodology.md` — Research workflow patterns
- `tdd.md` — Test-driven development protocol
- `checkpoints.md` — Checkpoint pause/resume protocol
- `questioning.md` — Deep questioning methodology
- `continuation-format.md` — Checkpoint continuation format
- `execute-plan.md` — Plan execution protocol
- `git-integration.md` — Git workflow patterns
- `git-planning-commit.md` — Planning doc commit protocol
- `model-profiles.md` / `model-profile-resolution.md` — Agent model selection
- `phase-argument-parsing.md` — Phase number parsing
- `decimal-phase-calculation.md` — Decimal phase insertion logic
- `planning-config.md` — Configuration schema
- `ui-brand.md` — UI conventions

### `docs/`
**Purpose:** User documentation

**Key files:**
- `quickstart.md` — Getting started guide

## File Naming Conventions

### Command Files
**Pattern:** `{command-name}.md` (lowercase, hyphenated)

**Examples:** `execute-phase.md`, `new-project.md`, `deep-dive.md`

**Invocation:** `/grd:{command-name}` in Claude Code

### Agent Files
**Pattern:** `grd-{agent-type}.md` (lowercase, hyphenated)

**Examples:** `grd-executor.md`, `grd-planner.md`, `grd-surveyor.md`

**Naming prefix:** All agents start with `grd-` to distinguish from GSD agents.

### Template Files
**Pattern:** `{document-name}.md` (lowercase, hyphenated)

**Examples:** `project.md`, `roadmap.md`, `deep-dive.md`

**Matches output:** Template name corresponds to generated file name (e.g., `project.md` → `PROJECT.md`).

### Phase Directory Names
**Pattern:** `{NN}-{slug}/` where:
- `{NN}` = Zero-padded phase number (e.g., `01`, `02`, `02.1`)
- `{slug}` = URL-safe phase name slug (lowercase, hyphenated)

**Examples:**
- `01-foundation/`
- `02-model-training/`
- `02.1-urgent-fix/` (decimal phase)

**Generated by:** `grd-tools.js phase add` / `phase insert`

### Phase Document Names
**Pattern within phase directory:**
- `{NN}-RESEARCH.md` — Phase research
- `{NN}-CONTEXT.md` — User decisions
- `{NN}-{MM}-PLAN.md` — Execution plan (e.g., `01-01-PLAN.md`)
- `{NN}-{MM}-SUMMARY.md` — Execution results (e.g., `01-01-SUMMARY.md`)
- `{NN}-{MM}-REVIEW.md` — Code review (e.g., `01-01-REVIEW.md`)
- `{NN}-EVAL.md` — Evaluation plan/results
- `{NN}-VERIFICATION.md` — Verification report

**Examples:**
- `.planning/phases/01-foundation/01-RESEARCH.md`
- `.planning/phases/01-foundation/01-01-PLAN.md`
- `.planning/phases/01-foundation/01-01-SUMMARY.md`
- `.planning/phases/01-foundation/01-EVAL.md`

### Research Document Names
**Pattern:**
- `LANDSCAPE.md` — SoTA landscape
- `PAPERS.md` — Paper index
- `BENCHMARKS.md` — Evaluation metrics
- `KNOWHOW.md` — Paper→production gaps
- `deep-dives/{paper-slug}.md` — Individual paper analysis

**Slug generation:** `grd-tools.js generate-slug "{Paper Title}"` → `paper-title`

### Codebase Document Names
**Pattern:** `{AREA}.md` (UPPERCASE)

**Examples:** `STACK.md`, `ARCHITECTURE.md`, `STRUCTURE.md`, `CONVENTIONS.md`, `TESTING.md`, `INTEGRATIONS.md`, `CONCERNS.md`

## Module Organization

### No Traditional Modules
GRD is a **document-driven workflow system**, not a traditional code library. Organization is by:

1. **Document type** (commands, agents, templates, references)
2. **Workflow phase** (research, planning, execution, evaluation)
3. **Responsibility** (orchestration, execution, verification, integration)

### Import/Reference Patterns

**Commands reference agents:**
```markdown
Agent(
  name="grd-executor",
  model="${EXECUTOR_MODEL}",
  context=...
)
```

**Agents reference CLI tool:**
```bash
INIT=$(node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js init execute-phase "${PHASE}")
```

**Agents reference templates:**
```bash
cat ${CLAUDE_PLUGIN_ROOT}/templates/summary.md
```

**Agents reference references:**
```markdown
@${CLAUDE_PLUGIN_ROOT}/references/checkpoints.md
@${CLAUDE_PLUGIN_ROOT}/references/tdd.md
```

**Cross-document references use `@` syntax:**
```markdown
@.planning/PROJECT.md
@.planning/research/LANDSCAPE.md
@.planning/phases/01-foundation/01-RESEARCH.md
```

### Execution Context Loading
Commands use `grd-tools.js init {workflow-name}` to load all necessary context in one call:

```bash
# Loads state, roadmap, requirements, context, research in one JSON response
INIT=$(node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js init plan-phase 1 --include state,roadmap,requirements,context,research)
```

This centralizes context loading and reduces redundant reads across ~50 command/agent files.

## Configuration Files

### `.claude-plugin/plugin.json`
**Purpose:** Plugin metadata and hooks

**Schema:**
- `name`, `version`, `description`, `author`
- `hooks.SessionStart` — Commands to run on session start

### `.planning/config.json`
**Purpose:** GRD runtime configuration

**Schema (from `templates/config.json`):**
- `mode` — interactive | autonomous
- `depth` — standard | deep
- `workflow` — research, plan_check, verifier toggles
- `planning` — commit_docs, search_gitignored
- `parallelization` — enabled, plan_level, task_level, max_concurrent_agents
- `gates` — confirmation gates (confirm_project, confirm_phases, etc.)
- `research_gates` — research-specific gates (before_plan, verification_design, after_eval, feasibility)
- `autonomous_mode` — YOLO mode toggle
- `tracker` — provider (none | github | mcp-atlassian), auto_sync, provider-specific configs
- `eval_config` — default_metrics, baseline_tracking, auto_iterate_on_failure
- `safety` — always_confirm_destructive, always_confirm_external_services
- `code_review` — enabled, timing (per_wave | per_phase), severity_gate, auto_fix_warnings
- `execution` — use_teams, team_timeout_minutes, max_concurrent_teammates

**Operations:** `grd-tools.js config-set`, `grd-tools.js config-ensure-section`

### `grd-file-manifest.json`
**Purpose:** SHA256 manifest for self-update system

**Schema:**
- `version`, `timestamp`, `file_count`
- `files` — Map of relative paths to SHA256 hashes

**Generated by:** `bin/grd-manifest.js generate`

**Used by:** `/grd:update` command to detect local modifications before pulling updates.

### `VERSION`
**Purpose:** Current version string (e.g., `0.0.3`)

**Format:** Single line, semver format

**Used by:** Self-update system, plugin.json version field

## Adding New Code

### To add a new command:
1. Create `commands/{command-name}.md`
2. Follow structure: `<purpose>`, `<required_reading>`, `<process>` with numbered steps
3. Add corresponding `init {command-name}` case in `bin/grd-tools.js` (if complex context loading needed)
4. Reference in `commands/help.md`
5. Update `CLAUDE.md` command list

### To add a new agent:
1. Create `agents/grd-{agent-type}.md`
2. Include YAML frontmatter: name, description, tools, color
3. Define `<role>` section with spawning context
4. Add to MODEL_PROFILES table in `bin/grd-tools.js` (lines 123-145)
5. Update `CLAUDE.md` agent model profiles table

### To add a new template:
1. Create `templates/{template-name}.md`
2. Use placeholders: `[YYYY-MM-DD]`, `{PHASE}`, `{PLAN}`, `{NAME}`, etc.
3. Add `template fill {template-name}` command in `bin/grd-tools.js` (if runtime substitution needed)
4. Document in `references/` if new protocol introduced

### To add a new CLI tool command:
1. Define `function cmd{CommandName}(cwd, args, raw)` in `bin/grd-tools.js`
2. Parse args, perform operation, return JSON result via `output(result, raw, rawValue)`
3. Add to main `switch (command)` dispatcher (bottom of file)
4. Document in file header (lines 10-115)
5. Add tests/examples in comments

### To extend tracker integration:
1. Update `references/mcp-tracker-protocol.md` with new operation
2. Add `tracker {operation}` command in `bin/grd-tools.js`
3. Update `commands/sync.md` with new sync option
4. Test against both GitHub Issues and MCP Atlassian providers

### To add a new research workflow:
1. Create command in `commands/` (e.g., `new-research-type.md`)
2. Create agent in `agents/` (e.g., `grd-research-analyzer.md`)
3. Create template in `templates/research/` (e.g., `analysis.md`)
4. Update `references/research-methodology.md` with new pattern
5. Ensure research output added to `research/` directory

---

*Structure analysis: 2026-02-12*
