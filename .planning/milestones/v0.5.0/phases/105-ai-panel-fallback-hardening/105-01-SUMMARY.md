---
phase: 105-ai-panel-fallback-hardening
plan: 01
subsystem: research/checkpoints
tags: [checkpoints, ai-panel, fallback, interactive-steering, REQ-207]
requires:
  - lib/discussion.ts:resolveElicitation
  - lib/scheduler.ts:ADAPTERS.claude.detectFromStdout
provides:
  - lib/research/checkpoints.ts:answerViaDiscussion
affects:
  - 105-02 (orchestrator wiring of the panel fallback)
tech-stack:
  added: []
  patterns:
    - "DI seams mirror spawn/runner injection (default = require(...), tests inject stubs — never spawn)"
    - "Degrade-safe: every failure path resolves to recommended defaults (answeredBy:'default')"
key-files:
  created: []
  modified:
    - lib/research/checkpoints.ts
    - tests/unit/research/checkpoints.test.ts
decisions:
  - "answerViaDiscussion is pure/standalone (no orchestrator import) — wiring deferred to 105-02"
  - "Panel resolver seam accepts string OR {text,discussionFile} so production default (string) omits discussionFile while tests can inject a file path — discussion.ts left unchanged"
  - "Rate-limit guard runs detectFromStdout over synthesis text; empty synthesis is the primary unavailability signal (resolveElicitation returns '' on spawn failure)"
metrics:
  duration_minutes: 18
  tasks: 2
  files: 2
  completed: 2026-07-19
---

# Phase 105 Plan 01: answerViaDiscussion Panel Fallback Summary

`answerViaDiscussion` — the pure, degrade-safe resolver that answers a `Checkpoint` via the
AI panel instead of pausing for a human — lands in `lib/research/checkpoints.ts` with 12
offline deterministic tests, `answeredBy:'panel'` on a matched panel decision and
`answeredBy:'default'` on every degenerate path.

## What was built

- `answerViaDiscussion(cwd, ck, cfg, deps?)` returns exactly one `CheckpointAnswer` per
  question, NEVER throws, NEVER pauses (REQ-207, SC1).
- Option matching order per question: **exact** (case-insensitive trim) → **prefix** (either
  direction) → **recommended default**. A match sets `answeredBy:'panel'`; an unmatched panel
  answer falls back to `answeredBy:'default'` (never masquerades as a real panel decision).
- **Rate-limit guard:** injected `detectFromStdout` (default = scheduler `ADAPTERS.claude`)
  flags `rateLimited || unhealthy` → the panelist is treated as UNAVAILABLE and the checkpoint
  resolves to recommended defaults. A rate-limited/logged-out panelist is never read as an answer.
- **Empty-synthesis guard:** `resolveElicitation` returning `''` (spawn failure / all panelists
  unavailable) resolves ALL questions to recommended defaults.
- Loop spawn backend (`cfg.loopBackend`) is filtered out of the panel participant roster (no
  self-consultation).
- `ck.discussionFile` is recorded when the resolver exposes one AND a real panel answer was
  produced.
- DI seams: `deps.resolveElicitation` (default `require('../discussion').resolveElicitation`) and
  `deps.detectFromStdout` — tests inject stubs and never spawn. `lib/discussion.ts` unchanged.

## Deviations from Plan

None — plan executed as written. Tasks 1 and 2 operate on the same new export and cohesive test
block, so they were committed as a single atomic `feat` commit rather than two.

## Experiment Results

### Parameters

| Parameter | Value |
|-----------|-------|
| matching order | exact → prefix → recommended-default |
| default participants | claude, codex, gemini, opencode (minus loopBackend) |
| default synthesizer | claude |
| unavailability signals | empty synthesis, detectFromStdout.rateLimited, .unhealthy |

### Results

| Metric | Baseline | Target | Achieved | Status |
|--------|----------|--------|----------|--------|
| checkpoints.test.ts pass | green (P101/104) | 100% new-test pass | 44/44 pass (12 new) | PASS |
| checkpoints.ts branch coverage | ≥80 threshold | threshold held | 84.81% | PASS |
| checkpoints.ts lines / functions | ≥90 / 100 | held | 98.07% / 100% | PASS |
| new jest threshold reductions | 0 | 0 | 0 | PASS |
| tsc --noEmit | pass | pass | pass | PASS |
| eslint (changed files) | clean | clean | clean | PASS |

### Analysis

The panel fallback reuses the existing `resolveElicitation` sync-spawn primitive (returns `''`
on failure) and the scheduler's `detectFromStdout` rate-limit detector, so it inherits their
degrade-safety without duplicating spawn logic. The audit trail (checkpoints.jsonl) is identical
whether human, panel, or default answered — the GENOME "no LLM-judged scoring on the core
execution path" heuristic is not violated (the panel answers a human-steering question, not the
deterministic metric/comparator/target verdict). Live panel spawn quality is deferred to the
105-04 sandbox exercise.

## Self-Check: PASSED

- FOUND: lib/research/checkpoints.ts (answerViaDiscussion exported)
- FOUND: tests/unit/research/checkpoints.test.ts (answerViaDiscussion, 12 cases)
- FOUND commit: 93ac74b
- Coverage threshold for lib/research/checkpoints.ts held (branches 84.81 ≥ 80)
