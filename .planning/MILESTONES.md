# Milestones

## v0.0.5 Production-Ready R&D Workflow Automation (Shipped: 2026-02-15)

**Phases completed:** 8 phases, 23 plans, 57 decisions
**Timeline:** 2026-02-12 to 2026-02-15 (4 days)
**Source:** 10 lib/ modules (8,295 LOC), 14 test files (8,010 LOC), 594 tests

**Key accomplishments:**
- Security hardening: eliminated all execSync shell interpolation, added input validation, git operation whitelist, SECURITY.md
- Modularized 5,632-line monolith into 10 lib/ modules with 108 exports (thin 188-line CLI router)
- Jest test suite with 594 tests, 80%+ line coverage across all modules
- CI/CD pipeline: GitHub Actions with Node 18/20/22 matrix, release workflow
- ESLint v10 flat config + Prettier enforcement (zero errors across 12 source files)
- Input validation layer on all CLI arguments (phase names, file paths, git refs, flags)
- JSDoc on all 105 exported functions (294 @param tags)
- TUI dashboard, phase-detail, and health commands for project visibility
- Version bumped to 0.0.5 with CHANGELOG, CONTRIBUTING.md, and manifest

**Deferred to next milestone:**
- DEFER-08-01: User acceptance testing of TUI dashboard commands

---


## v0.1.0 Setup Functionality & Usability (Shipped: 2026-02-16)

**Phases completed:** 5 phases (9-13), 10 plans, 62 key decisions
**Timeline:** 2026-02-16 (single day)
**Source:** 3 new lib/ modules (+1,755 LOC), 858 tests (+264 from v0.0.5)

**Key accomplishments:**
- Multi-backend detection for Claude Code, Codex CLI, Gemini CLI, and OpenCode with config override waterfall
- Dynamic model detection via OpenCode `opencode models` CLI probing with 5-min TTL cache
- Backend capabilities registry with per-backend feature flags (subagents, parallel, teams, hooks, mcp)
- `detect-backend` CLI command with `models_source` field and all 14 `cmdInit*` enriched with backend info
- Hierarchical roadmap (Now/Next/Later) with LONG-TERM-ROADMAP.md schema, mode auto-detection
- Milestone refinement (in-place markdown editing) and promotion (Later->Next->Now tier movement)
- `long-term-roadmap` CLI with 9 subcommands: parse, validate, display, mode, generate, refine, promote, tier, history
- Auto-cleanup quality analysis: ESLint complexity, dead export detection, file size checks at phase boundaries
- `quality-analysis` CLI command with structured reports; non-blocking integration into phase completion

**Deferred to v0.1.1:**
- Phase 14: Auto-Cleanup Doc Drift & Plan Generation (REQ-10, REQ-11)
- Phase 15: Integration & Validation
- DEFER-09-01: Backend detection accuracy across real environments
- DEFER-10-01: Context init backward compatibility under all 4 backends
- DEFER-11-01: Long-term roadmap round-trip integrity
- DEFER-13-01: Auto-cleanup non-interference when disabled

---


## v0.1.1 Completeness, Interoperability & Distribution (Shipped: 2026-02-16)

**Phases completed:** 5 phases (14-18), 11 plans, 37 key decisions
**Timeline:** 2026-02-16 (single day)
**Source:** 1,305 tests (+447 from v0.1.0), MCP server (1,608 LOC), expanded cleanup (1,393 LOC)

**Key accomplishments:**
- Doc drift detection (CHANGELOG staleness, broken README links, JSDoc mismatches) with auto-generated cleanup plans
- 4 expanded quality analyzers: test coverage gaps, export consistency, doc staleness, config schema drift
- All 4 deferred validations resolved: backend detection, context init, roadmap round-trip, cleanup non-interference
- MCP server exposing 97 GRD CLI commands as MCP tools via JSON-RPC 2.0 over stdio with auto-generated schemas
- npm package configuration: postinstall scaffold, setup command, CI pack/install validation
- E2E workflow integration test validating full phase lifecycle
- MCP server usage guide (docs/mcp-server.md)

**Deferred:**
- DEFER-08-01: User acceptance testing of TUI dashboard commands (post-v1.0)

---


## v0.1.2 Developer Experience & Requirement Traceability (Shipped: 2026-02-16)

**Delivered:** Requirement inspection CLI commands, phase-detail requirement summaries, planning artifact search, and requirement status management.

**Phases completed:** 2 phases (19-20), 4 plans, 4 key decisions
**Timeline:** 2026-02-16 (single day)
**Source:** 1,343 tests (+38 from v0.1.1), 7 files modified (+1,135 LOC)

**Key accomplishments:**
- Requirement inspection: `get`, `list`, `traceability` commands with archived milestone fallback and composable filters
- Phase-detail enhancement with requirement summaries (JSON + TUI output)
- Planning artifact search command with recursive case-insensitive matching
- Requirement status update command with regex-based traceability matrix editing

**Descoped to next milestone:**
- Phase 21: MCP Extension & Wiring (REQ-37)
- DEFER-08-01: User acceptance testing of TUI dashboard (post-v1.0)

**Git range:** `feat(19-01)` -> `docs(phase-20)`

**What's next:** MCP tool wiring for new CLI commands, then further usability improvements

---

