---
phase: 104-hypothesize-candidate-selection
verified: 2026-07-19T08:15:00Z
status: passed
score:
  level_1: 9/9 sanity checks passed
  level_2: 7/7 proxy metrics met
  level_3: 2/2 deferred (tracked in 104-EVAL-RESULTS.md, by design)
deferred_validations:
  - description: "Live N-candidate generation quality (DEFER-104-01)"
    metric: "qualitative candidate quality"
    target: "n/a (manual/sandbox judgment)"
    depends_on: "live LLM backend spawn"
    tracked_in: "104-EVAL-RESULTS.md, STATE.md"
  - description: "Live human candidate selection UX (DEFER-104-02)"
    metric: "qualitative UX"
    target: "n/a (manual/human-in-loop judgment)"
    depends_on: "manual review / next milestone QA"
    tracked_in: "104-EVAL-RESULTS.md, STATE.md"
human_verification:
  - test: "Run a live `gd research` session with `interactive.hypothesize: true` and `hypothesis_candidates >= 2` in a throwaway sandbox, inspect the generated candidates and the selection checkpoint prompt UX"
    expected: "N distinct, plausible candidates are generated and rendered as selectable options; freeform 'Other' works; only the chosen one lands in the ledger"
    why_human: "Requires a live LLM backend spawn and subjective quality/UX judgment (DEFER-104-01/02), out of scope for offline TDD"
---

# Phase 104: HYPOTHESIZE Candidate Selection Verification Report

**Phase Goal:** Users can choose among multiple generated hypothesis candidates before any ledger commitment, with zero ledger pollution from unchosen candidates.
**Verified:** 2026-07-19T08:15:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Verification Summary by Tier

### Level 1: Sanity Checks

| # | Check | Status | Evidence |
|---|-------|--------|----------|
| 1 | `parseHypothesesOutput` exists and exported | PASS | lib/research/agent-io.ts:51,149 |
| 2 | `buildHypothesesPrompt` exists and exported | PASS | lib/research/_prompts.ts:49,164 |
| 3 | `resolveSelectPosture` exists | PASS | lib/research/orchestrator.ts:664 |
| 4 | `buildSelectCheckpoint` exists | PASS | lib/research/orchestrator.ts:689 |
| 5 | Selection emit wired strictly before `appendHypothesis` | PASS | lib/research/orchestrator.ts:996-1014 (buildSelectCheckpoint at 996, appendHypothesis for chosen candidate at 1014, no earlier append in that branch) |
| 6 | `npm run build:check` | PASS | 104-EVAL-RESULTS.md:13 — `tsc --noEmit` exit 0, zero errors |
| 7 | `npm run lint` | PASS | 104-EVAL-RESULTS.md:14 — eslint exit 0, zero errors/warnings |
| 8 | Full suite regression | PASS | 104-EVAL-RESULTS.md:16 — 159/159 suites, 5476 passed / 3 skipped / 0 failed |
| 9 | Code-review WARNING #1 (unpersisted round counter) fixed | PASS | commit f6bf41a — `git show f6bf41a -- lib/research/orchestrator.ts` adds `thread.checkpointRounds = { ...thread.checkpointRounds, hypothesize: round }; saveThread(cwd, thread);` at orchestrator.ts:992-995 |

**Level 1 Score:** 9/9 passed

### Level 2: Proxy Metrics

| # | Metric | Target | Achieved | Status |
|---|--------|--------|----------|--------|
| 1 | `parseHypothesesOutput` table-driven cases | all pass | all pass | PASS — command output: `PASS tests/unit/research/agent-io.test.ts` |
| 2 | Byte-identical default pin (single-block N=1/disabled) | 100% pass, no diff | pass, no diff | PASS — 104-EVAL-RESULTS.md:25 |
| 3 | `buildHypothesesPrompt` contract (keys/N/`__HYPOTHESES__` block) | all pass | all pass | PASS — command output: `PASS tests/unit/research/prompts.test.ts` |
| 4 | Pre-ledger pause / zero pollution (>=2 candidates -> empty ledger at pause) | pass | pass | PASS — 104-EVAL-RESULTS.md:27 |
| 5 | Matched/freeform resume | pass | pass | PASS — 104-EVAL-RESULTS.md:28 |
| 6 | Byte-identical default/degrade (gate-off -> no selection checkpoint) | pass | pass | PASS — 104-EVAL-RESULTS.md:29 |
| 7 | Skip paths (seeded/execute-resume/crash-recovery) + no-double-ask | pass | pass | PASS — 104-EVAL-RESULTS.md:30 |

**Level 2 Score:** 7/7 met target

Independently re-run in this verification session:
```
TMPDIR=$(mktemp -d) npx jest tests/unit/research/agent-io.test.ts tests/unit/research/prompts.test.ts tests/unit/research/orchestrator.test.ts
Test Suites: 3 passed, 3 total
Tests:       122 passed, 122 total
```

### Level 3: Deferred Validations

| # | Validation | Metric | Target | Depends On | Status |
|---|-----------|--------|--------|------------|--------|
| 1 | Live N-candidate generation quality (DEFER-104-01) | qualitative | n/a | live LLM backend spawn | DEFERRED — tracked in 104-EVAL-RESULTS.md:44 |
| 2 | Live human candidate selection UX (DEFER-104-02) | qualitative | n/a | manual/human review | DEFERRED — tracked in 104-EVAL-RESULTS.md:45 |

**Level 3:** 2 items tracked, by design (both have a safe degrade fallback to the existing single-block path already built in, per 104-EVAL-RESULTS.md:49)

## Goal Achievement

### Observable Truths

| # | Truth (from ROADMAP Success Criteria) | Verification Level | Status | Evidence |
|---|-------|--------------------|--------|----------|
| 1 | `__HYPOTHESES__` prompt generates N candidates (clamped [1,5]), `parseHypothesesOutput` parses them; single-block parser untouched for N=1/disabled | Level 1+2 | PASS | lib/research/_prompts.ts:49-84, lib/research/agent-io.ts:51-73; byte-identical pin — 104-EVAL-RESULTS.md:25 |
| 2 | Selection checkpoint pauses strictly BEFORE any ledger append; only chosen candidate ever appended (zero pollution) | Level 1+2 | PASS | lib/research/orchestrator.ts:996 (checkpoint emit) precedes :1014 (appendHypothesis, single call); proxy P4 — 104-EVAL-RESULTS.md:27 |
| 3 | Freeform answer produces user-authored hypothesis statement flowing into ledger identically to a selected candidate | Level 2 | PASS | 104-EVAL-RESULTS.md:28 — `FREEFORM RESUME` case PASS |
| 4 | Checkpoint auto-skipped for seeded, resume, crash-recovery paths | Level 2 | PASS | 104-EVAL-RESULTS.md:30 — `SKIP PATH (SC4a/b/c)` all PASS |

### Required Artifacts

| Artifact | Expected | Exists | Sanity | Wired |
|----------|----------|--------|--------|-------|
| `lib/research/_prompts.ts` | `buildHypothesesPrompt` added, `buildHypothesizePrompt` untouched | Yes | PASS | PASS (module.exports:164) |
| `lib/research/agent-io.ts` | `parseHypothesesOutput` added, `parseHypothesisOutput` untouched | Yes | PASS | PASS (module.exports:149) |
| `lib/research/orchestrator.ts` | `resolveSelectPosture`/`buildSelectCheckpoint` + pre-ledger wiring | Yes | PASS | PASS (orchestrator.ts:664,689,972-1014) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| orchestrator.ts cold-HYPOTHESIZE branch | `parseHypothesesOutput` | `mRes.value?.candidates` | WIRED | orchestrator.ts:989 |
| orchestrator.ts selection emit | `buildSelectCheckpoint` | direct call | WIRED | orchestrator.ts:996 |
| orchestrator.ts selection resume | `appendHypothesis` (chosen only) | direct call | WIRED | orchestrator.ts:1014 |

Note: `verify key-links`/`verify references` (mechanical tool) reported false-negative
failures for 104-01/104-02 because plan prose uses approximate line ranges (e.g.
"~L848-884") and command substrings that don't exact-match current line numbers/exact
command text after the f6bf41a fix commit shifted lines. Manual grep/read confirms every
claimed symbol, export, and wiring point exists exactly as specified (see Artifacts and
Goal Achievement tables above, all citing current file:line). This is a plan-text/tool
brittleness issue, not a code gap — no gap recorded.

## Experiment Verification

N/A — this is an implementation phase (engineering harness feature), not a research
experiment with paper-baseline comparison. `104-EVAL-RESULTS.md` Ablation Results: N/A
(single cohesive capability, no sub-components to isolate).

## Requirements Coverage

| Requirement | Status | Blocking Issue |
|-------------|--------|-----------------|
| REQ-205 (multi-candidate prompt/parser) | PASS | - |
| REQ-206 (pre-ledger selection checkpoint) | PASS | - |

Note: `.planning/REQUIREMENTS.md` tracking table still shows PENDING for REQ-205/206 as
of this verification — per 104-REVIEW.md INFO item, that table is updated by a later
phase-completion step, not by code review or this verification.

## Anti-Patterns Found

None. `104-REVIEW.md` found zero blockers; its single WARNING (unpersisted
`checkpointRounds.hypothesize` counter, orchestrator.ts:991 at review time) has been
fixed in commit f6bf41a (verified above, Level 1 check #9) and the fix is covered by a
new assertion in `tests/unit/research/orchestrator.test.ts` per the commit message.

## Human Verification Required

1. **Live sandbox run with `hypothesis_candidates >= 2`** — inspect actual generated
   candidate quality and the selection-checkpoint UX end-to-end with a real LLM backend.
   Expected: N distinct plausible candidates rendered as selectable options, freeform
   'Other' works, only the chosen candidate lands in the ledger. Why human: requires a
   live LLM spawn and subjective quality/UX judgment (DEFER-104-01/02); both have a
   built-in safe degrade fallback to the existing single-block path, so this is
   non-blocking for phase completion, per 104-EVAL-RESULTS.md's explicit recommendation
   to exercise it at phase verification or next milestone QA (not required to block here
   since the fallback path is itself the byte-identical-pinned, currently-shipping
   behavior).

## Gaps Summary

No gaps found. All 4 ROADMAP success criteria are verified at Level 1 (sanity) and
Level 2 (proxy, offline deterministic TDD per this phase's `verification_level: proxy`).
The single code-review WARNING has been fixed and re-verified. The two Level-3 items
(DEFER-104-01/02) are qualitative, live-backend/human-in-loop validations that are
explicitly out of scope for this phase's offline-TDD verification level and are tracked
for exercise at Phase 105 (the milestone's designated Integration Phase, which "collects
deferred/end-to-end verification from Phases 101-104" per ROADMAP.md:621) or subsequent
manual QA.

## Reflection

### Plan 104-01

| Field | Value |
|-------|-------|
| hypothesis | "Adding a parallel `__HYPOTHESES__` multi-candidate prompt (`buildHypothesesPrompt`) and parser (`parseHypothesesOutput`) that returns a ranked, capped array — while leaving `buildHypothesizePrompt` and `parseHypothesisOutput` completely untouched — gives the N>1 selection path its inputs with zero behavior change on the N=1/disabled single-block path." |
| predicted_outcome | "parseHypothesesOutput parses a `__HYPOTHESES__` block into a ranked candidates array (capped to N, statement-less entries dropped, malformed => empty array, never throws); buildHypothesesPrompt emits the `__HYPOTHESES__` contract requesting N ranked candidates; parseHypothesisOutput and buildHypothesizePrompt produce byte-identical output to today; tsc + eslint clean." |
| actual_outcome | Both new symbols implemented exactly as predicted; byte-identical pin tests for the old single-block path pass; tsc/eslint clean; all table-driven parser cases pass. |
| verdict | confirmed |
| evidence | lib/research/agent-io.ts:51-73; lib/research/_prompts.ts:49-84; 104-EVAL-RESULTS.md:25 (byte-identical pin PASS); 104-EVAL-RESULTS.md:13-14 (tsc/eslint clean) |

### Plan 104-02

| Field | Value |
|-------|-------|
| hypothesis | "A selection checkpoint emitted inside the cold-HYPOTHESIZE branch — strictly BEFORE appendHypothesis — that persists all candidates in the checkpoint record (never the ledger) and appends only the chosen one on resume, gives human candidate selection with zero ledger pollution while the default (gate-off) single-block path stays byte-identical and the seeded/resume/crash-recovery paths ... never reach it." |
| predicted_outcome | "With interactive.hypothesize active and >=2 parsed candidates, runLoop pauses with pendingCheckpoint.point='hypothesize' type='selection' and the ledger for this iteration is empty at the pause; resume appends ONLY the chosen candidate ...; gate-off runs emit no selection checkpoint ...; seeded/execute-resume/crash-recovery paths never emit a selection checkpoint; consumeAnswered is one-shot (no double-ask); tsc + eslint clean." |
| actual_outcome | All predicted behaviors confirmed by proxy tests P4-P7 (pre-ledger pause/zero pollution, matched/freeform resume, byte-identical degrade, skip paths + no-double-ask); one architectural gap (unpersisted round counter) found by code review and fixed same-day in f6bf41a. |
| verdict | confirmed |
| evidence | 104-EVAL-RESULTS.md:27-30 (P4-P7 all MET); orchestrator.ts:989-1014 (emit-before-append wiring); commit f6bf41a (round-persistence fix, WARNING #1 closed) |

---

_Verified: 2026-07-19T08:15:00Z_
_Verifier: Claude (grd-verifier)_
_Verification levels applied: Level 1 (sanity), Level 2 (proxy), Level 3 (deferred, tracked)_
