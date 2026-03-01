/**
 * GRD Context/Project -- Init context builders for project management and lifecycle workflows
 *
 * Contains: cmdInitNewProject, cmdInitNewMilestone, cmdInitPhaseOp,
 *           cmdInitMilestoneOp, cmdInitTodos, cmdInitQuick, cmdInitResume,
 *           cmdInitMapCodebase
 *
 * Dependencies: base.ts, utils.ts, backend.ts, paths.ts, gates.ts
 */
'use strict';

import type { GrdConfig, PhaseInfo, MilestoneInfo, BackendCapabilities, PreflightResult } from '../types';

const { fs, path, safeReadFile, loadConfig, findPhaseInternal, resolveModelInternal, pathExistsInternal, generateSlugInternal, getMilestoneInfo, findCodeFiles, output, error } = require('../utils') as {
  fs: typeof import('fs'); path: typeof import('path');
  safeReadFile: (p: string) => string | null; loadConfig: (cwd: string) => GrdConfig;
  findPhaseInternal: (cwd: string, phase: string) => PhaseInfo | null;
  resolveModelInternal: (cwd: string, agent: string) => string; pathExistsInternal: (cwd: string, target: string) => boolean;
  generateSlugInternal: (text: string) => string | null; getMilestoneInfo: (cwd: string) => MilestoneInfo;
  findCodeFiles: (dir: string, maxDepth: number, found: string[], depth: number) => string[];
  output: (result: unknown, raw: boolean, rawValue?: unknown) => never; error: (msg: string) => never;
};
const { detectBackend, getBackendCapabilities } = require('../backend') as {
  detectBackend: (cwd: string) => string; getBackendCapabilities: (b: string) => BackendCapabilities;
};
const { runPreflightGates } = require('../gates') as {
  runPreflightGates: (cwd: string, cmd: string, opts?: Record<string, unknown>) => PreflightResult;
};
const { planningDir: getPlanningDir, phasesDir: getPhasesDirPath, researchDir: getResearchDirPath, codebaseDir: getCodebaseDirPath, todosDir: getTodosDirPath, quickDir: getQuickDirPath, milestonesDir: getMilestonesDirPath, standardsDir: getStandardsDirPath } = require('../paths') as {
  planningDir: (cwd: string) => string; phasesDir: (cwd: string) => string; researchDir: (cwd: string) => string;
  codebaseDir: (cwd: string) => string; todosDir: (cwd: string) => string; quickDir: (cwd: string) => string;
  milestonesDir: (cwd: string) => string; standardsDir: (cwd: string) => string;
};

// ─── New-Project Init ────────────────────────────────────────────────────────

function cmdInitNewProject(cwd: string, raw: boolean): void {
  const config = loadConfig(cwd);
  const backend = detectBackend(cwd);
  let hasCode = false;
  try { const codeFiles = findCodeFiles(cwd, 3, [], 0); hasCode = codeFiles.length > 0; } catch { /* scan failed */ }
  const hasPackageFile = pathExistsInternal(cwd, 'package.json') || pathExistsInternal(cwd, 'requirements.txt') ||
    pathExistsInternal(cwd, 'Cargo.toml') || pathExistsInternal(cwd, 'go.mod') || pathExistsInternal(cwd, 'Package.swift');

  const result: Record<string, unknown> = {
    backend, backend_capabilities: getBackendCapabilities(backend),
    researcher_model: resolveModelInternal(cwd, 'grd-project-researcher'),
    synthesizer_model: resolveModelInternal(cwd, 'grd-research-synthesizer'),
    roadmapper_model: resolveModelInternal(cwd, 'grd-roadmapper'),
    commit_docs: config.commit_docs,
    project_exists: pathExistsInternal(cwd, path.join(getPlanningDir(cwd), 'PROJECT.md')),
    has_codebase_map: fs.existsSync(getCodebaseDirPath(cwd)),
    planning_exists: pathExistsInternal(cwd, '.planning'),
    principles_exists: pathExistsInternal(cwd, path.join(getPlanningDir(cwd), 'PRINCIPLES.md')),
    standards_exists: fs.existsSync(path.join(getStandardsDirPath(cwd), 'index.yml')),
    has_existing_code: hasCode, has_package_file: hasPackageFile,
    is_brownfield: hasCode || hasPackageFile,
    needs_codebase_map: (hasCode || hasPackageFile) && !fs.existsSync(getCodebaseDirPath(cwd)),
    has_git: pathExistsInternal(cwd, '.git'),
    phases_dir: path.relative(cwd, getPhasesDirPath(cwd)),
    research_dir: path.relative(cwd, getResearchDirPath(cwd)),
    codebase_dir: path.relative(cwd, getCodebaseDirPath(cwd)),
    quick_dir: path.relative(cwd, getQuickDirPath(cwd)),
    todos_dir: path.relative(cwd, getTodosDirPath(cwd)),
    standards_dir: path.relative(cwd, getStandardsDirPath(cwd)),
  };
  output(result, raw, `Backend: ${result.backend}, brownfield: ${result.is_brownfield}`);
}

// ─── New-Milestone Init ──────────────────────────────────────────────────────

function cmdInitNewMilestone(cwd: string, raw: boolean): void {
  const gates = runPreflightGates(cwd, 'new-milestone');
  if (!gates.passed) { output({ gate_failed: true, gate_errors: gates.errors, gate_warnings: gates.warnings }, raw); return; }
  const config = loadConfig(cwd);
  const backend = detectBackend(cwd);
  const milestone = getMilestoneInfo(cwd);
  let highestArchivedPhase = 0;
  let highestCurrentPhase = 0;
  const milestonesDir = getMilestonesDirPath(cwd);
  const phasesDir = getPhasesDirPath(cwd);

  try {
    const milestoneEntries: { name: string; isDirectory: () => boolean }[] = fs.readdirSync(milestonesDir, { withFileTypes: true });
    for (const entry of milestoneEntries) {
      if (entry.isDirectory() && entry.name.endsWith('-phases')) {
        const archivedPhases: string[] = fs.readdirSync(path.join(milestonesDir, entry.name));
        for (const dir of archivedPhases) {
          const dm = dir.match(/^(\d+)/);
          if (dm) { const num = parseInt(dm[1], 10); if (num > highestArchivedPhase) highestArchivedPhase = num; }
        }
      }
      const newStylePhasesDir = path.join(milestonesDir, entry.name, 'phases');
      if (entry.isDirectory() && entry.name.startsWith('v') && !entry.name.endsWith('-phases') && fs.existsSync(newStylePhasesDir)) {
        const newStylePhases: string[] = fs.readdirSync(newStylePhasesDir);
        for (const dir of newStylePhases) {
          const dm2 = dir.match(/^(\d+)/);
          if (dm2) { const num = parseInt(dm2[1], 10); if (num > highestArchivedPhase) highestArchivedPhase = num; }
        }
      }
    }
  } catch { /* milestones dir may not exist */ }

  try {
    const phaseEntries: { name: string; isDirectory: () => boolean }[] = fs.readdirSync(phasesDir, { withFileTypes: true });
    for (const entry of phaseEntries) {
      if (entry.isDirectory()) {
        const dm = entry.name.match(/^(\d+)/);
        if (dm) { const num = parseInt(dm[1], 10); if (num > highestCurrentPhase) highestCurrentPhase = num; }
      }
    }
  } catch { /* phases dir may not exist */ }

  const suggestedStartPhase = Math.max(highestArchivedPhase, highestCurrentPhase) + 1;
  const result: Record<string, unknown> = {
    backend, backend_capabilities: getBackendCapabilities(backend),
    researcher_model: resolveModelInternal(cwd, 'grd-project-researcher'),
    synthesizer_model: resolveModelInternal(cwd, 'grd-research-synthesizer'),
    roadmapper_model: resolveModelInternal(cwd, 'grd-roadmapper'),
    commit_docs: config.commit_docs, research_enabled: config.research,
    current_milestone: milestone.version, current_milestone_name: milestone.name,
    highest_archived_phase: highestArchivedPhase, highest_current_phase: highestCurrentPhase,
    suggested_start_phase: suggestedStartPhase,
    ...(gates.warnings.length > 0 ? { gate_warnings: gates.warnings } : {}),
    project_exists: pathExistsInternal(cwd, path.join(getPlanningDir(cwd), 'PROJECT.md')),
    roadmap_exists: pathExistsInternal(cwd, path.join(getPlanningDir(cwd), 'ROADMAP.md')),
    state_exists: pathExistsInternal(cwd, path.join(getPlanningDir(cwd), 'STATE.md')),
    phases_dir: path.relative(cwd, phasesDir),
    research_dir: path.relative(cwd, getResearchDirPath(cwd)),
    codebase_dir: path.relative(cwd, getCodebaseDirPath(cwd)),
    quick_dir: path.relative(cwd, getQuickDirPath(cwd)),
    todos_dir: path.relative(cwd, getTodosDirPath(cwd)),
  };
  output(result, raw, `Backend: ${result.backend}, current milestone: ${result.current_milestone}`);
}

// ─── Quick-Task Init ─────────────────────────────────────────────────────────

function cmdInitQuick(cwd: string, description: string | null, raw: boolean): void {
  const config = loadConfig(cwd);
  const backend = detectBackend(cwd);
  const now = new Date();
  const slug = description ? generateSlugInternal(description)?.substring(0, 40) : null;
  const quickDir = getQuickDirPath(cwd);
  let nextNum = 1;
  try {
    const existing = fs.readdirSync(quickDir).filter((f: string) => /^\d+-/.test(f))
      .map((f: string) => parseInt(f.split('-')[0], 10)).filter((n: number) => !isNaN(n));
    if (existing.length > 0) { nextNum = Math.max(...existing) + 1; }
  } catch { /* Quick directory may not exist yet */ }

  const result: Record<string, unknown> = {
    backend, backend_capabilities: getBackendCapabilities(backend),
    planner_model: resolveModelInternal(cwd, 'grd-planner'),
    executor_model: resolveModelInternal(cwd, 'grd-executor'),
    commit_docs: config.commit_docs,
    next_num: nextNum, slug, description: description || null,
    date: now.toISOString().split('T')[0], timestamp: now.toISOString(),
    quick_dir: path.relative(cwd, quickDir),
    task_dir: slug ? path.relative(cwd, path.join(quickDir, `${nextNum}-${slug}`)) : null,
    roadmap_exists: pathExistsInternal(cwd, path.join(getPlanningDir(cwd), 'ROADMAP.md')),
    planning_exists: pathExistsInternal(cwd, '.planning'),
    principles_exists: pathExistsInternal(cwd, path.join(getPlanningDir(cwd), 'PRINCIPLES.md')),
    standards_exists: fs.existsSync(path.join(getStandardsDirPath(cwd), 'index.yml')),
    phases_dir: path.relative(cwd, getPhasesDirPath(cwd)),
    research_dir: path.relative(cwd, getResearchDirPath(cwd)),
    codebase_dir: path.relative(cwd, getCodebaseDirPath(cwd)),
    todos_dir: path.relative(cwd, getTodosDirPath(cwd)),
    standards_dir: path.relative(cwd, getStandardsDirPath(cwd)),
  };
  output(result, raw, `Backend: ${result.backend}, task #${result.next_num}${result.slug ? ': ' + result.slug : ''}`);
}

// ─── Resume Init ─────────────────────────────────────────────────────────────

function cmdInitResume(cwd: string, raw: boolean): void {
  const config = loadConfig(cwd);
  const backend = detectBackend(cwd);
  const interruptedAgentId = (safeReadFile(path.join(cwd, '.planning', 'current-agent-id.txt')) || '').trim() || null;

  const result: Record<string, unknown> = {
    backend, backend_capabilities: getBackendCapabilities(backend),
    state_exists: pathExistsInternal(cwd, path.join(getPlanningDir(cwd), 'STATE.md')),
    roadmap_exists: pathExistsInternal(cwd, path.join(getPlanningDir(cwd), 'ROADMAP.md')),
    project_exists: pathExistsInternal(cwd, path.join(getPlanningDir(cwd), 'PROJECT.md')),
    planning_exists: pathExistsInternal(cwd, '.planning'),
    has_interrupted_agent: !!interruptedAgentId, interrupted_agent_id: interruptedAgentId,
    commit_docs: config.commit_docs,
    phases_dir: path.relative(cwd, getPhasesDirPath(cwd)),
    research_dir: path.relative(cwd, getResearchDirPath(cwd)),
    codebase_dir: path.relative(cwd, getCodebaseDirPath(cwd)),
    quick_dir: path.relative(cwd, getQuickDirPath(cwd)),
    todos_dir: path.relative(cwd, getTodosDirPath(cwd)),
  };
  output(result, raw, `Backend: ${result.backend}${result.has_interrupted_agent ? ', interrupted agent detected' : ''}`);
}

// ─── Phase-Op Init ───────────────────────────────────────────────────────────

function cmdInitPhaseOp(cwd: string, phase: string, raw: boolean): void {
  const config = loadConfig(cwd);
  const backend = detectBackend(cwd);
  const phaseInfo = findPhaseInternal(cwd, phase);

  const result: Record<string, unknown> = {
    backend, backend_capabilities: getBackendCapabilities(backend),
    commit_docs: config.commit_docs,
    phase_found: !!phaseInfo, phase_dir: phaseInfo?.directory || null,
    phase_number: phaseInfo?.phase_number || null, phase_name: phaseInfo?.phase_name || null,
    phase_slug: phaseInfo?.phase_slug || null, padded_phase: phaseInfo?.phase_number?.padStart(2, '0') || null,
    has_research: phaseInfo?.has_research || false, has_context: phaseInfo?.has_context || false,
    has_plans: (phaseInfo?.plans?.length || 0) > 0, has_verification: phaseInfo?.has_verification || false,
    plan_count: phaseInfo?.plans?.length || 0,
    roadmap_exists: pathExistsInternal(cwd, path.join(getPlanningDir(cwd), 'ROADMAP.md')),
    planning_exists: pathExistsInternal(cwd, '.planning'),
    phases_dir: path.relative(cwd, getPhasesDirPath(cwd)),
    research_dir: path.relative(cwd, getResearchDirPath(cwd)),
    codebase_dir: path.relative(cwd, getCodebaseDirPath(cwd)),
    quick_dir: path.relative(cwd, getQuickDirPath(cwd)),
    todos_dir: path.relative(cwd, getTodosDirPath(cwd)),
  };
  output(result, raw, `Backend: ${result.backend}, phase: ${result.phase_number || 'unknown'}`);
}

// ─── Todos Init ──────────────────────────────────────────────────────────────

interface TodoItem { file: string; created: string; title: string; area: string; path: string; }

function cmdInitTodos(cwd: string, area: string | null, raw: boolean): void {
  const config = loadConfig(cwd);
  const backend = detectBackend(cwd);
  const now = new Date();
  const todosBase = getTodosDirPath(cwd);
  const pendingDir = path.join(todosBase, 'pending');
  let count = 0;
  const todos: TodoItem[] = [];

  try {
    const files: string[] = fs.readdirSync(pendingDir).filter((f: string) => f.endsWith('.md'));
    for (const file of files) {
      try {
        const content: string = fs.readFileSync(path.join(pendingDir, file), 'utf-8');
        const createdMatch = content.match(/^created:\s*(.+)$/m);
        const titleMatch = content.match(/^title:\s*(.+)$/m);
        const areaMatch = content.match(/^area:\s*(.+)$/m);
        const todoArea = areaMatch ? areaMatch[1].trim() : 'general';
        if (area && todoArea !== area) continue;
        count++;
        todos.push({ file, created: createdMatch ? createdMatch[1].trim() : 'unknown', title: titleMatch ? titleMatch[1].trim() : 'Untitled', area: todoArea, path: path.relative(cwd, path.join(pendingDir, file)) });
      } catch { /* unreadable todo file */ }
    }
  } catch { /* todos directory may not exist */ }

  const result: Record<string, unknown> = {
    backend, backend_capabilities: getBackendCapabilities(backend),
    commit_docs: config.commit_docs,
    date: now.toISOString().split('T')[0], timestamp: now.toISOString(),
    todo_count: count, todos, area_filter: area || null,
    pending_dir: path.relative(cwd, pendingDir),
    completed_dir: path.relative(cwd, path.join(todosBase, 'completed')),
    planning_exists: pathExistsInternal(cwd, '.planning'),
    todos_dir_exists: fs.existsSync(todosBase), pending_dir_exists: fs.existsSync(pendingDir),
    phases_dir: path.relative(cwd, getPhasesDirPath(cwd)),
    research_dir: path.relative(cwd, getResearchDirPath(cwd)),
    codebase_dir: path.relative(cwd, getCodebaseDirPath(cwd)),
    quick_dir: path.relative(cwd, getQuickDirPath(cwd)),
    todos_dir: path.relative(cwd, todosBase),
  };
  output(result, raw, `Backend: ${result.backend}, ${result.todo_count} pending todo(s)`);
}

// ─── Milestone-Op Init ───────────────────────────────────────────────────────

function cmdInitMilestoneOp(cwd: string, raw: boolean): void {
  const config = loadConfig(cwd);
  const backend = detectBackend(cwd);
  const milestone = getMilestoneInfo(cwd);
  let phaseCount = 0;
  let completedPhases = 0;
  const phasesDir = getPhasesDirPath(cwd);
  try {
    const entries: { name: string; isDirectory: () => boolean }[] = fs.readdirSync(phasesDir, { withFileTypes: true });
    const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
    phaseCount = dirs.length;
    for (const dir of dirs) {
      try {
        const phaseFiles: string[] = fs.readdirSync(path.join(phasesDir, dir));
        if (phaseFiles.some((f: string) => f.endsWith('-SUMMARY.md') || f === 'SUMMARY.md')) completedPhases++;
      } catch { /* skip unreadable */ }
    }
  } catch { /* phases dir may not exist */ }

  const archiveDir = path.join(cwd, '.planning', 'archive');
  let archivedMilestones: string[] = [];
  try {
    archivedMilestones = fs.readdirSync(archiveDir, { withFileTypes: true })
      .filter((e: { isDirectory: () => boolean }) => e.isDirectory()).map((e: { name: string }) => e.name);
  } catch { /* archive may not exist */ }

  const result: Record<string, unknown> = {
    backend, backend_capabilities: getBackendCapabilities(backend),
    commit_docs: config.commit_docs,
    milestone_version: milestone.version, milestone_name: milestone.name,
    milestone_slug: generateSlugInternal(milestone.name),
    phase_count: phaseCount, completed_phases: completedPhases,
    all_phases_complete: phaseCount > 0 && phaseCount === completedPhases,
    archived_milestones: archivedMilestones, archive_count: archivedMilestones.length,
    project_exists: pathExistsInternal(cwd, path.join(getPlanningDir(cwd), 'PROJECT.md')),
    roadmap_exists: pathExistsInternal(cwd, path.join(getPlanningDir(cwd), 'ROADMAP.md')),
    state_exists: pathExistsInternal(cwd, path.join(getPlanningDir(cwd), 'STATE.md')),
    archive_exists: pathExistsInternal(cwd, path.join(getPlanningDir(cwd), 'archive')),
    phases_dir_exists: fs.existsSync(phasesDir),
    phases_dir: path.relative(cwd, phasesDir),
    research_dir: path.relative(cwd, getResearchDirPath(cwd)),
    codebase_dir: path.relative(cwd, getCodebaseDirPath(cwd)),
    quick_dir: path.relative(cwd, getQuickDirPath(cwd)),
    todos_dir: path.relative(cwd, getTodosDirPath(cwd)),
  };
  output(result, raw, `Backend: ${result.backend}, milestone: ${result.milestone_version}, ${result.phase_count} phases`);
}

// ─── Map-Codebase Init ───────────────────────────────────────────────────────

function cmdInitMapCodebase(cwd: string, raw: boolean): void {
  const config = loadConfig(cwd);
  const backend = detectBackend(cwd);
  const codebaseDir = getCodebaseDirPath(cwd);
  let existingMaps: string[] = [];
  try { existingMaps = fs.readdirSync(codebaseDir).filter((f: string) => f.endsWith('.md')); } catch { /* may not exist */ }

  const result: Record<string, unknown> = {
    backend, backend_capabilities: getBackendCapabilities(backend),
    mapper_model: resolveModelInternal(cwd, 'grd-codebase-mapper'),
    commit_docs: config.commit_docs, search_gitignored: config.search_gitignored,
    parallelization: config.parallelization,
    codebase_dir: path.relative(cwd, codebaseDir),
    existing_maps: existingMaps, has_maps: existingMaps.length > 0,
    planning_exists: pathExistsInternal(cwd, '.planning'),
    codebase_dir_exists: fs.existsSync(codebaseDir),
    phases_dir: path.relative(cwd, getPhasesDirPath(cwd)),
    research_dir: path.relative(cwd, getResearchDirPath(cwd)),
    quick_dir: path.relative(cwd, getQuickDirPath(cwd)),
    todos_dir: path.relative(cwd, getTodosDirPath(cwd)),
  };
  output(result, raw, `Backend: ${result.backend}, ${(result.existing_maps as string[]).length} existing map(s)`);
}

module.exports = {
  cmdInitNewProject,
  cmdInitNewMilestone,
  cmdInitQuick,
  cmdInitResume,
  cmdInitPhaseOp,
  cmdInitTodos,
  cmdInitMilestoneOp,
  cmdInitMapCodebase,
};
