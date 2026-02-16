# Roadmap: GRD

## Milestones

- v0.0.5 Production-Ready R&D Workflow Automation - Phases 1-8 (shipped 2026-02-15)
- v0.1.0 Setup Functionality & Usability - Phases 9-13 (shipped 2026-02-16)
- v0.1.1 Completeness, Interoperability & Distribution - Phases 14-18 (shipped 2026-02-16)
- v0.1.2 Developer Experience & Requirement Traceability - Phases 19-21 (in progress)

## Phases

<details>
<summary>v0.0.5 Production-Ready R&D Workflow Automation (Phases 1-8) - SHIPPED 2026-02-15</summary>

Phases 1-8 delivered security hardening, modularization, test infrastructure, CI/CD, linting, input validation, documentation, and TUI dashboard. See `.planning/milestones/v0.0.5-ROADMAP.md` for details.

</details>

<details>
<summary>v0.1.0 Setup Functionality & Usability (Phases 9-13) - SHIPPED 2026-02-16</summary>

Phases 9-13 delivered multi-backend detection, context init enrichment, hierarchical roadmap planning, milestone lifecycle management, and auto-cleanup quality analysis. See `.planning/milestones/v0.1.0-ROADMAP.md` for details.

</details>

<details>
<summary>v0.1.1 Completeness, Interoperability & Distribution (Phases 14-18) - SHIPPED 2026-02-16</summary>

Phases 14-18 delivered doc drift detection, deferred validation resolution, MCP server, npm distribution, and end-to-end integration validation. See `.planning/milestones/v0.1.1-ROADMAP.md` for details.

</details>

### v0.1.2 Developer Experience & Requirement Traceability (In Progress)

**Milestone Goal:** Add requirement inspection commands, enhance phase-detail with requirement summaries, and provide convenience commands for navigating planning artifacts.
**Start:** 2026-02-16

- [x] **Phase 19: Requirement Inspection & Phase-Detail Enhancement** - Parse requirements and expose via CLI commands; enrich phase-detail with requirement summaries `implement` (completed 2026-02-16)
- [x] **Phase 20: Convenience Commands** - Planning artifact search and requirement status management `implement` (completed 2026-02-16)
- [ ] **Phase 21: MCP Extension & Wiring** - Expose all new commands as MCP tools with tests and docs `integrate`

## Phase Details

### Phase 19: Requirement Inspection & Phase-Detail Enhancement
**Goal**: Developers can look up any requirement by ID, list/filter requirements across milestones, query the traceability matrix, and see requirement summaries in phase-detail output
**Type**: implement
**Depends on**: Phase 18 (stable v0.1.1 foundation)
**Duration**: 1d
**Requirements**: REQ-31, REQ-32, REQ-33, REQ-34
**Verification Level**: proxy
**Plans:** 2/2 plans complete
  - [ ] 19-01-PLAN.md — Requirement parsing + get/list/traceability commands (TDD)
  - [ ] 19-02-PLAN.md — Phase-detail requirements enhancement (TDD)
**Success Criteria** (what must be TRUE):
  1. `grd-tools requirement get REQ-31` returns structured JSON with all fields (ID, title, priority, category, description, phase, status) parsed from REQUIREMENTS.md; falls back to archived milestone files when ID is not in current file
  2. `grd-tools requirement list` returns all requirements; `--phase 19`, `--priority P0`, `--status Pending`, `--category CLI`, and `--all` filters each narrow results correctly and compose together
  3. `grd-tools requirement traceability` returns the full traceability matrix as structured JSON; `--phase 19` returns only requirements mapped to that phase
  4. `cmdPhaseDetail` output for any phase (planned or unplanned) includes a requirements summary block showing each mapped REQ-ID with its title, priority, and status
  5. Test coverage for new requirement parsing and phase-detail enhancement functions >= 80% line coverage

### Phase 20: Convenience Commands
**Goal**: Developers can search across all planning artifacts by text query and update requirement statuses from the CLI without manually editing markdown
**Type**: implement
**Depends on**: Phase 19 (requirement parsing functions available for reuse)
**Duration**: 1d
**Requirements**: REQ-35, REQ-36
**Verification Level**: proxy
**Plans:** 2/2 plans complete
  - [ ] 20-01-PLAN.md — Search command for planning artifacts (TDD)
  - [ ] 20-02-PLAN.md — Requirement update-status command (TDD)
**Success Criteria** (what must be TRUE):
  1. `grd-tools search <query>` returns matching file paths, line numbers, and content lines from all `.planning/` markdown files; searches STATE.md, ROADMAP.md, REQUIREMENTS.md, PLAN.md, SUMMARY.md, and VERIFICATION.md files recursively
  2. `grd-tools requirement update-status REQ-31 Done` updates the Status column in the Traceability Matrix for that requirement; validates REQ-ID exists and status is one of Pending, In Progress, Done, Deferred
  3. Invalid REQ-ID or invalid status values produce clear error messages (not crashes or silent failures)
  4. Test coverage for search and update-status functions >= 80% line coverage

### Phase 21: MCP Extension & Wiring
**Goal**: All new CLI commands from Phases 19-20 are accessible as MCP tools with correct schemas, test coverage, and documentation
**Type**: integrate
**Depends on**: Phase 20 (all new CLI commands must exist before MCP wiring)
**Duration**: 1d
**Requirements**: REQ-37
**Verification Level**: proxy
**Success Criteria** (what must be TRUE):
  1. COMMAND_DESCRIPTORS includes tool definitions for: `requirement get`, `requirement list`, `requirement traceability`, `requirement update-status`, and `search` with correct parameter schemas (types, required/optional flags)
  2. MCP `tools/list` response includes all new tools; `tools/call` executes each successfully with valid input and returns structured JSON
  3. Invalid input to new MCP tools returns proper MCP error responses (not server crashes)
  4. MCP server tests cover all new tool definitions with >= 80% line coverage on new code
  5. `docs/mcp-server.md` updated with entries for all new MCP tools

## Progress

**Execution Order:** 19 -> 20 -> 21

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 19. Requirement Inspection & Phase-Detail | v0.1.2 | Complete    | 2026-02-16 | - |
| 20. Convenience Commands | v0.1.2 | Complete    | 2026-02-16 | - |
| 21. MCP Extension & Wiring | v0.1.2 | 0/0 | Not started | - |

## Deferred Validations

| Deferred From | Validation | Must Resolve By | Status |
|---------------|-----------|-----------------|--------|
| Phase 8 (DEFER-08-01) | User acceptance testing of TUI dashboard commands | post-v1.0 | Pending (not in scope) |
