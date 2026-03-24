'use strict';

/**
 * Unit tests for lib/invariants.ts
 *
 * Tests all five exported functions:
 *   - extractPlanArtifact: Parses PLAN.md content into typed PlanArtifact
 *   - validateStructural: Checks required fields and correct types
 *   - validateSemantic: Checks file path safety and objective relevance
 *   - validateCrossPhase: Detects duplicate provides and unmet requires
 *   - validateResearchArtifacts: Validates LANDSCAPE.md, PAPERS.md, RESEARCH.md
 *
 * Satisfies REQ-181 (CFG Validation Tests): 90%+ line coverage on lib/invariants.ts
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  extractPlanArtifact,
  validateStructural,
  validateSemantic,
  validateCrossPhase,
  validateResearchArtifacts,
} = require('../../lib/invariants') as {
  extractPlanArtifact: (content: string) => import('../../lib/types').PlanArtifact;
  validateStructural: (plan: import('../../lib/types').PlanArtifact) => import('../../lib/types').ValidationResult;
  validateSemantic: (plan: import('../../lib/types').PlanArtifact, cwd: string) => import('../../lib/types').ValidationResult;
  validateCrossPhase: (plans: import('../../lib/types').PlanArtifact[]) => import('../../lib/types').ValidationResult;
  validateResearchArtifacts: (phaseDir: string) => import('../../lib/types').ValidationResult;
};

import type { PlanArtifact, ValidationResult } from '../../lib/types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Build a valid PlanArtifact for structural/semantic/cross-phase tests.
 */
function makePlan(overrides: Partial<PlanArtifact> = {}): PlanArtifact {
  return {
    objective: 'Implement lib/invariants.ts validation functions',
    files_modified: ['lib/invariants.ts', 'tests/unit/invariants.test.ts'],
    phase: '92-cfg-formalization',
    plan: 3,
    type: 'execute',
    wave: 2,
    depends_on: ['92-01'],
    autonomous: true,
    provides: ['invariants-validation'],
    requires: ['plan-artifact-schema'],
    integration_points: [],
    ...overrides,
  };
}

// ─── extractPlanArtifact ─────────────────────────────────────────────────────

describe('extractPlanArtifact', () => {
  test('valid plan content with frontmatter and objective tag returns correct PlanArtifact', () => {
    const content = [
      '---',
      'phase: 92-cfg-formalization',
      'plan: 3',
      'type: execute',
      'wave: 2',
      'depends_on: [92-01]',
      'autonomous: true',
      'files_modified: [lib/invariants.ts, tests/unit/invariants.test.ts]',
      'provides: [invariants-validation]',
      'requires: [plan-artifact-schema]',
      'integration_points: []',
      '---',
      '',
      '<objective>',
      'Implement lib/invariants.ts validation functions',
      '</objective>',
    ].join('\n');

    const artifact = extractPlanArtifact(content);

    expect(artifact.phase).toBe('92-cfg-formalization');
    expect(artifact.plan).toBe(3);
    expect(artifact.type).toBe('execute');
    expect(artifact.wave).toBe(2);
    expect(artifact.autonomous).toBe(true);
    expect(artifact.objective).toBe('Implement lib/invariants.ts validation functions');
    expect(artifact.files_modified).toContain('lib/invariants.ts');
    expect(artifact.provides).toContain('invariants-validation');
    expect(artifact.requires).toContain('plan-artifact-schema');
  });

  test('content with no frontmatter returns defaults (empty strings/arrays, zero plan/wave)', () => {
    const content = '<objective>Just an objective</objective>';

    const artifact = extractPlanArtifact(content);

    expect(artifact.phase).toBe('');
    expect(artifact.plan).toBe(0);
    expect(artifact.type).toBe('');
    expect(artifact.wave).toBe(0);
    expect(artifact.autonomous).toBe(false);
    expect(artifact.files_modified).toEqual([]);
    expect(artifact.provides).toEqual([]);
    expect(artifact.requires).toEqual([]);
    expect(artifact.depends_on).toEqual([]);
    expect(artifact.integration_points).toEqual([]);
    expect(artifact.objective).toBe('Just an objective');
  });

  test('content with frontmatter but no objective tag returns empty objective string', () => {
    const content = [
      '---',
      'phase: 92-cfg-formalization',
      'plan: 1',
      'type: execute',
      'wave: 1',
      'autonomous: false',
      'files_modified: [lib/gates.ts]',
      '---',
      '',
      'No objective tag here.',
    ].join('\n');

    const artifact = extractPlanArtifact(content);

    expect(artifact.objective).toBe('');
    expect(artifact.phase).toBe('92-cfg-formalization');
    expect(artifact.plan).toBe(1);
  });

  test('plan as string number in frontmatter is coerced to integer', () => {
    const content = [
      '---',
      'plan: "05"',
      'wave: "3"',
      'type: execute',
      'autonomous: false',
      'files_modified: [lib/utils.ts]',
      '---',
    ].join('\n');

    const artifact = extractPlanArtifact(content);

    expect(artifact.plan).toBe(5);
    expect(artifact.wave).toBe(3);
  });

  test('autonomous: true (boolean) in frontmatter is extracted as true', () => {
    const content = [
      '---',
      'phase: test',
      'plan: 1',
      'type: execute',
      'wave: 1',
      'autonomous: true',
      'files_modified: [lib/utils.ts]',
      '---',
    ].join('\n');

    const artifact = extractPlanArtifact(content);

    expect(artifact.autonomous).toBe(true);
  });
});

// ─── validateStructural ───────────────────────────────────────────────────────

describe('validateStructural', () => {
  test('valid PlanArtifact returns {valid: true, errors: []}', () => {
    const plan = makePlan();
    const result: ValidationResult = validateStructural(plan);

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test('missing objective (empty string) returns error', () => {
    const plan = makePlan({ objective: '' });
    const result = validateStructural(plan);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e: string) => e.includes('objective'))).toBe(true);
  });

  test('whitespace-only objective returns error', () => {
    const plan = makePlan({ objective: '   ' });
    const result = validateStructural(plan);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e: string) => e.includes('objective'))).toBe(true);
  });

  test('empty files_modified array returns error', () => {
    const plan = makePlan({ files_modified: [] });
    const result = validateStructural(plan);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e: string) => e.includes('files_modified'))).toBe(true);
  });

  test('wave as 0 returns error (must be positive integer)', () => {
    const plan = makePlan({ wave: 0 });
    const result = validateStructural(plan);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e: string) => e.includes('wave'))).toBe(true);
  });

  test('wave as negative number returns error', () => {
    const plan = makePlan({ wave: -1 });
    const result = validateStructural(plan);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e: string) => e.includes('wave'))).toBe(true);
  });

  test('autonomous as string "true" returns error (must be boolean)', () => {
    // Cast to bypass TypeScript so we can test the JS-level guard
    const plan = makePlan({ autonomous: 'true' as unknown as boolean });
    const result = validateStructural(plan);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e: string) => e.includes('autonomous'))).toBe(true);
  });

  test('empty type returns error', () => {
    const plan = makePlan({ type: '' });
    const result = validateStructural(plan);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e: string) => e.includes('type'))).toBe(true);
  });

  test('multiple invalid fields are all reported in errors', () => {
    const plan = makePlan({ objective: '', files_modified: [], wave: 0, type: '' });
    const result = validateStructural(plan);

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(4);
  });

  test('empty provides and requires produce warnings (not errors)', () => {
    const plan = makePlan({ provides: [], requires: [] });
    const result = validateStructural(plan);

    // warnings about no dependency tracking
    expect(result.warnings.some((w: string) => w.includes('provides'))).toBe(true);
    expect(result.warnings.some((w: string) => w.includes('requires'))).toBe(true);
  });

  test('files_modified not an array returns error', () => {
    const plan = makePlan({ files_modified: 'lib/utils.ts' as unknown as string[] });
    const result = validateStructural(plan);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e: string) => e.includes('files_modified must be an array'))).toBe(true);
  });

  test('depends_on not an array produces warning', () => {
    const plan = makePlan({ depends_on: 'some-dep' as unknown as string[] });
    const result = validateStructural(plan);

    expect(result.warnings.some((w: string) => w.includes('depends_on should be an array'))).toBe(true);
  });
});

// ─── validateSemantic ─────────────────────────────────────────────────────────

describe('validateSemantic', () => {
  // We need a real cwd that has known directories for the parent-dir existence check
  const cwd = path.join(__dirname, '..', '..');

  test('valid relative file paths pass without errors', () => {
    const plan = makePlan({
      files_modified: ['lib/invariants.ts', 'tests/unit/invariants.test.ts'],
      objective: 'Implement lib/invariants.ts validation',
    });
    const result: ValidationResult = validateSemantic(plan, cwd);

    expect(result.errors).toEqual([]);
  });

  test('absolute path starting with / returns error', () => {
    const plan = makePlan({ files_modified: ['/etc/passwd'] });
    const result = validateSemantic(plan, cwd);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e: string) => e.includes('/etc/passwd'))).toBe(true);
    expect(result.errors.some((e: string) => e.includes('absolute'))).toBe(true);
  });

  test('path with .. directory traversal returns error', () => {
    const plan = makePlan({ files_modified: ['../secret/config.json'] });
    const result = validateSemantic(plan, cwd);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e: string) => e.includes('..'))).toBe(true);
    expect(result.errors.some((e: string) => e.includes('traversal'))).toBe(true);
  });

  test('file path without extension produces warning', () => {
    const plan = makePlan({
      files_modified: ['lib/noextension'],
      objective: 'Implement lib/something',
    });
    const result = validateSemantic(plan, cwd);

    expect(result.warnings.some((w: string) => w.includes('no extension'))).toBe(true);
  });

  test('objective referencing known lib/ directory does not produce directory warning', () => {
    const plan = makePlan({
      objective: 'Implement lib/invariants.ts for CFG validation',
      files_modified: ['lib/invariants.ts'],
    });
    const result = validateSemantic(plan, cwd);

    // No "does not reference any known" warning
    const dirWarning = result.warnings.find((w: string) =>
      w.includes('does not reference any known')
    );
    expect(dirWarning).toBeUndefined();
  });

  test('both absolute path and traversal errors reported together', () => {
    const plan = makePlan({ files_modified: ['/abs/path.ts', '../traversal/file.ts'] });
    const result = validateSemantic(plan, cwd);

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });

  test('objective not referencing known dirs and non-existent parent produces warning', () => {
    // Use a tmpDir as cwd so no parent directory exists
    const tmpCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-sem-test-'));
    try {
      const plan = makePlan({
        objective: 'Do some completely unknown work',
        files_modified: ['non-existent-dir/file.ts'],
      });
      const result = validateSemantic(plan, tmpCwd);

      // The objective does not reference lib/ or other known dirs
      // and the parent directory does not exist on disk
      expect(result.warnings.some((w: string) => w.includes('does not reference any known'))).toBe(true);
    } finally {
      fs.rmSync(tmpCwd, { recursive: true, force: true });
    }
  });

  test('objective not referencing known dirs but root-level file does not warn', () => {
    const tmpCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-sem-test-'));
    try {
      const plan = makePlan({
        objective: 'Do some completely unknown work',
        files_modified: ['rootfile.ts'],  // no parent dir — root-level file is fine
      });
      const result = validateSemantic(plan, tmpCwd);

      // root-level file returns true in hasExistingParent check → no warning
      const dirWarning = result.warnings.find((w: string) => w.includes('does not reference any known'));
      expect(dirWarning).toBeUndefined();
    } finally {
      fs.rmSync(tmpCwd, { recursive: true, force: true });
    }
  });
});

// ─── validateCrossPhase ───────────────────────────────────────────────────────

describe('validateCrossPhase', () => {
  test('valid plan set with matching provides/requires passes', () => {
    const planA = makePlan({
      phase: '92',
      plan: 1,
      provides: ['artifact-A'],
      requires: [],
    });
    const planB = makePlan({
      phase: '92',
      plan: 2,
      provides: ['artifact-B'],
      requires: ['artifact-A'],
    });
    const result: ValidationResult = validateCrossPhase([planA, planB]);

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test('duplicate provides across two plans returns error', () => {
    const planA = makePlan({ phase: '92', plan: 1, provides: ['shared-artifact'], requires: [] });
    const planB = makePlan({ phase: '92', plan: 2, provides: ['shared-artifact'], requires: [] });
    const result = validateCrossPhase([planA, planB]);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e: string) => e.includes('shared-artifact'))).toBe(true);
    expect(result.errors.some((e: string) => e.includes('multiple plans'))).toBe(true);
  });

  test('unsatisfied requires (no plan provides it) returns error', () => {
    const plan = makePlan({
      phase: '92',
      plan: 1,
      provides: ['artifact-X'],
      requires: ['missing-artifact'],
    });
    const result = validateCrossPhase([plan]);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e: string) => e.includes('missing-artifact'))).toBe(true);
    expect(result.errors.some((e: string) => e.includes('no plan in the set provides it'))).toBe(true);
  });

  test('all plans have empty provides/requires produces warning', () => {
    const planA = makePlan({ phase: '92', plan: 1, provides: [], requires: [] });
    const planB = makePlan({ phase: '92', plan: 2, provides: [], requires: [] });
    const result = validateCrossPhase([planA, planB]);

    expect(result.valid).toBe(true);
    expect(result.warnings.some((w: string) => w.includes('dependency tracking'))).toBe(true);
  });

  test('single plan with no cross-phase issues passes', () => {
    const plan = makePlan({
      phase: '92',
      plan: 1,
      provides: ['only-artifact'],
      requires: [],
    });
    const result = validateCrossPhase([plan]);

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test('empty plans array has no errors but produces dependency tracking warning', () => {
    const result = validateCrossPhase([]);

    expect(result.valid).toBe(true);
    expect(result.warnings.some((w: string) => w.includes('dependency tracking'))).toBe(true);
  });
});

// ─── validateResearchArtifacts ───────────────────────────────────────────────

describe('validateResearchArtifacts', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-invariants-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('non-existent directory passes with no errors (no research artifacts)', () => {
    const result: ValidationResult = validateResearchArtifacts(
      path.join(tmpDir, 'does-not-exist')
    );

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    // Should warn that no research artifacts found
    expect(result.warnings.some((w: string) => w.includes('no research artifacts found'))).toBe(true);
  });

  test('directory with no research files passes with warning', () => {
    const result = validateResearchArtifacts(tmpDir);

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings.some((w: string) => w.includes('no research artifacts found'))).toBe(true);
  });

  test('valid LANDSCAPE.md with table rows passes', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'LANDSCAPE.md'),
      '# Landscape\n\n| Method | Notes |\n| ------ | ----- |\n| GPT-4 | baseline |\n'
    );
    const result = validateResearchArtifacts(tmpDir);

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test('LANDSCAPE.md without table rows returns error', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'LANDSCAPE.md'),
      '# Landscape\n\nNo table here, just prose.\n'
    );
    const result = validateResearchArtifacts(tmpDir);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e: string) => e.includes('LANDSCAPE.md'))).toBe(true);
    expect(result.errors.some((e: string) => e.includes('table rows'))).toBe(true);
  });

  test('RESEARCH.md without ## Method section returns error', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'RESEARCH.md'),
      '# Research\n\n## Tradeoffs\n\nSome tradeoffs here.\n'
    );
    const result = validateResearchArtifacts(tmpDir);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e: string) => e.includes('## Method'))).toBe(true);
  });

  test('RESEARCH.md without ## Tradeoffs section returns error', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'RESEARCH.md'),
      '# Research\n\n## Method\n\nImplementation method here.\n'
    );
    const result = validateResearchArtifacts(tmpDir);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e: string) => e.includes('## Tradeoffs'))).toBe(true);
  });

  test('valid RESEARCH.md with both ## Method and ## Tradeoffs passes', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'RESEARCH.md'),
      '# Research\n\n## Method\n\nImplementation approach.\n\n## Tradeoffs\n\nPros and cons.\n'
    );
    const result = validateResearchArtifacts(tmpDir);

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test('PAPERS.md without structured headings returns error', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'PAPERS.md'),
      'Just a flat list of papers without headings.\n- Paper A\n- Paper B\n'
    );
    const result = validateResearchArtifacts(tmpDir);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e: string) => e.includes('PAPERS.md'))).toBe(true);
    expect(result.errors.some((e: string) => e.includes('headings'))).toBe(true);
  });

  test('valid PAPERS.md with ## headings passes', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'PAPERS.md'),
      '# Papers\n\n## Attention Is All You Need\n\nFoundational transformer paper.\n'
    );
    const result = validateResearchArtifacts(tmpDir);

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test('RESEARCH.md missing both sections reports both errors', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'RESEARCH.md'),
      '# Research\n\nJust prose, no required sections.\n'
    );
    const result = validateResearchArtifacts(tmpDir);

    expect(result.valid).toBe(false);
    const methodError = result.errors.find((e: string) => e.includes('## Method'));
    const tradeoffsError = result.errors.find((e: string) => e.includes('## Tradeoffs'));
    expect(methodError).toBeDefined();
    expect(tradeoffsError).toBeDefined();
  });
});
