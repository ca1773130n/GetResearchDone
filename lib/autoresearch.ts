'use strict';

/**
 * GRD AutoResearch -- Karpathy-style autonomous experiment loop integrated with NERFIFY research.
 *
 * Inspired by karpathy/autoresearch: hypothesis → modify → run → evaluate → keep/revert → repeat.
 * Combined with NERFIFY: survey → deep-dive → citation graph → knowledge mining → plan.
 *
 * Each iteration:
 *   1. Research: survey papers or mine KNOWHOW for ideas (if enabled)
 *   2. Hypothesize: form a specific improvement hypothesis
 *   3. Implement: modify code via claude -p subprocess
 *   4. Evaluate: run tests + metrics against baseline
 *   5. Decide: keep if metric improved, revert if not
 *   6. Log: append result to AUTORESEARCH.tsv
 *   7. Mine: extract knowledge patterns from successful experiments
 *   8. Repeat indefinitely until stopped
 */

import type { GrdConfig, MilestoneInfo } from './types';
import type { Scheduler } from './scheduler';

const fs = require('fs') as typeof import('fs');
const path = require('path') as typeof import('path');
const childProcess = require('child_process') as typeof import('child_process');

const {
  loadConfig,
  getMilestoneInfo,
  output,
  error,
  MODEL_PROFILES,
  resolveModelForAgent,
}: {
  loadConfig: (cwd: string) => GrdConfig;
  getMilestoneInfo: (cwd: string) => MilestoneInfo;
  output: (result: unknown, raw: boolean, rawValue?: unknown) => never;
  error: (msg: string) => never;
  MODEL_PROFILES: Record<string, Record<string, string>>;
  resolveModelForAgent: (
    config: GrdConfig,
    agentType: string,
    cwd?: string,
    options?: { effectiveTierOverride?: import('./types').ModelTier }
  ) => string;
} = require('./utils');

const {
  getEffectiveTierForDispatch,
}: {
  getEffectiveTierForDispatch: (opts: {
    agentType: string;
    prompt: string;
    config: GrdConfig;
    scheduler: { getStates(): Map<string, import('./types').BackendUsageState> } | null;
    schedulerConfig?: import('./types').SchedulerConfig;
    superpowersConfig?: import('./types').SuperpowersConfig;
    modelProfiles: Record<string, Record<string, string>>;
  }) => import('./types').ModelTier;
} = require('./backend');

const {
  researchDir: getResearchDir,
  planningDir: getPlanningDir,
}: {
  researchDir: (cwd: string) => string;
  planningDir: (cwd: string) => string;
} = require('./paths');

const {
  ADAPTERS: _ADAPTERS,
}: {
  ADAPTERS: Record<string, { binary: string }>;
} = require('./scheduler');

const {
  buildKnowledgeInjectionBlock,
}: {
  buildKnowledgeInjectionBlock: (cwd: string, phaseNum: string, moduleHints?: string[]) => string;
} = require('./knowledge');

const {
  buildCitationGraph,
  findUnresolved,
}: {
  buildCitationGraph: (content: string) => {
    nodes: { slug: string; title: string; resolved: boolean; priority: string }[];
    edges: { from: string; to: string; type: string }[];
  };
  findUnresolved: (graph: {
    nodes: { slug: string; title: string; resolved: boolean; priority: string }[];
    edges: { from: string; to: string; type: string }[];
  }) => { slug: string; title: string; priority: string }[];
} = require('./citations');

// ─── Constants ──────────────────────────────────────────────────────────────

/** Maximum characters from LANDSCAPE.md injected into research context. Override via arConfig.autoresearch?.landscape_max_chars. */
const LANDSCAPE_MAX_CHARS = 3000;

// ─── Types ──────────────────────────────────────────────────────────────────

interface AutoResearchOptions {
  /** Research topic / area of focus */
  topic: string;
  /** Maximum number of experiments (0 = unlimited) */
  maxExperiments: number;
  /** Time budget per experiment in minutes */
  timeBudget: number;
  /** Metric to optimize: 'test_count' | 'coverage' | 'lint_errors' | 'custom' */
  metric: string;
  /** Whether to auto-survey if no LANDSCAPE.md exists */
  autoSurvey: boolean;
  /** Maximum deep-dives per loop iteration */
  maxDeepDives: number;
  /** Model override for claude -p */
  model?: string;
  /** Max turns per subprocess */
  maxTurns?: number;
  /** Dry run — don't actually run experiments */
  dryRun: boolean;
  /** Optional scheduler for per-account token tracking and rate-limit handling */
  scheduler?: Scheduler | null;
}

interface ExperimentResult {
  id: number;
  commit: string;
  metric_value: number;
  metric_name: string;
  status: 'keep' | 'discard' | 'crash';
  hypothesis: string;
  research_source: string;
  duration_seconds: number;
  timestamp: string;
}

interface AutoResearchState {
  experiments: ExperimentResult[];
  baseline: number;
  best: number;
  topic: string;
  started_at: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function _log(msg: string): void {
  const ts = new Date().toISOString().slice(11, 19);
  process.stderr.write(`[autoresearch ${ts}] ${msg}\n`);
}

function _execGit(cwd: string, args: string[]): { stdout: string; exitCode: number } {
  try {
    const result = childProcess.spawnSync('git', args, {
      cwd,
      stdio: 'pipe',
      encoding: 'utf-8',
    });
    return { stdout: (result.stdout || '').trim(), exitCode: result.status ?? 1 };
  } catch {
    return { stdout: '', exitCode: 1 };
  }
}

/**
 * Async spawn wrapper. When a scheduler is provided, routes through
 * scheduler.spawn for per-account token tracking and rate-limit handling.
 * SchedulerSpawnResult.stdout carries captured subprocess stdout when
 * captureOutput is true, so the scheduler path is used unconditionally.
 * Falls back to the synchronous path (_spawnClaudeSync) only when no
 * scheduler is provided.
 */
async function _spawnClaude(
  cwd: string,
  prompt: string,
  opts: {
    timeout?: number;
    maxTurns?: number;
    model?: string;
    captureOutput?: boolean;
    scheduler?: Scheduler | null;
    /** Agent type hint for complexity-based tier routing (M2). */
    agentType?: string;
    /** Override binary name for the sync fallback path. Defaults to ADAPTERS.claude.binary. */
    binary?: string;
  } = {}
): Promise<{ exitCode: number; stdout: string; timedOut: boolean }> {
  if (opts.scheduler) {
    try {
      const result = await opts.scheduler.spawn(prompt, {
        cwd,
        model: opts.model,
        timeout: opts.timeout,
        maxTurns: opts.maxTurns,
        captureOutput: opts.captureOutput,
        agentType: opts.agentType,
      });
      return {
        exitCode: result.exitCode,
        stdout: result.stdout || '',
        timedOut: result.timedOut,
      };
    } catch (e) {
      if (e instanceof Error && e.message.includes('SIGINT')) throw e;
      return { exitCode: 1, stdout: '', timedOut: false };
    }
  }
  const binary = opts.binary ?? _ADAPTERS['claude']?.binary ?? 'claude';
  return _spawnClaudeSync(cwd, prompt, { ...opts, binary });
}

function _spawnClaudeSync(
  cwd: string,
  prompt: string,
  opts: { timeout?: number; maxTurns?: number; model?: string; captureOutput?: boolean; binary?: string } = {}
): { exitCode: number; stdout: string; timedOut: boolean } {
  const binary = opts.binary ?? (_ADAPTERS['claude']?.binary ?? 'claude');
  const args: string[] = ['-p', prompt, '--verbose', '--dangerously-skip-permissions'];
  if (opts.maxTurns !== undefined && opts.maxTurns > 0) args.push('--max-turns', String(opts.maxTurns));
  if (opts.model) args.push('--model', opts.model);

  const env: Record<string, string | undefined> = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key === 'CLAUDECODE' || key.startsWith('CLAUDE_CODE_') || key.startsWith('CLAUDECODE_')) {
      delete env[key];
    }
  }

  const result = childProcess.spawnSync(binary, args, {
    cwd,
    stdio: opts.captureOutput ? 'pipe' : ['ignore', 'pipe', 'pipe'],
    env,
    encoding: 'utf-8',
    timeout: opts.timeout,
  });

  if (!opts.captureOutput) {
    if (result.stdout) process.stdout.write(result.stdout as string);
    if (result.stderr) process.stderr.write(result.stderr as string);
  }

  const timedOut = !!(result.error && (result.error as NodeJS.ErrnoException).code === 'ETIMEDOUT');
  return {
    exitCode: timedOut ? 124 : (result.status ?? 1),
    stdout: (result.stdout || '') as string,
    timedOut,
  };
}

// ─── Metric Collection ──────────────────────────────────────────────────────

function _collectMetric(cwd: string, metric: string, timeouts?: import('./types').GrdTimeouts): number {
  const testTimeout = timeouts?.autoresearch_test_ms ?? 120000;
  const coverageTimeout = timeouts?.autoresearch_coverage_ms ?? 180000;
  const lintTimeout = timeouts?.autoresearch_lint_ms ?? 60000;
  switch (metric) {
    case 'test_count': {
      const result = childProcess.spawnSync('npx', ['jest', '--json', '--silent'], {
        cwd,
        stdio: 'pipe',
        encoding: 'utf-8',
        timeout: testTimeout,
      });
      try {
        const json = JSON.parse((result.stdout || '') as string);
        return json.numPassedTests || 0;
      } catch {
        return 0;
      }
    }
    case 'coverage': {
      // Omit --silent so the coverage table appears in stdout for the fallback parser.
      // The primary path (coverage-summary.json) is unaffected; --silent would hide
      // the table and cause the fallback to always return 0.
      const result = childProcess.spawnSync(
        'npx',
        ['jest', '--coverage', '--coverageReporters=json-summary'],
        { cwd, stdio: 'pipe', encoding: 'utf-8', timeout: coverageTimeout }
      );
      try {
        const summaryPath = path.join(cwd, 'coverage', 'coverage-summary.json');
        if (fs.existsSync(summaryPath)) {
          const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));
          return summary.total?.lines?.pct || 0;
        }
      } catch {
        // fall through
      }
      return _extractCoverageFromOutput((result.stdout || '') as string);
    }
    case 'lint_errors': {
      const result = childProcess.spawnSync('npx', ['eslint', 'bin/', 'lib/', '--format', 'json'], {
        cwd,
        stdio: 'pipe',
        encoding: 'utf-8',
        timeout: lintTimeout,
      });
      try {
        const json = JSON.parse((result.stdout || '') as string);
        const total = json.reduce(
          (sum: number, file: { errorCount: number }) => sum + file.errorCount,
          0
        );
        // Negate: lower is better, so more errors = worse
        return -total;
      } catch {
        return -999;
      }
    }
    default:
      return 0;
  }
}

function _extractCoverageFromOutput(output: string): number {
  // Parse "All files | XX.XX |" from jest coverage table
  const match = output.match(/All files\s*\|\s*([\d.]+)/);
  return match ? parseFloat(match[1]) : 0;
}

// ─── TSV Logging ────────────────────────────────────────────────────────────

const TSV_HEADER =
  'id\tcommit\tmetric_name\tmetric_value\tstatus\thypothesis\tresearch_source\tduration_s\ttimestamp\n';

function _initTsv(tsvPath: string): void {
  if (!fs.existsSync(tsvPath)) {
    fs.writeFileSync(tsvPath, TSV_HEADER, 'utf-8');
  }
}

function _appendTsv(tsvPath: string, result: ExperimentResult): void {
  const line = [
    result.id,
    result.commit,
    result.metric_name,
    result.metric_value.toFixed(4),
    result.status,
    result.hypothesis.replace(/\t/g, ' ').replace(/\n/g, ' ').slice(0, 200),
    result.research_source.replace(/\t/g, ' '),
    result.duration_seconds,
    result.timestamp,
  ].join('\t');
  fs.appendFileSync(tsvPath, line + '\n', 'utf-8');
}

// ─── Research Context ───────────────────────────────────────────────────────

function _buildResearchContext(cwd: string, topic: string, iteration: number): string {
  const researchDir = getResearchDir(cwd);
  const parts: string[] = [];

  // LANDSCAPE.md
  const landscapePath = path.join(researchDir, 'LANDSCAPE.md');
  if (fs.existsSync(landscapePath)) {
    const content = fs.readFileSync(landscapePath, 'utf-8') as string;
    parts.push(`<landscape>\n${content.slice(0, LANDSCAPE_MAX_CHARS)}\n</landscape>`);
  }

  // PAPERS.md — citation graph summary
  const papersPath = path.join(researchDir, 'PAPERS.md');
  if (fs.existsSync(papersPath)) {
    const content = fs.readFileSync(papersPath, 'utf-8') as string;
    try {
      const graph = buildCitationGraph(content);
      const unresolved = findUnresolved(graph);
      parts.push(
        `<citation_graph papers="${graph.nodes.length}" edges="${graph.edges.length}" unresolved="${unresolved.length}" />`
      );
    } catch {
      // citation parsing may fail on sparse PAPERS.md
    }
  }

  // KNOWHOW.md — accumulated patterns
  const knowhow = buildKnowledgeInjectionBlock(cwd, String(iteration));
  if (knowhow) {
    parts.push(knowhow);
  }

  return parts.length > 0
    ? `<research_context topic="${topic}">\n${parts.join('\n\n')}\n</research_context>`
    : '';
}

// ─── Experiment Prompt ──────────────────────────────────────────────────────

function _buildExperimentPrompt(
  cwd: string,
  topic: string,
  iteration: number,
  baseline: number,
  best: number,
  metric: string,
  history: ExperimentResult[]
): string {
  const researchContext = _buildResearchContext(cwd, topic, iteration);
  const recentHistory = history
    .slice(-10)
    .map(
      (e) =>
        `  ${e.id}. [${e.status}] ${e.metric_name}=${e.metric_value.toFixed(4)} — ${e.hypothesis.slice(0, 80)}`
    )
    .join('\n');

  return `You are an autonomous research agent running experiment #${iteration} in the autoresearch loop.

## Goal
Improve the codebase metric: **${metric}** (higher is better).
- Baseline: ${baseline.toFixed(4)}
- Current best: ${best.toFixed(4)}
- Topic: ${topic}

## Recent Experiment History
${recentHistory || '(no experiments yet — this is the first)'}

${researchContext}

## Instructions

1. **Hypothesize**: Based on the research context, codebase state, and experiment history, form a specific hypothesis for improvement. Consider:
   - Papers and techniques from LANDSCAPE.md
   - Patterns from KNOWHOW.md that worked in prior phases
   - Gaps identified in the citation graph
   - Ideas that haven't been tried yet (check history)

2. **Implement**: Make targeted code changes to test your hypothesis. Keep changes small and focused — one idea per experiment. Modify only what's necessary.

3. **Verify**: Run the test suite to make sure nothing is broken: \`npm test\`

4. **Report**: Print a single-line summary at the end:
   HYPOTHESIS: <one-line description of what you tried>

IMPORTANT:
- Do NOT ask for confirmation. You are autonomous.
- Make exactly ONE focused change per experiment.
- If tests fail, try to fix them. If you can't after 2 attempts, revert all changes.
- Keep changes simple. A small improvement with clean code beats a large improvement with complex hacks.
- Do NOT modify test files to make tests pass — improve the actual code.
- Commit your changes with a descriptive message starting with "autoresearch:".`;
}

// ─── Core Loop ──────────────────────────────────────────────────────────────

async function _runAutoresearchLoop(
  cwd: string,
  options: AutoResearchOptions
): Promise<AutoResearchState> {
  const { topic, maxExperiments, timeBudget, metric, model, maxTurns, dryRun, scheduler, maxDeepDives } = options;

  // Load config once for the adaptive tier chain (Spec 4).
  const arConfig: GrdConfig = loadConfig(cwd);

  const planningDir = getPlanningDir(cwd);
  const tsvPath = path.join(planningDir, 'AUTORESEARCH.tsv');
  const branchName = `autoresearch/${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;

  // Create branch
  _log(`Starting autoresearch on topic: ${topic}`);
  _log(
    `Metric: ${metric}, time budget: ${timeBudget > 0 ? `${timeBudget}min` : 'unlimited'}/experiment, max: ${maxExperiments || 'unlimited'}`
  );

  const branchResult = _execGit(cwd, ['checkout', '-b', branchName]);
  if (branchResult.exitCode !== 0) {
    // Branch creation failed — most likely the branch already exists
    // from a prior same-day run. Try to check out the existing branch
    // instead of silently running on whatever branch is current.
    const checkoutResult = _execGit(cwd, ['checkout', branchName]);
    if (checkoutResult.exitCode !== 0) {
      throw new Error(
        `[autoresearch] failed to create or checkout branch '${branchName}': ` +
          `create exit ${branchResult.exitCode}, checkout exit ${checkoutResult.exitCode}. ` +
          `Please delete the existing branch or run from a clean worktree.`
      );
    }
    process.stderr.write(`[autoresearch] branch '${branchName}' already exists, reusing\n`);
  }
  _log(`Created branch: ${branchName}`);

  _initTsv(tsvPath);

  // Step 1: Collect baseline metric
  _log('Collecting baseline metric...');
  const baseline = _collectMetric(cwd, metric, arConfig.timeouts);
  _log(`Baseline ${metric}: ${baseline.toFixed(4)}`);

  let best = baseline;
  let deepDivesThisRun = 0;
  const experiments: ExperimentResult[] = [];

  // Log baseline
  const baselineResult: ExperimentResult = {
    id: 0,
    commit: _execGit(cwd, ['rev-parse', '--short', 'HEAD']).stdout,
    metric_value: baseline,
    metric_name: metric,
    status: 'keep',
    hypothesis: 'baseline',
    research_source: 'initial',
    duration_seconds: 0,
    timestamp: new Date().toISOString(),
  };
  _appendTsv(tsvPath, baselineResult);
  experiments.push(baselineResult);

  // Step 2: Auto-survey if enabled and no LANDSCAPE.md
  if (options.autoSurvey) {
    const researchDir = getResearchDir(cwd);
    const landscapePath = path.join(researchDir, 'LANDSCAPE.md');
    if (!fs.existsSync(landscapePath)) {
      _log('No LANDSCAPE.md found — running auto-survey...');
      if (!dryRun) {
        const surveyPrompt = `Use the Skill tool to invoke skill "grd:survey" with args "${topic}". Autonomous mode — make all decisions yourself, no questions.`;
        // Resolve the effective model for the survey dispatch (Spec 4 chain).
        // Honour explicit --model flag; otherwise use the adaptive tier.
        const surveyTier = getEffectiveTierForDispatch({
          agentType: 'grd-surveyor',
          prompt: surveyPrompt,
          config: arConfig,
          scheduler: scheduler ?? null,
          schedulerConfig: arConfig.scheduler,
          superpowersConfig: arConfig.superpowers,
          modelProfiles: MODEL_PROFILES,
        });
        const surveyModel: string | undefined = model
          ? model
          : resolveModelForAgent(arConfig, 'autoresearch', cwd, {
              effectiveTierOverride: surveyTier,
            });
        await _spawnClaude(cwd, surveyPrompt, {
          timeout: timeBudget > 0 ? timeBudget * 60 * 1000 : undefined,
          model: surveyModel,
          maxTurns,
          scheduler,
          agentType: 'grd-surveyor',
        });
        _log('Auto-survey complete');
      } else {
        _log('(dry-run) Would run survey');
      }
    }
  }

  // Step 3: Experiment loop
  let iteration = 1;
  // Dry-run with --max 0 would spin forever (Infinity); cap at 3 to show a representative sample.
  const maxIter = dryRun && maxExperiments === 0 ? 3 : maxExperiments || Infinity;

  while (iteration <= maxIter) {
    _log(`\n═══ Experiment #${iteration} ═══`);
    const startTime = Date.now();

    if (dryRun) {
      _log(`(dry-run) Would run experiment #${iteration}`);
      const dryResult: ExperimentResult = {
        id: iteration,
        commit: 'dry-run',
        metric_value: 0,
        metric_name: metric,
        status: 'discard',
        hypothesis: 'dry-run',
        research_source: 'dry-run',
        duration_seconds: 0,
        timestamp: new Date().toISOString(),
      };
      experiments.push(dryResult);
      iteration++;
      continue;
    }

    // Save current HEAD for potential revert
    const headBefore = _execGit(cwd, ['rev-parse', 'HEAD']).stdout;

    // Build prompt with research context
    const prompt = _buildExperimentPrompt(
      cwd,
      topic,
      iteration,
      baseline,
      best,
      metric,
      experiments
    );

    // Resolve the effective model for the experiment dispatch (Spec 4 chain).
    // Honour explicit --model flag; otherwise use the adaptive tier.
    const experimentTier = getEffectiveTierForDispatch({
      agentType: 'grd-executor',
      prompt,
      config: arConfig,
      scheduler: scheduler ?? null,
      schedulerConfig: arConfig.scheduler,
      superpowersConfig: arConfig.superpowers,
      modelProfiles: MODEL_PROFILES,
    });
    const experimentModel: string | undefined = model
      ? model
      : resolveModelForAgent(arConfig, 'autoresearch', cwd, {
          effectiveTierOverride: experimentTier,
        });
    // Spawn experiment subprocess
    const spawnResult = await _spawnClaude(cwd, prompt, {
      timeout: timeBudget > 0 ? timeBudget * 60 * 1000 : undefined,
      model: experimentModel,
      maxTurns,
      captureOutput: true,
      scheduler,
      agentType: 'grd-executor',
    });

    const durationSeconds = Math.round((Date.now() - startTime) / 1000);

    // Extract hypothesis from output
    const hypothesisMatch = (spawnResult.stdout || '').match(/HYPOTHESIS:\s*(.+)/);
    const hypothesis = hypothesisMatch ? hypothesisMatch[1].trim() : 'unknown';

    if (spawnResult.timedOut) {
      _log(`Experiment #${iteration} timed out (${timeBudget}min) — reverting`);
      _execGit(cwd, ['reset', '--hard', headBefore]);
      _execGit(cwd, ['clean', '-fd']);

      const crashResult: ExperimentResult = {
        id: iteration,
        commit: '0000000',
        metric_value: 0,
        metric_name: metric,
        status: 'crash',
        hypothesis: `TIMEOUT: ${hypothesis}`,
        research_source: 'timeout',
        duration_seconds: durationSeconds,
        timestamp: new Date().toISOString(),
      };
      _appendTsv(tsvPath, crashResult);
      experiments.push(crashResult);
      iteration++;
      continue;
    }

    if (spawnResult.exitCode !== 0) {
      _log(`Experiment #${iteration} failed (exit ${spawnResult.exitCode}) — reverting`);
      _execGit(cwd, ['reset', '--hard', headBefore]);
      _execGit(cwd, ['clean', '-fd']);

      const crashResult: ExperimentResult = {
        id: iteration,
        commit: '0000000',
        metric_value: 0,
        metric_name: metric,
        status: 'crash',
        hypothesis,
        research_source: 'crash',
        duration_seconds: durationSeconds,
        timestamp: new Date().toISOString(),
      };
      _appendTsv(tsvPath, crashResult);
      experiments.push(crashResult);
      iteration++;
      continue;
    }

    // Evaluate metric
    _log(`Evaluating ${metric}...`);
    const newMetric = _collectMetric(cwd, metric, arConfig.timeouts);
    const commit = _execGit(cwd, ['rev-parse', '--short', 'HEAD']).stdout;
    const improved = newMetric > best;

    if (improved) {
      _log(
        `✓ KEEP — ${metric}: ${best.toFixed(4)} → ${newMetric.toFixed(4)} (+${(newMetric - best).toFixed(4)})`
      );
      best = newMetric;

      const keepResult: ExperimentResult = {
        id: iteration,
        commit,
        metric_value: newMetric,
        metric_name: metric,
        status: 'keep',
        hypothesis,
        research_source: 'experiment',
        duration_seconds: durationSeconds,
        timestamp: new Date().toISOString(),
      };
      _appendTsv(tsvPath, keepResult);
      experiments.push(keepResult);

      // After a successful keep, run a deep-dive if budget allows
      if (maxDeepDives > 0 && deepDivesThisRun < maxDeepDives) {
        deepDivesThisRun++;
        _log(`Running deep-dive ${deepDivesThisRun}/${maxDeepDives} after successful keep...`);
        const deepDivePrompt = `Use the Skill tool to invoke skill "grd:deep-dive" with args "${topic}". Focus on the most recent successful experiment. Autonomous mode — make all decisions yourself, no questions.`;
        const deepDiveTier = getEffectiveTierForDispatch({
          agentType: 'grd-deep-diver',
          prompt: deepDivePrompt,
          config: arConfig,
          scheduler: scheduler ?? null,
          schedulerConfig: arConfig.scheduler,
          superpowersConfig: arConfig.superpowers,
          modelProfiles: MODEL_PROFILES,
        });
        const deepDiveModel: string | undefined = model
          ? model
          : resolveModelForAgent(arConfig, 'autoresearch', cwd, {
              effectiveTierOverride: deepDiveTier,
            });
        await _spawnClaude(cwd, deepDivePrompt, {
          timeout: timeBudget > 0 ? timeBudget * 60 * 1000 : undefined,
          model: deepDiveModel,
          maxTurns,
          scheduler,
          agentType: 'grd-deep-diver',
        });
        _log(`Deep-dive ${deepDivesThisRun} complete`);
      }
    } else {
      _log(`✗ DISCARD — ${metric}: ${newMetric.toFixed(4)} (best: ${best.toFixed(4)}) — reverting`);
      _execGit(cwd, ['reset', '--hard', headBefore]);
      _execGit(cwd, ['clean', '-fd']);

      const discardResult: ExperimentResult = {
        id: iteration,
        commit,
        metric_value: newMetric,
        metric_name: metric,
        status: 'discard',
        hypothesis,
        research_source: 'experiment',
        duration_seconds: durationSeconds,
        timestamp: new Date().toISOString(),
      };
      _appendTsv(tsvPath, discardResult);
      experiments.push(discardResult);
    }

    iteration++;
  }

  _log(`\nAutoresearch complete: ${experiments.length - 1} experiments`);
  _log(
    `Baseline: ${baseline.toFixed(4)} → Best: ${best.toFixed(4)} (Δ${(best - baseline).toFixed(4)})`
  );

  const kept = experiments.filter((e) => e.status === 'keep').length - 1; // exclude baseline
  const discarded = experiments.filter((e) => e.status === 'discard').length;
  const crashed = experiments.filter((e) => e.status === 'crash').length;
  _log(`Kept: ${kept}, Discarded: ${discarded}, Crashed: ${crashed}`);
  _log(`Results logged to: ${tsvPath}`);

  return {
    experiments,
    baseline,
    best,
    topic,
    started_at: experiments[0]?.timestamp || new Date().toISOString(),
  };
}

// ─── CLI Commands ───────────────────────────────────────────────────────────

async function cmdAutoResearch(
  cwd: string,
  args: string[],
  raw: boolean,
  scheduler?: Scheduler | null
): Promise<void> {
  // Parse flags
  const flagVal = (name: string, fallback?: string): string | undefined => {
    const i = args.indexOf(name);
    return i !== -1 && i + 1 < args.length ? args[i + 1] : fallback;
  };

  // Find positional topic: first arg not starting with -- and not a flag value
  const flagsWithValues = new Set([
    '--metric',
    '--max',
    '--time-budget',
    '--max-deep-dives',
    '--model',
    '--max-turns',
  ]);
  const flagValueIndices = new Set<number>();
  for (let i = 0; i < args.length; i++) {
    if (flagsWithValues.has(args[i]) && i + 1 < args.length) {
      flagValueIndices.add(i + 1);
    }
  }
  const topic = args.find((a, i) => !a.startsWith('--') && !flagValueIndices.has(i));
  if (!topic) {
    error(
      'Topic required. Usage: gd autoresearch <topic> [--metric test_count] [--max N] [--time-budget M]'
    );
    return;
  }

  // 0 = unlimited (default); any positive integer caps the experiment count
  const maxExperimentsRaw = flagVal('--max') ? parseInt(flagVal('--max')!, 10) : 0;
  if (isNaN(maxExperimentsRaw) || maxExperimentsRaw < 0) {
    error('--max must be a non-negative integer (0 = unlimited)');
  }

  const timeBudgetRaw = parseInt(flagVal('--time-budget', '10')!, 10);
  if (isNaN(timeBudgetRaw) || timeBudgetRaw < 0) {
    error('--time-budget must be a non-negative integer');
  }

  const maxDeepDivesRaw = parseInt(flagVal('--max-deep-dives', '3')!, 10);
  if (isNaN(maxDeepDivesRaw) || maxDeepDivesRaw < 0) {
    error('--max-deep-dives must be a non-negative integer');
  }

  const maxTurnsRaw = flagVal('--max-turns') ? parseInt(flagVal('--max-turns')!, 10) : undefined;
  if (maxTurnsRaw !== undefined && (isNaN(maxTurnsRaw) || maxTurnsRaw <= 0)) {
    error('--max-turns must be a positive integer');
  }

  const options: AutoResearchOptions = {
    topic,
    maxExperiments: maxExperimentsRaw, // 0 = unlimited
    timeBudget: timeBudgetRaw,
    metric: flagVal('--metric', 'test_count')!,
    autoSurvey: !args.includes('--no-survey'),
    maxDeepDives: maxDeepDivesRaw,
    model: flagVal('--model'),
    maxTurns: maxTurnsRaw,
    dryRun: args.includes('--dry-run'),
    scheduler,
  };

  const state = await _runAutoresearchLoop(cwd, options);

  output(
    {
      topic: state.topic,
      total_experiments: state.experiments.length - 1,
      baseline: state.baseline,
      best: state.best,
      improvement: state.best - state.baseline,
      kept: state.experiments.filter((e) => e.status === 'keep').length - 1,
      discarded: state.experiments.filter((e) => e.status === 'discard').length,
      crashed: state.experiments.filter((e) => e.status === 'crash').length,
      tsv_path: path.join(getPlanningDir(cwd), 'AUTORESEARCH.tsv'),
    },
    raw,
    `AutoResearch: ${state.experiments.length - 1} experiments, baseline=${state.baseline.toFixed(4)} → best=${state.best.toFixed(4)}`
  );
}

function cmdInitAutoResearch(cwd: string, raw: boolean): void {
  const config = loadConfig(cwd);
  const milestone = getMilestoneInfo(cwd);
  const researchDir = getResearchDir(cwd);

  const hasLandscape = fs.existsSync(path.join(researchDir, 'LANDSCAPE.md'));
  const hasPapers = fs.existsSync(path.join(researchDir, 'PAPERS.md'));
  const hasKnowhow = fs.existsSync(path.join(researchDir, 'KNOWHOW.md'));

  output(
    {
      milestone_version: milestone.version,
      milestone_name: milestone.name,
      research_dir: path.relative(cwd, researchDir),
      has_landscape: hasLandscape,
      has_papers: hasPapers,
      has_knowhow: hasKnowhow,
      config: {
        model_profile: (config as unknown as Record<string, unknown>).model_profile,
        autonomous_mode: (config as unknown as Record<string, unknown>).autonomous_mode,
      },
    },
    raw,
    `AutoResearch ready: milestone=${milestone.version}, landscape=${hasLandscape}, papers=${hasPapers}, knowhow=${hasKnowhow}`
  );
}

module.exports = {
  cmdAutoResearch,
  cmdInitAutoResearch,
  _spawnClaude,
};
