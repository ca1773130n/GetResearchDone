---
phase: 85-mcp-tools-cli-command-and-testing
plan: 01
subsystem: mcp
tags: [mcp-tools, discussion, multi-backend, slash-command]

requires:
  - phase: 84-workflow-integration
    provides: runDiscussion, listDiscussions, readDiscussion, detectAvailableBackends in lib/discussion.ts and lib/backend.ts

provides:
  - grd_discussion_run MCP tool registered in COMMAND_DESCRIPTORS
  - grd_discussion_config MCP tool registered in COMMAND_DESCRIPTORS
  - grd_backends_available MCP tool registered in COMMAND_DESCRIPTORS
  - grd_discussion_history MCP tool registered in COMMAND_DESCRIPTORS
  - commands/discuss.md slash command for ad-hoc discussions
  - readConfig exported from lib/backend.ts

affects: [mcp-server, discussion, backend, commands]

tech-stack:
  added: []
  patterns:
    - "Discussion MCP tools follow JSON.stringify() return pattern for all descriptors"
    - "readConfig exported from lib/backend.ts for use in MCP tool execute functions"

key-files:
  created:
    - commands/discuss.md
  modified:
    - lib/mcp-server.ts
    - lib/backend.ts

key-decisions:
  - "readConfig exported from lib/backend.ts rather than reimplementing inline in mcp-server.ts"
  - "grd_discussion_run accepts participants as comma-separated string (MCP tool cannot pass arrays natively)"
  - "grd_discussion_history returns { filename, content } when filename provided, plain array when listing"

patterns-established:
  - "Discussion tool imports grouped after wireup imports in mcp-server.ts"
  - "// -- Discussion Tools -- comment section header matches // -- Wireup Tools -- convention"

duration: 10min
completed: 2026-03-23
---

# Phase 85 Plan 01: MCP Tools and CLI Command Summary

**Four discussion MCP tools registered in COMMAND_DESCRIPTORS exposing the full discussion API surface, plus a /grd:discuss slash command for ad-hoc multi-backend discussions.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-03-23T12:00:00Z
- **Completed:** 2026-03-23T12:11:12Z
- **Tasks:** 2 completed
- **Files modified:** 3

## Accomplishments

- Registered grd_discussion_run, grd_discussion_config, grd_backends_available, grd_discussion_history in COMMAND_DESCRIPTORS (lib/mcp-server.ts)
- Created commands/discuss.md with valid YAML frontmatter (description, argument-hint) that invokes grd_discussion_run
- Exported readConfig from lib/backend.ts module.exports to support grd_discussion_config tool
- All tools use JSON.stringify() return pattern matching existing tool conventions
- build:check and lint pass with zero errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Register four discussion MCP tools in lib/mcp-server.ts** - `938d0f4` (feat)
2. **Task 2: Create /grd:discuss slash command** - `1af37ec` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `lib/mcp-server.ts` — Added import type for BackendId/BackendAvailability/DiscussionResult; added require blocks for ./discussion and ./backend; added 4 discussion tool descriptors after Wireup Tools section
- `lib/backend.ts` — Added readConfig to module.exports
- `commands/discuss.md` — New slash command: resolves topic from argument or ROADMAP.md, calls grd_discussion_run, presents results with synthesis

## Decisions Made

- readConfig exported from lib/backend.ts rather than reimplementing inline — keeps MCP tools thin
- grd_discussion_run accepts participants as comma-separated string because MCP tool params are typed as string/number/boolean/array — used string with explicit parse
- grd_discussion_history returns { filename, content } object when filename provided for consistency (caller knows what was read)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Export readConfig from lib/backend.ts**

- **Found during:** Task 1 (Register four discussion MCP tools)
- **Issue:** Plan specified using readConfig from ./backend but readConfig was not in module.exports — only used internally
- **Fix:** Added readConfig to module.exports in lib/backend.ts
- **Files modified:** lib/backend.ts
- **Verification:** build:check passes with zero errors
- **Committed in:** 938d0f4 (part of task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 2 — missing export)
**Impact on plan:** Minimal — one-line addition to backend.ts exports; no behavioral change

## Issues Encountered

None — plan executed cleanly after exporting readConfig.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All 4 discussion MCP tools registered and type-checked
- /grd:discuss slash command ready for use
- MCP tool count increased from 128 to 132 (4 new tools added)
- Ready for Plan 85-02: Discussion Testing

## Self-Check: PASSED

- [x] lib/mcp-server.ts modified with 4 new tool descriptors
- [x] lib/backend.ts modified with readConfig export
- [x] commands/discuss.md created with valid frontmatter
- [x] Commits 938d0f4 and 1af37ec exist
- [x] grep -c confirms 4 tool names present
- [x] build:check passes
- [x] lint passes

---
*Phase: 85-mcp-tools-cli-command-and-testing*
*Completed: 2026-03-23*
