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
    - lib/autopilot.ts
  key_links:
    - "`gd plan-candidates <N> --candidates K` parses planner output and writes PLAN-1.md ... PLAN-K.md"
    - "default K from resolveEffortKnob(config, 'candidates_per_plan_phase') when --candidates is omitted"
    - "no PLAN.md (singular) emitted when --candidates K>1 active"
    - "autopilot.ts hasMultipleCandidates() gate: skip execute-phase with 'selection pending — Phase 3 will pick' when PLAN-N.md present and no resolved PLAN.md"
    - "command named plan-candidates (not plan-phase) to avoid clashing with the existing /grd:plan-phase agent skill that already routes through bin/grd-tools.ts"
---

# Phase 2 — Multi-candidate plan generation

## Goal

`gd plan-candidates <phase> --candidates N` parses planner output
(marker-fenced `<<<PLAN-i>>>...<<</PLAN-i>>>` blocks) and writes
N alternative `PLAN-1.md ... PLAN-N.md` files into the phase
directory atomically. Today the planner emits one PLAN.md; with N
candidates we have a comparison set for phase 3's deterministic
selector to choose from, without paying for N separate dispatches.

The command name was originally drafted as `gd plan-phase` but
the existing `/grd:plan-phase` agent skill already routes through
that name in bin/grd-tools.ts, so the tool subcommand is
`gd plan-candidates` instead. The skill itself (`commands/plan-phase.md`)
remains the orchestrator that invokes both the planner agent and
this tool command.

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
Add `gd plan-candidates <N> --candidates K --input FILE
[--allow-partial-candidates]` as a new tool command. Wire via
`ROUTE_DESCRIPTORS` in `bin/grd-tools.ts` and `TOOL_COMMANDS` in
`lib/cli/index.ts` (alongside `plan-lint`). The plain `plan-phase`
command remains the agent skill route — DO NOT add `plan-phase` to
`TOOL_COMMANDS` (would shadow the agent). Default K comes from
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

<task name="file-emission-fail-closed">
After the planner subprocess returns, scaffold the writes.
**Codex review P1 #3: fail closed by default** (autopilot should not
silently degrade to 1 candidate when the user asked for N).

- Read N from `--candidates` (or effort default).
- Expect the planner output to contain N PLAN-blocks fenced by
  `<<<PLAN-i>>>` / `<<</PLAN-i>>>` markers.
- Validate the count exactly:
  - If count !== N: **fail with non-zero exit code**, log which
    blocks were found, do NOT write any files.
  - If `--allow-partial-candidates` flag is set: degrade to writing
    what was found and warn loudly.
- Single retry on malformed output: if the planner subprocess
  produces 0 or > 2× N blocks, re-dispatch once with an explicit
  reminder paragraph appended to the prompt. If the second attempt
  also fails, fail closed.
- Each valid block's content is written to `<phaseDir>/PLAN-i.md`.
</task>

<task name="autopilot-default">
In `lib/autopilot.ts:runAutopilot`, when N > 1 candidates exist
in the phase dir after plan-phase completes, log a "selection
pending — phase 3 will pick" line and do NOT proceed to execute.
(This is a deliberate gate; phase 3 wires the auto-select.)
</task>

<task name="integration-test">
`tests/unit/plan-phase.test.ts`: fixture phase, feed a
marker-fenced text file to `cmdPlanPhase` via `--input`. Assert
PLAN-1.md, PLAN-2.md, PLAN-3.md exist with distinct content.
Assert no bare PLAN.md. Also cover all 7 deliberate-failure cases
from the reflection (count mismatch, nested, mismatched close,
orphan close, unclosed, duplicate, missing index).
</task>
</tasks>

## Verification (proxy)

```yaml
sanity:
  - "gd plan-candidates 1 --candidates 1 --input <single-block> writes PLAN-1.md (no bare PLAN.md emitted; backward-compat single-PLAN behavior continues to come from the unchanged /grd:plan-phase agent skill when --candidates is absent)"
  - "gd plan-candidates 1 --candidates 3 --input <3-block> writes PLAN-1.md PLAN-2.md PLAN-3.md"
  - "no --candidates flag uses resolveEffortKnob default (3 for balanced, 1 for thrifty, 7 for deep)"
  - "--candidates > 9 rejected as sanity-bound violation"
proxy:
  - "unit tests: 7 deliberate-failure cases (count mismatch, nested, mismatched close, orphan close, unclosed, duplicate, missing index) each produce exit 1 and write no files (fail-closed)"
  - "autopilot hasMultipleCandidates() gate: when PLAN-N.md candidates exist without a resolved PLAN.md, execute-phase is skipped with 'selection pending — Phase 3 will pick' reason"
deferred:
  - id: DEFER-v0.4-2-1
    description: "Real planner behavior with N=7 on a non-trivial phase — needs Claude subprocess and Phase 3's selector to consume the candidates"
    validates_at: phase 3 integration
  - id: DEFER-v0.4-2-distinct-plans
    claim: "Real planner subprocess on a representative phase produces N plans whose hypotheses are meaningfully different (not paraphrases)"
    validates_at: phase 3 integration with real planner
    measure: "Jaccard similarity between any two reflection.hypothesis fields <= 0.6"
```

## <reflection>

(Codex review P2 #6: original reflection deferred all interesting
claims to phase 3. v2 splits into an in-phase falsifiable claim and
a separately tracked deferred validation.)

```yaml
hypothesis: "Marker-fence parsing + fail-closed validation reliably distinguishes a correct N-block planner response from a malformed one across the test fixtures."
predicted_outcome: "Stubbed-planner integration test passes for the three deliberate-failure cases (N-1 blocks, N+1 blocks, nested fences) — each produces a non-zero exit and writes no files. Same test passes for the happy path (exactly N valid blocks → N files written)."
deferred_validations:
  - id: DEFER-v0.4-2-distinct-plans
    claim: "Real planner subprocess on a representative phase produces N plans whose hypotheses are meaningfully different (not paraphrases)."
    validates_at: phase 3 integration with real planner
    measure: "Jaccard distance between any two reflection.hypothesis fields >= 0.4"
```

## Notes

- Marker-fenced output (`<<<PLAN-i>>>`) is more reliable than asking
  the planner to write files itself (writes through Claude Code's
  Write tool may interleave with the prompt context unpredictably
  when N > 1). The marker pattern is also easier to validate.
- Estimated cost: ~0.5 day. ~250 lines incl. tests.
