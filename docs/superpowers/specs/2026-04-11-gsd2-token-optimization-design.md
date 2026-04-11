---
milestone: gsd-2-selective-adoption
spec: 4 of 4
status: approved
date: 2026-04-11
owner: cameleon-x
---

# Token optimization system — profile, complexity routing, budget pressure

## Milestone context

Final spec in the `gsd-2-selective-adoption` milestone. Specs 1, 2A, and 3 are complete and merged to `main`:

- Spec 1 (commit `0ced37d`): Prompt injection scanner
- Spec 2A (commit `9153052`): Autopilot rate-limit hang fix
- Spec 3 (commit `02e9d5e`): Mechanical phase completion

This spec adds proactive token-cost reduction: rather than wait for rate-limit exhaustion (Spec 2A), it reduces token usage *before* hitting the wall by routing simpler tasks to cheaper models when budget pressure is detected.

## Problem

### What Spec 2A fixed and what it didn't

Spec 2A's `waitUntilOrAbort` + `computeSoonestRecovery` eliminates hang-at-rate-limit: autopilot now bounds-waits for sample aging instead of failing silently. That's a reactive fix — it makes GRD survive rate-limit exhaustion gracefully.

What Spec 2A does NOT do: prevent reaching the rate limit in the first place. GRD still runs every agent at its configured `model_profile` tier (opus for planners, sonnet for executors, etc.) regardless of how tight the token budget is. A 10-hour autopilot run on a tight budget will consume the same tokens as a fresh-budget run, just with more waits. The user still pays for opus-level output on tasks that would be perfectly served by sonnet.

### The three missing pieces

1. **No distinction between "model quality preference" and "token budget awareness."** The existing `model_profile: 'quality' | 'balanced' | 'budget'` controls global model tier selection. There is no separate knob for "how aggressively should I conserve tokens." A user who wants `quality` output but also wants automatic token conservation under pressure has no way to express that today.

2. **No task-level complexity awareness.** Every agent invocation uses the same profile tier regardless of the actual work involved. A `grd-verifier` that's checking a 10-line patch gets the same effort/model as one verifying a 500-line refactor. The scheduler has no mechanism to distinguish "this task is simple, use haiku" from "this task is hard, use opus."

3. **No budget pressure detection or adaptive behavior.** `_hasHeadroom` returns a binary yes/no, not a continuous pressure signal. The scheduler has no concept of "budget is getting tight — start conserving." It either lets every spawn through at full cost or blocks them entirely.

## Goals

1. **Introduce a new `token_profile` preference** in `.planning/config.json`, orthogonal to `model_profile`. Values: `frugal`, `balanced`, `quality`. Default: `balanced`. `model_profile` keeps its existing three-tier semantics (controls baseline model tier); `token_profile` controls *adaptive* behavior — how aggressively the system downgrades when budget or complexity suggests it's worth doing.

2. **Add a complexity-estimation module** `lib/complexity.ts` with a pure function `estimateComplexity(opts): ComplexityLevel` that takes an agent type, optional prompt, optional plan metadata, and optional scheduler sample history, and returns `'low' | 'medium' | 'high'`. Uses a combination of: agent baseline (from a new `AGENT_BASELINE_COMPLEXITY` table), prompt length heuristic, recent sample tail average. Does NOT read the filesystem — inputs are pre-gathered by the caller.

3. **Add budget pressure detection** `isBudgetPressured(scheduler)` and `computeBudgetPressureLevel(scheduler): BudgetPressureLevel` in `lib/scheduler.ts`. Reads live scheduler state (samples, budget, consumed) and classifies pressure as `'none'`, `'warning'` (≥60% consumed), `'high'` (≥80% consumed), or `'critical'` (≥95% consumed). Configurable thresholds in `SchedulerConfig.budget_pressure_thresholds`.

4. **Add adaptive routing** `computeEffectiveModelTier(opts): ModelTier` in `lib/backend.ts`. Pure function that takes the base tier from `MODEL_PROFILES`, the `token_profile`, the budget pressure level, and the complexity estimate, and returns the tier that should actually be used. The decision matrix is explicit (see Architecture section). Returns the base tier unchanged when no adjustment is warranted.

5. **Wire autopilot, evolve, and autoresearch** to call `estimateComplexity` + `computeEffectiveModelTier` before `resolveModelForAgent`, so dispatched agents use the adaptive tier rather than the static profile tier.

6. **Add a CLI setting** `gd settings token_profile frugal|balanced|quality` that persists to `.planning/config.json`.

7. **Log pressure transitions.** When pressure level crosses a threshold (e.g., `none → warning`, `warning → high`), log a single `[scheduler] budget pressure detected — profile=balanced, pressure=high, downgrading grd-planner from opus to sonnet` line via `process.stderr.write`. Do not log on every spawn — only on level transitions per session.

8. **Ship with tests:** unit tests for `estimateComplexity`, `isBudgetPressured`, `computeBudgetPressureLevel`, `computeEffectiveModelTier` (the four new pure functions), and an integration test confirming autopilot passes through the new code path.

## Non-goals

- **Per-agent frontmatter hints.** Agent markdown files get no new frontmatter fields. Complexity estimation is table-driven (`AGENT_BASELINE_COMPLEXITY` in code) plus runtime heuristics. Adding frontmatter would require curating 20+ agent definitions; the table is simpler and change-friendly.
- **Configurable complexity thresholds.** The `estimateComplexity` heuristics (prompt length cutoffs, sample tail lookback) use hardcoded defaults. Users can set `token_profile` but not tune individual heuristics. If a specific heuristic proves miscalibrated in practice, a follow-up spec can expose it.
- **Non-critical spawn rejection at 95% pressure.** The 95% `critical` level logs a warning but does NOT block spawns. Rejecting spawns is a behavior change that risks breaking autopilot runs mid-phase; we defer it to a follow-up spec pending observation of whether the softer downgrade-under-pressure approach suffices.
- **Changes to `MODEL_PROFILES` or `EFFORT_PROFILES`.** Those tables stay as-is. The new logic is additive — it picks a tier from the existing profile tables, then optionally downgrades.
- **Persisting pressure history to disk.** Pressure is computed fresh per spawn from live scheduler state. No new files in `.planning/scheduler-state.json`.
- **Changing the scheduler's retry/wait logic** from Spec 2A. That stays exactly as-is.
- **Adding new backend capability flags.** No changes to `BACKEND_CAPABILITIES`.
- **Splitting `lib/scheduler.ts` or `lib/backend.ts`.** The new functions are added to existing files.
- **Validating `token_profile` in schema migration tools.** Existing `gd settings` validation patterns apply; no custom migration logic.

## Architecture

### Overview

Three new pure functions + one new config field + one new scheduler helper + wire-up at three call sites. The core insight is that all the new logic is *pure* — it takes data as arguments and returns a decision. No I/O, no subprocess spawning, no file reads. This makes the entire spec unit-testable without mocks, and the integration points are single call-site additions.

```
                    +------------------+
                    | token_profile    |
                    | (config.json)    |
                    +--------+---------+
                             |
                             v
+--------------+    +---------------+    +------------------+    +--------------+
| agent type   |--->| estimate-     |    | computeBudget-   |    | scheduler    |
| + prompt     |    | Complexity    |    | PressureLevel    |<---| state        |
| + sample hist|    | (lib/complex..|    | (lib/scheduler)  |    |              |
+--------------+    +-------+-------+    +--------+---------+    +--------------+
                            |                     |
                            v                     v
                  +----------------------------------------+
                  | computeEffectiveModelTier(              |
                  |   baseTier, token_profile, pressure,   |
                  |   complexity                             |
                  | )                                       |
                  +----------+------------------------------+
                             |
                             v
                  +----------------------+
                  | effective tier       |
                  | (opus/sonnet/haiku)  |
                  +----------------------+
                             |
                             v
                  +----------------------+
                  | resolveBackendModel  |
                  | → actual model name  |
                  +----------------------+
```

No changes to:
- `scheduler.spawn` signature (`prompt, opts` stays the same)
- `_spawnWithRetry` wait-branch (Spec 2A untouched)
- `resolveAccount` / `pickBackend` / `_hasHeadroom` / `computeSoonestRecovery` / `_anyPriorityHasHeadroom`
- `MODEL_PROFILES`, `EFFORT_PROFILES`, `BACKEND_CAPABILITIES`
- Agent markdown files
- `.planning/scheduler-state.json` schema

Changes:
- New file `lib/complexity.ts` with `estimateComplexity` and `AGENT_BASELINE_COMPLEXITY`
- `lib/scheduler.ts` gains `isBudgetPressured`, `computeBudgetPressureLevel`, and a session-level pressure-level tracker for log-on-transition behavior
- `lib/backend.ts` gains `computeEffectiveModelTier`
- `lib/types.ts` gains `TokenProfileName`, `BudgetPressureLevel`, `ComplexityLevel`, `BudgetPressureThresholds`, and extends `GrdConfig` with `token_profile?: TokenProfileName` and `SchedulerConfig` with `budget_pressure_thresholds?: BudgetPressureThresholds`
- `lib/utils.ts` `resolveModelForAgent` gains an optional `effectiveProfileOverride` parameter so callers can pass a pre-computed effective tier
- `lib/autopilot.ts`, `lib/evolve.ts`, `lib/autoresearch.ts` add the 3-function chain before each agent dispatch
- `bin/grd-tools.ts` `gd settings` supports `token_profile` as a new settable key
- 4 new test files + 1 integration test

### File structure

**New files:**

```
lib/complexity.ts                        # estimateComplexity + AGENT_BASELINE_COMPLEXITY
tests/unit/complexity.test.ts            # estimateComplexity tests
tests/unit/scheduler-pressure.test.ts    # isBudgetPressured + computeBudgetPressureLevel tests
tests/unit/backend-effective-tier.test.ts  # computeEffectiveModelTier tests
tests/integration/token-profile.test.ts  # end-to-end profile wiring
```

**Modified files:**

```
lib/scheduler.ts               # +isBudgetPressured, +computeBudgetPressureLevel, +transition log
lib/backend.ts                 # +computeEffectiveModelTier
lib/types.ts                   # +TokenProfileName, +BudgetPressureLevel, +ComplexityLevel, +BudgetPressureThresholds, GrdConfig and SchedulerConfig extensions
lib/utils.ts                   # resolveModelForAgent gains optional effectiveProfileOverride
lib/autopilot.ts               # call estimateComplexity + computeEffectiveModelTier before dispatch
lib/evolve.ts                  # same wire-up
lib/autoresearch.ts            # same wire-up
bin/grd-tools.ts               # gd settings token_profile
jest.config.js                 # per-file thresholds for complexity.ts
CLAUDE.md                      # document token_profile + budget pressure (add short section)
docs/CHANGELOG.md              # Unreleased entry
```

### Module boundaries

- **`lib/complexity.ts`** (new) — one responsibility: given an agent type + optional signals, return a `ComplexityLevel`. Pure function. Does not read files, does not read config. Callers pre-gather the signals. `AGENT_BASELINE_COMPLEXITY` is a constant table mapping agent type to default complexity. ~80 lines.

- **`lib/scheduler.ts`** (modified) — gains two new pure functions (`isBudgetPressured`, `computeBudgetPressureLevel`) and a tiny stateful log-transition helper. The stateful part is a module-level `Map<string, BudgetPressureLevel>` keyed by session/account that records the last-logged level, so repeated calls only log on transitions. Total addition: ~80 lines.

- **`lib/backend.ts`** (modified) — gains `computeEffectiveModelTier`, a pure function that takes `{baseTier, tokenProfile, pressure, complexity}` and returns a possibly-downgraded `ModelTier`. Explicit decision matrix inside, no I/O. ~60 lines.

- **`lib/types.ts`** (modified) — adds four new type aliases and extends two interfaces. No behavior changes, type-only. ~25 lines.

- **`lib/utils.ts`** (modified) — `resolveModelForAgent` gains an optional parameter. Minimally invasive change. Callers that don't pass it get existing behavior.

- **`lib/autopilot.ts`, `lib/evolve.ts`, `lib/autoresearch.ts`** (modified) — each gets a small wire-up block before `resolveModelForAgent` calls. The block: (1) builds the inputs for `estimateComplexity`, (2) calls `computeBudgetPressureLevel` on the scheduler, (3) calls `computeEffectiveModelTier`, (4) passes the effective tier into `resolveModelForAgent` via the new parameter. ~20 lines per file.

- **`bin/grd-tools.ts`** (modified) — `gd settings token_profile frugal|balanced|quality` parses the new value, validates, writes to config.json. Matches the existing pattern for `model_profile`.

## The decision matrix: `computeEffectiveModelTier`

The core routing logic. Given:

- **baseTier**: the tier that `MODEL_PROFILES[agentType][model_profile]` returned (e.g., `'opus'`)
- **tokenProfile**: the user's adaptive preference (`'frugal'`, `'balanced'`, `'quality'`)
- **pressure**: the current budget pressure level (`'none'`, `'warning'`, `'high'`, `'critical'`)
- **complexity**: the estimated task complexity (`'low'`, `'medium'`, `'high'`)

...return the effective tier.

The logic is "how many levels of downgrade to apply, if any":

| tokenProfile | pressure | complexity | downgrade |
|---|---|---|---|
| quality | any | any | 0 (except critical pressure) |
| quality | critical | any | 1 |
| balanced | none | high | 0 |
| balanced | none | medium | 0 |
| balanced | none | low | 1 |
| balanced | warning | high | 0 |
| balanced | warning | medium | 1 |
| balanced | warning | low | 1 |
| balanced | high | high | 0 |
| balanced | high | medium | 1 |
| balanced | high | low | 2 |
| balanced | critical | high | 1 |
| balanced | critical | medium | 2 |
| balanced | critical | low | 2 |
| frugal | none | high | 0 |
| frugal | none | medium | 1 |
| frugal | none | low | 1 |
| frugal | warning | high | 1 |
| frugal | warning | medium | 1 |
| frugal | warning | low | 2 |
| frugal | high | any | 2 |
| frugal | critical | any | 2 |

**Tier downgrade order:** `opus` → `sonnet` → `haiku` → (floor at `haiku`).

Applying a downgrade of 2 to `sonnet` yields `haiku` (not below). Applying any downgrade to `haiku` yields `haiku`. The floor is `haiku` — no further downgrade.

**Key design choice:** the `quality` profile respects the user's explicit "I paid for quality" signal and never downgrades unless pressure is `critical` (≥95%). The `balanced` profile downgrades modestly, favoring "reduce cost when complexity is clearly low." The `frugal` profile aggressively downgrades whenever complexity is less than `high`.

**Why a matrix and not a formula?** The matrix is auditable. A future user reading the code can see the exact decision for every combination. A formula (e.g., `downgrade = f(profile, pressure, complexity)`) obscures edge cases and makes it hard to reason about "why did it pick haiku here."

The function is implemented as a table lookup with an explicit helper:

```typescript
function computeEffectiveModelTier(opts: {
  baseTier: ModelTier;
  tokenProfile: TokenProfileName;
  pressure: BudgetPressureLevel;
  complexity: ComplexityLevel;
}): ModelTier {
  const downgrades = _lookupDowngradeCount(
    opts.tokenProfile,
    opts.pressure,
    opts.complexity,
  );
  return _applyDowngrade(opts.baseTier, downgrades);
}

function _lookupDowngradeCount(
  profile: TokenProfileName,
  pressure: BudgetPressureLevel,
  complexity: ComplexityLevel,
): number {
  // 3x4x3 = 36 entries, each returning 0/1/2
  // Implement as nested switch or explicit table; whichever is more readable
}

function _applyDowngrade(baseTier: ModelTier, count: number): ModelTier {
  const order: ModelTier[] = ['opus', 'sonnet', 'haiku'];
  const baseIndex = order.indexOf(baseTier);
  if (baseIndex === -1) return baseTier;  // unknown tier, passthrough
  const targetIndex = Math.min(baseIndex + count, order.length - 1);
  return order[targetIndex];
}
```

## `estimateComplexity`

The complexity estimator lives in `lib/complexity.ts` as a pure function.

```typescript
export function estimateComplexity(opts: {
  agentType: string;
  promptLength?: number;
  recentSamples?: { duration: number; tokenEstimate: number }[];
}): ComplexityLevel {
  const baseline = AGENT_BASELINE_COMPLEXITY[opts.agentType] || 'medium';

  // Promote to 'high' if prompt is unusually long
  if (opts.promptLength !== undefined && opts.promptLength > 20000) {
    return 'high';
  }

  // Demote from baseline if recent samples for this agent are small
  if (opts.recentSamples && opts.recentSamples.length >= 3) {
    const avgTokens = opts.recentSamples.reduce(
      (sum, s) => sum + s.tokenEstimate, 0,
    ) / opts.recentSamples.length;
    if (baseline === 'high' && avgTokens < 3000) return 'medium';
    if (baseline === 'medium' && avgTokens < 1500) return 'low';
  }

  return baseline;
}

export const AGENT_BASELINE_COMPLEXITY: Record<string, ComplexityLevel> = {
  'grd-planner': 'high',
  'grd-roadmapper': 'high',
  'grd-phase-researcher': 'high',
  'grd-product-owner': 'high',
  'grd-feasibility-analyst': 'high',
  'grd-surveyor': 'high',
  'grd-deep-diver': 'high',
  'grd-executor': 'medium',
  'grd-debugger': 'medium',
  'grd-integration-checker': 'medium',
  'grd-research-synthesizer': 'medium',
  'grd-project-researcher': 'medium',
  'grd-planner-checker': 'medium',
  'grd-migrator': 'medium',
  'grd-eval-planner': 'medium',
  'grd-codebase-mapper': 'low',
  'grd-verifier': 'low',
  'grd-baseline-assessor': 'low',
  'grd-knowledge-miner': 'low',
  'grd-code-reviewer': 'low',
  'grd-eval-reporter': 'low',
};
```

**Rationale for baselines:** The baselines are seeded from the existing `MODEL_PROFILES`'s `quality` column as a proxy. An agent that's assigned `opus` in quality mode is presumed high-complexity; one assigned `sonnet` is medium; one assigned `haiku` or similar is low. This gives a table that aligns with existing intent without requiring new curation.

**The heuristics:**
- Prompt length > 20000 characters → promote to `high` regardless of baseline. A prompt that large is being asked to reason over substantial context.
- Recent sample tail (last N samples) average tokens: if an agent's recent runs have been small (< 3000 for high baseline, < 1500 for medium baseline), demote by one level. This captures "this verifier has been doing small check-ups lately, treat it as low complexity for now."

**What `recentSamples` should contain:** The caller (autopilot) can extract the last 10 samples from the scheduler state for the specific agent type + account. For the first implementation, a simpler approach: use the scheduler's existing EWMA for that agent type's runs. If EWMA is below a threshold, treat as "small." Keep this flexibility open — callers can pass a fully-filtered sample list or an empty array.

## Budget pressure detection

New functions in `lib/scheduler.ts`:

```typescript
export type BudgetPressureLevel = 'none' | 'warning' | 'high' | 'critical';

export interface BudgetPressureThresholds {
  warning: number;   // 0.6 (60%)
  high: number;      // 0.8 (80%)
  critical: number;  // 0.95 (95%)
}

const DEFAULT_PRESSURE_THRESHOLDS: BudgetPressureThresholds = {
  warning: 0.6,
  high: 0.8,
  critical: 0.95,
};

/**
 * Returns true if any priority account has consumed more than the warning
 * threshold (default 60%) of its rolling-window budget. Pure function.
 */
export function isBudgetPressured(
  states: Map<string, BackendUsageState>,
  priority: BackendId[],
  accounts: SuperpowersConfig['accounts'],
  thresholds?: BudgetPressureThresholds,
): boolean {
  return computeBudgetPressureLevel(states, priority, accounts, thresholds) !== 'none';
}

/**
 * Classifies the worst pressure level across all priority accounts.
 * Returns 'none' | 'warning' | 'high' | 'critical'. Pure function.
 *
 * For each priority account, computes `consumed / budget`. Returns the
 * level corresponding to the highest ratio seen across all accounts:
 *   - ratio < warning threshold → 'none'
 *   - warning ≤ ratio < high → 'warning'
 *   - high ≤ ratio < critical → 'high'
 *   - ratio ≥ critical → 'critical'
 */
export function computeBudgetPressureLevel(
  states: Map<string, BackendUsageState>,
  priority: BackendId[],
  accounts: SuperpowersConfig['accounts'],
  thresholds?: BudgetPressureThresholds,
): BudgetPressureLevel {
  const t = thresholds || DEFAULT_PRESSURE_THRESHOLDS;
  let worstRatio = 0;

  for (const backend of priority) {
    const backendAccounts = accounts[backend as AdapterBackendId] || [];
    for (const account of backendAccounts) {
      const stateKey = `${backend}/${account.config_dir}`;
      const state = states.get(stateKey);
      if (!state) continue;
      if (state.token_budget <= 0) continue;
      const ratio =
        (state.tokens_consumed_in_window + state.tokens_reserved) /
        state.token_budget;
      if (ratio > worstRatio) worstRatio = ratio;
    }
  }

  if (worstRatio >= t.critical) return 'critical';
  if (worstRatio >= t.high) return 'high';
  if (worstRatio >= t.warning) return 'warning';
  return 'none';
}
```

**Key design choices:**

- **Worst-across-accounts, not average.** If account A has 10% consumption and account B has 90%, we treat the session as `high` pressure because B is close to the wall. Averaging would hide the imminent exhaustion.
- **Includes `tokens_reserved`.** A concurrent spawn already has tokens reserved; the pressure calculation must include them so we don't miscategorize a pipeline step as low-pressure just because samples haven't been written yet.
- **Configurable thresholds** via `SchedulerConfig.budget_pressure_thresholds`. Default values are 60/80/95. Users who want more aggressive behavior can set warning to 0.4.

### Pressure transition logging

Module-level in `lib/scheduler.ts`:

```typescript
const _lastLoggedPressure: Map<string, BudgetPressureLevel> = new Map();

/**
 * Logs when the pressure level has changed since the last call. Key is
 * a session-stable identifier (typically the process pid + a counter).
 * Safe to call per spawn — only emits a stderr line on transitions.
 */
export function logPressureTransition(
  sessionKey: string,
  current: BudgetPressureLevel,
  agentType: string,
  baseTier: ModelTier,
  effectiveTier: ModelTier,
): void {
  const previous = _lastLoggedPressure.get(sessionKey) || 'none';
  if (previous === current) return;
  _lastLoggedPressure.set(sessionKey, current);

  if (current === 'none') return; // coming back from pressure, no log
  const tierNote =
    baseTier === effectiveTier
      ? ''
      : ` — downgrading ${agentType} from ${baseTier} to ${effectiveTier}`;
  process.stderr.write(
    `[scheduler] budget pressure detected — level=${current}${tierNote}\n`,
  );
}
```

**Why log on transition only:** Logging on every spawn would flood stderr during a saturated run. Logging only when the level changes gives a readable timeline: "warning at T+10m, high at T+14m, back to warning at T+18m."

**Session key:** The caller passes a stable-per-process identifier. Autopilot can use `process.pid.toString()`. The identifier lets multiple sessions in the same process (unlikely but possible in tests) have independent transition state.

## Caller wire-up

Three call sites need the 3-function chain. The pattern is the same at each site. Example from autopilot:

```typescript
// Before dispatching grd-planner for a phase plan:
const agentType = 'grd-planner';
const baseTier = MODEL_PROFILES[agentType][config.model_profile] || 'sonnet';

const complexity = estimateComplexity({
  agentType,
  promptLength: prompt.length,
  recentSamples: scheduler ? _getRecentSamplesFor(scheduler, agentType) : undefined,
});

const pressureLevel = scheduler
  ? computeBudgetPressureLevel(
      scheduler._getStates(),
      schedulerConfig.backend_priority,
      superpowersConfig.accounts,
      schedulerConfig.budget_pressure_thresholds,
    )
  : 'none';

const effectiveTier = computeEffectiveModelTier({
  baseTier,
  tokenProfile: config.token_profile || 'balanced',
  pressure: pressureLevel,
  complexity,
});

logPressureTransition(
  process.pid.toString(),
  pressureLevel,
  agentType,
  baseTier,
  effectiveTier,
);

const model = resolveModelForAgent(config, agentType, cwd, {
  effectiveTierOverride: effectiveTier,
});
```

**`_getStates` / `_getRecentSamplesFor` helpers:** The scheduler currently exposes `getState` (singular) and `loadPersistedState`. For complexity estimation we need to read specific samples. Add a tiny new exported helper on the Scheduler interface: `getStates(): Map<string, BackendUsageState>`, which returns the live states map (or a snapshot). This is a read-only accessor, 5 lines, no semantics change.

**`resolveModelForAgent`'s new parameter:** The existing function resolves agent type → profile → tier. Add an optional 4th parameter `{ effectiveTierOverride?: ModelTier }`. When provided, skip the profile lookup and use the override. When absent, fall back to existing behavior. Backward-compatible.

**`scheduler.spawn` is unchanged.** The effective tier is resolved BEFORE the scheduler is called — the scheduler still receives `{ cwd, model, timeout, maxTurns }` and doesn't know or care about profiles.

## CLI setting

In `bin/grd-tools.ts`, find the existing `gd settings` dispatch. Add a new case for `token_profile`:

```typescript
case 'token_profile': {
  const valid: TokenProfileName[] = ['frugal', 'balanced', 'quality'];
  if (!valid.includes(value as TokenProfileName)) {
    error(
      `Invalid token_profile value '${value}'. Valid: ${valid.join(', ')}`,
    );
  }
  const config = loadConfig(cwd);
  config.token_profile = value as TokenProfileName;
  saveConfig(cwd, config);
  output({ updated: 'token_profile', value }, raw, `token_profile: ${value}`);
  break;
}
```

Follow the existing pattern for `model_profile` — same validation shape, same save flow.

## Testing strategy

### Unit tests

**`tests/unit/complexity.test.ts`** (~10 tests):

1. `estimateComplexity returns baseline for a known agent type`
2. `estimateComplexity returns medium for an unknown agent type`
3. `estimateComplexity promotes to high when promptLength > 20000`
4. `estimateComplexity respects baseline when promptLength is small and no samples`
5. `estimateComplexity demotes high→medium when recent samples average < 3000 tokens`
6. `estimateComplexity demotes medium→low when recent samples average < 1500 tokens`
7. `estimateComplexity leaves low unchanged even with small samples`
8. `estimateComplexity ignores recentSamples if fewer than 3 provided`
9. `estimateComplexity handles empty recentSamples gracefully`
10. `estimateComplexity handles all-zero sample values`

**`tests/unit/scheduler-pressure.test.ts`** (~8 tests):

1. `computeBudgetPressureLevel returns 'none' for an empty states map`
2. `computeBudgetPressureLevel returns 'none' for accounts with zero consumption`
3. `computeBudgetPressureLevel returns 'warning' when any account is at 65%`
4. `computeBudgetPressureLevel returns 'high' when any account is at 85%`
5. `computeBudgetPressureLevel returns 'critical' when any account is at 97%`
6. `computeBudgetPressureLevel picks the worst level across multiple accounts`
7. `computeBudgetPressureLevel includes tokens_reserved in the ratio`
8. `isBudgetPressured returns true when level is not 'none'`

**`tests/unit/backend-effective-tier.test.ts`** (~15 tests):

1. `quality profile: never downgrades except on critical pressure`
2. `quality profile: downgrades 1 step on critical pressure`
3. `balanced profile: returns base tier when pressure=none and complexity=high`
4. `balanced profile: downgrades 1 step when pressure=none and complexity=low`
5. `balanced profile: downgrades 1 step on warning pressure`
6. `balanced profile: downgrades 2 steps on high pressure + low complexity`
7. `frugal profile: returns base tier when complexity=high and pressure=none`
8. `frugal profile: downgrades 1 step when complexity=medium and pressure=none`
9. `frugal profile: downgrades 1 step when complexity=low and pressure=none`
10. `frugal profile: downgrades 2 steps on high pressure regardless of complexity`
11. `downgrade floor: haiku stays haiku`
12. `downgrade floor: sonnet → haiku (2 steps applied)`
13. `downgrade floor: opus → sonnet → haiku (2 steps applied)`
14. `unknown base tier returns unchanged (passthrough)`
15. `critical pressure + high complexity on quality still downgrades 1 step`

### Integration test

**`tests/integration/token-profile.test.ts`** (~4 tests):

1. `autopilot dispatches an agent with the effective tier when token_profile=balanced and budget is not pressured` — should be identical to pre-Spec-4 behavior
2. `autopilot dispatches at the downgraded tier when budget pressure is high and token_profile=balanced` — set up a fake scheduler state with consumed ratio 0.85, verify the agent call uses the downgraded model
3. `autopilot respects token_profile=quality even under high pressure` — same setup but with token_profile=quality, verify no downgrade happens
4. `gd settings token_profile frugal updates config.json` — CLI smoke test

## Error handling

- **Unknown `token_profile` value in config.json:** `loadConfig` logs a warning and falls back to `'balanced'`. Existing pattern for `model_profile` invalid values.
- **Scheduler unavailable (null):** The wire-up block guards each call with `scheduler ?` — if no scheduler, `complexity` still estimates (without sample history), `pressureLevel` defaults to `'none'`, `effectiveTier` equals `baseTier`. Pre-Spec-4 behavior is preserved when the scheduler is absent.
- **Empty `scheduler._getStates()` map:** All pressure computations return `'none'`. Pre-Spec-4 behavior.
- **Pressure transition log helper throws:** never. The implementation has no I/O beyond `process.stderr.write`, which Node.js does not reject.
- **`resolveModelForAgent` receives an invalid `effectiveTierOverride`:** fall back to the existing profile lookup (log a warning). Defensive — callers should always pass a valid tier.

No silent fallbacks beyond the documented profile-invalidation pattern. All the new logic is pure; errors can only come from the wire-up sites, which explicitly log-and-degrade.

## Rollout checklist

1. Create `lib/complexity.ts` with `estimateComplexity` and `AGENT_BASELINE_COMPLEXITY`.
2. Create `tests/unit/complexity.test.ts` with 10 tests.
3. Add `TokenProfileName`, `BudgetPressureLevel`, `ComplexityLevel`, `BudgetPressureThresholds` to `lib/types.ts`.
4. Extend `GrdConfig` with `token_profile?: TokenProfileName` in `lib/types.ts`.
5. Extend `SchedulerConfig` with `budget_pressure_thresholds?: BudgetPressureThresholds` in `lib/types.ts`.
6. Add `isBudgetPressured` and `computeBudgetPressureLevel` to `lib/scheduler.ts`.
7. Add `logPressureTransition` helper to `lib/scheduler.ts`.
8. Add `_getStates` accessor to the Scheduler interface in `lib/scheduler.ts`.
9. Create `tests/unit/scheduler-pressure.test.ts` with 8 tests.
10. Add `computeEffectiveModelTier` to `lib/backend.ts`.
11. Create `tests/unit/backend-effective-tier.test.ts` with 15 tests.
12. Update `resolveModelForAgent` in `lib/utils.ts` to accept optional `effectiveTierOverride`.
13. Wire up the 3-function chain in `lib/autopilot.ts` before agent dispatch.
14. Wire up the 3-function chain in `lib/evolve.ts`.
15. Wire up the 3-function chain in `lib/autoresearch.ts`.
16. Add `token_profile` case to `gd settings` in `bin/grd-tools.ts`.
17. Create `tests/integration/token-profile.test.ts` with 4 tests.
18. Update `jest.config.js` with per-file thresholds for `lib/complexity.ts`.
19. Update `CLAUDE.md` to document `token_profile` + budget pressure (one short section).
20. Add `docs/CHANGELOG.md` Unreleased entry.
21. Run `npm test`, `npm run lint`, `npm run build:check`, `npm run format:check`.
22. Run `gd scan --all` to confirm no new scan hits.

## Out of scope (follow-up items)

- **Non-critical spawn rejection at 95% pressure.** The `critical` level logs but does NOT block. A future spec can add spawn rejection + caller-provided "is this spawn critical" signal.
- **Per-agent frontmatter complexity hints.** Agent markdown files get no new frontmatter fields. Table-driven baselines are simpler.
- **Configurable complexity heuristic cutoffs.** `20000` and `3000` and `1500` are hardcoded. A future spec can expose them in `.planning/config.json` if miscalibration is observed.
- **Pressure history persistence.** Pressure is computed fresh per spawn from live state. No new files.
- **Spec 2B: per-spawn idle timeout watchdog.** Still conditional on observing agent hangs.
- **Spec 3B: LLM fallback for mechanical completion.** Still conditional on observing mechanical completion failures.
- **Refactoring `lib/autopilot.ts` / `lib/scheduler.ts` monoliths.** Out of scope.

## Attribution

This spec synthesizes three distinct ideas from the broader gsd/R&D ecosystem:

- **Profile-based routing** — inspired by how various cost-aware CLI tools expose a single `speed` or `effort` knob that callers can set per session (OpenAI's `reasoning_effort`, Anthropic's `effort` in Claude Code v2.1.68+).
- **Budget pressure thresholds** — inspired by kernel-level memory pressure notification (Linux `memory.pressure_level`) which uses `low`/`medium`/`critical` tiers that applications react to.
- **Complexity-based routing** — inspired by adaptive query routers in distributed systems that pick execution strategies based on estimated query cost.

No code is ported. The pattern is the load-bearing contribution.

CHANGELOG entry credits the pattern sources.

## Related specs

- Spec 1 (complete, on main): `2026-04-11-gsd2-prompt-injection-scan-design.md`
- Spec 2A (complete, on main): `2026-04-11-gsd2-autopilot-hardening-design.md`
- Spec 2B (future, conditional): `2026-MM-DD-gsd2-idle-watchdog-design.md`
- Spec 3 (complete, on main): `2026-04-11-gsd2-mechanical-completion-design.md`
- Spec 3B (future, conditional): `2026-MM-DD-gsd2-mechanical-completion-llm-fallback-design.md`
