'use strict';

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

import {
  loadCorpus,
  saveCorpusEntry,
  scoreComposite,
  createDefaultRubric,
  formatBenchmarkReport,
} from '../../lib/benchmark';

import type {
  BenchmarkEntry,
  BenchmarkResult,
  ScoringRubric,
  IntegrationCategory,
  SemanticScore,
  TrainabilityMetrics,
} from '../../lib/types';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeEntry(overrides: Partial<BenchmarkEntry> = {}): BenchmarkEntry {
  return {
    id: 'test-paper',
    title: 'Test Paper',
    source: 'arxiv:0000.00000',
    category: 'directly-integrable',
    tags: ['nerf', 'test'],
    added_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeSemantic(overrides: Partial<SemanticScore> = {}): SemanticScore {
  return {
    novelty_capture: 0.8,
    api_surface_match: 0.9,
    algorithmic_fidelity: 0.7,
    notes: '',
    ...overrides,
  };
}

function makeTrainability(overrides: Partial<TrainabilityMetrics> = {}): TrainabilityMetrics {
  return {
    build_success: true,
    runtime_stable: true,
    convergence_detected: true,
    execution_time_ms: 1000,
    error_log: '',
    ...overrides,
  };
}

function makeResult(
  entryId: string,
  semantic: SemanticScore,
  trainability: TrainabilityMetrics,
  compositeScore: number,
  overrides: Partial<BenchmarkResult> = {},
): BenchmarkResult {
  return {
    entry_id: entryId,
    semantic,
    trainability,
    composite_score: compositeScore,
    rubric_version: '1.0',
    evaluated_at: '2026-01-02T00:00:00Z',
    evaluator: 'test',
    ...overrides,
  };
}

// ─── loadCorpus tests ─────────────────────────────────────────────────────────

describe('loadCorpus', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-benchmark-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns empty array for a non-existent directory', () => {
    const result = loadCorpus(path.join(tmpDir, 'nonexistent'));
    expect(result).toEqual([]);
  });

  it('returns empty array for an empty directory', () => {
    const result = loadCorpus(tmpDir);
    expect(result).toEqual([]);
  });

  it('reads JSON files and returns BenchmarkEntry[]', () => {
    const entry1 = makeEntry({ id: 'paper-a', added_at: '2026-01-01T00:00:00Z' });
    const entry2 = makeEntry({ id: 'paper-b', added_at: '2026-02-01T00:00:00Z' });
    fs.writeFileSync(path.join(tmpDir, 'paper-a.json'), JSON.stringify(entry1));
    fs.writeFileSync(path.join(tmpDir, 'paper-b.json'), JSON.stringify(entry2));

    const result = loadCorpus(tmpDir);
    expect(result).toHaveLength(2);
    expect(result.map((e) => e.id)).toContain('paper-a');
    expect(result.map((e) => e.id)).toContain('paper-b');
  });

  it('sorts entries by added_at descending (newest first)', () => {
    const older = makeEntry({ id: 'older', added_at: '2026-01-01T00:00:00Z' });
    const newer = makeEntry({ id: 'newer', added_at: '2026-03-01T00:00:00Z' });
    fs.writeFileSync(path.join(tmpDir, 'older.json'), JSON.stringify(older));
    fs.writeFileSync(path.join(tmpDir, 'newer.json'), JSON.stringify(newer));

    const result = loadCorpus(tmpDir);
    expect(result[0].id).toBe('newer');
    expect(result[1].id).toBe('older');
  });

  it('skips files that fail JSON.parse and logs a warning to stderr', () => {
    fs.writeFileSync(path.join(tmpDir, 'bad.json'), 'NOT JSON {{{');
    const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);

    const result = loadCorpus(tmpDir);
    expect(result).toHaveLength(0);
    stderrSpy.mockRestore();
  });

  it('ignores non-JSON files in the directory', () => {
    const entry = makeEntry({ id: 'valid' });
    fs.writeFileSync(path.join(tmpDir, 'valid.json'), JSON.stringify(entry));
    fs.writeFileSync(path.join(tmpDir, 'readme.txt'), 'ignore me');
    fs.writeFileSync(path.join(tmpDir, 'notes.md'), '# notes');

    const result = loadCorpus(tmpDir);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('valid');
  });
});

// ─── saveCorpusEntry tests ────────────────────────────────────────────────────

describe('saveCorpusEntry', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-benchmark-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes entry as JSON to corpusDir/{id}.json', () => {
    const entry = makeEntry({ id: 'my-paper' });
    const corpusDir = path.join(tmpDir, 'corpus');
    saveCorpusEntry(corpusDir, entry);

    const filePath = path.join(corpusDir, 'my-paper.json');
    expect(fs.existsSync(filePath)).toBe(true);
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as BenchmarkEntry;
    expect(parsed).toEqual(entry);
  });

  it('creates corpusDir if it does not exist', () => {
    const entry = makeEntry({ id: 'auto-created' });
    const corpusDir = path.join(tmpDir, 'deep', 'nested', 'corpus');
    expect(fs.existsSync(corpusDir)).toBe(false);
    saveCorpusEntry(corpusDir, entry);
    expect(fs.existsSync(corpusDir)).toBe(true);
  });

  it('writes pretty-printed JSON', () => {
    const entry = makeEntry({ id: 'pretty' });
    const corpusDir = path.join(tmpDir, 'corpus2');
    saveCorpusEntry(corpusDir, entry);

    const content = fs.readFileSync(path.join(corpusDir, 'pretty.json'), 'utf8');
    // pretty-printed JSON contains newlines
    expect(content).toContain('\n');
  });
});

// ─── scoreComposite tests ─────────────────────────────────────────────────────

describe('scoreComposite', () => {
  const rubric = createDefaultRubric();

  it('computes correct composite from semantic and trainability inputs', () => {
    const semantic = makeSemantic({ novelty_capture: 1.0, api_surface_match: 1.0, algorithmic_fidelity: 1.0 });
    const trainability = makeTrainability({ build_success: true, runtime_stable: true, convergence_detected: true });
    const result = scoreComposite(semantic, trainability, rubric, 'directly-integrable');

    // semantic sub = (1+1+1)/3 = 1.0, trainability sub = 0.4+0.3+0.3 = 1.0
    // composite = (1.0 * 0.6 + 1.0 * 0.4) * 1.0 = 1.0
    expect(result).toBeCloseTo(1.0, 5);
  });

  it('applies category_adjustments multiplier', () => {
    const semantic = makeSemantic({ novelty_capture: 1.0, api_surface_match: 1.0, algorithmic_fidelity: 1.0 });
    const trainability = makeTrainability({ build_success: true, runtime_stable: true, convergence_detected: true });

    const outOfScopeResult = scoreComposite(semantic, trainability, rubric, 'out-of-scope');
    const directResult = scoreComposite(semantic, trainability, rubric, 'directly-integrable');

    // out-of-scope multiplier is 0.5, directly-integrable is 1.0
    expect(outOfScopeResult).toBeCloseTo(0.5, 5);
    expect(directResult).toBeCloseTo(1.0, 5);
  });

  it('clamps output to [0, 1] for edge-case rubric values', () => {
    const semantic = makeSemantic({ novelty_capture: 0.0, api_surface_match: 0.0, algorithmic_fidelity: 0.0 });
    const trainability = makeTrainability({ build_success: false, runtime_stable: false, convergence_detected: false });
    const result = scoreComposite(semantic, trainability, rubric, 'directly-integrable');
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(1);
  });

  it('clamps output at 1 when category_adjustment > 1.0', () => {
    const boostRubric: ScoringRubric = {
      ...rubric,
      category_adjustments: {
        ...rubric.category_adjustments,
        'directly-integrable': 2.0, // would produce > 1
      },
    };
    const semantic = makeSemantic({ novelty_capture: 1.0, api_surface_match: 1.0, algorithmic_fidelity: 1.0 });
    const trainability = makeTrainability({ build_success: true, runtime_stable: true, convergence_detected: true });
    const result = scoreComposite(semantic, trainability, boostRubric, 'directly-integrable');
    expect(result).toBeLessThanOrEqual(1.0);
  });

  it('weights trainability booleans correctly (build 0.4, runtime 0.3, convergence 0.3)', () => {
    const semantic = makeSemantic({ novelty_capture: 0.0, api_surface_match: 0.0, algorithmic_fidelity: 0.0 });
    // Only build_success passes
    const trainability = makeTrainability({ build_success: true, runtime_stable: false, convergence_detected: false });
    const result = scoreComposite(semantic, trainability, rubric, 'directly-integrable');

    // semantic sub = 0, trainability sub = 0.4
    // composite = (0 * 0.6 + 0.4 * 0.4) * 1.0 = 0.16
    expect(result).toBeCloseTo(0.16, 5);
  });
});

// ─── createDefaultRubric tests ────────────────────────────────────────────────

describe('createDefaultRubric', () => {
  it('returns a rubric where semantic_weight + trainability_weight = 1.0', () => {
    const rubric = createDefaultRubric();
    expect(rubric.semantic_weight + rubric.trainability_weight).toBeCloseTo(1.0, 10);
  });

  it('has semantic_weight of 0.6 and trainability_weight of 0.4', () => {
    const rubric = createDefaultRubric();
    expect(rubric.semantic_weight).toBeCloseTo(0.6, 5);
    expect(rubric.trainability_weight).toBeCloseTo(0.4, 5);
  });

  it('includes all four IntegrationCategory adjustments', () => {
    const rubric = createDefaultRubric();
    const categories: IntegrationCategory[] = [
      'directly-integrable',
      'requires-external-models',
      'out-of-scope',
      'novelty-coverage',
    ];
    for (const cat of categories) {
      expect(rubric.category_adjustments[cat]).toBeDefined();
      expect(typeof rubric.category_adjustments[cat]).toBe('number');
    }
  });

  it('directly-integrable adjustment is 1.0 (no penalty)', () => {
    const rubric = createDefaultRubric();
    expect(rubric.category_adjustments['directly-integrable']).toBe(1.0);
  });

  it('out-of-scope adjustment is 0.5 (heaviest penalty)', () => {
    const rubric = createDefaultRubric();
    expect(rubric.category_adjustments['out-of-scope']).toBe(0.5);
  });
});

// ─── formatBenchmarkReport tests ─────────────────────────────────────────────

describe('formatBenchmarkReport', () => {
  it('returns a string with H2 heading "## Benchmark Results"', () => {
    const output = formatBenchmarkReport([], []);
    expect(output).toContain('## Benchmark Results');
  });

  it('includes summary line with entry count', () => {
    const entry = makeEntry({ id: 'p1', title: 'Paper One' });
    const semantic = makeSemantic();
    const trainability = makeTrainability();
    const result = makeResult('p1', semantic, trainability, 0.75);
    const output = formatBenchmarkReport([result], [entry]);
    expect(output).toContain('1 entries evaluated');
  });

  it('includes a markdown table with required columns', () => {
    const output = formatBenchmarkReport([], []);
    expect(output).toContain('| Paper |');
    expect(output).toContain('| Category |');
    expect(output).toContain('| Semantic |');
    expect(output).toContain('| Trainability |');
    expect(output).toContain('| Composite |');
  });

  it('displays PASS when build_success AND runtime_stable are both true', () => {
    const entry = makeEntry({ id: 'p1' });
    const semantic = makeSemantic();
    const trainability = makeTrainability({ build_success: true, runtime_stable: true });
    const result = makeResult('p1', semantic, trainability, 0.8);
    const output = formatBenchmarkReport([result], [entry]);
    expect(output).toContain('PASS');
  });

  it('displays FAIL when build_success is false', () => {
    const entry = makeEntry({ id: 'p1' });
    const semantic = makeSemantic();
    const trainability = makeTrainability({ build_success: false, runtime_stable: true });
    const result = makeResult('p1', semantic, trainability, 0.3);
    const output = formatBenchmarkReport([result], [entry]);
    expect(output).toContain('FAIL');
  });

  it('displays FAIL when runtime_stable is false', () => {
    const entry = makeEntry({ id: 'p1' });
    const semantic = makeSemantic();
    const trainability = makeTrainability({ build_success: true, runtime_stable: false });
    const result = makeResult('p1', semantic, trainability, 0.3);
    const output = formatBenchmarkReport([result], [entry]);
    expect(output).toContain('FAIL');
  });

  it('formats composite score to 2 decimal places', () => {
    const entry = makeEntry({ id: 'p1' });
    const semantic = makeSemantic();
    const trainability = makeTrainability();
    const result = makeResult('p1', semantic, trainability, 0.756789);
    const output = formatBenchmarkReport([result], [entry]);
    expect(output).toContain('0.76');
  });

  it('shows entry title and category in the row', () => {
    const entry = makeEntry({ id: 'p1', title: 'My Paper Title', category: 'requires-external-models' });
    const semantic = makeSemantic();
    const trainability = makeTrainability();
    const result = makeResult('p1', semantic, trainability, 0.5);
    const output = formatBenchmarkReport([result], [entry]);
    expect(output).toContain('My Paper Title');
    expect(output).toContain('requires-external-models');
  });

  it('includes average composite row for multiple results', () => {
    const entry1 = makeEntry({ id: 'p1', title: 'Paper 1' });
    const entry2 = makeEntry({ id: 'p2', title: 'Paper 2' });
    const semantic = makeSemantic();
    const trainability = makeTrainability();
    const result1 = makeResult('p1', semantic, trainability, 0.6);
    const result2 = makeResult('p2', semantic, trainability, 0.8);
    const output = formatBenchmarkReport([result1, result2], [entry1, entry2]);
    // average of 0.6 and 0.8 = 0.70
    expect(output).toContain('0.70');
  });
});
