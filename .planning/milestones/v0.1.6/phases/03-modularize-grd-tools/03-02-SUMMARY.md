---
phase: 03-modularize-grd-tools
plan: 02
subsystem: modularization
tags: [module-extraction, lib, utils, frontmatter, refactoring]

requires:
  - phase: 03-modularize-grd-tools
    provides: golden reference output for 74 CLI commands (regression baseline)
  - phase: 02-security-hardening
    provides: hardened bin/grd-tools.js with execFileSync and input validation
provides:
  - lib/utils.js with 17 shared helper functions and 5 constants (27 exports)
  - lib/frontmatter.js with 4 core functions, 4 cmd functions, and FRONTMATTER_SCHEMAS (9 exports)
  - module pattern and import structure for all subsequent extractions
affects: [03-03, 03-04, 03-05, 03-06, 03-07]

tech-stack:
  added: []
  patterns: [module-extraction, require-destructure-import]

key-files:
  created:
    - lib/utils.js
    - lib/frontmatter.js
  modified:
    - bin/grd-tools.js

key-decisions:
  - "Re-export fs/path/os/execFileSync from lib/utils.js for consumer convenience"
  - "Keep fs/path/os/execFileSync direct imports in grd-tools.js for remaining inline usage"
  - "lib/frontmatter.js depends on lib/utils.js (safeReadFile, output, error) -- no circular deps"
  - "FRONTMATTER_SCHEMAS constant moved with cmdFrontmatterValidate to frontmatter.js"

patterns-established:
  - "Module extraction pattern: copy exact code, add exports, update require in consumer, remove original"
  - "Import pattern: destructured require with explicit named imports for traceability"
  - "Dependency direction: frontmatter.js -> utils.js -> Node built-ins (no cycles)"

duration: 3min
completed: 2026-02-12
---

# Phase 3 Plan 02: Foundation Module Extraction Summary

**Extracted lib/utils.js (17 functions, 5 constants) and lib/frontmatter.js (8 functions, 1 constant) as zero-dependency foundation modules, reducing bin/grd-tools.js by 603 lines with identical CLI output.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-12T23:31:52Z
- **Completed:** 2026-02-12T23:38:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Extracted all shared helpers, constants, and validation functions into lib/utils.js (404 lines, 27 exports)
- Extracted all YAML frontmatter operations into lib/frontmatter.js (307 lines, 9 exports)
- Reduced bin/grd-tools.js from 5721 to 5118 lines (603 lines removed, exceeding 500-line target)
- Verified output identity against golden references for generate-slug, resolve-model, find-phase, and additional commands
- Confirmed zero circular dependencies between modules

## Task Commits

1. **Task 1: Extract lib/utils.js with all shared helpers and constants** - `9ab6689` (feat)
2. **Task 2: Extract lib/frontmatter.js with YAML frontmatter operations** - `dc5c585` (feat)

**Plan metadata:** (pending)

## Files Created/Modified
- `lib/utils.js` - Shared utility functions, constants, validation, and compound helpers (27 exports)
- `lib/frontmatter.js` - YAML frontmatter parse/reconstruct/splice/validate and CLI command handlers (9 exports)
- `bin/grd-tools.js` - Updated to require from lib/utils.js and lib/frontmatter.js, moved code replaced with imports

## Decisions Made
- Re-exported Node built-ins (fs, path, os, execFileSync) from lib/utils.js for modules that only need utils
- Kept direct Node built-in imports in bin/grd-tools.js since many remaining command functions use them directly
- Moved FRONTMATTER_SCHEMAS alongside cmdFrontmatterValidate into lib/frontmatter.js (cohesive grouping)
- lib/frontmatter.js imports from lib/utils.js (one-directional dependency, no cycles)

## Deviations from Plan

None -- plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
Foundation modules (lib/utils.js and lib/frontmatter.js) are established. Plans 03-07 can now extract state, verify, scaffold, phase-ops, tracker, and init modules following the same pattern. Each new module can require from lib/utils.js and lib/frontmatter.js as needed.

---
*Phase: 03-modularize-grd-tools*
*Completed: 2026-02-12*
