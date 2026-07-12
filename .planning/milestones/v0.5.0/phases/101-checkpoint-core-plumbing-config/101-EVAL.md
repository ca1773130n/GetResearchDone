# Evaluation Plan: Phase 101 — Checkpoint Core Plumbing + Config

**Designed:** 2026-07-12
**Designer:** Claude (grd-eval-planner)
**Method(s) evaluated:** Checkpoint type family, `lib/research/checkpoints.ts`, `research_gates.interactive` config surface, default-OFF gate safety refactor, `resume --answers` plumbing
**Reference docs:** `.planning/milestones/v0.5.0/research/SUMMARY.md` §4, `ARCHITECTURE.md` §2, `PITFALLS.md` R1/R3/R4/R5/R7/R8/R9, `.planning/REQUIREMENTS.md` REQ-194..198, REQ-209 (R1/R3 owned by this phase)

## Evaluation Overview

Phase 101 is pure plumbing: new types, a standalone module, config parsing, gate-safety
refactoring, and dormant resume wiring. Nothing emits a checkpoint yet (locked hybrid-churn
strategy — emission call sites land in Phase 102). There is therefore no runtime research
metric to measure (no PSNR/accuracy/BLEU analog exists for this kind of work) — this phase's
entire evaluable surface is **structural correctness and non-regression**: does it compile,
do the new unit suites pass, and — most importantly — is behavior under default config
provably unchanged for every existing caller and every pre-0.5.0 thread.

Because all four plans are `verification_level: sanity`, this EVAL.md treats Tier 1 (sanity)
as the primary gate, and elevates two structural test properties — the caller-audit and the
bit-identical fixture round-trip — to Tier 2 (proxy) status, since they are the closest thing
this phase has to a "does it actually work" signal: they are deterministic, machine-checked
proxies for the REQ-209 milestone proof obligations R1 (no unattended path pauses) and R3
(pre-0.5.0 back-compat), which cannot be fully closed until Phase 105's cross-cutting suite.

### Metric Sources

| Metric | Source | Why This Metric |
|--------|--------|----------------|
| `tsc --noEmit` clean | Repo convention (`npm run build:check`) | Type-family additions (Checkpoint, InteractiveConfig, optional ResearchThread fields) must not break existing compilation |
| `npm run lint` clean | Repo convention | New module (`checkpoints.ts`) and edited files (`gates.ts`, `bench.ts`, `config.ts`, `orchestrator.ts`, `cli.ts`, `grd-tools.ts`) follow repo style |
| Per-file jest coverage threshold (`checkpoints.ts`: lines 90/functions 100/branches 80, per 101-02 PLAN) | `jest.config.js` | REQ-195 mandates the new module "own its threshold from day one"; PITFALLS R9 |
| 5-site caller-audit (`portfolio.ts`, `bench.ts`, `cli.ts`, `cli-kb.ts`, `index.ts`) | 101-04 PLAN Task 3, PITFALLS R1, REQ-197/REQ-209(R1) | Deterministic proxy for "no unattended path can pause interactively" — the phase's single most safety-critical property |
| 0.4.16 fixture bit-identical round-trip (types.ts + orchestrator.ts resume) | 101-01 PLAN Task 3, 101-04 PLAN Task 3, PITFALLS R3, REQ-198, REQ-209(R3) | Deterministic proxy for "zero behavior change for pre-0.5.0 threads" |
| Full existing suite green, zero pre-existing-test modifications | Phase exit criterion ("ZERO behavior change under default config") | The strongest available "nothing broke" signal absent a runtime metric |

### Verification Level Summary

| Level | Count | Purpose |
|-------|-------|---------|
| Sanity (L1) | 6 | Build, lint, and the 4 new/modified unit suites run and pass |
| Proxy (L2) | 4 | Coverage threshold, caller-audit, fixture round-trip, full-suite-green-with-no-modified-expectations |
| Deferred (L3) | 3 | Live interactive pause/resume E2E (Phase 102), panel fallback (Phase 105), full R1/R3/R4/R5 milestone suite (Phase 105, REQ-209) |

## Level 1: Sanity Checks

**Purpose:** Verify basic functionality and non-regression. These MUST ALL PASS before proceeding.

**Test-hygiene gotcha (CLAUDE.md):** some test helpers `fs.mkdtempSync('grd-…')` with a
*relative* prefix and litter the repo root. Always set `TMPDIR` outside the repo when running
these suites:
```bash
export TMPDIR=$(mktemp -d)
```

### S1: TypeScript compiles clean
- **What:** New Checkpoint/InteractiveConfig types and edited files type-check with zero errors.
- **Command:** `npm run build:check`
- **Expected:** Exit 0, no errors (specifically none referencing `pendingGate` or `ThreadStatus` widening — 101-01 explicitly forbids touching these).
- **Failure means:** A type is malformed, or an edit accidentally widened a closed union (breaks TERMINAL mirrors in `portfolio.ts:74`/`paper.ts:15` per PITFALLS R3.2/R3.3).

### S2: Lint clean
- **What:** New/edited files (`lib/research/checkpoints.ts`, `lib/research/gates.ts`, `lib/research/bench.ts`, `lib/commands/config.ts`, `lib/research/orchestrator.ts`, `lib/research/cli.ts`, `bin/grd-tools.ts`) match repo style.
- **Command:** `npm run lint`
- **Expected:** Exit 0, zero errors/warnings.
- **Failure means:** Style violation (e.g. stray `any`, missing `'use strict'`, untyped require).

### S3: types/thread fixture unit suite
- **What:** Checkpoint type-shape assertions + 0.4.16 fixture back-compat.
- **Command:** `TMPDIR=$(mktemp -d) npx jest tests/unit/research/types.test.ts tests/unit/research/thread.test.ts`
- **Expected:** All tests pass, including the byte-identical fixture round-trip assertion.
- **Failure means:** New optional fields perturbed serialization, or `renderThreadLog`'s guarded line is not actually guarded.

### S4: checkpoints.ts unit suite
- **What:** emit-validation, jsonl IO, `consumeAnswered` one-shot, `readInteractiveConfig` clamp/default matrix, `resolveInteractive` auto-skip matrix.
- **Command:** `TMPDIR=$(mktemp -d) npx jest tests/unit/research/checkpoints.test.ts --coverage --collectCoverageFrom='lib/research/checkpoints.ts'`
- **Expected:** All tests pass; coverage report generated without threshold failure (see P1 below for the numeric gate).
- **Failure means:** Core plumbing module (REQ-195) is broken or under-tested.

### S5: gates/bench/config unit suite
- **What:** `resolveGates` single-source all-off refactor, `BENCH_WORKDIR_CONFIG` interactive pin, settings save/restore preservation of unknown `research_gates` keys.
- **Command:** `TMPDIR=$(mktemp -d) npx jest tests/unit/research/gates.test.ts tests/unit/research/bench.test.ts tests/unit/commands/config.test.ts`
- **Expected:** All tests pass; existing `gates.ts` (90/100/80) and `bench.ts` (95/100/85) thresholds still met.
- **Failure means:** R1/R7 safety-layer regression (REQ-197).

### S6: orchestrator/cli unit suite
- **What:** resume-with-answers branch, bare-resume defaults, caller-audit, 0.4.16 bit-identical resume.
- **Command:** `TMPDIR=$(mktemp -d) npx jest tests/unit/research/orchestrator.test.ts tests/unit/research/cli.test.ts`
- **Expected:** All tests pass; existing orchestrator/portfolio/bench thresholds held.
- **Failure means:** REQ-198 resume plumbing broken, or a new/removed call site desynced the caller-audit.

**Sanity gate:** ALL six checks must pass. Any failure blocks progression to Phase 102.

## Level 2: Proxy Metrics

**Purpose:** Indirect but deterministic evaluation of the phase's two safety-critical structural
properties (R1, R3) plus general non-regression, standing in for the runtime metric this phase
does not have. **IMPORTANT:** these are proxies for the REQ-209 milestone proof obligations, not
the obligations themselves — Phase 105 closes them end-to-end across all sub-phases.

### P1: `checkpoints.ts` per-file coverage threshold met
- **What:** Line/function/branch coverage of the new module meets its own jest threshold.
- **How:** Coverage report from S4, checked against the `jest.config.js` entry added in 101-02.
- **Command:** `TMPDIR=$(mktemp -d) npx jest tests/unit/research/checkpoints.test.ts --coverage --collectCoverageFrom='lib/research/checkpoints.ts'`
- **Target:** `lines: 90, functions: 100, branches: 80` (values from 101-02 PLAN Task 2; exact numbers may be adjusted downward only if the PLAN's own committed values differ, never below what the plan states, and no *pre-existing* threshold may be lowered).
- **Evidence:** REQ-195 / PITFALLS R9 ("Test strategy and coverage thresholds") — mandates the module carry its own threshold from day one, keeping decision logic in TS (testable) rather than skill markdown (untestable).
- **Correlation with full metric:** MEDIUM — high coverage of a well-specified pure-function module (emit/resolve/consumeAnswered/readInteractiveConfig/resolveInteractive) is a reasonable proxy for "the plumbing is exercised," but coverage percentage alone doesn't prove the DI seams are wired correctly into the (not-yet-existing) call site.
- **Blind spots:** Coverage says nothing about integration behavior once Phase 102 adds the first emission site.
- **Validated:** false — awaiting Phase 102 emission-site integration.

### P2: 5-site caller-audit passes
- **What:** A grep-style discovery test enumerates every `runResearch`/`resumeResearch` call site in `lib/research/*.ts` and asserts the set equals exactly `{portfolio.ts, bench.ts, cli.ts, cli-kb.ts, index.ts}`; for each unattended path, `resolveInteractive` reports inactive under noGates/autonomous/autopilot/concurrency>1 even with `research_gates.interactive.enabled:true` forced in config.
- **How:** `tests/unit/research/orchestrator.test.ts` Task 3 test (101-04 PLAN).
- **Command:** `TMPDIR=$(mktemp -d) npx jest tests/unit/research/orchestrator.test.ts -t "caller-audit"`
- **Target:** Discovered set == exactly the 5 named files (a 6th caller fails until it declares an interactive posture); all 5 unattended-path branches report `{active:false}`.
- **Evidence:** PITFALLS.md R1 (CRITICAL) — "New default-on gates silently block bench/portfolio/harness/autopilot"; REQ-197 explicitly requires this test; REQ-209 lists R1 as a milestone proof obligation this phase owns.
- **Correlation with full metric:** HIGH for the specific claim "no currently-known unattended call site can be made to pause" — it is a deterministic, exhaustive enumeration over the actual source tree, not a sample.
- **Blind spots:** Only proves the property for call sites that exist TODAY. A future caller added without running this test again would not be caught until CI re-runs it (mitigated by the test failing loudly on a 6th site). Does not prove behavior once Phase 102 wires a live emission point — this test uses `resolveInteractive` directly, not a full runLoop pass.
- **Validated:** false — this is the deterministic core of R1; the full milestone-level closure is Phase 105 (REQ-209).

### P3: 0.4.16 fixture bit-identical round-trip (types + resume)
- **What:** Two frozen pre-0.5.0 `thread.json` fixtures (`paused-execute-0416`, `terminal-supported-0416`) (a) parse and re-serialize byte-identically via `loadThread`/`JSON.stringify`, and (b) flow through `resumeResearch` hitting the EXISTING `pendingGate` path / TERMINAL short-circuit — never the new checkpoint branch — with no `checkpoints.jsonl` ever written.
- **How:** `tests/unit/research/types.test.ts`/`thread.test.ts` (101-01) + `tests/unit/research/orchestrator.test.ts` (101-04).
- **Command:** `TMPDIR=$(mktemp -d) npx jest tests/unit/research/types.test.ts tests/unit/research/thread.test.ts tests/unit/research/orchestrator.test.ts -t "0416"`
- **Target:** Byte-identical serialization; resume test asserts the checkpoint branch is never entered and `checkpoints.jsonl` is never created for either fixture.
- **Evidence:** PITFALLS.md R3 (HIGH) — "Thread-state schema back-compat"; REQ-194/REQ-198 explicitly require this fixture test; REQ-209 lists R3 as a milestone proof obligation this phase owns.
- **Correlation with full metric:** HIGH — this is a direct, literal test of the "zero behavior change under default config" exit criterion for the one artifact type (thread.json) that must never change shape for old data.
- **Blind spots:** Only 2 fixtures (one paused-at-execute, one terminal) — does not cover every possible pre-0.5.0 thread shape (e.g. a paused-at-kg_write thread, or one with `seededFrom`/`resurveyCount` set). If the fallback hand-authored path was used instead of a real 0.4.16-generated thread (101-01 Task 3 fallback clause), the proxy is weaker — check 101-01-SUMMARY.md for which path was taken.
- **Validated:** false — full milestone closure (all thread shapes, live resume) is Phase 105 (REQ-209).

### P4: Full existing suite green, zero modified pre-existing expectations
- **What:** The complete pre-existing jest suite (not just the new/edited files) still passes, and a diff review confirms no pre-existing test's *expected value* was changed to make it pass (only new tests/new threshold entries added).
- **How:** Run full suite; diff `git diff --stat` against test files to confirm only additive changes (new test files, new `it()` blocks, new jest.config.js threshold entries) — no existing `expect(...)` value edited.
- **Command:** `TMPDIR=$(mktemp -d) npm test`
- **Target:** 100% of pre-existing tests still pass; `git diff` on any pre-existing test file shows only additions, never a changed assertion.
- **Evidence:** Phase goal statement: "ZERO behavior change under default config."
- **Correlation with full metric:** HIGH as a non-regression signal, but it is NOT a positive proof the new feature works — only that nothing old broke.
- **Blind spots:** A test could be trivially green while still exercising nothing new; this proxy must be read alongside S3-S6 and P1-P3, not alone.
- **Validated:** false — non-regression is necessary but not sufficient; positive correctness comes from P1-P3.

## Level 3: Deferred Validations

**Purpose:** Full evaluation requiring integration or resources not available this phase.

### D1: Live interactive pause/resume end-to-end — DEFER-101-01
- **What:** An actual `gd research "<q>"` run that emits a checkpoint, pauses, and is resumed via `gd research resume <id> --answers <file>` through the skill layer (AskUserQuestion protocol).
- **How:** Full CLI invocation against a live/sandboxed backend, asserting the pause actually surfaces the checkpoint JSON and resume actually continues the loop.
- **Why deferred:** Phase 101 wires the plumbing but adds ZERO emission call sites (locked hybrid-churn strategy) — there is no code path in this phase that can produce a live pause. `checkpointHandler`/`resumeResearch` branch are only exercised via dependency injection and hand-constructed threads.
- **Validates at:** phase-102-design-approval-checkpoint (first emission site, at the existing GATE-1/execute gate per REQ-199)
- **Depends on:** Phase 102's emission wiring into `runLoop`/the execute-gate site.
- **Target:** A hand-run research thread pauses exactly once at DESIGN, skill-layer AskUserQuestion round-trips correctly, resume continues the loop with recorded answers.
- **Risk if unmet:** If the dormant `resumedCheckpoint` plumbing built in 101-04 doesn't actually thread through correctly once Phase 102 wires a real emission point, Phase 102 may need to revisit `orchestrator.ts`'s resume branch — budget contingency in Phase 102 planning.

### D2: AI-panel fallback (`answerViaDiscussion`) — DEFER-101-02
- **What:** `fallback:"panel"` path where `resolveElicitation`/`buildElicitationContext` answer a checkpoint without pausing (REQ-207/REQ-208).
- **How:** Inject a panel backend, verify `detectFromStdout` correctly treats a rate-limited panelist as unavailable (never as an answer), and that the final Checkpoint record has `answeredBy:'panel'` + `discussionFile` set.
- **Why deferred:** `answerViaDiscussion` doesn't exist until Phase 105; this phase only builds the `checkpointHandler` DI seam it will plug into.
- **Validates at:** phase-105-panel-wiring-telemetry-docs
- **Depends on:** REQ-207 (`answerViaDiscussion` implementation) + REQ-208 (wiring/telemetry).
- **Target:** Panel-answered checkpoints produce the same Checkpoint record shape as human-answered ones; rate-limited panelist never silently counted as an answer.
- **Risk if unmet:** Low direct risk to Phase 101 (this phase doesn't touch the panel path at all); risk is scoped entirely to Phase 105.

### D3: Full R1/R3/R4/R5 milestone verification suite — DEFER-101-03
- **What:** REQ-209's end-to-end proof obligations: R1 (no unattended path pauses across bench/portfolio/harness/autopilot/cli-kb — this phase only proves it via the caller-audit + `resolveInteractive` unit calls, not a live run of each caller), R3 (pre-0.5.0 back-compat — this phase only covers 2 fixture shapes), R4 (DESIGN answers survive debug-loop contract pinning — no debug loop exists to test against yet), R5 (no double-asking on debug re-plan/resume — same).
- **How:** Cross-cutting integration suite spanning Phases 102-104's emission sites, run against all 5 caller entry points live (not just `resolveInteractive` in isolation).
- **Why deferred:** R4/R5 require the DESIGN checkpoint (Phase 102) and debug-loop re-plan pinning behavior to exist; a true "run bench/portfolio/harness/autopilot end-to-end with interactive forced on and confirm zero pauses" requires those callers' actual research runs, not unit-level DI stubs.
- **Validates at:** phase-105-panel-wiring-telemetry-docs (REQ-209 is explicitly a Phase 105 requirement)
- **Depends on:** Phases 102, 103, 104 emission sites; the debug-loop contract-pinning mechanism.
- **Target:** All four proof obligations (R1/R3/R4/R5) pass as live/integration tests, not just unit-level proxies.
- **Risk if unmet:** HIGH if R1 fails at integration — would mean an unattended caller CAN pause despite the Phase 101 caller-audit passing (e.g. a caller path not covered by the grep-style discovery, or a config combination the audit didn't test). Fallback: revert the offending caller's exposure to `research_gates.interactive` and re-pin it off in that caller's config, per the R1 mitigation pattern already used in `BENCH_WORKDIR_CONFIG`.

## Ablation Plan

**No ablation plan.** This phase adds independent plumbing components (types, a standalone
module, config parsing, a gate-safety refactor, dormant resume wiring) with no shared runtime
behavior to isolate — there is nothing running yet whose components could be selectively
disabled to measure contribution. Ablation becomes meaningful once Phase 102 wires a live
emission path (e.g., "what's the UX/loop-time cost of the DESIGN checkpoint vs. skipping it").

## WebMCP Tool Definitions

WebMCP tool definitions skipped — phase does not modify frontend views (all changes are in
`lib/research/`, `lib/commands/`, `bin/grd-tools.ts`, and test files; no HTML/JSX/TSX/Vue/Svelte
or frontend route files are in any of the four plans' `files_modified`).

## Baselines

| Baseline | Description | Expected Score | Source |
|----------|-------------|----------------|--------|
| Pre-0.5.0 `thread.json` serialization | Byte-for-byte JSON shape produced by 0.4.16's `saveThread` | Identical after Phase 101 changes | `tests/fixtures/research-threads/{paused-execute-0416,terminal-supported-0416}/thread.json` (101-01) |
| `gates.ts` coverage threshold | Existing per-file threshold | 90/100/80, unchanged | `jest.config.js` (pre-existing) |
| `bench.ts` coverage threshold | Existing per-file threshold | 95/100/85, unchanged | `jest.config.js` (pre-existing) |
| Existing 5-caller unattended completion | bench/portfolio/harness/autopilot/cli-kb all complete without pausing today | Same after Phase 101 (interactive is additive and default-OFF) | Current `lib/research/{portfolio,bench,cli,cli-kb,index}.ts` behavior |

## Evaluation Scripts

**Location of evaluation code:**
```
tests/unit/research/types.test.ts
tests/unit/research/thread.test.ts
tests/unit/research/checkpoints.test.ts
tests/unit/research/gates.test.ts
tests/unit/research/bench.test.ts
tests/unit/commands/config.test.ts
tests/unit/research/orchestrator.test.ts
tests/unit/research/cli.test.ts
tests/fixtures/research-threads/paused-execute-0416/thread.json
tests/fixtures/research-threads/terminal-supported-0416/thread.json
```

**How to run full evaluation:**
```bash
export TMPDIR=$(mktemp -d)
npm run build:check && \
npm run lint && \
npx jest tests/unit/research/types.test.ts tests/unit/research/thread.test.ts \
  tests/unit/research/checkpoints.test.ts tests/unit/research/gates.test.ts \
  tests/unit/research/bench.test.ts tests/unit/commands/config.test.ts \
  tests/unit/research/orchestrator.test.ts tests/unit/research/cli.test.ts \
  --coverage --collectCoverageFrom='lib/research/checkpoints.ts' && \
npm test
```

## Results Template

*To be filled by grd-eval-reporter after phase execution.*

### Sanity Results

| Check | Status | Output | Notes |
|-------|--------|--------|-------|
| S1 build:check | | | |
| S2 lint | | | |
| S3 types/thread suite | | | |
| S4 checkpoints.ts suite | | | |
| S5 gates/bench/config suite | | | |
| S6 orchestrator/cli suite | | | |

### Proxy Results

| Metric | Target | Actual | Status | Notes |
|--------|--------|--------|--------|-------|
| P1 checkpoints.ts coverage | lines 90/fn 100/branch 80 | | | |
| P2 5-site caller-audit | exactly 5 sites, all inactive | | | |
| P3 0.4.16 fixture round-trip | byte-identical, no checkpoint branch hit | | | |
| P4 full suite green | 100% pre-existing pass, additive-only diff | | | |

### Ablation Results

Not applicable — no ablation plan this phase.

### Deferred Status

| ID | Metric | Status | Validates At |
|----|--------|--------|-------------|
| DEFER-101-01 | Live interactive pause/resume E2E | PENDING | phase-102-design-approval-checkpoint |
| DEFER-101-02 | AI-panel fallback | PENDING | phase-105-panel-wiring-telemetry-docs |
| DEFER-101-03 | Full R1/R3/R4/R5 milestone suite (REQ-209) | PENDING | phase-105-panel-wiring-telemetry-docs |

## Evaluation Confidence

**Overall confidence in evaluation design:** HIGH for what this phase can prove (structural
correctness, non-regression, and the two safety-critical deterministic proxies); appropriately
LOW/DEFERRED for anything requiring a live emission path.

**Justification:**
- Sanity checks: adequate — cover build, lint, and every unit suite touched by all 4 plans, with the repo's known test-hygiene gotcha (TMPDIR) called out explicitly.
- Proxy metrics: well-evidenced — each of the 4 proxies traces directly to a named PITFALLS.md risk (R1, R3) or an explicit REQ (REQ-195/197/198/209) and a specific PLAN task, not invented from scratch. All are honestly marked `validated: false`.
- Deferred coverage: comprehensive for what's known to be out of scope — 3 deferred items map 1:1 onto the phase's explicit non-goals (no emission sites, no panel implementation, no live cross-caller integration), each with a named target phase and risk assessment.

**What this evaluation CAN tell us:**
- The new type family and module compile cleanly and don't perturb existing behavior.
- No CURRENTLY KNOWN unattended call site can be made to pause interactively (deterministic, exhaustive over today's source tree).
- Pre-0.5.0 threads (of the 2 fixture shapes captured) resume and serialize identically to today.
- The new module and edited files meet their coverage/lint bars without weakening any existing bar.

**What this evaluation CANNOT tell us:**
- Whether a live checkpoint pause/resume actually works end-to-end through the skill layer — deferred to Phase 102 (DEFER-101-01).
- Whether the AI-panel fallback correctly answers without pausing — deferred to Phase 105 (DEFER-101-02).
- Whether R4 (debug-loop contract pinning) or R5 (no double-asking on re-plan) hold, since no debug loop or re-plan path touches checkpoints yet — deferred to Phase 105 (DEFER-101-03).
- Whether the caller-audit's "exactly 5 sites" assumption remains true after Phases 102-104 add code — must be re-verified each phase, not just here.

---

*Evaluation plan by: Claude (grd-eval-planner)*
*Design date: 2026-07-12*
