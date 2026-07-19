---
phase: 102-design-approval-skill-checkpoint-loop
wave: all
plans_reviewed: [102-01, 102-02]
timestamp: 2026-07-19T00:00:00Z
blockers: 0
warnings: 1
info: 3
verdict: warnings_only
---

# Code Review: Phase 102 (102-01, 102-02)

## Verdict: WARNINGS ONLY

Both plans are executed faithfully and cleanly against their PLAN.md task lists; the
runLoop-top consume placement (the item the interrupted prior review was checking) is
correct and matches the locked decision. No blockers found. One WARNING (REQ-199 wording
vs. actual `approved.execute` value on approve) and three INFO items.

## Stage 1: Spec Compliance

### Plan Alignment
No issues found. 102-01 Tasks 1-3 and 102-02 Tasks 1-2 all have corresponding commits
(`4acd842`, `dc68ff2`, `5eaabf1`, `13665cc`) and SUMMARY.md claims match `git show` diffs.
The one documented deviation (102-01 combining Task 1+2 into a single commit) is properly
noted in SUMMARY.md and is cosmetic (both tasks touch the same interdependent code region).

### Runloop placement (prior interrupted-review focus) — CONFIRMED CORRECT
Traced `runLoop` in `lib/research/orchestrator.ts`: the `consumeAnswered(resumedCheckpoint,
'design', thread.iteration)` call and the approve/revise/abort branch sit at the TOP of the
loop body (right after `resumable`/`planFile` are computed), strictly BEFORE the
HYPOTHESIZE/DESIGN spawn branch and BEFORE the classic `approved.execute` reuse fast-path.
The GATE-1 site (further down, ~line 664+) only ever reaches `buildDesignCheckpoint` +
`emitCheckpoint` for the fresh-emit/revise-re-emit cases (an already-resolved 'abort'/
'approve' answer returns/reassigns before reaching it). This matches must_have #2 and the
locked decision verbatim — no re-derive on approve-resume.

### Research Methodology / Context Decision Compliance
- Contract-edit ordering (R4): `applyContractEditsFromFreeform` runs in the APPROVE branch
  at the loop top, writing the edited `plan` to `planFile` before the `const committed = {...}`
  snapshot (line 709) is taken later in the same iteration — this is strictly before the pin,
  as required. Verified via a full read of the debug-retry block (lines 690-764): `committed`
  is captured from the (already-edited) `plan` object, and the debug loop's drift-detection
  loop overwrites any model-drifted field back to `committed[key]` — the R4 test's assertion
  (`contractDrift.target.pinned === 0.9`, `proposed === 0.8`) is a legitimate exercise of real
  production logic, not a coincidental pass.
- consumeAnswered one-shot (R5): implemented via a `WeakSet<object>` in `checkpoints.ts`,
  keyed on the resolved-checkpoint object identity — correctly blocks re-consumption within a
  single `runLoop` invocation (the scope R5 cares about: debug re-plan / same-call re-entry).
- Revise cap (default `max_rounds: 2`): the loop-top logic increments
  `checkpointRounds.design` only when `nextRound <= max_rounds`; on the 3rd revise
  (`nextRound=3 > 2`) it falls through to APPROVE instead of persisting a 3rd round-bump or
  emitting a 4th checkpoint. Matches the "revise twice, 3rd resolves to approve" must_have and
  test expectations (`checkpointRounds.design` ends at 2, `readCheckpointLog` length 3, no 4th
  record).
- Byte-identical default (P1 requirement): `git diff` confirms the existing
  `checkGate('execute', ...)` block is moved verbatim into an `else` branch of
  `if (designPosture.active) {...} else {...}` with zero line-level modification inside it —
  a structural, not just behavioral, additive-only proof.
- `lib/research/types.ts` (ThreadStatus/pendingGate/CheckpointPoint unions) is untouched by
  every commit in this phase (`git diff` against the phase's base commit is empty for this
  file) — the "unions untouched" locked decision is honored.

### Known Pitfalls (PITFALLS.md R4/R5/R10)
No issues found — R4 and R5 are directly exercised by dedicated tests exactly as the plan's
Task 3 specifies (see above); R10 (skill/emitter field-name drift) is addressed by 102-02's
`renderCheckpointQuestions`, which reads the same `Checkpoint`/`Question` field names
(`ask`, `options[].recommended`, `options[].label`, `freeform`) the orchestrator emits in
`buildDesignCheckpoint` — no naming mismatch found between emitter and both consumers (skill
doc + status renderer).

### Eval Coverage (102-EVAL.md)
No issues found. All Level 1/2 proxies (S1-S5, P1-P4, P6) map to commands and assertions that
exist and pass in the current tree (`npm run build:check`, `npm run lint` both clean; the six
Phase-102 `describe` tests in `orchestrator.test.ts` and the three new tests in `cli.test.ts`
are present and structurally sound). P5 (scripted CLI-level E2E) and D1/D2/D3 (Level 3) are
explicitly deferred per the eval plan's own design — not required for this review.

## Stage 2: Code Quality

### Architecture
Consistent with existing patterns: typed `require()` destructuring (matches the existing
`resolveCheckpoint` import style from 101-04), DI seam for `checkpointHandler` mirrors the
existing `runner`/`spawn` injection pattern, `renderCheckpointQuestions` mirrors
`renderThreadLog`'s pure-string-builder style. No duplicate utilities introduced.

### Reproducibility
N/A in the traditional ML sense, but the analogous property (deterministic offline test
harness, no live backend) is honored: all new tests inject `spawn`/`runner`/
`checkpointAnswers`/`checkpointHandler` and use `fs.mkdtempSync(os.tmpdir())`-based tmp cwds
(TMPDIR hygiene per repo gotchas). No network calls introduced.

### Documentation
Adequate. Both `orchestrator.ts` additions carry inline comments tying specific code blocks
to R4/R5/REQ-199 by name (e.g. the `// R4:` comment directly above the contract-edit write).
`lib/research/thread.ts`'s new export has a docstring explaining its R10 escape-hatch purpose.

### Deviation Documentation
SUMMARY.md matches git history for both plans — files_modified lists in both PLAN.md
frontmatter match the actual commits' changed-file sets exactly (102-01: orchestrator.ts +
its test; 102-02: research.md, cli.ts, thread.ts, cli.test.ts).

## Findings Summary

| # | Severity | Stage | Area | Description |
|---|----------|-------|------|--------------|
| 1 | WARNING | 1.1 | REQ-199 wording | REQ-199's parenthetical "Approve & run consumes the execute gate (`approved.execute = true`)" reads as if the resulting state should be `true`; the actual code sets `approved.execute = false` in the APPROVE branch (correctly, since a checkpoint resume already arrives with `approved.execute` false per the 101-04 `resumeResearch` call chain, and "consumed" in this codebase's convention means "flipped off after being spent," matching the existing classic-gate reuse fast-path a few lines below). This is very likely a documentation/requirements-wording imprecision predating this phase's code, not an implementation defect — the plan (102-01-PLAN.md, more detailed and locked) explicitly calls out and resolves this exact tension. Recommend updating REQUIREMENTS.md's REQ-199 description to remove the misleading parenthetical rather than changing code. |
| 2 | INFO | 2.2 | Test-only `any` | `tests/unit/research/orchestrator.test.ts`'s new describe block uses one `(o: any)` in a `.filter()` callback. ESLint's configured scope (`eslint bin/ lib/`) does not cover `tests/`, so this doesn't violate the enforced lint gate, but it is a minor departure from the project's "zero any" convention if that convention is meant to be repo-wide. Not blocking — matches pre-existing test-file conventions elsewhere in the suite (not audited exhaustively, but this is consistent with the eslint config's explicit tests/ exclusion). |
| 3 | INFO | 1.4 | Debug-loop re-check decoupling | The R4 test explicitly sets `research_gates.experiment_execution: false` to keep the untouched debug-loop `checkGate('execute', false)` re-check (line ~728) from interacting with the interactive-design path — a deliberate, correctly-commented test-setup choice, not a code smell. Worth flagging only so a future reader isn't confused about why that config key appears in a DESIGN-checkpoint test. |
| 4 | INFO | 2.1 | Positive: DI seam reuse | `opts.checkpointHandler` cleanly follows the existing `runner`/`spawn` DI convention rather than inventing a new pattern — good architectural consistency, and it's exactly what enables the deterministic offline R4/R5/revise-cap/abort proofs without a real pause. |

## Recommendations

- (Finding 1, low priority) Consider a documentation-only follow-up to REQUIREMENTS.md
  clarifying REQ-199's "approved.execute" parenthetical, since the current code's behavior
  (verified correct and matching the phase's own locked decisions and tests) doesn't literally
  match the requirement's parenthetical wording. This does not block phase completion.
- No action required for findings 2-4 (informational only).
