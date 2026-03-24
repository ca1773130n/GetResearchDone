# Requirements: v0.3.23 NERFIFY-Inspired Research Phase Enhancements

**Milestone:** v0.3.23
**Created:** 2026-03-24
**Source:** NERFIFY paper analysis + 4-backend discussion consensus

## CFG Formalization (Foundation)

### REQ-179: Plan Artifact Schema
**Priority:** P1 — High
**Category:** Core
**Description:** Create `lib/invariants.ts` with typed interfaces for plan artifacts: objective, files_modified, provides, requires, integration_points. Three validation classes: structural (fields exist, types match), semantic (objectives reference valid modules), cross-phase (no duplicate provides, requires satisfied).

### REQ-180: Pre-Flight Validation Gate
**Priority:** P1 — High
**Category:** Core
**Description:** Wire invariant validation into `grd-plan-checker` as a hard reject gate. Invalid plans don't proceed to execution. Validate research artifacts: LANDSCAPE.md must have comparison table, PAPERS.md must have structured entries, RESEARCH.md must have method/tradeoff sections.

### REQ-181: CFG Validation Tests
**Priority:** P1 — High
**Category:** Testing
**Description:** Unit tests for all three validation classes (structural, semantic, cross-phase). Test that malformed plans are rejected, valid plans pass, and edge cases (empty fields, missing sections) are handled. Coverage: 90%+ on lib/invariants.ts.

## Compositional Citation Recovery (Research Quality)

### REQ-182: Deep-Diver Structured Output
**Priority:** P1 — High
**Category:** Research
**Description:** Extend `grd-deep-diver` agent prompt to emit structured `missing_components` and `borrowed_components` fields in PAPERS.md output. Each component includes: name, source paper, description, whether it's available as code.

### REQ-183: Citation Graph Storage
**Priority:** P1 — High
**Category:** Research
**Description:** Store citation graphs as `.planning/research/citations/{paper-slug}.json` with nodes (papers) and edges (dependencies). Create `lib/citations.ts` with `buildCitationGraph()`, `resolveCitations()`, and `findUnresolved()` functions.

### REQ-184: Citation Recovery Pass
**Priority:** P1 — High
**Category:** Research
**Description:** Add citation-recovery pass in `grd-phase-researcher`: for each missing component from deep-diver output, fetch the referenced paper (arXiv API, Semantic Scholar API), extract the relevant technique, store in citation graph. Configurable gate to block planning if critical unresolved dependencies remain.

### REQ-185: Citation Recovery Tests
**Priority:** P1 — High
**Category:** Testing
**Description:** Unit tests for citation graph building, resolution, and unresolved detection. Mock API calls. Coverage: 85%+ on lib/citations.ts.

## Graph-of-Thought Topological Synthesis (Planning Quality)

### REQ-186: Artifact DAG Schema
**Priority:** P1 — High
**Category:** Planning
**Description:** Extend plan schema (from REQ-179) with `provides: string[]`, `requires: string[]`, `integration_points: string[]` per plan. Update `buildPlanPrompt()` to instruct planner to declare these fields.

### REQ-187: Artifact DAG Builder
**Priority:** P1 — High
**Category:** Planning
**Description:** Add `buildArtifactDAG(plans)` function in `lib/deps.ts` that constructs a directed graph from provides/requires declarations. Validate for cycles and missing dependencies. Return topologically sorted execution order.

### REQ-188: Wave Builder DAG Integration
**Priority:** P1 — High
**Category:** Scheduling
**Description:** Extend `buildWaves()` in `lib/parallel.ts` to consume the artifact DAG alongside existing `depends_on`. Plans whose requires aren't yet provided get sequenced after their providers. Inject resolved dependency context into executor prompts.

### REQ-189: GoT Synthesis Tests
**Priority:** P1 — High
**Category:** Testing
**Description:** Unit tests for artifact DAG construction, cycle detection, topological sorting, and wave builder integration. Coverage: 85%+ on new code in lib/deps.ts and lib/parallel.ts.

## Agentic Knowledge Enhancement (Compounding Returns)

### REQ-190: Knowledge Miner Agent
**Priority:** P2 — Medium
**Category:** Agents
**Description:** Create `agents/grd-knowledge-miner.md` agent definition. Post-phase mining step that analyzes phase output against recovered citations and existing codebase. Produces structured entries: pattern name, source, applicability conditions, code snippet.

### REQ-191: KNOWHOW.md Storage
**Priority:** P2 — Medium
**Category:** Infrastructure
**Description:** Store knowledge entries in `.planning/milestones/{milestone}/KNOWHOW.md`. Feed into planner and researcher context for subsequent phases. Add KNOWHOW.md reading to `grd-planner` and `grd-phase-researcher` agent prompts.

### REQ-192: Knowledge Mining Pipeline Integration
**Priority:** P2 — Medium
**Category:** Integration
**Description:** Add knowledge mining step to autopilot pipeline (after verify, before post-pipeline). Spawn grd-knowledge-miner agent with phase execution output and citation recovery results. Cross-reference generated code against recovered SoTA implementations.

### REQ-193: Knowledge Enhancement Tests
**Priority:** P2 — Medium
**Category:** Testing
**Description:** Unit tests for knowledge mining output parsing and KNOWHOW.md generation. Integration test validating the mining step runs in the autopilot pipeline.

## Traceability Matrix

| REQ | Phase | Status |
|-----|-------|--------|
| REQ-179 | Phase 92 | COMPLETE |
| REQ-180 | Phase 92 | COMPLETE |
| REQ-181 | Phase 92 | COMPLETE |
| REQ-182 | Phase 93 | PENDING |
| REQ-183 | Phase 93 | PENDING |
| REQ-184 | Phase 93 | PENDING |
| REQ-185 | Phase 93 | PENDING |
| REQ-186 | Phase 94 | PENDING |
| REQ-187 | Phase 94 | PENDING |
| REQ-188 | Phase 94 | PENDING |
| REQ-189 | Phase 94 | PENDING |
| REQ-190 | Phase 95 | PENDING |
| REQ-191 | Phase 95 | PENDING |
| REQ-192 | Phase 95 | PENDING |
| REQ-193 | Phase 95 | PENDING |
