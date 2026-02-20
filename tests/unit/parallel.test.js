/**
 * Unit tests for lib/parallel.js — Parallel execution module
 *
 * Tests validateIndependentPhases, buildParallelContext, and cmdInitExecuteParallel.
 */

const fs = require('fs');
const path = require('path');
const { captureOutput, captureError } = require('../helpers/setup');
const { createFixtureDir, cleanupFixtureDir } = require('../helpers/fixtures');

const {
  validateIndependentPhases,
  buildParallelContext,
  cmdInitExecuteParallel,
} = require('../../lib/parallel');

// ─── validateIndependentPhases ──────────────────────────────────────────────

describe('validateIndependentPhases', () => {
  test('returns valid:true for phases with no edges between them', () => {
    const graph = {
      nodes: [
        { id: '27', name: 'Worktree' },
        { id: '29', name: 'Deps' },
        { id: '30', name: 'Parallel' },
      ],
      edges: [
        { from: '27', to: '30' },
        { from: '29', to: '30' },
      ],
    };
    const result = validateIndependentPhases(graph, ['27', '29']);
    expect(result.valid).toBe(true);
    expect(result.phases).toEqual(['27', '29']);
  });

  test('returns valid:false when one phase depends on another', () => {
    const graph = {
      nodes: [
        { id: '27', name: 'A' },
        { id: '28', name: 'B' },
      ],
      edges: [{ from: '27', to: '28' }],
    };
    const result = validateIndependentPhases(graph, ['27', '28']);
    expect(result.valid).toBe(false);
    expect(result.conflicts).toEqual([{ from: '27', to: '28' }]);
  });

  test('returns valid:true for single phase', () => {
    const graph = {
      nodes: [
        { id: '27', name: 'A' },
        { id: '28', name: 'B' },
      ],
      edges: [{ from: '27', to: '28' }],
    };
    const result = validateIndependentPhases(graph, ['27']);
    expect(result.valid).toBe(true);
    expect(result.phases).toEqual(['27']);
  });

  test('returns valid:true for phases without direct edge (transitive dep ignored)', () => {
    // 27->28, 28->30 — no direct edge between 27 and 30
    const graph = {
      nodes: [
        { id: '27', name: 'A' },
        { id: '28', name: 'B' },
        { id: '30', name: 'C' },
      ],
      edges: [
        { from: '27', to: '28' },
        { from: '28', to: '30' },
      ],
    };
    const result = validateIndependentPhases(graph, ['27', '30']);
    expect(result.valid).toBe(true);
  });

  test('returns valid:true for empty phases array', () => {
    const graph = {
      nodes: [{ id: '27', name: 'A' }],
      edges: [],
    };
    const result = validateIndependentPhases(graph, []);
    expect(result.valid).toBe(true);
    expect(result.phases).toEqual([]);
  });

  test('returns valid:false for multiple conflicts', () => {
    const graph = {
      nodes: [
        { id: '27', name: 'A' },
        { id: '28', name: 'B' },
        { id: '29', name: 'C' },
        { id: '30', name: 'D' },
      ],
      edges: [
        { from: '27', to: '28' },
        { from: '29', to: '30' },
      ],
    };
    const result = validateIndependentPhases(graph, ['27', '28', '29', '30']);
    expect(result.valid).toBe(false);
    expect(result.conflicts).toHaveLength(2);
  });

  test('returns valid:false when phase B depends on phase A', () => {
    const graph = {
      nodes: [
        { id: 'A', name: 'Alpha' },
        { id: 'B', name: 'Beta' },
      ],
      edges: [{ from: 'A', to: 'B' }],
    };
    const result = validateIndependentPhases(graph, ['A', 'B']);
    expect(result.valid).toBe(false);
    expect(result.conflicts).toEqual([{ from: 'A', to: 'B' }]);
  });

  test('returns valid:true for phases not in each others dependency chain', () => {
    const graph = {
      nodes: [
        { id: '27', name: 'A' },
        { id: '29', name: 'B' },
        { id: '30', name: 'C' },
      ],
      edges: [
        { from: '27', to: '30' },
        { from: '29', to: '30' },
      ],
    };
    const result = validateIndependentPhases(graph, ['27', '29']);
    expect(result.valid).toBe(true);
  });
});

// ─── buildParallelContext ───────────────────────────────────────────────────

describe('buildParallelContext', () => {
  let fixtureDir;

  afterEach(() => {
    if (fixtureDir) {
      cleanupFixtureDir(fixtureDir);
      fixtureDir = null;
    }
  });

  function writeRoadmapAndPhases(dir) {
    // Write a ROADMAP with two independent phases
    const roadmapPath = path.join(dir, '.planning', 'ROADMAP.md');
    fs.writeFileSync(
      roadmapPath,
      [
        '# Roadmap',
        '',
        '## v1.0: Foundation',
        '',
        '### Phase 1: Alpha Phase',
        '**Goal:** Build A',
        '**Depends on:** Nothing',
        '',
        '### Phase 2: Beta Phase',
        '**Goal:** Build B',
        '**Depends on:** Nothing',
      ].join('\n'),
      'utf-8'
    );

    // Create phase directories with at least one plan
    const phase1Dir = path.join(dir, '.planning', 'phases', '01-alpha-phase');
    const phase2Dir = path.join(dir, '.planning', 'phases', '02-beta-phase');
    fs.mkdirSync(phase1Dir, { recursive: true });
    fs.mkdirSync(phase2Dir, { recursive: true });
    fs.writeFileSync(path.join(phase1Dir, '01-01-PLAN.md'), '---\nphase: 01\nplan: 01\n---\n');
    fs.writeFileSync(path.join(phase2Dir, '02-01-PLAN.md'), '---\nphase: 02\nplan: 01\n---\n');
  }

  function writeConfig(dir, overrides = {}) {
    const configPath = path.join(dir, '.planning', 'config.json');
    const base = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    fs.writeFileSync(configPath, JSON.stringify({ ...base, ...overrides }, null, 2), 'utf-8');
  }

  test('returns mode parallel when backend has teams:true', () => {
    fixtureDir = createFixtureDir();
    writeRoadmapAndPhases(fixtureDir);
    // Default fixture has no backend set, so detectBackend defaults to 'claude' (teams:true)
    writeConfig(fixtureDir, { use_teams: true });

    const result = buildParallelContext(fixtureDir, ['1', '2']);
    expect(result.mode).toBe('parallel');
  });

  test('returns mode sequential when backend has teams:false', () => {
    fixtureDir = createFixtureDir();
    writeRoadmapAndPhases(fixtureDir);
    // Set backend to codex which has teams:false
    writeConfig(fixtureDir, { backend: 'codex' });

    const result = buildParallelContext(fixtureDir, ['1', '2']);
    expect(result.mode).toBe('sequential');
  });

  test('returns mode sequential when use_teams config is false even on claude', () => {
    fixtureDir = createFixtureDir();
    writeRoadmapAndPhases(fixtureDir);
    // Explicitly disable teams
    writeConfig(fixtureDir, { use_teams: false });

    const result = buildParallelContext(fixtureDir, ['1', '2']);
    expect(result.mode).toBe('sequential');
  });

  test('includes fallback_note when mode is sequential', () => {
    fixtureDir = createFixtureDir();
    writeRoadmapAndPhases(fixtureDir);
    writeConfig(fixtureDir, { backend: 'codex' });

    const result = buildParallelContext(fixtureDir, ['1', '2']);
    expect(result.fallback_note).toBeTruthy();
    expect(typeof result.fallback_note).toBe('string');
  });

  test('no fallback_note when mode is parallel', () => {
    fixtureDir = createFixtureDir();
    writeRoadmapAndPhases(fixtureDir);
    writeConfig(fixtureDir, { use_teams: true });

    const result = buildParallelContext(fixtureDir, ['1', '2']);
    expect(result.fallback_note).toBeFalsy();
  });

  test('phases array contains per-phase context with worktree_path', () => {
    fixtureDir = createFixtureDir();
    writeRoadmapAndPhases(fixtureDir);
    writeConfig(fixtureDir, { use_teams: true });

    const result = buildParallelContext(fixtureDir, ['1', '2']);
    expect(result.phases).toHaveLength(2);
    expect(result.phases[0].worktree_path).toBeTruthy();
    expect(result.phases[1].worktree_path).toBeTruthy();
  });

  test('phases array contains per-phase context with phase_number and phase_name', () => {
    fixtureDir = createFixtureDir();
    writeRoadmapAndPhases(fixtureDir);
    writeConfig(fixtureDir, { use_teams: true });

    const result = buildParallelContext(fixtureDir, ['1', '2']);
    expect(result.phases[0].phase_number).toBeTruthy();
    expect(result.phases[0].phase_name).toBeTruthy();
    expect(result.phases[1].phase_number).toBeTruthy();
    expect(result.phases[1].phase_name).toBeTruthy();
  });

  test('each phase has a status_tracker entry with pending initial state', () => {
    fixtureDir = createFixtureDir();
    writeRoadmapAndPhases(fixtureDir);
    writeConfig(fixtureDir, { use_teams: true });

    const result = buildParallelContext(fixtureDir, ['1', '2']);
    expect(result.status_tracker).toBeDefined();
    expect(result.status_tracker.phases).toBeDefined();
    // The status_tracker keys should correspond to the requested phase numbers
    const keys = Object.keys(result.status_tracker.phases);
    expect(keys.length).toBe(2);
    for (const key of keys) {
      expect(result.status_tracker.phases[key].status).toBe('pending');
    }
  });

  test('includes team_timeout_minutes and max_concurrent_teammates from config', () => {
    fixtureDir = createFixtureDir();
    writeRoadmapAndPhases(fixtureDir);
    writeConfig(fixtureDir, {
      use_teams: true,
      execution: { team_timeout_minutes: 45, max_concurrent_teammates: 6 },
    });

    const result = buildParallelContext(fixtureDir, ['1', '2']);
    expect(result.team_timeout_minutes).toBeDefined();
    expect(result.max_concurrent_teammates).toBeDefined();
  });

  test('returns error when a requested phase is not found', () => {
    fixtureDir = createFixtureDir();
    writeRoadmapAndPhases(fixtureDir);
    writeConfig(fixtureDir, { use_teams: true });

    const result = buildParallelContext(fixtureDir, ['99']);
    expect(result.error).toBeTruthy();
  });
});

// ─── cmdInitExecuteParallel ─────────────────────────────────────────────────

describe('cmdInitExecuteParallel', () => {
  let fixtureDir;

  afterEach(() => {
    if (fixtureDir) {
      cleanupFixtureDir(fixtureDir);
      fixtureDir = null;
    }
  });

  function writeRoadmapAndPhases(dir, roadmapContent) {
    const roadmapPath = path.join(dir, '.planning', 'ROADMAP.md');
    fs.writeFileSync(roadmapPath, roadmapContent, 'utf-8');
  }

  function ensurePhaseDir(dir, phaseNum, phaseName) {
    const padded = String(phaseNum).padStart(2, '0');
    const slug = phaseName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    const phaseDir = path.join(dir, '.planning', 'phases', `${padded}-${slug}`);
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(
      path.join(phaseDir, `${padded}-01-PLAN.md`),
      `---\nphase: ${padded}\nplan: 01\n---\n`
    );
  }

  function writeConfig(dir, overrides = {}) {
    const configPath = path.join(dir, '.planning', 'config.json');
    const base = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    fs.writeFileSync(configPath, JSON.stringify({ ...base, ...overrides }, null, 2), 'utf-8');
  }

  const independentRoadmap = [
    '# Roadmap',
    '',
    '## v1.0: Foundation',
    '',
    '### Phase 1: Alpha',
    '**Goal:** Build A',
    '**Depends on:** Nothing',
    '',
    '### Phase 2: Beta',
    '**Goal:** Build B',
    '**Depends on:** Nothing',
  ].join('\n');

  const dependentRoadmap = [
    '# Roadmap',
    '',
    '## v1.0: Foundation',
    '',
    '### Phase 1: Alpha',
    '**Goal:** Build A',
    '**Depends on:** Nothing',
    '',
    '### Phase 2: Beta',
    '**Goal:** Build B',
    '**Depends on:** Phase 1',
  ].join('\n');

  test('returns complete context JSON for two independent phases', () => {
    fixtureDir = createFixtureDir();
    writeRoadmapAndPhases(fixtureDir, independentRoadmap);
    ensurePhaseDir(fixtureDir, 1, 'Alpha');
    ensurePhaseDir(fixtureDir, 2, 'Beta');
    writeConfig(fixtureDir, { use_teams: true, autonomous_mode: true });

    const { stdout, exitCode } = captureOutput(() => {
      cmdInitExecuteParallel(fixtureDir, ['1', '2'], new Set(), false);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.mode).toBeDefined();
    expect(parsed.phases).toBeInstanceOf(Array);
    expect(parsed.phases.length).toBe(2);
  });

  test('returns error when phases are not independent', () => {
    fixtureDir = createFixtureDir();
    writeRoadmapAndPhases(fixtureDir, dependentRoadmap);
    ensurePhaseDir(fixtureDir, 1, 'Alpha');
    ensurePhaseDir(fixtureDir, 2, 'Beta');
    writeConfig(fixtureDir, { autonomous_mode: true });

    const { stdout, exitCode } = captureOutput(() => {
      cmdInitExecuteParallel(fixtureDir, ['1', '2'], new Set(), false);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.error).toBeTruthy();
  });

  test('returns error for non-existent phase', () => {
    fixtureDir = createFixtureDir();
    writeRoadmapAndPhases(fixtureDir, independentRoadmap);
    ensurePhaseDir(fixtureDir, 1, 'Alpha');
    writeConfig(fixtureDir, { autonomous_mode: true });

    const { stdout, exitCode } = captureOutput(() => {
      cmdInitExecuteParallel(fixtureDir, ['99'], new Set(), false);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.error).toBeTruthy();
  });

  test('single phase works (trivially independent)', () => {
    fixtureDir = createFixtureDir();
    writeRoadmapAndPhases(fixtureDir, independentRoadmap);
    ensurePhaseDir(fixtureDir, 1, 'Alpha');
    writeConfig(fixtureDir, { autonomous_mode: true });

    const { stdout, exitCode } = captureOutput(() => {
      cmdInitExecuteParallel(fixtureDir, ['1'], new Set(), false);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.phases).toHaveLength(1);
  });

  test('mode is parallel on claude backend', () => {
    fixtureDir = createFixtureDir();
    writeRoadmapAndPhases(fixtureDir, independentRoadmap);
    ensurePhaseDir(fixtureDir, 1, 'Alpha');
    ensurePhaseDir(fixtureDir, 2, 'Beta');
    // Default backend is claude with teams:true
    writeConfig(fixtureDir, { use_teams: true, autonomous_mode: true });

    const { stdout } = captureOutput(() => {
      cmdInitExecuteParallel(fixtureDir, ['1', '2'], new Set(), false);
    });
    const parsed = JSON.parse(stdout);
    expect(parsed.mode).toBe('parallel');
  });

  test('mode is sequential on non-claude backend', () => {
    fixtureDir = createFixtureDir();
    writeRoadmapAndPhases(fixtureDir, independentRoadmap);
    ensurePhaseDir(fixtureDir, 1, 'Alpha');
    ensurePhaseDir(fixtureDir, 2, 'Beta');
    writeConfig(fixtureDir, { backend: 'codex', autonomous_mode: true });

    const { stdout } = captureOutput(() => {
      cmdInitExecuteParallel(fixtureDir, ['1', '2'], new Set(), false);
    });
    const parsed = JSON.parse(stdout);
    expect(parsed.mode).toBe('sequential');
    expect(parsed.fallback_note).toBeTruthy();
  });

  test('status_tracker has all requested phases with pending status', () => {
    fixtureDir = createFixtureDir();
    writeRoadmapAndPhases(fixtureDir, independentRoadmap);
    ensurePhaseDir(fixtureDir, 1, 'Alpha');
    ensurePhaseDir(fixtureDir, 2, 'Beta');
    writeConfig(fixtureDir, { use_teams: true, autonomous_mode: true });

    const { stdout } = captureOutput(() => {
      cmdInitExecuteParallel(fixtureDir, ['1', '2'], new Set(), false);
    });
    const parsed = JSON.parse(stdout);
    expect(parsed.status_tracker).toBeDefined();
    expect(parsed.status_tracker.phases).toBeDefined();
    const keys = Object.keys(parsed.status_tracker.phases);
    expect(keys.length).toBe(2);
    for (const key of keys) {
      expect(parsed.status_tracker.phases[key].status).toBe('pending');
    }
  });
});

// ─── CLI integration -- init execute-parallel ───────────────────────────────

describe('CLI integration -- init execute-parallel', () => {
  const { COMMAND_DESCRIPTORS } = require('../../lib/mcp-server');
  let fixtureDir;

  afterEach(() => {
    if (fixtureDir) {
      cleanupFixtureDir(fixtureDir);
      fixtureDir = null;
    }
  });

  function writeRoadmap(dir, content) {
    const roadmapPath = path.join(dir, '.planning', 'ROADMAP.md');
    fs.writeFileSync(roadmapPath, content, 'utf-8');
  }

  function ensurePhaseDir(dir, phaseNum, phaseName) {
    const padded = String(phaseNum).padStart(2, '0');
    const slug = phaseName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    const phaseDir = path.join(dir, '.planning', 'phases', `${padded}-${slug}`);
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(
      path.join(phaseDir, `${padded}-01-PLAN.md`),
      `---\nphase: ${padded}\nplan: 01\n---\n`
    );
  }

  function writeConfig(dir, overrides = {}) {
    const configPath = path.join(dir, '.planning', 'config.json');
    const base = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    fs.writeFileSync(configPath, JSON.stringify({ ...base, ...overrides }, null, 2), 'utf-8');
  }

  const threePhaseIndependent = [
    '# Roadmap',
    '',
    '## v1.0: Foundation',
    '',
    '### Phase 1: Alpha',
    '**Goal:** Build A',
    '**Depends on:** Nothing',
    '',
    '### Phase 2: Beta',
    '**Goal:** Build B',
    '**Depends on:** Nothing',
    '',
    '### Phase 3: Gamma',
    '**Goal:** Build C',
    '**Depends on:** Nothing',
  ].join('\n');

  const twoPhaseDependent = [
    '# Roadmap',
    '',
    '## v1.0: Foundation',
    '',
    '### Phase 1: Alpha',
    '**Goal:** Build A',
    '**Depends on:** Nothing',
    '',
    '### Phase 2: Beta',
    '**Goal:** Build B',
    '**Depends on:** Phase 1',
  ].join('\n');

  test('CLI returns valid JSON with expected fields for independent phases', () => {
    fixtureDir = createFixtureDir();
    writeRoadmap(fixtureDir, threePhaseIndependent.split('\n').slice(0, 11).join('\n'));
    ensurePhaseDir(fixtureDir, 1, 'Alpha');
    ensurePhaseDir(fixtureDir, 2, 'Beta');
    writeConfig(fixtureDir, { use_teams: true, autonomous_mode: true });

    const { stdout, exitCode } = captureOutput(() => {
      cmdInitExecuteParallel(fixtureDir, ['1', '2'], new Set(), false);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.mode).toBeDefined();
    expect(parsed.phases).toBeInstanceOf(Array);
    expect(parsed.phases.length).toBe(2);
    expect(parsed.status_tracker).toBeDefined();
    expect(Object.keys(parsed.status_tracker.phases).length).toBe(2);
    expect(parsed.independence_validated).toBe(true);
  });

  test('CLI returns error when phases have dependency conflict', () => {
    fixtureDir = createFixtureDir();
    writeRoadmap(fixtureDir, twoPhaseDependent);
    ensurePhaseDir(fixtureDir, 1, 'Alpha');
    ensurePhaseDir(fixtureDir, 2, 'Beta');
    writeConfig(fixtureDir, { autonomous_mode: true });

    const { stdout, exitCode } = captureOutput(() => {
      cmdInitExecuteParallel(fixtureDir, ['1', '2'], new Set(), false);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.error).toBeTruthy();
    expect(parsed.error).toMatch(/not independent|dependency|conflict/i);
  });

  test('CLI returns error for non-existent phase', () => {
    fixtureDir = createFixtureDir();
    writeRoadmap(fixtureDir, threePhaseIndependent);
    ensurePhaseDir(fixtureDir, 1, 'Alpha');
    writeConfig(fixtureDir, { autonomous_mode: true });

    const { stdout, exitCode } = captureOutput(() => {
      cmdInitExecuteParallel(fixtureDir, ['1', '99'], new Set(), false);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.error).toBeTruthy();
    expect(parsed.error).toMatch(/99/);
  });

  test('single phase produces valid context', () => {
    fixtureDir = createFixtureDir();
    writeRoadmap(fixtureDir, threePhaseIndependent);
    ensurePhaseDir(fixtureDir, 1, 'Alpha');
    writeConfig(fixtureDir, { autonomous_mode: true });

    const { stdout, exitCode } = captureOutput(() => {
      cmdInitExecuteParallel(fixtureDir, ['1'], new Set(), false);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.phases).toHaveLength(1);
    expect(parsed.mode).toBeDefined();
    expect(parsed.independence_validated).toBe(true);
  });

  test('MCP descriptor grd_init_execute_parallel exists with correct params', () => {
    const descriptor = COMMAND_DESCRIPTORS.find((d) => d.name === 'grd_init_execute_parallel');
    expect(descriptor).toBeDefined();
    expect(descriptor.params).toBeInstanceOf(Array);

    const phasesParam = descriptor.params.find((p) => p.name === 'phases');
    expect(phasesParam).toBeDefined();
    expect(phasesParam.required).toBe(true);

    const includeParam = descriptor.params.find((p) => p.name === 'include');
    expect(includeParam).toBeDefined();
    expect(includeParam.required).toBe(false);

    expect(typeof descriptor.execute).toBe('function');
  });

  test('MCP descriptor execute function is callable without crashing', () => {
    fixtureDir = createFixtureDir();
    writeRoadmap(fixtureDir, threePhaseIndependent);
    ensurePhaseDir(fixtureDir, 1, 'Alpha');
    writeConfig(fixtureDir, { autonomous_mode: true });

    const descriptor = COMMAND_DESCRIPTORS.find((d) => d.name === 'grd_init_execute_parallel');
    expect(descriptor).toBeDefined();

    // Should not throw; may output error JSON for bad phase, but should not crash
    const { exitCode } = captureOutput(() => {
      descriptor.execute(fixtureDir, { phases: '1' });
    });
    expect(exitCode).toBe(0);
  });

  test('status_tracker phases all have pending status for 3 independent phases', () => {
    fixtureDir = createFixtureDir();
    writeRoadmap(fixtureDir, threePhaseIndependent);
    ensurePhaseDir(fixtureDir, 1, 'Alpha');
    ensurePhaseDir(fixtureDir, 2, 'Beta');
    ensurePhaseDir(fixtureDir, 3, 'Gamma');
    writeConfig(fixtureDir, { use_teams: true, autonomous_mode: true });

    const { stdout, exitCode } = captureOutput(() => {
      cmdInitExecuteParallel(fixtureDir, ['1', '2', '3'], new Set(), false);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.status_tracker).toBeDefined();
    const phases = parsed.status_tracker.phases;
    const keys = Object.keys(phases);
    expect(keys.length).toBe(3);
    for (const key of keys) {
      expect(phases[key].status).toBe('pending');
    }
  });
});
