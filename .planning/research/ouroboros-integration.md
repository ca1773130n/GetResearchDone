# OUROBOROS Integration Proposal for GRD

**Date:** 2026-05-17
**Status:** Critical revision / implementation triage
**Author research date range:** Feb 2026 - May 2026

## Caveat upfront - benchmark and repository claims

No Ouroboros project in this research set should be treated as a
leaderboard winner. The benchmark claim remains unverified and is not a
reason to import any pattern. Import only patterns that fit GRD's actual
architecture: a TypeScript CLI/plugin with `lib/` orchestration modules,
markdown agents in `agents/`, slash commands in `commands/`, and a
multi-backend abstraction over Claude, Codex, Gemini, OpenCode, Overstory,
Superpowers, and native GRD mode.

## The four Ouroboros projects worth comparing

| Project | Role for GRD | Import stance |
| --- | --- | --- |
| **Q00/ouroboros** ("Agent OS") | Spec-first planning, gates, evaluator discipline | Use selectively; GRD already has gates, post-pipeline review, model-tier routing, and discussions. |
| **Kargatharaakash/ouroboros** | Generational loop, genome/hypothesis vocabulary, lineage artifacts | Use the hypothesis/accounting pieces first; defer population tournaments. |
| **razzant/ouroboros** (joi-lab fork) | Identity-core docs, supervisor/agent split, background loop | Mostly already covered or too speculative for core GRD. |
| **TomzxCode/ouroboros** | Clean execute/learn/improve/retry separation | Keep the separation as policy; do not import autonomous self-editing. |

## Verified GRD anchors

| Claim checked | Verdict | Evidence |
| --- | --- | --- |
| `lib/phase.ts` owns phase lifecycle, not plan generation | Keep, but narrow. It lists/adds/removes/completes phases and validates consistency; it does not generate PLAN.md content. | `lib/phase.ts:3`, `lib/phase.ts:1661`, `lib/phase.ts:1793` |
| `lib/frontmatter.ts` parses arbitrary scalar frontmatter | Keep. Unknown fields survive `extractFrontmatter` and `spliceFrontmatter`; the plan schema only requires existing fields. | `lib/frontmatter.ts:68`, `lib/frontmatter.ts:100`, `lib/frontmatter.ts:274` |
| `cmdValidateConsistency` does not reject extra PLAN.md frontmatter | Keep. It currently only warns when `wave` is missing. | `lib/phase.ts:1806`, `lib/phase.ts:1810` |
| Planner/verifier prompts are agent markdown, not command markdown | Corrected. Files are under `agents/`; `commands/grd-planner.md` and `commands/grd-verifier.md` do not exist. | `agents/grd-planner.md:1`, `agents/grd-verifier.md:1` |
| GRD already has experiment frontmatter vocabulary | Keep. Planner already recommends nested `experiment.hypothesis`; executor already references a `hypothesis` field in summaries. | `agents/grd-planner.md:198`, `agents/grd-planner.md:212`, `agents/grd-executor.md:118` |
| `lib/verify.ts` is mechanical CLI verification, not the LLM verifier agent | Corrected. It checks summaries, plan structure, artifacts, references, commits, and key links. | `lib/verify.ts:3`, `lib/verify.ts:210` |
| `agents/grd-verifier.md` is the LLM-style verifier prompt and cannot edit | Keep. It creates VERIFICATION.md conceptually but has Read/Bash/Grep/Glob only and `disallowedTools: Edit`. | `agents/grd-verifier.md:1`, `agents/grd-verifier.md:4`, `agents/grd-verifier.md:8` |
| Scheduler is `lib/scheduler.ts`, not `lib/scheduler/` | Corrected. It contains backend adapters, account rotation, usage tracking, and budget pressure. | `lib/scheduler.ts:27`, `lib/scheduler.ts:142`, `lib/scheduler.ts:232` |
| Backend capability and model-tier routing already exist | Keep. Capabilities live in `BACKEND_CAPABILITIES`; adaptive tiering lives in `getEffectiveTierForDispatch`. | `lib/backend.ts:98`, `lib/backend.ts:102`, `lib/backend.ts:1084` |
| Multi-backend discussion already exists | Keep. `dispatchToBackend` and `runDiscussion` dispatch to configured backends and write discussion history. | `lib/discussion.ts:4`, `lib/discussion.ts:18`, `lib/discussion.ts:366` |
| Post-phase code review is already mandatory in autopilot pipeline | Keep. Autopilot creates a PR, runs a code-review step, then rebases/merges. | `lib/autopilot-pipeline.ts:788`, `lib/autopilot-pipeline.ts:827`, `lib/autopilot-pipeline.ts:841` |
| Evolve discovers/groups/executes work items, but not "drift score" | Corrected. Discovery and grouping exist; Q00 weighted drift is not present. | `lib/evolve/discovery.ts:3`, `lib/evolve/orchestrator.ts:168` |
| Worktree/parallel execution exists, but native isolation is backend-dependent | Keep. Parallel mode depends on teams/config; native worktree isolation is capability-gated. | `lib/parallel.ts:4`, `lib/parallel.ts:192`, `lib/backend.ts:102` |
| `.planning/EVOLUTION.md` exists; `.planning/PRINCIPLES.md` does not | Corrected. Do not cite PRINCIPLES as an existing GRD primitive. | `.planning/EVOLUTION.md`; no matching `.planning/PRINCIPLES.md` in repo scan |

## Patterns x GRD mapping

| Ouroboros pattern | Source | Revised GRD home | Gap / Reuse | Critical revision |
| --- | --- | --- | --- | --- |
| Ambiguity gate before code | Q00 | `agents/grd-planner.md` plus pre-plan discussion in `lib/discussion.ts` | Partial reuse | Do not add a blocking Socratic agent first. GRD already exposes pre-planning discussion context (`lib/context/execute.ts:638`). Start with planner-required assumptions fields. |
| Immutable seed spec | Q00 | Phase `CONTEXT.md`, ROADMAP goal, and PLAN.md frontmatter | Partial reuse | No proof PLAN.md is immutable. Add a small `seed_spec:` scalar or `SEED.md` only after defining who writes it. |
| Double Diamond phases | Q00 | `lib/autopilot-waves.ts`, `lib/parallel.ts` | Weak fit | Cut from near-term. GRD waves are dependency/write-intent scheduling, not Discover/Define/Design/Deliver. |
| 3-stage eval gate: Mechanical -> Semantic -> Consensus | Q00 | `lib/verify.ts`, `agents/grd-verifier.md`, `lib/discussion.ts` | Partial reuse | Mechanical exists; semantic verifier exists as an agent prompt; consensus should reuse discussion/reviewer backend rather than inventing a new verifier stack. |
| PAL Router auto-escalate | Q00 | `lib/backend.ts`, `lib/scheduler.ts` | Partial reuse | Token-profile downgrade exists; verify-fail escalation does not. Implement only as per-work-item retry metadata, not global model mutation. |
| Drift detection weighted score | Q00 | `lib/evolve/discovery.ts`, `lib/commands/health.ts` | Gap | Good idea, but not Tier 1: needs definitions for goal/constraint/ontology drift and data sources. |
| Ontology similarity convergence | Q00 | `lib/autopilot-pipeline.ts` refinement loop concepts | Gap | Existing convergence is metric-based inside opt-in refinement, not autopilot termination. Defer. |
| Stagnation personas | Q00 | `lib/evolve/discovery.ts` | Gap | Cut from integration plan. Too prompt-heavy and unmeasured. |
| Genome.md generational rewrite | Kargatharaakash | `.planning/EVOLUTION.md` plus optional `.planning/GENOME.md` | Gap | Defer until evolve has stable feedback quality. Rewriting strategy docs can destabilize the workflow. |
| Hypothesis -> prediction -> outcome tracker | Kargatharaakash | PLAN.md scalar fields, `agents/grd-planner.md`, `agents/grd-verifier.md` | Small gap | Best first import. Frontmatter parser tolerates added scalar keys; current validation will not reject them. |
| Divergence scoring | Kargatharaakash | `lib/evolve/scoring.ts` | Gap | Defer; current scoring already groups/selects work. Need empirical signal before adding axes. |
| Population tournament | Kargatharaakash | `lib/autopilot.ts`, `lib/worktree.ts`, `lib/parallel.ts` | Heavy gap | Not Tier 1. Expensive and risky across backends because native worktree isolation is not universal. |
| Lineage artifacts | Kargatharaakash | Phase directories under `.planning/milestones/.../phases/...` | Partial reuse | Add only `REFLECTION.md` after verification. Do not add anomaly/genome bundles yet. |
| Knowledge graph + dead-ends registry | Kargatharaakash | `lib/knowledge.ts`, `KNOWHOW.md`, possible `DEAD-ENDS.md` | Partial reuse | GRD already mines reusable KNOWHOW; dead-ends registry is useful but second PR. |
| BIBLE.md identity core | razzant | New `.planning/PRINCIPLES.md` only if command support exists | Gap | Cut "already exists" claim. No `gd principles` implementation was verified. |
| Supervisor + agent split | razzant | `lib/scheduler.ts`, `lib/autopilot-pipeline.ts`, `agents/*.md` | Reuse | Keep as descriptive only. No rename needed. |
| Background consciousness loop | razzant | No near-term GRD home | Gap | Cut from core proposal. It conflicts with predictable CLI behavior unless explicitly user-triggered. |
| 9-step execute/reflect separation | TomzxCode | `gd autopilot`, `gd evolve`, post-phase pipeline | Partial reuse | Keep as policy: evolve changes GRD; autopilot executes project work. Do not enforce new reflection phases yet. |
| Persistent journal of every action | TomzxCode | `.planning/STATE.md`, `.planning/autopilot/*.json` | Partial reuse | Add targeted REFLECTION.md, not append-only JOURNAL.md. Full journals create noise and merge conflicts. |
| Self-modification only during reflection cycles | TomzxCode | `gd evolve` boundary and code review pipeline | Reuse | Keep as safety rule. Never allow auto-editing `lib/` without review. |

## Ranked integration priorities

### Tier 1 - mergeable under 500 LOC each

| Rank | Item | Why now | Estimated GRD change |
| --- | --- | --- | --- |
| 1 | **PLAN.md hypothesis/accounting scalars + REFLECTION.md** | Smallest useful loop: planner states a claim, verifier records outcome, future planners can inspect it. Compatible with permissive frontmatter. | `agents/grd-planner.md`, `agents/grd-verifier.md`, focused tests in `tests/unit/frontmatter.test.ts` or existing frontmatter coverage; optional phase-info surfacing. |
| 2 | **Verifier evidence checklist, not multi-model consensus** | The verifier agent already has no edit tool; strengthen its required output before dispatching more backends. | `agents/grd-verifier.md` only, plus a doc fixture/test if agent markdown tests exist. |
| 3 | **Mechanical verify bundle command** | `lib/verify.ts` has discrete checks; a wrapper result would make "Mechanical" real without new AI behavior. | `lib/verify.ts`, CLI dispatch table, `tests/unit/verify.test.ts`. |
| 4 | **Planner reads prior REFLECTION.md snippets** | Closes the hypothesis loop without a new database or GENOME.md. | `lib/context/execute.ts` context injection plus planner prompt. |

### Tier 2 - useful but broader

| Rank | Item | Why deferred |
| --- | --- | --- |
| 5 | **Verify-fail model escalation** | Existing token-profile logic only downgrades by complexity/pressure; escalation needs retry state and must not mutate global preferences. |
| 6 | **DEAD-ENDS.md registry** | Useful, but define dedupe and read path first; otherwise it becomes another stale planning file. |
| 7 | **Drift score in evolve/health** | Needs concrete, testable goal/constraint/ontology inputs. Do not ship a weighted formula without measurable fields. |
| 8 | **GENOME.md strategy snapshot** | Could help evolve, but rewriting a meta-strategy file every iteration needs code-review and rollback policy. |

### Tier 3 - speculative or expensive

| Rank | Item | Reason |
| --- | --- | --- |
| 9 | **Population tournament of phase plans** | Multi-worktree orchestration, backend variance, and selection criteria make this well over a first integration. |
| 10 | **Ontology-similarity autopilot termination** | GRD already terminates by phase/milestone flow; ontology similarity lacks a verified ontology source. |
| 11 | **`gd think` daemon** | Background behavior is surprising for a CLI workflow and conflicts with explicit project-state boundaries. |

## What NOT to import

| Pattern | Reason |
| --- | --- |
| Self-rewriting source code without review | Contradicts the existing post-pipeline: create PR, run code review, then merge (`lib/autopilot-pipeline.ts:827`, `lib/autopilot-pipeline.ts:841`, `lib/autopilot-pipeline.ts:916`). |
| Any rule that skips `grd-code-reviewer` or direct review | Dangerous. The pipeline already treats code review as a named step and fails on review errors (`lib/autopilot-pipeline.ts:841`, `lib/autopilot-pipeline.ts:851`). |
| Backend-specific assumptions | GRD supports more than the four base CLIs and capability-gates features (`lib/backend.ts:61`, `lib/backend.ts:102`). |
| Mandatory nested PLAN.md schema as first PR | The frontmatter parser is simple and current consistency validation only checks `wave`; nested required fields raise compatibility risk for old plans (`lib/frontmatter.ts:100`, `lib/phase.ts:1810`). |
| Append-only global action journal | Likely noisy and conflict-prone. Existing state/autopilot markers already track status (`lib/autopilot-pipeline.ts:151`). |
| "BIBLE/PRINCIPLES already exists" wording | Not verified in repo. Propose it as new only if a command and lifecycle are added. |

## Smallest first PR - concrete mergeable change

> Add top-level PLAN.md scalar frontmatter fields `hypothesis:` and
> `predicted_outcome:`, and require the verifier to record an outcome
> assessment in `REFLECTION.md`.

| File | Change | Why it is mergeable |
| --- | --- | --- |
| `agents/grd-planner.md` | Add a short requirement in the frontmatter-output guidance: every PLAN.md must include `hypothesis:` and `predicted_outcome:` as single-line strings. | Correct file path; planner agent exists (`agents/grd-planner.md:1`). Scalars fit current parser. |
| `agents/grd-verifier.md` | Add a `REFLECTION.md` output section: hypothesis, predicted_outcome, actual_outcome, verdict (`confirmed`/`partial`/`falsified`/`unknown`), evidence. | Correct file path; verifier agent exists and is already evidence-focused (`agents/grd-verifier.md:12`). |
| `lib/frontmatter.ts` tests | Add/adjust a parser round-trip test for the two scalar keys. | Parser accepts arbitrary scalar keys (`lib/frontmatter.ts:129`, `lib/frontmatter.ts:150`). |
| `tests/unit/phase.test.ts` | Add one consistency fixture proving extra PLAN.md scalar fields do not create warnings beyond existing checks. | Existing phase tests cover PLAN.md consistency and missing `wave` (`tests/unit/phase.test.ts:679`). |

Do **not** change `lib/phase.ts` in this PR unless the implementation
chooses to surface these fields in CLI output. `lib/phase.ts` does not own
PLAN.md generation, and its current validation only warns on missing
`wave` (`lib/phase.ts:1793`, `lib/phase.ts:1810`). Also do **not** edit
`.planning/EVOLUTION.md` as part of the feature unless the change is an
actual evolve iteration; project research docs should not fake iteration
history.

Example frontmatter addition:

```yaml
hypothesis: "Adding the mechanical wrapper will reduce verifier false positives by making missing artifacts explicit."
predicted_outcome: "Mechanical verification reports pass/fail counts before semantic review."
```

Example `REFLECTION.md` shape:

```markdown
# Reflection

| Field | Value |
| --- | --- |
| hypothesis | ... |
| predicted_outcome | ... |
| actual_outcome | ... |
| verdict | confirmed / partial / falsified / unknown |
| evidence | command output, file paths, or verification findings |
```

## Risks & open questions

| Risk / question | Why it matters |
| --- | --- |
| Source research freshness | Stars, forks, and project behavior can change; do not bake those numbers into implementation priorities. |
| Verifier write capability | `agents/grd-verifier.md` currently disallows Edit and only lists read/search/bash tools. If it must create `REFLECTION.md`, either the orchestrator must write from its output or the tool policy must change deliberately. |
| PLAN.md field ownership | Planner prompt can emit fields, but there is no typed Plan model owning `hypothesis`/`predicted_outcome` today. Decide whether these stay prompt-only or become typed CLI data. |
| Multi-backend consensus cost | GRD has discussion dispatch, but consensus verification can multiply latency and quota use; require an opt-in config flag. |
| Drift score data source | Goal, constraint, and ontology drift need concrete inputs before a weighted score is meaningful. |
| Safety boundary for evolve | GENOME.md or strategy rewrites must go through the existing PR/review path; otherwise they recreate the unsafe self-modification pattern this proposal rejects. |

## Sources

| Source | Use in this proposal |
| --- | --- |
| Q00/ouroboros | Pattern vocabulary: spec-first gates, ambiguity, evaluation, routing. |
| Kargatharaakash/ouroboros | Hypothesis/outcome and lineage vocabulary. |
| razzant/ouroboros | Identity-core and supervisor/agent framing. |
| TomzxCode/ouroboros | Execute/learn/improve/retry separation and self-modification warning. |
| Local GRD codebase | Decides priority and feasibility; local citations above are authoritative for this integration plan. |
