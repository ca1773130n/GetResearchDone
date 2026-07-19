---
phase: 105-ai-panel-fallback-hardening
plan: 02
subsystem: research/orchestrator
tags: [checkpoints, ai-panel, fallback, interactive-steering, telemetry, portfolio, REQ-208]
requires:
  - lib/research/checkpoints.ts:answerViaDiscussion
  - lib/research/checkpoints.ts:resolveCheckpoint
  - lib/research/checkpoints.ts:resolveInteractive
  - lib/metrics.ts:incrementCounter
provides:
  - lib/research/orchestrator.ts:resolveCheckpointInline
  - lib/research/orchestrator.ts:engagedPanel
  - "ResearchOptions.answerViaDiscussion / panelDeps / concurrency DI seams"
  - "research.checkpoint_panel_answered_total / research.checkpoint_panel_unavailable_total counters"
affects:
  - 105-03 (milestone verification suite)
  - 105-04 (live panel sandbox exercise)
tech-stack:
  added: []
  patterns:
    - "Panel fallback re-enters the loop via `continue` with an injected resolved checkpoint, reusing the EXISTING top-of-loop consume machinery — zero duplication of answer-application logic"
    - "engagedPanel predicate separates 'point wants a checkpoint' from 'attended vs unattended', so panel fires exactly when the run is unattended AND fallback:'panel'"
    - "DI seams (answerViaDiscussion/panelDeps) mirror spawn/runner injection — tests never spawn a real panel"
key-files:
  created: []
  modified:
    - lib/research/orchestrator.ts
    - lib/research/portfolio.ts
    - tests/unit/research/orchestrator.test.ts
    - CLAUDE.md
    - commands/settings.md
    - docs/autoresearch-tutorial.md
decisions:
  - "The 4 panel emit sites resolve inline then `continue` with `resumed = resolveCheckpointInline(...)`; the loop-top consume (seed fold / hypothesize reconstruct / design approve-revise-abort / decide continue-stop-pivot-adjust) applies the answer via the SAME code path a human resume uses — no site-specific application logic duplicated"
  - "engagedPanel(cfg, attended, pointEnabled, iterGate) = cfg.enabled && pointEnabled && iterGate && !attended && fallback==='panel' — when interactive is disabled or fallback is 'recommended', panel is false and the autonomous path stays byte-identical"
  - "resumedCheckpoint param copied to a mutable `let resumed` so the panel path can inject a resolved checkpoint each iteration; consumeAnswered's WeakSet keeps it one-shot"
  - "Portfolio threads concurrency into ResearchOptions so resolveInteractive is forced inactive for concurrency>1 (R1: a concurrent thread never pauses) while still routing through the panel when fallback:'panel'"
  - "Counters recorded via the module-level incrementCounter (in-memory Map, asserted with getCounters/resetCounters in tests): panel_answered when any answeredBy:'panel', else panel_unavailable"
metrics:
  duration_minutes: 55
  tasks: 3
  files: 6
  completed: 2026-07-19
---

# Phase 105 Plan 02: Panel Fallback Orchestrator Wiring Summary

`fallback:"panel"` is now wired end-to-end: an unattended research run routes each of the four
in-loop steering checkpoints (SEED / HYPOTHESIZE / DESIGN / DECIDE) through
`answerViaDiscussion` and resolves them **inline — never pausing** — while `fallback:"recommended"`
stays byte-identical to the pre-105 autonomous loop. Portfolio concurrency is threaded so parallel
threads are non-human by construction, panel outcomes are counted, and the whole surface is
documented (REQ-208).

## What was built

- **`resolveCheckpointInline(cwd, thread, ck, cfg, opts, config)`** — the shared unattended
  resolver. On `fallback:'panel'` it calls `answerViaDiscussion` (loopBackend excluded), records a
  telemetry counter, then `resolveCheckpoint`s (appends `checkpoints.jsonl`, clears
  `pendingCheckpoint`, saves) — **without** setting `status:'paused'`. Returns the resolved
  checkpoint.
- **Re-entrant application via `continue`.** Each of the 4 emit sites, on the unattended panel
  branch, sets `resumed = resolveCheckpointInline(...)` and `continue`s. The loop's existing
  top-of-loop consume machinery (`consumeAnswered` → seed fold / hypothesize reconstruct / design
  approve·revise·abort / decide continue·stop·pivot·adjust) applies the answer exactly as a human
  resume does. No answer-application logic is duplicated. `resumedCheckpoint` is copied to a mutable
  `let resumed` so each iteration can inject a fresh resolved checkpoint; the `consumeAnswered`
  WeakSet keeps it one-shot.
- **`engagedPanel` predicate** on all four `resolve*Posture` functions, returning a new `panel`
  flag alongside `active`. Panel fires iff the point is enabled, its iteration gate passes, the run
  is unattended (`resolveInteractive` inactive), AND `fallback==='panel'`.
- **Portfolio non-human routing (R1).** `runPortfolio` threads `concurrency` into each thread's
  `ResearchOptions`; the posture functions pass it to `resolveInteractive`, so a concurrent
  portfolio thread (`concurrency>1`) is forced inactive — it never pauses for a human — yet still
  routes through the panel when `fallback:'panel'`.
- **Telemetry.** `research.checkpoint_panel_answered_total` (a real panel decision, any
  `answeredBy:'panel'`) and `research.checkpoint_panel_unavailable_total` (empty/rate-limited panel
  → recommended default). The human-pause counter `research.checkpoint_pauses_total` is untouched on
  the panel path.
- **DI seams** on `ResearchOptions`: `answerViaDiscussion`, `panelDeps`, `concurrency`.
- **Docs:** CLAUDE.md config-key list, `gd settings` skill configurable surface, and a new
  autoresearch-tutorial "§3.6 Interactive steering" section (the 4 points, resume-with-answers, and
  the degrade-safe panel fallback) + a config-reference row.

## Deviations from Plan

**None material — plan executed as written**, with one architectural refinement that *reduced*
scope rather than expanding it:

**1. [Rule 1-adjacent — simplification] Panel application reuses the resume consume path instead of
new inline logic.**
- **Found during:** Task 1.
- **Detail:** The plan suggested applying the panel answers inline at each site. Instead each panel
  site injects the resolved checkpoint into a mutable `resumed` and `continue`s, so the identical
  top-of-loop consume logic a human resume uses applies the answer. This eliminates ~80 lines of
  duplicated, error-prone application logic (finalize-on-stop, revise-round-capping,
  zero-pollution candidate reconstruction) and guarantees panel/human/recommended resolution are
  bit-for-bit consistent.
- **Files:** lib/research/orchestrator.ts. **Commit:** 0304ab6.

## Experiment Results

### Parameters

| Parameter | Value |
|-----------|-------|
| unattended trigger | `autonomous_mode` \| autopilot \| `--no-gates` \| portfolio `concurrency>1` |
| panel-engage predicate | `cfg.enabled && pointEnabled && iterGate && !attended && fallback==='panel'` |
| loopBackend source | `config.backend ?? superpowers.default_backend` (excluded from panel roster) |
| panel counters | `research.checkpoint_panel_answered_total`, `research.checkpoint_panel_unavailable_total` |
| answer-application | re-entrant `continue` → existing top-of-loop consume machinery |

### Results

| Metric | Baseline | Target | Achieved | Status |
|--------|----------|--------|----------|--------|
| orchestrator.test.ts panel-fallback pass | P101–104 green | new tests 100% | 10/10 new pass | PASS |
| no-pause on fallback:'panel' (4 points) | n/a | status never 'paused' | seed/hyp/design/decide all inline | PASS |
| byte-identical recommended path | pre-105 autonomous | answerViaDiscussion NOT called, no checkpoints.jsonl | verified | PASS |
| telemetry counters | n/a | answered/unavailable recorded | both asserted via getCounters | PASS |
| portfolio concurrency R1 (never pauses) | n/a | concurrency>1 non-human | verified (solo pauses, concurrent does not) | PASS |
| full research suite | 644 green | green | 644/644 pass | PASS |
| tsc --noEmit / eslint (changed lib) | clean | clean | clean | PASS |

### Analysis

The re-entrant `continue` design is the key insight: because a human resume already funnels every
checkpoint answer through a single top-of-loop consume stage, the unattended panel path only needs
to *produce* the resolved checkpoint and hand it to that same stage. This makes the panel, human,
and recommended-default resolutions share one application path — the strongest possible guarantee
that "panel answered" and "human answered" mutate the ledger/thread identically, and that
`fallback:'recommended'` remains byte-identical to the pre-steering loop (the panel branch is simply
never entered). Live panel answer quality against real backends is deferred to the 105-04 sandbox.

### Artifacts

- Tests: `tests/unit/research/orchestrator.test.ts` — `describe('AI-panel fallback ... REQ-208')` (10 cases)
- Counters: `research.checkpoint_panel_answered_total`, `research.checkpoint_panel_unavailable_total`

## Self-Check: PASSED

- FOUND: lib/research/orchestrator.ts (resolveCheckpointInline, engagedPanel, answerViaDiscussion link, panel counters)
- FOUND: lib/research/portfolio.ts (concurrency threaded into deps)
- FOUND: tests/unit/research/orchestrator.test.ts (10 panel-fallback tests, all green)
- FOUND: CLAUDE.md, commands/settings.md, docs/autoresearch-tutorial.md (interactive.fallback documented; "Interactive steering" section present)
- FOUND commits: 0304ab6 (panel wiring + tests), bb976ce (portfolio concurrency), 8634199 (docs)
- Full research suite 644/644 green; tsc + eslint clean
