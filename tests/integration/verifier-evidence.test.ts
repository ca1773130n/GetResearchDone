'use strict';

/**
 * Prompt-contract test for the verifier's Evidence Standard.
 *
 * Tier-1 item #2 of the Ouroboros integration proposal: strengthen
 * `agents/grd-verifier.md`'s required output before considering
 * multi-model consensus. The Evidence Standard defines what counts as
 * valid evidence, bans vague phrasings, and requires verbatim command
 * output. This test locks the contract so future edits cannot quietly
 * weaken it.
 *
 * Like tests/integration/reflection-loop.test.ts, this is a static
 * markdown-scan test. No live agent dispatch.
 */

import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const VERIFIER_PATH = path.join(REPO_ROOT, 'agents', 'grd-verifier.md');

describe('verifier prompt — Evidence Standard contract', () => {
  let verifierContent: string;
  let evidenceSection: string;

  beforeAll(() => {
    verifierContent = fs.readFileSync(VERIFIER_PATH, 'utf-8');
    const startTag = '<evidence_standard>';
    const endTag = '</evidence_standard>';
    const start = verifierContent.indexOf(startTag);
    const end = verifierContent.indexOf(endTag);
    if (start === -1 || end === -1 || end < start) {
      throw new Error('evidence_standard section markers missing or misordered');
    }
    evidenceSection = verifierContent.slice(start, end + endTag.length);
  });

  test('section is delimited by <evidence_standard> / </evidence_standard>', () => {
    // beforeAll throws if delimiters are missing; this test documents intent
    expect(evidenceSection).toMatch(/<evidence_standard>/);
    expect(evidenceSection).toMatch(/<\/evidence_standard>/);
  });

  test('enumerates exactly the four valid evidence kinds', () => {
    expect(evidenceSection).toMatch(/\*\*file:line\*\*/);
    expect(evidenceSection).toMatch(/\*\*command output\*\*/);
    expect(evidenceSection).toMatch(/\*\*metric value\*\*/);
    expect(evidenceSection).toMatch(/\*\*deferred\*\*/);
  });

  test('lists banned phrasings explicitly', () => {
    expect(evidenceSection).toMatch(/[Bb]anned phrasings/);
    // Sample from the banned list — locks the actual phrasings, not just the heading
    expect(evidenceSection).toMatch(/looks good/);
    expect(evidenceSection).toMatch(/seems fine/);
    expect(evidenceSection).toMatch(/should work/);
    expect(evidenceSection).toMatch(/paraphrased command output/);
  });

  test('requires verbatim command output (no paraphrase)', () => {
    expect(evidenceSection).toMatch(/[Vv]erbatim rule/);
    expect(evidenceSection).toMatch(/copy-paste/);
    expect(evidenceSection).toMatch(/do not invent|not invent/i);
  });

  test('enforces one-kind-per-cell', () => {
    expect(evidenceSection).toMatch(/[Oo]ne-kind-per-cell/);
  });

  test('applies to all evidence-bearing surfaces (cells, gaps, Reflection)', () => {
    // The Standard must explicitly cover the surfaces a verifier touches,
    // otherwise authors will assume it is scoped only to one table.
    expect(evidenceSection).toMatch(/Evidence.*cell|Evidence cell/i);
    expect(evidenceSection).toMatch(/[Gg]ap/);
    expect(evidenceSection).toMatch(/[Rr]eflection/);
  });

  test('success criteria checklist references the Evidence Standard', () => {
    // The standard exists upstream; this proves it is also enforced
    // downstream as a final-pass check.
    const idx = verifierContent.indexOf('<success_criteria>');
    const successBlock = verifierContent.slice(idx);
    expect(successBlock).toMatch(/Evidence Standard/);
  });

  test('placed before tiered_verification so it scopes everything that follows', () => {
    const evidenceIdx = verifierContent.indexOf('<evidence_standard>');
    const tieredIdx = verifierContent.indexOf('<tiered_verification>');
    expect(evidenceIdx).toBeGreaterThan(0);
    expect(tieredIdx).toBeGreaterThan(evidenceIdx);
  });
});
