---
phase: 71-effort-levels-capability-flags
plan: 02
subsystem: backend
tags: [effort-levels, model-profiles, backend-capabilities]

requires:
  - phase: 71-01
    provides: "effort capability flag in BackendCapabilities"
provides:
  - "EFFORT_PROFILES constant mapping 19 agents to effort levels per profile"
  - "resolveEffortLevel(agentType, profile) function in backend.ts"
  - "resolveEffortForAgent(config, agentType, cwd?) helper in utils.ts"
  - "EffortLevel and AgentEffortProfiles type aliases in types.ts"
affects: [71-03-init-context-wiring]

tech-stack:
  added: []
  patterns:
    - "Effort profile table parallels MODEL_PROFILES pattern"
    - "resolveEffortForAgent parallels resolveModelForAgent pattern"

key-files:
  created: []
  modified:
    - lib/types.ts
    - lib/backend.ts
    - lib/utils.ts

key-decisions:
  - "EffortLevel types placed in Backend Types section of types.ts (not Utility Types) since effort is a backend capability"
  - "Unknown agents default to 'medium' effort (safe middle ground)"
  - "resolveEffortForAgent returns null (not a default string) when backend lacks effort support, letting callers omit the field"

patterns-established:
  - "Effort resolution pattern: EFFORT_PROFILES[agent][profile] with fallback chain"

duration: 5min
completed: 2026-03-11
---

# Phase 71 Plan 02: Effort Level Profiles Summary

**Effort level profile table and resolution functions for 19 agent types across quality/balanced/budget profiles, with backend capability gating**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-11T00:09:16Z
- **Completed:** 2026-03-11T00:14:20Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments
- Added EffortLevel ('low'|'medium'|'high') and AgentEffortProfiles type aliases to lib/types.ts
- Created EFFORT_PROFILES constant in lib/backend.ts mapping all 19 agent types to effort levels per profile (quality/balanced/budget)
- Implemented resolveEffortLevel function with fallback chain (agent -> profile -> 'balanced' -> 'medium')
- Added resolveEffortForAgent helper in lib/utils.ts that gates on backend effort capability

## Task Commits

Each task was committed atomically:

1. **Task 1: Add EffortLevel and AgentEffortProfiles types** - `437b26b` (feat)
2. **Task 2: Add EFFORT_PROFILES and resolveEffortLevel** - `9a4528a` (feat)
3. **Task 3: Add resolveEffortForAgent helper** - `881b4e2` (feat)

## Files Created/Modified
- `lib/types.ts` - Added EffortLevel type alias and AgentEffortProfiles type alias
- `lib/backend.ts` - Added EFFORT_PROFILES constant (19 agents), resolveEffortLevel function, updated imports and exports
- `lib/utils.ts` - Added resolveEffortForAgent helper, updated backend require to include new functions

## Decisions Made
- EffortLevel types placed after ModelProfileName in Backend Types section (not Utility Types) since effort is inherently a backend capability
- Unknown agents default to 'medium' effort as a safe middle ground
- resolveEffortForAgent returns null when backend lacks effort support, allowing callers to omit the field entirely rather than sending an unsupported value
- Used untyped require for backend imports in utils.ts to maintain consistency with existing code patterns (avoids GrdConfig vs Record<string, unknown> type mismatch)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] BackendCapabilities.effort field already existed**
- **Found during:** Task 1
- **Issue:** Plan 71-01 had already added the `effort` field to BackendCapabilities interface and BACKEND_CAPABILITIES constant
- **Fix:** Skipped adding `effort` to types.ts interface (already present), proceeded with EffortLevel types only
- **Files modified:** None (no change needed)
- **Verification:** tsc --noEmit passed

**2. [Rule 1 - Bug] Typed require broke existing code in utils.ts**
- **Found during:** Task 3
- **Issue:** Adding typed `as { ... }` annotation to backend require caused type errors in existing resolveModelInternal and resolveModelForAgent functions (GrdConfig not assignable to Record<string, unknown>)
- **Fix:** Reverted to untyped require pattern matching existing codebase style
- **Files modified:** lib/utils.ts
- **Verification:** tsc --noEmit and all 139 utils tests pass

---

**Total deviations:** 2 auto-fixed (1x Rule 3 blocking, 1x Rule 1 bug)
**Impact on plan:** Minimal -- all planned functionality delivered as specified

## Issues Encountered
None beyond the auto-fixed deviations above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- EFFORT_PROFILES and resolveEffortLevel are ready for Plan 03 to wire effort_level into cmdInit* JSON outputs
- resolveEffortForAgent provides the same API pattern as resolveModelForAgent for easy integration
- All 241 existing tests pass (102 backend + 139 utils)

---
*Phase: 71-effort-levels-capability-flags*
*Completed: 2026-03-11*
