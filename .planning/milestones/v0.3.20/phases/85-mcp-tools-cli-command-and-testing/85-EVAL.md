---
phase: 85-mcp-tools-cli-command-and-testing
type: eval
created: 2026-03-23
designer: Claude (grd-eval-planner)
---

# Evaluation Plan: Phase 85 — MCP Tools, CLI Command, and Testing

**Designed:** 2026-03-23
**Designer:** Claude (grd-eval-planner)
**Methods evaluated:** MCP tool registration (lib/mcp-server.ts), slash command authoring (commands/discuss.md), unit test coverage expansion (tests/unit/discussion.test.ts), integration test pipeline (tests/integration/discussion-e2e.test.ts)
**Reference papers:** None — this phase is infrastructure work with no academic source. Metrics derived from project quality targets (PRODUCT-QUALITY.md) and the prior-phase deferred validation DEFER-84-03.

## Evaluation Overview

Phase 85 closes two distinct work streams: (1) surface exposure — registering four MCP tools and a slash command so agents and users can drive the discussion system through standard interfaces, and (2) test coverage — expanding unit tests to the enforced 85%+ threshold and validating the complete discussion pipeline via a new integration test.

The evaluation is unusually concrete for a phase of this type. All success criteria are mechanically verifiable: tool registration can be grep-checked, type compilation is binary pass/fail, coverage is a number from Jest, and the integration test either runs or it does not. There are no subjective quality judgments required and no outputs that require human review to assess.

The one genuine limitation at this phase is that the MCP tools cannot be exercised end-to-end through a real MCP session (they need a Claude Code session with an active MCP server). That runtime path is deferred. Everything else — tool schema correctness, function linkage, type safety, slash command format, and the full discussion pipeline under mocked CLIs — is verifiable in-phase.

### Metric Sources

| Metric | Source | Why This Metric |
|--------|--------|----------------|
| TypeScript compilation (zero errors) | PRODUCT-QUALITY.md P0 target; plan 85-01 success criteria | Type safety is non-negotiable; any error is a defect |
| ESLint zero warnings | PRODUCT-QUALITY.md P1 target; CLAUDE.md pre-commit hook | Pre-commit hook enforces this — commits fail otherwise |
| MCP tool descriptor count (+4) | Plan 85-01 task 1 must_haves | Four tools must be registered; grep is the canonical check |
| lib/discussion.ts line coverage >= 85% | jest.config.js enforced threshold; plan 85-02 must_haves | Jest threshold is a hard gate — npm test fails if unmet |
| lib/discussion.ts branch coverage >= 85% | jest.config.js enforced threshold; Phase 84 EVAL baseline | Branches were at 82.73% going into phase 85; must cross 85% |
| lib/discussion.ts function coverage = 100% | jest.config.js enforced threshold; plan 85-02 must_haves | All exported functions must be exercised |
| Integration test: full pipeline passes | Plan 85-02 task 2 success criteria; DEFER-84-03 | Closes deferred validation from Phase 84 |
| npm test: zero regressions | Plan 85-02 must_haves | 3,177+ existing tests must not regress |
| commands/discuss.md frontmatter validity | Plan 85-01 task 2 success criteria | Slash command format is load-bearing for Claude Code parsing |

### Verification Level Summary

| Level | Count | Purpose |
|-------|-------|---------|
| Sanity (L1) | 6 | Basic functionality and format verification |
| Proxy (L2) | 5 | Automated quality metrics |
| Deferred (L3) | 2 | Runtime MCP session and real-CLI validation |

## Level 1: Sanity Checks

**Purpose:** Verify basic functionality. These MUST ALL PASS before proceeding.

### S1: TypeScript compiles with zero errors

- **What:** All modified files (lib/mcp-server.ts, lib/backend.ts, plus new test files) pass strict TypeScript compilation
- **Command:** `npm run build:check`
- **Expected:** Exit code 0, no output on stderr
- **Failure means:** Type error in new tool descriptors, bad import, or incorrect function signature. Block progression and fix before any other verification.

### S2: ESLint passes with zero warnings

- **What:** No linting violations in modified or new files
- **Command:** `npm run lint`
- **Expected:** Exit code 0, zero errors, zero warnings
- **Failure means:** Code style violation, unused import, or undeclared variable. The pre-commit hook enforces this — commits will fail if lint does not pass.

### S3: Four MCP tool names are present in lib/mcp-server.ts

- **What:** All four new tool descriptors are registered in COMMAND_DESCRIPTORS
- **Command:** `grep -c 'grd_discussion_run\|grd_discussion_config\|grd_backends_available\|grd_discussion_history' lib/mcp-server.ts`
- **Expected:** Output is `4`
- **Failure means:** One or more tools were not registered, or naming convention was not followed.

### S4: commands/discuss.md has valid YAML frontmatter

- **What:** Slash command file exists with the required frontmatter fields
- **Command:** `head -5 commands/discuss.md`
- **Expected:** Lines 1-5 contain `---`, `description:`, and `argument-hint:` in correct YAML format
- **Failure means:** File is missing, malformed, or uses agent-only frontmatter fields (effort/maxTurns). Claude Code will fail to parse the slash command.

### S5: Unit test suite passes (no crash)

- **What:** discussion.test.ts and integration test both execute without crash or unhandled rejection
- **Command:** `npx jest tests/unit/discussion.test.ts tests/integration/discussion-e2e.test.ts --no-coverage`
- **Expected:** Both suites report PASS; exit code 0
- **Failure means:** Syntax error, broken import, or mock setup failure in test files.

### S6: readConfig is exported from lib/backend.ts

- **What:** The grd_discussion_config tool depends on readConfig being exported from lib/backend.ts
- **Command:** `node -e "const b = require('./lib/backend'); console.log(typeof b.readConfig)"`
- **Expected:** Output is `function`
- **Failure means:** Export was not added to module.exports in lib/backend.ts; grd_discussion_config tool will fail at runtime.

**Sanity gate:** ALL sanity checks must pass. Any failure blocks progression.

## Level 2: Proxy Metrics

**Purpose:** Indirect evaluation of quality and completeness.
**IMPORTANT:** Proxy metrics are NOT validated substitutes for full runtime MCP session testing. They verify correctness at the code/schema level, not at the protocol level.

### P1: lib/discussion.ts branch coverage meets threshold

- **What:** Branch coverage of discussion.ts crosses the enforced 85% threshold
- **How:** Run Jest with coverage on the unit test file only; read the discussion.ts row
- **Command:** `npx jest tests/unit/discussion.test.ts --coverage --coverageReporters=text 2>&1 | grep 'discussion.ts'`
- **Target:** Branches >= 85% (was 82.73% at start of Phase 85)
- **Evidence:** jest.config.js enforces this as a hard threshold — npm test fails if unmet. The 82.73% baseline is documented in Phase 84 EVAL. Plan 85-02 task 1 identifies the specific branches to cover (timeout signal handling, synthesizer option, explicit rounds, config.discussion false paths, self-review prevention).
- **Correlation with full metric:** HIGH — Jest's branch coverage directly measures what it reports. The threshold is the actual quality gate.
- **Blind spots:** Branch coverage does not verify that the assertions in new tests are meaningful. A test that calls a branch but does not assert anything will increase coverage without actually verifying behavior.
- **Validated:** No — awaiting deferred validation at phase-86 or later integration run

### P2: lib/discussion.ts line and function coverage

- **What:** Line coverage >= 85%, function coverage = 100%
- **How:** Same command as P1; read Stmts and Funcs columns
- **Command:** `npx jest tests/unit/discussion.test.ts --coverage --coverageReporters=text 2>&1 | grep 'discussion.ts'`
- **Target:** Lines >= 85% (was 99.47% — must not regress), Functions = 100% (was 100% — must not regress)
- **Evidence:** Established thresholds in jest.config.js. The line coverage is already well above threshold; function coverage must remain at 100% after any new exported functions added in earlier phases.
- **Correlation with full metric:** HIGH
- **Blind spots:** Same as P1 — high coverage does not guarantee assertion quality.
- **Validated:** No

### P3: Integration test passes with mocked CLIs

- **What:** tests/integration/discussion-e2e.test.ts validates detect -> run 2 rounds -> synthesize -> write -> read back
- **How:** Run integration test suite directly
- **Command:** `npx jest tests/integration/discussion-e2e.test.ts --verbose`
- **Target:** All test cases PASS; no unhandled promise rejections; exit code 0
- **Evidence:** Plan 85-02 task 2 specifies the three test cases. This directly closes DEFER-84-03 ("Discussion result file is readable by Phase 85 MCP tools") from Phase 84 EVAL.
- **Correlation with full metric:** MEDIUM — the integration test uses mocked execFileSync, so it validates the pipeline logic and file I/O but not real CLI subprocess behavior. Real CLI behavior is Deferred (D1).
- **Blind spots:** Mock responses are static. Real CLI responses may have different structure, timing, or error modes.
- **Validated:** No — real CLI path is deferred to D1

### P4: Total npm test passes with zero regressions

- **What:** All 3,177+ existing tests continue to pass alongside new tests
- **How:** Full test suite run
- **Command:** `npm test`
- **Target:** All suites pass; test count increases by at least the number of new tests; no previously-passing test now fails
- **Evidence:** Plan 85-02 must_haves specify "no regressions in existing 3,177 tests". This is the master quality gate.
- **Correlation with full metric:** HIGH — npm test is the primary CI artifact for this phase.
- **Blind spots:** npm test with coverage runs all suites together. A passing suite count does not mean individual threshold violations are absent — check individual thresholds separately (P1, P2).
- **Validated:** No

### P5: MCP tool count in COMMAND_DESCRIPTORS increases by 4

- **What:** Total tool descriptor count goes from pre-phase baseline to +4
- **How:** Count name: occurrences before and after (approximate, since `name:` appears in other contexts too)
- **Command:** `grep -c "name: 'grd_discussion" lib/mcp-server.ts`
- **Target:** 4 (one per new tool)
- **Evidence:** Plan 85-01 states tool count goes from 128 to 132. This proxy checks the discussion-specific registrations without relying on an absolute count.
- **Correlation with full metric:** HIGH — if 4 tool names match the naming convention, the tools are registered.
- **Blind spots:** Does not verify that execute functions are correct, only that names are present. Type-check (S1) covers execute function signatures.
- **Validated:** No

## Level 3: Deferred Validations

**Purpose:** Full evaluation requiring a live MCP session or real CLI environment not available in-phase.

### D1: Live MCP session exercises all four discussion tools — DEFER-85-01

- **What:** A real Claude Code MCP session calls grd_discussion_run, grd_discussion_config, grd_backends_available, and grd_discussion_history and receives valid JSON responses
- **How:** Start `gd` MCP server, open Claude Code with MCP enabled, call each tool from the chat interface, verify response structure
- **Why deferred:** MCP server runtime requires a live Claude Code session. No test framework currently exercises the MCP protocol layer end-to-end. The mcp-server.test.ts unit tests cover descriptor parsing but not the full execute-to-response path.
- **Validates at:** Next live autopilot or manual MCP session after Phase 85 merges
- **Depends on:** Phase 85 code merged to main; gd MCP server running; Claude Code MCP integration active
- **Target:** Each tool returns a JSON-parseable string with the expected top-level keys (topic/participants/synthesis for grd_discussion_run; discussion/backend_roles for grd_discussion_config; backends/roles for grd_backends_available; array or string for grd_discussion_history)
- **Risk if unmet:** Discussion feature is not usable via MCP despite code being correct. May require runtime debugging of the mcp-server.ts execute wrapper.
- **Fallback:** grd-tools.js discussion subcommand provides an alternate code path for the same functionality. If MCP tools fail, agents can use the CLI tool.

### D2: Real CLI backends produce valid discussion files — DEFER-85-02

- **What:** With codex and/or gemini CLIs installed, runDiscussion() produces a real multi-backend discussion file with genuine backend responses
- **How:** On a machine with at least two backends installed, set backend_roles in config.json, run `grd_discussion_run` via MCP, verify the discussion file content
- **Why deferred:** Integration tests mock execFileSync. Real CLI behavior (response format, timing, error modes) can only be validated in an environment with actual CLIs installed.
- **Validates at:** First live environment where multiple backends (codex, gemini, opencode) are configured
- **Depends on:** Multiple backend CLIs installed; DEFER-85-01 cleared; backend_roles configured in .planning/config.json
- **Target:** Discussion file written with >= 2 rounds of responses, one response per participating backend per round, synthesis section present
- **Risk if unmet:** Discussion feature works in tests but not in real environments. Most likely failure modes: CLI argument format mismatch, response parsing incompatibility with real backend output. DEFER-84-01 and DEFER-84-02 from Phase 84 have the same risk profile.
- **Fallback:** Inspect real CLI output format, adjust dispatchToBackend() argument construction or response parsing. Budget 0.5 phases for this fix if real CLI responses diverge from mock responses.

## Ablation Plan

**No ablation plan** — This phase adds new surface area (MCP tools, slash command) and expands test coverage. There are no sub-components to isolate or component-contribution questions to answer. The prior ablation context (which discussion features matter most) was addressed in Phases 82-84.

## WebMCP Tool Definitions

WebMCP tool definitions skipped — phase does not modify frontend views. All files modified are TypeScript source, test files, and a markdown command definition.

## Baselines

| Baseline | Description | Expected Score | Source |
|----------|-------------|----------------|--------|
| discussion.ts branches | Branch coverage entering Phase 85 | 82.73% | Phase 84 Jest run output |
| discussion.ts lines | Line coverage entering Phase 85 | 99.47% | Phase 84 Jest run output |
| discussion.ts functions | Function coverage entering Phase 85 | 100% | Phase 84 Jest run output |
| MCP tool count | Tool descriptors in COMMAND_DESCRIPTORS before Phase 85 | 128 (approx) | Plan 85-01 text |
| Total test count | Tests passing before Phase 85 | 3,177 | Plan 85-02 must_haves |
| DEFER-84-03 status | Discussion file readable by Phase 85 MCP tools | PENDING | Phase 84 EVAL.md |

## Evaluation Scripts

**Location of evaluation code:**
```
tests/unit/discussion.test.ts
tests/integration/discussion-e2e.test.ts
```

**How to run full evaluation:**
```bash
# S1: Type check
npm run build:check

# S2: Lint
npm run lint

# S3: Tool registration grep
grep -c 'grd_discussion_run\|grd_discussion_config\|grd_backends_available\|grd_discussion_history' lib/mcp-server.ts

# S4: Slash command frontmatter
head -5 commands/discuss.md

# S5: Tests (no coverage, fast)
npx jest tests/unit/discussion.test.ts tests/integration/discussion-e2e.test.ts --no-coverage

# S6: readConfig export
node -e "const b = require('./lib/backend'); console.log(typeof b.readConfig)"

# P1/P2: Coverage metrics
npx jest tests/unit/discussion.test.ts --coverage --coverageReporters=text 2>&1 | grep 'discussion.ts'

# P3: Integration test verbose
npx jest tests/integration/discussion-e2e.test.ts --verbose

# P4: Full suite (master gate)
npm test
```

## Results Template

*To be filled by grd-eval-reporter after phase execution.*

### Sanity Results

| Check | Status | Output | Notes |
|-------|--------|--------|-------|
| S1: TypeScript compiles | | | |
| S2: ESLint passes | | | |
| S3: Four tool names registered | | | |
| S4: discuss.md frontmatter valid | | | |
| S5: Test suites pass (no crash) | | | |
| S6: readConfig exported | | | |

### Proxy Results

| Metric | Target | Actual | Status | Notes |
|--------|--------|--------|--------|-------|
| P1: Branch coverage | >= 85% | | | Baseline: 82.73% |
| P2: Line / Function coverage | >= 85% / 100% | | | Baseline: 99.47% / 100% |
| P3: Integration test passes | All PASS | | | 3 test cases |
| P4: npm test (no regressions) | All pass | | | Baseline: 3,177 tests |
| P5: Discussion tool name count | 4 | | | |

### Ablation Results

N/A — no ablation plan for this phase.

### Deferred Status

| ID | Metric | Status | Validates At |
|----|--------|--------|-------------|
| DEFER-85-01 | Live MCP session exercises all 4 tools | PENDING | Next live MCP session |
| DEFER-85-02 | Real CLI backends produce valid discussion files | PENDING | First multi-backend live environment |
| DEFER-84-03 | Discussion file readable by Phase 85 MCP tools | CLOSES HERE | Phase 85 integration test |

## Evaluation Confidence

**Overall confidence in evaluation design:** HIGH

**Justification:**
- Sanity checks: Adequate — 6 checks covering compilation, linting, registration, format, test execution, and export. All are deterministic and binary.
- Proxy metrics: Well-evidenced — all 5 proxy metrics have direct mechanical relationships with their targets. Coverage thresholds are enforced by Jest config (not advisory). The integration test directly closes a prior-phase deferred item.
- Deferred coverage: Comprehensive for in-phase work — the two deferred items are genuinely impossible to test without live infrastructure, and both have documented fallback paths.

**What this evaluation CAN tell us:**
- All four MCP tool descriptors are syntactically correct and type-safe
- readConfig is exported and the tool implementation can call it
- discussion.ts branch coverage meets the enforced threshold after test expansion
- The complete discussion pipeline (detect -> run -> synthesize -> persist -> read) works correctly against mocked CLIs
- No existing tests regressed

**What this evaluation CANNOT tell us:**
- Whether the MCP tools function correctly in a live Claude Code MCP session (DEFER-85-01 — validates at next live session)
- Whether real CLI responses (from actual codex/gemini executables) are parsed correctly by dispatchToBackend() (DEFER-85-02 — validates in a multi-backend environment)

---

*Evaluation plan by: Claude (grd-eval-planner)*
*Design date: 2026-03-23*
