---
phase: 61-integration-autonomous-layer-migration
plan: 04
subsystem: lib/parallel, lib/autopilot
tags: [typescript-migration, parallel-execution, subprocess-spawning, cjs-proxy]
dependency_graph:
  requires: [worktree.ts, deps.ts, gates.ts, roadmap.ts, utils.ts, backend.ts]
  provides: [parallel.ts, autopilot.ts]
  affects: [evolve.ts (Wave 3 consumer of spawnClaudeAsync)]
tech_stack:
  added: []
  patterns: [require-as-typed-cast, cjs-proxy, local-domain-interfaces, error-cast]
key_files:
  created:
    - lib/parallel.ts
    - lib/autopilot.ts
  modified:
    - lib/parallel.js (converted to CJS proxy)
    - lib/autopilot.js (converted to CJS proxy)
    - jest.config.js (threshold keys .js -> .ts)
decisions:
  - "ResolvePhaseRangeResult includes depends_on to preserve dependency wave computation downstream"
  - "stoppedAt changed from let to const (never reassigned; lint prefer-const)"
  - "SpawnResult uses optional stdout/stderr fields (only populated with captureOutput/captureStderr flags)"
metrics:
  duration: 7min
  completed: 2026-03-01
---

# Phase 61 Plan 04: Parallel & Autopilot TypeScript Migration Summary

Migrated lib/parallel.js (316 lines) and lib/autopilot.js (633 lines) to TypeScript with full type annotations for parallel execution context building and autonomous subprocess orchestration, establishing the typed autonomous orchestration layer for Wave 2.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Migrate parallel.js to parallel.ts | 07c0e00 | lib/parallel.ts, lib/parallel.js |
| 2 | Migrate autopilot.js to autopilot.ts | 5723d60 | lib/autopilot.ts, lib/autopilot.js |
| 3 | Update jest.config.js thresholds | a4b8e67 | jest.config.js |

## Implementation Details

### parallel.ts (6 exports)

- **Local interfaces:** ValidationResult, PhaseContext, ParallelContext, BuildParallelContextOptions
- **Imported types:** DependencyGraph, BackendCapabilities, GrdConfig, MilestoneInfo, PhaseInfo, GateViolation, PreflightResult
- **require-as typed cast imports** from utils, backend, worktree, deps, roadmap, gates
- All 6 exported functions have explicit TypeScript signatures

### autopilot.ts (16 exports: 14 functions + 2 constants)

- **Local interfaces:** SpawnOptions, SpawnResult, SpawnConfig, StatusMarker, AutopilotOptions, PhaseStepResult, AutopilotResult, ResolvePhaseRangeResult
- **Imported types:** DependencyGraph, GrdConfig, PhaseInfo
- **require-as typed cast imports** from utils, roadmap, deps, child_process
- Subprocess spawning (spawnClaude, spawnClaudeAsync) fully typed with SpawnOptions/SpawnResult
- `(err as NodeJS.ErrnoException).code` pattern for ETIMEDOUT detection
- Promise<SpawnResult> return type for spawnClaudeAsync (consumed by evolve.ts in Wave 3)

### CJS Proxies

Both .js files converted to thin re-export proxies following the established pattern from lib/deps.js:
```javascript
module.exports = require('./parallel.ts');
module.exports = require('./autopilot.ts');
```

## Verification Results

| Check | Status |
|-------|--------|
| `npx tsc --noEmit` | PASS (zero errors) |
| parallel.test.js | PASS (57/57 tests) |
| autopilot.test.js | PASS (85/85 tests) |
| Coverage parallel.ts | 90/100/88 (thresholds: 85/100/80) |
| Coverage autopilot.ts | 93/96/81 (thresholds: 93/93/80) |
| `npx eslint lib/parallel.ts lib/autopilot.ts` | PASS (zero errors) |
| `any` in exported signatures | 0 occurrences |
| CJS proxy exports | 6 parallel, 16 autopilot |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] ResolvePhaseRangeResult missing depends_on field**
- **Found during:** Task 2
- **Issue:** The ResolvePhaseRangeResult interface only included `{ number, name, disk_status }`, dropping `depends_on` from the phase objects. This caused buildWaves to produce a single wave instead of respecting dependency ordering, breaking 1 test.
- **Fix:** Added `depends_on?: string | null` to the interface and mapped it through in the return value.
- **Files modified:** lib/autopilot.ts
- **Commit:** 5723d60

**2. [Rule 1 - Bug] Lint error: prefer-const for stoppedAt**
- **Found during:** Overall verification
- **Issue:** `stoppedAt` declared with `let` but never reassigned in runAutopilot.
- **Fix:** Changed to `const` to satisfy prefer-const lint rule.
- **Files modified:** lib/autopilot.ts
- **Commit:** f5450a1

## Self-Check: PASSED

All artifacts verified:
- lib/parallel.ts (404 lines, min 300) -- FOUND
- lib/autopilot.ts (720 lines, min 610) -- FOUND
- lib/parallel.js (CJS proxy with require('./parallel.ts')) -- FOUND
- lib/autopilot.js (CJS proxy with require('./autopilot.ts')) -- FOUND
- jest.config.js (thresholds updated) -- FOUND
- Commits 07c0e00, 5723d60, a4b8e67, f5450a1 -- ALL FOUND
