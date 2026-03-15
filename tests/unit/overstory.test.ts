/**
 * Unit tests for lib/overstory.ts
 *
 * Tests Overstory adapter: detection, config loading, plan dispatch,
 * status polling, merge, mail, and overlay generation.
 *
 * All child_process calls are mocked — no real `ov` CLI required.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

// ─── Mock child_process (before module load) ──────────────────────────────────

const mockExecFileSync = jest.fn();

jest.mock('child_process', () => ({
  execFileSync: mockExecFileSync,
}));

// ─── Module under test ────────────────────────────────────────────────────────

const {
  MIN_VERSION,
  DEFAULT_OVERSTORY_CONFIG,
  compareSemver,
  loadOverstoryConfig,
  detectOverstory,
  installOverstory,
  slingPlan,
  slingPlanAsync,
  getAgentStatus,
  getFleetStatus,
  mergeAgent,
  stopAgent,
  getAgentMail,
  nudgeAgent,
  generateOverlay,
} = require('../../lib/overstory');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'grd-overstory-test-'));
}

function cleanupTempDir(dir: string): void {
  if (!dir || !dir.startsWith(os.tmpdir())) return;
  fs.rmSync(dir, { recursive: true, force: true });
}

function writeOverstoryConfig(dir: string): void {
  const ovDir = path.join(dir, '.overstory');
  fs.mkdirSync(ovDir, { recursive: true });
  fs.writeFileSync(path.join(ovDir, 'config.yaml'), 'runtime: claude\n');
}

function writePlanningConfig(dir: string, config: Record<string, unknown>): void {
  const planningDir = path.join(dir, '.planning');
  fs.mkdirSync(planningDir, { recursive: true });
  fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify(config));
}

// ─── compareSemver ────────────────────────────────────────────────────────────

describe('compareSemver', () => {
  test('returns 0 for equal versions', () => {
    expect(compareSemver('1.2.3', '1.2.3')).toBe(0);
    expect(compareSemver('0.8.0', '0.8.0')).toBe(0);
  });

  test('returns -1 when a < b', () => {
    expect(compareSemver('0.7.9', '0.8.0')).toBe(-1);
    expect(compareSemver('1.0.0', '2.0.0')).toBe(-1);
    expect(compareSemver('1.2.3', '1.2.4')).toBe(-1);
    expect(compareSemver('1.2.3', '1.3.0')).toBe(-1);
  });

  test('returns 1 when a > b', () => {
    expect(compareSemver('0.9.0', '0.8.0')).toBe(1);
    expect(compareSemver('2.0.0', '1.9.9')).toBe(1);
    expect(compareSemver('1.2.4', '1.2.3')).toBe(1);
  });

  test('handles missing patch segment', () => {
    expect(compareSemver('1.0', '1.0.0')).toBe(0);
    expect(compareSemver('1.1', '1.0.0')).toBe(1);
  });

  test('strips pre-release suffixes before comparing', () => {
    expect(compareSemver('0.8.0-beta.1', '0.8.0')).toBe(0);
    expect(compareSemver('0.7.9-rc.1', '0.8.0')).toBe(-1);
    expect(compareSemver('1.0.0-alpha', '0.9.9')).toBe(1);
  });
});

// ─── DEFAULT_OVERSTORY_CONFIG ─────────────────────────────────────────────────

describe('DEFAULT_OVERSTORY_CONFIG', () => {
  test('has expected defaults', () => {
    expect(DEFAULT_OVERSTORY_CONFIG).toEqual({
      runtime: 'claude',
      install_prompt: true,
      poll_interval_ms: 5000,
      merge_strategy: 'auto',
      overlay_template: null,
    });
  });
});

// ─── MIN_VERSION ──────────────────────────────────────────────────────────────

describe('MIN_VERSION', () => {
  test('is 0.8.0', () => {
    expect(MIN_VERSION).toBe('0.8.0');
  });
});

// ─── loadOverstoryConfig ──────────────────────────────────────────────────────

describe('loadOverstoryConfig', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tmpDir);
  });

  test('returns defaults when no config.json exists', () => {
    const config = loadOverstoryConfig(tmpDir);
    expect(config).toEqual(DEFAULT_OVERSTORY_CONFIG);
  });

  test('returns defaults when config.json has no overstory key', () => {
    writePlanningConfig(tmpDir, { tracker: { provider: 'github' } });
    const config = loadOverstoryConfig(tmpDir);
    expect(config).toEqual(DEFAULT_OVERSTORY_CONFIG);
  });

  test('merges user overstory config with defaults', () => {
    writePlanningConfig(tmpDir, {
      overstory: {
        runtime: 'opencode',
        poll_interval_ms: 3000,
      },
    });
    const config = loadOverstoryConfig(tmpDir);
    expect(config.runtime).toBe('opencode');
    expect(config.poll_interval_ms).toBe(3000);
    // Unspecified fields keep defaults
    expect(config.install_prompt).toBe(true);
    expect(config.merge_strategy).toBe('auto');
    expect(config.overlay_template).toBeNull();
  });

  test('merge_strategy can be overridden to manual', () => {
    writePlanningConfig(tmpDir, {
      overstory: { merge_strategy: 'manual' },
    });
    const config = loadOverstoryConfig(tmpDir);
    expect(config.merge_strategy).toBe('manual');
  });

  test('overlay_template can be set', () => {
    writePlanningConfig(tmpDir, {
      overstory: { overlay_template: 'my-template.md' },
    });
    const config = loadOverstoryConfig(tmpDir);
    expect(config.overlay_template).toBe('my-template.md');
  });

  test('returns defaults when config.json is invalid JSON', () => {
    const planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningDir, { recursive: true });
    fs.writeFileSync(path.join(planningDir, 'config.json'), 'not-json{{{');
    const config = loadOverstoryConfig(tmpDir);
    expect(config).toEqual(DEFAULT_OVERSTORY_CONFIG);
  });
});

// ─── detectOverstory ──────────────────────────────────────────────────────────

describe('detectOverstory', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTempDir();
    mockExecFileSync.mockReset();
  });

  afterEach(() => {
    cleanupTempDir(tmpDir);
  });

  test('returns null when .overstory/config.yaml does not exist', () => {
    const result = detectOverstory(tmpDir);
    expect(result).toBeNull();
    expect(mockExecFileSync).not.toHaveBeenCalled();
  });

  test('returns null when ov CLI is not on PATH (execFileSync throws)', () => {
    writeOverstoryConfig(tmpDir);
    mockExecFileSync.mockImplementation(() => {
      throw new Error('spawn ov ENOENT');
    });
    const result = detectOverstory(tmpDir);
    expect(result).toBeNull();
  });

  test('returns null when version is below minimum', () => {
    writeOverstoryConfig(tmpDir);
    mockExecFileSync.mockReturnValue('0.7.9\n');
    const result = detectOverstory(tmpDir);
    expect(result).toBeNull();
  });

  test('returns null for version exactly equal to 0.7.9 (below 0.8.0)', () => {
    writeOverstoryConfig(tmpDir);
    mockExecFileSync.mockReturnValue('0.7.9');
    expect(detectOverstory(tmpDir)).toBeNull();
  });

  test('returns OverstoryInfo for valid installation at minimum version', () => {
    writeOverstoryConfig(tmpDir);
    mockExecFileSync.mockReturnValue('0.8.0\n');
    const result = detectOverstory(tmpDir);
    expect(result).not.toBeNull();
    expect(result!.available).toBe(true);
    expect(result!.version).toBe('0.8.0');
    expect(result!.max_agents).toBe(25);
    expect(result!.default_runtime).toBe('claude');
    expect(result!.config_path).toBe(path.join(tmpDir, '.overstory', 'config.yaml'));
    expect(result!.worktree_base).toBe(path.join(tmpDir, '.overstory', 'worktrees'));
  });

  test('strips leading v prefix from version string', () => {
    writeOverstoryConfig(tmpDir);
    mockExecFileSync.mockReturnValue('v1.0.0\n');
    const result = detectOverstory(tmpDir);
    expect(result).not.toBeNull();
    expect(result!.version).toBe('1.0.0');
  });

  test('returns OverstoryInfo for version above minimum', () => {
    writeOverstoryConfig(tmpDir);
    mockExecFileSync.mockReturnValue('1.2.3\n');
    const result = detectOverstory(tmpDir);
    expect(result).not.toBeNull();
    expect(result!.version).toBe('1.2.3');
  });

  test('uses runtime from .planning/config.json overstory config', () => {
    writeOverstoryConfig(tmpDir);
    writePlanningConfig(tmpDir, { overstory: { runtime: 'codex' } });
    mockExecFileSync.mockReturnValue('0.9.0\n');
    const result = detectOverstory(tmpDir);
    expect(result).not.toBeNull();
    expect(result!.default_runtime).toBe('codex');
  });
});

// ─── installOverstory ─────────────────────────────────────────────────────────

describe('installOverstory', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTempDir();
    mockExecFileSync.mockReset();
  });

  afterEach(() => {
    cleanupTempDir(tmpDir);
  });

  test('runs bun install and ov init on success', () => {
    mockExecFileSync
      .mockReturnValueOnce('1.0.0\n') // bun --version
      .mockReturnValueOnce('') // bun install -g overstory
      .mockReturnValueOnce(''); // ov init

    installOverstory(tmpDir);

    expect(mockExecFileSync).toHaveBeenCalledTimes(3);

    const [firstCall, secondCall, thirdCall] = mockExecFileSync.mock.calls;
    expect(firstCall[0]).toBe('bun');
    expect(firstCall[1]).toEqual(['--version']);

    expect(secondCall[0]).toBe('bun');
    expect(secondCall[1]).toEqual(['install', '-g', 'overstory']);

    expect(thirdCall[0]).toBe('ov');
    expect(thirdCall[1]).toEqual(['init']);
  });

  test('throws helpful error when bun is not available', () => {
    mockExecFileSync.mockImplementationOnce(() => {
      throw new Error('spawn bun ENOENT');
    });

    expect(() => installOverstory(tmpDir)).toThrow(
      'Overstory requires Bun. Install via: curl -fsSL https://bun.sh/install | bash'
    );
    // Should not call bun install or ov init
    expect(mockExecFileSync).toHaveBeenCalledTimes(1);
  });
});

// ─── slingPlan ────────────────────────────────────────────────────────────────

describe('slingPlan', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTempDir();
    mockExecFileSync.mockReset();
  });

  afterEach(() => {
    cleanupTempDir(tmpDir);
  });

  const baseSlingOpts = {
    plan_path: '/tmp/plan.md',
    overlay_path: '/tmp/overlay.md',
    runtime: 'claude',
    model: 'claude-opus-4-5',
    phase_number: '05',
    plan_id: '05-01',
    milestone: 'v1.0.0',
    timeout_minutes: 30,
  };

  const slingResultFixture = {
    agent_id: 'ov-agent-abc123',
    worktree_path: '/tmp/worktrees/abc123',
    branch: 'grd/v1.0.0/05-plan',
    tmux_session: 'ov-abc123',
    runtime: 'claude',
  };

  test('calls ov sling with correct arguments and returns parsed result', () => {
    mockExecFileSync.mockReturnValue(JSON.stringify(slingResultFixture));

    const result = slingPlan(tmpDir, baseSlingOpts);

    expect(result).toEqual(slingResultFixture);
    expect(mockExecFileSync).toHaveBeenCalledTimes(1);

    const [cmd, args] = mockExecFileSync.mock.calls[0];
    expect(cmd).toBe('ov');
    expect(args[0]).toBe('sling');
    expect(args[1]).toBe('GRD plan 05-01: execute plan');
    expect(args).toContain('--runtime');
    expect(args).toContain('claude');
    expect(args).toContain('--model');
    expect(args).toContain('claude-opus-4-5');
    expect(args).toContain('--overlay');
    expect(args).toContain('/tmp/overlay.md');
  });

  test('throws when ov CLI fails', () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error('ov: command failed');
    });

    expect(() => slingPlan(tmpDir, baseSlingOpts)).toThrow('ov: command failed');
  });
});

// ─── getAgentStatus ───────────────────────────────────────────────────────────

describe('getAgentStatus', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTempDir();
    mockExecFileSync.mockReset();
  });

  afterEach(() => {
    cleanupTempDir(tmpDir);
  });

  test('calls ov status with agent id and --json, returns parsed AgentStatus', () => {
    const statusFixture = {
      agent_id: 'ov-agent-abc123',
      state: 'running',
      exit_code: null,
      duration_ms: 12500,
      worktree_path: '/tmp/worktrees/abc123',
      branch: 'grd/v1.0.0/05-plan',
      runtime: 'claude',
      model: 'claude-opus-4-5',
    };
    mockExecFileSync.mockReturnValue(JSON.stringify(statusFixture));

    const result = getAgentStatus(tmpDir, 'ov-agent-abc123');

    expect(result).toEqual(statusFixture);
    const [cmd, args] = mockExecFileSync.mock.calls[0];
    expect(cmd).toBe('ov');
    expect(args).toEqual(['status', 'ov-agent-abc123', '--json']);
  });

  test('parses done state with exit_code', () => {
    const doneStatus = {
      agent_id: 'ov-agent-xyz',
      state: 'done',
      exit_code: 0,
      duration_ms: 45000,
      worktree_path: '/tmp/worktrees/xyz',
      branch: 'grd/v1.0.0/05-plan',
      runtime: 'claude',
      model: 'claude-sonnet-4-5',
    };
    mockExecFileSync.mockReturnValue(JSON.stringify(doneStatus));

    const result = getAgentStatus(tmpDir, 'ov-agent-xyz');
    expect(result.state).toBe('done');
    expect(result.exit_code).toBe(0);
  });
});

// ─── getFleetStatus ───────────────────────────────────────────────────────────

describe('getFleetStatus', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTempDir();
    mockExecFileSync.mockReset();
  });

  afterEach(() => {
    cleanupTempDir(tmpDir);
  });

  test('calls ov status --json and returns parsed FleetStatus', () => {
    const fleetFixture = {
      agents: [
        {
          agent_id: 'ov-agent-001',
          state: 'running',
          exit_code: null,
          duration_ms: 5000,
          worktree_path: '/tmp/worktrees/001',
          branch: 'grd/v1/05-p1',
          runtime: 'claude',
          model: 'claude-opus-4-5',
        },
        {
          agent_id: 'ov-agent-002',
          state: 'done',
          exit_code: 0,
          duration_ms: 30000,
          worktree_path: '/tmp/worktrees/002',
          branch: 'grd/v1/05-p2',
          runtime: 'claude',
          model: 'claude-opus-4-5',
        },
      ],
      active_count: 1,
      completed_count: 1,
      failed_count: 0,
    };
    mockExecFileSync.mockReturnValue(JSON.stringify(fleetFixture));

    const result = getFleetStatus(tmpDir);

    expect(result).toEqual(fleetFixture);
    expect(result.agents).toHaveLength(2);
    expect(result.active_count).toBe(1);
    expect(result.completed_count).toBe(1);
    expect(result.failed_count).toBe(0);

    const [cmd, args] = mockExecFileSync.mock.calls[0];
    expect(cmd).toBe('ov');
    expect(args).toEqual(['status', '--json']);
  });

  test('returns empty fleet', () => {
    const emptyFleet = {
      agents: [],
      active_count: 0,
      completed_count: 0,
      failed_count: 0,
    };
    mockExecFileSync.mockReturnValue(JSON.stringify(emptyFleet));

    const result = getFleetStatus(tmpDir);
    expect(result.agents).toHaveLength(0);
  });
});

// ─── mergeAgent ───────────────────────────────────────────────────────────────

describe('mergeAgent', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTempDir();
    mockExecFileSync.mockReset();
  });

  afterEach(() => {
    cleanupTempDir(tmpDir);
  });

  test('calls ov merge with agent id and returns parsed MergeResult on success', () => {
    const mergeFixture = {
      merged: true,
      conflicts: [],
      branch: 'grd/v1.0.0/05-p1',
      commit_sha: 'abc123def456',
      error: null,
    };
    mockExecFileSync.mockReturnValue(JSON.stringify(mergeFixture));

    const result = mergeAgent(tmpDir, 'ov-agent-abc123');

    expect(result).toEqual(mergeFixture);
    expect(result.merged).toBe(true);
    expect(result.conflicts).toHaveLength(0);
    expect(result.commit_sha).toBe('abc123def456');

    const [cmd, args] = mockExecFileSync.mock.calls[0];
    expect(cmd).toBe('ov');
    expect(args).toEqual(['merge', 'ov-agent-abc123', '--json']);
  });

  test('returns MergeResult with conflicts when merge has conflicts', () => {
    const conflictFixture = {
      merged: false,
      conflicts: ['src/lib/foo.ts', 'src/lib/bar.ts'],
      branch: 'grd/v1.0.0/05-p1',
      commit_sha: null,
      error: 'merge conflicts detected',
    };
    mockExecFileSync.mockReturnValue(JSON.stringify(conflictFixture));

    const result = mergeAgent(tmpDir, 'ov-agent-xyz');

    expect(result.merged).toBe(false);
    expect(result.conflicts).toEqual(['src/lib/foo.ts', 'src/lib/bar.ts']);
    expect(result.commit_sha).toBeNull();
    expect(result.error).toBe('merge conflicts detected');
  });
});

// ─── stopAgent ────────────────────────────────────────────────────────────────

describe('stopAgent', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTempDir();
    mockExecFileSync.mockReset();
  });

  afterEach(() => {
    cleanupTempDir(tmpDir);
  });

  test('calls ov stop with agent id', () => {
    mockExecFileSync.mockReturnValue('');

    stopAgent(tmpDir, 'ov-agent-abc123');

    expect(mockExecFileSync).toHaveBeenCalledTimes(1);
    const [cmd, args] = mockExecFileSync.mock.calls[0];
    expect(cmd).toBe('ov');
    expect(args).toEqual(['stop', 'ov-agent-abc123']);
  });

  test('propagates error from ov CLI', () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error('agent not found');
    });

    expect(() => stopAgent(tmpDir, 'nonexistent-agent')).toThrow('agent not found');
  });
});

// ─── getAgentMail ─────────────────────────────────────────────────────────────

describe('getAgentMail', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTempDir();
    mockExecFileSync.mockReset();
  });

  afterEach(() => {
    cleanupTempDir(tmpDir);
  });

  test('calls ov mail with agent id and --json, returns messages array', () => {
    const mailFixture = {
      messages: [
        { type: 'status', body: 'Starting plan execution...', ts: 1700000001000 },
        { type: 'progress', body: 'Tests passing (12/12)', ts: 1700000060000 },
      ],
    };
    mockExecFileSync.mockReturnValue(JSON.stringify(mailFixture));

    const result = getAgentMail(tmpDir, 'ov-agent-abc123');

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      type: 'status',
      body: 'Starting plan execution...',
      ts: 1700000001000,
    });
    expect(result[1].type).toBe('progress');

    const [cmd, args] = mockExecFileSync.mock.calls[0];
    expect(cmd).toBe('ov');
    expect(args).toEqual(['mail', '--agent', 'ov-agent-abc123', '--json']);
  });

  test('returns empty array when no messages', () => {
    mockExecFileSync.mockReturnValue(JSON.stringify({ messages: [] }));

    const result = getAgentMail(tmpDir, 'ov-agent-abc123');
    expect(result).toEqual([]);
  });
});

// ─── nudgeAgent ───────────────────────────────────────────────────────────────

describe('nudgeAgent', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTempDir();
    mockExecFileSync.mockReset();
  });

  afterEach(() => {
    cleanupTempDir(tmpDir);
  });

  test('calls ov nudge with agent id and message', () => {
    mockExecFileSync.mockReturnValue('');

    nudgeAgent(tmpDir, 'ov-agent-abc123', 'Please focus on the failing tests.');

    expect(mockExecFileSync).toHaveBeenCalledTimes(1);
    const [cmd, args] = mockExecFileSync.mock.calls[0];
    expect(cmd).toBe('ov');
    expect(args).toEqual(['nudge', 'ov-agent-abc123', '--', 'Please focus on the failing tests.']);
  });
});

// ─── generateOverlay ──────────────────────────────────────────────────────────

describe('generateOverlay', () => {
  const planContent = '## Implement feature X\n\n- Task A\n- Task B';
  const context = {
    phase_number: '05',
    plan_id: '05-01',
    milestone: 'v1.0.0',
    phase_dir: '.planning/milestones/v1.0.0/phases/05-feature-x',
  };

  test('contains the plan content', () => {
    const overlay = generateOverlay(planContent, context);
    expect(overlay).toContain('## Implement feature X');
    expect(overlay).toContain('- Task A');
    expect(overlay).toContain('- Task B');
  });

  test('contains summary file name derived from plan_id', () => {
    const overlay = generateOverlay(planContent, context);
    expect(overlay).toContain('05-01-SUMMARY.md');
  });

  test('contains phase_dir in summary path', () => {
    const overlay = generateOverlay(planContent, context);
    expect(overlay).toContain(context.phase_dir);
  });

  test('contains GRD conventions section', () => {
    const overlay = generateOverlay(planContent, context);
    expect(overlay).toContain('GRD Conventions');
    expect(overlay).toContain('Commit frequently');
    expect(overlay).toContain('Run tests before committing');
  });

  test('contains frontmatter fields in summary format', () => {
    const overlay = generateOverlay(planContent, context);
    expect(overlay).toContain('phase: 05');
    expect(overlay).toContain('type: execution');
    expect(overlay).toContain('status: complete');
    expect(overlay).toContain('duration: Xmin');
  });

  test('extracts plan number from plan_id', () => {
    const overlay = generateOverlay(planContent, context);
    // plan_id '05-01' -> plan: '01'
    expect(overlay).toContain('plan: 01');
  });

  test('falls back to "01" when plan_id has no dash', () => {
    const contextNoDash = { ...context, plan_id: 'PLAN' };
    const overlay = generateOverlay(planContent, contextNoDash);
    expect(overlay).toContain('plan: 01');
  });

  test('includes Your Assignment heading', () => {
    const overlay = generateOverlay(planContent, context);
    expect(overlay).toContain('## Your Assignment');
  });

  test('summary name uses plan_id with -SUMMARY.md suffix', () => {
    const contextAlt = { ...context, plan_id: '07-03' };
    const overlay = generateOverlay(planContent, contextAlt);
    expect(overlay).toContain('07-03-SUMMARY.md');
  });
});

// ─── slingPlanAsync ───────────────────────────────────────────────────────────

describe('slingPlanAsync', () => {
  let tmpDir: string;

  const baseSlingOpts = {
    plan_path: '/tmp/plan.md',
    overlay_path: '/tmp/overlay.md',
    runtime: 'claude',
    model: 'claude-opus-4-5',
    phase_number: '05',
    plan_id: '05-01',
    milestone: 'v1.0.0',
    timeout_minutes: 30,
  };

  const slingResultFixture = {
    agent_id: 'ov-agent-async-001',
    worktree_path: '/tmp/worktrees/async-001',
    branch: 'grd/v1.0.0/05-plan',
    tmux_session: 'ov-async-001',
    runtime: 'claude',
  };

  const mergeResultFixture = {
    merged: true,
    conflicts: [],
    branch: 'grd/v1.0.0/05-plan',
    commit_sha: 'deadbeef',
    error: null,
  };

  beforeEach(() => {
    tmpDir = createTempDir();
    mockExecFileSync.mockReset();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    cleanupTempDir(tmpDir);
  });

  test('should dispatch, poll, and return on done state', async () => {
    // Call 1: slingPlan -> returns SlingResult
    // Call 2: getAgentStatus -> state='running'
    // Call 3: getAgentStatus -> state='done', exit_code=0
    // Call 4: mergeAgent -> returns MergeResult
    mockExecFileSync
      .mockReturnValueOnce(JSON.stringify(slingResultFixture))
      .mockReturnValueOnce(JSON.stringify({
        agent_id: 'ov-agent-async-001',
        state: 'running',
        exit_code: null,
        duration_ms: 5000,
        worktree_path: '/tmp/worktrees/async-001',
        branch: 'grd/v1.0.0/05-plan',
        runtime: 'claude',
        model: 'claude-opus-4-5',
      }))
      .mockReturnValueOnce(JSON.stringify({
        agent_id: 'ov-agent-async-001',
        state: 'done',
        exit_code: 0,
        duration_ms: 30000,
        worktree_path: '/tmp/worktrees/async-001',
        branch: 'grd/v1.0.0/05-plan',
        runtime: 'claude',
        model: 'claude-opus-4-5',
      }))
      .mockReturnValueOnce(JSON.stringify(mergeResultFixture));

    const promise = slingPlanAsync(tmpDir, baseSlingOpts, 100, 'auto');

    // Advance past two poll intervals (running, then done)
    await jest.advanceTimersByTimeAsync(100);
    await jest.advanceTimersByTimeAsync(100);

    const result = await promise;

    expect(result.exitCode).toBe(0);
    expect(result.duration).toBeGreaterThanOrEqual(0);
    expect(result.agentId).toBe('ov-agent-async-001');

    // Verify slingPlan was called (call 1)
    expect(mockExecFileSync.mock.calls[0][1][0]).toBe('sling');
    // Verify getAgentStatus was called (calls 2-3)
    expect(mockExecFileSync.mock.calls[1][1]).toEqual(['status', 'ov-agent-async-001', '--json']);
    expect(mockExecFileSync.mock.calls[2][1]).toEqual(['status', 'ov-agent-async-001', '--json']);
    // Verify mergeAgent was called (call 4) — strategy is 'auto'
    expect(mockExecFileSync.mock.calls[3][1]).toEqual(['merge', 'ov-agent-async-001', '--json']);
  });

  test('should handle failed agent', async () => {
    mockExecFileSync
      .mockReturnValueOnce(JSON.stringify(slingResultFixture))
      .mockReturnValueOnce(JSON.stringify({
        agent_id: 'ov-agent-async-001',
        state: 'failed',
        exit_code: 1,
        duration_ms: 10000,
        worktree_path: '/tmp/worktrees/async-001',
        branch: 'grd/v1.0.0/05-plan',
        runtime: 'claude',
        model: 'claude-opus-4-5',
      }))
      .mockReturnValueOnce(JSON.stringify(mergeResultFixture));

    const promise = slingPlanAsync(tmpDir, baseSlingOpts, 100, 'auto');

    await jest.advanceTimersByTimeAsync(100);

    const result = await promise;

    expect(result.exitCode).toBe(1);
    expect(result.agentId).toBe('ov-agent-async-001');
    expect(result.duration).toBeGreaterThanOrEqual(0);

    // mergeAgent should still be called because strategy is 'auto'
    expect(mockExecFileSync).toHaveBeenCalledTimes(3);
  });

  test('should skip merge when strategy is manual', async () => {
    mockExecFileSync
      .mockReturnValueOnce(JSON.stringify(slingResultFixture))
      .mockReturnValueOnce(JSON.stringify({
        agent_id: 'ov-agent-async-001',
        state: 'done',
        exit_code: 0,
        duration_ms: 20000,
        worktree_path: '/tmp/worktrees/async-001',
        branch: 'grd/v1.0.0/05-plan',
        runtime: 'claude',
        model: 'claude-opus-4-5',
      }));

    const promise = slingPlanAsync(tmpDir, baseSlingOpts, 100, 'manual');

    await jest.advanceTimersByTimeAsync(100);

    const result = await promise;

    expect(result.exitCode).toBe(0);
    expect(result.agentId).toBe('ov-agent-async-001');

    // Only 2 calls: slingPlan + getAgentStatus — no mergeAgent
    expect(mockExecFileSync).toHaveBeenCalledTimes(2);
    // Verify no 'merge' call was made
    const allCmds = mockExecFileSync.mock.calls.map((c: unknown[]) => (c[1] as string[])[0]);
    expect(allCmds).not.toContain('merge');
  });

  test('should call mergeAgent when strategy is auto', async () => {
    mockExecFileSync
      .mockReturnValueOnce(JSON.stringify(slingResultFixture))
      .mockReturnValueOnce(JSON.stringify({
        agent_id: 'ov-agent-async-001',
        state: 'done',
        exit_code: 0,
        duration_ms: 20000,
        worktree_path: '/tmp/worktrees/async-001',
        branch: 'grd/v1.0.0/05-plan',
        runtime: 'claude',
        model: 'claude-opus-4-5',
      }))
      .mockReturnValueOnce(JSON.stringify(mergeResultFixture));

    const promise = slingPlanAsync(tmpDir, baseSlingOpts, 100, 'auto');

    await jest.advanceTimersByTimeAsync(100);

    const result = await promise;

    expect(result.exitCode).toBe(0);
    // 3 calls: slingPlan + getAgentStatus + mergeAgent
    expect(mockExecFileSync).toHaveBeenCalledTimes(3);
    // Verify the merge call
    expect(mockExecFileSync.mock.calls[2][1]).toEqual(['merge', 'ov-agent-async-001', '--json']);
  });

  test('should default exit_code to 0 when done state has null exit_code', async () => {
    mockExecFileSync
      .mockReturnValueOnce(JSON.stringify(slingResultFixture))
      .mockReturnValueOnce(JSON.stringify({
        agent_id: 'ov-agent-async-001',
        state: 'done',
        exit_code: null,
        duration_ms: 20000,
        worktree_path: '/tmp/worktrees/async-001',
        branch: 'grd/v1.0.0/05-plan',
        runtime: 'claude',
        model: 'claude-opus-4-5',
      }));

    const promise = slingPlanAsync(tmpDir, baseSlingOpts, 100, 'manual');

    await jest.advanceTimersByTimeAsync(100);

    const result = await promise;

    expect(result.exitCode).toBe(0);
  });

  test('should default exit_code to 1 when failed state has null exit_code', async () => {
    mockExecFileSync
      .mockReturnValueOnce(JSON.stringify(slingResultFixture))
      .mockReturnValueOnce(JSON.stringify({
        agent_id: 'ov-agent-async-001',
        state: 'failed',
        exit_code: null,
        duration_ms: 20000,
        worktree_path: '/tmp/worktrees/async-001',
        branch: 'grd/v1.0.0/05-plan',
        runtime: 'claude',
        model: 'claude-opus-4-5',
      }));

    const promise = slingPlanAsync(tmpDir, baseSlingOpts, 100, 'manual');

    await jest.advanceTimersByTimeAsync(100);

    const result = await promise;

    expect(result.exitCode).toBe(1);
  });
});
