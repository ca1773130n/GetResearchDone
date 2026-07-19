# Evaluation Results: Phase 105 — AI-Panel Fallback + Hardening

**Evaluated:** 2026-07-19
**Reporter:** Claude (grd-eval-reporter)
**Git hash:** HEAD at evaluation time (post `c7b484d` docs(105-03) — includes 105-01/02/03 commits; 105-04 is validation-only, no code changes)
**Environment:** `npm run build:check` (tsc --noEmit), `npm run lint` (eslint bin/ lib/), `TMPDIR=$(mktemp -d) npx jest` (full suite + scoped suites)

---

## Sanity Results (Level 1)

| Check | Status | Output | Notes |
|-------|--------|--------|-------|
| S1 build:check | PASS | `tsc --noEmit` exit 0, zero errors | No new type errors from `answerViaDiscussion`/`resolveCheckpointInline` |
| S2 lint | PASS | `eslint bin/ lib/` exit 0, zero errors/warnings | |
| S3 docs grep (fallback + Interactive steering) | PASS | Non-empty hits in CLAUDE.md:112, docs/autoresearch-tutorial.md:357/379/475, commands/settings.md:539; "Interactive steering" section at docs/autoresearch-tutorial.md:343 | REQ-208 SC3 documentation obligation met in all three files |
| S4 jest.config.js threshold diff | PASS | `git diff HEAD~10 -- jest.config.js` shows zero changes across all 105-01/02/03 commits (93ac74b, 91877d8, 0304ab6, bb976ce, 8634199, 6053d9a, 68b4aa9, c7b484d); full-suite run enforces the existing `checkpoints.ts: {lines:90, functions:100, branches:80}` threshold with no failure | No threshold lowered or removed |
| S5 sandbox cleanliness (`git status --porcelain`) | PASS | `git status --porcelain` shows only pre-existing untracked `105-REVIEW.md`, `.planning/milestones/v0.5.0/todos/`, `.playwright-mcp/` — no `.planning/research/threads/`, no root `KNOWHOW.md`, no `.planning/DEAD-ENDS.md` mutation | Confirms 105-04-VALIDATION.md's own repo-cleanliness claim independently |

**Sanity gate: PASSED — all 5 checks pass.**

---

## Proxy Results (Level 2)

Command: `TMPDIR=$(mktemp -d) npx jest tests/unit/research/checkpoints.test.ts tests/unit/research/orchestrator.test.ts tests/unit/research/milestone-verification.test.ts`
Result: **3 suites passed, 149/149 tests passed** (23.2s)

| Metric | Target | Actual | Status | Notes |
|--------|--------|--------|--------|-------|
| P1 answerViaDiscussion core + participant exclusion | all cases pass | PASS (within checkpoints.test.ts) | MET | `answeredBy:'panel'` mapping + loop-backend exclusion asserted |
| P2 matching order + rate-limit/empty guard | all cases pass | PASS (within checkpoints.test.ts) | MET | exact/prefix/no-match/empty/rate-limited table-driven cases all pass |
| P3 panel-fallback inline resolution, no pause | all cases pass | PASS (within orchestrator.test.ts, 22.7s) | MET | All 4 emit sites (seed/design/hypothesize/decide) resolve inline, never `paused` |
| P4 recommended-path byte-identical | 100% pass | PASS | MET | Zero calls to panel stub under `fallback:'recommended'`; matches pre-105 baseline fixture |
| P5 portfolio + telemetry counters | all cases pass | PASS | MET | `research.checkpoint_panel_answered_total` / `_unavailable_total` / `_pauses_total` counters and non-pause portfolio behavior verified |
| P6 R1 no unattended pause (5 sites) | all cases pass | PASS (within milestone-verification.test.ts) | MET | bench.ts, portfolio.ts, harness path, autopilot/GRD_AUTOPILOT, cli-kb.ts all assert `active:false`, incl. panel variant |
| P7 R3 back-compat + R4 debug-pin contract | all cases pass | PASS | MET | R3 byte-identical JSON round-trip on frozen Phase-101 fixture; R4 committed pin equals edited contract post debug re-plan |
| P8 R5 no double-ask + coverage guard | all cases pass | PASS | MET | `consumeAnswered` one-shot semantics confirmed; coverage-guard evidence folded into S4 |

**Proxy summary: 8/8 targets met (149/149 underlying test cases passed).**

**Full-suite regression check:** `TMPDIR=$(mktemp -d) npx jest` (all suites, no filter) — **160 suites passed, 5506/5509 tests passed (3 skipped), 0 failed**, 191.5s. No regressions introduced by 105-01/02/03/04 across the whole codebase. All proxy results remain `validated: false` per GRD convention (offline injected fixtures — awaiting deferred/live confirmation, see below).

---

## Ablation Results

N/A — no ablation plan for this phase (per 105-EVAL.md).

---

## Deferred Status (Level 3) — from 105-04-VALIDATION.md

All items collected and dispositioned by the phase's human-verify checkpoint. Per the task instructions, this reporter records status only (did not re-run live validation):

| ID | Metric | Status | Disposition Source |
|----|--------|--------|--------------------|
| DEFER-105-01 | Live panel-backend answer quality | **RESOLVED (folded into DEFER-101-02 Pass 3)** | 105-04-VALIDATION.md — not carried forward as separate item after Pass 3 |
| DEFER-101-02 | `fallback:'panel'` unattended answering (panel behavior) | **FULLY RESOLVED** | Both branches proven live with real backends: Pass 2/2b degrade-safe non-pausing default, AND Pass 3 literal `answeredBy:'panel'` record observed via production `answerViaDiscussion` with real opencode+codex panel / claude synthesizer |
| DEFER-101-03 | Full R1–R5 milestone suite (live confirmation) | **RESOLVED** | Offline by 105-03 (`tests/unit/research/milestone-verification.test.ts`), 652 tests green at 105-03 landing (149 of the milestone-relevant subset independently reconfirmed above), no threshold lowered |
| DEFER-102-01 | Live AskUserQuestion/SEED clarify UX | **RESOLVED** | Pass 1: live SEED clarification produced one sharp, decision-relevant question with recommended option marked; answered via `--answers`, resumed with no double-ask |
| DEFER-104-01 | Live N-candidate generation quality | **RESOLVED** | Pass 1: 3 genuinely distinct, falsifiable candidates (affirmative/refuting/boundary-condition) with full statement+rationale+predictedOutcome |
| DEFER-104-02 | Live human candidate selection UX | **RESOLVED** | Pass 1: coherent selection prompt — one question, recommended marked, readable options, freeform escape hatch |
| DEFER-105-02 | Sandbox isolation discipline | **RESOLVED** | Confirmed independently above (S5) and in 105-04-VALIDATION.md — `git status --porcelain` clean of sandbox artifacts |

**Re-deferred: none.** Every deferred item this Integration Phase owns (its own D1 plus the carried-over 101/102/104 items) reached an explicit RESOLVED disposition — no item silently dropped. One non-blocking hardening follow-up was logged (not a deferred validation): `resolveElicitation` forwards only `ck.context` to the panel, ignoring the built `question` prompt (option labels + verbatim-reply instruction), which is why Pass 2/2b degraded to defaults on vanilla checkpoints; also `codex`/`gemini` returned empty inside `runDiscussion` despite codex authenticating standalone. Both are candidates for a future `lib/discussion.ts` hardening plan, out of scope for 105.

---

## Gap Analysis

No gaps. All sanity checks passed, all 8 proxy metrics met target, all 7 deferred items reached RESOLVED disposition (none re-deferred, none silently dropped), and the full regression suite (5506/5509 passed, 3 pre-existing skips, 0 failed) confirms no cross-codebase regression. No jest.config.js coverage threshold was lowered.

---

## Results Analysis

Phase 105 is GRD's Integration Phase for the v0.5.0 milestone, and its evaluation plan explicitly separated mechanical correctness (offline, deterministic, Level 1/2) from live judgment (Level 3, human-verify, non-autonomous). Both halves closed cleanly. The offline half proves the panel resolver (`answerViaDiscussion`) is contract-correct and degrade-safe across every enumerated failure mode — empty synthesis, rate-limited panelist, no option match, loop-backend exclusion — and that the panel-fallback wiring never pauses an autonomous or concurrent-portfolio run while the default `fallback:"recommended"` path stays byte-identical to pre-105 behavior. The Integration Phase's core deliverable, the R1/R3/R4/R5 cross-phase proof suite (105-03), passed as a single deterministic assertion set, closing the milestone's central seam-integrity question.

The live half (105-04) went further than the eval plan's baseline target ("at least one live checkpoint resolves `answeredBy:'panel'` with no pause, OR an acceptable clean-degrade to default"): it not only observed the acceptable degrade path (Pass 2/2b) but also root-caused *why* real production checkpoints degrade (the `resolveElicitation` context-forwarding gap) and then produced a literal `answeredBy:'panel'` record through the exact production code path with real multi-backend LLMs (Pass 3), fully resolving DEFER-101-02 rather than leaving it in a merely-acceptable partial state. All five milestone-wide deferred items carried into this phase (101-02, 101-03, 102-01, 104-01, 104-02) plus this phase's own D1 reached explicit RESOLVED dispositions with no silent drops — satisfying the audit obligation the eval plan set out.

One caveat carries forward, correctly flagged as non-blocking rather than a miss: the discovered `resolveElicitation` context-forwarding gap and the codex/gemini empty-response behavior inside `runDiscussion` are real product-quality issues that make panel-answers rare in practice on vanilla checkpoints today. This does not fail any metric in this plan (the mechanical safety net was never at risk, and the plan's target already treated clean-degrade as an acceptable outcome) — but it is a legitimate seed for a follow-up hardening plan, exactly as 104-EVAL.md's own DEFER items seeded this phase.

---

## Recommendation

**Action:** PROCEED

**Rationale:** All 5 sanity checks pass, all 8 proxy metrics meet target (149/149 test cases; 5506/5509 full-suite regression, 0 failures), and all 7 deferred/carried-over validation items reached explicit RESOLVED disposition with no re-deferrals. No coverage threshold was lowered. The milestone's Integration Phase has closed its central obligation — proving the cross-phase R1/R3/R4/R5 seams hold and that every outstanding deferred item from Phases 101–104 has a final, evidenced disposition.

Suggested non-blocking follow-up (does not block milestone close): file a small hardening plan for `lib/discussion.ts` to (a) forward the built panel `question` (option labels + verbatim-reply instruction) through `resolveElicitation` instead of only `ck.context`, and (b) investigate why `codex`/`gemini` return empty inside `runDiscussion` despite authenticating standalone. This would make live panel answers fire reliably on vanilla production checkpoints rather than only when context is manually enriched, as observed in 105-04 Pass 3.

---

*Evaluation report by: Claude (grd-eval-reporter)*
*Report date: 2026-07-19*
