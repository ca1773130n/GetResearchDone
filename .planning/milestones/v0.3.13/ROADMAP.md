# Roadmap: v0.3.13 Wireup Command

## Overview

v0.3.13 adds `/grd:wireup` — a complement to `/grd:evolve` that focuses on wiring up features built by evolve iterations, making them fully functional through real end-to-end usage testing. The command discovers unwired features, generates usage scenarios, executes them (HTTP/CLI and browser), detects missing connections, and auto-fixes high-confidence integration issues. Four phases deliver the infrastructure, orchestrator, browser/fix layer, and MCP+testing integration in sequence.

## Phases

- [ ] **Phase 78: Core Wireup Infrastructure** — Discovery engine, scenario generation, test data generation, state management `implement`
- [ ] **Phase 79: Wireup Orchestrator and Execution** — Slash command, HTTP/CLI execution, missing connection detection, sonnet ceiling `implement`
- [ ] **Phase 80: Browser Execution and Auto-Fix** — Playwright integration, auto-fix capability, iteration reports `implement`
- [ ] **Phase 81: MCP Tools, Testing, and Integration** — MCP registration, unit tests, integration tests `integrate`

## Phase Details

### Phase 78: Core Wireup Infrastructure

**Goal:** The foundational `lib/wireup.ts` module exists with a working discovery engine that identifies unwired features via pure filesystem analysis, a scenario generator that produces structured JSON scenarios from codebase introspection, test data generation that writes reusable fixtures to the wireup directory, and state management functions that persist progress to `WIREUP-STATE.json`.

**Type:** implement

**Depends on:** Nothing (first phase of milestone)

**Requirements:** REQ-121, REQ-122, REQ-125, REQ-128

**Verification Level:** proxy

**Success Criteria:**
1. `discoverUnwiredFeatures()` returns a structured list with category, file location, and suggested wiring action for at least the following categories: exported-but-uncalled functions, API endpoints without integration tests, and config options without CLI/UI surface
2. Scenario generation produces valid JSON with `step_type` (http, cli, browser, assert), `parameters`, and `expected_outcome` fields for each unwired feature
3. Test data fixtures are written to `.planning/milestones/{milestone}/wireup/test-data/` as valid JSON files with realistic payloads derived from schema/type analysis
4. `readWireupState()` and `writeWireupState()` round-trip correctly; `WIREUP-STATE.json` contains `features_discovered`, `scenarios_generated`, `scenarios_passed`, `scenarios_failed`, `fixes_applied`, and `iteration_history` fields
5. All functions use pure filesystem analysis (no LLM subprocess calls) — discovery completes without spawning any child processes

**Plans:** 3 plans

Plans:
- [ ] 78-01-PLAN.md — Wireup type definitions and discoverUnwiredFeatures() with filesystem analysis
- [ ] 78-02-PLAN.md — Scenario generation and test data fixture generation
- [ ] 78-03-PLAN.md — Wireup state management (WIREUP-STATE.json read/write/advance)

### Phase 79: Wireup Orchestrator and Execution

**Goal:** The `/grd:wireup` slash command is registered and orchestrates a full iteration (discover -> generate -> execute -> detect -> report). HTTP and CLI scenario execution works end-to-end with pass/fail reporting per step, missing connection classification produces structured reports with issue type and suggested fix, and all subagent spawns use the sonnet-tier model ceiling.

**Type:** implement

**Depends on:** Phase 78

**Requirements:** REQ-120, REQ-123, REQ-126, REQ-131

**Verification Level:** proxy

**Success Criteria:**
1. `commands/wireup.md` exists with valid YAML frontmatter and `/grd:wireup` registered as a GRD slash command; `--target <feature>` optional argument is documented
2. HTTP scenario execution captures response body, status code, and headers; CLI scenario execution captures stdout, stderr, and exit code; both compare against expected outcomes and report pass/fail per step
3. Missing connection classification produces a structured report for each failure with: `issue_type` (one of: missing-route, unconnected-handler, missing-import, missing-middleware, broken-nav-link, missing-env-var), `source_file`, `target_file`, `suggested_fix`, and `confidence` (high/medium/low)
4. All `spawnClaude` calls in the wireup orchestrator use `SONNET_MODEL` constant — no opus model spawns
5. The orchestrator wires phases 78 and 79 together: a single `gd wireup` invocation calls discover, generates scenarios, executes HTTP/CLI scenarios, and outputs a pass/fail summary

**Plans:** 3 plans

Plans:
- [ ] 79-01-PLAN.md — Register /grd:wireup slash command, cmdInitWireup context builder, and wireup orchestrator with barrel re-export
- [ ] 79-02-PLAN.md — Implement HTTP/CLI scenario execution engine with per-step pass/fail comparison and orchestrator integration
- [ ] 79-03-PLAN.md — Implement missing connection detection and classification with 6 issue types and orchestrator integration

### Phase 80: Browser Execution and Auto-Fix

**Goal:** Browser scenarios execute via Playwright MCP tools when available (gracefully skipped with `playwright_available: false` and suggested manual steps otherwise), high-confidence auto-fixes are applied by a sonnet-tier agent and verified by re-running the failed scenario, and each iteration produces a WIREUP-REPORT.md with trend-trackable history.

**Type:** implement

**Depends on:** Phase 79

**Requirements:** REQ-124, REQ-127, REQ-129

**Verification Level:** proxy

**Success Criteria:**
1. Browser scenario execution is guarded by `playwright_available` detection; when unavailable, browser scenarios are skipped with a structured skip reason and manual testing suggestions in the report
2. When Playwright MCP tools are available, browser scenarios execute navigate, fill, click, and DOM-verification steps with console error capture
3. Auto-fix is attempted only for high-confidence issues; the fix agent uses sonnet-tier model; after fix application the failed scenario is re-run to verify; fix outcome (success/failure) is recorded in state
4. Low-confidence issues are NOT auto-fixed — they appear in the report under "Requires manual review" with suggested fix
5. `WIREUP-REPORT.md` is written to `.planning/milestones/{milestone}/wireup/` with: features tested count, scenarios run/passed/failed, issues found, fixes applied, remaining unwired features, and appended iteration history for trend tracking

**Plans:** TBD

Plans:
- [ ] 80-01: Implement Playwright MCP integration with `playwright_available` guard
- [ ] 80-02: Implement auto-fix capability with sonnet-tier agent and re-run verification
- [ ] 80-03: Implement WIREUP-REPORT.md generation with iteration history

### Phase 81: MCP Tools, Testing, and Integration

**Goal:** Five wireup MCP tools are registered in the MCP server following existing evolve tool patterns, unit tests for `lib/wireup.ts` achieve 85%+ line coverage, and an integration test validates the complete wireup flow on a fixture project with known unwired features.

**Type:** integrate

**Depends on:** Phase 80

**Requirements:** REQ-130, REQ-132, REQ-133

**Verification Level:** full

**Success Criteria:**
1. Five MCP tools registered in `mcp-server.ts`: `grd_wireup_discover`, `grd_wireup_run`, `grd_wireup_state`, `grd_wireup_scenarios`, `grd_wireup_report` — each with correct parameter schemas and JSON-RPC response structure matching existing evolve tool patterns
2. `npm test` passes with 0 failures; `tests/unit/wireup.test.ts` achieves >= 85% line coverage per jest.config.js per-file thresholds
3. Unit tests cover: discovery engine (mock filesystem), scenario generation, scenario execution (mocked fetch/child_process), state read/write/advance, and missing connection detection
4. Integration test runs a full wireup iteration on a test fixture project with at least 2 known unwired features; validates discover -> generate -> execute -> detect -> report flow end-to-end
5. `grd_wireup_run` MCP tool can be invoked via `grd-tools.js` and returns structured JSON with `features_discovered`, `scenarios_run`, `issues_found` fields

**Plans:** 3 plans

Plans:
- [ ] 81-01-PLAN.md — Register five wireup MCP tools in mcp-server.ts and add coverage threshold
- [ ] 81-02-PLAN.md — Write unit tests for lib/wireup.ts (85%+ line coverage)
- [ ] 81-03-PLAN.md — Write integration test for full wireup flow on fixture project

## Progress

| Phase | Name | Plans Complete | Status | Completed |
|-------|------|----------------|--------|-----------|
| 78 | Core Wireup Infrastructure | 0/3 | Not started | - |
| 79 | Wireup Orchestrator and Execution | 0/3 | Not started | - |
| 80 | Browser Execution and Auto-Fix | 0/3 | Not started | - |
| 81 | MCP Tools, Testing, and Integration | 0/3 | Not started | - |

## Deferred Validations

| Deferred From | Validation | Must Resolve By | Status |
|---------------|-----------|-----------------|--------|
| Phase 80 | Live Playwright MCP scenario execution (requires Playwright MCP environment) | Future | Pending |
