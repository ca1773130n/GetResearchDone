---
phase: 103-seed-interview-decide-branch
wave: all
plans_reviewed: [103-01, 103-02, 103-03]
timestamp: 2026-07-19T00:00:00Z
blockers: 0
warnings: 0
info: 3
verdict: pass
---

# Code Review: Phase 103 (SEED interview + DECIDE branch) — all plans

## Verdict: PASS

All three plans (103-01 skill markdown, 103-02 SEED clarification station, 103-03 DECIDE
branch checkpoint) are executed exactly as planned, verified against the phase's locked
decisions, REQ-202/203/204, and the code. `tsc --noEmit`, `eslint`, and the full
orchestrator+agent-io suite (96 tests) all pass; the `orchestrator.ts` diff vs `main` is
100% additive (zero deletions), which structurally proves the byte-identical-default and
verdict-untouched claims rather than merely asserting them.

## Stage 1: Spec Compliance

### Plan Alignment
No issues found. Every task in all three plans maps 1:1 to a commit:
- 103-01: Task 1 -> 086cba4, Task 2 -> 7c07756 (docs commit 5aff4d8 completes the plan).
- 103-02: Task 1 -> fa17105, Task 2 -> b42066c, Task 3 -> b4a675d (docs commit 6787f30).
- 103-03: Task 1+2 -> ebbe5e2, Task 3 -> 7c264bf (docs commit 2a8ae7c).
SUMMARY.md claims were cross-checked directly against `git show` diffs for all five feat/test
commits; no discrepancies. The one documented deviation (103-03: adding `decide: false` to two
Phase-102 DESIGN tests in `writeInteractiveConfig` so they aren't spuriously paused by the new
DECIDE checkpoint) is a legitimate test-isolation fix, correctly classified as an "auto-fixed
issue" rather than a silent change, and does not touch production code.

### Research Methodology
N/A — no external paper referenced for this phase (correctly noted in 103-EVAL.md as a
feature phase evaluated against REQ-202/203/204 rather than a paper). The pattern to copy
(Phase 102 DESIGN emit/consume) was copied faithfully: `resolveSeedPosture`/`resolveDecidePosture`
mirror `resolveDesignPosture`'s structure (base config read, one-shot `opts.interactive.enabled`
override, `resolveInteractive` posture call), and the loop-top consume/emit shape matches the
DESIGN precedent exactly, as directed.

### Context Decision Compliance
All locked decisions from `<phase_context>` verified directly in code:
- `thread.question` is never assigned anywhere in the diff (`git diff main -- lib/research/orchestrator.ts | grep -n "^-"` returns nothing — fully additive); `effectiveQuestion = thread.refinedQuestion ?? thread.question` is used for grounding/prompt (agent-io.ts unaffected).
- Zero-ambiguity => no pause, one spawn: confirmed in `b42066c`'s SEED block (`dimensions.length === 0` sets `refinedQuestion = question` and `saveThread`, no `emitCheckpoint` call).
- Seeded-skip / once-per-thread: `resolveSeedPosture`'s `active` gate includes `thread.iteration === 1 && !thread.seededFrom && thread.refinedQuestion === undefined`.
- DECIDE emits ONLY in the would-continue branch: the emit block in `ebbe5e2` sits textually after the untouched `if (term.done || branch === 'finalize') { ... return ... }` block (confirmed via `grep -n "term.done"` — only one occurrence, at line 1051, unmodified), i.e. structurally in the else-continuation path.
- Single round: both `buildSeedCheckpoint`/`buildDecideCheckpoint` pass/hardcode `round=1`.
- Consume at loop-top short-circuits without re-entering the completed iteration: DECIDE consume (`consumeAnswered(...,'decide',...)`) is placed at the very top of the for-body, before DESIGN consume, and both Stop and Continue/Pivot/Adjust-budget paths `return`/`continue` without touching `resumable`/HYPOTHESIZE for the just-completed iteration.
- `evaluateVerdict`/`shouldTerminate`/`decideBranch` are imported from `./verdict` (a separate module never touched by this phase's diff) — untouched by construction, not just by convention.
- Default config byte-identical: `git diff main -- lib/research/orchestrator.ts` shows zero removed/modified lines, only additions — the strongest available proof.
- Skill interview thin, composes with Phase-102 steering section without duplication: verified by reading `commands/research.md` — the new "Interactive SEED interview" section is placed before the loop description, cross-references (not duplicates) the existing "Interactive steering" section, and Subcommands/Flags are annotated rather than re-explained.
- `pendingGate`/`ThreadStatus` unions untouched: DECIDE's Stop path reuses `checkGate(thread,'kg_write',...)` and `finishKgSync` unmodified; `thread.status = 'exhausted'` uses an existing terminal status value (confirmed already present pre-phase as a `shouldTerminate` reason), not a new union member.

### Known Pitfalls
No KNOWHOW.md/PITFALLS.md pitfalls specific to this domain were flagged as missed; the plans
and EVAL explicitly carry forward Phase 102's R1 (unattended-caller pause), R4-analog (ordering
trap), and R5 (double-ask) risk patterns and address each with a dedicated must_have + test
(seeded-skip, would-continue-only gating, no-double-ask) — all verified passing in the test run.

### Eval Coverage
103-EVAL.md's sanity/proxy checks are all computable against the current implementation:
S1-S6 and P1-P9 all reference real exported symbols (`resolveSeedPosture`, `buildDecideCheckpoint`,
`DECIDE_BUDGET_BUMP`, etc.) and real test describe-block names that exist in
`tests/unit/research/orchestrator.test.ts`. Ran the suite directly: `agent-io.test.ts` +
`orchestrator.test.ts` => 96/96 pass. `npm run build:check` and `npm run lint` both clean.
No stray `grd-*`/`tsx-*` dirs found in repo root post-run.

## Stage 2: Code Quality

### Architecture
Consistent with existing patterns. New orchestrator functions (`resolveSeedPosture`,
`buildSeedCheckpoint`, `foldSeedAnswers`, `resolveDecidePosture`, `buildDecideCheckpoint`)
follow the exact naming/shape convention of the Phase 102 `resolveDesignPosture`/
`buildDesignCheckpoint` precedent. `parseClarifyOutput` reuses the existing
`extractTaggedJson<T>` helper rather than reimplementing tag parsing. No duplicate utilities
introduced. Typed requires match the established destructured-require-with-cast style
(`const { fn } = require('./m') as {...}`); zero `any` anywhere in the new code; `'use strict'`
already governs the file (unchanged, first line). CommonJS `module.exports` extended in-place
(both `_prompts.ts` and `agent-io.ts`) rather than replaced.

### Reproducibility
`DECIDE_BUDGET_BUMP = 2` is a documented, deterministic constant (comment explicitly notes it's
"not a wall-clock/random value" to keep tests reproducible) — good practice given no config
file exists for this specific value. Offline/deterministic test seams (injected `spawn`,
`checkpointHandler`, `runner`) are used throughout per the project's dependency-injection
testing convention; `TMPDIR` hygiene is followed in every verify command per CLAUDE.md's test
hygiene note.

### Documentation (Paper References)
N/A for paper references (feature phase, not a reproduction). Inline comments in the new
orchestrator code are unusually thorough and correctly explain WHY (e.g. "parseClarifyOutput
never returns null... degrade-safe", "a would-continue point is never a supported verdict, so
the terminal status is 'exhausted'"), not just what.

### Deviation Documentation
SUMMARY.md files match `git log`/`git show` exactly for all five feat/test commits across the
three plans; the one deviation (test-isolation `decide: false` fix in 103-03) is disclosed with
file + commit reference. `files_modified` front-matter in each PLAN.md matches the actual
touched files.

## Findings Summary

| # | Severity | Stage | Area | Description |
|---|----------|-------|------|--------------|
| 1 | INFO | 1 | Context Compliance | `thread.status = 'exhausted'` on DECIDE-Stop reuses an existing terminal status value rather than introducing a new one — correctly honors the "pendingGate/ThreadStatus unions untouched" lock; worth a quick confirmatory glance at `thread.ts`'s `ThreadStatus` union in a future phase if that union is ever audited independently. |
| 2 | INFO | 2 | Reproducibility | `DECIDE_BUDGET_BUMP` is a hardcoded module const rather than a config value; acceptable per plan (explicitly specified as such) but worth externalizing to `.planning/config.json`'s `interactive` block if a future phase wants it user-tunable. |
| 3 | INFO | 1 | Eval Coverage | 103-EVAL.md's Level 3 deferred items (D1/D2) correctly extend Phase 102's `DEFER-102-01`/`DEFER-101-02/03` IDs rather than opening new ones — good hygiene, no action needed. |

## Recommendations

No blockers or warnings — nothing requires action before proceeding. Optional, non-blocking
follow-ups for a later phase: (a) if `DECIDE_BUDGET_BUMP` proves too rigid in practice, consider
lifting it into the `interactive` config block (would need its own plan since this phase's
scope explicitly pins it as a deterministic constant); (b) Phase 105's REQ-209 multi-station
integration suite is the right place to finally validate the combinatorial (not just pairwise)
interaction between SEED/DESIGN/DECIDE consume ordering at loop-top, as both 103-03's plan and
103-EVAL.md D2 already anticipate.
