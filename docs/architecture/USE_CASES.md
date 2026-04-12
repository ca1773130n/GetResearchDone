# GRD Use Cases

Who uses GRD, what they accomplish with it, and narrative walkthroughs of real scenarios.

---

## Personas

### Persona: Solo ML Researcher

**Profile:** A researcher working independently on a novel technique — perhaps a PhD student or postdoc implementing the baseline system for a paper, or an independent practitioner applying recent SoTA methods to a new domain.

**Goal:** Move from "I read a paper" to "I have working, evaluated code" without losing track of research artifacts, experiment results, or the decision trail.

**Pain points GRD addresses:**
- Keeping paper notes, code, and eval results in one coherent place
- Knowing what to do next when an experiment stalls or fails
- Spending hours on boilerplate (phase planning, commit hygiene, report generation) that crowds out thinking time

**Commands used most:** `/grd:init`, `/grd:survey`, `/grd:deep-dive`, `/grd:plan-phase`, `/grd:execute-phase`, `/grd:assess-baseline`, `/grd:eval-report`, `/grd:iterate`

---

### Persona: R&D Team Lead

**Profile:** A technical lead overseeing a 3–6 person team running multiple parallel research workstreams. Juggles project management with hands-on coding. Frequently context-switches between projects and needs a reliable way to resume state.

**Goal:** Let agents handle the mechanical execution work (planning phases, writing code, opening PRs) while the human stays focused on research direction, architecture reviews, and milestone decisions.

**Pain points GRD addresses:**
- Agents that burn through the entire token budget on low-value tasks
- Multi-phase runs that silently stall at rate limits and require babysitting
- Phases that complete their pipelines but never actually get marked done, causing `gd autopilot` to misreport progress

**Commands used most:** `gd autopilot`, `gd settings token_profile balanced`, `gd health`, `gd progress`, `gd evolve`

---

### Persona: Indie Founder / Applied AI Builder

**Profile:** A builder shipping a product that relies on a novel ML or NLP component. Not a researcher by training, but needs research-quality discipline when adopting new techniques — because getting the technique wrong means shipping something that doesn't work.

**Goal:** Evaluate 2–3 competing approaches, pick the best one, implement it, and ship — all without hiring a research team.

**Pain points GRD addresses:**
- No structured way to compare approaches before committing to one
- Unclear when a phase is "done enough" to move forward
- Wasted time prompting the agent to do the same tasks repeatedly across sessions

**Commands used most:** `/grd:survey`, `/grd:compare-methods`, `/grd:feasibility`, `/grd:quick`, `/grd:autopilot`, `/grd:settings`

---

### Persona: CS PhD Student (Reproducing Prior Work)

**Profile:** A first- or second-year PhD student tasked with reproducing a paper's results as a prerequisite to building on top of them. Often working on a shared cluster with tight compute budgets and unreliable network access.

**Goal:** Reproduce a published result faithfully, document what changed from the paper's description, and produce an eval report their advisor can review.

**Pain points GRD addresses:**
- Papers with incomplete implementation details that require guesswork
- No clear structure for capturing "we tried X and it failed because Y"
- Long training runs that fail at hour 6 with no automatic recovery

**Commands used most:** `/grd:deep-dive`, `/grd:assess-baseline`, `/grd:plan-phase`, `/grd:execute-phase`, `/grd:eval-report`, `/grd:iterate`, `gd autoresearch`

---

## Scenarios

### Scenario 1: Researching a New Technique

**Context:** A solo ML researcher wants to explore whether a recent transformer variant improves performance on their document classification task. They have a repo but no GRD project yet.

They start with `/grd:init` to scaffold the `.planning/` directory structure, creating `ROADMAP.md`, `STATE.md`, and `config.json`. Then they run `/grd:survey "linear attention for document classification"` — the `grd-surveyor` agent scans arXiv and GitHub, assembles a `LANDSCAPE.md` with the top methods, key papers, and available open-source implementations, and saves per-paper analysis to `research/deep-dives/`. The researcher glances at the landscape, picks two candidates, and runs `/grd:compare-methods` to get a side-by-side analysis matrix covering throughput, memory, accuracy on standard benchmarks, and implementation complexity.

With a candidate chosen, they run `/grd:feasibility "linear attention"` to understand the gap between the paper's claims and a production-ready implementation in their specific codebase. GRD produces a feasibility report flagging two risky assumptions. Armed with this, the researcher runs `/grd:plan-phase 1` to create a focused plan for the first implementation phase, then `/grd:execute-phase 1` to let the executor work through it. They review the PR that autopilot opens, approve it, and repeat for subsequent phases.

---

### Scenario 2: Running a Week-Long Autopilot Session

**Context:** A team lead has a milestone with eight phases planned. The week is light on meetings. They want to hand off execution entirely and come back to find phases merged and STATE.md updated.

Before stepping away, they run `gd settings token_profile balanced` to ensure agents adapt model tiers under budget pressure — trading some quality on simple tasks for headroom on the phases that matter. Then they launch `gd autopilot` in the background. Under the hood, GRD groups phases into dependency waves, spawns each phase in its own git worktree for filesystem isolation, and runs a post-phase pipeline for each: code simplification, PR creation, automated code review with BLOCKER/WARNING resolution, and rebase-and-merge back to main. After the pipeline completes, the new `phase-finalize` step automatically runs `_phaseCompleteCore`: ROADMAP.md gets its checkbox ticked, STATE.md's `Current Phase` advances, and quality analysis runs.

When the team lead returns, `gd progress` shows eight phases complete and merged, `gd health` lists no blockers, and a wireup step has already identified unwired features left over from the milestone. They review the PR history, make two follow-up tweaks with `gd quick`, and call the milestone done.

---

### Scenario 3: Debugging a Failing Agent (Karpathy Loop)

**Context:** A PhD student is trying to reproduce a model that should achieve >80% accuracy on their benchmark. After three manual iterations that all stall around 73%, they switch to the autoresearch loop.

They run `gd autoresearch "improve classification accuracy" --metric test_accuracy --target 0.80`. GRD launches the Karpathy-style autonomous experiment loop: a survey phase gathers relevant techniques, then the loop begins iterating — each iteration spawns an executor to implement a change, runs the eval harness, logs the metric, and selects the next direction based on results. Unlike manual iteration, the loop now routes all subprocess calls through the scheduler (`lib/scheduler.ts`), so the student's token budget is tracked and the loop waits intelligently when rate limits are hit rather than giving up.

After 14 iterations overnight, the loop finds a combination of label smoothing and a modified attention mask that reaches 81.2%. The result is committed to the repo with a summary file documenting each iteration's changes, metric values, and rejection reasons. The student can review the full decision trail with `gd eval-report`.

---

### Scenario 4: Self-Improving via Evolve

**Context:** A builder has accumulated several months of GRD-managed code. Tests are green but the codebase has grown organically — some functions are long, some error messages are unhelpful, and there are a handful of missing JSDoc blocks.

They run `gd evolve --iterations 3` in the background. Each iteration runs a discover phase that finds 5–10 specific, immediately implementable improvements (long function refactors, error message clarity, JSDoc gaps), groups them by theme, selects the top 50% by priority, executes them in a single subprocess call, then runs a review pass and commits. The next iteration discovers against the now-improved codebase, building on prior changes. After three iterations, GRD opens a PR with the cumulative improvements. All execution is ceiling-capped at sonnet-tier models — evolve never uses opus-class models — keeping the cost predictable.

For teams that want more autonomy, `gd evolve --infinite --max-cycles 5` extends the loop further: each cycle discovers improvements, creates a new milestone via `autoplan`, and executes all phases via `autopilot`, repeating until the cycle limit or time budget runs out.

---

### Scenario 5: Recovering from a Rate-Limit Storm

**Context:** A team lead kicks off `gd autopilot` for a six-phase milestone on a Friday afternoon. By Saturday morning, they check in to find that all three of their Claude accounts have hit their weekly token ceilings.

Without Spec 2A's fix, GRD would have silently abandoned work and left phases in a partially-done state. With the fix in place, when the scheduler's `resolveAccount` finds no priority account with headroom, it computes the earliest time any account will regain capacity — derived from the sample aging of its rolling token window — and issues a bounded wait (capped at `max_wait_minutes`, default 90 minutes). A `SIGINT` during the wait cancels gracefully. As each account's window clears, the scheduler resumes dispatching. By Sunday morning when the team lead checks in, all six phases have completed and merged. The only sign of the disruption is a log line per wait period: `[scheduler] waiting 47m for account #2 to regain headroom`.

---

### Scenario 6: Mechanical Phase Completion in Autopilot

**Context:** An indie founder is running a four-phase autopilot to add a new feature. In prior GRD versions, autopilot would run each phase's full pipeline — plan, execute, verify, post-pipeline — but stop short of formally completing the phase. The ROADMAP.md checkbox stayed unticked, STATE.md's `Current Phase` never advanced, and the next-milestone transition would silently fail because `_isAllPhasesComplete` checked `disk_status === 'complete'` but found it never set.

With Spec 3 in place, autopilot's post-pipeline success path now calls `completePhaseAfterPostPipeline` automatically. The function runs the preflight gate check, rewrites the ROADMAP.md checkbox from `[ ]` to `[x]`, updates STATE.md's `Current Phase` and `Status` fields, runs quality analysis, and generates a cleanup plan. The new `phase-finalize` status marker tracks this step — the autopilot dashboard shows `phase-finalize: completed` alongside the existing `post-pipeline: completed` marker. After all four phases complete, `gd progress` reports a fully clean milestone with no manual intervention required.

---

### Scenario 7: Opting into LLM Fallback After Mechanical Completion Fails

**Context:** A researcher has hand-edited their `ROADMAP.md` to use a non-standard section format — their phase headings don't match the `- [ ] Phase N: Title` checkbox pattern that Spec 3's regex-based `_phaseCompleteCore` expects.

After a phase pipeline completes, `completePhaseAfterPostPipeline` runs but `_phaseCompleteCore` throws a regex mismatch. Normally this would log an error and leave the phase in a limbo state, requiring the user to manually edit the files. But the researcher has opted in to the LLM fallback by running `gd settings phase_complete_llm_fallback true`. When the mechanical path fails, GRD reads the current `ROADMAP.md` and `STATE.md`, constructs a prompt describing what needs to happen (tick the Phase N checkbox, update Current Phase, update Status), dispatches a Claude subprocess via the scheduler, and then re-reads `ROADMAP.md` to verify the checkbox is now ticked. If verification passes, the result is treated as a successful completion. The fallback respects `token_profile` and budget pressure just like any other scheduled spawn, and it is never triggered on a successful mechanical completion — the overhead only occurs in the edge case where it's actually needed.

---

## Decision Matrix

### `gd quick <desc>` vs `gd plan-phase`

| Situation | Use |
|---|---|
| One-off change: add a flag, fix a typo, update a doc | `gd quick` |
| Focused task that fits in a single commit | `gd quick` |
| Multi-step work with research inputs, eval gates, or reviewer approval | `gd plan-phase` |
| Work that should appear in ROADMAP.md and advance STATE.md | `gd plan-phase` |
| Exploratory change you might throw away | `gd quick` |

### `gd autopilot` vs manual `plan-phase` + `execute-phase`

| Situation | Use |
|---|---|
| Multiple phases with known dependencies | `gd autopilot` |
| Want phases to auto-complete and advance STATE.md | `gd autopilot` |
| Single phase or just exploring what a plan looks like | `gd plan-phase` manually |
| Need to inspect the plan before any execution | `gd plan-phase` manually, then `gd execute-phase` |
| Want full control over each step's outcome | Manual |
| Comfortable leaving the run unattended | `gd autopilot` |

### `gd evolve` vs `gd autoresearch`

| Situation | Use |
|---|---|
| Improving the codebase itself (refactors, error messages, docs) | `gd evolve` |
| Iterating toward a quantitative metric (accuracy, throughput) | `gd autoresearch` |
| No specific target — general quality improvements | `gd evolve` |
| Have a measurable target and want autonomous iteration toward it | `gd autoresearch` |
| Want a PR with improvements to review | Either (both open PRs) |

### `token_profile: frugal` vs `balanced` vs `quality`

| Profile | When to use |
|---|---|
| `quality` | Tight deadlines, critical phases, never want model downgrade unless at 95%+ budget pressure |
| `balanced` | Default for most teams; downgrades 0–2 tiers on simple tasks or when budget is at ≥60–80% |
| `frugal` | Long unattended runs on a constrained budget; aggressively routes to cheaper models even at low pressure |

---

## Anti-Patterns

**Using GRD for purely exploratory, open-ended research without a goal.** GRD is structured around phases with verifiable outcomes. If you have no idea what you're building toward, the structure becomes overhead rather than help. Use GRD once you have at least a rough research question or a concrete technique to evaluate.

**Running `gd autopilot` on phases with no plans yet.** Autopilot expects plans to exist (or creates them). If you have an empty roadmap and run autopilot cold, the planning agents will make assumptions about scope that may not match your intent. Better to run `/grd:plan-phase 1` interactively first so you can steer the plan, then hand off to autopilot.

**Using `gd evolve` as a substitute for design decisions.** Evolve's discover→execute loop finds patterns that are mechanically improvable: long functions, missing JSDoc, weak error messages. It does not make architectural decisions. If your codebase has a fundamental design problem, evolve will polish the surface without addressing the root. Use `gd deep-dive` or `gd discuss` for architectural reasoning instead.

**Expecting `gd quick` to update ROADMAP.md or advance milestones.** Quick tasks are intentionally kept out of the roadmap system. If a quick task turns out to be significant enough to track, convert it into a proper phase with `gd add-phase` or `gd insert-phase`.

**Setting `token_profile: frugal` for phases that require deep reasoning.** Frugal mode aggressively routes to cheaper models even under low budget pressure. A `grd-planner` running on haiku may produce a plan that misses edge cases a sonnet-tier planner would catch. Use `balanced` or `quality` for planning-heavy phases and reserve `frugal` for execution-heavy or low-complexity work.

---

## See Also

- `OVERVIEW.md` — System overview, component map, and key concepts
- `FLOWS.md` — Detailed flow diagrams for autopilot, evolve, and phase execution
- `CONFIG.md` — All config fields in `.planning/config.json`, including `token_profile`, `phase_complete_llm_fallback`, and scheduler settings
- `MAINTENANCE.md` — Operational guidance: logs, metrics, recovery procedures, upgrade notes
