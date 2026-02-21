---
phase: 49-bug-discovery-and-fixes
plan: 01
status: complete
duration: 8min
files_modified:
  - lib/roadmap.js
  - lib/state.js
  - tests/unit/roadmap.test.js
  - tests/unit/state.test.js
---

## Summary

Fixed BUG-48-002 (roadmap goal regex mismatch) and BUG-48-003 (state-snapshot field name mismatch).

### BUG-48-002 Fix: Goal Regex

Changed goal regex in both `cmdRoadmapGetPhase()` (line 214) and `analyzeRoadmap()` (line 347) from `/\*\*Goal:\*\*\s*([^\n]+)/i` to `/\*\*Goal:?\*\*:?\s*([^\n]+)/i`. This handles both `**Goal:**` (colon inside bold) and `**Goal**:` (colon outside bold) formats. Same pattern already used for `depends_on`.

### BUG-48-003 Fix: State Snapshot Field Names

Updated `cmdStateSnapshot()` in lib/state.js to:
1. Try `extractField('Active phase')` first, fall back to `extractField('Current Phase')`
2. Parse "Phase N of M (Name)" format from Active phase value to extract `current_phase`, `total_phases`, and `current_phase_name`
3. Try `extractField('Current plan')` (lowercase) in addition to `'Current Plan'`

### Tests Added

- 4 tests in roadmap.test.js: goal extraction with both formats, null when missing, analyze with both formats
- 4 tests in state.test.js: Active phase parsing, legacy Current Phase fallback, null when missing, lowercase Current plan

### Verification

- All 1,840 tests pass (was 1,779)
- Zero lint errors
- Testbed verification: `roadmap get-phase 1` returns non-null goal, `state-snapshot` returns correct phase/name/total
