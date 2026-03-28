# State

**Updated:** 2026-03-25

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-24)

**Core value:** Transforms ad-hoc AI-assisted development into structured, repeatable, research-driven engineering with paper-backed decisions and quantitative evaluation.
**Current focus:** v0.3.23 NERFIFY-Inspired Research Phase Enhancements
**Previous:** v0.3.22 Autopilot v2 (in progress — Phases 88-91 pending)

## Current Position

- **Active phase:** Phase 94 (Graph-of-Thought Synthesis) — complete
- **Current plan:** None
- **Milestone:** v0.3.23 NERFIFY-Inspired Research Phase Enhancements
- **Status:** Phase 94 complete — artifact DAG construction, wave builder integration, 118 tests passing
- **Progress:** [████████░░] 80%
- **Next:** Phase 95 (Agentic Knowledge Enhancement)

## Phase Summary

| Phase | Name | Status |
|-------|------|--------|
| 87 | Post-Phase Pipeline Core | Complete (2026-03-24) |
| 88 | Serial Merge Queue and Conflict Resolution | Complete (2026-03-28) |
| 89 | Write-Intent Manifests and Wave Builder | In progress |
| 90 | Autopilot Mode Changes and Parallel Execution | Not started |
| 91 | Integration Testing and Validation | In progress |
| 92 | CFG Formalization | Complete (2026-03-24) |
| 93 | Compositional Citation Recovery | In progress (plans 01-02 done) |
| 94 | Graph-of-Thought Synthesis | Complete (2026-03-25) |
| 95 | Agentic Knowledge Enhancement | Not started |
| 96 | Closed-Loop Metric-Driven Refinement | Complete (2026-03-25) |
| 97 | Transitive Citation Graph Traversal | Complete (2026-03-25) |
| 98 | GoT Synthesis Execution Engine | Not started |
| 99 | Knowledge Injection Loop | Complete (2026-03-25) |
| 100 | Evaluation Benchmark Framework | Not started |

## v0.3.23 Roadmap

| Phase | Goal | Requirements | Verification |
|-------|------|--------------|--------------|
| 92 — CFG Formalization | Typed invariant schema + pre-flight validation gate | REQ-179–181 | proxy |
| 93 — Compositional Citation Recovery | Deep-diver structured output, citation graph, recovery pass | REQ-182–185 | proxy |
| 94 — Graph-of-Thought Synthesis | Artifact DAG, wave builder DAG integration | REQ-186–189 | proxy |
| 95 — Agentic Knowledge Enhancement | Knowledge miner agent, KNOWHOW.md, pipeline integration | REQ-190–193 | proxy |
| 96 — Closed-Loop Metric-Driven Refinement | Critique agent, 3-branch refinement loop, convergence detection | TBD | proxy |
| 97 — Transitive Citation Graph Traversal | Recursive BFS citation traversal, auto-retrieval from external sources | TBD | proxy |
| 98 — GoT Synthesis Execution Engine | DAG builder, topological sort, interface-freeze, file-agent orchestration | TBD | proxy |
| 99 — Knowledge Injection Loop | Wire selectTopEntries into planner/researcher/executor prompts | TBD | proxy |
| 100 — Evaluation Benchmark Framework | Benchmark corpus, semantic scoring, trainability metrics, category taxonomy | TBD | proxy |

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
| DEFER-96-01 | End-to-end refinement loop effectiveness on real project | Phase 96 | First live autopilot run | PENDING |
| DEFER-96-02 | collectMetrics parse robustness on real tool output | Phase 96 | First live autopilot run | PENDING |
| DEFER-96-03 | Critique agent patch quality for all three branches | Phase 96 | Manual review | PENDING |
| DEFER-88-01 | Real parallel merge serialization verified | Phase 88 | Phase 90 or first multi-phase autopilot | PENDING |
| DEFER-88-02 | Real conflict resolution subprocess prompt effectiveness | Phase 88 | First real merge conflict | PENDING |

## Performance Metrics

**Cumulative:**
- Milestones shipped: 28 (v0.0.5 through v0.3.21)
- Total tests: 3,830 (after Phase 96)
- Total lib/ modules: 28 (23 top-level .ts + 5 sub-module directories)
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
- [Phase 93]: resolveCitations uses injectable fetchFn for test mocking; arXiv first, Semantic Scholar fallback
- [Phase 93]: citation_gate config key added to KNOWN_CONFIG_KEYS and GrdConfig — gates.ts uses typed field directly
- [Phase 93]: CitationEdge schema: from_slug/to_slug/type ('missing'|'borrowed')/component_name
- [Phase 93]: CitationNode includes missing_components[] and borrowed_components[] arrays; priority includes 'low' tier
- [Phase 94]: buildArtifactDAG lives in lib/deps.ts; plan_id format is {phase}-{plan_number} zero-padded; cycle detection collects all distinct cycles; integration edges are soft (only when provider exists)
- [Phase 96]: refinement_loop config flag defaults to false (opt-in); runRefinementLoop placed after knowledge mining, before post-pipeline
- [Phase 96]: classifyBranch tie-break order: macro > geometry > generative; normalized gaps for heterogeneous metric comparison
- [Phase 96]: grd-critique-agent effort: low, maxTurns: 20; max 5 files per iteration; never lower coverage thresholds
- [Phase 97]: traverseCitationGraph seeds BFS from nodes with no incoming edges; falls back to all nodes for pure-cycle graphs
- [Phase 97]: resolveTransitiveDeps deduplicates edges by (from_slug, to_slug, component_name) triple; returns new CitationGraph (immutable)
- [Phase 97]: fetchExternalPaper uses injectable fetchFn pattern — timeoutMs hardcoded to 5000, no ApiConfig argument
- [Phase 97]: checkTransitiveCitationGate produces warning (not error) severity violations — transitive dependencies are informational, non-blocking
- [Phase 97]: Step 8 numbering: sub-steps 3/3b inserted for traverseCitationGraph + fetchExternalPaper before critical-fetch loop; transitive_citation_gate_enabled uses double-bang cast on config for zero-error strict-mode compatibility
- [Phase 98]: ArtifactDAGNode plan_id format is {phase}-{plan_number} zero-padded; buildArtifactDAG reuses Kahn's algorithm from computeParallelGroups; missing providers return strict error DAG
- [Phase 99]: _phaseNum parameter underscore-prefixed — reserved for future phase-proximity scoring; avoids ESLint no-unused-vars
- [Phase 99]: buildKnowledgeInjectionBlock wraps top-5 KNOWHOW.md entries in <knowhow_context> XML tags for structured prompt injection
- [Phase 99-knowledge-injection-loop]: extractModuleHints strips all extensions from basename; phase-proximity is tertiary tiebreaker; buildKnowledgeInjectionBlock auto-derives hints via extractModuleHints when caller omits moduleHints
- [Phase 99]: cwd parameter is optional in buildPlanPrompt/buildExecutePrompt for backward compatibility with external callers and dry-run
- [Phase 99]: Execute worktree call sites pass wtPath (not cwd) to buildExecutePrompt — executor agents read KNOWHOW.md relative to their worktree execution context
- [Phase 100]: Benchmark type system defined in lib/types.ts alongside existing GRD types — single source of truth
- [Phase 100]: scoreComposite: semantic_weight=0.6 (fidelity priority), trainability weights build=0.4/runtime=0.3/convergence=0.3; out-of-scope adjustment=0.5 (heaviest NERFIFY-BENCH penalty)
- [Phase 100]: evaluateEntry uses entry.category as-is rather than calling classifyEntry — category field is the caller's assigned value; classifyEntry is a separate classification helper
- [Phase 100]: classifyEntry uses case-insensitive tag matching with priority: out-of-scope > requires-external-models > novelty-coverage > directly-integrable (adapted from NERFIFY-BENCH Figure 7)
- [Phase 100]: grd-eval-planner and grd-eval-reporter augmented with benchmark corpus integration sections referencing lib/benchmark.ts (loadCorpus, evaluateEntry, formatBenchmarkReport, classifyEntry, IntegrationCategory taxonomy)
- [Phase 94]: buildArtifactDAG lives in lib/deps.ts; plan_id format {phase}-{plan_number} zero-padded; cycle detection collects all distinct cycles; integration edges are soft (only when provider exists)
- [Phase 94]: buildWaves merges depends_on and artifactDAG.providers into combined inDegree map before Kahn's — unified cycle detection and backward compatible
- [Phase 94]: buildPlanPrompt instructs planner to declare provides/requires/integration_points in PLAN.md YAML frontmatter using module:ExportName format
- [Phase 94]: Phase 94-03: Tests cover all 15 buildArtifactDAG and validateArtifactDAG scenarios plus 9 buildWaves scenarios; 88%+ branch coverage on lib/deps.ts and 87%+ on lib/parallel.ts

## Known Bugs

None.

## Blockers

None.

## Session Continuity

- **Last action:** Phase 99 complete — knowledge injection loop closed
- **Stopped at:** Completed 94-03-PLAN.md
- **Next action:** Plan Phase 100 (Evaluation Benchmark Framework)
- **Context needed:** .planning/STATE.md, .planning/ROADMAP.md

---

*State managed by: Claude (grd-roadmapper)*
*Last updated: 2026-03-25*
