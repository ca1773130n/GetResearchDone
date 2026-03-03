/**
 * Unit tests for lib/autoplan.ts
 *
 * Tests the autoplan module: prompt building, core runner (runAutoplan),
 * CLI entry point (cmdAutoplan), and init context (cmdInitAutoplan).
 */

'use strict';

// ─── Mocks (before any imports) ──────────────────────────────────────────────

const mockLoadConfig = jest.fn().mockReturnValue({
  model_profile: 'balanced',
  autonomous_mode: true,
  timeouts: { autopilot_check_ms: 5000 },
});

const mockOutput = jest.fn();

const mockGetMilestoneInfo = jest.fn().mockReturnValue({
  version: 'v1.0.0',
  name: 'Test Milestone',
});

jest.mock('../../lib/utils', () => ({
  loadConfig: mockLoadConfig,
  output: mockOutput,
  getMilestoneInfo: mockGetMilestoneInfo,
}));

const mockSpawnClaude = jest.fn().mockReturnValue({
  exitCode: 0,
  timedOut: false,
});

jest.mock('../../lib/autopilot', () => ({
  spawnClaude: mockSpawnClaude,
}));

const mockRunGroupDiscovery = jest.fn().mockResolvedValue({
  groups: [],
  selected_groups: [],
  remaining_groups: [],
  all_items_count: 0,
  merged_items_count: 0,
  groups_count: 0,
});

jest.mock('../../lib/evolve/discovery', () => ({
  runGroupDiscovery: mockRunGroupDiscovery,
}));

const mockReadEvolveState = jest.fn().mockReturnValue(null);

jest.mock('../../lib/evolve/state', () => ({
  readEvolveState: mockReadEvolveState,
}));

// ─── Import module under test ────────────────────────────────────────────────

const {
  buildAutoplanPrompt,
  runAutoplan,
  cmdAutoplan,
  cmdInitAutoplan,
} = require('../../lib/autoplan');

// ─── Test Helpers ────────────────────────────────────────────────────────────

function makeGroup(overrides: Record<string, unknown> = {}) {
  return {
    id: 'quality/fix-linting',
    theme: 'Code Quality',
    dimension: 'quality',
    items: [
      {
        id: 'quality/fix-linting-fix-eslint',
        dimension: 'quality',
        slug: 'fix-eslint',
        title: 'Fix ESLint warnings',
        description: 'Resolve all ESLint warnings in lib/',
        effort: 'small' as const,
        source: 'discovery' as const,
        status: 'pending' as const,
        iteration_added: 0,
      },
    ],
    priority: 8,
    effort: 'small' as const,
    ...overrides,
  };
}

function makeSimplifiedGroup(overrides: Record<string, unknown> = {}) {
  return {
    id: 'quality/fix-linting',
    theme: 'Code Quality',
    dimension: 'quality',
    items: [
      {
        title: 'Fix ESLint warnings',
        description: 'Resolve all ESLint warnings in lib/',
        effort: 'small',
      },
    ],
    priority: 8,
    effort: 'small',
    ...overrides,
  };
}

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── buildAutoplanPrompt ─────────────────────────────────────────────────────

describe('buildAutoplanPrompt', () => {
  test('returns a non-empty string containing grd:new-milestone', () => {
    const groups = [makeGroup()];
    const prompt = buildAutoplanPrompt(groups);
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(0);
    expect(prompt).toContain('grd:new-milestone');
  });

  test('includes group themes in the prompt', () => {
    const groups = [
      makeGroup({ theme: 'Error Handling' }),
      makeGroup({ id: 'stability/fix-crashes', theme: 'Crash Prevention' }),
    ];
    const prompt = buildAutoplanPrompt(groups);
    expect(prompt).toContain('Error Handling');
    expect(prompt).toContain('Crash Prevention');
  });

  test('includes item titles in the prompt', () => {
    const group = makeGroup({
      items: [
        {
          id: 'q/a',
          dimension: 'quality',
          slug: 'a',
          title: 'Add input validation',
          description: 'Validate user input',
          effort: 'medium',
          source: 'discovery',
          status: 'pending',
          iteration_added: 0,
        },
      ],
    });
    const prompt = buildAutoplanPrompt([group]);
    expect(prompt).toContain('Add input validation');
  });

  test('includes milestone name when provided', () => {
    const groups = [makeGroup()];
    const prompt = buildAutoplanPrompt(groups, 'My Custom Milestone');
    expect(prompt).toContain('My Custom Milestone');
  });

  test('instructs to derive milestone name when not provided', () => {
    const groups = [makeGroup()];
    const prompt = buildAutoplanPrompt(groups);
    expect(prompt).toContain('Derive a concise milestone name');
  });

  test('says Autonomous mode in the prompt', () => {
    const groups = [makeGroup()];
    const prompt = buildAutoplanPrompt(groups);
    expect(prompt).toContain('Autonomous mode');
  });

  test('handles empty groups array', () => {
    const prompt = buildAutoplanPrompt([]);
    expect(typeof prompt).toBe('string');
    expect(prompt).toContain('grd:new-milestone');
  });

  test('includes dimension and priority for each group', () => {
    const group = makeGroup({ dimension: 'stability', priority: 9 });
    const prompt = buildAutoplanPrompt([group]);
    expect(prompt).toContain('dimension: stability');
    expect(prompt).toContain('priority: 9');
  });

  test('includes effort for each item', () => {
    const prompt = buildAutoplanPrompt([makeGroup()]);
    expect(prompt).toContain('effort: small');
  });

  test('numbers groups sequentially', () => {
    const groups = [
      makeGroup({ id: 'a/1', theme: 'First' }),
      makeGroup({ id: 'b/2', theme: 'Second' }),
      makeGroup({ id: 'c/3', theme: 'Third' }),
    ];
    const prompt = buildAutoplanPrompt(groups);
    expect(prompt).toContain('1. **First**');
    expect(prompt).toContain('2. **Second**');
    expect(prompt).toContain('3. **Third**');
  });

  test('includes product feature guidance when product-ideation groups are present', () => {
    const groups = [
      {
        id: 'product-ideation/new-commands',
        theme: 'new-commands',
        dimension: 'product-ideation',
        items: [
          { id: 'pi/snap', dimension: 'product-ideation', slug: 'new-cmd-snapshot', title: 'Snapshot', description: 'Capture state', effort: 'small' as const, source: 'discovery' as const, status: 'pending' as const, iteration_added: 1 },
        ],
        priority: 11,
        effort: 'small' as const,
      },
    ];
    const prompt = buildAutoplanPrompt(groups);
    expect(prompt).toContain('Product Feature Guidance');
    expect(prompt).toContain('BUILD NEW FEATURES');
  });

  test('does NOT include product feature guidance for pure code-quality groups', () => {
    const groups = [
      {
        id: 'quality/test-coverage',
        theme: 'test-coverage',
        dimension: 'quality',
        items: [
          { id: 'q/tests', dimension: 'quality', slug: 'improve-coverage-state', title: 'Coverage', description: 'Improve coverage', effort: 'medium' as const, source: 'discovery' as const, status: 'pending' as const, iteration_added: 1 },
        ],
        priority: 4,
        effort: 'medium' as const,
      },
    ];
    const prompt = buildAutoplanPrompt(groups);
    expect(prompt).not.toContain('Product Feature Guidance');
  });

  test('includes product feature guidance in mixed groups (product-ideation + code-quality)', () => {
    const groups = [
      {
        id: 'product-ideation/new-workflows',
        theme: 'new-workflows',
        dimension: 'product-ideation',
        items: [
          { id: 'pi/wf', dimension: 'product-ideation', slug: 'new-workflow-a', title: 'Workflow', description: 'New workflow', effort: 'medium' as const, source: 'discovery' as const, status: 'pending' as const, iteration_added: 1 },
        ],
        priority: 11,
        effort: 'medium' as const,
      },
      {
        id: 'quality/test-coverage',
        theme: 'test-coverage',
        dimension: 'quality',
        items: [
          { id: 'q/tests', dimension: 'quality', slug: 'improve-coverage-state', title: 'Coverage', description: 'Improve coverage', effort: 'medium' as const, source: 'discovery' as const, status: 'pending' as const, iteration_added: 1 },
        ],
        priority: 4,
        effort: 'medium' as const,
      },
    ];
    const prompt = buildAutoplanPrompt(groups);
    expect(prompt).toContain('Product Feature Guidance');
    expect(prompt).toContain('grd:new-milestone');
  });
});

// ─── runAutoplan ─────────────────────────────────────────────────────────────

describe('runAutoplan', () => {
  test('returns dry-run result when dryRun is true', async () => {
    const result = await runAutoplan('/tmp/test', {
      dryRun: true,
      groups: [makeSimplifiedGroup()],
    });
    expect(result.status).toBe('dry-run');
    expect(result.groups_count).toBe(1);
    expect(result.items_count).toBe(1);
    expect(result.prompt).toContain('grd:new-milestone');
    expect(result.milestone_name).toBe('Code Quality');
    // Should NOT have called spawnClaude
    expect(mockSpawnClaude).not.toHaveBeenCalled();
  });

  test('returns failed result when no groups available and no discovery', async () => {
    mockRunGroupDiscovery.mockResolvedValueOnce({
      groups: [],
      selected_groups: [],
      remaining_groups: [],
      all_items_count: 0,
      merged_items_count: 0,
      groups_count: 0,
    });

    const result = await runAutoplan('/tmp/test');
    expect(result.status).toBe('failed');
    expect(result.groups_count).toBe(0);
    expect(result.items_count).toBe(0);
    expect(result.reason).toContain('No work groups');
  });

  test('runs discovery when groups not provided', async () => {
    mockRunGroupDiscovery.mockResolvedValueOnce({
      groups: [makeGroup()],
      selected_groups: [makeGroup()],
      remaining_groups: [],
      all_items_count: 1,
      merged_items_count: 1,
      groups_count: 1,
    });

    const result = await runAutoplan('/tmp/test', { dryRun: true });
    expect(mockRunGroupDiscovery).toHaveBeenCalledWith(
      '/tmp/test',
      null, // readEvolveState returns null
      undefined
    );
    expect(result.status).toBe('dry-run');
    expect(result.groups_count).toBe(1);
  });

  test('passes pickPct to discovery when provided', async () => {
    mockRunGroupDiscovery.mockResolvedValueOnce({
      groups: [],
      selected_groups: [],
      remaining_groups: [],
      all_items_count: 0,
      merged_items_count: 0,
      groups_count: 0,
    });

    await runAutoplan('/tmp/test', { pickPct: 25 });
    expect(mockRunGroupDiscovery).toHaveBeenCalledWith(
      '/tmp/test',
      null,
      25
    );
  });

  test('returns completed result when spawnClaude exits 0', async () => {
    mockSpawnClaude.mockReturnValueOnce({ exitCode: 0, timedOut: false });

    const result = await runAutoplan('/tmp/test', {
      groups: [makeSimplifiedGroup()],
    });
    expect(result.status).toBe('completed');
    expect(result.groups_count).toBe(1);
    expect(result.items_count).toBe(1);
    expect(result.milestone_name).toBe('Code Quality');
  });

  test('returns failed result when spawnClaude exits non-zero', async () => {
    mockSpawnClaude.mockReturnValueOnce({ exitCode: 1, timedOut: false });

    const result = await runAutoplan('/tmp/test', {
      groups: [makeSimplifiedGroup()],
    });
    expect(result.status).toBe('failed');
    expect(result.reason).toContain('exit code 1');
  });

  test('returns failed result when spawnClaude times out', async () => {
    mockSpawnClaude.mockReturnValueOnce({ exitCode: 1, timedOut: true });

    const result = await runAutoplan('/tmp/test', {
      groups: [makeSimplifiedGroup()],
    });
    expect(result.status).toBe('failed');
    expect(result.reason).toBe('timeout');
  });

  test('passes timeout/maxTurns/model to spawnClaude', async () => {
    mockSpawnClaude.mockReturnValueOnce({ exitCode: 0, timedOut: false });

    await runAutoplan('/tmp/test', {
      groups: [makeSimplifiedGroup()],
      timeout: 10,
      maxTurns: 5,
      model: 'sonnet',
    });

    expect(mockSpawnClaude).toHaveBeenCalledWith(
      '/tmp/test',
      expect.any(String),
      {
        timeout: 600000, // 10 * 60 * 1000
        maxTurns: 5,
        model: 'sonnet',
      }
    );
  });

  test('derives milestone name from highest-priority group theme', async () => {
    const groups = [
      makeSimplifiedGroup({ id: 'a/1', theme: 'Low Priority', priority: 3 }),
      makeSimplifiedGroup({ id: 'b/2', theme: 'High Priority', priority: 9 }),
      makeSimplifiedGroup({ id: 'c/3', theme: 'Medium Priority', priority: 6 }),
    ];

    const result = await runAutoplan('/tmp/test', {
      groups,
      dryRun: true,
    });
    expect(result.milestone_name).toBe('High Priority');
  });

  test('uses milestoneName option when provided', async () => {
    const result = await runAutoplan('/tmp/test', {
      groups: [makeSimplifiedGroup()],
      milestoneName: 'Custom Name',
      dryRun: true,
    });
    expect(result.milestone_name).toBe('Custom Name');
  });

  test('falls back to Improvements when no theme available', async () => {
    const group = makeSimplifiedGroup({ theme: '', priority: 0 });
    // Groups sorted by priority -- an empty theme with falsy value should fallback
    const result = await runAutoplan('/tmp/test', {
      groups: [group],
      milestoneName: undefined,
      dryRun: true,
    });
    // The theme is empty string which is falsy, so || chain should hit 'Improvements'
    // But actually: groups.sort(...)[0]?.theme returns '' which is falsy for ||
    // Result depends on implementation: '' || 'Improvements' = 'Improvements'
    // Actually the code uses: options.milestoneName || groups.sort(...)[0]?.theme || 'Improvements'
    // With empty theme, it should fall through to 'Improvements'
    expect(result.milestone_name).toBe('Improvements');
  });

  test('converts simplified group format to WorkGroup interface', async () => {
    const simplified = {
      id: 'test/group',
      theme: 'Test',
      dimension: 'quality',
      items: [
        { title: 'Fix Something', description: 'Fix it', effort: 'medium' },
        { title: 'Add Something', description: 'Add it', effort: 'small' },
      ],
      priority: 7,
      effort: 'medium',
    };

    const result = await runAutoplan('/tmp/test', {
      groups: [simplified],
      dryRun: true,
    });
    expect(result.items_count).toBe(2);
    expect(result.prompt).toContain('Fix Something');
    expect(result.prompt).toContain('Add Something');
  });

  test('timeout undefined when option not provided', async () => {
    mockSpawnClaude.mockReturnValueOnce({ exitCode: 0, timedOut: false });

    await runAutoplan('/tmp/test', {
      groups: [makeSimplifiedGroup()],
    });

    expect(mockSpawnClaude).toHaveBeenCalledWith(
      '/tmp/test',
      expect.any(String),
      {
        timeout: undefined,
        maxTurns: undefined,
        model: undefined,
      }
    );
  });

  test('reads evolve state for discovery', async () => {
    mockReadEvolveState.mockReturnValueOnce({ iteration: 3, milestone: 'v1.0' });
    mockRunGroupDiscovery.mockResolvedValueOnce({
      groups: [],
      selected_groups: [],
      remaining_groups: [],
      all_items_count: 0,
      merged_items_count: 0,
      groups_count: 0,
    });

    await runAutoplan('/tmp/test');
    expect(mockReadEvolveState).toHaveBeenCalledWith('/tmp/test');
    expect(mockRunGroupDiscovery).toHaveBeenCalledWith(
      '/tmp/test',
      { iteration: 3, milestone: 'v1.0' },
      undefined
    );
  });
});

// ─── cmdAutoplan ─────────────────────────────────────────────────────────────

describe('cmdAutoplan', () => {
  test('parses --dry-run flag', async () => {
    mockRunGroupDiscovery.mockResolvedValueOnce({
      groups: [],
      selected_groups: [],
      remaining_groups: [],
      all_items_count: 0,
      merged_items_count: 0,
      groups_count: 0,
    });

    await cmdAutoplan('/tmp/test', ['--dry-run'], false);
    expect(mockOutput).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed' }),
      false,
      undefined
    );
  });

  test('parses --timeout N flag', async () => {
    mockRunGroupDiscovery.mockResolvedValueOnce({
      groups: [makeGroup()],
      selected_groups: [makeGroup()],
      remaining_groups: [],
      all_items_count: 1,
      merged_items_count: 1,
      groups_count: 1,
    });
    mockSpawnClaude.mockReturnValueOnce({ exitCode: 0, timedOut: false });

    await cmdAutoplan('/tmp/test', ['--timeout', '15'], false);
    expect(mockSpawnClaude).toHaveBeenCalledWith(
      '/tmp/test',
      expect.any(String),
      expect.objectContaining({ timeout: 900000 }) // 15 * 60 * 1000
    );
  });

  test('parses --max-turns N flag', async () => {
    mockRunGroupDiscovery.mockResolvedValueOnce({
      groups: [makeGroup()],
      selected_groups: [makeGroup()],
      remaining_groups: [],
      all_items_count: 1,
      merged_items_count: 1,
      groups_count: 1,
    });
    mockSpawnClaude.mockReturnValueOnce({ exitCode: 0, timedOut: false });

    await cmdAutoplan('/tmp/test', ['--max-turns', '20'], false);
    expect(mockSpawnClaude).toHaveBeenCalledWith(
      '/tmp/test',
      expect.any(String),
      expect.objectContaining({ maxTurns: 20 })
    );
  });

  test('parses --pick-pct N flag', async () => {
    mockRunGroupDiscovery.mockResolvedValueOnce({
      groups: [],
      selected_groups: [],
      remaining_groups: [],
      all_items_count: 0,
      merged_items_count: 0,
      groups_count: 0,
    });

    await cmdAutoplan('/tmp/test', ['--pick-pct', '30'], false);
    expect(mockRunGroupDiscovery).toHaveBeenCalledWith(
      '/tmp/test',
      null,
      30
    );
  });

  test('parses --name flag', async () => {
    mockRunGroupDiscovery.mockResolvedValueOnce({
      groups: [makeGroup()],
      selected_groups: [makeGroup()],
      remaining_groups: [],
      all_items_count: 1,
      merged_items_count: 1,
      groups_count: 1,
    });
    mockSpawnClaude.mockReturnValueOnce({ exitCode: 0, timedOut: false });

    await cmdAutoplan('/tmp/test', ['--name', 'Custom-MS'], false);
    // The milestone name should be Custom-MS
    expect(mockOutput).toHaveBeenCalledWith(
      expect.objectContaining({ milestone_name: 'Custom-MS' }),
      false,
      undefined
    );
  });

  test('calls output with result and raw summary when raw=true', async () => {
    mockRunGroupDiscovery.mockResolvedValueOnce({
      groups: [],
      selected_groups: [],
      remaining_groups: [],
      all_items_count: 0,
      merged_items_count: 0,
      groups_count: 0,
    });

    await cmdAutoplan('/tmp/test', [], true);
    expect(mockOutput).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed' }),
      true,
      expect.stringContaining('Autoplan: failed')
    );
  });

  test('handles combined flags', async () => {
    mockRunGroupDiscovery.mockResolvedValueOnce({
      groups: [makeGroup()],
      selected_groups: [makeGroup()],
      remaining_groups: [],
      all_items_count: 1,
      merged_items_count: 1,
      groups_count: 1,
    });

    await cmdAutoplan('/tmp/test', ['--dry-run', '--pick-pct', '40', '--name', 'Test'], false);
    expect(mockOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'dry-run',
        milestone_name: 'Test',
      }),
      false,
      undefined
    );
  });
});

// ─── cmdInitAutoplan ─────────────────────────────────────────────────────────

describe('cmdInitAutoplan', () => {
  test('returns evolve state info when state exists', () => {
    mockReadEvolveState.mockReturnValueOnce({
      iteration: 5,
      remaining_groups: [makeGroup(), makeGroup()],
      all_items_count: 15,
    });

    cmdInitAutoplan('/tmp/test', false);
    expect(mockOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        evolve_state: expect.objectContaining({
          exists: true,
          iteration: 5,
          remaining_groups_count: 2,
          all_items_count: 15,
        }),
      }),
      false,
      expect.any(String)
    );
  });

  test('returns null state info when no state exists', () => {
    mockReadEvolveState.mockReturnValueOnce(null);

    cmdInitAutoplan('/tmp/test', false);
    expect(mockOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        evolve_state: expect.objectContaining({
          exists: false,
          iteration: 0,
          remaining_groups_count: 0,
          all_items_count: 0,
        }),
      }),
      false,
      expect.any(String)
    );
  });

  test('includes current milestone info', () => {
    mockReadEvolveState.mockReturnValueOnce(null);
    mockGetMilestoneInfo.mockReturnValueOnce({ version: 'v2.0.0', name: 'Big Release' });

    cmdInitAutoplan('/tmp/test', false);
    expect(mockOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        current_milestone: {
          version: 'v2.0.0',
          name: 'Big Release',
        },
      }),
      false,
      expect.any(String)
    );
  });

  test('includes config section', () => {
    mockReadEvolveState.mockReturnValueOnce(null);
    mockLoadConfig.mockReturnValueOnce({
      model_profile: 'quality',
      autonomous_mode: false,
    });

    cmdInitAutoplan('/tmp/test', false);
    expect(mockOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        config: {
          model_profile: 'quality',
          autonomous_mode: false,
        },
      }),
      false,
      expect.any(String)
    );
  });

  test('calls output with result', () => {
    mockReadEvolveState.mockReturnValueOnce(null);

    cmdInitAutoplan('/tmp/test', true);
    expect(mockOutput).toHaveBeenCalledWith(
      expect.any(Object),
      true,
      expect.any(String)
    );
  });

  test('handles evolve state without remaining_groups field', () => {
    // EvolveState (legacy format) doesn't have remaining_groups
    mockReadEvolveState.mockReturnValueOnce({
      iteration: 2,
      timestamp: '2026-01-01',
      milestone: 'v1.0',
    });

    cmdInitAutoplan('/tmp/test', false);
    expect(mockOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        evolve_state: expect.objectContaining({
          exists: true,
          iteration: 2,
          remaining_groups_count: 0,
          all_items_count: 0,
        }),
      }),
      false,
      expect.any(String)
    );
  });
});
