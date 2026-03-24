# State

**Updated:** 2026-03-24

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-24)

**Core value:** Transforms ad-hoc AI-assisted development into structured, repeatable, research-driven engineering with paper-backed decisions and quantitative evaluation.
**Current focus:** v0.3.22 Autopilot v2 — Parallel Execution with Serial Integration
**Previous:** v0.3.21 Elicitation Replacement (shipped 2026-03-24)

## Current Position

- **Active phase:** Phase 88 — Serial Merge Queue and Conflict Resolution (in progress)
- **Current plan:** 88-02 complete
- **Milestone:** v0.3.22 Autopilot v2 — Parallel Execution with Serial Integration
- **Status:** Phase 88 complete — serial merge queue + conflict resolution, 3630 tests passing
- **Progress:** [██████████] 100%
- **Next:** `/grd:plan-phase 89` grd/v0.3.22/88-88

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
| 86 | Elicitation Detection and Resolution Core | Complete (2026-03-24) |
| 87 | Post-Phase Pipeline Core | Complete (2026-03-24) |
| 88 | Serial Merge Queue and Conflict Resolution | In progress (plan 01 complete) |
| 89 | Write-Intent Manifests and Wave Builder | Not started |
| 90 | Autopilot Mode Changes and Parallel Execution | Not started |
| 91 | Integration Testing and Validation | Not started |

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
| v0.3.20 | Multi-Agent Cross-Backend Discussion | Shipped (Phases 82-85) |
| v0.3.21 | Elicitation Replacement | Shipped (Phase 86) |

## v0.3.22 Roadmap

| Phase | Goal | Requirements | Verification |
|-------|------|--------------|--------------|
| 87 — Post-Phase Pipeline Core | 4-step pipeline: simplify, PR, code review, rebase+merge | REQ-160–164 | proxy |
| 88 — Serial Merge Queue | Sequential merge gate + conflict resolution subprocess | REQ-165–166 | proxy |
| 89 — Write-Intent Manifests | `files_modified` declarations + wave conflict detection | REQ-167–169 | proxy |
| 90 — Autopilot Mode Changes | Milestone default, auto-resume, parallel worktrees, atomic writes | REQ-170–174 | proxy |
| 91 — Integration Testing | Unit tests (85%+ coverage) + E2E pipeline test | REQ-175–178 | full |

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
- Milestones shipped: 28 (v0.0.5 through v0.3.21)
- Total tests: 3,557 (after Phase 86 — elicitation module at 90%+ coverage)
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
- [Phase 86]: detectElicitation uses two-pass approach (numbered_options pre-scan, then line-by-line); buildElicitationContext budgets 5 sections at 1K/1K/2K/2K/1K chars; resolveElicitation uses rounds=1 with fallback chain: synthesis → first non-skipped round-1 → empty string
- [Phase 86]: ElicitationDetection confidence is 'high' for direct questions/numbered options/clarification phrases, 'medium' for option_prompt pattern
- [Design spec v0.3.22]: No external plugin dependencies — post-phase review uses built-in prompts, not 3rd-party toolkits
- [Design spec v0.3.22]: Sequential merge with rebase — PRs merge one at a time, always rebasing first; conflicts auto-resolved by claude -p subprocess
- [Design spec v0.3.22]: Reuse lib/worktree.ts functions (worktreePath, pushAndCreatePR, create/remove) — no parallel worktree management system
- [Design spec v0.3.22]: LLM-based conflict resolution falls back to halting for human intervention on non-zero subprocess exit
- [Design spec v0.3.22]: Write-intent is best-effort declaration, not a contract; --force-parallel overrides for intentional overlapping execution
- [Phase 88]: Promise-chain tail pattern for MergeQueue — zero external dependencies, FIFO arrival-order guaranteed by sequential tail.then() chaining
- [Phase 88]: Autopilot wave loop launches post-pipelines concurrently (Promise.all); only rebase+merge serialized via shared mergeQueue instance across all waves
- [Phase 88]: buildConflictResolvePrompt takes cwd (project root for findPhaseInternal) and wtPath (worktree for git conflict enumeration) as separate parameters; failure reason encodes conflicting files and manual steps as string for backward compatibility

## Known Bugs

None.

## Blockers

None.

## Session Continuity

- **Last action:** Phase 87 executed — post-phase pipeline core verified as pre-implemented
- **Stopped at:** Completed 88-02-PLAN.md
- **Next action:** `/grd:plan-phase 88`
- **Context needed:** .planning/STATE.md, .planning/ROADMAP.md, lib/autopilot.ts

---

*State managed by: Claude (grd-roadmapper)*
*Last updated: 2026-03-24*
