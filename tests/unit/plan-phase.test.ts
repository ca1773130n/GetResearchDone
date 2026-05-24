/**
 * Unit tests for lib/commands/plan-phase.ts (v0.4 Phase 2).
 *
 * Covers:
 *   - parsePlanCandidates pure-function behavior (happy path + 7
 *     deliberate-failure cases the PLAN.md reflection lists)
 *   - writePlanCandidates atomic batched writes
 *   - cmdPlanPhase CLI entry: --input file, exit codes, --allow-partial,
 *     resolveEffortKnob default when --candidates is absent
 */

const fs = require('fs') as typeof import('fs');
const path = require('path') as typeof import('path');
const os = require('os') as typeof import('os');

const {
  parsePlanCandidates,
  writePlanCandidates,
  cmdPlanPhase,
}: {
  parsePlanCandidates: (
    text: string,
    expectedN: number
  ) =>
    | { ok: true; blocks: Array<{ index: number; content: string }> }
    | { ok: false; reason: string; foundIndices: number[] };
  writePlanCandidates: (
    phaseDir: string,
    blocks: Array<{ index: number; content: string }>
  ) => { written: string[] };
  cmdPlanPhase: (
    cwd: string,
    phaseNum: string,
    opts: { candidates: number; inputFile?: string; allowPartial?: boolean },
    raw: boolean
  ) => void;
} = require('../../lib/commands/plan-phase');

const { captureOutput, captureError } = require('../helpers/setup');

// ─── Fixture helpers ───────────────────────────────────────────────────────

function makeBlock(n: number, body: string = `body of plan ${n}`): string {
  return `<<<PLAN-${n}>>>\n${body}\n<<</PLAN-${n}>>>`;
}

function makeBlocks(count: number): string {
  const parts: string[] = [];
  for (let i = 1; i <= count; i++) parts.push(makeBlock(i));
  return parts.join('\n');
}

function makeFixturePhase(): { cwd: string; phaseDir: string } {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-plan-phase-'));
  fs.mkdirSync(path.join(cwd, '.planning'), { recursive: true });
  // Minimal config so loadConfig succeeds and getMilestoneInfo can read.
  fs.writeFileSync(path.join(cwd, '.planning', 'config.json'), '{}');
  fs.writeFileSync(
    path.join(cwd, '.planning', 'STATE.md'),
    '---\ncurrent_milestone: v0.4\n---\n# State\n'
  );
  fs.writeFileSync(
    path.join(cwd, '.planning', 'ROADMAP.md'),
    '# Roadmap\n\n## Milestone: v0.4\n'
  );
  const phasesDir = path.join(cwd, '.planning', 'milestones', 'v0.4', 'phases');
  const phaseDir = path.join(phasesDir, '01-test-phase');
  fs.mkdirSync(phaseDir, { recursive: true });
  return { cwd, phaseDir };
}

// ─── parsePlanCandidates: happy path ───────────────────────────────────────

describe('parsePlanCandidates — happy path', () => {
  test('exactly N valid blocks returns ok with sorted blocks', () => {
    const text = makeBlocks(3);
    const res = parsePlanCandidates(text, 3);
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('unreachable');
    expect(res.blocks.map((b) => b.index)).toEqual([1, 2, 3]);
    expect(res.blocks[0].content).toBe('body of plan 1');
    expect(res.blocks[2].content).toBe('body of plan 3');
  });

  test('N=1 with one block succeeds (backward-compat path)', () => {
    const res = parsePlanCandidates(makeBlock(1), 1);
    expect(res.ok).toBe(true);
  });

  test('out-of-order blocks are sorted in the result', () => {
    const text = `${makeBlock(3)}\n${makeBlock(1)}\n${makeBlock(2)}`;
    const res = parsePlanCandidates(text, 3);
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('unreachable');
    expect(res.blocks.map((b) => b.index)).toEqual([1, 2, 3]);
  });

  test('block content preserves embedded newlines and YAML', () => {
    const yaml = '---\nphase_number: "1"\n---\n# Plan\n\nbody';
    const text = `<<<PLAN-1>>>\n${yaml}\n<<</PLAN-1>>>`;
    const res = parsePlanCandidates(text, 1);
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('unreachable');
    expect(res.blocks[0].content).toBe(yaml);
  });
});

// ─── parsePlanCandidates: deliberate-failure cases ─────────────────────────

describe('parsePlanCandidates — fail-closed paths', () => {
  test('N-1 blocks fails with count mismatch', () => {
    const res = parsePlanCandidates(makeBlocks(2), 3);
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('unreachable');
    expect(res.reason).toMatch(/expected 3 .* found 2/);
    expect(res.foundIndices).toEqual([1, 2]);
  });

  test('N+1 blocks fails with count mismatch', () => {
    const res = parsePlanCandidates(makeBlocks(4), 3);
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('unreachable');
    expect(res.reason).toMatch(/expected 3 .* found 4/);
  });

  test('nested blocks fail', () => {
    const text = `<<<PLAN-1>>>\nouter\n<<<PLAN-2>>>\ninner\n<<</PLAN-2>>>\n<<</PLAN-1>>>`;
    const res = parsePlanCandidates(text, 2);
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('unreachable');
    expect(res.reason).toMatch(/nested/);
  });

  test('mismatched close index fails', () => {
    const text = `<<<PLAN-1>>>\nbody\n<<</PLAN-2>>>`;
    const res = parsePlanCandidates(text, 1);
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('unreachable');
    expect(res.reason).toMatch(/mismatched/);
  });

  test('orphan close (no matching open) fails', () => {
    const res = parsePlanCandidates(`<<</PLAN-1>>>`, 1);
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('unreachable');
    expect(res.reason).toMatch(/unexpected/);
  });

  test('unclosed block fails', () => {
    const res = parsePlanCandidates(`<<<PLAN-1>>>\nbody never closes`, 1);
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('unreachable');
    expect(res.reason).toMatch(/never closed/);
  });

  test('duplicate index fails', () => {
    const text = `${makeBlock(1)}\n${makeBlock(1)}\n${makeBlock(2)}`;
    const res = parsePlanCandidates(text, 3);
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('unreachable');
    // Either "found 2 blocks for 3 expected" or explicit duplicate — both are
    // valid fail-closed signals. Accept either.
    expect(res.reason).toMatch(/duplicate|expected 3/);
  });

  test('missing index (gap in 1..N) fails', () => {
    const text = `${makeBlock(1)}\n${makeBlock(3)}`;
    const res = parsePlanCandidates(text, 3);
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('unreachable');
    expect(res.reason).toMatch(/missing|expected 3/);
  });

  test('expectedN < 1 rejected', () => {
    const res = parsePlanCandidates(makeBlock(1), 0);
    expect(res.ok).toBe(false);
  });
});

// ─── writePlanCandidates ───────────────────────────────────────────────────

describe('writePlanCandidates', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-plan-write-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('writes one file per block with PLAN-i.md name', () => {
    const blocks = [
      { index: 1, content: 'plan one' },
      { index: 2, content: 'plan two' },
    ];
    const res = writePlanCandidates(tmpDir, blocks);
    expect(res.written.length).toBe(2);
    expect(fs.readFileSync(path.join(tmpDir, 'PLAN-1.md'), 'utf-8')).toBe('plan one');
    expect(fs.readFileSync(path.join(tmpDir, 'PLAN-2.md'), 'utf-8')).toBe('plan two');
  });

  test('throws when phase directory does not exist', () => {
    expect(() =>
      writePlanCandidates(path.join(tmpDir, 'nonexistent'), [{ index: 1, content: 'x' }])
    ).toThrow(/phase directory not found/);
  });

  test('writes empty block content without error', () => {
    const res = writePlanCandidates(tmpDir, [{ index: 1, content: '' }]);
    expect(res.written.length).toBe(1);
    expect(fs.readFileSync(path.join(tmpDir, 'PLAN-1.md'), 'utf-8')).toBe('');
  });
});

// ─── cmdPlanPhase: CLI entry ──────────────────────────────────────────────

describe('cmdPlanPhase — CLI entry', () => {
  test('success writes N files and outputs JSON with paths', () => {
    const { cwd, phaseDir } = makeFixturePhase();
    try {
      const inputFile = path.join(cwd, 'planner-out.txt');
      fs.writeFileSync(inputFile, makeBlocks(3));
      const { stdout, exitCode } = captureOutput(() =>
        cmdPlanPhase(cwd, '1', { candidates: 3, inputFile }, false)
      );
      expect(exitCode).toBe(0);
      const result = JSON.parse(stdout);
      expect(result.ok).toBe(true);
      expect(result.candidates).toBe(3);
      expect(result.blocksFound).toBe(3);
      expect(result.written.length).toBe(3);
      for (let i = 1; i <= 3; i++) {
        expect(fs.existsSync(path.join(phaseDir, `PLAN-${i}.md`))).toBe(true);
      }
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('count mismatch fails closed: no files written, exit 1, reason in JSON', () => {
    const { cwd, phaseDir } = makeFixturePhase();
    try {
      const inputFile = path.join(cwd, 'planner-out.txt');
      fs.writeFileSync(inputFile, makeBlocks(2)); // only 2 blocks
      const { stdout, exitCode } = captureOutput(() =>
        cmdPlanPhase(cwd, '1', { candidates: 3, inputFile }, false)
      );
      expect(exitCode).toBe(1);
      const result = JSON.parse(stdout);
      expect(result.ok).toBe(false);
      expect(result.reason).toMatch(/expected 3/);
      expect(fs.existsSync(path.join(phaseDir, 'PLAN-1.md'))).toBe(false);
      expect(fs.existsSync(path.join(phaseDir, 'PLAN-2.md'))).toBe(false);
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('--allow-partial writes whatever was valid + warns on stderr', () => {
    const { cwd, phaseDir } = makeFixturePhase();
    try {
      const inputFile = path.join(cwd, 'planner-out.txt');
      fs.writeFileSync(inputFile, makeBlocks(2)); // only 2 instead of 3
      const { stdout, exitCode } = captureOutput(() => {
        const { stderr } = captureError(() =>
          cmdPlanPhase(cwd, '1', { candidates: 3, inputFile, allowPartial: true }, false)
        );
        expect(stderr).toMatch(/--allow-partial-candidates/);
      });
      expect(exitCode).toBe(0);
      const result = JSON.parse(stdout);
      expect(result.ok).toBe(true);
      expect(result.blocksFound).toBe(2);
      expect(fs.existsSync(path.join(phaseDir, 'PLAN-1.md'))).toBe(true);
      expect(fs.existsSync(path.join(phaseDir, 'PLAN-2.md'))).toBe(true);
      expect(fs.existsSync(path.join(phaseDir, 'PLAN-3.md'))).toBe(false);
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("--candidates omitted falls back to resolveEffortKnob (balanced=3)", () => {
    const { cwd, phaseDir } = makeFixturePhase();
    try {
      const inputFile = path.join(cwd, 'planner-out.txt');
      fs.writeFileSync(inputFile, makeBlocks(3));
      const { exitCode } = captureOutput(() =>
        cmdPlanPhase(cwd, '1', { candidates: 0, inputFile }, false)
      );
      expect(exitCode).toBe(0);
      for (let i = 1; i <= 3; i++) {
        expect(fs.existsSync(path.join(phaseDir, `PLAN-${i}.md`))).toBe(true);
      }
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("--candidates from config.effort='thrifty' is 1", () => {
    const { cwd, phaseDir } = makeFixturePhase();
    try {
      fs.writeFileSync(path.join(cwd, '.planning', 'config.json'), '{"effort":"thrifty"}');
      const inputFile = path.join(cwd, 'planner-out.txt');
      fs.writeFileSync(inputFile, makeBlocks(1));
      const { exitCode } = captureOutput(() =>
        cmdPlanPhase(cwd, '1', { candidates: 0, inputFile }, false)
      );
      expect(exitCode).toBe(0);
      expect(fs.existsSync(path.join(phaseDir, 'PLAN-1.md'))).toBe(true);
      expect(fs.existsSync(path.join(phaseDir, 'PLAN-2.md'))).toBe(false);
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('unknown phase errors with exit 1', () => {
    const { cwd } = makeFixturePhase();
    try {
      const inputFile = path.join(cwd, 'planner-out.txt');
      fs.writeFileSync(inputFile, makeBlocks(3));
      const { stderr, exitCode } = captureError(() =>
        cmdPlanPhase(cwd, '99', { candidates: 3, inputFile }, false)
      );
      expect(exitCode).toBe(1);
      expect(stderr).toMatch(/phase 99 not found/);
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('--candidates > 9 rejected with sanity-bound error', () => {
    const { cwd } = makeFixturePhase();
    try {
      const inputFile = path.join(cwd, 'planner-out.txt');
      fs.writeFileSync(inputFile, makeBlocks(1));
      const { stderr, exitCode } = captureError(() =>
        cmdPlanPhase(cwd, '1', { candidates: 10, inputFile }, false)
      );
      expect(exitCode).toBe(1);
      expect(stderr).toMatch(/sanity bound of 9/);
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('--raw mode emits plain file paths instead of JSON', () => {
    const { cwd, phaseDir } = makeFixturePhase();
    try {
      const inputFile = path.join(cwd, 'planner-out.txt');
      fs.writeFileSync(inputFile, makeBlocks(2));
      const { stdout, exitCode } = captureOutput(() =>
        cmdPlanPhase(cwd, '1', { candidates: 2, inputFile }, true)
      );
      expect(exitCode).toBe(0);
      expect(stdout).toContain(path.join(phaseDir, 'PLAN-1.md'));
      expect(stdout).toContain(path.join(phaseDir, 'PLAN-2.md'));
      expect(stdout).not.toMatch(/^\{/); // not JSON
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });
});
