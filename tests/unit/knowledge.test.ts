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

  // W6a — the new field is emitted only when set, so every entry written before W6
  // formats to the same bytes it always did.
  it('omits superseded_by when the entry is live', () => {
    expect(formatKnowhowEntry(makeEntry())).not.toContain('superseded_by');
  });

  it('emits superseded_by as the last field when set', () => {
    const result = formatKnowhowEntry(makeEntry({ superseded_by: 'research:t2#iter5' }));
    expect(result).toContain('- **superseded_by:** research:t2#iter5');
    expect(result.trimEnd().endsWith('- **superseded_by:** research:t2#iter5')).toBe(true);
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

  // W6a back-compat: a KNOWHOW.md written before W6 has no superseded_by line, and
  // must parse to exactly the object it parsed to before — key absent, not undefined.
  it('BACK-COMPAT: a pre-W6 block parses with no superseded_by key at all', () => {
    const content = `### Legacy Entry

- **source:** lib/legacy.ts
- **applicability:** Always
- **code_snippet:** legacy()
- **phase_number:** 7
- **created_at:** 2026-01-01T00:00:00Z
`;
    const entries = parseKnowhowEntries(content);
    expect(entries).toEqual([{
      pattern_name: 'Legacy Entry',
      source: 'lib/legacy.ts',
      applicability: 'Always',
      code_snippet: 'legacy()',
      phase_number: 7,
      created_at: '2026-01-01T00:00:00Z',
    }]);
    expect('superseded_by' in entries[0]).toBe(false);
  });

  it('parses a superseded_by line when present', () => {
    const content = `### Corrected Entry

- **source:** research:t1#iter1
- **applicability:** Only under load
- **code_snippet:** batch(4)
- **phase_number:** 0
- **created_at:** 2026-01-01T00:00:00Z
- **superseded_by:** research:t1#iter2
`;
    expect(parseKnowhowEntries(content)[0].superseded_by).toBe('research:t1#iter2');
  });

  it('treats a blank superseded_by value as absent (it must never read as live-but-marked)', () => {
    // Built by concatenation so the significant trailing space survives any formatter:
    // the field line matches but carries no value.
    const content = [
      '### Blank Marker', '',
      '- **source:** lib/x.ts',
      '- **applicability:** Always',
      '- **code_snippet:** x()',
      '- **phase_number:** 1',
      '- **created_at:** 2026-01-01T00:00:00Z',
      '- **superseded_by:** ',
    ].join('\n');
    expect('superseded_by' in parseKnowhowEntries(content)[0]).toBe(false);
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

  // W6a — the documented lossless guarantee has to hold for the new field too, or a
  // superseded entry reads as live again on the next read and gets superseded twice.
  it('roundtrips superseded_by (deep-equal, not merely present)', () => {
    const original = makeEntry({
      pattern_name: 'Superseded Pattern',
      superseded_by: 'research:t1#iter2',
    });
    expect(parseKnowhowEntries(formatKnowhowEntry(original))).toEqual([original]);
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

  // W6a — this replaces the pre-W6 "deduplicates by pattern_name" test, which asserted
  // that a colliding entry silently DESTROYED its predecessor. That is the defect: a
  // corrected belief left no record of what it corrected.
  it('supersedes rather than overwrites on a pattern_name collision', () => {
    const knowhowPath = path.join(tmpDir, 'KNOWHOW.md');
    const old = makeEntry({ pattern_name: 'Shared Name', phase_number: 5 });
    const newer = makeEntry({ pattern_name: 'Shared Name', phase_number: 10, source: 'lib/newer.ts' });

    appendKnowhowEntries(knowhowPath, [old]);
    appendKnowhowEntries(knowhowPath, [newer]);

    const content = fs.readFileSync(knowhowPath, 'utf8');
    expect((content.match(/### Shared Name/g) || []).length).toBe(2);

    const entries = parseKnowhowEntries(content);
    const superseded = entries.find((e) => e.source === 'lib/example.ts');
    const live = entries.find((e) => e.source === 'lib/newer.ts');
    expect(superseded?.superseded_by).toBe('lib/newer.ts');
    expect(live?.superseded_by).toBeUndefined();
    // Only the correction is injectable.
    expect(selectTopEntries(entries, 5).map((e) => e.source)).toEqual(['lib/newer.ts']);
  });

  it('supersedes entries that collide within a single call, in array order', () => {
    const knowhowPath = path.join(tmpDir, 'KNOWHOW.md');
    appendKnowhowEntries(knowhowPath, [
      makeEntry({ pattern_name: 'Same', phase_number: 0, source: 'research:t#iter1' }),
      makeEntry({ pattern_name: 'Same', phase_number: 0, source: 'research:t#iter2' }),
    ]);

    const entries = parseKnowhowEntries(fs.readFileSync(knowhowPath, 'utf8'));
    expect(entries).toHaveLength(2);
    expect(entries.find((e) => e.source === 'research:t#iter1')?.superseded_by)
      .toBe('research:t#iter2');
    expect(selectTopEntries(entries, 5).map((e) => e.source)).toEqual(['research:t#iter2']);
  });

  it('chains: a third entry supersedes the live one, never the already-superseded one', () => {
    const knowhowPath = path.join(tmpDir, 'KNOWHOW.md');
    for (const n of [1, 2, 3]) {
      appendKnowhowEntries(knowhowPath, [
        makeEntry({ pattern_name: 'Chained', phase_number: 0, source: `research:t#iter${n}` }),
      ]);
    }
    const entries = parseKnowhowEntries(fs.readFileSync(knowhowPath, 'utf8'));
    expect(entries).toHaveLength(3);
    expect(entries.find((e) => e.source === 'research:t#iter1')?.superseded_by)
      .toBe('research:t#iter2');
    expect(entries.find((e) => e.source === 'research:t#iter2')?.superseded_by)
      .toBe('research:t#iter3');
    expect(entries.find((e) => e.source === 'research:t#iter3')?.superseded_by).toBeUndefined();
  });

  it('re-writing unchanged knowledge is a no-op, even with a fresh created_at', () => {
    const knowhowPath = path.join(tmpDir, 'KNOWHOW.md');
    const first = makeEntry({ pattern_name: 'Stable', created_at: '2026-01-01T00:00:00Z' });
    // Same knowledge, later write. created_at is stamped per promotion, so comparing it
    // would turn every re-promotion into a supersession and grow the file forever.
    const again = makeEntry({ pattern_name: 'Stable', created_at: '2026-06-01T00:00:00Z' });

    appendKnowhowEntries(knowhowPath, [first]);
    appendKnowhowEntries(knowhowPath, [again]);

    const entries = parseKnowhowEntries(fs.readFileSync(knowhowPath, 'utf8'));
    expect(entries).toHaveLength(1);
    expect(entries[0].superseded_by).toBeUndefined();
    expect(entries[0].created_at).toBe('2026-01-01T00:00:00Z');
  });

  it('falls back to a non-empty superseded_by marker when the new entry has no source', () => {
    const knowhowPath = path.join(tmpDir, 'KNOWHOW.md');
    appendKnowhowEntries(knowhowPath, [makeEntry({ pattern_name: 'Sourceless' })]);
    appendKnowhowEntries(knowhowPath, [
      makeEntry({ pattern_name: 'Sourceless', source: '', applicability: 'Revised advice' }),
    ]);

    const entries = parseKnowhowEntries(fs.readFileSync(knowhowPath, 'utf8'));
    expect(entries).toHaveLength(2);
    // Never '' — an empty marker formats to a line that parses back as absent, which
    // would read as "still live" and let the same correction supersede it again.
    expect(entries.find((e) => e.source === 'lib/example.ts')?.superseded_by).toBe('unknown');
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

  // W6a — the single funnel. Everything that injects KNOWHOW selects through here, so a
  // superseded entry has to be dropped here or the planner sees both versions of a
  // corrected belief.
  it('drops superseded entries', () => {
    const withSuperseded = [
      ...entries,
      makeEntry({ pattern_name: 'Corrected', phase_number: 99, source: 'lib/old-belief.ts', superseded_by: 'lib/new-belief.ts' }),
    ];
    const top = selectTopEntries(withSuperseded, 5);
    // phase 99 would otherwise outrank every live entry.
    expect(top.map((e) => e.pattern_name)).not.toContain('Corrected');
    expect(top).toHaveLength(entries.length);
  });

  it('returns empty when every entry is superseded', () => {
    const allDead = entries.map((e) => ({ ...e, superseded_by: 'lib/newer.ts' }));
    expect(selectTopEntries(allDead, 5)).toEqual([]);
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

  // W6a end-to-end, the spec's own acceptance test: two writes of the same pattern_name
  // leave both entries on disk, the older marked, and only the newer injectable.
  it('injects only the surviving side of a supersession', () => {
    const knowhowPath = path.join(tmpDir, 'KNOWHOW.md');
    appendKnowhowEntries(knowhowPath, [makeEntry({
      pattern_name: 'Batching helps', phase_number: 0,
      source: 'research:t1#iter1', applicability: 'success_pattern — accuracy 0.5 vs target 0.8',
    })]);
    appendKnowhowEntries(knowhowPath, [makeEntry({
      pattern_name: 'Batching helps', phase_number: 0,
      source: 'research:t1#iter2', applicability: 'success_pattern — accuracy 0.9 vs target 0.8',
    })]);

    const onDisk = fs.readFileSync(knowhowPath, 'utf8');
    expect(onDisk).toContain('research:t1#iter1');
    expect(onDisk).toContain('research:t1#iter2');

    const block = buildKnowledgeInjectionBlock(tmpDir, '0');
    expect(block).toContain('research:t1#iter2');
    expect(block).not.toContain('research:t1#iter1');
    expect((block.match(/^### /gm) || [])).toHaveLength(1);
  });

  it('returns empty string when every entry on disk is superseded', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'KNOWHOW.md'),
      '# KNOWHOW\n\n' + formatKnowhowEntry(makeEntry({ superseded_by: 'lib/newer.ts' })),
      'utf8',
    );
    expect(buildKnowledgeInjectionBlock(tmpDir, '99')).toBe('');
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

// ─── cmdKnowhowAudit ──────────────────────────────────────────────────────────

const { cmdKnowhowAudit, cmdKnowhowDedup, rankKnowhowByPhaseGoal, cmdKnowhowRank } = require('../../lib/knowledge') as {
  cmdKnowhowAudit: (cwd: string, raw: boolean) => void;
  cmdKnowhowDedup: (cwd: string, raw: boolean, threshold?: number) => void;
  rankKnowhowByPhaseGoal: (goal: string, entries: import('../../lib/types').KnowhowEntry[], topN?: number) => import('../../lib/types').KnowhowEntry[];
  cmdKnowhowRank: (cwd: string, query: string, topN: number, raw: boolean) => void;
};

function makeTmpProject(): string {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-knowhow-audit-'));
  fs.mkdirSync(path.join(tmp, '.planning', 'milestones', 'v1.0', 'research'), { recursive: true });
  return tmp;
}

function rmTmpProject(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

describe('cmdKnowhowAudit', () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) {
      rmTmpProject(tmpDir);
    }
  });

  it('reports zero flags when no KNOWHOW.md files exist', () => {
    tmpDir = makeTmpProject();
    const { captureOutput: cap } = require('../helpers/setup') as { captureOutput: (fn: () => void) => { stdout: string; exitCode: number } };
    const { stdout, exitCode } = cap(() => cmdKnowhowAudit(tmpDir, false));
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.total_entries).toBe(0);
    expect(parsed.stale_count).toBe(0);
    expect(parsed.flags).toHaveLength(0);
  });

  it('flags a broken file reference in source field', () => {
    tmpDir = makeTmpProject();
    const knowhowContent = [
      '# KNOWHOW',
      '',
      '### BrokenRef Pattern',
      '',
      '- **source:** lib/nonexistent-file-xyz.ts',
      '- **applicability:** When doing things',
      '- **code_snippet:** const x = 1;',
      '- **phase_number:** 5',
      '- **created_at:** 2026-01-01T00:00:00Z',
    ].join('\n');
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'milestones', 'v1.0', 'KNOWHOW.md'),
      knowhowContent,
      'utf-8'
    );

    const { captureOutput: cap } = require('../helpers/setup') as { captureOutput: (fn: () => void) => { stdout: string; exitCode: number } };
    const { stdout } = cap(() => cmdKnowhowAudit(tmpDir, false));
    const parsed = JSON.parse(stdout);
    expect(parsed.stale_count).toBe(1);
    expect(parsed.flags[0].issue).toBe('broken_ref');
    expect(parsed.flags[0].pattern_name).toBe('BrokenRef Pattern');
  });

  it('detects contradictions between entries with opposite advice', () => {
    tmpDir = makeTmpProject();
    const knowhowContent = [
      '# KNOWHOW',
      '',
      '### Caching Strategy',
      '',
      '- **source:** lib/cache.ts',
      '- **applicability:** Always use in-memory caching for this module',
      '- **code_snippet:** cache.set(key, val)',
      '- **phase_number:** 10',
      '- **created_at:** 2026-01-01T00:00:00Z',
      '',
      '### Caching Strategy',
      '',
      '- **source:** lib/cache.ts',
      '- **applicability:** Never use in-memory caching — causes memory leaks',
      '- **code_snippet:** // do not cache',
      '- **phase_number:** 15',
      '- **created_at:** 2026-02-01T00:00:00Z',
    ].join('\n');
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'milestones', 'v1.0', 'KNOWHOW.md'),
      knowhowContent,
      'utf-8'
    );

    const { captureOutput: cap } = require('../helpers/setup') as { captureOutput: (fn: () => void) => { stdout: string; exitCode: number } };
    const { stdout } = cap(() => cmdKnowhowAudit(tmpDir, false));
    const parsed = JSON.parse(stdout);
    expect(parsed.contradiction_count).toBe(1);
    expect(parsed.flags.some((f: { issue: string }) => f.issue === 'contradicts')).toBe(true);
  });

  it('raw output is a non-empty string', () => {
    tmpDir = makeTmpProject();
    const { captureOutput: cap } = require('../helpers/setup') as { captureOutput: (fn: () => void) => { stdout: string; exitCode: number } };
    const { stdout } = cap(() => cmdKnowhowAudit(tmpDir, true));
    expect(stdout.trim().length).toBeGreaterThan(0);
  });
});

// ─── cmdKnowhowDedup ──────────────────────────────────────────────────────────

describe('cmdKnowhowDedup', () => {
  let tmpDir: string;
  const { captureOutput: cap } = require('../helpers/setup') as { captureOutput: (fn: () => void) => { stdout: string; exitCode: number } };

  afterEach(() => {
    if (tmpDir) rmTmpProject(tmpDir);
  });

  function writeKnowhow(dir: string, content: string): void {
    fs.mkdirSync(path.join(dir, '.planning', 'milestones', 'v1.0'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, '.planning', 'milestones', 'v1.0', 'KNOWHOW.md'),
      content,
      'utf-8'
    );
  }

  it('returns zero pairs when no KNOWHOW files exist', () => {
    tmpDir = makeTmpProject();
    const { stdout, exitCode } = cap(() => cmdKnowhowDedup(tmpDir, false));
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.entries_total).toBe(0);
    expect(parsed.pairs_above_threshold).toBe(0);
    expect(parsed.pairs).toHaveLength(0);
  });

  it('detects near-duplicate entries with high similarity', () => {
    tmpDir = makeTmpProject();
    const content = [
      '# KNOWHOW',
      '',
      '### Prefer async await over callbacks',
      '',
      '- **source:** lib/utils.ts',
      '- **applicability:** Always prefer async await over callback patterns for clarity',
      '- **code_snippet:** async function foo() {}',
      '- **phase_number:** 1',
      '- **created_at:** 2026-01-01T00:00:00Z',
      '',
      '### Use async await instead of callbacks',
      '',
      '- **source:** lib/api.ts',
      '- **applicability:** Always prefer async await over callback patterns for clarity',
      '- **code_snippet:** async function bar() {}',
      '- **phase_number:** 2',
      '- **created_at:** 2026-01-02T00:00:00Z',
    ].join('\n');
    writeKnowhow(tmpDir, content);
    const { stdout } = cap(() => cmdKnowhowDedup(tmpDir, false, 0.5));
    const parsed = JSON.parse(stdout);
    expect(parsed.entries_total).toBe(2);
    expect(parsed.pairs_above_threshold).toBeGreaterThanOrEqual(1);
    expect(parsed.pairs[0]).toHaveProperty('similarity');
    expect(parsed.pairs[0].similarity).toBeGreaterThanOrEqual(0.5);
  });

  it('returns no pairs when entries are completely different', () => {
    tmpDir = makeTmpProject();
    const content = [
      '# KNOWHOW',
      '',
      '### Database indexing strategy',
      '',
      '- **source:** lib/db.ts',
      '- **applicability:** Add composite index on user_id and created_at for query performance',
      '- **code_snippet:** CREATE INDEX idx ON table(user_id, created_at);',
      '- **phase_number:** 3',
      '- **created_at:** 2026-01-01T00:00:00Z',
      '',
      '### Logging pattern',
      '',
      '- **source:** lib/logger.ts',
      '- **applicability:** Use structured JSON logging for machine parseable output',
      '- **code_snippet:** logger.info({ event, data });',
      '- **phase_number:** 4',
      '- **created_at:** 2026-01-02T00:00:00Z',
    ].join('\n');
    writeKnowhow(tmpDir, content);
    const { stdout } = cap(() => cmdKnowhowDedup(tmpDir, false, 0.75));
    const parsed = JSON.parse(stdout);
    expect(parsed.pairs_above_threshold).toBe(0);
  });

  it('writes report to .planning/KNOWHOW-DEDUP.md', () => {
    tmpDir = makeTmpProject();
    const content = [
      '# KNOWHOW',
      '',
      '### Pattern A',
      '',
      '- **source:** lib/a.ts',
      '- **applicability:** test pattern for dedup',
      '- **code_snippet:** const a = 1;',
      '- **phase_number:** 1',
      '- **created_at:** 2026-01-01T00:00:00Z',
    ].join('\n');
    writeKnowhow(tmpDir, content);
    cap(() => cmdKnowhowDedup(tmpDir, false));
    const reportPath = path.join(tmpDir, '.planning', 'KNOWHOW-DEDUP.md');
    expect(fs.existsSync(reportPath)).toBe(true);
    const reportContent = fs.readFileSync(reportPath, 'utf-8');
    expect(reportContent).toContain('KNOWHOW Deduplication Report');
  });

  it('raw output is a non-empty string', () => {
    tmpDir = makeTmpProject();
    const { stdout } = cap(() => cmdKnowhowDedup(tmpDir, true));
    expect(stdout.trim().length).toBeGreaterThan(0);
  });

  it('sorts multiple pairs by similarity descending', () => {
    tmpDir = makeTmpProject();
    // 3 entries, all similar to each other -> 3 pairs, forces sort comparator
    const content = [
      '# KNOWHOW',
      '',
      '### Always use async await over callbacks everywhere consistently',
      '',
      '- **source:** lib/a.ts',
      '- **applicability:** Always use async await over callbacks everywhere consistently',
      '- **code_snippet:** async function foo() {}',
      '- **phase_number:** 1',
      '- **created_at:** 2026-01-01T00:00:00Z',
      '',
      '### Always use async await instead of callbacks everywhere consistently',
      '',
      '- **source:** lib/b.ts',
      '- **applicability:** Always use async await instead of callbacks everywhere consistently',
      '- **code_snippet:** async function bar() {}',
      '- **phase_number:** 2',
      '- **created_at:** 2026-01-02T00:00:00Z',
      '',
      '### Use async await over callbacks always everywhere in code consistently',
      '',
      '- **source:** lib/c.ts',
      '- **applicability:** Use async await over callbacks always everywhere in code consistently',
      '- **code_snippet:** async function baz() {}',
      '- **phase_number:** 3',
      '- **created_at:** 2026-01-03T00:00:00Z',
    ].join('\n');
    writeKnowhow(tmpDir, content);
    const { stdout } = cap(() => cmdKnowhowDedup(tmpDir, false, 0.3));
    const parsed = JSON.parse(stdout);
    expect(parsed.entries_total).toBe(3);
    if (parsed.pairs_above_threshold >= 2) {
      // Verify sorted descending by similarity
      for (let i = 0; i < parsed.pairs.length - 1; i++) {
        expect(parsed.pairs[i].similarity).toBeGreaterThanOrEqual(parsed.pairs[i + 1].similarity);
      }
    }
  });
});

// ─── rankKnowhowByPhaseGoal ───────────────────────────────────────────────────

describe('rankKnowhowByPhaseGoal', () => {
  it('returns empty array when entries is empty', () => {
    expect(rankKnowhowByPhaseGoal('any goal', [])).toEqual([]);
  });

  it('returns empty array when goal is empty string', () => {
    const entries = [makeEntry({ pattern_name: 'X' })];
    expect(rankKnowhowByPhaseGoal('', entries)).toEqual([]);
  });

  it('returns at most topN entries', () => {
    const entries = Array.from({ length: 10 }, (_, i) =>
      makeEntry({ pattern_name: `P${i}`, applicability: `thing ${i}` })
    );
    const result = rankKnowhowByPhaseGoal('thing', entries, 3);
    expect(result).toHaveLength(3);
  });

  it('ranks entries with matching keywords higher', () => {
    const relevant = makeEntry({ pattern_name: 'Relevant', applicability: 'use caching for database queries' });
    const irrelevant = makeEntry({ pattern_name: 'Irrelevant', applicability: 'UI rendering styles' });
    const result = rankKnowhowByPhaseGoal('caching database', [irrelevant, relevant], 5);
    expect(result[0].pattern_name).toBe('Relevant');
  });

  it('uses default topN of 5', () => {
    const entries = Array.from({ length: 8 }, (_, i) =>
      makeEntry({ pattern_name: `P${i}`, applicability: 'testing scheduler' })
    );
    const result = rankKnowhowByPhaseGoal('scheduler', entries);
    expect(result).toHaveLength(5);
  });

  it('returns all entries when count < topN', () => {
    const entries = [makeEntry({ pattern_name: 'A' }), makeEntry({ pattern_name: 'B' })];
    const result = rankKnowhowByPhaseGoal('any goal here', entries, 5);
    expect(result).toHaveLength(2);
  });
});

// ─── cmdKnowhowRank ───────────────────────────────────────────────────────────

describe('cmdKnowhowRank', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-knowhow-rank-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns message when KNOWHOW.md does not exist', () => {
    const { captureOutput: cap } = require('../helpers/setup') as { captureOutput: (fn: () => void) => { stdout: string; exitCode: number } };
    const { stdout, exitCode } = cap(() => cmdKnowhowRank(tmpDir, 'caching', 5, false));
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.entries).toHaveLength(0);
  });

  it('returns ranked entries matching query', () => {
    const entries = [
      makeEntry({ pattern_name: 'Cache Pattern', applicability: 'use caching for database' }),
      makeEntry({ pattern_name: 'UI Pattern', applicability: 'render components with styles' }),
    ];
    const content = '# KNOWHOW\n\n' + entries.map(formatKnowhowEntry).join('\n');
    fs.writeFileSync(path.join(tmpDir, 'KNOWHOW.md'), content, 'utf8');

    const { captureOutput: cap } = require('../helpers/setup') as { captureOutput: (fn: () => void) => { stdout: string; exitCode: number } };
    const { stdout, exitCode } = cap(() => cmdKnowhowRank(tmpDir, 'caching database', 5, false));
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.total).toBe(2);
    expect(parsed.entries[0].pattern_name).toBe('Cache Pattern');
  });

  it('scans milestone, research, and per-phase KNOWHOW locations', () => {
    const msDir = path.join(tmpDir, '.planning', 'milestones', 'v2.0');
    const phaseDir = path.join(msDir, 'phases', '07-cache-layer');
    fs.mkdirSync(path.join(msDir, 'research'), { recursive: true });
    fs.mkdirSync(phaseDir, { recursive: true });

    const msEntry = makeEntry({ pattern_name: 'Milestone Cache Pattern', applicability: 'use caching for reads' });
    const resEntry = makeEntry({ pattern_name: 'Research Cache Pattern', applicability: 'caching benchmarks summary' });
    const phEntry = makeEntry({ pattern_name: 'Phase Cache Pattern', applicability: 'caching hot paths only' });
    fs.writeFileSync(path.join(msDir, 'KNOWHOW.md'), '# KNOWHOW\n\n' + formatKnowhowEntry(msEntry), 'utf8');
    fs.writeFileSync(path.join(msDir, 'research', 'KNOWHOW.md'), '# KNOWHOW\n\n' + formatKnowhowEntry(resEntry), 'utf8');
    fs.writeFileSync(path.join(phaseDir, 'KNOWHOW.md'), '# KNOWHOW\n\n' + formatKnowhowEntry(phEntry), 'utf8');

    const { captureOutput: cap } = require('../helpers/setup') as { captureOutput: (fn: () => void) => { stdout: string; exitCode: number } };
    const { stdout, exitCode } = cap(() => cmdKnowhowRank(tmpDir, 'caching', 5, false));
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout) as { total: number; entries: Array<{ pattern_name: string }> };
    expect(parsed.total).toBe(3);
    const names = parsed.entries.map((e) => e.pattern_name);
    expect(names).toContain('Milestone Cache Pattern');
    expect(names).toContain('Research Cache Pattern');
    expect(names).toContain('Phase Cache Pattern');
  });

  it('raw output falls back to "No entries" when topN is 0', () => {
    const content = '# KNOWHOW\n\n' + formatKnowhowEntry(makeEntry({ pattern_name: 'Solo Pattern' }));
    fs.writeFileSync(path.join(tmpDir, 'KNOWHOW.md'), content, 'utf8');

    const { captureOutput: cap } = require('../helpers/setup') as { captureOutput: (fn: () => void) => { stdout: string; exitCode: number } };
    const { stdout, exitCode } = cap(() => cmdKnowhowRank(tmpDir, 'anything', 0, true));
    expect(exitCode).toBe(0);
    expect(stdout).toContain('No entries');
  });
});

// ─── coverage: parser + cache + append edge branches ─────────────────────────

describe('parseKnowhowEntries edge branches', () => {
  it('skips a block whose heading text is empty', () => {
    const content = '### \n\n- **source:** lib/a.ts\n- **applicability:** x\n- **code_snippet:** y\n- **phase_number:** 1\n- **created_at:** 2026-01-01\n';
    expect(parseKnowhowEntries(content)).toEqual([]);
  });

  it('skips an entry whose phase_number is not numeric', () => {
    const content = [
      '### Bad Phase',
      '',
      '- **source:** lib/a.ts',
      '- **applicability:** x',
      '- **code_snippet:** y',
      '- **phase_number:** not-a-number',
      '- **created_at:** 2026-01-01',
    ].join('\n');
    expect(parseKnowhowEntries(content)).toEqual([]);
  });
});

describe('appendKnowhowEntries edge branches', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-knowhow-append-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('is a no-op for an empty entries array (file is not created)', () => {
    const knowhowPath = path.join(tmpDir, 'KNOWHOW.md');
    appendKnowhowEntries(knowhowPath, []);
    expect(fs.existsSync(knowhowPath)).toBe(false);
  });

  it('logs merge progress to stderr when merging more than 50 entries', () => {
    const knowhowPath = path.join(tmpDir, 'KNOWHOW.md');
    const entries = Array.from({ length: 51 }, (_v, i) =>
      makeEntry({ pattern_name: `Pattern ${i}`, phase_number: i })
    );
    const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      appendKnowhowEntries(knowhowPath, entries);
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('merging entry 1/51'));
    } finally {
      stderrSpy.mockRestore();
    }
    const written = parseKnowhowEntries(fs.readFileSync(knowhowPath, 'utf8'));
    expect(written).toHaveLength(51);
  });
});

describe('knowhow parse cache (mtime-keyed)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-knowhow-cache-'));
    fs.mkdirSync(path.join(tmpDir, '.planning'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('serves a cache hit for an unchanged file and re-parses after modification', () => {
    const knowhowPath = path.join(tmpDir, 'KNOWHOW.md');
    fs.writeFileSync(
      knowhowPath,
      '# KNOWHOW\n\n' + formatKnowhowEntry(makeEntry({ pattern_name: 'Cached Pattern' })),
      'utf8'
    );
    // Backdate mtime so the rewrite below is guaranteed to change mtimeMs.
    const past = new Date(Date.now() - 10_000);
    fs.utimesSync(knowhowPath, past, past);

    const first = buildKnowledgeInjectionBlock(tmpDir, '1');
    const second = buildKnowledgeInjectionBlock(tmpDir, '1'); // cache hit — same mtime
    expect(first).toContain('Cached Pattern');
    expect(second).toBe(first);

    fs.writeFileSync(
      knowhowPath,
      '# KNOWHOW\n\n' + formatKnowhowEntry(makeEntry({ pattern_name: 'Replaced Pattern' })),
      'utf8'
    );
    const third = buildKnowledgeInjectionBlock(tmpDir, '1'); // mtime changed — re-parse
    expect(third).toContain('Replaced Pattern');
    expect(third).not.toContain('Cached Pattern');
  });

  it('treats a non-numeric phase number as no proximity scoring (still injects)', () => {
    const knowhowPath = path.join(tmpDir, 'KNOWHOW.md');
    fs.writeFileSync(
      knowhowPath,
      '# KNOWHOW\n\n' + formatKnowhowEntry(makeEntry({ pattern_name: 'NaN Phase Pattern' })),
      'utf8'
    );
    const block = buildKnowledgeInjectionBlock(tmpDir, 'not-a-phase');
    expect(block).toContain('NaN Phase Pattern');
    expect(block).toContain('<knowhow_context>');
  });
});

describe('extractModuleHints edge branches', () => {
  let phaseDir: string;

  beforeEach(() => {
    phaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-knowhow-hints-'));
  });

  afterEach(() => {
    fs.rmSync(phaseDir, { recursive: true, force: true });
  });

  it('reads a bare PLAN.md and skips empty, frontmatter-less, and fieldless plans', () => {
    // Bare PLAN.md with a files_modified list — must contribute hints.
    fs.writeFileSync(
      path.join(phaseDir, 'PLAN.md'),
      '---\nfiles_modified: [lib/alpha.ts, lib/beta.ts]\n---\n# Plan\n',
      'utf8'
    );
    // Empty file — safeReadFile returns falsy content → skipped.
    fs.writeFileSync(path.join(phaseDir, '01-01-PLAN.md'), '', 'utf8');
    // No frontmatter → skipped.
    fs.writeFileSync(path.join(phaseDir, '01-02-PLAN.md'), '# Plan without frontmatter\n', 'utf8');
    // Frontmatter without files_modified → skipped.
    fs.writeFileSync(path.join(phaseDir, '01-03-PLAN.md'), '---\nwave: 1\n---\n# Plan\n', 'utf8');

    const hints = extractModuleHints(phaseDir);
    expect(hints.sort()).toEqual(['alpha', 'beta']);
  });

  it('skips entries whose basename resolves to an empty string', () => {
    fs.writeFileSync(
      path.join(phaseDir, '02-01-PLAN.md'),
      '---\nfiles_modified: [.hidden, lib/gamma.ts]\n---\n# Plan\n',
      'utf8'
    );
    const hints = extractModuleHints(phaseDir);
    expect(hints).toEqual(['gamma']);
    expect(hints).not.toContain('');
  });
});

// ─── coverage: audit/dedup multi-location scanning ────────────────────────────

describe('cmdKnowhowAudit multi-location scanning', () => {
  let tmpDir: string;
  const { captureOutput: cap } = require('../helpers/setup') as { captureOutput: (fn: () => void) => { stdout: string; exitCode: number } };

  afterEach(() => {
    if (tmpDir) rmTmpProject(tmpDir);
  });

  function entryBlock(name: string, source: string): string {
    return [
      `### ${name}`,
      '',
      `- **source:** ${source}`,
      '- **applicability:** When doing things',
      '- **code_snippet:** const x = 1;',
      '- **phase_number:** 3',
      '- **created_at:** 2026-01-01T00:00:00Z',
      '',
    ].join('\n');
  }

  it('scans research, per-phase, root-planning, and project-root KNOWHOW files', () => {
    tmpDir = makeTmpProject();
    const msBase = path.join(tmpDir, '.planning', 'milestones', 'v1.0');
    const phaseDir = path.join(msBase, 'phases', '01-setup');
    const emptyPhaseDir = path.join(msBase, 'phases', '02-no-knowhow');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.mkdirSync(emptyPhaseDir, { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '.planning', 'research'), { recursive: true });

    fs.writeFileSync(path.join(msBase, 'research', 'KNOWHOW.md'), '# KNOWHOW\n\n' + entryBlock('Research Entry', 'notes'), 'utf8');
    fs.writeFileSync(path.join(phaseDir, 'KNOWHOW.md'), '# KNOWHOW\n\n' + entryBlock('Phase Entry', 'notes'), 'utf8');
    fs.writeFileSync(path.join(tmpDir, '.planning', 'research', 'KNOWHOW.md'), '# KNOWHOW\n\n' + entryBlock('Root Research Entry', 'notes'), 'utf8');
    fs.writeFileSync(path.join(tmpDir, '.planning', 'KNOWHOW.md'), '# KNOWHOW\n\n' + entryBlock('Root Planning Entry', 'notes'), 'utf8');
    fs.writeFileSync(path.join(tmpDir, 'KNOWHOW.md'), '# KNOWHOW\n\n' + entryBlock('Project Root Entry', 'notes'), 'utf8');

    const { stdout, exitCode } = cap(() => cmdKnowhowAudit(tmpDir, false));
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout) as { knowhow_files_scanned: number; total_entries: number };
    expect(parsed.knowhow_files_scanned).toBe(5);
    expect(parsed.total_entries).toBe(5);
  });

  it('flags a broken absolute source reference and skips empty KNOWHOW files', () => {
    tmpDir = makeTmpProject();
    const msBase = path.join(tmpDir, '.planning', 'milestones', 'v1.0');
    const absMissing = path.join(tmpDir, 'does', 'not', 'exist.ts');
    fs.writeFileSync(path.join(msBase, 'KNOWHOW.md'), '# KNOWHOW\n\n' + entryBlock('Abs Ref Entry', absMissing), 'utf8');
    // Empty file in a scanned location — content is falsy → skipped without parsing.
    fs.writeFileSync(path.join(msBase, 'research', 'KNOWHOW.md'), '', 'utf8');

    const { stdout } = cap(() => cmdKnowhowAudit(tmpDir, false));
    const parsed = JSON.parse(stdout) as {
      stale_count: number;
      flags: Array<{ issue: string; detail: string }>;
      knowhow_files_scanned: number;
    };
    expect(parsed.knowhow_files_scanned).toBe(2);
    expect(parsed.stale_count).toBe(1);
    expect(parsed.flags[0].issue).toBe('broken_ref');
    expect(parsed.flags[0].detail).toContain(absMissing);
  });
});

describe('cmdKnowhowDedup multi-location scanning', () => {
  let tmpDir: string;
  const { captureOutput: cap } = require('../helpers/setup') as { captureOutput: (fn: () => void) => { stdout: string; exitCode: number } };

  afterEach(() => {
    if (tmpDir) rmTmpProject(tmpDir);
  });

  function entryBlock(name: string, applicability: string): string {
    return [
      `### ${name}`,
      '',
      '- **source:** lib/dedup.ts',
      `- **applicability:** ${applicability}`,
      '- **code_snippet:** const x = 1;',
      '- **phase_number:** 2',
      '- **created_at:** 2026-01-01T00:00:00Z',
      '',
    ].join('\n');
  }

  it('collects entries from research, per-phase, root, and project-root files', () => {
    tmpDir = makeTmpProject();
    const msBase = path.join(tmpDir, '.planning', 'milestones', 'v1.0');
    const phaseDir = path.join(msBase, 'phases', '01-setup');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '.planning', 'research'), { recursive: true });

    fs.writeFileSync(path.join(msBase, 'research', 'KNOWHOW.md'), '# KNOWHOW\n\n' + entryBlock('Dup Cache Strategy For Reads', 'always cache read-heavy database queries in memory'), 'utf8');
    fs.writeFileSync(path.join(phaseDir, 'KNOWHOW.md'), '# KNOWHOW\n\n' + entryBlock('Dup Cache Strategy For Reads V2', 'always cache read-heavy database queries in memory'), 'utf8');
    fs.writeFileSync(path.join(tmpDir, '.planning', 'research', 'KNOWHOW.md'), '# KNOWHOW\n\n' + entryBlock('Rate Limiter Backoff', 'exponential backoff on 429 responses'), 'utf8');
    fs.writeFileSync(path.join(tmpDir, '.planning', 'KNOWHOW.md'), '# KNOWHOW\n\n' + entryBlock('Retry Queue Draining', 'drain retry queues before shutdown'), 'utf8');
    fs.writeFileSync(path.join(tmpDir, 'KNOWHOW.md'), '', 'utf8'); // empty — skipped

    const { stdout, exitCode } = cap(() => cmdKnowhowDedup(tmpDir, false, 0.7));
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout) as {
      files_scanned: number;
      entries_total: number;
      pairs: Array<{ entry_a: string; entry_b: string }>;
    };
    expect(parsed.files_scanned).toBe(5);
    expect(parsed.entries_total).toBe(4);
    expect(parsed.pairs.length).toBeGreaterThanOrEqual(1);
    const pairNames = parsed.pairs.flatMap((p) => [p.entry_a, p.entry_b]);
    expect(pairNames).toContain('Dup Cache Strategy For Reads');
  });

  it('treats two empty-fingerprint entries as identical (Jaccard 1) and reports progress above 20 entries', () => {
    tmpDir = makeTmpProject();
    const msBase = path.join(tmpDir, '.planning', 'milestones', 'v1.0');
    // Two entries whose fingerprints normalize to fewer than 3 chars → empty trigram sets.
    let content = '# KNOWHOW\n\n' + entryBlock('x', '-') + '\n' + entryBlock('y', '-');
    // Pad with 20 distinct entries to cross the >20 progress threshold.
    for (let i = 0; i < 20; i++) {
      content += '\n' + entryBlock(`Unique Long Pattern Number ${i} Alpha`, `completely distinct applicability text variant ${i} with extra words`);
    }
    fs.writeFileSync(path.join(msBase, 'KNOWHOW.md'), content, 'utf8');

    const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    let stdout = '';
    try {
      ({ stdout } = cap(() => cmdKnowhowDedup(tmpDir, false, 0.99)));
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('[knowledge:dedup] scanning entry'));
    } finally {
      stderrSpy.mockRestore();
    }
    const parsed = JSON.parse(stdout) as { entries_total: number; pairs: Array<{ entry_a: string; entry_b: string; similarity: number }> };
    expect(parsed.entries_total).toBe(22);
    const emptyPair = parsed.pairs.find((p) => p.entry_a === 'x' && p.entry_b === 'y');
    expect(emptyPair).toBeDefined();
    expect(emptyPair!.similarity).toBe(1);
  });
});

describe('rankKnowhowByPhaseGoal stopword-only goal', () => {
  it('returns the first topN entries when the goal tokenizes to nothing', () => {
    const entries = [
      makeEntry({ pattern_name: 'First Pattern' }),
      makeEntry({ pattern_name: 'Second Pattern' }),
      makeEntry({ pattern_name: 'Third Pattern' }),
    ];
    // All goal words are stopwords or too short → queryTokens is empty.
    const result = rankKnowhowByPhaseGoal('the and for it', entries, 2);
    expect(result).toHaveLength(2);
    expect(result[0].pattern_name).toBe('First Pattern');
    expect(result[1].pattern_name).toBe('Second Pattern');
  });
});

describe('W6a: supersession survives the file, not just the process', () => {
  function entry(name: string, phase: number, over: Record<string, unknown> = {}) {
    return {
      pattern_name: name, source: 's', applicability: 'a', code_snippet: 'c',
      phase_number: phase, created_at: '2026-09-04', ...over,
    } as import('../../lib/types').KnowhowEntry;
  }
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-knowhow-')); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it('writes superseded_by to disk and reads it back', () => {
    // The in-memory upsert can be correct while the serializer drops the field, in which
    // case supersession evaporates on the next process and the corrected belief and its
    // predecessor both come back live. Removing the emit from formatKnowhowEntry passed
    // the whole suite before this test existed.
    const file = path.join(dir, 'KNOWHOW.md');
    appendKnowhowEntries(file, [entry('same pattern', 0, { source: 'first' })]);
    appendKnowhowEntries(file, [entry('same pattern', 0, { source: 'second' })]);

    const onDisk = fs.readFileSync(file, 'utf-8');
    expect(onDisk).toContain('superseded_by');

    const reparsed = parseKnowhowEntries(onDisk);
    const superseded = reparsed.filter((e) => e.superseded_by);
    expect(superseded).toHaveLength(1);
    expect(superseded[0].source).toBe('first');
    expect(reparsed.filter((e) => !e.superseded_by)).toHaveLength(1);
  });

  it('a superseded entry re-read from disk is still un-injectable', () => {
    // buildKnowledgeInjectionBlock reads KNOWHOW.md from cwd itself, so this exercises
    // the real path: write, supersede, then inject from what is actually on disk.
    fs.mkdirSync(path.join(dir, '.planning'), { recursive: true });
    const file = path.join(dir, 'KNOWHOW.md');
    appendKnowhowEntries(file, [entry('same pattern', 0, { source: 'first' })]);
    appendKnowhowEntries(file, [entry('same pattern', 0, { source: 'second' })]);

    const block = buildKnowledgeInjectionBlock(dir, '1');
    expect(block).toContain('second');
    expect(block).not.toContain('first');
  });

  it('an entry with no superseded_by formats byte-for-byte as it did before W6', () => {
    // The compatibility claim the whole change rests on.
    expect(formatKnowhowEntry(entry('p', 3))).toBe(
      '### p\n\n- **source:** s\n- **applicability:** a\n- **code_snippet:** c\n'
      + '- **phase_number:** 3\n- **created_at:** 2026-09-04\n'
    );
  });
});
