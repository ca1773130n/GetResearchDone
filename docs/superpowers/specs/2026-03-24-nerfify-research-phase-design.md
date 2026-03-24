# NERFIFY-Inspired Research Phase Enhancements

## Summary

Adapt 4 key innovations from the NERFIFY paper (multi-agent paper-to-code framework) into GRD's research and execution phases: CFG formalization for plan/artifact validation, compositional citation recovery for deep research, Graph-of-Thought topological synthesis for planning, and agentic knowledge enhancement for compounding improvements.

## Background

NERFIFY converts NeRF research papers into executable code through a 4-stage pipeline with 6 innovations. The most transferable ideas for GRD are domain-specific constraint validation (CFG), citation graph traversal (compositional recovery), dependency-aware code generation (GoT synthesis), and mining existing implementations for optimizations (knowledge enhancement).

Multi-backend discussion (Claude, Codex, Gemini, OpenCode) reached consensus on adapting these 4 innovations. Full transcript at `.planning/milestones/v0.3.22/discussions/discussion-unknown-discussion-1774356261750.md`.

## Feature 1: CFG Formalization (Foundation)

### What
Typed schemas and structural validators for GRD planning/research artifacts. Pre-flight validation in gates — reject malformed plans before they execute, not just verify after.

### How
- Create `lib/invariants.ts` with typed interfaces for plan artifacts (objective, files_modified, provides/requires, integration_points)
- Three validation classes (per OpenCode): structural (fields exist, types match), semantic (objectives reference valid modules, file paths exist), cross-phase (no duplicate provides, requires are satisfied)
- Wire into `grd-plan-checker` as a hard reject gate — invalid plans don't proceed to execution
- Validate research artifacts: LANDSCAPE.md must have comparison table, PAPERS.md must have structured entries, RESEARCH.md must have method/tradeoff sections

### Files
- New: `lib/invariants.ts` (~200 lines)
- Modify: `lib/gates.ts` (add invariant validation gate)
- Modify: `agents/grd-plan-checker.md` (reference invariant schemas)
- New: `tests/unit/invariants.test.ts`

## Feature 2: Compositional Citation Recovery (Research Quality)

### What
When analyzing a paper, automatically traverse its citation graph to find and recover missing components (algorithms, architectures, techniques) from referenced papers. Store a structured citation graph for downstream use.

### How
- Extend `grd-deep-diver` agent prompt to emit structured `missing_components` and `borrowed_components` fields in PAPERS.md output
- Add citation-recovery pass in `grd-phase-researcher`: for each missing component, fetch the referenced paper (arXiv, Semantic Scholar API), extract the relevant technique, and store it
- Store citation graph as `.planning/research/citations/{paper-slug}.json` with edges to dependencies
- Add `resolveCitations(papersDir)` function in `lib/research.ts` (or new `lib/citations.ts`) that walks the graph and flags unresolved dependencies
- Block planning if critical unresolved dependencies remain (configurable gate)

### Files
- New: `lib/citations.ts` (~150 lines)
- Modify: `agents/grd-deep-diver.md` (structured output for missing components)
- Modify: `agents/grd-phase-researcher.md` (citation recovery pass)
- New: `tests/unit/citations.test.ts`

## Feature 3: Graph-of-Thought Topological Synthesis (Planning Quality)

### What
Plans declare an artifact dependency DAG (`provides`/`requires`/`integration_points`) before writing implementation tasks. The planner builds the DAG first, validates it for cycles and missing dependencies, then generates tasks in topological order.

### How
- Extend plan schema (from Feature 1) with `provides: string[]`, `requires: string[]`, `integration_points: string[]` per plan
- Update `buildPlanPrompt()` to instruct planner to declare these fields
- Add `buildArtifactDAG(plans)` function in `lib/deps.ts` that constructs a directed graph from provides/requires
- Existing `buildWaves()` in `lib/parallel.ts` already does topological execution ordering — extend it to consume the artifact DAG alongside `depends_on`
- Inject resolved dependency context into executor prompts: when a plan requires something another plan provides, include the provider's output summary in the executor's context

### Files
- Modify: `lib/deps.ts` (add `buildArtifactDAG`)
- Modify: `lib/parallel.ts` (extend `buildWaves` to use artifact DAG)
- Modify: `lib/autopilot.ts` (inject resolved dependency context into executor prompts)
- New: `tests/unit/artifact-dag.test.ts`

## Feature 4: Agentic Knowledge Enhancement (Compounding Returns)

### What
Post-phase mining step that discovers optimizations, patterns, and lessons from executed code and recovered SoTA implementations. Produces structured `KNOWHOW.md` entries that feed back into planner and researcher for subsequent phases.

### How
- Add post-phase step in autopilot pipeline (after verify, before post-pipeline): spawn agent to analyze phase output against recovered citations and existing codebase
- Agent produces `KNOWHOW.md` entries with: pattern name, source (paper/codebase/execution), applicability conditions, code snippet
- Store in `.planning/milestones/{milestone}/KNOWHOW.md`
- Feed KNOWHOW.md into planner and researcher context for subsequent phases
- Cross-reference generated code against recovered SoTA implementations from citation recovery

### Files
- New: `agents/grd-knowledge-miner.md` (~50 lines)
- Modify: `lib/autopilot.ts` (add knowledge mining step to pipeline)
- Modify: agents that consume context (grd-planner, grd-phase-researcher) to read KNOWHOW.md
- New: `tests/unit/knowledge.test.ts`

## Implementation Order

1. **CFG Formalization** — foundation for all other features (validates plan structure)
2. **Citation Recovery** — requires CFG for structured output validation
3. **GoT Synthesis** — requires CFG for artifact DAG schema, benefits from citation recovery context
4. **Knowledge Enhancement** — requires all three above to produce meaningful entries

## Deferred

- **Closed-loop verification refinement** — layer on after CFG formalization is stable. Claude's `refinement_budget` concept is good but needs the invariant infrastructure first.
- **Benchmark framework** (NERFIFY-BENCH equivalent) — useful but not immediately actionable for GRD's workflow.
