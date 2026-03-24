# State

**Updated:** 2026-03-24

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-24)

**Core value:** Transforms ad-hoc AI-assisted development into structured, repeatable, research-driven engineering with paper-backed decisions and quantitative evaluation.
**Current focus:** v0.3.23 NERFIFY-Inspired Research Phase Enhancements
**Previous:** v0.3.22 Autopilot v2 (in progress — Phases 88-91 pending)

## Current Position

- **Active phase:** Phase 92 (CFG Formalization) — in progress
- **Current plan:** 92-01 complete
- **Milestone:** v0.3.23 NERFIFY-Inspired Research Phase Enhancements
- **Status:** Plan 92-01 executed — lib/invariants.ts created, types added
- **Progress:** [█░░░░░░░░░] 10%
- **Next:** Continue Phase 92 remaining plans (if any), then Phase 93

## Phase Summary

| Phase | Name | Status |
|-------|------|--------|
| 87 | Post-Phase Pipeline Core | Complete (2026-03-24) |
| 88 | Serial Merge Queue and Conflict Resolution | In progress |
| 89 | Write-Intent Manifests and Wave Builder | In progress |
| 90 | Autopilot Mode Changes and Parallel Execution | Not started |
| 91 | Integration Testing and Validation | In progress |
| 92 | CFG Formalization | Not started |
| 93 | Compositional Citation Recovery | Not started |
| 94 | Graph-of-Thought Synthesis | Not started |
| 95 | Agentic Knowledge Enhancement | Not started |

## v0.3.23 Roadmap

| Phase | Goal | Requirements | Verification |
|-------|------|--------------|--------------|
| 92 — CFG Formalization | Typed invariant schema + pre-flight validation gate | REQ-179–181 | proxy |
| 93 — Compositional Citation Recovery | Deep-diver structured output, citation graph, recovery pass | REQ-182–185 | proxy |
| 94 — Graph-of-Thought Synthesis | Artifact DAG, wave builder DAG integration | REQ-186–189 | proxy |
| 95 — Agentic Knowledge Enhancement | Knowledge miner agent, KNOWHOW.md, pipeline integration | REQ-190–193 | proxy |

## Deferred Validations

| ID | Description | From Phase | Validates At | Status |
|----|-------------|-----------|-------------|--------|
| DEFER-08-01 | User acceptance testing of TUI dashboard commands | Phase 8 | post-v1.0 | PENDING |
| DEFER-30-01 | Full parallel execution with real teammate spawning on Claude Code | Phase 30 | Future | PARTIALLY RESOLVED |
| DEFER-43-01 | Live code-reviewer does not block on missing VERIFICATION.md | Phase 43 | Live run | PENDING |
| DEFER-43-02 | detectWebMcp() returns available:true with real MCP env | Phase 43 | Live MCP env | PENDING |
| DEFER-44-01 | execute-phase WebMCP health checks fire correctly at runtime | Phase 44 | Live MCP env | PENDING |
| DEFER-44-02 | grd-verifier populates VERIFICATION.md WebMCP section | Phase 44 | Live MCP env | PENDING |
| DEFER-44-03 | grd-eval-planner generates useWebMcpTool() for frontend phases | Phase 44 | Live MCP env | PENDING |
| DEFER-54-01 | Markdown splitting produces correct partials for real-world large files | Phase 54 | Future | CANNOT VALIDATE |
| DEFER-56-01 | Full evolve loop with sonnet-tier models produces meaningful improvements | Phase 56 | Future | PARTIALLY RESOLVED |
| DEFER-68-01 | Real Claude subprocess produces product-level feature ideas | Phase 68 | Next real grd:evolve run | PENDING |
| DEFER-68-02 | Autoplan creates feature-oriented phases from product-ideation groups | Phase 68 | First real infinite evolve cycle | PENDING |
| DEFER-78-01 | Live discovery accuracy on real GRD codebase | Phase 78 | Phase 79, plan 79-01 | PENDING |
| DEFER-78-02 | Scenario executability by Phase 79 HTTP/CLI engine | Phase 78 | Phase 79, plan 79-02 | PENDING |
| DEFER-80-01 | Live Playwright MCP scenario execution (requires Playwright MCP environment) | Phase 80 | Future | PENDING |

## Performance Metrics

**Cumulative:**
- Milestones shipped: 28 (v0.0.5 through v0.3.21)
- Total tests: 3,672 (after Phase 91 plan 01)
- Total lib/ modules: 27 (22 top-level .ts + 5 sub-module directories)
- Total commands: 41
- MCP tools: 132

## Decisions

- [Phase 88]: Promise-chain tail pattern for MergeQueue — zero external dependencies, FIFO arrival-order guaranteed
- [Phase 89]: parseWriteIntent is a pure function on raw frontmatter content; splitWave uses greedy first-fit
- [Phase 90]: atomicWriteFileSync is internal (not exported); lock mechanism preserved alongside atomic write
- [Phase 91]: parseWriteIntent does not strip YAML quotes from dash-list values; jest.spyOn cannot intercept execFileSync from modules that destructure at load time
- [Design spec v0.3.23]: CFG formalization is prerequisite — validates plan structure before citation recovery and GoT synthesis depend on it
- [Design spec v0.3.23]: Citation recovery gates planning when critical unresolved dependencies remain (configurable)
- [Design spec v0.3.23]: buildArtifactDAG lives in lib/deps.ts alongside existing Kahn's algorithm; buildWaves extended (not replaced) in lib/parallel.ts
- [Design spec v0.3.23]: Knowledge miner step is backward-compatible — skipped gracefully if agent definition file absent
- [Phase 92-cfg-formalization]: validateResearchArtifacts uses phaseDir as its own search root; validateSemantic checks parent dir existence; extractPlanArtifact coerces string wave/plan to number
- [Phase 92]: checkInvariantValidation runs per-plan validateStructural then cross-phase validateCrossPhase; invariant-validation gate registered in GATE_REGISTRY for plan-phase and execute-phase

## Known Bugs

None.

## Blockers

None. v0.3.22 Phases 88-91 must complete before Phase 92 can begin.

## Session Continuity

- **Last action:** v0.3.23 roadmap created (Phases 92-95, 15 requirements mapped)
- **Stopped at:** Completed 92-02-PLAN.md
- **Next action:** Complete v0.3.22 (Phases 88-91), then plan Phase 92
- **Context needed:** .planning/STATE.md, .planning/ROADMAP.md, .planning/REQUIREMENTS.md

---

*State managed by: Claude (grd-roadmapper)*
*Last updated: 2026-03-24*
