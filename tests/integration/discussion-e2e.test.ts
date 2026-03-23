'use strict';

/**
 * End-to-end integration tests for the discussion pipeline.
 *
 * Validates the complete pipeline flow:
 *   detect backends -> configure roles -> run discussion -> synthesize ->
 *   write history -> read back via listDiscussions/readDiscussion
 *
 * Uses direct module imports (not CLI subprocess calls) for speed.
 * Mocks execFileSync to simulate backend CLI responses without real CLIs.
 * Mocks detectAvailableBackends so no real CLI binaries are required.
 *
 * Follows wireup-e2e.test.ts conventions (testbed pattern with tmp directory).
 */

jest.setTimeout(15000);

// ─── Module-level mocks ───────────────────────────────────────────────────────

jest.mock('child_process');
jest.mock('../../lib/backend');

const childProcess = require('child_process') as {
  execFileSync: jest.Mock;
};

const backendModule = require('../../lib/backend') as {
  detectAvailableBackends: jest.Mock;
};

// ─── Real Node modules (not mocked) ──────────────────────────────────────────

const fs = require('fs') as typeof import('fs');
const os = require('os') as typeof import('os');
const path = require('path') as typeof import('path');

// ─── Real discussion module imports ──────────────────────────────────────────

const {
  runDiscussion,
  listDiscussions,
  readDiscussion,
  runPrePlanningDiscussion,
} = require('../../lib/discussion') as {
  runDiscussion: (
    topic: string,
    participants: string[],
    options?: {
      rounds?: number;
      synthesizer?: string;
      timeout_per_round_seconds?: number;
      cwd?: string;
      phase?: string;
      type?: string;
      milestone?: string | null;
    }
  ) => Promise<{
    topic: string;
    participants: string[];
    rounds: unknown[][];
    synthesis: { backend: string; response_text: string; duration_ms: number; stderr: string };
    duration_ms: number;
    discussion_file: string;
  }>;
  listDiscussions: (cwd: string, milestone?: string | null) => string[];
  readDiscussion: (filename: string, cwd: string, milestone?: string | null) => string | null;
  runPrePlanningDiscussion: (options: {
    phaseGoal: string;
    requirements: string[];
    cwd?: string;
    phase?: string;
    milestone?: string | null;
    config: Record<string, unknown>;
  }) => Promise<{
    topic: string;
    participants: string[];
    rounds: unknown[][];
    synthesis: { backend: string; response_text: string; duration_ms: number; stderr: string };
    duration_ms: number;
    discussion_file: string;
  } | null>;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Return a mock availability map where the listed backends are available.
 */
function makeAvailability(available: string[]): Record<string, { available: boolean; version: string | null }> {
  const all = ['claude', 'codex', 'gemini', 'opencode', 'overstory', 'superpowers', 'grd'];
  const result: Record<string, { available: boolean; version: string | null }> = {};
  for (const b of all) {
    result[b] = available.includes(b)
      ? { available: true, version: '1.0.0' }
      : { available: false, version: null };
  }
  return result;
}

/**
 * Create a tmp directory with a minimal GRD project structure.
 * The .planning/config.json and STATE.md are required for discussionsDir()
 * to resolve the milestone path correctly.
 */
function createDiscussionTestbed(): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-discussion-e2e-'));

  // .planning/ directory with config and STATE
  const planningDir = path.join(tmpDir, '.planning');
  fs.mkdirSync(planningDir, { recursive: true });

  // Config with backend_roles for discussion
  fs.writeFileSync(
    path.join(planningDir, 'config.json'),
    JSON.stringify(
      {
        backend: 'claude',
        backend_roles: { brainstormer: 'codex', reviewer: 'gemini' },
        discussion: { before_planning: true, before_execution: true },
      },
      null,
      2
    )
  );

  // STATE.md with Milestone reference so currentMilestone() can resolve v0.3.20
  fs.writeFileSync(
    path.join(planningDir, 'STATE.md'),
    [
      '# State',
      '',
      '**Updated:** 2026-03-23',
      '',
      '**Milestone:** v0.3.20 Multi-Agent Cross-Backend Discussion',
      '',
    ].join('\n')
  );

  // Create milestone directory structure and discussions/ subdirectory so
  // that listDiscussions() finds pre-existing files correctly
  const milestonesDir = path.join(planningDir, 'milestones', 'v0.3.20', 'discussions');
  fs.mkdirSync(milestonesDir, { recursive: true });

  return tmpDir;
}

// ─── Discussion E2E Pipeline ──────────────────────────────────────────────────

describe('Discussion E2E Pipeline', () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = createDiscussionTestbed();
  });

  afterAll(() => {
    if (tmpDir && tmpDir.startsWith(os.tmpdir())) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();

    // All four backends available
    backendModule.detectAvailableBackends.mockReturnValue(
      makeAvailability(['claude', 'codex', 'gemini', 'opencode'])
    );

    // Mock execFileSync to return different responses based on which binary is called
    childProcess.execFileSync.mockImplementation(
      (bin: string, _args: string[]) => {
        if (bin === 'codex') {
          return JSON.stringify({
            type: 'brainstormer',
            text: 'Brainstormer perspective: consider microservices for scalability',
          });
        }
        if (bin === 'gemini') {
          return JSON.stringify({
            type: 'reviewer',
            text: 'Reviewer perspective: microservices add operational complexity',
          });
        }
        // claude (synthesizer and any other backend)
        return 'Synthesis: Both perspectives have merit. Recommend starting with a monolith.';
      }
    );
  });

  // ─── Test 1: Full pipeline ─────────────────────────────────────────────────

  test('full pipeline: run 2-round discussion -> write -> read back', async () => {
    const topic = 'Should we use microservices?';

    const result = await runDiscussion(topic, ['codex', 'gemini'], {
      rounds: 2,
      synthesizer: 'claude',
      cwd: tmpDir,
      phase: '85',
      type: 'architecture',
    });

    // Result shape is correct
    expect(result.topic).toBe(topic);
    expect(Array.isArray(result.participants)).toBe(true);
    expect(result.participants).toContain('codex');
    expect(result.participants).toContain('gemini');
    expect(result.rounds).toHaveLength(2);
    expect(result.synthesis).toBeDefined();
    expect(typeof result.synthesis.backend).toBe('string');
    expect(result.synthesis.backend).toBe('claude');
    expect(typeof result.synthesis.response_text).toBe('string');
    expect(typeof result.duration_ms).toBe('number');
    expect(result.duration_ms).toBeGreaterThanOrEqual(0);
    expect(typeof result.discussion_file).toBe('string');

    // discussion_file is under tmpDir discussions directory
    expect(result.discussion_file).toContain(tmpDir);
    expect(result.discussion_file).toMatch(/discussion-85-architecture-\d+\.md$/);

    // File was actually written to disk
    expect(fs.existsSync(result.discussion_file)).toBe(true);

    // listDiscussions() finds the file
    const discussionFiles = listDiscussions(tmpDir);
    expect(Array.isArray(discussionFiles)).toBe(true);
    expect(discussionFiles.length).toBeGreaterThan(0);

    const filename = path.basename(result.discussion_file);
    expect(discussionFiles).toContain(filename);

    // readDiscussion() reads back the content
    const content = readDiscussion(filename, tmpDir);
    expect(content).not.toBeNull();
    expect(typeof content).toBe('string');
    // Content contains the original topic
    expect(content).toContain(topic);
    // Content is formatted as markdown
    expect(content).toMatch(/^# Discussion:/m);
    expect(content).toMatch(/## Round 1/);
  });

  // ─── Test 2: Pipeline with unavailable participant ─────────────────────────

  test('pipeline with unavailable participant: skipped entry written, file still created', async () => {
    // gemini is unavailable, codex and claude are available
    backendModule.detectAvailableBackends.mockReturnValue(
      makeAvailability(['claude', 'codex'])
    );

    const result = await runDiscussion(
      'What is the best deployment strategy?',
      ['codex', 'gemini'],
      {
        rounds: 1,
        synthesizer: 'claude',
        cwd: tmpDir,
        phase: '85',
        type: 'deployment',
      }
    );

    // Round 1 has both entries
    expect(result.rounds).toHaveLength(1);
    const round1 = result.rounds[0] as Array<{
      backend: string;
      skipped?: boolean;
      reason?: string;
      response_text?: string;
    }>;
    expect(round1).toHaveLength(2);

    // gemini entry is skipped
    const geminiEntry = round1.find((e) => e.backend === 'gemini');
    expect(geminiEntry).toBeDefined();
    expect(geminiEntry?.skipped).toBe(true);
    expect(typeof geminiEntry?.reason).toBe('string');

    // codex entry has a response
    const codexEntry = round1.find((e) => e.backend === 'codex');
    expect(codexEntry).toBeDefined();
    expect(codexEntry?.skipped).toBeUndefined();
    expect(typeof codexEntry?.response_text).toBe('string');

    // discussion file is still written
    expect(typeof result.discussion_file).toBe('string');
    expect(fs.existsSync(result.discussion_file)).toBe(true);

    // File content marks the skipped backend
    const filename = path.basename(result.discussion_file);
    const content = readDiscussion(filename, tmpDir);
    expect(content).not.toBeNull();
    expect(content).toContain('[SKIPPED');
  });

  // ─── Test 3: Config-driven discussion via runPrePlanningDiscussion ─────────

  test('config-driven discussion: runPrePlanningDiscussion with before_planning enabled', async () => {
    const config = {
      backend: 'claude',
      backend_roles: { brainstormer: 'codex' },
      discussion: { before_planning: true, before_execution: false },
    };

    const result = await runPrePlanningDiscussion({
      phaseGoal: 'Expose discussion surface via MCP and CLI',
      requirements: ['REQ-138: pre-planning discussion', 'REQ-139: pre-execution discussion'],
      cwd: tmpDir,
      phase: '85',
      config,
    });

    // Result is not null — discussion was dispatched
    expect(result).not.toBeNull();

    // Topic contains the phase goal
    expect(result?.topic).toContain('Expose discussion surface via MCP and CLI');
    // Topic contains requirements
    expect(result?.topic).toContain('REQ-138');
    expect(result?.topic).toContain('REQ-139');

    // Only the brainstormer backend was used as participant
    expect(result?.participants).toContain('codex');

    // Rounds is 1 (pre-planning uses single round)
    expect(result?.rounds).toHaveLength(1);

    // discussion_file exists and contains 'pre-planning' in path
    expect(typeof result?.discussion_file).toBe('string');
    expect(result?.discussion_file).toContain('pre-planning');
    expect(fs.existsSync(result?.discussion_file as string)).toBe(true);
  });
});
