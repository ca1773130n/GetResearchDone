'use strict';

/**
 * Cross-module contract for `.planning/DEAD-ENDS.md` (issues #67 + #68).
 *
 * The corpus is the repo's OWN registry, read from disk at test time — never a
 * hand-written fixture. That is deliberate: the bug shipped with 152 green
 * tests precisely because the two suites that touch this file encode
 * incompatible formats (tests/unit/dead-ends.test.ts fixtures always carry
 * `approach:` and never `forbidden_terms:`; tests/unit/select-candidate.test.ts's
 * fixture is the exact inverse) and neither file requires the other module. A
 * fixture written today drifts from the corpus tomorrow, which is how the
 * writer's model and the gate's model diverged in the first place.
 *
 * Two directions matter and only one existed before:
 *   - model -> text -> model  (tests/unit/dead-ends.test.ts) is structurally
 *     incapable of noticing a field the model does not have.
 *   - text -> model -> text   (here) is where #67 lives.
 */

const fs = require('fs') as typeof import('fs');
const path = require('path') as typeof import('path');
const os = require('os') as typeof import('os');

interface DeadEndEntryModel {
  approach?: string;
  slug: string;
  tried_in_phases: string[];
  verdict: string;
  evidence: string[];
  status: string;
  date?: string;
  notes?: string;
}
type DocSpan =
  | { kind: 'raw'; text: string }
  | {
      kind: 'entry';
      slug: string;
      head: string;
      bodyLines: string[];
      tail: string;
      entry: DeadEndEntryModel;
    };

const {
  parseDeadEndsDoc,
  serializeDeadEndsDoc,
  parseDeadEndsFile,
  addDeadEnd,
  retireDeadEnd,
  reopenDeadEnd,
  ENTRY_HEADING_RE_SOURCE,
}: {
  parseDeadEndsDoc: (content: string) => DocSpan[];
  serializeDeadEndsDoc: (spans: DocSpan[]) => string;
  parseDeadEndsFile: (content: string) => DeadEndEntryModel[];
  addDeadEnd: (
    cwd: string,
    opts: { approach: string; phase: string; verdict?: string; evidence?: string[]; notes?: string }
  ) => { action: 'created' | 'updated'; slug: string; total: number; retired: boolean };
  retireDeadEnd: (
    cwd: string,
    slug: string,
    reason: string
  ) => { slug: string; previous_status: string; status: string; path: string };
  reopenDeadEnd: (
    cwd: string,
    slug: string
  ) => { slug: string; previous_status: string; status: string; path: string };
  ENTRY_HEADING_RE_SOURCE: string;
} = require('../../lib/dead-ends');

interface GateEntry {
  slug: string;
  hypothesis: string;
  forbidden_terms: string[];
  approach: string;
  status: string;
}

const {
  parseDeadEnds,
  checkDeadEnds,
  summarizeDeadEnds,
}: {
  parseDeadEnds: (content: string) => GateEntry[];
  checkDeadEnds: (
    text: string,
    deadEnds: GateEntry[]
  ) => {
    hardFail: { kind: string; dead_end_slug: string; matched: string } | null;
    advisory: Array<{ dead_end_slug: string; jaccard: number }>;
  };
  summarizeDeadEnds: (deadEnds: GateEntry[]) => {
    loaded: number;
    gating: number;
    retired: string[];
    unknown_status: Array<{ slug: string; status: string }>;
  };
} = require('../../lib/commands/select-candidate');

const REPO_ROOT: string = path.resolve(__dirname, '..', '..');
const REAL: string = fs.readFileSync(path.join(REPO_ROOT, '.planning', 'DEAD-ENDS.md'), 'utf-8');

/** Slug set + forbidden_terms total, measured with the GATE's own parser. */
function gateView(content: string): { slugs: string[]; terms: number; hypotheses: number } {
  const entries = parseDeadEnds(content);
  return {
    slugs: entries.map((e) => e.slug),
    terms: entries.reduce((n, e) => n + e.forbidden_terms.length, 0),
    hypotheses: entries.filter((e) => e.hypothesis.length > 0).length,
  };
}

function spanText(span: DocSpan): string {
  return span.kind === 'raw' ? span.text : span.head + span.bodyLines.join('\n') + span.tail;
}

function entryBlocks(content: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const span of parseDeadEndsDoc(content)) {
    if (span.kind === 'entry') out.set(span.slug, spanText(span));
  }
  return out;
}

/**
 * Line-level diff restricted to what a splice may do: report every line of
 * `before` that is gone, and every line of `after` that is new.
 */
function lineDiff(before: string, after: string): { removed: string[]; added: string[] } {
  const b = before.split('\n');
  const a = after.split('\n');
  const removed: string[] = [];
  const added: string[] = [];
  let j = 0;
  for (const line of b) {
    const at = a.indexOf(line, j);
    if (at === -1) {
      removed.push(line);
      continue;
    }
    for (let k = j; k < at; k++) added.push(a[k]);
    j = at + 1;
  }
  for (let k = j; k < a.length; k++) added.push(a[k]);
  return { removed, added };
}

function seedProject(content: string = REAL): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-de-registry-'));
  fs.mkdirSync(path.join(dir, '.planning'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.planning', 'DEAD-ENDS.md'), content, 'utf-8');
  return dir;
}

function readRegistry(cwd: string): string {
  return fs.readFileSync(path.join(cwd, '.planning', 'DEAD-ENDS.md'), 'utf-8');
}

/**
 * One yaml block in the shape the real registry uses (block-form
 * `forbidden_terms`, which is the only form the gate's extractStringList
 * reads), built by hand rather than by the serializer.
 */
function handBlock(slug: string, terms: string[], extra: string[] = []): string {
  return [
    '',
    `## ${slug}`,
    '',
    '```yaml',
    `slug: ${slug}`,
    ...(terms.length > 0
      ? ['forbidden_terms:', ...terms.map((t) => `  - "${t}"`)]
      : []),
    ...extra,
    '```',
    '',
  ].join('\n');
}

describe('DEAD-ENDS registry — writer/gate contract over the real file', () => {
  const tmpDirs: string[] = [];
  afterAll(() => {
    for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true });
  });
  const project = (content?: string): string => {
    const d = seedProject(content);
    tmpDirs.push(d);
    return d;
  };

  test('the repo has a non-trivial registry to protect', () => {
    const view = gateView(REAL);
    expect(view.slugs.length).toBeGreaterThanOrEqual(6);
    expect(view.terms).toBeGreaterThanOrEqual(20);
  });

  // (1) text -> model -> text. The assertion that did not exist anywhere.
  test('parse → serialize is byte-identical on the real registry', () => {
    expect(serializeDeadEndsDoc(parseDeadEndsDoc(REAL))).toBe(REAL);
  });

  // (2) Anti-drift: the writer and the gate must agree what an entry IS.
  test('writer and gate see the same entries', () => {
    expect(parseDeadEndsFile(REAL).map((e) => e.slug)).toEqual(gateView(REAL).slugs);
    // ...because they use the same heading rule, not by coincidence.
    expect(ENTRY_HEADING_RE_SOURCE).toBe('^## ([a-z0-9][a-z0-9-]*)\\s*$');
  });

  test('a prose H2 between a heading and its fence does not change either view', () => {
    const perturbed = REAL.replace(
      '## elo-rated-plan-tournament\n',
      '## elo-rated-plan-tournament\n\nSome prose a harness markdown patch dropped in.\n'
    );
    expect(perturbed).not.toBe(REAL);
    expect(parseDeadEndsFile(perturbed).map((e) => e.slug)).toEqual(gateView(perturbed).slugs);
    expect(gateView(perturbed).terms).toBe(gateView(REAL).terms);
  });

  // (3) create is append-only: the file before the write is a byte prefix.
  test('creating an unrelated entry preserves every existing byte', () => {
    const cwd = project();
    const before = readRegistry(cwd);
    const beforeView = gateView(before);

    const res = addDeadEnd(cwd, { approach: 'A brand new unrelated approach', phase: '99-x' });
    const after = readRegistry(cwd);

    expect(res.action).toBe('created');
    expect(after.startsWith(before)).toBe(true);
    const afterView = gateView(after);
    expect(afterView.slugs).toEqual([...beforeView.slugs, 'a-brand-new-unrelated-approach']);
    // The gate's two inputs are untouched by a write about a different entry.
    expect(afterView.terms).toBe(beforeView.terms);
    expect(afterView.hypotheses).toBe(beforeView.hypotheses);
    // harness-conversion reads `date:` for latency; the existing ones survive.
    expect((after.match(/^date: /gm) ?? []).length).toBe(
      (before.match(/^date: /gm) ?? []).length + 1
    );
  });

  test('a second identical create is byte-identical (idempotent)', () => {
    const cwd = project();
    addDeadEnd(cwd, { approach: 'A brand new unrelated approach', phase: '99-x' });
    const once = readRegistry(cwd);
    addDeadEnd(cwd, { approach: 'A brand new unrelated approach', phase: '99-x', evidence: [] });
    // Same phase, no new evidence: only the documented status flip may differ.
    expect(readRegistry(cwd)).toBe(once.replace('status: active', 'status: reopened'));
  });

  // (4) update is a splice: nothing is removed, and only whitelisted keys appear.
  test('updating one entry leaves every other block byte-identical, removing no line', () => {
    const cwd = project();
    const before = readRegistry(cwd);
    const target = gateView(before).slugs[0];

    const res = addDeadEnd(cwd, {
      approach: target.replace(/-/g, ' '),
      phase: '99-y',
      evidence: ['tests/integration/dead-ends-registry.test.ts — re-encountered'],
    });
    expect(res.action).toBe('updated');
    expect(res.slug).toBe(target);

    const after = readRegistry(cwd);
    const { removed, added } = lineDiff(before, after);
    expect(removed).toEqual([]);
    for (const line of added) {
      expect(line).toMatch(/^\s*(- |tried_in_phases:|status:|notes:|retired_reason:|retired_at:)/);
    }

    // Every other entry's bytes are literally the same bytes.
    const beforeBlocks = entryBlocks(before);
    const afterBlocks = entryBlocks(after);
    for (const [slug, text] of beforeBlocks) {
      if (slug === target) continue;
      expect(afterBlocks.get(slug)).toBe(text);
    }
    // And the edited entry keeps the gate's inputs.
    const beforeEntry = parseDeadEnds(before).find((e) => e.slug === target)!;
    const afterEntry = parseDeadEnds(after).find((e) => e.slug === target)!;
    expect(afterEntry.forbidden_terms).toEqual(beforeEntry.forbidden_terms);
    expect(afterEntry.hypothesis).toBe(beforeEntry.hypothesis);
  });

  // (5) #68 end-to-end, with no hand-written fixture anywhere in the chain: the
  // bytes the WRITER produced are read back by the GATE's own parser. A quoting
  // mismatch between the two cannot pass this.
  test('retiring an entry exempts it; re-arming restores the hard-fail', () => {
    const cwd = project();
    addDeadEnd(cwd, {
      approach: 'Rank plans with an Elo widget tournament',
      phase: '99-z',
      evidence: ['nothing'],
    });
    const slug = 'rank-plans-with-an-elo-widget-tournament';
    const citing = `We should revisit ${slug} because the conditions changed.`;

    const armed = parseDeadEnds(readRegistry(cwd));
    expect(checkDeadEnds(citing, armed).hardFail).toEqual({
      kind: 'slug_citation',
      dead_end_slug: slug,
      matched: slug,
    });

    const change = retireDeadEnd(cwd, slug, 'Root cause was the scorer, fixed in phase 09');
    expect(change.previous_status).toBe('active');
    const retiredEntries = parseDeadEnds(readRegistry(cwd));
    expect(retiredEntries.find((e) => e.slug === slug)!.status).toBe('retired');
    expect(checkDeadEnds(citing, retiredEntries).hardFail).toBeNull();
    expect(summarizeDeadEnds(retiredEntries).retired).toContain(slug);
    expect(summarizeDeadEnds(retiredEntries).gating).toBe(retiredEntries.length - 1);

    // An automatic re-record must NOT undo a human's retirement.
    const re = addDeadEnd(cwd, { approach: 'Rank plans with an Elo widget tournament', phase: '99-w' });
    expect(re.retired).toBe(true);
    const stillRetired = parseDeadEnds(readRegistry(cwd));
    expect(stillRetired.find((e) => e.slug === slug)!.status).toBe('retired');
    expect(checkDeadEnds(citing, stillRetired).hardFail).toBeNull();
    // ...but the re-encounter is still recorded.
    expect(readRegistry(cwd)).toContain('99-w');

    // Re-arming is explicit.
    expect(reopenDeadEnd(cwd, slug).previous_status).toBe('retired');
    expect(checkDeadEnds(citing, parseDeadEnds(readRegistry(cwd))).hardFail).not.toBeNull();
  });

  test('retiring an entry also exempts its forbidden_terms', () => {
    const cwd = project();
    const slug = 'retirable-widget';
    fs.appendFileSync(
      path.join(cwd, '.planning', 'DEAD-ENDS.md'),
      handBlock(slug, ['retirable widget'], ['status: active']),
      'utf-8'
    );
    const describing = 'We will build a retirable widget for plan selection.';
    expect(checkDeadEnds(describing, parseDeadEnds(readRegistry(cwd))).hardFail).not.toBeNull();

    retireDeadEnd(cwd, slug, 'superseded by the deterministic scorer');
    expect(checkDeadEnds(describing, parseDeadEnds(readRegistry(cwd))).hardFail).toBeNull();
  });

  test('retire refuses without a reason, and refuses an unknown slug', () => {
    const cwd = project();
    expect(() => retireDeadEnd(cwd, gateView(REAL).slugs[0], '')).toThrow(/--reason required/);
    expect(() => retireDeadEnd(cwd, 'no-such-slug', 'because')).toThrow(/No dead-end entry/);
  });

  // (6) Lifecycle table. Only the exact value `retired` exempts.
  describe('lifecycle: not exactly `retired` implies live', () => {
    const cases: Array<{ label: string; line: string | null; exempt: boolean; unknown: boolean }> = [
      { label: 'absent', line: null, exempt: false, unknown: false },
      { label: 'active', line: 'status: active', exempt: false, unknown: false },
      { label: 'reopened', line: 'status: reopened', exempt: false, unknown: false },
      { label: 'retired (bare)', line: 'status: retired', exempt: true, unknown: false },
      { label: 'retired (quoted)', line: 'status: "retired"', exempt: true, unknown: false },
      { label: 'retired (comment)', line: 'status: retired   # human call', exempt: true, unknown: false },
      { label: 'Retired (case)', line: 'status: Retired ', exempt: true, unknown: false },
      { label: 'resolved', line: 'status: resolved', exempt: false, unknown: true },
      { label: 'superseded', line: 'status: superseded', exempt: false, unknown: true },
      { label: 'retiredish typo', line: 'status: retired-ish', exempt: false, unknown: true },
    ];

    for (const c of cases) {
      test(`status ${c.label} → ${c.exempt ? 'exempt' : 'hard-fails'}`, () => {
        const content =
          REAL +
          handBlock('lifecycle-probe', ['lifecycle probe term'], c.line ? [c.line] : []);
        const entries = parseDeadEnds(content);
        const probe = entries.find((e) => e.slug === 'lifecycle-probe')!;
        const cited = checkDeadEnds('This plan cites lifecycle-probe directly.', entries).hardFail;
        const described = checkDeadEnds('We use a lifecycle probe term here.', entries).hardFail;
        if (c.exempt) {
          expect(cited).toBeNull();
          expect(described).toBeNull();
        } else {
          expect(cited).not.toBeNull();
          expect(described).not.toBeNull();
        }
        const unknown = summarizeDeadEnds(entries).unknown_status.map((u) => u.slug);
        expect(unknown.includes('lifecycle-probe')).toBe(c.unknown);
        if (c.unknown) expect(probe.status).toBe(c.line!.replace('status: ', '').toLowerCase());
      });
    }

    test('a notes line cannot forge a retirement', () => {
      const content =
        REAL +
        handBlock('forgery-probe', ['forgery probe term'], [
          'notes: "status: retired — or so the notes claim"',
        ]);
      const entries = parseDeadEnds(content);
      expect(entries.find((e) => e.slug === 'forgery-probe')!.status).toBe('');
      expect(checkDeadEnds('We use a forgery probe term.', entries).hardFail).not.toBeNull();
    });
  });

  // (7) Ambiguity is a refusal, never a guess.
  describe('ambiguous locates throw instead of writing', () => {
    test('duplicate slug', () => {
      const dup = REAL + handBlock(gateView(REAL).slugs[0], [], ['status: active']);
      const cwd = project(dup);
      expect(() =>
        addDeadEnd(cwd, { approach: gateView(REAL).slugs[0].replace(/-/g, ' '), phase: '99-a' })
      ).toThrow(/2 blocks for slug/);
      expect(readRegistry(cwd)).toBe(dup);
    });

    test('unterminated fence', () => {
      const broken = REAL + '\n## half-written-entry\n\n```yaml\nslug: half-written-entry\n';
      const cwd = project(broken);
      expect(() => addDeadEnd(cwd, { approach: 'Half written entry', phase: '99-b' })).toThrow(
        /cannot be read/
      );
      expect(readRegistry(cwd)).toBe(broken);
    });

    test('a heading the canonical regex cannot see', () => {
      const shadow = REAL + handBlock('Shadowed-Entry', [], ['status: active']);
      const cwd = project(shadow);
      expect(() => addDeadEnd(cwd, { approach: 'Shadowed entry', phase: '99-c' })).toThrow(
        /cannot be read/
      );
      expect(readRegistry(cwd)).toBe(shadow);
    });
  });

  // (8) The other half of #67: unmodelled keys and prose survive a write.
  test('prose, unmodelled keys and a hand-typed status survive a write', () => {
    const cwd = project();
    const before = readRegistry(cwd);
    addDeadEnd(cwd, { approach: 'Yet another unrelated approach', phase: '99-d' });
    const after = readRegistry(cwd);
    for (const key of ['hypothesis:', 'predicted_outcome:', 'why_failed:', 'dead_end_added_via:']) {
      expect((after.match(new RegExp(`^${key}`, 'gm')) ?? []).length).toBe(
        (before.match(new RegExp(`^${key}`, 'gm')) ?? []).length
      );
    }
    expect(after).toContain('# Falsified approaches — do not re-propose');
  });
});
