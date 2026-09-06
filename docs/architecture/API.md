# GRD API Reference

Exported symbols from all `lib/*.ts` modules, plus selected subdirectory modules (`lib/commands/harness.ts`, the falsification-loop surface of `lib/research/`). Use this document to look up the signature, purpose, and behavior of any public function, constant, or type. The full module inventory, including every subdirectory, is in **MODULES.md**.

All modules use CommonJS (`module.exports = { ... }`) unless they mix in ES-module `export` statements (which TypeScript compiles identically). Both forms are documented here.

---

## lib/types.ts

Central type registry. Pure declarations — no runtime exports. All symbols here are `export type` or `export interface`.

### Types

#### `BackendId`
```ts
type BackendId = 'claude' | 'codex' | 'gemini' | 'opencode' | 'overstory' | 'superpowers' | 'grd'
```
Discriminated union of all recognized backend identifiers.

#### `ModelTier`
```ts
type ModelTier = 'opus' | 'sonnet' | 'haiku'
```
Abstract capability tier, resolved to backend-specific model names by `resolveBackendModel`.

#### `ModelProfileName`
```ts
type ModelProfileName = 'quality' | 'balanced' | 'budget'
```
User-selected workflow profile controlling which model tier agents receive.

#### `TokenProfileName`
```ts
type TokenProfileName = 'frugal' | 'balanced' | 'quality'
```
Adaptive model-tier downgrade profile (Spec 4). Controls how aggressively tiers are downgraded under budget pressure.

#### `BudgetPressureLevel`
```ts
type BudgetPressureLevel = 'none' | 'warning' | 'high' | 'critical'
```
Classified pressure level used by the adaptive tier routing chain.

#### `ComplexityLevel`
```ts
type ComplexityLevel = 'low' | 'medium' | 'high'
```
Task complexity estimate used by `estimateComplexity` as an input to adaptive tier routing.

#### `EffortLevel`
```ts
type EffortLevel = 'low' | 'medium' | 'high'
```
Agent reasoning-depth setting for backends that support it (Claude Code v2.1.68+).

#### `DiscussionRole`
```ts
type DiscussionRole = 'reviewer' | 'brainstormer' | 'verifier' | 'executor'
```

#### `BackendRolesConfig`
```ts
type BackendRolesConfig = Partial<Record<DiscussionRole, BackendId>>
```
Maps discussion roles to specific backends.

#### `AgentEffortProfiles`
```ts
type AgentEffortProfiles = Record<string, Record<ModelProfileName, EffortLevel>>
```

#### `AgentModelProfiles`
```ts
type AgentModelProfiles = Record<string, Record<ModelProfileName, ModelTier>>
```

#### `MetaBackendId`
```ts
type MetaBackendId = 'superpowers' | 'grd'
```

#### `AdapterBackendId`
```ts
type AdapterBackendId = Exclude<BackendId, MetaBackendId>
```
Backends that have a concrete CLI adapter in `lib/scheduler.ts`.

#### `DirectBackendId`
```ts
type DirectBackendId = AdapterBackendId
```

### Interfaces (selected key ones)

#### `BackendCapabilities`
Capability flags per backend. Fields: `subagents`, `parallel`, `teams`, `hooks`, `mcp`, `native_worktree_isolation`, `effort`, `http_hooks`, `cron`, `smart_approvals`, `plan_mode`, `sandbox_gvisor`, `sandbox_lxc`, `mcp_elicitation`, `model_overrides`, `max_output_tokens`.

#### `GrdConfig`
Full project config as returned by `loadConfig()`. Includes `model_profile`, `branching_strategy`, `scheduler`, `superpowers`, `ceremony`, `discussion`, `evolve` (deprecated v0.4.3), `harness` (v0.4.4+; includes the Phase E `upstream_*` collective-layer keys), `citation_gate`, `refinement_loop`, `phase_complete_llm_fallback`, `timeouts`, and all code review / execution settings.

#### `SchedulerConfig`
Scheduler configuration block from `config.json`. Fields include `backend_priority`, `free_fallback`, `prediction` (ewma, window, safety margins), `backend_limits`, `max_wait_minutes`, `idle_timeout_seconds`, `idle_timeout_seconds_by_backend`, `budget_pressure_thresholds`.

#### `BackendUsageState`
Per-account runtime state tracked by the scheduler. Fields: `samples`, `ewma_tokens_per_task`, `tokens_consumed_in_window`, `tokens_reserved`, `in_flight_count`, `token_budget`, `budget_learned`, `budget_confidence`, `cooldown_until`.

#### `SpawnOpts`
Options passed to `scheduler.spawn()`. Fields: `model` (optional override), `maxTurns`, `effort`, `disallowedTools`, `cwd`, `env`, `timeout`.

#### `SchedulerSpawnResult`
Result from `scheduler.spawn()`. Fields: `exitCode`, `stdout`, `stderr`, `backend`, `stateKey`, `tokenEstimate`, `durationMs`, `rateLimited`, `idleTimedOut`.

#### `SuperpowersConfig`
Multi-account configuration. Fields: `accounts` (map of backend to account list), `default_backend`, `account_rotation`.

#### `AccountConfig`
Single backend account. Fields: `config_dir`, `label`.

#### `AccountResolution`
Resolved account from `resolveAccount()`. Fields: `backend`, `account`, `stateKey`.

#### `PhaseInfo`
Returned by `findPhaseInternal()`. Fields: `found`, `directory`, `phase_number`, `phase_name`, `phase_slug`, `plans`, `summaries`, `incomplete_plans`, `has_research`, `has_context`, `has_verification`, `consistency_warning`.

#### `MilestoneInfo`
`{ version: string; name: string }`

#### `BudgetPressureThresholds`
`{ warning: number; high: number; critical: number }` — configurable via `scheduler.budget_pressure_thresholds`.

#### `BackendAvailability`
`{ available: boolean; version: string | null }` — result from `detectAvailableBackends`.

#### `WebMcpResult` / `PlaywrightResult`
`{ available: boolean; source: string; reason?: string }` — result from `detectWebMcp` / `detectPlaywright`.

---

## lib/utils.ts

Zero-dependency foundation. All other modules import from here.

### Constants

#### `GIT_ALLOWED_COMMANDS: Set<string>`
Allowlist of git subcommands that `execGit` permits without `allowBlocked: true`.

#### `GIT_BLOCKED_COMMANDS: Set<string>`
Commands blocked by `execGit` (`config`, `push`, `clean`).

#### `GIT_BLOCKED_FLAGS: Set<string>`
Flags blocked by `execGit` (`--force`, `-f`, `--hard`, `--delete`, `-D`).

#### `MODEL_PROFILES: AgentModelProfiles`
Tier assignments per agent type and model profile. 18 agents mapped across `quality`, `balanced`, `budget` columns.

#### `CODE_EXTENSIONS: Set<string>`
Set of code file extensions recognized by `findCodeFiles` (`.ts`, `.js`, `.py`, `.go`, `.rs`, `.swift`, `.java`).

### Functions

#### `parseIncludeFlag(args: string[]): Set<string>`
Parses `--include value1,value2` from a CLI argument array. Returns empty set if flag is absent.

#### `safeReadFile(filePath: string): string | null`
Reads a file as UTF-8. Returns `null` on any error (not found, permission denied, etc.).

#### `safeReadMarkdown(filePath: string): string | null`
Like `safeReadFile` but transparently reassembles GRD split-format index files (files containing the `<!-- GRD-INDEX -->` marker). Falls back to raw file content if split assembly fails.
- **Side effects** — reads multiple partial files from disk when reassembling.

#### `safeReadJSON(filePath: string, defaultValue?: unknown): unknown`
Reads and JSON-parses a file. Returns `defaultValue` (default `null`) on any error.

#### `extractMarkdownSection(content: string, heading: string, level?: number): string | null`
Extracts the body text under a markdown heading. `level` defaults to `2` (`##`). Match is case-insensitive.
- **Returns** — section body without the heading line, or `null` if not found.

#### `levenshteinDistance(s1: string, s2: string): number`
Computes edit distance between two strings. Used internally by `findClosestCommand`.

#### `findClosestCommand(input: string | null, commands: string[]): string | null`
Returns the closest match from `commands` using Levenshtein distance. Returns `null` if no command is within threshold (max 3 or 1/3 of command length).

#### `clearPhaseCache(): void`
Clears the internal phase directory cache used by `findPhaseDir`. Used in tests.

#### `loadConfig(cwd: string): GrdConfig`
Reads and merges `.planning/config.json` with hardcoded defaults. Normalizes nested config sections (`git.*`, `workflow.*`, `code_review.*`, `execution.*`), validates `model_profile` and `backend_roles` values, and warns about unrecognized top-level keys.
- **Returns** — merged `GrdConfig` with all fields populated.
- **Side effects** — writes warnings to `stderr` for invalid/unrecognized config keys.

#### `isGitIgnored(cwd: string, targetPath: string): boolean`
Checks if a path is ignored by git using `git check-ignore -q`. Returns `false` on any error or if `targetPath` contains a null byte.
- **Side effects** — spawns `git check-ignore` subprocess.

#### `execGit(cwd: string, args: string[], opts?: { allowBlocked?: boolean }): ExecGitResult`
Executes a git command with allowlist enforcement. Blocks commands in `GIT_BLOCKED_COMMANDS` and flags in `GIT_BLOCKED_FLAGS` unless `opts.allowBlocked` is true.
- **Returns** — `{ exitCode, stdout, stderr }`.
- **Side effects** — spawns `git` subprocess.

#### `normalizePhaseName(phase: string): string`
Zero-pads a phase number to two digits (e.g., `'7'` → `'07'`, `'7.1'` → `'07.1'`). Rejects path traversal and directory separators.
- **Throws** — if phase contains `..`, `/`, `\\`, or is not a string.

#### `findCodeFiles(dir: string, maxDepth: number, found: string[], depth: number): string[]`
Recursively finds code files (extensions in `CODE_EXTENSIONS`), capped at 5 results. Skips `node_modules` and `.git`.

#### `validatePhaseName(phase: string): string`
Strict phase name validation. Rejects traversal, null bytes, separators, and non-matching formats.
- **Throws** — descriptive `Error` for any violation.

#### `validateFilePath(filePath: string, cwd: string): string`
Validates that a file path does not escape the project directory (`cwd`).
- **Throws** — if path contains null bytes or resolves outside `cwd`.

#### `validateGitRef(ref: string): string`
Validates git ref format. Prevents dash-prefix flag injection, traversal, and non-alphanumeric characters.
- **Throws** — descriptive `Error` for invalid refs.

#### `validatePhaseArg(phase: string): string`
CLI-layer phase argument validation. Throws if missing or malformed.

#### `validateFileArg(filePath: string, cwd: string): string`
CLI-layer file path validation. Throws if missing or escapes project.

#### `validateSubcommand(sub: string, validSubs: string[], parentCmd: string): string`
CLI-layer subcommand validation. Throws with an available-commands message on failure.

#### `validateRequiredArg(value: unknown, argName: string): unknown`
Throws if `value` is `null`, `undefined`, or empty string.

#### `output(result: unknown, raw: boolean, rawValue?: unknown): never`
Writes result to `stdout` and calls `process.exit(0)`. If `raw` is true, writes `rawValue` as plain text; otherwise JSON-serializes `result`.
- **Side effects** — terminates the process.

#### `error(message: string): never`
Writes `Error: <message>` to `stderr` and calls `process.exit(1)`.
- **Side effects** — terminates the process.

#### `debugLog(message: string, data?: unknown): void`
Writes a debug message to `stderr` when `GRD_DEBUG` env var is set. No-op otherwise.

#### `createRunCache(): RunCache`
Returns a `{ init(), reset(), get(key, reader) }` cache object for run-scoped file content memoization. `init()` activates the cache; `reset()` deactivates and clears it; `get()` calls `reader(key)` on cache miss.

#### `findPhaseDir(phasesDir: string, phaseArg: string): string | null`
Finds a phase directory inside `phasesDir` matching `phaseArg` by exact normalized name or prefix match. Returns `null` if not found.

#### `parsePhaseNumber(str: string): string | null`
Extracts the numeric phase number from a directory name string (e.g., `'01-feature-name'` → `'1'`). Returns `null` if no match.

#### `walkJsFiles(rootDir: string, excludePatterns?: string[]): string[]`
Recursively collects relative paths to all `.js` files under `rootDir`. Skips `node_modules`, `.git`, `.planning`, and paths matching `excludePatterns`.

#### `resolveModelInternal(cwd: string, agentType: string): string`
Resolves the model name for an agent by reading config, looking up `MODEL_PROFILES`, detecting the backend, and calling `resolveBackendModel`.
- **Side effects** — reads config.json from disk.

#### `findPhaseInternal(cwd: string, phase: string): PhaseInfo | null`
Enumerates the phases directory to find a matching phase, then inventories its plans, summaries, research, context, and verification files. Also checks ROADMAP.md for consistency.
- **Returns** — `PhaseInfo` object, or `null` if phase not found.
- **Side effects** — reads directory and ROADMAP.md from disk.

#### `pathExistsInternal(cwd: string, targetPath: string): boolean`
Checks if a path (relative or absolute) exists via `fs.statSync`.

#### `generateSlugInternal(text: string): string | null`
Converts text to a kebab-case slug (lowercase, non-alphanumeric → `-`, strip leading/trailing dashes). Returns `null` for falsy input.

#### `stripShippedSections(content: string): string`
Removes `<details>...</details>` blocks from ROADMAP.md content, stripping archived milestone sections.

#### `getMilestoneInfo(cwd: string): MilestoneInfo`
Extracts the active milestone version and name from `.planning/ROADMAP.md` using a 4-strategy detection cascade. Falls back to `{ version: 'v1.0', name: 'milestone' }` on any error.

#### `resolveModelForAgent(config: GrdConfig, agentType: string, cwd?: string, options?: { effectiveTierOverride?: ModelTier }): string`
Resolves the model name for an agent from a pre-loaded config. When `cwd` is provided, resolves to backend-specific model name. When `options.effectiveTierOverride` is set, it bypasses the `MODEL_PROFILES` lookup (used by Spec 4 adaptive routing).

#### `resolveEffortForAgent(config: GrdConfig, agentType: string, cwd?: string): string | null`
Returns the effort level string for an agent if the backend supports it; returns `null` otherwise.

---

## lib/backend.ts

Backend detection, model resolution, capability flags, and adaptive tier routing.

### Constants

#### `VALID_BACKENDS: readonly BackendId[]`
Ordered list of all recognized backend IDs.

#### `DEFAULT_BACKEND_MODELS: Record<BackendId, ModelTierMap>`
Maps abstract tiers (`opus`/`sonnet`/`haiku`) to concrete model names per backend. Used as fallback when no user override or dynamic detection applies.

#### `BACKEND_CAPABILITIES: Record<BackendId, BackendCapabilities>`
Capability flags for each backend. Source of truth referenced in CLAUDE.md.

#### `EFFORT_PROFILES: AgentEffortProfiles`
Default effort levels per agent type and model profile. 19 agents mapped across `quality`, `balanced`, `budget` columns. Used by `resolveEffortLevel`.

#### `BACKEND_CONFIG_ENV: Record<string, string>`
Maps each dispatchable backend to its config-directory environment variable (`CLAUDE_CONFIG_DIR`, `CODEX_HOME`, `GEMINI_CLI_HOME`, `OPENCODE_CONFIG_DIR`).

### Functions

#### `detectBackend(cwd: string): BackendId`
Detects the active AI CLI backend via a four-step waterfall: (1) `config.json` `backend` field, (2) environment variables (`SUPERPOWERS_HOME`, `OVERSTORY_HOME`, `CLAUDE_CODE_*`, `CODEX_HOME`, `GEMINI_CLI_HOME`, `OPENCODE`), (3) filesystem clues (config files in project root), (4) default `'claude'`.
- **Returns** — `BackendId` string.
- **Side effects** — reads `config.json` from disk; stats several filesystem paths.

#### `resolveBackendModel(backend: string, tier: ModelTier, config?: Record<string, unknown>, cwd?: string): string | undefined`
Resolves an abstract model tier to a backend-specific model name. Priority: (1) user `backend_models` override in config, (2) dynamically detected models (opencode only, cached), (3) `DEFAULT_BACKEND_MODELS`.
- **config** — optional parsed config.json for user overrides.
- **cwd** — optional project root for dynamic model detection.

#### `resolveEffortLevel(agentType: string, profile: ModelProfileName): EffortLevel`
Looks up the effort level for an agent from `EFFORT_PROFILES`. Unknown agents return `'medium'`; unknown profiles fall back to `'balanced'` then `'medium'`.

#### `getBackendCapabilities(backend: string): BackendCapabilities`
Returns capability flags for the given backend. Unknown backends return minimal capabilities (most flags false) and emit a warning to `stderr`.
- **Side effects** — writes to `stderr` for unknown backends.

#### `parseOpenCodeModels(stdout: string): DetectedModels | null`
Parses `opencode models` CLI output into a tier-classified map. Classifies model IDs by regex patterns (`opus`, `sonnet`, `haiku`, `pro`, `flash`, `mini`, `spark`). Returns `null` if no models matched.

#### `detectModels(backend: string, cwd?: string): DetectedModels | null`
Runs the backend's model-listing command to detect available models. Currently only implemented for `opencode` (runs `opencode models`). Returns `null` for all other backends or on failure.
- **Side effects** — spawns subprocess for `opencode`.

#### `getCachedModels(backend: string, cwd?: string): DetectedModels | null`
Returns cached detected models, refreshing if the 5-minute TTL has expired.

#### `clearModelCache(): void`
Clears the model detection cache. Used in tests.

#### `detectWebMcp(cwd: string): WebMcpResult`
Detects Chrome DevTools MCP availability via: (1) config `webmcp.enabled`, (2) `CHROME_DEVTOOLS_MCP` / `WEBMCP_AVAILABLE` env vars, (3) `~/.claude.json` `mcpServers` key, (4) default unavailable.

#### `detectPlaywright(cwd: string): PlaywrightResult`
Detects Playwright MCP availability via: (1) config `playwright.enabled`, (2) `PLAYWRIGHT_AVAILABLE` env var, (3) `~/.claude.json` `mcpServers` key, (4) default unavailable.

#### `detectAvailableBackends(cwd?: string): Record<BackendId, BackendAvailability>`
Probes all four dispatchable backends by running `<binary> --version` with a 5-second timeout. Result cached for 5 minutes. Meta-backends always marked unavailable.
- **Side effects** — spawns `--version` subprocesses for each backend CLI.

#### `clearAvailabilityCache(): void`
Clears the availability detection cache. Used in tests.

#### `discoverBackendConfigDirs(): Record<string, string | null>`
Scans the home directory for backend config directories containing auth marker files. Priority: existing env var, then `~/.<backend>-*` profile dirs, then `~/.<backend>` default. Cached in-process.
- **Side effects** — reads home directory and stats files.

#### `clearConfigDirCache(): void`
Clears the config-dir discovery cache. Used in tests.

#### `buildBackendEnv(backend: string): Record<string, string | undefined>`
Returns a copy of `process.env` with the discovered config dir set for the given backend and all `CLAUDE_CODE_*` session vars stripped (so the subprocess doesn't detect a nested invocation).

#### `computeEffectiveModelTier(opts: { baseTier, tokenProfile, pressure, complexity }): ModelTier`
Pure function. Looks up a downgrade count from a decision table based on `tokenProfile`, `pressure`, and `complexity`, then applies it to `baseTier` (floored at `haiku`).

#### `getEffectiveTierForDispatch(opts): ModelTier`
Orchestrates the full Spec 4 adaptive-tier chain: `estimateComplexity` → `computeBudgetPressureLevel` → `computeEffectiveModelTier`. Returns the base tier unchanged when scheduler/schedulerConfig/superpowersConfig are absent.
- **opts.agentType** — agent type key.
- **opts.prompt** — prompt string (length used for complexity estimation).
- **opts.config** — `GrdConfig`.
- **opts.scheduler** — scheduler instance or `null`.
- **opts.modelProfiles** — `MODEL_PROFILES` table (passed in to avoid circular dep).
- **Side effects** — may write pressure-transition log line to `stderr`.

#### `readConfig(cwd: string): Record<string, unknown> | null`
Reads `.planning/config.json` with `fs.readFileSync`. Returns `null` on any error. Used internally to avoid circular dep with `lib/utils.ts`.

---

## lib/scheduler.ts

Backend selection, subprocess spawning, EWMA usage tracking, account rotation, and budget pressure classification.

### Constants

#### `ADAPTERS: Record<AdapterBackendId, BackendAdapter>`
CLI adapter objects for each spawnable backend. Each adapter has `binary`, `buildArgs(prompt, opts)`, `parseTokenUsage(stderr)`, and `isRateLimited(exitCode, stderr)` methods.

#### `ENV_VAR_MAP: Record<AdapterBackendId, string>`
Maps each adapter backend to its config-directory environment variable.

#### `FREE_FALLBACK_BUDGET: number`
Token-per-minute budget for free-fallback backends (effectively unlimited: `1_000_000`).

### Interfaces

#### `Scheduler`
```ts
interface Scheduler {
  spawn(prompt: string, opts: SpawnOpts): Promise<SchedulerSpawnResult>;
  getState(stateKey: string): BackendUsageState | undefined;
  getStates(): Map<string, BackendUsageState>;
  recordExternalSample(stateKey: string, sample: UsageSample): void;
  persistState(planningDir: string): void;
  loadPersistedState(planningDir: string): void;
}
```
High-level scheduler interface returned by `createScheduler`.

### Functions

#### `createScheduler(config: SchedulerConfig | undefined, superpowersConfig?: SuperpowersConfig): Scheduler | null`
Creates a `Scheduler` instance from the given config. Returns `null` if `config` is undefined. Applies Spec 2A `max_wait_minutes` default (90) and Spec 4 pressure threshold defaults via spread-merge. Initializes per-account or per-backend states depending on whether account rotation is enabled.
- **superpowersConfig** — optional; enables per-account rotation when `account_rotation` is true.
- **Returns** — `Scheduler` object or `null`.
- **Side effects** — checks binary availability on PATH at construction time.

#### `createBackendState(tokenBudget: number): BackendUsageState`
Creates a fresh `BackendUsageState` with zeroed counters and the given token budget.

#### `updateEWMA(state: BackendUsageState, tokens: number, alpha: number): void`
Updates the EWMA estimate in-place. On first observation (ewma === 0), sets directly to `tokens`.

#### `evictExpiredSamples(state: BackendUsageState, windowMinutes: number): void`
Removes samples older than `windowMinutes` and recalculates `tokens_consumed_in_window` from remaining samples.

#### `recordSample(state: BackendUsageState, sample: UsageSample, windowMinutes: number, alpha: number): void`
Records a completed sample, evicts stale ones, updates EWMA, and recalculates `budget_confidence`.

#### `pickBackend(priority: BackendId[], states: Map<string, BackendUsageState>, safetyMargin: number, freeFallback: { backend: BackendId }): BackendId`
Selects the highest-priority backend with sufficient token headroom (accounting for in-flight reservations and cooldown). Falls back to `freeFallback.backend` when all priority backends are exhausted.

#### `resolveAccount(superpowersConfig: SuperpowersConfig, schedulerConfig: SchedulerConfig, states: Map<string, BackendUsageState>, safetyMargin: number): AccountResolution`
Walks the backend priority list and per-backend account list, returning the first account with headroom. Falls back to the `free_fallback` backend when all are exhausted. Handles empty-accounts edge case by returning the default backend.

#### `markInFlight(state: BackendUsageState): void`
Increments `in_flight_count` and reserves EWMA-predicted token cost in `tokens_reserved`.

#### `markComplete(state: BackendUsageState): void`
Decrements `in_flight_count` (floor 0) and recalculates `tokens_reserved`.

#### `checkBinary(binary: string): boolean`
Returns `true` if `binary` is available on the system PATH (`which <binary>` succeeds).

#### `computeSoonestRecovery(states, priority, accounts, windowMinutes, maxWaitMs): number | null`
Computes the earliest timestamp at which any priority account will regain headroom based on sample aging. Walks samples oldest-first for each priority account, simulating token recovery. Returns `null` if no recovery within `maxWaitMs` or no prediction data available.

#### `isBudgetPressured(states, priority, accounts, thresholds?): boolean`
Returns `true` if `computeBudgetPressureLevel` returns anything other than `'none'`.

#### `computeBudgetPressureLevel(states, priority, accounts, thresholds?): BudgetPressureLevel`
Classifies worst-case pressure across all priority accounts. Computes `(consumed + reserved) / budget` for each account and returns the level matching the worst ratio. Default thresholds: `warning=0.6`, `high=0.8`, `critical=0.95`.

#### `logPressureTransition(sessionKey: string, current: BudgetPressureLevel, agentType: string, baseTier: string, effectiveTier: string): void`
Emits a single `stderr` log line when pressure level changes for the given `sessionKey`. Increments `scheduler.pressure_transitions.<level>` metric counter. No-op when `current === previous`.
- **Side effects** — writes to `stderr` on transition; increments in-memory metric.

#### `_killProcessTree(child, signal: NodeJS.Signals): void`
Sends `signal` to the process group of `child` on POSIX (via negative PID), or direct kill on Windows. Exported for testing and idle-watchdog use.

#### `_resolveIdleTimeoutSeconds(backend: string, config): number`
Resolves idle timeout: per-backend override → global `idle_timeout_seconds` → default 900 seconds.

#### `_startIdleWatchdog(idleTimeoutMs: number, onIdle: () => void): { markActivity: () => void; stop: () => void }`
Starts a polling watchdog (1-second intervals) that calls `onIdle` when no `markActivity()` has been called for `idleTimeoutMs`. Returns `markActivity` and `stop` functions. Fires at most once.

#### `_anyPriorityHasHeadroom(priority, accounts, states, safetyMargin): boolean`
Returns `true` if any account in the priority list has headroom. Used by the spawn-retry wait-branch decision.

---

## lib/scheduler-wait.ts

Cancellable sleep primitive for the scheduler's exhausted-accounts wait branch.

### Functions

#### `waitUntilOrAbort(targetMs: number): Promise<'waited' | 'aborted'>`
Sleeps until `targetMs` (absolute epoch ms) or SIGINT fires. Registers a process-level SIGINT handler on first use that aborts all active waits.
- **Returns** — `'waited'` if the delay elapsed normally, `'aborted'` if SIGINT was received.
- **Side effects** — registers `process.on('SIGINT', ...)` handler on first call.

---

## lib/metrics.ts

In-memory event counter for single-process observability.

### Functions

#### `incrementCounter(name: string, delta?: number): void`
Increments (or creates) a counter by `delta` (default `1`). Counters persist for the lifetime of the process.

#### `getCounters(): Record<string, number>`
Returns a snapshot of all counters as a plain object. Does not reset counters.

#### `resetCounters(): void`
Clears all counters. Used in tests.

---

## lib/complexity.ts

Task complexity estimator for Spec 4 adaptive model-tier routing. Pure functions — no I/O.

### Constants

#### `AGENT_BASELINE_COMPLEXITY: Record<string, ComplexityLevel>`
Baseline complexity per agent type (e.g., `grd-planner: 'high'`, `grd-codebase-mapper: 'low'`). 22 agents listed.

### Interfaces

#### `ComplexityHeuristics`
```ts
interface ComplexityHeuristics {
  prompt_length_high_threshold?: number;  // default 20_000
  sample_demote_high_to_medium?: number;  // default 3_000
  sample_demote_medium_to_low?: number;   // default 1_500
  min_samples_for_demotion?: number;      // default 3
}
```

### Functions

#### `estimateComplexity(opts): ComplexityLevel`
Estimates task complexity from agent type, prompt length, and recent sample history.
- **Decision order**: (1) `baselineOverride` or `AGENT_BASELINE_COMPLEXITY[agentType]` or `'medium'`, (2) if `promptLength > 20k` → `'high'`, (3) if ≥3 samples and average token estimate is below demotion threshold → demote by one level.
- **opts.agentType** — agent type key.
- **opts.promptLength** — optional character count of the prompt.
- **opts.recentSamples** — optional recent `{ duration, tokenEstimate }` entries.
- **opts.baselineOverride** — optional complexity override.
- **opts.heuristics** — optional threshold overrides.

---

## lib/state.ts

STATE.md read/write operations. All `cmd*` functions call `output()`/`error()` which terminate the process.

### Functions (exported for testing)

#### `stateExtractField(content: string, fieldName: string): string | null`
Extracts a `**FieldName:** value` from STATE.md content. Case-insensitive. Returns trimmed value or `null` if not found.

#### `stateReplaceField(content: string, fieldName: string, newValue: string): string | null`
Replaces a `**FieldName:** value` in STATE.md content. Returns updated content string, or `null` if field not found.

### Command Functions

#### `cmdStateLoad(cwd: string, raw: boolean): void`
Loads full project state: config, STATE.md raw content, and existence flags for config/roadmap/state files. Outputs `StateLoadResult`. With `raw=true`, outputs `key=value` lines followed by `---` then raw STATE.md content.

#### `cmdStateGet(cwd: string, section: string | null, raw: boolean): void`
Reads a specific `**Field:**` value or `## Section` from STATE.md. Returns full content when `section` is null.

#### `cmdStatePatch(cwd: string, patches: Record<string, string>, raw: boolean, opts?: { audit?: boolean }): void`
Batch-updates multiple `**Field:**` values in STATE.md. Tries underscore-to-space field name normalization on misses. Appends to `## Audit Log` section when `opts.audit` is true.
- **Side effects** — writes STATE.md to disk.

#### `cmdStateUpdate(cwd: string, field: string, value: string): void`
Single-field STATE.md update. Equivalent to `cmdStatePatch` with one field.
- **Side effects** — writes STATE.md to disk.

#### `cmdStateAdvancePlan(cwd: string, raw: boolean): void`
Increments `Current Plan` counter in STATE.md. If already at `Total Plans in Phase`, sets status to `Phase complete — ready for verification` instead.
- **Side effects** — writes STATE.md to disk.

#### `cmdStateRecordMetric(cwd: string, options: RecordMetricOptions, raw: boolean): void`
Appends a row to the Performance Metrics table in STATE.md. `options` requires `phase`, `plan`, `duration`; `tasks` and `files` are optional.
- **Side effects** — writes STATE.md to disk.

#### `cmdStateUpdateProgress(cwd: string, raw: boolean): void`
Recalculates the progress bar in STATE.md by counting PLAN/SUMMARY files across all phase directories.
- **Side effects** — reads phases directory; writes STATE.md to disk.

#### `cmdStateAddDecision(cwd: string, options: { phase?: string; summary: string; rationale?: string }, raw: boolean): void`
Appends a decision entry to the Decisions section in STATE.md.
- **Side effects** — writes STATE.md to disk.

#### `cmdStateAddBlocker(cwd: string, text: string, raw: boolean): void`
Appends a blocker entry to the Blockers section in STATE.md.
- **Side effects** — writes STATE.md to disk.

#### `cmdStateResolveBlocker(cwd: string, text: string, raw: boolean): void`
Removes a matching blocker entry (case-insensitive) from the Blockers section. Restores `None` placeholder when section becomes empty.
- **Side effects** — writes STATE.md to disk.

#### `cmdStateRecordSession(cwd: string, options: RecordSessionOptions, raw: boolean): void`
Updates session continuity fields (`Last session`, `Last Date`, `Stopped At`, `Resume File`) in STATE.md.
- **Side effects** — writes STATE.md to disk.

#### `cmdStateSnapshot(cwd: string, raw: boolean, opts?: { since?: string }): void`
Parses STATE.md into a structured JSON snapshot. Saves a timestamped snapshot to `.planning/.snapshots/`. When `opts.since` is provided, diffs against a saved baseline snapshot to show changed fields, new decisions, new/resolved blockers.
- **Side effects** — writes snapshot JSON to disk.

---

## lib/paths.ts

Centralized `.planning/` subdirectory path construction. All paths are milestone-scoped.

### Functions

#### `currentMilestone(cwd: string): string`
Reads the `**Milestone:**` field from `.planning/STATE.md`. Falls back to scanning `.planning/milestones/` directory and parsing ROADMAP.md. Returns `'anonymous'` when undetermined.

#### `planningDir(cwd: string): string`
Returns `<cwd>/.planning`.

#### `milestonesDir(cwd: string): string`
Returns `<cwd>/.planning/milestones`.

#### `phasesDir(cwd: string, milestone?: string | null): string`
Returns the milestone-scoped phases directory. Defaults to `currentMilestone(cwd)` when `milestone` is omitted. Throws if the resolved path would escape `.planning/`.

#### `phaseDir(cwd: string, milestone: string | undefined, phaseDirName: string): string`
Returns a specific phase subdirectory path. Throws on path escape.

#### `researchDir(cwd: string, milestone?: string | null): string`
Returns `<milestoneRoot>/research/`.

#### `codebaseDir(cwd: string): string`
Returns `<cwd>/.planning/codebase/` — project-wide, not milestone-scoped.

#### `todosDir(cwd: string, milestone?: string | null): string`
Returns `<milestoneRoot>/todos/`.

#### `discussionsDir(cwd: string, milestone?: string | null): string`
Returns `<milestoneRoot>/discussions/`. Throws on path escape.

#### `quickDir(cwd: string, milestone?: string | null): string`
Returns `<milestoneRoot>/quick/`.

#### `standardsDir(cwd: string, milestone?: string | null): string`
Returns `<milestoneRoot>/standards/`.

#### `archivedPhasesDir(cwd: string, version: string): string`
Returns the archived phases directory for a completed milestone (e.g., `.planning/milestones/v0.2.1-phases/`). Throws on path escape.

---

## lib/frontmatter.ts

YAML frontmatter parsing, reconstruction, and validation for GRD plan/summary/verification files.

### Constants

#### `FRONTMATTER_SCHEMAS: Record<string, FrontmatterSchemaDefinition>`
Required field lists for `plan`, `summary`, and `verification` frontmatter document types.

### Functions

#### `extractFrontmatter(content: string): FrontmatterObject`
Parses YAML frontmatter between `---` delimiters into a JavaScript object. Handles nested objects and arrays. Returns empty object when no frontmatter found.

#### `reconstructFrontmatter(obj: FrontmatterObject): string`
Serializes a frontmatter object back to YAML string (without `---` delimiters).

#### `spliceFrontmatter(content: string, newFrontmatter: FrontmatterObject): string`
Replaces existing frontmatter in `content` with the serialized form of `newFrontmatter`. Prepends frontmatter if none was present.

#### `parseMustHavesBlock(mustHaves: unknown): { artifacts: MustHavesArtifact[]; key_links: MustHavesKeyLink[] }`
Parses the `must_haves` frontmatter block into structured artifact and key-link objects.

#### `cmdFrontmatterGet(cwd: string, filePath: string, field: string | null, raw: boolean): void`
Reads a specific frontmatter field (or all fields) from a plan/summary file.

#### `cmdFrontmatterSet(cwd: string, filePath: string, patches: Record<string, unknown>, raw: boolean): void`
Updates frontmatter fields in a plan/summary file.
- **Side effects** — writes file to disk.

#### `cmdFrontmatterMerge(cwd: string, filePath: string, patch: FrontmatterObject, raw: boolean): void`
Deep-merges `patch` into a file's existing frontmatter.
- **Side effects** — writes file to disk.

#### `cmdFrontmatterValidate(cwd: string, filePath: string, schema: string, raw: boolean): void`
Validates that a file's frontmatter has all required fields for the given schema type.

#### `getPhaseRoadmapMetadata(cwd: string, phase: string): Record<string, unknown>`
Extracts metadata for a phase from ROADMAP.md (schedule, goals, etc.).

---

## lib/markdown-split.ts

Large-document splitting and reassembly at heading boundaries.

### Constants

#### `INDEX_MARKER: string`
Magic comment `<!-- GRD-INDEX -->` identifying a GRD split-format index file.

#### `DEFAULT_TOKEN_THRESHOLD: number`
Token count (`25000`) above which splitting is triggered.

### Functions

#### `estimateTokens(content: string): number`
Estimates token count from character length (heuristic: ~4 chars per token).

#### `findSplitBoundaries(content: string, threshold?: number): number[]`
Returns an array of character offsets where splits should occur. Splits at `##` headings when estimated token count crosses the threshold.

#### `splitMarkdown(content: string, opts?: SplitMarkdownOptions): SplitResult`
Splits a markdown file into partials at heading boundaries. Returns `{ split_performed: false }` when already split or below threshold, or `{ split_performed: true, index_content, parts }` when splitting was performed.

#### `isIndexFile(content: string): boolean`
Returns `true` if the content contains `INDEX_MARKER`.

#### `reassembleFromIndex(indexContent: string, baseDir: string): string`
Reads and concatenates partial files listed in an index file.
- **Side effects** — reads partial files from disk.

#### `readMarkdownWithPartials(filePath: string): string`
Transparently reads a markdown file. If it is an index file, reassembles it from partials. Otherwise returns the file content as-is. Used by `safeReadMarkdown`.
- **Side effects** — reads multiple files from disk.

---

## lib/phase-io.ts

Thin I/O wrappers for ROADMAP.md and STATE.md. Isolated for testing/mocking.

### Functions

#### `readRoadmapFile(p: string): string`
Reads ROADMAP.md from the given path. Throws on read error.

#### `writeRoadmapFile(p: string, content: string): void`
Writes ROADMAP.md content to the given path. Throws on write error.

#### `readStateFile(p: string): string`
Reads STATE.md from the given path. Throws on read error.

#### `writeStateFile(p: string, content: string): void`
Writes STATE.md content to the given path. Throws on write error.

---

## lib/phase-complete.ts

Phase-completion logic: preflight gates, ROADMAP.md/STATE.md updates, quality analysis.

### Functions

#### `_phaseCompleteCore(cwd: string, phaseNum: string, options?: PhaseCompleteOptions): PhaseCompleteResult`
Core phase-completion implementation. Runs preflight gates, updates ROADMAP.md checkbox and progress table, updates STATE.md fields, runs quality analysis and generates cleanup plan. When `options.phase_complete_llm_fallback` is true and gates fail, delegates to `attemptLlmFallbackCompletion`.
- **Side effects** — writes ROADMAP.md and STATE.md; may spawn a scheduler subprocess for LLM fallback.

#### `completePhaseAfterPostPipeline(cwd: string, phaseNum: string, scheduler: Scheduler | null): Promise<PhaseCompleteResult | null>`
Autopilot-safe wrapper around `_phaseCompleteCore`. Catches all errors and returns `null` on failure. Used by autopilot after the post-phase pipeline step.
- **Side effects** — same as `_phaseCompleteCore`.

---

## lib/phase-complete-llm.ts

LLM fallback for phase completion (Spec 3B). When mechanical regex-based completion fails, asks Claude to directly edit ROADMAP.md and STATE.md.

### Functions

#### `attemptLlmFallbackCompletion(cwd: string, phaseNum: string, scheduler: Scheduler | null, failure: Error | { gate_errors?: GateViolation[] }): Promise<PhaseCompleteResult | null>`
Attempts to recover from a mechanical phase-completion failure. Builds a prompt describing the failure, spawns a scheduler subprocess, and verifies ROADMAP.md was updated. Retries up to `phase_complete_llm_fallback_retries` times with exponential backoff (2^n seconds). Returns synthetic `PhaseCompleteResult` on success, `null` if scheduler is null or all attempts fail.
- **Side effects** — spawns scheduler subprocess; reads ROADMAP.md and STATE.md to verify.
- **Throws** — nothing; all errors return `null`.

#### `_verifyFallbackOutput(cwd: string, phaseNum: string): { ok: boolean; checks: { name: string; passed: boolean }[] }`
Verifies that an LLM fallback completed the roadmap checkbox, advanced STATE.md, and (advisory) added a progress table row. `ok` requires only roadmap-ticked and state-advanced checks.

---

## lib/gates.ts

Preflight gate checks run before phase operations.

### Constants

#### `GATE_REGISTRY: Record<string, GateCheckFn>`
Registry of all available gate check functions keyed by gate name.

### Functions

#### `runPreflightGates(cwd: string, command: string, opts?: { phase?: string }): PreflightResult`
Runs all gates registered for `command`. Returns `{ passed: boolean, violations: GateViolation[] }`. Individual gate failures are collected; preflight fails if any gate fails.

#### `resetGatesCache(): void`
Clears any cached gate check results. Used in tests.

#### `checkOrphanedPhases(cwd: string): GateViolation[]`
Detects phase directories on disk that are not listed in ROADMAP.md.

#### `checkPhaseInRoadmap(cwd: string, phase: string): GateViolation[]`
Verifies that the given phase exists in ROADMAP.md.

#### `checkPhaseHasPlans(cwd: string, phase: string): GateViolation[]`
Verifies that the phase directory contains at least one PLAN.md file.

#### `checkNoStaleArtifacts(cwd: string): GateViolation[]`
Checks for plan files that have been executed but their summaries are missing.

#### `checkOldPhasesArchived(cwd: string): GateViolation[]`
Verifies that phases from previous milestones are properly archived.

#### `checkMilestoneStateCoherence(cwd: string): GateViolation[]`
Checks that STATE.md milestone version matches the active milestone directory.

#### `checkInvariantValidation(cwd: string): GateViolation[]`
Runs structural and semantic invariant checks on plan files.

#### `checkCitationGate(cwd: string): GateViolation[]`
When `citation_gate` is enabled in config, verifies that all component references in plans are resolved.

#### `checkTransitiveCitationGate(cwd: string): GateViolation[]`
When `transitive_citation_gate` is enabled, performs deep transitive dependency resolution.

---

## lib/invariants.ts

Structural and semantic plan artifact validation.

### Functions

#### `extractPlanArtifact(content: string, filePath: string): PlanArtifact`
Parses a PLAN.md file into a structured `PlanArtifact` object including frontmatter, must-haves, key links, and estimated token count.

#### `validateStructural(artifact: PlanArtifact): ValidationResult`
Checks required frontmatter fields, file structure, and must-haves formatting.

#### `validateSemantic(artifact: PlanArtifact): ValidationResult`
Checks semantic consistency: task descriptions, file references, wave ordering.

#### `validateCrossPhase(artifacts: PlanArtifact[], cwd: string): ValidationResult`
Cross-plan consistency checks: duplicate plan numbers, conflicting file modifications.

#### `validateResearchArtifacts(cwd: string, phase: string): ValidationResult`
Validates research files for the given phase.

---

## lib/deps.ts

Phase dependency analysis and parallel execution group computation.

### Functions

#### `parseDependsOn(frontmatter: FrontmatterObject): string[]`
Extracts the `depends_on` list from plan frontmatter. Returns empty array if not present.

#### `buildDependencyGraph(plans: PlanArtifact[]): DependencyGraph`
Builds a directed dependency graph from a set of plan artifacts.

#### `computeParallelGroups(graph: DependencyGraph): string[][]`
Topologically sorts the dependency graph into parallel execution waves. Returns an array of groups where all plans within a group can run concurrently.

#### `detectCycle(graph: DependencyGraph): string[] | null`
Detects cycles in a dependency graph. Returns the cycle path as an array of plan IDs, or `null` if acyclic.

#### `cmdPhaseAnalyzeDeps(cwd: string, phase: string, raw: boolean): void`
CLI command: analyzes dependencies for all plans in a phase and outputs the parallel execution groups.

#### `buildArtifactDAG(plans: PlanArtifact[]): ArtifactDAG`
Builds an artifact dependency DAG from plan `must_haves` and `key_links` frontmatter.

#### `validateArtifactDAG(dag: ArtifactDAG): ArtifactDAGValidation`
Validates the artifact DAG for cycles, missing providers, and duplicate exports.

---

## lib/parallel.ts

Parallel phase execution coordination.

### Functions

#### `validateIndependentPhases(cwd: string, phases: string[]): ValidationResult`
Checks that the given phases can run independently (no cross-phase file conflicts).

#### `buildParallelContext(cwd: string, phases: string[]): string`
Builds a context prompt describing the parallel execution setup for given phases.

#### `buildWaves(plans: PlanArtifact[]): string[][]`
Groups plans into execution waves based on `wave` frontmatter field. Used by the autopilot wave-based executor.

#### `cmdInitExecuteParallel(cwd: string, phase: string, raw: boolean): void`
CLI command: initializes parallel phase execution by dispatching multiple waves.

#### `formatProgressBar(completed: number, total: number, width?: number): string`
Formats a terminal progress bar string.

#### `streamPhaseProgress(cwd: string, phase: string): void`
Streams live progress updates for a running parallel phase.

#### `cmdParallelProgress(cwd: string, phase: string, raw: boolean): void`
CLI command: outputs current parallel execution progress for a phase.

---

## lib/roadmap.ts

ROADMAP.md parsing, phase analysis, and schedule computation.

### Functions

#### `formatScheduleDate(date: Date): string`
Formats a date as `YYYY-MM-DD`.

#### `addDays(date: Date, days: number): Date`
Returns a new `Date` `days` after `date`.

#### `computeSchedule(startDate: Date, phases: RoadmapPhase[]): Record<string, { start: string; end: string }>`
Computes a schedule for all phases given a start date and phase list (uses estimated duration).

#### `getScheduleForPhase(cwd: string, phase: string): { start: string; end: string } | null`
Returns the computed schedule entry for a specific phase.

#### `getScheduleForMilestone(cwd: string): Record<string, { start: string; end: string }>`
Returns the full computed schedule for all phases in the current milestone.

#### `cmdRoadmapGetPhase(cwd: string, phase: string, raw: boolean): void`
CLI command: outputs metadata for a specific phase from ROADMAP.md.

#### `cmdPhaseNextDecimal(cwd: string, phase: string, raw: boolean): void`
CLI command: computes the next available decimal phase number (e.g., `3.1` if `3.0` exists).

#### `cmdRoadmapAnalyze(cwd: string, raw: boolean): void`
CLI command: analyzes ROADMAP.md structure and outputs a summary with phase count, completion status, and any issues.

#### `analyzeRoadmap(cwd: string): { phases: RoadmapPhase[]; total: number; completed: number }`
Parses ROADMAP.md into structured phase objects. Used internally by `lib/deps.ts`.

---

## lib/phase.ts

Phase lifecycle management: listing, adding, inserting, removing, completing, and milestone operations.

### Functions

#### `cmdPhasesList(cwd: string, raw: boolean): void`
CLI command: lists all phases in the current milestone with their status.

#### `cmdPhaseAdd(cwd: string, name: string, raw: boolean): void`
CLI command: adds a new phase to ROADMAP.md at the end of the current milestone.
- **Side effects** — writes ROADMAP.md.

#### `cmdPhaseInsert(cwd: string, position: string, name: string, raw: boolean): void`
CLI command: inserts a decimal sub-phase at the given position (e.g., `3.1` after phase 3).
- **Side effects** — writes ROADMAP.md.

#### `cmdPhaseRemove(cwd: string, phase: string, raw: boolean): void`
CLI command: removes an unstarted phase from ROADMAP.md.
- **Side effects** — writes ROADMAP.md.

#### `cmdPhaseComplete(cwd: string, phase: string, opts: PhaseCompleteOptions, raw: boolean): void`
CLI command: marks a phase as complete by delegating to `_phaseCompleteCore`.
- **Side effects** — writes ROADMAP.md and STATE.md.

#### `cmdMilestoneComplete(cwd: string, raw: boolean): void`
CLI command: marks the current milestone as complete, archives phases, and transitions STATE.md.
- **Side effects** — writes ROADMAP.md and STATE.md; archives phase directories.

#### `cmdValidateConsistency(cwd: string, raw: boolean): void`
CLI command: validates consistency between ROADMAP.md, STATE.md, and on-disk phase files.

#### `cmdVersionBump(cwd: string, part: 'major' | 'minor' | 'patch', raw: boolean): void`
CLI command: bumps the version in `package.json` (if present) and ROADMAP.md.
- **Side effects** — writes `package.json` and ROADMAP.md.

#### `cmdPhaseBatchComplete(cwd: string, phases: string[], raw: boolean): void`
CLI command: batch-completes multiple phases sequentially.
- **Side effects** — writes ROADMAP.md and STATE.md for each phase.

#### `atomicWriteFile(filePath: string, content: string): void`
Writes a file atomically via a temp file + rename to prevent partial writes on crash.

---

## lib/scaffold.ts

Project and plan template scaffolding.

### Functions

#### `cmdTemplateSelect(cwd: string, type: string, raw: boolean): void`
CLI command: selects and outputs a template for the given artifact type.

#### `cmdTemplateFill(cwd: string, template: string, vars: Record<string, string>, raw: boolean): void`
CLI command: fills a template with variable substitutions and writes it to the output location.
- **Side effects** — writes template output file.

#### `cmdScaffold(cwd: string, type: string, opts: Record<string, string>, raw: boolean): void`
CLI command: scaffolds a complete artifact set (plan + summary stubs) for a new phase or plan.
- **Side effects** — creates directories and files.

---

## lib/knowledge.ts

KnowHow entry formatting, parsing, supersession, and knowledge injection.

### Functions

#### `formatKnowhowEntry(entry: KnowhowEntry): string`
Serializes a `KnowhowEntry` object to markdown text.

#### `parseKnowhowEntries(content: string): KnowhowEntry[]`
Parses a markdown section containing KnowHow entries into structured objects.

#### `appendKnowhowEntries(knowhowPath: string, entries: KnowhowEntry[]): void`
Reads KNOWHOW.md at `knowhowPath`, merges `entries` in, and rewrites the file (header `# KNOWHOW`, entries sorted by `phase_number` descending, stable within a bucket).

**Supersede, do not overwrite (v0.6.0).** On a `pattern_name` collision with a live entry the incoming entry does *not* replace it: the existing entry gets `superseded_by` set to the new entry's `source` (whitespace-collapsed to one line) and stays on disk; the new entry is appended beside it. Both survive; only the newer is injectable, because `selectTopEntries` drops superseded entries. Two collisions change nothing at all — an entry from an *earlier* `phase_number` (stale news), and one whose knowledge is unchanged (same `source`, `applicability`, `code_snippet`, `phase_number`), which keeps re-promotion idempotent.
- **Side effects** — creates parent directories; writes the file; invalidates the in-module parse cache.

#### `selectTopEntries(entries: KnowhowEntry[], n: number, moduleHints?: string[], currentPhase?: number): KnowhowEntry[]`
Returns at most `n` entries, most recent first. Entries carrying `superseded_by` are dropped first — this is the single funnel every injection reads through, so the filter lives here and nowhere else. Score is `phase_number * 1000`, plus `100` when `source`/`applicability` mentions any `moduleHints` string, minus the distance to `currentPhase` when given.

**Reserved slots for research entries (v0.6.0).** Entries promoted by the autoresearch loop carry `phase_number: 0` (`lib/research/promote.ts`), and since the score is dominated by `phase_number * 1000` they could never place against any phase-numbered entry. When both kinds are present, `max(1, floor(n / 3))` slots (capped at how many exist) are reserved for research entries, ordered by `created_at` descending. The discriminator is a `research:` prefix on `source` (`isResearchEntry`), not `phase_number === 0`.

#### `buildKnowledgeInjectionBlock(cwd: string, _phaseNum: string, moduleHints?: string[]): string`
Reads `<cwd>/KNOWHOW.md`, selects the top 5 entries via `selectTopEntries` (passing `_phaseNum` parsed as `currentPhase` when numeric), and wraps them in `<knowhow_context>` tags. Returns `''` when there are no entries or none survive selection.
- **Side effects** — increments `hit_count` / sets `last_used` per injected entry in `.planning/knowledge-stats.json`.

#### `extractModuleHints(phaseDir: string): string[]`
Reads every `*-PLAN.md` (and `PLAN.md`) in `phaseDir`, extracts `files_modified` from YAML frontmatter, and returns the unique extension-stripped basenames. Returns `[]` when the directory is missing or unreadable.

#### `rankKnowhowByPhaseGoal(goal: string, entries: KnowhowEntry[], topN?: number): KnowhowEntry[]`
TF-IDF ranking of entries against a phase-goal string. `topN` defaults to `5`.

### Consumers — the `knowhow_block` injection point

The block these functions build is emitted as `knowhow_block` on the init-context payload of three commands, and is `null` when nothing qualifies:

| Producer | Path |
|---|---|
| `cmdInitExecutePhase` | `lib/context/execute.ts` — `extractModuleHints(phaseDir)` → `buildKnowledgeInjectionBlock` |
| `cmdInitPlanPhase` | `lib/context/execute.ts` — same pair |
| `cmdInitExecutor` | `lib/context/agents.ts` — merges KNOWHOW.md from the project root, `.planning/`, each milestone, each milestone's `research/`, and each phase directory, then ranks with `rankKnowhowByPhaseGoal` |

Until v0.6.0 the block was computed and then dropped before reaching the prompt, which is why research-promoted knowledge never reached the planner.

---

## lib/dead-ends.ts

Write path for the `.planning/DEAD-ENDS.md` registry (the read path is `cmdInitPlanPhase`'s `dead_ends_md`). Slug is the dedup key. Backs the `gd dead-end` subcommands.

**The writer edits bytes; it does not regenerate the file (v0.6.0).** A registry holds more than `DeadEndEntry` names — prose sections, a project header, keys this module never reads (`hypothesis`, `forbidden_terms`, `predicted_outcome`, `owner`), `evidence` items written as maps. Rebuilding from the typed model erased all of it: one `dead-end add` took this repo's own 7,933-byte registry to 425 bytes and reported success. The unit of work is now a line edit inside a preserved span — `parseDeadEndsDoc` → mutate a few `bodyLines` → `serializeDeadEndsDoc`, where every byte a write did not touch is literally the same byte.

### Constants

#### `RETIRED: string`
The literal `'retired'` — the one `status` value that exempts an entry from the hard-fail gate. Written only by `retireDeadEnd`; no automatic path ever produces it.

#### `ENTRY_HEADING_RE_SOURCE: string`
`'^## ([a-z0-9][a-z0-9-]*)\\s*$'` — how an entry heading is recognized, exported as a *source string* so it can be asserted identical to the hard-fail gate's own regex in `lib/commands/select-candidate.ts`. The writer and the gate must agree on what an entry is: if the writer sees a block the gate does not, a write edits an entry nobody enforces; if the gate sees one the writer does not, a write appends a second block for a slug that visually already exists. `tests/integration/dead-ends-registry.test.ts` pins the agreement over this repo's own registry.

### Types

#### `DeadEndEntry`
`{ approach?, slug, tried_in_phases, verdict, evidence, status, date?, notes? }`. `approach` is optional — hand-authored entries carry `hypothesis:` instead, and a block's slug is what makes it an entry. `status` is typed `string`, not a union: any value found on disk is preserved verbatim and treated as **live**, because coercing an unknown value to `active` once turned a human's retirement marker into the strongest live marker.

#### `DeadEndSpan` / `DeadEndEntrySpan`
`{ kind: 'raw'; text } | DeadEndEntrySpan`. An entry span keeps `head` (the `## slug` heading through the opening fence line), `bodyLines` (the YAML body verbatim, one string per line — writes edit these), `tail` (the closing fence), and `entry` (a typed projection, for deciding what to change, never for re-emitting).

#### `ReflectionData`
`{ hypothesis, predicted_outcome, actual_outcome, verdict, evidence[] }` — structured form of the `## Reflection` table in VERIFICATION.md.

#### `PromoteFromPhaseResult`
`{ skipped, reason?, action?, slug?, dry_run?, preview?, config_error?, phase?, total_entries?, path? }`.

### Functions

#### `parseDeadEndsDoc(content: string): DeadEndSpan[]`
Parses DEAD-ENDS.md into ordered spans. Lossless by construction: `serializeDeadEndsDoc(parseDeadEndsDoc(bytes)) === bytes` for any input. A heading with no terminated YAML fence stays a `raw` span, exactly as the gate skips it.

#### `serializeDeadEndsDoc(spans: DeadEndSpan[]): string`
Renders spans back to text. Untouched spans are byte-identical.

#### `parseDeadEndsFile(content: string): DeadEndEntry[]`
The typed projection of the document — `parseDeadEndsDoc` filtered to entry spans. **Lossy by definition** (a `DeadEndEntry` names eight keys and a file holds whatever it holds): read it to decide, never to rewrite.

#### `serializeDeadEndsFile(entries: DeadEndEntry[]): string`
Renders a **fresh** registry from a model. Not a writer for an existing file — `serializeDeadEndsFile(parseDeadEndsFile(x))` is the composition that caused the data loss above. Nothing on the write path calls it.

#### `parseReflectionSection(verificationContent: string): ReflectionData | null`
Parses the `## Reflection` markdown table out of a VERIFICATION.md body. Returns `null` when the section is missing or unparseable. Evidence cells split on `;` (not `,`, which is too common inside `file:line — description` refs).

#### `addDeadEnd(cwd: string, opts: DeadEndAddOpts): { action: 'created' | 'updated'; slug: string; total: number; retired: boolean }`
Programmatic upsert. Slug is generated from `opts.approach`; a matching slug appends the phase and evidence and overwrites notes rather than duplicating the entry, and flips `active` → `reopened` on any re-registration. When the entry is already `retired`, phase and evidence still merge but the status is left alone and `retired: true` comes back — automation may *arm* the gate, never disarm or silently re-arm it.
- **Throws** — on missing `approach`/`phase` or an unsluggable approach (CLI callers translate to `error()`).
- **Side effects** — atomically writes `.planning/DEAD-ENDS.md`.

#### `retireDeadEnd(cwd: string, slug: string, reason: string): DeadEndStatusChange`
The only supported way to stop a dead end hard-failing a candidate plan, and the **only writer of `status: retired` anywhere in GRD**. Human-only by design: a DEAD-ENDS row scores a matching plan at `-Infinity` in `select-candidate`, permanently and with no warning tier. Also sets `retired_reason` and `retired_at` (yyyy-mm-dd).
- **Throws** — when `reason` is empty, or the slug is absent from the registry.
- **Side effects** — edits the entry's `status:` line in place and atomically rewrites the file; every byte outside those lines is preserved.

#### `reopenDeadEnd(cwd: string, slug: string): DeadEndStatusChange`
Mirror of `retireDeadEnd` — sets `status: reopened`, re-arming the gate. Also human-only.

#### `promoteFalsifiedFromPhase(cwd: string, phase: string): PromoteFromPhaseResult`
Reads a phase's VERIFICATION.md and, when its `## Reflection` table reports `verdict: falsified`, registers the hypothesis as a dead end. Idempotent — repeated calls on the same phase converge to the same registry state (it opts out of the `active` → `reopened` flip, because its two call sites promote the same VERIFICATION.md by design). Non-falsified verdicts return `{ skipped: true, reason }`.

Writes **only** when `.planning/config.json` → `research_gates.auto_promote_falsified` is `true` (default **false**, read directly rather than through `loadConfig`). Off, it returns `dry_run: true` with the entry it would have written in `preview` and leaves the file byte-identical; a config.json that exists but cannot be parsed surfaces as `config_error`.

Never calls `output()`/`error()`, so phase-boundary callers can invoke it without exiting the process.

#### `cmdDeadEndAdd`, `cmdDeadEndRetire`, `cmdDeadEndReopen`, `cmdDeadEndPromoteFromPhase`
Thin CLI formatters over the four functions above; each ends in `output()`/`error()`.

### Commands

Dispatched from `bin/grd-tools.ts` (`case 'dead-end'`), routed as a tool command by `lib/cli/index.ts`:

| Command | Notes |
|---|---|
| `gd dead-end add --approach <s> --phase <s> [--verdict <s>] [--evidence <s> …] [--notes <s>]` | `--evidence` is repeatable |
| `gd dead-end retire <slug> --reason "…"` | `--reason` is required — the row that turns the guard off has to say why |
| `gd dead-end reopen <slug>` | Re-arms the gate |
| `gd dead-end promote-from-phase [--phase N \| N]` | Positional form is ignored when it starts with `--` |

Any other subcommand is an error naming the four valid ones.

### The gate this registry feeds

`checkDeadEnds(candidateText, deadEnds)` in `lib/commands/select-candidate.ts` scans a candidate plan for the first hard-fail — a slug citation (case-insensitive, word-boundary matched) or an exact `forbidden_terms` match — plus advisory Jaccard warnings. **An entry is skipped entirely if and only if its `status` is exactly `retired`.** Anything else gates, including `resolved`, `superseded`, an absent `status:` key, or a typo: the cost of wrongly gating is a visible hard-fail naming a slug, the cost of wrongly exempting is a falsified approach silently readmitted. The exemption lives inside the gate rather than at its call sites so every caller inherits it.

---

## lib/requirements.ts

Requirements tracking and traceability matrix operations.

### Constants

#### `VALID_REQUIREMENT_STATUSES: string[]`
List of valid status values for requirements (`pending`, `in-progress`, `done`, `dropped`).

### Functions

#### `readCachedRequirements(cwd: string): Requirement[]`
Reads and caches the requirements list from `.planning/milestones/{m}/requirements.md`.

#### `parseRequirements(content: string): Requirement[]`
Parses requirements from markdown content into structured `Requirement` objects.

#### `parseTraceabilityMatrix(content: string): TraceabilityEntry[]`
Parses the traceability matrix from markdown into structured entries.

#### `cmdRequirementGet(cwd: string, id: string, raw: boolean): void`
CLI command: retrieves a specific requirement by ID.

#### `cmdRequirementList(cwd: string, raw: boolean): void`
CLI command: lists all requirements with their status.

#### `cmdRequirementTraceability(cwd: string, raw: boolean): void`
CLI command: outputs the traceability matrix linking requirements to plans.

#### `cmdRequirementUpdateStatus(cwd: string, id: string, status: string, raw: boolean): void`
CLI command: updates a requirement's status.
- **Side effects** — writes requirements file.

---

## lib/verify.ts

Verification command suite for plans, summaries, references, commits, and artifacts.

### Functions

#### `cmdVerifySummary(cwd: string, summaryPath: string, checkFileCount: number, raw: boolean): void`
CLI command: verifies one SUMMARY.md at `summaryPath` (relative to `cwd`). Spot-checks `checkFileCount` (default `2`) of the files it mentions for existence, resolves any commit hashes it cites, and reads its self-check section.

**"Not checked" is now distinct from "passed" (v0.6.0).** Every check here is satisfied by an *absence*: no files mentioned means nothing missing, no hashes means the commit clause short-circuits, and `self_check` is `not_found` until a section says otherwise. A SUMMARY.md reading only "We did the thing." therefore returned `passed: true` with `errors: []` — a phase gate advancing on an assertion nothing had examined. The result now carries `verified` and `unverified_reasons` alongside `passed` and `checks`, where `verified` is false when the summary cites neither any file (a `mentionedFiles` hit, or any backticked token with a file extension) nor any commit hash, and `passed = noErrors && verified`. Raw output is `passed` / `failed` / `unverified`. A missing self-check section is deliberately *not* an unverified reason — none of the shipped summary templates contain one.

#### `cmdVerifyPlanStructure(cwd: string, filePath: string, raw: boolean): void`
CLI command: validates one PLAN.md's frontmatter fields and task-element completeness. Raw output is `valid`/`invalid`.

#### `cmdVerifyPhaseCompleteness(cwd: string, phase: string, raw: boolean): void`
CLI command: verifies all plans in a phase have corresponding summaries.

#### `cmdVerifyReferences(cwd: string, filePath: string, raw: boolean): void`
CLI command: checks that file references in one plan's `must_haves` resolve to actual files.

#### `cmdVerifyCommits(cwd: string, hashes: string[], raw: boolean): void`
CLI command: verifies that the given commit hashes exist in git history.

#### `cmdVerifyArtifacts(cwd: string, planFilePath: string, raw: boolean): void`
CLI command: validates that one plan's `must_haves` artifacts exist and meet minimum requirements.

#### `cmdVerifyKeyLinks(cwd: string, planFilePath: string, raw: boolean): void`
CLI command: verifies that `key_links` references in one plan are valid import/export relationships.

#### `cmdVerifyMechanical(cwd: string, phase: string, raw: boolean): void`
CLI command: runs the deterministic checks for a whole phase in one pass.

#### `cmdDiagnosePhase(cwd: string, phase: string, raw: boolean): void`
CLI command: reports why a phase is not verifying, with a suggestion per failed check.

#### `clearVerifyCache(): void`
Clears the module's file-read cache. Used in tests.

---

## lib/cleanup.ts

Code quality analysis and cleanup plan generation.

### Functions

#### `getCleanupConfig(cwd: string): CleanupConfig`
Reads cleanup configuration from `config.json` (or defaults). Controls which analyses run and their thresholds.

#### `runQualityAnalysis(cwd: string, phaseNum: string): QualityAnalysisResult`
Runs all enabled quality analyzers. Returns a `QualityAnalysisResult` with per-analyzer reports and a composite summary.

#### `generateCleanupPlan(cwd: string, phaseNum: string, report: QualityAnalysisResult): CleanupPlanResult`
Generates a cleanup plan markdown from a quality analysis report.
- **Side effects** — writes `CLEANUP.md` to the phase directory.

#### `resetCleanupCache(): void`
Clears any cached analysis results. Used in tests.

#### `loadQualityHistory(cwd: string): QualityAnalysisSummary[]`
Reads historical quality metrics from `.planning/codebase/quality-history.json`.

#### `saveQualityMetrics(cwd: string, summary: QualityAnalysisSummary): void`
Appends the current run's quality summary to the history file.
- **Side effects** — writes `quality-history.json`.

#### `computeTrends(history: QualityAnalysisSummary[]): Record<string, number>>`
Computes trend values (slope over recent snapshots) for tracked quality metrics.

#### `analyzeComplexity`, `analyzeDeadExports`, `analyzeFileSize`, `analyzeChangelogDrift`, `analyzeReadmeLinks`, `analyzeJsdocDrift`, `analyzeTestCoverageGaps`, `analyzeExportConsistency`, `analyzeDocStaleness`, `analyzeConfigSchemaDrift`
Individual analysis functions. Each takes `(cwd: string)` and returns a sub-report object. Called by `runQualityAnalysis`.

---

## lib/citations.ts

Citation graph construction and dependency resolution between plan components.

### Functions

#### `parseMissingComponents(content: string): MissingComponent[]`
Parses "missing components" entries from plan content into structured objects.

#### `parseBorrowedComponents(content: string): BorrowedComponent[]`
Parses "borrowed components" entries (citations) from plan content.

#### `buildCitationGraph(plans: PlanArtifact[]): CitationGraph`
Constructs a directed citation graph from all plan artifacts' component references.

#### `resolveCitations(graph: CitationGraph): CitationGraph`
Resolves each citation node against available component providers.

#### `findUnresolved(graph: CitationGraph): CitationNode[]`
Returns all nodes in the graph that have no resolved provider.

#### `traverseCitationGraph(graph: CitationGraph, opts: TraversalOptions): TraversalResult`
Traverses the citation graph from given entry points, collecting reachable nodes.

#### `resolveTransitiveDeps(graph: CitationGraph, nodeId: string): CitationNode[]`
Computes the full transitive dependency set for a given citation node.

#### `fetchExternalPaper(url: string): Promise<CitationNode | null>`
Fetches metadata for an external paper/URL and returns it as a citation node. Returns `null` on failure.

---

## lib/discussion.ts

Multi-backend discussion, plan review, and code review dispatch.

### Constants

#### `DISCUSSION_SONNET_MODEL: string`
Default model used for discussion synthesis.

#### `BACKEND_CLI_MAP: Record<BackendId, string>`
Maps backend IDs to their CLI binary names for discussion dispatch.

#### `DEFAULT_DISPATCH_TIMEOUT_MS: number`
Default timeout for a single backend dispatch (milliseconds).

### Functions

#### `dispatchToBackend(backend: BackendId, prompt: string, opts: DispatchOptions): Promise<BackendResponse>`
Dispatches a prompt to the given backend CLI. Handles elicitation detection and resolution. Returns the backend's response with exit code, output, and metadata.
- **Side effects** — spawns backend CLI subprocess.

#### `runDiscussion(cwd: string, topic: string, opts: RunDiscussionOptions): Promise<DiscussionResult>`
Runs a multi-round, multi-backend discussion on a topic. Persists the discussion to `.planning/milestones/{m}/discussions/`. Returns synthesized result.
- **Side effects** — spawns multiple backend CLI subprocesses; writes discussion files.

#### `listDiscussions(cwd: string): DiscussionResult[]`
Lists all saved discussion results for the current milestone.

#### `readDiscussion(cwd: string, id: string): DiscussionResult | null`
Reads a saved discussion by ID from the discussions directory.

#### `runPrePlanningDiscussion(cwd: string, phase: string, config: GrdConfig): Promise<DiscussionResult | null>`
Runs a pre-planning discussion if `discussion.before_planning` is enabled in config.

#### `runPreExecutionDiscussion(cwd: string, phase: string, config: GrdConfig): Promise<DiscussionResult | null>`
Runs a pre-execution discussion if `discussion.before_execution` is enabled in config.

#### `reviewPlanViaBackend(cwd: string, planContent: string, backend: BackendId, config: GrdConfig): Promise<PlanReviewResult>`
Dispatches a plan for review to the given backend. Returns structured review result with concerns and approval status.

#### `reviewCodeViaBackend(cwd: string, diff: string, backend: BackendId, config: GrdConfig): Promise<CodeReviewResult>`
Dispatches a code diff for review. Returns structured `CodeReviewResult` with issues, severity, and approval.

#### `reviewPRViaBackend(cwd: string, prContent: string, backend: BackendId, config: GrdConfig): Promise<PRReviewResult>`
Dispatches a PR for review. Returns `PRReviewResult` with inline comments and overall assessment.

#### `detectElicitation(response: string): ElicitationDetection`
Detects whether a backend response contains an elicitation request (a question the backend is asking the orchestrator to answer). Returns detection result with confidence score.

#### `buildElicitationContext(detection: ElicitationDetection, cwd: string): string`
Builds context for responding to an elicitation request.

#### `resolveElicitation(backend: BackendId, detection: ElicitationDetection, cwd: string, config: GrdConfig): Promise<string>`
Resolves an elicitation by generating a response and dispatching it back to the backend.

---

## lib/got.ts

Graph-of-Thoughts (GoT) execution: frozen interface contracts, smoke tests, and DAG-based artifact execution.

### Functions

#### `freezeInterfaces(artifacts: PlanArtifact[]): FrozenInterface[]`
Extracts and freezes the interface contracts from a set of plan artifacts. Used to lock down API contracts before parallel execution.

#### `buildNodePrompt(node: ArtifactDAGNode, context: NodePromptContext): string`
Builds an execution prompt for a specific DAG node given its context (dependencies, frozen interfaces, phase info).

#### `runSmokeTest(cwd: string, node: ArtifactDAGNode, result: NodeExecutionResult): SmokeTestResult`
Runs a post-execution smoke test for a DAG node, checking that must-have artifacts were produced.

#### `executeArtifactDAG(cwd: string, dag: ArtifactDAG, opts: GoTExecuteOptions): Promise<GoTExecutionResult>`
Executes an artifact DAG in topological order. Spawns agents for each node, enforces frozen interfaces, runs smoke tests, and propagates failures. Returns the full execution result.
- **Side effects** — spawns multiple backend subprocesses; writes artifacts to disk.

---

## lib/refinement.ts

Iterative refinement loop metrics and convergence detection.

### Functions

#### `collectMetrics(cwd: string, phase: string, plan: string): MetricSnapshot`
Collects current quality metrics for a plan (test pass rate, lint errors, coverage, etc.).

#### `detectMinima(snapshots: MetricSnapshot[]): MinimaRegion[]`
Detects local minima in a sequence of metric snapshots (regression detection).

#### `checkConvergence(snapshots: MetricSnapshot[], opts?: { window?: number; threshold?: number }): boolean`
Returns `true` when quality metrics have converged (delta below threshold over window).

#### `classifyBranch(snapshots: MetricSnapshot[]): 'improving' | 'plateaued' | 'regressing'`
Classifies the recent trend in metric snapshots.

#### `buildCritiquePrompt(cwd: string, phase: string, plan: string, snapshot: MetricSnapshot): string`
Builds a critique prompt for an agent given current metrics and plan content.

---

## lib/research/ — falsification loop surface

`lib/research/` is the autoresearch loop (`gd research`); its full module list is in **MODULES.md**. This section covers only the falsification / verdict / promotion surface, which changed materially in v0.5.0 and v0.6.0 and is referenced from `lib/dead-ends.ts` and `lib/knowledge.ts` above.

### lib/research/types.ts

Pure declarations plus two helpers. Every field below is **optional in the type even where the parser requires it**, so a ledger written by an earlier version still loads.

#### `Hypothesis.refutationCondition?: string`
The observation that would show the hypothesis false. Enforced structurally at parse time, not in the type.

#### `Hypothesis.refutationOverlap?: number`
Advisory token overlap between `refutationCondition` and `statement`, in `[0, 1]`. Recorded for the audit trail; **nothing branches on it**.

#### `ExperimentPlan.baseline?: number`
The value `metricKey` is *claimed to improve on*, declared at DESIGN. Must come from outside the script under test (a recorded prior iteration, a published number, a control arm), because a number the script both computes and is judged on cannot disconfirm it. **Reported only** — `evaluateVerdict` reads `metricKey`/`comparator`/`target` and nothing else, and the baseline is pinned across debug re-plans so a retry cannot pick a flattering one after seeing the result. Unset renders and behaves exactly as before it existed.

#### `BaselineMargin`
`{ baseline: number; measured: number; delta: number }` — derived at FINALIZE/LEARN when a plan declared a baseline and the run produced the metric. `delta` is `measured - baseline`, signed. Surfaces in the advisory block of FINDING.md and in the LEARN prompt; read by no gate.

#### `MeasureCause` / `MeasureOutcome`
```ts
type MeasureCause = 'run_failed' | 'metric_absent'
interface MeasureOutcome { verdict: Verdict; detail: string; cause?: MeasureCause }
```
`cause` is set only on `inconclusive`, and separates a **broken run** from an **unmeasurable design**.

#### `formatSignedDelta(delta: number): string`
The one canonical rendering of a `BaselineMargin.delta` — 6 decimals, trailing zeros dropped, explicit sign. Lives beside the type because the margin is reported from two unrelated places and must read identically in both.

#### `defaultGates(): ThreadGates`
`{ execute: true, kg_write: true }`.

### lib/research/verdict.ts

#### `evaluateVerdict(plan: ExperimentPlan, result: ExperimentResult): MeasureOutcome`
Deterministic. Returns `inconclusive` with `cause: 'run_failed'` on a non-zero exit code; `inconclusive` with `cause: 'metric_absent'` when `plan.metricKey` is not an own property of `result.metrics` (own-key check, not `in`, for parity with the Python kernel's dict lookup); otherwise `supported`/`refuted` from `compare(value, plan.comparator, plan.target)`. `baseline` is never consulted.

#### `detectDesignPlateau(causes: (MeasureCause | undefined)[], window?: number): boolean`
True when the last `window` (default `3`) causes are all `metric_absent`. Kept separate from `detectPlateau` because "the hypotheses keep getting refuted" and "the harness cannot design a measurable experiment for this question" are different diagnoses and deserve different terminal reasons.

### lib/research/agent-io.ts

#### `parseHypothesisOutput(stdout: string): { statement, rationale, predictedOutcome, refutationCondition, refutationOverlap } | null`
Parses a `__HYPOTHESIS__` block. **Admission test (v0.5.0):** a candidate whose `refutationCondition` is absent, empty, or not a string is *rejected* — the block parses to `null`, which `spawnAndParse` treats as a parse miss and retries within its existing budget. The test is structural only: present and non-empty, or not. No similarity threshold, no LLM judge. Non-string fields are rejected rather than coerced (`String(o.refutationCondition)` once minted `'[object Object]'` as a valid falsifiability condition).

#### `describeHypothesisRejection(stdout: string): string | null`
Recovers *which* rule `parseHypothesisOutput` failed on, as one operator-facing clause, or `null` if it would in fact parse. Called only on the terminal failure path — a `null` return is otherwise indistinguishable between the two rejections.

#### `parseHypothesesOutput(stdout: string): { candidates: [...]; droppedForRefutation: number }`
Multi-candidate form. Applies the same refutation-condition admission test per candidate and reports how many were dropped for it.

#### `parsePlanOutput(stdout: string): { procedure, metricKey, comparator, target, language, scriptPath, baseline? } | null`
Parses a `__PLAN__` block. `baseline` survives only when it is a finite number, and the key is **omitted entirely** when absent so a `plan.json` without a baseline is byte-identical to one written before the field existed. The returned object literal is a **whitelist**: a field the agent emits and the literal omits is dropped silently, because the orchestrator casts the result `as ExperimentPlan` and new fields are optional — adding a field to `ExperimentPlan` means adding it here too.

### lib/research/promote.ts

#### `selectKnowhowTakeaways(cwd, threadId, takeaways, ledger): Takeaway[]`
The KNOWHOW write gate (v0.6.0). A conjunction over **on-disk artifacts**, no longer the agent's self-reported `confidence`: the takeaway's `kind` is one of `success_pattern` / `constraint` / `domain_fact` / `tool_pattern`; its `evidence` is non-empty; its iteration reached a *settled* verdict in the ledger (`supported` or `refuted` — `inconclusive` is deliberately excluded, since it means nothing was measured); and that iteration's `experiments/<n>/result.json` records a non-empty `metrics` object. `confidence` stays on `Takeaway` as reported metadata and gates nothing. The kind filter stays because it is routing, not self-report — `failure_root_cause` goes to DEAD-ENDS instead.

#### `buildDeadEndCalls(thread, ledger, takeaways): DeadEndAddOpts[]`
One entry per `refuted` hypothesis. The evidence lines record, in order: what the hypothesis predicted, the observation that would refute it (present only on hypotheses minted from v0.5.0 onward — an older ledger entry yields the original two-line form unchanged), and the `failure_root_cause` takeaway for the same iteration, falling back to a bare `verdict: refuted`.

#### `promoteThreadKnowledge(cwd, thread, takeaways, ledger, opts): { knowhowAdded, deadEndsAdded, skipped }`
Writes the selected takeaways to `<cwd>/KNOWHOW.md` via `appendKnowhowEntries` (so supersession applies) and the refuted hypotheses via `addDeadEnd`. Skips entirely when `research_persist_knowledge` is `false` (default on). Prints `[research] KNOWHOW gate: <eligible>/<candidates> …` to stderr whenever the artifact gate rejected takeaways the old confidence gate would have written — the drop is the gate working, not a regression. Degrades on any thrown error rather than failing the run.
- **Side effects** — writes KNOWHOW.md and `.planning/DEAD-ENDS.md`; writes to stderr.

### lib/research/orchestrator.ts — the `metric_absent` branch

When MEASURE returns `cause: 'metric_absent'` and the thread's `redesignCount` is below `research_max_debug_depth`, the orchestrator re-enters **DESIGN for the same hypothesis at the same iteration** (hypothesis back to `testing`, `plan.json` unlinked, iteration not advanced) rather than burning a fresh hypothesis on an unmeasurable design. The budget is *shared* with the debug loop, not additive. Consecutive iterations that exhaust it without ever producing a measurable experiment terminate the thread as `exhausted` with a DESIGN PLATEAU message, counted on the thread rather than inferred from the ledger — the ledger records `inconclusive` without its cause, so inferring would conflate a broken run with an unmeasurable design.

---

## lib/commands/harness.ts

**Current self-improvement mechanism (v0.4.4+).** TS CLI surface for the life-harness — routed as TOOL_COMMANDS via `lib/cli`.

**v0.4.5:** The harness round-port classes now explicitly conform to autoresearch-core's `@runtime_checkable` port Protocols, and the import guard requires `autoresearch-core>=0.4.4`. `RepoEvaluator` catches lint/tsc/jest timeouts and missing tooling (it no longer crashes the round) and classifies failures via autoresearch-core's `classify_run_failure` ([H2]/[H3]/[H4]). The harness also consumes Tesserae 0.9.0 AgentRunbook distilled memory: `Runbook` nodes become takeaway evidence and `Gotcha` nodes become insight evidence (content prefixed accordingly), while `Event` nodes are skipped. An empty-evidence round — and the research retriever's no-graph path — hint at `tesserae config status`. (As of tesserae 0.11.0, research-corpus extraction uses `tesserae extract`, which dropped `--distill`; distillation is now a project `compile`/`refresh` concern.)

### Commands

#### `gd harness round [--auto] [--dry-run] [--full-eval]`
Runs one gather→propose→validate→eval→decide→persist cycle. Gathers Tesserae session findings, spawns an agent to propose one patch to GRD primitives, validates and evals, then either creates a review branch (`autonomy: "review"`) or auto-merges (`autonomy: "auto"` with sufficient confidence). Records stored under `.planning/harness/rounds/<id>/`.

#### `gd harness status`
Outputs the last round result (`RECORD.json`), current kill-switch state, and the earliest time the next round is eligible to run (respects `min_interval_hours`).

#### `gd harness revert <id>`
Reverts a previously merged harness round by id. Runs `git revert` on the commit recorded in `RECORD.json` for the given round.

#### `gd harness upstream list` / `gd harness upstream clear [--origin <slug>]`
**Collective layer (Phase E, v0.4.4+).** Backed by `cmdHarnessUpstream` in this module. `list` prints pending upstream candidates grouped by origin project, with per-content occurrence counts (same finding from N projects = stronger evidence). `clear` manually prunes the candidate store, optionally scoped to a single origin slug. Candidates live in `$CLAUDE_PLUGIN_DATA/harness/upstream/<origin-slug>.jsonl` (fallback `~/.grd/harness/upstream/`) and are TTL-pruned per `harness.upstream_ttl_days`.

See `bin/harness_driver.py` for the Python I/O driver and `CONFIG.md` for the `harness` config block. As of v0.4.4 the driver gained an `UpstreamStore` (emit/read/prune of `UpstreamCandidate` records) and a `CompositeFindingsSource` (local Tesserae findings + pending upstream candidates) for the upstream root, plus the conservative "about GRD" emit heuristic. Both are pure I/O on the GRD host side — the autoresearch-core decision kernel is unchanged (`Finding.source` already carries the `upstream:<project>:<session>` provenance). As of v0.4.5 the driver's port classes explicitly satisfy autoresearch-core's `@runtime_checkable` Protocols (import guard pins `autoresearch-core>=0.4.4`), the `RepoEvaluator` tolerates lint/tsc/jest timeouts and missing tooling and routes failures through `classify_run_failure` ([H2]/[H3]/[H4]), and the findings source ingests Tesserae 0.9.0 AgentRunbook distilled memory (`Runbook`→takeaway, `Gotcha`→insight, prefixed content; `Event` nodes skipped, empty-evidence rounds hint at `tesserae config status`).

---

## lib/worktree.ts

Git worktree management: create/remove/list/merge worktrees for parallel execution and evolve iterations.

### Functions

#### `worktreePath(cwd: string, branch: string): string`
Returns the local path for a worktree for the given branch.

#### `worktreeBranch(phase: string, plan: string): string`
Computes the branch name for a phase/plan worktree.

#### `ensureWorktreesDir(cwd: string): void`
Creates the `.worktrees/` directory if it doesn't exist.

#### `createEvolveWorktree(cwd: string, iteration: number): { path: string; branch: string }`
Creates a git worktree for an evolve iteration. **Deprecated (v0.4.3):** `gd evolve` is superseded by `gd harness round`; this function remains in-tree for `gd singularity` history.
- **Side effects** — runs `git worktree add`.

#### `removeEvolveWorktree(cwd: string, iteration: number): void`
Removes the evolve worktree for the given iteration. **Deprecated (v0.4.3):** see `createEvolveWorktree`.
- **Side effects** — runs `git worktree remove`.

#### `pushAndCreatePR(cwd: string, worktreePath: string, branch: string, title: string, body: string): string`
Pushes a worktree branch and creates a GitHub PR. Returns the PR URL.
- **Side effects** — runs `git push` and `gh pr create`.

#### `cmdWorktreeCreate(cwd: string, phase: string, plan: string, raw: boolean): void`
CLI command: creates a new worktree for a specific plan.

#### `cmdWorktreeRemove(cwd: string, branch: string, raw: boolean): void`
CLI command: removes a worktree by branch name.

#### `cmdWorktreeList(cwd: string, raw: boolean): void`
CLI command: lists all active worktrees.

#### `cmdWorktreeRemoveStale(cwd: string, raw: boolean): void`
CLI command: removes worktrees whose branches have been merged or deleted.

#### `cmdWorktreePushAndPR(cwd: string, branch: string, title: string, body: string, raw: boolean): void`
CLI command: pushes and creates a PR for a worktree branch.

#### `milestoneBranch(milestone: string): string`
Returns the canonical branch name for a milestone.

#### `cmdWorktreeEnsureMilestoneBranch(cwd: string, raw: boolean): void`
CLI command: ensures the milestone branch exists and is up to date.

#### `cmdWorktreeMerge(cwd: string, branch: string, raw: boolean): void`
CLI command: merges a worktree branch into the current branch.

#### `cmdWorktreeHookCreate`, `cmdWorktreeHookRemove`
CLI commands: install/remove Claude Code HTTP hooks for worktree lifecycle events.

#### `cmdTeammateIdleHook`, `cmdTaskCompletedHook`, `cmdInstructionsLoadedHook`, `cmdStopFailureHook`, `cmdPostCompactHook`
HTTP hook handlers invoked by Claude Code at corresponding lifecycle events.

---

## lib/tracker.ts

Issue tracker integration (GitHub Issues and custom providers).

### Constants

#### `PROVIDERS: Record<string, TrackerProvider>`
Registered tracker providers.

### Functions

#### `loadTrackerConfig(cwd: string): TrackerConfig | null`
Reads tracker configuration from `config.json`. Returns `null` if not configured.

#### `loadTrackerMapping(cwd: string): Record<string, string>`
Reads the phase-to-issue mapping from `.planning/milestones/{m}/tracker-mapping.json`.

#### `saveTrackerMapping(cwd: string, mapping: Record<string, string>): void`
Persists the phase-to-issue mapping.
- **Side effects** — writes mapping file.

#### `createGitHubTracker(config: ApiConfig): Tracker`
Creates a GitHub Issues tracker instance from API config.

#### `createTracker(config: TrackerConfig): Tracker`
Factory function: creates the appropriate tracker implementation from config.

#### `cmdTracker(cwd: string, sub: string, args: string[], raw: boolean): void`
CLI command dispatcher for tracker subcommands (`sync`, `status`, `open`, `close`, `comment`).

---

## lib/overstory.ts

Overstory multi-agent fleet management.

### Constants

#### `MIN_VERSION: string`
Minimum supported Overstory CLI version.

#### `DEFAULT_OVERSTORY_CONFIG: OverstoryConfig`
Default configuration for Overstory integration.

### Functions

#### `compareSemver(a: string, b: string): number`
Compares two semver strings. Returns negative/zero/positive.

#### `ovExec(args: string[], opts?: { cwd?: string; timeout?: number }): string`
Executes an `ov` CLI command and returns stdout. Throws on non-zero exit.
- **Side effects** — spawns `ov` subprocess.

#### `loadOverstoryConfig(cwd: string): OverstoryConfig`
Reads Overstory configuration from `config.json` `.overstory` section, merged with defaults.

#### `detectOverstory(cwd: string): { available: boolean; version: string | null }`
Detects whether the `ov` binary is available and meets the minimum version requirement.

#### `installOverstory(): void`
Installs the Overstory CLI if not already present.
- **Side effects** — spawns install subprocess.

#### `slingPlan(cwd: string, plan: string, opts: SlingOpts): SlingResult`
Dispatches a plan to the Overstory fleet synchronously.
- **Side effects** — spawns `ov` subprocess.

#### `slingPlanAsync(cwd: string, plan: string, opts: SlingOpts): Promise<SlingResult>`
Dispatches a plan to the Overstory fleet asynchronously.

#### `getAgentStatus(agentId: string): AgentStatus`
Returns the current status of an Overstory agent.

#### `getFleetStatus(cwd: string): FleetStatus`
Returns the status of all active agents in the fleet.

#### `mergeAgent(cwd: string, agentId: string): MergeResult`
Merges an agent's worktree back into the main branch.
- **Side effects** — runs git merge and cleanup.

#### `stopAgent(agentId: string): void`
Stops a running Overstory agent.

#### `getAgentMail(agentId: string): OverstoryMailMessage[]`
Returns queued messages for an agent.

#### `nudgeAgent(agentId: string, message: string): void`
Sends a message to a running agent.

#### `generateOverlay(cwd: string, config: OverstoryConfig): string`
Generates the Overstory overlay configuration file content.

---

## lib/mcp-server.ts

MCP server implementation exposing GRD commands as tools to Claude Code.

### Classes

#### `McpServer`
MCP server class. Constructor accepts tool definitions and a command handler. Exposes `start()` method to begin listening on stdio.

### Functions

#### `buildToolDefinitions(descriptors: CommandDescriptor[]): McpToolDescriptor[]`
Converts GRD command descriptors into MCP-compatible tool definitions with JSON Schema parameter specs.

#### `captureExecution(handler: () => void): { stdout: string; stderr: string; exitCode: number }`
Wraps a GRD command handler execution, capturing `process.stdout`/`stderr` output and intercepting `process.exit()` calls. Used to execute GRD commands as MCP tool responses without terminating the server process.
- **Side effects** — temporarily overrides `process.stdout.write`, `process.stderr.write`, and `process.exit`.

### Constants

#### `COMMAND_DESCRIPTORS: CommandDescriptor[]`
Complete list of all GRD commands exposed as MCP tools, with their parameter schemas and descriptions.

---

## lib/autopilot.ts

Autonomous multi-phase execution engine with optional worktree isolation, wave-based parallelism, and multi-milestone support.

### Constants

#### `DEFAULT_TIMEOUT_MINUTES: number`
Default agent timeout for plan execution (minutes).

#### `HEARTBEAT_INTERVAL_MS: number`
Interval for the heartbeat log writer during long-running operations.

### Functions

#### `cmdAutopilot(cwd: string, opts: AutopilotOptions, raw: boolean): Promise<void>`
CLI entry point for `gd autopilot`. Plans and executes all incomplete phases in sequence, running the post-phase pipeline (code review, simplify, worktree merge) after each wave.

#### `cmdInitAutopilot(cwd: string, raw: boolean): void`
CLI command: outputs autopilot initialization context for agents.

#### `cmdMultiMilestoneAutopilot(cwd: string, opts: MultiMilestoneOptions, raw: boolean): Promise<MultiMilestoneResult>`
CLI entry point for multi-milestone autopilot. Plans and executes phases across multiple future milestones in sequence.

#### `cmdInitMultiMilestoneAutopilot(cwd: string, raw: boolean): void`
CLI command: outputs multi-milestone initialization context.

#### `runAutopilot(cwd: string, opts: AutopilotOptions): Promise<AutopilotResult>`
Core autopilot loop. Iterates phases, dispatches waves, runs post-pipeline, completes phases. Returns structured result with per-phase outcomes.

#### `runMultiMilestoneAutopilot(cwd: string, opts: MultiMilestoneOptions): Promise<MultiMilestoneResult>`
Multi-milestone autopilot loop. Delegates to `runAutopilot` for each milestone in sequence.

#### `resolvePhaseRange(cwd: string, opts: { from?: string; to?: string; phases?: string[] }): string[]`
Resolves the set of phases to execute given range/list options.

#### `isPhasePlanned(cwd: string, phase: string): boolean`
Returns `true` if the phase has at least one PLAN.md file.

#### `isPhaseExecuted(cwd: string, phase: string): boolean`
Returns `true` if all plans in the phase have corresponding SUMMARY.md files.

#### `isMilestoneComplete(cwd: string): boolean`
Returns `true` if all phases in the current milestone are executed.

#### `resolveNextMilestone(cwd: string): string | null`
Returns the next unshipped milestone version from ROADMAP.md, or `null` if none.

#### `buildNewMilestonePrompt(cwd: string, milestone: string): string`
Builds a planning prompt for initializing a new milestone.

#### `buildMilestoneCompletePrompt(cwd: string, milestone: string): string`
Builds a completion prompt for finalizing a milestone.

#### `spawnClaude(prompt: string, opts: SpawnOpts, scheduler: Scheduler | null): SchedulerSpawnResult`
Synchronous agent dispatch. Uses the scheduler when available; falls back to direct `claude` subprocess.

#### `spawnClaudeAsync(prompt: string, opts: SpawnOpts, scheduler: Scheduler | null): Promise<SchedulerSpawnResult>`
Async agent dispatch.

#### `buildPlanPrompt(cwd: string, phase: string, config: GrdConfig): string`
Builds the planning prompt for a phase.

#### `buildExecutePrompt(cwd: string, phase: string, plan: string, config: GrdConfig): string`
Builds the execution prompt for a specific plan.

#### `buildSimplifyPrompt(cwd: string, phase: string): string`
Builds the simplify/refactoring prompt for post-execution cleanup.

#### `buildCodeReviewPrompt(cwd: string, phase: string): string`
Builds the code review prompt for post-execution review.

#### `buildConflictResolvePrompt(cwd: string, branch: string): string`
Builds the conflict resolution prompt for worktree merge conflicts.

#### `buildWireupPrompt(cwd: string, phase: string): string`
Builds the wireup discovery prompt for post-execution wiring.

#### `buildKnowledgeMiningPrompt(cwd: string, phase: string): string`
Builds the knowledge mining prompt for extracting learnings.

#### `runKnowledgeMining(cwd: string, phase: string, scheduler: Scheduler | null): Promise<void>`
Runs the knowledge mining agent after phase execution to extract KnowHow entries.

#### `buildCritiqueAgentPrompt(cwd: string, phase: string, snapshot: MetricSnapshot): string`
Builds a critique agent prompt for the refinement loop.

#### `runRefinementLoop(cwd: string, phase: string, scheduler: Scheduler | null, config: GrdConfig): Promise<void>`
Runs the iterative refinement loop for a phase until convergence or max iterations.

#### `runPostPhasePipeline(cwd: string, phase: string, scheduler: Scheduler | null, config: GrdConfig): Promise<PostPipelineResult>`
Runs the full post-phase pipeline: code review → simplify → knowledge mining → optional refinement loop → wireup.

#### `buildWaves(cwd: string, phase: string): string[][]`
Groups plans for a phase into execution waves based on `wave` frontmatter field.

#### `buildWavesFromPlans(plans: PlanArtifact[]): string[][]`
Groups a plan list into execution waves.

#### `parseWriteIntent(content: string): WriteIntent[]`
Parses `files_modified` frontmatter into structured write-intent objects.

#### `compareWriteIntent(a: WriteIntent[], b: WriteIntent[]): WriteIntentDiff`
Compares two write-intent lists and returns added/removed/modified entries.

#### `formatWriteIntentMismatch(diff: WriteIntentDiff): string`
Formats a write-intent diff as a human-readable string for conflict reporting.

#### `writeStatusMarker(cwd: string, phase: string, plan: string, status: string): void`
Writes a status marker file (e.g., `.planning/…/EXECUTING`) for a plan.
- **Side effects** — writes marker file.

#### `updateStateProgress(cwd: string): void`
Recalculates and updates the STATE.md progress bar after wave execution.

#### `createMergeQueue(): MergeQueue`
Creates a thread-safe merge queue for serializing worktree merges across concurrent wave workers.

#### `_getSchedulerStates(scheduler: Scheduler | null): Map<string, BackendUsageState>`
Returns the scheduler's internal state map. Exported for testing.

---

## lib/autoplan.ts

Automatic milestone and phase plan generation.

### Functions

#### `buildAutoplanPrompt(cwd: string, config: GrdConfig): string`
Builds the prompt for the autoplan agent to generate a milestone's phase plan.

#### `runAutoplan(cwd: string, opts: AutoplanOptions, scheduler: Scheduler | null): Promise<AutoplanResult>`
Runs the autoplan agent to generate a milestone plan. Validates the result against required structure.

#### `cmdAutoplan(cwd: string, opts: AutoplanOptions, raw: boolean): Promise<void>`
CLI entry point for `gd autoplan`. Calls `runAutoplan` and writes the result.

#### `cmdInitAutoplan(cwd: string, raw: boolean): void`
CLI command: outputs autoplan initialization context.

---

## lib/autoresearch.ts

Autonomous research loop for phase and project-level research.

### Functions

#### `cmdAutoResearch(cwd: string, opts: AutoResearchOptions, raw: boolean): Promise<void>`
CLI entry point for `gd autoresearch`. Runs iterative research cycles until a stopping condition is met (iteration limit, convergence, or SIGINT).

#### `cmdInitAutoResearch(cwd: string, raw: boolean): void`
CLI command: outputs autoresearch initialization context.

#### `_spawnClaude(prompt: string, opts: SpawnOpts, scheduler: Scheduler | null): Promise<SchedulerSpawnResult>`
Internal research subprocess spawner. Exported for testing.

---

## lib/long-term-roadmap.ts

Long-term (multi-milestone) roadmap management.

### Functions

#### `updateRefinementHistory(cwd: string, entry: RefinementMetrics): void`
Appends a refinement metrics entry to the long-term roadmap history.
- **Side effects** — writes history file.

#### `parseNormalMilestoneList(content: string): MilestoneInfo[]`
Parses the current-milestone list from ROADMAP.md.

#### `formatNormalMilestoneList(milestones: MilestoneInfo[]): string`
Formats a milestone list back to markdown.

#### `parseLtMilestone(content: string): LtMilestone | null`
Parses a single long-term milestone entry.

#### `parseLongTermRoadmap(cwd: string): LtMilestone[]`
Parses `.planning/LONG-TERM-ROADMAP.md` into structured entries.

#### `validateLongTermRoadmap(milestones: LtMilestone[]): ValidationResult`
Validates the long-term roadmap structure.

#### `generateLongTermRoadmap(cwd: string, opts: GenerateOptions): Promise<LtMilestone[]>`
Generates a long-term roadmap by dispatching to a planning agent.

#### `formatLongTermRoadmap(milestones: LtMilestone[]): string`
Serializes long-term milestones to markdown.

#### `extractShippedVersions(cwd: string): string[]`
Returns versions from ROADMAP.md that have been marked as shipped.

#### `nextLtId(milestones: LtMilestone[]): string`
Computes the next long-term milestone ID.

#### `addLtMilestone(cwd: string, milestone: LtMilestone): void`
Appends a new long-term milestone.
- **Side effects** — writes LONG-TERM-ROADMAP.md.

#### `removeLtMilestone(cwd: string, id: string): void`
Removes a long-term milestone by ID.
- **Side effects** — writes LONG-TERM-ROADMAP.md.

#### `updateLtMilestone(cwd: string, id: string, updates: Partial<LtMilestone>): void`
Updates fields on a long-term milestone.
- **Side effects** — writes LONG-TERM-ROADMAP.md.

#### `linkNormalMilestone(cwd: string, ltId: string, version: string): void`
Associates a normal milestone version with a long-term milestone.
- **Side effects** — writes LONG-TERM-ROADMAP.md.

#### `unlinkNormalMilestone(cwd: string, ltId: string, version: string): void`
Removes a version association from a long-term milestone.
- **Side effects** — writes LONG-TERM-ROADMAP.md.

#### `getLtMilestoneById(milestones: LtMilestone[], id: string): LtMilestone | null`
Looks up a long-term milestone by ID.

#### `initFromRoadmap(cwd: string): LtMilestone[]`
Bootstraps a long-term roadmap from the existing ROADMAP.md.

---

## lib/benchmark.ts

Benchmark corpus management and evaluation for GRD output quality.

### Functions

#### `loadCorpus(corpusDir: string): BenchmarkEntry[]`
Loads all benchmark entries from a corpus directory (JSON files).

#### `saveCorpusEntry(corpusDir: string, entry: BenchmarkEntry): void`
Saves a benchmark entry to the corpus directory.
- **Side effects** — writes JSON file.

#### `scoreComposite(entry: BenchmarkEntry, rubric: ScoringRubric): number`
Computes a composite quality score (0–100) for a benchmark entry against a rubric.

#### `createDefaultRubric(): ScoringRubric`
Returns the default scoring rubric with standard weights.

#### `classifyEntry(entry: BenchmarkEntry): IntegrationCategory`
Classifies a benchmark entry into an integration category.

#### `scoreSemanticFromSummary(summary: string): SemanticScore`
Estimates semantic quality of a plan summary.

#### `assessTrainability(entry: BenchmarkEntry): boolean`
Returns `true` if the entry is suitable for use as a fine-tuning training example.

#### `evaluateEntry(entry: BenchmarkEntry, rubric: ScoringRubric): BenchmarkEvaluation`
Runs a full evaluation of a benchmark entry against a rubric.

#### `formatBenchmarkReport(evaluations: BenchmarkEvaluation[]): string`
Formats a set of evaluations into a human-readable report.

---

## lib/phase-io.ts

See above in the Phase IO section.

---

## Cross-References

- **OVERVIEW.md** — architecture overview, module responsibilities, and dependency graph.
- **MODULES.md** — detailed per-module descriptions including design rationale and internal structure.
- **FLOWS.md** — end-to-end execution flows for autopilot, planning, and phase completion.
- **CONFIG.md** — complete reference for `.planning/config.json` fields and their effects.
