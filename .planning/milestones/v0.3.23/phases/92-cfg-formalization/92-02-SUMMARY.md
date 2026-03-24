---
phase: 92-cfg-formalization
plan: "02"
subsystem: gates
tags: [invariant-validation, gates, plan-checker, pre-flight]
dependency_graph:
  requires: [92-01]
  provides: [invariant-validation-gate, grd-plan-checker-dimension-9]
  affects: [lib/gates.ts, agents/grd-plan-checker.md]
tech_stack:
  added: []
  patterns: [gate-check-function, validation-pipeline]
key_files:
  modified:
    - lib/gates.ts
    - agents/grd-plan-checker.md
decisions:
  - "checkInvariantValidation does per-plan structural validation then one cross-phase pass — matches invariants.ts function signatures exactly"
  - "phaseDir and planFiles declared without initializer (not null/[]) to satisfy no-useless-assignment ESLint rule"
  - "invariant-validation gate added to both plan-phase and execute-phase in GATE_REGISTRY"
metrics:
  duration_seconds: 124
  completed: "2026-03-24"
  tasks_completed: 2
  files_modified: 2
---

# Phase 92 Plan 02: Invariant Validation Gate Wiring Summary

Wire the invariant validation module into the gate system and plan-checker agent. `invariant-validation` gate now hard-rejects structurally invalid plans before plan-phase and execute-phase can proceed.

## What Was Built

### Task 1: checkInvariantValidation gate in lib/gates.ts

Added typed import of `validateStructural`, `validateCrossPhase`, and `extractPlanArtifact` from `lib/invariants.ts`. Implemented `checkInvariantValidation(cwd, opts)` which:

1. Resolves the phase directory using `getPhasesDirPath` + `normalizePhaseName`
2. Reads all `*-PLAN.md` files in the phase directory
3. For each plan: calls `extractPlanArtifact` then `validateStructural`, mapping errors to `GateViolation` objects with `code='INVARIANT_STRUCTURAL'`
4. Calls `validateCrossPhase` across all plan artifacts, mapping errors to `code='INVARIANT_CROSS_PHASE'`
5. Errors map to `severity='error'`, warnings to `severity='warning'`

Registered in `GATE_REGISTRY` for both `plan-phase` and `execute-phase`. Added to `GATE_CHECKS` map and `module.exports`.

### Task 2: Dimension 9 in agents/grd-plan-checker.md

Added Dimension 9: Invariant Validation after Dimension 8 (Research Compliance). Covers:
- `extractPlanArtifact` parse step
- `validateStructural` field-level checks
- `validateSemantic` path safety checks
- `validateCrossPhase` dependency consistency
- `validateResearchArtifacts` for research phases

Also added "Invariant validation checked" item to the success_criteria checklist.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 6de6598 | feat(92-02): add checkInvariantValidation gate to lib/gates.ts |
| 2 | 03351f9 | feat(92-02): add Dimension 9 invariant validation to grd-plan-checker |

## Verification

```
npm run build:check  — PASSED
npm run lint         — PASSED
grep invariant-validation lib/gates.ts — found in GATE_REGISTRY (plan-phase, execute-phase) and GATE_CHECKS
grep -c "validateStructural|validateSemantic|validateCrossPhase" agents/grd-plan-checker.md — 5 (>= 3)
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] ESLint no-useless-assignment on let declarations with initial values**
- **Found during:** Task 1 (first lint run)
- **Issue:** `let phaseDir: string | null = null` and `let planFiles: string[] = []` triggered `no-useless-assignment` because the initial values were never read before reassignment inside try blocks
- **Fix:** Declared without initializer (`let phaseDir: string;` and `let planFiles: string[];`) — TypeScript narrowing ensures they are assigned before use because the catch branches all `return violations`
- **Files modified:** lib/gates.ts
- **Commit:** 6de6598

## Self-Check: PASSED

- [x] lib/gates.ts exists and contains checkInvariantValidation
- [x] invariant-validation in GATE_REGISTRY for plan-phase and execute-phase
- [x] GATE_CHECKS has invariant-validation entry
- [x] checkInvariantValidation exported from module.exports
- [x] Dimension 9 in agents/grd-plan-checker.md
- [x] validateStructural, validateSemantic, validateCrossPhase referenced 5 times
- [x] npm run build:check passes
- [x] npm run lint passes
- [x] Both task commits present: 6de6598, 03351f9
