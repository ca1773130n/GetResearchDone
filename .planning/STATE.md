# State

**Updated:** 2026-03-23

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-23)

**Core value:** Transforms ad-hoc AI-assisted development into structured, repeatable, research-driven engineering with paper-backed decisions and quantitative evaluation.
**Current focus:** v0.3.20 Multi-Agent Cross-Backend Discussion — All phases complete (82-85)
**Previous:** v0.3.13 Wireup Command (shipped 2026-03-21)

## Current Position

- **Active phase:** 85 — MCP Tools, CLI Command, and Testing (Complete)
- **Current plan:** All plans complete (85-01, 85-02)
- **Milestone:** v0.3.20 Multi-Agent Cross-Backend Discussion
- **Status:** All phases complete (82-85), milestone ready
- **Progress:** [██████████] 100%
- **Next:** `/grd:complete-milestone`

## Phase Summary

| Phase | Name | Status |
|-------|------|--------|
| 78 | Core Wireup Infrastructure | Complete (2026-03-20) |
| 79 | Wireup Orchestrator and Execution | Complete (2026-03-20) |
| 80 | Browser Execution and Auto-Fix | Complete (2026-03-21) |
| 81 | MCP Tools, Testing, and Integration | Complete (2026-03-21) |
| 82 | Discussion Infrastructure | Complete (2026-03-23) |
| 83 | Discussion Protocol Core | Complete (2026-03-23) |
| 84 | Workflow Integration | Complete (2026-03-23) |
| 85 | MCP Tools, CLI Command, and Testing | Complete (2026-03-23) |

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
| v0.3.12 | Multi-Backend Feature Sync | Shipped (Phases 74-77, 8 plans) |
| v0.3.13 | Wireup Command | Shipped (Phases 78-81, 12 plans) |

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
| DEFER-78-01 | Live discovery accuracy on real GRD codebase | Phase 78 | Phase 79, plan 79-01 | PENDING |
| DEFER-78-02 | Scenario executability by Phase 79 HTTP/CLI engine | Phase 78 | Phase 79, plan 79-02 | PENDING |
| DEFER-80-01 | Live Playwright MCP scenario execution (requires Playwright MCP environment) | Phase 80 | Future | PENDING |

## Performance Metrics

**Cumulative:**
- Milestones shipped: 27 (v0.0.5 through v0.3.13)
- Total tests: 3,557 (after Phase 85 — added 380 tests across discussion module)
- Total lib/ modules: 27 (22 top-level .ts + 5 sub-module directories: cli/, commands/, context/, evolve/, wireup/)
- Total commands: 41
- MCP tools: 132

## Decisions

- [Phase 74]: codex.haiku mapped to gpt-5.4-mini; gemini.sonnet mapped to gemini-3.1-flash; max_output_tokens typed as nullable
- [Phase 75]: StopFailure handler checks autopilot.log presence; PostCompact is minimal/informational; CLAUDE_PLUGIN_DATA boundary documented
- [Phase 78]: Discovery uses regex-based export extraction; State file at .planning/WIREUP-STATE.json; scenario steps are category-specific
- [Phase 79]: HTTP execution uses built-in fetch with AbortController; CLI uses spawnSync; cmdInitWireup in lib/wireup/cli.ts mirrors cmdInitEvolve
- [Phase 80]: detectPlaywright() mirrors detectWebMcp() waterfall; autoFixIssue delegates via reRunFn callback; WIREUP_FIX_MODEL aliases SONNET_MODEL
- [Phase 81]: Five wireup cmd wrappers follow evolve pattern; coverage threshold on lib/wireup/index.ts barrel
- [Phase 82]: BACKEND_CLI_MAP maps four dispatchable backends; DISCUSSION_SONNET_MODEL = 'sonnet' ceiling; detectAvailableBackends uses 5-min TTL cache; config validates backend_roles and discussion sections
- [Phase 83]: runDiscussion() uses Promise.allSettled() for structural concurrency (not OS-level parallelism — execFileSync limitation); fs.writeFileSync called synchronously before return; buildSynthesisPrompt/buildDiscussionMarkdown are internal helpers not exported
- [Phase 84]: reviewPlanViaBackend and reviewCodeViaBackend check reviewer != primary backend to prevent self-review
- [Phase 84]: before_execution gated as === true (explicit opt-in) vs before_planning as !== false (default enabled)
- [Phase 84]: Workflow integration test mocks use existing jest.mock infrastructure; no spyOn needed for runDiscussion since execFileSync mock controls all dispatch output
- [Phase 85]: readConfig exported from lib/backend.ts for MCP tool use; grd_discussion_run accepts comma-separated participants string; four discussion tools registered in COMMAND_DESCRIPTORS
- [Phase 85]: Integration test uses real fs/paths modules (not mocked) for true E2E path resolution; mocks only execFileSync and detectAvailableBackends
- [Phase 85]: Four discussion MCP tools registered (grd_discussion_run/config/history, grd_backends_available); discussion.ts coverage 100% lines/branches/functions; DEFER-84-03 closed

## Known Bugs

None.

## Blockers

None.

## Session Continuity

- **Last action:** Executed Phase 85 — 2 plans, 1 wave, all verified
- **Stopped at:** Phase 85 complete, milestone ready
- **Next action:** `/grd:complete-milestone`
- **Context needed:** .planning/STATE.md, .planning/ROADMAP.md

---

*State managed by: Claude (grd-roadmapper)*
*Last updated: 2026-03-23*
