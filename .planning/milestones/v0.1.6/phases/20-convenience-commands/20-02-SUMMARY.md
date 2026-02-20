---
phase: 20-convenience-commands
plan: 02
subsystem: cli/requirement-update
tags: [tdd, requirement, cli, commands, traceability]
requires:
  - 20-01 (search command operational, test infrastructure)
provides:
  - cmdRequirementUpdateStatus function in lib/commands.js
  - CLI route "requirement update-status" in bin/grd-tools.js
affects:
  - lib/commands.js (new function + export + constant)
  - bin/grd-tools.js (new import + case route + REQUIREMENT_SUBS update)
  - tests/unit/commands.test.js (8 new tests)
tech-stack:
  added: []
  patterns:
    - Regex-based targeted table cell replacement preserving surrounding content
    - Same-status no-op shortcut to avoid false "failed to update" errors
key-files:
  created: []
  modified:
    - lib/commands.js
    - bin/grd-tools.js
    - tests/unit/commands.test.js
key-decisions:
  - Regex replacement over line-split approach for cleaner single-cell targeting
  - Same-status updates return success without disk write (no-op optimization)
  - Case-insensitive REQ-ID matching consistent with cmdRequirementGet/List/Traceability
  - Multi-word "In Progress" handled by joining split CLI args in router
duration: 3min
completed: 2026-02-16
---

# Phase 20 Plan 02: Requirement Update-Status Command Summary

Implemented `grd-tools requirement update-status <REQ-ID> <status>` command via TDD that validates REQ-ID existence and status value (Pending/In Progress/Done/Deferred), then modifies only the Status column in the Traceability Matrix table using regex-based cell replacement.

## Performance

- **Duration:** 3 min
- **Tasks completed:** 2/2
- **Tests added:** 8 (1343 total)
- **Test delta:** +8 tests (1343 total)
- **Regressions:** 0
- **Full suite:** 1343 passing

## Accomplishments

1. **RED phase:** Wrote 8 failing tests covering: basic status update (Done to Deferred), multi-word status (In Progress), all four valid statuses loop, invalid status error, non-existent REQ-ID error, case-insensitive REQ-ID matching, content preservation across other rows and columns, and round-trip correctness with cmdRequirementGet.

2. **GREEN phase:** Implemented `cmdRequirementUpdateStatus` with VALID_REQUIREMENT_STATUSES constant, parseTraceabilityMatrix-based validation, regex row replacement targeting only the status cell, and same-status no-op optimization. Updated CLI routing with multi-word status handling.

## Task Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Write failing tests for requirement update-status command (RED) | 3b8553d | tests/unit/commands.test.js |
| 2 | Implement requirement update-status command (GREEN) | 37135ca | lib/commands.js, bin/grd-tools.js |

## Files Modified

| File | Change |
|------|--------|
| `lib/commands.js` | Added `VALID_REQUIREMENT_STATUSES` constant + `cmdRequirementUpdateStatus` function + export |
| `bin/grd-tools.js` | Added `cmdRequirementUpdateStatus` import + `update-status` to REQUIREMENT_SUBS + case route with multi-word status handling |
| `tests/unit/commands.test.js` | Added `cmdRequirementUpdateStatus` import + 8 TDD tests in new describe block |

## Decisions Made

1. **Regex replacement over line-split approach** -- Cleaner single-cell targeting using a pattern that matches the entire table row and replaces only the status cell content, preserving exact formatting of all other cells.

2. **Same-status updates return success without disk write** -- When old_status equals new_status, the function returns success immediately without writing. This prevents the regex-replacement-produces-identical-content edge case from triggering a false "failed to update" error.

3. **Case-insensitive REQ-ID matching** -- Consistent with existing cmdRequirementGet, cmdRequirementList, and cmdRequirementTraceability commands. Uses `toLowerCase()` comparison but preserves original casing in output.

4. **Multi-word "In Progress" CLI handling** -- Shell splits "In Progress" into two args; the router checks if args[3]==="In" and args[4]==="Progress" and joins them. All other valid statuses are single words.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Same-status update edge case**
- **Found during:** Task 2 (GREEN phase)
- **Issue:** When updating a requirement to its current status (e.g., Pending to Pending), the regex replacement produces identical content. The `updatedContent === content` guard then incorrectly triggers an error.
- **Fix:** Added early-return shortcut when oldStatus === newStatus, reporting success without disk write.
- **Files modified:** lib/commands.js
- **Commit:** 37135ca

## Issues Encountered

None.

## Next Phase Readiness

- Requirement update-status command is fully operational and tested
- All requirement CLI commands complete: get, list, traceability, update-status
- Ready for Phase 21 (MCP wiring) or additional convenience commands
- No blockers for subsequent plans
