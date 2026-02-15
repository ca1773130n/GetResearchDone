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
- 108 CLI commands across 10 modular lib/ modules

## Core Value

Transforms ad-hoc AI-assisted development into structured, repeatable, research-driven engineering with paper-backed decisions and quantitative evaluation.

## Current State (v0.0.5)

**Shipped:** 2026-02-15

v0.0.5 is the production-quality engineering foundation:
- 10 lib/ modules (8,295 LOC) with 108 exports, thin 188-line CLI router
- 594 Jest tests (8,010 LOC), 80%+ line coverage
- ESLint v10 + Prettier, zero errors
- GitHub Actions CI (Node 18/20/22), release workflow
- Security hardened: zero execSync shell interpolation, input validation, git whitelist
- JSDoc on all 105 exported functions
- CONTRIBUTING.md for developer onboarding

## Validated Goals (v0.0.5)

- [x] Test coverage >= 80% on lib/ modules
- [x] CI checks pass (lint, test, security audit) on every PR
- [x] Zero known command injection vulnerabilities
- [x] Modular architecture (no file > 1,600 lines; router = 188 lines)
- [x] .gitignore in place; no sensitive files in git history
- [x] Consistent code style (ESLint + Prettier)
- [x] Version sync across VERSION, plugin.json, CHANGELOG.md
- [x] Input validation on all CLI arguments
- [x] Developer documentation (CONTRIBUTING.md, JSDoc, SECURITY.md)

## Open Items

- DEFER-08-01: User acceptance testing of TUI dashboard commands (post-v0.0.5)
- TypeScript migration (evaluated and deferred)
- Async I/O optimization (evaluated and deferred)
- Plugin marketplace publishing

## Constraints

- **Zero external runtime deps:** Only Node.js built-in modules. Dev-dependencies (jest, eslint) acceptable.
- **Backward compatibility:** All existing commands must continue to work. No breaking changes to `.planning/` file formats.
- **Plugin compatibility:** Must remain compatible with Claude Code plugin SDK.

## Stakeholders

- **Primary users:** Developers using Claude Code for R&D projects
- **Contributors:** Developers extending GRD with new commands/agents
- **Maintainers:** Core team maintaining grd-tools.js and plugin infrastructure

---

*Project definition: 2026-02-12*
*v0.0.5 milestone shipped: 2026-02-15*
