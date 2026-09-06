# GRD Configuration Reference

Complete reference for every configuration knob in GRD. The primary source of truth is `.planning/config.json`; additional configuration lives in agent frontmatter and environment variables.

---

## Table of Contents

1. [`.planning/config.json` — GrdConfig](#planningconfigjson--grdconfig)
2. [SchedulerConfig — nested under `scheduler`](#schedulerconfig)
3. [SuperpowersConfig — nested under `superpowers`](#superpowersconfig)
4. [Agent Frontmatter](#agent-frontmatter)
5. [Environment Variables](#environment-variables)
6. [Status Markers — `.planning/autopilot/`](#status-markers)
7. [Persistent Scheduler State — `.planning/scheduler-state.json`](#persistent-scheduler-state)
8. [Default Values Summary](#default-values-summary)
9. [Config Field Interactions](#config-field-interactions)
10. [`gd settings` — Settable Keys](#gd-settings--settable-keys)

---

## `.planning/config.json` — GrdConfig

All fields are optional in the file; `loadConfig()` in `lib/utils.ts` fills in defaults when fields are absent. The validator emits a `Warning:` to stderr for any unrecognised top-level key.

Many fields accept a **legacy nested form** (e.g. `{ "code_review": { "enabled": true } }`) as well as a flat form. Both are supported; flat form takes precedence.

### Workflow

| Field | Type | Default | Description |
|---|---|---|---|
| `model_profile` | `'quality' \| 'balanced' \| 'budget'` | `'balanced'` | Baseline model tier selection per agent. Drives MODEL_PROFILES lookup; see [Agent Frontmatter](#agent-frontmatter). Invalid values produce a warning. |
| `token_profile` | `'frugal' \| 'balanced' \| 'quality'` | `'balanced'` | Adaptive model-tier routing under budget pressure. Orthogonal to `model_profile`. Set via `gd settings token_profile`. |
| `research` | `boolean` | `true` | Enable the research step before planning. Spawns `grd-phase-researcher`. Also nested as `workflow.research`. |
| `plan_checker` | `boolean` | `true` | Enable plan-checker review after planning. Spawns `grd-plan-checker`. Also nested as `workflow.plan_check`. |
| `verifier` | `boolean` | `true` | Enable post-execution verification. Spawns `grd-verifier`. Also nested as `workflow.verifier`. |
| `parallelization` | `boolean \| { enabled: boolean }` | `true` | Allow parallel execution of independent plan waves. Object form (`{ enabled: true }`) is also accepted. |
| `autonomous_mode` | `boolean` | `false` | Skip confirmation prompts in autopilot; run fully unattended. |
| `commit_docs` | `boolean` | `true` | Auto-commit planning documents (plans, summaries, ROADMAP changes). Also nested as `planning.commit_docs`. |
| `search_gitignored` | `boolean` | `false` | Include git-ignored files in codebase searches. Also nested as `planning.search_gitignored`. |

### Git / Branching

| Field | Type | Default | Description |
|---|---|---|---|
| `branching_strategy` | `string` | `'none'` | Branching strategy. `'none'` = work on current branch; `'per-phase'` = create phase branches; `'per-milestone'` = create milestone branches. Also nested as `git.branching_strategy`. |
| `phase_branch_template` | `string` | `'grd/{milestone}/{phase}-{slug}'` | Template for per-phase branch names. Tokens: `{milestone}`, `{phase}`, `{slug}`. Also nested as `git.phase_branch_template`. |
| `milestone_branch_template` | `string` | `'grd/{milestone}-{slug}'` | Template for per-milestone branch names. Tokens: `{milestone}`, `{slug}`. Also nested as `git.milestone_branch_template`. |
| `base_branch` | `string` | `'main'` | Base branch for PRs and merges. Also nested as `git.base_branch`. |

### Code Review

| Field | Type | Default | Description |
|---|---|---|---|
| `code_review_enabled` | `boolean` | `true` | Enable LLM-based code review after each wave. Also nested as `code_review.enabled`. |
| `code_review_timing` | `string` | `'per_wave'` | When to run code review: `'per_wave'` (after each wave) or `'end_of_phase'` (once after all waves complete). Also nested as `code_review.timing`. |
| `code_review_severity_gate` | `string` | `'blocker'` | Minimum severity to halt execution: `'blocker'`, `'warning'`, or `'suggestion'`. Also nested as `code_review.severity_gate`. |
| `code_review_auto_fix_warnings` | `boolean` | `false` | Automatically attempt to fix warning-severity issues before proceeding. Also nested as `code_review.auto_fix_warnings`. |

### Execution / Teams

| Field | Type | Default | Description |
|---|---|---|---|
| `use_teams` | `boolean` | `false` | Enable team-based execution (multi-agent collaboration within a phase). Requires backend that supports `teams` capability. Also nested as `execution.use_teams`. |
| `team_timeout_minutes` | `number` | `30` | Per-team timeout in minutes. Also nested as `execution.team_timeout_minutes`. |
| `max_concurrent_teammates` | `number` | `4` | Maximum number of teammate agents running in parallel within a team. Also nested as `execution.max_concurrent_teammates`. |

### Backend Selection

| Field | Type | Default | Description |
|---|---|---|---|
| `backend` | `string \| undefined` | `undefined` | Force a specific backend (`'claude'`, `'codex'`, `'gemini'`, `'opencode'`). When absent, `detectBackend()` inspects environment variables. |
| `backend_models` | `Record<string, ModelTierMap> \| undefined` | `undefined` | Per-backend model name overrides. Map of backend ID → `{ opus, sonnet, haiku }` strings. Overrides auto-detected model names for that backend. |
| `backend_roles` | `Partial<Record<DiscussionRole, BackendId>>` | `undefined` | Assigns specific backends to discussion roles (`reviewer`, `brainstormer`, `verifier`, `executor`). Validated against `VALID_BACKENDS`. |

### Research Gates

| Field | Type | Default | Description |
|---|---|---|---|
| `citation_gate` | `boolean` | `false` | When `true`, the plan-phase gate blocks on unresolved critical citation nodes in PAPERS.md. |
| `transitive_citation_gate` | `boolean` | `false` | When `true`, run transitive citation gate during plan-phase (warning severity only — non-blocking). |
| `research_gates.plan_clarification` | `boolean` | `true` | **(v0.4.5+)** Interactive planning clarification gate, alongside `research_gates.phase_plan_approval`. When on, the `grd-planner` agent may return a `## CHECKPOINT REACHED` / `TYPE: clarification` block for ambiguous, *unlocked* design/implementation decisions; the `plan-phase` orchestrator surfaces these via `AskUserQuestion` (recommended default option first), then resumes the planner with the answers framed as `## Decisions`. Bounded to 2 rounds and de-duped by question text. Auto-skipped under `autonomous_mode`, autopilot, and `--candidates N` with N>1. |
| `research_gates.experiment_execution` | `boolean` | `true` | Autoresearch RUN gate. Note the naming: the **config** key is `experiment_execution`, the **runtime** gate it sets is called `execute` (`thread.gates.execute`, `pendingGate: 'execute'`) — there is no `research_gates.execute`. Resolved by `resolveGates()` in `lib/research/gates.ts` (mirrored in `bin/vendor/autoresearch_core/gates.py`), which reads the key raw from `.planning/config.json`: **only the literal `false` turns the gate off**; absence or any other value leaves it on. When on, the loop pauses before executing a generated experiment script (`status: 'paused'`, `pendingGate: 'execute'`); a bare `gd research resume <id>` approves that one crossing. `--no-gates` and every unattended caller (bench, portfolio, harness, autopilot) force all gates off. |
| `research_gates.kg_write` | `boolean` | `true` | Autoresearch PERSIST gate — pauses before writing findings back into the knowledge graph. Same resolution rules as `experiment_execution`: only the literal `false` disables it. |
| `research_gates.auto_promote_falsified` | `boolean` | `false` | **(v0.6.0+)** Lets the phase boundary write a `verdict: falsified` reflection from a phase's `VERIFICATION.md` straight into `.planning/DEAD-ENDS.md` (`promoteFalsifiedFromPhase`, `lib/dead-ends.ts`). Off — unset, `false`, or a non-boolean — the step dry-runs: it returns `dry_run: true` with the entry it *would* have written under `preview` and leaves `DEAD-ENDS.md` byte-identical. A present-but-non-boolean value (e.g. the string `"true"`) reads as off **and reports a `config_error`**, as do an unreadable file and invalid JSON; only a missing config file is a silent off. See the note below before turning this on. |

#### Two gate toggles in `gd settings` are inert

`gd settings` draws a gate box (`commands/settings.md`) offering
`phase_plan_approval` and `execution_approval` alongside the gates that work.
**Nothing reads either one.** Grepping `lib/`, `bin/`, `commands/` and `agents/`
for both names returns only `commands/settings.md` itself — the toggle that sets
them. Every other gate in that box has a consumer: `survey_approval` →
`commands/survey.md`, `deep_dive_approval` → `commands/deep-dive.md`,
`feasibility_approval` → `commands/feasibility.md`, `product_plan_approval` →
`commands/product-plan.md`, `plan_clarification` → `commands/plan-phase.md`.

Turning these two on or off therefore changes nothing, silently. They are
documented here so the next person to trust that box knows, rather than
concluding a gate failed to fire. Verified 2026-09-06 at 0.6.0.

#### Why `auto_promote_falsified` defaults to off

A DEAD-ENDS entry is not advice, it is a hard fail. `checkDeadEnds()` in
`lib/commands/select-candidate.ts` scans every candidate plan for a citation of the entry's
slug (case-insensitive, on word boundaries) or an exact match on one of its `forbidden_terms`;
a hit short-circuits that candidate's `total_score` to `-Infinity`, which sorts it to the
bottom of the audit and takes it out of selection entirely.

There is **no warning tier** on that path. The advisory Jaccard-similarity list is computed
alongside for the audit trail but never changes a score, and every other axis is deliberately
kept finite (`scoreMustHavesCoverage` charges -10 per missing artifact and says so in a comment)
so that DEAD-ENDS remains the only hard-fail. Status handling is fail-closed too: `checkDeadEnds`
exempts exactly `status: retired` — `resolved`, `superseded`, a typo, or no status at all
still gate.

So an auto-promoted entry permanently bans an approach on the strength of a single phase's
reflection, and the only way back is a human running `gd dead-end retire <slug> --reason "..."`.
`retireDeadEnd()` is the sole writer of `status: retired` anywhere in GRD, and no automatic path
undoes it — re-recording the same slug merges the phase and evidence but leaves the retirement
alone. Leave the gate off unless you want that trade.

### Autoresearch Interactive Steering

Nested under `research_gates.interactive` (v0.5.0+). Human-in-the-loop checkpoints at the
SEED / HYPOTHESIZE / DESIGN / DECIDE stations of `gd research`. Read by `readInteractiveConfig()`
in `lib/research/checkpoints.ts`, raw from `.planning/config.json` (`loadConfig()` recognises
`research_gates` but does not normalise its contents). Every field is validated: a wrong-typed
or out-of-range value prints `[interactive-config] <key>: …` on stderr and falls back to the
default rather than failing the run.

The loop **never pauses unattended.** `resolveInteractive()` forces steering inactive under
`--no-gates`, `autonomous_mode`, autopilot (`GRD_AUTOPILOT`), portfolio concurrency > 1, and a
non-interactive stdio; `fallback` then decides who answers.

| Field | Type | Default | Description |
|---|---|---|---|
| `research_gates.interactive.enabled` | `boolean` | `false` | Master switch for interactive steering. Off, the loop runs exactly as before. |
| `research_gates.interactive.seed` | `boolean` | `true` | Pause at SEED (question clarification). Only consulted when `enabled`. |
| `research_gates.interactive.hypothesize` | `boolean` | `true` | Pause at HYPOTHESIZE (candidate selection). Only consulted when `enabled`. |
| `research_gates.interactive.design` | `boolean` | `true` | Pause at DESIGN (experiment-plan approve / revise / abort). Only consulted when `enabled`. |
| `research_gates.interactive.decide` | `boolean` | `true` | Pause at DECIDE (continuation steering). Only consulted when `enabled`. |
| `research_gates.interactive.every_iteration` | `boolean` | `false` | When `false`, the SEED / HYPOTHESIZE / DESIGN checkpoints fire on iteration 1 only. When `true`, they fire every iteration. Does not apply to DECIDE, which is continuation steering and may fire at every would-continue point regardless. |
| `research_gates.interactive.max_rounds` | `number` (≥ 1) | `2` | Cap on DESIGN "revise the plan" rounds per thread. Exceeding it routes to the approve path (reuse the persisted plan, proceed to RUN) instead of looping. Non-number or `< 1` → default. |
| `research_gates.interactive.max_questions` | `number` (≥ 1) | `4` | Parsed, validated and clamped, but **not currently consumed by any checkpoint code path** — setting it changes nothing today. |
| `research_gates.interactive.hypothesis_candidates` | `number` | `3` | How many hypotheses `grd-hypothesizer` is asked for at the HYPOTHESIZE checkpoint. Clamped to `[1, 5]`. |
| `research_gates.interactive.fallback` | `'recommended' \| 'panel'` | `'recommended'` | Who answers a checkpoint when **no human is present**. `'recommended'` takes each question's recommended default. `'panel'` routes it to the AI discussion panel (`answerViaDiscussion`), which is degrade-safe — an empty or rate-limited panel falls back to the recommended defaults. Unknown values warn and fall back to `'recommended'`. |

### Autoresearch Loop

Top-level keys tuning the `gd research` loop itself. `loadConfig()` recognises these key
*names* (so they do not trigger the unknown-key warning) but does not normalise their values —
each is read raw from `.planning/config.json` at its point of use, with its own validation.

| Field | Type | Default | Description |
|---|---|---|---|
| `research_max_candidates` | `integer > 0` | `3` | How many synthesized candidate hypotheses `gd synthesize` seeds as research threads (`readMaxCandidates`, `lib/research/cli-kb.ts`). The rank-1 thread is auto-resumed. Non-integer or `≤ 0` → default. |
| `research_max_resurveys` | `integer ≥ 0` | `2` | Cap on plateau-triggered re-surveys per thread (`readResurveyConfig`, `lib/research/orchestrator.ts`). `0` disables re-survey. A present value is clamped to `≥ 0`; absent or non-numeric → `2`. |
| `research_plateau_window` | `integer ≥ 1` | `3` | Window of completed iterations `detectPlateau()` inspects to decide a thread has plateaued (and so should re-survey). The same value is reused as the window for `detectDesignPlateau()` — consecutive iterations that exhausted their redesign budget without ever producing a measurable experiment, which terminates the thread as `exhausted`. A present-but-invalid value (`0`, negative, non-numeric) → `3`. |
| `research_resurvey_fetch` | `boolean` | `false` | When plateau re-survey fires, also spawn `grd-surveyor` for up to 3 new sources and ingest them. **Only the literal `true` enables it.** Fully tolerant — a missing surveyor or a bad source degrades silently. |
| `research_portfolio_concurrency` | `integer ≥ 1` | `2` | Threads `gd research portfolio` runs in parallel (`readPortfolioConcurrency`, `lib/research/portfolio.ts`). An explicit `--concurrency` beats it. Non-integer or `< 1` → default. Any value > 1 also disables interactive steering. |
| `research_persist_knowledge` | `boolean` | `true` | Promote a finished thread's takeaways into `KNOWHOW.md` and its refutations into `.planning/DEAD-ENDS.md` (`shouldPersistKnowledge`, `lib/research/promote.ts`). **Only the literal `false` turns it off**; an unreadable config leaves it on. |
| `research_eval_report` | `boolean` | `false` | Opt in to an extra `grd-research-evaluator` spawn per iteration that writes a narrative `EVAL.md` into `.planning/research/threads/<id>/experiments/<iteration>/` (`readEvalReportConfig`, `lib/research/eval.ts`). **Only the literal `true` enables it.** Read-only and off the control path — the verdict stays deterministic — and a failure degrades with a stderr note. |
| `research_spawn_retries` | `integer` | `2` | Retries for a failed agent spawn inside the loop (`readSpawnRetries`, `lib/research/orchestrator.ts`). Clamped to `[0, 5]`; a non-number → default. |
| `research_max_debug_depth` | `integer` | `0` | Bounded fix-and-retry attempts when the experiment script **fails to execute** (nonzero exit or a thrown runner) — never for a metric miss (`readDebugDepth`, `lib/research/orchestrator.ts`). `0` (the default) = no retries. Clamped to `[0, 5]`; a non-number → `0`. The same budget is shared with, not added to, the `metric_absent` re-plan into DESIGN. Across a debug re-plan the execute gate is re-checked and the committed metric/comparator/target is pinned. |

### Autoresearch Sandbox

Top-level keys controlling how the autoresearch loop (`gd research`) executes
generated experiment scripts during RUN. Implemented in `lib/research/docker-runner.ts`.

| Field | Type | Default | Description |
|---|---|---|---|
| `research_sandbox` | `'docker' \| 'subprocess' \| 'auto'` | `'auto'` | Runner selection. `'auto'` (the unset default) uses Docker when a usable binary is present, otherwise falls back to the subprocess runner **and prints a visible `UNSANDBOXED`-on-host warning** — the default path is never silently un-sandboxed. `'docker'` forces the container (still degrades to subprocess + warning if Docker is unavailable); `'subprocess'` always runs on the host. `result.json` records which runner actually ran. |
| `research_sandbox_image` | `string` | slim defaults | Container image for Docker mode (`python:3.12-slim` / `bash:5` by script language). |
| `research_sandbox_memory` | `string` | `'512m'` | Container memory cap. |
| `research_sandbox_cpus` | `string` | `'1'` | Container CPU cap. |
| `research_sandbox_network` | `'none' \| 'bridge'` | `'none'` | Container network mode; `'bridge'` allows network inside the container. |

### Autoresearch Tesserae extraction

Top-level keys controlling how `gd ingest` builds the research knowledge graph
from the corpus. Implemented in `lib/research/tesserae.ts` (invokes `tesserae extract`).

| Field | Type | Default | Description |
|---|---|---|---|
| `research_tesserae_extractor` | `'deterministic' \| 'llm' \| 'selective-llm' \| 'claude-cli' \| 'selective-claude'` | `'deterministic'` | Tesserae extractor backend. GRD pins `'deterministic'` **explicitly** (fast/offline/byte-stable) so `gd ingest` does NOT inherit Tesserae 0.13's flipped default (`llm`) and silently start LLM extraction (cost + latency). `'llm'` builds the full concept/claim layer (concepts, claims, capabilities, evidence spans, typed edges) via your configured provider (codex/claude/anthropic, per Tesserae's `llm_provider`); `'selective-llm'` runs it over a subset. `'claude-cli'`/`'selective-claude'` are the legacy 0.12 Claude-only modes (still accepted). Unset/unknown ⇒ `deterministic`. `llm`/`selective-llm` require tesserae ≥ 0.13. |
| `research_tesserae_extract_include` | `string` (glob) | — | Subset glob for the selective modes — `--llm-include` with `selective-llm`, `--claude-include` with `selective-claude`. |
| `research_tesserae_extract_limit` | `integer` | — | Cap on files sent to the LLM extractor for the selective modes — `--llm-limit` with `selective-llm`, `--claude-limit` with `selective-claude`. |

### Post-Phase Pipeline

| Field | Type | Default | Description |
|---|---|---|---|
| `refinement_loop` | `boolean` | `false` | Run post-phase metric-driven refinement loop. Spawns `grd-critique-agent` iteratively until convergence or `maxIterations`. |
| `phase_complete_llm_fallback` | `boolean` | `false` | When mechanical phase-completion fails (regex path), spawn Claude to attempt the edits via LLM. Opt-in (Spec 3B). Requires scheduler to be configured. Set via `gd settings phase_complete_llm_fallback`. |
| `phase_complete_llm_fallback_retries` | `number` | `0` | Retry count for the LLM fallback path. Uses exponential backoff: 2^attempt seconds (2s, 4s, 8s…). Clamped to ≥ 0. |

### Adaptive Complexity Routing

| Field | Type | Default | Description |
|---|---|---|---|
| `agent_complexity_overrides` | `Record<string, 'low' \| 'medium' \| 'high'>` | `undefined` | Per-agent baseline complexity override. Keys are agent type names; values take precedence over the built-in `AGENT_BASELINE_COMPLEXITY` table. |
| `complexity_heuristics` | `object` | see sub-fields | Override `estimateComplexity()` internal cutoffs. All sub-fields optional. |
| `complexity_heuristics.prompt_length_high_threshold` | `number` | `20000` | Prompt length (chars) above which complexity promotes to `'high'`. |
| `complexity_heuristics.sample_demote_high_to_medium` | `number` | `3000` | Avg recent sample tokens below which `'high'` demotes to `'medium'`. |
| `complexity_heuristics.sample_demote_medium_to_low` | `number` | `1500` | Avg recent sample tokens below which `'medium'` demotes to `'low'`. |
| `complexity_heuristics.min_samples_for_demotion` | `number` | `3` | Minimum recent samples required before demotion is considered. |

### Ceremony

| Field | Type | Default | Description |
|---|---|---|---|
| `ceremony` | `CeremonyConfig \| undefined` | `undefined` | Scale-adaptive workflow control. |
| `ceremony.default_level` | `'auto' \| 'light' \| 'standard' \| 'full'` | `undefined` | Default ceremony level. `'auto'` selects based on project size. |
| `ceremony.phase_overrides` | `Record<string, 'light' \| 'standard' \| 'full'>` | `undefined` | Per-phase ceremony overrides keyed by phase number string. |

### Life-Harness

Configuration block for `gd harness round` — the current GRD self-improvement mechanism (v0.4.4+). Analogous to `research_gates` in the autoresearch loop: the `autonomy` key controls the merge gate and defaults to `"review"` (leave branch for human merge). As of v0.4.4 the harness also has a **collective layer** (Phase E): downstream projects emit GRD-about findings as upstream candidates, and the GRD repo (the upstream root) consumes them — governed by the `upstream_*` keys below.

As of v0.4.5 the harness also consumes Tesserae 0.9.0 **AgentRunbook** distilled memory (`Runbook` / `Gotcha` nodes) as round evidence, alongside raw session findings. This is enabled by `distillation.enabled` in the **Tesserae** project config — not a GRD config key.

| Field | Type | Default | Description |
|---|---|---|---|
| `harness` | `HarnessConfig \| undefined` | `undefined` | Configuration for `gd harness round`. When absent, all harness defaults apply. |
| `harness.autonomy` | `'review' \| 'auto'` | `'review'` | `'review'` leaves branch `harness/round-<id>` for human merge; `'auto'` merges when eval is green AND confidence >= `min_confidence`. |
| `harness.kill_switch` | `boolean` | `false` | When `true`, all round execution is blocked immediately (emergency stop). |
| `harness.min_confidence` | `number` | `0.7` | Confidence threshold required for `--auto` merge. Range 0–1. |
| `harness.min_interval_hours` | `number` | `24` | Minimum wall-clock hours between rounds (prevents runaway self-modification). |
| `harness.allowed_targets` | `string[]` | `["markdown","config","code"]` | Patch target categories the harness is allowed to modify. |
| `harness.backend` | `string` | `'codex'` | Backend used to spawn the proposal agent. |
| `harness.min_evidence` | `number` | `3` | Minimum Tesserae session findings required to start a round. |
| `harness.max_evidence` | `number` | `25` | Maximum findings fed to the proposal agent (caps context size). |
| `harness.distillation_max_age_days` | `number \| undefined` | `undefined` | When set, drops distilled `Runbook`/`Gotcha` evidence older than N days before a round selects evidence (raw session findings are unaffected). Default off — no age filter applied. Implemented in `bin/harness_driver.py`. |
| `harness.upstream_emit` | `boolean` | `true` | **Collective layer (downstream side).** After a round persists in any project, emit findings *about GRD itself* as upstream candidates into `$CLAUDE_PLUGIN_DATA/harness/upstream/` (fallback `~/.grd/harness/upstream/`). Per-project off switch — distilled finding text only, never transcripts or patches. |
| `harness.upstream_root` | `boolean` | `false` | **Collective layer (aggregator side).** When `true`, this repo is the upstream root: the round binds a `CompositeFindingsSource` (local Tesserae findings + pending upstream candidates, deduped across origins with occurrence counts) and marks consumed candidates. Set explicitly in GRD's own `.planning/config.json`; no magic detection. |
| `harness.upstream_ttl_days` | `number` | `90` | **Upstream root only.** Staleness cutoff: upstream candidates older than this are ignored and TTL-pruned on read. |

### Evolve (Deprecated v0.4.3)

**Deprecated (v0.4.3):** superseded by the life-harness (`gd harness round`); kept for `gd singularity` history. `gd evolve` now exits 1 with a pointer to `gd harness round`. See [docs/DEPRECATIONS.md](../DEPRECATIONS.md).

| Field | Type | Default | Description |
|---|---|---|---|
| `evolve` | `EvolveConfig \| undefined` | `undefined` | Configuration for the deprecated `gd evolve` self-improvement loop. |
| `evolve.auto_commit` | `boolean` | `true` | Auto-commit changes produced by evolve iterations. |
| `evolve.create_pr` | `boolean` | `true` | Create a PR for each evolve iteration. |

### Phase Cleanup

The `phase_cleanup` object in config.json controls post-phase quality cleanup. It is read by `lib/cleanup.ts` separately from `loadConfig()`.

| Field | Type | Default | Description |
|---|---|---|---|
| `phase_cleanup.enabled` | `boolean` | `false` | Enable post-phase cleanup pipeline. |
| `phase_cleanup.refactoring` | `boolean` | `false` | Run complexity-based refactoring suggestions. |
| `phase_cleanup.doc_sync` | `boolean` | `false` | Run doc-drift detection (changelog staleness, broken README links, JSDoc mismatches). |
| `phase_cleanup.test_coverage` | `boolean` | `false` | Run test coverage gap detection. |
| `phase_cleanup.export_consistency` | `boolean` | `false` | Check export consistency across modules. |
| `phase_cleanup.doc_staleness` | `boolean` | `false` | Check CLAUDE.md / doc staleness. |
| `phase_cleanup.config_schema` | `boolean` | `false` | Validate config schema consistency. |
| `phase_cleanup.cleanup_threshold` | `number` | `5` | Minimum issue count to trigger automated cleanup. |

### Timeouts

The `timeouts` object overrides individual operation timeouts. Values are in **milliseconds**.

| Field | Default (ms) | Description |
|---|---|---|
| `timeouts.jest_ms` | `120000` | Jest test suite timeout. |
| `timeouts.lint_ms` | `60000` | ESLint run timeout. |
| `timeouts.format_ms` | `60000` | Formatter timeout. |
| `timeouts.consistency_ms` | `30000` | Consistency check timeout. |
| `timeouts.tracker_gh_ms` | `30000` | GitHub tracker API timeout. |
| `timeouts.tracker_auth_ms` | `10000` | Tracker auth probe timeout. |
| `timeouts.backend_detect_ms` | `10000` | Backend CLI detection timeout. |
| `timeouts.autopilot_check_ms` | `5000` | Autopilot status check timeout. |

### Discussion

The `discussion` object configures the cross-backend discussion feature.

| Field | Type | Default | Description |
|---|---|---|---|
| `discussion.enabled` | `boolean` | `true` | Enable cross-backend discussion. |
| `discussion.before_planning` | `boolean` | `true` | Run a discussion round before plan-phase. |
| `discussion.before_execution` | `boolean` | `false` | Run a discussion round before execute-phase. |
| `discussion.max_rounds` | `number` | `2` | Number of discussion rounds. Clamped to 1–3. |
| `discussion.timeout_per_round_seconds` | `number` | `180` | Per-round timeout in seconds. Must be > 0. |
| `discussion.synthesizer` | `BackendId` | `'claude'` | Backend that synthesizes the final answer. Must be a valid `BackendId`. |

---

## SchedulerConfig

Nested under `config.scheduler`. When absent, scheduling is disabled and GRD dispatches directly to the detected backend. All fields are required unless marked optional.

```json
"scheduler": {
  "backend_priority": ["claude", "codex"],
  "free_fallback": { "backend": "claude" },
  "prediction": {
    "window_minutes": 60,
    "ewma_alpha": 0.3,
    "safety_margin_tasks": 2,
    "min_samples": 5
  }
}
```

| Field | Type | Default | Description |
|---|---|---|---|
| `backend_priority` | `AdapterBackendId[]` | required | Ordered list of backends to try. The scheduler works through this list, skipping rate-limited accounts. |
| `free_fallback` | `{ backend: AdapterBackendId; model?: string }` | required | Ultimate fallback backend when all priority accounts are exhausted and `max_wait_minutes` is exceeded. Optionally specify a `model` string override. |
| `backend_limits` | `Record<string, { tpm: number; rpm?: number }>` | `undefined` | Per-backend rate limits. Key is backend ID; `tpm` = tokens per minute budget; `rpm` = requests per minute (optional). |
| `prediction.window_minutes` | `number` | required | Rolling window for token consumption tracking (minutes). |
| `prediction.ewma_alpha` | `number` | required | EWMA smoothing factor for per-task token estimation (0–1; higher = more reactive). |
| `prediction.safety_margin_tasks` | `number` | required | Number of tasks to reserve headroom for; prevents over-commitment near the limit. |
| `prediction.min_samples` | `number` | required | Minimum samples before EWMA estimates are trusted for backpressure decisions. |
| `max_wait_minutes` | `number` | `90` | Maximum time (minutes) to wait for account recovery via sample-window aging. Set `0` to disable waiting (pre-Spec 2A behavior). Set very high (e.g. `10080`) to uncap. |
| `budget_pressure_thresholds` | `BudgetPressureThresholds` | `{ warning: 0.6, high: 0.8, critical: 0.95 }` | Classification thresholds for budget pressure levels. Each value is a ratio of `(tokens_consumed + tokens_reserved) / token_budget`. Levels: `none`, `warning`, `high`, `critical`. |
| `idle_timeout_seconds` | `number` | `900` | Seconds of subprocess silence before it is killed as hung. Only fires when the process produces no stdout/stderr. Distinct from a total wall-clock timeout. Set high (e.g. `3600`) to effectively disable. |
| `idle_timeout_seconds_by_backend` | `Record<string, number>` | `undefined` | Per-backend override of `idle_timeout_seconds`. Keys are backend IDs. Missing backends fall back to the global value. Example: `{ "claude": 600, "gemini": 1800 }`. |

---

## SuperpowersConfig

Nested under `config.superpowers`. Enables account rotation across multiple AI CLI installations. When present alongside `scheduler`, enables per-account state tracking.

**Storage:** The config lives in `.planning/config.json` under the `superpowers` key. It is project-scoped (committed with the repo). Plugin-level state (scheduler samples, global evolve config) goes to `CLAUDE_PLUGIN_DATA` instead.

```json
"superpowers": {
  "default_backend": "claude",
  "account_rotation": true,
  "accounts": {
    "claude": [
      { "config_dir": "~/.claude-personal" },
      { "config_dir": "~/.claude-work" }
    ]
  }
}
```

| Field | Type | Description |
|---|---|---|
| `default_backend` | `DirectBackendId` | The backend all accounts belong to. Valid values: `'claude'`, `'codex'`, `'gemini'`, `'opencode'`, `'overstory'`. Not `'superpowers'` or `'grd'`. |
| `account_rotation` | `boolean` | Enable per-account state tracking. When `false`, all backends share a single state entry. |
| `accounts` | `Partial<Record<AdapterBackendId, AccountConfig[]>>` | Map of backend ID → array of account configs. Each account config has one field: `config_dir` (path to the CLI config directory for that account, e.g. `~/.claude-personal`). |

**Per-account fields (`AccountConfig`):**

| Field | Type | Description |
|---|---|---|
| `config_dir` | `string` | Absolute or `~/`-prefixed path to the account's config directory. Set as the appropriate env var (e.g. `CLAUDE_CONFIG_DIR`) when spawning the backend. |

### How accounts are set up

Configure accounts interactively — do not edit `.planning/config.json` by hand.

- **`gd init`** — Round 5 of the init interview asks whether the user has multiple accounts and collects `config_dir` paths.
- **`gd settings`** — Reconfigures accounts when the user mentions accounts, rotation, or credentials.

**Env var injected per backend at spawn time (`ENV_VAR_MAP` in `lib/scheduler.ts`):**

| Backend     | Env var injected      | Standard auth command                                         |
|-------------|-----------------------|---------------------------------------------------------------|
| `claude`    | `CLAUDE_CONFIG_DIR`   | `CLAUDE_CONFIG_DIR=~/.claude-work claude auth login`         |
| `codex`     | `CODEX_HOME`          | `CODEX_HOME=~/.codex-work codex auth login`                  |
| `gemini`    | `GEMINI_CLI_HOME`     | `GEMINI_CLI_HOME=~/.gemini-work gemini auth login`           |
| `opencode`  | `OPENCODE_CONFIG_DIR` | `OPENCODE_CONFIG_DIR=~/.opencode-work opencode auth login`   |
| `overstory` | `OVERSTORY_HOME`      | `OVERSTORY_HOME=~/.overstory-work overstory auth login`      |

GRD does not handle OAuth itself — it only sets the env var and routes the spawn. Each account must be authenticated via the backend CLI before GRD is run.

> **Warning:** Manual edits to the `accounts` array in `.planning/config.json` are discouraged — `gd init` / `gd settings` validate account paths and keep `default_backend` consistent.

### How account rotation interacts with other features

- **`token_profile`**: Budget pressure is tracked per account (state key = `backend/config_dir`). Per-account pressure drives the adaptive model-tier downgrade logic. A `frugal` token_profile will downgrade tasks on a pressured account even if a fresh account would have headroom.
- **`max_wait_minutes`**: When all priority accounts in `backend_priority` are exhausted (all over-budget or rate-limited), the scheduler waits up to `max_wait_minutes` for sample-window aging before falling back to `free_fallback`. Set `0` to skip waiting.
- **`idle_timeout_seconds_by_backend`**: Per-backend idle timeout overrides apply independently of which account is active. If `claude` has a 600-second override, it applies to all Claude accounts.
- **`phase_complete_llm_fallback`**: Uses the normal scheduler account-selection path. The fallback spawn respects budget pressure and will rotate to a healthy account if the primary is exhausted.

---

## Agent Frontmatter

Every agent definition file in `agents/*.md` has a YAML frontmatter block. These fields are consumed by the Claude Code harness when spawning a subagent.

```yaml
---
name: grd-planner
description: Creates executable phase plans...
tools: Read, Write, Bash, Glob, Grep
color: green
effort: high
maxTurns: 25
disallowedTools:
  - Edit
---
```

| Field | Type | Description | Consumed By |
|---|---|---|---|
| `name` | `string` | Agent identifier. Must match the key in `MODEL_PROFILES` and `EFFORT_PROFILES` for tier/effort lookup. | GRD orchestrators when building `--agent` args |
| `description` | `string` | Human-readable description displayed in Claude Code's agent picker. | Claude Code UI |
| `tools` | `string` (comma-separated) | Allowed tools for this agent. Wildcards supported (e.g. `mcp__context7__*`). | Claude Code harness |
| `color` | `string` | Display colour in Claude Code UI (`green`, `yellow`, `cyan`, etc.). | Claude Code UI |
| `effort` | `'low' \| 'medium' \| 'high'` | Default reasoning depth for this agent. Overridden at runtime by GRD using `EFFORT_PROFILES[agentType][model_profile]`. Requires Claude Code v2.1.68+. | Claude Code harness |
| `maxTurns` | `number` | Hard cap on agent turns before it is stopped. Prevents runaway agents. Example: verifier uses `10`, codebase-mapper uses `25`. | Claude Code harness |
| `disallowedTools` | `string \| string[]` | Tools this agent is explicitly blocked from calling (e.g. `Edit`, `Write`). Either a single string or YAML list. | Claude Code harness |

### MODEL_PROFILES and EFFORT_PROFILES

`MODEL_PROFILES` (in `lib/utils.ts`) maps each agent type to a model tier per profile:

| Agent | quality | balanced | budget |
|---|---|---|---|
| `grd-planner` | opus | opus | sonnet |
| `grd-executor` | opus | sonnet | sonnet |
| `grd-verifier` | sonnet | sonnet | haiku |
| `grd-plan-checker` | sonnet | sonnet | haiku |
| `grd-codebase-mapper` | sonnet | haiku | haiku |
| `grd-code-reviewer` | opus | sonnet | haiku |
| `grd-debugger` | opus | sonnet | sonnet |
| `grd-product-owner` | opus | opus | sonnet |
| (others) | varies | varies | haiku/sonnet |

`EFFORT_PROFILES` (in `lib/backend.ts`) maps each agent type to an effort level per profile:

| Agent | quality | balanced | budget |
|---|---|---|---|
| `grd-planner` | high | high | low |
| `grd-executor` | high | medium | low |
| `grd-verifier` | medium | low | low |
| `grd-codebase-mapper` | medium | low | low |
| `grd-debugger` | high | medium | low |
| `grd-product-owner` | high | high | low |
| (others) | high/medium | medium/low | low |

---

## Environment Variables

### Backend Detection

GRD uses these env vars to auto-detect which backend is running. They are not set by the user directly — the AI CLI sets them when it launches GRD.

| Variable | Backend | Notes |
|---|---|---|
| `SUPERPOWERS_HOME` or `SUPERPOWERS_SESSION` | `superpowers` | Highest priority; checked first. |
| `OVERSTORY_HOME` or `OVERSTORY_SESSION` | `overstory` | Checked before Claude. |
| `CLAUDE_CODE_*` (any prefix) | `claude` | Standard Claude Code env prefix. |
| `CODEX_HOME` or `CODEX_THREAD_ID` | `codex` | `CODEX_THREAD_ID` kept for backward compatibility. |
| `GEMINI_CLI_HOME` | `gemini` | |
| `OPENCODE` | `opencode` | Presence indicator only. |

### GRD-Specific Variables

| Variable | Description |
|---|---|
| `CLAUDE_PLUGIN_DATA` | Path to a persistent directory for plugin-scoped state (survives plugin updates). Used for cross-project scheduler/evolve config. Project artifacts go in `.planning/` instead. |
| `GRD_DEBUG` | When set (any value), enables `debugLog()` verbose output on stderr. |
| `GRD_HARNESS_CORE` | Selects which `autoresearch_core` kernel `bin/harness_driver.py` loads for `gd harness round`. The kernel ships vendored in `bin/vendor/` (no manual `pip install`; Python 3.11+ is the only prereq). Default: prefer a version-compatible installed/editable copy, else fall back to the vendored one. Set to `vendored` to force the vendored copy. |

### MCP Detection Variables

| Variable | Description |
|---|---|
| `CHROME_DEVTOOLS_MCP` | When set, marks Chrome DevTools MCP as available via env. |
| `WEBMCP_AVAILABLE` | When set, marks WebMCP as available via env. |
| `PLAYWRIGHT_AVAILABLE` | When set, marks Playwright MCP as available via env. |

### Hook Variables (set by Claude Code when invoking hook agents)

| Variable | Description |
|---|---|
| `AGENT_ID` | Current agent's identifier. Read by worktree hook commands. |
| `AGENT_TYPE` | Current agent's type string. Read by worktree hook commands. |
| `STOP_REASON` | Reason the agent was stopped. Read by `stop-failure` hook. |
| `ERROR_MESSAGE` | Error message from a failed stop. Read by `stop-failure` hook. |

---

## Status Markers

Autopilot writes per-phase JSON status files to `.planning/autopilot/` to track progress. The directory is created on first use.

**File path pattern:** `.planning/autopilot/phase-{phaseNum}-{step}.json`

**Schema:**

```json
{
  "phase": "94",
  "step": "plan",
  "status": "completed",
  "timestamp": "2026-04-11T10:30:00.000Z"
}
```

| Field | Type | Description |
|---|---|---|
| `phase` | `string` | Phase number (e.g. `"94"`, `"2.1"`). |
| `step` | `string` | Step name (see below). |
| `status` | `string` | Step status (see below). |
| `timestamp` | `string` | ISO 8601 UTC timestamp written at the moment of the transition. |

**Recorded steps:**

| Step | Possible Statuses |
|---|---|
| `plan` | `started`, `completed`, `failed` |
| `execute` | `started`, `completed`, `failed` |
| `post-pipeline` | `started`, `completed`, `failed` |
| `phase-finalize` | `started`, `completed`, `failed` |
| `knowledge-mining` | `started`, `completed`, `failed`, `skipped` |
| `refinement-loop` | `started`, `converged`, `max-iterations`, `failed`, `skipped`, `iteration-N`, `iteration-N-complete` |

**How autopilot reads them:** The marker files are used for human observability (visible in `.planning/autopilot/`) and for `updateStateProgress()` which writes the current step to `STATE.md`. On re-run, markers are overwritten atomically (write-to-temp-then-rename).

---

## Persistent Scheduler State

**Path:** `.planning/scheduler-state.json`

Written by the scheduler to persist learned budget/EWMA information across GRD sessions. Loaded at autopilot startup via `scheduler.loadPersistedState()`.

**When written:** Every 10 samples (summed across all backends) after a spawn completes. Written atomically via `fs.writeFileSync`.

**Schema (version 1):**

```json
{
  "version": 1,
  "backends": {
    "claude/~/.claude-personal": {
      "token_budget": 150000,
      "ewma_tokens_per_task": 8500,
      "budget_learned": true,
      "budget_confidence": 0.9,
      "last_updated": 1744363800000
    }
  }
}
```

| Field | Type | Description |
|---|---|---|
| `version` | `number` | Schema version. Must be `1` to be loaded; any other value causes load to no-op. |
| `backends` | `Record<string, BackendEntry>` | Map from state key (backend ID or `backend/config_dir`) to persisted state. |
| `backends[key].token_budget` | `number` | Learned token budget for this backend/account. Only applied when `budget_learned` is `true`. |
| `backends[key].ewma_tokens_per_task` | `number` | Exponentially-weighted moving average of tokens per task. Used for headroom prediction. |
| `backends[key].budget_learned` | `boolean` | Whether the budget has been learned from actual rate-limit signals. |
| `backends[key].budget_confidence` | `number` | Confidence score (0–1) in the learned budget estimate. |
| `backends[key].last_updated` | `number` | Unix timestamp (ms) of the last write. |

**Note:** The in-memory `BackendUsageState` also tracks `samples`, `tokens_consumed_in_window`, `tokens_reserved`, `in_flight_count`, and `cooldown_until` — but these are transient and are not persisted.

---

## Default Values Summary

| Field | Default |
|---|---|
| `model_profile` | `'balanced'` |
| `token_profile` | `'balanced'` |
| `research` | `true` |
| `plan_checker` | `true` |
| `verifier` | `true` |
| `parallelization` | `true` |
| `commit_docs` | `true` |
| `autonomous_mode` | `false` |
| `branching_strategy` | `'none'` |
| `base_branch` | `'main'` |
| `code_review_enabled` | `true` |
| `code_review_timing` | `'per_wave'` |
| `code_review_severity_gate` | `'blocker'` |
| `use_teams` | `false` |
| `team_timeout_minutes` | `30` |
| `max_concurrent_teammates` | `4` |
| `citation_gate` | `false` |
| `transitive_citation_gate` | `false` |
| `research_gates.plan_clarification` | `true` |
| `research_gates.experiment_execution` | `true` |
| `research_gates.kg_write` | `true` |
| `research_gates.auto_promote_falsified` | `false` |
| `research_gates.interactive.enabled` | `false` |
| `research_gates.interactive.{seed,hypothesize,design,decide}` | `true` |
| `research_gates.interactive.every_iteration` | `false` |
| `research_gates.interactive.max_rounds` | `2` |
| `research_gates.interactive.max_questions` | `4` |
| `research_gates.interactive.hypothesis_candidates` | `3` |
| `research_gates.interactive.fallback` | `'recommended'` |
| `research_max_candidates` | `3` |
| `research_max_resurveys` | `2` |
| `research_plateau_window` | `3` |
| `research_resurvey_fetch` | `false` |
| `research_portfolio_concurrency` | `2` |
| `research_persist_knowledge` | `true` |
| `research_eval_report` | `false` |
| `research_spawn_retries` | `2` |
| `research_max_debug_depth` | `0` |
| `research_sandbox` | `'auto'` |
| `research_sandbox_memory` | `'512m'` |
| `research_sandbox_cpus` | `'1'` |
| `research_sandbox_network` | `'none'` |
| `research_tesserae_extractor` | `'deterministic'` |
| `refinement_loop` | `false` |
| `phase_complete_llm_fallback` | `false` |
| `phase_complete_llm_fallback_retries` | `0` |
| `scheduler.max_wait_minutes` | `90` |
| `scheduler.idle_timeout_seconds` | `900` |
| `scheduler.budget_pressure_thresholds.warning` | `0.60` |
| `scheduler.budget_pressure_thresholds.high` | `0.80` |
| `scheduler.budget_pressure_thresholds.critical` | `0.95` |
| `timeouts.jest_ms` | `120000` |
| `timeouts.lint_ms` | `60000` |
| `phase_cleanup.enabled` | `false` |
| `phase_cleanup.cleanup_threshold` | `5` |
| `discussion.max_rounds` | `2` |
| `discussion.timeout_per_round_seconds` | `180` |
| `discussion.synthesizer` | `'claude'` |

---

## Config Field Interactions

### `model_profile` + `token_profile`

These two fields operate on different axes:

- `model_profile` (`quality`/`balanced`/`budget`) selects the baseline model tier for each agent via `MODEL_PROFILES`. A `balanced` profile gives the planner `opus` but the verifier `sonnet`.
- `token_profile` (`frugal`/`balanced`/`quality`) adjusts the tier further at runtime based on current budget pressure and task complexity. `frugal` aggressively downgrades when budget is non-zero; `quality` preserves the tier unless budget pressure is `critical`.

The two profiles combine multiplicatively: a `quality` model_profile with a `frugal` token_profile will use opus for complex low-pressure tasks but haiku for simple high-pressure ones.

### `phase_complete_llm_fallback` requires scheduler

`phase_complete_llm_fallback: true` spawns Claude via the scheduler when the mechanical phase-completion path fails. If `scheduler` is not configured in `config.json`, the fallback logs a warning and returns `null`. Always configure `scheduler` before enabling this flag.

### `idle_timeout_seconds_by_backend` overrides `idle_timeout_seconds`

When a backend has an entry in `idle_timeout_seconds_by_backend`, that value is used exclusively for that backend. The global `idle_timeout_seconds` (default 900) applies to all backends not listed. Set a per-backend value higher than the default for backends with known slow start-up times (e.g. Gemini's gVisor sandbox).

### `budget_pressure_thresholds` customises 60/80/95 levels

The default thresholds classify pressure at 60% (`warning`), 80% (`high`), and 95% (`critical`) of a backend's token budget. Override them when your accounts have large budgets and you want earlier warnings, or small budgets and you want to tolerate higher utilisation before degrading model tiers.

### `discussion` fields only apply when `discussion.enabled: true`

`before_planning`, `before_execution`, `max_rounds`, and `timeout_per_round_seconds` are silently ignored when `enabled` is `false`. Providing `discussion: { enabled: false }` is the correct way to disable the feature without losing other discussion settings.

### `ceremony.phase_overrides` beats `ceremony.default_level`

Per-phase overrides always win over the project default. Use this to give critical phases `full` ceremony while the rest run `light`.

---

## `gd settings` — Settable Keys

The `gd settings <key> <value>` command (dispatched in `bin/grd-tools.ts`) modifies `.planning/config.json` in place. Currently two keys are settable this way:

| Key | Values | Description |
|---|---|---|
| `token_profile` | `frugal`, `balanced`, `quality` | Token optimization preference. Updates `config.token_profile`. |
| `phase_complete_llm_fallback` | `true`, `false` | Enable/disable LLM fallback for phase completion. Updates `config.phase_complete_llm_fallback`. |

All other config fields must be edited in `.planning/config.json` directly. The `gd settings` skill (slash command) may expose additional keys not listed here; the above is the complete list of keys supported by the `grd-tools` binary's `settings` subcommand.

---

## Cross-References

- **OVERVIEW.md** — Architecture overview and module map
- **MAINTENANCE.md** — Testing, linting, and upgrade procedures
- **API.md** — `lib/` module exports and function signatures
- **BACKENDS.md** — Backend capability flags, detection logic, and model tier maps
