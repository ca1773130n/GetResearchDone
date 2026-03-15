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

### Per-Account State

State tracking extends from per-backend to per-account. The state key becomes `"claude/~/.claude-personal"` instead of `"claude"`. Each key has its own `BackendUsageState` with independent EWMA estimates, token window, cooldown timer, and in-flight count.

State persistence in `scheduler-state.json` uses the compound key. Old-format keys (without `/`) remain valid for non-rotation mode — backward compatible.

### Spawn-Time Resolution

When the scheduler selects an account:

1. `resolveAccount()` walks the priority waterfall, checking EWMA headroom per account
2. Returns `AccountResolution { backend, account, stateKey }`
3. Grabs `ADAPTERS[resolution.backend]` (the real adapter)
4. Sets the backend-specific env var for the account's config directory
5. Spawns with the adapter's `buildArgs` and modified env

Env var mapping per backend:

| Backend   | Env Var           |
|-----------|-------------------|
| claude    | `CLAUDE_CONFIG_DIR` |
| codex     | `CODEX_HOME`      |
| gemini    | `GEMINI_CLI_HOME`  |
| opencode  | `OPENCODE`        |
| overstory | `OVERSTORY_HOME`  |

### Superpowers as Scheduling Strategy

Superpowers is not an adapter — it is a scheduling strategy. The `superpowers` and `grd` entries are removed from `ADAPTERS`. The `ADAPTERS` record key type changes from `BackendId` to `DirectBackendId`.

```typescript
type MetaBackendId = 'superpowers' | 'grd';
type DirectBackendId = Exclude<BackendId, MetaBackendId>;
// DirectBackendId = 'claude' | 'codex' | 'gemini' | 'opencode' | 'overstory'
```

When `backend: "grd"`, the scheduler resolves to the underlying AI backend from config (defaults to claude). No recursive spawning.

When `backend: "superpowers"` without `account_rotation`, the scheduler uses `superpowers.default_backend` to select the adapter and spawns with no env var override.

### Overstory Sling Integration

When the scheduler picks overstory as the backend, the dispatch path depends on task type:

**Parallel wave dispatch** (`opts.parallel === true`):
- Call `slingPlan()` from `lib/overstory.ts`
- Spawns agent in tmux + git worktree
- Poll `getAgentStatus()` at `config.overstory.poll_interval_ms`
- Merge via `mergeAgent()` per `config.overstory.merge_strategy`
- Parse token usage from agent mail
- Return `SchedulerSpawnResult`

**Single task** (evolve iteration, autopilot step):
- Use `ADAPTERS.overstory` (`ov run --prompt`)
- Same as current behavior

The distinction is signaled via `SpawnOpts.parallel`:

```typescript
interface SpawnOpts {
  // ... existing fields
  parallel?: boolean;
  planPath?: string;
  overlayPath?: string;
}
```

Autopilot/execute-phase sets `parallel: true` + `planPath` when dispatching wave plans. Evolve and single-task spawns omit this flag.

The sling path in `spawn()` is async-long-running: call sling, poll status, wait for completion, then record the usage sample in EWMA as usual. This fits naturally since `spawn()` already returns `Promise<SchedulerSpawnResult>`.

### Non-Superpowers Mode (No Behavioral Change)

When `backend` is a direct backend (e.g., `"claude"`) with no `superpowers` config, the scheduler works exactly as today — single state per backend, no env var override, no account rotation. Zero behavioral change for existing users.

## New Types

```typescript
interface AccountConfig {
  config_dir: string;
}

interface AccountResolution {
  backend: DirectBackendId;
  account: AccountConfig;
  stateKey: string;
}

interface SuperpowersConfig {
  default_backend: DirectBackendId;
  account_rotation: boolean;
  accounts: Partial<Record<DirectBackendId, AccountConfig[]>>;
}
```

`SpawnOpts` gains optional fields: `parallel`, `planPath`, `overlayPath`.

## Files Changed

| File | Change |
|------|--------|
| `lib/types.ts` | Move `MetaBackendId` to exclude only superpowers/grd (overstory stays direct), add `AccountConfig`, `AccountResolution`, update `SuperpowersConfig`, extend `SpawnOpts` |
| `lib/scheduler.ts` | Remove superpowers/grd from ADAPTERS, change ADAPTERS key to `DirectBackendId`, add `ENV_VAR_MAP`, add `resolveAccount()`, update `createScheduler()` for per-account state, update `spawn()` for env injection + sling path |
| `lib/backend.ts` | No change (detection waterfall stays, capabilities stay) |
| `lib/overstory.ts` | No change (slingPlan already exists, scheduler calls it) |
| `lib/autopilot.ts` | Pass `parallel: true` + `planPath` in SpawnOpts for wave dispatches |
| `lib/evolve/orchestrator.ts` | No change (single-task spawns, no parallel flag) |
| `commands/init.md` | Add accounts configuration questions to superpowers setup |
| `commands/settings.md` | Add accounts sub-options for superpowers backend |
| `tests/unit/scheduler.test.ts` | Add tests for resolveAccount, per-account state, env injection, sling dispatch |
