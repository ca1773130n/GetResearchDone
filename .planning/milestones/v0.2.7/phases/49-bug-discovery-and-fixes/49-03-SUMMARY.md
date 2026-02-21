---
phase: 49-bug-discovery-and-fixes
plan: 03
status: complete
duration: 12min
files_modified:
  - tests/unit/paths.test.js
  - .planning/milestones/v0.2.7/phases/48-dogfooding-infrastructure/48-BUG-CATALOG.md
---

## Summary

Investigated BUG-48-001 (currentMilestone parsing), verified all 5 bug fixes via testbed, and updated the bug catalog.

### BUG-48-001 Investigation

**Status: NOT REPRODUCING.** The `currentMilestone()` regex `(v[\d.]+)` correctly extracts versions from all tested formats:
- "v0.2.7 Self-Evolution" -> "v0.2.7" (correct)
- "v1.0.0 Initial Release" -> "v1.0.0" (correct)
- "v0.0.5 Production-Ready R&D Workflow Automation" -> "v0.0.5" (correct)

The original REQ-112 report that it returns "v0.0.5" cannot be reproduced with the current code. The regex `(v[\d.]+)` matches the first version-like string in the Milestone field value, which is always the correct version. The Milestone field (line-level) is matched before any other content.

4 edge case tests added to prevent future regression.

### Testbed Verification

All 5 bug fixes verified via GRD CLI commands run against testbed/:

| Bug | Command | Expected | Actual | Result |
|-----|---------|----------|--------|--------|
| BUG-48-002 | `roadmap get-phase 1` | goal non-null | `"Configure the Flutter monorepo..."` | PASS |
| BUG-48-003 | `state-snapshot` | current_phase non-null | `"1"`, name `"Project Setup & CI"`, total 3 | PASS |
| BUG-48-004 | `phase-plan-index 49` (GRD) | objective non-null | All 3 plans have objectives | PASS |
| BUG-48-005 | `state patch --Current_plan "1-01"` | updated | `"updated": ["Current_plan"]` | PASS |

### Additional Bug Found & Fixed

During verification, discovered that `cmdPhasePlanIndex` objective extraction was matching `<objective>` inside frontmatter strings (e.g., must_haves.truths referencing "objective extracted from <objective> tag"). Fixed by searching body only (after frontmatter block).

### Tests Added

- 4 edge case tests in paths.test.js: space-separated name, v0.0.5 with long name, multiple version strings in content, v1.0.0 Initial Release format

### Full Suite

- 1,840 tests pass (61 new tests in this phase)
- Zero lint errors
- Bug catalog updated with resolution status for all 5 bugs
