# Design: autoresearch-core conformance wiring + planning-time user clarification

Date: 2026-06-14
Status: Approved (design); implementation plan pending.

Two independent features, bundled because they emerged from one investigation
("does GRD fully utilize autoresearch-core?"):

1. **Conformance wiring** — make GRD's Python harness driver explicitly consume
   more of `autoresearch-core`'s rounds surface (port Protocols + the failure
   classifier) instead of duck-typing and bespoke logic.
2. **Planning-time user clarification** — let GRD ask the user to resolve
   ambiguous design/implementation decisions during planning (via
   `AskUserQuestion`), the way superpowers brainstorming does.

## Background / investigation findings

- `autoresearch-core` (0.4.4) exposes ~50 public symbols across two halves:
  a **research-loop** half (`verdict`/`gates`/`policy`/`promote`/`contract`/
  `failures`) and a **rounds** (life-harness) half (`rounds.py` + ports).
- GRD's only Python consumer, `bin/harness_driver.py`, imports 12 symbols — all
  from the rounds half.
- The research-loop half is **not orphaned**: it is a deliberate parity mirror
  of GRD's canonical **TypeScript** research loop (`lib/research/{verdict,gates,
  promote,eval}.ts`), kept equivalent via shared golden vectors
  (`autoresearch-core/parity/vectors.json` ↔ vendored
  `tests/fixtures/autoresearch-parity-vectors.json`). Source of truth is the TS;
  the Python is the mirror. Nothing outside autoresearch-core imports it.
- Therefore "wire the research half into GRD" is **out of scope** — GRD's
  research loop is TS by design; importing the Python mirror would create two
  diverging loops. The actionable, low-risk wiring is on the **rounds/Python**
  side, where GRD already is a consumer.

## Feature 1 — Conformance wiring (Python side)

### Goal
Consume the rounds-half contract explicitly: the five port Protocols and
`classify_run_failure`. No change to the happy-path round behavior. One latent
bug fixed as a side effect.

### Scope
- `bin/harness_driver.py`
- `tests/python/` (new/extended tests)

Out of scope: any `lib/**.ts`; the research-loop primitives
(`parse_metrics_line`, `DeterministicVerdict`, `resolve_gates`, `decide_branch`,
`detect_plateau`, `build_dead_end_record`, …) — they model metric experiments,
not the harness's structural eval, so forcing them in would be incorrect.

### Changes

1. **Import the port Protocols + classifier.** Extend the existing
   `from autoresearch_core import (...)` block with:
   `FindingsSource, PatchProposer, RoundEvaluator, Applier, RoundStore,
   classify_run_failure`.

2. **Explicit Protocol conformance.** The ports are `@runtime_checkable`
   `Protocol`s (structural), so concrete classes may inherit them while
   remaining instantiable. The benefit is **static-typing enforcement at the
   binding sites + documentation**, not runtime abstract-method enforcement —
   `isinstance` already works via `@runtime_checkable`, and explicit inheritance
   does not make a missing method raise at instantiation. Conforming classes:
   - `class TesseraeFindings(FindingsSource)`
   - `class AgentProposer(PatchProposer)`
   - `class RepoEvaluator(RoundEvaluator)`
   - `class GitApplier(Applier)`
   - `class FsRoundStore(RoundStore)`
   - `class CompositeFindings(FindingsSource)`

   Annotate the binding sites in `run_round` with the Protocol types
   (`source: FindingsSource = ...`) so a type checker enforces the contract at
   the call boundary.

   Note: `FsRoundStore.save_round(self, record, extra=None)` adds an optional
   `extra` param beyond the Protocol's `save_round(self, record)`. This is
   structurally compatible (callable as `save_round(record)`), so conformance
   holds.

3. **Wire `classify_run_failure` into `RepoEvaluator.evaluate`.** Today each
   `lint`/`tsc`/`jest` subprocess records only `returncode` + truncated output,
   and an uncaught `subprocess.TimeoutExpired` would crash the round (verified at
   `bin/harness_driver.py:183-189`; `run_round` catches only `ValueError` around
   `evaluate` at `522-528`). Replace the raw `subprocess.run` calls with a small
   helper that:
   - catches `TimeoutExpired` -> failed check (`exit_code = 124`,
     `timed_out = True`), preserving the `TimeoutExpired.stdout`/`stderr` tails
     so diagnostics survive;
   - catches `FileNotFoundError`/`OSError` (e.g. a missing `npm` binary, which
     raises before any stderr exists) -> failed check, using the exception text
     as the stderr fed to the classifier (lets H2/H3 categories fire);
   - for any failing check, prepends the `FailureClass` from
     `classify_run_failure(stderr, timed_out)` to the preserved output tail in
     `EvalCheck.detail` (e.g. `"[H4] <tail>"` / `"[H2] <tail>"`).

   This both consumes the primitive and hardens the round against tool timeouts
   and missing tooling.

### Tests (`tests/python/`)
- `isinstance(TesseraeFindings(repo), FindingsSource)` and equivalent for each
  of the six conforming classes (runtime-checkable Protocols permit this).
- A check whose subprocess times out is recorded as a failing `EvalCheck`
  classified `H4` and does **not** raise out of `evaluate`.
- A check that fails with a missing-dependency stderr is annotated `H2`.

### Risks
Low. Protocol inheritance is documentation + static-typing help (no runtime
abstract-method enforcement), not a behavior change. The only behavior changes
are the timeout/`OSError` now being caught (strict improvement). Existing
`tests/python/` and the parity suite must stay green.

## Feature 2 — Planning-time user clarification

> **Revised after Codex design review (2026-06-14).** The original "planner
> emits an `## Open Questions` block, orchestrator asks, then re-runs the
> planner" approach had three blocking conflicts with how planning works today:
> (a) `--candidates N` mode requires planner stdout to contain *only*
> `<<<PLAN-i>>>` markers with "no other content between markers"
> (`commands/plan-phase.md:97`); an extra block breaks candidate parsing;
> (b) the planner **writes, validates, and commits `PLAN.md` before returning**
> `## PLANNING COMPLETE` (`agents/grd-planner.md` planning-complete path), so
> "ask before the plan is finalized" is impossible on the COMPLETE path;
> (c) `<user_decisions>` is not the real planner input channel — `plan-phase`
> injects context under `**Phase Context:**` (`commands/plan-phase.md:272-279`),
> and the planner keys fidelity to `## Decisions` / `## Deferred Ideas` /
> `## Claude's Discretion` (`agents/grd-planner.md:47-70`).
> The revision below instead reuses GRD's **existing** mid-planning checkpoint
> transport.

### Goal
During planning, when the planner faces an ambiguous, high-impact design or
implementation decision not already locked by the user, ask the user via
`AskUserQuestion` (recommended default offered) **before it commits PLAN.md**,
instead of silently exercising discretion or deferring an execution-time
checkpoint. Gated; off under autonomous/autopilot runs.

### Mechanism — reuse the existing `## CHECKPOINT REACHED` path
`grd-planner` runs as a **subagent** and cannot call `AskUserQuestion`. GRD
already solves exactly this: the planner can return `## CHECKPOINT REACHED`
mid-planning, and `plan-phase` already knows how to *"Present to user, get
response, spawn continuation"* (`commands/plan-phase.md:330`; planner side at
`agents/grd-planner.md:1460`). We extend that existing path rather than invent a
parallel one. Concretely: the planner raises a **clarification checkpoint**
*before* writing `PLAN.md` when it hits genuine unlocked ambiguity; the
orchestrator renders it via `AskUserQuestion`; the existing continuation
(`plan-phase` step 12) resumes the planner with the answers, which it treats as
locked decisions and only then writes/commits `PLAN.md`.

### Scope (markdown only — planning is orchestrated in skill markdown)
- `agents/grd-planner.md`
- `commands/plan-phase.md`
- `commands/discuss-phase.md`
- `commands/settings.md`
- `CLAUDE.md` (document the new flag)

Out of scope: `commands/autopilot.md` / `commands/autoplan.md` asking the user —
they run without a watching user and must skip clarification (see Gating).

### Changes

1. **`agents/grd-planner.md` — raise a clarification checkpoint.** Add a step
   that runs *before* the planner writes `PLAN.md`: after honoring all locked
   context decisions, it identifies genuinely ambiguous, high-impact, *unlocked*
   decisions (design-spec choices, library/approach forks, data-flow or
   interface decisions). If any exist **and** clarification is permitted (the
   orchestrator passes a "questions allowed" signal — see §2), it returns
   `## CHECKPOINT REACHED` with a structured clarification payload: a ranked
   list, each item with a one-line question, 2–4 options, a **recommended**
   option, and a one-line "why". It does **not** write `PLAN.md` yet. If
   clarification is not permitted, or there is no real ambiguity, it proceeds
   exactly as today (exercise discretion, write the plan). Keep the
   "locked decisions are non-negotiable" fidelity rules intact; clarification is
   strictly for *unlocked* ambiguity.

2. **`commands/plan-phase.md` — pass the signal, render the checkpoint.**
   - Resolve a `clarification_allowed` signal once, before spawning the planner:
     read the new `plan_clarification` gate (default **true** when absent), and
     force it **false** when `autonomous_mode` is true, when invoked under
     autopilot (autopilot already injects a "no questions" instruction —
     `lib/autopilot.ts:563-566` — which must set this to false), or when
     `--candidates N` with N > 1 (candidate exploration is not interactive
     clarification). Pass the resolved boolean into the planner prompt.
   - Extend the existing `## CHECKPOINT REACHED` handling (step 9 → step 12) so
     that when the checkpoint is a *clarification* payload, the orchestrator
     renders it via `AskUserQuestion` (batched, ≤4 questions/call; first option =
     the planner's recommended default, labeled "(Recommended)") instead of a
     freeform prompt, then spawns the continuation carrying the answers
     **formatted as `## Decisions` entries** (the channel the planner actually
     honors — not `<user_decisions>`).
   - **Bound the loop:** cap clarification checkpoints per planning run (reuse
     the spirit of the existing 3-iteration checker-revision cap at
     `commands/plan-phase.md:387-430`) and dedupe question IDs so the same
     ambiguity is never re-asked.

3. **`commands/discuss-phase.md` — enrich intake.** Strengthen the existing
   `AskUserQuestion` intake so more design-spec decisions are locked up front
   (architecture/layout, libraries, scope boundaries, error-handling posture),
   reducing how many reach the planner-checkpoint stage. No mechanism change —
   it already uses `AskUserQuestion`; this expands the question taxonomy.

4. **`commands/settings.md` + `CLAUDE.md`.** Add a `plan_clarification` toggle
   **colocated with the existing approval gates** (`product_plan_approval`,
   `phase_plan_approval` — `commands/settings.md:91-93,123-125`), default on.
   Document the **distinction** explicitly: `phase_plan_approval` approves or
   rejects the *finished* plan (post-planning); `plan_clarification` asks about
   specific ambiguous decisions *during* planning, only when ambiguity exists.

### Existing-debt note (must reconcile during implementation)
`agents/grd-planner.md:47` documents a `<user_decisions>` input channel, but
`plan-phase` actually passes context under `**Phase Context:**`
(`commands/plan-phase.md:272-279`) keyed to `## Decisions` etc. The
implementation MUST route clarification answers into the channel the planner
truly consumes (the checkpoint continuation prompt, as `## Decisions` entries),
and should fix or annotate that stale doc reference so it stops misleading.

### Gating summary
| Context | Behavior |
|---|---|
| Interactive `plan-phase`, gate on (default), ambiguity exists | Planner raises clarification checkpoint → `AskUserQuestion` → continuation writes plan |
| Interactive, gate on, no ambiguity | No checkpoint; plan written as today |
| Interactive, gate explicitly off | No clarification (current behavior) |
| `autonomous_mode` true | `clarification_allowed=false`; no prompt |
| Under autopilot | `clarification_allowed=false` (autopilot's "no questions"); no prompt |
| `--candidates N` (N > 1) | `clarification_allowed=false`; candidate markers unaffected |

### Tests / verification
Markdown-orchestrated behavior is not unit-tested in `tests/unit`. Acceptance
checks (document in the implementation plan):
- `gd settings` exposes the `plan_clarification` toggle next to
  `phase_plan_approval`.
- A manual interactive `gd plan-phase N` on a deliberately under-specified phase
  raises a clarification checkpoint, surfaces `AskUserQuestion`, and the
  resulting committed `PLAN.md` reflects the chosen option.
- `autonomous_mode: true`, autopilot invocation, and `--candidates 3` each
  produce **no** prompt and the planner output contract is unchanged (candidate
  markers still parse).

### Risks
- Over-asking: mitigated by "high-impact, unlocked, genuinely ambiguous only",
  the per-run cap + question-ID dedupe, and always offering a recommended
  default for one-tap accept.
- Autonomous/candidate regression: `clarification_allowed` must be forced false
  under autonomous_mode, autopilot, and `--candidates N>1` — an explicit,
  separately-tested check.
- Checkpoint-path coupling: the clarification checkpoint reuses the existing
  CHECKPOINT REACHED transport; the implementation must not regress the existing
  (non-clarification) checkpoint behavior.

## Non-goals (both features)
- No changes to GRD's TypeScript research loop.
- No importing of the autoresearch-core research-loop half into GRD.
- No new prompting in autonomous/autopilot/autoplan paths.
