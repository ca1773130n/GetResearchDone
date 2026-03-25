# State

**Updated:** 2026-03-25

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-24)

**Core value:** Transforms ad-hoc AI-assisted development into structured, repeatable, research-driven engineering with paper-backed decisions and quantitative evaluation.
**Current focus:** v0.3.23 NERFIFY-Inspired Research Phase Enhancements
**Previous:** v0.3.22 Autopilot v2 (in progress — Phases 88-91 pending)

## Current Position

- **Active phase:** Phase 95 (Agentic Knowledge Enhancement) — plan 02 complete
- **Current plan:** Plan 02 complete
- **Milestone:** v0.3.23 NERFIFY-Inspired Research Phase Enhancements
- **Status:** Phase 95 plans 01-02 executed — knowledge miner agent + KNOWHOW.md injection in planner/researcher
- **Progress:** [████████░░] 75%
- **Next:** Execute Phase 95 plan 03 if exists, or milestone complete (`gd execute-phase 95`)

## Phase Summary

| Phase | Name | Status |
|-------|------|--------|
| 87 | Post-Phase Pipeline Core | Complete (2026-03-24) |
| 88 | Serial Merge Queue and Conflict Resolution | In progress |
| 89 | Write-Intent Manifests and Wave Builder | In progress |
| 90 | Autopilot Mode Changes and Parallel Execution | Not started |
| 91 | Integration Testing and Validation | In progress |
| 92 | CFG Formalization | Complete (2026-03-24) |
| 93 | Compositional Citation Recovery | In progress (plans 01-02 done) |
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
- [Phase 92]: Tests use inline tmpDir for validateResearchArtifacts, not createFixtureDir — no .planning/ structure needed for research artifact validation
- [Phase 93-compositional-citation-recovery]: CitationNode priority escalation: code_available=false on MissingComponent sets dep node to priority='critical'
- [Phase 93]: deep-diver emits Missing Components and Borrowed Components tables in PAPERS.md output
- [Phase 93]: phase-researcher runs citation recovery pass (buildCitationGraph + findUnresolved) after research protocol
- [Phase 95]: knowhow_injection blocks added to grd-planner and grd-phase-researcher — both conditionally inject top-5 KNOWHOW.md entries before plan/research generation
- [Phase 95-agentic-knowledge-enhancement]: formatKnowhowEntry uses dash-list bold-key format for lossless parse-format roundtrip
- [Phase 95-agentic-knowledge-enhancement]: appendKnowhowEntries deduplicates by phase_number (keep higher) for stable knowledge evolution
- [Phase 95]: appendKnowhowEntries not imported in autopilot.ts — miner agent handles writing; avoids lint violation
- [Phase 93-compositional-citation-recovery]: CitationEdge schema: from_slug/to_slug/type ('missing'|'borrowed')/component_name — plan-specified schema over earlier from/to/relation
- [Phase 93-compositional-citation-recovery]: CitationNode includes missing_components[] and borrowed_components[] arrays; priority includes 'low' tier

## Known Bugs

None.

## Blockers

None.

## Session Continuity

- **Last action:** Phase 93 plan 02 executed — grd-deep-diver structured component output + grd-phase-researcher citation recovery pass
- **Stopped at:** Completed 93-01-PLAN.md
- **Next action:** Execute Phase 93 plan 03 if exists, or advance to Phase 94 (`gd execute-phase 93`)
- **Context needed:** .planning/STATE.md, agents/grd-deep-diver.md, agents/grd-phase-researcher.md

---

*State managed by: Claude (grd-roadmapper)*
*Last updated: 2026-03-24*
