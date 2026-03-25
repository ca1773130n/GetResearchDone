---
phase: 94-graph-of-thought-synthesis
plan: "02"
subsystem: parallel-execution
tags: [wave-builder, artifact-dag, autopilot, dependency-scheduling]
dependency_graph:
  requires: ["94-01"]
  provides: ["lib/parallel.ts:buildWaves", "lib/autopilot.ts:buildPlanPrompt-artifact-fields"]
  affects: ["lib/parallel.ts", "lib/autopilot.ts"]
tech_stack:
  added: []
  patterns: ["Kahn's level-based topological sort", "combined dependency merge"]
key_files:
  created: []
  modified:
    - lib/parallel.ts
    - lib/autopilot.ts
decisions:
  - "buildWaves merges depends_on and artifactDAG.providers into a single inDegree map before Kahn's — avoids double-pass and keeps cycle detection unified"
  - "planIdOf helper uses same {phase}-{zero-padded-plan} format as buildArtifactDAG for cross-module consistency"
  - "Cycle warning written to stderr (not thrown) — allows caller to continue with degraded wave assignment rather than hard failure"
metrics:
  duration_seconds: 141
  completed: "2026-03-25"
  tasks_completed: 2
  files_modified: 2
---

# Phase 94 Plan 02: Wave Builder DAG Integration Summary

**One-liner:** `buildWaves` in lib/parallel.ts merges `depends_on` and artifact DAG constraints into topologically-valid execution waves, while `buildPlanPrompt` now instructs the planner to declare `provides`, `requires`, and `integration_points` in every PLAN.md.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Implement buildWaves in lib/parallel.ts | 15f7008 | lib/parallel.ts |
| 2 | Update buildPlanPrompt in lib/autopilot.ts | 7cf0557 | lib/autopilot.ts |

## What Was Built

### Task 1: buildWaves (lib/parallel.ts)

Added `WaveAssignment` and `BuildWavesOptions` interfaces and the `buildWaves(plans, options?)` function.

Algorithm:
1. For each plan, builds a combined dependency set by merging:
   - Explicit `depends_on` plan IDs (filtered to known plans)
   - Artifact DAG provider lookups: for each `requires` entry, resolves `artifactDAG.providers[artifact]` to a plan ID
2. Constructs in-degree and adjacency maps from the combined deps
3. Kahn's level-based topological sort assigns plans to waves — each wave contains all plans whose combined deps are satisfied by previous waves
4. If a cycle is detected (no zero-in-degree plans remain), all remaining plans are placed in the last wave with a stderr warning

Backward compatibility: plans without `provides`/`requires` (empty arrays) are unaffected by the artifactDAG path; they only respect `depends_on`.

lib/parallel.ts is now 570 lines (min_lines: 480 satisfied).

### Task 2: buildPlanPrompt update (lib/autopilot.ts)

Appended artifact field declaration instruction to the existing plan prompt string. The planner is now instructed to include `provides`, `requires`, and `integration_points` arrays in every PLAN.md YAML frontmatter using the `"module:ExportName"` format (e.g., `"lib/deps.ts:buildArtifactDAG"`). This satisfies REQ-186.

## Verification

```
npm run build:check  -> PASS (tsc --noEmit clean)
npm run lint         -> PASS (eslint bin/ lib/ clean)
node exports check   -> buildParallelContext,buildWaves,cmdInitExecuteParallel,cmdParallelProgress,formatProgressBar,streamPhaseProgress,validateIndependentPhases
```

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- [x] `lib/parallel.ts` exists and is 570 lines (>= 480)
- [x] `lib/autopilot.ts` modified — buildPlanPrompt includes artifact field instruction
- [x] `buildWaves` exported from module.exports
- [x] Commits 15f7008 and 7cf0557 exist
- [x] `npm run build:check` passes
- [x] `npm run lint` passes
