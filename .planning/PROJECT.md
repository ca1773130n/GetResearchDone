# Project: GRD

**Created:** 2026-02-12
**Updated:** 2026-02-17

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
- 120+ CLI commands across 13 modular lib/ modules

## Core Value

Transforms ad-hoc AI-assisted development into structured, repeatable, research-driven engineering with paper-backed decisions and quantitative evaluation.

## Current Milestone (v0.1.1)

**Goal:** Completeness, interoperability, and distribution readiness

v0.1.1 completes deferred work from v0.1.0, adds MCP server mode for programmatic access, and prepares for plugin marketplace publishing:
- **Deferred completion:** Doc drift detection, auto-generated cleanup plans, integration & validation phase
- **Deferred validations:** Backend detection accuracy, context init backward compat, roadmap round-trip integrity, auto-cleanup non-interference
- **MCP server mode:** Expose GRD commands as MCP tools so any MCP-compatible client can call them programmatically
- **Plugin marketplace prep:** npm packaging, versioned releases, install/update scripts

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

## Validated Goals (v0.1.0)

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
- DEFER-09-01: Backend detection accuracy across real environments (v0.1.1)
- DEFER-10-01: Context init backward compatibility under all 4 backends (v0.1.1)
- DEFER-11-01: Long-term roadmap round-trip integrity (v0.1.1)
- DEFER-13-01: Auto-cleanup non-interference when disabled (v0.1.1)
- Phase 14: Auto-Cleanup Doc Drift & Plan Generation (deferred to v0.1.1)
- Phase 15: Integration & Validation (deferred to v0.1.1)
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
