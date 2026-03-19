# Benchmarks — v0.3.12

**Last updated:** 2026-03-19

## Sanity Gate Pass Rate

| Date | Phase | Method | Checks | Passed | Failed | Conditions | Notes |
|------|-------|--------|--------|--------|--------|------------|-------|
| 2026-03-19 | 76 — Agent Frontmatter & MCP Elicitation | Structural correctness checks | 14 | 14 | 0 | macOS, Node.js v24.14.0, Python 3.9.6 | All L1 sanity checks; no L2 proxy metrics for this phase |

## Build Health

| Date | Phase | Metric | Value | Conditions | Notes |
|------|-------|--------|-------|------------|-------|
| 2026-03-19 | 76 | TypeScript build (npm run build:check) | PASS / 0 errors | tsc --noEmit, strict mode | No type errors introduced by BackendCapabilities extension |
| 2026-03-19 | 76 | ESLint (npm run lint) | PASS / 0 violations | ESLint on bin/ and lib/ | No style violations in modified files |
| 2026-03-19 | 76 | npm test | 3127 pass / 7 pre-existing fail | Jest, 49 suites | 7 failures from phase 74 model mapping changes; 0 failures from phase 76 changes |

## Agent Frontmatter Coverage

| Date | Phase | Metric | Value | Conditions | Notes |
|------|-------|--------|-------|------------|-------|
| 2026-03-19 | 76 | Agents with effort field | 20/20 (100%) | agents/grd-*.md | Baseline before phase: 0/20 |
| 2026-03-19 | 76 | Agents with valid effort value | 20/20 (100%) | values: low/medium/high | All match EFFORT_PROFILES balanced column |
| 2026-03-19 | 76 | Bounded agents with maxTurns | 7/7 (100%) | code-reviewer, verifier, plan-checker, integration-checker, eval-planner, baseline-assessor, migrator | Baseline before phase: 0/7 |
| 2026-03-19 | 76 | Read-only agents with disallowedTools | 4/4 (100%) | code-reviewer, plan-checker, integration-checker, verifier | Baseline before phase: 0/4 |
| 2026-03-19 | 76 | Agent YAML parse errors | 0/20 | python3 yaml.safe_load | All frontmatter syntactically valid |

## Backend Capability Matrix

| Date | Phase | Metric | Value | Conditions | Notes |
|------|-------|--------|-------|------------|-------|
| 2026-03-19 | 76 | Backends with mcp_elicitation field | 7/7 (100%) | lib/backend.ts | claude, codex, gemini, opencode, overstory, superpowers, grd |
| 2026-03-19 | 76 | Backends with mcp_elicitation: true | 1/7 | claude backend only | Correct: Claude Code v2.1.76+ only |
| 2026-03-19 | 76 | cmdInitExecutePhase new fields present | 2/2 | node bin/grd-tools.js init execute-phase 76 --json | mcp_elicitation_available + model_overrides_available |

## Evaluation History

| Date | Phase | Sanity | Proxy Met | Proxy Missed | Action Taken |
|------|-------|--------|-----------|-------------|--------------|
| 2026-03-19 | 76 — Agent Frontmatter & MCP Elicitation | 14/14 | N/A | N/A | PROCEED — all checks pass |
