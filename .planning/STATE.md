# State

**Updated:** 2026-03-11

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-11)

**Core value:** Transforms ad-hoc AI-assisted development into structured, repeatable, research-driven engineering with paper-backed decisions and quantitative evaluation.
**Current focus:** v0.3.7 Claude Code Feature Sync — adopt effort levels, new hooks, ExitWorktree, SKILL_DIR, cron awareness
**Previous:** v0.3.6 Backend Ecosystem Sync (shipped 2026-03-11)

## Current Position

- **Active phase:** Phase 73 — Testing & Documentation
- **Current plan:** Plan 2 of 2 complete
- **Milestone:** v0.3.7 Claude Code Feature Sync
- **Status:** v0.3.7 Claude Code Feature Sync milestone complete
- **Progress:** [██████████] 100%
- **Next:** Complete milestone v0.3.7

## Phase Summary

| Phase | Name | Status |
|-------|------|--------|
| 71 | Effort Levels & Capability Flags | Complete (3/3 plans) |
| 72 | Hook Events & Tool Updates | Complete (3/3 plans) |
| 73 | Testing & Documentation | Complete (2/2 plans) |

## Shipped Milestones (v0.3.x series)

| Version | Name | Status |
|---------|------|--------|
| v0.3.0 | TypeScript Migration & Refactoring | Shipped (Phases 58-68, 44 plans) |
| v0.3.1 | Node v22 Compatibility Fix | Shipped (bugfix) |
| v0.3.2 | Autopilot & Evolve Fixes | Shipped (bugfix) |
| v0.3.3 | Evolve Dynamic Scanning & Dashboard Fix | Shipped (bugfix + feature) |
| v0.3.4 | Evolve Auto-Commit & PR Creation | Shipped (feature) |
| v0.3.5 | Evolve Stabilization & Product Ideation | Shipped (feature) |
| v0.3.6 | Backend Ecosystem Sync | Shipped (Phases 69-70, 4 plans) |

## Deferred Validations

| ID | Description | From Phase | Validates At | Status |
|----|-------------|-----------|-------------|--------|
| DEFER-08-01 | User acceptance testing of TUI dashboard commands | Phase 8 | post-v1.0 | PENDING |
| DEFER-30-01 | Full parallel execution with real teammate spawning on Claude Code | Phase 30 | Future | PARTIALLY RESOLVED |
| DEFER-43-01 | Live code-reviewer does not block on missing VERIFICATION.md | Phase 43 | Live run | PENDING |
| DEFER-43-02 | detectWebMcp() returns available:true with real MCP env | Phase 43 | Live MCP env | PENDING |
| DEFER-44-01 | execute-phase WebMCP health checks fire correctly at runtime | Phase 44 | Live MCP env | PENDING |
| DEFER-44-02 | grd-verifier populates VERIFICATION.md WebMCP section | Phase 44 | Live MCP env | PENDING |
| DEFER-44-03 | grd-eval-planner generates useWebMcpTool() for frontend phases | Phase 44 | Live MCP env | PENDING |
| DEFER-54-01 | Markdown splitting produces correct partials for real-world large files | Phase 54 | Future | CANNOT VALIDATE |
| DEFER-56-01 | Full evolve loop with sonnet-tier models produces meaningful improvements | Phase 56 | Future | PARTIALLY RESOLVED |
| DEFER-68-01 | Real Claude subprocess produces product-level feature ideas | Phase 68 | Next real grd:evolve run | PENDING |
| DEFER-68-02 | Autoplan creates feature-oriented phases from product-ideation groups | Phase 68 | First real infinite evolve cycle | PENDING |

## Performance Metrics

**Cumulative:**
- Milestones shipped: 24 (v0.0.5 through v0.3.6)
- Total tests: ~2,930
- Total lib/ modules: 25 (22 top-level .ts + 3 decomposed sub-module directories)
- Total commands: 40
- Total lib/ LOC: ~20,320

## Decisions

- [Phase 69]: Gemini models updated: gemini-3-pro->3.1-pro, gemini-2.5-flash->3.1-flash-lite; Codex opus->gpt-5.4; OpenCode->claude-4-6; Gemini subagents GA+parallel; Codex hooks+teams enabled
- **[70-01]** Phase 69 added no deprecation/migration code; deprecated model tests documented as N/A
- **[70-01]** worktree-parallel-e2e sequential fallback test switched from codex to gemini (codex now has teams:true)
- **[70-02]** CODEX_THREAD_ID kept for backward compat despite possible deprecation
- **[70-02]** OPENCODE_PID excluded from detection (process management var, not presence indicator)
- **[71-01]** Only Claude gets true for effort/http_hooks/cron capability flags; other backends false
- **[71-01]** Removed premature unused imports from backend.ts to pass lint
- **[71-02]** EffortLevel types in Backend Types section (not Utility) since effort is a backend capability
- **[71-02]** Unknown agents default to 'medium' effort; resolveEffortForAgent returns null for unsupported backends
- **[71-02]** Used untyped require for backend imports in utils.ts to match existing codebase patterns
- **[71-03]** Every X_model field paired with X_effort field using resolveEffortForAgent
- **[71-03]** Effort fields null (not omitted) when backend lacks effort support
- **[71-03]** cron_available placed after claude_available in autopilot init as related capability flag
- [Phase 72]: ExitWorktree placed before completion options to ensure main repo context for merge/PR/keep/discard
- [Phase 72]: CLAUDE_SKILL_DIR documented via HTML comments (invisible to agents, visible to maintainers)
- [Phase 72]: Hook handlers placed in lib/worktree.ts alongside existing hook handlers for colocation
- [Phase 72]: Used ROUTE_DESCRIPTORS for CLI routing; all hooks default to continue/acknowledge
- **[72-03]** No CLAUDE_SKILL_DIR migration needed — all CLAUDE_PLUGIN_ROOT usages are cross-directory refs
- **[73-02]** Effort values in CLAUDE.md sourced from EFFORT_PROFILES in backend.ts for accuracy
- **[73-02]** cron_available tested via backend_capabilities in context init (covers all backends)

## Known Bugs

None.

## Blockers

None.

## Session Continuity

- **Last action:** Completed 73-02 (context tests & CLAUDE.md documentation updates)
- **Stopped at:** Completed 73-02-PLAN.md
- **Next action:** Complete milestone v0.3.7
- **Context needed:** All 3 phases complete (71, 72, 73); ready for milestone completion

## Accumulated Context

### v0.3.x Release History
- v0.3.0: Full TypeScript migration (Phases 58-68, 44 plans)
- v0.3.1-v0.3.5: Incremental bugfix and feature releases
- v0.3.6: Backend ecosystem sync — model mappings, capability flags, OpenCode status

### Claude Code Features Research (v2.1.50-v2.1.72)
- Effort levels: low/medium/high (v2.1.68/72), Opus 4.6 defaults medium, "ultrathink" for high
- HTTP hooks: POST JSON to URL (v2.1.63)
- New hook events: InstructionsLoaded, TeammateIdle/TaskCompleted with stop control (v2.1.69)
- agent_id/agent_type in hook events (v2.1.69)
- ${CLAUDE_SKILL_DIR} variable for skill self-reference (v2.1.69)
- ExitWorktree tool (v2.1.72)
- Auto-memory with /memory (v2.1.59)
- Cron/loop scheduling (v2.1.71)

---

*State managed by: Claude (grd-roadmapper)*
*Last updated: 2026-03-11*
