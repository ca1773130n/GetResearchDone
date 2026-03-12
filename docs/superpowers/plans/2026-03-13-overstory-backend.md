# Overstory Execution Backend Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Overstory as a fifth GRD execution backend, dispatching plans via `ov sling` instead of Claude Code Agent Teams.

**Architecture:** Overstory becomes a new `BackendId` with its own capability flags, model mappings, and detection logic. A new `lib/overstory.ts` adapter wraps `ov` CLI interactions. The execute-phase command gains an Overstory execution branch that uses sling/poll/merge instead of TeamCreate/Task.

**Tech Stack:** TypeScript (strict), Node.js >=18, Jest (ts-jest), `child_process.execFileSync` for `ov` CLI calls.

**Spec:** `docs/superpowers/specs/2026-03-13-overstory-backend-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `lib/types.ts` | Modify | Add `'overstory'` to `BackendId`, add 8 new interfaces |
| `lib/backend.ts` | Modify | Add overstory to all lookup tables and detection waterfall |
| `lib/overstory.ts` | Create | Adapter: detect, install, sling, status, merge, stop, mail, nudge |
| `lib/overstory.js` | Create | CJS proxy for overstory.ts |
| `lib/context/execute.ts` | Modify | Emit overstory-specific fields in init JSON |
| `lib/parallel.ts` | Modify | Handle overstory in mode selection and worktree skip |
| `bin/grd-tools.ts` | Modify | Register `overstory detect` and `overstory install` CLI subcommands |
| `commands/execute-phase.md` | Modify | Add Mode C: overstory execution branch with mail/checkpoint polling |
| `commands/settings.md` | Modify | Add `overstory` subcommand |
| `tests/unit/backend.test.ts` | Modify | Add overstory detection, capabilities, model tests |
| `tests/unit/overstory.test.ts` | Create | Full unit test coverage for adapter |

---

## Chunk 1: Types and Backend Registration

### Task 1: Add Overstory types to `lib/types.ts`

**Files:**
- Modify: `lib/types.ts:21` (BackendId union)
- Modify: `lib/types.ts:464` (before `module.exports`)
- Test: `tests/unit/backend.test.ts`

- [ ] **Step 1: Write failing test — BackendId includes 'overstory'**

In `tests/unit/backend.test.ts`, update the VALID_BACKENDS tests:

```typescript
// In describe('VALID_BACKENDS')
test('contains exactly 5 backends', () => {
  expect(VALID_BACKENDS).toHaveLength(5);
});

test('contains claude, codex, gemini, opencode, overstory', () => {
  expect(VALID_BACKENDS).toEqual(['claude', 'codex', 'gemini', 'opencode', 'overstory']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/backend.test.ts -t "contains exactly 5 backends" -v`
Expected: FAIL — "Expected: 5, Received: 4"

- [ ] **Step 3: Add `'overstory'` to BackendId union in `lib/types.ts`**

Change line 21:
```typescript
export type BackendId = 'claude' | 'codex' | 'gemini' | 'opencode' | 'overstory';
```

- [ ] **Step 4: Add Overstory interfaces to `lib/types.ts`**

Before `module.exports = {};` (line 464), add:

```typescript
// ─── Overstory Types (from overstory.ts) ─────────────────────────────────────

/**
 * Result of detectOverstory() — describes the local Overstory installation.
 */
export interface OverstoryInfo {
  available: boolean;
  version: string;
  config_path: string;
  max_agents: number;
  default_runtime: string;
  worktree_base: string;
}

/**
 * Options for slingPlan() — everything needed to dispatch a plan to an Overstory worker.
 */
export interface SlingOpts {
  plan_path: string;
  overlay_path: string;
  runtime: string;
  model: string;
  phase_number: string;
  plan_id: string;
  milestone: string;
  timeout_minutes: number;
}

/**
 * Result from ov sling — identifies the spawned agent.
 */
export interface SlingResult {
  agent_id: string;
  worktree_path: string;
  branch: string;
  tmux_session: string;
  runtime: string;
}

/**
 * Status of a single Overstory agent.
 */
export interface AgentStatus {
  agent_id: string;
  state: 'pending' | 'running' | 'done' | 'failed' | 'stopped';
  exit_code: number | null;
  duration_ms: number;
  worktree_path: string;
  branch: string;
  runtime: string;
  model: string;
}

/**
 * Bulk fleet status from ov status --json.
 */
export interface FleetStatus {
  agents: AgentStatus[];
  active_count: number;
  completed_count: number;
  failed_count: number;
}

/**
 * Result of mergeAgent() — branch integration outcome.
 */
export interface MergeResult {
  merged: boolean;
  conflicts: string[];
  branch: string;
  commit_sha: string | null;
  error: string | null;
}

/**
 * Overstory-specific config from .planning/config.json overstory section.
 */
export interface OverstoryConfig {
  runtime: string;
  install_prompt: boolean;
  poll_interval_ms: number;
  merge_strategy: 'auto' | 'manual';
  overlay_template: string | null;
}

/**
 * Mail message from Overstory's SQLite mail system.
 */
export interface OverstoryMailMessage {
  type: string;
  body: string;
  ts: number;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest tests/unit/backend.test.ts -t "contains exactly" -v`
Expected: FAIL — still need to update `VALID_BACKENDS` in backend.ts (next task)

- [ ] **Step 6: Commit types**

```bash
git add lib/types.ts
git commit -m "feat(types): add Overstory backend types and interfaces"
```

---

### Task 2: Register Overstory in backend lookup tables

**Files:**
- Modify: `lib/backend.ts:47-52` (VALID_BACKENDS)
- Modify: `lib/backend.ts:59-76` (DEFAULT_BACKEND_MODELS)
- Modify: `lib/backend.ts:82-127` (BACKEND_CAPABILITIES)
- Test: `tests/unit/backend.test.ts`

- [ ] **Step 1: Write failing tests for overstory backend capabilities and models**

Add to `tests/unit/backend.test.ts`:

```typescript
// In describe('DEFAULT_BACKEND_MODELS')
test('overstory maps to opus, sonnet, haiku', () => {
  expect(DEFAULT_BACKEND_MODELS.overstory).toEqual({
    opus: 'opus',
    sonnet: 'sonnet',
    haiku: 'haiku',
  });
});

// In describe('BACKEND_CAPABILITIES')
test('overstory has teams true, parallel true, native_worktree_isolation true, hooks false, effort false', () => {
  expect(BACKEND_CAPABILITIES.overstory).toEqual({
    subagents: true,
    parallel: true,
    teams: true,
    hooks: false,
    mcp: true,
    native_worktree_isolation: true,
    effort: false,
    http_hooks: false,
    cron: false,
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/unit/backend.test.ts -t "overstory" -v`
Expected: FAIL — "overstory" not in lookup tables

- [ ] **Step 3: Add overstory to VALID_BACKENDS**

In `lib/backend.ts` line 47-52:
```typescript
const VALID_BACKENDS: readonly BackendId[] = [
  'claude',
  'codex',
  'gemini',
  'opencode',
  'overstory',
];
```

- [ ] **Step 4: Add overstory to DEFAULT_BACKEND_MODELS**

After the `opencode` entry (line 76):
```typescript
  overstory: { opus: 'opus', sonnet: 'sonnet', haiku: 'haiku' },
```

- [ ] **Step 5: Add overstory to BACKEND_CAPABILITIES**

After the `opencode` entry (line 127):
```typescript
  overstory: {
    subagents: true,
    parallel: true,
    teams: true,
    hooks: false,
    mcp: true,
    native_worktree_isolation: true,
    effort: false,
    http_hooks: false,
    cron: false,
  },
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx jest tests/unit/backend.test.ts -v`
Expected: All PASS (update count assertions: "4 backends" -> "5 backends")

- [ ] **Step 7: Commit**

```bash
git add lib/backend.ts tests/unit/backend.test.ts
git commit -m "feat(backend): register overstory in lookup tables and capabilities"
```

---

### Task 3: Add Overstory detection to waterfall

**Files:**
- Modify: `lib/backend.ts:245-276` (detectBackend function)
- Test: `tests/unit/backend.test.ts`

- [ ] **Step 1: Write failing tests for overstory detection**

Add to `tests/unit/backend.test.ts` in `describe('detectBackend(cwd)')`:

```typescript
// --- Overstory env var detection ---

test('returns "overstory" when OVERSTORY_HOME is set', () => {
  process.env.OVERSTORY_HOME = '/home/user/.overstory';
  expect(detectBackend(tmpDir)).toBe('overstory');
});

test('returns "overstory" when OVERSTORY_SESSION is set', () => {
  process.env.OVERSTORY_SESSION = 'session-123';
  expect(detectBackend(tmpDir)).toBe('overstory');
});

// --- Overstory filesystem detection ---

test('returns "overstory" when .overstory/config.yaml exists', () => {
  cleanupTempDir(tmpDir);
  tmpDir = createTempDir({ files: ['.overstory/config.yaml'] });
  expect(detectBackend(tmpDir)).toBe('overstory');
});

// --- Overstory takes priority over Claude env vars ---

test('overstory env var takes priority over CLAUDE_CODE_ env vars', () => {
  process.env.OVERSTORY_HOME = '/home/user/.overstory';
  process.env.CLAUDE_CODE_ENTRYPOINT = 'plugin';
  expect(detectBackend(tmpDir)).toBe('overstory');
});

// --- Config override still beats overstory env ---

test('config.backend takes precedence over OVERSTORY_HOME', () => {
  process.env.OVERSTORY_HOME = '/home/user/.overstory';
  cleanupTempDir(tmpDir);
  tmpDir = createTempDir({ config: { backend: 'claude' } });
  expect(detectBackend(tmpDir)).toBe('claude');
});
```

Also update `DETECTION_ENV_VARS` array at top of test file to include `'OVERSTORY_HOME'` and `'OVERSTORY_SESSION'`.

And update the `beforeEach` env-clearing block to also delete these vars:
```typescript
  key === 'OVERSTORY_HOME' ||
  key === 'OVERSTORY_SESSION' ||
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/unit/backend.test.ts -t "overstory" -v`
Expected: FAIL — detectBackend returns 'claude' not 'overstory'

- [ ] **Step 3: Add overstory detection to waterfall in `lib/backend.ts`**

In the `detectBackend` function, after the config override block (line 254) and BEFORE the Claude Code env var check (line 257), insert:

```typescript
  // Step 2a: Overstory detection (before Claude — takes priority when both present)
  if (process.env.OVERSTORY_HOME || process.env.OVERSTORY_SESSION)
    return 'overstory';
```

And in the filesystem clues section (before line 268), insert:

```typescript
  if (fileExists(path.join(cwd, '.overstory', 'config.yaml')))
    return 'overstory';
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/unit/backend.test.ts -v`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add lib/backend.ts tests/unit/backend.test.ts
git commit -m "feat(backend): add overstory detection to waterfall"
```

---

## Chunk 2: Overstory Adapter Module

### Task 4: Create `lib/overstory.ts` with detectOverstory and installOverstory

**Files:**
- Create: `lib/overstory.ts`
- Create: `lib/overstory.js`
- Create: `tests/unit/overstory.test.ts`

- [ ] **Step 1: Write failing tests for detectOverstory**

Create `tests/unit/overstory.test.ts`:

```typescript
/**
 * Unit tests for lib/overstory.ts
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const childProcess = require('child_process');

// Mock child_process.execFileSync for ov CLI calls
jest.mock('child_process', () => ({
  ...jest.requireActual('child_process'),
  execFileSync: jest.fn(),
}));

function createTempDir(opts: { overstoryConfig?: Record<string, unknown>; planningConfig?: Record<string, unknown> } = {}): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-overstory-test-'));

  if (opts.overstoryConfig) {
    const ovDir = path.join(tmpDir, '.overstory');
    fs.mkdirSync(ovDir, { recursive: true });
    fs.writeFileSync(path.join(ovDir, 'config.yaml'), 'runtime:\n  default: claude\n');
  }

  if (opts.planningConfig) {
    const planDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planDir, { recursive: true });
    fs.writeFileSync(path.join(planDir, 'config.json'), JSON.stringify(opts.planningConfig, null, 2));
  }

  return tmpDir;
}

function cleanupTempDir(dir: string): void {
  if (!dir || !dir.startsWith(os.tmpdir())) return;
  fs.rmSync(dir, { recursive: true, force: true });
}

const { detectOverstory, compareSemver, loadOverstoryConfig, MIN_VERSION } = require('../../lib/overstory');

describe('lib/overstory.ts', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTempDir();
    jest.clearAllMocks();
  });

  afterEach(() => {
    cleanupTempDir(tmpDir);
  });

  describe('compareSemver', () => {
    test('returns 0 for equal versions', () => {
      expect(compareSemver('1.2.3', '1.2.3')).toBe(0);
    });

    test('returns -1 when a < b', () => {
      expect(compareSemver('0.7.9', '0.8.0')).toBe(-1);
    });

    test('returns 1 when a > b', () => {
      expect(compareSemver('1.0.0', '0.9.9')).toBe(1);
    });
  });

  describe('loadOverstoryConfig(cwd)', () => {
    test('returns defaults when no config exists', () => {
      const config = loadOverstoryConfig(tmpDir);
      expect(config.runtime).toBe('claude');
      expect(config.poll_interval_ms).toBe(5000);
      expect(config.merge_strategy).toBe('auto');
    });

    test('merges user config with defaults', () => {
      cleanupTempDir(tmpDir);
      tmpDir = createTempDir({
        planningConfig: { overstory: { runtime: 'codex', poll_interval_ms: 3000 } },
      });
      const config = loadOverstoryConfig(tmpDir);
      expect(config.runtime).toBe('codex');
      expect(config.poll_interval_ms).toBe(3000);
      expect(config.merge_strategy).toBe('auto'); // default preserved
    });
  });

  describe('detectOverstory(cwd)', () => {
    test('returns null when .overstory/config.yaml does not exist', () => {
      expect(detectOverstory(tmpDir)).toBeNull();
    });

    test('returns null when ov CLI is not on PATH', () => {
      cleanupTempDir(tmpDir);
      tmpDir = createTempDir({ overstoryConfig: {} });
      (childProcess.execFileSync as jest.Mock).mockImplementation(() => {
        throw new Error('ENOENT');
      });
      expect(detectOverstory(tmpDir)).toBeNull();
    });

    test('returns null when ov version is below minimum', () => {
      cleanupTempDir(tmpDir);
      tmpDir = createTempDir({ overstoryConfig: {} });
      (childProcess.execFileSync as jest.Mock).mockReturnValue('0.7.0\n');
      expect(detectOverstory(tmpDir)).toBeNull();
    });

    test('returns OverstoryInfo when .overstory/config.yaml exists and ov responds', () => {
      cleanupTempDir(tmpDir);
      tmpDir = createTempDir({ overstoryConfig: {} });
      (childProcess.execFileSync as jest.Mock).mockReturnValue('0.8.2\n');
      const result = detectOverstory(tmpDir);
      expect(result).not.toBeNull();
      expect(result.available).toBe(true);
      expect(result.version).toBe('0.8.2');
      expect(result.default_runtime).toBe('claude');
    });

    test('strips v prefix from version', () => {
      cleanupTempDir(tmpDir);
      tmpDir = createTempDir({ overstoryConfig: {} });
      (childProcess.execFileSync as jest.Mock).mockReturnValue('v0.9.0\n');
      const result = detectOverstory(tmpDir);
      expect(result).not.toBeNull();
      expect(result.version).toBe('0.9.0');
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/overstory.test.ts -v`
Expected: FAIL — module not found

- [ ] **Step 3: Create `lib/overstory.ts` with detectOverstory**

```typescript
/**
 * GRD Overstory Adapter -- Detection, plan dispatch, status polling, merge
 *
 * Wraps the `ov` CLI to use Overstory as an execution backend for GRD.
 * Follows the same shell-out pattern as lib/worktree.ts.
 *
 * Requires: Overstory v0.8.0+ (stable --json output)
 */
'use strict';

import type { OverstoryInfo, OverstoryConfig } from './types';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const MIN_VERSION = '0.8.0';

/**
 * Compare two semver strings. Returns -1 if a < b, 0 if equal, 1 if a > b.
 */
function compareSemver(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const va = pa[i] || 0;
    const vb = pb[i] || 0;
    if (va < vb) return -1;
    if (va > vb) return 1;
  }
  return 0;
}

/**
 * Default config values for the overstory section of .planning/config.json.
 */
const DEFAULT_OVERSTORY_CONFIG: OverstoryConfig = {
  runtime: 'claude',
  install_prompt: true,
  poll_interval_ms: 5000,
  merge_strategy: 'auto',
  overlay_template: null,
};

/**
 * Load overstory config from .planning/config.json, merging with defaults.
 */
function loadOverstoryConfig(cwd: string): OverstoryConfig {
  try {
    const raw = fs.readFileSync(path.join(cwd, '.planning', 'config.json'), 'utf-8');
    const config = JSON.parse(raw) as Record<string, unknown>;
    const ov = (config.overstory || {}) as Partial<OverstoryConfig>;
    return { ...DEFAULT_OVERSTORY_CONFIG, ...ov };
  } catch {
    return { ...DEFAULT_OVERSTORY_CONFIG };
  }
}

/**
 * Detect whether Overstory is available in this project.
 *
 * Checks:
 *   1. .overstory/config.yaml exists
 *   2. `ov --version` returns a valid semver >= MIN_VERSION
 *
 * Returns null if Overstory is not available.
 */
function detectOverstory(cwd: string): OverstoryInfo | null {
  const configPath = path.join(cwd, '.overstory', 'config.yaml');
  if (!fs.existsSync(configPath)) return null;

  let version: string;
  try {
    const stdout: string = execFileSync('ov', ['--version'], {
      cwd,
      timeout: 5000,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    version = stdout.trim().replace(/^v/, '');
  } catch {
    return null;
  }

  if (compareSemver(version, MIN_VERSION) < 0) {
    return null;
  }

  const ovConfig = loadOverstoryConfig(cwd);

  return {
    available: true,
    version,
    config_path: configPath,
    max_agents: 25,
    default_runtime: ovConfig.runtime,
    worktree_base: path.join(cwd, '.overstory', 'worktrees'),
  };
}

module.exports = {
  MIN_VERSION,
  DEFAULT_OVERSTORY_CONFIG,
  compareSemver,
  loadOverstoryConfig,
  detectOverstory,
};
```

- [ ] **Step 4: Create `lib/overstory.js` CJS proxy**

```javascript
'use strict';
module.exports = require('./overstory.ts');
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx jest tests/unit/overstory.test.ts -v`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add lib/overstory.ts lib/overstory.js tests/unit/overstory.test.ts
git commit -m "feat(overstory): add adapter with detectOverstory"
```

---

### Task 5: Add slingPlan, getAgentStatus, getFleetStatus to adapter

**Files:**
- Modify: `lib/overstory.ts`
- Modify: `tests/unit/overstory.test.ts`

- [ ] **Step 1: Write failing tests for slingPlan**

Add to `tests/unit/overstory.test.ts`:

```typescript
const { slingPlan, getAgentStatus, getFleetStatus } = require('../../lib/overstory');

describe('slingPlan(cwd, opts)', () => {
  test('calls ov sling with correct args and returns SlingResult', () => {
    cleanupTempDir(tmpDir);
    tmpDir = createTempDir({ overstoryConfig: {} });

    const mockResult = JSON.stringify({
      agent_id: 'agent-001',
      worktree_path: '/tmp/wt',
      branch: 'grd/v1/01-setup',
      tmux_session: 'ov-agent-001',
      runtime: 'claude',
    });
    (childProcess.execFileSync as jest.Mock).mockReturnValue(mockResult);

    const result = slingPlan(tmpDir, {
      plan_path: '/tmp/plan.md',
      overlay_path: '/tmp/overlay.md',
      runtime: 'claude',
      model: 'sonnet',
      phase_number: '01',
      plan_id: '01-01',
      milestone: 'v1.0',
      timeout_minutes: 30,
    });

    expect(result.agent_id).toBe('agent-001');
    expect(result.branch).toBe('grd/v1/01-setup');
    expect(childProcess.execFileSync).toHaveBeenCalledWith(
      'ov',
      expect.arrayContaining(['sling']),
      expect.any(Object)
    );
  });

  test('throws when ov sling fails', () => {
    (childProcess.execFileSync as jest.Mock).mockImplementation(() => {
      throw new Error('ov sling failed');
    });
    expect(() => slingPlan(tmpDir, {
      plan_path: '/tmp/plan.md',
      overlay_path: '/tmp/overlay.md',
      runtime: 'claude',
      model: 'sonnet',
      phase_number: '01',
      plan_id: '01-01',
      milestone: 'v1.0',
      timeout_minutes: 30,
    })).toThrow('ov sling failed');
  });
});

describe('getFleetStatus(cwd)', () => {
  test('parses ov status --json output', () => {
    const mockStatus = JSON.stringify({
      agents: [
        { agent_id: 'a1', state: 'done', exit_code: 0, duration_ms: 5000, worktree_path: '/tmp/wt1', branch: 'b1', runtime: 'claude', model: 'sonnet' },
        { agent_id: 'a2', state: 'running', exit_code: null, duration_ms: 2000, worktree_path: '/tmp/wt2', branch: 'b2', runtime: 'claude', model: 'sonnet' },
      ],
      active_count: 1,
      completed_count: 1,
      failed_count: 0,
    });
    (childProcess.execFileSync as jest.Mock).mockReturnValue(mockStatus);

    const result = getFleetStatus(tmpDir);
    expect(result.agents).toHaveLength(2);
    expect(result.active_count).toBe(1);
    expect(result.completed_count).toBe(1);
  });
});

describe('getAgentStatus(cwd, agentId)', () => {
  test('parses ov status <id> --json output', () => {
    const mockStatus = JSON.stringify({
      agent_id: 'a1',
      state: 'done',
      exit_code: 0,
      duration_ms: 5000,
      worktree_path: '/tmp/wt1',
      branch: 'b1',
      runtime: 'claude',
      model: 'sonnet',
    });
    (childProcess.execFileSync as jest.Mock).mockReturnValue(mockStatus);

    const result = getAgentStatus(tmpDir, 'a1');
    expect(result.agent_id).toBe('a1');
    expect(result.state).toBe('done');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/unit/overstory.test.ts -t "slingPlan|getFleetStatus|getAgentStatus" -v`
Expected: FAIL — functions not exported

- [ ] **Step 3: Implement slingPlan, getAgentStatus, getFleetStatus in `lib/overstory.ts`**

Add before `module.exports`, with proper type imports:

```typescript
import type { SlingOpts, SlingResult, AgentStatus, FleetStatus } from './types';

/**
 * Dispatch a plan to an Overstory worker via `ov sling`.
 */
function slingPlan(cwd: string, opts: SlingOpts): SlingResult {
  const args = [
    'sling',
    `GRD plan ${opts.plan_id}: execute plan`,
    '--runtime', opts.runtime,
    '--model', opts.model,
    '--overlay', opts.overlay_path,
  ];

  const stdout: string = execFileSync('ov', args, {
    cwd,
    timeout: 30000,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  return JSON.parse(stdout) as SlingResult;
}

/**
 * Get status of a single Overstory agent.
 */
function getAgentStatus(cwd: string, agentId: string): AgentStatus {
  const stdout: string = execFileSync('ov', ['status', agentId, '--json'], {
    cwd,
    timeout: 10000,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  return JSON.parse(stdout) as AgentStatus;
}

/**
 * Get bulk fleet status from Overstory.
 */
function getFleetStatus(cwd: string): FleetStatus {
  const stdout: string = execFileSync('ov', ['status', '--json'], {
    cwd,
    timeout: 10000,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  return JSON.parse(stdout) as FleetStatus;
}
```

Update `module.exports` to include `slingPlan`, `getAgentStatus`, `getFleetStatus`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/unit/overstory.test.ts -v`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add lib/overstory.ts tests/unit/overstory.test.ts
git commit -m "feat(overstory): add slingPlan, getAgentStatus, getFleetStatus"
```

---

### Task 6: Add mergeAgent, stopAgent, generateOverlay to adapter

**Files:**
- Modify: `lib/overstory.ts`
- Modify: `tests/unit/overstory.test.ts`

- [ ] **Step 1: Write failing tests for mergeAgent, stopAgent, generateOverlay**

Add to `tests/unit/overstory.test.ts`:

```typescript
const { mergeAgent, stopAgent, generateOverlay } = require('../../lib/overstory');

describe('mergeAgent(cwd, agentId)', () => {
  test('returns MergeResult on success', () => {
    const mockResult = JSON.stringify({
      merged: true,
      conflicts: [],
      branch: 'grd/v1/01-setup',
      commit_sha: 'abc123',
      error: null,
    });
    (childProcess.execFileSync as jest.Mock).mockReturnValue(mockResult);

    const result = mergeAgent(tmpDir, 'agent-001');
    expect(result.merged).toBe(true);
    expect(result.conflicts).toEqual([]);
    expect(result.commit_sha).toBe('abc123');
  });

  test('returns conflicts on merge failure', () => {
    const mockResult = JSON.stringify({
      merged: false,
      conflicts: ['src/index.ts', 'lib/utils.ts'],
      branch: 'grd/v1/01-setup',
      commit_sha: null,
      error: null,
    });
    (childProcess.execFileSync as jest.Mock).mockReturnValue(mockResult);

    const result = mergeAgent(tmpDir, 'agent-001');
    expect(result.merged).toBe(false);
    expect(result.conflicts).toHaveLength(2);
  });
});

describe('stopAgent(cwd, agentId)', () => {
  test('calls ov stop with agent id', () => {
    (childProcess.execFileSync as jest.Mock).mockReturnValue('{"ok":true}');
    expect(() => stopAgent(tmpDir, 'agent-001')).not.toThrow();
    expect(childProcess.execFileSync).toHaveBeenCalledWith(
      'ov',
      ['stop', 'agent-001'],
      expect.any(Object)
    );
  });
});

describe('generateOverlay(planContent, context)', () => {
  test('generates overlay with plan content and GRD conventions', () => {
    const overlay = generateOverlay('# Plan\nDo the thing', {
      phase_number: '01',
      plan_id: '01-01',
      milestone: 'v1.0',
      phase_dir: '.planning/milestones/v1.0/phases/01-setup',
    });
    expect(overlay).toContain('# Plan');
    expect(overlay).toContain('Do the thing');
    expect(overlay).toContain('01-01-SUMMARY.md');
    expect(overlay).toContain('GRD Conventions');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/unit/overstory.test.ts -t "mergeAgent|stopAgent|generateOverlay" -v`
Expected: FAIL

- [ ] **Step 3: Implement mergeAgent, stopAgent, generateOverlay in `lib/overstory.ts`**

```typescript
import type { MergeResult } from './types';

/**
 * Merge an Overstory agent's branch via `ov merge`.
 */
function mergeAgent(cwd: string, agentId: string): MergeResult {
  const stdout: string = execFileSync('ov', ['merge', agentId], {
    cwd,
    timeout: 60000,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  return JSON.parse(stdout) as MergeResult;
}

/**
 * Stop an Overstory agent via `ov stop`.
 */
function stopAgent(cwd: string, agentId: string): void {
  execFileSync('ov', ['stop', agentId], {
    cwd,
    timeout: 10000,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

/**
 * Generate an overlay file for an Overstory worker.
 * Contains the plan content plus GRD conventions for SUMMARY.md output.
 */
function generateOverlay(
  planContent: string,
  context: { phase_number: string; plan_id: string; milestone: string; phase_dir: string }
): string {
  const summaryName = `${context.plan_id}-SUMMARY.md`;
  return `# GRD Executor Task

## Your Assignment

${planContent}

## GRD Conventions

- Write your execution summary to \`${context.phase_dir}/${summaryName}\`
- Use frontmatter: phase, plan, type, status, duration
- Commit frequently with descriptive messages
- Run tests before committing

## Summary Format

\`\`\`markdown
---
phase: ${context.phase_number}
plan: ${context.plan_id.split('-')[1] || '01'}
type: execution
status: complete
duration: Xmin
---

## One-Liner
[Single sentence describing what was accomplished]

## Changes Made
- [File]: [What changed]

## Verification
- [Test/check]: [Result]
\`\`\`
`;
}
```

Update `module.exports` to include `mergeAgent`, `stopAgent`, `generateOverlay`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/unit/overstory.test.ts -v`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add lib/overstory.ts tests/unit/overstory.test.ts
git commit -m "feat(overstory): add mergeAgent, stopAgent, generateOverlay"
```

---

### Task 6b: Add installOverstory, getAgentMail, nudgeAgent to adapter

**Files:**
- Modify: `lib/overstory.ts`
- Modify: `tests/unit/overstory.test.ts`

- [ ] **Step 1: Write failing tests for installOverstory, getAgentMail, nudgeAgent**

Add to `tests/unit/overstory.test.ts`:

```typescript
const { installOverstory, getAgentMail, nudgeAgent } = require('../../lib/overstory');

describe('installOverstory(cwd)', () => {
  test('runs bun install -g overstory then ov init', () => {
    (childProcess.execFileSync as jest.Mock)
      .mockReturnValueOnce('') // bun install
      .mockReturnValueOnce(''); // ov init
    expect(() => installOverstory(tmpDir)).not.toThrow();
    expect(childProcess.execFileSync).toHaveBeenCalledWith(
      'bun', ['install', '-g', 'overstory'], expect.any(Object)
    );
    expect(childProcess.execFileSync).toHaveBeenCalledWith(
      'ov', ['init'], expect.any(Object)
    );
  });

  test('throws when bun is not available', () => {
    (childProcess.execFileSync as jest.Mock).mockImplementation((cmd: string) => {
      if (cmd === 'bun') throw new Error('ENOENT');
      return '';
    });
    expect(() => installOverstory(tmpDir)).toThrow(/Bun/);
  });
});

describe('getAgentMail(cwd, agentId)', () => {
  test('parses ov mail --agent <id> --json output', () => {
    const mockMail = JSON.stringify({
      messages: [
        { type: 'checkpoint', body: 'Need approval for schema change', ts: 1710300000 },
      ],
    });
    (childProcess.execFileSync as jest.Mock).mockReturnValue(mockMail);

    const result = getAgentMail(tmpDir, 'agent-001');
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('checkpoint');
    expect(result[0].body).toContain('schema change');
  });

  test('returns empty array when no messages', () => {
    (childProcess.execFileSync as jest.Mock).mockReturnValue('{"messages":[]}');
    const result = getAgentMail(tmpDir, 'agent-001');
    expect(result).toEqual([]);
  });
});

describe('nudgeAgent(cwd, agentId, message)', () => {
  test('calls ov nudge with agent id and message', () => {
    (childProcess.execFileSync as jest.Mock).mockReturnValue('{"ok":true}');
    expect(() => nudgeAgent(tmpDir, 'agent-001', 'Approved')).not.toThrow();
    expect(childProcess.execFileSync).toHaveBeenCalledWith(
      'ov', ['nudge', 'agent-001', 'Approved'], expect.any(Object)
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/unit/overstory.test.ts -t "installOverstory|getAgentMail|nudgeAgent" -v`
Expected: FAIL — functions not exported

- [ ] **Step 3: Implement installOverstory, getAgentMail, nudgeAgent in `lib/overstory.ts`**

```typescript
import type { OverstoryMailMessage } from './types';

/**
 * Install Overstory CLI globally via bun and initialize in the project.
 * Throws if bun is not available.
 */
function installOverstory(cwd: string): void {
  // Check bun is available
  try {
    execFileSync('bun', ['--version'], {
      timeout: 5000,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch {
    throw new Error(
      'Overstory requires Bun. Install via: curl -fsSL https://bun.sh/install | bash'
    );
  }

  // Install overstory globally
  execFileSync('bun', ['install', '-g', 'overstory'], {
    cwd,
    timeout: 120000,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  // Initialize .overstory/ in the project
  execFileSync('ov', ['init'], {
    cwd,
    timeout: 30000,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

/**
 * Read mail messages for an Overstory agent.
 * Used for checkpoint protocol — agents write checkpoints via Overstory's mail system.
 */
function getAgentMail(cwd: string, agentId: string): OverstoryMailMessage[] {
  const stdout: string = execFileSync('ov', ['mail', '--agent', agentId, '--json'], {
    cwd,
    timeout: 10000,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const parsed = JSON.parse(stdout) as { messages: OverstoryMailMessage[] };
  return parsed.messages;
}

/**
 * Send a message (nudge) to an Overstory agent.
 * Used to respond to checkpoint requests.
 */
function nudgeAgent(cwd: string, agentId: string, message: string): void {
  execFileSync('ov', ['nudge', agentId, message], {
    cwd,
    timeout: 10000,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}
```

Update `module.exports` to include `installOverstory`, `getAgentMail`, `nudgeAgent`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/unit/overstory.test.ts -v`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add lib/overstory.ts tests/unit/overstory.test.ts
git commit -m "feat(overstory): add installOverstory, getAgentMail, nudgeAgent"
```

---

## Chunk 3: Context and Parallel Integration

### Task 7: Emit overstory fields from cmdInitExecutePhase

**Files:**
- Modify: `lib/context/execute.ts:127-284`
- Test: existing integration or manual verification

- [ ] **Step 1: Add overstory detection import to `lib/context/execute.ts`**

After the existing backend import (line 48-52), add:

```typescript
const { detectOverstory, loadOverstoryConfig }: {
  detectOverstory: (cwd: string) => import('../types').OverstoryInfo | null;
  loadOverstoryConfig: (cwd: string) => import('../types').OverstoryConfig;
} = require('../overstory');
```

- [ ] **Step 2: Add overstory fields to the result object**

In `cmdInitExecutePhase`, after the `native_worktree_available` field (line 274), add:

```typescript
    // Overstory backend
    overstory_available: backend === 'overstory' ? (detectOverstory(cwd) !== null) : false,
    overstory_runtime: backend === 'overstory' ? loadOverstoryConfig(cwd).runtime : null,
    overstory_config: backend === 'overstory' ? loadOverstoryConfig(cwd) : null,
```

- [ ] **Step 3: Run existing tests to verify no regressions**

Run: `npx jest tests/unit/context.test.ts -v`
Expected: All PASS (existing tests don't set backend=overstory)

- [ ] **Step 4: Commit**

```bash
git add lib/context/execute.ts
git commit -m "feat(context): emit overstory fields in execute-phase init"
```

---

### Task 8: Verify overstory in parallel.ts mode selection

**Files:**
- Modify: `tests/unit/parallel.test.ts` (or `tests/unit/backend.test.ts`)

- [ ] **Step 1: Verify no code change needed in `lib/parallel.ts`**

The parallel mode selection at line 178-179 already works for overstory because:
- `capabilities.teams === true` (overstory has `teams: true`) -> returns `mode: 'parallel'`
- `nativeWorktreeAvailable` will be `true` -> `wt_path` will be `null`

No code change needed.

- [ ] **Step 2: Write a verification test**

Add to `tests/unit/backend.test.ts` (or parallel test):

```typescript
test('overstory backend gets parallel mode support (teams: true, native_worktree_isolation: true)', () => {
  const caps = getBackendCapabilities('overstory');
  expect(caps.teams).toBe(true);
  expect(caps.native_worktree_isolation).toBe(true);
});
```

- [ ] **Step 3: Run test**

Run: `npx jest tests/unit/backend.test.ts -t "overstory backend gets parallel" -v`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add tests/unit/backend.test.ts
git commit -m "test(backend): verify overstory parallel mode capabilities"
```

---

## Chunk 4: Execute-Phase Overstory Branch

### Task 9: Add Mode C (overstory) to execute-phase.md

**Files:**
- Modify: `commands/execute-phase.md`

- [ ] **Step 1: Read the full execute-phase.md to find the isolation step**

Read `commands/execute-phase.md` fully to locate the `setup_isolation` step and the wave execution steps.

- [ ] **Step 2: Add Mode C after Mode B in the setup_isolation step**

After the Mode B (manual) section, add:

```markdown
**Mode C: overstory (backend='overstory')**

Overstory manages agent lifecycle, worktrees, and merging. GRD dispatches plans via `ov sling`.

- Record: `ISOLATION_MODE=overstory`
- Record: `MAIN_REPO_PATH` from init JSON
- Load: `OVERSTORY_CONFIG` from init JSON `overstory_config`
- **Stale overlay cleanup:** Remove any leftover files in `.planning/.tmp/overlay-*.md` from prior crashed runs
- Verify: `overstory_available` is true. If false:
  - Check if `overstory_config.install_prompt` is true
  - If yes: prompt user "Overstory CLI not found. Install? (bun install -g overstory)"
  - On confirm: call `installOverstory(cwd)` from `lib/overstory.ts`, then re-detect
  - On decline or if install_prompt is false: fall back to Mode A (native) or Mode B (manual)
- No worktree pre-creation — Overstory handles this via `ov sling`
```

- [ ] **Step 3: Add overstory wave execution branch**

In the wave execution step, add a condition block for overstory backend:

```markdown
**If ISOLATION_MODE is 'overstory':**

For each wave:

1. **Generate overlays:**
   For each plan in wave:
   - Read PLAN.md content from phase directory
   - Generate overlay via lib/overstory.ts `generateOverlay(planContent, context)`
   - Write overlay to `.planning/.tmp/overlay-${PHASE_NUMBER}-${PLAN_ID}.md`

2. **Dispatch workers:**
   For each plan in wave:
   ```bash
   OV_RESULT=$(ov sling "GRD plan ${PLAN_ID}: execute plan" --runtime ${OVERSTORY_CONFIG.runtime} --model ${EXECUTOR_MODEL} --overlay .planning/.tmp/overlay-${PHASE_NUMBER}-${PLAN_ID}.md)
   ```
   Parse JSON: record `agent_id`, `worktree_path`, `branch` per plan.

3. **Poll for completion:**
   ```bash
   OV_STATUS=$(ov status --json)
   ```
   Every `OVERSTORY_CONFIG.poll_interval_ms` (default 5000ms):
   - Parse `agents` array, filter to our dispatched agent_ids
   - For each agent with `state: 'running'`:
     a. Check mail: `ov mail --agent ${agent_id} --json`
     b. If checkpoint messages found (type='checkpoint'):
        - Surface checkpoint body to user
        - Get user response
        - Send via `ov nudge ${agent_id} "${response}"`
   - For each agent with `state: 'done'`:
     a. Copy SUMMARY.md from `agent.worktree_path/${PHASE_DIR}/${PLAN_ID}-SUMMARY.md`
        to `${MAIN_REPO_PATH}/${PHASE_DIR}/` (BEFORE merge)
     b. Run `ov merge ${agent_id}` — parse MergeResult
     c. If `merged: false`: log conflict to SUMMARY.md, warn user
   - For each agent with `state: 'failed'`:
     a. Log failure, copy any partial SUMMARY.md
     b. Mark plan as failed in status tracker
   - Check timeout: if any agent exceeds `team_timeout_minutes`,
     run `ov stop ${agent_id}`

4. **Wave complete:**
   - Clean up overlay files: `rm .planning/.tmp/overlay-${PHASE_NUMBER}-*.md`
   - Code review (if timing=per_wave): run as normal
   - Proceed to next wave

5. **Phase complete:**
   - Clean up `.planning/.tmp/` if empty
   - Record metrics via `state record-metric`
   - Trigger eval report if EVAL.md exists
```

- [ ] **Step 4: Commit**

```bash
git add commands/execute-phase.md
git commit -m "feat(execute-phase): add Overstory execution branch (Mode C)"
```

---

### Task 10: Add overstory subcommand to settings.md

**Files:**
- Modify: `commands/settings.md`

- [ ] **Step 1: Read settings.md to find the subcommand section**

Read `commands/settings.md` to understand the existing subcommand pattern.

- [ ] **Step 2: Add overstory subcommand**

Add a new section for the `overstory` subcommand following the existing pattern:

```markdown
### `overstory` — Configure Overstory execution backend

**Subcommands:**

- `overstory runtime <name>` — Set worker runtime adapter (claude, codex, pi, sapling)
  Updates `overstory.runtime` in `.planning/config.json`

- `overstory merge auto|manual` — Set merge strategy
  Updates `overstory.merge_strategy` in `.planning/config.json`

- `overstory poll <ms>` — Set polling interval in milliseconds
  Updates `overstory.poll_interval_ms` in `.planning/config.json`

**Show current config:**
Read and display the `overstory` section from `.planning/config.json`.
Default values if section missing: runtime=claude, poll_interval_ms=5000, merge_strategy=auto.
```

- [ ] **Step 3: Commit**

```bash
git add commands/settings.md
git commit -m "feat(settings): add overstory subcommand"
```

---

### Task 10b: Register overstory subcommands in `bin/grd-tools.ts`

**Files:**
- Modify: `bin/grd-tools.ts`

- [ ] **Step 1: Read `bin/grd-tools.ts` to find the command routing section**

Find where other commands are routed (e.g., `worktree`, `state`, `phase`).

- [ ] **Step 2: Add overstory import**

Add to the typed imports section:

```typescript
const { detectOverstory, installOverstory }: {
  detectOverstory: (cwd: string) => Record<string, unknown> | null;
  installOverstory: (cwd: string) => void;
} = require('../lib/overstory');
```

- [ ] **Step 3: Add overstory command routing**

In the command switch/if-else chain, add:

```typescript
if (command === 'overstory') {
  const sub = validateSubcommand(args[0] || '', ['detect', 'install'], 'overstory');

  if (sub === 'detect') {
    const result = detectOverstory(cwd);
    output(result || { available: false, reason: 'Overstory not detected' }, raw);
  } else if (sub === 'install') {
    try {
      installOverstory(cwd);
      output({ ok: true, message: 'Overstory installed and initialized' }, raw);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      output({ ok: false, error: msg }, raw);
    }
  }
}
```

- [ ] **Step 4: Run lint to verify**

Run: `npm run lint`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add bin/grd-tools.ts
git commit -m "feat(cli): register overstory detect/install subcommands"
```

---

## Chunk 5: Final Verification

### Task 11: Run full test suite and fix any breakage

**Files:**
- All modified files

- [ ] **Step 1: Run full unit test suite**

Run: `npx jest tests/unit/ --coverage`
Expected: All pass. Check coverage for new file.

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: No errors (fix any with `npm run lint:fix`)

- [ ] **Step 3: Run type check**

Run: `npm run build:check`
Expected: No type errors

- [ ] **Step 4: Run format check**

Run: `npm run format:check`
Expected: Clean (fix any with `npm run format`)

- [ ] **Step 5: Fix any issues found and commit**

```bash
git add -A
git commit -m "chore: fix lint/type/format issues from overstory integration"
```

---

### Task 12: Add jest coverage threshold for new test file

**Files:**
- Modify: `jest.config.js`

- [ ] **Step 1: Read jest.config.js to find the coverage thresholds section**

- [ ] **Step 2: Add threshold for `lib/overstory.ts`**

Following the existing pattern, add:

```javascript
'./lib/overstory.ts': {
  branches: 80,
  functions: 90,
  lines: 90,
  statements: 90,
},
```

- [ ] **Step 3: Run tests with coverage to verify threshold**

Run: `npx jest tests/unit/overstory.test.ts --coverage`
Expected: Coverage meets thresholds

- [ ] **Step 4: Commit**

```bash
git add jest.config.js
git commit -m "chore: add coverage threshold for lib/overstory.ts"
```
