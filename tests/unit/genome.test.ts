/**
 * Unit tests for lib/genome.ts — Tier-2 #8 write follow-up.
 *
 * Three operations: init / show / snapshot. The rollback policy is
 * git-based (PR #39); these tests pin the in-tool contracts:
 *
 *   - init never overwrites an existing GENOME.md
 *   - snapshot only APPENDS new dated sections (never mutates prior)
 *   - show prints raw content
 *   - all writes go through atomicWriteFileSync
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { captureOutput, captureError } = require('../helpers/setup');

const {
  cmdGenomeInit,
  cmdGenomeShow,
  cmdGenomeSnapshot,
  cmdGenomePromoteSuggestion,
  runGenomeSnapshot,
  GenomeSplitIndexError,
} = require('../../lib/genome');

function makeProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-genome-'));
  fs.mkdirSync(path.join(dir, '.planning'), { recursive: true });
  return dir;
}

function writePhase(projectDir: string, num: string, verdict?: string): void {
  const dir = path.join(
    projectDir,
    '.planning',
    'milestones',
    'm1',
    'phases',
    `${num}-phase`
  );
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, `${num}-01-SUMMARY.md`),
    `---\nphase: ${num}\n---\n\n## Accomplishments\n- did things\n`,
    'utf-8'
  );
  if (verdict) {
    fs.writeFileSync(
      path.join(dir, `${num}-01-VERIFICATION.md`),
      [
        '# Verification',
        '',
        '## Reflection',
        '',
        '| Field | Value |',
        '|-------|-------|',
        '| hypothesis | sample |',
        '| predicted_outcome | predicted |',
        '| actual_outcome | actual |',
        `| verdict | ${verdict} |`,
        '| evidence | foo.ts:1 |',
      ].join('\n'),
      'utf-8'
    );
  }
}

// ─── cmdGenomeInit ─────────────────────────────────────────────────────────

describe('cmdGenomeInit', () => {
  let projectDir: string;
  beforeEach(() => {
    projectDir = makeProject();
  });
  afterEach(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  test('creates GENOME.md with starter template', () => {
    const { stdout, exitCode } = captureOutput(() => cmdGenomeInit(projectDir, false));
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.action).toBe('created');
    const filePath = path.join(projectDir, '.planning', 'GENOME.md');
    expect(fs.existsSync(filePath)).toBe(true);
    const body = fs.readFileSync(filePath, 'utf-8');
    expect(body).toContain('# Strategy Genome');
    expect(body).toContain('## Heuristics in use');
    expect(body).toContain('## Agent preferences');
    expect(body).toContain('## Verdict thresholds');
    expect(body).toContain('## Snapshots');
  });

  test('refuses to overwrite an existing GENOME.md', () => {
    fs.writeFileSync(
      path.join(projectDir, '.planning', 'GENOME.md'),
      '# Existing\nDo not lose this.\n',
      'utf-8'
    );
    const { stderr, exitCode } = captureError(() => cmdGenomeInit(projectDir, false));
    expect(exitCode).toBe(1);
    expect(stderr).toMatch(/already exists/);
    // File untouched
    const body = fs.readFileSync(path.join(projectDir, '.planning', 'GENOME.md'), 'utf-8');
    expect(body).toContain('Do not lose this');
  });
});

// ─── cmdGenomeShow ─────────────────────────────────────────────────────────

describe('cmdGenomeShow', () => {
  let projectDir: string;
  beforeEach(() => {
    projectDir = makeProject();
  });
  afterEach(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  test('returns exists:false when file missing', () => {
    const { stdout, exitCode } = captureOutput(() => cmdGenomeShow(projectDir, false));
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.exists).toBe(false);
    expect(result.content).toBeNull();
  });

  test('returns exists:true + content when file present', () => {
    fs.writeFileSync(
      path.join(projectDir, '.planning', 'GENOME.md'),
      '# Strategy Genome\n\nFoo bar.\n',
      'utf-8'
    );
    const { stdout } = captureOutput(() => cmdGenomeShow(projectDir, false));
    const result = JSON.parse(stdout);
    expect(result.exists).toBe(true);
    expect(result.content).toContain('Foo bar');
  });
});

// ─── cmdGenomeSnapshot ────────────────────────────────────────────────────

describe('cmdGenomeSnapshot', () => {
  let projectDir: string;
  beforeEach(() => {
    projectDir = makeProject();
  });
  afterEach(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  test('creates GENOME.md with starter + first snapshot when absent', () => {
    const { stdout, exitCode } = captureOutput(() => cmdGenomeSnapshot(projectDir, false));
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.action).toBe('created');
    expect(result.snapshot_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const body = fs.readFileSync(
      path.join(projectDir, '.planning', 'GENOME.md'),
      'utf-8'
    );
    // Starter template + appended snapshot
    expect(body).toContain('# Strategy Genome');
    expect(body).toMatch(/## Snapshot \d{4}-\d{2}-\d{2}/);
    expect(body).toContain('| completed_phases |');
    expect(body).toContain('| drift_weighted |');
    expect(body).toContain('| verdicts.confirmed |');
  });

  test('appends to existing GENOME.md without mutating prior content', () => {
    const existing = '# Strategy Genome\n\n## Heuristics in use\n\n- Custom heuristic.\n';
    fs.writeFileSync(
      path.join(projectDir, '.planning', 'GENOME.md'),
      existing,
      'utf-8'
    );
    const { stdout } = captureOutput(() => cmdGenomeSnapshot(projectDir, false));
    const result = JSON.parse(stdout);
    expect(result.action).toBe('appended');
    const body = fs.readFileSync(
      path.join(projectDir, '.planning', 'GENOME.md'),
      'utf-8'
    );
    // Prior content preserved
    expect(body).toContain('Custom heuristic.');
    // Snapshot appended
    expect(body).toMatch(/## Snapshot \d{4}-\d{2}-\d{2}/);
  });

  test('snapshot table reflects current project state', () => {
    writePhase(projectDir, '01', 'confirmed');
    writePhase(projectDir, '02', 'falsified');
    writePhase(projectDir, '03', 'partial');
    // DEAD-ENDS.md count
    fs.writeFileSync(
      path.join(projectDir, '.planning', 'DEAD-ENDS.md'),
      '## slug-a\n```yaml\n```\n\n## slug-b\n```yaml\n```\n',
      'utf-8'
    );

    captureOutput(() => cmdGenomeSnapshot(projectDir, false));
    const body = fs.readFileSync(
      path.join(projectDir, '.planning', 'GENOME.md'),
      'utf-8'
    );
    expect(body).toMatch(/\| completed_phases \| 3 \|/);
    expect(body).toMatch(/\| dead_ends_registered \| 2 \|/);
    expect(body).toMatch(/\| verdicts\.confirmed \| 1 \|/);
    expect(body).toMatch(/\| verdicts\.falsified \| 1 \|/);
    expect(body).toMatch(/\| verdicts\.partial \| 1 \|/);
  });

  test('show reassembles split-index GENOME.md (codex r2 P2 on PR #43)', () => {
    // GRD-INDEX with one partial. cmdGenomeShow must return the
    // reassembled content (what planner sees), not the stub.
    fs.writeFileSync(
      path.join(projectDir, '.planning', 'GENOME.partial.md'),
      '# Strategy Genome\n\n## Heuristics\n- Real content lives here.\n',
      'utf-8'
    );
    fs.writeFileSync(
      path.join(projectDir, '.planning', 'GENOME.md'),
      ['<!-- GRD-INDEX -->', '', '- [part1](./GENOME.partial.md)', ''].join('\n'),
      'utf-8'
    );
    const { stdout } = captureOutput(() => cmdGenomeShow(projectDir, false));
    const result = JSON.parse(stdout);
    expect(result.exists).toBe(true);
    expect(result.content).toContain('Real content lives here');
    expect(result.content).not.toContain('<!-- GRD-INDEX -->');
  });

  test('refuses to append to split-index GENOME.md (codex r1 P2 on PR #43)', () => {
    // If GENOME.md has been split into a GRD-INDEX file, appending to
    // the stub would silently fail to reach the planner — the planner
    // reads via safeReadMarkdown which only follows linked partials.
    fs.writeFileSync(
      path.join(projectDir, '.planning', 'GENOME.md'),
      ['<!-- GRD-INDEX -->', '', '- [part1](./GENOME.part1.md)', ''].join('\n'),
      'utf-8'
    );
    const { stderr, exitCode } = captureError(() =>
      cmdGenomeSnapshot(projectDir, false)
    );
    expect(exitCode).toBe(1);
    expect(stderr).toMatch(/split-index format/);
    expect(stderr).toMatch(/never reach planner context/);
    // Index stub must be untouched
    const after = fs.readFileSync(
      path.join(projectDir, '.planning', 'GENOME.md'),
      'utf-8'
    );
    expect(after).not.toMatch(/## Snapshot /);
  });

  test('snapshot reassembles split VERIFICATION.md when counting verdicts (codex r2 P2 on PR #43)', () => {
    // Create one phase with a split VERIFICATION.md. Pre-fix, the stub
    // would be read instead of the reassembled content, parseReflectionSection
    // would return null, and the snapshot would undercount the verdict.
    const phaseDir = path.join(
      projectDir,
      '.planning',
      'milestones',
      'm1',
      'phases',
      '01-phase'
    );
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(
      path.join(phaseDir, '01-01-SUMMARY.md'),
      '---\nphase: 01\n---\n\n## Accomplishments\n- did things\n',
      'utf-8'
    );
    // Split VERIFICATION.md: index + partial with the Reflection.
    fs.writeFileSync(
      path.join(phaseDir, '01-01-VERIFICATION.partial.md'),
      [
        '# Verification',
        '',
        '## Reflection',
        '',
        '| Field | Value |',
        '|-------|-------|',
        '| hypothesis | sample |',
        '| predicted_outcome | predicted |',
        '| actual_outcome | actual |',
        '| verdict | confirmed |',
        '| evidence | foo.ts:1 |',
      ].join('\n'),
      'utf-8'
    );
    fs.writeFileSync(
      path.join(phaseDir, '01-01-VERIFICATION.md'),
      [
        '<!-- GRD-INDEX -->',
        '',
        '- [part1](./01-01-VERIFICATION.partial.md)',
        '',
      ].join('\n'),
      'utf-8'
    );

    captureOutput(() => cmdGenomeSnapshot(projectDir, false));
    const body = fs.readFileSync(
      path.join(projectDir, '.planning', 'GENOME.md'),
      'utf-8'
    );
    expect(body).toMatch(/\| verdicts\.confirmed \| 1 \|/);
  });

  test('snapshot reassembles split DEAD-ENDS.md when counting (codex r2 P2 on PR #43)', () => {
    fs.writeFileSync(
      path.join(projectDir, '.planning', 'DEAD-ENDS.partial.md'),
      ['## slug-x', '```yaml', '```', '', '## slug-y', '```yaml', '```', ''].join('\n'),
      'utf-8'
    );
    fs.writeFileSync(
      path.join(projectDir, '.planning', 'DEAD-ENDS.md'),
      ['<!-- GRD-INDEX -->', '', '- [part1](./DEAD-ENDS.partial.md)', ''].join('\n'),
      'utf-8'
    );
    captureOutput(() => cmdGenomeSnapshot(projectDir, false));
    const body = fs.readFileSync(
      path.join(projectDir, '.planning', 'GENOME.md'),
      'utf-8'
    );
    expect(body).toMatch(/\| dead_ends_registered \| 2 \|/);
  });

  // ─── runGenomeSnapshot pure helper (Tier-2 #8 auto-genome follow-up) ──

  test('runGenomeSnapshot returns result without exiting', () => {
    const r = runGenomeSnapshot(projectDir);
    expect(r.action).toBe('created');
    expect(r.snapshot_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(r.path).toContain('GENOME.md');
    expect(fs.existsSync(path.join(projectDir, '.planning', 'GENOME.md'))).toBe(true);
  });

  test('runGenomeSnapshot throws GenomeSplitIndexError on split-index file', () => {
    fs.writeFileSync(
      path.join(projectDir, '.planning', 'GENOME.md'),
      ['<!-- GRD-INDEX -->', '', '- [part1](./GENOME.partial.md)', ''].join('\n'),
      'utf-8'
    );
    expect(() => runGenomeSnapshot(projectDir)).toThrow(GenomeSplitIndexError);
    expect(() => runGenomeSnapshot(projectDir)).toThrow(/split-index/);
  });

  test('repeated snapshots both append (history-preserving)', () => {
    captureOutput(() => cmdGenomeSnapshot(projectDir, false));
    captureOutput(() => cmdGenomeSnapshot(projectDir, false));
    const body = fs.readFileSync(
      path.join(projectDir, '.planning', 'GENOME.md'),
      'utf-8'
    );
    // Two snapshot headers (same date today, so they collide visually
    // but are written as two distinct sections — codex r-future may
    // ask us to de-dup or version; for now we preserve both lines as
    // history of *when* the command was run).
    const matches = body.match(/^## Snapshot /gm) ?? [];
    expect(matches.length).toBe(2);
  });
});

// ─── cmdGenomePromoteSuggestion (v0.4 Phase 5) ──────────────────────────────

describe('cmdGenomePromoteSuggestion', () => {
  const SUGGESTIONS = [
    '# GENOME suggestions (auto-generated — NOT read by the planner)',
    '',
    '## Run 2026-05-24',
    '',
    '- Plans containing "refactor" have 90% confirmed (baseline 60%, n=12, raw_p=0.0025, fdr_q=0.02, effect_size=+0.30).',
    '  Suggested heuristic: "Plans involving `refactor` succeed more often than baseline."',
    '  Promote with: `gd genome promote-suggestion refactor-rate`',
    '',
  ].join('\n');

  test('promotes a suggestion into GENOME.md under the promoted section', () => {
    const projectDir = makeProject();
    try {
      fs.writeFileSync(path.join(projectDir, '.planning', 'GENOME-SUGGESTIONS.md'), SUGGESTIONS);
      fs.writeFileSync(path.join(projectDir, '.planning', 'GENOME.md'), '# GENOME\n\nbody\n');
      const { stdout, exitCode } = captureOutput(() =>
        cmdGenomePromoteSuggestion(projectDir, 'refactor-rate', false)
      );
      expect(exitCode).toBe(0);
      const result = JSON.parse(stdout);
      expect(result.promoted).toBe('refactor-rate');
      const genome = fs.readFileSync(path.join(projectDir, '.planning', 'GENOME.md'), 'utf-8');
      expect(genome).toMatch(/## Heuristics in use \(promoted\)/);
      expect(genome).toMatch(/Plans involving `refactor` succeed more often/);
      expect(genome).toMatch(/promoted .* from suggestion `refactor-rate`/);
    } finally {
      fs.rmSync(projectDir, { recursive: true, force: true });
    }
  });

  test('unknown slug errors (exit 1)', () => {
    const projectDir = makeProject();
    try {
      fs.writeFileSync(path.join(projectDir, '.planning', 'GENOME-SUGGESTIONS.md'), SUGGESTIONS);
      const { stderr, exitCode } = captureError(() =>
        cmdGenomePromoteSuggestion(projectDir, 'nonexistent-rate', false)
      );
      expect(exitCode).toBe(1);
      expect(stderr).toMatch(/not found/);
    } finally {
      fs.rmSync(projectDir, { recursive: true, force: true });
    }
  });

  test('missing GENOME-SUGGESTIONS.md errors with guidance', () => {
    const projectDir = makeProject();
    try {
      const { stderr, exitCode } = captureError(() =>
        cmdGenomePromoteSuggestion(projectDir, 'refactor-rate', false)
      );
      expect(exitCode).toBe(1);
      expect(stderr).toMatch(/no GENOME-SUGGESTIONS\.md|gd patterns/);
    } finally {
      fs.rmSync(projectDir, { recursive: true, force: true });
    }
  });

  test('empty slug errors', () => {
    const projectDir = makeProject();
    try {
      const { stderr, exitCode } = captureError(() =>
        cmdGenomePromoteSuggestion(projectDir, '', false)
      );
      expect(exitCode).toBe(1);
      expect(stderr).toMatch(/slug required/);
    } finally {
      fs.rmSync(projectDir, { recursive: true, force: true });
    }
  });

  test('repeated slug across runs promotes the LATEST run (codex P2)', () => {
    const projectDir = makeProject();
    try {
      // Two run blocks for the same slug; the later one flips direction.
      const sugg = [
        '# GENOME suggestions',
        '',
        '## Run 2026-05-01',
        '',
        '- old stats.',
        '  Suggested heuristic: "OLD: refactor succeeds more often."',
        '  Promote with: `gd genome promote-suggestion refactor-rate`',
        '',
        '## Run 2026-05-24',
        '',
        '- new stats.',
        '  Suggested heuristic: "NEW: refactor succeeds less often."',
        '  Promote with: `gd genome promote-suggestion refactor-rate`',
        '',
      ].join('\n');
      fs.writeFileSync(path.join(projectDir, '.planning', 'GENOME-SUGGESTIONS.md'), sugg);
      captureOutput(() => cmdGenomePromoteSuggestion(projectDir, 'refactor-rate', false));
      const genome = fs.readFileSync(path.join(projectDir, '.planning', 'GENOME.md'), 'utf-8');
      expect(genome).toMatch(/NEW: refactor succeeds less often/);
      expect(genome).not.toMatch(/OLD: refactor succeeds more often/);
    } finally {
      fs.rmSync(projectDir, { recursive: true, force: true });
    }
  });

  test('exact slug match: "refactor-rate" does not collide with "refactor-rate-2"', () => {
    const projectDir = makeProject();
    try {
      const sugg = [
        '# GENOME suggestions',
        '',
        '## Run 2026-05-24',
        '',
        '- a.',
        '  Suggested heuristic: "heuristic for the two variant."',
        '  Promote with: `gd genome promote-suggestion refactor-rate-2`',
        '',
        '- b.',
        '  Suggested heuristic: "heuristic for the base variant."',
        '  Promote with: `gd genome promote-suggestion refactor-rate`',
        '',
      ].join('\n');
      fs.writeFileSync(path.join(projectDir, '.planning', 'GENOME-SUGGESTIONS.md'), sugg);
      captureOutput(() => cmdGenomePromoteSuggestion(projectDir, 'refactor-rate', false));
      const genome = fs.readFileSync(path.join(projectDir, '.planning', 'GENOME.md'), 'utf-8');
      expect(genome).toMatch(/heuristic for the base variant/);
      expect(genome).not.toMatch(/heuristic for the two variant/);
    } finally {
      fs.rmSync(projectDir, { recursive: true, force: true });
    }
  });
});
