/**
 * Unit tests for lib/tracker.js
 *
 * Tests tracker configuration parsing, mapping file I/O, and error paths.
 * NO external service calls (GitHub CLI, Jira) — all tests run offline.
 */

const fs = require('fs');
const path = require('path');
const { captureOutput, captureError } = require('../helpers/setup');
const { createFixtureDir, cleanupFixtureDir } = require('../helpers/fixtures');

const {
  loadTrackerConfig,
  loadTrackerMapping,
  saveTrackerMapping,
  createGitHubTracker,
  createTracker,
  cmdTracker,
} = require('../../lib/tracker');

// ─── loadTrackerConfig ───────────────────────────────────────────────────────

describe('loadTrackerConfig', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createFixtureDir();
  });

  afterEach(() => {
    cleanupFixtureDir(tmpDir);
  });

  test('returns {provider: "none"} when no tracker configured', () => {
    const config = loadTrackerConfig(tmpDir);
    expect(config.provider).toBe('none');
  });

  test('returns github config when tracker.provider is github', () => {
    const configPath = path.join(tmpDir, '.planning', 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    config.tracker = {
      provider: 'github',
      auto_sync: true,
      github: {
        project_board: 'MyBoard',
        default_assignee: 'user',
        default_labels: ['research'],
      },
    };
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');

    const result = loadTrackerConfig(tmpDir);
    expect(result.provider).toBe('github');
    expect(result.github.project_board).toBe('MyBoard');
    expect(result.github.default_assignee).toBe('user');
  });

  test('returns mcp-atlassian config and auto-migrates jira provider', () => {
    const configPath = path.join(tmpDir, '.planning', 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    config.tracker = {
      provider: 'jira',
      jira: {
        project_key: 'PROJ',
        epic_issue_type: 'Epic',
        task_issue_type: 'Task',
      },
    };
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');

    const result = loadTrackerConfig(tmpDir);
    expect(result.provider).toBe('mcp-atlassian');
    expect(result.mcp_atlassian.project_key).toBe('PROJ');
    expect(result.mcp_atlassian.milestone_issue_type).toBe('Epic');
    expect(result.mcp_atlassian.phase_issue_type).toBe('Task');
    expect(result.mcp_atlassian.plan_issue_type).toBe('Sub-task');
  });

  test('returns {provider: "none"} when config.json does not exist', () => {
    fs.unlinkSync(path.join(tmpDir, '.planning', 'config.json'));
    const result = loadTrackerConfig(tmpDir);
    expect(result.provider).toBe('none');
  });

  test('migrates old github_integration format', () => {
    const configPath = path.join(tmpDir, '.planning', 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    config.github_integration = {
      enabled: true,
      auto_issues: true,
      project_board: 'Board',
      default_assignee: 'dev',
    };
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');

    const result = loadTrackerConfig(tmpDir);
    expect(result.provider).toBe('github');
    expect(result.auto_sync).toBe(true);
    expect(result.github.project_board).toBe('Board');
  });
});

// ─── loadTrackerMapping / saveTrackerMapping ──────────────────────────────────

describe('loadTrackerMapping', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createFixtureDir();
  });

  afterEach(() => {
    cleanupFixtureDir(tmpDir);
  });

  test('returns empty mapping when TRACKER.md does not exist', () => {
    const mapping = loadTrackerMapping(tmpDir);
    expect(mapping.provider).toBeNull();
    expect(mapping.last_synced).toBeNull();
    expect(mapping.milestones).toEqual({});
    expect(mapping.phases).toEqual({});
    expect(mapping.plans).toEqual({});
  });

  test('parses provider and last_synced from TRACKER.md', () => {
    // Use saveTrackerMapping to write a valid mapping, then verify loadTrackerMapping reads it back
    saveTrackerMapping(tmpDir, {
      provider: 'github',
      milestones: {
        'v1.0': { issueRef: '#1', url: 'https://github.com/repo/issues/1', status: 'pending' },
      },
      phases: {
        1: {
          issueRef: '#2',
          url: 'https://github.com/repo/issues/2',
          parentRef: '#1',
          status: 'in_progress',
        },
      },
      plans: {
        '1-01': {
          issueRef: '#3',
          url: 'https://github.com/repo/issues/3',
          parentRef: '#2',
          status: 'pending',
        },
      },
    });

    const mapping = loadTrackerMapping(tmpDir);
    expect(mapping.provider).toBe('github');
    expect(mapping.last_synced).toBeDefined();
    expect(mapping.milestones['v1.0'].issueRef).toBe('#1');
    expect(mapping.phases['1'].issueRef).toBe('#2');
    expect(mapping.phases['1'].parentRef).toBe('#1');
    expect(mapping.phases['1'].status).toBe('in_progress');
    expect(mapping.plans['1-01'].issueRef).toBe('#3');
  });
});

describe('saveTrackerMapping', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createFixtureDir();
  });

  afterEach(() => {
    cleanupFixtureDir(tmpDir);
  });

  test('writes mapping to disk and can be read back', () => {
    const mapping = {
      provider: 'github',
      milestones: {
        'v1.0': { issueRef: '#10', url: 'https://example.com/10', status: 'pending' },
      },
      phases: {
        1: {
          issueRef: '#11',
          url: 'https://example.com/11',
          parentRef: '#10',
          status: 'in_progress',
        },
      },
      plans: {
        '1-01': {
          issueRef: '#12',
          url: 'https://example.com/12',
          parentRef: '#11',
          status: 'pending',
        },
      },
    };

    saveTrackerMapping(tmpDir, mapping);

    const content = fs.readFileSync(path.join(tmpDir, '.planning', 'TRACKER.md'), 'utf-8');
    expect(content).toContain('Provider: github');
    expect(content).toContain('#10');
    expect(content).toContain('#11');
    expect(content).toContain('#12');

    // Round-trip: read it back
    const loaded = loadTrackerMapping(tmpDir);
    expect(loaded.provider).toBe('github');
    expect(loaded.milestones['v1.0'].issueRef).toBe('#10');
    expect(loaded.phases['1'].issueRef).toBe('#11');
    expect(loaded.plans['1-01'].issueRef).toBe('#12');
  });
});

// ─── createTracker / createGitHubTracker ─────────────────────────────────────

describe('createTracker', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createFixtureDir();
  });

  afterEach(() => {
    cleanupFixtureDir(tmpDir);
  });

  test('returns null when no tracker configured', () => {
    const tracker = createTracker(tmpDir);
    expect(tracker).toBeNull();
  });

  test('returns github tracker when github provider configured', () => {
    const configPath = path.join(tmpDir, '.planning', 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    config.tracker = { provider: 'github', github: {} };
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');

    const tracker = createTracker(tmpDir);
    expect(tracker).not.toBeNull();
    expect(tracker.provider).toBe('github');
    expect(typeof tracker.createPhaseIssue).toBe('function');
    expect(typeof tracker.createTaskIssue).toBe('function');
    expect(typeof tracker.updateIssueStatus).toBe('function');
    expect(typeof tracker.addComment).toBe('function');
    expect(typeof tracker.syncRoadmap).toBe('function');
    expect(typeof tracker.syncPhase).toBe('function');
  });
});

// ─── cmdTracker ──────────────────────────────────────────────────────────────

describe('cmdTracker', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createFixtureDir();
  });

  afterEach(() => {
    cleanupFixtureDir(tmpDir);
  });

  test('get-config returns tracker config with auth status', () => {
    const { stdout, exitCode } = captureOutput(() => cmdTracker(tmpDir, 'get-config', [], false));
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.provider).toBe('none');
    expect(result.auth_status).toBe('not_configured');
  });

  test('get-config returns github auth status when github configured', () => {
    const configPath = path.join(tmpDir, '.planning', 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    config.tracker = { provider: 'github', github: {} };
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');

    const { stdout, exitCode } = captureOutput(() => cmdTracker(tmpDir, 'get-config', [], false));
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.provider).toBe('github');
    // auth_status depends on whether gh CLI is available in test env
    expect(['authenticated', 'not_authenticated']).toContain(result.auth_status);
  }, 15000); // gh auth status may timeout slowly

  test('get-config returns mcp_server auth status for mcp-atlassian', () => {
    const configPath = path.join(tmpDir, '.planning', 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    config.tracker = { provider: 'mcp-atlassian', mcp_atlassian: { project_key: 'PROJ' } };
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');

    const { stdout, exitCode } = captureOutput(() => cmdTracker(tmpDir, 'get-config', [], false));
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.auth_status).toBe('mcp_server');
  });

  test('sync-roadmap returns error when no tracker configured', () => {
    const { stdout, exitCode } = captureOutput(() => cmdTracker(tmpDir, 'sync-roadmap', [], false));
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.error).toContain('No tracker configured');
  });

  test('sync-phase errors when no phase number provided', () => {
    const { stderr, exitCode } = captureError(() => cmdTracker(tmpDir, 'sync-phase', [], false));
    expect(exitCode).toBe(1);
    expect(stderr).toContain('Usage');
  });

  test('sync-status returns sync overview', () => {
    const { stdout, exitCode } = captureOutput(() => cmdTracker(tmpDir, 'sync-status', [], false));
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.provider).toBe('none');
    expect(typeof result.total_phases).toBe('number');
    expect(typeof result.synced_phases).toBe('number');
  });

  test('update-status errors when missing arguments', () => {
    const { stderr, exitCode } = captureError(() => cmdTracker(tmpDir, 'update-status', [], false));
    expect(exitCode).toBe(1);
    expect(stderr).toContain('Usage');
  });

  test('add-comment errors when missing arguments', () => {
    const { stderr, exitCode } = captureError(() => cmdTracker(tmpDir, 'add-comment', [], false));
    expect(exitCode).toBe(1);
    expect(stderr).toContain('Usage');
  });

  test('record-mapping errors when missing required args', () => {
    const { stderr, exitCode } = captureError(() =>
      cmdTracker(tmpDir, 'record-mapping', [], false)
    );
    expect(exitCode).toBe(1);
    expect(stderr).toContain('Usage');
  });

  test('record-mapping stores milestone mapping', () => {
    const args = [
      '--type',
      'milestone',
      '--milestone',
      'v1.0',
      '--key',
      'PROJ-1',
      '--url',
      'https://jira/PROJ-1',
    ];
    const { stdout, exitCode } = captureOutput(() =>
      cmdTracker(tmpDir, 'record-mapping', args, false)
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.success).toBe(true);
    expect(result.type).toBe('milestone');
    expect(result.key).toBe('PROJ-1');

    // Verify written to disk
    const mapping = loadTrackerMapping(tmpDir);
    expect(mapping.milestones['v1.0'].issueRef).toBe('PROJ-1');
  });

  test('record-mapping stores phase mapping', () => {
    const args = [
      '--type',
      'phase',
      '--phase',
      '1',
      '--key',
      'PROJ-2',
      '--url',
      'https://jira/PROJ-2',
      '--parent',
      'PROJ-1',
    ];
    const { stdout, exitCode } = captureOutput(() =>
      cmdTracker(tmpDir, 'record-mapping', args, false)
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.success).toBe(true);
    expect(result.phase).toBe('1');
  });

  test('record-status errors when phase not synced', () => {
    const { stdout, exitCode } = captureOutput(() =>
      cmdTracker(tmpDir, 'record-status', ['--phase', '1', '--status', 'in_progress'], false)
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.success).toBe(false);
    expect(result.error).toContain('not synced');
  });

  test('record-status updates phase status after mapping exists', () => {
    // First create a mapping
    const mapArgs = [
      '--type',
      'phase',
      '--phase',
      '1',
      '--key',
      'PROJ-2',
      '--url',
      'https://jira/PROJ-2',
    ];
    captureOutput(() => cmdTracker(tmpDir, 'record-mapping', mapArgs, false));

    // Then update status
    const statusArgs = ['--phase', '1', '--status', 'in_progress'];
    const { stdout, exitCode } = captureOutput(() =>
      cmdTracker(tmpDir, 'record-status', statusArgs, false)
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.success).toBe(true);
    expect(result.status).toBe('in_progress');
  });

  test('unknown subcommand returns error', () => {
    const { stderr, exitCode } = captureError(() =>
      cmdTracker(tmpDir, 'nonexistent-command', [], false)
    );
    expect(exitCode).toBe(1);
    expect(stderr).toContain('Unknown tracker subcommand');
  });

  test('schedule returns schedule data', () => {
    const { stdout, exitCode } = captureOutput(() => cmdTracker(tmpDir, 'schedule', [], false));
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result).toHaveProperty('milestones');
    expect(result).toHaveProperty('phases');
  });

  test('prepare-roadmap-sync errors for non-mcp-atlassian provider', () => {
    const { stdout, exitCode } = captureOutput(() =>
      cmdTracker(tmpDir, 'prepare-roadmap-sync', [], false)
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.error).toContain('mcp-atlassian');
  });

  test('prepare-phase-sync errors when no phase number', () => {
    const { stderr, exitCode } = captureError(() =>
      cmdTracker(tmpDir, 'prepare-phase-sync', [], false)
    );
    expect(exitCode).toBe(1);
    expect(stderr).toContain('Usage');
  });

  test('prepare-reschedule errors for non-mcp-atlassian', () => {
    const { stdout, exitCode } = captureOutput(() =>
      cmdTracker(tmpDir, 'prepare-reschedule', [], false)
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.error).toContain('mcp-atlassian');
  });
});
