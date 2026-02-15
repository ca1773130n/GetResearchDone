---
phase: 02-security-hardening
plan: 01
subsystem: security
tags: [command-injection, execFileSync, input-validation, path-traversal]

requires:
  - phase: 01-security-foundation
    provides: project infrastructure (package.json, .gitignore, .editorconfig)
provides:
  - Hardened execGit and isGitIgnored using execFileSync (no shell interpolation)
  - Input validation helpers (validatePhaseName, validateFilePath, validateGitRef)
  - findCodeFiles fs-based replacement for shell find command
  - process.env.HOME null-safety with os.homedir() fallback
affects: [02-02, 03-modularization, 04-testing]

tech-stack:
  added: [os module, execFileSync]
  patterns: [argument-array git execution, input validation before shell interaction, recursive fs traversal]

key-files:
  created: []
  modified:
    - bin/grd-tools.js

key-decisions:
  - "Keep execSync import for ghExec until Plan 02-02 hardens it"
  - "Inline path traversal guards in normalizePhaseName rather than calling validatePhaseName (lightweight fast-path)"
  - "validateGitRef skips invalid hashes silently in summary verification but marks them invalid in verify-commits"

patterns-established:
  - "execFileSync with argument array for all git operations (no shell string concatenation)"
  - "Input validation functions as reusable guards: validate before passing to child_process"
  - "Null byte rejection at boundaries (isGitIgnored, validateFilePath)"

duration: 3min
completed: 2026-02-12
---

# Phase 2 Plan 1: Shell Hardening and Input Validation Summary

**Hardened execGit/isGitIgnored with execFileSync argument arrays, added input validation functions blocking path traversal and flag injection, replaced shell find with fs.readdirSync**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-12T22:17:34Z
- **Completed:** 2026-02-12T22:20:57Z
- **Tasks:** 2/2
- **Files modified:** 1

## Accomplishments

- Eliminated all shell-concatenated git commands from execGit and isGitIgnored, replacing with execFileSync argument arrays
- Replaced shell find command with pure Node.js recursive directory traversal (findCodeFiles)
- Added three input validation functions: validatePhaseName, validateFilePath, validateGitRef
- Integrated validateGitRef at both commit verification call sites (summary verify and verify-commits)
- Added null byte guard in isGitIgnored and path traversal guards in normalizePhaseName
- Fixed process.env.HOME null safety with os.homedir() fallback

## Task Commits

Each task was committed atomically:

1. **Task 1: Replace execGit and isGitIgnored with execFileSync and fix HOME fallback** - `8880489` (feat)
2. **Task 2: Add input validation helper functions and integrate at entry points** - `7dd204a` (feat)

## Files Created/Modified

- `bin/grd-tools.js` - Hardened shell execution functions, added input validators, replaced shell find, fixed HOME fallback

## Decisions Made

1. **Keep execSync for now** - ghExec still uses it; Plan 02-02 will harden and potentially remove it
2. **Inline guards in normalizePhaseName** - Lightweight path traversal checks inline rather than calling validatePhaseName, since normalizePhaseName is called frequently and the full regex validation is unnecessary there
3. **Silent skip vs explicit invalid** - validateGitRef failures in summary verification silently skip (continue), while verify-commits marks them invalid (push to invalid array), matching each context's expected behavior

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Ready for Plan 02-02 (gh CLI hardening, error message sanitization, state file write guards)
- execSync remains imported for ghExec -- Plan 02-02 addresses this
- All existing CLI commands verified working via smoke tests

## Self-Check

- [x] `bin/grd-tools.js` exists: FOUND
- [x] Commit `8880489` exists: FOUND
- [x] Commit `7dd204a` exists: FOUND
- [x] Zero shell-concatenated git calls: VERIFIED
- [x] execFileSync in execGit and isGitIgnored: VERIFIED (2 occurrences)
- [x] No shell find calls: VERIFIED
- [x] Validation functions defined: VERIFIED (5 occurrences)
- [x] os.homedir() fallback present: VERIFIED
- [x] state load produces valid JSON: VERIFIED

## Self-Check: PASSED

---
*Phase: 02-security-hardening*
*Completed: 2026-02-12*
