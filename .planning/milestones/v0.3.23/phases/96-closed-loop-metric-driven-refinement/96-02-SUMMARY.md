---
phase: 96-closed-loop-metric-driven-refinement
plan: 02
subsystem: research
tags: [refinement, closed-loop, metrics, autopilot, nerfify, critique-agent]

# Dependency graph
requires:
  - phase: 96-01
    provides: "lib/refinement.ts with collectMetrics, detectMinima, checkConvergence, classifyBranch, buildCritiquePrompt"
provides:
  - "agents/grd-critique-agent.md — post-phase critique agent with three branch protocols"
  - "buildCritiqueAgentPrompt function in lib/autopilot.ts"
  - "runRefinementLoop function in lib/autopilot.ts — iterative spawn loop with convergence"
affects:
  - phase-96-03
  - autopilot pipeline integration

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Critique agent pattern: agent definition file gates activation (same as knowledge-miner)"
    - "Non-blocking refinement loop: try/catch wraps entire loop; failures logged, pipeline continues"
    - "Iterative metric convergence: collect -> classify -> spawn -> re-measure -> check"

key-files:
  created:
    - agents/grd-critique-agent.md
  modified:
    - lib/autopilot.ts
    - lib/refinement.ts
    - tests/unit/refinement.test.ts
    - jest.config.js

key-decisions:
  - "runRefinementLoop defaults: epsilon_coverage=0.5, epsilon_type_errors=0, epsilon_lint=1, max_iterations=3"
  - "runRefinementLoop spawns npm test/build:check/lint via spawnStep to collect metrics before spawning critique agent"
  - "buildCritiqueAgentPrompt wraps buildCritiquePrompt from refinement.ts with agent role context and phase number"
  - "Lint parsing uses max(individualCount, summaryCount) to handle unreliable ESLint summary lines"

patterns-established:
  - "NERFIFY-to-GRD adaptation: PSNR-minima ROI -> coverage dips, geometry errors -> type error density, VLM artifacts -> lint violations"
  - "Agent existence guard: fs.existsSync(agentDefPath) before spawning — loop skips gracefully if definition absent"

# Metrics
duration: 7min
completed: 2026-03-25
---

# Phase 96 Plan 02: Critique Agent and Refinement Loop Summary

**grd-critique-agent.md (3-branch: macro/geometry/generative) and iterative runRefinementLoop in autopilot.ts complete the closed-loop metric-driven refinement pipeline.**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-25T05:09:55Z
- **Completed:** 2026-03-25T05:17:00Z
- **Tasks:** 2 (plus 1 auto-fix prerequisite)
- **Files modified:** 4

## Accomplishments

- Created `agents/grd-critique-agent.md` with three branch protocols (Macro, Geometry, Generative) adapted from NERFIFY, effort: low, maxTurns: 20, and structured CRITIQUE-RESULT output format
- Added `buildCritiqueAgentPrompt` to autopilot.ts — constructs a critique prompt referencing branch, metrics, targets, and minima regions
- Added `runRefinementLoop` to autopilot.ts — implements the closed-loop: collect metrics from npm test/build:check/lint, classify branch, spawn critique agent, check convergence, repeat up to max_iterations
- Both functions exported and verified via npm run build:check + npm run lint

## Task Commits

Each task was committed atomically:

1. **Rule 3 - Implement refinement.ts (prerequisite)** - `64ccc5b` (feat)
2. **Task 1: Create grd-critique-agent.md** - `b0f409d` (feat)
3. **Task 2: Add buildCritiqueAgentPrompt and runRefinementLoop** - `066d564` (feat)

## Files Created/Modified

- `agents/grd-critique-agent.md` — Post-phase critique agent with three branch protocols and CRITIQUE-RESULT output format
- `lib/autopilot.ts` — Added buildCritiqueAgentPrompt, runRefinementLoop; imported refinement types and functions
- `lib/refinement.ts` — Implemented all 5 stub functions: collectMetrics, detectMinima, checkConvergence, classifyBranch, buildCritiquePrompt
- `tests/unit/refinement.test.ts` — 36 tests, all passing (coverage 97.61% lines)
- `jest.config.js` — Coverage threshold already present for lib/refinement.ts (lines:85, functions:85, branches:75)

## Decisions Made

- `runRefinementLoop` defaults: `epsilon_coverage=0.5, epsilon_type_errors=0, epsilon_lint=1, max_iterations=3` — conservative thresholds matching plan spec
- `buildCritiqueAgentPrompt` prepends "You are the grd-critique-agent. Your branch is {branch}." to establish agent context before the structured critique prompt
- Lint metric parsing uses `max(individualCount, summaryCount)` — ESLint's "N problems" summary can undercount when the summary line text is corrupted; individual line counting is the ground truth

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Implemented refinement.ts stub functions as prerequisite for plan 02**
- **Found during:** Pre-execution check
- **Issue:** lib/refinement.ts existed but all 5 functions threw "not implemented" — plan 02 requires `collectMetrics`, `checkConvergence`, `classifyBranch`, `detectMinima`, `buildCritiquePrompt` to be working for use in `runRefinementLoop`
- **Fix:** Implemented all 5 functions with full test coverage; fixed Jest coverage regex to parse the Lines column (4th numeric column) of the "All files" row; fixed lint parsing to use max(individual lines, summary count)
- **Files modified:** lib/refinement.ts, tests/unit/refinement.test.ts, jest.config.js
- **Verification:** 36 tests pass; coverage 97.61% lines, 85.24% branches, 100% functions; build:check and lint clean
- **Committed in:** 64ccc5b

---

**Total deviations:** 1 auto-fixed (Rule 3 - blocking prerequisite)
**Impact on plan:** Enabled plan 02 execution. No changes to plan 02 scope.

## Issues Encountered

None beyond the prerequisite implementation.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Plan 03 can proceed: `runRefinementLoop` is exported and wired; critique agent is defined
- Plan 03 needs to integrate `runRefinementLoop` into the post-phase autopilot pipeline (after knowledge mining step)
- All convergence logic, branch classification, and minima detection are tested and functional

## Self-Check: PASSED

- agents/grd-critique-agent.md: FOUND
- lib/autopilot.ts: FOUND
- lib/refinement.ts: FOUND
- commit 64ccc5b (refinement.ts implementation): FOUND
- commit b0f409d (grd-critique-agent.md): FOUND
- commit 066d564 (buildCritiqueAgentPrompt + runRefinementLoop): FOUND
- runRefinementLoop defined + exported in autopilot.ts: 2 refs (definition + export)
- buildCritiqueAgentPrompt defined, called, exported in autopilot.ts: 3 refs

---
*Phase: 96-closed-loop-metric-driven-refinement*
*Completed: 2026-03-25*
