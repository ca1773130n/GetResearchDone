# Roadmap

**Project:** GRD v0.0.5 -- Production-Ready R&D Workflow Automation (pre-v0.1.0)
**Created:** 2026-02-12
**Updated:** 2026-02-12

## Milestone 1: Foundation
**Start:** 2026-02-13
**Target:** 2026-02-17
**Goal:** Establish security baseline and project infrastructure

### Phase 1: Security Foundation -- .gitignore, package.json, version sync, config cleanup
- **Duration:** 2d
- **Type:** implement
- **Scope:**
  - Create comprehensive `.gitignore` (node_modules, .env, .DS_Store, *.excalidraw.md, grd-local-patches/)
  - Create `package.json` with `engines` (node >= 18), `scripts` (test, lint, format), `devDependencies` (placeholder)
  - Sync VERSION file to 0.0.4 (match CHANGELOG.md)
  - Sync `.claude-plugin/plugin.json` version to 0.0.4
  - Remove deprecated `github_integration` section from `.planning/config.json`
  - Add `.editorconfig` (2-space indent, LF line endings, UTF-8)
- **Success criteria:**
  - `.gitignore` exists and excludes: `.env*`, `node_modules/`, `.DS_Store`, `*.excalidraw.md`, `grd-local-patches/`, `*.key`, `*.pem`, `credentials.*`, `secrets.*`
  - `package.json` exists with `engines.node >= 18`, test/lint/format scripts defined
  - `VERSION` = `0.0.4`, `plugin.json` version = `0.0.4`, both match CHANGELOG
  - `config.json` has no `github_integration` key
  - `.editorconfig` exists
- **Risk:** Low -- all changes are additive or corrective, no logic changes
- **Plans:** 1 plan
  - [x] 01-01-PLAN.md -- Create .gitignore, .editorconfig, package.json, sync versions to 0.0.4 *(completed 2026-02-12)*

### Phase 2: Security Hardening -- execSync audit and git operation safety
- **Duration:** 3d
- **Type:** implement
- **Scope:**
  - Audit all `execSync` / `execGit` calls in `bin/grd-tools.js`
  - Replace string-concatenated shell commands with `execFileSync` + argument arrays
  - Add git operation whitelist (block `git config`, `git push --force`, `git reset --hard` at the tool level)
  - Add `process.env.HOME` null check with fallback
  - Validate phase names, file paths, and git refs before use in shell commands
  - Document security model in a `SECURITY.md` or section in README
- **Success criteria:**
  - Zero `execSync` calls with user-interpolated strings (verified by grep)
  - All git operations go through `execFileSync` with argument arrays or a validated `execGit` function
  - Git operation whitelist enforced (destructive commands blocked unless explicit flag)
  - `process.env.HOME` has null check
  - Path traversal (`../`) blocked in phase name and file path arguments
- **Risk:** Medium -- changing `execSync` to `execFileSync` may break edge cases in git argument escaping. Mitigation: manual testing of all git-touching commands.
- **Plans:** 2 plans
  - [x] 02-01-PLAN.md -- Harden execGit/isGitIgnored with execFileSync, add input validation helpers *(completed 2026-02-12)*
  - [x] 02-02-PLAN.md -- Harden GitHub tracker ghExec, add git whitelist, create SECURITY.md *(completed 2026-02-12)*

## Milestone 2: Modularization
**Start:** 2026-02-18
**Target:** 2026-02-22
**Goal:** Transform monolithic CLI tool into testable modular architecture

### Phase 3: Modularize grd-tools.js -- Extract lib/ modules from 5,632-line monolith
- **Duration:** 5d
- **Type:** implement
- **Scope:**
  - Create `lib/` directory with extracted modules:
    - `lib/state.js` -- STATE.md read/write/patch operations
    - `lib/roadmap.js` -- ROADMAP.md parsing, phase queries, schedule computation
    - `lib/phase.js` -- Phase lifecycle (add, insert, remove, complete, numbering)
    - `lib/tracker.js` -- GitHub/Jira sync, prepare/record operations
    - `lib/frontmatter.js` -- YAML frontmatter extract/set/merge/validate
    - `lib/verify.js` -- Verification suite (plan-structure, phase-completeness, references, commits, artifacts, key-links)
    - `lib/scaffold.js` -- Template scaffolding operations
    - `lib/context.js` -- Context loading and init workflow operations
    - `lib/utils.js` -- Shared helpers (safeReadFile, normalizePhaseName, date, output, error, execGit)
  - Reduce `bin/grd-tools.js` to thin CLI router (~200-300 lines):
    - Argument parsing
    - Command dispatch to lib/ functions
    - Output formatting
  - All existing CLI commands produce identical JSON output (no API changes)
  - All existing agent/command bash calls continue to work unchanged
- **Success criteria:**
  - `bin/grd-tools.js` <= 300 lines
  - No `lib/*.js` file exceeds 500 lines
  - All 64 CLI commands produce identical output (verified by capture-and-diff before/after)
  - All module exports have clear function signatures
  - No circular dependencies between lib/ modules
- **Risk:** High -- largest change in the project. Incorrect extraction breaks every agent and command.
  - **Mitigation 1:** Capture CLI output for all 64 commands BEFORE modularization as golden reference
  - **Mitigation 2:** After each module extraction, verify affected commands still produce identical output
  - **Mitigation 3:** Keep original `grd-tools.js` in git history for easy rollback
  - **Key risk:** `DEFER-03-01` (all 40 commands work) and `DEFER-03-02` (CLI output unchanged) validated in Phase 4
- **Plans:** 7 plans
  - [x] 03-01-PLAN.md -- Capture golden reference output for all CLI commands before modularization *(completed 2026-02-12)*
  - [x] 03-02-PLAN.md -- Extract lib/utils.js (shared helpers + constants) and lib/frontmatter.js (YAML operations) *(completed 2026-02-12)*
  - [x] 03-03-PLAN.md -- Extract lib/state.js (STATE.md operations) and lib/verify.js (verification suite) *(completed 2026-02-12)*
  - [x] 03-04-PLAN.md -- Extract lib/roadmap.js (roadmap parsing) and lib/scaffold.js (template operations) *(completed 2026-02-12)*
  - [x] 03-05-PLAN.md -- Extract lib/phase.js (phase lifecycle, milestone, validate consistency) *(completed 2026-02-12)*
  - [x] 03-06-PLAN.md -- Extract lib/tracker.js (issue tracker) and lib/context.js (init workflows) *(completed 2026-02-12)*
  - [x] 03-07-PLAN.md -- Extract lib/commands.js (standalone commands), slim grd-tools.js to thin CLI router, full regression *(completed 2026-02-12)*

## Milestone 3: Quality Assurance
**Start:** 2026-02-25
**Target:** 2026-03-03
**Goal:** Automated test suite and CI/CD pipeline

### Phase 4: Test Suite -- Jest tests for all lib/ modules, >= 80% coverage
- **Duration:** 5d
- **Type:** implement
- **Scope:**
  - Install Jest as devDependency
  - Configure Jest (`jest.config.js`) with coverage thresholds
  - Create test directory structure: `tests/unit/`, `tests/integration/`
  - **Unit tests** for each `lib/` module:
    - `tests/unit/state.test.js` -- STATE.md operations
    - `tests/unit/roadmap.test.js` -- ROADMAP.md parsing
    - `tests/unit/phase.test.js` -- Phase lifecycle
    - `tests/unit/frontmatter.test.js` -- YAML frontmatter CRUD
    - `tests/unit/verify.test.js` -- Verification functions
    - `tests/unit/utils.test.js` -- Shared helpers
    - `tests/unit/tracker.test.js` -- Tracker prepare/record operations
    - `tests/unit/scaffold.test.js` -- Template scaffolding
    - `tests/unit/context.test.js` -- Context loading
  - **Integration tests:**
    - `tests/integration/cli.test.js` -- End-to-end CLI command tests via `child_process`
    - `tests/integration/golden/` -- Golden output snapshots for all 64 commands
  - **Test fixtures:** `tests/fixtures/` with sample `.planning/` directory structures
  - Validates `DEFER-03-01` (all commands work) and `DEFER-03-02` (output unchanged)
- **Success criteria:**
  - `npm test` runs and passes
  - Line coverage >= 80% on `lib/` modules (reported by Jest `--coverage`)
  - All 64 CLI commands have at least one integration test
  - Golden snapshot tests pass (CLI output matches pre-modularization captures)
  - Test execution time < 60 seconds
- **Risk:** Medium -- test fixture creation is tedious but straightforward. Risk that some commands require complex `.planning/` state to test.
  - **Mitigation:** Use minimal fixtures; test pure functions first, integration second.
- **Plans:** 4 plans
  - [x] 04-01-PLAN.md -- Install Jest, create test infrastructure, unit tests for utils/frontmatter/roadmap *(completed 2026-02-12)*
  - [x] 04-02-PLAN.md -- Unit tests for state/verify/scaffold/commands *(completed 2026-02-12)*
  - [x] 04-03-PLAN.md -- Unit tests for phase/tracker/context *(completed 2026-02-12)*
  - [x] 04-04-PLAN.md -- Integration tests, golden snapshots, coverage verification, resolve deferred validations *(completed 2026-02-12)*

### Phase 5: CI/CD Pipeline -- GitHub Actions for lint, test, and security checks
- **Duration:** 2d
- **Type:** implement
- **Scope:**
  - Create `.github/workflows/ci.yml`:
    - Trigger: push to main, pull_request to main
    - Matrix: Node.js 18, 20, 22
    - Steps: checkout, install deps, lint, test with coverage, security audit
  - Create `.github/workflows/release.yml` (manual trigger):
    - Version consistency check (VERSION, plugin.json, CHANGELOG)
    - Full test suite
    - Generate release notes from CHANGELOG
  - Add status badges to README.md
  - Configure branch protection (require CI pass for merge to main) -- documented, not enforced by this phase
- **Success criteria:**
  - `ci.yml` runs on every PR and push to main
  - CI passes on Node 18, 20, and 22
  - Test coverage reported in CI output
  - `release.yml` validates version consistency
  - README.md has CI status badge
- **Risk:** Low -- GitHub Actions is well-documented; pipeline is standard Node.js.
- **Plans:** 2/2 plans complete
  - [ ] 05-01-PLAN.md -- CI workflow (Node 18/20/22 matrix, lint/test/audit) + README badge
  - [ ] 05-02-PLAN.md -- Release workflow (version consistency, release notes) + DEFER-02-03 resolution

## Milestone 4: Polish and Release
**Start:** 2026-03-04
**Target:** 2026-03-07
**Goal:** Code style enforcement, input validation, and v0.0.5 release

### Phase 6: Code Style -- ESLint + Prettier configuration and enforcement
- **Duration:** 2d
- **Type:** implement
- **Scope:**
  - Install ESLint and Prettier as devDependencies
  - Create `.eslintrc.json` with Node.js recommended rules + project-specific overrides
  - Create `.prettierrc` matching existing code style (single quotes, 2-space indent, semicolons)
  - Run `prettier --write` on all `bin/` and `lib/` JS files
  - Run `eslint --fix` on all `bin/` and `lib/` JS files
  - Fix remaining lint errors manually
  - Add lint + format check to `package.json` scripts
  - Add lint check to CI pipeline
  - Validates `DEFER-06-01` (lint rules compatible with codebase)
- **Success criteria:**
  - `npm run lint` passes with zero errors, zero warnings
  - `npm run format:check` passes (all files formatted)
  - CI runs lint and format checks
  - Existing code style preserved (Prettier config matches conventions)
- **Risk:** Low -- Prettier auto-formats; ESLint auto-fixes most issues. Risk: lint rules may conflict with patterns in grd-tools.js. Mitigation: Use minimal rule set, disable rules that fight the codebase.
- **Plans:** 2/2 plans complete
  - [ ] 06-01-PLAN.md -- Install ESLint + Prettier, create configs, update package.json scripts
  - [ ] 06-02-PLAN.md -- Auto-format and lint-fix all files, enforce lint in CI, validate DEFER-06-01

### Phase 7: Validation, Cleanup, and Release -- Input validation, final polish, v0.0.5
- **Duration:** 2d
- **Type:** implement
- **Scope:**
  - Add input validation layer to CLI router:
    - Phase number format validation (integer or decimal, e.g., `01`, `02.1`)
    - File path sanitization (block `../`, absolute paths outside project)
    - Git ref validation (alphanumeric + standard git ref chars)
    - Flag validation (known flags only, error on unknown)
  - Add JSDoc comments to all `lib/` module exports
  - Create or update CONTRIBUTING.md with:
    - Architecture overview (post-modularization)
    - How to add commands, agents, CLI commands
    - How to run tests
    - PR guidelines
  - Bump version to 0.0.5:
    - Update `VERSION` to `0.0.5`
    - Update `.claude-plugin/plugin.json` version to `0.0.5`
    - Update `CHANGELOG.md` with v0.0.5 section
  - Regenerate `grd-file-manifest.json`
  - Run full end-to-end validation:
    - Create test project with `/grd:new-project`
    - Plan and execute a phase
    - Verify all 40 commands respond correctly
  - **Final product verification against PRODUCT-QUALITY.md targets**
- **Success criteria:**
  - All CLI entry points reject invalid input with clear error messages
  - JSDoc on all `lib/` exports
  - CONTRIBUTING.md exists
  - VERSION = 0.0.5, plugin.json = 0.0.5, CHANGELOG has 0.0.5 section
  - All PRODUCT-QUALITY.md P0 targets met
  - All PRODUCT-QUALITY.md P1 targets met
  - All deferred validations cleared (DEFER-03-01, DEFER-03-02, DEFER-06-01)
  - End-to-end validation passes
- **Risk:** Low -- this is polish and verification. All hard work done in prior phases.
- **Plans:** 3 plans
  - [ ] 07-01-PLAN.md -- Input validation layer in CLI router + validation helpers + tests
  - [ ] 07-02-PLAN.md -- JSDoc comments on all lib/ module exports (~108 exported functions)
  - [ ] 07-03-PLAN.md -- CONTRIBUTING.md + version bump to 0.0.5 + manifest + product verification

### Phase 8: Status Dashboard -- TUI commands for project visibility and roadmap overview
- **Duration:** 3d
- **Type:** implement
- **Scope:**
  - **`grd:dashboard`** — Full graphical TUI overview of all milestones, phases, and plans:
    - Tree view: Milestone → Phase → Plan with status indicators (✓ ○ ◆ ✗)
    - Per-phase progress bars with plan counts
    - Overall milestone progress bar
    - Current position marker (► active phase)
    - Schedule info (start/due dates, duration)
    - Key metrics summary (decisions, blockers, deferred validations)
  - **`grd:phase-detail <N>`** — Detailed single-phase drill-down:
    - All plans with status, duration, task/file counts
    - Key decisions made in this phase
    - Artifacts created
    - Evaluation tier status (if EVAL.md exists)
    - Verification results (if VERIFICATION.md exists)
    - Code review summary (if REVIEW.md exists)
  - **`grd:health`** — Project health indicators:
    - Active blockers and their age
    - Pending deferred validations with target phases
    - Stale phases (no activity for >N days)
    - Risk register summary from ROADMAP.md
    - Velocity trend (average plan duration over recent history)
    - Coverage/quality metrics from BASELINE.md
  - **Implementation approach:**
    - Add `cmdDashboard()`, `cmdPhaseDetail()`, `cmdHealth()` to `lib/commands.js`
    - Add CLI routes in `bin/grd-tools.js` (`dashboard`, `phase-detail`, `health`)
    - Create command markdown files in `commands/` (`dashboard.md`, `phase-detail.md`, `health.md`)
    - All commands support `--raw` for JSON output (standard GRD pattern)
    - TUI rendering uses existing UI patterns from `references/ui-brand.md`
    - Data sources: ROADMAP.md, STATE.md, BASELINE.md, phase directories (plans, summaries, evals)
- **Success criteria:**
  - `grd:dashboard` renders full project tree with all milestones, phases, plans, and status indicators
  - `grd:phase-detail <N>` shows detailed breakdown for any phase number
  - `grd:health` reports blockers, deferred validations, velocity, and risk summary
  - All three commands produce valid JSON with `--raw` flag
  - All three commands handle missing data gracefully (no crashes on empty/partial projects)
  - TUI output follows `references/ui-brand.md` patterns (symbols, box drawing, progress bars)
  - Unit tests for all three `cmd*` functions
  - Integration tests for all three CLI routes
- **Plans:** 2 plans
  - [x] 08-01-PLAN.md -- Implement cmdDashboard, cmdPhaseDetail, cmdHealth + CLI routes + command markdowns *(completed 2026-02-15)*
  - [x] 08-02-PLAN.md -- Unit tests and integration tests for all three dashboard commands *(completed 2026-02-15)*
- **Risk:** Low -- read-only commands that aggregate existing data, no state mutations
  - **Mitigation:** Reuse existing `cmdRoadmapAnalyze`, `cmdProgressRender`, state parsing logic

---

## Risk Register

| Risk | Probability | Impact | Mitigation | Phase |
|------|-------------|--------|------------|-------|
| Modularization breaks CLI interface | Medium | Critical | Golden output snapshots before/after; rollback available | Phase 3 |
| execFileSync argument escaping differs from execSync | Medium | High | Manual test all git-touching commands; keep test fixtures | Phase 2 |
| Jest coverage target (80%) unreachable for some modules | Low | Medium | Exclude generated/scaffold code from coverage; focus on logic | Phase 4 |
| ESLint rules conflict with existing patterns | Low | Low | Start with minimal rules; disable conflicting rules | Phase 6 |
| Input validation too strict, breaks edge cases | Low | Medium | Test with real-world `.planning/` directories; allow override flag | Phase 7 |
| Node 18 incompatibility | Very Low | Medium | CI matrix tests Node 18, 20, 22; fix issues early | Phase 5 |
| Regression in agent/command behavior | Medium | High | Integration tests cover all 64 CLI commands | Phase 4 |

## Iteration Strategy

**When to iterate:**
- Test coverage < 80% after Phase 4 -> add tests (max 1 iteration)
- Lint errors > 0 after Phase 6 -> fix errors (max 1 iteration)
- Any deferred validation fails -> fix root cause before proceeding

**Metric thresholds for phase acceptance:**
- Phase passes if all success criteria are met
- Phase fails if any P0-related success criterion is not met
- P1/P2 failures can be deferred to next phase with documented reason

**Max iterations per phase:** 2
- If a phase fails after 2 iterations, escalate to product-level reassessment

---

*Roadmap managed by: Claude (grd-product-owner)*
*Last updated: 2026-02-15*
