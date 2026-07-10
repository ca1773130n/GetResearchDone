# Advisory rubric-decomposed verifier for eval reports (DeepVerifier-style)

**Captured:** 2026-07-09
**Priority:** P2
**Source:** Competitive landscape 2026-07 (P7) — `.planning/research/competitive-landscape-2026-07.md`

## Problem

GRD's deterministic verdict is the control path (correctly — see landscape doc), but
the eval NARRATIVE (grd-research-evaluator, EVAL.md) is unstructured. DeepVerifier
(arXiv 2601.15808) shows rubric decomposition built from a failure taxonomy (5 major /
13 sub-categories) beats holistic LLM judging by 12-48% meta-eval F1 on GAIA, by
exploiting the asymmetry of verification (checking ≪ generating).

## Solution

Add an ADVISORY (non-control-path) rubric layer to the evaluator: decompose "is this
experiment result trustworthy" into small checkable sub-questions derived from GRD's
own observed failure classes (H2/H3/H4 + DEAD-ENDS categories): script actually
exercised the hypothesis? metric computed from real output (not hardcoded)? N
sufficient? baseline present? seed fixed? Each sub-check answers pass/fail/unknown with
evidence lines. The deterministic verdict remains the only gate; the rubric report
rides along in EVAL.md. Test-time verification feedback (verifier → agent iterative
loop, +8-11% on GAIA subsets) is a candidate follow-up for the LEARN stage.

## Files

- `agents/grd-research-evaluator.md` (rubric protocol), `lib/research/eval.ts`
- `tests/unit/research/eval.test.ts`
