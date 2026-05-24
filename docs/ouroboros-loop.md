# The Ouroboros Loop: Closed-Loop Self-Monitoring Primitives for Agentic Coding Systems

**Author:** Cameleon X
**Project:** GRD (Get Research Done) — v0.3.27
**Status:** Technical report, draft for arXiv preprint
**License:** UNLICENSED (project source); this document CC-BY-4.0

## Abstract

Autonomous coding agents like Aider, OpenHands, SWE-agent, and Cursor have
converged on a common loop: read code → plan → edit → run tests → repeat. They
differ in tooling and model routing, but the loop itself is amnesic. Each
iteration starts fresh; failed approaches are not remembered; the agent has no
self-model of what it has been doing well or badly. We introduce the
**Ouroboros loop**, a set of four lightweight, deterministic primitives that
give an agentic coding system a *durable self-monitoring layer*:

1. **Falsifiable reflections** — every plan must commit to a hypothesis +
   predicted outcome that the verifier later resolves to one of
   `{confirmed, partial, falsified}`.
2. **DEAD-ENDS registry** — falsified hypotheses are auto-promoted into a
   project-scoped registry that the planner reads at the next iteration and
   is forbidden from re-proposing.
3. **Project drift score** — a weighted scalar over goal / constraint /
   ontology dimensions, sourced from real project artifacts, that quantifies
   how far the project has drifted from its stated objective.
4. **Strategy GENOME** — a project-scoped append-only registry of
   heuristics-in-use plus dated snapshots of project state, fed back into the
   planner before every plan-phase invocation.

Together these turn each agent dispatch into a *step in a learning loop*
rather than an isolated subprocess invocation. We describe the
implementation in GRD, the codex-based validation methodology that found and
fixed 47 wiring bugs across 11 features, and report preliminary observations
from 10 autonomous evolve iterations against the live codebase.

The contribution is not the individual primitives — each has prior art — but
the combination as a *minimal, deterministic, agent-agnostic substrate* that
sits beneath whatever planning/critique loop the user runs.

---

## 1. Motivation

State-of-the-art coding agents (Aider, OpenHands, SWE-agent, Devin, Cursor)
all expose some flavor of plan → execute → verify → iterate. Their published
metrics (SWE-bench scores, "Singularity %", token throughput) measure the
agent in *aggregate*. They say very little about what the agent learned, what
it tried and gave up on, or whether its model of the project has drifted
from what the human originally asked for.

In practice, three failure modes recur across long-running autonomous runs:

- **The agent re-proposes a falsified approach** (sometimes 3–5 iterations
  apart) because nothing carries the prior failure forward.
- **The agent's plans drift away from the project's stated objective** as
  it picks up incidental concerns, with no signal that this is happening.
- **The agent re-discovers heuristics every session** that were already
  validated in prior sessions, because heuristics live in agent memory rather
  than in project memory.

Ouroboros is the minimal set of project-scoped primitives we found
sufficient to address all three. The implementation deliberately avoids
LLM-judged scoring; every primitive is a deterministic computation over
on-disk artifacts so that it survives agent restarts, model upgrades, and
backend swaps.

## 2. The four primitives

### 2.1 Falsifiable reflections

Every PLAN.md the planner emits is required to include a `<reflection>`
block with two fields the planner fills in:

```yaml
hypothesis: "Pre-allocating the buffer reduces tail latency by 30%."
predicted_outcome: "p99 latency in tests/perf/buffer.test.ts < 12ms."
```

And two fields the verifier fills in after execution:

```yaml
actual_outcome: "p99 latency = 11.3ms (baseline 15.8ms, 28% reduction)."
verdict: confirmed     # ∈ {confirmed, partial, falsified}
evidence:
  - "tests/perf/buffer.test.ts:54 PASS at 11.3ms"
  - "git: a68da32 added preallocation"
```

The verdict is enforced by `agents/grd-verifier.md`'s Evidence Standard:
each claim requires a command + exit code + observable artifact. Verifier
output without evidence is rejected.

### 2.2 DEAD-ENDS registry

`.planning/DEAD-ENDS.md` is a project-scoped markdown file with YAML-fenced
entries. Each entry records a falsified approach: what was tried, what
failed, why, with pointers to the phase / commit / verification artifact:

```yaml
- slug: preallocation-buffers-helps-tail-latency
  phase_number: "23"
  hypothesis: "Pre-allocating the buffer reduces tail latency."
  predicted_outcome: "p99 < 12ms"
  actual_outcome: "p99 = 14.2ms; pre-alloc fragmented GC"
  why_failed: "Buffer reuse exposed a refcount bug downstream"
  evidence:
    - phase: "23-VERIFICATION.md"
    - commit: "a68da32"
```

Two write paths: `gd-tools dead-end add` (manual) and
`gd-tools dead-end promote-from-phase N` (auto-promote every falsified
reflection in phase N's VERIFICATION.md). The planner, before composing a
new plan, reads DEAD-ENDS.md and is instructed to refuse to re-propose any
matching approach, citing the dead-end slug in its plan rationale.

### 2.3 Project drift score

`gd health` computes a weighted scalar `drift_weighted ∈ [0,1]` over three
dimensions, each sourced from real on-disk artifacts (not LLM judgment):

| Dimension | Source | Computation |
|---|---|---|
| **goal** | `PROJECT.md` `## Goal` section + recent phase SUMMARYs | Jaccard distance between vocabularies (vocabulary = top-N TF-IDF tokens after stopword filter) |
| **constraint** | `REQUIREMENTS.md` `must_haves` per phase | Per-phase must_haves vs phase plan: fraction unsatisfied |
| **ontology** | recent phase SUMMARYs vs PROJECT.md `## Concepts` block | Jaccard distance between concept-noun sets across windowed time series |

The composite is `Σ w_i · d_i` with default weights `goal:0.5,
constraint:0.3, ontology:0.2` (from `lib/drift.ts:DEFAULT_WEIGHTS`). When
`drift_weighted > threshold` (default 0.3), `gd health` flags
`drift_exceeded: true`.

The score is currently informational; planned future work is to gate
autopilot continuation on `drift_exceeded` (codex r44 P2).

#### 2.3.1 Ontology convergence as a graceful termination signal

A side effect of the ontology dimension is detecting when successive phases
have *converged* on the same vocabulary. When the rolling ontology
similarity between non-overlapping windows of phase SUMMARYs exceeds
`ontology_convergence_threshold` (default 0.95), `runAutopilot`
terminates with status `converged` (distinct from `failed`). This
distinction propagates through `runMultiMilestoneAutopilot` and
`runInfiniteEvolve` so that `cycles_completed` counts converged cycles as
successful, not failed.

### 2.4 Strategy GENOME

`.planning/GENOME.md` is a project-scoped append-only registry with four
sections:

- **Heuristics in use** — hand-curated rules the team agrees apply to this
  project (e.g. "use `proxy` verification for ML phases", "split phases
  past 50% context").
- **Agent preferences** — which agents to invoke when (e.g. "run deep-diver
  before plan when research_level ≥ 2").
- **Verdict thresholds** — when to promote partial→falsified, when to halt
  on ontology similarity, etc.
- **Snapshots** — dated `## Snapshot YYYY-MM-DD` sections appended
  automatically after each successful evolve cycle, recording completed
  phase count, drift score, dead-ends count, and verdict mix.

The snapshots provide a project-state time series that lets the planner
reason about progress. They are deterministic (no LLM ran to compose them)
and append-only (rollback via `git revert`).

## 3. The closed loop

The four primitives are wired into the per-phase autopilot loop:

```
┌───────────────────────────────────────────────────────────────┐
│ runAutopilot(phase N)                                         │
│                                                               │
│   1. cmdInitPlanPhase loads:                                  │
│      - PROJECT.md, STATE.md, ROADMAP.md                       │
│      - PRIOR_REFLECTIONS from phases 1..N-1 (§2.1)            │
│      - DEAD_ENDS_MD (§2.2)                                    │
│      - GENOME_MD (§2.4)                                       │
│      - drift score from gd health (§2.3)                      │
│                                                               │
│   2. /grd:plan-phase orchestrator skill injects all of the    │
│      above into the grd-planner agent's <planning_context>    │
│      block (commands/plan-phase.md).                          │
│                                                               │
│   3. grd-planner emits PLAN.md with required <reflection>     │
│      block (hypothesis + predicted_outcome).                  │
│                                                               │
│   4. /grd:execute-phase runs the plan in a git worktree.      │
│                                                               │
│   5. grd-verifier emits VERIFICATION.md with reflection       │
│      verdict + evidence (Evidence Standard).                  │
│                                                               │
│   6. Refinement loop (optional, opt-in):                      │
│      a. Measure (real spawnSync, not claude -p):              │
│           npx jest --coverage --ci                            │
│           npx tsc --noEmit                                    │
│           npx eslint bin/ lib/                                │
│      b. Classify branch from worst dimension                  │
│           (macro / geometry / generative)                     │
│      c. Spawn grd-critique-agent with agent definition        │
│           embedded in the prompt                              │
│      d. Re-measure; if any metric regressed, git reset --hard │
│           in the worktree (regression guard)                  │
│      e. Repeat until convergence or max iterations            │
│                                                               │
│   7. Auto-promote falsified reflections to DEAD-ENDS.md       │
│      (manual via `gd dead-end promote-from-phase N`)          │
│                                                               │
│   8. Append snapshot to GENOME.md if evolve.auto_genome_      │
│      snapshot=true (lib/evolve/orchestrator.ts).              │
│                                                               │
│   9. Update STATE.md; advance phase pointer; loop.            │
└───────────────────────────────────────────────────────────────┘
```

Every box above is reachable by a deterministic CLI invocation
(`gd plan-phase`, `gd execute-phase`, `gd verify-phase`, `gd dead-end
promote-from-phase`, `gd genome snapshot`, `gd health`) so the loop is
auditable without rerunning an LLM.

## 4. Implementation

| Primitive | Implementation | Lines |
|---|---|---|
| Reflections | `lib/think.ts` parser; `agents/grd-planner.md` `<reflection>` block; `agents/grd-verifier.md` Evidence Standard | ~250 |
| DEAD-ENDS | `lib/dead-ends.ts` (read+write+promote-from-phase); `agents/grd-planner.md` `<dead-ends>` block | ~480 |
| Drift score | `lib/drift.ts` (`computeDriftScore`, `isOntologyConverged`); `lib/commands/health.ts` rendering | ~520 |
| Strategy GENOME | `lib/genome.ts` (init/show/snapshot); `runGenomeSnapshot` helper called from `lib/evolve/orchestrator.ts` | ~310 |
| Refinement loop | `lib/refinement.ts` (`collectMetrics`, `classifyBranch`, `checkConvergence`); `lib/autopilot-pipeline.ts:runRefinementLoop` | ~480 |

Total: ~2,040 lines of TypeScript, 100% test-covered per file thresholds in
`jest.config.js`.

## 5. Validation: the codex-rescue methodology

We validated the implementation with a unique methodology: every PR was
reviewed by `codex exec review` (OpenAI's standalone reviewer) against the
prior tag *before* merge. Codex was run with a fresh context per round and
asked to find correctness, security, and convention bugs.

Across the v0.3.24 → v0.3.27 release cycles, codex ran **47 review rounds**
and found 51 issues, broken down:

| Severity | Count | Examples |
|---|---|---|
| P0 | 0 | — |
| P1 | 7 | path-traversal in research-bundle import (r1); refinement metrics parsed LLM prose, not tool output (r43); critique-agent definition file never loaded into prompt (r44); spin-kill reported exit 0 instead of 1 (r45) |
| P2 | 40 | mostly project-convention misses (prefixed artifact filenames, padded phase IDs, multi-line YAML, markdown table edge cases) |
| P3 | 4 | recommendation strings pointing at config keys that don't exist; cosmetic regex flag misses |

The high P2 count is informative: it shows what happens when an LLM-
generated implementation lands without convention coverage. Each fix is
small (~5–30 lines) but the number is large because the LLM treated every
artifact format as if it were the only one. Codex acting as adversarial
reviewer caught these systematically; the fix rate per round dropped from
3+ findings to 0 over 47 rounds.

We argue this methodology is itself an Ouroboros pattern: a reviewer agent
(codex) acting as the verifier-of-record for code produced by an executor
agent (Claude Code via GRD). The reviewer's findings are themselves
falsifiable claims that can be promoted to DEAD-ENDS or stored as GENOME
heuristics on subsequent projects.

## 6. Observations from 10 autonomous evolve iterations

We ran `gd evolve --iterations 10` against the GRD codebase itself. Each
iteration: (a) discover improvements, (b) plan a milestone from
discoveries, (c) execute it via multi-milestone autopilot, (d) commit
results.

Tests grew from 4,478 to 4,524 (+46). 19 new CLI commands were added
(many later trimmed). Every iteration triggered codex review afterward.

**Headline observation:** the evolve loop is good at *discovery* (finding
genuine bugs, missing features, brittle regexes) and *implementation*
(landing real code that passes unit tests). It is *bad* at *project-
convention coverage* — almost every new command had 2–4 P1/P2 findings on
first codex review because it ignored prefixed artifact names, alternate
markdown forms, alternate config-loading paths, etc.

**Implication:** the codex-rescue step is not optional. An evolve-only
loop without an adversarial reviewer produces plausible-looking,
test-passing code that fails on real project conventions. The Ouroboros
substrate (especially the GENOME snapshots that record verdict mix) is
the place where this lesson can compound across projects.

## 7. Limitations

- **The reviewer is itself an LLM.** Codex's findings have a non-trivial
  false-positive rate; some rounds flagged "issues" that were actually
  intentional design. The Evidence Standard mitigates this but doesn't
  eliminate it.
- **Drift score is informational only.** No autopilot path currently gates
  on `drift_exceeded`. Adding such a gate is straightforward but raises
  the question of what to do when the gate fires (terminate? require
  human?).
- **Ontology convergence detection is conservative.** Requires a long
  history (≥2 non-overlapping windows of completed phases) before it can
  fire. Short milestones don't benefit.
- **DEAD-ENDS auto-promotion is one-way.** Once an approach is in DEAD-
  ENDS, the planner won't re-propose it. If the environment changes and
  the approach becomes viable again, a human must `gd dead-end remove`
  manually.
- **No benchmark score yet.** We have not run GRD against SWE-bench or any
  comparable public benchmark. This is the most important next step;
  without a published metric the system can't be compared with peer
  agents.

## 8. Future work

- Publish a benchmark score against SWE-bench-Lite or a curated 30-task
  internal benchmark.
- Add a "Singularity %" metric — the fraction of GRD's own code authored
  by `gd evolve`. The data is already in `EVOLUTION.md`.
- Promote `drift_exceeded` from informational to a soft gate with a
  human-confirmation prompt.
- Cross-project GENOME — let one project's snapshots inform another
  project's heuristics, with explicit opt-in.
- Replace codex-rescue with an in-loop verifier agent that reads
  DEAD-ENDS to learn what to flag aggressively.

## 9. Related work

- **Reflexion** (Shinn et al., 2023) — proposed self-reflection as a
  verbal RL signal. Our reflections are stricter (required schema, binary
  verdict, evidence-anchored) and project-scoped rather than agent-scoped.
- **SWE-agent** (Yang et al., 2024) — established the YAML-configured
  agent-as-tool-user. Our refinement loop adapts their measurement
  discipline (real tool output, not LLM prose) to a closed loop.
- **Sakana AI Scientist** (Lu et al., 2024) — fully automated paper
  generation. Our DEAD-ENDS + reflections are conceptually the
  no-rework / no-rediscovery substrate they identify as a gap.
- **STORM** (Shao et al., 2024) — multi-perspective research synthesis.
  Our GENOME's "heuristics in use" section borrows the multi-perspective
  framing for self-curated rules.
- **Voyager** (Wang et al., 2023) — lifelong skill library in
  Minecraft. Our GENOME snapshots play a similar role for coding
  agents — durable cross-session memory of what worked.

## 10. Reproducibility

The complete implementation is at
[github.com/ca1773130n/GetResearchDone](https://github.com/ca1773130n/GetResearchDone),
release tag `v0.3.27`. All primitives ship behind opt-in config flags:

| Primitive | Config flag | Default |
|---|---|---|
| Reflections | always on for `grd-planner` / `grd-verifier` | — |
| DEAD-ENDS read | always read by planner if file exists | — |
| Drift score | always computed by `gd health` | — |
| Strategy GENOME read | always read by planner if file exists | — |
| GENOME auto-snapshot | `evolve.auto_genome_snapshot` | `false` |
| Refinement loop | `refinement_loop` | `false` |
| Ontology convergence | `autopilot.stop_on_ontology_convergence` | `false` |

To exercise the full loop end-to-end against a sample project:

```bash
git clone https://github.com/ca1773130n/GetResearchDone
cd GetResearchDone/examples/taskmark
./start-tutorial.sh
# In Claude Code:
/grd:init
/grd:plan-phase 1
/grd:execute-phase 1
gd dead-end promote-from-phase 1
gd genome init
gd genome snapshot
gd health    # see drift_weighted
gd think     # one-shot project briefing aggregating all primitives
```

## 11. References

(arXiv preprint IDs and DOIs to be added on submission.)

- Shinn et al. (2023). *Reflexion: Language Agents with Verbal Reinforcement Learning*.
- Yang et al. (2024). *SWE-agent: Agent-Computer Interfaces Enable Automated Software Engineering*. arXiv:2405.15793
- Lu et al. (2024). *The AI Scientist: Towards Fully Automated Open-Ended Scientific Discovery*. arXiv:2408.06292
- Shao et al. (2024). *Assisting in Writing Wikipedia-like Articles From Scratch with Large Language Models*. arXiv:2402.14207
- Wang et al. (2023). *Voyager: An Open-Ended Embodied Agent with Large Language Models*. arXiv:2305.16291

---

*Document version: 1.0 (2026-05-24). Suitable for submission as an arXiv
preprint under cs.SE / cs.AI. Comments and corrections welcome via GitHub
issues on the GRD repository.*
