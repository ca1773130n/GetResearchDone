# Evaluation Plan: Phase 104 — HYPOTHESIZE Candidate Selection

**Designed:** 2026-07-19
**Designer:** Claude (grd-eval-planner)
**Method(s) evaluated:** N/A (no external paper) — implement phase on GRD's own TypeScript
autoresearch orchestrator, adding a multi-candidate hypothesis prompt/parser (104-01) and a
pre-ledger selection checkpoint (104-02).
**Reference papers:** None. Design basis: `.planning/milestones/v0.5.0/research/SUMMARY.md`
§F5, and the Phase 102 (DESIGN) / Phase 103 (SEED/DECIDE) checkpoint emit/consume precedent
(`103-03-SUMMARY.md`).

## Evaluation Overview

This phase has no paper to reproduce and no product-quality benchmark corpus — it is a
codebase-internal capability (REQ-205 multi-candidate generation, REQ-206 selection checkpoint)
built via strict TDD against GRD's existing test/lint/type infrastructure. "Correctness" here
means: (1) the code compiles and lints cleanly, (2) the new deterministic offline unit tests
(injected spawn/runner/checkpointHandler — no live backend) exercise every must-have behavior
and pass, and (3) the untouched single-block N=1/disabled path remains byte-identical (regression
protection via pinning tests). Both plans explicitly classify Level 3 (live N-candidate generation
against a real backend, live human candidate selection) as deferred to phase verification — there
is no live-backend proxy available in-phase, by design (GRD's TDD convention injects
spawn/runner/checkpointHandler for determinism).

### Metric Sources

| Metric | Source | Why This Metric |
|--------|--------|----------------|
| tsc --noEmit / eslint clean | `npm run build:check`, `npm run lint` | Baseline sanity gate used by every GRD phase |
| Per-file jest coverage threshold | `jest.config.js` (existing per-file thresholds for `_prompts.ts`, `agent-io.ts`, `orchestrator.ts`) | Existing project baseline; plans require it "holds or rises" |
| New unit test cases (agent-io, prompts, orchestrator) | 104-01-PLAN.md / 104-02-PLAN.md `eval_metrics` + `<verify>` blocks | Directly encodes each must-have truth as a deterministic offline assertion |
| Byte-identical pin tests (`buildHypothesizePrompt`, `parseHypothesisOutput`) | 104-01-PLAN.md Task 1/2 | Regression guard — the N=1/disabled path must not drift (SC1) |
| Zero ledger pollution assertion | 104-02-PLAN.md Task 3 | Directly encodes SC2 (the phase's core safety property) |

### Verification Level Summary

| Level | Count | Purpose |
|-------|-------|---------|
| Sanity (L1) | 4 | tsc, lint, and a static grep pin on untouched control-flow (evaluateVerdict/decideBranch) |
| Proxy (L2) | 7 | Deterministic offline jest suites covering parser/prompt contracts and orchestrator pre-ledger gating |
| Deferred (L3) | 2 | Live N-candidate generation and live human selection against a real backend |

## Level 1: Sanity Checks

**Purpose:** Verify basic functionality. These MUST ALL PASS before proceeding.

### S1: TypeScript strict compile
- **What:** No new type errors introduced by `_prompts.ts`, `agent-io.ts`, `orchestrator.ts` changes
- **Command:** `npm run build:check`
- **Expected:** Exit 0, zero errors
- **Failure means:** New symbols (`buildHypothesesPrompt`, `parseHypothesesOutput`,
  `resolveSelectPosture`, `buildSelectCheckpoint`) violate `strict` mode or the zero-`any` rule

### S2: ESLint clean
- **What:** No new lint violations in modified files
- **Command:** `npm run lint`
- **Expected:** Exit 0, zero errors/warnings on `lib/` scope
- **Failure means:** Style/typed-require convention broken (e.g. missing `'use strict'`, untyped require)

### S3: Untouched control-flow pin (static grep)
- **What:** `evaluateVerdict`, the committed-contract pin, `shouldTerminate`, and `decideBranch`
  call sites in `orchestrator.ts` are unchanged by the 104-02 diff
- **Command:** `git diff lib/research/orchestrator.ts | grep -E '^[+-].*(evaluateVerdict|shouldTerminate|decideBranch)'`
- **Expected:** No output (no lines touching these symbols)
- **Failure means:** The selection checkpoint change leaked outside the additive
  cold-HYPOTHESIZE branch + two new helpers, risking DECIDE-branch regressions

### S4: Full existing suite does not regress
- **What:** The ~5000-test suite (not just the new describe blocks) still passes after both plans land
- **Command:** `TMPDIR=$(mktemp -d) npx jest`
- **Expected:** All suites green, including `tests/unit/research/agent-io.test.ts`,
  `tests/unit/research/prompts.test.ts`, `tests/unit/research/orchestrator.test.ts`, and all
  Phase 102/103 SEED/DESIGN/DECIDE tests
- **Failure means:** Cross-phase regression — most likely in the shared cold-HYPOTHESIZE
  if/else chain (seeded / execute-resume / crash-recovery arms)

**Sanity gate:** ALL sanity checks must pass. Any failure blocks progression.

## Level 2: Proxy Metrics

**Purpose:** Indirect evaluation of quality/performance via deterministic offline unit tests
(injected spawn/runner/checkpointHandler — no live LLM backend). These are the primary
verification mechanism for this phase (`verification_level: proxy` in both plans), not a
substitute for live-backend confirmation.
**IMPORTANT:** Proxy metrics are NOT validated substitutes for full evaluation. Treat results
with appropriate skepticism — offline injected fixtures approximate but do not prove real
backend/parser behavior at scale (e.g., an LLM emitting malformed JSON in a way the fixtures
didn't anticipate).

### P1: parseHypothesesOutput ranked/capped/degrade-safe parsing
- **What:** Multi-candidate `__HYPOTHESES__` block parses into a ranked, order-preserving,
  capped array; degrades to `{candidates: []}` on any malformed input (never throws/null)
- **How:** Table-driven jest cases (3-candidate well-formed, 4-with-n=3 cap, statement-less
  drop, missing-field defaulting, malformed/missing block, extra trailing prose)
- **Command:** `TMPDIR=$(mktemp -d) npx jest tests/unit/research/agent-io.test.ts`
- **Target:** All `describe('parseHypothesesOutput (Phase 104)')` cases pass
- **Evidence:** 104-01-PLAN.md Task 1 `<action>`/`<verify>`; mirrors `parseClarifyOutput`'s
  established degrade-safe precedent already in production
- **Correlation with full metric:** HIGH — the parser contract is fully deterministic (pure
  function over a string), so offline test coverage is not an approximation, it IS the metric
- **Blind spots:** Does not prove a real LLM backend actually emits well-formed
  `__HYPOTHESES__` JSON at the requested cardinality N (deferred, see D1)
- **Validated:** No — awaiting deferred validation (live backend generation) at phase verification

### P2: parseHypothesisOutput / buildHypothesizePrompt byte-identical pin
- **What:** The existing single-block N=1/disabled path is unchanged by this phase
- **How:** Pin assertions comparing pre/post-change output of `buildHypothesizePrompt` and
  behavior of `parseHypothesisOutput` (still returns null on no statement/block)
- **Command:** `TMPDIR=$(mktemp -d) npx jest tests/unit/research/agent-io.test.ts tests/unit/research/prompts.test.ts`
- **Target:** 100% of pin assertions pass; zero diff in emitted `__HYPOTHESIS__` contract text
- **Evidence:** 104-01-PLAN.md `eval_metrics.secondary`: "existing single-block
  parseHypothesisOutput byte-identical", "buildHypothesizePrompt byte-identical"
- **Correlation with full metric:** HIGH — direct regression test, same technique used for
  SC1 across all GRD phases
- **Blind spots:** None within the offline scope — this is a closed, deterministic assertion
- **Validated:** No — formally "validated" only once merged and full suite (S4) confirms no
  downstream breakage

### P3: buildHypothesesPrompt contract emission
- **What:** The multi-candidate prompt requests N ranked candidates and emits exactly one
  `__HYPOTHESES__` block with the `{candidates:[{statement,rationale,predictedOutcome}]}` shape
- **How:** String-contains assertions on prompt output for `__HYPOTHESES__`, the JSON contract
  keys, and N; grounding `pack` embedding check
- **Command:** `TMPDIR=$(mktemp -d) npx jest tests/unit/research/prompts.test.ts`
- **Target:** All `buildHypothesesPrompt` cases pass
- **Evidence:** 104-01-PLAN.md Task 2; SUMMARY.md §F5 contract definition
- **Correlation with full metric:** MEDIUM — proves the prompt TEXT requests the right shape,
  but cannot prove an LLM will comply (that requires D1, live generation)
- **Blind spots:** Prompt compliance by a real model is unverified in-phase
- **Validated:** No

### P4: Selection checkpoint pre-ledger pause + zero pollution
- **What:** With gate active and >=2 candidates, `runLoop` pauses with
  `pendingCheckpoint.point==='hypothesize', type==='selection'` and the ledger has NO hypothesis
  for the current iteration at pause time
- **How:** Injected spawn returns a fixed 3-candidate `__HYPOTHESES__` block; assert
  `readLedger` before resume shows no entry for `thread.iteration`
- **Command:** `TMPDIR=$(mktemp -d) npx jest tests/unit/research/orchestrator.test.ts`
- **Target:** Pause assertion + zero-ledger-entry assertion both pass
- **Evidence:** 104-02-PLAN.md Task 3 "PRE-LEDGER PAUSE + ZERO POLLUTION"; this is the direct
  offline encoding of SC2, the phase's core safety property
- **Correlation with full metric:** HIGH — ledger state is inspected directly via the same
  `readLedger` function the live system uses; no simulation gap for this specific assertion
- **Blind spots:** Does not cover concurrent/interleaved iterations or crash-mid-pause scenarios
- **Validated:** No

### P5: Matched-resume append-one + freeform-resume
- **What:** Resuming with a matched candidate label appends exactly one hypothesis with the
  candidate's full fields; resuming with a freeform "Other" answer appends a user-authored
  statement with `rationale='user-provided at checkpoint'`
- **How:** Injected `checkpointHandler`/resume with both a matched label and a freeform
  label+text; assert ledger contents and that DESIGN is reached afterward
- **Command:** `TMPDIR=$(mktemp -d) npx jest tests/unit/research/orchestrator.test.ts`
- **Target:** "MATCHED RESUME" and "FREEFORM RESUME" cases both pass (SC2, SC3)
- **Evidence:** 104-02-PLAN.md Task 3
- **Correlation with full metric:** HIGH — same reasoning as P4, direct ledger inspection
- **Blind spots:** None material within offline scope
- **Validated:** No

### P6: Byte-identical default (gate-off / N=1 / 0-candidate degrade)
- **What:** Gate off, or `parseHypothesesOutput` yields 0 candidates, degrades to the existing
  single-block spawn with exactly one hypothesis appended and no checkpoint emitted
- **How:** Two sub-cases in the same describe block: gate-off run, and gate-on-but-empty-parse run
- **Command:** `TMPDIR=$(mktemp -d) npx jest tests/unit/research/orchestrator.test.ts`
- **Target:** Both sub-cases pass; zero `pendingCheckpoint.point==='hypothesize'` in either
- **Evidence:** 104-02-PLAN.md Task 3 "BYTE-IDENTICAL DEFAULT / N=1"; SC1
- **Correlation with full metric:** HIGH
- **Blind spots:** None material
- **Validated:** No

### P7: Skip paths (seeded / execute-resume / crash-recovery) + no-double-ask
- **What:** Seeded synthesis hypothesis, execute-gate resume, and crash-recovery paths never
  emit a selection checkpoint (SC4); a matched resume advances exactly once (no re-consume on
  re-entry)
- **How:** Three skip-path fixtures + one re-entry fixture per 104-02-PLAN.md Task 3 "SKIP
  PATHS (SC4)" and "NO DOUBLE-ASK"
- **Command:** `TMPDIR=$(mktemp -d) npx jest tests/unit/research/orchestrator.test.ts`
- **Target:** All four cases pass
- **Evidence:** 104-02-PLAN.md Task 3; mirrors the `consumeAnswered` WeakSet one-shot pattern
  already proven in Phase 102/103
- **Correlation with full metric:** HIGH — these are the exact branch conditions the production
  if/else chain evaluates
- **Blind spots:** Real crash-recovery timing (actual process kill mid-write) is not simulated;
  only the branch-selection logic is exercised
- **Validated:** No

## Level 3: Deferred Validations

**Purpose:** Full evaluation requiring a live LLM backend or live human interaction, unavailable
in-phase per GRD's offline/deterministic TDD convention.

### D1: Live N-candidate generation quality — DEFER-104-01
- **What:** A real backend (claude/codex/antigravity), given `buildHypothesesPrompt`, actually
  emits a well-formed `__HYPOTHESES__` block with up to N distinct, ranked, testable candidates
- **How:** Run a live `gd research "<q>"` iteration with `interactive.hypothesize` on and
  `hypothesis_candidates` >1 in a throwaway `mktemp -d` sandbox (per repo gotcha — never in the
  repo root); inspect the raw stdout for contract compliance
- **Why deferred:** No live-backend spawn is exercised in-phase (TDD convention injects spawn);
  LLM prompt-following behavior cannot be proven by offline fixtures
- **Validates at:** phase verification (manual run) or a subsequent integration/E2E phase if one
  is scheduled for the autoresearch loop
- **Depends on:** A configured backend account (`gd accounts sync` / scheduler) and network access
- **Target:** >=2 of N requested candidates parse successfully via `parseHypothesesOutput` in a
  live run; candidates are non-duplicate statements
- **Risk if unmet:** If the model frequently returns malformed JSON or fewer than 2 candidates,
  the selection checkpoint will constantly degrade to the single-block path — feature is
  effectively inert. Mitigation: tighten prompt wording, add a retry-with-reformat step (out of
  scope for 104, would need a new plan)
- **Fallback:** Degrade path (already built into 104-02 Task 1) silently falls back to
  single-block generation, so the system remains safe/functional even if this fails

### D2: Live human candidate selection UX — DEFER-104-02
- **What:** A real user, presented with the selection checkpoint (via CLI or interactive
  session), can meaningfully distinguish and choose among ranked candidates, or supply a
  freeform alternative
- **How:** Manual dogfood session running `gd research` interactively with the hypothesize gate on
- **Why deferred:** Requires a human in the loop; not automatable in offline TDD
- **Validates at:** Manual review / next milestone's user-facing QA pass
- **Depends on:** D1 (candidates must actually generate meaningfully) plus a working checkpoint
  CLI presentation (already covered structurally by Phase 102/103 checkpoint UI, reused here)
- **Target:** A user can complete a selection (matched or freeform) without confusion in a
  single interactive turn
- **Risk if unmet:** UX friction reduces adoption of the feature; does not affect ledger
  correctness (P4/P5 already guarantee that independently of UX quality)
- **Fallback:** None needed for correctness; this is a UX/usability concern layered on top of
  an already-correct mechanism

## Ablation Plan

**No ablation plan** — this phase adds one cohesive capability (multi-candidate generation +
selection checkpoint) with no internal sub-components whose individual contribution needs
isolating. The two plans (104-01 parser/prompt layer, 104-02 orchestrator wiring) are sequential
dependencies, not alternative conditions to compare.

## WebMCP Tool Definitions

WebMCP tool definitions skipped — this phase modifies `lib/research/_prompts.ts`,
`lib/research/agent-io.ts`, and `lib/research/orchestrator.ts` only (no HTML/JSX/TSX/Vue/Svelte/
CSS files, no frontend page/view/component paths). Not a frontend phase.

## Baselines

| Baseline | Description | Expected Score | Source |
|----------|-------------|----------------|--------|
| Existing test suite | ~5000 jest tests across `lib/`/`tests/unit/` | 100% pass (no regressions) | CLAUDE.md "Dev" table |
| Per-file coverage thresholds | `jest.config.js` thresholds for `_prompts.ts`, `agent-io.ts`, `orchestrator.ts` | Hold or rise (never lowered) | 104-01/104-02 `eval_metrics.target` |
| `npm run lint` | ESLint on `bin/` and `lib/` | Zero errors | CLAUDE.md "Dev" table |
| `npm run build:check` | `tsc --noEmit` | Zero errors | CLAUDE.md "Dev" table |
| Phase 102/103 checkpoint pattern | DESIGN/SEED/DECIDE emit-consume precedent already in production | Behavior parity (resolve*Posture, build*Checkpoint, consumeAnswered one-shot) | `103-03-SUMMARY.md` |

## Evaluation Scripts

**Location of evaluation code:**
```
tests/unit/research/agent-io.test.ts       (P1, P2 partial)
tests/unit/research/prompts.test.ts        (P2 partial, P3)
tests/unit/research/orchestrator.test.ts   (P4, P5, P6, P7)
```

**How to run full evaluation:**
```bash
npm run build:check && npm run lint
TMPDIR=$(mktemp -d) npx jest tests/unit/research/agent-io.test.ts tests/unit/research/prompts.test.ts tests/unit/research/orchestrator.test.ts
TMPDIR=$(mktemp -d) npx jest   # full suite regression check (S4)
```

## Results Template

*To be filled by grd-eval-reporter after phase execution.*

### Sanity Results

| Check | Status | Output | Notes |
|-------|--------|--------|-------|
| S1 build:check | | | |
| S2 lint | | | |
| S3 control-flow pin | | | |
| S4 full suite | | | |

### Proxy Results

| Metric | Target | Actual | Status | Notes |
|--------|--------|--------|--------|-------|
| P1 parseHypothesesOutput | all cases pass | | | |
| P2 byte-identical pin | 100% pass | | | |
| P3 buildHypothesesPrompt contract | all cases pass | | | |
| P4 pre-ledger pause / zero pollution | pass | | | |
| P5 matched/freeform resume | pass | | | |
| P6 byte-identical default/degrade | pass | | | |
| P7 skip paths / no-double-ask | pass | | | |

### Ablation Results

N/A — no ablation plan for this phase.

### Deferred Status

| ID | Metric | Status | Validates At |
|----|--------|--------|-------------|
| DEFER-104-01 | Live N-candidate generation quality | PENDING | phase verification / manual sandbox run |
| DEFER-104-02 | Live human candidate selection UX | PENDING | manual review / next milestone QA |

## Evaluation Confidence

**Overall confidence in evaluation design:** HIGH for correctness/regression safety, MEDIUM for
real-world (live backend) feature efficacy.

**Justification:**
- Sanity checks: adequate — tsc/lint/full-suite/static-pin cover GRD's standard four-gate
  regression protection used across all phases.
- Proxy metrics: well-evidenced — every P1-P7 metric traces directly to a `<verify>`/`must_haves`
  line in 104-01-PLAN.md or 104-02-PLAN.md, and for the pure-function/ledger-state assertions
  (P1, P2, P4, P5) the offline test IS the real metric (no simulation gap), not an approximation.
- Deferred coverage: partial by necessity — the two deferred items (D1 live generation quality,
  D2 live selection UX) are exactly the two things offline TDD structurally cannot prove: real
  LLM compliance with a prompt contract, and real human usability. Both are captured with
  explicit risk/fallback so a failure there is contained (degrade path) rather than silent.

**What this evaluation CAN tell us:**
- The parser/prompt layer is contract-correct and degrade-safe for any input shape we've
  enumerated (well-formed, truncated, malformed, statement-less, over-cap).
- The selection checkpoint mechanically guarantees zero ledger pollution and correct
  matched/freeform resume behavior, independent of what a real LLM produces.
- The N=1/disabled/seeded/resume/crash-recovery paths are provably unaffected (regression-safe).

**What this evaluation CANNOT tell us:**
- Whether real LLM backends reliably produce well-formed, diverse, useful `__HYPOTHESES__`
  candidates at the requested cardinality — addressed at DEFER-104-01 (phase verification).
- Whether the selection UX is comprehensible/useful to an actual user — addressed at
  DEFER-104-02 (manual QA, next milestone).

---

*Evaluation plan by: Claude (grd-eval-planner)*
*Design date: 2026-07-19*
