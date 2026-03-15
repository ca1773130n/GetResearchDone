# Account-Aware Scheduling & Backend Wiring

Date: 2026-03-15

## Problem

The scheduler (`lib/scheduler.ts`) has three gaps:

1. **Superpowers account rotation** — The superpowers backend delegates to `_claudeAdapter` statically. It cannot set `CLAUDE_CONFIG_DIR` for account rotation, switch between AI CLI binaries based on `superpowers.default_backend`, or track token usage per account.
2. **Overstory sling integration** — The scheduler's overstory adapter uses `ov run --prompt` (single agent), while `lib/overstory.ts` has `slingPlan()` for multi-agent orchestration (tmux + worktrees + merge queue). These paths are disconnected.
3. **GRD meta-backend resolution** — The `grd` adapter delegates to `_claudeAdapter`, but should resolve to whatever underlying AI backend the user configured.

## Design

### Config Schema

```json
{
  "backend": "superpowers",
  "superpowers": {
    "default_backend": "claude",
    "account_rotation": true,
    "accounts": {
      "claude": [
        { "config_dir": "~/.claude-personal" },
        { "config_dir": "~/.claude-work" }
      ],
      "codex": [
        { "config_dir": "~/.codex-main" }
      ],
      "gemini": [
        { "config_dir": "~/.gemini-default" }
      ],
      "opencode": [
        { "config_dir": "~/.opencode-free" }
      ]
    }
  },
  "scheduler": {
    "backend_priority": ["claude", "codex", "gemini", "opencode"],
    "free_fallback": { "backend": "opencode" },
    "prediction": {
      "window_minutes": 15,
      "ewma_alpha": 0.3,
      "safety_margin_tasks": 1.5,
      "min_samples": 3
    }
  }
}
```

### Account Selection Waterfall

When `backend: "superpowers"` with `account_rotation: true`, the scheduler walks the priority waterfall sequentially, trying each account within a backend before moving to the next backend:

```
claude/~/.claude-personal → claude/~/.claude-work → codex/~/.codex-main → gemini/~/.gemini-default → opencode/~/.opencode-free
```

Each account has independent EWMA token tracking, cooldown state, and in-flight reservations. When an account's predicted headroom drops below the safety margin, the scheduler skips it and tries the next one. When a 429 is received, that account enters cooldown and the scheduler retries with the next account.

**Exhaustion fallback:** If no account has headroom across all priority backends, `resolveAccount()` falls back to `scheduler.free_fallback.backend`. If the fallback backend has accounts configured in `superpowers.accounts`, the first account is used. Otherwise, the fallback backend is spawned with no config dir override (default account). This guarantees `resolveAccount()` always returns a valid resolution.

**Empty accounts edge cases:**
- `accounts: {}` (empty) — behaves like non-rotation mode; uses `default_backend` with no config dir override
- `accounts.claude: []` (empty array) — skips claude entirely, moves to next priority backend
- Backend in `backend_priority` but missing from `accounts` — skipped, moves to next

**Max retry guard:** The recursive 429-retry in `spawn()` is capped at `priority.length * max_accounts_per_backend` retries (i.e., total account count). After exhaustion, spawn returns with the fallback result rather than looping.

### Per-Account State

State tracking extends from per-backend to per-account. The state key becomes `"claude/~/.claude-personal"` instead of `"claude"`. Each key has its own `BackendUsageState` with independent EWMA estimates, token window, cooldown timer, and in-flight count.

**State persistence:** `scheduler-state.json` uses the compound key format. On first load after enabling `account_rotation`, old single-backend keys (e.g., `"claude"`) will not match any per-account state key and are silently ignored. This is an accepted cold-start — EWMA prediction rebuilds within `prediction.min_samples` (default 3) spawns.

**Type compatibility:** `UsageSample.backend` remains typed as `BackendId` (the actual backend, e.g., `"claude"`). A new `stateKey: string` field is added to `UsageSample` to hold the compound key (e.g., `"claude/~/.claude-personal"`). The `states` map in the scheduler is keyed by `stateKey`, not by `backend`. This preserves strict typing.

### Spawn-Time Resolution

When the scheduler selects an account:

1. `resolveAccount()` walks the priority waterfall, checking EWMA headroom per account
2. Returns `AccountResolution { backend, account, stateKey }`
3. Grabs `ADAPTERS[resolution.backend]` (the real adapter)
4. Sets the backend-specific env var for the account's config directory
5. Spawns with the adapter's `buildArgs` and modified env

Env var mapping per backend:

| Backend   | Env Var              | Notes |
|-----------|----------------------|-------|
| claude    | `CLAUDE_CONFIG_DIR`  | Standard Claude Code config dir |
| codex     | `CODEX_HOME`         | Codex CLI home dir |
| gemini    | `GEMINI_CLI_HOME`    | Gemini CLI home dir |
| opencode  | `OPENCODE_CONFIG_DIR`| OpenCode config dir (verify against CLI docs at implementation time) |
| overstory | `OVERSTORY_HOME`     | Overstory home dir |

### Superpowers as Scheduling Strategy

Superpowers is not an adapter — it is a scheduling strategy. The `superpowers` and `grd` entries are removed from `ADAPTERS`. The `ADAPTERS` record key type changes from `BackendId` to `AdapterBackendId`.

**Type change:** The existing codebase has `MetaBackendId = 'superpowers' | 'grd' | 'overstory'` and `DirectBackendId = Exclude<BackendId, MetaBackendId>`. This spec changes `MetaBackendId` to exclude overstory, since overstory has a real CLI adapter (`ov`):

```typescript
// Before (current codebase):
type MetaBackendId = 'superpowers' | 'grd' | 'overstory';
type DirectBackendId = Exclude<BackendId, MetaBackendId>;
// DirectBackendId = 'claude' | 'codex' | 'gemini' | 'opencode'

// After (this spec):
type MetaBackendId = 'superpowers' | 'grd';
type AdapterBackendId = Exclude<BackendId, MetaBackendId>;
// AdapterBackendId = 'claude' | 'codex' | 'gemini' | 'opencode' | 'overstory'
```

`DirectBackendId` is renamed to `AdapterBackendId` to better express its meaning: backends that have a CLI adapter. `DirectBackendId` is kept as an alias for backward compatibility in `SuperpowersConfig.default_backend`.

When `backend: "grd"`, the scheduler resolves to the underlying AI backend from config (`superpowers.default_backend` if superpowers config exists, otherwise `"claude"`). No recursive spawning.

When `backend: "superpowers"` without `account_rotation`, the scheduler uses `superpowers.default_backend` to select the adapter and spawns with no env var override.

### Overstory Sling Integration

When the scheduler picks overstory as the backend, the dispatch path depends on task type:

**Parallel wave dispatch** (`opts.parallel === true`):
- The **caller** (autopilot) calls `slingPlan()` from `lib/overstory.ts` directly, bypassing `scheduler.spawn()`
- This is because `slingPlan()` requires domain-specific fields (`phase_number`, `plan_id`, `milestone`, `runtime`, `overlay_path`) that don't belong in the generic `SpawnOpts` interface
- `slingPlan()` is synchronous and dispatch-only — it fires the agent and returns a `SlingResult` with `agent_id`, `worktree_path`, `branch`, and `tmux_session`. Autopilot must then drive the full lifecycle:
  1. Call `slingPlan(cwd, slingOpts)` → get `SlingResult.agent_id`
  2. Poll `getAgentStatus(cwd, agentId)` at `config.overstory.poll_interval_ms` intervals
  3. When agent state is `'done'` or `'failed'`, call `mergeAgent(cwd, agentId)` per `config.overstory.merge_strategy`
  4. Compute duration from dispatch to completion
  5. Call `scheduler.recordExternalSample(stateKey, sample)` to feed EWMA
- A new async wrapper `slingPlanAsync(cwd, opts, pollIntervalMs)` will be added to `lib/overstory.ts` to encapsulate steps 1-4 and return a `Promise<{ exitCode, duration, agentId }>` for cleaner autopilot integration
- Autopilot determines the overstory path by checking `getBackendCapabilities(resolution.backend).native_worktree_isolation && opts.parallel`, where `resolution` is the return value of `resolveAccount()`. This ensures the check only runs after account resolution, avoiding ambiguity with config-level backend values like `"superpowers"`

**Single task** (evolve iteration, autopilot step):
- Uses `scheduler.spawn()` with `ADAPTERS.overstory` (`ov run --prompt`)
- Same as current behavior

This separation keeps the scheduler generic (prompt in, result out) while letting autopilot use overstory's full orchestration API for parallel waves.

### Non-Superpowers Mode (No Behavioral Change)

When `backend` is an adapter backend (e.g., `"claude"`) with no `superpowers` config, the scheduler works exactly as today — single state per backend, no env var override, no account rotation. Zero behavioral change for existing users.

## Type Changes

**Updated types** (all in `lib/types.ts`):

```typescript
// MetaBackendId changes: overstory removed (it has a real adapter)
type MetaBackendId = 'superpowers' | 'grd';

// New: backends with CLI adapters
type AdapterBackendId = Exclude<BackendId, MetaBackendId>;

// DirectBackendId kept as alias for backward compat
type DirectBackendId = AdapterBackendId;

// New types
interface AccountConfig {
  config_dir: string;
}

interface AccountResolution {
  backend: AdapterBackendId;
  account: AccountConfig;
  stateKey: string;  // e.g. "claude/~/.claude-personal"
}

// Updated: add accounts field
interface SuperpowersConfig {
  default_backend: DirectBackendId;
  account_rotation: boolean;
  accounts: Partial<Record<AdapterBackendId, AccountConfig[]>>;
}

// Updated: add optional stateKey for per-account tracking
interface UsageSample {
  backend: BackendId;
  stateKey?: string;     // NEW — compound key for per-account state; absent in legacy samples
  timestamp: number;
  duration: number;
  tokenEstimate: number;
  exitCode: number;
  workItemId: string;
}

// Updated: restrict to AdapterBackendId (superpowers/grd cannot appear in priority)
interface SchedulerConfig {
  backend_priority: AdapterBackendId[];     // was BackendId[]
  free_fallback: { backend: AdapterBackendId; model?: string };  // was BackendId
  backend_limits?: Record<string, { tpm: number; rpm?: number }>;
  prediction: { /* unchanged */ };
}

// Updated: add superpowers to GrdConfig
interface GrdConfig {
  // ... existing fields ...
  superpowers?: SuperpowersConfig;
}
```

`SpawnOpts` gains one optional field: `parallel?: boolean`. The `planPath`/`overlayPath` fields are NOT added — autopilot calls `slingPlan()` directly for the overstory parallel path.

## New Scheduler Methods

```typescript
interface Scheduler {
  spawn(prompt: string, opts: SpawnOpts): Promise<SchedulerSpawnResult>;
  getState(stateKey: string): BackendUsageState | undefined;
  recordExternalSample(stateKey: string, sample: UsageSample): void;  // NEW
  persistState(planningDir: string): void;
  loadPersistedState(planningDir: string): void;
}
```

`recordExternalSample` lets autopilot record sling results back into the scheduler's EWMA tracking without going through `spawn()`.

## Files Changed

| File | Change |
|------|--------|
| `lib/types.ts` | Change `MetaBackendId` to `'superpowers' \| 'grd'` (remove overstory), add `AdapterBackendId` alias, add `AccountConfig`, `AccountResolution`, extend `SuperpowersConfig` with `accounts`, add optional `stateKey` to `UsageSample`, add `superpowers?` to `GrdConfig`, add `parallel?` to `SpawnOpts`, change `SchedulerConfig.backend_priority` to `AdapterBackendId[]`, change `free_fallback.backend` to `AdapterBackendId` |
| `lib/scheduler.ts` | Remove superpowers/grd from ADAPTERS, change ADAPTERS key to `AdapterBackendId`, add `ENV_VAR_MAP`, add `resolveAccount()`, update `createScheduler()` for per-account state init, update `spawn()` for env injection + max retry guard, add `recordExternalSample()` to both the `Scheduler` interface and the `createScheduler` implementation |
| `lib/backend.ts` | No change (detection waterfall stays, capabilities stay) |
| `lib/overstory.ts` | Add `slingPlanAsync()` wrapper that drives the full sling lifecycle (dispatch → poll → merge → return result) |
| `lib/autopilot.ts` | Add overstory sling path for parallel wave dispatch (call `slingPlanAsync` directly, record sample via `recordExternalSample`), pass `parallel: true` for wave spawns. Overstory path determined by `getBackendCapabilities(resolution.backend)` after account resolution |
| `lib/evolve/orchestrator.ts` | No change (single-task spawns, no parallel flag) |
| `commands/init.md` | Add accounts configuration questions to superpowers setup |
| `commands/settings.md` | Add accounts sub-options for superpowers backend |
| `tests/unit/scheduler.test.ts` | Add tests for resolveAccount (waterfall, exhaustion, empty accounts), per-account state, env injection, max retry guard, recordExternalSample |
