# State

**Updated:** 2026-07-12

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-12)

**Core value:** Transforms ad-hoc AI-assisted development into structured, repeatable, research-driven engineering with paper-backed decisions and quantitative evaluation.
**Current focus:** v0.5.0 Interactive Research Steering (Human-in-the-Loop)
**Previous:** v0.4.16 Competitive Adoption (shipped 2026-07-11)

## Current Position

- **Active phase:** 105 AI-Panel Fallback + Hardening
- **Milestone:** v0.5.0 Interactive Research Steering
- **Status:** Plan 105-04 complete — live sandbox validation (105-04-VALIDATION.md) exercised the full checkpoint machinery against a real Claude backend in throwaway mktemp -d sandboxes (repo never polluted). All 5 v0.5.0 deferred live validations RESOLVED: DEFER-104-01/02 (3 distinct falsifiable candidates + coherent selection UX), DEFER-102-01 (live SEED clarify answered+resumed), DEFER-101-02 FULLY RESOLVED (degrade-safe non-pausing defaults AND literal answeredBy:'panel' via real opencode+codex panel through production answerViaDiscussion), DEFER-101-03 (offline R1-R5 from 105-03). Two non-blocking lib/discussion.ts hardening follow-ups logged.
- **Next:** Phase 105 verification/completion → v0.5.0 milestone wrap

## Phase Summary

| Phase | Name | Status |
|-------|------|--------|
| 87 | Post-Phase Pipeline Core | Complete (2026-03-24) |
| 88 | Serial Merge Queue and Conflict Resolution | Complete (2026-03-28) |
| 89 | Write-Intent Manifests and Wave Builder | Complete (2026-03-28) |
| 90 | Autopilot Mode Changes and Parallel Execution | Complete (2026-03-28) |
| 91 | Integration Testing and Validation | Complete (2026-03-29) |
| 92 | CFG Formalization | Complete (2026-03-24) |
| 93 | Compositional Citation Recovery | In progress (plans 01-02 done) |
| 94 | Graph-of-Thought Synthesis | Complete (2026-03-25) |
| 95 | Agentic Knowledge Enhancement | Not started |
| 96 | Closed-Loop Metric-Driven Refinement | Complete (2026-03-25) |
| 97 | Transitive Citation Graph Traversal | Complete (2026-03-25) |
| 98 | GoT Synthesis Execution Engine | Complete (2026-03-28) |
| 99 | Knowledge Injection Loop | Complete (2026-03-25) |
| 100 | Evaluation Benchmark Framework | Not started |
| 101 | Checkpoint Core Plumbing + Config | Complete (2026-07-12) |
| 102 | DESIGN Approval + Skill Checkpoint Loop | Complete (2026-07-15) |
| 103 | SEED Interview + DECIDE Branch | Complete (2026-07-15) |
| 104 | HYPOTHESIZE Candidate Selection | In progress (plans 01-02 done) |
| 105 | AI-Panel Fallback + Hardening | In progress (plans 01-04 done) |

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

## v0.5.0 Roadmap

| Phase | Goal | Requirements | Verification |
|-------|------|--------------|--------------|
| 101 — Checkpoint Core Plumbing + Config | Checkpoint schema/types, checkpoints.ts, interactive config, default-off gate safety, resume-with-answers plumbing | REQ-194–198 | sanity |
| 102 — DESIGN Approval + Skill Checkpoint Loop | Combined GATE-1 approval checkpoint + skill-layer AskUserQuestion loop + status rendering | REQ-199–201 | proxy |
| 103 — SEED Interview + DECIDE Branch | Socratic pre-loop interview + orchestrator clarify checkpoint + DECIDE continue/pivot/stop/adjust-budget | REQ-202–204 | proxy |
| 104 — HYPOTHESIZE Candidate Selection | Multi-candidate hypothesis generation + pre-ledger selection checkpoint | REQ-205–206 | proxy |
| 105 — AI-Panel Fallback + Hardening | answerViaDiscussion panel fallback + telemetry/docs + milestone verification suite (R1/R3/R4/R5) | REQ-207–209 | deferred→full (Integration) |

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
| DEFER-88-01 | Real parallel merge serialization verified | Phase 88 | Phase 90 or first multi-phase autopilot | PENDING |
| DEFER-88-02 | Real conflict resolution subprocess prompt effectiveness | Phase 88 | First real merge conflict | PENDING |
| DEFER-96-01 | End-to-end refinement loop effectiveness on real project | Phase 96 | First live autopilot run | PENDING |
| DEFER-96-02 | collectMetrics parse robustness on real tool output | Phase 96 | First live autopilot run | PENDING |
| DEFER-96-03 | Critique agent patch quality for all three branches | Phase 96 | Manual review | PENDING |
| DEFER-102-01 | Live SEED/AskUserQuestion clarify UX | Phase 102/103 | Phase 105, plan 105-04 | RESOLVED (105-04: live SEED clarify, answered via --answers, resumed no double-ask) |
| DEFER-104-01 | Live N-candidate generation quality | Phase 104 | Phase 105, plan 105-04 | RESOLVED (105-04: 3 distinct falsifiable candidates) |
| DEFER-104-02 | Live human candidate selection UX | Phase 104 | Phase 105, plan 105-04 | RESOLVED (105-04: coherent selection prompt) |
| DEFER-101-02 | fallback:'panel' unattended answering | Phase 101/105 | Phase 105, plan 105-04 | FULLY RESOLVED (105-04: degrade-safe non-pausing defaults AND literal answeredBy:'panel' via real opencode+codex panel) |
| DEFER-101-03 | Full R1–R5 milestone suite | Phase 101/102/103 | Phase 105, plan 105-03 | RESOLVED (offline suite, REQ-209, 652 tests green) |

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
- [Phase 90]: atomicWriteFileSync is internal (not exported); lock mechanism preserved alongside atomic write
- [Phase 90]: mcp-server grd_autopilot_run uses phase_from/phase_to params; resume param removed (auto-resume always on); integration tests updated to --phase-from/--phase-to flags
- [Phase 90]: SC3 and SC5 tests were already present from phases 89/88 — integration test fixtures updated to pass invariant-validation gate
- [Phase 91]: E2E test uses composition (createMergeQueue + async tasks) rather than full runAutopilot — avoids uninterceptable destructured execFileSync
- [Phase 98]: GoT execution interfaces placed after ArtifactDAGValidation in lib/types.ts; lib/got.js follows CJS proxy pattern
- [Phase 98]: executeArtifactDAG defaults to dryRun:true — agent dispatch deferred to integration phase
- [Phase 98]: buildWavesFromPlans falls back to buildWaves baseline on cycle detection — non-blocking warning to stderr
- [Phase 98]: got.ts branch coverage: cycle path covered via synthetic cyclic DAG; non-dryRun path covered with dryRun:false test
- [Phase 101]: Checkpoint types co-located in lib/research/types.ts (not lib/types.ts) — ResearchThread.pendingCheckpoint references Checkpoint
- [Phase 101]: ResearchThread checkpoint fields are all OPTIONAL; pendingGate union + ThreadStatus untouched to preserve TERMINAL mirrors (portfolio.ts/paper.ts)
- [Phase 101]: 0.4.16 back-compat fixtures hand-authored (fallback), cross-checked vs git 3c179fe; byte-identical JSON.stringify round-trip is the R3 proof
- [Phase 101-03]: resolveGates(noGates) derives all-false from Object.keys(defaultGates()) — R1: no future gate can silently default-on for unattended callers
- [Phase 101-03]: YOLO round-trip (yoloEnable/yoloDisable in config.ts) spreads raw research_gates into _saved_* verbatim so nested interactive key survives (R7)
- [Phase 101-02]: checkpoints.ts standalone — ZERO orchestrator.ts import (R1 lock); DI seam (checkpointHandler/saveThread/incrementCounter) mirrors spawn/runner
- [Phase 101-02]: resolveInteractive reads GRD_AUTOPILOT via opts.env ?? process.env; consumeAnswered one-shot via module-level WeakSet (no Checkpoint field pollution)
- [Phase 101-04]: resumeResearch resume-with-answers branch runs BEFORE pendingGate handling — checkpoint resolution independent of the execute/kg_write gates; --no-gates forces recommended defaults, human answers require the gate ON
- [Phase 101-04]: runLoop resumedCheckpoint param is underscore-prefixed + DORMANT (no emission this phase — locked); consumeAnswered wiring lands in Phase 102
- [Phase 101-04]: --answers <file|-> reads JSON from a FILE or stdin only (never argv, R8); malformed/missing → bare-resume recommended defaults (deterministic timeout, no wall-clock timer)
- [Phase 101-04]: caller-audit strips comment-only lines so paper.ts's mention is not miscounted; exactly 5 unattended call sites {bench,cli-kb,cli,index,portfolio}
- [Phase 102]: 102-02: skill Interactive steering protocol thin (parse JSON, AskUserQuestion, Write answers file, resume --answers); status human path renders pendingCheckpoint via renderCheckpointQuestions while --json contract stays unchanged
- [Phase 102-design-approval-skill-checkpoint-loop]: [Phase 102-01]: DESIGN checkpoint consume hoisted to loop-top (parallel to execute reuse fast-path), never at GATE-1 — fixes the re-derive blocker since approved.execute is false on checkpoint resume (REQ-199)
- [Phase 102-design-approval-skill-checkpoint-loop]: [Phase 102-01]: Contract edits from the design checkpoint apply to plan.json BEFORE the debug-loop committed snapshot, so the debug pin freezes the user-edited contract, not the model's original (R4)
- [Phase 103-02]: SEED clarify station COPIES the Phase 102 DESIGN emit/consume pattern (resolveSeedPosture/buildSeedCheckpoint/consumeAnswered); refinedQuestion===undefined is the once-per-thread marker, set to thread.question verbatim on the zero-dimension path
- [Phase 103-02]: parseClarifyOutput never returns null (always {dimensions:[]}) so a null spawnAndParse value = hard spawn failure → degrade to zero dimensions; thread.question NEVER mutated (seeds threadId), HYPOTHESIZE grounds on effectiveQuestion = refinedQuestion ?? question
- [Phase 103-01]: SEED interview is skill-layer-only markdown in commands/research.md — NO CLI flag, NO orchestrator/TS change; original question preserved by echoing (Original->Refined), not a new arg (REQ-202)
- [Phase 103-01]: Pre-loop SEED interview is cross-referenced with but kept DISTINCT from the in-loop Interactive steering checkpoint protocol; skip matrix = resume/status/deep-research/--no-gates/non-interactive
- [Phase 103-03]: DECIDE checkpoint fires only in the would-continue else branch; terminal verdicts never delayed; loop-top consume short-circuits (continue/pivot/adjust-budget advance, stop finalizes exhausted from persisted result.json); DECIDE_BUDGET_BUMP=2; verdict math untouched
- [Phase 104]: [Phase 104-01]: parseHypothesesOutput degrade-safe (empty array on junk, never null/throws), cap default 5; single-block buildHypothesizePrompt/parseHypothesisOutput left byte-identical (PIN tests) as the N=1 path; buildHypothesesPrompt inline-duplicates the grounding preamble
- [Phase 104-02]: selection checkpoint persists the full candidate set in the checkpoint `context` (JSON), never the ledger — only the chosen candidate is appended on resume (zero pollution, REQ-206/SC2)
- [Phase 104-02]: emit lives in the cold-HYPOTHESIZE else-branch, consume at the TOP of that same branch (not loop-top like DECIDE) — a selection resume never appended a hypothesis so `resumable` is undefined and the if/else lands in the cold else; 0 candidates degrade to the byte-identical single-block path, 1 appends directly (no 1-option pause)
- [Phase 105]: [Phase 105-01]: answerViaDiscussion is pure/standalone (no orchestrator import); panel resolver seam accepts string OR {text,discussionFile} so production default omits discussionFile while tests inject it — discussion.ts unchanged; rate-limit guard via detectFromStdout + empty-synthesis are the two unavailability signals resolving to recommended defaults
- [Phase 105]: [Phase 105-02]: fallback:'panel' emit sites resolve inline then `continue` with an injected resolved checkpoint — the existing top-of-loop consume machinery applies the answer (panel/human/recommended share one path); engagedPanel gates on unattended AND fallback==='panel'; portfolio threads concurrency so concurrency>1 is non-human (R1) yet still panel-routable
- [Phase 105]: [Phase 105-03]: R1/R3/R4/R5 milestone suite proves the SEAMS offline via injected checkpointHandler/spawn/runner — R1 asserts the 5-site posture lock (resolveInteractive → active:false, incl. fallback:'panel' inline), R3 asserts loadThread bit-identical round-trip + terminal resume no-checkpoints, R4/R5 reuse the Phase 102 DESIGN end-to-end drive; coverage guard is an in-suite baseline snapshot (checkpoints/portfolio/discussion) asserted >= with git diff as evidence — no jest threshold lowered
- [Phase 105]: R1/R3/R4/R5 milestone suite proves seams offline via injected checkpointHandler/spawn; coverage guard snapshots checkpoints/portfolio/discussion thresholds >= baseline (no jest threshold lowered)
- [Phase 105]: 105-04: live sandbox validation resolved all 5 v0.5.0 deferred live validations (DEFER-104-01/02, 102-01, 101-02, 101-03); observed literal answeredBy:'panel' via real opencode+codex panel through production answerViaDiscussion

## Known Bugs

None.

## Blockers

None.

## Session Continuity

- **Last action:** Phase 105 Plan 04 complete — live sandbox validation (105-04-VALIDATION.md + SUMMARY.md); all 5 v0.5.0 deferred live validations RESOLVED (incl. literal answeredBy:'panel' observed via real multi-backend panel); repo confirmed clean after sandbox runs
- **Stopped at:** Completed 105-04-PLAN.md (Task 2 human-verify checkpoint approved)
- **Next action:** Phase 105 verification/completion → v0.5.0 milestone wrap
- **Context needed:** .planning/STATE.md, .planning/ROADMAP.md, 105-04-VALIDATION.md
- **Hardening backlog (non-blocking, lib/discussion.ts):** (1) resolveElicitation ignores its `question` arg (forwards only ck.context) so vanilla panel checkpoints don't surface options → panel-answers don't fire naturally; (2) codex/gemini return empty inside runDiscussion despite codex authenticating standalone

---

*State managed by: Claude (grd-roadmapper)*
*Last updated: 2026-03-25*
