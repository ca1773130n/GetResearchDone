'use strict';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const {
  formatKnowhowEntry,
  parseKnowhowEntries,
  appendKnowhowEntries,
  selectTopEntries,
} = require('../../lib/knowledge') as {
  formatKnowhowEntry: (entry: import('../../lib/types').KnowhowEntry) => string;
  parseKnowhowEntries: (content: string) => import('../../lib/types').KnowhowEntry[];
  appendKnowhowEntries: (path: string, entries: import('../../lib/types').KnowhowEntry[]) => void;
  selectTopEntries: (
    entries: import('../../lib/types').KnowhowEntry[],
    n: number,
    hints?: string[]
  ) => import('../../lib/types').KnowhowEntry[];
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
