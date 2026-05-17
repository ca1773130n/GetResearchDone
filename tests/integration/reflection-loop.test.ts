'use strict';

/**
 * Integration test for the hypothesis/predicted_outcome reflection loop.
 *
 * Live agent dispatch costs tokens, so this is a static-contract test:
 * we read the planner and verifier agent markdown files and assert the
 * instructions and templates that drive the loop are still present. If a
 * later edit weakens the contract (e.g. drops the Reflection section, the
 * verdict enum, or the no-fabrication rule), this test catches it.
 *
 * The reflection loop has three parts under test here:
 *   1. agents/grd-planner.md instructs the LLM to emit top-level
 *      hypothesis: and predicted_outcome: scalars in PLAN.md.
 *   2. agents/grd-verifier.md template includes a ## Reflection section
 *      with the documented 5-row table and verdict enumeration.
 *   3. A synthetic PLAN.md carrying the two scalars round-trips through
 *      extractFrontmatter unchanged.
 */

import * as fs from 'fs';
import * as path from 'path';

const { extractFrontmatter } = require('../../lib/frontmatter') as {
  extractFrontmatter: (content: string) => Record<string, unknown>;
};

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const PLANNER_PATH = path.join(REPO_ROOT, 'agents', 'grd-planner.md');
const VERIFIER_PATH = path.join(REPO_ROOT, 'agents', 'grd-verifier.md');

describe('reflection loop — planner prompt contract', () => {
  let plannerContent: string;

  beforeAll(() => {
    plannerContent = fs.readFileSync(PLANNER_PATH, 'utf-8');
  });

  test('declares hypothesis: as required top-level PLAN.md frontmatter', () => {
    expect(plannerContent).toMatch(/hypothesis:/);
    expect(plannerContent).toMatch(/REQUIRED.*frontmatter|MUST also include/i);
  });

  test('declares predicted_outcome: as required top-level PLAN.md frontmatter', () => {
    expect(plannerContent).toMatch(/predicted_outcome:/);
  });

  test('describes hypothesis as a claim, not a task', () => {
    // Prevents future edits from collapsing hypothesis into "the thing to do"
    expect(plannerContent).toMatch(/hypothesis.*claim|claim.*hypothesis/i);
    expect(plannerContent).toMatch(/not the \*task\*|not a task/i);
  });

  test('describes predicted_outcome as observable/checkable', () => {
    expect(plannerContent).toMatch(/observable|checkable/i);
  });

  // ─── Tier-1 #4: planner reads prior_reflections ───────────────────────
  test('documents the prior_reflections context field (Tier-1 #4)', () => {
    expect(plannerContent).toMatch(/<prior_reflections>/);
    expect(plannerContent).toMatch(/<\/prior_reflections>/);
    expect(plannerContent).toMatch(/prior_reflections.*array|init JSON.*prior_reflections/i);
  });

  test('instructs planner to act on each verdict kind', () => {
    const idx = plannerContent.indexOf('<prior_reflections>');
    const section = plannerContent.slice(idx);
    // Must give explicit guidance for each verdict
    expect(section).toMatch(/confirmed/);
    expect(section).toMatch(/partial/);
    expect(section).toMatch(/falsified/);
    expect(section).toMatch(/unknown/);
    // And forbid the common failure mode (just summarise into <context>)
    expect(section).toMatch(/[Dd]o not just summari[sz]e|constrain the new hypothesis/);
  });

  test('handles empty prior_reflections gracefully', () => {
    const idx = plannerContent.indexOf('<prior_reflections>');
    const section = plannerContent.slice(idx);
    expect(section).toMatch(/empty.*expected|proceed normally/i);
  });
});

describe('reflection loop — verifier prompt contract', () => {
  let verifierContent: string;

  beforeAll(() => {
    verifierContent = fs.readFileSync(VERIFIER_PATH, 'utf-8');
  });

  test('VERIFICATION.md template includes a ## Reflection section', () => {
    expect(verifierContent).toMatch(/## Reflection/);
  });

  test('Reflection section reads scalars from PLAN.md', () => {
    const idx = verifierContent.indexOf('## Reflection');
    const section = verifierContent.slice(idx);
    expect(section).toMatch(/hypothesis:.*PLAN\.md|PLAN\.md.*hypothesis:/);
    expect(section).toMatch(/predicted_outcome:.*PLAN\.md|PLAN\.md.*predicted_outcome:/);
  });

  test('Reflection section enumerates all four verdict values', () => {
    const idx = verifierContent.indexOf('## Reflection');
    const section = verifierContent.slice(idx);
    expect(section).toMatch(/confirmed/);
    expect(section).toMatch(/partial/);
    expect(section).toMatch(/falsified/);
    expect(section).toMatch(/unknown/);
  });

  test('Reflection table has the documented five-row structure', () => {
    const idx = verifierContent.indexOf('## Reflection');
    const section = verifierContent.slice(idx);
    expect(section).toMatch(/\| hypothesis \|/);
    expect(section).toMatch(/\| predicted_outcome \|/);
    expect(section).toMatch(/\| actual_outcome \|/);
    expect(section).toMatch(/\| verdict \|/);
    expect(section).toMatch(/\| evidence \|/);
  });

  test('has fallback rule: missing scalars → verdict: unknown, no fabrication', () => {
    const idx = verifierContent.indexOf('## Reflection');
    const section = verifierContent.slice(idx);
    expect(section).toMatch(/missing.*scalar|missing.*required/i);
    expect(section).toMatch(/verdict: unknown/);
    expect(section).toMatch(/do not\s+fabricate|not\s+fabricate/i);
  });
});

describe('reflection loop — synthetic PLAN.md round-trip', () => {
  test('extractFrontmatter exposes hypothesis and predicted_outcome scalars', () => {
    // This is what the verifier will receive when it reads the PLAN.md
    // emitted by a compliant planner.
    const planMd = [
      '---',
      'phase: 02-build',
      'plan: 01',
      'wave: a',
      'hypothesis: "Adding mechanical wrapper reduces verifier false positives"',
      'predicted_outcome: "Mechanical verification reports pass/fail counts before semantic review"',
      '---',
      '',
      '# Plan body',
      '',
    ].join('\n');

    const fm = extractFrontmatter(planMd);
    expect(fm.hypothesis).toBe(
      'Adding mechanical wrapper reduces verifier false positives'
    );
    expect(fm.predicted_outcome).toBe(
      'Mechanical verification reports pass/fail counts before semantic review'
    );
  });

  test('extractFrontmatter tolerates unquoted scalars too', () => {
    // Planner prompt says to quote when value contains : # or leading -, but
    // simple values can be unquoted. The verifier must still see them.
    const planMd = [
      '---',
      'phase: 02-build',
      'plan: 01',
      'wave: a',
      'hypothesis: Adding mechanical wrapper reduces verifier false positives',
      'predicted_outcome: Mechanical verification reports pass/fail counts before semantic review',
      '---',
      '',
    ].join('\n');

    const fm = extractFrontmatter(planMd);
    expect(fm.hypothesis).toBe(
      'Adding mechanical wrapper reduces verifier false positives'
    );
    expect(fm.predicted_outcome).toBe(
      'Mechanical verification reports pass/fail counts before semantic review'
    );
  });
});
