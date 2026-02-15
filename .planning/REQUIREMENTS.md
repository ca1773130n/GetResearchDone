# Requirements: v0.1.0 — Setup Functionality & Usability

**Created:** 2026-02-16
**Milestone:** v0.1.0

## Feature 1: Multi AI-Backend Support

### REQ-01: Backend Detection Module
**Priority:** P0
**Category:** Multi-backend
Create `lib/backend.js` module with `detectBackend()` function that identifies the active AI coding CLI at runtime. Detection waterfall: (1) explicit config override, (2) environment variables (`CLAUDE_CODE_*`, `CODEX_HOME`, `GEMINI_CLI_HOME`, `OPENCODE`), (3) filesystem clues, (4) default to `claude`. Returns one of: `claude`, `codex`, `gemini`, `opencode`.
**Research:** `.planning/research/multi-backend-detection.md`, `.planning/research/ARCHITECTURE.md`

### REQ-02: Backend Model Resolution
**Priority:** P0
**Category:** Multi-backend
Extend `resolveModelInternal()` to map GRD abstract tiers (opus/sonnet/haiku) to backend-specific model names. Default model table: Claude (opus/sonnet/haiku), Codex (gpt-5.3-codex/gpt-5.3-codex-spark/gpt-5.3-codex-spark), Gemini (gemini-3-pro/gemini-3-flash/gemini-2.5-flash), OpenCode (anthropic/claude-opus-4-5/anthropic/claude-sonnet-4-5/anthropic/claude-haiku-4-5). All defaults user-overridable via `config.json`.
**Research:** `.planning/research/multi-backend-detection.md`

### REQ-03: Config Schema Extension
**Priority:** P0
**Category:** Multi-backend
Add `backend` (explicit override) and `backend_models` (per-backend model mappings) fields to `.planning/config.json`. Schema: `backend_models: { claude: { opus, sonnet, haiku }, codex: { ... }, ... }`. Backward compatible — missing fields use defaults.
**Research:** `.planning/research/ARCHITECTURE.md`

### REQ-04: detect-backend CLI Command
**Priority:** P1
**Category:** Multi-backend
Add `detect-backend` CLI command to `grd-tools.js`. Returns JSON: `{ backend, models: { opus, sonnet, haiku }, capabilities: { subagents, parallel, teams, hooks, mcp } }`. Supports `--raw` for plain text (just backend name).
**Research:** `.planning/research/multi-backend-detection.md`

### REQ-05: Backend Capabilities Registry
**Priority:** P1
**Category:** Multi-backend
Add `getBackendCapabilities()` to `lib/backend.js`. Returns structured object: `{ subagents: bool, parallel: bool, teams: bool, hooks: bool, mcp: bool }`. Used by orchestrator commands to adapt behavior (e.g., skip parallel execution on Gemini).
**Research:** `.planning/research/ARCHITECTURE.md`

### REQ-06: Context Init Backend Awareness
**Priority:** P0
**Category:** Multi-backend
Modify all `cmdInit*` functions in `lib/context.js` to include `backend` and backend-resolved model names in their output. Orchestrator commands receive backend info and use correct model names.
**Research:** `.planning/research/ARCHITECTURE.md`

### REQ-07: Unit Tests for Backend Module
**Priority:** P0
**Category:** Multi-backend
Unit tests for `lib/backend.js`: detection with mocked env vars (all 4 backends), model resolution with defaults and overrides, config override precedence, capabilities lookup. Coverage >= 80%.
**Research:** `.planning/research/PITFALLS.md` (P9)

## Feature 2: Auto Refactoring & Doc-Sync Plans

### REQ-08: Phase Cleanup Config Option
**Priority:** P1
**Category:** Auto-cleanup
Add `phase_cleanup` config section: `{ enabled: bool, refactoring: bool, doc_sync: bool }`. Default: disabled. When enabled, auto-appends cleanup analysis step after phase plan execution.
**Research:** `.planning/research/auto-refactoring-plans.md`

### REQ-09: Quality Analysis at Phase Boundary
**Priority:** P1
**Category:** Auto-cleanup
When `phase_cleanup.enabled`, run quality analysis after the last plan in a phase: ESLint complexity check, dead export detection (unused exports vs. test coverage), file size check against thresholds. Output a structured quality report.
**Research:** `.planning/research/auto-refactoring-plans.md`

### REQ-10: Doc Drift Detection
**Priority:** P2
**Category:** Auto-cleanup
Detect stale documentation: CHANGELOG not updated since last plan, README links broken, JSDoc parameter mismatches. Report as warnings in phase completion summary.
**Research:** `.planning/research/auto-refactoring-plans.md`

### REQ-11: Auto-Generated Cleanup Plan
**Priority:** P2
**Category:** Auto-cleanup
When quality analysis finds issues above configured thresholds, auto-generate a cleanup PLAN.md and append it to the phase. User can execute or skip.
**Research:** `.planning/research/auto-refactoring-plans.md`

## Feature 3: Hierarchical Roadmap Planning

### REQ-12: LONG-TERM-ROADMAP.md Schema
**Priority:** P0
**Category:** Hierarchical roadmap
Define and support `LONG-TERM-ROADMAP.md` file with Now/Next/Later milestone tiers. Now: detailed (goals, requirements, phases). Next: refined (goals, key requirements). Later: rough (goals only, relative timing like "Q3 2026"). Support 3-5 milestones ahead.
**Research:** `.planning/research/hierarchical-roadmap.md`

### REQ-13: Long-Term Roadmap Command
**Priority:** P0
**Category:** Hierarchical roadmap
Add `/grd:long-term-roadmap` command to create or display the long-term roadmap. On first run: interactive wizard to define rough milestones. On subsequent runs: display current roadmap with tier indicators.
**Research:** `.planning/research/hierarchical-roadmap.md`

### REQ-14: Planning Mode Detection
**Priority:** P1
**Category:** Hierarchical roadmap
Auto-detect planning mode: if `LONG-TERM-ROADMAP.md` exists, use hierarchical mode. If not, use progressive mode (current behavior). Both modes fully supported, no breaking changes.
**Research:** `.planning/research/hierarchical-roadmap.md`

### REQ-15: Milestone Refinement Command
**Priority:** P1
**Category:** Hierarchical roadmap
Add `/grd:refine-milestone <N>` command. Uses discussion protocol (like discuss-phase) to progressively refine a Later/Next milestone into detailed goals, requirements, and phase structure. Updates LONG-TERM-ROADMAP.md tier as refinement progresses.
**Research:** `.planning/research/hierarchical-roadmap.md`

### REQ-16: Milestone Promotion
**Priority:** P2
**Category:** Hierarchical roadmap
Add `/grd:promote-milestone <N>` to move a milestone from Later to Next or Next to Now. When promoted to Now, triggers full ROADMAP.md generation from the milestone definition. Integrates with existing `/grd:new-milestone` flow.
**Research:** `.planning/research/hierarchical-roadmap.md`

### REQ-17: Long-Term Roadmap Tests
**Priority:** P1
**Category:** Hierarchical roadmap
Unit tests for LONG-TERM-ROADMAP.md parsing, tier detection, mode detection, and milestone promotion logic. Integration tests for roadmap create/display/refine commands. Coverage >= 80%.

---

## Traceability Matrix

| REQ | Feature | Priority | Phase |
|-----|---------|----------|-------|
| REQ-01 | Multi-backend | P0 | TBD |
| REQ-02 | Multi-backend | P0 | TBD |
| REQ-03 | Multi-backend | P0 | TBD |
| REQ-04 | Multi-backend | P1 | TBD |
| REQ-05 | Multi-backend | P1 | TBD |
| REQ-06 | Multi-backend | P0 | TBD |
| REQ-07 | Multi-backend | P0 | TBD |
| REQ-08 | Auto-cleanup | P1 | TBD |
| REQ-09 | Auto-cleanup | P1 | TBD |
| REQ-10 | Auto-cleanup | P2 | TBD |
| REQ-11 | Auto-cleanup | P2 | TBD |
| REQ-12 | Hierarchical roadmap | P0 | TBD |
| REQ-13 | Hierarchical roadmap | P0 | TBD |
| REQ-14 | Hierarchical roadmap | P1 | TBD |
| REQ-15 | Hierarchical roadmap | P1 | TBD |
| REQ-16 | Hierarchical roadmap | P2 | TBD |
| REQ-17 | Hierarchical roadmap | P1 | TBD |

---

*Requirements defined: 2026-02-16*
