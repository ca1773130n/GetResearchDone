# Evaluation Plan: Phase 105 — AI-Panel Fallback + Hardening

**Designed:** 2026-07-19
**Designer:** Claude (grd-eval-planner)
**Method(s) evaluated:** N/A (no external paper) — this is GRD's Integration Phase for the
v0.5.0 checkpoint milestone: an `answerViaDiscussion` panel resolver (REQ-207), end-to-end
`fallback:"panel"` wiring + telemetry + docs (REQ-208), and an offline milestone verification
suite proving R1/R3/R4/R5 (REQ-209).
**Reference papers:** None. Design basis: `.planning/milestones/v0.5.0/research/FEATURES.md`
§F6 (panel fallback), the Phase 101-104 checkpoint emit/consume precedent, and
`104-EVAL.md` (same milestone, same conventions — this plan follows its structure).

## Evaluation Overview

Like Phase 104, this phase has no paper to reproduce and no product-quality benchmark
corpus — it is a codebase-internal capability built via GRD's standard offline/deterministic
TDD convention (injected `resolveElicitation`/`detectFromStdout`/`spawn`/`checkpointHandler`
— no live backend on the control path). Unlike 104, this phase is explicitly the milestone's
**Integration Phase**: 105-03 is itself a Level-2 proxy suite whose entire purpose is to prove
the SEAMS between Phases 101-104 hold (R1 no unattended pause, R3 pre-0.5.0 back-compat, R4
DESIGN answers survive debug-loop pinning, R5 no double-asking), and 105-04 is a human-verify,
non-autonomous plan (`autonomous: false`) that collects every deferred live validation the
milestone owns (DEFER-101-02/03, DEFER-102-01, DEFER-104-01/02) plus this phase's own new
deferred item (live panel-backend quality).

"Correctness" here means: (1) code compiles and lints cleanly, (2) new deterministic offline
unit tests exercise every must-have behavior in 105-01/02/03 and pass, (3) the
`fallback:"recommended"` default path remains byte-identical to pre-105 behavior (regression
protection), and (4) the four cross-phase proof obligations (R1/R3/R4/R5) are asserted in one
offline suite. Live panel-backend quality and human-facing UX (the actual judgment of whether
a panel-synthesized answer is *good*, and whether the disposition of every outstanding DEFER
item is sound) are explicitly deferred to 105-04's human-verify checkpoint — no offline proxy
can substitute for a human reading real panel output or resolving the milestone's deferred
table.

### Metric Sources

| Metric | Source | Why This Metric |
|--------|--------|----------------|
| tsc --noEmit / eslint clean | `npm run build:check`, `npm run lint` | Baseline sanity gate used by every GRD phase |
| Per-file jest coverage threshold | `jest.config.js` (existing threshold for `lib/research/checkpoints.ts`, `orchestrator.ts`) | 105-01/02/03 all require it "not lowered" |
| New unit test cases (checkpoints, orchestrator, milestone-verification) | 105-01/02/03-PLAN.md `eval_metrics` + `<verify>` blocks | Directly encodes each must-have truth as a deterministic offline assertion |
| Byte-identical `fallback:"recommended"` regression | 105-02-PLAN.md `eval_metrics.secondary` | Regression guard — today's autonomous path must not drift (R5-adjacent) |
| R1/R3/R4/R5 proof obligations | 105-03-PLAN.md `must_haves.truths`; REQ-209 | The Integration Phase's core deliverable — proves cross-phase seams, not just this phase's own code |
| Docs mention `interactive.fallback` | 105-02-PLAN.md Task 3 `<verify>` (grep) | Directly encodes REQ-208 SC3 |
| Live sandbox disposition table | 105-04-PLAN.md `must_haves.artifacts` | Collects every milestone-level DEFER item into one auditable record |

### Verification Level Summary

| Level | Count | Purpose |
|-------|-------|---------|
| Sanity (L1) | 5 | tsc, lint, docs grep, repo-cleanliness check, jest.config threshold diff |
| Proxy (L2) | 8 | Deterministic offline jest suites covering the panel resolver, orchestrator wiring, telemetry, and the R1/R3/R4/R5 milestone proof |
| Deferred (L3) | 3 | Live panel-backend quality, live N-candidate/selection UX carried over from 104, and the full DEFER disposition table (105-04 human-verify checkpoint) |

## Level 1: Sanity Checks

**Purpose:** Verify basic functionality. These MUST ALL PASS before proceeding.

### S1: TypeScript strict compile
- **What:** No new type errors introduced by `checkpoints.ts`, `orchestrator.ts`,
  `portfolio.ts`, or `milestone-verification.test.ts` changes
- **Command:** `npm run build:check`
- **Expected:** Exit 0, zero errors
- **Failure means:** New symbols (`answerViaDiscussion`, `resolveCheckpointInline`) violate
  `strict` mode or the zero-`any` rule

### S2: ESLint clean
- **What:** No new lint violations in modified files
- **Command:** `npm run lint`
- **Expected:** Exit 0, zero errors/warnings on `bin/` and `lib/` scope
- **Failure means:** Style/typed-require convention broken (e.g. missing `'use strict'`,
  untyped require of `lib/discussion.ts` or `lib/scheduler.ts`)

### S3: Docs mention `interactive.fallback` (REQ-208 SC3)
- **What:** CLAUDE.md, `commands/settings.md`, and `docs/autoresearch-tutorial.md` all
  document the panel fallback config surface
- **Command:** `grep -n "fallback" CLAUDE.md commands/settings.md docs/autoresearch-tutorial.md && grep -n "Interactive steering" docs/autoresearch-tutorial.md`
- **Expected:** Non-empty hits in all three files; "Interactive steering" section present in
  the tutorial
- **Failure means:** REQ-208's documentation obligation is unmet

### S4: No jest.config.js coverage threshold lowered
- **What:** The milestone's per-file coverage thresholds (`lib/research/checkpoints.ts`,
  `lib/research/orchestrator.ts`) are unchanged or raised, never lowered, across 105-01/02/03
- **Command:** `git diff jest.config.js` (inspect manually) — or, per 105-03 Task 2, an
  assertion/snapshot check inside `milestone-verification.test.ts`
- **Expected:** No `-` lines reducing a numeric threshold
- **Failure means:** A phase quietly weakened the project's quality gate to make tests pass

### S5: Sandbox cleanliness after 105-04 live run
- **What:** The GRD repo working tree is never polluted by the 105-04 live sandbox run
- **Command:** `git -C <repo> status --porcelain`
- **Expected:** No output — no new `.planning/research/threads/`, no root `KNOWHOW.md`, no
  `.planning/DEAD-ENDS.md` mutation
- **Failure means:** 105-04 ran `gd research` inside the repo instead of a throwaway
  `mktemp -d` sandbox (CLAUDE.md Gotchas violation)

**Sanity gate:** ALL sanity checks must pass. Any failure blocks progression.

## Level 2: Proxy Metrics

**Purpose:** Indirect evaluation of quality/correctness via deterministic offline unit tests
(injected `resolveElicitation`/`detectFromStdout`/spawn/`checkpointHandler` — no live LLM
backend). These are the primary verification mechanism for 105-01 (sanity-tagged but
test-driven), 105-02, and 105-03 (both tagged `verification_level: proxy`).
**IMPORTANT:** Proxy metrics are NOT validated substitutes for full evaluation. Treat results
with appropriate skepticism — offline injected fixtures prove the resolver/wiring/orchestration
logic is correct, but cannot prove a real LLM panel produces a *good* synthesized answer, or
that a live `fallback:"panel"` run behaves identically against a real, possibly rate-limited,
backend.

### P1: answerViaDiscussion core resolution + participant exclusion
- **What:** `answerViaDiscussion(cwd, checkpoint, cfg, deps?)` returns one `CheckpointAnswer`
  per question, `answeredBy:'panel'` on a real match, and never throws; the loop's own spawn
  backend is excluded from the panel participant list
- **How:** Injected `resolveElicitation` stub returns a fixed option label; assert the mapped
  answer and that `loopBackend` (e.g. `'claude'`) is absent from the participants array passed
  to the stub
- **Command:** `TMPDIR=$(mktemp -d) npx jest tests/unit/research/checkpoints.test.ts -t "answerViaDiscussion"`
- **Target:** All `answerViaDiscussion` describe-block cases pass
- **Evidence:** 105-01-PLAN.md Task 1 `<action>`/`<verify>`; REQ-207
- **Correlation with full metric:** HIGH — the resolver contract is deterministic given an
  injected panel response, so offline coverage is not an approximation of the mapping logic
- **Blind spots:** Does not prove a real panel discussion produces a coherent, useful answer
  text (deferred, see D1)
- **Validated:** No — awaiting deferred validation (live panel spawn) at 105-04

### P2: Option matching order + rate-limit guard + empty-panel default
- **What:** Exact → prefix → recommended-default matching order holds; a rate-limited
  panelist (via `detectFromStdout`) or empty synthesis (`resolveElicitation` returns `''`)
  resolves ALL questions to `answeredBy:'default'`, never `'panel'`
- **How:** Table-driven jest cases: exact match, prefix match, no-match, empty-synthesis,
  rate-limited-detector
- **Command:** `TMPDIR=$(mktemp -d) npx jest tests/unit/research/checkpoints.test.ts`
- **Target:** All matching-order and guard cases pass; coverage threshold on
  `lib/research/checkpoints.ts` holds
- **Evidence:** 105-01-PLAN.md Task 2 `<action>`/`<verify>`; REQ-207 "rate-limited panelist
  reads as unavailable, never as an answer"
- **Correlation with full metric:** HIGH — a rate-limited/empty panel is exactly the failure
  mode this guard exists to catch, and it's simulated via the same `detectFromStdout` contract
  the live scheduler uses
- **Blind spots:** Does not prove real-world rate-limit detection timing/latency under load
- **Validated:** No

### P3: Panel-fallback inline resolution at all 4 emit sites, no pause
- **What:** With posture inactive AND `cfg.fallback==='panel'`, each of the 4 checkpoint emit
  sites (seed/design/hypothesize/decide) resolves inline via `answerViaDiscussion` and thread
  status is NEVER `'paused'`
- **How:** Injected spawn + stubbed `answerViaDiscussion` drives a DESIGN and a SEED
  checkpoint under autonomous posture; assert `result.status !== 'paused'` and the stub was
  called with the derived `loopBackend`
- **Command:** `TMPDIR=$(mktemp -d) npx jest tests/unit/research/orchestrator.test.ts -t "panel"`
- **Target:** All panel-fallback cases pass across all 4 sites
- **Evidence:** 105-02-PLAN.md Task 1 `<action>`/`<verify>`; REQ-208 SC2
- **Correlation with full metric:** HIGH — thread status and DI call assertions inspect the
  exact same code path the live loop runs
- **Blind spots:** Does not prove the panel-answered value is semantically sound for a real
  hypothesis/design decision (deferred, see D1)
- **Validated:** No

### P4: `fallback:"recommended"` byte-identical regression
- **What:** The default (non-panel) autonomous path is byte-identical to pre-105 behavior — no
  panel spawn, recommended defaults used, `answerViaDiscussion` never called
- **How:** Same 4-site fixture set run with `cfg.fallback==='recommended'`; assert the stub is
  NOT called and the result matches the pre-existing baseline fixture
- **Command:** `TMPDIR=$(mktemp -d) npx jest tests/unit/research/orchestrator.test.ts`
- **Target:** 100% byte-identical match; zero calls to the panel stub
- **Evidence:** 105-02-PLAN.md `hypothesis`/`eval_metrics.secondary`: "byte-identical
  recommended-path regression"
- **Correlation with full metric:** HIGH — direct regression test, same technique used for
  SC1-style pins across all GRD phases (mirrors 104-EVAL.md P2)
- **Blind spots:** None within offline scope — closed, deterministic assertion
- **Validated:** No

### P5: Portfolio forced non-human routing + telemetry counters
- **What:** Concurrent portfolio threads never pause (route through fallback); panel counters
  (`research.checkpoint_panel_answered_total`, `research.checkpoint_panel_unavailable_total`)
  and the existing `research.checkpoint_pauses_total` record correctly via `incrementCounter`
- **How:** A stubbed panel-answered checkpoint and a stubbed empty/rate-limited checkpoint,
  both run through a concurrent portfolio thread; assert injected `incrementCounter` receives
  the right counter names and the thread never returns `status:'paused'`
- **Command:** `TMPDIR=$(mktemp -d) npx jest tests/unit/research/orchestrator.test.ts -t "counter|portfolio"`
- **Target:** All counter and portfolio cases pass
- **Evidence:** 105-02-PLAN.md Task 2 `<action>`/`<verify>`; REQ-208
- **Correlation with full metric:** HIGH — counter names and portfolio non-pause behavior are
  asserted directly against production code, not simulated
- **Blind spots:** Does not prove counters are correctly scraped/aggregated by a real metrics
  backend in production
- **Validated:** No

### P6: R1 — no unattended path can pause (incl. panel variant)
- **What:** `resolveInteractive(cfg, opts)` returns `{active:false}` for all 5 unattended
  entry points (bench.ts, portfolio.ts, harness path, autopilot/GRD_AUTOPILOT, cli-kb.ts),
  including a `fallback:'panel'` variant
- **How:** Direct assertions against `resolveInteractive` under each caller's opts
  (noGates / concurrency>1 / GRD_AUTOPILOT / nonInteractive)
- **Command:** `TMPDIR=$(mktemp -d) npx jest tests/unit/research/milestone-verification.test.ts -t "R1"`
- **Target:** All 5 sites (x2 fallback variants where applicable) assert `active:false`
- **Evidence:** 105-03-PLAN.md Task 1 `<action>`/`<verify>`; REQ-209; Phase 101 caller-audit
- **Correlation with full metric:** HIGH — `resolveInteractive` is the exact gating function
  every real unattended caller invokes
- **Blind spots:** Does not cover future unattended entry points added after this phase
- **Validated:** No

### P7: R3 — pre-0.5.0 back-compat + R4 — DESIGN answers survive debug pin
- **What:** (R3) A pre-0.5.0 `thread.json` fixture (no checkpoint fields) resumes
  bit-identically; (R4) a human/panel-edited DESIGN metric contract is the COMMITTED pin,
  never overwritten by the model's original, when the debug-loop runs after the edit
- **How:** R3 — `JSON.stringify` round-trip equality on the frozen Phase 101 fixture. R4 —
  injected spawn + `checkpointHandler` drives `runLoop` offline through a
  contract-edit-then-debug-pin sequence; assert the committed metric/comparator/target equals
  the edited contract
- **Command:** `TMPDIR=$(mktemp -d) npx jest tests/unit/research/milestone-verification.test.ts -t "R3|R4"`
- **Target:** R3 byte-identical round-trip; R4 committed pin equals edited contract
- **Evidence:** 105-03-PLAN.md Task 1/2; REQ-209; reuses Phase 101 frozen fixture
  (cross-checked vs git `3c179fe`)
- **Correlation with full metric:** HIGH — R3 is a closed deterministic JSON comparison; R4
  exercises the exact `runLoop` ordering (contract edit before debug pin) production uses
- **Blind spots:** R3 fixture is hand-authored, not a live capture of an actual 0.4.16 thread
  file (acceptable per Phase 101 STATE decision)
- **Validated:** No

### P8: R5 — no double-asking on debug re-plan/resume + coverage guard
- **What:** After a checkpoint is answered (`consumeAnswered` returns once), a debug re-plan
  and a resume do NOT re-emit the same question; the milestone introduces no lowered per-file
  jest coverage threshold
- **How:** Drive `runLoop` through answer → debug re-plan → resume offline; assert the second
  `consumeAnswered` read returns null and no duplicate checkpoint appears in
  `checkpoints.jsonl` for that point/iteration; separately assert/record `jest.config.js`
  threshold diff evidence
- **Command:** `TMPDIR=$(mktemp -d) npx jest tests/unit/research/milestone-verification.test.ts && git diff --stat jest.config.js`
- **Target:** R5 one-shot assertion passes; `git diff --stat jest.config.js` shows no
  reductions (or the SUMMARY documents this explicitly)
- **Evidence:** 105-03-PLAN.md Task 2 `<action>`/`<verify>`; REQ-209
- **Correlation with full metric:** HIGH — `consumeAnswered`'s WeakSet one-shot semantics are
  asserted directly, the same mechanism Phase 102/103 already proved individually
- **Blind spots:** None material within offline scope
- **Validated:** No

## Level 3: Deferred Validations

**Purpose:** Full evaluation requiring a live LLM backend or live human judgment, unavailable
in-phase per GRD's offline/deterministic TDD convention. Collected in 105-04, the milestone's
designated Integration Phase live-validation step (`autonomous: false`, human-verify gate).

### D1: Live panel-backend answer quality — DEFER-105-01
- **What:** A real AI panel (via `resolveElicitation` against live backends), given a
  synthesized checkpoint question, produces a coherent `answeredBy:'panel'` decision without
  pausing, and the answer is reasonable (not just mechanically well-formed)
- **How:** 105-04 Task 1 runs a live `fallback:"panel"` autonomous pass in a throwaway
  `mktemp -d` sandbox; inspects `checkpoints.jsonl` for `answeredBy:'panel'` records and
  confirms the run did not pause. If no live backend is authenticated, this is recorded as
  re-DEFERRED with reason rather than failing the phase
- **Why deferred:** No live-backend spawn is exercised in-phase (TDD convention injects
  `resolveElicitation`); panel answer *quality* cannot be proven by offline fixtures — only
  the mechanical resolution contract (P1-P3) can
- **Validates at:** `105-04-VALIDATION.md` (Task 2 human-verify checkpoint)
- **Depends on:** A configured backend account (`gd accounts sync` / scheduler), network
  access, and 105-01/02 landed
- **Target:** At least one live checkpoint resolves `answeredBy:'panel'` with no pause; if the
  panel degrades to `'default'`, that is an acceptable clean-degrade outcome per the design
  (REQ-207's safety net), not a failure
- **Risk if unmet:** If the live panel consistently fails to produce parseable option matches
  (always degrading to default), the panel-fallback feature is effectively inert in practice.
  Mitigation: tighten the elicitation question/context formatting (out of scope for 105, would
  need a follow-up plan)
- **Fallback:** The recommended-default degrade path (P2/P4) already guarantees the system
  remains safe/functional even if live panel quality is poor

### D2: Carried-over milestone deferred items (DEFER-101-02/03, DEFER-102-01, DEFER-104-01/02)
- **What:** Every deferred live validation the v0.5.0 milestone accumulated across Phases
  101-104 — live AskUserQuestion UX (DEFER-102-01), live N-candidate generation quality
  (DEFER-104-01), live human candidate selection UX (DEFER-104-02), and the Phase 101 panel/R1-R5
  live confirmations (DEFER-101-02/03) — gets a final disposition (RESOLVED or re-DEFERRED)
  in this Integration Phase
- **How:** 105-04-VALIDATION.md's disposition table, populated during the same live sandbox
  session as D1 where practical (e.g. DEFER-104-01/02 candidate generation + selection reuse
  the same sandbox run)
- **Why deferred:** These were explicitly deferred by their originating phases (see
  `104-EVAL.md` D1/D2) pending exactly this kind of end-to-end live/human pass; this phase does
  not re-derive them, it collects and dispositions them
- **Validates at:** `105-04-VALIDATION.md` (Task 2 human-verify checkpoint)
- **Depends on:** D1's sandbox setup; a human reviewer willing to judge candidate distinctness,
  prompt coherence, and panel behavior qualitatively
- **Target:** Every listed DEFER ID has an explicit RESOLVED or re-DEFERRED disposition with a
  one-line rationale — no item is silently dropped
- **Risk if unmet:** An unresolved deferred item at milestone close means the milestone ships
  with an unverified user-facing behavior; re-deferring with rationale is an acceptable outcome,
  silently dropping it is not
- **Fallback:** None needed structurally — this is a bookkeeping/audit obligation on top of
  already-correct mechanisms (P1-P8 guarantee mechanical correctness regardless of disposition)

### D3: Sandbox isolation discipline
- **What:** The live sandbox run in 105-04 never pollutes the GRD repo working tree
- **How:** `git -C <repo> status --porcelain` check before/after the sandbox session (also
  listed as S5, Sanity — included here too since it gates whether D1/D2 can be trusted as a
  clean run)
- **Why deferred:** Requires actually executing the live run to check
- **Validates at:** `105-04-VALIDATION.md` Task 1 `<verify>`
- **Depends on:** Running from `$(mktemp -d)` with its own `.planning/`, never the repo root
- **Target:** Zero porcelain diff in the GRD repo after the sandbox session
- **Risk if unmet:** A polluted repo (stray `.planning/research/threads/`, root `KNOWHOW.md`,
  mutated `DEAD-ENDS.md`) corrupts the actual project's planning state — this is a hard repo
  hygiene gate, not merely a quality signal
- **Fallback:** None — a violation here must be manually cleaned up and the run redone; it is
  not an acceptable phase outcome under any disposition

## Ablation Plan

**No ablation plan** — this phase adds one cohesive capability (panel resolver + wiring +
milestone proof suite + live collection) across four sequential, dependent plans (105-01 →
105-02 → 105-03 → 105-04), not alternative conditions to compare. The closest analog —
comparing `fallback:'panel'` vs `fallback:'recommended'` behavior — is already covered as a
regression pin (P4), not an ablation.

## WebMCP Tool Definitions

WebMCP tool definitions skipped — this phase modifies `lib/research/checkpoints.ts`,
`lib/research/orchestrator.ts`, `lib/research/portfolio.ts`, `CLAUDE.md`,
`commands/settings.md`, and `docs/autoresearch-tutorial.md` only (no HTML/JSX/TSX/Vue/Svelte/
CSS files, no frontend page/view/component paths). Not a frontend phase.

## Baselines

| Baseline | Description | Expected Score | Source |
|----------|--------------|----------------|--------|
| Existing test suite | ~5000 jest tests across `lib/`/`tests/unit/` | 100% pass (no regressions) | CLAUDE.md "Dev" table |
| Per-file coverage thresholds | `jest.config.js` thresholds for `checkpoints.ts`, `orchestrator.ts` | Hold or rise (never lowered) | 105-01/02/03 `eval_metrics.target` / `must_haves` |
| `npm run lint` | ESLint on `bin/` and `lib/` | Zero errors | CLAUDE.md "Dev" table |
| `npm run build:check` | `tsc --noEmit` | Zero errors | CLAUDE.md "Dev" table |
| Phases 101-104 individual VERIFICATION.md | Each phase's own slice already proven PASS | Behavior parity, no regression | 105-03-PLAN.md `eval_metrics.baseline` |
| Phase 104 live-deferred precedent | DEFER-104-01/02 disposition pattern | Same disposition rigor applied to this milestone's full deferred table | `104-EVAL.md` D1/D2 |

## Evaluation Scripts

**Location of evaluation code:**
```
tests/unit/research/checkpoints.test.ts           (P1, P2)
tests/unit/research/orchestrator.test.ts          (P3, P4, P5)
tests/unit/research/milestone-verification.test.ts (P6, P7, P8)
```

**How to run full evaluation:**
```bash
npm run build:check && npm run lint
grep -n "fallback" CLAUDE.md commands/settings.md docs/autoresearch-tutorial.md
grep -n "Interactive steering" docs/autoresearch-tutorial.md
TMPDIR=$(mktemp -d) npx jest tests/unit/research/checkpoints.test.ts tests/unit/research/orchestrator.test.ts tests/unit/research/milestone-verification.test.ts
TMPDIR=$(mktemp -d) npx jest   # full suite regression check
git diff --stat jest.config.js
# Live sandbox (105-04, NEVER inside the GRD repo):
# SANDBOX=$(mktemp -d) && cd "$SANDBOX" && <init minimal .planning/> && gd research "<q>" ...
```

## Results Template

*To be filled by grd-eval-reporter after phase execution.*

### Sanity Results

| Check | Status | Output | Notes |
|-------|--------|--------|-------|
| S1 build:check | | | |
| S2 lint | | | |
| S3 docs grep (fallback + Interactive steering) | | | |
| S4 jest.config.js threshold diff | | | |
| S5 sandbox cleanliness (`git status --porcelain`) | | | |

### Proxy Results

| Metric | Target | Actual | Status | Notes |
|--------|--------|--------|--------|-------|
| P1 answerViaDiscussion core + participant exclusion | all cases pass | | | |
| P2 matching order + rate-limit/empty guard | all cases pass | | | |
| P3 panel-fallback inline resolution, no pause | all cases pass | | | |
| P4 recommended-path byte-identical | 100% pass | | | |
| P5 portfolio + telemetry counters | all cases pass | | | |
| P6 R1 no unattended pause (5 sites) | all cases pass | | | |
| P7 R3 back-compat + R4 debug-pin contract | all cases pass | | | |
| P8 R5 no double-ask + coverage guard | all cases pass | | | |

### Ablation Results

N/A — no ablation plan for this phase.

### Deferred Status

| ID | Metric | Status | Validates At |
|----|--------|--------|-------------|
| DEFER-105-01 | Live panel-backend answer quality | PENDING | 105-04-VALIDATION.md |
| DEFER-101-02 | Panel behavior (carried over) | PENDING | 105-04-VALIDATION.md |
| DEFER-101-03 | R1-R5 live confirmation (carried over) | PENDING | 105-04-VALIDATION.md |
| DEFER-102-01 | Live AskUserQuestion UX (carried over) | PENDING | 105-04-VALIDATION.md |
| DEFER-104-01 | Live N-candidate generation quality (carried over) | PENDING | 105-04-VALIDATION.md |
| DEFER-104-02 | Live human candidate selection UX (carried over) | PENDING | 105-04-VALIDATION.md |
| DEFER-105-02 | Sandbox isolation discipline (repo cleanliness) | PENDING | 105-04-VALIDATION.md Task 1 |

## Evaluation Confidence

**Overall confidence in evaluation design:** HIGH for correctness/regression safety and for
the R1/R3/R4/R5 cross-phase proof (105-03 is itself a proxy-level integration test suite),
MEDIUM for real-world panel-answer quality and milestone-wide UX (both explicitly gated behind
105-04's human-verify checkpoint).

**Justification:**
- Sanity checks: adequate — tsc/lint/docs-grep/coverage-diff/repo-cleanliness cover both
  GRD's standard four-gate regression protection and this phase's two novel obligations
  (documentation completeness, sandbox hygiene).
- Proxy metrics: well-evidenced — every P1-P8 metric traces directly to a `<verify>`/
  `must_haves` line in 105-01/02/03-PLAN.md, and for the pure-function/DI-call/ledger-state
  assertions (P1, P2, P4, P6, P7, P8) the offline test IS the real metric (no simulation gap
  for the *mechanical* correctness question), mirroring the reasoning in `104-EVAL.md`.
- Deferred coverage: comprehensive for the milestone as a whole — 105-04 is purpose-built as
  the Integration Phase's collection point for every outstanding DEFER item across 101-104
  plus this phase's own new item (D1), with explicit fallback/risk framing for each.

**What this evaluation CAN tell us:**
- The panel resolver is contract-correct and degrade-safe for every enumerated failure mode
  (empty synthesis, rate-limited panelist, no option match) — mechanically identical safety
  guarantee to the existing `resolveToDefaults` path.
- The panel-fallback wiring never pauses an autonomous or concurrent-portfolio run, and the
  default `fallback:"recommended"` path is provably unaffected (byte-identical regression).
- The four cross-phase proof obligations (R1/R3/R4/R5) hold across the full checkpoint
  machinery built in Phases 101-105, in one offline deterministic suite.
- No per-file jest coverage threshold was quietly lowered to make any of this pass.

**What this evaluation CANNOT tell us:**
- Whether a real AI panel produces *good*, coherent answers to checkpoint questions in
  practice (vs. merely well-formed ones) — addressed at DEFER-105-01 (105-04 live sandbox).
- Whether the milestone's full set of carried-over deferred items (candidate quality,
  selection UX, live AskUserQuestion behavior) actually resolve favorably — addressed at
  DEFER-101-02/03, DEFER-102-01, DEFER-104-01/02 (105-04 human-verify checkpoint,
  `autonomous: false` by design).
- Whether the live sandbox session itself was executed cleanly without repo pollution — this
  is checked at run time (S5/DEFER-105-02), not provable in advance.

---

*Evaluation plan by: Claude (grd-eval-planner)*
*Design date: 2026-07-19*
