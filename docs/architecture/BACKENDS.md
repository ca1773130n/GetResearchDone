# Backend Adapter Architecture

GRD dispatches work to external AI CLI tools — "backends". Each backend is a separate binary with its own prompt format, model names, token reporting, and rate-limit signals. GRD abstracts these differences behind a thin adapter layer so the rest of the codebase stays backend-agnostic.

---

## 1. What a Backend Is

A backend is one of the four dispatchable AI CLI binaries that GRD can spawn as a subprocess:

| Backend ID | Binary | Vendor | Model tier examples |
|------------|--------|--------|---------------------|
| `claude` | `claude` | Anthropic | opus, sonnet, haiku |
| `codex` | `codex` | OpenAI | gpt-5.4, gpt-5.3-codex-spark, gpt-5.4-mini |
| `gemini` | `gemini` | Google | gemini-3.1-pro, gemini-3.1-flash, gemini-3.1-flash-lite |
| `opencode` | `opencode` | anomalyco | anthropic/claude-opus-4-6 (provider-prefixed) |
| `overstory` | `ov` | Overstory | uses abstract opus/sonnet/haiku tiers |

Two additional **meta-backends** are recognized but do not have adapter implementations:

| Backend ID | Role |
|------------|------|
| `superpowers` | Orchestration layer: selects an adapter backend + account at spawn time |
| `grd` | Native GRD mode: uses GRD's own commands/skills with the configured AI backend |

Meta-backends resolve to a real adapter at dispatch time. They cannot be used as `default_backend` in `SuperpowersConfig`.

---

## 2. The Adapter Interface

Defined in `lib/types.ts`:

```typescript
export interface BackendAdapter {
  binary: string;
  buildArgs(prompt: string, opts: SpawnOpts): string[];
  parseTokenUsage(stderr: string): number | null;
  isRateLimited(exitCode: number, stderr: string): boolean;
}
```

Each field:

- **`binary`** — the executable name on `PATH` (e.g. `"claude"`, `"ov"`).
- **`buildArgs(prompt, opts)`** — constructs the CLI argument array from a prompt string and `SpawnOpts`. The scheduler calls this immediately before `spawn()`. `SpawnOpts` carries `maxTurns`, `model`, `outputFormat`, `captureOutput`, `captureStderr`, `cwd`, `workItemId`, and `parallel`.
- **`parseTokenUsage(stderr)`** — extracts total token count from the subprocess stderr. Returns `null` when no usage data is found. The scheduler records the result as a `UsageSample` for EWMA budget tracking.
- **`isRateLimited(exitCode, stderr)`** — returns `true` when the subprocess output indicates a rate-limit event. Drives the retry/rotation loop in `_spawnWithRetry`.

`SpawnOpts` is defined in `lib/types.ts`:

```typescript
export interface SpawnOpts {
  timeout?: number;
  maxTurns?: number;
  model?: string;
  outputFormat?: string;
  captureOutput?: boolean;
  captureStderr?: boolean;
  cwd?: string;
  workItemId?: string;
  parallel?: boolean;
}
```

---

## 3. The Adapters Registry

Defined in `lib/scheduler.ts` as `ADAPTERS`:

```typescript
export const ADAPTERS: Record<AdapterBackendId, BackendAdapter> = {
  claude: _claudeAdapter,
  codex: { ... },
  gemini: { ... },
  opencode: { ... },
  overstory: { ... },
};
```

`AdapterBackendId = Exclude<BackendId, 'superpowers' | 'grd'>` — all concrete backends that have adapters. The scheduler looks up `ADAPTERS[backend]` at spawn time, falling back to `ADAPTERS.claude` if the resolved backend is not in the map.

Each backend's `buildArgs` shape:

| Backend | Core flags |
|---------|-----------|
| `claude` | `-p <prompt> --verbose --dangerously-skip-permissions [--max-turns N] [--model M] --output-format json` |
| `codex` | `--prompt <prompt> --approval-mode full-auto [--model M]` |
| `gemini` | `-p <prompt> --sandbox off [--model M]` |
| `opencode` | `--non-interactive --prompt <prompt> [--model M]` |
| `overstory` | `run --prompt <prompt> [--model M]` |

---

## 4. Capability Flags

`BACKEND_CAPABILITIES` in `lib/backend.ts` maps each `BackendId` to a `BackendCapabilities` object. The scheduler and orchestration layer read these flags to enable or gracefully degrade features.

| Flag | claude | codex | gemini | opencode | overstory | superpowers | grd |
|------|:------:|:-----:|:------:|:--------:|:---------:|:-----------:|:---:|
| `subagents` | true | true | true | true | true | true | true |
| `parallel` | true | true | true | true | true | true | true |
| `teams` | true | true | false | false | true | true | true |
| `hooks` | true | true | true | true | false | true | true |
| `mcp` | true | true | true | true | true | true | true |
| `native_worktree_isolation` | true | false | false | false | true | true | true |
| `effort` | true | false | false | false | false | true | false |
| `http_hooks` | true | false | false | false | false | false | false |
| `cron` | true | false | false | false | false | false | false |
| `smart_approvals` | false | true | false | false | false | false | false |
| `plan_mode` | false | false | true | false | false | false | false |
| `sandbox_gvisor` | false | false | true | false | false | false | false |
| `sandbox_lxc` | false | false | false | false | false | false | false |
| `mcp_elicitation` | true | false | false | false | false | false | false |
| `model_overrides` | true | true | true | true | true | true | false |
| `max_output_tokens` | 64K/128K | null | null | null | null | null | null |

What each flag controls:

- **`subagents`** — the backend can spawn additional agent processes (e.g. via the Agent tool in Claude Code). GRD uses this to determine whether multi-agent plans are safe to dispatch.
- **`parallel`** — the backend supports dispatching multiple agents in parallel within a session. GRD's parallelization feature checks this before batching plan execution.
- **`teams`** — supports Claude Code-style "teams" where multiple role-specialized subagents collaborate. Used by `use_teams` config and `grd-executor`'s team dispatch path.
- **`hooks`** — supports Claude Code-style event hooks (pre/post tool, stop, notification). GRD installs hooks for scan, code review, and progress tracking when this is true.
- **`mcp`** — supports MCP (Model Context Protocol) servers. GRD assumes MCP tools like context-mode and web-mcp are available only when this is true.
- **`native_worktree_isolation`** — the backend handles git worktree isolation natively. When true, GRD can use git worktrees for branch-per-phase isolation without extra plumbing.
- **`effort`** — the backend accepts an `/effort` or `--effort` setting (Claude Code v2.1.68+). GRD reads `EFFORT_PROFILES` in `lib/backend.ts` to set per-agent effort levels; only applied when this is true.
- **`http_hooks`** — supports HTTP-triggered hooks. Allows external webhooks to interact with the backend session.
- **`cron`** — built-in cron scheduling in the backend.
- **`smart_approvals`** — code review requests are routed through a guardian subagent before applying changes (Codex-specific).
- **`plan_mode`** — the backend runs in plan-first mode by default (Gemini v0.34+). GRD may need to explicitly confirm before execution proceeds.
- **`sandbox_gvisor`** — gVisor sandboxing available (Gemini). LXC sandboxing (`sandbox_lxc`) is not yet supported by any backend.
- **`mcp_elicitation`** — supports interactive MCP prompts that request additional information from the user mid-session.
- **`model_overrides`** — the backend accepts a `--model` flag. When false, the model argument is omitted from `buildArgs`.
- **`max_output_tokens`** — token output limit. Claude reports `{ default: 64000, upper_bound: 128000 }`; all other backends return `null` (no documented limit).

`getBackendCapabilities(backend)` in `lib/backend.ts` returns the flags for a known backend, or a minimal safe set (all false except `subagents: true`) for unknown backends.

---

## 5. Model Resolution

GRD uses three abstract **model tiers** — `opus`, `sonnet`, `haiku` — that map to different concrete model names per backend.

### Step 1: tier from `MODEL_PROFILES`

`MODEL_PROFILES` in `lib/utils.ts` maps each GRD agent type to a tier per configuration profile:

```typescript
const MODEL_PROFILES: AgentModelProfiles = {
  'grd-planner':  { quality: 'opus', balanced: 'opus', budget: 'sonnet' },
  'grd-executor': { quality: 'opus', balanced: 'sonnet', budget: 'sonnet' },
  'grd-verifier': { quality: 'sonnet', balanced: 'sonnet', budget: 'haiku' },
  // ... 18 agents total
};
```

### Step 2: tier to concrete model via `resolveBackendModel`

`resolveBackendModel(backend, tier, config?, cwd?)` in `lib/backend.ts` resolves a tier to a concrete model name using a three-level priority:

1. **User override** — `config.backend_models[backend][tier]` in `.planning/config.json`.
2. **Dynamic detection** — for OpenCode only, runs `opencode models` and caches the result for 5 minutes.
3. **Built-in defaults** — `DEFAULT_BACKEND_MODELS` in `lib/backend.ts`:

```typescript
const DEFAULT_BACKEND_MODELS = {
  claude:    { opus: 'opus',              sonnet: 'sonnet',              haiku: 'haiku' },
  codex:     { opus: 'gpt-5.4',           sonnet: 'gpt-5.3-codex-spark', haiku: 'gpt-5.4-mini' },
  gemini:    { opus: 'gemini-3.1-pro',    sonnet: 'gemini-3.1-flash',    haiku: 'gemini-3.1-flash-lite' },
  opencode:  { opus: 'anthropic/claude-opus-4-6', sonnet: 'anthropic/claude-sonnet-4-6', haiku: 'anthropic/claude-haiku-4-5' },
  overstory: { opus: 'opus',              sonnet: 'sonnet',              haiku: 'haiku' },
};
```

### Step 3: wiring it together via `resolveModelForAgent`

`resolveModelForAgent(config, agentType, cwd?, options?)` in `lib/utils.ts` is the single call site used across the codebase:

```typescript
function resolveModelForAgent(
  config: GrdConfig,
  agentType: string,
  cwd?: string,
  options?: { effectiveTierOverride?: ModelTier }
): string
```

- Looks up the base tier from `MODEL_PROFILES` using `config.model_profile`.
- When `options.effectiveTierOverride` is set (Spec 4 adaptive routing), that tier replaces the lookup.
- When `cwd` is provided, calls `detectBackend(cwd)` then `resolveBackendModel(backend, tier, config, cwd)` to get a backend-specific model name.
- Without `cwd`, returns the abstract tier string (backward-compatible).

### Effort levels

`EFFORT_PROFILES` in `lib/backend.ts` parallels `MODEL_PROFILES` but for the `effort` dimension (`low`/`medium`/`high`). `resolveEffortLevel(agentType, profile)` reads the table. `resolveEffortForAgent(config, agentType, cwd?)` in `lib/utils.ts` checks `caps.effort` before returning a value — returns `null` when the detected backend does not support effort.

---

## 6. Account Rotation

When `superpowers.account_rotation: true`, the scheduler distributes load across multiple named accounts of the same backend. Configuration lives in `.planning/config.json` under `superpowers`:

```json
{
  "superpowers": {
    "default_backend": "claude",
    "account_rotation": true,
    "accounts": {
      "claude": [
        { "config_dir": "/Users/alice/.claude-work" },
        { "config_dir": "/Users/alice/.claude-personal" }
      ],
      "codex": [
        { "config_dir": "/Users/alice/.codex-main" }
      ]
    }
  }
}
```

**Isolation mechanism** — each account entry provides a `config_dir`. At spawn time the scheduler sets `ENV_VAR_MAP[backend]` (e.g. `CLAUDE_CONFIG_DIR`) to that directory, so the CLI subprocess loads credentials from the specified location rather than its default. This avoids any shared global state between accounts. The map is:

```typescript
export const ENV_VAR_MAP: Record<AdapterBackendId, string> = {
  claude:    'CLAUDE_CONFIG_DIR',
  codex:     'CODEX_HOME',
  gemini:    'GEMINI_CLI_HOME',
  opencode:  'OPENCODE_CONFIG_DIR',
  overstory: 'OVERSTORY_HOME',
};
```

**`resolveAccount`** (`lib/scheduler.ts`) selects the next account:

1. Walks `schedulerConfig.backend_priority` in order.
2. Within each backend, iterates over configured accounts.
3. Returns the first account whose state key has headroom (estimated remaining capacity > `safety_margin_tasks`).
4. If all priority accounts are exhausted, returns `schedulerConfig.free_fallback` (which is typically a high-quota or rate-unlimited fallback account).

The compound state key format is `"<backend>/<config_dir>"`, e.g. `"claude/~/.claude-personal"`.

---

## 7. Rate-Limit Handling Per Backend

Rate-limit detection is per-adapter in `lib/scheduler.ts`. When `isRateLimited` returns `true`, `_spawnWithRetry` increments the retry counter and calls `resolveAccount` again to pick a different account.

| Backend | `isRateLimited` pattern |
|---------|------------------------|
| `claude` | Exit code non-zero AND `/rate.limit\|429\|overloaded_error\|too many requests/i` in stderr |
| `codex` | `/rate.limit\|429\|rate_limit_exceeded/i` in stderr (exit code ignored) |
| `gemini` | `/rate.limit\|429\|RESOURCE_EXHAUSTED\|quota/i` in stderr |
| `opencode` | `/rate.limit\|429\|too many requests\|quota/i` in stderr |
| `overstory` | `/rate.limit\|429\|quota/i` in stderr |

Claude is the only adapter that checks the exit code before scanning stderr. For all other adapters the exit code is unused (`_exitCode` parameter prefix).

The retry loop is bounded by `maxRetries`, which equals the total number of configured accounts across all priority backends (or the number of backends when account rotation is disabled). After exhaustion the scheduler falls through to the `free_fallback` backend. When Spec 2A is active (`max_wait_minutes > 0`), the scheduler additionally computes the soonest account-recovery time and sleeps rather than immediately falling back.

---

## 8. Adding a New Backend

Follow these steps to integrate a new AI CLI backend:

1. **`lib/types.ts` — extend `BackendId`**

   ```typescript
   export type BackendId =
     | 'claude' | 'codex' | 'gemini' | 'opencode' | 'overstory'
     | 'superpowers' | 'grd'
     | 'mynewbackend';  // add here
   ```

   If the backend is a real CLI (not a meta-backend), also add it to `AdapterBackendId` by removing it from any exclusion list, or simply add it to `BackendId` — `AdapterBackendId` is derived as `Exclude<BackendId, MetaBackendId>` so it picks it up automatically.

2. **`lib/scheduler.ts` — implement the adapter**

   Add an entry to `ADAPTERS`:

   ```typescript
   mynewbackend: {
     binary: 'mynewbackend-cli',
     buildArgs(prompt: string, opts: SpawnOpts): string[] {
       const args = ['--prompt', prompt];
       if (opts.model) args.push('--model', opts.model);
       return args;
     },
     parseTokenUsage(stderr: string): number | null {
       const match = stderr.match(/tokens_used:\s*(\d+)/);
       return match ? parseInt(match[1], 10) : null;
     },
     isRateLimited(_exitCode: number, stderr: string): boolean {
       return /rate.limit|429/i.test(stderr);
     },
   },
   ```

   Also add to `ENV_VAR_MAP` if the backend uses an environment variable for its config directory.

3. **`lib/backend.ts` — register capabilities and model defaults**

   Add an entry to `VALID_BACKENDS`, `DEFAULT_BACKEND_MODELS`, and `BACKEND_CAPABILITIES`. Use the existing entries as templates. Set unknown flags to `false` and `max_output_tokens` to `null` until confirmed.

4. **`lib/backend.ts` — update detection waterfall**

   In `detectBackend(cwd)`:
   - Add an env-var check (step 2) and a filesystem-clue check (step 3) for the new backend.
   - Update `DISPATCHABLE_BACKENDS` if the backend should be probed by `detectAvailableBackends`.
   - Add its config-dir env var to `BACKEND_CONFIG_ENV` and its auth marker files to `BACKEND_AUTH_MARKERS`.

5. **`lib/utils.ts` — add model profiles**

   Add a tier entry per GRD agent in `MODEL_PROFILES`, e.g.:
   ```typescript
   'grd-executor': { quality: 'opus', balanced: 'sonnet', budget: 'sonnet' },
   ```
   (Existing entries already cover all agents; only add a new entry if a new agent is introduced.)

6. **`lib/backend.ts` — add effort profiles** (optional)

   If the new backend supports the `effort` capability, add entries to `EFFORT_PROFILES`. Otherwise the backend's `effort` flag should be `false` and GRD will pass `null` to callers.

7. **Tests — `tests/unit/backend.test.ts`** and **`tests/unit/scheduler.test.ts`**

   Add unit tests covering:
   - `detectBackend` returning the new ID when its env vars or filesystem clues are present.
   - `resolveBackendModel` using the correct default models.
   - `getBackendCapabilities` returning the declared flags.
   - The adapter's `buildArgs`, `parseTokenUsage`, and `isRateLimited` with representative fixtures.

8. **Update `CLAUDE.md`** — add a row to the Backend Capabilities table and a "Backend-Specific Notes" section for any quirks.

---

## 9. Known Quirks Per Backend

### Claude Code (v2.1.71+)
- Only backend where `isRateLimited` checks the exit code before scanning stderr.
- Uses `--dangerously-skip-permissions` to allow filesystem writes in non-interactive mode.
- `--output-format json` makes stdout machine-parseable; other backends use plain text.
- `effort` frontmatter field requires v2.1.68+; `/effort` slash command requires v2.1.76+.
- `max_output_tokens` has a hard default of 64 K, extendable to 128 K.

### Codex CLI (v0.115.0+)
- `smart_approvals: true` — code review requests route through a guardian subagent before applying changes.
- `CODEX_THREAD_ID` is kept for backward compatibility; may be deprecated in newer versions.
- Realtime websocket sessions and filesystem RPC are available but not currently used by GRD.
- No `effort` or `http_hooks` support.

### Gemini CLI (v0.31–v0.34)
- `plan_mode: true` since v0.34 — the CLI enters a plan-first execution mode by default.
- gVisor sandboxing available (`sandbox_gvisor: true`); LXC not yet supported.
- `RESOURCE_EXHAUSTED` and `quota` are Gemini-specific rate-limit signals added to `isRateLimited`.
- A2A agent timeout increased to 30 minutes in recent versions.
- No `teams`, `effort`, `http_hooks`, or `mcp_elicitation` support.

### OpenCode (v1.2.25–v1.2.27)
- Provider-agnostic: model names use `provider/model` format (e.g. `anthropic/claude-opus-4-6`).
- Only backend with dynamic model detection: `opencode models` is run at startup and cached for 5 minutes.
- v1.2.27 fixed lost sessions across worktrees and orphan branches — directly relevant to GRD's worktree isolation mode.
- 5-minute chunk timeout (increased from 2 minutes in earlier versions).
- Multi-account workspace authentication and non-OpenAI Azure completions endpoint support.
- `OPENCODE_PID` is NOT used for detection — it is a process management variable, not a presence indicator.

### Overstory
- Binary is `ov` (not `overstory`).
- `native_worktree_isolation: true` — handles worktree isolation natively, same as Claude Code.
- Does not support `hooks`, `effort`, `http_hooks`, `cron`, `smart_approvals`, `plan_mode`, or `mcp_elicitation`.

---

## Cross-References

- [OVERVIEW.md](OVERVIEW.md) — system-level architecture and module map
- [API.md](API.md) — exported functions and types
- [CONFIG.md](CONFIG.md) — `.planning/config.json` schema and all configuration keys
- [FLOWS.md](FLOWS.md) — end-to-end execution flows (autopilot, phase execution, teams)
- [MAINTENANCE.md](MAINTENANCE.md) — testing approach, coverage thresholds, evolve iteration notes
