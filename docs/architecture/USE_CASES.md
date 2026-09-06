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

**Commands used most:** `/grd:init`, `/grd:survey`, `/grd:deep-dive`, `gd research "<question>"`, `/grd:plan-phase`, `/grd:execute-phase`, `/grd:assess-baseline`, `/grd:eval-report`, `/grd:iterate`

---

### Persona: R&D Team Lead

**Profile:** A technical lead overseeing a 3–6 person team running multiple parallel research workstreams. Juggles project management with hands-on coding. Frequently context-switches between projects and needs a reliable way to resume state.

**Goal:** Let agents handle the mechanical execution work (planning phases, writing code, opening PRs) while the human stays focused on research direction, architecture reviews, and milestone decisions.

**Pain points GRD addresses:**
- Agents that burn through the entire token budget on low-value tasks
- Multi-phase runs that silently stall at rate limits and require babysitting
- Phases that complete their pipelines but never actually get marked done, causing `gd autopilot` to misreport progress

**Commands used most:** `gd autopilot`, `gd settings token_profile balanced`, `gd health`, `gd progress`, `gd harness round`

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

**Commands used most:** `/grd:deep-dive`, `/grd:assess-baseline`, `/grd:plan-phase`, `/grd:execute-phase`, `/grd:eval-report`, `/grd:iterate`, `gd research`, `gd autoresearch`

---

## Scenarios

### Scenario 1: Researching a New Technique

**Context:** A solo ML researcher wants to explore whether a recent transformer variant improves performance on their document classification task. They have a repo but no GRD project yet.

They start with `/grd:init` to scaffold the `.planning/` directory structure, creating `ROADMAP.md`, `STATE.md`, and `config.json`. Then they run `/grd:survey "linear attention for document classification"` — the `grd-surveyor` agent scans arXiv and GitHub, assembles a `LANDSCAPE.md` with the top methods, key papers, and available open-source implementations, and saves per-paper analysis to `research/deep-dives/`. The researcher glances at the landscape, picks two candidates, and runs `/grd:compare-methods` to get a side-by-side analysis matrix covering throughput, memory, accuracy on standard benchmarks, and implementation complexity.

With a candidate chosen, they run `/grd:feasibility "linear attention"` to understand the gap between the paper's claims and a production-ready implementation in their specific codebase. GRD produces a feasibility report flagging two risky assumptions. Armed with this, the researcher runs `/grd:plan-phase 1` to create a focused plan for the first implementation phase. Before writing the plan, the planning-time clarification gate (`research_gates.plan_clarification`, default on, v0.4.5+) surfaces the ambiguous, unlocked design decisions it found — which attention variant to default to, whether to keep a fallback path — and asks the researcher to resolve them via AskUserQuestion rather than guessing. (The gate is skipped under `autonomous_mode`, `autopilot`, or `--candidates`.) With the decisions locked, they run `/grd:execute-phase 1` to let the executor work through it. They review the PR that autopilot opens, approve it, and repeat for subsequent phases.

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

### Scenario 3a: Answering a Research Question with the Station Loop

**Context (v0.5.0 / v0.6.0):** The same PhD student has a question rather than a metric to climb: *does retrieval-augmented prompting beat fine-tuning on our low-resource split?* They run `gd research "does RAG beat fine-tuning on the low-resource split?"`.

The loop runs SEED → GROUND → HYPOTHESIZE → DESIGN → RUN → MEASURE → LEARN → DECIDE → FINALIZE → PERSIST (Flow 7a in [FLOWS.md](FLOWS.md)). Three things shape what they see, and all three exist to stop the loop from flattering itself:

**Every hypothesis has to name its own falsifier.** The hypothesizer is asked for a `refutationCondition` — the observation that would show the hypothesis FALSE — and any candidate that omits it is dropped by the parser before ranking. A hypothesis with no stated way to be wrong never enters the ledger, so the student never spends an experiment on one.

**A verdict is deterministic, and "inconclusive" says why.** The plan commits to a metric, a comparator and a target up front; `evaluateVerdict` compares the number and nothing else judges it. When it cannot reach a verdict it reports the *cause*. `run_failed` means the script exited nonzero — an engineering fault, which the RUN stage retries up to `research_max_debug_depth` (default 0, so off unless the student turns it on). `metric_absent` means the script ran fine but never emitted the metric it had committed to be judged on. That is a *design* fault: the experiment could not have disconfirmed the hypothesis whatever it printed. So the loop re-enters DESIGN for the **same** hypothesis at the same iteration rather than burning a fresh one — bounded by the same `research_max_debug_depth` budget, shared with the debug loop rather than added to it. If several iterations in a row exhaust that budget without ever producing a measurable experiment, the run stops with DESIGN PLATEAU: the harness is telling the student it cannot design a falsifiable test for the question *as phrased*, which is a different problem from the hypotheses being wrong.

**What is learned comes back.** On a settled verdict the loop promotes takeaways into `KNOWHOW.md` and falsified hypotheses into `.planning/DEAD-ENDS.md`. The write gate is a conjunction over what is actually on disk — a recognised takeaway kind, non-empty evidence, a `supported`/`refuted` verdict, and real metrics in that iteration's `result.json` — not the mining agent's own confidence score. Later, when the student runs `/grd:plan-phase`, those entries are injected into the planner's prompt (and the executor's), because the KNOWHOW ranking now reserves slots for `research:`-sourced entries that would otherwise be out-scored by every phase-numbered one. Before v0.6.0 the loop mined knowledge that structurally could not be read back.

**Steering it, or not.** By default the loop never stops to ask anything (`research_gates.interactive.enabled` is false). Turning it on gives the student checkpoints at SEED, HYPOTHESIZE, DESIGN and DECIDE: the thread pauses, and they answer with `gd research resume <id> --answers <file>`. Crucially, an unattended run — autopilot, `autonomous_mode`, `--no-gates`, or a portfolio running several threads concurrently — **never** pauses. Each question resolves to its recommended default, or, with `fallback: "panel"`, is put to the AI discussion panel (`answerViaDiscussion`), which degrades back to those same defaults if the panel is empty or rate-limited. A checkpoint that nobody can answer resolves; it does not block.

---

### Scenario 4: Self-Improving via Life-Harness

**Context (v0.4.4+):** A builder has been running GRD-managed sessions for several months. Tesserae has accumulated session findings — takeaways, decisions, and insights from real usage. They want GRD to self-improve based on what it actually learned.

They run `gd harness round`. The round gathers the latest Tesserae session findings (bounded by `harness.min_evidence` / `harness.max_evidence`), spawns an agent to propose one concrete patch to GRD primitives (skills, config, or lib code), validates the patch against path guards, and runs the eval gate (lint + tsc + targeted jest when code is touched). In the default `autonomy: "review"` mode, the round leaves a branch `harness/round-<id>` for the builder to review and merge. A full record — evidence bundle, patch, eval result — is written to `.planning/harness/rounds/<id>/`.

**Distilled runbook memory (Tesserae 0.9.0, v0.4.5+):** as of Tesserae 0.9.0 the round consumes AgentRunbook memory — distilled `Runbook` (reusable procedures) and `Gotcha` (failure-mode) nodes — as first-class evidence alongside raw session findings, so a patch can be grounded in "this is the procedure that worked" and "this is the trap that bit us" rather than rediscovering both. If a round comes back empty-handed, it now hints at `tesserae config status` so the builder can check the graph is wired up and populated. The same release hardened the eval gate: round-port classes explicitly conform to the `autoresearch-core` port Protocols, and the eval no longer crashes when `lint`/`tsc`/`jest` time out or a tool is missing — those are classified via `classify_run_failure` and reported as a graded eval outcome instead of an exception.

For teams that want autonomous merging, `harness.autonomy: "auto"` in `.planning/config.json` causes rounds to merge automatically when eval passes and the proposal confidence exceeds `min_confidence` (default 0.7). A kill switch (`harness.kill_switch: true`) halts all round execution immediately without touching any files.

**Collective layer (Phase E, v0.4.4+):** Because `gd` is installed globally, many of this builder's projects use GRD — but a round in a downstream project can only patch that project's own files, not GRD's primitives (they live in the npm/plugin cache, not a git repo, and the path guards forbid it). So evidence *about GRD's own behavior* that accrues downstream — "this executor prompt failed me", "this gate fires too eagerly" — used to be stranded. Now, with `harness.upstream_emit: true` (default), each downstream round emits its GRD-about findings (matched by a conservative heuristic on `gd `/`/grd:` commands, `grd-<agent>` names, and harness vocabulary) as distilled upstream candidates into `$CLAUDE_PLUGIN_DATA/harness/upstream/` — finding text only, never transcripts or patches. When the builder later runs a round in the GRD repo itself — the **upstream root**, marked `harness.upstream_root: true` — those candidates are bound alongside local Tesserae findings into a composite evidence source, deduped across origins with an occurrence count (the same complaint from five projects is stronger signal). The builder can inspect what's pending with `gd harness upstream list` and prune with `gd harness upstream clear`. The candidates are evidence, not patches — the same kernel guards (path validation, deny-list, eval gate, review-mode default) contain them.

**Note:** `gd evolve` was deprecated 2026-06-06 and the verb no longer runs — it prints a redirect and exits. Use `gd harness round`: evidence from Tesserae session findings, eval-gated, git-reversible, where evolve was a static scan whose discovery saturated. `lib/evolve/` stays in-tree because `gd singularity` reads its history. See [docs/DEPRECATIONS.md](../DEPRECATIONS.md).

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

### `gd harness round` vs `gd research` vs `gd autoresearch`

| Situation | Use |
|---|---|
| Improving GRD itself based on real session learnings | `gd harness round` |
| One evidence-driven patch to GRD primitives | `gd harness round` |
| Want a branch/PR with a single improvement to review | `gd harness round` (default `autonomy: "review"`) |
| Have an open **question** and want falsifiable hypotheses tested against it | `gd research "<question>"` |
| Want the result written up as a finding, with takeaways fed back into planning | `gd research` |
| Want the experiment run in a sandbox rather than against your working tree | `gd research` (`research_sandbox`) |
| Have a measurable target and want autonomous iteration toward it in-repo | `gd autoresearch` |
| Iterating toward a quantitative metric (accuracy, throughput) by editing the repo | `gd autoresearch` |

> **Note:** `gd evolve` was deprecated 2026-06-06 and no longer runs — use `gd harness round`. See [docs/DEPRECATIONS.md](../DEPRECATIONS.md).

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

**Using `gd harness round` as a substitute for design decisions.** The harness proposes one evidence-driven patch per round. It does not make architectural decisions. If your codebase has a fundamental design problem, the harness will improve surface details without addressing the root. Use `gd deep-dive` or `gd discuss` for architectural reasoning instead. (Note: `gd evolve` is deprecated — use `gd harness round`.)

**Turning on `research_gates.auto_promote_falsified` to "capture more learning".** It is false by default for a reason. With it on, a phase reflection carrying `verdict: falsified` is written straight into `.planning/DEAD-ENDS.md` — and a DEAD-ENDS slug scores any future candidate plan that cites it at `-Infinity` in `select-candidate`, permanently and with no warning tier. Leave it off and read the `preview` the dry run prints; promote deliberately with `gd dead-end add` when you mean it. The only way back out is `gd dead-end retire <slug> --reason "..."`, which is the sole writer of `status: retired` and the only status that exempts an entry — every other value gates, fail-closed.

**Expecting `gd quick` to update ROADMAP.md or advance milestones.** Quick tasks are intentionally kept out of the roadmap system. If a quick task turns out to be significant enough to track, convert it into a proper phase with `gd add-phase` or `gd insert-phase`.

**Setting `token_profile: frugal` for phases that require deep reasoning.** Frugal mode aggressively routes to cheaper models even under low budget pressure. A `grd-planner` running on haiku may produce a plan that misses edge cases a sonnet-tier planner would catch. Use `balanced` or `quality` for planning-heavy phases and reserve `frugal` for execution-heavy or low-complexity work.

---

## See Also

- `OVERVIEW.md` — System overview, component map, and key concepts
- `FLOWS.md` — Detailed flow diagrams for autopilot, phase execution, the life-harness round, and the `gd research` station loop (`gd evolve` is retained there as deprecated historical reference)
- `CONFIG.md` — All config fields in `.planning/config.json`, including `token_profile`, `phase_complete_llm_fallback`, and scheduler settings
- `MAINTENANCE.md` — Operational guidance: logs, metrics, recovery procedures, upgrade notes
