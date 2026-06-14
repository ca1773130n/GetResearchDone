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
   `Protocol`s (structural), so concrete classes may inherit them to get
   enforced member implementation and `isinstance`-testability, while remaining
   instantiable:
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
   and an uncaught `subprocess.TimeoutExpired` would crash the round. Replace the
   raw `subprocess.run` calls with a small helper that:
   - catches `TimeoutExpired` → treats it as a failed check (`exit_code = 124`,
     `timed_out = True`);
   - for any failing check, appends the `FailureClass` from
     `classify_run_failure(stderr, timed_out)` to the `EvalCheck.detail`
     (e.g. `"[H4] <tail>"`).

   This both consumes the primitive and hardens the round against tool timeouts.

### Tests (`tests/python/`)
- `isinstance(TesseraeFindings(repo), FindingsSource)` and equivalent for each
  of the six conforming classes (runtime-checkable Protocols permit this).
- A check whose subprocess times out is recorded as a failing `EvalCheck`
  classified `H4` and does **not** raise out of `evaluate`.
- A check that fails with a missing-dependency stderr is annotated `H2`.

### Risks
Low. Protocol inheritance is documentation + structural enforcement, not a
behavior change. The only behavior change is the timeout now being caught
(strict improvement). Existing `tests/python/` and the parity suite must stay
green.

## Feature 2 — Planning-time user clarification

### Goal
During planning, when GRD faces an ambiguous, high-impact design or
implementation decision not already locked by the user, ask the user via
`AskUserQuestion` (recommended default offered) instead of silently exercising
discretion or deferring an execution-time checkpoint. Gated; off under
autonomous runs.

### Mechanism constraint
`grd-planner` runs as a **subagent**, and subagents cannot call
`AskUserQuestion`. So the planner *emits* questions and the **plan-phase
orchestrator** (main loop) surfaces them. This mirrors how `discuss-phase`
already produces `CONTEXT.md` that the planner consumes.

### Scope (markdown only — planning is orchestrated in skill markdown)
- `agents/grd-planner.md`
- `commands/plan-phase.md`
- `commands/discuss-phase.md`
- `commands/settings.md`
- `CLAUDE.md` (document the new `research_gates` flag)

Out of scope: `commands/autopilot.md` / `commands/autoplan.md` asking the user —
they run without a watching user and must skip the gate.

### Changes

1. **`agents/grd-planner.md` — emit structured Open Questions.** Add a step:
   after honoring all locked `CONTEXT.md` decisions, the planner identifies
   genuinely ambiguous, high-impact, *unlocked* decisions (design spec choices,
   library/approach forks, data-flow or interface decisions). It:
   - still produces a complete draft plan using its **recommended defaults**
     (nothing blocks);
   - emits an `## Open Questions` block: a ranked list, each item with a one-line
     question, 2–4 options, a **recommended** option, a one-line "why", and the
     plan task(s) that depend on it.
   - If there are no real ambiguities, it emits `## Open Questions\n(none)`.

   Keep the existing "Locked Decisions are non-negotiable" fidelity rules intact;
   Open Questions are strictly for *unlocked* ambiguity.

2. **`commands/plan-phase.md` — clarification gate.** Add a gate after the
   planner returns and before the plan is finalized/written:
   - Read `research_gates.plan_clarification` from `.planning/config.json`,
     defaulting **true** when absent (`jq -r '.research_gates.plan_clarification // true'`).
   - If `autonomous_mode` is true (YOLO) **or** the run is under autopilot →
     skip (keep current behavior; multi-backend discussion remains the
     autonomous fallback).
   - Else, if the planner emitted a non-empty `## Open Questions` block:
     present them via `AskUserQuestion` (batched, ≤4 questions per call; first
     option = the planner's recommended default, labeled "(Recommended)").
     Record answers as locked decisions and **re-run the planner** with those
     answers appended to its `<user_decisions>` so the final plan reflects them.
   - If the block is empty/`(none)` → proceed with no prompt.

3. **`commands/discuss-phase.md` — enrich intake.** Strengthen the existing
   `AskUserQuestion` intake so more design-spec decisions are locked up front
   (architecture/layout, libraries, scope boundaries, error-handling posture),
   reducing how many questions reach the planner gate. No mechanism change — it
   already uses `AskUserQuestion`; this expands the question taxonomy.

4. **`commands/settings.md` + `CLAUDE.md`.** Add `plan_clarification` to the
   `research_gates` configuration surface (settings UI flow + the documented
   key list in CLAUDE.md), default on.

### Gating summary
| Context | Behavior |
|---|---|
| Interactive `plan-phase`, gate on (default), ambiguities exist | Ask via `AskUserQuestion`, fold answers in, re-plan |
| Interactive, gate on, no ambiguities | No prompt |
| Interactive, gate explicitly off | No prompt (current behavior) |
| `autonomous_mode` / autopilot | Skip (multi-backend fallback unchanged) |

### Tests / verification
Markdown-orchestrated behavior is not unit-tested in `tests/unit`. Verification:
the existing `gd settings` flow exposes the flag; a manual interactive
`gd plan-phase N` on a deliberately under-specified phase surfaces an
`AskUserQuestion` and the resulting plan reflects the chosen option;
`autonomous_mode: true` produces no prompt. Document these as acceptance checks
in the implementation plan.

### Risks
- Over-asking: mitigated by "high-impact, unlocked, genuinely ambiguous only" +
  always offering a recommended default so the user can one-tap accept.
- Autonomous regression: the gate must be bypassed under autonomous/autopilot —
  an explicit check, called out in the plan as a required acceptance test.

## Non-goals (both features)
- No changes to GRD's TypeScript research loop.
- No importing of the autoresearch-core research-loop half into GRD.
- No new prompting in autonomous/autopilot/autoplan paths.
