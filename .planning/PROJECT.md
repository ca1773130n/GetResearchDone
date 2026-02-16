# Project: GRD

**Created:** 2026-02-12
**Updated:** 2026-02-16

## Vision

GRD (Get Research Done) is a production-ready R&D workflow automation plugin for Claude Code that transforms ad-hoc AI-assisted development into structured, repeatable, research-driven engineering.

## What This Is

A Claude Code plugin providing:
- Paper-driven R&D workflow automation (survey, deep-dive, feasibility, plan, execute, evaluate, iterate)
- Tiered verification (sanity/proxy/deferred) for research phases
- Autonomous mode for unattended operation
- Issue tracker integration (GitHub Issues, Jira via MCP Atlassian)
- TUI dashboard for project visibility (dashboard, phase-detail, health)
- Multi-backend support (Claude Code, Codex CLI, Gemini CLI, OpenCode) with dynamic model detection
- Hierarchical roadmap planning (Now/Next/Later milestone tiers) with progressive refinement
- Phase-boundary quality analysis (ESLint complexity, dead exports, file size)
- Requirement inspection and traceability (get, list, traceability, update-status)
- Planning artifact search across all .planning/ files
- 120+ CLI commands across 13 modular lib/ modules

## Core Value

Transforms ad-hoc AI-assisted development into structured, repeatable, research-driven engineering with paper-backed decisions and quantitative evaluation.

## Previous State (v0.1.2)

**Shipped:** 2026-02-16

v0.1.2 added developer experience improvements and requirement traceability:
- Requirement commands: Look up requirements by ID, list/filter by phase/priority/status/category, traceability matrix queries
- Phase-detail enhancement: Show requirement summaries (JSON + TUI) for any phase
- Convenience commands: Planning artifact search, requirement status update
- 1,343 tests passing

## Previous State (v0.1.1)

**Shipped:** 2026-02-16

v0.1.1 completed deferred work, added MCP server mode, and prepared for npm distribution:
- MCP server exposing 97 CLI commands as MCP tools
- Doc drift detection with 4 expanded quality analyzers
- All deferred validations resolved
- npm package configuration with CI pack/install validation
- 1,305 tests passing

## Previous State (v0.1.0)

**Shipped:** 2026-02-16

v0.1.0 adds setup functionality and usability on top of v0.0.5's engineering foundation:
- 13 lib/ modules (~10,050 LOC) with 120+ exports, thin CLI router
- 858 Jest tests, 80%+ line coverage across all modules
- Multi-backend support: Claude Code, Codex CLI, Gemini CLI, OpenCode with dynamic model detection
- Hierarchical roadmap planning with Now/Next/Later milestone tiers and progressive refinement
- Phase-boundary quality analysis (ESLint complexity, dead exports, file size)
- ESLint v10 + Prettier, zero errors
- GitHub Actions CI (Node 18/20/22), release workflow
- Security hardened: zero execSync shell interpolation, input validation, git whitelist

## Validated Goals (v0.1.2)

- [x] `grd-tools requirement get REQ-31` returns structured JSON with all fields; falls back to archived milestones
- [x] `grd-tools requirement list` with composable --phase, --priority, --status, --category, --all filters
- [x] `grd-tools requirement traceability` returns full matrix as JSON with --phase filter
- [x] `cmdPhaseDetail` includes requirements summary block for any phase
- [x] `grd-tools search <query>` searches all .planning/ markdown files recursively
- [x] `grd-tools requirement update-status` edits traceability matrix with validation
- [x] 38 new tests across 4 plans, 1,343 total passing

<details>
<summary>Validated Goals (v0.1.1)</summary>

- [x] Doc drift detection: CHANGELOG staleness, broken README links, JSDoc mismatches
- [x] 4 expanded quality analyzers: test coverage gaps, export consistency, doc staleness, config schema drift
- [x] All 4 deferred validations resolved (DEFER-09/10/11/13)
- [x] MCP server with 97 tools via JSON-RPC 2.0 over stdio
- [x] npm package with postinstall scaffold and setup command
- [x] E2E workflow integration test validating full phase lifecycle

</details>

<details>
<summary>Validated Goals (v0.1.0)</summary>

- [x] `detectBackend()` returns correct backend for all 4 backends via env var detection
- [x] `resolveModelInternal()` maps opus/sonnet/haiku to correct backend-specific model names
- [x] Config override takes precedence over environment detection
- [x] Dynamic model detection via OpenCode CLI probing with 5-min TTL cache
- [x] `detect-backend` CLI command with JSON/raw output and `models_source` field
- [x] All 14 `cmdInit*` functions include backend and model info
- [x] LONG-TERM-ROADMAP.md schema with Now/Next/Later tiers
- [x] `long-term-roadmap` CLI with 9 subcommands (parse, validate, display, mode, generate, refine, promote, tier, history)
- [x] Planning mode auto-detection (hierarchical vs progressive)
- [x] Milestone refinement and promotion through tiers
- [x] `phase_cleanup` config with quality analysis at phase boundaries
- [x] `quality-analysis` CLI command with structured reports
- [x] 858 tests passing, 80%+ coverage on all new modules

</details>

<details>
<summary>Validated Goals (v0.0.5)</summary>

- [x] Test coverage >= 80% on lib/ modules
- [x] CI checks pass (lint, test, security audit) on every PR
- [x] Zero known command injection vulnerabilities
- [x] Modular architecture (no file > 1,600 lines; router = 188 lines)
- [x] .gitignore in place; no sensitive files in git history
- [x] Consistent code style (ESLint + Prettier)
- [x] Version sync across VERSION, plugin.json, CHANGELOG.md
- [x] Input validation on all CLI arguments
- [x] Developer documentation (CONTRIBUTING.md, JSDoc, SECURITY.md)

</details>

## Open Items

- DEFER-08-01: User acceptance testing of TUI dashboard commands (post-v1.0)
- Phase 21: MCP Extension & Wiring (descoped from v0.1.2, REQ-37)
- TypeScript migration (evaluated and deferred)
- Async I/O optimization (evaluated and deferred)
- Plugin marketplace publishing

## Constraints

- **Zero external runtime deps:** Only Node.js built-in modules. Dev-dependencies (jest, eslint) acceptable.
- **Backward compatibility:** All existing commands must continue to work. No breaking changes to `.planning/` file formats.
- **Plugin compatibility:** Must remain compatible with Claude Code plugin SDK.
- **Multi-backend:** Must work across Claude Code, Codex, Gemini CLI, OpenCode without requiring backend-specific code in the plugin's core logic.

## Stakeholders

- **Primary users:** Developers using Claude Code for R&D projects
- **Contributors:** Developers extending GRD with new commands/agents
- **Maintainers:** Core team maintaining grd-tools.js and plugin infrastructure

---

*Project definition: 2026-02-12*
*v0.0.5 milestone shipped: 2026-02-15*
*v0.1.0 milestone shipped: 2026-02-16*
*v0.1.1 milestone shipped: 2026-02-16*
*v0.1.2 milestone shipped: 2026-02-16*
