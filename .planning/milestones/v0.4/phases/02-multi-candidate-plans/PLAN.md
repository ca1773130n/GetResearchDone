---
phase_number: "2"
phase_slug: multi-candidate-plans
plan_number: "02-01"
wave: 2
depends_on: ["1"]
autonomous: true
verification_level: proxy
files_modified:
  - lib/commands/plan-phase.ts
  - commands/plan-phase.md
  - lib/types.ts
  - tests/integration/plan-phase.test.ts
must_haves:
  artifacts:
    - lib/commands/plan-phase.ts
    - commands/plan-phase.md
  key_links:
    - "`gd plan-phase --candidates N` writes PLAN-1.md ... PLAN-N.md"
    - "default N from resolveEffortKnob(config, 'candidates_per_plan_phase')"
    - "no PLAN.md (singular) emitted when --candidates used"
---

# Phase 2 — Multi-candidate plan generation

## Goal

`gd plan-phase --candidates N` emits N alternative PLAN.md files
in a single planner dispatch. Today the planner emits one PLAN.md;
with N candidates we have a comparison set for phase 3's
deterministic selector to choose from, without paying for N
separate dispatches.

## Context

This is item 1 of the v0.4 roadmap. It is the *generator* in
"generate–then–dedup–then–score". Phase 3 will write the scorer.

GENOME heuristic respected: this phase is pure file emission; no
LLM judges between candidates. The planner produces them; the
selector (phase 3) picks one using deterministic axes.

DEAD-ENDS respected: this is NOT an Elo tournament. The N
candidates are alternative plans the planner thought were worth
proposing; no head-to-head ranking happens in this phase.

## Tasks

<tasks>
<task name="cli-flag-parsing">
Add `--candidates N` flag parsing to `bin/grd-tools.ts`'s
plan-phase route. Default value comes from
`resolveEffortKnob(config, 'candidates_per_plan_phase')` (phase 1).
Cap at 9 (sanity bound).
</task>

<task name="planner-prompt-extension">
Extend `commands/plan-phase.md`'s planner prompt with a
`<multi_candidate>` block that fires when N > 1:

```
<multi_candidate>
You are producing {N} ALTERNATIVE plans for this phase. They must:
- Differ in approach (not in wording). Choose meaningfully
  different strategies — e.g. one might emphasize new code, another
  refactoring existing code, another delegating to existing
  modules.
- All satisfy the same `must_haves` (REQUIREMENTS.md).
- Each include their own `<reflection>` block; the hypotheses MUST
  differ across candidates.
- Be numbered PLAN-1.md, PLAN-2.md, ... PLAN-{N}.md in the phase
  directory. Do NOT emit a bare PLAN.md.
</multi_candidate>
```

When N === 1, the block is suppressed; behavior is unchanged from
v0.3.x (single PLAN.md emitted).
</task>

<task name="file-emission">
After the planner subprocess returns, scaffold the writes:
- Read N from --candidates (or effort default).
- Expect the planner output to contain N PLAN-blocks fenced by
  `<<<PLAN-i>>>` / `<<</PLAN-i>>>` markers. Each block's content
  is written to `<phaseDir>/PLAN-i.md`.
- If the planner emits fewer than N blocks, write what it did and
  print a warning (do not fail).
- If the planner emits more than N, write the first N and warn.
</task>

<task name="autopilot-default">
In `lib/autopilot.ts:runAutopilot`, when N > 1 candidates exist
in the phase dir after plan-phase completes, log a "selection
pending — phase 3 will pick" line and do NOT proceed to execute.
(This is a deliberate gate; phase 3 wires the auto-select.)
</task>

<task name="integration-test">
`tests/integration/plan-phase.test.ts`: fixture phase, run
`gd plan-phase 1 --candidates 3` against a stubbed planner that
returns 3 marker-fenced blocks. Assert PLAN-1.md, PLAN-2.md,
PLAN-3.md exist with distinct content. Assert no bare PLAN.md.
</task>
</tasks>

## Verification (proxy)

```yaml
sanity:
  - "gd plan-phase 1 --candidates 1 still writes PLAN.md (backward compat)"
  - "gd plan-phase 1 --candidates 3 writes PLAN-1.md PLAN-2.md PLAN-3.md"
  - "no candidates flag uses resolveEffortKnob default"
proxy:
  - "integration test: 3 generated PLAN files have distinct <reflection> hypotheses"
  - "integration test: each PLAN passes existing PLAN.md mechanical-verify bundle"
deferred:
  - id: DEFER-v0.4-2-1
    description: "Real planner behavior with N=7 on a non-trivial phase — needs Claude subprocess"
    validates_at: phase 3 integration
```

## <reflection>

```yaml
hypothesis: "Asking the planner for N candidates in a single dispatch produces meaningfully different plans (not paraphrases of one), as measured by distinct hypotheses in the <reflection> blocks across the N outputs."
predicted_outcome: "Stubbed-planner integration test passes (mechanical). The 'meaningfully different' claim is deferred to phase 3 integration with a real planner subprocess on a representative fixture."
```

## Notes

- Marker-fenced output (`<<<PLAN-i>>>`) is more reliable than asking
  the planner to write files itself (writes through Claude Code's
  Write tool may interleave with the prompt context unpredictably
  when N > 1). The marker pattern is also easier to validate.
- Estimated cost: ~0.5 day. ~250 lines incl. tests.
