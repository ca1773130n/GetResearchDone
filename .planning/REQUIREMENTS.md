# Requirements: v0.2.7 Self-Evolution

**Milestone:** v0.2.7
**Created:** 2026-02-22

## Category: Dogfooding Infrastructure

### REQ-110: Testbed project with full GRD lifecycle
**Priority:** P0 | **Status:** Open
Initialize the testbed (multi-bootstrap copy) as a GRD project. Run `new-project`, create long-term milestones, normal milestones, phases, and plans -- exercising the full user workflow. The testbed must mimic how a real user would adopt GRD for their agentic dev workflow.

### REQ-111: Local CLI testing harness
**Priority:** P0 | **Status:** Open
All GRD commands during development must run via local `bin/grd-tools.js` (not the cached plugin at `~/.claude-personal1/plugins/cache/`). Establish a test harness that validates changes against the testbed before committing.

## Category: Bug Fixes

### REQ-112: Fix currentMilestone parsing bug
**Priority:** P1 | **Status:** Open
`init new-milestone` returns `current_milestone: "v0.0.5"` instead of the actual active milestone (v0.2.7). The `currentMilestone()` function in `lib/paths.js` fails to parse the milestone version from STATE.md when the format is "v0.2.7 Self-Evolution".

### REQ-113: Discover and fix bugs through dogfooding
**Priority:** P1 | **Status:** Open
Exercise the full GRD workflow on the testbed project. Catalog all bugs, glitches, and unexpected behaviors encountered. Fix each one with a test. Expected discovery areas: init workflows, state management, milestone lifecycle, path resolution.

## Category: Complexity Reduction

### REQ-114: Module complexity audit and reduction
**Priority:** P2 | **Status:** Open
Audit all 19 lib/ modules for cyclomatic complexity, function count, and LOC. Identify the top 3 most complex modules. Reduce their complexity through extraction, simplification, or decomposition -- without changing external behavior.

### REQ-115: Consolidate duplicate patterns
**Priority:** P2 | **Status:** Open
Identify duplicate or near-duplicate code patterns across lib/ modules (repeated error handling, similar JSON formatting, redundant path constructions). Extract shared utilities or simplify to reduce total LOC.

## Category: Tech Debt

### REQ-116: Dead code elimination
**Priority:** P2 | **Status:** Open
Identify and remove unused exports, unreachable branches, and obsolete code paths across lib/ modules. Validate removal via test suite -- no test should break.

### REQ-117: Test coverage improvement
**Priority:** P2 | **Status:** Open
Identify modules with coverage below 85%. Add targeted tests for uncovered branches and edge cases. Goal: all lib/ modules at 85%+ line coverage.

## Category: New Features

### REQ-118: Dogfooding-driven feature discovery
**Priority:** P1 | **Status:** Open
During testbed exercise, capture friction points and missing capabilities as new feature requirements. Implement the highest-value features within this milestone. Examples might include: better error messages, workflow shortcuts, missing validation, UX improvements.

### REQ-119: Autopilot command for multi-phase autonomous execution
**Priority:** P1 | **Status:** Open
Create `/grd:autopilot` command that plans and executes a range of phases without human intervention. Each phase runs in a fresh Task agent (natural context isolation) — the agent plans, executes, writes a handoff summary, then terminates. Only the compact summary is passed to the next phase's agent, not the full conversation. This solves the context window bloat problem that occurs when running many phases sequentially (where `/clear` cannot be triggered programmatically). The orchestrator stays lightweight, never accumulating implementation-level context. Includes `lib/autopilot.js` module, `commands/autopilot.md` skill, MCP tool, graceful failure handling with resume capability.

## Traceability Matrix

| Requirement | Phase | Status |
|-------------|-------|--------|
| REQ-110 | Phase 48 | Open |
| REQ-111 | Phase 48 | Open |
| REQ-112 | Phase 49 | Open |
| REQ-113 | Phase 49 | Open |
| REQ-114 | Phase 50 | Open |
| REQ-115 | Phase 50 | Open |
| REQ-116 | Phase 50 | Open |
| REQ-117 | Phase 51 | Open |
| REQ-118 | Phase 51 | Open |
| REQ-119 | Phase 52 | Open |
