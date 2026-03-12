# Overstory Execution Backend for GRD

**Date:** 2026-03-13
**Status:** Approved
**Approach:** Overstory as a fifth BackendId (Approach A)

## Summary

Add Overstory as a first-class execution backend in GRD. When configured, GRD's `execute-phase` dispatches plans to Overstory workers via `ov sling` instead of Claude Code's native Agent Teams. Overstory owns agent spawning, worktree isolation, merge resolution, and health monitoring. GRD owns planning, research, and evaluation.

## Motivation

Overstory is a multi-agent orchestration framework that spawns AI agents via tmux + git worktrees with inter-agent messaging, merge queues, and health monitoring. It supports pluggable runtime adapters (Claude Code, Codex, Pi, Copilot, Cursor, etc.) and scales to 25 concurrent agents — well beyond Claude Code's 3-teammate limit.

Integrating Overstory as a GRD backend lets users leverage Overstory's execution infrastructure while keeping GRD's planning, research, and evaluation workflows intact.

## Section 1: Backend Registration & Detection

### New BackendId

`'overstory'` added to the `BackendId` union type and all lookup tables.

### Detection Waterfall

Overstory detection slots into the existing `detectBackend()` waterfall:

1. **Config override** (no change needed): `"backend": "overstory"` works automatically once `'overstory'` is in `VALID_BACKENDS`
2. **Env var detection** (new, before Claude check): `OVERSTORY_HOME` or `OVERSTORY_SESSION` present → return `'overstory'`
3. **Filesystem detection** (new, before Claude check): `.overstory/config.yaml` exists in project root → return `'overstory'`
4. Falls through to existing Claude/Codex/Gemini/OpenCode checks

Note: Env var and filesystem detection of Overstory are placed *before* the existing Claude Code env var check so that Overstory takes priority when both are present (the user is running inside Claude Code but wants Overstory to handle execution). Auto-install is **not** triggered by env var or filesystem detection — only by explicit `"backend": "overstory"` in config.

### Capability Flags

```typescript
overstory: {
  subagents: true,
  parallel: true,
  teams: true,                    // ov sling = team dispatch
  hooks: false,                   // Overstory has its own hook system
  mcp: true,
  native_worktree_isolation: true, // Overstory manages worktrees
  effort: false,                  // effort is a Claude Code feature
  http_hooks: false,
  cron: false,
}
```

### Model Tier Mapping

Overstory's `config.yaml` has its own model routing. GRD maps tiers abstractly:

```typescript
overstory: {
  opus: 'opus',
  sonnet: 'sonnet',
  haiku: 'haiku',
}
```

Overstory's runtime adapter (claude, codex, etc.) handles final model resolution.

## Section 2: Overstory Adapter Module (`lib/overstory.ts`)

New module wrapping `ov` CLI interactions, following the same pattern as `lib/worktree.ts`.

### Minimum Overstory Version

Requires Overstory **v0.8.0+** (first version with stable `--json` output on `ov status` and `ov mail`). On detection, GRD runs `ov --version` and warns if below minimum.

### Type Definitions

```typescript
/** Result of detectOverstory() — describes the local Overstory installation. */
interface OverstoryInfo {
  available: boolean;
  version: string;              // semver from `ov --version`
  config_path: string;          // absolute path to .overstory/config.yaml
  max_agents: number;           // from config agents.max_concurrent
  default_runtime: string;      // from config runtime.default
  worktree_base: string;        // from config worktrees.base_dir
}

/** Options for slingPlan() — everything needed to dispatch a plan to an Overstory worker. */
interface SlingOpts {
  plan_path: string;            // absolute path to the PLAN.md file
  overlay_path: string;         // absolute path to the generated overlay file
  runtime: string;              // overstory runtime adapter name (e.g. 'claude', 'codex')
  model: string;                // model tier or name passed to --model
  phase_number: string;         // GRD phase number (for naming)
  plan_id: string;              // GRD plan id e.g. '03-02' (for naming)
  milestone: string;            // milestone version (for branch naming)
  timeout_minutes: number;      // max execution time before ov stop
}

/** Result from ov sling — identifies the spawned agent. */
interface SlingResult {
  agent_id: string;             // unique agent identifier from Overstory
  worktree_path: string;        // absolute path to the agent's worktree
  branch: string;               // git branch name created
  tmux_session: string;         // tmux session name for the agent
  runtime: string;              // runtime adapter used
}

/** Status of a single Overstory agent. */
interface AgentStatus {
  agent_id: string;
  state: 'pending' | 'running' | 'done' | 'failed' | 'stopped';
  exit_code: number | null;     // null while running
  duration_ms: number;          // elapsed time
  worktree_path: string;
  branch: string;
  runtime: string;
  model: string;
}

/** Bulk fleet status from ov status --json. */
interface FleetStatus {
  agents: AgentStatus[];
  active_count: number;
  completed_count: number;
  failed_count: number;
}

/** Result of mergeAgent() — branch integration outcome. */
interface MergeResult {
  merged: boolean;              // true if merge succeeded
  conflicts: string[];          // conflicting file paths (empty on success)
  branch: string;               // branch that was merged
  commit_sha: string | null;    // merge commit SHA, null on conflict
  error: string | null;         // error message if merge failed for non-conflict reason
}

/** Overstory-specific config from .planning/config.json overstory section. */
interface OverstoryConfig {
  runtime: string;              // default: 'claude'
  install_prompt: boolean;      // default: true
  poll_interval_ms: number;     // default: 5000
  merge_strategy: 'auto' | 'manual';  // default: 'auto'
  overlay_template: string | null;     // default: null
}
```

### `ov` CLI Contract

GRD shells out to these `ov` commands. All JSON outputs are parsed from stdout.

| Command | Purpose | Expected JSON shape |
|---------|---------|-------------------|
| `ov --version` | Version check | Raw semver string on stdout |
| `ov sling "<objective>" --runtime <rt> --model <m> --overlay <path>` | Spawn worker | `SlingResult` shape |
| `ov status --json` | Fleet status | `FleetStatus` shape |
| `ov status <agent-id> --json` | Single agent status | `AgentStatus` shape |
| `ov merge <agent-id>` | Merge agent branch | `MergeResult` shape |
| `ov mail --agent <agent-id> --json` | Read agent mail | `{ messages: Array<{ type: string, body: string, ts: number }> }` |
| `ov nudge <agent-id> "<message>"` | Send message to agent | `{ ok: boolean }` |
| `ov stop <agent-id>` | Stop agent | `{ ok: boolean }` |
| `ov init` | Initialize .overstory/ in project | No JSON output; creates .overstory/ directory |

### Core Functions

```typescript
// Detection — checks ov CLI on PATH, version, .overstory/config.yaml
detectOverstory(cwd: string): OverstoryInfo | null

// Plan dispatch — generates overlay, shells out to ov sling
slingPlan(cwd: string, opts: SlingOpts): SlingResult

// Status polling — single agent
getAgentStatus(cwd: string, agentId: string): AgentStatus

// Bulk status for wave monitoring
getFleetStatus(cwd: string): FleetStatus

// Merge completed work via Overstory's merge queue
mergeAgent(cwd: string, agentId: string): MergeResult

// Cleanup
stopAgent(cwd: string, agentId: string): void
```

### Overlay Generation

When dispatching a plan, GRD writes a temporary overlay file to `.planning/.tmp/overlay-{phase}-{plan}.md`. The file contains:

- The PLAN.md content (objective, tasks, verification criteria)
- GRD conventions (SUMMARY.md format, commit message style, naming: `{NN}-{MM}-SUMMARY.md`)
- Phase context (milestone, phase number, plan number)
- File scope constraints from the plan
- Instruction to write SUMMARY.md at `{phase_dir}/{NN}-{MM}-SUMMARY.md` within the worktree

Overstory receives the overlay path via `--overlay` flag. Overstory's `deployConfig()` deploys it into the worktree's instruction file — the target path (`.claude/CLAUDE.md`, `AGENTS.md`, etc.) is determined by Overstory's runtime adapter, not GRD.

Overlay files are cleaned up after wave completion (success or failure). On GRD crash, stale overlays in `.planning/.tmp/` are cleaned on next `execute-phase` invocation.

### Auto-Install Flow

When `detectOverstory()` finds `ov` is not on PATH and user has configured overstory backend:

1. Check if `bun` is available (Overstory requires Bun)
2. If no `bun` → error: "Overstory requires Bun. Install via: `curl -fsSL https://bun.sh/install | bash`"
3. If `bun` available → prompt: "Overstory CLI not found. Install it now? (`bun install -g overstory`)"
4. On confirm → run `bun install -g overstory`, then `ov init` in the project root
5. On decline → fall back to native execution with warning

Install only triggers when user explicitly configures `"backend": "overstory"`. Filesystem detection (`.overstory/config.yaml`) does not trigger install.

### Error Handling

- `ov` not on PATH (no explicit config) → fall back to sequential execution with warning
- `ov sling` fails → mark plan as failed, continue wave
- Agent timeout → `ov stop` + record in SUMMARY.md

## Section 3: Execution Flow

When backend is `overstory`, `execute-phase` routes through `ov sling` instead of Claude Code Agent Teams.

### Wave Execution Loop

```
For each wave in phase:
  1. Collect plans in this wave
  2. For each plan (up to Overstory's max_agents):
     - Generate overlay from PLAN.md content
     - Write overlay to .planning/.tmp/overlay-{phase}-{plan}.md
     - ov sling "<plan objective>" --runtime <runtime> --model <tier> --overlay <path>
     - Record agent_id -> plan mapping
  3. Poll loop: getFleetStatus() every poll_interval_ms
     - When agent completes:
       a. Copy SUMMARY.md from worktree to .planning/ phase dir (BEFORE merge)
       b. mergeAgent() to integrate code branch
       c. If merge conflicts: log to SUMMARY.md, continue wave
  4. When all agents in wave complete:
     - Clean up overlay files for this wave
     - Proceed to next wave
  5. Code review (if timing=per_wave): run as normal
```

**Critical ordering:** SUMMARY.md is copied from the worktree *before* `mergeAgent()` runs, since the merge may modify or remove the worktree. This ensures GRD always captures the execution record regardless of merge outcome.

### Differences from Native Team Execution

| Aspect | Claude Code Teams | Overstory |
|--------|------------------|-----------|
| Agent spawn | `TaskCreate` + `isolation: "worktree"` | `ov sling` |
| Status monitoring | `TaskList` polling | `ov status --json` polling |
| Checkpoints | `SendMessage` | `ov mail` + `ov nudge` |
| Merge | GRD `worktree merge` | `ov merge` (FIFO queue) |
| Concurrency limit | `max_concurrent_teammates` (default 3) | `.overstory/config.yaml` `max_concurrent` (default 25) |
| Worktree management | Claude Code native or GRD manual | Overstory manages entirely |

### SUMMARY.md Handoff

The overlay instructs the Overstory worker to write SUMMARY.md matching GRD's `{NN}-{MM}-SUMMARY.md` naming convention. After merge, GRD verifies the summary exists in the phase dir and parses it with `summary-extract`.

### Checkpoint Protocol

Overstory workers use Overstory's SQLite mail system instead of Claude Code's `SendMessage`:

- Worker writes checkpoint to `.overstory/mail/` via mail system
- GRD polls `ov mail --agent <id> --json` during status loop
- If checkpoint requires human input, GRD surfaces it and responds via `ov nudge <agent-id> "<response>"`

## Section 4: Config Schema

### `.planning/config.json` Additions

```json
{
  "backend": "overstory",
  "overstory": {
    "runtime": "claude",
    "install_prompt": true,
    "poll_interval_ms": 5000,
    "merge_strategy": "auto",
    "overlay_template": null
  }
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `runtime` | string | `"claude"` | Overstory runtime adapter for workers |
| `install_prompt` | boolean | `true` | Offer auto-install when `ov` not found |
| `poll_interval_ms` | number | `5000` | Status polling frequency during wave execution |
| `merge_strategy` | string | `"auto"` | `"auto"` (FIFO queue) or `"manual"` (prompt per agent) |
| `overlay_template` | string\|null | `null` | Custom overlay template path; null uses built-in |

### `/grd:settings overstory` Subcommand

- `overstory runtime <name>` — set worker runtime
- `overstory merge auto|manual` — set merge strategy
- `overstory poll <ms>` — set poll interval

### Interaction with Existing Config

When `backend: "overstory"`:

- `use_teams` — ignored (Overstory is the team engine)
- `max_concurrent_teammates` — ignored (from `.overstory/config.yaml`)
- `branching_strategy` — ignored for worktree creation (Overstory manages branches) but used for branch naming in overlay
- `team_timeout_minutes` — still applies; GRD runs `ov stop` on agents exceeding it

## Section 5: Files to Create/Modify

### New Files

| File | Purpose |
|------|---------|
| `lib/overstory.ts` | Adapter module: detection, sling, status, merge, install |
| `tests/unit/overstory.test.ts` | Unit tests for all adapter functions |

### Modified Files

| File | Change |
|------|--------|
| `lib/types.ts` | Add `'overstory'` to `BackendId`. Add `OverstoryConfig`, `SlingOpts`, `SlingResult`, `AgentStatus`, `FleetStatus`, `MergeResult` interfaces |
| `lib/backend.ts` | Add `overstory` to `VALID_BACKENDS`, `DEFAULT_BACKEND_MODELS`, `BACKEND_CAPABILITIES`. Add detection to waterfall |
| `lib/context/execute.ts` | Emit `overstory_available`, `overstory_runtime`, `overstory_config` fields when backend is overstory |
| `lib/parallel.ts` | Set `mode: 'parallel'` for overstory. Skip worktree path pre-computation |
| `commands/execute-phase.md` | Add overstory execution branch: sling/poll/merge loop |
| `commands/settings.md` | Add `overstory` subcommand |
| `bin/grd-tools.ts` | Register `overstory` CLI subcommands (detect, install) |
| `tests/unit/backend.test.ts` | Add overstory detection and capability tests |

### Not Modified

- `lib/worktree.ts` — Overstory manages its own worktrees
- `lib/autopilot.ts` — Calls execute-phase, which handles routing internally
- `agents/*.md` — Workers receive plans via overlay, not agent definitions
