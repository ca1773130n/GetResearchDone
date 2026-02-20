# Requirements: v0.2.2 — quickDir Routing Fix & Migration Skill

## Goal

Fix quickDir routing bug (always routing to anonymous instead of current milestone), fix cmdMigrateDirs quick/ target, and provide user-facing migration skill with agent for complex migration scenarios.

## Requirements

### quickDir Routing Fix

| ID | Requirement | Priority | Category |
|----|-------------|----------|----------|
| REQ-70 | `quickDir()` must accept optional `milestone` parameter and default to `currentMilestone(cwd)` when omitted, matching the signature pattern of `phasesDir`, `researchDir`, `todosDir`, `codebaseDir` | P0 | Bugfix |
| REQ-71 | `cmdMigrateDirs` must route `quick/` to the current milestone (from STATE.md), not hardcoded `anonymous` | P0 | Bugfix |

### Migration Skill

| ID | Requirement | Priority | Category |
|----|-------------|----------|----------|
| REQ-72 | Provide `/grd:migrate` skill (commands/migrate.md) and `grd-migrator` agent (agents/grd-migrator.md) so users can invoke migration for both trivial and complex .planning/ layout items | P1 | Feature |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| REQ-70 | Phase 37 | Done |
| REQ-71 | Phase 37 | Done |
| REQ-72 | Phase 37 | Done |
