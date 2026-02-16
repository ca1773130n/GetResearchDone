# Roadmap: GRD

## Milestones

- v0.0.5 Production-Ready R&D Workflow Automation - Phases 1-8 (shipped 2026-02-15)
- v0.1.0 Setup Functionality & Usability - Phases 9-13 (shipped 2026-02-16)
- v0.1.1 Completeness, Interoperability & Distribution - Phases 14-18 (shipped 2026-02-16)
- v0.1.2 Developer Experience & Requirement Traceability - Phases 19-20 (shipped 2026-02-16)
- v0.1.3 MCP Completion & Branching Fix - Phases 21-22 (in progress)

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

<details>
<summary>v0.1.2 Developer Experience & Requirement Traceability (Phases 19-20) - SHIPPED 2026-02-16</summary>

Phases 19-20 delivered requirement inspection commands, phase-detail requirement summaries, planning artifact search, and requirement status management. See `.planning/milestones/v0.1.2-ROADMAP.md` for details.

</details>

### v0.1.3 MCP Completion & Branching Fix (In Progress)

**Milestone Goal:** Wire v0.1.2 CLI commands as MCP tools and fix execute-phase branching to always fork from latest main.
**Start:** 2026-02-16

- [ ] **Phase 21: MCP Extension & Wiring** - Expose all new commands as MCP tools with tests and docs `integrate`
- [ ] **Phase 22: Execute-Phase Branching Fix** - Checkout main and pull before creating phase branches `implement`

## Phase Details

### Phase 21: MCP Extension & Wiring
**Goal**: All new CLI commands from v0.1.2 (requirement get/list/traceability/update-status, search) are accessible as MCP tools with correct schemas, test coverage, and documentation
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

### Phase 22: Execute-Phase Branching Fix
**Goal**: When branching is enabled, execute-phase checks out main and pulls from remote before creating phase branches, ensuring branches always fork from the latest main
**Type**: implement
**Depends on**: Phase 21 (stable MCP foundation; branching fix is independent but sequenced for clean milestone)
**Duration**: 1d
**Requirements**: REQ-38, REQ-39
**Verification Level**: proxy
**Success Criteria** (what must be TRUE):
  1. `cmdInitExecutePhase` output includes `base_branch` field (default `"main"`) when `branching_strategy` is not `"none"`
  2. `execute-phase` command template runs `git checkout <base_branch> && git pull origin <base_branch>` before `git checkout -b $BRANCH_NAME` when branching is enabled
  3. Uncommitted changes on current branch produce a warning (not a crash); execution continues on current branch if checkout fails
  4. Missing remote or offline scenario skips pull gracefully (warns, continues from local base branch)
  5. Already-on-main scenario skips checkout (only pulls)
  6. Tests verify `cmdInitExecutePhase` includes `base_branch` in branching output

## Progress

**Execution Order:** 21 -> 22

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 21. MCP Extension & Wiring | v0.1.3 | 0/0 | Not started | - |
| 22. Execute-Phase Branching Fix | v0.1.3 | 0/0 | Not started | - |

## Deferred Validations

| Deferred From | Validation | Must Resolve By | Status |
|---------------|-----------|-----------------|--------|
| Phase 8 (DEFER-08-01) | User acceptance testing of TUI dashboard commands | post-v1.0 | Pending (not in scope) |
