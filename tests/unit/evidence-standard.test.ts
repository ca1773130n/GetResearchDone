'use strict';
const fs = require('fs');
const path = require('path');

/**
 * The evidence standard is duplicated verbatim into two agent definitions.
 *
 * That is deliberate, and it is not the antipattern it looks like. `@` includes do NOT
 * resolve across Task() boundaries — commands/plan-phase.md states this outright — and
 * agents are Task-spawned, so an `@${CLAUDE_PLUGIN_ROOT}/references/...` line inside an
 * agent definition reaches the subagent as literal text rather than as the file it names.
 * Including it would ship a dead pointer wearing the shape of a shared source.
 *
 * Duplication whose drift is impossible is not duplication debt. This test is what makes
 * it impossible: change the canonical copy and the build fails until the others follow.
 */
const ROOT = path.join(__dirname, '..', '..');
const CANONICAL = path.join(ROOT, 'references', 'verification-patterns.md');
const CONSUMERS = [
  path.join(ROOT, 'agents', 'grd-verifier.md'),
  path.join(ROOT, 'agents', 'grd-code-reviewer.md'),
];

function extract(file: string): string | null {
  const m = /<evidence_standard>\n([\s\S]*?)\n<\/evidence_standard>/.exec(fs.readFileSync(file, 'utf-8'));
  return m ? m[1] : null;
}

describe('evidence standard stays byte-identical across its copies (W4)', () => {
  const canonical = extract(CANONICAL);

  it('the canonical copy exists and is substantial', () => {
    expect(canonical).not.toBeNull();
    // Guards the failure mode where a bad regex "passes" by matching an empty block.
    expect((canonical as string).length).toBeGreaterThan(500);
    expect(canonical).toContain('Banned phrasings');
    expect(canonical).toContain('If a check did not produce a line');
  });

  for (const consumer of CONSUMERS) {
    const name = path.relative(ROOT, consumer);
    it(`${name} carries a byte-identical copy`, () => {
      const got = extract(consumer);
      expect(got).not.toBeNull();
      expect(got).toBe(canonical);
    });
  }

  it('no agent tries to @-include it instead — that would not resolve', () => {
    for (const consumer of CONSUMERS) {
      const src = fs.readFileSync(consumer, 'utf-8');
      expect(src).not.toMatch(/@\$\{CLAUDE_PLUGIN_ROOT\}\/references\/verification-patterns\.md/);
    }
  });
});

describe('the code reviewer can say it did not check (W4)', () => {
  const reviewer = fs.readFileSync(path.join(ROOT, 'agents', 'grd-code-reviewer.md'), 'utf-8');

  it('defines UNVERIFIED as a severity', () => {
    expect(reviewer).toMatch(/\*\*UNVERIFIED\*\*/);
    expect(reviewer).toContain('did not run, or produced no line you can quote');
  });

  it('no REVIEW.md default asserts a conclusion the check may not have produced', () => {
    // These read as a pass when the check never ran, which is the defect W4 fixes.
    expect(reviewer).not.toContain('{findings or "Adequate."}');
    expect(reviewer).not.toContain('{findings or "SUMMARY.md matches git history."}');
    expect(reviewer).not.toContain('{findings or "Consistent with existing patterns."}');
  });

  it('the findings table carries an Evidence column', () => {
    expect(reviewer).toMatch(/\|\s*#\s*\|\s*Severity\s*\|\s*Stage\s*\|\s*Area\s*\|\s*Description\s*\|\s*Evidence\s*\|/);
  });

  it('keeps the artifact_exclusions step, which kills a real false-positive class', () => {
    expect(reviewer).toContain('<step name="artifact_exclusions"');
    expect(reviewer).toContain('Missing VERIFICATION.md is NEVER a blocker or warning.');
  });
});
