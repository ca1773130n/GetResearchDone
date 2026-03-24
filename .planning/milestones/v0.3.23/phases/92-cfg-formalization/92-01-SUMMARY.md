---
phase: 92-cfg-formalization
plan: 01
subsystem: invariants
tags: [cfg-formalization, validation, types, invariants]
dependency_graph:
  requires: []
  provides: [lib/invariants.ts, ValidationResult, PlanArtifact]
  affects: [lib/types.ts]
tech_stack:
  added: [lib/invariants.ts]
  patterns: [CommonJS module.exports, typed require, import type]
key_files:
  created: [lib/invariants.ts]
  modified: [lib/types.ts]
decisions:
  - "validateResearchArtifacts uses phaseDir as its own search root (not a separate research/ subdir) — keeps API simple and consistent with phase directory convention"
  - "validateSemantic checks parent directory existence as proxy for path plausibility rather than individual file existence — avoids false positives during plan creation"
  - "extractPlanArtifact coerces string-encoded wave/plan to number for robustness against frontmatter parser string output"
metrics:
  duration: "~2 minutes"
  completed: "2026-03-24"
  tasks_completed: 2
  files_created: 1
  files_modified: 1
---

# Phase 92 Plan 01: CFG Formalization — Invariant Types and Validation Functions Summary

Typed plan artifact interfaces (ValidationResult, PlanArtifact) added to lib/types.ts and a new lib/invariants.ts module created with five exported validation functions satisfying REQ-179.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add ValidationResult and PlanArtifact interfaces to lib/types.ts | ece0741 | lib/types.ts |
| 2 | Create lib/invariants.ts with all five validation functions | b83da98 | lib/invariants.ts |

## What Was Built

**lib/types.ts additions:**
- `ValidationResult` interface: `{ valid: boolean; errors: string[]; warnings: string[] }`
- `PlanArtifact` interface: typed representation of PLAN.md frontmatter + objective (11 fields)
- Placed in a new `// ─── Invariant Types` section

**lib/invariants.ts (367 lines):**
- `extractPlanArtifact(content)` — parses PLAN.md raw content into typed PlanArtifact using extractFrontmatter + `<objective>` regex extraction; safe defaults for missing fields
- `validateStructural(plan)` — 5 error checks (objective, files_modified, wave, autonomous, type) + 3 warnings (depends_on array, provides/requires empty)
- `validateSemantic(plan, cwd)` — errors for absolute paths and `..` traversal; warnings for missing extensions and objectives not referencing known directories
- `validateCrossPhase(plans)` — errors for duplicate provides and unmet requires across plan set; warning when no dependency tracking used
- `validateResearchArtifacts(phaseDir)` — validates LANDSCAPE.md (table rows), PAPERS.md (headings), RESEARCH.md (## Method, ## Tradeoffs) only if files exist; missing files produce warning not error

## Verification Results

```
npm run build:check  → PASS (0 errors)
npm run lint         → PASS (0 warnings)
node export check    → extractPlanArtifact,validateCrossPhase,validateResearchArtifacts,validateSemantic,validateStructural
```

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

- [x] lib/invariants.ts exists with 5 functions exported
- [x] lib/types.ts contains ValidationResult and PlanArtifact
- [x] npm run build:check passes
- [x] npm run lint passes
- [x] All 5 function names confirmed via node export check

## Self-Check: PASSED
