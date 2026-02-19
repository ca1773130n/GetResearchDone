---
one-liner: Phase directory archival and validation gate system implemented
status: complete
duration: 15min
tasks_completed: 3
files_changed: 11
test_delta: "+34 tests (1433 total)"
---

# Summary 26-01: Phase Directory Collision Fix

## What was done

### Phase Directory Archival
- Added archival logic to `cmdMilestoneComplete` in `lib/phase.js` that copies all phase directories to `.planning/milestones/{version}-phases/` and removes originals
- Result object now includes `archived.phases: true` and `archived.phase_count`
- Archival is non-blocking (try/catch, never fails milestone completion)

### Validation Gate System (`lib/gates.js`)
- 6 gate check functions: `checkOrphanedPhases`, `checkPhaseInRoadmap`, `checkPhaseHasPlans`, `checkNoStaleArtifacts`, `checkOldPhasesArchived`, `checkMilestoneStateCoherence`
- Declarative `GATE_REGISTRY` mapping 10 commands to gate arrays
- `runPreflightGates(cwd, command, options)` — returns `{ passed, bypassed, errors, warnings, command }`
- YOLO bypass: `autonomous_mode: true` → gates report violations but `passed` is always `true`
- New project safety: no ROADMAP.md → all checks pass

### Integration
- `lib/utils.js`: Added `autonomous_mode` to `loadConfig()`, `consistency_warning` to `findPhaseInternal`
- `lib/context.js`: Gates in `cmdInitExecutePhase`, `cmdInitPlanPhase`, `cmdInitNewMilestone` (with `suggested_start_phase`)
- `lib/phase.js`: Gates in `cmdPhaseAdd`, `cmdPhaseInsert`, `cmdPhaseComplete`, `cmdMilestoneComplete`; refactored `cmdValidateConsistency` to reuse gate checks

### Command Updates
- `commands/complete-milestone.md`: Documented phase archival in archive step and success criteria
- `commands/new-milestone.md`: Reference `suggested_start_phase` from init context

### Tests
- New `tests/unit/gates.test.js` — 20 tests covering all gate checks, registry, and preflight runner
- Updated `tests/unit/phase.test.js` — 3 tests for phase archival in milestone complete
- Updated `tests/unit/utils.test.js` — 4 tests for consistency_warning and autonomous_mode
- Total: 1433 tests passing across 27 suites

## Files Changed

| File | Change |
|------|--------|
| `lib/gates.js` | NEW — Validation gate system (~280 lines) |
| `lib/phase.js` | Phase archival, gate integration, refactored validate-consistency |
| `lib/utils.js` | autonomous_mode in loadConfig, consistency_warning in findPhaseInternal |
| `lib/context.js` | Gate integration in 3 init functions, suggested_start_phase |
| `commands/complete-milestone.md` | Phase archival documentation |
| `commands/new-milestone.md` | suggested_start_phase reference |
| `tests/unit/gates.test.js` | NEW — 20 gate tests |
| `tests/unit/phase.test.js` | 3 archival tests |
| `tests/unit/utils.test.js` | 4 config/warning tests |
| `.claude-plugin/plugin.json` | Version bump to 0.1.6 |
| `package.json` | Version bump to 0.1.6 |

## Decisions

| Decision | Rationale |
|----------|-----------|
| Gate failures use `output()` (exit 0) not `error()` (exit 1) | Agents receive JSON they can interpret, not crash |
| `checkPhaseInRoadmap` only flags phases that exist on disk but not in ROADMAP | Avoids intercepting "phase not found" flow for genuinely nonexistent phases |
| Phase archival is non-blocking (try/catch) | Milestone completion should never fail due to archival issues |
| Promoted orphan detection from warnings to errors in validate-consistency | Orphaned phases indicate real state corruption, not minor issues |

## Metrics

- Duration: ~15 min
- Tests: 1433 (was 1399, +34)
- New module: lib/gates.js (~280 lines)
- Gate checks: 6
- Commands gated: 10
