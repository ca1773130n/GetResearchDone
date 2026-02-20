# Architecture

**Analysis Date:** 2026-02-12

## System Overview

GRD (Get Research Done) is a research-grade development workflow automation plugin for Claude Code. It extends the GSD (Get Shit Done) model with research rigor, quantitative evaluation, and autonomous iteration loops. The system operates as a multi-agent orchestration framework where user-facing command workflows spawn specialized agents to execute research, planning, execution, and evaluation phases.

Core architecture: **Command → Orchestrator → Agent(s) → CLI Tool → Git Commit**

All operations flow through a deterministic CLI tooling layer (`bin/grd-tools.js`) that handles state management, phase operations, frontmatter CRUD, and external integrations (GitHub Issues, Jira via MCP Atlassian).

## Key Architectural Patterns

### 1. Multi-Agent Orchestration
**Pattern:** Command-orchestrator-agent delegation with JSON-based context passing

Commands (in `commands/`) invoke orchestrator logic that spawns specialized agents (in `agents/`) via Claude Code's Agent system. Each agent is a markdown-formatted prompt with role definition, tools, and step-by-step execution flow.

Example flow:
- `/grd:execute-phase` (command) → orchestrator discovers plans → spawns `grd-executor` (agent) per plan → executor commits code → orchestrator collects results

Agent model selection uses a profile system (quality/balanced/budget) defined in `bin/grd-tools.js` MODEL_PROFILES table.

### 2. Persistent Research Knowledge Base
**Pattern:** Accumulative research context with cross-referencing

Research findings persist in `.planning/research/` across all phases:
- `LANDSCAPE.md` — SoTA landscape scan (methods, benchmarks, trends)
- `PAPERS.md` — Paper index with summaries
- `BENCHMARKS.md` — Evaluation metrics and datasets
- `KNOWHOW.md` — Paper→production gap knowledge
- `deep-dives/*.md` — Individual paper deep analyses

Downstream agents (`grd-planner`, `grd-executor`, `grd-eval-planner`) load research context before operating. This creates a feedback loop where research informs implementation and implementation informs future research.

### 3. Tiered Verification System
**Pattern:** Layered validation with deferred dependencies

Not all validation can happen in-phase. GRD uses three verification levels:
- **Level 1 (Sanity):** Always in-phase (format checks, crash tests, distribution viz)
- **Level 2 (Proxy):** Indirect in-phase (small-subset eval, ablation reproduction)
- **Level 3 (Deferred):** Integration only (full PSNR/SSIM/LPIPS on complete pipeline)

Deferred validations tracked in `STATE.md` with `validates_at` references. Integration phases automatically collect all deferred validations from dependencies.

### 4. CLI Tool Delegation
**Pattern:** Deterministic operations delegated to Node.js CLI tool

All state mutations, file operations, and calculations delegated to `bin/grd-tools.js` (5,632 lines, 64 commands). Agents call tool commands via bash, parse JSON output.

Benefits:
- Consistency across ~50 command/agent files
- Testability (CLI tool outputs JSON)
- No inline bash string parsing
- Idempotent operations

### 5. Frontmatter-Driven Execution
**Pattern:** YAML frontmatter in markdown files drives execution logic

Every `PLAN.md` file contains YAML frontmatter with:
- `phase`, `plan`, `type`, `wave`, `depends_on` — execution metadata
- `verification_level` — which tier of validation
- `eval_metrics` — experiment tracking parameters
- `autonomous` — checkpoint behavior

Executors parse frontmatter to determine execution flow. `bin/grd-tools.js` provides frontmatter CRUD operations (`frontmatter get/set/merge/validate`).

### 6. Wave-Based Parallel Execution
**Pattern:** Dependency graph → wave grouping → parallel agent spawn

Plans within a phase grouped into waves based on `depends_on` frontmatter field. Plans in same wave execute in parallel (via multiple agent calls), waves execute sequentially.

Example:
```
Wave 1: [01-01, 01-02] (no deps)
Wave 2: [01-03] (depends_on: [01-01, 01-02])
Wave 3: [01-04, 01-05] (depends_on: [01-03])
```

Parallelization toggled via `.planning/config.json` → `parallelization.enabled`.

### 7. Checkpoint-Based Continuation
**Pattern:** Executor pauses at checkpoints, orchestrator resumes with new agent

Plans with `type="checkpoint"` tasks pause execution. Executor writes structured `<checkpoint>` message with completed tasks, then exits. Orchestrator detects checkpoint, prompts user, spawns new agent with `<completed_tasks>` context to resume.

Prevents runaway execution in experimental phases where human validation required mid-plan.

### 8. Autonomous Mode (YOLO)
**Pattern:** Gate bypass with decision logging

Toggle via `.planning/config.json` → `autonomous_mode: true` or `/grd:yolo` command.

When enabled:
- All confirmation gates (research, plan approval, execution) → auto-approve
- All research questions → agent decides using available context
- All decisions logged to `STATE.md` with timestamps
- Iteration loops continue until metrics satisfied or max iterations

Enables continuous experimentation without human intervention.

### 9. External Tracker Integration
**Pattern:** One-way push with prepare/execute/record protocol

GRD pushes state to external issue trackers (GitHub Issues, Jira via MCP Atlassian). Mapping:
- Milestone → Epic
- Phase → Task (child of Epic)
- Plan → Sub-task (child of Task)

Three-step protocol (from `references/mcp-tracker-protocol.md`):
1. **Prepare:** `grd-tools.js tracker prepare-roadmap-sync` → operations list (JSON)
2. **Execute:** Agent calls MCP tools (`create_issue`, `transition_issue`, `add_comment`)
3. **Record:** `grd-tools.js tracker record-mapping` → update `.planning/TRACKER.md`

All tracker calls non-blocking. Date scheduling syncs milestone/phase durations to Jira Plans timeline.

### 10. Template-Based Scaffolding
**Pattern:** Markdown templates in `templates/` + CLI tool fill operations

Templates for all GRD documents (`PROJECT.md`, `ROADMAP.md`, `STATE.md`, `PLAN.md`, `SUMMARY.md`, etc.) stored in `templates/`. CLI tool provides `template fill` commands that substitute placeholders with runtime data.

Research templates in `templates/research/`, codebase analysis templates in `templates/codebase/`.

## Core Components

### Commands Layer (`commands/`, 40 files, ~10,404 lines)
- **Purpose:** User-facing workflow entry points
- **Key files:**
  - `execute-phase.md` — Wave-based plan execution orchestrator
  - `plan-phase.md` — Research → Plan → Verify → Eval workflow
  - `new-project.md` — Project initialization with research landscape
  - `survey.md` — SoTA landscape scan
  - `deep-dive.md` — Paper deep analysis
  - `eval-plan.md` / `eval-report.md` — Evaluation design and reporting
  - `sync.md` — External tracker synchronization

### Agents Layer (`agents/`, 19 files, ~10,939 lines)
- **Purpose:** Specialized agents spawned by command orchestrators
- **Key files:**
  - `grd-executor.md` — Executes `PLAN.md` files with atomic commits
  - `grd-planner.md` — Creates executable phase plans with research context
  - `grd-surveyor.md` — SoTA landscape scanning (arXiv, GitHub, Papers with Code)
  - `grd-deep-diver.md` — Deep paper analysis
  - `grd-eval-planner.md` — Designs tiered evaluation plans
  - `grd-verifier.md` — Post-execution verification
  - `grd-code-reviewer.md` — Automatic code review (spec compliance + quality)
  - `grd-phase-researcher.md` — Phase-specific research synthesis
  - `grd-product-owner.md` — Product-level planning and quality targets

### CLI Tool Layer (`bin/`)
- **Purpose:** Deterministic operations delegated from commands/agents
- **Key files:**
  - `grd-tools.js` (5,632 lines, 64 commands) — State management, phase operations, frontmatter CRUD, tracker integration, workflow initialization
  - `grd-manifest.js` — SHA256-based file tracking for self-update system

### Templates Layer (`templates/`, 26 files)
- **Purpose:** Markdown templates for all GRD documents
- **Structure:**
  - Root-level templates: `project.md`, `roadmap.md`, `state.md`, `requirements.md`, `summary.md`, `context.md`, `UAT.md`
  - `research/`: `landscape.md`, `papers.md`, `benchmarks.md`, `knowhow.md`, `deep-dive.md`, `eval.md`, `baseline.md`
  - `codebase/`: `stack.md`, `architecture.md`, `structure.md`, `conventions.md`, `testing.md`, `integrations.md`, `concerns.md`
  - `research-project/`: `PRODUCT-QUALITY.md`

### References Layer (`references/`, 17 files)
- **Purpose:** Cross-cutting protocol documentation
- **Key files:**
  - `mcp-tracker-protocol.md` — MCP Atlassian integration protocol
  - `tracker-integration.md` — GitHub Issues integration
  - `verification-patterns.md` — Tiered verification methodology
  - `research-methodology.md` — Research workflow patterns
  - `tdd.md` — Test-driven development protocol
  - `checkpoints.md` — Checkpoint pause/resume protocol
  - `questioning.md` — Deep questioning methodology

### Plugin Manifest (`.claude-plugin/`)
- **Purpose:** Claude Code plugin discovery
- **File:** `plugin.json` — Plugin metadata and SessionStart hooks

## Data Flow

### Project Initialization Flow
```
User: /grd:new-project
  → new-project.md (command)
  → grd-tools.js init new-project (load context)
  → Deep questioning (or --auto mode document parsing)
  → grd-product-owner (agent) — write PROJECT.md, PRODUCT-QUALITY.md
  → grd-roadmapper (agent) — write ROADMAP.md
  → grd-surveyor (agent) — write research/LANDSCAPE.md
  → grd-tools.js commit (git commit all planning docs)
```

### Phase Planning Flow
```
User: /grd:plan-phase 1
  → plan-phase.md (command)
  → grd-tools.js init plan-phase 1 (load state + roadmap + research)
  → Read research/LANDSCAPE.md, research/PAPERS.md
  → grd-phase-researcher (agent) — write 01-RESEARCH.md (if needed)
  → grd-planner (agent) — write 01-01-PLAN.md, 01-02-PLAN.md, etc.
  → grd-plan-checker (agent) — verify plans (revision loop max 3x)
  → grd-eval-planner (agent) — write 01-EVAL.md
  → grd-tools.js commit (git commit all plans)
  → grd-tools.js tracker sync-phase 1 (if tracker enabled)
```

### Phase Execution Flow
```
User: /grd:execute-phase 1
  → execute-phase.md (command)
  → grd-tools.js phase-plan-index 1 (discover plans + waves)
  → For each wave (sequentially):
    → For each plan in wave (parallel):
      → grd-executor (agent) — execute plan tasks
      → git commit (per task)
      → write NN-MM-SUMMARY.md
      → grd-tools.js state record-metric (update STATE.md)
    → If code_review_enabled:
      → grd-code-reviewer (agent) — write NN-MM-REVIEW.md
  → grd-verifier (agent) — write 01-VERIFICATION.md
  → grd-tools.js tracker update-status 1 complete (if tracker enabled)
```

### Research Flow
```
User: /grd:survey "image super-resolution"
  → survey.md (command)
  → grd-surveyor (agent)
    → WebSearch (arXiv, GitHub trending, Papers with Code)
    → WebFetch (paper abstracts, GitHub READMEs)
    → Write/update research/LANDSCAPE.md
  → grd-tools.js commit

User: /grd:deep-dive @paper.pdf
  → deep-dive.md (command)
  → grd-deep-diver (agent)
    → Read paper
    → Extract methodology, eval metrics, ablations
    → Write research/deep-dives/{paper-slug}.md
    → Update research/PAPERS.md index
  → grd-tools.js commit
```

### Evaluation Flow
```
User: /grd:eval-report 1
  → eval-report.md (command)
  → grd-tools.js init eval-report 1 (load eval plan)
  → grd-eval-reporter (agent)
    → Read 01-EVAL.md
    → Collect experimental results from .planning/experiments/
    → Analyze metrics vs. targets
    → Write eval results to 01-EVAL.md
  → If metrics fail AND auto_iterate_on_failure:
    → /grd:iterate 1 (automatic iteration loop)
```

## Entry Points

- **Plugin discovery:** `.claude-plugin/plugin.json` — Loaded by Claude Code on session start
- **User commands:** `commands/*.md` — Invoked via `/grd:command-name` in Claude Code
- **CLI tool:** `bin/grd-tools.js` — Called by commands/agents via bash
- **Self-update:** `commands/update.md` + `bin/grd-manifest.js` — Version check and patch management

## Key Abstractions

### Phase
**Purpose:** A unit of work in the roadmap with a goal, success criteria, and plans.

**Structure:**
- Integer phases (1, 2, 3) — Planned milestone work
- Decimal phases (2.1, 2.2) — Urgent insertions
- Each phase has a directory: `.planning/phases/{NN}-{slug}/`

**Types:** survey | implement | evaluate | integrate

### Plan
**Purpose:** An executable prompt for an agent, typically 2-3 tasks.

**Structure:**
- File: `.planning/phases/{NN}-{slug}/{NN}-{MM}-PLAN.md`
- Frontmatter: phase, plan, type, wave, depends_on, verification_level, eval_metrics
- Body: objective, context (@-references), tasks (auto/checkpoint/manual), verification, output spec

**Types:** execute | tdd | gap_closure

### Wave
**Purpose:** Dependency-based grouping for parallel execution.

**Computed from:** `depends_on` frontmatter field in each plan.

**Example:**
- Plans with no deps → Wave 1
- Plans depending on Wave 1 → Wave 2
- Plans depending on Wave 2 → Wave 3

### Verification Level
**Purpose:** Classification of what can be validated in-phase vs. deferred.

**Levels:**
- **Sanity (1):** Format checks, crash tests, distribution viz — always in-phase
- **Proxy (2):** Small-subset eval, ablation reproduction — indirect in-phase validation
- **Deferred (3):** Full pipeline PSNR/SSIM/LPIPS — requires integration

**Tracked in:** Plan frontmatter + `STATE.md` deferred validations section

### Agent Model Profile
**Purpose:** Map agent type to Claude model based on quality/balanced/budget profile.

**Implementation:** `bin/grd-tools.js` MODEL_PROFILES table (lines 123-145)

**Profiles:**
- **Quality:** Opus for critical agents (planner, executor, product-owner)
- **Balanced:** Opus for planning, Sonnet for execution
- **Budget:** Sonnet for most, Haiku for lightweight tasks

**Resolution:** `grd-tools.js resolve-model {agent-type}` → returns model ID

### Tracker Mapping
**Purpose:** Bidirectional mapping between GRD entities and external issue tracker IDs.

**Storage:** `.planning/TRACKER.md`

**Hierarchy:**
```
Milestone → Epic (issue_key: PROJ-123)
  └── Phase → Task (issue_key: PROJ-124, parent: PROJ-123)
        └── Plan → Sub-task (issue_key: PROJ-125, parent: PROJ-124)
```

**Operations:** create, update_status, add_comment, schedule

### Research Landscape
**Purpose:** Living SoTA knowledge base that accumulates across project lifecycle.

**Structure:**
- `.planning/research/LANDSCAPE.md` — Method comparison tables, benchmark leaderboards, trends
- `.planning/research/PAPERS.md` — Paper index with summaries
- `.planning/research/BENCHMARKS.md` — Metrics and datasets
- `.planning/research/KNOWHOW.md` — Paper→production gap knowledge
- `.planning/research/deep-dives/*.md` — Individual paper analyses

**Used by:** grd-planner, grd-executor, grd-eval-planner, grd-product-owner

### State Machine
**Purpose:** Project-level state tracking across all phases.

**File:** `.planning/STATE.md`

**Sections:**
- Current Position — active phase, next plan number
- Pending Decisions — unresolved questions
- Deferred Validations — Level 3 verifications
- Key Decisions — locked decisions with timestamps
- Blockers — active blockers preventing progress
- Session Continuity — last stopped location

**Operations (via grd-tools.js):**
- `state load`, `state get`, `state patch`, `state update`
- `state advance-plan`, `state record-metric`, `state add-decision`
- `state add-blocker`, `state resolve-blocker`

---

*Architecture analysis: 2026-02-12*
