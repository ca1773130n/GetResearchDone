---
phase: 105-ai-panel-fallback-hardening
verified: 2026-07-19T00:00:00Z
status: passed
score:
  level_1: 7/7 sanity checks passed
  level_2: 8/8 proxy metrics met
  level_3: 7/7 deferred items resolved (tracked in STATE.md)
re_verification:
  previous_status: none
  previous_score: n/a
  gaps_closed: []
  gaps_remaining: []
  regressions: []
gaps: []
deferred_validations: []
human_verification: []
---

# Phase 105: AI-Panel Fallback + Hardening Verification Report

**Phase Goal:** Autonomous runs get panel-answered checkpoints inline (no pause), and the full v0.5.0 milestone is verified end-to-end against its proof obligations — this phase doubles as the milestone's Integration Phase.
**Verified:** 2026-07-19
**Status:** passed
**Re-verification:** No — initial verification

## Verification Summary by Tier

### Level 1: Sanity Checks

| # | Check | Status | Evidence |
|---|-------|--------|----------|
| 1 | `answerViaDiscussion` exported from checkpoints.ts | PASS | `lib/research/checkpoints.ts:285` (`export function answerViaDiscussion(`), re-exported at `lib/research/checkpoints.ts:486` |
| 2 | Orchestrator wires panel fallback at emit sites, excludes loop backend | PASS | `lib/research/orchestrator.ts:520` (`/** The loop's own spawn backend — excluded from the AI panel so it never self-consults. */`), `lib/research/orchestrator.ts:544-547` (`if (cfg.fallback === 'panel') { const panelFn = opts.answerViaDiscussion \|\| answerViaDiscussion; answers = panelFn(cwd, ck, { loopBackend: deriveLoopBackend(config) }, opts.panelDeps);`) |
| 3 | Telemetry counters recorded | PASS | `lib/research/orchestrator.ts:549-550` (`'research.checkpoint_panel_answered_total' : 'research.checkpoint_panel_unavailable_total'`), `lib/research/checkpoints.ts:105` (`deps.incrementCounter('research.checkpoint_pauses_total');`) |
| 4 | Docs updated (CLAUDE.md, settings skill, tutorial) | PASS | `CLAUDE.md:112`, `docs/autoresearch-tutorial.md:343` (`### 3.6 Interactive steering (human-in-the-loop)`), `docs/autoresearch-tutorial.md:475`, `commands/settings.md:539` |
| 5 | Milestone verification suite exists | PASS | `tests/unit/research/milestone-verification.test.ts` present on disk |
| 6 | `npm run build:check` / lint clean | PASS | mechanical bundle + EVAL-RESULTS.md S1/S2: `tsc --noEmit` exit 0, `eslint bin/ lib/` exit 0 |
| 7 | jest.config.js coverage thresholds unchanged | PASS | EVAL-RESULTS.md S4: `git diff HEAD~10 -- jest.config.js` shows zero changes across all 105 commits |

**Level 1 Score:** 7/7 passed

### Level 2: Proxy Metrics

Command re-run this session: `TMPDIR=$(mktemp -d) npx jest tests/unit/research/checkpoints.test.ts tests/unit/research/orchestrator.test.ts tests/unit/research/milestone-verification.test.ts`
Output (verbatim): `Test Suites: 3 passed, 3 total` / `Tests:       149 passed, 149 total`

| # | Metric | Target | Achieved | Status |
|---|--------|--------|----------|--------|
| P1 | answerViaDiscussion core + participant exclusion | all cases pass | PASS | MET |
| P2 | matching order + rate-limit/empty guard | all cases pass | PASS | MET |
| P3 | panel-fallback inline resolution, no pause (4 emit sites) | all cases pass | PASS | MET |
| P4 | recommended-path byte-identical | 100% pass | PASS | MET |
| P5 | portfolio + telemetry counters | all cases pass | PASS | MET |
| P6 | R1 no unattended pause (5 sites) | all cases pass | PASS | MET |
| P7 | R3 back-compat + R4 debug-pin contract | all cases pass | PASS | MET |
| P8 | R5 no double-ask + coverage guard | all cases pass | PASS | MET |

**Level 2 Score:** 8/8 met target (149/149 test cases, re-confirmed this session)

### Level 3: Deferred Validations

| # | Validation | Status |
|---|-----------|--------|
| DEFER-105-01 | Live panel-backend answer quality | RESOLVED (folded into DEFER-101-02 Pass 3), per 105-04-VALIDATION.md |
| DEFER-101-02 | `fallback:'panel'` unattended answering | FULLY RESOLVED — literal `answeredBy:'panel'` observed via real opencode+codex panel |
| DEFER-101-03 | Full R1–R5 milestone suite (live confirmation) | RESOLVED offline by 105-03, cross-referenced in `.planning/STATE.md:186` |
| DEFER-102-01 | Live AskUserQuestion/SEED clarify UX | RESOLVED |
| DEFER-104-01 | Live N-candidate generation quality | RESOLVED |
| DEFER-104-02 | Live human candidate selection UX | RESOLVED |
| DEFER-105-02 | Sandbox isolation discipline | RESOLVED |

**Level 3:** 7/7 items reached explicit RESOLVED disposition (documented in `.planning/STATE.md:17` and `:186`); none re-deferred, none silently dropped.

## Goal Achievement

### Observable Truths

| # | Truth | Verification Level | Status | Evidence |
|---|-------|--------------------|--------|----------|
| 1 | `answerViaDiscussion` wraps `resolveElicitation`/`buildElicitationContext`, excludes loop's own spawn backend, one-shot, rate-limit guard, exact→prefix→recommended matching | Level 1 | PASS | `lib/research/checkpoints.ts:180` (`// ── answerViaDiscussion: degrade-safe AI-panel fallback (REQ-207) ────`), `lib/research/checkpoints.ts:285` |
| 2 | `fallback:"panel"` wired end-to-end incl. portfolio forced non-human mode, counters recorded | Level 1+2 | PASS | `lib/research/orchestrator.ts:517` (`return Boolean(cfg.enabled) && pointEnabled && iterGate && !attended && cfg.fallback === 'panel';`); proxy P5 149/149 |
| 3 | Docs updated: CLAUDE.md, `gd settings` skill, autoresearch tutorial interactive-steering section | Level 1 | PASS | `CLAUDE.md:112`, `commands/settings.md:539`, `docs/autoresearch-tutorial.md:343` |
| 4 | Milestone verification suite proves R1/R3/R4/R5 offline with injected checkpointHandler, no coverage threshold lowered | Level 1+2 | PASS | `tests/unit/research/milestone-verification.test.ts` (proxy P6-P8, 149/149 this session); jest.config.js diff clean (EVAL-RESULTS.md S4) |
| 5 | All milestone-wide deferred validations reach a final disposition | Level 3 | PASS | `.planning/STATE.md:17`, `.planning/STATE.md:186`; 105-EVAL-RESULTS.md Deferred Status table (7/7 RESOLVED) |

### Required Artifacts

| Artifact | Expected | Exists | Sanity | Wired |
|----------|----------|--------|--------|-------|
| `lib/research/checkpoints.ts` (answerViaDiscussion) | panel resolver | Yes | PASS | PASS (imported in orchestrator.ts:35) |
| `lib/research/orchestrator.ts` (panel wiring, emit sites) | 4 emit sites route to panel | Yes | PASS | PASS |
| `tests/unit/research/milestone-verification.test.ts` | R1/R3/R4/R5 suite | Yes | PASS | PASS (149/149 green, this session) |
| `.planning/milestones/v0.5.0/phases/105-ai-panel-fallback-hardening/105-04-VALIDATION.md` | live validation record | Yes | PASS | n/a |
| `.planning/milestones/v0.5.0/todos/discussion-hardening-followups.md` | tracked follow-up for `resolveElicitation`/codex-gemini gap (105-REVIEW.md warning) | Yes | PASS | n/a |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| orchestrator.ts | checkpoints.ts | import | WIRED | `lib/research/orchestrator.ts:35` (`resolveCheckpoint, answerViaDiscussion,`) |
| orchestrator.ts panel branch | telemetry counters | incrementCounter | WIRED | `lib/research/orchestrator.ts:549-550` |
| 105-04-VALIDATION.md | .planning/STATE.md deferred disposition | narrative cross-reference | WIRED | `.planning/STATE.md:17`, `:186` document the same 5 DEFER IDs as RESOLVED (mechanical `verify key-links` flagged this as a literal-string miss — see Anti-Patterns/Mechanical Check Note below; content match confirmed manually) |

**Mechanical check note:** `node bin/grd-tools.js verify mechanical 105-ai-panel-fallback-hardening` flagged 2 items on 105-04-PLAN.md: (a) key-link `105-04-VALIDATION.md → .planning/STATE.md deferred table` failed literal-string match, and (b) reference `$SANDBOX/.planning/research/threads/<id>/checkpoints.jsonl` reported missing. Both are false positives, not gaps: (a) STATE.md documents the same disposition narratively (`.planning/STATE.md:17`, `:186`) rather than as a literal markdown table, and (b) `$SANDBOX` is a template placeholder for a throwaway `mktemp -d` sandbox that 105-04 correctly deleted after use (confirmed clean via `git status --porcelain`, EVAL-RESULTS.md S5) — the path was never meant to persist in the repo.

## Experiment Verification

N/A — this is deterministic control-flow code (checkpoint routing), not an ML experiment. No paper-baseline comparison applies.

### Experiment Integrity

| Check | Status | Details |
|-------|--------|---------|
| No degenerate outputs | PASS | `answeredBy:'panel'` distinct from `answeredBy:'default'` in test assertions (checkpoints.test.ts, part of 149/149 pass) |
| Full-suite regression stable | PASS | EVAL-RESULTS.md: 160 suites, 5506/5509 tests passed (3 pre-existing skips), 0 failed |

## WebMCP Verification

WebMCP verification skipped — not applicable to this phase (backend/CLI research-loop code, no web app under test; no `webmcp_available` flag was supplied in the init context).

## Requirements Coverage

| Requirement | Status | Blocking Issue |
|-------------|--------|----------------|
| REQ-207 (answerViaDiscussion panel fallback) | PASS | - |
| REQ-208 (fallback:panel wiring + telemetry + docs) | PASS | - |
| REQ-209 (milestone verification suite, R1/R3/R4/R5) | PASS | - |

## Anti-Patterns Found

None found. Spot-checked `lib/research/checkpoints.ts` and `lib/research/orchestrator.ts` for TODO/FIXME/placeholder/empty-return patterns during this session's grep pass — no matches surfaced in the panel-fallback code paths.

## Human Verification Required

None outstanding — the phase's own `checkpoint:human-verify` gate (105-04 Task 2) was already exercised and approved during phase execution (105-04-VALIDATION.md, 105-04-SUMMARY.md), producing the Pass 3 literal `answeredBy:'panel'` observation.

## Gaps Summary

No gaps. All 7 Level 1 sanity checks pass, all 8 Level 2 proxy metrics meet target (149/149 tests, re-confirmed this session), and all 7 Level 3 deferred/carried-over items reached explicit RESOLVED disposition per `.planning/STATE.md`. The one 105-REVIEW.md WARNING (non-blocking hardening follow-up for `lib/discussion.ts` `resolveElicitation`/codex-gemini gap) has been tracked: `.planning/milestones/v0.5.0/todos/discussion-hardening-followups.md` exists on disk, closing the review's stated risk of the finding being lost.

## Reflection

This phase spans 4 plans, each with its own hypothesis/predicted_outcome. Summarizing the integration-level reflection (105-03, the Integration Phase's core deliverable) and 105-04 (the live-validation closer):

| Field | Value |
|-------|-------|
| hypothesis | 105-03: "The full v0.5.0 checkpoint milestone satisfies its four proof obligations (R1 no unattended pause, R3 pre-0.5.0 back-compat, R4 DESIGN answers survive debug pinning, R5 no double-asking on re-plan/resume) and this can be proven offline with an injected checkpointHandler, without lowering any per-file jest coverage threshold." |
| predicted_outcome | 105-03: "tests/unit/research/milestone-verification.test.ts is green: enumerated unattended call sites (bench/portfolio/harness/autopilot/cli-kb) all resolve resolveInteractive → active:false (no pause); a pre-0.5.0 thread.json fixture resumes bit-identically; a DESIGN-answer-then-debug-replan run keeps the user contract pinned; a resume after answering never re-emits the same question; git diff shows no reduced thresholds in jest.config.js." |
| actual_outcome | `tests/unit/research/milestone-verification.test.ts` passed 149/149 (combined with checkpoints/orchestrator suites) both at landing (105-03) and re-confirmed independently this session; `git diff HEAD~10 -- jest.config.js` shows zero threshold changes (EVAL-RESULTS.md S4). |
| verdict | confirmed |
| evidence | Command output this session: `Test Suites: 3 passed, 3 total` / `Tests: 149 passed, 149 total`; `lib/research/checkpoints.ts:285`; `lib/research/orchestrator.ts:517`; 105-EVAL-RESULTS.md S4 (`git diff HEAD~10 -- jest.config.js` shows zero changes). |

---

_Verified: 2026-07-19_
_Verifier: Claude (grd-verifier)_
_Verification levels applied: Level 1 (sanity), Level 2 (proxy), Level 3 (deferred, all resolved — Integration Phase)_
