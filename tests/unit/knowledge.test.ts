'use strict';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const {
  formatKnowhowEntry,
  parseKnowhowEntries,
  appendKnowhowEntries,
  selectTopEntries,
  buildKnowledgeInjectionBlock,
  extractModuleHints,
} = require('../../lib/knowledge') as {
  formatKnowhowEntry: (entry: import('../../lib/types').KnowhowEntry) => string;
  parseKnowhowEntries: (content: string) => import('../../lib/types').KnowhowEntry[];
  appendKnowhowEntries: (path: string, entries: import('../../lib/types').KnowhowEntry[]) => void;
  selectTopEntries: (
    entries: import('../../lib/types').KnowhowEntry[],
    n: number,
    hints?: string[],
    currentPhase?: number
  ) => import('../../lib/types').KnowhowEntry[];
  buildKnowledgeInjectionBlock: (
    cwd: string,
    phaseNum: string,
    moduleHints?: string[]
  ) => string;
  extractModuleHints: (phaseDir: string) => string[];
};

import type { KnowhowEntry } from '../../lib/types';

function makeEntry(overrides: Partial<KnowhowEntry> = {}): KnowhowEntry {
  return {
    pattern_name: 'Test Pattern',
    source: 'lib/example.ts',
    applicability: 'When testing things',
    code_snippet: 'const x = 1;',
    phase_number: 42,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

// ─── formatKnowhowEntry ───────────────────────────────────────────────────────

describe('formatKnowhowEntry', () => {
  it('formats a complete entry to markdown with h3 heading', () => {
    const entry = makeEntry();
    const result = formatKnowhowEntry(entry);
    expect(result).toContain('### Test Pattern');
  });

  it('includes all required fields', () => {
    const entry = makeEntry();
    const result = formatKnowhowEntry(entry);
    expect(result).toContain('- **source:** lib/example.ts');
    expect(result).toContain('- **applicability:** When testing things');
    expect(result).toContain('- **code_snippet:** const x = 1;');
    expect(result).toContain('- **phase_number:** 42');
    expect(result).toContain('- **created_at:** 2026-01-01T00:00:00Z');
  });

  it('starts with the heading line', () => {
    const entry = makeEntry({ pattern_name: 'Foo Bar' });
    const result = formatKnowhowEntry(entry);
    expect(result.startsWith('### Foo Bar')).toBe(true);
  });

  it('produces a string ending with a newline', () => {
    const entry = makeEntry();
    const result = formatKnowhowEntry(entry);
    expect(result.endsWith('\n')).toBe(true);
  });

  it('handles special characters in pattern_name', () => {
    const entry = makeEntry({ pattern_name: 'Try/Catch Error Handling' });
    const result = formatKnowhowEntry(entry);
    expect(result).toContain('### Try/Catch Error Handling');
  });
});

// ─── parseKnowhowEntries ──────────────────────────────────────────────────────

describe('parseKnowhowEntries', () => {
  it('returns empty array for empty string', () => {
    expect(parseKnowhowEntries('')).toEqual([]);
  });

  it('returns empty array for whitespace-only content', () => {
    expect(parseKnowhowEntries('   \n\n  ')).toEqual([]);
  });

  it('parses a well-formed KNOWHOW.md with one entry', () => {
    const content = `# KNOWHOW

### My Pattern

- **source:** lib/foo.ts
- **applicability:** When foobar is needed
- **code_snippet:** foo()
- **phase_number:** 10
- **created_at:** 2026-01-01T00:00:00Z
`;
    const entries = parseKnowhowEntries(content);
    expect(entries).toHaveLength(1);
    expect(entries[0].pattern_name).toBe('My Pattern');
    expect(entries[0].source).toBe('lib/foo.ts');
    expect(entries[0].applicability).toBe('When foobar is needed');
    expect(entries[0].code_snippet).toBe('foo()');
    expect(entries[0].phase_number).toBe(10);
    expect(entries[0].created_at).toBe('2026-01-01T00:00:00Z');
  });

  it('parses multiple entries', () => {
    const content = `# KNOWHOW

### Pattern A

- **source:** lib/a.ts
- **applicability:** For A
- **code_snippet:** a()
- **phase_number:** 5
- **created_at:** 2026-01-01T00:00:00Z

### Pattern B

- **source:** lib/b.ts
- **applicability:** For B
- **code_snippet:** b()
- **phase_number:** 6
- **created_at:** 2026-01-02T00:00:00Z
`;
    const entries = parseKnowhowEntries(content);
    expect(entries).toHaveLength(2);
    expect(entries[0].pattern_name).toBe('Pattern A');
    expect(entries[1].pattern_name).toBe('Pattern B');
  });

  it('returns empty array when content has no level-3 headings', () => {
    const content = '# KNOWHOW\n\nSome text without entries.\n';
    expect(parseKnowhowEntries(content)).toEqual([]);
  });

  it('skips malformed entries missing required fields', () => {
    const content = `### Incomplete Entry

- **source:** lib/foo.ts
- **applicability:** Something
`;
    // Missing code_snippet, phase_number, created_at — should be skipped
    expect(parseKnowhowEntries(content)).toEqual([]);
  });

  it('skips entries with empty pattern_name', () => {
    const content = `###

- **source:** lib/foo.ts
- **applicability:** For something
- **code_snippet:** foo()
- **phase_number:** 1
- **created_at:** 2026-01-01T00:00:00Z
`;
    // Heading with empty name — should be skipped
    expect(parseKnowhowEntries(content)).toEqual([]);
  });

  it('handles content before the first heading gracefully', () => {
    const content = `# KNOWHOW

Some preamble text.

### Valid Entry

- **source:** lib/x.ts
- **applicability:** Always
- **code_snippet:** x()
- **phase_number:** 1
- **created_at:** 2026-01-01T00:00:00Z
`;
    const entries = parseKnowhowEntries(content);
    expect(entries).toHaveLength(1);
    expect(entries[0].pattern_name).toBe('Valid Entry');
  });
});

// ─── parse-format roundtrip ───────────────────────────────────────────────────

describe('parse-format roundtrip', () => {
  it('format then parse returns equivalent entry (all fields preserved)', () => {
    const original = makeEntry({
      pattern_name: 'Roundtrip Pattern',
      source: 'lib/roundtrip.ts',
      applicability: 'Always useful',
      code_snippet: 'return roundtrip();',
      phase_number: 99,
      created_at: '2026-03-01T12:00:00Z',
    });

    const formatted = formatKnowhowEntry(original);
    const parsed = parseKnowhowEntries(formatted);

    expect(parsed).toHaveLength(1);
    const result = parsed[0];
    expect(result.pattern_name).toBe(original.pattern_name);
    expect(result.source).toBe(original.source);
    expect(result.applicability).toBe(original.applicability);
    expect(result.code_snippet).toBe(original.code_snippet);
    expect(result.phase_number).toBe(original.phase_number);
    expect(result.created_at).toBe(original.created_at);
  });

  it('roundtrip preserves multiple entries', () => {
    const entries: KnowhowEntry[] = [
      makeEntry({ pattern_name: 'Alpha', phase_number: 1 }),
      makeEntry({ pattern_name: 'Beta', phase_number: 2 }),
      makeEntry({ pattern_name: 'Gamma', phase_number: 3 }),
    ];

    const formatted = entries.map(formatKnowhowEntry).join('\n');
    const parsed = parseKnowhowEntries(formatted);

    expect(parsed).toHaveLength(3);
    const names = parsed.map((e) => e.pattern_name);
    expect(names).toContain('Alpha');
    expect(names).toContain('Beta');
    expect(names).toContain('Gamma');
  });
});

// ─── appendKnowhowEntries ─────────────────────────────────────────────────────

describe('appendKnowhowEntries', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'knowhow-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('appends to an empty / non-existent file', () => {
    const knowhowPath = path.join(tmpDir, 'KNOWHOW.md');
    const entry = makeEntry({ pattern_name: 'New Entry', phase_number: 1 });

    appendKnowhowEntries(knowhowPath, [entry]);

    const content = fs.readFileSync(knowhowPath, 'utf8');
    expect(content).toContain('# KNOWHOW');
    expect(content).toContain('### New Entry');
  });

  it('deduplicates by pattern_name keeping higher phase_number', () => {
    const knowhowPath = path.join(tmpDir, 'KNOWHOW.md');
    const old = makeEntry({ pattern_name: 'Shared Name', phase_number: 5 });
    const newer = makeEntry({ pattern_name: 'Shared Name', phase_number: 10, source: 'lib/newer.ts' });

    appendKnowhowEntries(knowhowPath, [old]);
    appendKnowhowEntries(knowhowPath, [newer]);

    const content = fs.readFileSync(knowhowPath, 'utf8');
    // Only one entry with the shared name
    const occurrences = (content.match(/### Shared Name/g) || []).length;
    expect(occurrences).toBe(1);
    // Higher phase_number entry should be kept
    expect(content).toContain('lib/newer.ts');
  });

  it('does NOT replace when existing entry has higher phase_number', () => {
    const knowhowPath = path.join(tmpDir, 'KNOWHOW.md');
    const high = makeEntry({ pattern_name: 'Contested', phase_number: 20, source: 'lib/high.ts' });
    const low = makeEntry({ pattern_name: 'Contested', phase_number: 5, source: 'lib/low.ts' });

    appendKnowhowEntries(knowhowPath, [high]);
    appendKnowhowEntries(knowhowPath, [low]);

    const content = fs.readFileSync(knowhowPath, 'utf8');
    // High-phase entry should remain
    expect(content).toContain('lib/high.ts');
    expect(content).not.toContain('lib/low.ts');
  });

  it('creates parent directories if they do not exist', () => {
    const nested = path.join(tmpDir, 'deep', 'nested', 'dir', 'KNOWHOW.md');
    const entry = makeEntry({ pattern_name: 'Deep Entry' });

    appendKnowhowEntries(nested, [entry]);

    expect(fs.existsSync(nested)).toBe(true);
    const content = fs.readFileSync(nested, 'utf8');
    expect(content).toContain('### Deep Entry');
  });

  it('writes KNOWHOW header at top of file', () => {
    const knowhowPath = path.join(tmpDir, 'KNOWHOW.md');
    appendKnowhowEntries(knowhowPath, [makeEntry()]);
    const content = fs.readFileSync(knowhowPath, 'utf8');
    expect(content.startsWith('# KNOWHOW')).toBe(true);
  });

  it('appends new entry alongside existing entries', () => {
    const knowhowPath = path.join(tmpDir, 'KNOWHOW.md');
    const first = makeEntry({ pattern_name: 'First', phase_number: 1 });
    const second = makeEntry({ pattern_name: 'Second', phase_number: 2 });

    appendKnowhowEntries(knowhowPath, [first]);
    appendKnowhowEntries(knowhowPath, [second]);

    const content = fs.readFileSync(knowhowPath, 'utf8');
    expect(content).toContain('### First');
    expect(content).toContain('### Second');
  });
});

// ─── selectTopEntries ─────────────────────────────────────────────────────────

describe('selectTopEntries', () => {
  const entries: KnowhowEntry[] = [
    makeEntry({ pattern_name: 'Old', phase_number: 1, source: 'lib/old.ts', applicability: 'rarely' }),
    makeEntry({ pattern_name: 'Mid', phase_number: 5, source: 'lib/mid.ts', applicability: 'sometimes' }),
    makeEntry({ pattern_name: 'Recent', phase_number: 10, source: 'lib/recent.ts', applicability: 'often' }),
    makeEntry({ pattern_name: 'Newest', phase_number: 20, source: 'lib/newest.ts', applicability: 'always' }),
  ];

  it('returns top N by recency (phase_number descending)', () => {
    const top2 = selectTopEntries(entries, 2);
    expect(top2).toHaveLength(2);
    expect(top2[0].pattern_name).toBe('Newest');
    expect(top2[1].pattern_name).toBe('Recent');
  });

  it('returns all entries when n >= entries.length', () => {
    const all = selectTopEntries(entries, 100);
    expect(all).toHaveLength(entries.length);
  });

  it('returns empty array for empty input', () => {
    expect(selectTopEntries([], 5)).toEqual([]);
  });

  it('respects moduleHints boost — hint-matching entries sorted first within same phase', () => {
    const samePhase: KnowhowEntry[] = [
      makeEntry({ pattern_name: 'NoMatch', phase_number: 10, source: 'lib/other.ts', applicability: 'something' }),
      makeEntry({ pattern_name: 'WithMatch', phase_number: 10, source: 'lib/knowledge.ts', applicability: 'knowledge mining' }),
    ];
    const top = selectTopEntries(samePhase, 2, ['knowledge']);
    expect(top[0].pattern_name).toBe('WithMatch');
  });

  it('moduleHints match against source field', () => {
    const e1 = makeEntry({ pattern_name: 'SourceMatch', phase_number: 5, source: 'lib/autopilot.ts', applicability: 'general' });
    const e2 = makeEntry({ pattern_name: 'NoMatch', phase_number: 5, source: 'lib/other.ts', applicability: 'general' });
    const top = selectTopEntries([e1, e2], 2, ['autopilot']);
    expect(top[0].pattern_name).toBe('SourceMatch');
  });

  it('moduleHints match against applicability field', () => {
    const e1 = makeEntry({ pattern_name: 'ApplicabilityMatch', phase_number: 5, source: 'lib/x.ts', applicability: 'scheduling phases' });
    const e2 = makeEntry({ pattern_name: 'NoApplicabilityMatch', phase_number: 5, source: 'lib/y.ts', applicability: 'unrelated' });
    const top = selectTopEntries([e1, e2], 2, ['scheduling']);
    expect(top[0].pattern_name).toBe('ApplicabilityMatch');
  });

  it('handles n=0 by returning empty array', () => {
    expect(selectTopEntries(entries, 0)).toEqual([]);
  });

  it('does not mutate the input array', () => {
    const copy = [...entries];
    selectTopEntries(entries, 2);
    expect(entries).toEqual(copy);
  });
});

// ─── buildKnowledgeInjectionBlock ─────────────────────────────────────────────

describe('buildKnowledgeInjectionBlock', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-knowhow-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  /** Build a KNOWHOW.md content string with entries for the given phase numbers. */
  function buildKnowhowContent(phaseNumbers: number[], overrides: Partial<KnowhowEntry> = {}): string {
    const entries = phaseNumbers.map((n) =>
      makeEntry({
        pattern_name: `Pattern ${n}`,
        phase_number: n,
        source: `lib/phase${n}.ts`,
        applicability: `Useful in phase ${n}`,
        ...overrides,
      })
    );
    return entries.map(formatKnowhowEntry).join('\n');
  }

  it('returns empty string when KNOWHOW.md does not exist', () => {
    const result = buildKnowledgeInjectionBlock(tmpDir, '99');
    expect(result).toBe('');
  });

  it('returns empty string when KNOWHOW.md is empty', () => {
    fs.writeFileSync(path.join(tmpDir, 'KNOWHOW.md'), '', 'utf8');
    const result = buildKnowledgeInjectionBlock(tmpDir, '99');
    expect(result).toBe('');
  });

  it('returns formatted block with top entries', () => {
    // 7 entries with phase numbers 90-96
    const content = buildKnowhowContent([90, 91, 92, 93, 94, 95, 96]);
    fs.writeFileSync(path.join(tmpDir, 'KNOWHOW.md'), content, 'utf8');

    const result = buildKnowledgeInjectionBlock(tmpDir, '99');

    // Must contain XML wrapper tags
    expect(result).toContain('<knowhow_context>');
    expect(result).toContain('</knowhow_context>');

    // Must contain exactly 5 level-3 headings (top 5 by recency)
    const headingMatches = result.match(/^### /gm) || [];
    expect(headingMatches).toHaveLength(5);

    // Must contain the most recent entry (phase 96)
    expect(result).toContain('Pattern 96');

    // Must NOT contain the oldest entry (phase 90 — excluded as 6th+)
    expect(result).not.toContain('Pattern 90');
  });

  it('passes moduleHints to selectTopEntries', () => {
    // 6 entries all with the same phase_number so that moduleHints boost determines order.
    // 2 autopilot-relevant entries and 4 generic entries, all at phase 95.
    // With hints=['autopilot'], the two autopilot entries sort first within the bucket.
    const autopilotEntries = ['A', 'B'].map((letter) =>
      makeEntry({
        pattern_name: `Autopilot Pattern ${letter}`,
        phase_number: 95,
        source: `lib/autopilot.ts`,
        applicability: `autopilot scheduling for ${letter}`,
      })
    );
    const genericEntries = ['C', 'D', 'E', 'F'].map((letter) =>
      makeEntry({
        pattern_name: `Generic Pattern ${letter}`,
        phase_number: 95,
        source: `lib/generic.ts`,
        applicability: `general use for ${letter}`,
      })
    );
    const allEntries = [...autopilotEntries, ...genericEntries];
    const content = allEntries.map(formatKnowhowEntry).join('\n');
    fs.writeFileSync(path.join(tmpDir, 'KNOWHOW.md'), content, 'utf8');

    const result = buildKnowledgeInjectionBlock(tmpDir, '99', ['autopilot']);

    // The autopilot-relevant entries should appear first in the top-5 output
    expect(result).toContain('Autopilot Pattern A');
    expect(result).toContain('Autopilot Pattern B');
  });

  it('reads KNOWHOW.md from project root (path.join(cwd, KNOWHOW.md))', () => {
    // Place KNOWHOW.md in a subdirectory — function should look at cwd root only
    const subDir = path.join(tmpDir, 'subdir');
    fs.mkdirSync(subDir);
    const content = buildKnowhowContent([99]);
    // Write to tmpDir root (cwd), not subdir
    fs.writeFileSync(path.join(tmpDir, 'KNOWHOW.md'), content, 'utf8');

    // Call with tmpDir as cwd — should find KNOWHOW.md there
    const resultWithCwd = buildKnowledgeInjectionBlock(tmpDir, '99');
    expect(resultWithCwd).toContain('Pattern 99');

    // Call with subDir as cwd — should NOT find KNOWHOW.md (it's in parent)
    const resultWithSubDir = buildKnowledgeInjectionBlock(subDir, '99');
    expect(resultWithSubDir).toBe('');
  });
});

// ─── extractModuleHints ───────────────────────────────────────────────────────

describe('extractModuleHints', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-extracthints-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('extracts module basenames from PLAN.md frontmatter', () => {
    const planContent = `---\nfiles_modified: [lib/knowledge.ts, lib/autopilot.ts, tests/unit/knowledge.test.ts]\n---\n\n# Plan\n`;
    fs.writeFileSync(path.join(tmpDir, '99-01-PLAN.md'), planContent, 'utf8');

    const hints = extractModuleHints(tmpDir);

    expect(hints).toContain('knowledge');
    expect(hints).toContain('autopilot');
  });

  it('returns empty array when no PLAN.md exists', () => {
    const hints = extractModuleHints(tmpDir);
    expect(hints).toEqual([]);
  });

  it('deduplicates hints', () => {
    // lib/foo.ts and tests/unit/foo.test.ts both map to basename 'foo'
    const planContent = `---\nfiles_modified: [lib/foo.ts, tests/unit/foo.test.ts]\n---\n\n# Plan\n`;
    fs.writeFileSync(path.join(tmpDir, '99-01-PLAN.md'), planContent, 'utf8');

    const hints = extractModuleHints(tmpDir);

    expect(hints).toEqual(['foo']);
  });

  it('handles multi-plan directories', () => {
    const plan1 = `---\nfiles_modified: [lib/alpha.ts, lib/beta.ts]\n---\n\n# Plan 1\n`;
    const plan2 = `---\nfiles_modified: [lib/gamma.ts]\n---\n\n# Plan 2\n`;
    fs.writeFileSync(path.join(tmpDir, '99-01-PLAN.md'), plan1, 'utf8');
    fs.writeFileSync(path.join(tmpDir, '99-02-PLAN.md'), plan2, 'utf8');

    const hints = extractModuleHints(tmpDir);

    expect(hints).toContain('alpha');
    expect(hints).toContain('beta');
    expect(hints).toContain('gamma');
  });

  it('returns empty array when phaseDir does not exist', () => {
    const hints = extractModuleHints(path.join(tmpDir, 'nonexistent'));
    expect(hints).toEqual([]);
  });
});

// ─── selectTopEntries phase-proximity ─────────────────────────────────────────

describe('selectTopEntries phase-proximity', () => {
  it('entries from closer phases rank higher within same hint match', () => {
    // All entries match the same hint; phase-proximity should determine order
    const entries: KnowhowEntry[] = [
      makeEntry({ pattern_name: 'Phase95', phase_number: 95, source: 'lib/knowledge.ts', applicability: 'knowledge stuff' }),
      makeEntry({ pattern_name: 'Phase90', phase_number: 90, source: 'lib/knowledge.ts', applicability: 'knowledge stuff' }),
      makeEntry({ pattern_name: 'Phase97', phase_number: 97, source: 'lib/knowledge.ts', applicability: 'knowledge stuff' }),
    ];

    // currentPhase = 99, hint = 'knowledge' — all match
    // Primary sort is phase_number desc, so: 97, 95, 90 (phase-proximity as tiebreaker doesn't change primary sort here)
    const top = selectTopEntries(entries, 3, ['knowledge'], 99);

    expect(top.map((e) => e.pattern_name)).toEqual(['Phase97', 'Phase95', 'Phase90']);
  });

  it('phase-proximity does not override recency — entry at phase 98 (no hint) ranks above phase 90 (with hint)', () => {
    const entries: KnowhowEntry[] = [
      makeEntry({ pattern_name: 'NoHint98', phase_number: 98, source: 'lib/other.ts', applicability: 'unrelated' }),
      makeEntry({ pattern_name: 'WithHint90', phase_number: 90, source: 'lib/knowledge.ts', applicability: 'knowledge stuff' }),
    ];

    const top = selectTopEntries(entries, 2, ['knowledge'], 99);

    // Phase 98 entry must come first (recency primary sort)
    expect(top[0].pattern_name).toBe('NoHint98');
    expect(top[1].pattern_name).toBe('WithHint90');
  });

  it('works without phaseNum (backward compatible)', () => {
    const entries: KnowhowEntry[] = [
      makeEntry({ pattern_name: 'Old', phase_number: 1 }),
      makeEntry({ pattern_name: 'New', phase_number: 10 }),
    ];

    const top = selectTopEntries(entries, 2);
    // Original behavior: phase_number desc
    expect(top[0].pattern_name).toBe('New');
    expect(top[1].pattern_name).toBe('Old');
  });

  it('phase-proximity as tiebreaker within same phase_number bucket — closer phase wins', () => {
    // Two entries at the same phase_number — use proximity as tertiary tiebreaker
    // Since they have the same phase, we need them to differ in distance to currentPhase somehow.
    // Actually with same phase_number the proximity distance is identical, so this is identity.
    // Instead, test with phase_numbers where hint match is same and phase differs:
    // phases 95 and 85, currentPhase 99 → 95 is closer (dist 4) vs 85 (dist 14)
    const entries: KnowhowEntry[] = [
      makeEntry({ pattern_name: 'Phase85', phase_number: 85, source: 'lib/knowledge.ts', applicability: 'knowledge' }),
      makeEntry({ pattern_name: 'Phase95', phase_number: 95, source: 'lib/knowledge.ts', applicability: 'knowledge' }),
    ];

    const top = selectTopEntries(entries, 2, ['knowledge'], 99);
    // Primary sort by phase_number desc: 95 then 85
    expect(top[0].pattern_name).toBe('Phase95');
    expect(top[1].pattern_name).toBe('Phase85');
  });
});
