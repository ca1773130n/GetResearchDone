'use strict';

/**
 * GRD Benchmark -- Corpus management and composite scoring for the evaluation framework.
 *
 * Provides operations for loading/saving a benchmark corpus of research papers and
 * computing composite quality scores from semantic and trainability dimensions.
 *
 * Category taxonomy adapted from NERFIFY-BENCH Figure 7 classification of papers
 * by implementation difficulty.
 *
 * @module benchmark
 */

const fs = require('fs') as typeof import('fs');
const path = require('path') as typeof import('path');

import type {
  BenchmarkEntry,
  BenchmarkResult,
  ScoringRubric,
  IntegrationCategory,
  SemanticScore,
  TrainabilityMetrics,
} from './types';

/**
 * Load all benchmark entries from a corpus directory.
 * Returns BenchmarkEntry[] sorted by added_at descending (newest first).
 * Returns [] if the directory does not exist or is empty.
 */
export function loadCorpus(corpusDir: string): BenchmarkEntry[] {
  if (!fs.existsSync(corpusDir)) {
    return [];
  }

  const files = fs.readdirSync(corpusDir).filter((f: string) => f.endsWith('.json'));

  const entries: BenchmarkEntry[] = [];
  for (const file of files) {
    const filePath = path.join(corpusDir, file);
    const raw = fs.readFileSync(filePath, 'utf8');
    try {
      const parsed = JSON.parse(raw) as BenchmarkEntry;
      entries.push(parsed);
    } catch (_err) {
      process.stderr.write(`[benchmark] Warning: failed to parse JSON in ${filePath}\n`);
    }
  }

  // Sort by added_at descending (newest first)
  entries.sort((a, b) => {
    if (a.added_at > b.added_at) return -1;
    if (a.added_at < b.added_at) return 1;
    return 0;
  });

  return entries;
}

/**
 * Save a single BenchmarkEntry as JSON to corpusDir/{id}.json.
 * Creates the directory if it does not exist.
 */
export function saveCorpusEntry(corpusDir: string, entry: BenchmarkEntry): void {
  fs.mkdirSync(corpusDir, { recursive: true });
  const filePath = path.join(corpusDir, `${entry.id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(entry, null, 2), 'utf8');
}

/**
 * Compute a weighted composite score from semantic and trainability inputs.
 *
 * Semantic sub-score: average of novelty_capture, api_surface_match, algorithmic_fidelity.
 * Trainability sub-score: weighted sum — build_success (0.4), runtime_stable (0.3), convergence_detected (0.3).
 * Composite = (semantic_sub * semantic_weight + trainability_sub * trainability_weight) * category_adjustment.
 *
 * @param semantic - Semantic sub-scores from an evaluator
 * @param trainability - Build/run/convergence metrics
 * @param rubric - Weight distribution and category multipliers
 * @param category - The paper's integration category
 * @returns Composite score clamped to [0, 1]
 */
export function scoreComposite(
  semantic: SemanticScore,
  trainability: TrainabilityMetrics,
  rubric: ScoringRubric,
  category: IntegrationCategory,
): number {
  const semanticSub =
    (semantic.novelty_capture + semantic.api_surface_match + semantic.algorithmic_fidelity) / 3;

  const trainabilitySub =
    (trainability.build_success ? 1 : 0) * 0.4 +
    (trainability.runtime_stable ? 1 : 0) * 0.3 +
    (trainability.convergence_detected ? 1 : 0) * 0.3;

  const composite =
    (semanticSub * rubric.semantic_weight + trainabilitySub * rubric.trainability_weight) *
    rubric.category_adjustments[category];

  return Math.min(1, Math.max(0, composite));
}

/**
 * Create the default ScoringRubric with NERFIFY-BENCH-inspired weights.
 *
 * semantic_weight=0.6 because semantic fidelity matters most for paper-to-code synthesis.
 * trainability_weight=0.4.
 * Category adjustments penalize harder-to-implement categories:
 * - directly-integrable: 1.0 (no penalty)
 * - requires-external-models: 0.85
 * - out-of-scope: 0.5 (heaviest penalty — capabilities beyond code synthesis)
 * - novelty-coverage: 0.9
 */
export function createDefaultRubric(): ScoringRubric {
  return {
    semantic_weight: 0.6,
    trainability_weight: 0.4,
    category_adjustments: {
      'directly-integrable': 1.0,
      'requires-external-models': 0.85,
      'out-of-scope': 0.5,
      'novelty-coverage': 0.9,
    },
  };
}

/**
 * Format a markdown benchmark report from results and corpus entries.
 *
 * Output structure:
 *   ## Benchmark Results
 *   {N} entries evaluated
 *   | Paper | Category | Semantic | Trainability | Composite |
 *   | ... rows ... |
 *   | **Average** | — | — | — | {avg} |
 *
 * @param results - Array of scored benchmark results
 * @param entries - Corpus entries for title/category lookup
 * @returns Markdown string
 */
export function formatBenchmarkReport(
  results: BenchmarkResult[],
  entries: BenchmarkEntry[],
): string {
  const entryMap = new Map<string, BenchmarkEntry>(entries.map((e) => [e.id, e]));

  const lines: string[] = [];
  lines.push('## Benchmark Results');
  lines.push('');
  lines.push(`${results.length} entries evaluated`);
  lines.push('');
  lines.push('| Paper | Category | Semantic | Trainability | Composite |');
  lines.push('|-------|----------|----------|--------------|-----------|');

  let totalComposite = 0;
  for (const result of results) {
    const entry = entryMap.get(result.entry_id);
    const title = entry ? entry.title : result.entry_id;
    const category = entry ? entry.category : '—';

    const semanticAvg =
      (result.semantic.novelty_capture +
        result.semantic.api_surface_match +
        result.semantic.algorithmic_fidelity) /
      3;
    const trainabilityLabel =
      result.trainability.build_success && result.trainability.runtime_stable ? 'PASS' : 'FAIL';
    const compositeFormatted = result.composite_score.toFixed(2);

    lines.push(
      `| ${title} | ${category} | ${semanticAvg.toFixed(2)} | ${trainabilityLabel} | ${compositeFormatted} |`,
    );
    totalComposite += result.composite_score;
  }

  if (results.length > 0) {
    const avg = totalComposite / results.length;
    lines.push(`| **Average** | — | — | — | ${avg.toFixed(2)} |`);
  }

  return lines.join('\n');
}
