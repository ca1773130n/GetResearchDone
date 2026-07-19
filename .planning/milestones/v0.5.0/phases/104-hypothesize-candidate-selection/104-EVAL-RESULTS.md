# Evaluation Results: Phase 104 — HYPOTHESIZE Candidate Selection

**Evaluated:** 2026-07-19
**Reporter:** Claude (grd-eval-reporter)
**Git hash:** f6bf41a (HEAD)
**Committed diff range checked:** f3ba547^..HEAD (`lib/research/orchestrator.ts`)
**Environment:** local dev checkout, `TMPDIR` set outside repo per repo test-hygiene convention

## Sanity Results

| Check | Status | Output | Notes |
|-------|--------|--------|-------|
| S1 `npm run build:check` | PASS | `tsc --noEmit` — exit 0, zero errors | No new type errors in `_prompts.ts`, `agent-io.ts`, `orchestrator.ts` |
| S2 `npm run lint` | PASS | `eslint bin/ lib/` — exit 0, zero errors/warnings | Style/typed-require conventions intact |
| S3 control-flow pin | PASS | `git diff f3ba547^..HEAD -- lib/research/orchestrator.ts \| grep -E '^[+-].*(evaluateVerdict\|shouldTerminate\|decideBranch)'` → 0 matches | Committed diff range used (working tree already landed); confirms `evaluateVerdict`/`shouldTerminate`/`decideBranch` untouched by the 104-02 commits (`4cf443f`, `f6bf41a`) |
| S4 full suite | PASS | 159/159 suites, 5476 passed / 3 skipped / 0 failed (233.7s) | Full ~5000-test suite green, includes all Phase 102/103 SEED/DESIGN/DECIDE tests plus the new 104 describe blocks |

**Sanity gate:** PASSED — all 4 checks pass.

## Proxy Results

| Metric | Target | Actual | Status | Notes |
|--------|--------|--------|--------|-------|
| P1 parseHypothesesOutput | all cases pass | `describe('parseHypothesesOutput (Phase 104)')` — all cases pass | MET | agent-io.test.ts, part of 122/122 combined pass |
| P2 byte-identical pin | 100% pass | `BYTE-IDENTICAL DEFAULT` cases (prompt/parser) pass; no diff in emitted contract text | MET | agent-io.test.ts + prompts.test.ts |
| P3 buildHypothesesPrompt contract | all cases pass | prompts.test.ts suite PASS (contract keys/N/`__HYPOTHESES__` block assertions) | MET | prompts.test.ts |
| P4 pre-ledger pause / zero pollution | pass | `PRE-LEDGER PAUSE + ZERO POLLUTION: >=2 candidates ⇒ selection pause with an EMPTY ledger` — PASS | MET | orchestrator.test.ts |
| P5 matched/freeform resume | pass | `MATCHED RESUME` and `FREEFORM RESUME` cases both PASS | MET | orchestrator.test.ts |
| P6 byte-identical default/degrade | pass | `BYTE-IDENTICAL DEFAULT: interactive off ⇒ single-block spawn, one hyp, NO selection checkpoint` — PASS; zero `pendingCheckpoint.point==='hypothesize'` in gate-off/degrade sub-cases | MET | orchestrator.test.ts |
| P7 skip paths / no-double-ask | pass | `SKIP PATH (SC4a/b/c)` (seeded, execute-resume, crash-recovery) all PASS; `NO DOUBLE-ASK: a matched resume advances once and does not re-pause` PASS | MET | orchestrator.test.ts |

**Combined suite run:** `tests/unit/research/agent-io.test.ts`, `tests/unit/research/prompts.test.ts`, `tests/unit/research/orchestrator.test.ts` → 3 suites passed, 122/122 tests passed (19.1s).

**Proxy summary:** 7/7 targets met. All results are `validated: false` — proxy metrics only, per EVAL.md's offline/deterministic TDD scope; no live-backend spawn is exercised in-phase.

## Ablation Results

N/A — no ablation plan for this phase (EVAL.md: single cohesive capability, no sub-components to isolate).

## Deferred Status

| ID | Metric | Status | Validates At |
|----|--------|--------|-------------|
| DEFER-104-01 | Live N-candidate generation quality | PENDING | phase verification / manual sandbox run |
| DEFER-104-02 | Live human candidate selection UX | PENDING | manual review / next milestone QA |

## Verdict

**All targets met.** 4/4 sanity checks PASS, 7/7 proxy metrics MET. Full existing suite (5476 tests) shows zero regressions. The two deferred validations (D1 live-backend generation quality, D2 live human selection UX) remain PENDING by design — they require a live LLM backend / human-in-loop session and are out of scope for offline TDD evaluation; both have a safe fallback (degrade path to existing single-block generation) already built into the 104-02 implementation, so failure there is contained rather than silent.

**Recommendation:** PROCEED. No iteration needed on the offline-verifiable surface. DEFER-104-01/02 should be exercised at phase verification (throwaway `mktemp -d` sandbox, per repo gotcha) or the next milestone's manual QA pass, not blocking this phase's completion.

---

*Evaluation report by: Claude (grd-eval-reporter)*
*Report date: 2026-07-19*
