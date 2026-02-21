---
phase: 49-bug-discovery-and-fixes
plan: 02
status: complete
duration: 10min
files_modified:
  - lib/commands.js
  - lib/state.js
  - tests/unit/commands.test.js
  - tests/unit/state.test.js
---

## Summary

Fixed BUG-48-004 (phase-plan-index extraction) and BUG-48-005 (state patch underscore mapping).

### BUG-48-004 Fix: Plan Index Extraction

Two changes in `cmdPhasePlanIndex()` in lib/commands.js:

1. **Objective extraction**: Added fallback to `<objective>` XML tag in plan body when not in frontmatter. Searches body only (after `---` frontmatter block) to avoid matching `<objective>` references in frontmatter strings like must_haves.truths.

2. **files_modified key**: Changed from `fm['files-modified']` (hyphen only) to `fm.files_modified || fm['files-modified']` (underscore preferred, hyphen fallback). The YAML parser preserves underscores.

### BUG-48-005 Fix: Underscore-to-Space Mapping

Both `cmdStatePatch()` and `cmdStateUpdate()` in lib/state.js now:
1. Try exact field name match first (existing behavior)
2. If no match, convert underscores to spaces and retry
3. This maps CLI arg `--current_plan` to STATE.md field `**Current plan:**`

### Tests Added

- 2 tests in commands.test.js: objective from `<objective>` tag, files_modified underscore key
- 4 tests in state.test.js: underscore-to-space mapping, Current_plan, original spaces, non-existent field

### Verification

- All 1,840 tests pass
- Zero lint errors
- Testbed verification: `phase-plan-index 49` returns non-null objectives for all 3 plans, `state patch --Current_plan` succeeds
