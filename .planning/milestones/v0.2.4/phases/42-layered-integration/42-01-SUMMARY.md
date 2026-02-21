---
status: complete
started: 2026-02-21
completed: 2026-02-21
duration: 30min
---

# Summary: Plan 42-01 — Constitution, Standards, & Ceremony Infrastructure

## One-Liner
Added core infrastructure for PRINCIPLES.md, standards discovery, and scale-adaptive ceremony across path resolver, init workflows, and config defaults.

## What Was Built

### standardsDir in lib/paths.js
- Added `standardsDir(cwd, milestone)` function following existing `todosDir`/`quickDir` pattern
- Milestone-scoped: `.planning/milestones/{milestone}/standards/` with fallback to `.planning/standards/`
- 5 new tests in paths.test.js

### PRINCIPLES.md Support
- Added `principles_exists: pathExistsInternal(cwd, '.planning/PRINCIPLES.md')` to 4 init functions
- Added `--include principles` handling for execute-phase and plan-phase
- 12 new tests in context.test.js

### Ceremony Level Detection
- Created `inferCeremonyLevel(config, phaseInfo, cwd)` function
- Priority: user override > per-phase override > auto-inference
- Auto-inference signals: plan count (>=5 → full, >=2 → standard, else light), research refs, eval targets in roadmap
- Added `ceremony_level` to execute-phase and plan-phase init results
- 8 new tests

### Ceremony Config Defaults
- Added `ceremony: { default_level: 'auto', phase_overrides: {} }` to `cmdConfigEnsureSection` defaults
- 1 new test

### Standards Detection
- Added `standards_exists` and `standards_dir` to all 4 init functions
- 5 new tests

## Key Files

| File | Action | Purpose |
|------|--------|---------|
| lib/paths.js | Modified | Added standardsDir() |
| lib/context.js | Modified | Added principles, ceremony, standards to init |
| lib/commands.js | Modified | Added ceremony config defaults |
| tests/unit/paths.test.js | Modified | +5 tests |
| tests/unit/context.test.js | Modified | +25 tests |
| tests/unit/commands.test.js | Modified | +1 test |

## Commits
- `701dbb2` feat(paths): add standardsDir for standards discovery layer
- `fc1fda1` feat(context): add PRINCIPLES.md support to all init workflows
- `fae6c2b` feat(context): add ceremony level auto-inference to init workflows
- `f2d255b` feat(config): add ceremony section to default config
- `ebba9d3` feat(context): add standards directory detection to init workflows

## Self-Check: PASSED
- [x] All 5 tasks completed
- [x] Each committed individually
- [x] 1,679 tests pass (48 new from this milestone)
- [x] No regressions
