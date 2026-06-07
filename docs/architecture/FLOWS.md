# GRD Command Flows

This document traces the 10 key user-observable commands from CLI invocation to
side-effect completion. Each flow answers: "what actually happens when I type `gd X`?"

---

## Dispatch Preamble (all commands)

Every `gd` invocation follows this common prefix before reaching a flow-specific handler:

1. `bin/gd.js` — 3-line shim: registers `tsx/cjs` for direct `.ts` resolution, delegates to `bin/gd.ts`
2. `bin/gd.ts:55` — calls `parseFlags(process.argv.slice(2))` → `lib/cli/index.ts:175`
3. `bin/gd.ts:88` — calls `classifyCommand(command, subcommand)` → `lib/cli/index.ts:217`
   - Returns `'tool'` if command is in `TOOL_COMMANDS` set, or matches evolve/settings/init-workflow special cases
   - Returns `'agent'` if command is in `AGENT_COMMANDS` set
4. **Tool path** (`bin/gd.ts:91`): `runToolCommand()` → `lib/cli/tools.ts:140` → `execFileSync('node', ['bin/grd-tools.js', ...args])` (in-process for `scan` only)
5. **Agent path** (`bin/gd.ts:95`): `runAgentCommand()` → `lib/cli/agent.ts:27` → `buildPromptForCommand()` → `/grd:<command> <args>` → `spawnSync(adapter.binary, cliArgs)`

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
6. On pass: assembles result object with `backend`, `phase_found`, `planner_model`, `researcher_model`, `plan_checker_enabled`, etc.
7. Agent receives context JSON, runs `grd-phase-researcher` and `grd-planner` sub-agents
8. Each plan is written to `.planning/milestones/<ver>/phases/phase-<N>/PLAN-<slug>.md`

**Data transformations:** Phase number → preflight gate check → context JSON → agent-authored PLAN.md files with YAML frontmatter (`provides`, `requires`, `integration_points`, `files_modified`). The `requires`/`provides` fields are used later by `buildWavesFromPlans` to construct the artifact-level dependency DAG for wave grouping during execution.

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
4. Context output includes `executor_model`, `parallelization`, `branching_strategy`, `code_review_enabled`, available plans list
5. Agent reads PLAN.md files, groups them into dependency waves via `buildWavesFromPlans` semantics (reads `provides`/`requires` frontmatter)
6. For each wave: dispatches plans in parallel as sub-agents (one per plan), each writing its summary to `SUMMARY-<slug>.md`
7. After all plans in wave complete: plan summaries aggregated, agent commits with `gd commit`

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

## Flow 6: `gd harness round` — Life-Harness Round (v0.4.3+)

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

## Flow 6b: `gd evolve` (Deprecated v0.4.3)

**Deprecated (v0.4.3):** superseded by the life-harness (`gd harness round`); kept for `gd singularity` history. Running `gd evolve` now prints a pointer to `gd harness round` and exits 1. The read-only introspection subcommands (`gd evolve state`, `gd evolve advance`, `gd evolve reset`) still route as tool commands for history inspection.

**Former self-improvement loop** (for historical reference):

**Entry point:** `classifyCommand('evolve')` → `'agent'`; but `gd evolve run` → `'tool'` (evolve tool subcommands: `lib/cli/index.ts:221`).

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

Karpathy autonomous experiment loop (post-Spec-2A async version).

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

**Side effects:** Git branch `autoresearch/YYYYMMDD` created, code modifications committed (or reverted), AUTORESEARCH.tsv rows appended. Knowledge mining step (when enabled) extracts successful experiment patterns into KNOWHOW.md.

**Post-Spec-2A async:** `_spawnClaude` (`lib/autoresearch.ts:163`) checks `opts.scheduler` first. If present, delegates to `scheduler.spawn()` — enabling account rotation, idle watchdog, and rate-limit retries (Flows 4 and 10 semantics). Falls back to `_spawnClaudeSync` (blocking `spawnSync('claude', ...)`) when no scheduler is configured.

**Error paths:** No topic arg → `error()` exits. Experiment subprocess crash (non-zero exit) → `git reset --hard` + TSV crash row + continue. Timeout (ETIMEDOUT) → same revert path + crash row. SIGINT propagated up from `waitUntilOrAbort` → loop aborts with partial results.

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
