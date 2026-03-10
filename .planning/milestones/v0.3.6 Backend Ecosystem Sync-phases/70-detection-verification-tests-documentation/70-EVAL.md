# Evaluation Plan: Phase 70 — Detection Verification, Tests & Documentation

**Designed:** 2026-03-10
**Designer:** Claude (grd-eval-planner)
**Method(s) evaluated:** Backend detection env var verification, test suite alignment, documentation hygiene
**Reference papers:** N/A — engineering phase, no paper methods. Reference: LANDSCAPE.md (March 2026 backend ecosystem)

## Evaluation Overview

Phase 70 is an engineering correctness phase, not a research phase. There are no novel algorithms or paper-backed methods to evaluate. The phase has three concrete correctness goals: (1) the test suite in `tests/unit/backend.test.ts` must exactly match the constants updated in Phase 69, (2) the detection logic in `lib/backend.ts` must be verified as current and annotated with accurate ecosystem comments, and (3) `CLAUDE.md` must be free of stale model name references.

Because all three goals are mechanically verifiable — test pass/fail is binary, reference scanning is deterministic, lint is binary — the evaluation is almost entirely Level 1 (Sanity). There are no approximate or probabilistic proxy metrics. The only deferred item is live environment detection, which requires a running instance of each backend CLI to confirm the env var and filesystem clue paths are functional (not just nominally correct per documentation).

This evaluation deliberately has no Level 2 Proxy Metrics. All relevant quality dimensions are directly measurable via `npm test`, `npm run lint`, and `grep`. Inventing proxy metrics here would add noise without adding information.

### Metric Sources

| Metric | Source | Why This Metric |
|--------|--------|----------------|
| Test pass rate (backend.test.ts) | REQ-90, plan must_haves | Direct success criterion — 0 failures is the definition of done |
| Full suite pass rate (npm test) | REQ-90, plan success_criteria | Regression guard — phase must not break other tests |
| Stale model reference count | REQ-89, plan must_haves | Directly measures the documentation hygiene goal |
| Lint pass rate (lib/backend.ts, CLAUDE.md) | Phase 70-02 verification | Ensures comment-only changes do not introduce syntax issues |
| Type-check pass rate | Standard GRD baseline | Ensures no type regressions from any changes |

### Verification Level Summary

| Level | Count | Purpose |
|-------|-------|---------|
| Sanity (L1) | 6 | Binary pass/fail checks: tests, lint, type-check, stale ref scans |
| Proxy (L2) | 0 | Not applicable — all quality dimensions are directly measurable |
| Deferred (L3) | 2 | Live backend detection in real environments (requires running CLIs) |

## Level 1: Sanity Checks

**Purpose:** Verify basic functionality. These MUST ALL PASS before proceeding.

### S1: Backend Unit Tests Pass

- **What:** All tests in `tests/unit/backend.test.ts` pass with updated Phase 69 constants
- **Command:** `npx jest tests/unit/backend.test.ts --verbose 2>&1 | tail -20`
- **Expected:** `Tests: N passed, 0 failed` — exact zero failures
- **Failure means:** At least one assertion still references a pre-Phase-69 model name or capability value; executor must reconcile test assertions against current `lib/backend.ts` constants before proceeding

### S2: Full Test Suite Regression Check

- **What:** No test regressions across the entire 2,850-test suite caused by Phase 70 changes
- **Command:** `npm test 2>&1 | tail -10`
- **Expected:** `Test Suites: N passed, 0 failed` — zero failures across all test files
- **Failure means:** Phase 70 changes broke something outside `backend.test.ts`; investigate before marking phase complete

### S3: Stale Model References Absent (CLAUDE.md)

- **What:** No hardcoded pre-Phase-69 model names remain in `CLAUDE.md`
- **Command:** `grep -n 'gemini-3-pro\|gpt-5\.3-codex\|claude-opus-4-5\|claude-sonnet-4-5' CLAUDE.md || echo "CLEAN"`
- **Expected:** `CLEAN` — grep returns nothing (exit 1, echoed as CLEAN)
- **Failure means:** `CLAUDE.md` still contains stale model references from before Phase 69; Plan 02 Task 2 must fix them

### S4: Stale Model References Absent (lib/backend.ts)

- **What:** No hardcoded pre-Phase-69 model names remain in `lib/backend.ts` outside of migration comments
- **Command:** `grep -n 'gemini-3-pro\|gpt-5\.3-codex' /Users/neo/Developer/Projects/GetResearchDone/lib/backend.ts || echo "CLEAN"`
- **Expected:** `CLEAN` or matches only inside comments prefixed with `// DEPRECATED` or `// MIGRATION`
- **Failure means:** A deprecated model constant was missed during Phase 69 updates

### S5: Lint Passes on Modified Files

- **What:** ESLint finds no errors in the two files modified by this phase
- **Command:** `npm run lint 2>&1 | grep -E '(error|warning|lib/backend\.ts|CLAUDE\.md)' | head -20 || echo "LINT CLEAN"`
- **Expected:** No `error` lines for `lib/backend.ts`; `CLAUDE.md` is not linted (markdown), so lint clean on `.ts` files suffices
- **Failure means:** Comment-only changes to `lib/backend.ts` somehow introduced a lint error (e.g., malformed JSDoc tag); fix before proceeding

### S6: TypeScript Type-Check Passes

- **What:** `tsc --noEmit` finds no type errors after all Phase 70 changes
- **Command:** `npm run build:check 2>&1 | tail -10`
- **Expected:** No output (zero errors) — TypeScript exits 0
- **Failure means:** Changes to `lib/backend.ts` (even comment-only) introduced a parse or type error; this would be a serious regression

**Sanity gate:** ALL six sanity checks must pass. Any failure blocks progression to the next phase.

## Level 2: Proxy Metrics

### No Proxy Metrics

**Rationale:** Phase 70 has no approximation problem. Every quality dimension — test correctness, reference hygiene, lint compliance, type safety — is directly and deterministically measurable in-phase. Proxy metrics exist to approximate unavailable ground truth; here the ground truth is directly computable. Adding a proxy would obscure rather than illuminate.

**Recommendation:** Rely exclusively on Sanity checks (Level 1) for in-phase verification, and the two deferred validations (Level 3) for live environment confirmation.

## Level 3: Deferred Validations

**Purpose:** Full evaluation requiring live backend environments not available during in-phase execution.

### D1: Live Env Var Detection — DEFER-70-01

- **What:** `detectBackend()` correctly returns the right `BackendId` when each backend's env vars are set in a live shell
- **How:** In a shell with each backend CLI installed and running, set the expected env var (e.g., `OPENCODE=1`), then invoke `node -e "const { detectBackend } = require('./lib/backend.js'); console.log(detectBackend('.'))"` and verify the output matches the expected backend ID
- **Why deferred:** Requires four separate running CLI environments (Claude Code, Codex CLI, Gemini CLI, OpenCode). These are not available during automated CI or phase execution
- **Validates at:** Post-v0.3.6 manual smoke test (any developer with the CLIs installed)
- **Depends on:** Live installations of Claude Code v2.1.71+, Codex CLI v0.112.0+, Gemini CLI v0.32.1+, OpenCode v1.2.21+
- **Target:** `detectBackend()` returns `'claude'` when `CLAUDE_CODE_*` is set, `'codex'` when `CODEX_HOME` is set, `'gemini'` when `GEMINI_CLI_HOME` is set, `'opencode'` when `OPENCODE` is set
- **Risk if unmet:** Detection silently falls back to the default backend in production; if an env var path changed in a CLI update, users with that backend would get wrong model mappings. Impact: Medium. Mitigation: Unit tests already cover the logic path; the risk is the env var name itself changing upstream.
- **Fallback:** If live detection fails for a specific backend, consult that CLI's changelog to confirm the env var name, then patch `detectBackend()` in a hotfix

### D2: Live Filesystem Clue Detection — DEFER-70-02

- **What:** `detectBackend()` filesystem fallback correctly identifies backends when env vars are absent but config files are present (e.g., `.gemini/settings.json` exists in cwd)
- **How:** In a shell with each backend CLI installed, ensure the relevant config file exists in the working directory and env vars are cleared, then run the same `detectBackend(cwd)` invocation and verify the correct backend ID is returned
- **Why deferred:** Requires live CLI-generated config files at known filesystem paths, and the ability to clear env vars cleanly — not reproducible in the automated test environment without mocking (which is already covered by unit tests)
- **Validates at:** Post-v0.3.6 manual smoke test
- **Depends on:** Same CLI installations as DEFER-70-01, plus at least one config file per backend created by running the CLI at least once
- **Target:** Each filesystem clue path (`.claude-plugin/plugin.json`, `.codex/config.toml`, `.gemini/settings.json`, `opencode.json`) triggers the correct backend detection
- **Risk if unmet:** Filesystem fallback broken for one or more backends; users without the env var set get wrong backend. Impact: Low-Medium (env vars are the primary detection path). Mitigation: Unit tests mock the filesystem check; failure would indicate a path change in the CLI, not a logic bug.
- **Fallback:** Verify config file paths from official CLI documentation and update `detectBackend()` path constants if needed

## Ablation Plan

**No ablation plan** — Phase 70 implements no new algorithms or multi-component system. The changes are pure corrections (test assertion updates, comment additions, doc cleanup). Component isolation is not applicable.

## WebMCP Tool Definitions

WebMCP tool definitions skipped — phase does not modify frontend views. All changes are confined to `tests/unit/backend.test.ts`, `lib/backend.ts` (comments only), and `CLAUDE.md`.

## Baselines

| Baseline | Description | Expected Score | Source |
|----------|-------------|----------------|--------|
| Backend test count | Number of tests in backend.test.ts | ~40+ passing | STATE.md: ~2,850 total tests |
| Full suite test count | Total tests across all files | ~2,850 passing | STATE.md cumulative metrics |
| Stale reference count (pre-phase) | Occurrences of deprecated model names | 0 after phase | Plan 02 must_haves |
| Lint error count | ESLint errors in modified .ts files | 0 | GRD standard baseline |
| TypeScript errors | tsc --noEmit errors across lib/ | 0 | DEFER-58-01 resolved |

## Evaluation Scripts

**Location of evaluation code:** No dedicated eval scripts — all checks use existing tooling.

**How to run full evaluation:**
```bash
# S1: Backend unit tests
npx jest tests/unit/backend.test.ts --verbose 2>&1 | tail -20

# S2: Full suite regression
npm test 2>&1 | tail -10

# S3: Stale refs in CLAUDE.md
grep -n 'gemini-3-pro\|gpt-5\.3-codex\|claude-opus-4-5\|claude-sonnet-4-5' CLAUDE.md || echo "CLEAN"

# S4: Stale refs in lib/backend.ts
grep -n 'gemini-3-pro\|gpt-5\.3-codex' lib/backend.ts || echo "CLEAN"

# S5: Lint
npm run lint 2>&1 | grep -E '(error|lib/backend\.ts)' | head -20 || echo "LINT CLEAN"

# S6: Type-check
npm run build:check 2>&1 | tail -10
```

## Results Template

*To be filled by grd-eval-reporter after phase execution.*

### Sanity Results

| Check | Status | Output | Notes |
|-------|--------|--------|-------|
| S1: Backend unit tests | [PASS/FAIL] | [test count + failure count] | |
| S2: Full suite regression | [PASS/FAIL] | [suite count + failure count] | |
| S3: Stale refs in CLAUDE.md | [PASS/FAIL] | [CLEAN or matched lines] | |
| S4: Stale refs in lib/backend.ts | [PASS/FAIL] | [CLEAN or matched lines] | |
| S5: Lint on modified files | [PASS/FAIL] | [error count] | |
| S6: TypeScript type-check | [PASS/FAIL] | [error count or clean] | |

### Proxy Results

No proxy metrics — see rationale in Level 2 section.

### Ablation Results

No ablation plan — not applicable to this phase.

### Deferred Status

| ID | Metric | Status | Validates At |
|----|--------|--------|-------------|
| DEFER-70-01 | Live env var detection (4 backends) | PENDING | Post-v0.3.6 manual smoke test |
| DEFER-70-02 | Live filesystem clue detection (4 backends) | PENDING | Post-v0.3.6 manual smoke test |

## Evaluation Confidence

**Overall confidence in evaluation design:** HIGH

**Justification:**
- Sanity checks: Adequate — all six checks are deterministic and directly measure the phase's stated success criteria. No approximation is needed.
- Proxy metrics: None required — this is appropriate and honest. The absence of proxy metrics is intentional.
- Deferred coverage: Partial but acceptable. Live env var detection cannot be automated in CI without installing real CLIs. The unit tests (S1) already exercise the detection code paths via mocking; what remains is confirming the env var names themselves haven't drifted upstream in CLI releases.

**What this evaluation CAN tell us:**
- Whether the test suite correctly reflects the Phase 69 constants (S1 + S2)
- Whether any deprecated model names remain in code or documentation (S3 + S4)
- Whether comment-only changes introduced any syntax or type issues (S5 + S6)
- That detection logic is internally consistent (S1 covers all detectBackend unit paths)

**What this evaluation CANNOT tell us:**
- Whether `GEMINI_CLI_HOME` is actually the correct env var in Gemini CLI v0.32.1 (DEFER-70-01 — needs live CLI)
- Whether `opencode.json` is still the correct filesystem clue path under `anomalyco/opencode` v1.2.21 (DEFER-70-02 — needs live CLI)
- Whether upstream CLI vendors changed any env var or config file path since LANDSCAPE.md was written on 2026-03-09

---

*Evaluation plan by: Claude (grd-eval-planner)*
*Design date: 2026-03-10*
