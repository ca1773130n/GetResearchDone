# Roadmap: GRD v0.1.0 -- Setup Functionality & Usability

**Created:** 2026-02-16
**Updated:** 2026-02-16

## Milestones

- v0.0.5 Production-Ready R&D Workflow Automation - Phases 1-8 (shipped 2026-02-15)
- v0.1.0 Setup Functionality & Usability - Phases 9-15 (in progress)

## Phases

<details>
<summary>v0.0.5 Production-Ready R&D Workflow Automation (Phases 1-8) - SHIPPED 2026-02-15</summary>

See `.planning/milestones/v0.0.5-ROADMAP.md` for full phase details.

**Summary:** 8 phases, 23 plans, 57 decisions. Security hardening, modularization (10 lib/ modules), 594 Jest tests (80%+ coverage), CI/CD, ESLint/Prettier, input validation, TUI dashboard.

</details>

### v0.1.0 Setup Functionality & Usability (In Progress)

**Milestone Goal:** Improve setup functionality and usability by supporting multiple AI backends, adding auto-refactoring/doc-sync options, and enabling hierarchical long-term roadmap planning.
**Start:** 2026-02-16

- [x] **Phase 9: Backend Detection & Model Resolution** - Core detection, model mapping, config schema, and tests `implement`
- [x] **Phase 10: Backend Capabilities & Context Integration** - CLI command, capabilities registry, context init integration `implement`
- [x] **Phase 11: Hierarchical Roadmap Schema & Commands** - LONG-TERM-ROADMAP.md schema, create/display command, mode detection `implement`
- [ ] **Phase 12: Hierarchical Roadmap Refinement & Promotion** - Refine/promote commands and full test suite `implement`
- [ ] **Phase 13: Auto-Cleanup Config & Quality Analysis** - Config option, phase-boundary quality analysis `implement`
- [ ] **Phase 14: Auto-Cleanup Doc Drift & Plan Generation** - Doc drift detection, auto-generated cleanup plans `implement`
- [ ] **Phase 15: Integration & Validation** - Cross-feature integration, regression, deferred validations `integrate`

## Phase Details

### Phase 9: Backend Detection & Model Resolution
**Goal**: GRD can detect which AI coding CLI is running and resolve abstract model tiers (opus/sonnet/haiku) to backend-specific model names
**Type**: implement
**Depends on**: Phase 8 (v0.0.5 complete)
**Duration**: 3d
**Requirements**: REQ-01, REQ-02, REQ-03, REQ-07
**Verification Level**: proxy
**Success Criteria** (what must be TRUE):
  1. `detectBackend()` returns correct backend identifier for each of the 4 backends when their respective environment variables are set
  2. `resolveModelInternal()` maps opus/sonnet/haiku to correct backend-specific model names for all 4 backends (Claude, Codex, Gemini, OpenCode)
  3. Config override (`backend` field in config.json) takes precedence over environment detection
  4. User-specified `backend_models` in config.json override default model mappings
  5. Unit tests for `lib/backend.js` achieve >= 80% line coverage, covering detection waterfall, model resolution, and config override precedence
**Plans**: 2 plans
  - [x] 09-01-PLAN.md -- TDD: Create lib/backend.js with detection waterfall, model resolution, capabilities (Wave 1)
  - [x] 09-02-PLAN.md -- Integrate backend.js into utils.js, extend loadConfig, add integration tests (Wave 2)

### Phase 10: Backend Capabilities & Context Integration
**Goal**: Orchestrator commands receive backend info and adapt behavior based on backend capabilities
**Type**: implement
**Depends on**: Phase 9
**Duration**: 2d
**Requirements**: REQ-04, REQ-05, REQ-06
**Verification Level**: proxy
**Success Criteria** (what must be TRUE):
  1. `detect-backend` CLI command returns JSON with `backend`, `models`, and `capabilities` fields; `--raw` returns backend name only
  2. `getBackendCapabilities()` returns correct boolean flags (subagents, parallel, teams, hooks, mcp) for each of the 4 backends
  3. All `cmdInit*` functions in `lib/context.js` include `backend` and backend-resolved model names in their output
  4. Existing orchestrator commands continue to work unchanged when backend is `claude` (backward compatibility)
**Plans**: 2 plans
Plans:
- [x] 10-01-PLAN.md -- TDD: detect-backend CLI command with JSON/raw output (Wave 1)
- [x] 10-02-PLAN.md -- Add backend field and capabilities to all 14 cmdInit* functions (Wave 1)

### Phase 11: Hierarchical Roadmap Schema & Commands
**Goal**: Users can create and view a long-term roadmap with Now/Next/Later milestone tiers, with automatic mode detection
**Type**: implement
**Depends on**: Phase 8 (independent of backend work)
**Duration**: 3d
**Requirements**: REQ-12, REQ-13, REQ-14
**Verification Level**: proxy
**Success Criteria** (what must be TRUE):
  1. `LONG-TERM-ROADMAP.md` schema supports Now (goals + requirements + phases), Next (goals + key requirements), and Later (goals + relative timing) tiers with 3-5 milestones ahead
  2. `/grd:long-term-roadmap` command creates a new long-term roadmap via interactive wizard on first run, and displays current roadmap with tier indicators on subsequent runs
  3. Planning mode auto-detection works: hierarchical mode activates when `LONG-TERM-ROADMAP.md` exists, progressive mode (current behavior) when it does not
  4. All existing commands work unchanged in progressive mode (no breaking changes)
**Plans**: 2 plans
Plans:
- [x] 11-01-PLAN.md -- TDD: Create lib/long-term-roadmap.js with parsing, validation, generation, and mode detection (Wave 1)
- [x] 11-02-PLAN.md -- Add long-term-roadmap CLI command with parse/validate/display/mode/generate subcommands (Wave 2)

### Phase 12: Hierarchical Roadmap Refinement & Promotion
**Goal**: Users can progressively refine rough milestones into detailed plans and promote them through tiers toward execution
**Type**: implement
**Depends on**: Phase 11
**Duration**: 3d
**Requirements**: REQ-15, REQ-16, REQ-17
**Verification Level**: proxy
**Success Criteria** (what must be TRUE):
  1. `/grd:refine-milestone <N>` uses discussion protocol to progressively refine a Later/Next milestone into detailed goals, requirements, and phase structure, updating LONG-TERM-ROADMAP.md tier as refinement progresses
  2. `/grd:promote-milestone <N>` moves milestones between tiers (Later->Next, Next->Now) and triggers full ROADMAP.md generation when promoted to Now
  3. Promotion integrates with existing `/grd:new-milestone` flow without duplication
  4. Unit tests cover LONG-TERM-ROADMAP.md parsing, tier detection, mode detection, and milestone promotion logic; integration tests cover create/display/refine commands; coverage >= 80%
**Plans**: 2 plans
Plans:
- [ ] 12-01-PLAN.md -- TDD: Add refineMilestone, promoteMilestone, getMilestoneTier, updateRefinementHistory to lib/long-term-roadmap.js (Wave 1)
- [ ] 12-02-PLAN.md -- Add refine/promote/tier/history CLI subcommands with comprehensive tests (Wave 2)

### Phase 13: Auto-Cleanup Config & Quality Analysis
**Goal**: GRD can optionally run quality analysis at phase boundaries, detecting code quality issues after plan execution
**Type**: implement
**Depends on**: Phase 8 (independent of backend and roadmap work)
**Duration**: 2d
**Requirements**: REQ-08, REQ-09
**Verification Level**: proxy
**Success Criteria** (what must be TRUE):
  1. `phase_cleanup` config section exists in config.json schema with `enabled`, `refactoring`, and `doc_sync` boolean fields; default is disabled
  2. When `phase_cleanup.enabled` is true, quality analysis runs after the last plan in a phase and produces a structured quality report
  3. Quality analysis covers: ESLint complexity check, dead export detection (unused exports vs. test coverage), file size check against thresholds
  4. Quality report is surfaced in phase completion summary output
**Plans**: TBD

### Phase 14: Auto-Cleanup Doc Drift & Plan Generation
**Goal**: GRD detects documentation drift and can auto-generate cleanup plans when quality issues exceed thresholds
**Type**: implement
**Depends on**: Phase 13
**Duration**: 2d
**Requirements**: REQ-10, REQ-11
**Verification Level**: proxy
**Success Criteria** (what must be TRUE):
  1. Doc drift detection identifies: CHANGELOG not updated since last plan, broken README links, JSDoc parameter mismatches
  2. Doc drift warnings appear in phase completion summary when `phase_cleanup.doc_sync` is enabled
  3. When quality analysis finds issues above configured thresholds, a cleanup PLAN.md is auto-generated and appended to the phase
  4. Auto-generated cleanup plans are skippable (user can execute or skip without blocking phase completion)
**Plans**: TBD

### Phase 15: Integration & Validation
**Goal**: All three v0.1.0 features work together in a complete end-to-end workflow with no regressions
**Type**: integrate
**Depends on**: Phase 10, Phase 12, Phase 14
**Duration**: 2d
**Requirements**: (cross-cutting validation of all REQ-01 through REQ-17)
**Verification Level**: full
**Success Criteria** (what must be TRUE):
  1. Full end-to-end workflow: detect backend -> resolve models -> init context -> plan phase -> execute phase -> auto-cleanup analysis runs without errors
  2. Hierarchical roadmap workflow: create long-term roadmap -> refine milestone -> promote to Now -> generate ROADMAP.md, all commands complete successfully
  3. All 594+ existing tests continue to pass (no regressions)
  4. New test coverage across all three features maintains >= 80% line coverage on affected lib/ modules
  5. All deferred validations from Phases 9-14 are resolved
  6. `npm run lint` passes with zero errors across all new and modified files
**Plans**: TBD

## Progress

**Execution Order:**
Phases 9 and 11 can run in parallel (independent). Phase 13 can also run in parallel.
Sequential dependencies: 9->10, 11->12, 13->14, then all converge at 15.

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 9. Backend Detection & Model Resolution | v0.1.0 | 2/2 | Complete | 2026-02-16 |
| 10. Backend Capabilities & Context Integration | v0.1.0 | 2/2 | Complete | 2026-02-16 |
| 11. Hierarchical Roadmap Schema & Commands | v0.1.0 | 0/TBD | Not started | - |
| 12. Hierarchical Roadmap Refinement & Promotion | v0.1.0 | 0/TBD | Not started | - |
| 13. Auto-Cleanup Config & Quality Analysis | v0.1.0 | 0/TBD | Not started | - |
| 14. Auto-Cleanup Doc Drift & Plan Generation | v0.1.0 | 0/TBD | Not started | - |
| 15. Integration & Validation | v0.1.0 | 0/TBD | Not started | - |

## Deferred Validations

| Deferred From | Validation | Must Resolve By | Status |
|---------------|-----------|-----------------|--------|
| Phase 8 (v0.0.5) | DEFER-08-01: User acceptance testing of TUI dashboard commands | post-v1.0 | Pending |
| Phase 9 | Backend detection accuracy across real environments (mocked in unit tests) | Phase 15 | Pending |
| Phase 10 | Context init backward compatibility under all 4 backends | Phase 15 | Pending |
| Phase 11 | Long-term roadmap round-trip integrity (create -> refine -> promote -> generate) | Phase 15 | Pending |
| Phase 13 | Auto-cleanup does not interfere with normal phase execution when disabled | Phase 15 | Pending |

## Risk Register

| Risk | Probability | Impact | Mitigation | Phase |
|------|-------------|--------|------------|-------|
| Sub-agent spawning divergence across backends | High | Critical | Scoped out of v0.1.0; detection + model resolution only | Phase 9-10 |
| Gemini CLI sub-agents are experimental | Medium | Medium | Mark Gemini capabilities as experimental; degrade gracefully | Phase 10 |
| Backend env var detection unreliable in nested shells | Medium | Medium | Config override as escape hatch; document detection order | Phase 9 |
| Mode detection interferes with existing progressive workflow | Low | High | Progressive mode is default; hierarchical only activates on explicit file creation | Phase 11 |
| Auto-cleanup quality analysis produces too many false positives | Medium | Low | Config-driven thresholds; disabled by default; user can skip generated plans | Phase 13-14 |
| New features break existing 594 tests | Low | Critical | Run full test suite before and after each phase; CI enforces on every commit | Phase 15 |

## Iteration Strategy

**When to iterate:**
- Test coverage < 80% on new modules -> add tests (max 1 iteration)
- Backend detection fails for any backend -> fix detection (max 1 iteration)
- Hierarchical roadmap breaks progressive mode -> fix mode detection (max 1 iteration)
- Any deferred validation fails at Phase 15 -> fix root cause before release

**Metric thresholds for phase acceptance:**
- Phase passes if all success criteria are met
- Phase fails if any P0-related success criterion is not met
- P1/P2 failures can be deferred to next phase with documented reason

**Max iterations per phase:** 2

---

*Roadmap managed by: Claude (grd-roadmapper)*
*Last updated: 2026-02-16*
