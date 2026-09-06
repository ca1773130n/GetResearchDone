# GRD Command Flows

This document traces the key user-observable commands from CLI invocation to
side-effect completion. Each flow answers: "what actually happens when I type `gd X`?"

---

## Dispatch Preamble (all commands)

Every `gd` invocation follows this common prefix before reaching a flow-specific handler:

1. `bin/gd.js` — 3-line shim: registers `tsx/cjs` for direct `.ts` resolution, delegates to `bin/gd.ts`
2. `bin/gd.ts:56` — calls `parseFlags(process.argv.slice(2))` → `lib/cli/index.ts:220`
3. `bin/gd.ts:98` — calls `classifyCommand(command, subcommand)` → `lib/cli/index.ts:266`
   - Returns `'tool'` if command is in `TOOL_COMMANDS` set, or matches the evolve/settings/research/init-workflow subcommand special cases
   - Returns `'deprecated'` for `gd evolve` outside `EVOLVE_TOOL_SUBS` (`run`, `discover`, `state`, `advance`, `reset`)
   - Returns `'agent'` if command is in `AGENT_COMMANDS` set
4. **Deprecated path** (`bin/gd.ts:113`): writes the `gd harness round` pointer to stderr and `process.exit(1)` — no dispatch
5. **Tool path** (`bin/gd.ts:124`): `runToolCommand()` → `lib/cli/tools.ts:142` → `execFileSync('node', ['bin/grd-tools.js', ...args])` (in-process for `scan` only)
6. **Agent path** (`bin/gd.ts:131`): `runAgentCommand()` → `lib/cli/agent.ts:27` → `buildPromptForCommand()` → `/grd:<command> <args>` → `spawnSync(adapter.binary, cliArgs)`

---

## Flow 1: `gd init`

Project initialization (no subcommand = agent path; `gd init <workflow>` = tool path).

**Entry point:** `gd init` with no args → `classifyCommand` returns `'agent'` (`lib/cli/index.ts:228`).

**Key call sequence:**

1. `lib/cli/agent.ts:53` — `buildPromptForCommand('init', [])` produces `/grd:init`
2. `lib/cli/agent.ts:54` — `getAdapter(backend)` resolves backend binary (e.g. `claude`)
3. `lib/cli/agent.ts:58` — `spawnSync(adapter.binary, cliArgs, { stdio: 'inherit' })` — interactive subprocess
4. Inside the spawned backend: `/grd:init` invokes the `commands/init.md` skill
5. That skill calls `gd init new-project` (tool path) to load context, then scaffolds `.planning/` directory structure

**Tool-path variant** (`gd init new-project`):

1. `bin/grd-tools.ts:1063` — `case 'init'` with subcommand `new-project`
2. `bin/grd-tools.ts:1084` — `cmdInitNewProject(cwd, raw)` → `lib/context/agents.ts`
3. Outputs a JSON context bundle: config flags, milestone info, available backends

**Data transformations:** Positional args → `/grd:init` prompt string → agent subprocess. The agent skill reads the `gd init new-project` context JSON (config, milestone info, backend capabilities) and uses it to make decisions about directory layout and git branching.

**Side effects:** `.planning/` directory tree creation, `config.json`, `ROADMAP.md`, `STATE.md`, initial milestone scaffold under `.planning/milestones/<version>/`.

**Error paths:** Backend binary not found → `lib/cli/agent.ts:43` → stderr + `process.exit(1)`. Unknown subcommand for tool path → `error(...)` + exit 1.

---

## Flow 2: `gd plan-phase <N>`

Creating a phase plan via agent dispatch.

**Entry point:** `classifyCommand('plan-phase')` → `'agent'` (`lib/cli/index.ts:126`).

**Key call sequence:**

1. `lib/cli/agent.ts:53` — `buildPromptForCommand('plan-phase', ['3'])` → `/grd:plan-phase 3`
2. `spawnSync(adapter.binary, ...)` — backend runs the `commands/plan-phase.md` skill
3. That skill calls `gd init plan-phase 3` (tool, returns JSON context) at startup
4. `bin/grd-tools.ts:1080` → `cmdInitPlanPhase(cwd, '3', includes, raw)` → `lib/context/execute.ts:539`
5. `lib/context/execute.ts:547` — `runPreflightGates(cwd, 'plan-phase', { phase })` → `lib/gates.ts`
6. On pass: assembles result object with `backend`, `phase_found`, `planner_model`, `researcher_model`, `plan_checker_enabled`, and `knowhow_block` (`lib/context/execute.ts:726`) — the same `KNOWHOW.md` selection the executor gets, interpolated into the planner prompt by `commands/plan-phase.md`. As of v0.6.0 `selectTopEntries()` reserves slots for `research:`-sourced entries, so takeaways mined by `gd research` can actually reach the planner (see Flow 7a)
7. Agent receives context JSON, runs `grd-phase-researcher` and `grd-planner` sub-agents
8. **Clarification checkpoint (v0.4.5):** before writing PLAN.md, the `grd-planner` may pause to ask the user about ambiguous design decisions (see sub-section below)
9. Each plan is written to `.planning/milestones/<ver>/phases/phase-<N>/PLAN-<slug>.md`

### Clarification checkpoint (v0.4.5)

When the `research_gates.plan_clarification` gate is on (default) **and** the run is interactive — i.e. **not** `autonomous_mode`, **not** under `autopilot`, and **not** a batch plan request (`--candidates N` with `N > 1`) — the `grd-planner` agent is permitted to halt before authoring PLAN.md and return a `## CHECKPOINT REACHED` block with `TYPE: clarification`. It does this only for genuinely ambiguous, *unlocked* design/implementation decisions (decisions not already pinned by research, requirements, or prior `discuss-phase` output).

1. The planner surfaces each open decision as a question (each with a recommended default).
2. The plan-phase orchestrator presents the questions to the user via `AskUserQuestion`, with the planner's recommended default offered first.
3. The orchestrator resumes the **same** planner run (a continuation, not a fresh dispatch) with the user's answers folded in as a `## Decisions` section, and the planner proceeds to write PLAN.md.

The loop is bounded to **2 rounds** — after the second round the planner must commit to defaults and write the plan. Questions are de-duped by text so the same decision is never asked twice across rounds. In any non-interactive mode (autonomous, autopilot, or multi-candidate batch) the gate is bypassed and the planner takes its recommended defaults silently.

**Data transformations:** Phase number → preflight gate check → context JSON → (optional clarification round-trip: planner questions → `AskUserQuestion` → `## Decisions`) → agent-authored PLAN.md files with YAML frontmatter (`provides`, `requires`, `integration_points`, `files_modified`). The `requires`/`provides` fields are used later by `buildWavesFromPlans` to construct the artifact-level dependency DAG for wave grouping during execution.

**Side effects:** PLAN.md files written under `.planning/milestones/<ver>/phases/phase-<N>/`. Optional `RESEARCH-<phase>.md` if `research_enabled` is true.

**Error paths:** Gate failure (phase not found, plans already exist) → JSON `{ gate_failed: true, gate_errors: [...] }` returned to agent, which surfaces the error to the user and exits. Phase directory not found → agent creates it before writing plans.

---

## Flow 3: `gd execute-phase <N>`

Running all plans in a phase (wave-based parallel execution).

**Entry point:** `classifyCommand('execute-phase')` → `'agent'` (`lib/cli/index.ts:126`).

**Key call sequence:**

1. Agent receives `/grd:execute-phase 3`, skill calls `gd init execute-phase 3` (tool) for context
2. `bin/grd-tools.ts:1068` → `cmdInitExecutePhase(cwd, '3', includes, raw)` → `lib/context/execute.ts:197`
3. `lib/context/execute.ts:211` — preflight gates check (planning required, no active execution)
4. Context output includes `executor_model`, `parallelization`, `branching_strategy`, `code_review_enabled`, available plans list, and `knowhow_block` — the `<knowhow_context>` selection from `KNOWHOW.md` (`lib/context/execute.ts:423`), which `commands/execute-phase.md` interpolates into every executor prompt
5. Agent reads PLAN.md files, groups them into dependency waves via `buildWavesFromPlans` semantics (reads `provides`/`requires` frontmatter)
6. For each wave: dispatches plans in parallel as sub-agents (one per plan), each writing its summary to `SUMMARY-<slug>.md`
7. After all plans in wave complete: plan summaries aggregated, agent commits with `gd commit`
8. **Falsified-reflection promotion (v0.6.0):** at the phase boundary the skill runs `gd dead-end promote-from-phase --phase N` → `promoteFalsifiedFromPhase()` (`lib/dead-ends.ts:897`). A phase reflection with `verdict: falsified` becomes a `.planning/DEAD-ENDS.md` entry — but only when `research_gates.auto_promote_falsified` is **true**. Default false: the step returns `dry_run: true` with a `preview` and writes nothing. It is off by default because a DEAD-ENDS slug scores any future candidate plan citing it at `-Infinity` in `lib/commands/select-candidate.ts`, permanently and with no warning tier. A `config_error` in the result means the gate read as off because `config.json` could not be parsed, not because anyone chose false. The slug upsert is idempotent; `gd dead-end retire <slug> --reason "..."` is the only writer of `status: retired` and the only way to un-gate an entry. The same step runs from `commands/verify-phase.md`.

**Data transformations:** Phase directory → PLAN.md frontmatter parse → artifact dependency DAG → wave groupings → per-plan agent executions → SUMMARY-*.md files written back to phase directory.

**Side effects:** Code changes (implementation), `SUMMARY-<slug>.md` files, git commits per wave. With branching strategy, execution may run in a worktree branch, later PR'd and merged.

**Error paths:** Gate failure (phase not planned) → agent receives `{ gate_failed: true }` and halts. Individual plan failure → agent logs to stderr, marks plan as failed in summary. Parallelization disabled in config → plans run sequentially one at a time. Write-intent mismatch (plan declared `files_modified` but touched different files) → warning logged but does not block execution.

---

## Flow 4: `gd autopilot`

Full autonomous loop: plan → execute → verify → post-pipeline → phase-finalize → next phase.

**Entry point:** `classifyCommand('autopilot')` → `'agent'` → `runAgentCommand` → `/grd:autopilot`.

The `commands/autopilot.md` skill calls `gd init autopilot` for context, then delegates to `gd autopilot` **tool-path** internally via `cmdInitAutopilot` and `cmdAutopilot`.

For full programmatic invocation (e.g., from another agent), `lib/autopilot.ts:2471` is the entry:

1. `cmdAutopilot(cwd, args, raw)` → `runAutopilot(cwd, options)` → `lib/autopilot.ts:1630`
2. `resolvePhaseRange(cwd, phaseFrom, phaseTo)` reads ROADMAP.md → phase list (`:394`)
3. `buildWaves(phases)` computes dependency-aware parallel groups (`:1274`)
4. `createScheduler(config.scheduler, config.superpowers)` — Spec 2A scheduler (`:1664`)
5. **For each wave**, in parallel per phase:
   - Plan step: `isPhasePlanned()` check → skip or `buildPlanPrompt()` → `scheduler.spawn()` (`:1727`)
   - Execute step: create git worktree → `buildExecutePrompt()` → `scheduler.spawn()` (`:1985`)
   - Post-pipeline: `runPostPhasePipeline()` — simplify → create PR → code review → rebase+merge (`:859`)
   - Phase-finalize: `completePhaseAfterPostPipeline()` → `_phaseCompleteCore()` (`:2102`)
6. Milestone mode: after all phases, `buildWireupPrompt()` → `scheduler.spawn()` (`:2157`)
7. `scheduler.persistState(.planning)` (`:2208`)

**Data transformations:** ROADMAP.md phases → dependency waves → per-phase plan/execute/pipeline results → `AutopilotResult`.

**Side effects:** Status markers in `.planning/autopilot/`, git worktrees created/removed, PRs created, ROADMAP.md+STATE.md updated, `autopilot.log` appended.

**Error paths:** Phase plan failure → skipped in execute step; execute failure → post-pipeline skipped; post-pipeline failure → phase-finalize skipped (logged for manual recovery); `stoppedAt` set on unrecoverable error breaks the wave loop.

**Post-gsd2:** Spec 4 adaptive tier routing calls `getEffectiveTierForDispatch()` before each `scheduler.spawn()` to pick the right model based on complexity+budget pressure.

---

## Flow 5: `gd autopilot` — phase-finalize path (Spec 3 + 3B)

The mechanical completion + LLM fallback flow specifically.

After a successful post-pipeline step, autopilot calls `completePhaseAfterPostPipeline(cwd, phaseNum, scheduler)` at `lib/autopilot.ts:2102`:

```
completePhaseAfterPostPipeline()          lib/phase-complete.ts:284
  _phaseCompleteCore(cwd, phaseNum)       lib/phase-complete.ts:85
    runPreflightGates(cwd, 'phase-complete', { phase })
    readRoadmapFile / writeRoadmapFile    lib/phase-io.ts
      regex: - [ ] Phase N → - [x] Phase N: (completed DATE)
      regex: progress table Status → Complete
    readStateFile / writeStateFile        lib/phase-io.ts
      regex: **Current Phase:** → next phase number
      regex: **Status:** → Ready to plan (or Milestone complete)
    runQualityAnalysis()                  lib/cleanup.ts
    generateCleanupPlan()                 lib/cleanup.ts
  returns PhaseCompleteResult
```

If `_phaseCompleteCore` throws or returns `gate_failed`:
1. `completePhaseAfterPostPipeline` captures the error into `mechanicalFailure`
2. Checks `config.phase_complete_llm_fallback` (default `false`)
3. If `true` and scheduler is available: calls `attemptLlmFallbackCompletion()` → `lib/phase-complete-llm.ts:318`
4. LLM fallback builds a prompt with current ROADMAP.md+STATE.md content and failure description
5. `scheduler.spawn(prompt, { cwd, timeout: 10min })` → Claude edits the two files directly
6. `_verifyFallbackOutput(cwd, phaseNum)` checks: roadmap checkbox ticked, STATE advanced, progress table row
7. On success: increments `phase_complete_llm_fallback.successes_total` metric, returns synthetic `PhaseCompleteResult`
8. On failure: retries up to `phase_complete_llm_fallback_retries` times with exponential backoff (2^n seconds)
9. If all retries exhausted: returns `null` → autopilot logs "phase-finalize failed" and continues

**Side effects:** ROADMAP.md checkbox tick, STATE.md field updates, quality/cleanup plan files, in-memory metrics increments.

**Spec 3B opt-in:** Only active when `config.phase_complete_llm_fallback === true`. Existing projects see no change.

---

## Flow 6: `gd harness round` — Life-Harness Round (v0.4.4+)

One self-improvement round: gather → propose → validate → eval → decide → persist.

**Entry point:** `classifyCommand('harness')` → `'tool'` → `lib/commands/harness.ts` → `cmdHarness(cwd, ['round', ...flags], raw)` → `bin/harness_driver.py` (Python 3.11+ subprocess).

**Key call sequence:**

1. **Gather** — `harness_driver.py` calls Tesserae to collect session findings (takeaways, decisions, insights) from real GRD sessions. Bounded by `harness.min_evidence` / `harness.max_evidence` from config.
2. **Propose** — spawns a codex/claude agent (configured by `harness.backend`) with the evidence bundle; agent proposes ONE patch to GRD primitives (`commands/*.md`, `agents/*.md`, `.planning/config.json`, or `lib/**`).
3. **Validate (path guards)** — deny-list check: patch must not target `bin/harness_driver.py` or the `harness` config block itself; path guards prevent out-of-tree modifications.
4. **Eval gate** — markdown frontmatter/JSON schema checks; when code is touched: lint + tsc + targeted jest run against affected modules.
5. **Decide** — with `autonomy: "review"` (default): creates branch `harness/round-<id>` for human merge; with `autonomy: "auto"`: merges only when eval passes AND `confidence >= harness.min_confidence` (default 0.7).
6. **Persist** — records land in `.planning/harness/rounds/<id>/`: `evidence.md`, `patch.json`, `eval.json`, `RECORD.json`. Deterministic rejections are hashed into `hashes.jsonl` to deduplicate future proposals.

**Supporting commands:** `gd harness status` — shows last round result and next-eligible time; `gd harness revert <id>` — reverts a merged round by id.

**Config:** `harness` block in `.planning/config.json` — see [CONFIG.md](CONFIG.md). Kill-switch: `harness.kill_switch: true` blocks all round execution immediately.

**Side effects:** Branch `harness/round-<id>` created (or merged on `--auto`); `.planning/harness/rounds/<id>/` directory written; `hashes.jsonl` appended.

**Error paths:** Fewer than `min_evidence` findings → round exits early with `{ status: 'insufficient_evidence' }`. Validation failure → patch rejected, hash recorded, no branch created. Eval failure → patch rejected on `--auto`; branch created but not merged on `--dry-run`. Kill-switch active → exit 1 immediately.

See [docs/superpowers/specs/2026-06-06-life-harness-rounds-grd-host.md](../superpowers/specs/2026-06-06-life-harness-rounds-grd-host.md) and [docs/DEPRECATIONS.md](../DEPRECATIONS.md).

---

## Flow 6a: Life-Harness Collective Layer (Phase E, v0.4.4+)

Cross-project self-improvement: rounds running in *downstream* projects feed GRD-about evidence to the *upstream root* (the GRD repo). Zero kernel change — `Finding.source` already carries provenance.

**Downstream side (emit), gated by `harness.upstream_emit: true` (default):**

1. A round persists in any project using GRD (Flow 6, step 6).
2. The driver's emit heuristic scans the round's *selected* evidence (post-`select_evidence`, capped at `max_evidence`) for findings *about GRD itself* — content referencing `gd ` / `/grd:` commands, `grd-<agent>` names, the `GRD` token, or `life-harness` vocabulary.
3. Matches are written as `UpstreamCandidate` records (distilled finding text only — never transcripts, never patches) into `$CLAUDE_PLUGIN_DATA/harness/upstream/<origin-slug>.jsonl` (fallback `~/.grd/harness/upstream/`). The round's `RECORD.json` gains an additive `upstream_emitted: N` count.

**Upstream side (consume), gated by `harness.upstream_root: true` (set in GRD's own config):**

4. A round in the GRD repo binds a `CompositeFindingsSource` = local Tesserae findings + pending upstream candidates. Candidates arrive as ordinary `Finding`s with `source="upstream:<project>:<session>"`, so proposal rationales cite their origin.
5. Candidates are deduped across origins by content hash with an **occurrence count** — the same finding from N projects is stronger evidence. Stale candidates (older than `harness.upstream_ttl_days`, default 90) are ignored and TTL-pruned on read.
6. `select_evidence` consumes the composite bundle; consumed candidates are marked (status flip) and `RECORD.json` gains `upstream_consumed: N`.

**Operator surface:** `gd harness upstream list` (pending candidates by origin, with counts); `gd harness upstream clear [--origin <slug>]` (manual prune).

**Safety:** candidates are evidence, not patches — the existing kernel guards (path validation, deny-list, eval gate, review-mode default) contain them; an origin project can suggest but never apply. `upstream_emit` is a single per-project off switch.

**Implementation:** `UpstreamStore` + `CompositeFindings` + emit heuristic in `bin/harness_driver.py`; `cmdHarnessUpstream` in `lib/commands/harness.ts`. See [docs/superpowers/specs/2026-06-07-life-harness-phaseE-collective-design.md](../superpowers/specs/2026-06-07-life-harness-phaseE-collective-design.md).

---

## Flow 6b: `gd evolve` (Deprecated v0.4.3)

**Deprecated 2026-06-06 — the verb no longer runs.** Use **`gd harness round`**: evidence from Tesserae session findings, eval-gated, git-reversible, where evolve was a static scan whose discovery saturated. `lib/evolve/` stays in-tree because `gd singularity` reads its history. Bare `gd evolve` (and any subcommand outside `EVOLVE_TOOL_SUBS`) prints the redirect and exits 1; the `EVOLVE_TOOL_SUBS` subcommands — `run`, `discover`, `state`, `advance`, `reset` — still classify as tool commands. See [docs/DEPRECATIONS.md](../DEPRECATIONS.md).

**Former self-improvement loop** (for historical reference):

**Entry point:** `classifyCommand('evolve')` → `'deprecated'` (`lib/cli/index.ts:270–277`), handled at `bin/gd.ts:113` with a stderr pointer and `exit(1)`; only the `EVOLVE_TOOL_SUBS` subcommands (e.g. `gd evolve run`) still classify as `'tool'`.

**Agent path** invoked `commands/evolve.md` skill, which internally called `gd evolve run` as a tool to execute the actual loop. The agent handled progress reporting and user interaction.

**Tool path** `gd evolve run` → `bin/grd-tools.ts:1397` → `cmdEvolve(cwd, args, raw)` → `lib/evolve/cli.ts:100` → `runEvolve(cwd, options)` → `lib/evolve/orchestrator.ts:613`:

1. `loadConfig(cwd)` → check `branching_strategy` to decide worktree usage
2. `createScheduler(config.scheduler)` → optional scheduler
3. Loop `iterations` times (0 = infinite):
   a. `_runIterationStep(iterCtx)` → `lib/evolve/orchestrator.ts:172`
      - `runGroupDiscovery(executionCwd, state, pickPct)` → discovers code improvement items
      - If first real iteration with worktree enabled: `createEvolveWorktree(cwd)`
      - Cap batch to 10 items max
      - Build `buildBatchExecutePrompt(cappedGroups, iterationNum)`
      - `scheduler.spawn(prompt)` or `spawnClaudeAsync` → executor runs improvements
   b. `_handleIterationResult(...)` → updates EvolveGroupState
   c. `writeEvolveState(cwd, state)` → `.planning/EVOLVE-STATE.json`
4. Post-loop: if worktree has commits → `pushAndCreatePR()` → cleanup

**Why deprecated:** static-scan discovery saturated after 5+ consecutive iterations of 100% false-positive discoveries across all 6 quality dimensions. The life-harness replaces static scan with real session evidence (Tesserae findings), resolving the saturation problem.

---

## Flow 7: `gd autoresearch <topic>`

Karpathy autonomous experiment loop (post-Spec-2A async version). This is the older of GRD's two
research loops — for the current station loop behind `gd research`, see Flow 7a.

**Entry point:** `classifyCommand('autoresearch')` → `'agent'`; or `gd autoresearch` tool-path via `cmdAutoResearch` at `lib/autoresearch.ts:691`.

**Key call sequence** (`_runAutoresearchLoop` → `lib/autoresearch.ts:422`):

1. `loadConfig(cwd)` → Spec 4 config for adaptive tier routing
2. `_execGit(cwd, ['checkout', '-b', branchName])` — create experiment branch
3. `_initTsv(tsvPath)` → `.planning/AUTORESEARCH.tsv` (header row)
4. `_collectMetric(cwd, metric)` → baseline (runs `npx jest --json` for `test_count`)
5. Optional auto-survey: if no `LANDSCAPE.md`, `_spawnClaude()` with `grd:survey` skill
6. **Experiment loop** (until `maxExperiments` or indefinite):
   a. Save HEAD: `git rev-parse HEAD`
   b. `_buildExperimentPrompt()` → hypothesis + research context + experiments history
   c. `_spawnClaude(cwd, prompt, { scheduler })` → async via scheduler if available (Spec 2A), sync fallback
   d. `_collectMetric()` → post-experiment metric
   e. If improved: keep commit, append TSV row with `status: 'keep'`
   f. If not improved: `git reset --hard <headBefore>` + `git clean -fd`, TSV row `status: 'discard'`
   g. On timeout/crash: revert + TSV row `status: 'crash'`
7. Returns `AutoResearchState` with `{ experiments, baseline, best }`

**Data transformations:** topic string → experiment branch → per-iteration prompt (includes baseline, best-so-far, last N experiment summaries as context) → subprocess code changes → metric evaluation → TSV row appended.

**Side effects:** Git branch `autoresearch/YYYYMMDD` created, code modifications committed (or reverted), AUTORESEARCH.tsv rows appended. This loop only *reads* KNOWHOW.md — `_buildExperimentPrompt` calls `buildKnowledgeInjectionBlock()` (`lib/knowledge.ts`) to fold prior patterns into each iteration's prompt. It writes no KNOWHOW entries; the writer is the `gd research` loop's PERSIST station (Flow 7a).

**Post-Spec-2A async:** `_spawnClaude` (`lib/autoresearch.ts:163`) checks `opts.scheduler` first. If present, delegates to `scheduler.spawn()` — enabling account rotation, idle watchdog, and rate-limit retries (Flows 4 and 10 semantics). Falls back to `_spawnClaudeSync` (blocking `spawnSync('claude', ...)`) when no scheduler is configured.

**Error paths:** No topic arg → `error()` exits. Experiment subprocess crash (non-zero exit) → `git reset --hard` + TSV crash row + continue. Timeout (ETIMEDOUT) → same revert path + crash row. SIGINT propagated up from `waitUntilOrAbort` → loop aborts with partial results.

---

## Flow 7a: `gd research "<question>"` — Autoresearch Station Loop (v0.5.0 / v0.6.0)

The current hypothesis→experiment→measure→learn loop. Distinct from Flow 7: this one lives in
`lib/research/`, keeps its state under `.planning/research/threads/<id>/`, and never touches the
working tree the way `gd autoresearch` does.

**Entry point:** `research` is in `TOOL_COMMANDS` (`lib/cli/index.ts:114`), so `gd research "<q>"`
→ `'tool'` → `bin/grd-tools.ts:2255` (`case 'research'`) → `cmdResearchStart` → `runResearch()` →
`runLoop()` in `lib/research/orchestrator.ts`. The subcommands `resume`, `status`, `report`,
`portfolio` (`RESEARCH_TOOL_SUBS`) also route as tools; `/grd:research` is the skill wrapper.

**Stations** (`Station` in `lib/research/types.ts`, drawn in run order):

```
SEED → GROUND → HYPOTHESIZE → DESIGN → RUN → MEASURE → LEARN → DECIDE → FINALIZE → PERSIST
 ck                 ck          ck    gate1              ck                         gate2
```

`gate1` = `execute`, `gate2` = `kg_write` — both default-on, resolved by `resolveGates()`
(`lib/research/gates.ts`) from `research_gates.experiment_execution` / `research_gates.kg_write`,
and both bypassed by `--no-gates`. A blocked gate saves the thread as `status: 'paused'` with a
`pendingGate` and returns; `gd research resume <id>` picks it back up. `ck` marks the four
interactive checkpoint points (below); the DECIDE one fires on the *would-continue* branch only, so
a terminal verdict is never delayed by it.

(The `Station` union lists `persist` before `finalize`. At run time the terminal `FINDING.md` is
written first, and the `kg_write` gate then guards the KG sync plus knowledge promotion.)

**Key call sequence:**

1. **HYPOTHESIZE** — the `grd-hypothesizer` agent returns one or more candidates; `parseHypothesisOutput` / `parseHypothesesOutput` (`lib/research/agent-io.ts`) **drop any candidate whose `refutationCondition` is missing or empty**, at parse time and before ranking. The multi-candidate parser reports how many it dropped as `droppedForRefutation`; the single-hypothesis parser returns `null` and `describeHypothesisRejection` explains why. Nothing without a stated falsifier reaches the ledger. `refutationOverlap` (token-Jaccard against the statement) rides along as advisory metadata and gates nothing.
2. **DESIGN** — the `grd-experiment-runner` agent writes `plan.json` (an `ExperimentPlan`: script, `metricKey`, `comparator`, `target`, optional `baseline`). It does not execute it.
3. **RUN** (behind the `execute` gate) — `runner.ts` or `docker-runner.ts` executes the script per `research_sandbox` (`docker` / `subprocess` / `auto`). When `research_max_debug_depth > 0` (default 0, clamped to [0,5] by `readDebugDepth()`), a **nonzero exit** is retried up to that many times with a fix-and-retry re-plan, each attempt journalled to `debug-attempt-<n>.json`. Two invariants hold across those retries: the `execute` gate is **re-checked** before each one (the original approval covered the DESIGN-time script, not an LLM-rewritten one — a denial aborts the debug loop and degrades to the depth-0 outcome rather than pausing mid-RUN), and the DESIGN-committed `metricKey` / `comparator` / `target` / `language` / `baseline` are pinned back over any drift in the re-plan. A metric miss is never retried here.
4. **MEASURE** — `evaluateVerdict(plan, result)` (`lib/research/verdict.ts`) is fully deterministic:
   - `exitCode !== 0` → `inconclusive`, `cause: 'run_failed'`
   - the plan's `metricKey` absent from `result.metrics` (own-key check) → `inconclusive`, `cause: 'metric_absent'`
   - otherwise `compare(value, comparator, target)` → `supported` or `refuted`
5. **REDESIGN on `metric_absent`** — an experiment that ran but never emitted the metric it committed to be judged on is a *design* fault, not an engineering one, so neither the debug loop nor a fresh hypothesis is the right repair. The orchestrator instead re-enters the existing crash-recovery path: it puts the hypothesis back to `testing`, deletes `plan.json`, does **not** advance `thread.iteration`, and `continue`s — DESIGN re-runs for the **same** hypothesis at the same iteration. Bounded by `thread.redesignCount < research_max_debug_depth`, a budget **shared with** the debug loop rather than additive. Any other outcome resets `redesignCount` and `metricAbsentStreak` to 0.
6. **DESIGN PLATEAU** — consecutive iterations that exhaust their redesign budget without ever producing a measurable experiment trip `detectDesignPlateau()` (window = the resurvey window) and terminate the thread as `exhausted` with its own diagnosis, separate from the ordinary refutation plateau that triggers a re-survey.
7. **LEARN** — `grd-knowledge-miner` turns the outcome (verdict, `cause`, and the declared baseline margin) into a `Takeaway` appended to the thread.
8. **DECIDE / FINALIZE** — `shouldTerminate()` + `decideBranch()`. On terminate, `buildFinding()` writes `FINDING.md` (including the margin vs `plan.baseline` — declared, never verdict-affecting) *before* the `kg_write` gate.
9. **PERSIST** — `finishKgSync()` syncs the finding to the Tesserae KG, then calls `promoteThreadKnowledge()` (`lib/research/promote.ts`) at the single PERSIST chokepoint.

### The knowledge loop closes (v0.6.0)

`promoteThreadKnowledge` writes takeaways into `KNOWHOW.md` (`source: research:<threadId>#iter<n>`,
`phase_number: 0`) and falsified hypotheses into `.planning/DEAD-ENDS.md`. The write gate is a
**conjunction over on-disk artifacts** — a recognised `kind`, non-empty evidence, a settled verdict
(`supported`/`refuted`; `inconclusive` is deliberately excluded), and a non-empty `metrics` object
read back from `experiments/<n>/result.json` — not the mining agent's self-reported `confidence`.
Gated by `research_persist_knowledge` (default on). Entries **supersede** rather than overwrite: the
prior entry gains `superseded_by` and stays on disk.

Those entries are then read back on the phase-workflow side, which is what previously did not
happen:

- `selectTopEntries()` (`lib/knowledge.ts`) scores entries as `phase_number * 1000 + …`, so a
  research entry at `phase_number: 0` could never place against any phase-numbered entry. It now
  **reserves** `max(1, floor(n/3))` of the `n` slots for `research:`-sourced entries (discriminated
  on `source`, not on `phase_number === 0`), ranked among themselves by recency.
- `buildKnowledgeInjectionBlock()` wraps the selection in `<knowhow_context>` tags, and
  `knowhow_block` is injected into **both** the planner (`lib/context/execute.ts` →
  `commands/plan-phase.md`) and the executor (`commands/execute-phase.md`) prompts. It was
  previously computed and dropped.

### Interactive checkpoints (v0.5.0)

Four points can pause for a human: `seed`, `hypothesize`, `design`, `decide` (`CheckpointPoint`).
Configured under `research_gates.interactive` — `enabled` defaults to **false**; per-point flags
default true; `max_rounds` 2, `max_questions` 4, `hypothesis_candidates` 3, `every_iteration` false,
`fallback` `'recommended'` (`defaultInteractive()` in `lib/research/checkpoints.ts`). One-shot
overrides: `--interactive` / `--interactive=seed,design` / `--no-interactive`; `--no-gates` implies
non-interactive.

`resolveInteractive()` forces the posture inactive whenever nobody can answer — `--no-gates`,
`autonomous_mode`, autopilot (including the `GRD_AUTOPILOT` env carrier), or portfolio concurrency
> 1. What happens then is the point of the design: **the loop never pauses unattended.**

- Attended + point enabled → `emitCheckpoint()` sets `status: 'paused'` and records a
  `pendingCheckpoint`; the run returns. Resume with
  `gd research resume <id> --answers <file|->` (a file or stdin — never argv).
- Unattended + `fallback: 'panel'` → `resolveCheckpointInline()` calls `answerViaDiscussion()`,
  which puts the question to the AI discussion panel (the loop's own backend excluded, so it never
  self-consults) and matches panel lines back to option labels exact → prefix → recommended default.
  Every degenerate path (throwing resolver, empty synthesis, rate-limited or logged-out panelist,
  unparseable answer) falls back to the recommended default. Status is never set to `'paused'`; the
  resolved checkpoint is fed back through the same consume path a human resume uses.
- Unattended + `fallback: 'recommended'` (the default) → each question resolves to its recommended
  option, byte-identical to the pre-0.5.0 path.

Checkpoint records append to `checkpoints.jsonl` in the thread directory either way.

**Side effects:** `.planning/research/threads/<id>/` — thread state, the hypothesis ledger `HYPOTHESES.md`, `experiments/<n>/plan.json` and `result.json`, `checkpoints.jsonl`, `FINDING.md`, optional `EVAL.md` (`research_eval_report`, default off); `KNOWHOW.md` and `.planning/DEAD-ENDS.md` appends at PERSIST; Tesserae KG writes behind the `kg_write` gate.

**Error paths:** Gate blocked → `status: 'paused'` + `pendingGate`, resume required. Script execution failure → debug retries up to `research_max_debug_depth`, then `inconclusive`/`run_failed`. Metric never emitted → redesign up to the same budget, then `inconclusive`/`metric_absent` and, on a streak, DESIGN PLATEAU → `exhausted`. Refutation plateau → re-survey (bounded by `research_max_resurveys`) before `exhausted`. Resuming a thread already in a terminal status (`supported` / `exhausted` / `abandoned`) returns it unchanged rather than re-running.

---

## Flow 8: `gd phase complete <N>`

Manual phase completion (mechanical + LLM fallback paths).

**Entry point:** `classifyCommand('phase')` → `'tool'` → `bin/grd-tools.ts` → `case 'phase'` + `case 'complete'` → `cmdPhaseComplete(cwd, phaseNum, raw)` → `lib/phase.ts:1101`.

**Mechanical path:**

1. `_phaseCompleteCore(cwd, phaseNum)` → `lib/phase-complete.ts:85`
2. `runPreflightGates(cwd, 'phase-complete', { phase })` — checks execution status, gate config
3. Regex-rewrite ROADMAP.md: checkbox tick + progress table Status → Complete
4. Regex-rewrite STATE.md: Current Phase, Status, Last Activity
5. `runQualityAnalysis()` → optional quality report
6. `generateCleanupPlan()` → optional cleanup plan file
7. `output(result, raw)` → JSON or plain text

**LLM fallback path** (when `config.phase_complete_llm_fallback === true`):

If `_phaseCompleteCore` throws (`lib/phase.ts:1116`):
- `createScheduler(config.scheduler)` — creates scheduler for this invocation
- `attemptLlmFallbackCompletion(cwd, phaseNum, scheduler, error)` → same flow as Flow 5

If `_phaseCompleteCore` returns `gate_failed` (`lib/phase.ts:1154`):
- Same LLM fallback path with `{ gate_errors: result.gate_errors }` as failure descriptor

**Side effects:** ROADMAP.md checkbox tick, STATE.md field updates, optional quality/cleanup plan files.

**Error paths:** Phase not found → `throw new Error('Phase N not found')`; gate failure without fallback → `output(gate_failed: true, gate_errors: [...])`.

---

## Flow 9: `gd settings <key> <value>`

Config updates: how the key gets validated and saved.

**Entry point:** `classifyCommand('settings', 'token_profile')` → `'tool'` (Spec-specific subcommands only; other subcommands → `'agent'`). `lib/cli/index.ts:173`: `SETTINGS_TOOL_SUBS = new Set(['token_profile', 'phase_complete_llm_fallback'])`.

**Tool path for known keys** → `bin/grd-tools.ts:1366`:

```
case 'settings':
  sub = args[1]         // e.g. 'token_profile'
  value = args[2]       // e.g. 'balanced'
  validate value against allowed set
  cmdConfigSet(cwd, 'token_profile', value, raw)
    → lib/commands/config.ts:219
```

`cmdConfigSet` (`lib/commands/config.ts:219`):
1. Reads `.planning/config.json` (or starts with `{}`)
2. Parses `value` → boolean/number/string
3. Splits `keyPath` on `.` and walks/creates nested objects
4. `fs.writeFileSync(configPath, JSON.stringify(config, null, 2))`
5. `output({ updated: true, key, value }, raw)`

**Validation:**
- `token_profile`: must be `'frugal' | 'balanced' | 'quality'` — `lib/grd-tools.ts:1370`
- `phase_complete_llm_fallback`: must be `'true' | 'false'` — `lib/grd-tools.ts:1379`
- Unknown tool-mode sub → `error(...)` + `process.exit(1)`

**Agent path** (all other settings subcommands): Dispatched to the `commands/settings.md` skill, which asks the user to configure workflow settings conversationally and may call `config-set` internally.

**Side effects:** `.planning/config.json` rewritten in-place.

**Error paths:** File read failure → `error('Failed to read config.json: ...')` + exit 1; write failure → same.

---

## Flow 10: `scheduler.spawn` internals — `_spawnWithRetry`

What happens inside `_spawnWithRetry` including Spec 2A wait branch, Spec 2B idle watchdog, adaptive routing, and rate-limit retries.

`scheduler.spawn(prompt, opts)` → `_spawnWithRetry(prompt, opts, retryCount=0)` at `lib/scheduler.ts:831`.

**Account/backend resolution:**

1. If `accountRotation` mode: `resolveAccount(superpowersConfig, schedulerConfig, states, safetyMargin)` picks the account with most headroom → sets `backend`, `stateKey`, `envOverrides`
2. Else: `pickBackend(filteredPriority, states, safetyMargin, free_fallback)` → simplest priority-based pick

**Spec 2A — bounded wait branch** (`lib/scheduler.ts:872`):

If account-rotation mode and `backend === free_fallback` and no priority account has headroom:
- `computeSoonestRecovery(states, priority, accounts, windowMinutes, maxWaitMs)` → nearest recovery timestamp
- If `recoveryTime !== null` and different from last attempt: log wait message, `await waitUntilOrAbort(recoveryTime)` (`lib/scheduler-wait.ts:33`)
- On SIGINT: throw `'scheduler: wait for account recovery interrupted by SIGINT'`
- On expiry: recursive `_spawnWithRetry(prompt, opts, retryCount, recoveryTime)`

**Subprocess spawn** (`lib/scheduler.ts:925`):

1. `spawn(adapter.binary, args, { detached: true })` — new process group on POSIX
2. **Spec 2B idle watchdog**: `_startIdleWatchdog(idleTimeoutMs, callback)` polls every 1s; on idle > threshold: `_killProcessTree(child, 'SIGTERM')` → 5s grace → `SIGKILL`; sets `idleTimedOut=true`, increments `scheduler.idle_kills_total` counter
3. **Total timeout**: `setTimeout → SIGTERM → SIGKILL` after `opts.timeout` ms
4. `child.stdout/stderr.on('data')` → `watchdog.markActivity()` + buffer accumulation (50MB cap)
5. `child.on('close')` → `markComplete(state)` → `recordSample(state, sample, ...)` — updates EWMA; persists state every 10 samples

**Rate-limit retry** (`lib/scheduler.ts:1053`):

If `adapter.isRateLimited(exitCode, stderr)` (HTTP 429 pattern):
- Set `state.cooldown_until = Date.now() + window_minutes * 60_000`
- If `retryCount < maxRetries`: recursive `_spawnWithRetry(prompt, opts, retryCount + 1)`
- If `retryCount >= maxRetries`: return last result (exhausted)

**Return value:** `SchedulerSpawnResult { exitCode, stdout?, stderr?, timedOut, idleTimedOut, backend, tokensUsed, workItemId }`. The `idleTimedOut` flag lets callers distinguish idle-kills (subprocess silent) from total-timeout kills (wall-clock exceeded), which matters for retry decisions.

**Sample recording:** On `child.on('close')`, `recordSample(state, sample, prediction.window_minutes, prediction.ewma_alpha)` stores `{ duration, tokenEstimate, exitCode }` into the state's sliding EWMA window. Every 10 samples across all backends, `scheduler.persistState(join(opts.cwd, '.planning'))` writes the sample map to `.planning/scheduler-state.json`. On next `createScheduler`, `scheduler.loadPersistedState(.planning)` restores it — so rate-limit history survives across `gd` invocations within an autopilot session.

**Adaptive routing (Spec 4):** Before calling `scheduler.spawn()`, callers in `autopilot.ts` and `autoresearch.ts` call `getEffectiveTierForDispatch({ agentType, prompt, config, scheduler, ... })` from `lib/backend.ts`. This classifies prompt complexity and checks budget pressure level (none / warning / high / critical) to compute a model tier downgrade offset according to the `token_profile` setting. The resolved tier is passed to `resolveModelForAgent()` which picks the concrete model string for the `--model` flag.

**Error paths:** Child process spawn error (binary not found) → `child.on('error')` → `safeResolve({ exitCode: 1 })`. Buffer overflow (>50MB) → `stdoutOverflowed = true`, stdout not captured but process continues. All retries exhausted → final `SchedulerSpawnResult` with non-zero exit code returned to caller.

---

## Cross-references

- `OVERVIEW.md` — Top-level architecture, entry points, module map
- `MODULES.md` — Per-module responsibilities and public API surface
- `API.md` — All exported function signatures with type descriptions
- `RISKS.md` — Identified maintainability, reliability, and security risks
- `USE_CASES.md` — User journeys and workflow scenarios
