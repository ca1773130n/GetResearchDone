# Roadmap: GRD

## Milestones

- v0.0.5 Production-Ready R&D Workflow Automation - Phases 1-8 (shipped 2026-02-15)
- v0.1.0 Setup Functionality & Usability - Phases 9-13 (shipped 2026-02-16)
- v0.1.1 Completeness, Interoperability & Distribution - Phases 14-18 (in progress)

## Phases

<details>
<summary>v0.0.5 Production-Ready R&D Workflow Automation (Phases 1-8) - SHIPPED 2026-02-15</summary>

Phases 1-8 delivered security hardening, modularization, test infrastructure, CI/CD, linting, input validation, documentation, and TUI dashboard. See `.planning/milestones/v0.0.5-ROADMAP.md` for details.

</details>

<details>
<summary>v0.1.0 Setup Functionality & Usability (Phases 9-13) - SHIPPED 2026-02-16</summary>

Phases 9-13 delivered multi-backend detection, context init enrichment, hierarchical roadmap planning, milestone lifecycle management, and auto-cleanup quality analysis. See `.planning/milestones/v0.1.0-ROADMAP.md` for details.

</details>

### v0.1.1 Completeness, Interoperability & Distribution (In Progress)

**Milestone Goal:** Complete deferred work from v0.1.0, add MCP server mode for programmatic access, and prepare for npm distribution.
**Start:** 2026-02-16

- [ ] **Phase 14: Auto-Cleanup Doc Drift & Plan Generation** - Detect stale docs and auto-generate cleanup plans `implement`
- [ ] **Phase 15: Deferred Validations** - Resolve all v0.1.0 deferred verification items `evaluate`
- [ ] **Phase 16: MCP Server** - Expose GRD commands as MCP tools over stdio `implement`
- [ ] **Phase 17: npm Distribution** - Package for npm publishing with install scripts `implement`
- [ ] **Phase 18: Integration & Distribution Validation** - End-to-end validation of all v0.1.1 features `integrate`

## Phase Details

### Phase 14: Auto-Cleanup Doc Drift & Plan Generation
**Goal**: Doc drift detection and auto-generated cleanup plans work as part of the phase-boundary quality analysis pipeline
**Type**: implement
**Depends on**: Phase 13 (auto-cleanup foundation from v0.1.0)
**Duration**: 1d
**Requirements**: REQ-18, REQ-19
**Verification Level**: proxy
**Success Criteria** (what must be TRUE):
  1. Running quality analysis at a phase boundary detects stale CHANGELOG (not updated since last plan), broken README links, and JSDoc parameter mismatches
  2. Doc drift warnings appear in the phase completion summary alongside existing quality metrics (ESLint complexity, dead exports, file size)
  3. When quality issues exceed configured thresholds, a cleanup PLAN.md is auto-generated in standard format with frontmatter, and appended to the current phase
  4. User can execute or skip the generated cleanup plan without disrupting normal workflow
**Plans**: 2 plans
Plans:
- [ ] 14-01-PLAN.md — TDD: Doc drift detection functions (CHANGELOG, README links, JSDoc)
- [ ] 14-02-PLAN.md — Auto-generate cleanup PLAN.md and wire into phase completion

### Phase 15: Deferred Validations
**Goal**: All four v0.1.0 deferred validations pass, confirming backend detection, context init, hierarchical roadmap, and auto-cleanup work correctly in real conditions
**Type**: evaluate
**Depends on**: Phase 14 (auto-cleanup must be complete before validating non-interference)
**Duration**: 1d
**Requirements**: REQ-21, REQ-22, REQ-23, REQ-24
**Verification Level**: full
**Success Criteria** (what must be TRUE):
  1. `detectBackend()` returns correct results with real (non-mocked) environment variable patterns from all 4 backends; edge cases documented (DEFER-09-01)
  2. All 14 `cmdInit*` functions produce correct output under each backend; existing orchestrator commands work unchanged when backend is `claude` (DEFER-10-01)
  3. Full long-term roadmap lifecycle round-trips without data loss: create -> refine -> promote through tiers -> generate ROADMAP.md (DEFER-11-01)
  4. When `phase_cleanup.enabled` is false, cleanup system produces no extra output, no performance impact, and no side effects during phase execution (DEFER-13-01)
**Plans**: TBD

### Phase 16: MCP Server
**Goal**: Any MCP-compatible client can call GRD commands programmatically via a stdio-based MCP server with auto-generated tool schemas
**Type**: implement
**Depends on**: Phase 15 (validations confirm stable foundation for new feature)
**Duration**: 2d
**Requirements**: REQ-25, REQ-26, REQ-27
**Verification Level**: proxy
**Success Criteria** (what must be TRUE):
  1. `bin/grd-mcp-server.js` starts, performs MCP protocol handshake (initialize/initialized), and responds to `tools/list` with auto-generated tool definitions for all GRD CLI commands
  2. Tool schemas (name, description, inputSchema with parameter types, required/optional flags) are generated dynamically from the CLI command registry at server startup -- not hardcoded
  3. `tools/call` executes representative commands (state load, phase add, validate consistency) and returns structured JSON results
  4. Invalid tool names and malformed input return proper MCP error responses (not crashes)
  5. Test coverage for MCP server module >= 80% line coverage
**Plans**: TBD

### Phase 17: npm Distribution
**Goal**: GRD is packaged for npm publishing with correct bin entries, files whitelist, and post-install setup
**Type**: implement
**Depends on**: Phase 16 (MCP server must exist for bin entry and install validation)
**Duration**: 1d
**Requirements**: REQ-28, REQ-29
**Verification Level**: proxy
**Success Criteria** (what must be TRUE):
  1. `package.json` has correct name, version synced with VERSION file, bin entries for `grd-tools` and `grd-mcp-server`, files whitelist (bin/, lib/, commands/, agents/, plugin.json), and engines >= Node 18
  2. Post-install script creates `.planning/` directory structure and default `config.json` when not present; does nothing when structure already exists
  3. `grd-tools setup` command configures Claude Code plugin.json to point at the installed package location
  4. Zero external runtime dependencies (devDependencies only for jest/eslint)
**Plans**: TBD

### Phase 18: Integration & Distribution Validation
**Goal**: All v0.1.1 features work together end-to-end, and the npm package installs and functions correctly from tarball
**Type**: integrate
**Depends on**: Phase 17 (all implementation phases complete)
**Duration**: 1d
**Requirements**: REQ-20, REQ-30
**Verification Level**: full
**Success Criteria** (what must be TRUE):
  1. Full test suite passes with no regressions from v0.1.0 baseline (858 tests); new tests bring total above 950
  2. End-to-end workflow validates: backend detection -> context init -> quality analysis -> doc drift -> MCP server tool call -- all in sequence without errors
  3. `npm pack` produces valid tarball; `npm install` from tarball works; `grd-tools` CLI is accessible; `grd-mcp-server` starts and responds to initialize
  4. plugin.json paths resolve correctly when installed via npm (not just from repo checkout)
  5. CI job validates pack + install cycle on Node 18, 20, and 22

## Progress

**Execution Order:** 14 -> 15 -> 16 -> 17 -> 18

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 14. Auto-Cleanup Doc Drift | v0.1.1 | 0/2 | Not started | - |
| 15. Deferred Validations | v0.1.1 | 0/TBD | Not started | - |
| 16. MCP Server | v0.1.1 | 0/TBD | Not started | - |
| 17. npm Distribution | v0.1.1 | 0/TBD | Not started | - |
| 18. Integration & Validation | v0.1.1 | 0/TBD | Not started | - |

## Deferred Validations

| Deferred From | Validation | Must Resolve By | Status |
|---------------|-----------|-----------------|--------|
| Phase 9 (DEFER-09-01) | Backend detection accuracy across real environments | Phase 15 | Pending |
| Phase 10 (DEFER-10-01) | Context init backward compatibility under all 4 backends | Phase 15 | Pending |
| Phase 11 (DEFER-11-01) | Long-term roadmap round-trip integrity | Phase 15 | Pending |
| Phase 13 (DEFER-13-01) | Auto-cleanup non-interference when disabled | Phase 15 | Pending |
| Phase 8 (DEFER-08-01) | User acceptance testing of TUI dashboard commands | post-v1.0 | Pending (not in scope) |
