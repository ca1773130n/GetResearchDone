/** GRD Commands/PhaseInfo -- Phase lookup, model resolution, commit, plan indexing, summary extraction, history digest */

'use strict';

import type {
  GrdConfig, BackendId, BackendCapabilities, ModelTier,
  FrontmatterObject, AgentModelProfiles, ExecGitResult,
} from '../types';

const fs = require('fs');
const path = require('path');
const {
  safeReadFile, loadConfig, isGitIgnored, execGit,
  normalizePhaseName, MODEL_PROFILES, output, error,
}: {
  safeReadFile: (p: string) => string | null;
  loadConfig: (cwd: string) => GrdConfig;
  isGitIgnored: (cwd: string, p: string) => boolean;
  execGit: (cwd: string, args: string[]) => ExecGitResult;
  normalizePhaseName: (phase: string) => string;
  MODEL_PROFILES: AgentModelProfiles;
  output: (result: unknown, raw: boolean, rawValue?: unknown) => never;
  error: (message: string) => never;
} = require('../utils');
const { extractFrontmatter }: {
  extractFrontmatter: (content: string) => FrontmatterObject;
} = require('../frontmatter');
const {
  detectBackend, resolveBackendModel, getBackendCapabilities, getCachedModels,
}: {
  detectBackend: (cwd: string) => BackendId;
  resolveBackendModel: (b: string, t: ModelTier, c?: Record<string, unknown>, cwd?: string) => string | undefined;
  getBackendCapabilities: (b: string) => BackendCapabilities;
  getCachedModels: (b: string, cwd?: string) => Record<string, string> | null;
} = require('../backend');
const { phasesDir: getPhasesDirPath, planningDir: getPlanningDir }: {
  phasesDir: (cwd: string) => string;
  planningDir: (cwd: string) => string;
} = require('../paths');

// ─── Domain Types ────────────────────────────────────────────────────────────

interface PlanIndexEntry {
  id: string; wave: number; autonomous: boolean; objective: string | null;
  files_modified: string[]; task_count: number; has_summary: boolean;
}
interface SummaryDecision { summary: string; rationale: string | null; }
interface DigestPhaseEntry {
  name: string;
  provides: Set<string> | string[];
  affects: Set<string> | string[];
  patterns: Set<string> | string[];
}
interface HistoryDigest {
  phases: Record<string, DigestPhaseEntry>;
  decisions: { phase: string; decision: string }[];
  tech_stack: Set<string> | string[];
}

// ─── Module-Level Caches ─────────────────────────────────────────────────────

/** Cache for roadmap content reads across command calls. */
const _roadmapContentCache: Map<string, string> = new Map();
function readCachedRoadmap(roadmapPath: string): string | null {
  if (!_roadmapContentCache.has(roadmapPath)) {
    const content = safeReadFile(roadmapPath);
    if (content !== null) _roadmapContentCache.set(roadmapPath, content);
    return content;
  }
  return _roadmapContentCache.get(roadmapPath) ?? null;
}

/** Cache for STATE.md reads across command calls. */
const _stateContentCache: Map<string, string> = new Map();
function readCachedState(statePath: string): string | null {
  if (!_stateContentCache.has(statePath)) {
    const content = safeReadFile(statePath);
    if (content !== null) _stateContentCache.set(statePath, content);
    return content;
  }
  return _stateContentCache.get(statePath) ?? null;
}

// ─── History Digest ─────────────────────────────────────────────────────────

/** Aggregate metrics, decisions, and tech stack from all SUMMARY.md files. */
function cmdHistoryDigest(cwd: string, raw: boolean): void {
  const phasesDir = getPhasesDirPath(cwd) as string;
  const digest: HistoryDigest = { phases: {}, decisions: [], tech_stack: new Set<string>() };

  if (!fs.existsSync(phasesDir)) {
    (digest as unknown as Record<string, unknown>).tech_stack = [];
    output(digest, raw, 'No phases found');
    return;
  }

  try {
    const phaseDirs: string[] = fs.readdirSync(phasesDir, { withFileTypes: true })
      .filter((e: { isDirectory: () => boolean }) => e.isDirectory())
      .map((e: { name: string }) => e.name).sort();

    for (const dir of phaseDirs) {
      const dirPath = path.join(phasesDir, dir);
      const summaries: string[] = fs.readdirSync(dirPath)
        .filter((f: string) => f.endsWith('-SUMMARY.md') || f === 'SUMMARY.md');

      for (const summary of summaries) {
        try {
          const content: string = fs.readFileSync(path.join(dirPath, summary), 'utf-8');
          const fm = extractFrontmatter(content) as Record<string, unknown>;
          const phaseNum = (fm.phase as string) || dir.split('-')[0];

          if (!digest.phases[phaseNum]) {
            digest.phases[phaseNum] = {
              name: (fm.name as string) || dir.split('-').slice(1).join(' ') || 'Unknown',
              provides: new Set<string>(), affects: new Set<string>(), patterns: new Set<string>(),
            };
          }
          const pe = digest.phases[phaseNum];
          const prov = pe.provides as Set<string>;
          const aff = pe.affects as Set<string>;
          const pats = pe.patterns as Set<string>;

          const dg = fm['dependency-graph'] as { provides?: string[]; affects?: string[] } | undefined;
          if (dg && dg.provides) dg.provides.forEach((p: string) => prov.add(p));
          else if (fm.provides && Array.isArray(fm.provides))
            (fm.provides as string[]).forEach((p: string) => prov.add(p));
          if (dg && dg.affects) dg.affects.forEach((a: string) => aff.add(a));

          const pe2 = fm['patterns-established'] as string[] | undefined;
          if (pe2) pe2.forEach((p: string) => pats.add(p));

          const kd = fm['key-decisions'] as string[] | undefined;
          if (kd) kd.forEach((d: string) => { digest.decisions.push({ phase: phaseNum, decision: d }); });

          const ts = fm['tech-stack'] as { added?: (string | { name: string })[] } | undefined;
          if (ts && ts.added)
            ts.added.forEach((t) => (digest.tech_stack as Set<string>).add(typeof t === 'string' ? t : t.name));
        } catch { /* skip malformed summaries */ }
      }
    }

    // Convert Sets to Arrays for JSON output
    Object.keys(digest.phases).forEach((p) => {
      const e = digest.phases[p];
      e.provides = Array.from(e.provides as Set<string>);
      e.affects = Array.from(e.affects as Set<string>);
      e.patterns = Array.from(e.patterns as Set<string>);
    });
    (digest as unknown as Record<string, unknown>).tech_stack = Array.from(digest.tech_stack as Set<string>);

    const phaseCount = Object.keys(digest.phases).length;
    const techArr = digest.tech_stack as string[];
    const techList = techArr.length > 0 ? techArr.join(', ') : 'none';
    output(digest, raw, `${phaseCount} phases digested, tech: ${techList}`);
  } catch (e: unknown) {
    error('Failed to generate history digest: ' + (e as Error).message);
  }
}

// ─── Model Resolution ────────────────────────────────────────────────────────

/** Resolve the model name for a given agent type from project configuration. */
function cmdResolveModel(cwd: string, agentType: string, raw: boolean): void {
  if (!agentType) { error('agent-type required'); return; }
  const config = loadConfig(cwd);
  const profile = config.model_profile || 'balanced';
  const agentModels = MODEL_PROFILES[agentType] as Record<string, string> | undefined;
  if (!agentModels) { output({ model: 'sonnet', profile, unknown_agent: true }, raw, 'sonnet'); return; }
  const model = agentModels[profile] || agentModels['balanced'] || 'sonnet';
  output({ model, profile }, raw, model);
}

// ─── Phase Lookup ────────────────────────────────────────────────────────────

/** Find a phase directory by number and list its plans and summaries. */
function cmdFindPhase(cwd: string, phase: string, raw: boolean): void {
  if (!phase) { error('phase identifier required'); return; }
  const phasesDir = getPhasesDirPath(cwd) as string;
  const normalized = normalizePhaseName(phase);
  const notFound = {
    found: false, directory: null as string | null,
    phase_number: null as string | null, phase_name: null as string | null,
    plans: [] as string[], summaries: [] as string[],
  };

  try {
    const dirs: string[] = fs.readdirSync(phasesDir, { withFileTypes: true })
      .filter((e: { isDirectory: () => boolean }) => e.isDirectory())
      .map((e: { name: string }) => e.name).sort();
    const match = dirs.find((d: string) => d.startsWith(normalized + '-') || d === normalized);
    if (!match) { output(notFound, raw, ''); return; }

    const dm = match.match(/^(\d+(?:\.\d+)?)-?(.*)/);
    const phaseNumber = dm ? dm[1] : normalized;
    const phaseName = dm && dm[2] ? dm[2] : null;
    const phaseDir = path.join(phasesDir, match);
    const phaseFiles: string[] = fs.readdirSync(phaseDir);
    const plans = phaseFiles.filter((f: string) => f.endsWith('-PLAN.md') || f === 'PLAN.md').sort();
    const summaries = phaseFiles.filter((f: string) => f.endsWith('-SUMMARY.md') || f === 'SUMMARY.md').sort();
    output({
      found: true, directory: path.relative(cwd, path.join(phasesDir, match)),
      phase_number: phaseNumber, phase_name: phaseName, plans, summaries,
    }, raw, path.relative(cwd, path.join(phasesDir, match)));
  } catch { output(notFound, raw, ''); }
}

// ─── Detect Backend ─────────────────────────────────────────────────────────

/** Detect the current AI coding CLI backend and return backend info. */
function cmdDetectBackend(cwd: string, raw: boolean): void {
  const config = loadConfig(cwd);
  const backend = detectBackend(cwd);
  const cfgRec = config as unknown as Record<string, unknown>;
  const models = {
    opus: resolveBackendModel(backend, 'opus' as ModelTier, cfgRec, cwd),
    sonnet: resolveBackendModel(backend, 'sonnet' as ModelTier, cfgRec, cwd),
    haiku: resolveBackendModel(backend, 'haiku' as ModelTier, cfgRec, cwd),
  };
  const detected = getCachedModels(backend, cwd);
  const models_source = detected ? 'detected' : 'defaults';
  const capabilities = getBackendCapabilities(backend);
  output({ backend, models, models_source, capabilities }, raw, backend);
}

// ─── Commit ─────────────────────────────────────────────────────────────────

/** Create a git commit with specified files, respecting commit_docs and gitignore config. */
function cmdCommit(cwd: string, message: string, files: string[], raw: boolean, amend?: boolean): void {
  if (!message && !amend) { error('commit message required'); return; }
  const config = loadConfig(cwd);

  if (!config.commit_docs) {
    output({ committed: false, hash: null, reason: 'skipped_commit_docs_false' }, raw, 'skipped');
    return;
  }
  if (isGitIgnored(cwd, getPlanningDir(cwd))) {
    output({ committed: false, hash: null, reason: 'skipped_gitignored' }, raw, 'skipped');
    return;
  }

  const filesToStage = files && files.length > 0 ? files : [getPlanningDir(cwd)];
  for (const file of filesToStage) execGit(cwd, ['add', file]);

  const commitArgs = amend ? ['commit', '--amend', '--no-edit'] : ['commit', '-m', message];
  const commitResult = execGit(cwd, commitArgs);
  if (commitResult.exitCode !== 0) {
    if (commitResult.stdout.includes('nothing to commit') || commitResult.stderr.includes('nothing to commit')) {
      output({ committed: false, hash: null, reason: 'nothing_to_commit' }, raw, 'nothing');
      return;
    }
    output({
      committed: false, hash: null as string | null, reason: 'commit_failed',
      error: commitResult.stderr || commitResult.stdout,
    }, raw, 'failed');
    return;
  }

  const hashResult = execGit(cwd, ['rev-parse', '--short', 'HEAD']);
  const hash = hashResult.exitCode === 0 ? hashResult.stdout : null;
  output({ committed: true, hash, reason: 'committed' }, raw, hash || 'committed');
}

// ─── Phase Plan Index ───────────────────────────────────────────────────────

/** Index plans in a phase with wave grouping, completion status, and checkpoint detection. */
function cmdPhasePlanIndex(cwd: string, phase: string, raw: boolean): void {
  if (!phase) {
    error('phase required for phase-plan-index. Usage: phase-plan-index <phase-number>. Run `grd-tools phase list` to see available phases, then pass a phase number, e.g.: phase-plan-index 2');
    return;
  }
  const phasesDir = getPhasesDirPath(cwd) as string;
  const normalized = normalizePhaseName(phase);

  let phaseDir: string | null = null;
  try {
    const dirs: string[] = fs.readdirSync(phasesDir, { withFileTypes: true })
      .filter((e: { isDirectory: () => boolean }) => e.isDirectory())
      .map((e: { name: string }) => e.name).sort();
    const match = dirs.find((d: string) => d.startsWith(normalized + '-') || d === normalized);
    if (match) phaseDir = path.join(phasesDir, match);
  } catch { /* phases dir doesn't exist */ }

  if (!phaseDir) {
    output({ phase: normalized, error: 'Phase not found', plans: [], waves: {}, incomplete: [], has_checkpoints: false }, raw);
    return;
  }

  const phaseFiles: string[] = fs.readdirSync(phaseDir);
  const planFiles = phaseFiles.filter((f: string) => f.endsWith('-PLAN.md') || f === 'PLAN.md').sort();
  const summaryFiles = phaseFiles.filter((f: string) => f.endsWith('-SUMMARY.md') || f === 'SUMMARY.md');
  const completedPlanIds = new Set(summaryFiles.map((s: string) => s.replace('-SUMMARY.md', '').replace('SUMMARY.md', '')));

  const plans: PlanIndexEntry[] = [];
  const waves: Record<string, string[]> = {};
  const incomplete: string[] = [];
  let hasCheckpoints = false;

  for (const planFile of planFiles) {
    const planId = planFile.replace('-PLAN.md', '').replace('PLAN.md', '');
    const planPath = path.join(phaseDir, planFile);
    const content: string = fs.readFileSync(planPath, 'utf-8');
    const fm = extractFrontmatter(content);

    const taskMatches = content.match(/##\s*Task\s*\d+/gi);
    const taskCount = taskMatches ? taskMatches.length : 0;
    const wave = parseInt(String(fm.wave), 10) || 1;

    let autonomous = true;
    const rawAuto: unknown = fm.autonomous;
    if (rawAuto !== undefined) autonomous = rawAuto === 'true' || rawAuto === true;
    if (!autonomous) hasCheckpoints = true;

    let filesModified: string[] = [];
    const rawFm = (fm as Record<string, unknown>).files_modified || (fm as Record<string, unknown>)['files-modified'];
    if (rawFm) filesModified = Array.isArray(rawFm) ? rawFm as string[] : [rawFm as string];

    const hasSummary = completedPlanIds.has(planId);
    if (!hasSummary) incomplete.push(planId);

    let objective: string | null = ((fm as Record<string, unknown>).objective as string) || null;
    if (!objective) {
      const bodyStart = content.match(/^---\n[\s\S]+?\n---\n?/);
      const body = bodyStart ? content.slice(bodyStart[0].length) : content;
      const objMatch = body.match(/<objective>\s*([\s\S]*?)\s*<\/objective>/i);
      if (objMatch) objective = objMatch[1].trim().split('\n')[0].trim();
    }

    plans.push({ id: planId, wave, autonomous, objective, files_modified: filesModified, task_count: taskCount, has_summary: hasSummary });
    const waveKey = String(wave);
    if (!waves[waveKey]) waves[waveKey] = [];
    waves[waveKey].push(planId);
  }

  output({ phase: normalized, plans, waves, incomplete, has_checkpoints: hasCheckpoints }, raw,
    `Phase ${normalized}: ${plans.length} plans, ${incomplete.length} incomplete`);
}

// ─── Summary Extract ────────────────────────────────────────────────────────

/** Extract structured data from a SUMMARY.md file. */
function cmdSummaryExtract(cwd: string, summaryPath: string, fields: string[] | null, raw: boolean): void {
  if (!summaryPath) {
    error('summary-path required for summary-extract. Usage: summary-extract <path-to-SUMMARY.md>. Provide the relative path to a SUMMARY.md file, e.g.: summary-extract .planning/milestones/v1.0/phases/01-init/01-01-SUMMARY.md');
    return;
  }
  const fullPath = path.join(cwd, summaryPath);
  if (!fs.existsSync(fullPath)) { output({ error: 'File not found', path: summaryPath }, raw); return; }

  const content: string = fs.readFileSync(fullPath, 'utf-8');
  const fm = extractFrontmatter(content) as Record<string, unknown>;

  const parseDecisions = (list: unknown): SummaryDecision[] => {
    if (!list || !Array.isArray(list)) return [];
    return (list as string[]).map((d) => {
      const idx = d.indexOf(':');
      return idx > 0
        ? { summary: d.substring(0, idx).trim(), rationale: d.substring(idx + 1).trim() }
        : { summary: d, rationale: null };
    });
  };

  const ts = fm['tech-stack'] as { added?: unknown[] } | undefined;
  const fullResult = {
    path: summaryPath,
    one_liner: (fm['one-liner'] as string) || null,
    key_files: (fm['key-files'] as unknown[]) || [],
    tech_added: (ts && ts.added) || [],
    patterns: (fm['patterns-established'] as string[]) || [],
    decisions: parseDecisions(fm['key-decisions']),
  };

  if (fields && fields.length > 0) {
    const filtered: Record<string, unknown> = { path: summaryPath };
    const src = fullResult as unknown as Record<string, unknown>;
    for (const field of fields) { if (src[field] !== undefined) filtered[field] = src[field]; }
    output(filtered, raw, (filtered as { one_liner?: string }).one_liner || path.basename(summaryPath));
    return;
  }
  output(fullResult, raw, fullResult.one_liner || path.basename(summaryPath));
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  readCachedRoadmap, readCachedState, _roadmapContentCache, _stateContentCache,
  cmdHistoryDigest, cmdResolveModel, cmdFindPhase, cmdDetectBackend,
  cmdCommit, cmdPhasePlanIndex, cmdSummaryExtract,
};
