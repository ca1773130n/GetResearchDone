/**
 * GRD Scaffold Operations -- Template selection, fill, and scaffolding
 *
 * Extracted from bin/grd-tools.js during Phase 03 modularization.
 * Depends on: lib/utils.ts (findPhaseInternal, normalizePhaseName, generateSlugInternal, output, error)
 * Depends on: lib/frontmatter.ts (reconstructFrontmatter)
 * Depends on: lib/paths.ts (planningDir, phasesDir, researchDir)
 */

'use strict';

import type { FrontmatterObject, PhaseInfo } from './types';

const fs = require('fs');
const path = require('path');
const {
  findPhaseInternal,
  normalizePhaseName,
  generateSlugInternal,
  output,
  error,
}: {
  findPhaseInternal: (cwd: string, phase: string) => PhaseInfo | null;
  normalizePhaseName: (phase: string) => string;
  generateSlugInternal: (text: string) => string | null;
  output: (result: unknown, raw: boolean, rawValue?: unknown) => never;
  error: (message: string) => never;
} = require('./utils');
const { reconstructFrontmatter }: {
  reconstructFrontmatter: (obj: FrontmatterObject) => string;
} = require('./frontmatter');
const {
  planningDir: getPlanningDir,
  phasesDir: getPhasesDirPath,
  researchDir: getResearchDirPath,
}: {
  planningDir: (cwd: string) => string;
  phasesDir: (cwd: string) => string;
  researchDir: (cwd: string) => string;
} = require('./paths');

// ─── Domain Types ────────────────────────────────────────────────────────────

/**
 * Template selection result from plan complexity heuristics.
 */
interface TemplateSelectResult {
  template: string;
  type: string;
  taskCount: number;
  fileCount: number;
  hasDecisions: boolean;
  error?: string;
  error_type?: string;
}

/**
 * Options for template fill operations.
 */
interface TemplateFillOptions {
  phase?: string;
  name?: string;
  plan?: string;
  type?: string;
  wave?: string;
  fields?: FrontmatterObject;
  [key: string]: string | FrontmatterObject | undefined;
}

/**
 * Options for scaffold operations.
 */
interface ScaffoldOptions {
  phase?: string;
  name?: string;
  [key: string]: string | undefined;
}

/**
 * Result of scaffold or template fill operations.
 */
interface ScaffoldResult {
  created: boolean;
  path?: string;
  directory?: string;
  template?: string;
  reason?: string;
  error?: string;
}

// ─── Template Select ────────────────────────────────────────────────────────

/**
 * CLI command: Select the appropriate summary template type based on plan complexity heuristics.
 * @param cwd - Project working directory
 * @param planPath - Relative path to the plan file to analyze
 * @param raw - Output raw template path instead of JSON
 */
function cmdTemplateSelect(cwd: string, planPath: string, raw: boolean): void {
  if (!planPath) {
    error('plan-path required');
  }

  try {
    const fullPath: string = path.join(cwd, planPath);
    const content: string = fs.readFileSync(fullPath, 'utf-8');

    // Simple heuristics
    const taskMatch: RegExpMatchArray | null = content.match(/###\s*Task\s*\d+/g);
    const taskCount: number = taskMatch ? taskMatch.length : 0;

    const decisionMatch: RegExpMatchArray | null = content.match(/decision/gi);
    const hasDecisions: boolean = decisionMatch !== null && decisionMatch.length > 0;

    // Count file mentions
    const fileMentions = new Set<string>();
    const filePattern = /`([^`]+\.[a-zA-Z]+)`/g;
    let m: RegExpExecArray | null;
    while ((m = filePattern.exec(content)) !== null) {
      if (m[1].includes('/') && !m[1].startsWith('http')) {
        fileMentions.add(m[1]);
      }
    }
    const fileCount: number = fileMentions.size;

    let template = 'templates/summary-standard.md';
    let type = 'standard';

    if (taskCount <= 2 && fileCount <= 3 && !hasDecisions) {
      template = 'templates/summary-minimal.md';
      type = 'minimal';
    } else if (hasDecisions || fileCount > 6 || taskCount > 5) {
      template = 'templates/summary-complex.md';
      type = 'complex';
    }

    const result: TemplateSelectResult = { template, type, taskCount, fileCount, hasDecisions };
    output(result, raw, template);
  } catch (e) {
    // Fallback to standard -- include error_type for diagnostics
    const err = e as { code?: string; message: string };
    const errorType: string = err.code === 'ENOENT' ? 'file_not_found' : 'read_error';
    const result: TemplateSelectResult = {
      template: 'templates/summary-standard.md',
      type: 'standard',
      taskCount: 0,
      fileCount: 0,
      hasDecisions: false,
      error: err.message,
      error_type: errorType,
    };
    output(result, raw, 'templates/summary-standard.md');
  }
}

// ─── Template Fill ──────────────────────────────────────────────────────────

/**
 * CLI command: Fill a template (summary, plan, or verification) with values and write to disk.
 * @param cwd - Project working directory
 * @param templateType - Template type: 'summary', 'plan', or 'verification'
 * @param options - Template options
 * @param raw - Output raw file path instead of JSON
 */
function cmdTemplateFill(cwd: string, templateType: string, options: TemplateFillOptions, raw: boolean): void {
  if (!templateType) {
    error('template type required: summary, plan, or verification. Usage: scaffold <summary|plan|verification> --phase <N> --plan <M>. Specify a template type, e.g.: scaffold summary. Valid types: summary, plan, verification, context, uat, baseline. To list available templates: scaffold template-select <type>');
  }
  if (!options.phase) {
    error('--phase required');
    return; // unreachable but helps TS narrowing
  }
  const phaseNum: string = options.phase;

  const phaseInfo: PhaseInfo | null = findPhaseInternal(cwd, phaseNum);
  if (!phaseInfo || !phaseInfo.found) {
    output({ error: 'Phase not found', phase: phaseNum }, raw);
    return;
  }

  const padded: string = normalizePhaseName(phaseNum);
  const today: string = new Date().toISOString().split('T')[0];
  const phaseName: string = options.name || phaseInfo.phase_name || 'Unnamed';
  const phaseSlug: string = phaseInfo.phase_slug || generateSlugInternal(phaseName) || 'unnamed';
  const phaseId = `${padded}-${phaseSlug}`;
  const planNum: string = (options.plan || '01').padStart(2, '0');
  const fields: FrontmatterObject = options.fields || {};

  let frontmatter: FrontmatterObject;
  let body: string;
  let fileName: string;

  switch (templateType) {
    case 'summary': {
      frontmatter = {
        phase: phaseId,
        plan: planNum,
        subsystem: '[primary category]',
        tags: [],
        provides: [],
        affects: [],
        'tech-stack': { added: [], patterns: [] },
        'key-files': { created: [], modified: [] },
        'key-decisions': [],
        'patterns-established': [],
        duration: '[X]min',
        completed: today,
        ...fields,
      };
      body = [
        `# Phase ${options.phase}: ${phaseName} Summary`,
        '',
        '**[Substantive one-liner describing outcome]**',
        '',
        '## Performance',
        '- **Duration:** [time]',
        '- **Tasks:** [count completed]',
        '- **Files modified:** [count]',
        '',
        '## Accomplishments',
        '- [Key outcome 1]',
        '- [Key outcome 2]',
        '',
        '## Task Commits',
        '1. **Task 1: [task name]** - `hash`',
        '',
        '## Files Created/Modified',
        '- `path/to/file.ts` - What it does',
        '',
        '## Decisions & Deviations',
        '[Key decisions or "None - followed plan as specified"]',
        '',
        '## Next Phase Readiness',
        "[What's ready for next phase]",
      ].join('\n');
      fileName = `${padded}-${planNum}-SUMMARY.md`;
      break;
    }
    case 'plan': {
      const planType: string = options.type || 'execute';
      const wave: number = parseInt(options.wave || '1') || 1;
      frontmatter = {
        phase: phaseId,
        plan: planNum,
        type: planType,
        wave,
        depends_on: [],
        files_modified: [],
        autonomous: true,
        user_setup: [],
        must_haves: { truths: [], artifacts: [], key_links: [] },
        ...fields,
      };
      body = [
        `# Phase ${options.phase} Plan ${planNum}: [Title]`,
        '',
        '## Objective',
        '- **What:** [What this plan builds]',
        '- **Why:** [Why it matters for the phase goal]',
        '- **Output:** [Concrete deliverable]',
        '',
        '## Context',
        '@.planning/PROJECT.md',
        '@.planning/ROADMAP.md',
        '@.planning/STATE.md',
        '',
        '## Tasks',
        '',
        '<task type="code">',
        '  <name>[Task name]</name>',
        '  <files>[file paths]</files>',
        '  <action>[What to do]</action>',
        '  <verify>[How to verify]</verify>',
        '  <done>[Definition of done]</done>',
        '</task>',
        '',
        '## Verification',
        '[How to verify this plan achieved its objective]',
        '',
        '## Success Criteria',
        '- [ ] [Criterion 1]',
        '- [ ] [Criterion 2]',
      ].join('\n');
      fileName = `${padded}-${planNum}-PLAN.md`;
      break;
    }
    case 'verification': {
      frontmatter = {
        phase: phaseId,
        verified: new Date().toISOString(),
        status: 'pending',
        score: '0/0 must-haves verified',
        ...fields,
      };
      body = [
        `# Phase ${options.phase}: ${phaseName} -- Verification`,
        '',
        '## Observable Truths',
        '| # | Truth | Status | Evidence |',
        '|---|-------|--------|----------|',
        '| 1 | [Truth] | pending | |',
        '',
        '## Required Artifacts',
        '| Artifact | Expected | Status | Details |',
        '|----------|----------|--------|---------|',
        '| [path] | [what] | pending | |',
        '',
        '## Key Link Verification',
        '| From | To | Via | Status | Details |',
        '|------|----|----|--------|---------|',
        '| [source] | [target] | [connection] | pending | |',
        '',
        '## Requirements Coverage',
        '| Requirement | Status | Blocking Issue |',
        '|-------------|--------|----------------|',
        '| [req] | pending | |',
        '',
        '## Result',
        '[Pending verification]',
      ].join('\n');
      fileName = `${padded}-VERIFICATION.md`;
      break;
    }
    default:
      error(`Unknown template type: ${templateType}. Available: summary, plan, verification. Usage: scaffold <summary|plan|verification> --phase <N> --plan <M>. Use one of: summary, plan, or verification.`);
      return;
  }

  const fullContent = `---\n${reconstructFrontmatter(frontmatter)}\n---\n\n${body}\n`;
  const outPath: string = path.join(cwd, phaseInfo.directory, fileName);

  if (fs.existsSync(outPath)) {
    output({ error: 'File already exists', path: path.relative(cwd, outPath) }, raw);
    return;
  }

  fs.writeFileSync(outPath, fullContent, 'utf-8');
  const relPath: string = path.relative(cwd, outPath);
  const result: ScaffoldResult = { created: true, path: relPath, template: templateType };
  output(result, raw, relPath);
}

// ─── Scaffold ───────────────────────────────────────────────────────────────

/**
 * CLI command: Scaffold directory structures and files for various GRD artifact types.
 * @param cwd - Project working directory
 * @param type - Scaffold type: 'context', 'uat', 'verification', 'phase-dir', 'research-dir', 'eval', or 'baseline'
 * @param options - Scaffold options
 * @param raw - Output raw file path instead of JSON
 */
function cmdScaffold(cwd: string, type: string, options: ScaffoldOptions, raw: boolean): void {
  const { phase, name } = options;
  const padded: string = phase ? normalizePhaseName(phase) : '00';
  const today: string = new Date().toISOString().split('T')[0];

  // Find phase directory
  const phaseInfo: PhaseInfo | null = phase ? findPhaseInternal(cwd, phase) : null;
  const phaseDir: string | null = phaseInfo ? path.join(cwd, phaseInfo.directory) : null;

  if (phase && !phaseDir && type !== 'phase-dir') {
    error(`Phase ${phase} directory not found. Run "scaffold phase-dir --phase ${phase} --name <description>" to create it, or check .planning/milestones/ for existing phases`);
  }

  let filePath: string | undefined;
  let content: string | undefined;

  switch (type) {
    case 'context': {
      filePath = path.join(phaseDir as string, `${padded}-CONTEXT.md`);
      content = `---\nphase: "${padded}"\nname: "${name || phaseInfo?.phase_name || 'Unnamed'}"\ncreated: ${today}\n---\n\n# Phase ${phase}: ${name || phaseInfo?.phase_name || 'Unnamed'} -- Context\n\n## Decisions\n\n_Decisions will be captured during /grd:discuss-phase ${phase}_\n\n## Discretion Areas\n\n_Areas where the executor can use judgment_\n\n## Deferred Ideas\n\n_Ideas to consider later_\n`;
      break;
    }
    case 'uat': {
      filePath = path.join(phaseDir as string, `${padded}-UAT.md`);
      content = `---\nphase: "${padded}"\nname: "${name || phaseInfo?.phase_name || 'Unnamed'}"\ncreated: ${today}\nstatus: pending\n---\n\n# Phase ${phase}: ${name || phaseInfo?.phase_name || 'Unnamed'} -- User Acceptance Testing\n\n## Test Results\n\n| # | Test | Status | Notes |\n|---|------|--------|-------|\n\n## Summary\n\n_Pending UAT_\n`;
      break;
    }
    case 'verification': {
      filePath = path.join(phaseDir as string, `${padded}-VERIFICATION.md`);
      content = `---\nphase: "${padded}"\nname: "${name || phaseInfo?.phase_name || 'Unnamed'}"\ncreated: ${today}\nstatus: pending\n---\n\n# Phase ${phase}: ${name || phaseInfo?.phase_name || 'Unnamed'} -- Verification\n\n## Goal-Backward Verification\n\n**Phase Goal:** [From ROADMAP.md]\n\n## Checks\n\n| # | Requirement | Status | Evidence |\n|---|------------|--------|----------|\n\n## Result\n\n_Pending verification_\n`;
      break;
    }
    case 'phase-dir': {
      if (!phase || !name) {
        error('phase and name required for phase-dir scaffold. Usage: scaffold phase-dir --phase <N> --name <description>. Provide both flags, e.g.: scaffold phase-dir --phase 3 --name "Data Preprocessing"');
      }
      const slug: string | null = generateSlugInternal(name as string);
      const dirName = `${padded}-${slug}`;
      const phasesParent: string = getPhasesDirPath(cwd);
      fs.mkdirSync(phasesParent, { recursive: true });
      const dirPath: string = path.join(phasesParent, dirName);
      fs.mkdirSync(dirPath, { recursive: true });
      const result: ScaffoldResult = { created: true, directory: path.relative(cwd, dirPath), path: dirPath };
      output(result, raw, dirPath);
      return;
    }
    case 'research-dir': {
      const researchDir: string = getResearchDirPath(cwd);
      const deepDivesDir: string = path.join(researchDir, 'deep-dives');
      fs.mkdirSync(deepDivesDir, { recursive: true });
      const result: ScaffoldResult = { created: true, directory: path.relative(cwd, researchDir) + '/' };
      output(result, raw, researchDir);
      return;
    }
    case 'eval': {
      filePath = path.join(phaseDir as string, `${padded}-EVAL.md`);
      content = `---\nphase: "${padded}"\nname: "${name || phaseInfo?.phase_name || 'Unnamed'}"\ncreated: ${today}\nstatus: pending\nverification_level: proxy\n---\n\n# Phase ${phase}: ${name || phaseInfo?.phase_name || 'Unnamed'} -- Evaluation Plan\n\n## Metrics\n\n| Metric | Baseline | Target | Level |\n|--------|----------|--------|-------|\n\n## Datasets\n\n## Protocol\n\n## Deferred Validations\n\n_Validations that cannot be run until integration phase_\n`;
      break;
    }
    case 'baseline': {
      const baselinePath: string = path.join(cwd, '.planning', 'BASELINE.md');
      if (fs.existsSync(baselinePath)) {
        const result: ScaffoldResult = { created: false, reason: 'already_exists', path: baselinePath };
        output(result, raw, 'exists');
        return;
      }
      const baselineContent = `# Baseline Assessment\n\n**Assessed:** ${today}\n\n## Current Metrics\n\n| Metric | Value | Method | Notes |\n|--------|-------|--------|-------|\n\n## Environment\n\n## Quality Summary\n`;
      fs.writeFileSync(baselinePath, baselineContent, 'utf-8');
      const result: ScaffoldResult = { created: true, path: path.relative(cwd, path.join(getPlanningDir(cwd), 'BASELINE.md')) };
      output(result, raw, baselinePath);
      return;
    }
    default:
      error(
        `Unknown scaffold type: ${type}. Available: context, uat, verification, phase-dir, research-dir, eval, baseline. Usage: scaffold <type> --phase <N>. Use one of: context, uat, verification, phase-dir, research-dir, eval, or baseline.`
      );
  }

  if (filePath && fs.existsSync(filePath)) {
    const result: ScaffoldResult = { created: false, reason: 'already_exists', path: filePath };
    output(result, raw, 'exists');
    return;
  }

  if (filePath && content) {
    fs.writeFileSync(filePath, content, 'utf-8');
    const relPath: string = path.relative(cwd, filePath);
    const result: ScaffoldResult = { created: true, path: relPath };
    output(result, raw, relPath);
  }
}

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
  cmdTemplateSelect,
  cmdTemplateFill,
  cmdScaffold,
};
