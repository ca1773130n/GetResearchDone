# Evaluation Plan: Phase 103 — SEED Interview + DECIDE Branch

**Designed:** 2026-07-19
**Designer:** Claude (grd-eval-planner)
**Method(s) evaluated:** Skill-layer socratic pre-loop interview in `commands/research.md`
(Plan 103-01); orchestrator SEED clarification checkpoint — `buildClarifyPrompt` /
`parseClarifyOutput` / `resolveSeedPosture` / SEED consume-emit-fold (Plan 103-02); orchestrator
DECIDE branch checkpoint — `resolveDecidePosture` / `buildDecideCheckpoint` / emit-on-would-
continue / consume-at-loop-top (Plan 103-03)
**Reference papers:** N/A — feature phase. Evaluated against this milestone's own artifacts:
`.planning/milestones/v0.5.0/research/SUMMARY.md` §2 F4 / §4 C4, `.planning/REQUIREMENTS.md`
REQ-202/203/204, and the Phase 102 EVAL/RESULTS pattern this phase extends (`102-EVAL.md`,
`102-EVAL-RESULTS.md`).

## Evaluation Overview

Phase 103 adds the SECOND and THIRD live checkpoint emission sites to the autoresearch loop,
directly copying the Phase 102 DESIGN emit/consume pattern (`resolveDesignPosture` /
`buildDesignCheckpoint` / loop-top consume) to two new stations: SEED (a pre-HYPOTHESIZE
clarification checkpoint for bare-CLI users, mirrored at the skill layer by 103-01's markdown-
only socratic interview) and DECIDE (a would-continue-only continuation-override checkpoint
that never delays a terminal verdict). As with Phase 102, there is no external paper or
benchmark — correctness is fully specified by REQ-202/203/204 and the plans' `must_haves`, so
evaluation is proof-of-property testing, not metric-target testing.

Everything up to "a real human in a real interactive Claude Code session" is provable offline:
markdown-structure grep for 103-01, and injected-`spawn`/injected-`checkpointHandler` orchestrator
tests for 103-02/103-03. This phase does NOT introduce a new class of deferred item the way
Phase 101→102 did — it EXTENDS `DEFER-102-01` (the still-open "real human AskUserQuestion loop"
item) to cover two more checkpoint points (seed, decide) rather than opening a new ID, and it
explicitly feeds Phase 105's carried-forward `DEFER-101-03`/`D3` full R1/R3/R4/R5 milestone
suite, since that suite requires all of SEED/DESIGN/DECIDE emission sites to coexist in one run
— which now exists after this phase.

### Metric Sources

| Metric | Source | Why This Metric |
|--------|--------|----------------|
| Byte-identical default config (both stations) | REQ-203/204 explicit "byte-identical" truths; PITFALLS R1 pattern | Same highest-risk regression surface as Phase 102 — SEED and DECIDE both sit on the hot per-iteration loop path |
| Zero-ambiguity no-pause (SEED) | 103-02-PLAN.md must_have #3 | The "good path" (well-formed question) must cost exactly one spawn and zero pauses, or every research run pays an unnecessary interactive tax |
| `refinedQuestion` fold without `question` mutation (SEED) | 103-02-PLAN.md must_have #4/#5 | `thread.question` seeds `threadId` — mutating it would break thread identity; this is the SEED-specific analog of Phase 102's R4 |
| Seeded-thread skip (SEED) | 103-02-PLAN.md must_have #6 | Seeded threads (portfolio/harness-spawned) must never clarify — an unattended caller pausing here is the R1 failure mode |
| Would-continue-only gating (DECIDE) | 103-03-PLAN.md must_have #1 | A terminal verdict must never be delayed by a checkpoint — this is DECIDE's #1 correctness risk, the direct analog of Phase 102's R4 ordering trap |
| Verdict-untouched (DECIDE) | 103-03-PLAN.md must_have #5; SUMMARY.md §4 "verdict no-touch list" | `evaluateVerdict`/contract-pin/`shouldTerminate`/`decideBranch` must be byte-identical — DECIDE overrides CONTINUATION only, never the verdict, or the loop's deterministic-verdict guarantee (no LLM-judged scoring on the control path) breaks |
| No-double-ask, both stations | PITFALLS.md R5 (carried) | Same re-entry risk as Phase 102, now at two more emission sites plus their interaction with the existing DESIGN consume at loop top |
| No-reentry-on-resume (loop-top ordering) | 103-03-PLAN.md Task 2 ordering note | DECIDE consume must run before DESIGN consume/SEED at loop top without cross-triggering — first phase where 3 stations' consume blocks coexist in one loop-top sequence |
| orchestrator.ts / agent-io.ts coverage floors | jest.config.js (`agent-io.ts`: 85% lines / 100% functions / 75% branches pinned); 101-04's working orchestrator.ts baseline (94.2%/82.1%) carried via 102-01 | Regression guard against the two most-touched modules in this wave |

### Verification Level Summary

| Level | Count | Purpose |
|-------|-------|---------|
| Sanity (L1) | 6 | Build/lint clean + markdown-structure grep (103-01) + the two directly-touched unit suites + full-suite regression + stray-tmp-dir cleanup |
| Proxy (L2) | 9 | Byte-identical default (both stations), SEED zero-ambiguity no-pause, SEED refinedQuestion-fold, SEED seeded-skip, DECIDE would-continue-only, DECIDE verdict-untouched, DECIDE routing (continue/pivot/adjust/stop), no-double-ask (both), coverage-floor hold |
| Deferred (L3) | 2 | Real human socratic interview + SEED/DECIDE AskUserQuestion rounds (extends DEFER-102-01); panel fallback + full R1-R5 milestone suite (Phase 105, carried from DEFER-101-02/03) |

## Level 1: Sanity Checks

**Purpose:** Verify the phase compiles, lints, the markdown structure is present, and the
directly-touched suites run green. These MUST ALL PASS before proceeding to proxy verification.

### S1: TypeScript build
- **What:** No type errors introduced across `_prompts.ts`, `agent-io.ts`, `orchestrator.ts`
- **Command:** `npm run build:check`
- **Expected:** Exit code 0, no `tsc` errors
- **Failure means:** A type mismatch in `buildClarifyPrompt`/`parseClarifyOutput`/
  `resolveSeedPosture`/`resolveDecidePosture`/`buildDecideCheckpoint` wiring — block immediately

### S2: Lint
- **What:** Zero `any`, unused args `_`-prefixed, style conformance
- **Command:** `npm run lint`
- **Expected:** Exit code 0, zero errors/warnings on `lib/` and `bin/`
- **Failure means:** New code violates the strict-TS/no-`any` convention

### S3: SEED interview markdown structure (103-01)
- **What:** `commands/research.md` contains the "Interactive SEED interview" section with the
  one-question-at-a-time rule and the falsifiable-metric-target stop condition, positioned
  before the `gd research` invocation guidance; no TS/CLI file touched
- **Command:**
  ```bash
  grep -nE "SEED interview|one .*question at a time|falsifiable|metric target" commands/research.md
  git diff --stat main -- commands/research.md lib/ bin/
  ```
- **Expected:** All four grep patterns match at least once; `git diff --stat` shows changes
  ONLY in `commands/research.md` for this plan's scope (103-02/103-03 touch `lib/research/*`
  separately — this check isolates 103-01's file-scope claim)
- **Failure means:** The section is missing, misplaced (after the invocation), or 103-01 leaked
  into CLI/orchestrator code contrary to its markdown-only scope

### S4: Agent-io unit suite (parser regression gate)
- **What:** All pre-existing `agent-io.test.ts` assertions plus the new `parseClarifyOutput`
  cases (valid/empty/malformed/recommended-normalization/cap)
- **Command:** `TMPDIR=$(mktemp -d) npx jest tests/unit/research/agent-io.test.ts`
- **Expected:** All tests pass, 0 failures
- **Failure means:** The `__CLARIFY__` tagged-JSON parser is broken, or an existing parser
  (`parseHypothesisOutput` etc.) regressed from a shared-helper change

### S5: Orchestrator unit suite (default-path regression gate)
- **What:** All pre-existing `orchestrator.test.ts` assertions plus the new
  `describe('SEED clarification checkpoint (Phase 103)')` and
  `describe('DECIDE branch checkpoint (Phase 103)')` blocks
- **Command:** `TMPDIR=$(mktemp -d) npx jest tests/unit/research/orchestrator.test.ts`
- **Expected:** All tests pass, 0 failures; no test relies on network or a live backend
- **Failure means:** Either the new SEED/DECIDE wiring is broken, or (worse) an existing
  non-interactive assertion regressed, or the Phase 102 DESIGN block's tests regressed from
  loop-top reordering — treat any pre-existing-test failure as the highest-priority signal

### S6: Full unit suite + stray temp-dir cleanup
- **What:** No cross-file regression elsewhere in the tree (e.g., a shared `checkpoints.ts` or
  `thread.ts` change breaking an unrelated caller: bench/portfolio/harness/autopilot/cli-kb)
- **Command:**
  ```bash
  TMPDIR=$(mktemp -d) npm test
  find . -maxdepth 1 -type d -name 'grd-*' -exec rm -rf {} +
  find . -maxdepth 1 -type d -name 'tsx-*' -exec rm -rf {} +
  ```
- **Expected:** Full suite green (~5000 tests); no stray `grd-*`/`tsx-*` dirs left in repo root
- **Failure means:** A shared-module change has a blast radius beyond the three plans' declared
  `files_modified`

**Sanity gate:** ALL six checks must pass before Level 2 proxy metrics are evaluated.

## Level 2: Proxy Metrics

**Purpose:** Prove the phase's specific correctness properties (REQ-202/203/204, byte-identical
default, no-double-ask, verdict-untouched) that a plain green test suite doesn't by itself
distinguish from "happened to pass."
**IMPORTANT:** These are proxies for full milestone verification (Phase 105's REQ-209 suite),
not a substitute for it — mark `validated: false` until Phase 105 confirms with live,
multi-station interaction across SEED/DESIGN/DECIDE.

### P1: Byte-identical default config — both stations
- **What:** With `research_gates.interactive` absent/disabled, neither the SEED nor the DECIDE
  code path emits a checkpoint or spawns the clarifier; loop behavior is provably unchanged from
  pre-Phase-103.
- **How:** (a) diff `orchestrator.ts` git history — every hunk in the existing HYPOTHESIZE
  grounding path and the existing DECIDE+terminate `else` branch must be additive-only; (b) the
  "BYTE-IDENTICAL default" tests in 103-02 Task 3 and 103-03 Task 3 assert no clarifier spawn /
  no decide checkpoint / no `refinedQuestion` write when interactive is off.
- **Command:**
  ```bash
  git diff main -- lib/research/orchestrator.ts | grep -B3 -A3 "effectiveQuestion\|thread.iteration += 1"
  TMPDIR=$(mktemp -d) npx jest tests/unit/research/orchestrator.test.ts -t "byte-identical"
  ```
- **Target:** Zero deletions/modifications inside the pre-existing default-path branches; both
  byte-identical tests pass; no `checkpoints.jsonl` record for point `seed` or `decide` appears
  when interactive is off.
- **Evidence:** REQ-203/204 explicit byte-identical truths; 103-02/103-03 `must_haves`.
- **Correlation with full metric:** HIGH — direct structural diff proof, not a sampled measure.
- **Blind spots:** Doesn't cover every unattended caller (bench/portfolio/harness/autopilot/
  cli-kb) independently — relies on Phase 101's caller-audit plus Phase 105's R1 integration
  suite for the cross-caller claim.
- **Validated:** false — full cross-caller R1 confirmation deferred to Phase 105.

### P2: SEED — zero-ambiguity no-pause
- **What:** A well-formed (unambiguous) question costs exactly one clarifier spawn and zero
  pauses; `thread.refinedQuestion` is set to `thread.question` verbatim to mark SEED done.
- **How:** 103-02 Task 3 "UNAMBIGUOUS" test — canned `__CLARIFY__` output with an empty
  `dimensions` array; assert exactly one spawn call, no `pendingCheckpoint`, and
  `thread.refinedQuestion === thread.question`.
- **Command:** `TMPDIR=$(mktemp -d) npx jest tests/unit/research/orchestrator.test.ts -t "UNAMBIGUOUS"`
- **Target:** Test passes; spawn call count for the clarifier === 1; no `checkpoints.jsonl`
  record for point `seed`; `refinedQuestion` equals `question` byte-for-byte.
- **Evidence:** 103-02-PLAN.md must_have #3 ("Zero ambiguous dimensions => NO checkpoint").
- **Correlation with full metric:** HIGH — exercises the exact "good path" the requirement names.
- **Blind spots:** Uses a canned clarifier response; doesn't prove a real LLM reliably returns
  an empty-dimensions block for genuinely unambiguous questions (that's a live-backend property,
  Level 3).
- **Validated:** false.

### P3: SEED — refinedQuestion fold without question mutation
- **What:** On resume, chosen answer labels/text fold into `thread.refinedQuestion`;
  `thread.question` is never reassigned; HYPOTHESIZE grounds on
  `effectiveQuestion = thread.refinedQuestion ?? thread.question`.
- **How:** 103-02 Task 3 "RESUME folds refinedQuestion" test — resume with answers, assert
  `thread.refinedQuestion` reflects the chosen labels, `thread.question` is byte-identical to
  its pre-resume value, and the grounding/hypothesizer call received the refined text.
- **Command:** `TMPDIR=$(mktemp -d) npx jest tests/unit/research/orchestrator.test.ts -t "folds refinedQuestion"`
- **Target:** Test passes; `thread.question` unchanged; grounding pack built from
  `effectiveQuestion`, not `thread.question`.
- **Evidence:** 103-02-PLAN.md must_have #4/#5 (thread.question "NEVER mutated," seeds `threadId`).
- **Correlation with full metric:** HIGH — directly exercises the exact field-mutation risk the
  plan calls out as a hard invariant.
- **Blind spots:** Tests one round of folding with option-label answers; doesn't prove
  multi-dimension freeform-text folding produces a coherent refined question string (semantic
  quality, not structural correctness) — out of scope for structural proxy testing.
- **Validated:** false.

### P4: SEED — seeded-thread skip
- **What:** Threads with `seededFrom` set (portfolio/harness-spawned) never trigger the SEED
  clarifier — no spawn, no checkpoint.
- **How:** 103-02 Task 3 "SEEDED thread" test — construct a thread with `seededFrom` set, run
  the loop, assert zero clarifier spawns and no `seed` checkpoint record.
- **Command:** `TMPDIR=$(mktemp -d) npx jest tests/unit/research/orchestrator.test.ts -t "SEEDED thread"`
- **Target:** Test passes; clarifier spawn count === 0 for seeded threads.
- **Evidence:** 103-02-PLAN.md must_have #6; PITFALLS.md R1 (unattended-caller pause pattern —
  portfolio/harness threads are the canonical "unattended caller").
- **Correlation with full metric:** HIGH — directly tests the R1 failure mode's SEED-specific
  instance.
- **Blind spots:** Only tests the `seededFrom`-set condition in isolation; doesn't prove every
  real portfolio/harness call site actually sets `seededFrom` on its threads (that's a caller
  audit, covered by Phase 101's existing audit + Phase 105's R1 suite).
- **Validated:** false.

### P5: DECIDE — would-continue-only gating (verdict never delayed)
- **What:** The DECIDE checkpoint fires ONLY in the `!term.done && branch !== 'finalize'`
  branch; a terminal verdict (supported, or budget-exhausted) finalizes with NO checkpoint and
  is never delayed waiting for a human.
- **How:** 103-03 Task 3 "TERMINAL verdict NOT delayed" test — canned runner metric yielding a
  terminal verdict, assert the thread finalizes with terminal status and no `pendingCheckpoint`
  regardless of `interactive.decide` being active.
- **Command:** `TMPDIR=$(mktemp -d) npx jest tests/unit/research/orchestrator.test.ts -t "TERMINAL verdict"`
- **Target:** Test passes; no `checkpoints.jsonl` record for point `decide` on the terminal run;
  finalize path (buildFinding/writeFinding/kg_write gate) reached in the same iteration.
- **Evidence:** 103-03-PLAN.md must_have #1; this is the DECIDE-specific analog of Phase 102's
  R4 ordering trap (checkpoint must never intercept a committed/terminal outcome).
- **Correlation with full metric:** HIGH — directly exercises the exact ordering risk named in
  the plan's hypothesis.
- **Blind spots:** Tests one terminal condition (supported verdict); doesn't independently prove
  every termination reason (budget-exhausted, plateau, etc. — see `shouldTerminate`'s full
  reason set) individually skips the checkpoint, only that the general `term.done` gate does.
- **Validated:** false.

### P6: DECIDE — verdict math untouched
- **What:** `evaluateVerdict`, the committed metric-contract pin, and `shouldTerminate`/
  `decideBranch` are byte-identical to pre-Phase-103; DECIDE overrides CONTINUATION only.
- **How:** (a) diff `orchestrator.ts` — zero changes inside `evaluateVerdict`/`shouldTerminate`/
  `decideBranch` function bodies; (b) 103-03 Task 3 tests assert the verdict/branch computed for
  a given metric is identical whether `interactive.decide` is on or off (only the CONTINUATION
  outcome — pause vs. proceed — differs).
- **Command:**
  ```bash
  git diff main -- lib/research/orchestrator.ts | grep -B3 -A10 "function evaluateVerdict\|function shouldTerminate\|function decideBranch"
  TMPDIR=$(mktemp -d) npx jest tests/unit/research/orchestrator.test.ts -t "DECIDE"
  ```
- **Target:** Zero diff hunks inside those three function bodies; DECIDE test suite's asserted
  verdict/branch values match the non-interactive baseline for the same canned metric.
- **Evidence:** 103-03-PLAN.md must_have #5; SUMMARY.md §4 "verdict no-touch list"; the
  project's deterministic-verdict guarantee (no LLM-judged scoring on the control path,
  per CLAUDE.md's autoresearch-loop description).
- **Correlation with full metric:** HIGH — structural diff + behavioral equivalence test, the
  strongest available proof short of a formal specification.
- **Blind spots:** Doesn't prove equivalence for every possible metric/comparator/target
  combination, only the canned fixtures exercised by the test block.
- **Validated:** false.

### P7: DECIDE — routing (continue/pivot/adjust-budget/stop)
- **What:** Resume answers route correctly: `continue` → iteration+1; `pivot` → `pendingPivot`
  set + iteration+1; `adjust-budget` → `maxIterations` bumped by `DECIDE_BUDGET_BUMP` + iteration
  +1; `stop` → finalize (reads persisted `result.json`, terminal status `exhausted`, `kg_write`
  gate honored, no re-run of the completed experiment).
- **How:** 103-03 Task 3's four routing sub-tests (CONTINUE/PIVOT/ADJUST-BUDGET/STOP resume).
- **Command:** `TMPDIR=$(mktemp -d) npx jest tests/unit/research/orchestrator.test.ts -t "resume"`
- **Target:** All four sub-tests pass; STOP-resume asserts the runner/hypothesizer are NOT
  re-invoked for the already-completed iteration (no wasted re-run); PIVOT-resume asserts the
  next HYPOTHESIZE call reflects the pivot path.
- **Evidence:** 103-03-PLAN.md must_have #3; key_links "DECIDE stop finalize path."
- **Correlation with full metric:** HIGH — exercises all four named outcomes against the actual
  routing code, not a subset.
- **Blind spots:** `adjust-budget`'s freeform-numeric-override path (optional bonus parsing) is
  not required by the must_haves and may not be independently tested — only the default
  `DECIDE_BUDGET_BUMP` constant path is guaranteed covered.
- **Validated:** false.

### P8: No-double-ask, both stations + 3-station loop-top ordering
- **What:** A resumed SEED or DECIDE answer folds/advances exactly once; re-entering the loop
  does not re-emit the same checkpoint; the loop-top consume ordering (DECIDE → DESIGN → SEED)
  does not cross-trigger — a resumed answer at one point never causes another point's consume to
  fire spuriously.
- **How:** 103-02 Task 3 "NO DOUBLE-ASK" + 103-03 Task 3 "NO DOUBLE-ASK" tests, plus a
  cross-check that a DESIGN-approve resume (from Phase 102's existing tests) still passes
  unmodified after the SEED/DECIDE consume blocks are inserted ahead of it in loop-top order.
- **Command:**
  ```bash
  TMPDIR=$(mktemp -d) npx jest tests/unit/research/orchestrator.test.ts -t "double-ask"
  TMPDIR=$(mktemp -d) npx jest tests/unit/research/orchestrator.test.ts -t "DESIGN approval checkpoint"
  ```
  (second command re-runs Phase 102's existing DESIGN describe block verbatim as a regression
  check on loop-top reordering)
- **Target:** Both no-double-ask tests pass; Phase 102's pre-existing DESIGN checkpoint tests
  are unmodified and still 100% green after 103-03's loop-top insertion.
- **Evidence:** PITFALLS.md R5 (carried); 103-03-PLAN.md Task 2 explicit ordering note
  ("DECIDE consume -> DESIGN consume/abort -> SEED -> reuse tree").
- **Correlation with full metric:** HIGH for same-station double-ask; MEDIUM for full
  cross-station interaction (only pairwise regression-checked here, not combinatorially).
- **Blind spots:** Doesn't test EVERY pairwise/triple interaction (e.g., a single resume that
  somehow carries answers for two points simultaneously) — that combinatorial proof is Phase
  105's D3/full-milestone suite scope, per the WeakSet one-shot design being point-keyed rather
  than globally keyed.
- **Validated:** false — full multi-station interaction proof deferred to Phase 105.

### P9: Coverage-floor hold
- **What:** `orchestrator.ts` and `agent-io.ts` coverage does not regress below their working
  baselines (orchestrator.ts: 94.2% stmts / 82.1% branch per 101-04, carried by 102-01;
  agent-io.ts: 85% lines / 100% functions / 75% branches, pinned in `jest.config.js`); no
  threshold is lowered.
- **How:** Run coverage and grep the summary for both files; diff `jest.config.js` for any
  threshold edits.
- **Command:**
  ```bash
  TMPDIR=$(mktemp -d) npx jest tests/unit/research/orchestrator.test.ts tests/unit/research/agent-io.test.ts --coverage --collectCoverageFrom='lib/research/orchestrator.ts' --collectCoverageFrom='lib/research/agent-io.ts' --collectCoverageFrom='lib/research/_prompts.ts'
  git diff main -- jest.config.js
  ```
- **Target:** orchestrator.ts >= 94.2% stmts / 82.1% branch; agent-io.ts holds its pinned
  85%/100%/75%; `jest.config.js` diff is empty (no threshold entries lowered for these files).
- **Evidence:** 102-01-PLAN.md's carried instruction; `jest.config.js`'s existing pinned
  agent-io.ts entry (line 73).
- **Correlation with full metric:** MEDIUM — coverage percentage doesn't prove correctness,
  only that new branches are exercised by some assertion; P1-P8 above are the actual
  correctness proofs.
- **Blind spots:** A test can execute a branch without asserting the property that matters.
- **Validated:** false (by design — coverage floors are never "validated," only "held or not").

## Level 3: Deferred Validations

**Purpose:** Full evaluation requiring an interactive human session or later-phase integration
not available in this phase.

### D1: Real human socratic interview + SEED/DECIDE AskUserQuestion rounds — extends DEFER-102-01
- **What:** An actual interactive Claude Code session runs the pre-loop socratic interview from
  103-01 (multiple real AskUserQuestion rounds refining a vague question into a falsifiable
  metric target), then a real `gd research` run that pauses at a live SEED clarification
  checkpoint AND a live DECIDE branch checkpoint, all answered by a real human — proving the
  full loop end-to-end for both new stations, not the scripted/injected stand-ins in P2-P8.
- **How:** Manually run `/grd:research` (or equivalent) in a live session on first real usage
  after this phase merges; observe whether the SEED interview correctly stops at a falsifiable
  target, whether the orchestrator's SEED clarification checkpoint (for bare-CLI invocations)
  fires with sensible dimensions, and whether a DECIDE round with a genuinely ambiguous
  continue/pivot/stop/adjust-budget choice reads clearly.
- **Why deferred:** Same reason as `DEFER-102-01` — no sandboxed harness drives a real
  AskUserQuestion prompt + human response deterministically; this is inherently outside CI.
  This item EXTENDS `DEFER-102-01` rather than opening a new ID, since it's the same underlying
  gap (real-human-AskUserQuestion) now spanning three checkpoint points (design, seed, decide)
  instead of one.
- **Validates at:** First live/manual use of `gd research` with `research_gates.interactive`
  fully enabled (seed + design + decide) after Phase 103 merges — no fixed phase number, a
  "first live use" gate, same as `DEFER-102-01`.
- **Depends on:** Phase 103 merged; a user or maintainer running an interactive session with all
  three points active in one thread.
- **Target:** SEED interview stops within a small number of rounds at a falsifiable metric
  target and echoes the original question; orchestrator SEED checkpoint (if triggered on a
  bare-CLI ambiguous question) shows <=4 sensible dimensions with a recommended-first option;
  DECIDE checkpoint shows an accurate evidence summary (verdict/metric-vs-target/iteration count)
  and all four routing choices behave as documented.
- **Risk if unmet:** MEDIUM — same class of risk as `DEFER-102-01` (R10 protocol drift between
  the orchestrator's emitted JSON and the skill's parsing expectations), now doubled across two
  more emission sites. Mitigation: the same `gd research status <id>` manual escape hatch
  (REQ-201) applies to seed/decide checkpoints identically to design.

### D2: Panel fallback + full R1-R5 milestone suite (Phase 105) — carried from DEFER-101-02/03, extended by this phase's stations
- **What:** (a) `answerViaDiscussion`'s `fallback:"panel"` path answering seed/decide
  checkpoints without pausing (not just design); (b) the full R1/R3/R4/R5 cross-cutting
  integration suite (REQ-209), now exercisable end-to-end for the FIRST time across all three
  checkpoint sites (design + seed + decide) in a single run, including interaction scenarios
  like "SEED clarifies, then later in the same thread a DECIDE checkpoint fires" or "a debug
  re-plan after a SEED fold does not re-ask SEED."
- **Why deferred:** `answerViaDiscussion` doesn't exist until Phase 105 (REQ-207/208); this
  phase only wires the seed/decide emission sites the panel path will eventually plug into.
  The full REQ-209 multi-station interaction proof requires all three sites to coexist, which
  is now true after this phase, but the live/integration harness for it is Phase 105's scope,
  not this phase's.
- **Validates at:** phase-105-panel-wiring-telemetry-docs
- **Depends on:** REQ-207/208 implementation (panel path); this phase's SEED + DECIDE emission
  sites existing (satisfied).
- **Target:** Panel-answered seed/decide checkpoints produce the same Checkpoint record shape as
  human-answered ones (per 101-EVAL.md D2); the full R1/R3/R4/R5 suite passes as live/integration
  tests spanning design+seed+decide, including at least one multi-checkpoint-in-one-thread
  scenario (e.g., SEED fold followed later by a DECIDE pause).
- **Risk if unmet:** HIGH if R1 fails at integration — an unattended caller could pause despite
  this phase's P1/P4 proxies and Phase 101's caller-audit all passing in isolation, e.g. due to
  interaction between the SEED and DECIDE stations in the same run (a scenario this phase's P8
  only pairwise-regression-checks, not combinatorially proves). Fallback: revert the offending
  caller's `research_gates.interactive` exposure per the R1 mitigation pattern (same as
  Phase 102's D3 fallback).

## Ablation Plan

**No ablation plan** — this phase wires two additional checkpoint sites (SEED/DECIDE) plus a
markdown-only skill-layer interview; there are no interchangeable sub-components to isolate.
The nearest analog (does SEED clarification add value over letting HYPOTHESIZE ground on a
possibly-ambiguous question) is not an ablation question — REQ-203 requires the SEED station to
be a strictly additive, skippable pre-step, not an alternative to be compared against.

## Baselines

| Baseline | Description | Expected Score | Source |
|----------|-------------|----------------|--------|
| Pre-Phase-103 orchestrator.test.ts | Full existing suite (including Phase 102's DESIGN block), interactive absent/disabled | 100% pass, unchanged assertions | Sanity S5 / Proxy P1, P8 |
| 101-04 orchestrator.ts coverage (carried via 102-01) | 94.2% stmts / 82.1% branch | Held or improved, never regressed | Proxy P9 |
| agent-io.ts pinned jest threshold | 85% lines / 100% functions / 75% branches | Held or improved | jest.config.js line 73 / Proxy P9 |
| 102-EVAL.md DEFER-102-01 target | "Real human AskUserQuestion loop" (design-only) | Extended by this phase to cover seed+decide; still PENDING | 102-EVAL.md D1 |

## Evaluation Scripts

**Location of evaluation code:**
```
tests/unit/research/agent-io.test.ts       (existing + new parseClarifyOutput cases)
tests/unit/research/orchestrator.test.ts   (existing + new SEED + DECIDE describe blocks)
commands/research.md                       (grep-verified markdown structure, no test file)
```

**How to run full evaluation:**
```bash
npm run build:check && npm run lint
grep -nE "SEED interview|one .*question at a time|falsifiable|metric target" commands/research.md
TMPDIR=$(mktemp -d) npx jest tests/unit/research/agent-io.test.ts tests/unit/research/orchestrator.test.ts --coverage
find . -maxdepth 1 -type d -name 'grd-*' -exec rm -rf {} +
find . -maxdepth 1 -type d -name 'tsx-*' -exec rm -rf {} +
```

## Results Template

*To be filled by grd-eval-reporter after phase execution.*

### Sanity Results

| Check | Status | Output | Notes |
|-------|--------|--------|-------|
| S1 build:check | | | |
| S2 lint | | | |
| S3 SEED interview markdown structure | | | |
| S4 agent-io.test.ts | | | |
| S5 orchestrator.test.ts | | | |
| S6 full suite | | | |

### Proxy Results

| Metric | Target | Actual | Status | Notes |
|--------|--------|--------|--------|-------|
| P1 byte-identical default (both) | 0 modified lines in default branches | | | |
| P2 SEED zero-ambiguity no-pause | 1 spawn, 0 pauses, refinedQuestion==question | | | |
| P3 SEED refinedQuestion fold | question unchanged, effectiveQuestion used | | | |
| P4 SEED seeded-thread skip | 0 clarifier spawns for seededFrom threads | | | |
| P5 DECIDE would-continue-only gating | 0 decide checkpoints on terminal verdicts | | | |
| P6 DECIDE verdict math untouched | 0 diff in evaluateVerdict/shouldTerminate/decideBranch | | | |
| P7 DECIDE routing | 4/4 continue/pivot/adjust/stop sub-tests pass | | | |
| P8 no-double-ask + ordering | 1 record per iteration/point; DESIGN tests unaffected | | | |
| P9 coverage floor | orchestrator.ts >=94.2%/82.1%; agent-io.ts holds pinned floor | | | |

### Ablation Results

N/A — no ablation plan for this phase.

### Deferred Status

| ID | Metric | Status | Validates At |
|----|--------|--------|-------------|
| DEFER-102-01 (extended) | Real human AskUserQuestion loop — design+seed+decide | PENDING | first live use |
| DEFER-101-02 / DEFER-102-D2 (carried) | AI-panel fallback (now spanning 3 stations) | PENDING | phase-105-panel-wiring-telemetry-docs |
| DEFER-101-03 / DEFER-102-D3 (carried) | Full R1/R3/R4/R5 milestone suite (now first-possible across all 3 stations) | PENDING | phase-105-panel-wiring-telemetry-docs |

## Evaluation Confidence

**Overall confidence in evaluation design:** HIGH

**Justification:**
- Sanity checks: adequate — build/lint/markdown-grep/two suites/full-suite cover every file the
  phase touches (103-01's markdown, 103-02's parser+orchestrator wiring, 103-03's orchestrator
  wiring), with test hygiene (TMPDIR outside repo) explicitly enforced per command.
- Proxy metrics: well-evidenced — each proxy traces to a specific `must_have` in the three plans
  or a specific named risk pattern (R1, R4-analog, R5) from the Phase 102 precedent this phase
  copies verbatim; P8 explicitly checks that inserting SEED/DECIDE consume ahead of the existing
  DESIGN consume at loop top does not regress Phase 102's own tests.
- Deferred coverage: comprehensive for what remains genuinely out of reach in-phase (a real
  human interactive session cannot be scripted) and honestly scoped as an EXTENSION of the
  existing `DEFER-102-01`/`D2`/`D3` items rather than invented fresh — the multi-station
  interaction proof (D2) is now for the first time technically possible after this phase, but
  its live-integration harness remains Phase 105's scope.

**What this evaluation CAN tell us:**
- Whether the default (non-interactive) path is provably unchanged for both new stations
  (structural diff + tests)
- Whether SEED correctly costs zero pauses on a well-formed question, and exactly one pause on
  an ambiguous one, without ever mutating `thread.question`
- Whether SEED is properly skipped for seeded (portfolio/harness) threads
- Whether DECIDE fires ONLY on the would-continue path, never delaying a terminal verdict
- Whether DECIDE's four routing choices (continue/pivot/adjust-budget/stop) behave as specified
  without touching the deterministic verdict math
- Whether inserting two new loop-top consume blocks ahead of Phase 102's DESIGN consume leaves
  DESIGN's own tests green (pairwise regression, not full combinatorial proof)

**What this evaluation CANNOT tell us:**
- Whether a real human, using the real AskUserQuestion tool in a live Claude Code session,
  successfully completes the socratic interview and answers seed/decide checkpoints without
  confusion — deferred to first live use (D1, extending DEFER-102-01)
- Whether the panel-fallback path works for seed/decide checkpoints — deferred to Phase 105 (D2)
- Whether R1/R3/R4/R5 hold when all three checkpoint sites (design/seed/decide) interact in
  arbitrary combinations within a single run (only pairwise-regression-checked here) — deferred
  to Phase 105 (D2)

---

*Evaluation plan by: Claude (grd-eval-planner)*
*Design date: 2026-07-19*
