# Token Optimization System (Spec 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an adaptive model-tier routing system that downgrades expensive agents to cheaper tiers under budget pressure or low task complexity, controlled by a new `token_profile` preference separate from the existing `model_profile`.

**Architecture:** Four pure functions + one CLI setting + one stateful log-transition helper, wired into three dispatch call sites. `estimateComplexity` (in a new `lib/complexity.ts`) classifies tasks as low/medium/high. `isBudgetPressured`/`computeBudgetPressureLevel` (added to `lib/scheduler.ts`) reads scheduler state to classify pressure as none/warning/high/critical. `computeEffectiveModelTier` (added to `lib/backend.ts`) combines profile + pressure + complexity via an explicit 3×4×3 decision matrix to return a possibly-downgraded tier. Autopilot/evolve/autoresearch call the chain before `resolveModelForAgent` so dispatched agents use the adaptive tier.

**Tech Stack:** TypeScript (strict), CommonJS, `tsx` at entry points, jest with ts-jest, Node 20. All new code follows GRD conventions: `'use strict'` header, JSDoc blocks, `module.exports` at EOF, underscore-prefix for private helpers, no `any`, typed `require` casts, `process.stderr.write('[prefix] ...\n')` for diagnostic logging.

**Spec reference:** `docs/superpowers/specs/2026-04-11-gsd2-token-optimization-design.md` (commit `381f17e`)

**Worktree note:** Create a worktree before starting:

```bash
git worktree add .worktrees/gsd2-token-opt -b feat/gsd2-token-optimization
cd .worktrees/gsd2-token-opt
```

**Security invariant:** No shell interpolation, no new subprocess spawns, no new network calls. This spec is pure functions + config + wire-up.

---

## File Structure

**New files:**

```
lib/complexity.ts                               # estimateComplexity + AGENT_BASELINE_COMPLEXITY
tests/unit/complexity.test.ts                   # 10 tests
tests/unit/scheduler-pressure.test.ts           # 8 tests for pressure detection
tests/unit/backend-effective-tier.test.ts       # 15 tests for computeEffectiveModelTier
tests/integration/token-profile.test.ts         # 4 integration tests
```

**Modified files:**

```
lib/types.ts                  # +TokenProfileName, +BudgetPressureLevel, +ComplexityLevel,
                              # +BudgetPressureThresholds, GrdConfig+SchedulerConfig extensions
lib/scheduler.ts              # +isBudgetPressured, +computeBudgetPressureLevel,
                              # +logPressureTransition, +getStates accessor, +DEFAULT_PRESSURE_THRESHOLDS
lib/backend.ts                # +computeEffectiveModelTier + _lookupDowngradeCount + _applyDowngrade
lib/utils.ts                  # resolveModelForAgent gains optional effectiveTierOverride
lib/autopilot.ts              # call chain before agent dispatch
lib/evolve.ts                 # call chain before agent dispatch
lib/autoresearch.ts           # call chain before agent dispatch
bin/grd-tools.ts              # gd settings token_profile
jest.config.js                # per-file threshold for lib/complexity.ts
CLAUDE.md                     # short section documenting token_profile + budget pressure
docs/CHANGELOG.md             # Unreleased entry
```

**Module boundaries:**

- **`lib/complexity.ts`** — one responsibility: given an agent type + optional signals, return a `ComplexityLevel`. Pure function. Does not read files, does not read config. ~80 lines.
- **`lib/scheduler.ts`** — gains three new functions + one state map. `isBudgetPressured` and `computeBudgetPressureLevel` are pure; `logPressureTransition` holds session-level state for transition-logging. ~100 lines added.
- **`lib/backend.ts`** — gains `computeEffectiveModelTier` with an auditable 3×4×3 lookup table. Pure function. ~80 lines added.
- **`lib/types.ts`** — type-only additions, ~30 lines.
- **Call-site files** — ~20 lines each added, no removals.

---

## Task 1: Type additions in lib/types.ts

**Files:**
- Modify: `lib/types.ts`

- [ ] **Step 1.1: Add new type aliases**

Open `lib/types.ts`. Find a suitable location near other profile/config types (likely near `ModelProfileName` which is `'quality' | 'balanced' | 'budget'`). Add:

```typescript
/**
 * Token budget optimization preference, orthogonal to model_profile.
 * - 'frugal': aggressively downgrade for cost savings
 * - 'balanced': moderate adaptive downgrade (default)
 * - 'quality': preserve tier unless budget is critical
 */
export type TokenProfileName = 'frugal' | 'balanced' | 'quality';

/**
 * Budget pressure classification based on rolling-window consumption.
 * Thresholds are configurable via SchedulerConfig.budget_pressure_thresholds.
 */
export type BudgetPressureLevel = 'none' | 'warning' | 'high' | 'critical';

/**
 * Task complexity estimate used by adaptive model-tier routing.
 * Produced by estimateComplexity() from lib/complexity.ts.
 */
export type ComplexityLevel = 'low' | 'medium' | 'high';

/**
 * Configurable thresholds for budget pressure classification. Values are
 * ratios of (consumed + reserved) / budget. Defaults: 60%, 80%, 95%.
 */
export interface BudgetPressureThresholds {
  warning: number;
  high: number;
  critical: number;
}
```

- [ ] **Step 1.2: Extend GrdConfig with token_profile**

Find the `GrdConfig` interface. Add the new field alongside `model_profile`:

```typescript
  /**
   * Token optimization preference (Spec 4). Controls adaptive model-tier
   * routing behavior under budget pressure or low task complexity.
   * Default: 'balanced'. Set via `gd settings token_profile <value>`.
   */
  token_profile?: TokenProfileName;
```

- [ ] **Step 1.3: Extend SchedulerConfig with budget_pressure_thresholds**

Find the `SchedulerConfig` interface. After `max_wait_minutes?: number` (added in Spec 2A), add:

```typescript
  /**
   * Thresholds for budget pressure classification (Spec 4). Each value
   * is a ratio of (tokens_consumed_in_window + tokens_reserved) / token_budget.
   * Defaults: { warning: 0.6, high: 0.8, critical: 0.95 }.
   */
  budget_pressure_thresholds?: BudgetPressureThresholds;
```

- [ ] **Step 1.4: Verify type check**

```bash
npm run build:check
```

Expected: zero errors.

- [ ] **Step 1.5: Commit**

```bash
git add lib/types.ts
git commit -m "feat(types): add TokenProfileName, BudgetPressureLevel, ComplexityLevel

New type aliases and interface fields for Spec 4's token optimization
system:

- TokenProfileName: 'frugal' | 'balanced' | 'quality'
- BudgetPressureLevel: 'none' | 'warning' | 'high' | 'critical'
- ComplexityLevel: 'low' | 'medium' | 'high'
- BudgetPressureThresholds: { warning, high, critical } ratios
- GrdConfig.token_profile?: TokenProfileName
- SchedulerConfig.budget_pressure_thresholds?: BudgetPressureThresholds

Part of spec 4/4 of the gsd-2-selective-adoption milestone."
```

---

## Task 2: lib/complexity.ts with estimateComplexity

**Files:**
- Create: `lib/complexity.ts`
- Create: `tests/unit/complexity.test.ts`

TDD: failing test first, then implementation.

- [ ] **Step 2.1: Write the failing test**

Create `tests/unit/complexity.test.ts`:

```typescript
'use strict';

import type { ComplexityLevel } from '../../lib/types';

const {
  estimateComplexity,
  AGENT_BASELINE_COMPLEXITY,
} = require('../../lib/complexity') as {
  estimateComplexity: (opts: {
    agentType: string;
    promptLength?: number;
    recentSamples?: { duration: number; tokenEstimate: number }[];
  }) => ComplexityLevel;
  AGENT_BASELINE_COMPLEXITY: Record<string, ComplexityLevel>;
};

describe('estimateComplexity', () => {
  it('returns the baseline for a known agent type', () => {
    expect(estimateComplexity({ agentType: 'grd-planner' })).toBe('high');
    expect(estimateComplexity({ agentType: 'grd-executor' })).toBe('medium');
    expect(estimateComplexity({ agentType: 'grd-verifier' })).toBe('low');
  });

  it('returns medium for an unknown agent type', () => {
    expect(estimateComplexity({ agentType: 'not-a-real-agent' })).toBe('medium');
  });

  it('promotes to high when promptLength > 20000', () => {
    expect(
      estimateComplexity({ agentType: 'grd-verifier', promptLength: 25_000 }),
    ).toBe('high');
    expect(
      estimateComplexity({ agentType: 'grd-executor', promptLength: 30_000 }),
    ).toBe('high');
  });

  it('respects baseline when promptLength is small and no samples', () => {
    expect(
      estimateComplexity({ agentType: 'grd-planner', promptLength: 500 }),
    ).toBe('high');
    expect(
      estimateComplexity({ agentType: 'grd-verifier', promptLength: 500 }),
    ).toBe('low');
  });

  it('demotes high→medium when recent samples average < 3000 tokens', () => {
    const samples = [
      { duration: 100, tokenEstimate: 1000 },
      { duration: 100, tokenEstimate: 1500 },
      { duration: 100, tokenEstimate: 2000 },
    ];
    expect(
      estimateComplexity({ agentType: 'grd-planner', recentSamples: samples }),
    ).toBe('medium');
  });

  it('demotes medium→low when recent samples average < 1500 tokens', () => {
    const samples = [
      { duration: 100, tokenEstimate: 500 },
      { duration: 100, tokenEstimate: 800 },
      { duration: 100, tokenEstimate: 1000 },
    ];
    expect(
      estimateComplexity({ agentType: 'grd-executor', recentSamples: samples }),
    ).toBe('low');
  });

  it('leaves low unchanged even with small samples', () => {
    const samples = [
      { duration: 100, tokenEstimate: 200 },
      { duration: 100, tokenEstimate: 300 },
      { duration: 100, tokenEstimate: 400 },
    ];
    expect(
      estimateComplexity({ agentType: 'grd-verifier', recentSamples: samples }),
    ).toBe('low');
  });

  it('ignores recentSamples if fewer than 3 provided', () => {
    const samples = [
      { duration: 100, tokenEstimate: 500 },
      { duration: 100, tokenEstimate: 500 },
    ];
    // Only 2 samples — ignore the demotion signal, use baseline
    expect(
      estimateComplexity({ agentType: 'grd-planner', recentSamples: samples }),
    ).toBe('high');
  });

  it('handles empty recentSamples gracefully', () => {
    expect(
      estimateComplexity({ agentType: 'grd-planner', recentSamples: [] }),
    ).toBe('high');
  });

  it('handles all-zero sample values without throwing', () => {
    const samples = [
      { duration: 0, tokenEstimate: 0 },
      { duration: 0, tokenEstimate: 0 },
      { duration: 0, tokenEstimate: 0 },
    ];
    // Average is 0, which is < 1500 for medium baseline → demote to low
    expect(
      estimateComplexity({ agentType: 'grd-executor', recentSamples: samples }),
    ).toBe('low');
  });
});

describe('AGENT_BASELINE_COMPLEXITY table', () => {
  it('has expected high-complexity agents', () => {
    expect(AGENT_BASELINE_COMPLEXITY['grd-planner']).toBe('high');
    expect(AGENT_BASELINE_COMPLEXITY['grd-roadmapper']).toBe('high');
  });

  it('has expected low-complexity agents', () => {
    expect(AGENT_BASELINE_COMPLEXITY['grd-verifier']).toBe('low');
    expect(AGENT_BASELINE_COMPLEXITY['grd-codebase-mapper']).toBe('low');
  });
});
```

- [ ] **Step 2.2: Run the failing test**

```bash
npx jest tests/unit/complexity.test.ts 2>&1 | tail -10
```

Expected: fails with `Cannot find module '../../lib/complexity'`.

- [ ] **Step 2.3: Create lib/complexity.ts**

```typescript
'use strict';

/**
 * GRD Complexity -- Task complexity estimator for adaptive model-tier
 * routing.
 *
 * Pure function that takes an agent type + optional signals and returns
 * a ComplexityLevel ('low' | 'medium' | 'high'). Used by the Spec 4
 * adaptive routing chain before resolveModelForAgent.
 *
 * Does NOT read files, config, or scheduler state. All inputs are
 * pre-gathered by the caller.
 */

import type { ComplexityLevel } from './types';

/**
 * Baseline complexity per agent type, seeded from the existing
 * MODEL_PROFILES 'quality' tier as a proxy for "how much reasoning
 * does this agent typically need."
 *
 * Values:
 *   - 'high': planners, roadmappers, product owners, researchers
 *   - 'medium': executors, debuggers, synthesizers
 *   - 'low': verifiers, code-reviewers, mappers
 */
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
  'grd-plan-checker': 'medium',
  'grd-migrator': 'medium',
  'grd-eval-planner': 'medium',
  'grd-codebase-mapper': 'low',
  'grd-verifier': 'low',
  'grd-baseline-assessor': 'low',
  'grd-knowledge-miner': 'low',
  'grd-code-reviewer': 'low',
  'grd-eval-reporter': 'low',
};

const PROMPT_LENGTH_HIGH_THRESHOLD = 20_000;
const SAMPLE_DEMOTE_HIGH_TO_MEDIUM = 3_000;
const SAMPLE_DEMOTE_MEDIUM_TO_LOW = 1_500;
const MIN_SAMPLES_FOR_DEMOTION = 3;

/**
 * Estimates task complexity based on agent type, prompt length, and
 * recent sample history. Returns 'low' | 'medium' | 'high'.
 *
 * Decision order:
 *   1. Start with AGENT_BASELINE_COMPLEXITY[agentType] or 'medium'
 *      if unknown.
 *   2. If promptLength > PROMPT_LENGTH_HIGH_THRESHOLD (20k chars),
 *      return 'high' regardless of baseline.
 *   3. If >= MIN_SAMPLES_FOR_DEMOTION recent samples and average
 *      tokenEstimate is small, demote by one level:
 *      - high → medium if avg < SAMPLE_DEMOTE_HIGH_TO_MEDIUM (3k)
 *      - medium → low if avg < SAMPLE_DEMOTE_MEDIUM_TO_LOW (1.5k)
 *      - low stays low
 *   4. Otherwise return baseline.
 */
export function estimateComplexity(opts: {
  agentType: string;
  promptLength?: number;
  recentSamples?: { duration: number; tokenEstimate: number }[];
}): ComplexityLevel {
  const baseline: ComplexityLevel =
    AGENT_BASELINE_COMPLEXITY[opts.agentType] || 'medium';

  if (
    opts.promptLength !== undefined &&
    opts.promptLength > PROMPT_LENGTH_HIGH_THRESHOLD
  ) {
    return 'high';
  }

  if (
    opts.recentSamples &&
    opts.recentSamples.length >= MIN_SAMPLES_FOR_DEMOTION
  ) {
    const avgTokens =
      opts.recentSamples.reduce((sum, s) => sum + s.tokenEstimate, 0) /
      opts.recentSamples.length;
    if (baseline === 'high' && avgTokens < SAMPLE_DEMOTE_HIGH_TO_MEDIUM) {
      return 'medium';
    }
    if (baseline === 'medium' && avgTokens < SAMPLE_DEMOTE_MEDIUM_TO_LOW) {
      return 'low';
    }
  }

  return baseline;
}

module.exports = {
  estimateComplexity,
  AGENT_BASELINE_COMPLEXITY,
};
```

- [ ] **Step 2.4: Run the test**

```bash
npx jest tests/unit/complexity.test.ts 2>&1 | tail -10
```

Expected: all 12 tests pass.

- [ ] **Step 2.5: Run lint and build:check**

```bash
npm run lint && npm run build:check
```

Expected: zero errors.

- [ ] **Step 2.6: Commit**

```bash
git add lib/complexity.ts tests/unit/complexity.test.ts
git commit -m "feat(complexity): add estimateComplexity pure function

New lib/complexity.ts with:
- AGENT_BASELINE_COMPLEXITY table (21 GRD agents) mapping each agent
  type to a baseline complexity level (low/medium/high), seeded from
  MODEL_PROFILES 'quality' tier as a proxy.
- estimateComplexity function that takes agent type + optional signals
  (promptLength, recentSamples) and returns ComplexityLevel. Promotes
  to 'high' if prompt > 20k chars. Demotes by one level if recent
  samples (>=3) average below tier-specific thresholds (3k tokens for
  high→medium, 1.5k for medium→low).

12 unit tests covering baseline lookup, unknown agent, prompt
promotion, sample demotion, boundary conditions.

Part of spec 4/4 of the gsd-2-selective-adoption milestone."
```

---

## Task 3: Budget pressure detection in lib/scheduler.ts

**Files:**
- Modify: `lib/scheduler.ts`
- Create: `tests/unit/scheduler-pressure.test.ts`

- [ ] **Step 3.1: Write the failing test**

Create `tests/unit/scheduler-pressure.test.ts`:

```typescript
'use strict';

import type {
  BackendUsageState,
  SuperpowersConfig,
  BudgetPressureThresholds,
} from '../../lib/types';

const {
  isBudgetPressured,
  computeBudgetPressureLevel,
}: {
  isBudgetPressured: (
    states: Map<string, BackendUsageState>,
    priority: string[],
    accounts: SuperpowersConfig['accounts'],
    thresholds?: BudgetPressureThresholds,
  ) => boolean;
  computeBudgetPressureLevel: (
    states: Map<string, BackendUsageState>,
    priority: string[],
    accounts: SuperpowersConfig['accounts'],
    thresholds?: BudgetPressureThresholds,
  ) => 'none' | 'warning' | 'high' | 'critical';
} = require('../../lib/scheduler');

function makeState(consumed: number, reserved: number, budget: number): BackendUsageState {
  return {
    samples: [],
    ewma_tokens_per_task: 0,
    tokens_consumed_in_window: consumed,
    tokens_reserved: reserved,
    in_flight_count: 0,
    token_budget: budget,
    budget_learned: false,
    budget_confidence: 0,
  };
}

function makeAccounts(
  entries: Array<{ backend: string; configDir: string }>,
): SuperpowersConfig['accounts'] {
  const accounts: Record<string, Array<{ config_dir: string }>> = {};
  for (const e of entries) {
    if (!accounts[e.backend]) accounts[e.backend] = [];
    accounts[e.backend].push({ config_dir: e.configDir });
  }
  return accounts as SuperpowersConfig['accounts'];
}

describe('computeBudgetPressureLevel', () => {
  it("returns 'none' for an empty states map", () => {
    const states = new Map<string, BackendUsageState>();
    const accounts = makeAccounts([{ backend: 'claude', configDir: '~/.claude' }]);
    expect(computeBudgetPressureLevel(states, ['claude'], accounts)).toBe('none');
  });

  it("returns 'none' for accounts with zero consumption", () => {
    const states = new Map<string, BackendUsageState>();
    states.set('claude/~/.claude', makeState(0, 0, 100_000));
    const accounts = makeAccounts([{ backend: 'claude', configDir: '~/.claude' }]);
    expect(computeBudgetPressureLevel(states, ['claude'], accounts)).toBe('none');
  });

  it("returns 'warning' when any account is at 65% consumed", () => {
    const states = new Map<string, BackendUsageState>();
    states.set('claude/~/.claude', makeState(65_000, 0, 100_000));
    const accounts = makeAccounts([{ backend: 'claude', configDir: '~/.claude' }]);
    expect(computeBudgetPressureLevel(states, ['claude'], accounts)).toBe('warning');
  });

  it("returns 'high' when any account is at 85% consumed", () => {
    const states = new Map<string, BackendUsageState>();
    states.set('claude/~/.claude', makeState(85_000, 0, 100_000));
    const accounts = makeAccounts([{ backend: 'claude', configDir: '~/.claude' }]);
    expect(computeBudgetPressureLevel(states, ['claude'], accounts)).toBe('high');
  });

  it("returns 'critical' when any account is at 97% consumed", () => {
    const states = new Map<string, BackendUsageState>();
    states.set('claude/~/.claude', makeState(97_000, 0, 100_000));
    const accounts = makeAccounts([{ backend: 'claude', configDir: '~/.claude' }]);
    expect(computeBudgetPressureLevel(states, ['claude'], accounts)).toBe('critical');
  });

  it('picks the worst level across multiple accounts', () => {
    const states = new Map<string, BackendUsageState>();
    states.set('claude/~/account-a', makeState(10_000, 0, 100_000));
    states.set('claude/~/account-b', makeState(90_000, 0, 100_000));
    const accounts = makeAccounts([
      { backend: 'claude', configDir: '~/account-a' },
      { backend: 'claude', configDir: '~/account-b' },
    ]);
    // account-b is at 90% → high
    expect(computeBudgetPressureLevel(states, ['claude'], accounts)).toBe('high');
  });

  it('includes tokens_reserved in the ratio', () => {
    const states = new Map<string, BackendUsageState>();
    // 50k consumed + 40k reserved = 90k/100k = 90% → high
    states.set('claude/~/.claude', makeState(50_000, 40_000, 100_000));
    const accounts = makeAccounts([{ backend: 'claude', configDir: '~/.claude' }]);
    expect(computeBudgetPressureLevel(states, ['claude'], accounts)).toBe('high');
  });

  it('respects custom thresholds', () => {
    const states = new Map<string, BackendUsageState>();
    states.set('claude/~/.claude', makeState(50_000, 0, 100_000));
    const accounts = makeAccounts([{ backend: 'claude', configDir: '~/.claude' }]);
    // Custom: warning=0.4 → 50% consumed = warning
    const thresholds = { warning: 0.4, high: 0.6, critical: 0.9 };
    expect(
      computeBudgetPressureLevel(states, ['claude'], accounts, thresholds),
    ).toBe('warning');
  });
});

describe('isBudgetPressured', () => {
  it('returns false when level is none', () => {
    const states = new Map<string, BackendUsageState>();
    states.set('claude/~/.claude', makeState(10_000, 0, 100_000));
    const accounts = makeAccounts([{ backend: 'claude', configDir: '~/.claude' }]);
    expect(isBudgetPressured(states, ['claude'], accounts)).toBe(false);
  });

  it('returns true when level is warning', () => {
    const states = new Map<string, BackendUsageState>();
    states.set('claude/~/.claude', makeState(65_000, 0, 100_000));
    const accounts = makeAccounts([{ backend: 'claude', configDir: '~/.claude' }]);
    expect(isBudgetPressured(states, ['claude'], accounts)).toBe(true);
  });
});
```

- [ ] **Step 3.2: Run the failing test**

```bash
npx jest tests/unit/scheduler-pressure.test.ts 2>&1 | tail -10
```

Expected: fails because `isBudgetPressured` and `computeBudgetPressureLevel` are not exported.

- [ ] **Step 3.3: Add the functions to lib/scheduler.ts**

Find a location in `lib/scheduler.ts` near `computeSoonestRecovery` (added in Spec 2A, around line 324). Add after it:

```typescript
// ─── Spec 4: budget pressure detection ────────────────────────────────────

/**
 * Default thresholds for budget pressure classification. Overridable
 * via SchedulerConfig.budget_pressure_thresholds.
 */
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
  return (
    computeBudgetPressureLevel(states, priority, accounts, thresholds) !==
    'none'
  );
}

/**
 * Classifies the worst pressure level across all priority accounts.
 * Returns 'none' | 'warning' | 'high' | 'critical'. Pure function.
 *
 * For each priority account, computes (consumed + reserved) / budget
 * and picks the worst ratio across all accounts (i.e., the one closest
 * to exhaustion determines the level for the whole session).
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

Add `BudgetPressureLevel`, `BudgetPressureThresholds` to the imports from `./types` at the top of `lib/scheduler.ts`.

Add both new functions to the `module.exports` block at the bottom:

```typescript
module.exports = {
  // ... existing exports preserved ...
  computeSoonestRecovery,
  _anyPriorityHasHeadroom,
  isBudgetPressured,
  computeBudgetPressureLevel,
};
```

Also add both as TypeScript `export` so the type-only import in the test file resolves.

- [ ] **Step 3.4: Run the test**

```bash
npx jest tests/unit/scheduler-pressure.test.ts 2>&1 | tail -10
```

Expected: all 10 tests pass.

- [ ] **Step 3.5: Run lint and build:check**

```bash
npm run lint && npm run build:check
```

Expected: zero errors.

- [ ] **Step 3.6: Commit**

```bash
git add lib/scheduler.ts tests/unit/scheduler-pressure.test.ts
git commit -m "feat(scheduler): add budget pressure detection

Two new pure functions in lib/scheduler.ts:

- isBudgetPressured(states, priority, accounts, thresholds?) — boolean
  helper returning true iff any priority account has consumed above
  the warning threshold (default 60%).
- computeBudgetPressureLevel(...) — classifies the worst pressure
  across all priority accounts as 'none' | 'warning' | 'high' |
  'critical'. Uses DEFAULT_PRESSURE_THRESHOLDS (60/80/95) by default;
  overridable via SchedulerConfig.budget_pressure_thresholds.

Both functions include tokens_reserved in the consumption ratio so
concurrent in-flight tasks are correctly reflected.

10 unit tests cover empty states, zero/65/85/97 percent levels,
multi-account worst-pick, reserved inclusion, custom thresholds,
and isBudgetPressured true/false cases.

Part of spec 4/4 of the gsd-2-selective-adoption milestone."
```

---

## Task 4: computeEffectiveModelTier in lib/backend.ts

**Files:**
- Modify: `lib/backend.ts`
- Create: `tests/unit/backend-effective-tier.test.ts`

- [ ] **Step 4.1: Write the failing test**

Create `tests/unit/backend-effective-tier.test.ts`:

```typescript
'use strict';

import type {
  TokenProfileName,
  BudgetPressureLevel,
  ComplexityLevel,
} from '../../lib/types';

type ModelTier = 'opus' | 'sonnet' | 'haiku';

const { computeEffectiveModelTier } = require('../../lib/backend') as {
  computeEffectiveModelTier: (opts: {
    baseTier: ModelTier;
    tokenProfile: TokenProfileName;
    pressure: BudgetPressureLevel;
    complexity: ComplexityLevel;
  }) => ModelTier;
};

describe('computeEffectiveModelTier', () => {
  it('quality profile: never downgrades on none/warning/high pressure', () => {
    for (const complexity of ['low', 'medium', 'high'] as const) {
      for (const pressure of ['none', 'warning', 'high'] as const) {
        expect(
          computeEffectiveModelTier({
            baseTier: 'opus',
            tokenProfile: 'quality',
            pressure,
            complexity,
          }),
        ).toBe('opus');
      }
    }
  });

  it('quality profile: downgrades 1 step on critical pressure', () => {
    expect(
      computeEffectiveModelTier({
        baseTier: 'opus',
        tokenProfile: 'quality',
        pressure: 'critical',
        complexity: 'high',
      }),
    ).toBe('sonnet');
  });

  it('balanced profile: returns base tier when pressure=none and complexity=high', () => {
    expect(
      computeEffectiveModelTier({
        baseTier: 'opus',
        tokenProfile: 'balanced',
        pressure: 'none',
        complexity: 'high',
      }),
    ).toBe('opus');
  });

  it('balanced profile: returns base tier when pressure=none and complexity=medium', () => {
    expect(
      computeEffectiveModelTier({
        baseTier: 'opus',
        tokenProfile: 'balanced',
        pressure: 'none',
        complexity: 'medium',
      }),
    ).toBe('opus');
  });

  it('balanced profile: downgrades 1 step when pressure=none and complexity=low', () => {
    expect(
      computeEffectiveModelTier({
        baseTier: 'opus',
        tokenProfile: 'balanced',
        pressure: 'none',
        complexity: 'low',
      }),
    ).toBe('sonnet');
  });

  it('balanced profile: downgrades 1 step on warning pressure and medium complexity', () => {
    expect(
      computeEffectiveModelTier({
        baseTier: 'opus',
        tokenProfile: 'balanced',
        pressure: 'warning',
        complexity: 'medium',
      }),
    ).toBe('sonnet');
  });

  it('balanced profile: downgrades 2 steps on high pressure + low complexity', () => {
    expect(
      computeEffectiveModelTier({
        baseTier: 'opus',
        tokenProfile: 'balanced',
        pressure: 'high',
        complexity: 'low',
      }),
    ).toBe('haiku');
  });

  it('frugal profile: returns base tier when complexity=high and pressure=none', () => {
    expect(
      computeEffectiveModelTier({
        baseTier: 'opus',
        tokenProfile: 'frugal',
        pressure: 'none',
        complexity: 'high',
      }),
    ).toBe('opus');
  });

  it('frugal profile: downgrades 1 step when complexity=medium and pressure=none', () => {
    expect(
      computeEffectiveModelTier({
        baseTier: 'opus',
        tokenProfile: 'frugal',
        pressure: 'none',
        complexity: 'medium',
      }),
    ).toBe('sonnet');
  });

  it('frugal profile: downgrades 1 step when complexity=low and pressure=none', () => {
    expect(
      computeEffectiveModelTier({
        baseTier: 'opus',
        tokenProfile: 'frugal',
        pressure: 'none',
        complexity: 'low',
      }),
    ).toBe('sonnet');
  });

  it('frugal profile: downgrades 2 steps on high pressure regardless of complexity', () => {
    for (const complexity of ['low', 'medium', 'high'] as const) {
      expect(
        computeEffectiveModelTier({
          baseTier: 'opus',
          tokenProfile: 'frugal',
          pressure: 'high',
          complexity,
        }),
      ).toBe('haiku');
    }
  });

  it('downgrade floor: haiku stays haiku', () => {
    expect(
      computeEffectiveModelTier({
        baseTier: 'haiku',
        tokenProfile: 'frugal',
        pressure: 'critical',
        complexity: 'low',
      }),
    ).toBe('haiku');
  });

  it('downgrade floor: sonnet → haiku (2 steps applied)', () => {
    expect(
      computeEffectiveModelTier({
        baseTier: 'sonnet',
        tokenProfile: 'frugal',
        pressure: 'critical',
        complexity: 'low',
      }),
    ).toBe('haiku');
  });

  it('downgrade floor: opus → sonnet → haiku (2 steps applied)', () => {
    expect(
      computeEffectiveModelTier({
        baseTier: 'opus',
        tokenProfile: 'frugal',
        pressure: 'critical',
        complexity: 'low',
      }),
    ).toBe('haiku');
  });

  it('unknown base tier returns unchanged (passthrough)', () => {
    const result = computeEffectiveModelTier({
      baseTier: 'unknown-tier' as ModelTier,
      tokenProfile: 'frugal',
      pressure: 'high',
      complexity: 'low',
    });
    expect(result).toBe('unknown-tier');
  });
});
```

- [ ] **Step 4.2: Run the failing test**

```bash
npx jest tests/unit/backend-effective-tier.test.ts 2>&1 | tail -10
```

Expected: fails because `computeEffectiveModelTier` is not exported.

- [ ] **Step 4.3: Add computeEffectiveModelTier to lib/backend.ts**

Open `lib/backend.ts`. Find a location near `EFFORT_PROFILES` or the end of the file (before `module.exports`). Add:

```typescript
// ─── Spec 4: adaptive model-tier routing ──────────────────────────────────

type ModelTier = 'opus' | 'sonnet' | 'haiku';
const _TIER_ORDER: ModelTier[] = ['opus', 'sonnet', 'haiku'];

/**
 * Looks up how many tiers to downgrade given the profile, pressure,
 * and complexity. Returns 0, 1, or 2. Pure function — table-driven.
 *
 * The explicit table is the contract; change it here to tune routing.
 */
function _lookupDowngradeCount(
  profile: TokenProfileName,
  pressure: BudgetPressureLevel,
  complexity: ComplexityLevel,
): number {
  // quality: only downgrade on critical pressure
  if (profile === 'quality') {
    if (pressure === 'critical') return 1;
    return 0;
  }

  // balanced: moderate adaptive downgrade
  if (profile === 'balanced') {
    if (pressure === 'none') {
      if (complexity === 'low') return 1;
      return 0;
    }
    if (pressure === 'warning') {
      if (complexity === 'high') return 0;
      return 1;
    }
    if (pressure === 'high') {
      if (complexity === 'high') return 0;
      if (complexity === 'medium') return 1;
      return 2; // low
    }
    if (pressure === 'critical') {
      if (complexity === 'high') return 1;
      return 2;
    }
  }

  // frugal: aggressive downgrade
  if (profile === 'frugal') {
    if (pressure === 'none') {
      if (complexity === 'high') return 0;
      return 1; // medium or low
    }
    if (pressure === 'warning') {
      if (complexity === 'low') return 2;
      return 1;
    }
    // high or critical
    return 2;
  }

  // Unknown profile: passthrough
  return 0;
}

/**
 * Applies a downgrade count to a base tier, floored at the lowest tier.
 * Returns the base tier unchanged if it's not in _TIER_ORDER (passthrough).
 */
function _applyDowngrade(baseTier: ModelTier, count: number): ModelTier {
  const baseIndex = _TIER_ORDER.indexOf(baseTier);
  if (baseIndex === -1) return baseTier;
  const targetIndex = Math.min(baseIndex + count, _TIER_ORDER.length - 1);
  return _TIER_ORDER[targetIndex];
}

/**
 * Computes the effective model tier for an agent dispatch given the
 * base tier (from MODEL_PROFILES), the user's token_profile preference,
 * the current budget pressure level, and the task's complexity level.
 *
 * Pure function. Returns a possibly-downgraded ModelTier. The decision
 * matrix is documented in the spec and implemented in _lookupDowngradeCount.
 */
export function computeEffectiveModelTier(opts: {
  baseTier: ModelTier;
  tokenProfile: TokenProfileName;
  pressure: BudgetPressureLevel;
  complexity: ComplexityLevel;
}): ModelTier {
  const count = _lookupDowngradeCount(
    opts.tokenProfile,
    opts.pressure,
    opts.complexity,
  );
  return _applyDowngrade(opts.baseTier, count);
}
```

Add `TokenProfileName`, `BudgetPressureLevel`, `ComplexityLevel` to the imports from `./types` at the top of `lib/backend.ts`.

Add `computeEffectiveModelTier` to the `module.exports` block at the bottom. Preserve all existing exports.

- [ ] **Step 4.4: Run the test**

```bash
npx jest tests/unit/backend-effective-tier.test.ts 2>&1 | tail -10
```

Expected: all 15 tests pass.

- [ ] **Step 4.5: Run lint and build:check**

```bash
npm run lint && npm run build:check
```

Expected: zero errors.

- [ ] **Step 4.6: Commit**

```bash
git add lib/backend.ts tests/unit/backend-effective-tier.test.ts
git commit -m "feat(backend): add computeEffectiveModelTier with 3x4x3 decision matrix

New pure function in lib/backend.ts that takes the base tier from
MODEL_PROFILES, the token_profile preference, the current budget
pressure level, and the task complexity, and returns a possibly-
downgraded model tier.

Logic:
- quality profile: only downgrades on critical pressure (1 step)
- balanced profile: moderate downgrade (0-2 steps) based on pressure
  and complexity intersection
- frugal profile: aggressive downgrade (0-2 steps) even at low pressure

Tier order is opus → sonnet → haiku with floor at haiku. Unknown
tiers pass through unchanged (defensive).

Implementation uses an explicit table-driven _lookupDowngradeCount
helper to keep the decision matrix auditable. 15 unit tests cover
all major cells of the 3x4x3 matrix plus boundary floors.

Part of spec 4/4 of the gsd-2-selective-adoption milestone."
```

---

## Task 5: Extend resolveModelForAgent with effectiveTierOverride

**Files:**
- Modify: `lib/utils.ts`

- [ ] **Step 5.1: Locate resolveModelForAgent**

```bash
grep -n 'function resolveModelForAgent' lib/utils.ts
```

Expected: shows the function definition (around line 1196 per Spec 4 investigation).

Read the function body and understand:
1. Its current signature: `resolveModelForAgent(config, agentType, cwd?)`
2. How it uses `MODEL_PROFILES[agentType][config.model_profile]` to pick a tier
3. How it calls `resolveBackendModel(backend, tier)` (or similar) if `cwd` is provided

- [ ] **Step 5.2: Add the optional override parameter**

Modify the function signature and body. The new parameter is an options object so future extensions don't keep growing the parameter list:

```typescript
export function resolveModelForAgent(
  config: GrdConfig,
  agentType: string,
  cwd?: string,
  options?: { effectiveTierOverride?: ModelTier },
): string {
  // Existing body:
  const profile = config.model_profile || 'balanced';
  const baseTier = (MODEL_PROFILES[agentType] && MODEL_PROFILES[agentType][profile]) || 'sonnet';

  // NEW: use the override if provided, otherwise use the profile lookup
  const effectiveTier = options?.effectiveTierOverride || baseTier;

  // Rest of existing body — use effectiveTier where the old code used baseTier
  // (likely: pass effectiveTier to resolveBackendModel)
  // ... existing code ...
}
```

**CRITICAL:** Read the actual current body of `resolveModelForAgent` and adapt carefully. The effective tier is what gets passed downstream to pick a concrete model name. Do NOT change the existing default behavior — when `effectiveTierOverride` is absent, the function must return the same result as before.

- [ ] **Step 5.3: Run the existing utils tests**

```bash
npx jest tests/unit/utils.test.ts 2>&1 | tail -10
```

Expected: all existing tests pass. The backward-compatible extension should not break anything.

- [ ] **Step 5.4: Run lint and build:check**

```bash
npm run lint && npm run build:check
```

Expected: zero errors.

- [ ] **Step 5.5: Commit**

```bash
git add lib/utils.ts
git commit -m "feat(utils): resolveModelForAgent accepts effectiveTierOverride

Backward-compatible extension — adds an optional 4th parameter
'options: { effectiveTierOverride?: ModelTier }'. When provided, the
function uses the override instead of looking up the tier from
MODEL_PROFILES[agentType][profile]. Callers that don't pass the option
get existing behavior.

Used by the Spec 4 call-site wire-ups (autopilot, evolve, autoresearch)
which compute an effective tier via computeEffectiveModelTier before
invoking resolveModelForAgent.

Part of spec 4/4 of the gsd-2-selective-adoption milestone."
```

---

## Task 6: Add getStates accessor to the Scheduler interface

**Files:**
- Modify: `lib/scheduler.ts`

The call-site wire-ups need to read live scheduler state (for `computeBudgetPressureLevel` and for `estimateComplexity`'s `recentSamples`). Currently the scheduler exposes `getState` (singular) and `loadPersistedState`, but not a bulk states accessor. Add one.

- [ ] **Step 6.1: Find the Scheduler interface definition**

```bash
grep -n 'interface Scheduler\|function createScheduler' lib/scheduler.ts
```

Expected: shows the `Scheduler` interface and the `createScheduler` factory that returns an object matching it.

- [ ] **Step 6.2: Add getStates to the interface**

In the `Scheduler` interface (around line 483 per Spec 2A), add:

```typescript
  /**
   * Returns a snapshot of the current per-account states map. Used by
   * the Spec 4 budget pressure detection and complexity estimation
   * wire-ups. Do NOT mutate the returned map — it is shared with the
   * scheduler's internal state.
   */
  getStates(): Map<string, BackendUsageState>;
```

- [ ] **Step 6.3: Implement getStates in createScheduler**

Find the object literal returned by `createScheduler` (likely at the bottom of the function). Add the method implementation:

```typescript
  // Inside the returned object literal:
  getStates(): Map<string, BackendUsageState> {
    return states;
  },
```

Where `states` is the existing module-level or closure-scoped state map used by `_spawnWithRetry`.

- [ ] **Step 6.4: Run existing scheduler tests**

```bash
npx jest tests/unit/scheduler 2>&1 | tail -10
```

Expected: all existing scheduler tests pass.

- [ ] **Step 6.5: Commit**

```bash
git add lib/scheduler.ts
git commit -m "feat(scheduler): add getStates accessor for Spec 4 wire-ups

New method on the Scheduler interface. Returns the live per-account
states map so callers (autopilot, evolve, autoresearch) can read
samples and pressure state for adaptive model-tier routing.

The returned map is shared with the scheduler's internal state — do
not mutate. For future safety, a deep-copy variant can be added
later if mutation becomes a concern.

Part of spec 4/4 of the gsd-2-selective-adoption milestone."
```

---

## Task 7: Wire autopilot to call the adaptive chain

**Files:**
- Modify: `lib/autopilot.ts`

- [ ] **Step 7.1: Find the agent dispatch call site**

```bash
grep -n 'resolveModelForAgent\|spawnAgent\|dispatchAgent' lib/autopilot.ts | head -15
```

Expected: shows call sites where agents are dispatched (likely several, but the main ones are the plan/execute/verify steps in the phase pipeline).

Read the context around each call site to understand which is the "main agent dispatch" where we should apply the adaptive routing. There may be multiple sites.

- [ ] **Step 7.2: Add the imports**

At the top of `lib/autopilot.ts`, add the imports needed for the wire-up:

```typescript
const { estimateComplexity } = require('./complexity') as {
  estimateComplexity: (opts: {
    agentType: string;
    promptLength?: number;
    recentSamples?: { duration: number; tokenEstimate: number }[];
  }) => ComplexityLevel;
};

const { computeBudgetPressureLevel } = require('./scheduler') as {
  computeBudgetPressureLevel: (
    states: Map<string, BackendUsageState>,
    priority: BackendId[],
    accounts: SuperpowersConfig['accounts'],
    thresholds?: BudgetPressureThresholds,
  ) => BudgetPressureLevel;
};

const { computeEffectiveModelTier } = require('./backend') as {
  computeEffectiveModelTier: (opts: {
    baseTier: ModelTier;
    tokenProfile: TokenProfileName;
    pressure: BudgetPressureLevel;
    complexity: ComplexityLevel;
  }) => ModelTier;
};
```

Also add the type imports: `ComplexityLevel`, `BudgetPressureLevel`, `TokenProfileName`, `BudgetPressureThresholds`, `ModelTier`, `BackendUsageState`, `SuperpowersConfig`, `BackendId` from `./types`.

- [ ] **Step 7.3: Add a helper function for the chain**

Near the top of `lib/autopilot.ts` (after the imports and existing helpers), add a local helper to avoid duplicating the chain at each call site:

```typescript
/**
 * Computes the effective model tier for an agent dispatch by running
 * the Spec 4 chain: estimateComplexity → computeBudgetPressureLevel →
 * computeEffectiveModelTier. Returns the tier to pass to
 * resolveModelForAgent as effectiveTierOverride.
 *
 * When scheduler is null (no accountRotation), returns the base tier
 * unchanged.
 */
function _getEffectiveTierForDispatch(
  agentType: string,
  prompt: string,
  config: GrdConfig,
  scheduler: Scheduler | null,
  schedulerConfig: SchedulerConfig | undefined,
  superpowersConfig: SuperpowersConfig | undefined,
): ModelTier {
  const profile = config.model_profile || 'balanced';
  const baseTier: ModelTier =
    (MODEL_PROFILES[agentType] && MODEL_PROFILES[agentType][profile]) ||
    'sonnet';

  if (!scheduler || !schedulerConfig || !superpowersConfig) {
    return baseTier;
  }

  const states = scheduler.getStates();

  // Extract recent samples for this agent type (if any). In this first
  // pass we pass undefined rather than filtering — estimateComplexity
  // handles the absence gracefully.
  const complexity = estimateComplexity({
    agentType,
    promptLength: prompt.length,
  });

  const pressure = computeBudgetPressureLevel(
    states,
    schedulerConfig.backend_priority,
    superpowersConfig.accounts,
    schedulerConfig.budget_pressure_thresholds,
  );

  const tokenProfile: TokenProfileName = config.token_profile || 'balanced';

  return computeEffectiveModelTier({
    baseTier,
    tokenProfile,
    pressure,
    complexity,
  });
}
```

**Note on `recentSamples`:** The first pass does NOT pass `recentSamples` to `estimateComplexity`. This keeps the wire-up simple. A future iteration can extract per-agent-type samples from `states` if the demotion signal proves valuable. For now, the prompt-length signal alone is sufficient.

- [ ] **Step 7.4: Update each agent dispatch call site**

Find each site that calls `resolveModelForAgent(...)` in autopilot. For each, change:

```typescript
const model = resolveModelForAgent(config, agentType, cwd);
```

to:

```typescript
const effectiveTier = _getEffectiveTierForDispatch(
  agentType,
  prompt,
  config,
  scheduler,
  schedulerConfig,
  superpowersConfig,
);
const model = resolveModelForAgent(config, agentType, cwd, {
  effectiveTierOverride: effectiveTier,
});
```

The variables `config`, `scheduler`, `schedulerConfig`, `superpowersConfig`, and `prompt` must be in scope. If they aren't, thread them through from the enclosing function's parameters or closure.

**Discover all the call sites:**

```bash
grep -n 'resolveModelForAgent' lib/autopilot.ts
```

Update each one. Some may use a different variable name for the prompt (e.g., `agentContext`, `taskPrompt`). Adapt accordingly.

- [ ] **Step 7.5: Type check**

```bash
npm run build:check
```

Expected: zero errors. If there are errors, they're likely:
- A missing variable in scope at the call site (thread it through)
- A type mismatch on the helper's parameters
- A circular import (check module resolution)

- [ ] **Step 7.6: Lint**

```bash
npm run lint
```

Expected: zero errors.

- [ ] **Step 7.7: Run autopilot tests**

```bash
npx jest tests/unit/autopilot.test.ts 2>&1 | tail -15
```

Expected: all existing tests pass (backward-compatible wire-up).

- [ ] **Step 7.8: Commit**

```bash
git add lib/autopilot.ts
git commit -m "feat(autopilot): wire adaptive model-tier routing chain

Before each agent dispatch, autopilot now:
1. Calls estimateComplexity(agentType, promptLength) to classify the
   task as low/medium/high.
2. Calls computeBudgetPressureLevel(scheduler.getStates()) to classify
   the current budget pressure as none/warning/high/critical.
3. Calls computeEffectiveModelTier to get the possibly-downgraded
   tier based on (model_profile, token_profile, pressure, complexity).
4. Passes the effective tier to resolveModelForAgent as
   effectiveTierOverride, which becomes the concrete model used for
   the spawn.

A new _getEffectiveTierForDispatch private helper wraps the chain so
the multiple dispatch call sites can share it without duplication.

When scheduler is null (no accountRotation), the chain returns the
baseTier unchanged — preserving pre-Spec-4 behavior.

Part of spec 4/4 of the gsd-2-selective-adoption milestone."
```

---

## Task 8: Wire evolve to call the adaptive chain

**Files:**
- Modify: `lib/evolve.ts` (or `lib/evolve/` directory contents — check actual layout)

- [ ] **Step 8.1: Locate the dispatch call sites in evolve**

```bash
grep -rn 'resolveModelForAgent' lib/evolve* 2>/dev/null
```

Expected: shows call sites in evolve's agent dispatch logic.

- [ ] **Step 8.2: Add the same wire-up as autopilot**

Apply the same pattern as Task 7:
1. Import `estimateComplexity`, `computeBudgetPressureLevel`, `computeEffectiveModelTier`
2. Consider using the same `_getEffectiveTierForDispatch` helper — if autopilot's copy is private, either duplicate it locally OR extract it to a shared utility in `lib/backend.ts` or `lib/utils.ts`.

**Recommendation:** Extract `_getEffectiveTierForDispatch` to `lib/backend.ts` as an exported `getEffectiveTierForDispatch` function so autopilot, evolve, and autoresearch can share it. This avoids code duplication.

If extracting:
1. Move the helper from `lib/autopilot.ts` to `lib/backend.ts` (remove the underscore prefix)
2. Export it
3. Update `lib/autopilot.ts` to import it
4. Use it in `lib/evolve.ts`

- [ ] **Step 8.3: Update each call site in evolve**

Same pattern as autopilot's Step 7.4.

- [ ] **Step 8.4: Type check and lint**

```bash
npm run build:check && npm run lint
```

Expected: zero errors.

- [ ] **Step 8.5: Run evolve tests**

```bash
npx jest tests/unit/evolve 2>&1 | tail -10
```

Expected: all existing tests pass.

- [ ] **Step 8.6: Commit**

```bash
git add lib/evolve* lib/backend.ts lib/autopilot.ts
git commit -m "feat(evolve): wire adaptive model-tier routing chain

Mirrors the Spec 4 wire-up added to lib/autopilot.ts. Each agent
dispatch in the evolve loop now calls the complexity + pressure +
effective-tier chain before resolveModelForAgent, so evolve respects
token_profile and reacts to budget pressure just like autopilot.

If the helper was extracted to lib/backend.ts in this task, also
updates lib/autopilot.ts to import from there.

Part of spec 4/4 of the gsd-2-selective-adoption milestone."
```

---

## Task 9: Wire autoresearch to call the adaptive chain

**Files:**
- Modify: `lib/autoresearch.ts`

Same pattern as Tasks 7 and 8.

- [ ] **Step 9.1: Locate the dispatch call sites**

```bash
grep -n 'resolveModelForAgent\|_spawnClaude\|scheduler.spawn' lib/autoresearch.ts
```

Expected: shows the `_spawnClaude` wrapper added in Spec 2A + call sites.

- [ ] **Step 9.2: Add the imports and wire-up**

Apply the same pattern. Note that autoresearch has TWO call sites (survey at ~line 402, experiment at ~line 455 from the Spec 2A investigation). Both need the wire-up.

If the experiment call site uses `captureOutput: true` (which forces the sync fallback path), the adaptive routing still applies — we just compute a different model name before calling the spawn, regardless of which backend path is taken.

- [ ] **Step 9.3: Type check and lint**

```bash
npm run build:check && npm run lint
```

- [ ] **Step 9.4: Run integration tests**

```bash
npx jest tests/integration/autoresearch-scheduler.test.ts 2>&1 | tail -10
```

Expected: all 4 existing tests pass (backward-compatible extension).

- [ ] **Step 9.5: Commit**

```bash
git add lib/autoresearch.ts
git commit -m "feat(autoresearch): wire adaptive model-tier routing chain

Mirrors the Spec 4 wire-up added to autopilot and evolve. The two
_spawnClaude call sites (survey + experiment iteration) now compute
effective tier via the complexity + pressure chain before dispatching.

autoresearch now respects token_profile and reacts to budget pressure.

Part of spec 4/4 of the gsd-2-selective-adoption milestone."
```

---

## Task 10: CLI setting for token_profile

**Files:**
- Modify: `bin/grd-tools.ts`

- [ ] **Step 10.1: Find the existing gd settings dispatch**

```bash
grep -n "'settings'\|case 'settings'\|cmdSettings" bin/grd-tools.ts | head -10
```

Expected: shows the dispatch block for `gd settings <key> <value>`.

Read the existing pattern for `model_profile` to follow the same shape.

- [ ] **Step 10.2: Add a case for token_profile**

Find the switch/case (or if/else chain) that handles different settings keys. Add:

```typescript
case 'token_profile': {
  const valid: TokenProfileName[] = ['frugal', 'balanced', 'quality'];
  if (!valid.includes(value as TokenProfileName)) {
    error(
      `Invalid token_profile value '${value}'. Valid: ${valid.join(', ')}`,
    );
  }
  const currentConfig = loadConfig(cwd);
  currentConfig.token_profile = value as TokenProfileName;
  saveConfig(cwd, currentConfig);
  output(
    { updated: 'token_profile', value },
    raw,
    `token_profile: ${value}`,
  );
  break;
}
```

**Note:** The exact variable names (`currentConfig`, `cwd`, `value`, `raw`) must match the surrounding code. Read a few nearby cases (e.g., `model_profile`, `commit_docs`) to see the actual variable names used.

Also add `TokenProfileName` to the type imports at the top of the file.

- [ ] **Step 10.3: Smoke-test the new setting**

```bash
# Run in a temp dir to avoid mutating your real .planning/config.json
cd /tmp
mkdir grd-smoke && cd grd-smoke
mkdir -p .planning
echo '{}' > .planning/config.json
node /Users/neo/Developer/Projects/GetResearchDone/.worktrees/gsd2-token-opt/bin/gd.js settings token_profile frugal
cat .planning/config.json
```

Expected: `.planning/config.json` contains `"token_profile": "frugal"`.

Also test validation:

```bash
node /Users/neo/Developer/Projects/GetResearchDone/.worktrees/gsd2-token-opt/bin/gd.js settings token_profile invalid 2>&1 | head -5
```

Expected: error message `Invalid token_profile value 'invalid'. Valid: frugal, balanced, quality`.

Clean up:

```bash
cd /Users/neo/Developer/Projects/GetResearchDone/.worktrees/gsd2-token-opt
rm -rf /tmp/grd-smoke
```

- [ ] **Step 10.4: Type check and lint**

```bash
npm run build:check && npm run lint
```

Expected: zero errors.

- [ ] **Step 10.5: Commit**

```bash
git add bin/grd-tools.ts
git commit -m "feat(cli): add 'gd settings token_profile' command

New setting case in bin/grd-tools.ts matching the existing
'model_profile' pattern. Accepts 'frugal', 'balanced', or 'quality';
validates and writes to .planning/config.json.

Part of spec 4/4 of the gsd-2-selective-adoption milestone."
```

---

## Task 11: Integration test for token_profile end-to-end

**Files:**
- Create: `tests/integration/token-profile.test.ts`

- [ ] **Step 11.1: Write the integration test**

Create `tests/integration/token-profile.test.ts`:

```typescript
'use strict';

/**
 * Integration test for Spec 4's adaptive model-tier routing chain.
 *
 * Verifies that autopilot, when dispatching an agent, calls
 * estimateComplexity + computeBudgetPressureLevel + computeEffectiveModelTier
 * and uses the resulting effective tier. Uses a fake scheduler with
 * crafted state to trigger each code path.
 */

import type {
  BackendUsageState,
  TokenProfileName,
  ModelTier,
} from '../../lib/types';

const { estimateComplexity } = require('../../lib/complexity') as {
  estimateComplexity: (opts: {
    agentType: string;
    promptLength?: number;
  }) => 'low' | 'medium' | 'high';
};

const { computeBudgetPressureLevel } = require('../../lib/scheduler') as {
  computeBudgetPressureLevel: (
    states: Map<string, BackendUsageState>,
    priority: string[],
    accounts: { [k: string]: Array<{ config_dir: string }> },
  ) => 'none' | 'warning' | 'high' | 'critical';
};

const { computeEffectiveModelTier } = require('../../lib/backend') as {
  computeEffectiveModelTier: (opts: {
    baseTier: ModelTier;
    tokenProfile: TokenProfileName;
    pressure: 'none' | 'warning' | 'high' | 'critical';
    complexity: 'low' | 'medium' | 'high';
  }) => ModelTier;
};

function makeLowPressureState(): Map<string, BackendUsageState> {
  const states = new Map<string, BackendUsageState>();
  states.set('claude/~/.claude', {
    samples: [],
    ewma_tokens_per_task: 0,
    tokens_consumed_in_window: 10_000,
    tokens_reserved: 0,
    in_flight_count: 0,
    token_budget: 100_000,
    budget_learned: false,
    budget_confidence: 0,
  });
  return states;
}

function makeHighPressureState(): Map<string, BackendUsageState> {
  const states = new Map<string, BackendUsageState>();
  states.set('claude/~/.claude', {
    samples: [],
    ewma_tokens_per_task: 0,
    tokens_consumed_in_window: 85_000,
    tokens_reserved: 0,
    in_flight_count: 0,
    token_budget: 100_000,
    budget_learned: false,
    budget_confidence: 0,
  });
  return states;
}

describe('Spec 4 end-to-end adaptive routing', () => {
  const accounts = {
    claude: [{ config_dir: '~/.claude' }],
  };

  it('low pressure + balanced profile + high complexity → no downgrade', () => {
    const states = makeLowPressureState();
    const pressure = computeBudgetPressureLevel(states, ['claude'], accounts);
    const complexity = estimateComplexity({ agentType: 'grd-planner' });
    const tier = computeEffectiveModelTier({
      baseTier: 'opus',
      tokenProfile: 'balanced',
      pressure,
      complexity,
    });
    expect(pressure).toBe('none');
    expect(complexity).toBe('high');
    expect(tier).toBe('opus');
  });

  it('high pressure + balanced profile + high complexity → no downgrade', () => {
    const states = makeHighPressureState();
    const pressure = computeBudgetPressureLevel(states, ['claude'], accounts);
    const complexity = estimateComplexity({ agentType: 'grd-planner' });
    const tier = computeEffectiveModelTier({
      baseTier: 'opus',
      tokenProfile: 'balanced',
      pressure,
      complexity,
    });
    expect(pressure).toBe('high');
    expect(tier).toBe('opus'); // balanced + high pressure + high complexity = no downgrade
  });

  it('high pressure + balanced profile + low complexity → 2 downgrades (haiku)', () => {
    const states = makeHighPressureState();
    const pressure = computeBudgetPressureLevel(states, ['claude'], accounts);
    const complexity = estimateComplexity({ agentType: 'grd-verifier' });
    const tier = computeEffectiveModelTier({
      baseTier: 'opus',
      tokenProfile: 'balanced',
      pressure,
      complexity,
    });
    expect(pressure).toBe('high');
    expect(complexity).toBe('low');
    expect(tier).toBe('haiku');
  });

  it('quality profile ignores high pressure for high complexity agents', () => {
    const states = makeHighPressureState();
    const pressure = computeBudgetPressureLevel(states, ['claude'], accounts);
    const complexity = estimateComplexity({ agentType: 'grd-planner' });
    const tier = computeEffectiveModelTier({
      baseTier: 'opus',
      tokenProfile: 'quality',
      pressure,
      complexity,
    });
    expect(tier).toBe('opus');
  });

  it('frugal profile downgrades even low-pressure medium-complexity tasks', () => {
    const states = makeLowPressureState();
    const pressure = computeBudgetPressureLevel(states, ['claude'], accounts);
    const complexity = estimateComplexity({ agentType: 'grd-executor' });
    const tier = computeEffectiveModelTier({
      baseTier: 'opus',
      tokenProfile: 'frugal',
      pressure,
      complexity,
    });
    expect(pressure).toBe('none');
    expect(complexity).toBe('medium');
    expect(tier).toBe('sonnet');
  });
});
```

- [ ] **Step 11.2: Run the integration test**

```bash
npx jest tests/integration/token-profile.test.ts 2>&1 | tail -10
```

Expected: all 5 tests pass.

- [ ] **Step 11.3: Commit**

```bash
git add tests/integration/token-profile.test.ts
git commit -m "test(token-profile): add integration test for adaptive routing chain

5 end-to-end scenarios exercising the full chain:
1. low pressure + balanced + high complexity → no downgrade
2. high pressure + balanced + high complexity → no downgrade (respects expertise need)
3. high pressure + balanced + low complexity → 2-step downgrade (opus → haiku)
4. quality profile ignores high pressure for expert agents
5. frugal profile downgrades even low-pressure medium-complexity tasks

Uses crafted scheduler state rather than a real scheduler — tests
are fast and deterministic.

Part of spec 4/4 of the gsd-2-selective-adoption milestone."
```

---

## Task 12: Coverage thresholds for new files

**Files:**
- Modify: `jest.config.js`

- [ ] **Step 12.1: Run coverage to measure actual values**

```bash
npx jest tests/unit/complexity.test.ts tests/unit/scheduler-pressure.test.ts tests/unit/backend-effective-tier.test.ts --coverage --collectCoverageFrom='lib/complexity.ts' 2>&1 | tail -15
```

Note the actual coverage percentages for `lib/complexity.ts`.

- [ ] **Step 12.2: Add a threshold entry to jest.config.js**

Open `jest.config.js`. In `coverageThreshold`, add:

```javascript
'./lib/complexity.ts': { lines: 95, functions: 100, branches: 85 },
```

If the actual coverage is lower than 95/100/85, adjust the thresholds to match. Do NOT over-target — if the `||` fallback for unknown agents has an uncovered branch, lower to `80` instead of writing an artificial test.

- [ ] **Step 12.3: Run the full test suite to verify thresholds**

```bash
npm test 2>&1 | tail -15
```

Expected: all tests pass, thresholds met.

- [ ] **Step 12.4: Commit**

```bash
git add jest.config.js
git commit -m "test(complexity): add coverage threshold for lib/complexity.ts

Per-file threshold matching actual coverage from the new test file.
Tested via tests/unit/complexity.test.ts and the integration test
tests/integration/token-profile.test.ts.

Part of spec 4/4 of the gsd-2-selective-adoption milestone."
```

---

## Task 13: Documentation — CLAUDE.md + CHANGELOG

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/CHANGELOG.md`

- [ ] **Step 13.1: Add a CLAUDE.md section**

Open `CLAUDE.md`. Find a suitable location near existing config documentation (look for references to `model_profile` or `settings`). Add:

```markdown
### Token profile (Spec 4)

`token_profile` is a user preference in `.planning/config.json` orthogonal
to `model_profile`. Values: `frugal`, `balanced` (default), `quality`.
Controls adaptive model-tier downgrade under budget pressure or low task
complexity. Set via `gd settings token_profile <value>`.

- `quality`: never downgrade unless budget pressure is ≥95% (critical).
- `balanced`: downgrade 0-2 steps based on (pressure, complexity). Good
  default for most users.
- `frugal`: aggressively downgrade non-high-complexity tasks even at
  low pressure.

Budget pressure is classified as `none` / `warning` (≥60%) / `high`
(≥80%) / `critical` (≥95%) per account. Autopilot, evolve, and
autoresearch check this before each agent dispatch. Thresholds are
configurable via `.planning/config.json` `scheduler.budget_pressure_thresholds`.
```

If CLAUDE.md has no relevant existing section, add this at the end of a settings-related section or near the "Backend Capabilities" table.

- [ ] **Step 13.2: Add CHANGELOG entries**

Open `docs/CHANGELOG.md`. Under the existing `## [Unreleased]` section, merge into existing subsections:

```markdown
### Added
- **Token optimization system (Spec 4)** — adaptive model-tier routing
  that downgrades expensive agents to cheaper tiers based on budget
  pressure and task complexity.
  - New `token_profile` preference in `.planning/config.json`
    (`frugal` / `balanced` / `quality`, default `balanced`), orthogonal
    to `model_profile`. Set via `gd settings token_profile <value>`.
  - New `lib/complexity.ts` with `estimateComplexity` pure function
    that classifies tasks as low/medium/high based on agent baseline
    (table-driven), prompt length, and recent sample tail average.
  - New `isBudgetPressured` and `computeBudgetPressureLevel` exported
    from `lib/scheduler.ts`. Classifies pressure as `none` / `warning`
    (≥60%) / `high` (≥80%) / `critical` (≥95%) across all priority
    accounts.
  - New `computeEffectiveModelTier` exported from `lib/backend.ts`.
    Combines profile + pressure + complexity via an explicit 3×4×3
    decision matrix to return a possibly-downgraded model tier.
  - New `SchedulerConfig.budget_pressure_thresholds` field for
    customizing the pressure classification cutoffs.
  - New `Scheduler.getStates()` accessor for reading live per-account
    state (used by the adaptive routing wire-ups).

### Changed
- **`gd autopilot`, `gd evolve`, and autoresearch now use adaptive
  model-tier routing.** Before each agent dispatch, these loops call
  the Spec 4 chain (complexity → pressure → effective tier) and pass
  the effective tier to `resolveModelForAgent`. When the scheduler is
  absent, behavior is unchanged from pre-Spec-4.
```

- [ ] **Step 13.3: Scan docs**

```bash
node bin/gd.js scan --file CLAUDE.md
node bin/gd.js scan --file docs/CHANGELOG.md
```

Expected: both exit 0.

- [ ] **Step 13.4: Commit**

```bash
git add CLAUDE.md docs/CHANGELOG.md
git commit -m "docs: add Spec 4 token optimization documentation

- CLAUDE.md: new section documenting token_profile preference and
  budget pressure classification
- docs/CHANGELOG.md: Unreleased entries covering the new config
  field, four new pure functions, new CLI setting, and the autopilot/
  evolve/autoresearch wire-ups

Part of spec 4/4 of the gsd-2-selective-adoption milestone."
```

---

## Task 14: Final verification

**Files:** none (verification only)

- [ ] **Step 14.1: Run the full test suite**

```bash
npm test 2>&1 | tail -15
```

Expected: all tests pass. Previous count was 8,266 from Spec 3. This spec adds ~37 new tests (12 + 10 + 15 + 5 = 42 new tests, but some are variants of existing patterns so the net may be slightly different). Expected total around 8,300+.

- [ ] **Step 14.2: Run lint**

```bash
npm run lint
```

Expected: zero errors.

- [ ] **Step 14.3: Run type check**

```bash
npm run build:check
```

Expected: zero errors.

- [ ] **Step 14.4: Run format check (scoped to spec 4 files only)**

```bash
npm run format:check 2>&1 | tail -10
```

If format-check fails on the files this plan modified, run prettier ONLY on those files:

```bash
npx prettier --write lib/complexity.ts lib/scheduler.ts lib/backend.ts lib/types.ts lib/utils.ts lib/autopilot.ts lib/evolve.ts lib/autoresearch.ts bin/grd-tools.ts tests/unit/complexity.test.ts tests/unit/scheduler-pressure.test.ts tests/unit/backend-effective-tier.test.ts tests/integration/token-profile.test.ts jest.config.js docs/CHANGELOG.md CLAUDE.md
git add -u
git commit -m "chore: apply prettier formatting to spec 4 files"
```

**CRITICAL: Do NOT run `npm run format` without specific paths.** Format ONLY the files this plan modified.

- [ ] **Step 14.5: Run scanner sanity check**

```bash
node bin/gd.js scan --all 2>&1 | tail -5
```

Expected: `scan: clean — <N> file(s) checked`.

- [ ] **Step 14.6: Smoke-test the chain via Node REPL**

```bash
node -e '
const { estimateComplexity } = require("./lib/complexity");
const { computeBudgetPressureLevel } = require("./lib/scheduler");
const { computeEffectiveModelTier } = require("./lib/backend");

const states = new Map();
states.set("claude/~/.claude", {
  samples: [],
  ewma_tokens_per_task: 0,
  tokens_consumed_in_window: 85000,
  tokens_reserved: 0,
  in_flight_count: 0,
  token_budget: 100000,
  budget_learned: false,
  budget_confidence: 0,
});

const pressure = computeBudgetPressureLevel(
  states,
  ["claude"],
  { claude: [{ config_dir: "~/.claude" }] },
);
const complexity = estimateComplexity({ agentType: "grd-verifier" });
const tier = computeEffectiveModelTier({
  baseTier: "opus",
  tokenProfile: "balanced",
  pressure,
  complexity,
});

console.log("pressure:", pressure);
console.log("complexity:", complexity);
console.log("effective tier:", tier);
'
```

Expected: `pressure: high`, `complexity: low`, `effective tier: haiku`.

- [ ] **Step 14.7: Verify the commit chain**

```bash
git log --oneline main..HEAD
```

Expected: 13–15 commits (one per task plus any format/fix commits).

- [ ] **Step 14.8: Final checklist**

Confirm each item by reading the file or running the command:

- [ ] `lib/complexity.ts` exists with `estimateComplexity` and `AGENT_BASELINE_COMPLEXITY`
- [ ] `lib/scheduler.ts` exports `isBudgetPressured`, `computeBudgetPressureLevel`, `getStates`
- [ ] `lib/backend.ts` exports `computeEffectiveModelTier`
- [ ] `lib/types.ts` has new `TokenProfileName`, `BudgetPressureLevel`, `ComplexityLevel`, `BudgetPressureThresholds`
- [ ] `lib/types.ts` `GrdConfig.token_profile` and `SchedulerConfig.budget_pressure_thresholds` added
- [ ] `lib/utils.ts` `resolveModelForAgent` accepts `effectiveTierOverride`
- [ ] `lib/autopilot.ts` calls the adaptive chain before each dispatch
- [ ] `lib/evolve.ts` same
- [ ] `lib/autoresearch.ts` same
- [ ] `bin/grd-tools.ts` has `gd settings token_profile` case
- [ ] `tests/unit/complexity.test.ts` — 12 tests passing
- [ ] `tests/unit/scheduler-pressure.test.ts` — 10 tests passing
- [ ] `tests/unit/backend-effective-tier.test.ts` — 15 tests passing
- [ ] `tests/integration/token-profile.test.ts` — 5 tests passing
- [ ] `jest.config.js` per-file threshold for `lib/complexity.ts`
- [ ] `CLAUDE.md` section documenting `token_profile`
- [ ] `docs/CHANGELOG.md` Unreleased entries added
- [ ] `npm test` passes
- [ ] `npm run lint` passes
- [ ] `npm run build:check` passes
- [ ] `npm run format:check` passes (or format applied to spec 4 files only)
- [ ] `gd scan --all` exits 0

---

## Out of scope (follow-up items)

These were explicitly deferred during brainstorming and must NOT be added to this plan:

- **Non-critical spawn rejection at 95% pressure.** Critical level logs but does NOT block spawns.
- **Per-agent frontmatter complexity hints.** Agent markdown files get no new fields.
- **Configurable complexity heuristic cutoffs.** `20000` / `3000` / `1500` are hardcoded.
- **Pressure history persistence to disk.** Pressure is computed fresh per spawn.
- **Spec 2B: per-spawn idle timeout watchdog.** Still conditional.
- **Spec 3B: LLM fallback for mechanical completion.** Still conditional.
- **Refactoring `lib/autopilot.ts` / `lib/scheduler.ts` monoliths.**
- **New backend capability flags.**
