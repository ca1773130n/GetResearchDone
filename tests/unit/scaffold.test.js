/**
 * Unit tests for lib/scaffold.js
 *
 * Tests template selection, template fill, and scaffold operations.
 */

const fs = require('fs');
const path = require('path');
const { captureOutput, captureError } = require('../helpers/setup');
const { createFixtureDir, cleanupFixtureDir } = require('../helpers/fixtures');

const { cmdTemplateSelect, cmdTemplateFill, cmdScaffold } = require('../../lib/scaffold');

/**
 * Parse the first JSON object from stdout that may contain concatenated
 * pretty-printed JSON (when cmd functions have try/catch that catches the
 * process.exit sentinel and calls output() again).
 */
function parseFirstJson(str) {
  try {
    return JSON.parse(str);
  } catch {
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = 0; i < str.length; i++) {
      const ch = str[i];
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === '\\' && inString) {
        escape = true;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (ch === '{') depth++;
      if (ch === '}') {
        depth--;
        if (depth === 0) return JSON.parse(str.slice(0, i + 1));
      }
    }
    throw new Error('Failed to parse first JSON from: ' + str.slice(0, 100));
  }
}

// ─── cmdTemplateSelect ──────────────────────────────────────────────────────

describe('cmdTemplateSelect', () => {
  let fixtureDir;

  beforeAll(() => {
    fixtureDir = createFixtureDir();
  });

  afterAll(() => {
    cleanupFixtureDir(fixtureDir);
  });

  test('returns template info for a plan with few tasks', () => {
    // 01-01-PLAN.md has 1 task, few files, no decisions => minimal
    const { stdout, exitCode } = captureOutput(() => {
      cmdTemplateSelect(
        fixtureDir,
        '.planning/milestones/anonymous/phases/01-test/01-01-PLAN.md',
        false
      );
    });
    expect(exitCode).toBe(0);
    // cmdTemplateSelect has try/catch that may catch exit sentinel
    const parsed = parseFirstJson(stdout);
    expect(parsed).toHaveProperty('template');
    expect(parsed).toHaveProperty('type');
    expect(parsed.taskCount).toBeGreaterThanOrEqual(0);
  });

  test('falls back to standard template for non-existent file', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdTemplateSelect(fixtureDir, 'nonexistent-plan.md', false);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.template).toContain('standard');
    expect(parsed.type).toBe('standard');
  });

  test('detects decision mentions for template classification', () => {
    // Create a plan that mentions "decision" multiple times
    const decisionPlan = path.join(fixtureDir, 'decision-plan.md');
    fs.writeFileSync(
      decisionPlan,
      [
        '### Task 1: First task',
        '### Task 2: Second task',
        '### Task 3: Third task',
        '### Task 4: Fourth task',
        '### Task 5: Fifth task',
        '### Task 6: Sixth task',
        'decision about architecture',
        'decision about framework',
        '`src/foo/bar.js` `src/baz/qux.js` `lib/a/b.js` `lib/c/d.js`',
        '`src/e/f.js` `src/g/h.js` `lib/i/j.js`',
      ].join('\n'),
      'utf-8'
    );

    const { stdout } = captureOutput(() => {
      cmdTemplateSelect(fixtureDir, 'decision-plan.md', false);
    });
    const parsed = parseFirstJson(stdout);
    expect(parsed.type).toBe('complex');
    expect(parsed.hasDecisions).toBe(true);
  });

  test('fallback for missing file includes error_type file_not_found', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdTemplateSelect(fixtureDir, 'no-such-file.md', false);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.template).toContain('standard');
    expect(parsed.error_type).toBe('file_not_found');
  });

  test('fallback for unreadable file includes error_type read_error', () => {
    const unreadable = path.join(fixtureDir, 'unreadable.md');
    fs.writeFileSync(unreadable, 'some content', 'utf-8');
    fs.chmodSync(unreadable, 0o000);

    try {
      const { stdout, exitCode } = captureOutput(() => {
        cmdTemplateSelect(fixtureDir, 'unreadable.md', false);
      });
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.template).toContain('standard');
      expect(parsed.error_type).toBe('read_error');
    } finally {
      fs.chmodSync(unreadable, 0o644);
    }
  });
});

// ─── cmdTemplateFill ────────────────────────────────────────────────────────

describe('cmdTemplateFill', () => {
  let fixtureDir;

  beforeEach(() => {
    fixtureDir = createFixtureDir();
  });

  afterEach(() => {
    cleanupFixtureDir(fixtureDir);
  });

  test('fills summary template with phase/plan variables', () => {
    // Use plan 02 since 01-01-SUMMARY.md already exists in fixture
    const { stdout, exitCode } = captureOutput(() => {
      cmdTemplateFill(
        fixtureDir,
        'summary',
        {
          phase: '1',
          plan: '02',
          name: 'Test Phase',
        },
        false
      );
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.created).toBe(true);
    expect(parsed.path).toContain('SUMMARY.md');

    // Check file was created on disk
    const fullPath = path.join(fixtureDir, parsed.path);
    expect(fs.existsSync(fullPath)).toBe(true);
    const content = fs.readFileSync(fullPath, 'utf-8');
    expect(content).toContain('Phase 1');
    expect(content).toContain('Summary');
  });

  test('fills plan template with type and wave', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdTemplateFill(
        fixtureDir,
        'plan',
        {
          phase: '1',
          plan: '02',
          type: 'execute',
          wave: '1',
          name: 'Test Phase',
        },
        false
      );
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.created).toBe(true);
    expect(parsed.path).toContain('PLAN.md');
  });

  test('returns error when file already exists', () => {
    // 01-01-SUMMARY.md already exists in fixture; trying to create it returns error
    const { stdout } = captureOutput(() => {
      cmdTemplateFill(
        fixtureDir,
        'summary',
        {
          phase: '1',
          plan: '01',
          name: 'Test Phase',
        },
        false
      );
    });
    const parsed = JSON.parse(stdout);
    expect(parsed.error).toContain('already exists');
  });

  test('returns error for unknown template type', () => {
    const { exitCode } = captureError(() => {
      cmdTemplateFill(fixtureDir, 'unknown_type', { phase: '1' }, false);
    });
    expect(exitCode).toBe(1);
  });

  test('returns error when phase not found', () => {
    const { stdout } = captureOutput(() => {
      cmdTemplateFill(fixtureDir, 'summary', { phase: '99' }, false);
    });
    const parsed = JSON.parse(stdout);
    expect(parsed).toHaveProperty('error');
  });
});

// ─── cmdScaffold ────────────────────────────────────────────────────────────

describe('cmdScaffold', () => {
  let fixtureDir;

  beforeEach(() => {
    fixtureDir = createFixtureDir();
  });

  afterEach(() => {
    cleanupFixtureDir(fixtureDir);
  });

  test('scaffold context creates CONTEXT.md in phase directory', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdScaffold(fixtureDir, 'context', { phase: '1', name: 'Test' }, false);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.created).toBe(true);
    expect(parsed.path).toContain('CONTEXT.md');

    // Verify file exists on disk
    const fullPath = path.join(fixtureDir, parsed.path);
    expect(fs.existsSync(fullPath)).toBe(true);
  });

  test('scaffold phase-dir creates new phase directory', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdScaffold(fixtureDir, 'phase-dir', { phase: '3', name: 'new-feature' }, false);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.created).toBe(true);
    expect(parsed.directory).toContain('03-new-feature');

    // Verify directory exists
    expect(fs.existsSync(parsed.path)).toBe(true);
  });

  test('scaffold research-dir creates research directory structure', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdScaffold(fixtureDir, 'research-dir', { phase: null, name: null }, false);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.created).toBe(true);

    // Verify deep-dives subdirectory was created
    const deepDivesPath = path.join(
      fixtureDir,
      '.planning',
      'milestones',
      'anonymous',
      'research',
      'deep-dives'
    );
    expect(fs.existsSync(deepDivesPath)).toBe(true);
  });

  test('scaffold with invalid type returns error', () => {
    const { exitCode } = captureError(() => {
      cmdScaffold(fixtureDir, 'invalid-type', { phase: '1' }, false);
    });
    expect(exitCode).toBe(1);
  });

  test('scaffold context returns already_exists when file exists', () => {
    // Create the file first
    captureOutput(() => {
      cmdScaffold(fixtureDir, 'context', { phase: '1', name: 'Test' }, false);
    });
    // Second call should report already exists
    const { stdout } = captureOutput(() => {
      cmdScaffold(fixtureDir, 'context', { phase: '1', name: 'Test' }, false);
    });
    const parsed = JSON.parse(stdout);
    expect(parsed.created).toBe(false);
    expect(parsed.reason).toBe('already_exists');
  });

  test('scaffold baseline creates BASELINE.md', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdScaffold(fixtureDir, 'baseline', { phase: null, name: null }, false);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.created).toBe(true);

    // Verify file exists
    const baselinePath = path.join(fixtureDir, '.planning', 'BASELINE.md');
    expect(fs.existsSync(baselinePath)).toBe(true);
  });

  test('scaffold baseline returns already_exists when BASELINE.md exists', () => {
    // Create first
    captureOutput(() => {
      cmdScaffold(fixtureDir, 'baseline', { phase: null, name: null }, false);
    });
    // Second call
    const { stdout, exitCode } = captureOutput(() => {
      cmdScaffold(fixtureDir, 'baseline', { phase: null, name: null }, false);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.created).toBe(false);
    expect(parsed.reason).toBe('already_exists');
  });

  test('scaffold uat creates UAT.md in phase directory', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdScaffold(fixtureDir, 'uat', { phase: '1', name: 'Test' }, false);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.created).toBe(true);
    expect(parsed.path).toContain('UAT.md');

    const fullPath = path.join(fixtureDir, parsed.path);
    expect(fs.existsSync(fullPath)).toBe(true);
    const content = fs.readFileSync(fullPath, 'utf-8');
    expect(content).toContain('User Acceptance Testing');
  });

  test('scaffold verification creates VERIFICATION.md in phase directory', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdScaffold(fixtureDir, 'verification', { phase: '1', name: 'Test' }, false);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.created).toBe(true);
    expect(parsed.path).toContain('VERIFICATION.md');

    const fullPath = path.join(fixtureDir, parsed.path);
    expect(fs.existsSync(fullPath)).toBe(true);
    const content = fs.readFileSync(fullPath, 'utf-8');
    expect(content).toContain('Verification');
  });

  test('scaffold eval creates EVAL.md in phase directory', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdScaffold(fixtureDir, 'eval', { phase: '1', name: 'Test' }, false);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.created).toBe(true);
    expect(parsed.path).toContain('EVAL.md');

    const fullPath = path.join(fixtureDir, parsed.path);
    expect(fs.existsSync(fullPath)).toBe(true);
    const content = fs.readFileSync(fullPath, 'utf-8');
    expect(content).toContain('Evaluation Plan');
  });

  test('scaffold errors when phase directory not found', () => {
    const { stderr, exitCode } = captureError(() => {
      cmdScaffold(fixtureDir, 'context', { phase: '99' }, false);
    });
    expect(exitCode).toBe(1);
    expect(stderr).toContain('Phase 99 directory not found');
  });

  test('scaffold phase-dir errors when phase and name missing', () => {
    const { stderr, exitCode } = captureError(() => {
      cmdScaffold(fixtureDir, 'phase-dir', { phase: null, name: null }, false);
    });
    expect(exitCode).toBe(1);
    expect(stderr).toContain('phase and name required');
  });
});

// ─── cmdTemplateFill additional tests ───────────────────────────────────────

describe('cmdTemplateFill additional', () => {
  let fixtureDir;

  beforeEach(() => {
    fixtureDir = createFixtureDir();
  });

  afterEach(() => {
    cleanupFixtureDir(fixtureDir);
  });

  test('errors when no template type given', () => {
    const { stderr, exitCode } = captureError(() => {
      cmdTemplateFill(fixtureDir, null, { phase: '1' }, false);
    });
    expect(exitCode).toBe(1);
    expect(stderr).toContain('template type required');
  });

  test('errors when no --phase given', () => {
    const { stderr, exitCode } = captureError(() => {
      cmdTemplateFill(fixtureDir, 'summary', {}, false);
    });
    expect(exitCode).toBe(1);
    expect(stderr).toContain('--phase required');
  });

  test('fills verification template with correct frontmatter', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdTemplateFill(fixtureDir, 'verification', { phase: '1', name: 'Test Phase' }, false);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.created).toBe(true);
    expect(parsed.template).toBe('verification');
    expect(parsed.path).toContain('VERIFICATION.md');

    const fullPath = path.join(fixtureDir, parsed.path);
    const content = fs.readFileSync(fullPath, 'utf-8');
    expect(content).toContain('Observable Truths');
    expect(content).toContain('status: pending');
  });
});
