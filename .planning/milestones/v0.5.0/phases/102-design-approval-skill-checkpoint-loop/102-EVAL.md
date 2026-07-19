# Evaluation Plan: Phase 102 — DESIGN Approval + Skill Checkpoint Loop

**Designed:** 2026-07-19
**Designer:** Claude (grd-eval-planner)
**Method(s) evaluated:** DESIGN-approval Checkpoint emission/consume wiring at the GATE-1
(execute-gate) site in `runLoop` (Plan 102-01); skill-layer AskUserQuestion protocol +
`gd research status` human rendering (Plan 102-02)
**Reference papers:** N/A — feature phase, no external paper. Evaluated against this
milestone's own research artifacts: `.planning/milestones/v0.5.0/research/SUMMARY.md` §4
decisions 1/3/5/6, `.planning/milestones/v0.5.0/research/PITFALLS.md` R4/R5/R10,
`.planning/REQUIREMENTS.md` REQ-199/200/201/209.

## Evaluation Overview

Phase 102 wires the FIRST live checkpoint emission site into the autoresearch orchestrator
(Phase 101 shipped `checkpoints.ts` standalone with zero emission call sites). Two
independent plans land in one wave: 102-01 emits/consumes the DESIGN-approval checkpoint
inside `runLoop` (orchestrator.ts), and 102-02 surfaces it to a human via the skill's
AskUserQuestion protocol and `gd research status`. There is no external paper or benchmark
here — the correct behaviors are fully specified in REQ-199/200/201 and the PITFALLS
register (R4 ordering-vs-pin, R5 double-ask, R10 protocol drift), so evaluation is proof-of-
property testing against those specs, not metric-target testing.

This phase can fully verify almost everything EXCEPT one property: a live human answering a
real AskUserQuestion prompt through an actual interactive Claude Code session. Everything up
to that boundary — emit, pause, JSON contract, resume, consume, contract-edit survival,
one-shot no-reask, revise cap, abort, byte-identical default — is provable offline with
injected `checkpointHandler`/`checkpointAnswers`, and this phase is explicitly the one that
resolves `DEFER-101-01` (Phase 101's deferred "live pause/resume E2E") via a **scripted**
end-to-end run (mock/injected spawn driving the full CLI, not a hand-unit-test bypass).

### Metric Sources

| Metric | Source | Why This Metric |
|--------|--------|----------------|
| Default-config byte-identical behavior | REQ-199 + PITFALLS R1 pattern (unattended paths never pause) | Interactive steering must be strictly additive — this is the single highest-risk regression surface for a milestone that touches the hot orchestrator loop |
| R4 (contract edit survives debug-loop pin) | PITFALLS.md R4 | The verdict is deterministic off the committed contract; if the checkpoint fires after the pin, the user's edit is silently discarded — this is the phase's #1 correctness risk |
| R5 (no double-ask) | PITFALLS.md R5 | Debug re-plan / resurvey / resume must never re-raise an already-answered checkpoint, or the loop deadlocks waiting on an answer that was already given |
| DEFER-101-01 resolution (live pause/resume) | 101-EVAL.md D1 / 101-EVAL-RESULTS.md | Phase 101 explicitly deferred this to "phase-102-design-approval-checkpoint" — this phase must close it, not merely re-defer it |
| orchestrator.test.ts / cli.test.ts green under coverage | jest.config.js (no threshold currently pinned for orchestrator.ts/cli.ts, but 101-04 established a coverage floor of 94.2% stmts / 82.1% branch for orchestrator.ts as a working baseline) | Regression guard against the largest, highest-traffic module in the loop |

### Verification Level Summary

| Level | Count | Purpose |
|-------|-------|---------|
| Sanity (L1) | 5 | Build/lint clean + the three affected unit suites green |
| Proxy (L2) | 6 | Default-config byte-identical proof, R4 proof, R5 proof, coverage-floor proof, DEFER-101-01 scripted-E2E resolution, doc-protocol proof |
| Deferred (L3) | 3 | Real human AskUserQuestion loop (needs interactive session), panel fallback (Phase 105), full R1-R5 milestone suite (Phase 105) |

## Level 1: Sanity Checks

**Purpose:** Verify the phase compiles, lints, and the three directly-touched suites run
green. These MUST ALL PASS before proceeding to proxy verification.

### S1: TypeScript build
- **What:** No type errors introduced across orchestrator.ts, cli.ts, thread.ts
- **Command:** `npm run build:check`
- **Expected:** Exit code 0, no `tsc` errors
- **Failure means:** A type signature mismatch in the new `checkpointHandler`/`resumedCheckpoint`/`renderCheckpointQuestions` wiring — block immediately

### S2: Lint
- **What:** Zero `any`, unused args `_`-prefixed, style conformance
- **Command:** `npm run lint`
- **Expected:** Exit code 0, zero errors/warnings on `lib/` and `bin/`
- **Failure means:** New code violates the project's strict-TS/no-`any` convention

### S3: Orchestrator unit suite (default-path regression gate)
- **What:** All pre-existing `orchestrator.test.ts` assertions plus the new Phase-102
  `describe('DESIGN approval checkpoint (Phase 102)')` block
- **Command:** `TMPDIR=$(mktemp -d) npx jest tests/unit/research/orchestrator.test.ts`
- **Expected:** All tests pass, 0 failures; no test relies on network or a live backend
- **Failure means:** Either the fresh-emit/consume wiring is broken, or (worse) an existing
  non-interactive assertion regressed — treat any pre-existing-test failure as the highest
  priority signal in this phase

### S4: CLI unit suite
- **What:** All pre-existing `cli.test.ts` assertions plus the new pending-checkpoint
  rendering tests (JSON path unchanged, human path shows questions/recommended/hint)
- **Command:** `TMPDIR=$(mktemp -d) npx jest tests/unit/research/cli.test.ts`
- **Expected:** All tests pass, 0 failures
- **Failure means:** `cmdResearchStatus`'s human/JSON branch split is wrong, or
  `renderCheckpointQuestions` doesn't render the expected fields

### S5: Full unit suite + stray temp-dir cleanup
- **What:** No cross-file regression elsewhere in the tree (e.g. a shared `thread.ts` export
  change breaking an unrelated caller)
- **Command:**
  ```bash
  TMPDIR=$(mktemp -d) npm test
  find . -maxdepth 1 -type d -name 'grd-*' -exec rm -rf {} +
  find . -maxdepth 1 -type d -name 'tsx-*' -exec rm -rf {} +
  ```
- **Expected:** Full suite green (~5000 tests); no stray `grd-*`/`tsx-*` dirs left in repo root
- **Failure means:** A shared-module change (thread.ts/types.ts) has a blast radius beyond
  the two plans' declared `files_modified`

**Sanity gate:** ALL five checks must pass before Level 2 proxy metrics are evaluated.

## Level 2: Proxy Metrics

**Purpose:** Prove the phase's specific correctness properties (REQ-199/200/201, R4, R5,
R10) that a plain green test suite doesn't by itself distinguish from "happened to pass."
**IMPORTANT:** These are proxies for full milestone verification (Phase 105's REQ-209 suite),
not a substitute for it — mark `validated: false` until Phase 105 confirms with live callers.

### P1: Default-config byte-identical proxy
- **What:** With `research_gates.interactive` absent/disabled, the GATE-1 code path is
  provably unchanged from pre-Phase-102 behavior
- **How:** (a) diff `orchestrator.ts` git history — every hunk touching the default
  (non-`designActive`) branch must be additive-only (no deleted/modified lines inside the
  existing `checkGate('execute', ...)` block); (b) the "BYTE-IDENTICAL DEFAULT" test in
  102-01 Task 3 (test #6) asserts an existing execute-gate test still passes verbatim with
  `pendingGate:'execute'` and no `checkpoints.jsonl` written
- **Command:**
  ```bash
  git diff main -- lib/research/orchestrator.ts | grep -B3 -A3 "checkGate('execute'"
  TMPDIR=$(mktemp -d) npx jest tests/unit/research/orchestrator.test.ts -t "byte-identical"
  ```
- **Target:** Zero deletions/modifications inside the existing `checkGate` block; the
  byte-identical test passes; no `checkpoints.jsonl` file appears in the tmp cwd for that test
- **Evidence:** REQ-199 "byte-identical" clause; must_have #7 in 102-01-PLAN.md
- **Correlation with full metric:** HIGH — this is a direct structural proof (diff-based),
  not a sampled indirect measure
- **Blind spots:** Doesn't cover every possible unattended caller (bench/portfolio/harness/
  autopilot/cli-kb) — only the orchestrator's own default-path test. Cross-caller proof is
  Phase 101's caller-audit (already done) + Phase 105's R1 integration suite.
- **Validated:** false — full cross-caller R1 confirmation deferred to Phase 105

### P2: R4 — contract edit survives the debug-loop pin
- **What:** A DESIGN-checkpoint APPROVE answer that edits `target` via Q2's freeform text is
  reflected in the `committed` snapshot and survives a forced debug retry (contractDrift does
  not revert it)
- **How:** 102-01 Task 3 test #2 — resume with an edited target (e.g. 0.9), force one debug
  retry (`research_max_debug_depth>0`, runner fails once then succeeds), assert MEASURE judges
  against 0.9 and `committed.target === 0.9` (not the model's original)
- **Command:** `TMPDIR=$(mktemp -d) npx jest tests/unit/research/orchestrator.test.ts -t "R4"`
- **Target:** Test passes; `plan.json`/`checkpoints.jsonl` show the edited value; the pinned
  `committed.target` after the debug retry equals the edited value, not the pre-edit value
- **Evidence:** PITFALLS.md R4 (ordering trap: checkpoint must fire strictly before commit);
  102-01-PLAN.md Task 2's placement requirement (contract edits land before the `const
  committed = {...}` snapshot at ~L542)
- **Correlation with full metric:** HIGH — this test directly exercises the exact ordering
  the risk register identifies as the failure mode, using the real debug-retry code path
- **Blind spots:** Only tests one debug retry, one edited field (`target`); doesn't prove the
  same holds for `metricKey`/`comparator`/`language` edits or multiple consecutive retries
- **Validated:** false — single-field/single-retry proxy; broader combinatorial coverage is
  optional hardening, not required by REQ-199

### P3: R5 — no double-ask on resume/debug re-plan
- **What:** After an APPROVE resume, the loop runs without emitting a second design
  checkpoint in the same iteration; a debug re-plan never re-pauses
- **How:** 102-01 Task 3 test #3 — assert `consumeAnswered`'s one-shot WeakSet guard prevents
  re-consumption; assert no second `checkpoints.jsonl` record for the same iteration+point
  after a debug re-plan
- **Command:** `TMPDIR=$(mktemp -d) npx jest tests/unit/research/orchestrator.test.ts -t "R5"`
- **Target:** Test passes; checkpoint record count for iteration 1 / point 'design' stays at
  1 across an approve-resume + forced debug re-plan
- **Evidence:** PITFALLS.md R5 (three re-entry paths: debug loop, resurvey, resumeResearch);
  102-01-PLAN.md Task 2's `consumeAnswered(resumedCheckpoint,'design',iteration)` one-shot call
- **Correlation with full metric:** HIGH — directly exercises the debug-re-plan re-entry path
  named in the risk register
- **Blind spots:** Doesn't test the resurvey re-entry path (station reset) — that path isn't
  wired to checkpoints until Phase 103/104 (SEED/DECIDE checkpoints), so it's out of this
  phase's scope, not an unproven gap
- **Validated:** false — resurvey and multi-station double-ask coverage lands with the
  Phase 103/104 emission sites and Phase 105's full R5 proof

### P4: Coverage-floor hold
- **What:** orchestrator.ts and cli.ts coverage does not regress below the working baseline
  established at 101-04 (94.2% stmts / 82.1% branch for orchestrator.ts); no `jest.config.js`
  per-file threshold is lowered
- **How:** Run coverage and grep the summary for both files; diff `jest.config.js` for any
  threshold edits
- **Command:**
  ```bash
  TMPDIR=$(mktemp -d) npx jest tests/unit/research/orchestrator.test.ts tests/unit/research/cli.test.ts --coverage --collectCoverageFrom='lib/research/orchestrator.ts' --collectCoverageFrom='lib/research/cli.ts' --collectCoverageFrom='lib/research/thread.ts'
  git diff main -- jest.config.js
  ```
- **Target:** orchestrator.ts >= 94.2% stmts / 82.1% branch; `jest.config.js` diff is empty
  (no threshold entries added/lowered for these files — note neither file currently has a
  pinned per-file entry in jest.config.js, so this is a self-imposed floor, not an enforced CI
  gate)
- **Evidence:** 102-01-PLAN.md Task 3 explicit instruction: "keep orchestrator.ts coverage
  at/above its current entry (94.2% stmts / 82.1% branch per 101-04)"
- **Correlation with full metric:** MEDIUM — coverage percentage doesn't prove correctness,
  only that the new branches are exercised by some assertion
- **Blind spots:** A test can execute a branch without asserting the property that matters
  (coverage != correctness) — P2/P3 above are the actual correctness proofs; this is a
  regression tripwire only
- **Validated:** false (by design — coverage floors are never "validated," only "held or not")

### P5: DEFER-101-01 resolution — scripted live pause/resume E2E
- **What:** Phase 101 deferred "an actual `gd research \"<q>\"` run that emits a checkpoint,
  pauses, and is resumed via `gd research resume <id> --answers <file>` through the skill
  layer" because Phase 101 shipped zero emission call sites. This phase MUST close that
  deferred item with a scripted (not hand-unit-test) run: a mock/injected spawn backend
  driving the actual `gd research`/`gd research resume` CLI entry points end-to-end.
- **How:** Write a throwaway script (outside the repo, per test-hygiene gotcha — use
  `mktemp -d` with its own `.planning/`) that:
  1. Writes `.planning/config.json` with `research_gates.interactive.enabled=true, design=true`
  2. Injects a mock spawn (module-level fixture, not a live backend) that returns a canned
     HYPOTHESIZE/DESIGN response
  3. Invokes `node bin/gd.js research "<test question>"` (or the equivalent `gd.ts` entry) and
     captures the JSON result
  4. Asserts `result.pendingCheckpoint.point === 'design'` and `result.status === 'paused'`
  5. Writes an answers file `{ "<q1id>": {"label":"Approve & run"} }` via a script (standing in
     for the skill's Write-tool step) and invokes
     `node bin/gd.js research resume <id> --answers <file>`
  6. Asserts the resumed result reaches RUN/MEASURE (reuses the persisted plan, no
     re-spawned DESIGN) and does not pause a second time for the same iteration
- **Command:**
  ```bash
  SCRATCH=$(mktemp -d)
  cd "$SCRATCH" && mkdir -p .planning
  # (script writes config.json + mock-backend fixture, then:)
  node /path/to/repo/bin/gd.js research "test question" --json
  node /path/to/repo/bin/gd.js research resume <id> --answers ./answers.json --json
  ```
- **Target:** Both invocations succeed; first returns `paused:true`/`pendingCheckpoint.point
  ==='design'`; second returns a non-paused result that reached RUN without re-spawning DESIGN
  (no second `planFile` write timestamp change)
- **Evidence:** 101-EVAL.md D1 ("Validates at: phase-102-design-approval-checkpoint... Target:
  A hand-run research thread pauses exactly once at DESIGN, skill-layer AskUserQuestion
  round-trips correctly, resume continues the loop with recorded answers")
- **Correlation with full metric:** HIGH for the CLI-level round-trip; MEDIUM for the full
  skill-layer AskUserQuestion loop (this proxy scripts the answer-writing step rather than
  routing through an actual interactive Claude Code AskUserQuestion call — that gap is
  Level 3, D1 below)
- **Blind spots:** Uses a mock spawn, not a live LLM backend — doesn't prove the checkpoint
  context/questions are useful/comprehensible to a real model or human, only that the JSON
  contract and CLI plumbing round-trip correctly
- **Validated:** false — this resolves 101's DEFER-101-01 CLI-plumbing gap but a NEW,
  narrower deferred item (real interactive AskUserQuestion) is recorded as D1 below

### P6: Skill protocol doc-review proxy (REQ-200/201/R10)
- **What:** `commands/research.md`'s "Interactive steering" section correctly documents the
  parse-from-JSON / AskUserQuestion (max 4, recommended-first, 2 rounds, de-dupe by TEXT) /
  Write-tool-file / resume protocol, matching `plan-phase.md` §9 verbatim in spirit; `gd
  research status <id>` renders the same typed fields the orchestrator emits
- **How:** Read-back review of `commands/research.md` against the Checkpoint/Question type
  shape in `lib/research/types.ts`; confirm `renderCheckpointQuestions` reads the same field
  names the skill doc instructs the agent to parse (this is the R10 emitter/parser-agreement
  check — since there's no compile-time link between markdown and TS, this proxy is the best
  available substitute)
- **Command:**
  ```bash
  grep -n "recommended\|freeform\|questionId\|pendingCheckpoint" commands/research.md
  grep -n "recommended\|freeform\|ask" lib/research/thread.ts lib/research/types.ts
  ```
  Manual cross-check: every field name the skill doc tells the agent to read
  (`pendingCheckpoint.questions[].ask/options/recommended/freeform`) must exist verbatim in
  `types.ts`'s `Checkpoint`/`Question` interface.
- **Target:** Zero field-name mismatches between the markdown protocol and the TS type
  definitions; `gd research status <id>` output (manually run against a paused fixture thread)
  shows the same `ask`/options/recommended-marker/resume-hint the skill doc describes
- **Evidence:** PITFALLS.md R10 (protocol drift between orchestrator emitter and skill
  parser, "no compile-time or test-time check that the emitter and parser match")
- **Correlation with full metric:** MEDIUM — a manual doc/type cross-check catches naming
  drift but not semantic drift (e.g., a skill misinterpreting a correctly-named field)
- **Blind spots:** Doesn't prove an actual Claude Code session parses the markdown protocol
  correctly — that's Level 3, D1
- **Validated:** false

## Level 3: Deferred Validations

**Purpose:** Full evaluation requiring an interactive human session or later-phase
integration not available in this phase.

### D1: Real human AskUserQuestion loop through the skill — DEFER-102-01
- **What:** An actual interactive Claude Code session runs `gd research "<q>"`, the skill
  parses `pendingCheckpoint` per the "Interactive steering" section, calls the real
  `AskUserQuestion` tool, a human answers, the skill writes the answers file via the Write
  tool, and resumes — proving the full loop end-to-end with a real model/human, not a
  scripted stand-in (P5 above only scripts the CLI/JSON layer)
- **How:** Manually run `/grd:research` or equivalent in a live session on first real usage
  after this phase merges; observe whether AskUserQuestion fires with the expected 2
  questions, recommended-first ordering, and whether resume correctly proceeds
- **Why deferred:** No sandboxed harness in this repo drives a real Claude Code
  AskUserQuestion prompt + human response deterministically — that requires an actual
  interactive session, which is inherently outside automated CI
- **Validates at:** First live/manual use of `gd research` with `research_gates.interactive`
  enabled after Phase 102 merges (no fixed phase number — this is a "first live use" gate,
  not a scheduled phase)
- **Depends on:** Phase 102 merged; a user or maintainer running an interactive session
- **Target:** AskUserQuestion fires once with 2 questions (approve/revise/abort +
  freeform contract-edit), recommended option shown first and labeled, resume proceeds to RUN
- **Risk if unmet:** MEDIUM — if the skill markdown has a subtle misread of the JSON shape
  (R10), the first live user hits a broken/garbled prompt. Mitigation: P6's doc/type
  cross-check above substantially reduces this risk before first live use; `gd research
  status <id>` (REQ-201) remains a manual escape hatch if AskUserQuestion parsing fails.

### D2: AI-panel fallback (`answerViaDiscussion`) — carried forward from DEFER-101-02
- **What:** `fallback:"panel"` path answering a checkpoint without pausing
- **Why deferred:** `answerViaDiscussion` doesn't exist until Phase 105 (REQ-207/208); Phase
  102 only wires the DESIGN emission site the panel path will eventually plug into
- **Validates at:** phase-105-panel-wiring-telemetry-docs
- **Depends on:** REQ-207/208 implementation
- **Target:** Panel-answered checkpoints produce the same Checkpoint record shape as
  human-answered ones (per 101-EVAL.md D2)
- **Risk if unmet:** Low direct risk to Phase 102 — this phase doesn't touch the panel path

### D3: Full R1/R3/R4/R5 milestone verification suite (REQ-209) — carried forward from DEFER-101-03
- **What:** Cross-cutting integration proof of R1 (no unattended path pauses across
  bench/portfolio/harness/autopilot/cli-kb, live not just via caller-audit), R3 (pre-0.5.0
  back-compat), R4/R5 (this phase's P2/P3 proxies, but confirmed live across Phases 102-104's
  combined emission sites rather than in isolation)
- **Why deferred:** R4/R5 in this phase are proven only at the single DESIGN emission site;
  the full REQ-209 obligation requires Phases 103 (SEED clarification) and 104 (DECIDE
  branch) emission sites to exist too, so multi-checkpoint interaction (e.g. DESIGN approve
  followed by a DECIDE-branch checkpoint in the same run) is untested until then
- **Validates at:** phase-105-panel-wiring-telemetry-docs
- **Depends on:** Phases 103, 104 emission sites
- **Target:** All four proof obligations pass as live/integration tests spanning all
  checkpoint sites, not just DESIGN in isolation
- **Risk if unmet:** HIGH if R1 fails at integration — an unattended caller could pause
  despite Phase 101's caller-audit and this phase's P1 default-path proof both passing in
  isolation, e.g. due to interaction between two checkpoint sites. Fallback: revert the
  offending caller's `research_gates.interactive` exposure per the R1 mitigation pattern.

## Ablation Plan

**No ablation plan** — this phase wires a single checkpoint site (DESIGN/GATE-1) plus its
skill/status surface; there are no interchangeable sub-components to isolate. The nearest
analog (does the checkpoint add value over the existing execute-gate pause alone) is not an
ablation question — REQ-199 requires the combined pause to REPLACE the execute-gate pause
when interactive.design is active, not to be compared against it as an alternative.

## Baselines

| Baseline | Description | Expected Score | Source |
|----------|-------------|----------------|--------|
| Pre-Phase-102 orchestrator.test.ts | Full existing suite, interactive absent/disabled | 100% pass, unchanged assertions | Sanity check S3 / Proxy P1 |
| 101-04 orchestrator.ts coverage | 94.2% stmts / 82.1% branch | Held or improved, never regressed | 102-01-PLAN.md Task 3 |
| 101-EVAL.md DEFER-101-01 target | "Pauses exactly once at DESIGN, skill-layer round-trips, resume continues the loop" | Resolved via P5's scripted E2E (CLI layer); D1 above tracks the remaining live-human gap | 101-EVAL.md D1 |

## Evaluation Scripts

**Location of evaluation code:**
```
tests/unit/research/orchestrator.test.ts   (existing + new Phase-102 describe block)
tests/unit/research/cli.test.ts            (existing + new pending-checkpoint render tests)
```
The P5 scripted E2E harness is throwaway (per repo test-hygiene rules — run in a `mktemp -d`
sandbox with its own `.planning/`, never committed to the repo).

**How to run full evaluation:**
```bash
npm run build:check && npm run lint
TMPDIR=$(mktemp -d) npx jest tests/unit/research/orchestrator.test.ts tests/unit/research/cli.test.ts --coverage
find . -maxdepth 1 -type d -name 'grd-*' -exec rm -rf {} +
```

## Results Template

*To be filled by grd-eval-reporter after phase execution.*

### Sanity Results

| Check | Status | Output | Notes |
|-------|--------|--------|-------|
| S1 build:check | | | |
| S2 lint | | | |
| S3 orchestrator.test.ts | | | |
| S4 cli.test.ts | | | |
| S5 full suite | | | |

### Proxy Results

| Metric | Target | Actual | Status | Notes |
|--------|--------|--------|--------|-------|
| P1 byte-identical default | 0 modified lines in checkGate block | | | |
| P2 R4 contract-edit-survives-pin | committed.target == edited value | | | |
| P3 R5 no-double-ask | 1 checkpoint record per iteration/point | | | |
| P4 coverage floor | >=94.2%/82.1% orchestrator.ts | | | |
| P5 DEFER-101-01 scripted E2E | pause once, resume reaches RUN | | | |
| P6 skill protocol doc-review | 0 field-name mismatches | | | |

### Ablation Results

N/A — no ablation plan for this phase.

### Deferred Status

| ID | Metric | Status | Validates At |
|----|--------|--------|-------------|
| DEFER-102-01 | Real human AskUserQuestion loop | PENDING | first live use |
| DEFER-101-02 (carried) | AI-panel fallback | PENDING | phase-105-panel-wiring-telemetry-docs |
| DEFER-101-03 (carried) | Full R1/R3/R4/R5 milestone suite | PENDING | phase-105-panel-wiring-telemetry-docs |

## Evaluation Confidence

**Overall confidence in evaluation design:** HIGH

**Justification:**
- Sanity checks: adequate — build/lint/three suites cover every file the phase touches, with
  test hygiene (TMPDIR outside repo) explicitly enforced per command
- Proxy metrics: well-evidenced — each proxy traces to a specific named risk in PITFALLS.md
  (R4, R5, R10) or a specific must_have in the plans, not an invented metric; P5 explicitly
  resolves the named DEFER-101-01 item from the prior phase rather than re-deferring it
  wholesale
- Deferred coverage: comprehensive for what remains genuinely out of reach in-phase (a real
  human interactive session cannot be scripted) and honestly narrowed — D1 is a much smaller
  gap than the original DEFER-101-01 (only the live-human-AskUserQuestion leg remains, not
  the whole CLI round-trip)

**What this evaluation CAN tell us:**
- Whether the default (non-interactive) path is provably unchanged (structural diff + test)
- Whether a contract edit made at the DESIGN checkpoint survives the debug-loop pin (R4)
- Whether resume/debug-re-plan never re-asks an already-answered checkpoint (R5)
- Whether the CLI-level pause→resume round-trip works end-to-end with a scripted spawn
- Whether the skill markdown and the orchestrator's emitted JSON agree on field names (R10)

**What this evaluation CANNOT tell us:**
- Whether a real human, using the real AskUserQuestion tool in a live Claude Code session,
  successfully answers the checkpoint without confusion — deferred to first live use (D1)
- Whether the panel-fallback path (non-human answering) works — deferred to Phase 105 (D2)
- Whether R1/R3/R4/R5 hold when MULTIPLE checkpoint sites (SEED/DECIDE from Phases 103/104)
  interact in the same run — deferred to Phase 105 (D3)

---

*Evaluation plan by: Claude (grd-eval-planner)*
*Design date: 2026-07-19*
