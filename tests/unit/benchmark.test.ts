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
  classifyEntry,
  scoreSemanticFromSummary,
  assessTrainability,
  evaluateEntry,
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

// ─── classifyEntry tests ──────────────────────────────────────────────────────

describe('classifyEntry', () => {
  it('returns directly-integrable for entries with no special tags', () => {
    const entry = makeEntry({ tags: ['nerf', 'rendering', 'volumetric'] });
    expect(classifyEntry(entry)).toBe('directly-integrable');
  });

  it('returns requires-external-models for entries with pretrained tag', () => {
    const entry = makeEntry({ tags: ['nerf', 'pretrained'] });
    expect(classifyEntry(entry)).toBe('requires-external-models');
  });

  it('returns requires-external-models for entries with foundation-model tag', () => {
    const entry = makeEntry({ tags: ['foundation-model', 'generative'] });
    expect(classifyEntry(entry)).toBe('requires-external-models');
  });

  it('returns requires-external-models for entries with external-weights tag', () => {
    const entry = makeEntry({ tags: ['external-weights', 'diffusion'] });
    expect(classifyEntry(entry)).toBe('requires-external-models');
  });

  it('returns requires-external-models for entries with fine-tuned tag', () => {
    const entry = makeEntry({ tags: ['fine-tuned', 'gpt'] });
    expect(classifyEntry(entry)).toBe('requires-external-models');
  });

  it('returns out-of-scope for entries with hardware-specific tag', () => {
    const entry = makeEntry({ tags: ['hardware-specific', 'fpga'] });
    expect(classifyEntry(entry)).toBe('out-of-scope');
  });

  it('returns out-of-scope for entries with proprietary-data tag', () => {
    const entry = makeEntry({ tags: ['proprietary-data', 'medical'] });
    expect(classifyEntry(entry)).toBe('out-of-scope');
  });

  it('returns out-of-scope for entries with closed-source tag', () => {
    const entry = makeEntry({ tags: ['closed-source', 'api-only'] });
    expect(classifyEntry(entry)).toBe('out-of-scope');
  });

  it('returns novelty-coverage for entries with novel-loss tag', () => {
    const entry = makeEntry({ tags: ['novel-loss', 'optimization'] });
    expect(classifyEntry(entry)).toBe('novelty-coverage');
  });

  it('returns novelty-coverage for entries with novel-architecture tag', () => {
    const entry = makeEntry({ tags: ['novel-architecture', 'transformer'] });
    expect(classifyEntry(entry)).toBe('novelty-coverage');
  });

  it('returns novelty-coverage for entries with novel-representation tag', () => {
    const entry = makeEntry({ tags: ['novel-representation', '3d-gaussian'] });
    expect(classifyEntry(entry)).toBe('novelty-coverage');
  });

  it('out-of-scope wins over requires-external-models when both match', () => {
    const entry = makeEntry({ tags: ['hardware-specific', 'pretrained'] });
    expect(classifyEntry(entry)).toBe('out-of-scope');
  });

  it('requires-external-models wins over novelty-coverage when both match', () => {
    const entry = makeEntry({ tags: ['pretrained', 'novel-architecture'] });
    expect(classifyEntry(entry)).toBe('requires-external-models');
  });

  it('novelty-coverage wins over directly-integrable when novelty tag present', () => {
    const entry = makeEntry({ tags: ['novel-loss', 'rendering'] });
    expect(classifyEntry(entry)).toBe('novelty-coverage');
  });

  it('is case-insensitive for tag matching', () => {
    const entry = makeEntry({ tags: ['Pretrained', 'NeRF'] });
    expect(classifyEntry(entry)).toBe('requires-external-models');
  });
});

// ─── scoreSemanticFromSummary tests ───────────────────────────────────────────

describe('scoreSemanticFromSummary', () => {
  it('parses a well-formed summary with all three score fields', () => {
    const summary = [
      'novelty_capture: 0.8',
      'api_surface_match: 0.75',
      'algorithmic_fidelity: 0.9',
    ].join('\n');
    const result = scoreSemanticFromSummary(summary);
    expect(result.novelty_capture).toBeCloseTo(0.8, 5);
    expect(result.api_surface_match).toBeCloseTo(0.75, 5);
    expect(result.algorithmic_fidelity).toBeCloseTo(0.9, 5);
  });

  it('returns zero scores for empty input', () => {
    const result = scoreSemanticFromSummary('');
    expect(result.novelty_capture).toBe(0);
    expect(result.api_surface_match).toBe(0);
    expect(result.algorithmic_fidelity).toBe(0);
    expect(result.notes).toBe('');
  });

  it('returns zero scores for malformed input with no recognizable fields', () => {
    const result = scoreSemanticFromSummary('This is just a text summary with no structured data.');
    expect(result.novelty_capture).toBe(0);
    expect(result.api_surface_match).toBe(0);
    expect(result.algorithmic_fidelity).toBe(0);
  });

  it('clamps parsed values above 1 to 1', () => {
    const summary = 'novelty_capture: 1.5\napi_surface_match: 0.7\nalgorithmic_fidelity: 0.8';
    const result = scoreSemanticFromSummary(summary);
    expect(result.novelty_capture).toBe(1);
  });

  it('clamps parsed values below 0 to 0', () => {
    const summary = 'novelty_capture: -0.3\napi_surface_match: 0.7\nalgorithmic_fidelity: 0.8';
    const result = scoreSemanticFromSummary(summary);
    expect(result.novelty_capture).toBe(0);
  });

  it('extracts notes field from "notes: ..." line', () => {
    const summary = 'novelty_capture: 0.8\nnotes: Good implementation of core algorithm';
    const result = scoreSemanticFromSummary(summary);
    expect(result.notes).toBe('Good implementation of core algorithm');
  });

  it('returns empty notes when no notes line is present', () => {
    const summary = 'novelty_capture: 0.8\napi_surface_match: 0.7\nalgorithmic_fidelity: 0.9';
    const result = scoreSemanticFromSummary(summary);
    expect(result.notes).toBe('');
  });
});

// ─── assessTrainability tests ─────────────────────────────────────────────────

describe('assessTrainability', () => {
  it('returns build_success=true when build output has no error indicators', () => {
    const result = assessTrainability('Build successful. 3 files compiled.', 'output text', '', 1000);
    expect(result.build_success).toBe(true);
  });

  it('returns build_success=false when build output contains "error"', () => {
    const result = assessTrainability('error: cannot find module', '', '', 0);
    expect(result.build_success).toBe(false);
  });

  it('returns build_success=false when build output contains "FAILED"', () => {
    const result = assessTrainability('FAILED to compile', '', '', 0);
    expect(result.build_success).toBe(false);
  });

  it('returns build_success=false when build output is empty (no build attempted)', () => {
    const result = assessTrainability('', '', '', 0);
    expect(result.build_success).toBe(false);
  });

  it('returns runtime_stable=true when run output has no crash indicators', () => {
    const result = assessTrainability('Build ok', 'Training epoch 1... loss: 1.2', '', 1000);
    expect(result.runtime_stable).toBe(true);
  });

  it('returns runtime_stable=false when run output contains SIGKILL', () => {
    const result = assessTrainability('Build ok', 'Process killed: SIGKILL', '', 500);
    expect(result.runtime_stable).toBe(false);
  });

  it('returns runtime_stable=false when run output contains "fatal error"', () => {
    const result = assessTrainability('Build ok', 'fatal error: segmentation fault', '', 100);
    expect(result.runtime_stable).toBe(false);
  });

  it('returns runtime_stable=false when run output is empty', () => {
    const result = assessTrainability('Build ok', '', '', 0);
    expect(result.runtime_stable).toBe(false);
  });

  it('returns convergence_detected=true when output contains "converged"', () => {
    const result = assessTrainability('ok', 'Training converged at epoch 10', '', 5000);
    expect(result.convergence_detected).toBe(true);
  });

  it('returns convergence_detected=true when output contains "loss decreased"', () => {
    const result = assessTrainability('ok', 'Epoch 5: loss decreased from 1.5 to 0.9', '', 3000);
    expect(result.convergence_detected).toBe(true);
  });

  it('returns convergence_detected=true when output contains "metric improved"', () => {
    const result = assessTrainability('ok', 'Step 100: metric improved by 5%', '', 2000);
    expect(result.convergence_detected).toBe(true);
  });

  it('returns convergence_detected=false when no convergence indicators found', () => {
    const result = assessTrainability('ok', 'Training started. Epoch 1/10.', '', 1000);
    expect(result.convergence_detected).toBe(false);
  });

  it('passes through execution_time_ms', () => {
    const result = assessTrainability('ok', 'done', '', 12345);
    expect(result.execution_time_ms).toBe(12345);
  });

  it('sets error_log from stderr content trimmed', () => {
    const result = assessTrainability('ok', 'done', '  some warning  ', 1000);
    expect(result.error_log).toBe('some warning');
  });

  it('sets error_log to empty string when stderr is empty', () => {
    const result = assessTrainability('ok', 'done', '', 1000);
    expect(result.error_log).toBe('');
  });

  it('handles all-empty inputs gracefully (all false, empty error_log)', () => {
    const result = assessTrainability('', '', '', 0);
    expect(result.build_success).toBe(false);
    expect(result.runtime_stable).toBe(false);
    expect(result.convergence_detected).toBe(false);
    expect(result.error_log).toBe('');
  });
});

// ─── evaluateEntry tests ──────────────────────────────────────────────────────

describe('evaluateEntry', () => {
  const buildOutput = 'Build completed successfully.';
  const runOutput = 'Training converged at epoch 5.';
  const stderr = '';
  const executionTimeMs = 3000;
  const rubricVersion = 'v1.0';
  const evaluator = 'test-evaluator';
  const semanticSummary = [
    'novelty_capture: 0.8',
    'api_surface_match: 0.75',
    'algorithmic_fidelity: 0.9',
    'notes: Solid implementation',
  ].join('\n');

  it('returns a BenchmarkResult with correct entry_id', () => {
    const entry = makeEntry({ id: 'my-paper-123' });
    const result = evaluateEntry(
      entry, semanticSummary, buildOutput, runOutput, stderr, executionTimeMs, rubricVersion, evaluator
    );
    expect(result.entry_id).toBe('my-paper-123');
  });

  it('returns a composite_score between 0 and 1', () => {
    const entry = makeEntry();
    const result = evaluateEntry(
      entry, semanticSummary, buildOutput, runOutput, stderr, executionTimeMs, rubricVersion, evaluator
    );
    expect(result.composite_score).toBeGreaterThanOrEqual(0);
    expect(result.composite_score).toBeLessThanOrEqual(1);
  });

  it('populates evaluated_at as an ISO 8601 timestamp', () => {
    const entry = makeEntry();
    const result = evaluateEntry(
      entry, semanticSummary, buildOutput, runOutput, stderr, executionTimeMs, rubricVersion, evaluator
    );
    expect(result.evaluated_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('populates evaluator field from argument', () => {
    const entry = makeEntry();
    const result = evaluateEntry(
      entry, semanticSummary, buildOutput, runOutput, stderr, executionTimeMs, rubricVersion, 'my-agent'
    );
    expect(result.evaluator).toBe('my-agent');
  });

  it('uses entry.category for scoring (out-of-scope scores lower than directly-integrable)', () => {
    const entryOutOfScope = makeEntry({ category: 'out-of-scope', tags: [] });
    const entryDirect = makeEntry({ category: 'directly-integrable', tags: [] });
    const resultOOS = evaluateEntry(
      entryOutOfScope, semanticSummary, buildOutput, runOutput, stderr, executionTimeMs, rubricVersion, evaluator
    );
    const resultDirect = evaluateEntry(
      entryDirect, semanticSummary, buildOutput, runOutput, stderr, executionTimeMs, rubricVersion, evaluator
    );
    expect(resultOOS.composite_score).toBeLessThan(resultDirect.composite_score);
  });

  it('populates rubric_version from argument', () => {
    const entry = makeEntry();
    const result = evaluateEntry(
      entry, semanticSummary, buildOutput, runOutput, stderr, executionTimeMs, 'v2.5', evaluator
    );
    expect(result.rubric_version).toBe('v2.5');
  });

  it('populates semantic scores from semanticSummary', () => {
    const entry = makeEntry();
    const result = evaluateEntry(
      entry, semanticSummary, buildOutput, runOutput, stderr, executionTimeMs, rubricVersion, evaluator
    );
    expect(result.semantic.novelty_capture).toBeCloseTo(0.8, 5);
    expect(result.semantic.api_surface_match).toBeCloseTo(0.75, 5);
    expect(result.semantic.algorithmic_fidelity).toBeCloseTo(0.9, 5);
    expect(result.semantic.notes).toBe('Solid implementation');
  });

  it('populates trainability metrics from build/run outputs', () => {
    const entry = makeEntry();
    const result = evaluateEntry(
      entry, semanticSummary, buildOutput, runOutput, stderr, executionTimeMs, rubricVersion, evaluator
    );
    expect(result.trainability.build_success).toBe(true);
    expect(result.trainability.runtime_stable).toBe(true);
    expect(result.trainability.convergence_detected).toBe(true);
    expect(result.trainability.execution_time_ms).toBe(3000);
  });
});
