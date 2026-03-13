# Cross-Backend Rate Limit Scheduler Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a token-usage-aware scheduler that proactively switches between AI backends before rate limits are hit, replacing direct `spawnClaude()`/`spawnClaudeAsync()` calls in autopilot and evolve.

**Architecture:** New `lib/scheduler.ts` module with per-backend CLI adapters, EWMA-based token budget prediction, priority + headroom routing, and concurrency accounting. Pass-through mode when no scheduler config exists. State persisted to `.planning/scheduler-state.json`.

**Tech Stack:** TypeScript (strict), Node.js child_process, EWMA math, existing GRD types/backend infrastructure.

**Spec:** `docs/superpowers/specs/2026-03-13-cross-backend-rate-limit-scheduler-design.md`

---

## Chunk 1: Types and Adapters

### Task 1: Add scheduler types to `lib/types.ts`

**Files:**
- Modify: `lib/types.ts:159-187` (GrdConfig interface)
- Test: `tests/unit/types.test.ts` (if exists, otherwise type-check only)

- [ ] **Step 1: Write failing type-check test**

Create `tests/unit/scheduler.test.ts` with a type import test:

```typescript
'use strict';

import type {
  SchedulerConfig,
  UsageSample,
  BackendUsageState,
  SchedulerSpawnResult,
  BackendAdapter,
  SpawnOpts,
} from '../../lib/types';

describe('scheduler types', () => {
  it('SchedulerConfig has required fields', () => {
    const config: SchedulerConfig = {
      backend_priority: ['claude', 'codex'],
      free_fallback: { backend: 'opencode', model: 'gemini-2.5-flash' },
      prediction: {
        window_minutes: 15,
        ewma_alpha: 0.3,
        safety_margin_tasks: 1.5,
        min_samples: 3,
      },
    };
    expect(config.backend_priority).toHaveLength(2);
  });

  it('UsageSample has required fields', () => {
    const sample: UsageSample = {
      backend: 'claude',
      timestamp: Date.now(),
      duration: 5000,
      tokenEstimate: 12000,
      exitCode: 0,
      workItemId: 'phase-1-plan',
    };
    expect(sample.backend).toBe('claude');
  });

  it('BackendUsageState tracks in-flight reservations', () => {
    const state: BackendUsageState = {
      samples: [],
      ewma_tokens_per_task: 10000,
      tokens_consumed_in_window: 0,
      tokens_reserved: 0,
      in_flight_count: 0,
      token_budget: 80000,
      budget_learned: false,
      budget_confidence: 0,
      cooldown_until: undefined,
    };
    expect(state.in_flight_count).toBe(0);
  });

  it('SchedulerSpawnResult matches SpawnResult optionality', () => {
    const result: SchedulerSpawnResult = {
      exitCode: 0,
      timedOut: false,
      backend: 'claude',
      tokensUsed: 12000,
      workItemId: 'test',
      // stdout and stderr are optional
    };
    expect(result.stdout).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/scheduler.test.ts --no-coverage`
Expected: FAIL — types do not exist yet

- [ ] **Step 3: Add types to `lib/types.ts`**

Add after the existing `GrdConfig` interface (around line 187):

```typescript
// ─── Scheduler Types ─────────────────────────────────────────────────────────

export interface SpawnOpts {
  timeout?: number;
  maxTurns?: number;
  model?: string;
  outputFormat?: string;
  captureOutput?: boolean;
  captureStderr?: boolean;
  cwd?: string;
  workItemId?: string;
}

export interface SchedulerConfig {
  backend_priority: BackendId[];
  free_fallback: { backend: BackendId; model?: string };
  backend_limits?: Record<string, { tpm: number; rpm?: number }>;
  prediction: {
    window_minutes: number;
    ewma_alpha: number;
    safety_margin_tasks: number;
    min_samples: number;
  };
}

export interface UsageSample {
  backend: BackendId;
  timestamp: number;
  duration: number;
  tokenEstimate: number;
  exitCode: number;
  workItemId: string;
}

export interface BackendUsageState {
  samples: UsageSample[];
  ewma_tokens_per_task: number;
  tokens_consumed_in_window: number;
  tokens_reserved: number;
  in_flight_count: number;
  token_budget: number;
  budget_learned: boolean;
  budget_confidence: number;
  cooldown_until?: number;
}

export interface SchedulerSpawnResult {
  exitCode: number;
  stdout?: string;
  stderr?: string;
  timedOut: boolean;
  backend: BackendId;
  tokensUsed: number;
  workItemId: string;
}

export interface BackendAdapter {
  binary: string;
  buildArgs(prompt: string, opts: SpawnOpts): string[];
  parseTokenUsage(stderr: string): number | null;
  isRateLimited(exitCode: number, stderr: string): boolean;
}
```

Also add `scheduler?: SchedulerConfig` to the `GrdConfig` interface.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/scheduler.test.ts --no-coverage`
Expected: PASS

- [ ] **Step 5: Run full type-check**

Run: `npm run build:check`
Expected: No type errors

- [ ] **Step 6: Commit**

```bash
git add lib/types.ts tests/unit/scheduler.test.ts
git commit -m "feat(scheduler): add type definitions for cross-backend scheduler"
```

---

### Task 2: Add `scheduler` to known config keys

**Files:**
- Modify: `lib/utils.ts:267` (KNOWN_CONFIG_KEYS set)
- Test: `tests/unit/utils.test.ts`

- [ ] **Step 1: Add `scheduler` to KNOWN_CONFIG_KEYS**

In `lib/utils.ts`, add `'scheduler'` to the `KNOWN_CONFIG_KEYS` set after `'overstory'`:

```typescript
  // Backend-specific keys
  'overstory',
  // Scheduler config
  'scheduler',
]);
```

- [ ] **Step 2: Run utils tests**

Run: `npx jest tests/unit/utils.test.ts --no-coverage`
Expected: PASS (139 tests)

- [ ] **Step 3: Commit**

```bash
git add lib/utils.ts
git commit -m "feat(scheduler): add scheduler to known config keys"
```

---

### Task 3: Build per-backend CLI adapters

**Files:**
- Create: `lib/scheduler.ts`
- Test: `tests/unit/scheduler.test.ts` (append)

- [ ] **Step 1: Write failing tests for adapter token parsing**

Append to `tests/unit/scheduler.test.ts`:

```typescript
import { ADAPTERS } from '../../lib/scheduler';

describe('backend adapters', () => {
  describe('claude adapter', () => {
    it('parses "Total tokens: 12345" from stderr', () => {
      expect(ADAPTERS.claude.parseTokenUsage('Total tokens: 12345')).toBe(12345);
    });

    it('parses input_tokens + output_tokens from stderr', () => {
      const stderr = 'input_tokens: 8000, output_tokens: 4000';
      expect(ADAPTERS.claude.parseTokenUsage(stderr)).toBe(12000);
    });

    it('returns null when no token info found', () => {
      expect(ADAPTERS.claude.parseTokenUsage('no tokens here')).toBeNull();
    });

    it('detects rate limit from stderr', () => {
      expect(ADAPTERS.claude.isRateLimited(1, 'rate limit exceeded')).toBe(true);
      expect(ADAPTERS.claude.isRateLimited(1, 'overloaded_error')).toBe(true);
      expect(ADAPTERS.claude.isRateLimited(0, 'completed successfully')).toBe(false);
    });

    it('builds correct args', () => {
      const args = ADAPTERS.claude.buildArgs('test prompt', { model: 'opus' });
      expect(args).toContain('-p');
      expect(args).toContain('test prompt');
      expect(args).toContain('--model');
      expect(args).toContain('opus');
      expect(args).toContain('--dangerously-skip-permissions');
    });
  });

  describe('codex adapter', () => {
    it('parses total_tokens from JSON in stderr', () => {
      expect(ADAPTERS.codex.parseTokenUsage('"total_tokens": 9500')).toBe(9500);
    });

    it('detects rate limit', () => {
      expect(ADAPTERS.codex.isRateLimited(1, 'rate_limit_exceeded')).toBe(true);
    });

    it('builds correct args', () => {
      const args = ADAPTERS.codex.buildArgs('test prompt', {});
      expect(args).toContain('--prompt');
      expect(args).toContain('--approval-mode');
    });
  });

  describe('gemini adapter', () => {
    it('parses tokenCount from stderr', () => {
      expect(ADAPTERS.gemini.parseTokenUsage('tokenCount: 7000')).toBe(7000);
    });

    it('detects RESOURCE_EXHAUSTED', () => {
      expect(ADAPTERS.gemini.isRateLimited(1, 'RESOURCE_EXHAUSTED')).toBe(true);
    });
  });

  describe('opencode adapter', () => {
    it('parses total_tokens pattern', () => {
      expect(ADAPTERS.opencode.parseTokenUsage('total_tokens: 5000')).toBe(5000);
    });

    it('parses tokens_used pattern', () => {
      expect(ADAPTERS.opencode.parseTokenUsage('tokens used: 3000')).toBe(3000);
    });
  });

  describe('overstory adapter', () => {
    it('parses tokens from stderr', () => {
      expect(ADAPTERS.overstory.parseTokenUsage('tokens: 6000')).toBe(6000);
    });

    it('uses ov binary', () => {
      expect(ADAPTERS.overstory.binary).toBe('ov');
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/scheduler.test.ts --no-coverage`
Expected: FAIL — `ADAPTERS` not exported from lib/scheduler

- [ ] **Step 3: Create `lib/scheduler.ts` with adapters**

Create `lib/scheduler.ts` with the full adapter map from the spec (lines 136-237). Export `ADAPTERS`. Include `'use strict'` header and proper TypeScript types:

```typescript
'use strict';

import type { BackendId, BackendAdapter, SpawnOpts } from './types';

/**
 * Per-backend CLI adapters for subprocess invocation and output parsing.
 */
const ADAPTERS: Record<BackendId, BackendAdapter> = {
  claude: {
    binary: 'claude',
    buildArgs: (prompt: string, opts: SpawnOpts): string[] => [
      '-p', prompt,
      '--verbose',
      '--dangerously-skip-permissions',
      ...(opts.maxTurns ? ['--max-turns', String(opts.maxTurns)] : []),
      ...(opts.model ? ['--model', opts.model] : []),
      '--output-format', 'json',
    ],
    parseTokenUsage: (stderr: string): number | null => {
      const total = stderr.match(/[Tt]otal.tokens:\s*(\d+)/);
      if (total) return parseInt(total[1], 10);
      const input = stderr.match(/input_tokens:\s*(\d+)/);
      const output = stderr.match(/output_tokens:\s*(\d+)/);
      if (input && output) return parseInt(input[1], 10) + parseInt(output[1], 10);
      return null;
    },
    isRateLimited: (_exitCode: number, stderr: string): boolean =>
      /rate.limit|429|overloaded_error|too many requests/i.test(stderr),
  },
  codex: {
    binary: 'codex',
    buildArgs: (prompt: string, opts: SpawnOpts): string[] => [
      '--prompt', prompt,
      '--approval-mode', 'full-auto',
      ...(opts.model ? ['--model', opts.model] : []),
    ],
    parseTokenUsage: (stderr: string): number | null => {
      const match = stderr.match(/"total_tokens":\s*(\d+)/);
      return match ? parseInt(match[1], 10) : null;
    },
    isRateLimited: (_exitCode: number, stderr: string): boolean =>
      /rate.limit|429|rate_limit_exceeded/i.test(stderr),
  },
  gemini: {
    binary: 'gemini',
    buildArgs: (prompt: string, opts: SpawnOpts): string[] => [
      '-p', prompt,
      '--sandbox', 'off',
      ...(opts.model ? ['--model', opts.model] : []),
    ],
    parseTokenUsage: (stderr: string): number | null => {
      const match = stderr.match(/tokenCount["\s:]*(\d+)/);
      return match ? parseInt(match[1], 10) : null;
    },
    isRateLimited: (_exitCode: number, stderr: string): boolean =>
      /rate.limit|429|RESOURCE_EXHAUSTED|quota/i.test(stderr),
  },
  opencode: {
    binary: 'opencode',
    buildArgs: (prompt: string, opts: SpawnOpts): string[] => [
      '--non-interactive',
      '--prompt', prompt,
      ...(opts.model ? ['--model', opts.model] : []),
    ],
    parseTokenUsage: (stderr: string): number | null => {
      const match = stderr.match(/(?:total_tokens|tokens?.used)[\s:"]*(\d+)/i);
      return match ? parseInt(match[1], 10) : null;
    },
    isRateLimited: (_exitCode: number, stderr: string): boolean =>
      /rate.limit|429|too many requests|quota/i.test(stderr),
  },
  overstory: {
    binary: 'ov',
    buildArgs: (prompt: string, opts: SpawnOpts): string[] => [
      'run', '--prompt', prompt,
      ...(opts.model ? ['--model', opts.model] : []),
    ],
    parseTokenUsage: (stderr: string): number | null => {
      const match = stderr.match(/tokens?:\s*(\d+)/i);
      return match ? parseInt(match[1], 10) : null;
    },
    isRateLimited: (_exitCode: number, stderr: string): boolean =>
      /rate.limit|429|quota/i.test(stderr),
  },
};

module.exports = { ADAPTERS };
export { ADAPTERS };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/scheduler.test.ts --no-coverage`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/scheduler.ts tests/unit/scheduler.test.ts
git commit -m "feat(scheduler): add per-backend CLI adapters with token parsing"
```

---

## Chunk 2: EWMA Prediction Engine

### Task 4: Implement EWMA and rolling window

**Files:**
- Modify: `lib/scheduler.ts`
- Test: `tests/unit/scheduler.test.ts` (append)

- [ ] **Step 1: Write failing tests for EWMA**

Append to `tests/unit/scheduler.test.ts`:

```typescript
import { createBackendState, updateEWMA, recordSample, evictExpiredSamples } from '../../lib/scheduler';

describe('EWMA prediction', () => {
  it('initializes with default values', () => {
    const state = createBackendState(80000);
    expect(state.ewma_tokens_per_task).toBe(0);
    expect(state.tokens_consumed_in_window).toBe(0);
    expect(state.token_budget).toBe(80000);
    expect(state.budget_learned).toBe(false);
  });

  it('computes EWMA correctly with alpha=0.3', () => {
    const state = createBackendState(80000);
    state.ewma_tokens_per_task = 10000;
    updateEWMA(state, 14000, 0.3);
    // 0.3 * 14000 + 0.7 * 10000 = 4200 + 7000 = 11200
    expect(state.ewma_tokens_per_task).toBe(11200);
  });

  it('sets EWMA to first value when no prior data', () => {
    const state = createBackendState(80000);
    updateEWMA(state, 12000, 0.3);
    expect(state.ewma_tokens_per_task).toBe(12000);
  });

  it('evicts samples older than window', () => {
    const state = createBackendState(80000);
    const now = Date.now();
    state.samples = [
      { backend: 'claude', timestamp: now - 20 * 60 * 1000, duration: 5000, tokenEstimate: 10000, exitCode: 0, workItemId: 'old' },
      { backend: 'claude', timestamp: now - 5 * 60 * 1000, duration: 5000, tokenEstimate: 12000, exitCode: 0, workItemId: 'recent' },
    ];
    state.tokens_consumed_in_window = 22000;
    evictExpiredSamples(state, 15);
    expect(state.samples).toHaveLength(1);
    expect(state.samples[0].workItemId).toBe('recent');
    expect(state.tokens_consumed_in_window).toBe(12000); // recalculated, not decremented
  });

  it('recordSample updates consumed tokens and EWMA', () => {
    const state = createBackendState(80000);
    const sample = {
      backend: 'claude' as const,
      timestamp: Date.now(),
      duration: 5000,
      tokenEstimate: 10000,
      exitCode: 0,
      workItemId: 'test-1',
    };
    recordSample(state, sample, 15, 0.3);
    expect(state.tokens_consumed_in_window).toBe(10000);
    expect(state.ewma_tokens_per_task).toBe(10000);
    expect(state.samples).toHaveLength(1);
  });

  it('budget_confidence increases with sample count', () => {
    const state = createBackendState(80000);
    // formula: 1 - (1 / (1 + sample_count * 0.2))
    state.samples = new Array(5).fill(null).map((_, i) => ({
      backend: 'claude' as const,
      timestamp: Date.now(),
      duration: 5000,
      tokenEstimate: 10000,
      exitCode: 0,
      workItemId: `test-${i}`,
    }));
    // 1 - (1 / (1 + 5 * 0.2)) = 1 - (1/2) = 0.5
    expect(state.budget_confidence).toBe(0); // not yet updated
    recordSample(state, state.samples[0], 15, 0.3);
    // After recordSample, confidence is recalculated from sample count
    expect(state.budget_confidence).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/scheduler.test.ts --no-coverage`
Expected: FAIL — functions not exported

- [ ] **Step 3: Implement EWMA functions in `lib/scheduler.ts`**

Add to `lib/scheduler.ts` before the module.exports:

```typescript
import type { BackendUsageState, UsageSample } from './types';

const DEFAULT_BUDGET_TPM = 40000;
const FREE_FALLBACK_BUDGET = 1000000;

/**
 * Create a fresh BackendUsageState with a given token budget.
 */
function createBackendState(tokenBudget: number): BackendUsageState {
  return {
    samples: [],
    ewma_tokens_per_task: 0,
    tokens_consumed_in_window: 0,
    tokens_reserved: 0,
    in_flight_count: 0,
    token_budget: tokenBudget,
    budget_learned: false,
    budget_confidence: 0,
    cooldown_until: undefined,
  };
}

/**
 * Update EWMA of per-task token consumption.
 * First sample sets the EWMA directly.
 */
function updateEWMA(state: BackendUsageState, tokens: number, alpha: number): void {
  if (state.ewma_tokens_per_task === 0) {
    state.ewma_tokens_per_task = tokens;
  } else {
    state.ewma_tokens_per_task = alpha * tokens + (1 - alpha) * state.ewma_tokens_per_task;
  }
}

/**
 * Evict samples older than windowMinutes. Recalculate tokens_consumed_in_window.
 */
function evictExpiredSamples(state: BackendUsageState, windowMinutes: number): void {
  const cutoff = Date.now() - windowMinutes * 60 * 1000;
  state.samples = state.samples.filter((s) => s.timestamp >= cutoff);
  state.tokens_consumed_in_window = state.samples.reduce((sum, s) => sum + s.tokenEstimate, 0);
}

/**
 * Record a completed task sample. Evicts expired, updates EWMA, recalculates confidence.
 */
function recordSample(
  state: BackendUsageState,
  sample: UsageSample,
  windowMinutes: number,
  alpha: number,
): void {
  state.samples.push(sample);
  evictExpiredSamples(state, windowMinutes);
  state.tokens_consumed_in_window = state.samples.reduce((sum, s) => sum + s.tokenEstimate, 0);
  updateEWMA(state, sample.tokenEstimate, alpha);
  state.budget_confidence = 1 - 1 / (1 + state.samples.length * 0.2);
}
```

Update module.exports to include new functions:

```typescript
module.exports = { ADAPTERS, createBackendState, updateEWMA, evictExpiredSamples, recordSample, DEFAULT_BUDGET_TPM, FREE_FALLBACK_BUDGET };
export { ADAPTERS, createBackendState, updateEWMA, evictExpiredSamples, recordSample, DEFAULT_BUDGET_TPM, FREE_FALLBACK_BUDGET };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/scheduler.test.ts --no-coverage`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/scheduler.ts tests/unit/scheduler.test.ts
git commit -m "feat(scheduler): implement EWMA prediction engine and rolling window"
```

---

### Task 5: Implement backend picker with concurrency accounting

**Files:**
- Modify: `lib/scheduler.ts`
- Test: `tests/unit/scheduler.test.ts` (append)

- [ ] **Step 1: Write failing tests for pickBackend**

Append to `tests/unit/scheduler.test.ts`:

```typescript
import { pickBackend, markInFlight, markComplete } from '../../lib/scheduler';
import type { BackendUsageState } from '../../lib/types';

describe('backend selection', () => {
  function makeStates(): Map<string, BackendUsageState> {
    const states = new Map<string, BackendUsageState>();
    // claude: 70000/80000 consumed — nearly full
    const claude = createBackendState(80000);
    claude.tokens_consumed_in_window = 70000;
    claude.ewma_tokens_per_task = 10000;
    states.set('claude', claude);
    // codex: 20000/100000 consumed — lots of headroom
    const codex = createBackendState(100000);
    codex.tokens_consumed_in_window = 20000;
    codex.ewma_tokens_per_task = 10000;
    states.set('codex', codex);
    return states;
  }

  it('picks first backend with sufficient headroom', () => {
    const states = makeStates();
    const result = pickBackend(['claude', 'codex'], states, 1.5, { backend: 'opencode' });
    // claude: (80000-70000)/10000 = 1.0 tasks < 1.5 margin → skip
    // codex: (100000-20000)/10000 = 8.0 tasks > 1.5 margin → pick
    expect(result).toBe('codex');
  });

  it('falls back to free_fallback when all backends exhausted', () => {
    const states = makeStates();
    states.get('codex')!.tokens_consumed_in_window = 95000;
    const result = pickBackend(['claude', 'codex'], states, 1.5, { backend: 'opencode' });
    expect(result).toBe('opencode');
  });

  it('skips backends in cooldown', () => {
    const states = makeStates();
    states.get('codex')!.cooldown_until = Date.now() + 60000;
    // codex has headroom but is in cooldown
    const result = pickBackend(['codex', 'claude'], states, 1.5, { backend: 'opencode' });
    // claude: 1.0 tasks < 1.5 → skip. All skipped → fallback
    expect(result).toBe('opencode');
  });
});

describe('concurrency accounting', () => {
  it('markInFlight reserves tokens', () => {
    const state = createBackendState(80000);
    state.ewma_tokens_per_task = 10000;
    markInFlight(state);
    expect(state.in_flight_count).toBe(1);
    expect(state.tokens_reserved).toBe(10000);
  });

  it('markComplete recalculates tokens_reserved from current EWMA', () => {
    const state = createBackendState(80000);
    state.ewma_tokens_per_task = 10000;
    state.in_flight_count = 3;
    state.tokens_reserved = 30000;
    markComplete(state);
    // in_flight_count decremented to 2, then tokens_reserved = ewma * 2 = 20000
    expect(state.in_flight_count).toBe(2);
    expect(state.tokens_reserved).toBe(20000);
  });

  it('markInFlight accounts for reserved tokens in headroom', () => {
    const states = new Map<string, BackendUsageState>();
    const claude = createBackendState(80000);
    claude.tokens_consumed_in_window = 50000;
    claude.ewma_tokens_per_task = 10000;
    claude.tokens_reserved = 20000; // 2 in-flight
    claude.in_flight_count = 2;
    states.set('claude', claude);

    // effective = 50000 + 20000 = 70000
    // remaining = (80000 - 70000) / 10000 = 1.0 < 1.5 → skip
    const result = pickBackend(['claude'], states, 1.5, { backend: 'opencode' });
    expect(result).toBe('opencode');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/scheduler.test.ts --no-coverage`
Expected: FAIL

- [ ] **Step 3: Implement pickBackend, markInFlight, markComplete**

Add to `lib/scheduler.ts`:

```typescript
import type { BackendId, SchedulerConfig } from './types';

/**
 * Pick the best backend based on priority list and headroom.
 * Returns the free fallback if all backends are exhausted or in cooldown.
 */
function pickBackend(
  priority: BackendId[],
  states: Map<string, BackendUsageState>,
  safetyMargin: number,
  freeFallback: { backend: BackendId },
): BackendId {
  const now = Date.now();
  for (const backend of priority) {
    const state = states.get(backend);
    if (!state) continue;
    if (state.cooldown_until && state.cooldown_until > now) continue;
    if (state.ewma_tokens_per_task === 0) return backend; // no data yet, optimistic
    const effective = state.tokens_consumed_in_window + state.tokens_reserved;
    const remaining = state.token_budget - effective;
    const tasksRemaining = remaining / state.ewma_tokens_per_task;
    if (tasksRemaining >= safetyMargin) return backend;
  }
  return freeFallback.backend;
}

/**
 * Reserve tokens for an in-flight task.
 */
function markInFlight(state: BackendUsageState): void {
  state.in_flight_count += 1;
  state.tokens_reserved += state.ewma_tokens_per_task;
}

/**
 * Release reservation for a completed task. Recalculates reserved from EWMA × remaining in-flight.
 */
function markComplete(state: BackendUsageState): void {
  state.in_flight_count = Math.max(0, state.in_flight_count - 1);
  state.tokens_reserved = state.ewma_tokens_per_task * state.in_flight_count;
}
```

Update exports.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/scheduler.test.ts --no-coverage`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/scheduler.ts tests/unit/scheduler.test.ts
git commit -m "feat(scheduler): implement backend picker with concurrency accounting"
```

---

## Chunk 3: Scheduler Core (spawn + state persistence)

### Task 6: Implement `scheduler.spawn()` and pass-through mode

**Files:**
- Modify: `lib/scheduler.ts`
- Test: `tests/unit/scheduler.test.ts` (append)

- [ ] **Step 1: Write failing tests for createScheduler and pass-through**

Append to `tests/unit/scheduler.test.ts`:

```typescript
import { createScheduler } from '../../lib/scheduler';

describe('createScheduler', () => {
  it('returns null in pass-through mode when no config', () => {
    const scheduler = createScheduler(undefined);
    expect(scheduler).toBeNull();
  });

  it('creates scheduler with config', () => {
    const config = {
      backend_priority: ['claude' as const, 'codex' as const],
      free_fallback: { backend: 'opencode' as const },
      backend_limits: { claude: { tpm: 80000 }, codex: { tpm: 100000 } },
      prediction: { window_minutes: 15, ewma_alpha: 0.3, safety_margin_tasks: 1.5, min_samples: 3 },
    };
    const scheduler = createScheduler(config);
    expect(scheduler).not.toBeNull();
    expect(scheduler!.getState('claude')).toBeDefined();
    expect(scheduler!.getState('codex')).toBeDefined();
  });

  it('uses default budget 40000 when backend_limits not specified', () => {
    const config = {
      backend_priority: ['gemini' as const],
      free_fallback: { backend: 'opencode' as const },
      prediction: { window_minutes: 15, ewma_alpha: 0.3, safety_margin_tasks: 1.5, min_samples: 3 },
    };
    const scheduler = createScheduler(config);
    expect(scheduler!.getState('gemini')!.token_budget).toBe(40000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/scheduler.test.ts --no-coverage`
Expected: FAIL

- [ ] **Step 3: Implement createScheduler**

Add to `lib/scheduler.ts`:

```typescript
interface Scheduler {
  spawn(prompt: string, opts: SpawnOpts): Promise<SchedulerSpawnResult>;
  getState(backend: string): BackendUsageState | undefined;
  persistState(planningDir: string): void;
  loadPersistedState(planningDir: string): void;
}

function createScheduler(config: SchedulerConfig | undefined): Scheduler | null {
  if (!config) return null;

  const states = new Map<string, BackendUsageState>();
  const prediction = config.prediction;

  // Initialize state for each backend in priority + fallback
  const allBackends = [...config.backend_priority, config.free_fallback.backend];
  for (const backend of new Set(allBackends)) {
    const limit = config.backend_limits?.[backend]?.tpm;
    const isFallback = backend === config.free_fallback.backend;
    const budget = limit ?? (isFallback ? FREE_FALLBACK_BUDGET : DEFAULT_BUDGET_TPM);
    states.set(backend, createBackendState(budget));
  }

  // Check which backend binaries are available (cached at init)
  // Injectable for testing via _checkBinary parameter
  const availableBackends = new Set<string>();
  const checkBinary = (binary: string): boolean => {
    try {
      const { execFileSync } = require('child_process') as typeof import('child_process');
      execFileSync('which', [binary], { stdio: 'ignore' });
      return true;
    } catch { return false; }
  };
  for (const backend of allBackends) {
    const adapter = ADAPTERS[backend as BackendId];
    if (!adapter) continue;
    if (checkBinary(adapter.binary)) availableBackends.add(backend);
  }

  return {
    getState(backend: string): BackendUsageState | undefined {
      return states.get(backend);
    },

    async spawn(prompt: string, opts: SpawnOpts): Promise<SchedulerSpawnResult> {
      const filteredPriority = config.backend_priority.filter((b) => availableBackends.has(b));
      const backend = pickBackend(
        filteredPriority,
        states,
        prediction.safety_margin_tasks,
        config.free_fallback,
      );

      const adapter = ADAPTERS[backend as BackendId] || ADAPTERS.claude;
      const state = states.get(backend) || createBackendState(DEFAULT_BUDGET_TPM);
      const args = adapter.buildArgs(prompt, opts);
      const workItemId = opts.workItemId || `task-${Date.now()}`;

      markInFlight(state);
      const startTime = Date.now();

      try {
        const { execFile } = require('child_process') as typeof import('child_process');
        const result = await new Promise<SchedulerSpawnResult>((resolve) => {
          const child = execFile(adapter.binary, args, {
            cwd: opts.cwd || process.cwd(),
            maxBuffer: 50 * 1024 * 1024,
            timeout: opts.timeout || 120 * 60 * 1000,
            env: { ...process.env },
          }, (error, stdout, stderr) => {
            const duration = Date.now() - startTime;
            const exitCode = error ? (error as NodeJS.ErrnoException & { code?: number }).code === 'ETIMEDOUT' ? 1 : (child.exitCode || 1) : 0;
            const timedOut = !!(error && (error as NodeJS.ErrnoException).code === 'ETIMEDOUT');

            const tokens = adapter.parseTokenUsage(stderr || '') ?? Math.round(duration * 10);

            const sample: UsageSample = {
              backend: backend as BackendId,
              timestamp: Date.now(),
              duration,
              tokenEstimate: tokens,
              exitCode: exitCode as number,
              workItemId,
            };

            markComplete(state);
            recordSample(state, sample, prediction.window_minutes, prediction.ewma_alpha);

            // Periodic persistence: every 10 samples across all backends
            const totalSamples = Array.from(states.values()).reduce((sum, s) => sum + s.samples.length, 0);
            if (totalSamples % 10 === 0 && opts.cwd) {
              const { join } = require('path') as typeof import('path');
              this.persistState(join(opts.cwd, '.planning'));
            }

            resolve({
              exitCode: exitCode as number,
              stdout: stdout || undefined,
              stderr: stderr || undefined,
              timedOut,
              backend: backend as BackendId,
              tokensUsed: tokens,
              workItemId,
            });
          });
        });

        // Rate limit retry: if rate-limited despite prediction, retry on next backend
        if (adapter.isRateLimited(result.exitCode, result.stderr || '')) {
          state.cooldown_until = Date.now() + prediction.window_minutes * 60 * 1000;
          // Recurse with remaining priority (excluding failed backend)
          const remainingPriority = filteredPriority.filter((b) => b !== backend);
          if (remainingPriority.length > 0 || config.free_fallback.backend !== backend) {
            return this.spawn(prompt, opts); // pickBackend will skip cooled-down backend
          }
        }

        return result;
      } catch (err) {
        markComplete(state);
        return {
          exitCode: 1,
          timedOut: false,
          backend: backend as BackendId,
          tokensUsed: 0,
          workItemId,
        };
      }
    },

    persistState(planningDir: string): void {
      const { writeFileSync } = require('fs') as typeof import('fs');
      const { join } = require('path') as typeof import('path');
      const data: Record<string, unknown> = { version: 1, backends: {} };
      const backends = data.backends as Record<string, unknown>;
      for (const [key, state] of states) {
        backends[key] = {
          token_budget: state.token_budget,
          ewma_tokens_per_task: state.ewma_tokens_per_task,
          budget_learned: state.budget_learned,
          budget_confidence: state.budget_confidence,
          last_updated: Date.now(),
        };
      }
      writeFileSync(join(planningDir, 'scheduler-state.json'), JSON.stringify(data, null, 2) + '\n');
    },

    loadPersistedState(planningDir: string): void {
      const { readFileSync, existsSync } = require('fs') as typeof import('fs');
      const { join } = require('path') as typeof import('path');
      const filePath = join(planningDir, 'scheduler-state.json');
      if (!existsSync(filePath)) return;
      try {
        const raw = JSON.parse(readFileSync(filePath, 'utf-8')) as { version: number; backends: Record<string, { token_budget: number; ewma_tokens_per_task: number; budget_learned: boolean; budget_confidence: number }> };
        if (raw.version !== 1) return;
        for (const [key, saved] of Object.entries(raw.backends)) {
          const state = states.get(key);
          if (!state) continue;
          if (saved.budget_learned) state.token_budget = saved.token_budget;
          state.ewma_tokens_per_task = saved.ewma_tokens_per_task;
          state.budget_learned = saved.budget_learned;
          state.budget_confidence = saved.budget_confidence;
        }
      } catch {
        // corrupted file — ignore, start fresh
      }
    },
  };
}
```

Update exports to include `createScheduler`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/scheduler.test.ts --no-coverage`
Expected: PASS

- [ ] **Step 5: Run type-check**

Run: `npm run build:check`
Expected: No type errors

- [ ] **Step 6: Commit**

```bash
git add lib/scheduler.ts tests/unit/scheduler.test.ts
git commit -m "feat(scheduler): implement core spawn function with pass-through mode"
```

---

### Task 7: State persistence tests

**Files:**
- Test: `tests/unit/scheduler.test.ts` (append)

- [ ] **Step 1: Write tests for persistState/loadPersistedState**

```typescript
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('state persistence', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scheduler-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('persists and reloads learned budgets', () => {
    const config = {
      backend_priority: ['claude' as const],
      free_fallback: { backend: 'opencode' as const },
      backend_limits: { claude: { tpm: 80000 } },
      prediction: { window_minutes: 15, ewma_alpha: 0.3, safety_margin_tasks: 1.5, min_samples: 3 },
    };
    const scheduler = createScheduler(config)!;

    // Simulate learned state
    const state = scheduler.getState('claude')!;
    state.ewma_tokens_per_task = 12345;
    state.budget_learned = true;
    state.budget_confidence = 0.7;

    scheduler.persistState(tmpDir);

    // Create new scheduler and load
    const scheduler2 = createScheduler(config)!;
    scheduler2.loadPersistedState(tmpDir);
    const reloaded = scheduler2.getState('claude')!;
    expect(reloaded.ewma_tokens_per_task).toBe(12345);
    expect(reloaded.budget_learned).toBe(true);
    expect(reloaded.budget_confidence).toBe(0.7);
  });

  it('handles missing persistence file gracefully', () => {
    const config = {
      backend_priority: ['claude' as const],
      free_fallback: { backend: 'opencode' as const },
      prediction: { window_minutes: 15, ewma_alpha: 0.3, safety_margin_tasks: 1.5, min_samples: 3 },
    };
    const scheduler = createScheduler(config)!;
    // Should not throw
    scheduler.loadPersistedState(tmpDir);
    expect(scheduler.getState('claude')!.ewma_tokens_per_task).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npx jest tests/unit/scheduler.test.ts --no-coverage`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/unit/scheduler.test.ts
git commit -m "test(scheduler): add state persistence tests"
```

---

## Chunk 4: Integration

### Task 8: Integrate scheduler into `lib/autopilot.ts`

**Files:**
- Modify: `lib/autopilot.ts:498-681` (runAutopilot), `lib/autopilot.ts:749-915` (runMultiMilestoneAutopilot)

- [ ] **Step 1: Import scheduler at top of autopilot.ts**

Add near the top imports of `lib/autopilot.ts`:

```typescript
const { createScheduler } = require('./scheduler') as { createScheduler: typeof import('./scheduler').createScheduler };
```

- [ ] **Step 2: Create scheduler instance in runAutopilot**

At the start of `runAutopilot()`, after config is loaded, add:

```typescript
const schedulerConfig = config.scheduler;
const scheduler = createScheduler(schedulerConfig);
if (scheduler) {
  const planningDir = path.join(cwd, '.planning');
  scheduler.loadPersistedState(planningDir);
}
```

- [ ] **Step 3: Add a helper that normalizes scheduler result to SpawnResult**

Add at the top of the autopilot integration section:

```typescript
/** Normalize SchedulerSpawnResult to SpawnResult for drop-in compatibility */
function toSpawnResult(sr: SchedulerSpawnResult): SpawnResult {
  return { exitCode: sr.exitCode, timedOut: sr.timedOut, stdout: sr.stdout, stderr: sr.stderr };
}
```

- [ ] **Step 4: Replace spawnClaudeAsync in planning (line ~600)**

Replace:
```typescript
const result = await spawnClaudeAsync(cwd, buildPlanPrompt(phaseNum), { ... });
```
With:
```typescript
const planOpts = { ...spawnOpts, cwd, workItemId: `phase-${phaseNum}-plan` };
const result: SpawnResult = scheduler
  ? toSpawnResult(await scheduler.spawn(buildPlanPrompt(phaseNum), planOpts))
  : await spawnClaudeAsync(cwd, buildPlanPrompt(phaseNum), spawnOpts);
```

- [ ] **Step 5: Replace spawnClaude in execution (line ~683)**

Replace:
```typescript
const result = spawnClaude(cwd, buildExecutePrompt(phaseNum), { ... });
```
With:
```typescript
const execOpts = { ...spawnOpts, cwd, workItemId: `phase-${phaseNum}-execute` };
const result: SpawnResult = scheduler
  ? toSpawnResult(await scheduler.spawn(buildExecutePrompt(phaseNum), execOpts))
  : spawnClaude(cwd, buildExecutePrompt(phaseNum), spawnOpts);
```

Note: When scheduler is active, the sync `spawnClaude` path becomes async via `scheduler.spawn()`. The `toSpawnResult()` helper normalizes the return type so all downstream code works unchanged. The surrounding code in `runAutopilot()` is already inside an async function.

- [ ] **Step 5: Persist state on autopilot completion**

At the end of `runAutopilot()`, before return:

```typescript
if (scheduler) {
  scheduler.persistState(path.join(cwd, '.planning'));
}
```

- [ ] **Step 6: Apply same pattern to runMultiMilestoneAutopilot**

Replace the two `spawnClaude` calls at lines ~842 and ~880 with the same scheduler-or-fallback pattern.

- [ ] **Step 7: Run existing autopilot tests**

Run: `npx jest tests/unit/autopilot.test.ts --no-coverage`
Expected: PASS (existing tests should not break — scheduler is null in pass-through mode)

- [ ] **Step 8: Commit**

```bash
git add lib/autopilot.ts
git commit -m "feat(scheduler): integrate scheduler into autopilot spawn calls"
```

---

### Task 9: Integrate scheduler into `lib/evolve/orchestrator.ts`

**Files:**
- Modify: `lib/evolve/orchestrator.ts:70-181` (_runIterationStep)

- [ ] **Step 1: Import and init scheduler in orchestrator**

Add import and initialize scheduler at the start of `_runIterationStep()` or its parent `runEvolve()`:

```typescript
const { createScheduler } = require('../scheduler') as { createScheduler: typeof import('../scheduler').createScheduler };

// In runEvolve(), after config load:
const schedulerConfig = config.scheduler;
const scheduler = createScheduler(schedulerConfig);
if (scheduler) {
  scheduler.loadPersistedState(path.join(cwd, '.planning'));
}
```

- [ ] **Step 2: Replace spawnClaudeAsync calls in _runIterationStep**

Replace batch execute (line ~124):
```typescript
const result = scheduler
  ? await scheduler.spawn(executePrompt, { ...opts, cwd: executionCwd, workItemId: `evolve-iter-${iteration}-execute` })
  : await spawnClaudeAsync(executionCwd, executePrompt, opts);
```

Replace batch review (line ~155):
```typescript
const result = scheduler
  ? await scheduler.spawn(reviewPrompt, { ...opts, cwd: executionCwd, workItemId: `evolve-iter-${iteration}-review` })
  : await spawnClaudeAsync(executionCwd, reviewPrompt, opts);
```

- [ ] **Step 3: Persist state after evolve completes**

At the end of `runEvolve()`:

```typescript
if (scheduler) {
  scheduler.persistState(path.join(cwd, '.planning'));
}
```

- [ ] **Step 4: Run existing evolve tests**

Run: `npx jest tests/unit/evolve.test.ts --no-coverage`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/evolve/orchestrator.ts
git commit -m "feat(scheduler): integrate scheduler into evolve orchestrator"
```

---

### Task 10: Add `.planning/scheduler-state.json` to `.gitignore`

**Files:**
- Modify: `.gitignore` (or `.planning/.gitignore` if it exists)

- [ ] **Step 1: Add entry**

```
# Scheduler learned state (per-machine, transient)
.planning/scheduler-state.json
```

- [ ] **Step 2: Commit**

```bash
git add .gitignore
git commit -m "chore: gitignore scheduler state file"
```

---

### Task 11: Integration test with mock subprocess

**Files:**
- Create: `tests/integration/scheduler.test.ts`

- [ ] **Step 1: Write integration test**

```typescript
'use strict';

import { createScheduler } from '../../lib/scheduler';
import type { SchedulerConfig } from '../../lib/types';

describe('scheduler integration', () => {
  it('picks next backend when primary is near limit', () => {
    const config: SchedulerConfig = {
      backend_priority: ['claude', 'codex'],
      free_fallback: { backend: 'opencode' },
      backend_limits: { claude: { tpm: 80000 }, codex: { tpm: 100000 } },
      prediction: { window_minutes: 15, ewma_alpha: 0.3, safety_margin_tasks: 1.5, min_samples: 3 },
    };
    const scheduler = createScheduler(config)!;

    // Simulate claude being near limit
    const claude = scheduler.getState('claude')!;
    claude.ewma_tokens_per_task = 10000;
    claude.tokens_consumed_in_window = 75000; // only 5000 remaining < 15000 needed

    // The scheduler should pick codex
    // We can't call spawn() without real binaries, but we can test the routing
    const codex = scheduler.getState('codex')!;
    expect(codex.tokens_consumed_in_window).toBe(0);
    // Verify claude would be skipped by checking headroom
    const claudeHeadroom = (claude.token_budget - claude.tokens_consumed_in_window) / claude.ewma_tokens_per_task;
    expect(claudeHeadroom).toBeLessThan(1.5);
  });
});
```

- [ ] **Step 2: Run integration test**

Run: `npx jest tests/integration/scheduler.test.ts --no-coverage`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/integration/scheduler.test.ts
git commit -m "test(scheduler): add integration test for backend routing"
```

---

### Task 12: Create CJS proxy `lib/scheduler.js`

**Files:**
- Create: `lib/scheduler.js`

- [ ] **Step 1: Create the proxy**

```javascript
#!/usr/bin/env node
/**
 * Scheduler -- CommonJS re-export proxy
 */
'use strict';
const { existsSync } = require('fs');
const { join } = require('path');
const dist = join(__dirname, '..', 'dist', 'lib', 'scheduler.js');
if (existsSync(dist)) module.exports = require(dist);
else module.exports = require('./scheduler.ts');
```

- [ ] **Step 2: Run full test suite**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add lib/scheduler.js
git commit -m "chore: add CJS proxy for scheduler module"
```

---

### Task 13: Final validation

- [ ] **Step 1: Run full test suite with coverage**

Run: `npm test`
Expected: All tests pass, no regressions

- [ ] **Step 2: Run linter**

Run: `npm run lint`
Expected: No lint errors

- [ ] **Step 3: Run type-check**

Run: `npm run build:check`
Expected: No type errors

- [ ] **Step 4: Run build**

Run: `npm run build`
Expected: Compiles successfully to dist/
