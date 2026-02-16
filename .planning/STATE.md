# State

**Updated:** 2026-02-17

## Current Position

- **Active phase:** 21 — MCP Extension Wiring (complete)
- **Current plan:** 21-02 complete (2/2 plans done)
- **Milestone:** v0.1.3 — MCP Completion & Branching Fix
- **Progress:** [█████░░░░░] 50%
- **Next:** `/grd:plan-phase 22` or `/grd:execute-phase 22`

## Pending Decisions

None.

## Deferred Validations

| ID | Description | From Phase | Validates At | Status |
|----|-------------|-----------|-------------|--------|
| DEFER-08-01 | User acceptance testing of TUI dashboard commands | Phase 8 | post-v1.0 | PENDING |

## Key Decisions

| Date | Decision | Phase | Rationale |
|------|----------|-------|-----------|
| 2026-02-16 | v0.1.3 milestone: MCP wiring + branching fix | Milestone | REQ-37 carried from v0.1.2; REQ-38/39 fix execute-phase branching gap |
| 2026-02-16 | Phase 21 descoped from v0.1.2 to v0.1.3 | Milestone | Phase 19-20 complete; MCP wiring can wait for next milestone |
| 2026-02-16 | 3 phases for v0.1.2 (19-21): requirement inspection, convenience commands, MCP wiring | Roadmap | REQ-31/32/33/34 share parsing logic; REQ-35/36 are independent utilities; REQ-37 depends on all others |
| 2026-02-16 | No Integration Phase for v0.1.2 | Roadmap | No deferred validations; all verification is proxy-level (unit tests); MCP wiring phase validates end-to-end |
| 2026-02-16 | REQ-34 grouped with requirement commands (Phase 19) not convenience commands | Roadmap | Phase-detail enhancement requires the same REQUIREMENTS.md parser as REQ-31/32/33 |
| 2026-02-16 | Same-status update returns success without disk write (no-op) | Phase 20 | Regex replacement produces identical content when old==new; no-op avoids false error |
| 2026-02-17 | All 5 new MCP tools use raw=false for JSON output (not TUI text) | Phase 21 | Consistent with existing non-TUI tools; returns structured JSON for MCP responses |
| 2026-02-17 | New tools documented in separate Requirement & Search section, not appended to Utility | Phase 21 | Keeps logical grouping clear; Utility section count unchanged |

<details>
<summary>v0.1.1 Phase Decisions (33 decisions)</summary>

| Date | Decision | Phase | Rationale |
|------|----------|-------|-----------|
| 2026-02-16 | 5 phases for v0.1.1 (14-18) with deferred validations in Phase 15 | Roadmap | Early validation confirms stable foundation before MCP server feature |
| 2026-02-16 | MCP server + schema + tests in single phase (16) | Roadmap | Tightly coupled: implementation without tests is unverifiable |
| 2026-02-16 | Integration phase (18) collects REQ-20 + REQ-30 | Roadmap | Both are end-to-end validation; neither can run until all features complete |
| 2026-02-16 | Regex-based JSDoc parsing (not AST) for doc drift detection | Phase 14 | Consistent with Phase 13 approach; catches obvious mismatches without dependencies |
| 2026-02-16 | Config-gated doc_drift: omitted entirely when doc_sync=false | Phase 14 | Backward compatible; no null fields in quality report |
| 2026-02-16 | Graceful skip on missing files for all 3 doc drift functions | Phase 14 | Prevents false alerts on repos without CHANGELOG.md or README.md |
| 2026-02-16 | cleanup_threshold defaults to 5 when not specified in config | Phase 14 | Reasonable default; avoids cleanup plans for minor issues |
| 2026-02-16 | Non-blocking generateCleanupPlan in phase completion (try/catch) | Phase 14 | Consistent with quality analysis pattern; phase completion never fails |
| 2026-02-16 | cleanup_plan_generated field conditionally spread (absent when not generated) | Phase 14 | Clean JSON output; matches quality_report conditional pattern |
| 2026-02-16 | Lifecycle round-trip tests (not per-function) for DEFER-11-01 validation | Phase 15 | Multi-step chains catch integration bugs that unit tests miss |
| 2026-02-16 | Test generateCleanupPlan threshold-gating (not enabled-flag) for DEFER-13-01 | Phase 15 | generateCleanupPlan does not check enabled; non-interference relies on caller pattern |
| 2026-02-16 | Verify import isolation by scanning source text (not Node require cache) | Phase 15 | More reliable and deterministic assertions for import verification |
| 2026-02-16 | Accept dynamically detected OpenCode models in test assertions | Phase 15 | OpenCode `getCachedModels` returns CLI-detected models; tests verify non-raw-tier instead of exact match |
| 2026-02-16 | Config override (not env vars) for backend switching in context tests | Phase 15 | Tests highest-priority detection path; avoids env var interference between parallel tests |
| 2026-02-16 | Auto-generate MCP tool definitions from COMMAND_DESCRIPTORS table | Phase 16 | Ensures all CLI commands exposed without manual JSON authoring |
| 2026-02-16 | Output capture pattern (intercept process.exit) for MCP tool execution | Phase 16 | Reuses existing cmd* functions without modification |
| 2026-02-16 | 97 tools covering all routeCommand paths | Phase 16 | Every CLI command/subcommand has corresponding MCP tool |
| 2026-02-16 | Zero external dependencies for MCP server | Phase 16 | Node.js built-ins only, consistent with GRD philosophy |
| 2026-02-16 | raw=true for TUI commands (dashboard/health/phase-detail) in MCP | Phase 16 | Gets JSON output instead of TUI text for structured MCP responses |
| 2026-02-16 | Bulk execute lambda coverage via tools/call path for all 97 tools | Phase 16 | Exercises every COMMAND_DESCRIPTORS execute function for 93% line coverage |
| 2026-02-16 | Fixture isolation with createFixtureDir for MCP test safety | Phase 16 | Tests operate on temp .planning/ copy, not real project state |
| 2026-02-16 | Notification id-absence: no-id messages return null regardless of method | Phase 16 | Per JSON-RPC spec, messages without id are notifications requiring no response |
| 2026-02-16 | Package name 'grd-tools' for npm registry | Phase 17 | Avoiding reserved 'grd'; clear CLI tool identity |
| 2026-02-16 | Idempotent postinstall: exit silently if .planning/ exists, never fail | Phase 17 | Postinstall must not block npm install; existing projects unchanged |
| 2026-02-16 | Zero runtime dependencies maintained | Phase 17 | Only devDependencies; consistent with GRD zero-dep philosophy |
| 2026-02-16 | Resolve package root from __dirname (not cwd) for setup command | Phase 17 | Ensures correct path regardless of where user runs grd-tools setup |
| 2026-02-16 | Plugin directory path (not plugin.json) in user instructions | Phase 17 | Matches Claude Code plugin_path configuration convention |
| 2026-02-16 | Direct module import (not CLI subprocess) for E2E integration tests | Phase 18 | Speed and directness; validates actual module interfaces not CLI parsing |
| 2026-02-16 | execFileSync with input option for MCP handshake test (not spawn) | Phase 18 | Avoids open handle warnings; synchronous approach cleaner for test assertions |

</details>

<details>
<summary>v0.1.0 Phase Decisions (28 decisions)</summary>

| Date | Decision | Phase | Rationale |
|------|----------|-------|-----------|
| 2026-02-16 | Read config.json directly in backend.js (no utils.js import) | Phase 9 | Avoids circular dependency; utils.js will import from backend.js in plan 09-02 |
| 2026-02-16 | Exclude AGENT env var from OpenCode detection | Phase 9 | Per PITFALLS.md P5: too generic, collision risk with other tools |
| 2026-02-16 | Optional cwd param on resolveModelForAgent (not breaking) | Phase 9 | Appended as third parameter; existing 2-arg callers unchanged |
| 2026-02-16 | Dynamic CLAUDE_CODE_* env var cleanup in tests | Phase 9 | Hardcoding specific vars would break as Claude Code adds new env vars |
| 2026-02-16 | Use loadConfig in cmdDetectBackend (not backend.js readConfig) | Phase 10 | Consistent with other cmd* functions; avoids duplicating internal readConfig |
| 2026-02-16 | Wire detect-backend as top-level CLI route (no subcommand) | Phase 10 | Matches flat CLI pattern of existing commands |
| 2026-02-16 | Direct import from lib/backend.js in context.js | Phase 10 | utils.js does not re-export getBackendCapabilities; cleaner than adding re-export |
| 2026-02-16 | All 14 cmdInit* get backend fields regardless of model usage | Phase 10 | Consistent output shape; any downstream agent can adapt behavior |
| 2026-02-16 | Used extractFrontmatter from lib/frontmatter.js for YAML parsing | Phase 11 | Consistency with existing codebase; avoids duplicating YAML parser |
| 2026-02-16 | Later milestones: success_criteria optional (warning not error) | Phase 11 | Per research: Later tier is rough; forcing success criteria adds false precision |
| 2026-02-16 | getPlanningMode reads frontmatter for explicit override | Phase 11 | Allows users to opt-out of hierarchical mode without deleting file |
| 2026-02-16 | Local flag() helper in commands.js for generate subcommand args | Phase 11 | Avoids importing grd-tools.js flag(); keeps commands.js self-contained |
| 2026-02-16 | In-place markdown editing via replaceSubsection helper | Phase 12 | Preserves exact formatting; avoids serialize/deserialize round-trip |
| 2026-02-16 | Later->Next promotion fills TBD placeholders for required fields | Phase 12 | Allows user to fill in details after promotion |
| 2026-02-16 | Next->Now uses estimated_start as Start date when available | Phase 12 | Falls back to today's date if no estimated_start |
| 2026-02-16 | Structured JSON output includes content field with full updated markdown | Phase 12 | Downstream agents can write the file directly without re-parsing |
| 2026-02-16 | Promote subcommand calls getMilestoneTier on result to report new_tier | Phase 12 | Provides immediate feedback on promotion result |
| 2026-02-16 | Refine subcommand reports updated_fields array from Object.keys(updates) | Phase 12 | Audit trail for which fields were updated |
| 2026-02-16 | execFileSync over execSync for ESLint subprocess | Phase 13 | Avoids shell quoting issues with JSON rule arguments |
| 2026-02-16 | Relative paths with -- separator for ESLint v10 | Phase 13 | ESLint v10 rejects absolute paths outside base path |
| 2026-02-16 | fs.realpathSync for macOS path resolution in ESLint parser | Phase 13 | Handles /var vs /private/var symlink for correct relative paths |
| 2026-02-16 | Regex-based dead export detection (not AST) for v0.1.0 | Phase 13 | Simplicity goal; catches obvious dead exports, edge cases accepted |
| 2026-02-16 | Non-blocking quality analysis in phase completion | Phase 13 | Errors swallowed via try/catch; phase completion never fails due to quality checks |
| 2026-02-16 | quality_report field conditionally spread (absent when disabled) | Phase 13 | Clean JSON output; no null fields when feature is off |
| 2026-02-16 | Raw output appends quality only when issues > 0 | Phase 13 | Non-interference: clean output when no problems found |

</details>

<details>
<summary>v0.0.5 Decisions (57 decisions)</summary>

| Date | Decision | Phase | Rationale |
|------|----------|-------|-----------|
| 2026-02-12 | Modularize before testing | Planning | 5,632-line monolith is untestable; modules enable unit testing |
| 2026-02-12 | Jest for test framework | Planning | Largest ecosystem, snapshot testing, coverage tooling |
| 2026-02-12 | Defer TypeScript to post-v1.0 | Planning | Scope control; v1.0 is quality infrastructure only |
| 2026-02-12 | Defer async I/O migration | Planning | Sync is fine for CLI tools; no measurable benefit |
| 2026-02-12 | Security before modularization | Planning | Small, high-impact, low-risk changes land first |
| 2026-02-15 | JSDoc only on exported functions | Phase 7 | Internal helpers left undocumented; 105 exported functions across 10 modules |
| 2026-02-15 | Accepted module sizes above 500 lines per Phase 3 decisions | Phase 7 | commands.js (1,573), tracker.js (996), phase.js (904), context.js (840) accepted |

(Full log: see `.planning/milestones/v0.0.5-ROADMAP.md`)

</details>

## Blockers

None.

## Performance Metrics

**Velocity (v0.0.5):**
- Total plans completed: 23
- Average duration: 5.6 min
- Total execution time: ~2.2 hours

**Velocity (v0.1.0):**
- Total plans completed: 10 (+1 dynamic-models)
- Average duration: 3.7 min
- Total execution time: ~41 min

**Velocity (v0.1.1):**
- Total plans completed: 11
- Average duration: 3.7 min
- Total execution time: ~41 min

**Velocity (v0.1.2):**
- Total plans completed: 4
- Average duration: 3.3 min
- Total execution time: ~13 min

**Velocity (v0.1.3):**
- Total plans completed: 2
- Average duration: 1.5 min
- Total execution time: ~3 min

| Phase | Plan | Duration | Tasks | Files | Test Delta |
|-------|------|----------|-------|-------|------------|
| 19 | 01 | 5min | 2 | 5 | +17 tests (1322 total) |
| 19 | 02 | 3min | 2 | 3 | +5 tests (1327 total) |
| 20 | 01 | 2min | 2 | 3 | +8 tests (1335 total) |
| 20 | 02 | 3min | 2 | 3 | +8 tests (1343 total) |
| 21 | 01 | 2min | 2 | 2 | +14 tests (1357 total) |
| 21 | 02 | 1min | 1 | 1 | — |

## Session Continuity

- **Last action:** Completed 21-02 (MCP docs update plan 2)
- **Stopped at:** Phase 21 fully complete (2/2 plans)
- **Next action:** `/grd:plan-phase 22` or `/grd:execute-phase 22`
- **Context needed:** 1,357 tests passing; 102 MCP tools; Phase 21 complete; Phase 22 = execute-phase branching fix

---

*State managed by: Claude (grd-executor)*
*Last updated: 2026-02-17*
