'use strict';
const fs = require('fs');
const path = require('path');

/**
 * An init key that no command reads is a value computed, typed, serialized and dropped.
 *
 * This has happened repeatedly. `knowhow_block` was emitted by cmdInitPlanPhase and
 * cmdInitExecutePhase and consumed by nothing, so mined knowledge never reached a prompt —
 * while `.planning/.../99-VERIFICATION.md` recorded the injection loop as PASSED on the
 * strength of `grep -c buildKnowledgeInjectionBlock lib/autopilot.ts`. Grepping for the
 * function proves it is called. It does not prove the string reaches a prompt.
 *
 * commands/plan-phase.md already carries a comment recording the same lesson for
 * dead_ends_md, genome_md and prior_reflections. This test is that comment, enforced.
 */
const ROOT = path.join(__dirname, '..', '..');
const CONTEXT_DIR = path.join(ROOT, 'lib', 'context');
const COMMANDS_DIR = path.join(ROOT, 'commands');

/** Keys whose whole purpose is to be spliced into an agent prompt. */
const PROMPT_KEY = /^[a-z0-9_]+_(block|md|reflections)$/;

function emittedKeys(): string[] {
  const keys = new Set<string>();
  for (const f of fs.readdirSync(CONTEXT_DIR).filter((n: string) => n.endsWith('.ts'))) {
    const src = fs.readFileSync(path.join(CONTEXT_DIR, f), 'utf-8');
    // Both emission shapes: `foo_block:` in an object literal, and `result.foo_block =`.
    // Match the key by NAME rather than by the expression that follows it — the value may
    // be an IIFE, a helper call, or a literal, and narrowing on the RHS is how this scan
    // silently finds nothing.
    for (const m of src.matchAll(/^\s*([a-z0-9_]+_(?:block|md|reflections))\s*:/gm)) keys.add(m[1]);
    for (const m of src.matchAll(/\bresult\.([a-z0-9_]+_(?:block|md|reflections))\s*=/g)) keys.add(m[1]);
  }
  return [...keys].filter((k) => PROMPT_KEY.test(k)).sort();
}

function commandCorpus(): string {
  return fs.readdirSync(COMMANDS_DIR)
    .filter((n: string) => n.endsWith('.md'))
    .map((n: string) => fs.readFileSync(path.join(COMMANDS_DIR, n), 'utf-8'))
    .join('\n');
}

describe('every prompt-bound init key is actually consumed by a command', () => {
  const keys = emittedKeys();
  const corpus = commandCorpus();

  it('found prompt-bound keys to check (guards a vacuous pass)', () => {
    // Without this, a regex that matches nothing makes the suite below pass by finding
    // no keys at all — the exact shape of failure this file exists to catch.
    expect(keys.length).toBeGreaterThanOrEqual(3);
    expect(keys).toContain('knowhow_block');
  });

  for (const key of keys) {
    it(`${key} is interpolated into at least one command prompt`, () => {
      const interpolated = corpus.includes(`{${key}}`) || corpus.includes(`\${${key}`);
      expect(interpolated).toBe(true);
    });
  }
});
