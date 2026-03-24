# Discussion: We just merged two PRs (#19 phase-82 and #20 phase-86) into main and hit 3 merge conflicts in lib/discussion.ts. Both branches independently modified extractQuestion(), buildElicitationContext(), and resolveElicitation(). This keeps happening because our parallel phase execution model lets multiple phases touch the same files concurrently. What should we do? Options: (1) Implement Autopilot v2 with post-phase pipeline (simplify, PR, review, rebase+merge) so conflicts are caught early per-phase, (2) Add file-level dependency tracking between phases so overlapping phases run sequentially, (3) Add a pre-merge conflict detection step in the current autopilot before phases start, (4) Something else. Consider tradeoffs for a CLI tool codebase with 24 lib/ modules, 43 commands, 20 agents.

**Phase:** unknown  **Type:** discussion  **Participants:** claude, codex, opencode
**Synthesizer:** claude  **Rounds:** 1  **Duration:** 241965ms
**Timestamp:** 2026-03-24T03:59:32.208Z

## Round 1

### claude Response
Good context. I can see the full picture now — your autopilot v2 design already includes the post-phase pipeline with serial rebase+merge, and it's partially implemented. The conflict you hit with phases 82 and 86 on `lib/discussion.ts` is exactly the scenario the serial pipeline is designed to handle.

Before I propose approaches, one clarifying question:

**How often do your phases actually touch the same files?** Specifically:

- Was the `lib/discussion.ts` overlap between phases 82 and 86 a one-off because both phases were part of the "Elicitation Replacement" milestone and naturally touched the same discussion infrastructure?
- Or do you see this as a recurring pattern where independent-seeming phases (different `depends_on` chains) regularly modify the same core modules like `backend.ts`, `state.ts`, `discussion.ts`?

This matters because it determines whether the solution should optimize for *preventing* overlapping phases from running in parallel (option 2/3) vs. *handling conflicts gracefully when they inevitably happen* (option 1).
---

### codex Response
You should do a hybrid, not pick only one option.

The immediate fix is: keep the post-phase rebase/merge pipeline as the hard safety gate, but add write-set aware scheduling before parallel execution. For this repo, I would not implement full generic file-level dependency inference as the primary model. I would implement declared write-intent manifests per phase, use those manifests to split waves, and treat the post-pipeline as the final correctness check.

Why:

- Option 1 is necessary but not sufficient. A rebase/merge pipeline is the only place you know whether a phase really integrates with `main`. Your autopilot already has most of this shape in [lib/autopilot.ts](/Users/neo/Developer/Projects/GetResearchDone/lib/autopilot.ts), including serialized post-pipeline rebase/merge and conflict handling. But by itself it catches conflicts late, after you already paid for full execution.
- Option 2 in pure form is too heavy for this codebase. With ~24-27 `lib/` modules, lots of cross-cutting CLI glue, and AI-generated edits, true file-level dependency tracking will be noisy, brittle, and likely over-serialize useful parallelism. Static prediction of exact touched files is never reliable enough.
- Option 3 alone is too weak. A pre-merge conflict detector before phases start can only guess from plans or past hotspots. It cannot know the actual diff yet, so it will miss real conflicts or flag false ones.

What I’d do:

1. Add a required per-phase `files_modified` or `write_intent` manifest at planning time.
2. Before building parallel waves, split same-wave phases when their declared write sets overlap.
3. Keep the serialized post-phase rebase/merge pipeline as the final gate.
4. After execution, compare declared vs actual changed files and feed that back into planner quality checks.
5. Refactor hotspot modules that keep colliding, starting with [lib/discussion.ts](/Users/neo/Developer/Projects/GetResearchDone/lib/discussion.ts).

That last point matters. Your conflict was not random. Two phases both changed `extractQuestion()`, `buildElicitationContext()`, and `resolveElicitation()` in the same module. That means [lib/discussion.ts](/Users/neo/Developer/Projects/GetResearchDone/lib/discussion.ts) is becoming a contention hotspot. The structural fix is to split it into smaller ownership units, for example dispatch, discussion orchestration, and elicitation resolution. Smaller files reduce both merge conflicts and planning ambiguity.

So the recommendation is:

- Adopt Option 1 as the safety net.
- Implement a lighter version of Option 2 using planned write manifests, not full dependency inference.
- Use Option 3 only as an advisory warning layer.
- Add hotspot decomposition as the real long-term fix.

If you force me to choose one: choose Option 1 plus manifest-based scheduling. That gives the best tradeoff between throughput and reliability for this codebase.
---

### opencode Response
Given your scale (24 modules, 43 commands), I'd recommend **Option 1 (Autopilot v2)** — it's the cleanest fix because it eliminates the conflict model entirely rather than detecting/mitigating it.

**Why Option 1 over others:**

| Option | Problem |
|--------|---------|
| Option 2 (file-level tracking) | Tracking granularity is hard — does "phase 82 modified discussion.ts" mean it touched all 3 functions or just one? You'd need per-function tracking to be effective, which is essentially what a PR review gives you for free. |
| Option 3 (conflict detection) | Reactive, not preventive. You'd still need to resolve conflicts manually; it just fails faster. |

**Autopilot v2 flow:**
```
Phase N completes → simplify → PR → review → rebase+merge → Phase N+1 starts
```

**Tradeoffs for your codebase:**
- **Pros:** Each phase's changes are isolated and integrated before the next begins. Conflicts become impossible (rebase solves them sequentially). Simpler mental model.
- **Cons:** Loses parallelism between phases (but your conflicts suggest parallelism isn't working anyway). 2x-3x slower execution in the common case.
- **Reality check:** If your phases truly need to modify the same files concurrently, you have a phase decomposition problem — the phases themselves are too coarse-grained.

**Implementation note:** You'd keep `gd autopilot` but add a `PIPELINE_MODE` config flag. Existing `gd execute-phase <N>` stays unchanged for manual/explicit execution. This gives you a migration path rather than a breaking change.

Want me to sketch out the `autopilot-v2.ts` structure?
---

## Synthesis (claude)

## Synthesis: Handling Parallel Phase Merge Conflicts

### Consensus (all three agree)

1. **Option 1 (post-phase pipeline with serial rebase+merge) is necessary** — every response treats it as the baseline safety net
2. **Option 3 alone is insufficient** — pre-merge detection without actual diffs is guesswork
3. **`lib/discussion.ts` is a structural problem**, not just a scheduling problem — the file is a contention hotspot that should be decomposed

### Key Disagreement: How much to invest in preventing conflicts vs. handling them

| Approach | Advocate | Tradeoff |
|----------|----------|----------|
| Serial pipeline only (Option 1) | OpenCode | Simplest, but kills parallelism entirely |
| Pipeline + write-intent manifests | Codex | Preserves safe parallelism, adds planning overhead |
| Depends on conflict frequency | Claude | Wants data before committing to complexity |

### Unique Insights

- **Claude** raises the right diagnostic question: is this a one-off because both phases targeted elicitation infrastructure, or a systemic pattern? The answer should size the solution.
- **Codex** proposes the most actionable hybrid: declared `write_intent` manifests at planning time → wave splitting on overlap → serial post-pipeline as final gate → declared-vs-actual feedback loop. This is pragmatic for 24 modules.
- **OpenCode** makes the sharpest architectural point: if phases truly need to modify the same files concurrently, that's a phase decomposition problem, not a tooling problem.

### Unified Recommendation

**Do three things, in order of urgency:**

1. **Ship the serial post-phase pipeline now** (Option 1). Your autopilot v2 design already has this partially implemented. This is the hard safety gate — conflicts become rebase failures caught per-phase instead of multi-PR disasters. This is non-negotiable regardless of what else you do.

2. **Add lightweight write-intent declarations to phase plans.** At planning time, each phase declares which `lib/` modules it expects to modify. The autopilot wave builder checks for overlap and serializes conflicting phases within a wave. This preserves parallelism for non-overlapping phases (the common case) without requiring full dependency inference. Compare declared vs. actual post-execution to improve planner accuracy over time.

3. **Decompose `lib/discussion.ts`** into smaller ownership units (e.g., `discussion-dispatch.ts`, `discussion-orchestration.ts`, `elicitation.ts`). This is the structural fix. Smaller files reduce both merge conflicts and the blast radius of any single phase. Apply the same treatment to any module that becomes a repeat offender.

**What to skip:** Full file-level dependency tracking (Option 2 in pure form) is over-engineered for 24 modules. Pre-merge conflict detection (Option 3) adds value only as an advisory warning, not a gate.

**Net effect:** You keep parallel execution for independent phases, catch conflicts early via serial merge pipeline, and reduce conflict surface area through module decomposition. The write-intent manifests are the lever that lets you have both speed and safety.

## Outcome

## Synthesis: Handling Parallel Phase Merge Conflicts

### Consensus (all three agree)

1. **Option 1 (post-phase pipeline with serial rebase+merge) is necessary** — every response treats it as the baseline safety net
2. **Option 3 alone is insufficient** — pre-merge detection without actual diffs is guesswork
3. **`lib/discussion.ts` is a structural problem**, not just a scheduling problem — the file is a contention hotspot that should be decomposed

### Key Disagreement: How much to invest in preventing conflicts vs. handling them

| Approach | Advocate | Tradeoff |
|----------|----------|----------|
| Serial pipeline only (Option 1) | OpenCode | Simplest, but kills parallelism entirely |
| Pipeline + write-intent manifests | Codex | Preserves safe parallelism, adds planning overhead |
| Depends on conflict frequency | Claude | Wants data before committing to complexity |

### Unique Insights

- **Claude** raises the right diagnostic question: is this a one-off because both phases targeted elicitation infrastructure, or a systemic pattern? The answer should size the solution.
- **Codex** proposes the most actionable hybrid: declared `write_intent` manifests at planning time → wave splitting on overlap → serial post-pipeline as final gate → declared-vs-actual feedback loop. This is pragmatic for 24 modules.
- **OpenCode** makes the sharpest architectural point: if phases truly need to modify the same files concurrently, that's a phase decomposition problem, not a tooling problem.

### Unified Recommendation

**Do three things, in order of urgency:**

1. **Ship the serial post-phase pipeline now** (Option 1). Your autopilot v2 design already has this partially implemented. This is the hard safety gate — conflicts become rebase failures caught per-phase instead of multi-PR disasters. This is non-negotiable regardless of what else you do.

2. **Add lightweight write-intent declarations to phase plans.** At planning time, each phase declares which `lib/` modules it expects to modify. The autopilot wave builder checks for overlap and serializes conflicting phases within a wave. This preserves parallelism for non-overlapping phases (the common case) without requiring full dependency inference. Compare declared vs. actual post-execution to improve planner accuracy over time.

3. **Decompose `lib/discussion.ts`** into smaller ownership units (e.g., `discussion-dispatch.ts`, `discussion-orchestration.ts`, `elicitation.ts`). This is the structural fix. Smaller files reduce both merge conflicts and the blast radius of any single phase. Apply the same treatment to any module that becomes a repeat offender.

**What to skip:** Full file-level dependency tracking (Option 2 in pure form) is over-engineered for 24 modules. Pre-merge conflict detection (Option 3) adds value only as an advisory warning, not a gate.

**Net effect:** You keep parallel execution for independent phases, catch conflicts early via serial merge pipeline, and reduce conflict surface area through module decomposition. The write-intent manifests are the lever that lets you have both speed and safety.
