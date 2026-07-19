---
phase: 104-hypothesize-candidate-selection
wave: all
plans_reviewed: [104-01, 104-02]
timestamp: 2026-07-19T07:52:37Z
blockers: 0
warnings: 1
info: 3
verdict: warnings_only
---

# Code Review: Phase 104 (HYPOTHESIZE Candidate Selection)

## Verdict: WARNINGS ONLY

Both plans were executed faithfully and match the plan text, the research SUMMARY.md §F5
contract, and REQ-205/REQ-206. All 122 tests in the three affected suites pass, `tsc --noEmit`
and `eslint` are clean, and the S3 static control-flow pin (`evaluateVerdict`/`shouldTerminate`/
`decideBranch` untouched) holds. One WARNING (unpersisted checkpoint round counter) and three
INFO items below; no blockers.

## Stage 1: Spec Compliance

### Plan Alignment
No issues found. Every task in 104-01-PLAN.md and 104-02-PLAN.md has a corresponding commit:
- f3ba547 — Task 1 (parseHypothesesOutput)
- 43b0ba1 — Task 2 (buildHypothesesPrompt)
- 4cf443f — 104-02 Tasks 1+2 (resolveSelectPosture, buildSelectCheckpoint, emit+consume)
- 7231a04 — 104-02 Task 3 (tests) + a documented deviation (SEED suite isolation fix)

The single deviation recorded in 104-02-SUMMARY.md ("Test-isolation fix: Phase 103 SEED suite
config now sets `hypothesize:false`") is properly documented as an auto-fixed Rule-1 issue, with
file and commit cited, and is verified in the diff (`interactive: { enabled: true, seed: true,
design: false, hypothesize: false }`). This is a reasonable and minimal fix — INFO only.

### Research Methodology
`SUMMARY.md`/`FEATURES.md` §F5 specifies a `__HYPOTHESES__` array of
`{statement, rationale, predictedOutcome}`, ranked, `<= hypothesis_candidates`, with the old
single-block parser kept as the N=1 path. Verified directly against the diffs:
`buildHypothesesPrompt` emits exactly this contract and `parseHypothesesOutput` parses/caps/ranks
it faithfully; `buildHypothesizePrompt`/`parseHypothesisOutput` are provably untouched (both
pinned by dedicated tests, and `git show 43b0ba1`/`f3ba547` show pure additions, no lines removed
from the existing functions). No deviation from the referenced design.

### Context Decision Compliance
N/A — no CONTEXT.md exists for this phase.

### Known Pitfalls
`PITFALLS.md` documents that HYPOTHESIZE/DESIGN/DECIDE fire every iteration by default and that
gate defaults are on-when-absent — `resolveSelectPosture` correctly mirrors `resolveDesignPosture`
(default-off unless `interactive.enabled` + `cfg.hypothesize`, `every_iteration` gating) per the
plan's anchor points. No pitfall from `PITFALLS.md` is hit.

### Eval Coverage
104-EVAL.md's P1-P7 proxy metrics and S1-S4 sanity checks are all directly computable from the
implementation as built — confirmed by re-running the exact commands:
- `npm run build:check` — clean
- `npm run lint` — clean
- `TMPDIR=$(mktemp -d) npx jest tests/unit/research/agent-io.test.ts tests/unit/research/prompts.test.ts tests/unit/research/orchestrator.test.ts` — 3 suites, 122 tests, all pass
- S3 static grep pin (`git show 4cf443f -- lib/research/orchestrator.ts | grep -E '(evaluateVerdict|shouldTerminate|decideBranch)'`) — zero matches, confirming the additive-only diff claim

D1/D2 (live backend generation, live human UX) are correctly deferred per GRD's offline-TDD
convention and are out of scope for this review (not flagged).

## Stage 2: Code Quality

### Architecture
Consistent with existing patterns. `resolveSelectPosture`/`buildSelectCheckpoint` are near-exact
mirrors of `resolveDesignPosture`/`buildSeedCheckpoint` (same typed-require style, same
`module.exports` conventions, zero `any`). The selection emit/consume wiring is additive within
the cold-HYPOTHESIZE branch as promised — no new architectural pattern introduced.

**WARNING — unpersisted checkpoint round counter:** In the DESIGN checkpoint precedent
(`orchestrator.ts:810-819`), a revise resume explicitly persists the incremented round
(`thread.checkpointRounds = { ...thread.checkpointRounds, design: nextRound }; saveThread(...)`).
The new HYPOTHESIZE selection emit computes `const round = (thread.checkpointRounds?.hypothesize
?? 0) + 1;` (orchestrator.ts:991) but never assigns it back to `thread.checkpointRounds` /
persists it via `saveThread`. Today this is benign because the selection checkpoint is one-shot
(no "revise" loop like DESIGN — a resume always resolves), so `round` will always compute as `1`
for the only real pause that occurs. However, if a checkpoint handler ever declines to pause
(the "non-pausing handler → fall through to degrade" path at line 1002) and a later iteration or
retry re-enters this branch, `round` will silently recompute as `1` again rather than incrementing,
risking a duplicate checkpoint id (`makeCheckpointId(iteration, 'hypothesize', 1)`) if two
selection checkpoints are ever emitted for the same iteration. Recommend persisting
`thread.checkpointRounds.hypothesize` the same way DESIGN does, for symmetry and future-proofing,
even though no test currently exercises a second round.

### Reproducibility
N/A in the traditional ML sense (no seeds/hyperparameters), but the equivalent property —
deterministic parsing/prompt construction — is fully covered: `parseHypothesesOutput` is a pure
function over a string, tested table-driven; `hypothesis_candidates` config clamp `[1,5]` is
externalized in `.planning/config.json` (`readInteractiveConfig`), not hardcoded.

### Documentation
Adequate. Both new functions carry doc comments citing "Phase 104" and referencing the
`parseClarifyOutput` degrade-safe precedent and the DESIGN posture precedent they mirror. Inline
comments in the orchestrator wiring (e.g. "ZERO POLLUTION: pause BEFORE any appendHypothesis")
clearly flag the safety-critical invariant.

### Deviation Documentation
SUMMARY.md matches git history for both plans. Only files actually modified
(`lib/research/agent-io.ts`, `lib/research/_prompts.ts`, `lib/research/orchestrator.ts`, and the
three corresponding test files) appear in both `key-files.modified` and the commit diffs — no
undocumented file changes found.

**INFO:** 104-02-SUMMARY.md notes a pre-existing ledger serialization limitation (empty
`predictedOutcome` field does not round-trip) and correctly scopes the FREEFORM test to only
assert the load-bearing fields (`statement`, `rationale`). This is a reasonable, clearly-labeled
workaround rather than a silent test weakening.

**INFO:** `.planning/REQUIREMENTS.md`'s REQ-205/REQ-206 tracking table still shows `PENDING` —
expected, since that table is updated by a later phase-completion step, not code review.

## Findings Summary

| # | Severity | Stage | Area | Description |
|---|----------|-------|------|-------------|
| 1 | WARNING | 2 | Architecture | `thread.checkpointRounds.hypothesize` is computed but never persisted/saved on emit (unlike the DESIGN precedent), risking a duplicate round number if a second selection checkpoint is ever emitted for the same iteration |
| 2 | INFO | 1 | Deviation Documentation | SEED suite test-isolation fix (`hypothesize:false`) properly documented, minimal, correct |
| 3 | INFO | 2 | Deviation Documentation | Documented pre-existing ledger empty-field round-trip limitation, correctly scoped test assertion |
| 4 | INFO | 1 | Eval Coverage | REQUIREMENTS.md tracking table shows PENDING for REQ-205/206 — expected at this stage, not a code issue |

## Recommendations

- (WARNING #1) Add `thread.checkpointRounds = { ...thread.checkpointRounds, hypothesize: round };
  saveThread(cwd, thread);` alongside the `buildSelectCheckpoint`/`emitCheckpoint` call in
  `orchestrator.ts` (~line 991-993), mirroring the DESIGN revise-resume persistence pattern, so the
  round counter is correct if the selection checkpoint is ever re-emitted for the same iteration
  (e.g., after a non-pausing handler fallthrough followed by a later real pause). Low priority —
  not currently exercised by any live code path, since selection is presently one-shot.
