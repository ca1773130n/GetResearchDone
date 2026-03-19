# State

**Updated:** 2026-03-19

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-19)

**Core value:** Transforms ad-hoc AI-assisted development into structured, repeatable, research-driven engineering with paper-backed decisions and quantitative evaluation.
**Current focus:** v0.3.12 Multi-Backend Feature Sync — Phases 74-77
**Previous:** v0.3.7 Claude Code Feature Sync (shipped 2026-03-12)

## Current Position

- **Active phase:** 74 — Model Mappings and Capability Flags
- **Current plan:** —
- **Milestone:** v0.3.12 Multi-Backend Feature Sync
- **Status:** Ready to plan
- **Progress:** [████░░░░░░] 38%
- **Next:** Plan and execute Phase 74

## Phase Summary

| Phase | Name | Status |
|-------|------|--------|
| 74 | Model Mappings and Capability Flags | Not started |
| 75 | Hook Events and Plugin Infrastructure | Not started |
| 76 | Agent Frontmatter and MCP Elicitation | Not started |
| 77 | Testing and Documentation | Not started |

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
| v0.3.7 | Claude Code Feature Sync | Shipped (Phases 71-73, 5 plans) |

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
- Milestones shipped: 25 (v0.0.5 through v0.3.7)
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
- **[71-02]** EffortLevel types in Backend Types section (not Utility) since effort is a backend capability
- **[71-02]** Unknown agents default to 'medium' effort; resolveEffortForAgent returns null for unsupported backends
- **[71-03]** Every X_model field paired with X_effort field using resolveEffortForAgent
- [Phase 72]: ExitWorktree placed before completion options; CLAUDE_SKILL_DIR documented via HTML comments
- **[72-03]** No CLAUDE_SKILL_DIR migration needed — all CLAUDE_PLUGIN_ROOT usages are cross-directory refs
- **[73-02]** Effort values in CLAUDE.md sourced from EFFORT_PROFILES in backend.ts for accuracy
- [Phase 74]: codex.haiku mapped to gpt-5.4-mini (2x faster than gpt-5.4, ideal for subagent/discovery work, REQ-110)
- [Phase 74]: gemini.sonnet mapped to gemini-3.1-flash (updated Gemini 3.1 Flash sonnet-equivalent, REQ-113)
- [Phase 74]: opencode mappings verified unchanged: anthropic/claude-opus-4-6, claude-sonnet-4-6, claude-haiku-4-5 (REQ-116)
- [Phase 74]: max_output_tokens typed as nullable; model_overrides_available uses strict equality; grd backend has model_overrides: false
- [Phase 75]: plugin_data_available added to both cmdInitExecutePhase and cmdInitPlanPhase; plugin_data_dir included alongside for consumer convenience; documentation-only changes in evolve/state.ts and autopilot.ts

## Known Bugs

None.

## Blockers

None.

## Session Continuity

- **Last action:** Created roadmap for v0.3.12 Multi-Backend Feature Sync (Phases 74-77)
- **Stopped at:** Completed 75-02-PLAN.md
- **Next action:** Plan Phase 74 (`/grd:plan-phase 74`)
- **Context needed:** 18 requirements (REQ-102 through REQ-119) mapped across 4 phases

---

*State managed by: Claude (grd-roadmapper)*
*Last updated: 2026-03-19*
