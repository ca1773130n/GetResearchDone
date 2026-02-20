# Milestone v0.1.2: Developer Experience & Requirement Traceability

**Status:** SHIPPED 2026-02-16
**Phases:** 19-20
**Total Plans:** 4

## Overview

v0.1.2 adds requirement inspection commands, enhances phase-detail with requirement summaries, and provides convenience commands for navigating planning artifacts.

## Phases

### Phase 19: Requirement Inspection & Phase-Detail Enhancement

**Goal**: Developers can look up any requirement by ID, list/filter requirements across milestones, query the traceability matrix, and see requirement summaries in phase-detail output
**Type**: implement
**Depends on**: Phase 18 (stable v0.1.1 foundation)
**Plans**: 2 plans

- [x] 19-01: Requirement parsing + get/list/traceability commands (TDD)
- [x] 19-02: Phase-detail requirements enhancement (TDD)

**Details:**
- Implemented 3 new CLI commands: `requirement get`, `requirement list`, `requirement traceability`
- Created reusable `parseRequirements()` and `parseTraceabilityMatrix()` helpers
- Archived milestone fallback for cross-milestone requirement lookups
- All filters compose with AND logic: `--phase`, `--priority`, `--status`, `--category`, `--all`
- Enhanced `cmdPhaseDetail` to extract and display requirements from ROADMAP.md phase sections
- JSON and TUI output for requirement summaries in phase-detail

---

### Phase 20: Convenience Commands

**Goal**: Developers can search across all planning artifacts by text query and update requirement statuses from the CLI without manually editing markdown
**Type**: implement
**Depends on**: Phase 19 (requirement parsing functions available for reuse)
**Plans**: 2 plans

- [x] 20-01: Search command for planning artifacts (TDD)
- [x] 20-02: Requirement update-status command (TDD)

**Details:**
- Implemented `grd-tools search <query>` with recursive .md file discovery and case-insensitive matching
- Implemented `grd-tools requirement update-status` with regex-based traceability matrix cell editing
- Same-status no-op optimization to prevent false errors
- Multi-word "In Progress" handling via CLI arg joining

---

## Milestone Summary

**Key Decisions:**
- 3 phases for v0.1.2 (19-21): requirement inspection, convenience commands, MCP wiring
- REQ-34 grouped with requirement commands (Phase 19) due to shared parsing logic
- Same-status update returns success without disk write (no-op)
- Phase 21 (MCP Extension & Wiring) descoped to future milestone

**Research Outcomes:**
- N/A (implement-type milestone, no research phases)

**Issues Resolved:**
- Description parsing cross-section bleed (19-01)
- Coverage-gaps test regression from new fixture (19-01)
- Same-status update edge case (20-02)

**Issues Deferred:**
- Phase 21 (MCP Extension & Wiring) — REQ-37 deferred to next milestone
- DEFER-08-01: User acceptance testing of TUI dashboard commands (post-v1.0)

**Deferred Validations Resolved:**
- None (no deferred validations in scope for v0.1.2)

**Technical Debt Incurred:**
- REQ-37 (MCP tools for new commands) not yet wired — new CLI commands exist but lack MCP tool definitions

---

_For current project status, see .planning/ROADMAP.md_
