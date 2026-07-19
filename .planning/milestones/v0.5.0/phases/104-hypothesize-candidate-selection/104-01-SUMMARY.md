---
phase: 104-hypothesize-candidate-selection
plan: 01
subsystem: research/hypothesize
tags: [hypothesize, multi-candidate, prompt, parser, REQ-205]
requires: []
provides:
  - "lib/research/agent-io.ts:parseHypothesesOutput"
  - "lib/research/_prompts.ts:buildHypothesesPrompt"
affects:
  - "104-02 (orchestrator wiring + selection checkpoint consumes both symbols)"
tech-stack:
  added: []
  patterns:
    - "degrade-safe parser (never null/throws, empty array on junk) — mirrors parseClarifyOutput"
    - "inline-duplicated grounding preamble for the N>1 prompt path"
key-files:
  created: []
  modified:
    - lib/research/agent-io.ts
    - lib/research/_prompts.ts
    - tests/unit/research/agent-io.test.ts
    - tests/unit/research/prompts.test.ts
decisions:
  - "parseHypothesesOutput cap default = 5 (config clamp max); n>0 guard falls back to 5 for 0/negative/omitted"
  - "buildHypothesesPrompt inline-duplicates the buildHypothesizePrompt preamble rather than extracting a shared helper — keeps the untouched single-block path byte-identical with zero shared-code risk"
  - "Single-block buildHypothesizePrompt / parseHypothesisOutput left byte-identical; both pinned by PIN tests"
metrics:
  duration_min: 8
  completed: 2026-07-19
  tasks: 2
  files: 4
---

# Phase 104 Plan 01: HYPOTHESIZE Candidate Selection (prompt+parser layer) Summary

Multi-candidate `__HYPOTHESES__` prompt + ranked/capped degrade-safe parser added as the N>1 input layer for REQ-205, with the existing single-block `__HYPOTHESIS__` prompt and parser left byte-identical (the N=1/disabled path).

## What Was Built

- **`parseHypothesesOutput(stdout, n?)`** (lib/research/agent-io.ts) — parses a `__HYPOTHESES__` JSON block (`{candidates:[{statement,rationale,predictedOutcome}]}`) via the existing brace-balanced `extractTaggedJson`. Keeps emit (rank) order, drops statement-less entries, defaults `rationale`/`predictedOutcome` to `''`, caps to `n` (default 5). Returns `{candidates: []}` on any junk — never null, never throws.
- **`buildHypothesesPrompt(thread, priorHyps, priorVerdict, priorTakeaways, pack, pivot, n)`** (lib/research/_prompts.ts) — reuses the grounding preamble (research question, GROUND-first KG instruction, DEAD-ENDS read, optional pack, prior hypotheses, takeaways, revise/pivot lines) and emits one final `__HYPOTHESES__` block requesting up to N ranked best-first candidates.
- Mirror tests: 7 new `parseHypothesesOutput` cases (+ a `parseHypothesisOutput` PIN) and 3 new `buildHypothesesPrompt` cases (+ a `buildHypothesizePrompt` PIN).

## Deviations from Plan

None - plan executed exactly as written.

## Experiment Results

### Parameters

| Parameter | Value |
|-----------|-------|
| parser cap default (n omitted) | 5 |
| n clamp guard | n>0 else 5 |
| preamble reuse strategy | inline-duplicate |

### Results

| Metric | Baseline | Target | Achieved | Status |
|--------|----------|--------|----------|--------|
| agent-io.test.ts | 12 tests | new cases pass, pin green | 27 pass | PASS |
| prompts.test.ts | 5 tests | new cases pass, pin green | 8 pass | PASS |
| tsc --noEmit | 0 errors | 0 errors | 0 errors | PASS |
| eslint | clean | clean | clean | PASS |
| single-block byte-identical | pinned | unchanged | PIN tests green | PASS |

### Analysis

The N>1 layer is additive and isolated: `extractTaggedJson` is reused (zero new extraction logic), and the single-block path is pinned byte-identical by dedicated PIN tests in both suites. The degrade contract (empty array on junk) lets 104-02 safely fall back to the single-block cold path when a backend fails to emit `__HYPOTHESES__`.

### Artifacts

- Commits: f3ba547 (parser), 43b0ba1 (prompt)

## Self-Check: PASSED

- lib/research/agent-io.ts — FOUND (parseHypothesesOutput exported)
- lib/research/_prompts.ts — FOUND (buildHypothesesPrompt exported)
- Commit f3ba547 — FOUND
- Commit 43b0ba1 — FOUND
