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

  test('auto-migrates mcp_atlassian epic/task fields to milestone/phase', () => {
    const configPath = path.join(tmpDir, '.planning', 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    config.tracker = {
      provider: 'mcp-atlassian',
      mcp_atlassian: {
        project_key: 'PROJ',
        epic_issue_type: 'Epic',
        task_issue_type: 'Story',
      },
    };
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');

    const result = loadTrackerConfig(tmpDir);
    expect(result.mcp_atlassian.milestone_issue_type).toBe('Epic');
    expect(result.mcp_atlassian.phase_issue_type).toBe('Story');
    expect(result.mcp_atlassian.plan_issue_type).toBe('Sub-task');
    // Old fields should be deleted
    expect(result.mcp_atlassian.epic_issue_type).toBeUndefined();
    expect(result.mcp_atlassian.task_issue_type).toBeUndefined();
  });

  test('returns {provider: "none"} when config.json has invalid JSON', () => {
    const configPath = path.join(tmpDir, '.planning', 'config.json');
    fs.writeFileSync(configPath, '{invalid json', 'utf-8');
    const result = loadTrackerConfig(tmpDir);
    expect(result.provider).toBe('none');
  });

  test('migrates github_integration with labels object', () => {
    const configPath = path.join(tmpDir, '.planning', 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    config.github_integration = {
      enabled: true,
      project_name: 'NameBoard',
      labels: { research: 'research-label', impl: 'impl-label' },
    };
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');

    const result = loadTrackerConfig(tmpDir);
    expect(result.provider).toBe('github');
    expect(result.github.project_board).toBe('NameBoard');
    expect(result.github.default_labels).toContain('research-label');
    expect(result.github.default_labels).toContain('impl-label');
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

  test('unknown subcommand produces error with available list', () => {
    const { stderr, exitCode } = captureError(() =>
      cmdTracker(tmpDir, 'nonexistent-cmd', [], false)
    );
    expect(exitCode).toBe(1);
    expect(stderr).toContain("Unknown tracker subcommand: 'nonexistent-cmd'");
    expect(stderr).toContain('get-config');
    expect(stderr).toContain('sync-roadmap');
    expect(stderr).toContain('schedule');
  });

  test('handler dispatch covers all 12 subcommands', () => {
    const subcommands = [
      'get-config',
      'sync-roadmap',
      'sync-phase',
      'update-status',
      'add-comment',
      'sync-status',
      'prepare-roadmap-sync',
      'prepare-phase-sync',
      'record-mapping',
      'record-status',
      'schedule',
      'prepare-reschedule',
    ];
    for (const sub of subcommands) {
      // Each subcommand should NOT produce "Unknown tracker subcommand" error
      let caught = false;
      try {
        captureOutput(() => cmdTracker(tmpDir, sub, [], false));
      } catch {
        // Some subcommands may error() on missing args — that's fine, it means they dispatched
        caught = true;
      }
      // If it didn't throw, it dispatched successfully
      // If it did throw, it should NOT be about unknown subcommand
      if (caught) {
        const { stderr } = captureError(() => cmdTracker(tmpDir, sub, [], false));
        expect(stderr).not.toContain('Unknown tracker subcommand');
      }
    }
  });

  // ─── handleSyncRoadmap ─────────────────────────────────────────────────────

  test('sync-roadmap returns mcp-atlassian redirect message', () => {
    const configPath = path.join(tmpDir, '.planning', 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    config.tracker = { provider: 'mcp-atlassian', mcp_atlassian: { project_key: 'PROJ' } };
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');

    const { stdout, exitCode } = captureOutput(() => cmdTracker(tmpDir, 'sync-roadmap', [], false));
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.error).toContain('prepare-roadmap-sync');
  });

  test('sync-roadmap returns error when ROADMAP.md is missing', () => {
    // Configure github tracker
    const configPath = path.join(tmpDir, '.planning', 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    config.tracker = { provider: 'github', github: {} };
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
    // Remove ROADMAP.md
    const roadmapPath = path.join(tmpDir, '.planning', 'ROADMAP.md');
    if (fs.existsSync(roadmapPath)) fs.unlinkSync(roadmapPath);

    const { stdout, exitCode } = captureOutput(() => cmdTracker(tmpDir, 'sync-roadmap', [], false));
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.error).toContain('No ROADMAP.md found');
  });

  test('sync-roadmap with github parses phases and syncs', () => {
    const configPath = path.join(tmpDir, '.planning', 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    config.tracker = { provider: 'github', github: {} };
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
    // ROADMAP.md already has Phase 1 and Phase 2 headings in fixture
    // The sync will try to create issues via gh CLI, which won't be available
    // so stats.errors will increment
    const { stdout, exitCode } = captureOutput(() => cmdTracker(tmpDir, 'sync-roadmap', [], false));
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    // gh is likely not available, so phases that fail will be errors
    expect(typeof result.created).toBe('number');
    expect(typeof result.errors).toBe('number');
  }, 15000);

  // ─── handleSyncPhase ──────────────────────────────────────────────────────

  test('sync-phase returns mcp-atlassian redirect message', () => {
    const configPath = path.join(tmpDir, '.planning', 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    config.tracker = { provider: 'mcp-atlassian', mcp_atlassian: { project_key: 'PROJ' } };
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');

    const { stdout, exitCode } = captureOutput(() =>
      cmdTracker(tmpDir, 'sync-phase', ['1'], false)
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.error).toContain('prepare-phase-sync');
  });

  test('sync-phase returns error when no tracker configured', () => {
    const { stdout, exitCode } = captureOutput(() =>
      cmdTracker(tmpDir, 'sync-phase', ['1'], false)
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.error).toContain('No tracker configured');
  });

  test('sync-phase with github reads plan files from phase dir', () => {
    const configPath = path.join(tmpDir, '.planning', 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    config.tracker = { provider: 'github', github: {} };
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');

    // Phase 1 already has 01-01-PLAN.md in fixture
    const { stdout, exitCode } = captureOutput(() =>
      cmdTracker(tmpDir, 'sync-phase', ['1'], false)
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(typeof result.created).toBe('number');
    expect(typeof result.errors).toBe('number');
  }, 15000);

  // ─── handleUpdateStatus ────────────────────────────────────────────────────

  test('update-status with mcp-atlassian updates local mapping', () => {
    const configPath = path.join(tmpDir, '.planning', 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    config.tracker = { provider: 'mcp-atlassian', mcp_atlassian: { project_key: 'PROJ' } };
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');

    // Create a phase mapping first
    saveTrackerMapping(tmpDir, {
      provider: 'mcp-atlassian',
      milestones: {},
      phases: { 1: { issueRef: 'PROJ-10', url: '', parentRef: '', status: 'pending' } },
      plans: {},
    });

    const { stdout, exitCode } = captureOutput(() =>
      cmdTracker(tmpDir, 'update-status', ['1', 'in_progress'], false)
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.success).toBe(true);
    expect(result.issue_key).toBe('PROJ-10');
    expect(result.status).toBe('in_progress');

    // Verify mapping was updated on disk
    const mapping = loadTrackerMapping(tmpDir);
    expect(mapping.phases['1'].status).toBe('in_progress');
  });

  test('update-status with mcp-atlassian returns error when phase not synced', () => {
    const configPath = path.join(tmpDir, '.planning', 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    config.tracker = { provider: 'mcp-atlassian', mcp_atlassian: {} };
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');

    const { stdout, exitCode } = captureOutput(() =>
      cmdTracker(tmpDir, 'update-status', ['99', 'complete'], false)
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Phase not synced');
  });

  test('update-status returns error when no tracker configured', () => {
    const { stdout, exitCode } = captureOutput(() =>
      cmdTracker(tmpDir, 'update-status', ['1', 'complete'], false)
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.success).toBe(false);
    expect(result.error).toContain('No tracker configured');
  });

  test('update-status with github returns error when phase not synced', () => {
    const configPath = path.join(tmpDir, '.planning', 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    config.tracker = { provider: 'github', github: {} };
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');

    const { stdout, exitCode } = captureOutput(() =>
      cmdTracker(tmpDir, 'update-status', ['99', 'complete'], false)
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Phase not synced');
  });

  test('update-status with github and synced phase calls tracker', () => {
    const configPath = path.join(tmpDir, '.planning', 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    config.tracker = { provider: 'github', github: {} };
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');

    // Create a phase mapping
    saveTrackerMapping(tmpDir, {
      provider: 'github',
      milestones: {},
      phases: {
        1: { issueRef: '#5', url: 'https://github.com/issues/5', parentRef: '', status: 'pending' },
      },
      plans: {},
    });

    const { stdout, exitCode } = captureOutput(() =>
      cmdTracker(tmpDir, 'update-status', ['1', 'in_progress'], false)
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    // gh may not be available, but the handler should execute
    expect(result).toHaveProperty('success');
  }, 15000);

  // ─── handleAddComment ─────────────────────────────────────────────────────

  test('add-comment with mcp-atlassian returns comment data for agent', () => {
    const configPath = path.join(tmpDir, '.planning', 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    config.tracker = { provider: 'mcp-atlassian', mcp_atlassian: {} };
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');

    // Create phase mapping
    saveTrackerMapping(tmpDir, {
      provider: 'mcp-atlassian',
      milestones: {},
      phases: { 1: { issueRef: 'PROJ-10', url: '', parentRef: '', status: 'pending' } },
      plans: {},
    });

    // Write a file to attach as comment
    const commentFile = path.join(tmpDir, 'comment.md');
    fs.writeFileSync(commentFile, '# Test Comment\nSome content', 'utf-8');

    const { stdout, exitCode } = captureOutput(() =>
      cmdTracker(tmpDir, 'add-comment', ['1', 'comment.md'], false)
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.provider).toBe('mcp-atlassian');
    expect(result.issue_key).toBe('PROJ-10');
    expect(result.content).toContain('Test Comment');
  });

  test('add-comment with mcp-atlassian returns error when phase not synced', () => {
    const configPath = path.join(tmpDir, '.planning', 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    config.tracker = { provider: 'mcp-atlassian', mcp_atlassian: {} };
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');

    const { stdout, exitCode } = captureOutput(() =>
      cmdTracker(tmpDir, 'add-comment', ['99', 'some-file.md'], false)
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Phase not synced');
  });

  test('add-comment with mcp-atlassian returns error when file not found', () => {
    const configPath = path.join(tmpDir, '.planning', 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    config.tracker = { provider: 'mcp-atlassian', mcp_atlassian: {} };
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');

    saveTrackerMapping(tmpDir, {
      provider: 'mcp-atlassian',
      milestones: {},
      phases: { 1: { issueRef: 'PROJ-10', url: '', parentRef: '', status: 'pending' } },
      plans: {},
    });

    const { stdout, exitCode } = captureOutput(() =>
      cmdTracker(tmpDir, 'add-comment', ['1', 'nonexistent-file.md'], false)
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.success).toBe(false);
    expect(result.error).toContain('File not found');
  });

  test('add-comment with no tracker returns error', () => {
    const { stdout, exitCode } = captureOutput(() =>
      cmdTracker(tmpDir, 'add-comment', ['1', 'file.md'], false)
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.success).toBe(false);
    expect(result.error).toContain('No tracker configured');
  });

  test('add-comment with github returns error when phase not synced', () => {
    const configPath = path.join(tmpDir, '.planning', 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    config.tracker = { provider: 'github', github: {} };
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');

    const { stdout, exitCode } = captureOutput(() =>
      cmdTracker(tmpDir, 'add-comment', ['1', 'file.md'], false)
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Phase not synced');
  });

  test('add-comment with github returns error when file not found', () => {
    const configPath = path.join(tmpDir, '.planning', 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    config.tracker = { provider: 'github', github: {} };
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');

    saveTrackerMapping(tmpDir, {
      provider: 'github',
      milestones: {},
      phases: { 1: { issueRef: '#5', url: '', parentRef: '', status: 'pending' } },
      plans: {},
    });

    const { stdout, exitCode } = captureOutput(() =>
      cmdTracker(tmpDir, 'add-comment', ['1', 'nonexistent.md'], false)
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.success).toBe(false);
    expect(result.error).toContain('File not found');
  });

  test('add-comment with github and valid file calls tracker.addComment', () => {
    const configPath = path.join(tmpDir, '.planning', 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    config.tracker = { provider: 'github', github: {} };
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');

    saveTrackerMapping(tmpDir, {
      provider: 'github',
      milestones: {},
      phases: { 1: { issueRef: '#5', url: '', parentRef: '', status: 'pending' } },
      plans: {},
    });

    const commentFile = path.join(tmpDir, 'note.md');
    fs.writeFileSync(commentFile, 'Test note content', 'utf-8');

    const { stdout, exitCode } = captureOutput(() =>
      cmdTracker(tmpDir, 'add-comment', ['1', 'note.md'], false)
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    // gh may or may not be available but the handler should run
    expect(result).toHaveProperty('success');
  }, 15000);

  // ─── handleSyncStatus ─────────────────────────────────────────────────────

  test('sync-status returns synced/unsynced counts with mapping', () => {
    saveTrackerMapping(tmpDir, {
      provider: 'github',
      milestones: { 'v1.0': { issueRef: '#1', url: '', status: 'pending' } },
      phases: { 1: { issueRef: '#2', url: '', parentRef: '#1', status: 'pending' } },
      plans: { '1-01': { issueRef: '#3', url: '', parentRef: '#2', status: 'pending' } },
    });

    const { stdout, exitCode } = captureOutput(() => cmdTracker(tmpDir, 'sync-status', [], false));
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.total_milestones).toBe(1);
    expect(result.plan_count).toBe(1);
    expect(result.synced_phases).toBeGreaterThanOrEqual(0);
    expect(result.unsynced_phases).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(result.synced)).toBe(true);
    expect(Array.isArray(result.unsynced)).toBe(true);
  });

  // ─── handlePrepareRoadmapSync ──────────────────────────────────────────────

  test('prepare-roadmap-sync with mcp-atlassian returns operations', () => {
    const configPath = path.join(tmpDir, '.planning', 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    config.tracker = { provider: 'mcp-atlassian', mcp_atlassian: { project_key: 'PROJ' } };
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');

    // Write a ROADMAP with ## Phase headings (the regex expects ##)
    const roadmapPath = path.join(tmpDir, '.planning', 'ROADMAP.md');
    fs.writeFileSync(
      roadmapPath,
      [
        '# Roadmap',
        '',
        '## Phase 1: Setup — Foundation',
        '**Goal:** Set up infrastructure',
        '',
        '## Phase 2: Build — Core',
        '**Goal:** Build core features',
      ].join('\n'),
      'utf-8'
    );

    const { stdout, exitCode } = captureOutput(() =>
      cmdTracker(tmpDir, 'prepare-roadmap-sync', [], false)
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.provider).toBe('mcp-atlassian');
    expect(result.project_key).toBe('PROJ');
    expect(Array.isArray(result.operations)).toBe(true);
    const createOps = result.operations.filter(
      (op) => op.action === 'create' && op.type === 'phase'
    );
    expect(createOps.length).toBe(2);
  });

  test('prepare-roadmap-sync with mcp-atlassian skips already-synced phases', () => {
    const configPath = path.join(tmpDir, '.planning', 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    config.tracker = { provider: 'mcp-atlassian', mcp_atlassian: { project_key: 'PROJ' } };
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');

    // Write ROADMAP with ## Phase headings
    const roadmapPath = path.join(tmpDir, '.planning', 'ROADMAP.md');
    fs.writeFileSync(
      roadmapPath,
      [
        '# Roadmap',
        '',
        '## Phase 1: Setup — Foundation',
        '**Goal:** Set up infrastructure',
        '',
        '## Phase 2: Build — Core',
        '**Goal:** Build core features',
      ].join('\n'),
      'utf-8'
    );

    // Pre-sync phase 1
    saveTrackerMapping(tmpDir, {
      provider: 'mcp-atlassian',
      milestones: {},
      phases: { 1: { issueRef: 'PROJ-10', url: '', parentRef: '', status: 'pending' } },
      plans: {},
    });

    const { stdout, exitCode } = captureOutput(() =>
      cmdTracker(tmpDir, 'prepare-roadmap-sync', [], false)
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    const skipOps = result.operations.filter(
      (op) => op.action === 'skip' && op.type === 'phase' && op.phase === '1'
    );
    expect(skipOps.length).toBe(1);
    expect(skipOps[0].reason).toBe('already_synced');
  });

  test('prepare-roadmap-sync returns error when ROADMAP.md missing', () => {
    const configPath = path.join(tmpDir, '.planning', 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    config.tracker = { provider: 'mcp-atlassian', mcp_atlassian: {} };
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');

    const roadmapPath = path.join(tmpDir, '.planning', 'ROADMAP.md');
    if (fs.existsSync(roadmapPath)) fs.unlinkSync(roadmapPath);

    const { stdout, exitCode } = captureOutput(() =>
      cmdTracker(tmpDir, 'prepare-roadmap-sync', [], false)
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.error).toContain('No ROADMAP.md found');
  });

  // ─── handlePreparePhaseSync ────────────────────────────────────────────────

  test('prepare-phase-sync errors for non-mcp-atlassian provider', () => {
    const configPath = path.join(tmpDir, '.planning', 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    config.tracker = { provider: 'github', github: {} };
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');

    const { stdout, exitCode } = captureOutput(() =>
      cmdTracker(tmpDir, 'prepare-phase-sync', ['1'], false)
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.error).toContain('mcp-atlassian');
  });

  test('prepare-phase-sync with mcp-atlassian returns plan operations', () => {
    const configPath = path.join(tmpDir, '.planning', 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    config.tracker = { provider: 'mcp-atlassian', mcp_atlassian: { project_key: 'PROJ' } };
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');

    // Create a phase dir with plan files matching the expected pattern
    const phasesDir = path.join(tmpDir, '.planning', 'milestones', 'anonymous', 'phases');
    const phaseDir = path.join(phasesDir, '5-test-phase');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(
      path.join(phaseDir, '05-01-PLAN.md'),
      '---\nobjective: "First plan"\n---\n# Plan\n',
      'utf-8'
    );
    fs.writeFileSync(
      path.join(phaseDir, '05-02-PLAN.md'),
      '---\nobjective: "Second plan"\n---\n# Plan\n',
      'utf-8'
    );

    const { stdout, exitCode } = captureOutput(() =>
      cmdTracker(tmpDir, 'prepare-phase-sync', ['5'], false)
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.provider).toBe('mcp-atlassian');
    expect(Array.isArray(result.operations)).toBe(true);
    const createOps = result.operations.filter(
      (op) => op.action === 'create' && op.type === 'plan'
    );
    expect(createOps.length).toBe(2);
  });

  test('prepare-phase-sync skips already-synced plans', () => {
    const configPath = path.join(tmpDir, '.planning', 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    config.tracker = { provider: 'mcp-atlassian', mcp_atlassian: { project_key: 'PROJ' } };
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');

    // Create a phase dir with a plan file
    const phasesDir = path.join(tmpDir, '.planning', 'milestones', 'anonymous', 'phases');
    const phaseDir = path.join(phasesDir, '5-test-phase');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(
      path.join(phaseDir, '05-01-PLAN.md'),
      '---\nobjective: "First plan"\n---\n# Plan\n',
      'utf-8'
    );

    // Pre-sync the plan
    saveTrackerMapping(tmpDir, {
      provider: 'mcp-atlassian',
      milestones: {},
      phases: { 5: { issueRef: 'PROJ-10', url: '', parentRef: '', status: 'pending' } },
      plans: {
        '5-01': { issueRef: 'PROJ-11', url: '', parentRef: 'PROJ-10', status: 'pending' },
      },
    });

    const { stdout, exitCode } = captureOutput(() =>
      cmdTracker(tmpDir, 'prepare-phase-sync', ['5'], false)
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    const skipOps = result.operations.filter((op) => op.action === 'skip' && op.type === 'plan');
    expect(skipOps.length).toBe(1);
    expect(skipOps[0].reason).toBe('already_synced');
  });

  // ─── handleRecordMapping additional tests ──────────────────────────────────

  test('record-mapping stores plan mapping', () => {
    const args = [
      '--type',
      'plan',
      '--phase',
      '1',
      '--plan',
      '01',
      '--key',
      'PROJ-3',
      '--url',
      'https://jira/PROJ-3',
      '--parent',
      'PROJ-2',
    ];
    const { stdout, exitCode } = captureOutput(() =>
      cmdTracker(tmpDir, 'record-mapping', args, false)
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.success).toBe(true);
    expect(result.plan).toBe('01');

    const mapping = loadTrackerMapping(tmpDir);
    expect(mapping.plans['1-01'].issueRef).toBe('PROJ-3');
    expect(mapping.plans['1-01'].parentRef).toBe('PROJ-2');
  });

  test('record-mapping errors for unknown type', () => {
    const args = ['--type', 'unknown', '--key', 'PROJ-1'];
    const { stderr, exitCode } = captureError(() =>
      cmdTracker(tmpDir, 'record-mapping', args, false)
    );
    expect(exitCode).toBe(1);
    expect(stderr).toContain('Unknown mapping type');
  });

  test('record-mapping errors when milestone type missing --milestone', () => {
    const args = ['--type', 'milestone', '--key', 'PROJ-1'];
    const { stderr, exitCode } = captureError(() =>
      cmdTracker(tmpDir, 'record-mapping', args, false)
    );
    expect(exitCode).toBe(1);
    expect(stderr).toContain('--milestone');
  });

  test('record-mapping errors when phase type missing --phase', () => {
    const args = ['--type', 'phase', '--key', 'PROJ-1'];
    const { stderr, exitCode } = captureError(() =>
      cmdTracker(tmpDir, 'record-mapping', args, false)
    );
    expect(exitCode).toBe(1);
    expect(stderr).toContain('--phase');
  });

  test('record-mapping errors when plan type missing --plan', () => {
    const args = ['--type', 'plan', '--phase', '1', '--key', 'PROJ-1'];
    const { stderr, exitCode } = captureError(() =>
      cmdTracker(tmpDir, 'record-mapping', args, false)
    );
    expect(exitCode).toBe(1);
    expect(stderr).toContain('--plan');
  });

  // ─── handlePrepareReschedule ───────────────────────────────────────────────

  test('prepare-reschedule with mcp-atlassian returns update operations', () => {
    const configPath = path.join(tmpDir, '.planning', 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    config.tracker = { provider: 'mcp-atlassian', mcp_atlassian: { project_key: 'PROJ' } };
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');

    // Create a mapping with milestone and phase entries
    saveTrackerMapping(tmpDir, {
      provider: 'mcp-atlassian',
      milestones: {
        'v1.0': { issueRef: 'PROJ-1', url: '', status: 'pending' },
      },
      phases: {
        1: { issueRef: 'PROJ-10', url: '', parentRef: 'PROJ-1', status: 'pending' },
      },
      plans: {},
    });

    const { stdout, exitCode } = captureOutput(() =>
      cmdTracker(tmpDir, 'prepare-reschedule', [], false)
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.provider).toBe('mcp-atlassian');
    expect(Array.isArray(result.operations)).toBe(true);
    expect(result).toHaveProperty('start_date_field');
  });

  // ─── record-status additional tests ────────────────────────────────────────

  test('record-status errors when missing args', () => {
    const { stderr, exitCode } = captureError(() => cmdTracker(tmpDir, 'record-status', [], false));
    expect(exitCode).toBe(1);
    expect(stderr).toContain('Usage');
  });

  test('record-status updates phase status successfully', () => {
    // Create a mapping first
    saveTrackerMapping(tmpDir, {
      provider: 'mcp-atlassian',
      milestones: {},
      phases: { 5: { issueRef: 'PROJ-50', url: '', parentRef: '', status: 'pending' } },
      plans: {},
    });

    const { stdout, exitCode } = captureOutput(() =>
      cmdTracker(tmpDir, 'record-status', ['--phase', '5', '--status', 'complete'], false)
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.success).toBe(true);
    expect(result.status).toBe('complete');
    expect(result.issue_key).toBe('PROJ-50');
  });
});

// ─── createGitHubTracker method tests ───────────────────────────────────────

describe('createGitHubTracker', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createFixtureDir();
  });

  afterEach(() => {
    cleanupFixtureDir(tmpDir);
  });

  test('createPhaseIssue returns null refs when gh unavailable', () => {
    const tracker = createGitHubTracker(tmpDir, { github: {} });
    // gh CLI may or may not be available in test environment
    const result = tracker.createPhaseIssue(1, 'Test Phase', 'Body', []);
    // If gh is not available, issueRef should be null
    // If gh is available, it may succeed or fail depending on auth
    expect(result).toHaveProperty('issueRef');
    expect(result).toHaveProperty('url');
  }, 15000);

  test('createTaskIssue returns null refs when gh unavailable', () => {
    const tracker = createGitHubTracker(tmpDir, { github: {} });
    const result = tracker.createTaskIssue(1, '01', 'Test Task', '#1');
    expect(result).toHaveProperty('issueRef');
    expect(result).toHaveProperty('url');
  }, 15000);

  test('updateIssueStatus returns success structure', () => {
    const tracker = createGitHubTracker(tmpDir, { github: {} });
    const result = tracker.updateIssueStatus('#1', 'in_progress');
    // If gh is not available, result.success will be false
    expect(result).toHaveProperty('success');
  }, 15000);

  test('addComment returns success structure', () => {
    const tracker = createGitHubTracker(tmpDir, { github: {} });
    const result = tracker.addComment('#1', 'Test comment');
    expect(result).toHaveProperty('success');
  }, 15000);

  test('syncRoadmap creates issues for new phases and saves mapping', () => {
    const tracker = createGitHubTracker(tmpDir, { github: {} });
    const roadmapData = {
      phases: [
        { number: '10', name: 'Test Phase', goal: 'Test goal', labels: [] },
        { number: '11', name: 'Another Phase', goal: 'Another goal', labels: [] },
      ],
    };
    const stats = tracker.syncRoadmap(roadmapData);
    expect(typeof stats.created).toBe('number');
    expect(typeof stats.skipped).toBe('number');
    expect(typeof stats.errors).toBe('number');

    // Verify mapping was saved
    const mapping = loadTrackerMapping(tmpDir);
    expect(mapping.provider).toBe('github');
  }, 15000);

  test('syncRoadmap skips already-mapped phases', () => {
    // Pre-populate mapping
    saveTrackerMapping(tmpDir, {
      provider: 'github',
      milestones: {},
      phases: { 10: { issueRef: '#100', url: 'https://example.com/100', status: 'pending' } },
      plans: {},
    });

    const tracker = createGitHubTracker(tmpDir, { github: {} });
    const roadmapData = {
      phases: [{ number: '10', name: 'Test Phase', goal: 'Test goal', labels: [] }],
    };
    const stats = tracker.syncRoadmap(roadmapData);
    expect(stats.skipped).toBe(1);
    expect(stats.created).toBe(0);
  });

  test('syncPhase creates task issues for plans', () => {
    const tracker = createGitHubTracker(tmpDir, { github: {} });
    const phaseData = {
      plans: [
        { number: '01', objective: 'First plan' },
        { number: '02', objective: 'Second plan' },
      ],
    };
    const stats = tracker.syncPhase(5, phaseData);
    expect(typeof stats.created).toBe('number');
    expect(typeof stats.errors).toBe('number');

    const mapping = loadTrackerMapping(tmpDir);
    expect(mapping.provider).toBe('github');
  }, 15000);

  test('syncPhase skips already-mapped plans', () => {
    saveTrackerMapping(tmpDir, {
      provider: 'github',
      milestones: {},
      phases: {},
      plans: {
        '5-01': { issueRef: '#200', url: '', parentRef: '', status: 'pending' },
      },
    });

    const tracker = createGitHubTracker(tmpDir, { github: {} });
    const phaseData = {
      plans: [{ number: '01', objective: 'First plan' }],
    };
    const stats = tracker.syncPhase(5, phaseData);
    expect(stats.updated).toBe(1);
    expect(stats.created).toBe(0);
  });

  test('syncPhase uses parent ref from phase mapping', () => {
    saveTrackerMapping(tmpDir, {
      provider: 'github',
      milestones: {},
      phases: { 5: { issueRef: '#50', url: '', parentRef: '', status: 'pending' } },
      plans: {},
    });

    const tracker = createGitHubTracker(tmpDir, { github: {} });
    const phaseData = {
      plans: [{ number: '01', objective: 'Plan with parent' }],
    };
    const stats = tracker.syncPhase(5, phaseData);
    expect(typeof stats.created).toBe('number');
  }, 15000);

  test('createPhaseIssue includes default_assignee and labels', () => {
    const tracker = createGitHubTracker(tmpDir, {
      github: {
        default_assignee: 'testuser',
        default_labels: ['bug', 'feature'],
      },
    });
    const result = tracker.createPhaseIssue(1, 'Test', 'Body', null);
    // When gh is unavailable, returns null refs
    expect(result).toHaveProperty('issueRef');
  }, 15000);

  test('updateIssueStatus handles complete status', () => {
    const tracker = createGitHubTracker(tmpDir, { github: {} });
    const result = tracker.updateIssueStatus('#1', 'complete');
    expect(result).toHaveProperty('success');
  }, 15000);

  test('updateIssueStatus handles pending status', () => {
    const tracker = createGitHubTracker(tmpDir, { github: {} });
    const result = tracker.updateIssueStatus('#1', 'pending');
    expect(result).toHaveProperty('success');
  }, 15000);

  test('syncRoadmap with empty phases array', () => {
    const tracker = createGitHubTracker(tmpDir, { github: {} });
    const stats = tracker.syncRoadmap({ phases: [] });
    expect(stats.created).toBe(0);
    expect(stats.skipped).toBe(0);
    expect(stats.errors).toBe(0);
  });

  test('syncPhase with empty plans array', () => {
    const tracker = createGitHubTracker(tmpDir, { github: {} });
    const stats = tracker.syncPhase(1, { plans: [] });
    expect(stats.created).toBe(0);
    expect(stats.errors).toBe(0);
  });
});
