# Cross-Backend Rate Limit Scheduler

**Date:** 2026-03-13
**Status:** Draft
**Scope:** New `lib/scheduler.ts` module + integration into autopilot and evolve

## Problem

When running autopilot or evolve in YOLO mode, subprocesses hit API rate limits and hang until timeout (up to 120 minutes). There is zero rate limiting, backoff, or retry logic. This wastes hours of wall-clock time on stuck agents.

## Solution

A proactive token-usage-aware scheduler that monitors consumption per backend, predicts when a backend will exhaust its quota, and hands off remaining work to the next available backend before any rate limit is ever hit. OpenCode with a free model serves as the ultimate fallback — the scheduler never fully stops.

## Architecture

### New Module: `lib/scheduler.ts`

Replaces direct `spawnClaude()`/`spawnClaudeAsync()` calls with `scheduler.spawn()` in autopilot and evolve. The scheduler:

1. **Tracks** token usage per backend in a rolling time window
2. **Predicts** remaining budget using EWMA of per-task token consumption
3. **Routes** work to the best available backend (priority + headroom)
4. **Switches** backends proactively when remaining budget < 1.5 tasks worth of tokens
5. **Reserves** tokens for in-flight concurrent tasks to prevent budget overruns

### Data Model

```typescript
interface UsageSample {
  backend: BackendId;
  timestamp: number;       // ms since epoch
  duration: number;        // ms subprocess ran
  tokenEstimate: number;   // parsed from subprocess stderr
  exitCode: number;
  workItemId: string;      // identifies the work item (for logging/dedup)
}

interface BackendUsageState {
  samples: UsageSample[];          // wall-clock rolling window (drop samples older than window_minutes)
  ewma_tokens_per_task: number;    // exponential weighted moving avg of per-task token consumption
  tokens_consumed_in_window: number; // sum of tokenEstimate for samples in current window
  tokens_reserved: number;         // estimated tokens for in-flight tasks (ewma × in_flight_count)
  in_flight_count: number;         // number of currently running subprocesses for this backend
  token_budget: number;            // TPM — configured or learned
  budget_learned: boolean;         // true if inferred from observation (not pre-configured)
  budget_confidence: number;       // 0-1; formula: 1 - (1 / (1 + sample_count * 0.2))
  cooldown_until?: number;         // if a rate limit was ever hit despite prediction
}

// Return type — matches existing SpawnResult optionality for drop-in replacement
interface SchedulerSpawnResult {
  exitCode: number;
  stdout?: string;                 // optional, matching existing SpawnResult
  stderr?: string;                 // optional, matching existing SpawnResult
  timedOut: boolean;
  backend: BackendId;              // which backend actually ran the task
  tokensUsed: number;              // parsed or estimated token count
  workItemId: string;              // identifies the work item (for logging/dedup)
}

// Scheduler configuration (added to GrdConfig in lib/types.ts)
interface SchedulerConfig {
  backend_priority: BackendId[];
  free_fallback: { backend: BackendId; model?: string };
  backend_limits?: Record<string, { tpm: number; rpm?: number }>;
  prediction: {
    window_minutes: number;        // default: 15
    ewma_alpha: number;            // default: 0.3
    safety_margin_tasks: number;   // default: 1.5
    min_samples: number;           // default: 3
  };
}
```

### Configuration

Addition to `.planning/config.json`:

```json
{
  "scheduler": {
    "backend_priority": ["claude", "codex", "gemini", "opencode"],
    "free_fallback": {
      "backend": "opencode",
      "model": "gemini-2.5-flash"
    },
    "backend_limits": {
      "claude": { "tpm": 80000 },
      "codex": { "tpm": 100000 }
    },
    "prediction": {
      "window_minutes": 15,
      "ewma_alpha": 0.3,
      "safety_margin_tasks": 1.5,
      "min_samples": 3
    }
  }
}
```

- `backend_priority`: Preferred order. Scheduler picks the highest-priority backend with sufficient headroom.
- `free_fallback`: Ultimate fallback when all paid backends are near limits. Tracked like other backends but assumed high/unlimited budget.
- `backend_limits`: Pre-configured TPM per backend. **Required for each backend in `backend_priority`** unless the user is willing to accept a conservative default budget of 40,000 TPM until the system learns the real limit.
- `prediction`: Tuning parameters for the EWMA predictor.

`scheduler` must be added to `KNOWN_CONFIG_KEYS` in `lib/utils.ts`.

### Graceful Fallback When Config Is Absent

If `config.scheduler` is not present (all existing users), the scheduler operates in **pass-through mode**:
- Uses `detectBackend(cwd)` as the sole backend
- No usage tracking, no prediction, no switching
- `scheduler.spawn()` behaves identically to the original `spawnClaude()`/`spawnClaudeAsync()`
- Zero behavior change for existing installations

### Per-Backend CLI Adapter

Each backend has a different CLI binary, flags, and output format. The scheduler delegates to a `BackendAdapter` that normalizes invocation and output:

```typescript
interface BackendAdapter {
  /** CLI binary name (e.g., 'claude', 'codex', 'opencode') */
  binary: string;
  /** Build the full argument list for this backend */
  buildArgs(prompt: string, opts: SpawnOpts): string[];
  /** Parse token usage from subprocess stderr */
  parseTokenUsage(stderr: string): number | null;
  /** Parse rate limit signal from stderr/exit code */
  isRateLimited(exitCode: number, stderr: string): boolean;
  /** Normalize subprocess output to SchedulerSpawnResult */
  normalizeResult(exitCode: number, stdout: string, stderr: string): SchedulerSpawnResult;
}

// Adapter implementations per backend:
const ADAPTERS: Record<BackendId, BackendAdapter> = {
  claude: {
    binary: 'claude',
    buildArgs: (prompt, opts) => [
      '-p', prompt,
      '--verbose',
      '--dangerously-skip-permissions',
      ...(opts.maxTurns ? ['--max-turns', String(opts.maxTurns)] : []),
      ...(opts.model ? ['--model', opts.model] : []),
      '--output-format', 'json',
    ],
    parseTokenUsage: (stderr) => {
      // Claude verbose mode: "Total tokens: 12345" or "input_tokens: X, output_tokens: Y"
      const total = stderr.match(/[Tt]otal.tokens:\s*(\d+)/);
      if (total) return parseInt(total[1], 10);
      const input = stderr.match(/input_tokens:\s*(\d+)/);
      const output = stderr.match(/output_tokens:\s*(\d+)/);
      if (input && output) return parseInt(input[1], 10) + parseInt(output[1], 10);
      return null;
    },
    isRateLimited: (exitCode, stderr) =>
      /rate.limit|429|overloaded_error|too many requests/i.test(stderr),
    // normalizeResult is a structural template — the scheduler patches in
    // tokensUsed and workItemId after parsing (see spawn flow step 8-9)
    normalizeResult: (exitCode, stdout, stderr) => ({
      exitCode, stdout, stderr, timedOut: false,
      backend: 'claude', tokensUsed: 0, workItemId: '',
    }),
  },
  codex: {
    binary: 'codex',
    buildArgs: (prompt, opts) => [
      '--prompt', prompt,
      '--approval-mode', 'full-auto',
      ...(opts.model ? ['--model', opts.model] : []),
    ],
    parseTokenUsage: (stderr) => {
      const match = stderr.match(/"total_tokens":\s*(\d+)/);
      return match ? parseInt(match[1], 10) : null;
    },
    isRateLimited: (exitCode, stderr) =>
      /rate.limit|429|rate_limit_exceeded/i.test(stderr),
    normalizeResult: (exitCode, stdout, stderr) => ({
      exitCode, stdout, stderr, timedOut: false,
      backend: 'codex', tokensUsed: 0, workItemId: '',
    }),
  },
  gemini: {
    binary: 'gemini',
    buildArgs: (prompt, opts) => [
      '-p', prompt,
      '--sandbox', 'off',
      ...(opts.model ? ['--model', opts.model] : []),
    ],
    parseTokenUsage: (stderr) => {
      const match = stderr.match(/tokenCount["\s:]*(\d+)/);
      return match ? parseInt(match[1], 10) : null;
    },
    isRateLimited: (exitCode, stderr) =>
      /rate.limit|429|RESOURCE_EXHAUSTED|quota/i.test(stderr),
    normalizeResult: (exitCode, stdout, stderr) => ({
      exitCode, stdout, stderr, timedOut: false,
      backend: 'gemini', tokensUsed: 0, workItemId: '',
    }),
  },
  opencode: {
    binary: 'opencode',
    buildArgs: (prompt, opts) => [
      '--non-interactive',
      '--prompt', prompt,
      ...(opts.model ? ['--model', opts.model] : []),
    ],
    parseTokenUsage: (stderr) => {
      // OpenCode varies by provider; try common patterns
      const match = stderr.match(/(?:total_tokens|tokens?.used)[\s:"]*(\d+)/i);
      return match ? parseInt(match[1], 10) : null;
    },
    isRateLimited: (exitCode, stderr) =>
      /rate.limit|429|too many requests|quota/i.test(stderr),
    normalizeResult: (exitCode, stdout, stderr) => ({
      exitCode, stdout, stderr, timedOut: false,
      backend: 'opencode', tokensUsed: 0, workItemId: '',
    }),
  },
  overstory: {
    binary: 'ov',
    buildArgs: (prompt, opts) => [
      'run', '--prompt', prompt,
      ...(opts.model ? ['--model', opts.model] : []),
    ],
    parseTokenUsage: (stderr) => {
      const match = stderr.match(/tokens?:\s*(\d+)/i);
      return match ? parseInt(match[1], 10) : null;
    },
    isRateLimited: (exitCode, stderr) =>
      /rate.limit|429|quota/i.test(stderr),
    normalizeResult: (exitCode, stdout, stderr) => ({
      exitCode, stdout, stderr, timedOut: false,
      backend: 'overstory', tokensUsed: 0, workItemId: '',
    }),
  },
};
```

**Token parsing fallback:** If the adapter's `parseTokenUsage` returns `null`, estimate from `duration_ms × historical_tokens_per_ms` ratio. If no historical data exists, use a conservative estimate of `duration_ms × 10` (rough average for LLM subprocesses).

### Prediction Engine

**Token budget sources (in priority order):**
1. Pre-configured `backend_limits.{backend}.tpm` in config
2. Learned from observation (EWMA of observed ceiling before rate limit)
3. Conservative default: 40,000 TPM (safe for most free/starter tiers)

**Rolling window semantics:**
- Wall-clock based: samples older than `window_minutes` are evicted on each `recordSample()` call
- When window rolls and samples are evicted, `tokens_consumed_in_window` is recalculated from remaining samples (not reset to 0)
- During the first `window_minutes` when few samples exist, `min_samples` gates EWMA prediction — until then, use conservative defaults

**EWMA update (on each completed task):**
```
ewma_alpha = 0.3  // Biased toward recent samples to adapt quickly to burst patterns
new_ewma = alpha × latest_tokens + (1 - alpha) × previous_ewma
```

**Proactive switching logic:**
```
effective_consumed = tokens_consumed_in_window + tokens_reserved
tokens_remaining = token_budget - effective_consumed
avg_tokens_per_task = ewma_tokens_per_task
tasks_remaining_estimate = tokens_remaining / avg_tokens_per_task

if tasks_remaining_estimate < safety_margin_tasks:
    → finish current task (do not interrupt)
    → hand off remaining work to next backend in priority list
```

**Concurrency accounting:**
When a task is dispatched to a backend:
- `in_flight_count += 1`
- `tokens_reserved += ewma_tokens_per_task`

When a task completes:
- `in_flight_count -= 1`
- `tokens_reserved = ewma_tokens_per_task * in_flight_count` (recalculated from current EWMA × remaining in-flight, not decremented, to avoid drift from EWMA changes between dispatch and completion)
- `tokens_consumed_in_window += actual_tokens_used`
- EWMA updated with `actual_tokens_used`

This prevents N parallel tasks from collectively blowing past the budget.

### Integration Points

#### `lib/autopilot.ts`

Replace `spawnClaude()` and `spawnClaudeAsync()` in:
- `runAutopilot()` — phase planning and execution calls
- `runMultiMilestoneAutopilot()` — milestone-level orchestration

```typescript
// Before
const result = await spawnClaudeAsync(prompt, opts);

// After
const result = await scheduler.spawn(prompt, {
  ...opts,
  cwd,
  workItemId: `phase-${phaseNum}-plan`,
});
```

#### `lib/evolve/orchestrator.ts`

Replace `spawnClaudeAsync()` in:
- `_runIterationStep()` — batch execution and review subprocesses

```typescript
// Before
const result = await spawnClaudeAsync(batchPrompt, evolveOpts);

// After
const result = await scheduler.spawn(batchPrompt, {
  ...evolveOpts,
  cwd,
  workItemId: `evolve-iter-${iteration}-batch`,
});
```

#### Backend resolution

`scheduler.spawn()` internally:
1. Checks if scheduler config exists — if not, pass-through mode (no scheduling)
2. Calls `pickBackend(priority, headroom)` to select the best backend
3. Retrieves the `BackendAdapter` for the chosen backend
4. Uses `getBackendCapabilities()` to verify the backend supports required features (subagents, parallel)
5. Calls `adapter.buildArgs()` to construct the CLI invocation
6. Spawns the subprocess with the adapter's binary and args
7. On completion: calls `adapter.parseTokenUsage()`, falls back to duration-based estimate
8. Calls `adapter.normalizeResult()` to produce a `SchedulerSpawnResult`
9. Records the `UsageSample`, updates EWMA, adjusts `tokens_reserved`
10. Returns `SchedulerSpawnResult` to caller

### State Persistence

- **In-memory during a run** — `Map<BackendId, BackendUsageState>` for zero disk I/O overhead on hot path
- **Persisted between runs** — learned token budgets and EWMA values saved to `.planning/scheduler-state.json` (add to `.gitignore` — transient per-machine state)
  - Schema: `{ version: 1, backends: Record<BackendId, { token_budget, ewma_tokens_per_task, budget_learned, budget_confidence, last_updated }> }`
  - Version field enables future migrations
  - Written on graceful shutdown and every 10 samples (for crash resilience)
- **Session log** — current session stats appended to `.planning/scheduler.log` (separate from autopilot.log)

### Spawn Flow

```
caller (autopilot/evolve)
  → scheduler.spawn(prompt, opts)
    → if no scheduler config: pass-through to spawnClaude/spawnClaudeAsync directly
    → pickBackend(priority, headroom)
      → for each backend in priority:
          effective = consumed + reserved
          if (budget - effective) / ewma > safety_margin: return backend
      → return free_fallback
    → adapter = ADAPTERS[backend]
    → args = adapter.buildArgs(prompt, opts)
    → mark in-flight: in_flight_count++, tokens_reserved += ewma
    → result = spawnSubprocess(adapter.binary, args, opts)
    → tokens = adapter.parseTokenUsage(result.stderr) ?? estimateFromDuration(result.duration)
    → mark complete: in_flight_count--, recalc tokens_reserved
    → recordSample(backend, { tokens, duration, ... })
    → updateEWMA(backend, tokens)
    → return adapter.normalizeResult(...)
```

### Error Handling

- If token parsing fails for a subprocess, estimate from duration using historical tokens/ms ratio
- If a rate limit is ever hit despite prediction (shouldn't happen with proper margins), immediately record the event, set `cooldown_until = now + window_minutes * 60 * 1000` for that backend, and retry the same work item on the next backend
- The free fallback (OpenCode) is tracked like other backends but with a high default budget (1,000,000 TPM, configurable via `backend_limits`). If even the fallback rate-limits, the scheduler logs a warning and waits for the shortest `cooldown_until` across all backends before resuming.
- If a backend CLI binary is not installed (checked once at scheduler init and cached), skip it silently and try the next in priority list

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `lib/scheduler.ts` | Create | Core scheduler module: adapters, predictor, router, spawn wrapper |
| `lib/utils.ts` | Modify | Add `scheduler` to `KNOWN_CONFIG_KEYS` |
| `lib/types.ts` | Modify | Add `SchedulerConfig`, `UsageSample`, `BackendUsageState`, `SchedulerSpawnResult`, `BackendAdapter` types; add `scheduler?: SchedulerConfig` field to `GrdConfig` interface |
| `lib/autopilot.ts` | Modify | Replace spawn calls with `scheduler.spawn()` |
| `lib/evolve/orchestrator.ts` | Modify | Replace spawn calls with `scheduler.spawn()` |
| `tests/unit/scheduler.test.ts` | Create | Unit tests for EWMA, budget prediction, backend selection, concurrency accounting, token parsing |
| `tests/integration/scheduler.test.ts` | Create | Integration tests with mock subprocesses |

## Testing Strategy

- Unit tests for EWMA calculation, budget prediction, backend selection logic
- Unit tests for concurrency accounting (in-flight reservation)
- Unit tests for token parsing from stderr (per-backend adapter patterns)
- Unit tests for rolling window eviction and recalculation
- Unit tests for pass-through mode (no scheduler config)
- Integration tests: mock subprocess that prints known token counts, verify scheduler switches backends at the right threshold
- Golden tests: scheduler log output format

## Out of Scope

- Per-request API-level rate limiting (we operate at subprocess level)
- Cost optimization (picking cheapest backend) — future enhancement
- Multi-machine coordination — single-process scheduler only
- Prompt-level token counting (pre-flight estimation before spawning) — future enhancement
