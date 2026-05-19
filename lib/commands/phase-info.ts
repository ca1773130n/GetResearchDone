'use strict';

/** GRD Commands/PhaseInfo -- Phase lookup, model resolution, commit, plan indexing, summary extraction, history digest */


import type {
  GrdConfig,
  BackendId,
  BackendCapabilities,
  ModelTier,
  FrontmatterObject,
  AgentModelProfiles,
  ExecGitResult,
} from '../types';

const fs = require('fs');
const path = require('path');
const {
  safeReadFile,
  loadConfig,
  isGitIgnored,
  execGit,
  normalizePhaseName,
  MODEL_PROFILES,
  output,
  error,
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
const {
  extractFrontmatter,
}: {
  extractFrontmatter: (content: string) => FrontmatterObject;
} = require('../frontmatter');
const {
  detectBackend,
  resolveBackendModel,
  getBackendCapabilities,
  getCachedModels,
}: {
  detectBackend: (cwd: string) => BackendId;
  resolveBackendModel: (
    b: string,
    t: ModelTier,
    c?: Record<string, unknown>,
    cwd?: string
  ) => string | undefined;
  getBackendCapabilities: (b: string) => BackendCapabilities;
  getCachedModels: (b: string, cwd?: string) => Record<string, string> | null;
} = require('../backend');
const {
  phasesDir: getPhasesDirPath,
  planningDir: getPlanningDir,
}: {
  phasesDir: (cwd: string) => string;
  planningDir: (cwd: string) => string;
} = require('../paths');

// ─── Domain Types ────────────────────────────────────────────────────────────

interface PlanIndexEntry {
  id: string;
  wave: number;
  autonomous: boolean;
  objective: string | null;
  files_modified: string[];
  task_count: number;
  has_summary: boolean;
}
interface SummaryDecision {
  summary: string;
  rationale: string | null;
}
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
    const phaseDirs: string[] = fs
      .readdirSync(phasesDir, { withFileTypes: true })
      .filter((e: { isDirectory: () => boolean }) => e.isDirectory())
      .map((e: { name: string }) => e.name)
      .sort();

    for (const dir of phaseDirs) {
      const dirPath = path.join(phasesDir, dir);
      const summaries: string[] = fs
        .readdirSync(dirPath)
        .filter((f: string) => f.endsWith('-SUMMARY.md') || f === 'SUMMARY.md');

      for (const summary of summaries) {
        try {
          const content: string = fs.readFileSync(path.join(dirPath, summary), 'utf-8');
          const fm = extractFrontmatter(content) as Record<string, unknown>;
          const phaseNum = (fm.phase as string) || dir.split('-')[0];

          if (!digest.phases[phaseNum]) {
            digest.phases[phaseNum] = {
              name: (fm.name as string) || dir.split('-').slice(1).join(' ') || 'Unknown',
              provides: new Set<string>(),
              affects: new Set<string>(),
              patterns: new Set<string>(),
            };
          }
          const pe = digest.phases[phaseNum];
          const prov = pe.provides as Set<string>;
          const aff = pe.affects as Set<string>;
          const pats = pe.patterns as Set<string>;

          const dg = fm['dependency-graph'] as
            | { provides?: string[]; affects?: string[] }
            | undefined;
          if (dg && dg.provides) dg.provides.forEach((p: string) => prov.add(p));
          else if (fm.provides && Array.isArray(fm.provides))
            (fm.provides as string[]).forEach((p: string) => prov.add(p));
          if (dg && dg.affects) dg.affects.forEach((a: string) => aff.add(a));

          const pe2 = fm['patterns-established'] as string[] | undefined;
          if (pe2) pe2.forEach((p: string) => pats.add(p));

          const kd = fm['key-decisions'] as string[] | undefined;
          if (kd)
            kd.forEach((d: string) => {
              digest.decisions.push({ phase: phaseNum, decision: d });
            });

          const ts = fm['tech-stack'] as { added?: (string | { name: string })[] } | undefined;
          if (ts && ts.added)
            ts.added.forEach((t) =>
              (digest.tech_stack as Set<string>).add(typeof t === 'string' ? t : t.name)
            );
        } catch {
          /* skip malformed summaries */
        }
      }
    }

    // Convert Sets to Arrays for JSON output
    Object.keys(digest.phases).forEach((p) => {
      const e = digest.phases[p];
      e.provides = Array.from(e.provides as Set<string>);
      e.affects = Array.from(e.affects as Set<string>);
      e.patterns = Array.from(e.patterns as Set<string>);
    });
    (digest as unknown as Record<string, unknown>).tech_stack = Array.from(
      digest.tech_stack as Set<string>
    );

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
  if (!agentType) {
    error('agent-type required');
    return;
  }
  const config = loadConfig(cwd);
  const profile = config.model_profile || 'balanced';
  const agentModels = MODEL_PROFILES[agentType] as Record<string, string> | undefined;
  if (!agentModels) {
    output({ model: 'sonnet', profile, unknown_agent: true }, raw, 'sonnet');
    return;
  }
  const model = agentModels[profile] || agentModels['balanced'] || 'sonnet';
  output({ model, profile }, raw, model);
}

// ─── Phase Lookup ────────────────────────────────────────────────────────────

/** Find a phase directory by number and list its plans and summaries. */
function cmdFindPhase(cwd: string, phase: string, raw: boolean): void {
  if (!phase) {
    error('phase identifier required');
    return;
  }
  const phasesDir = getPhasesDirPath(cwd) as string;
  const normalized = normalizePhaseName(phase);
  const notFound = {
    found: false,
    directory: null as string | null,
    phase_number: null as string | null,
    phase_name: null as string | null,
    plans: [] as string[],
    summaries: [] as string[],
  };

  try {
    const dirs: string[] = fs
      .readdirSync(phasesDir, { withFileTypes: true })
      .filter((e: { isDirectory: () => boolean }) => e.isDirectory())
      .map((e: { name: string }) => e.name)
      .sort();
    const match = dirs.find((d: string) => d.startsWith(normalized + '-') || d === normalized);
    if (!match) {
      output(notFound, raw, '');
      return;
    }

    const dm = match.match(/^(\d+(?:\.\d+)?)-?(.*)/);
    const phaseNumber = dm ? dm[1] : normalized;
    const phaseName = dm && dm[2] ? dm[2] : null;
    const phaseDir = path.join(phasesDir, match);
    const phaseFiles: string[] = fs.readdirSync(phaseDir);
    const plans = phaseFiles
      .filter((f: string) => f.endsWith('-PLAN.md') || f === 'PLAN.md')
      .sort();
    const summaries = phaseFiles
      .filter((f: string) => f.endsWith('-SUMMARY.md') || f === 'SUMMARY.md')
      .sort();
    output(
      {
        found: true,
        directory: path.relative(cwd, path.join(phasesDir, match)),
        phase_number: phaseNumber,
        phase_name: phaseName,
        plans,
        summaries,
      },
      raw,
      path.relative(cwd, path.join(phasesDir, match))
    );
  } catch {
    output(notFound, raw, '');
  }
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
function cmdCommit(
  cwd: string,
  message: string,
  files: string[],
  raw: boolean,
  amend?: boolean
): void {
  if (!message && !amend) {
    error('commit message required');
    return;
  }
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
    if (
      commitResult.stdout.includes('nothing to commit') ||
      commitResult.stderr.includes('nothing to commit')
    ) {
      output({ committed: false, hash: null, reason: 'nothing_to_commit' }, raw, 'nothing');
      return;
    }
    output(
      {
        committed: false,
        hash: null as string | null,
        reason: 'commit_failed',
        error: commitResult.stderr || commitResult.stdout,
      },
      raw,
      'failed'
    );
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
    error(
      'phase required for phase-plan-index. Usage: phase-plan-index <phase-number>. Run `grd-tools phase list` to see available phases, then pass a phase number, e.g.: phase-plan-index 2'
    );
    return;
  }
  const phasesDir = getPhasesDirPath(cwd) as string;
  const normalized = normalizePhaseName(phase);

  let phaseDir: string | null = null;
  try {
    const dirs: string[] = fs
      .readdirSync(phasesDir, { withFileTypes: true })
      .filter((e: { isDirectory: () => boolean }) => e.isDirectory())
      .map((e: { name: string }) => e.name)
      .sort();
    const match = dirs.find((d: string) => d.startsWith(normalized + '-') || d === normalized);
    if (match) phaseDir = path.join(phasesDir, match);
  } catch {
    /* phases dir doesn't exist */
  }

  if (!phaseDir) {
    output(
      {
        phase: normalized,
        error: 'Phase not found',
        plans: [],
        waves: {},
        incomplete: [],
        has_checkpoints: false,
      },
      raw
    );
    return;
  }

  const phaseFiles: string[] = fs.readdirSync(phaseDir);
  const planFiles = phaseFiles
    .filter((f: string) => f.endsWith('-PLAN.md') || f === 'PLAN.md')
    .sort();
  const summaryFiles = phaseFiles.filter(
    (f: string) => f.endsWith('-SUMMARY.md') || f === 'SUMMARY.md'
  );
  const completedPlanIds = new Set(
    summaryFiles.map((s: string) => s.replace('-SUMMARY.md', '').replace('SUMMARY.md', ''))
  );

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
    const rawFm =
      (fm as Record<string, unknown>).files_modified ||
      (fm as Record<string, unknown>)['files-modified'];
    if (rawFm) filesModified = Array.isArray(rawFm) ? (rawFm as string[]) : [rawFm as string];

    const hasSummary = completedPlanIds.has(planId);
    if (!hasSummary) incomplete.push(planId);

    let objective: string | null = ((fm as Record<string, unknown>).objective as string) || null;
    if (!objective) {
      const bodyStart = content.match(/^---\n[\s\S]+?\n---\n?/);
      const body = bodyStart ? content.slice(bodyStart[0].length) : content;
      const objMatch = body.match(/<objective>\s*([\s\S]*?)\s*<\/objective>/i);
      if (objMatch) objective = objMatch[1].trim().split('\n')[0].trim();
    }

    plans.push({
      id: planId,
      wave,
      autonomous,
      objective,
      files_modified: filesModified,
      task_count: taskCount,
      has_summary: hasSummary,
    });
    const waveKey = String(wave);
    if (!waves[waveKey]) waves[waveKey] = [];
    waves[waveKey].push(planId);
  }

  output(
    { phase: normalized, plans, waves, incomplete, has_checkpoints: hasCheckpoints },
    raw,
    `Phase ${normalized}: ${plans.length} plans, ${incomplete.length} incomplete`
  );
}

// ─── Summary Extract ────────────────────────────────────────────────────────

/** Extract structured data from a SUMMARY.md file. */
function cmdSummaryExtract(
  cwd: string,
  summaryPath: string,
  fields: string[] | null,
  raw: boolean
): void {
  if (!summaryPath) {
    error(
      'summary-path required for summary-extract. Usage: summary-extract <path-to-SUMMARY.md>. Provide the relative path to a SUMMARY.md file, e.g.: summary-extract .planning/milestones/v1.0/phases/01-init/01-01-SUMMARY.md'
    );
    return;
  }
  const fullPath = path.join(cwd, summaryPath);
  if (!fs.existsSync(fullPath)) {
    output({ error: 'File not found', path: summaryPath }, raw);
    return;
  }

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
    for (const field of fields) {
      if (src[field] !== undefined) filtered[field] = src[field];
    }
    output(
      filtered,
      raw,
      (filtered as { one_liner?: string }).one_liner || path.basename(summaryPath)
    );
    return;
  }
  output(fullResult, raw, fullResult.one_liner || path.basename(summaryPath));
}

// ─── Phase Dependency Risk Scorer ────────────────────────────────────────────

type RiskLevel = 'green' | 'yellow' | 'red';

interface PhaseRiskRow {
  phase: string;
  risk: RiskLevel;
  reasons: string[];
}

interface DepsRiskResult {
  start_phase: string | null;
  phases_checked: number;
  risks: PhaseRiskRow[];
  red_count: number;
  yellow_count: number;
}

/**
 * Traverse the phase dependency chain from start_phase, scoring each phase
 * green/yellow/red based on: open DEFER- items, missing VERIFICATION.md,
 * and failed test state from EVOLVE-STATE.json.
 */
function cmdDepsRisk(cwd: string, startPhase: string | null, raw: boolean): void {
  const planningDir = getPlanningDir(cwd) as string;

  // Load EVOLVE-STATE for last test-pass info
  let evolveState: Record<string, unknown> = {};
  const evolveStatePath = path.join(planningDir, 'EVOLVE-STATE.json');
  if (fs.existsSync(evolveStatePath)) {
    try {
      evolveState = JSON.parse(safeReadFile(evolveStatePath) ?? '{}') as Record<string, unknown>;
    } catch { /* use empty */ }
  }

  // Load ROADMAP.md to build ordered phase list
  const roadmapPath = path.join(planningDir, 'ROADMAP.md');
  const roadmapContent = safeReadFile(roadmapPath);
  const phaseLineRe = /^\|\s*Phase\s+(\d+)\s*\|([^|]*)\|([^|]*)\|([^|]*)\|/;
  const orderedPhases: string[] = [];
  if (roadmapContent) {
    for (const line of roadmapContent.split('\n')) {
      const m = line.match(phaseLineRe);
      if (m) orderedPhases.push(m[1].trim());
    }
  }

  // If no roadmap, fall back to scanning phase directories
  const phasesDir = getPhasesDirPath(cwd) as string;
  if (orderedPhases.length === 0 && fs.existsSync(phasesDir)) {
    try {
      (fs.readdirSync(phasesDir) as string[])
        .filter((d: string) => /^\d+/.test(d))
        .sort()
        .forEach((d: string) => orderedPhases.push(d.replace(/^(\d+).*/, '$1')));
    } catch { /* skip */ }
  }

  // Determine which phases to scan
  let phasesToCheck = orderedPhases;
  if (startPhase) {
    const idx = orderedPhases.findIndex((p) => p === startPhase.replace(/^Phase\s+/i, '').trim());
    if (idx >= 0) phasesToCheck = orderedPhases.slice(idx);
  }

  const risks: PhaseRiskRow[] = [];

  for (const phaseNum of phasesToCheck) {
    const reasons: string[] = [];

    // Check VERIFICATION.md
    let verificationPath: string | null;
    if (fs.existsSync(phasesDir)) {
      try {
        // Codex r10 P2: normalize phaseNum to the canonical zero-padded
        // form (matches the rest of the CLI's resolver) so phase ids
        // like `1` find the on-disk `01-test` directory.
        const padded = /^\d+$/.test(phaseNum) ? phaseNum.padStart(2, '0') : phaseNum;
        const phaseDir = (fs.readdirSync(phasesDir) as string[]).find((d: string) =>
          d === phaseNum || d === padded ||
          d.startsWith(`${phaseNum}-`) || d.startsWith(`${phaseNum}_`) ||
          d.startsWith(`${padded}-`) || d.startsWith(`${padded}_`)
        );
        if (phaseDir) {
          // Codex r20 P2: include prefixed VERIFICATION names (e.g.
          // `99-VERIFICATION.md`) so completed phases are not flagged
          // as missing verification.
          const phaseAbsDir = path.join(phasesDir, phaseDir);
          let vPath: string | null = path.join(phaseAbsDir, 'VERIFICATION.md');
          if (!fs.existsSync(vPath)) {
            try {
              const prefixed = (fs.readdirSync(phaseAbsDir) as string[]).find(
                (f: string) => /-VERIFICATION\.md$/.test(f)
              );
              vPath = prefixed ? path.join(phaseAbsDir, prefixed) : null;
            } catch {
              vPath = null;
            }
          }
          verificationPath = vPath;
          if (!verificationPath) reasons.push('missing VERIFICATION.md');

          if (verificationPath) {
            const vContent = safeReadFile(verificationPath) ?? '';
            const deferCount = (vContent.match(/DEFER-/g) ?? []).length;
            if (deferCount > 0) reasons.push(`${deferCount} open DEFER- items`);
          }
        } else {
          reasons.push('phase directory not found');
        }
      } catch { /* skip */ }
    }

    // Check test pass state from EVOLVE-STATE
    const phaseTimings = evolveState['phase_timings'];
    if (Array.isArray(phaseTimings)) {
      const phaseRecord = (phaseTimings as Array<Record<string, unknown>>).find(
        (r) => String(r['phase']) === phaseNum
      );
      if (phaseRecord && phaseRecord['tests_passed'] === false) {
        reasons.push('tests failed in last recorded run');
      }
    }

    let risk: RiskLevel;
    if (reasons.some((r) => r.includes('DEFER') || r.includes('failed'))) {
      risk = 'red';
    } else if (reasons.length > 0) {
      risk = 'yellow';
    } else {
      risk = 'green';
    }

    risks.push({ phase: phaseNum, risk, reasons });
  }

  const result: DepsRiskResult = {
    start_phase: startPhase,
    phases_checked: risks.length,
    risks,
    red_count: risks.filter((r) => r.risk === 'red').length,
    yellow_count: risks.filter((r) => r.risk === 'yellow').length,
  };

  const redCount = result.red_count;
  const yellowCount = result.yellow_count;
  const summary = redCount === 0 && yellowCount === 0
    ? `All ${risks.length} phases green — safe to run autopilot`
    : `${redCount} red, ${yellowCount} yellow across ${risks.length} phases`;
  output(result, raw, summary);
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  readCachedRoadmap,
  readCachedState,
  _stateContentCache,
  cmdHistoryDigest,
  cmdResolveModel,
  cmdFindPhase,
  cmdDetectBackend,
  cmdCommit,
  cmdPhasePlanIndex,
  cmdSummaryExtract,
  cmdDepsRisk,
};
