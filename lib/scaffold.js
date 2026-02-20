/**
 * GRD Scaffold Operations — Template selection, fill, and scaffolding
 *
 * Extracted from bin/grd-tools.js during Phase 03 modularization.
 * Depends on: lib/utils.js (findPhaseInternal, normalizePhaseName, generateSlugInternal, output, error)
 * Depends on: lib/frontmatter.js (reconstructFrontmatter)
 */

const fs = require('fs');
const path = require('path');
const {
  findPhaseInternal,
  normalizePhaseName,
  generateSlugInternal,
  output,
  error,
} = require('./utils');
const { reconstructFrontmatter } = require('./frontmatter');
const { phasesDir: getPhasesDirPath, researchDir: getResearchDirPath } = require('./paths');

// ─── Template Select ────────────────────────────────────────────────────────

/**
 * CLI command: Select the appropriate summary template type based on plan complexity heuristics.
 * @param {string} cwd - Project working directory
 * @param {string} planPath - Relative path to the plan file to analyze
 * @param {boolean} raw - Output raw template path instead of JSON
 * @returns {void} Outputs template selection to stdout and exits
 */
function cmdTemplateSelect(cwd, planPath, raw) {
  if (!planPath) {
    error('plan-path required');
  }

  try {
    const fullPath = path.join(cwd, planPath);
    const content = fs.readFileSync(fullPath, 'utf-8');

    // Simple heuristics
    const taskMatch = content.match(/###\s*Task\s*\d+/g) || [];
    const taskCount = taskMatch.length;

    const decisionMatch = content.match(/decision/gi) || [];
    const hasDecisions = decisionMatch.length > 0;

    // Count file mentions
    const fileMentions = new Set();
    const filePattern = /`([^`]+\.[a-zA-Z]+)`/g;
    let m;
    while ((m = filePattern.exec(content)) !== null) {
      if (m[1].includes('/') && !m[1].startsWith('http')) {
        fileMentions.add(m[1]);
      }
    }
    const fileCount = fileMentions.size;

    let template = 'templates/summary-standard.md';
    let type = 'standard';

    if (taskCount <= 2 && fileCount <= 3 && !hasDecisions) {
      template = 'templates/summary-minimal.md';
      type = 'minimal';
    } else if (hasDecisions || fileCount > 6 || taskCount > 5) {
      template = 'templates/summary-complex.md';
      type = 'complex';
    }

    const result = { template, type, taskCount, fileCount, hasDecisions };
    output(result, raw, template);
  } catch (e) {
    // Fallback to standard
    output(
      { template: 'templates/summary-standard.md', type: 'standard', error: e.message },
      raw,
      'templates/summary-standard.md'
    );
  }
}

// ─── Template Fill ──────────────────────────────────────────────────────────

/**
 * CLI command: Fill a template (summary, plan, or verification) with values and write to disk.
 * @param {string} cwd - Project working directory
 * @param {string} templateType - Template type: 'summary', 'plan', or 'verification'
 * @param {Object} options - Template options
 * @param {string} options.phase - Phase number (required)
 * @param {string} [options.name] - Phase name override
 * @param {string} [options.plan] - Plan number (default '01')
 * @param {string} [options.type] - Plan type for plan templates (default 'execute')
 * @param {string} [options.wave] - Wave number for plan templates
 * @param {Object} [options.fields] - Additional frontmatter fields to merge
 * @param {boolean} raw - Output raw file path instead of JSON
 * @returns {void} Outputs result to stdout and exits
 */
function cmdTemplateFill(cwd, templateType, options, raw) {
  if (!templateType) {
    error('template type required: summary, plan, or verification');
  }
  if (!options.phase) {
    error('--phase required');
  }

  const phaseInfo = findPhaseInternal(cwd, options.phase);
  if (!phaseInfo || !phaseInfo.found) {
    output({ error: 'Phase not found', phase: options.phase }, raw);
    return;
  }

  const padded = normalizePhaseName(options.phase);
  const today = new Date().toISOString().split('T')[0];
  const phaseName = options.name || phaseInfo.phase_name || 'Unnamed';
  const phaseSlug = phaseInfo.phase_slug || generateSlugInternal(phaseName);
  const phaseId = `${padded}-${phaseSlug}`;
  const planNum = (options.plan || '01').padStart(2, '0');
  const fields = options.fields || {};

  let frontmatter, body, fileName;

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
      const planType = options.type || 'execute';
      const wave = parseInt(options.wave) || 1;
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
        `# Phase ${options.phase}: ${phaseName} — Verification`,
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
      error(`Unknown template type: ${templateType}. Available: summary, plan, verification`);
      return;
  }

  const fullContent = `---\n${reconstructFrontmatter(frontmatter)}\n---\n\n${body}\n`;
  const outPath = path.join(cwd, phaseInfo.directory, fileName);

  if (fs.existsSync(outPath)) {
    output({ error: 'File already exists', path: path.relative(cwd, outPath) }, raw);
    return;
  }

  fs.writeFileSync(outPath, fullContent, 'utf-8');
  const relPath = path.relative(cwd, outPath);
  output({ created: true, path: relPath, template: templateType }, raw, relPath);
}

// ─── Scaffold ───────────────────────────────────────────────────────────────

/**
 * CLI command: Scaffold directory structures and files for various GRD artifact types.
 * @param {string} cwd - Project working directory
 * @param {string} type - Scaffold type: 'context', 'uat', 'verification', 'phase-dir', 'research-dir', 'eval', or 'baseline'
 * @param {Object} options - Scaffold options
 * @param {string} [options.phase] - Phase number (required for most types)
 * @param {string} [options.name] - Name for the scaffold artifact
 * @param {boolean} raw - Output raw file path instead of JSON
 * @returns {void} Outputs result to stdout and exits
 */
function cmdScaffold(cwd, type, options, raw) {
  const { phase, name } = options;
  const padded = phase ? normalizePhaseName(phase) : '00';
  const today = new Date().toISOString().split('T')[0];

  // Find phase directory
  const phaseInfo = phase ? findPhaseInternal(cwd, phase) : null;
  const phaseDir = phaseInfo ? path.join(cwd, phaseInfo.directory) : null;

  if (phase && !phaseDir && type !== 'phase-dir') {
    error(`Phase ${phase} directory not found`);
  }

  let filePath, content;

  switch (type) {
    case 'context': {
      filePath = path.join(phaseDir, `${padded}-CONTEXT.md`);
      content = `---\nphase: "${padded}"\nname: "${name || phaseInfo?.phase_name || 'Unnamed'}"\ncreated: ${today}\n---\n\n# Phase ${phase}: ${name || phaseInfo?.phase_name || 'Unnamed'} — Context\n\n## Decisions\n\n_Decisions will be captured during /grd:discuss-phase ${phase}_\n\n## Discretion Areas\n\n_Areas where the executor can use judgment_\n\n## Deferred Ideas\n\n_Ideas to consider later_\n`;
      break;
    }
    case 'uat': {
      filePath = path.join(phaseDir, `${padded}-UAT.md`);
      content = `---\nphase: "${padded}"\nname: "${name || phaseInfo?.phase_name || 'Unnamed'}"\ncreated: ${today}\nstatus: pending\n---\n\n# Phase ${phase}: ${name || phaseInfo?.phase_name || 'Unnamed'} — User Acceptance Testing\n\n## Test Results\n\n| # | Test | Status | Notes |\n|---|------|--------|-------|\n\n## Summary\n\n_Pending UAT_\n`;
      break;
    }
    case 'verification': {
      filePath = path.join(phaseDir, `${padded}-VERIFICATION.md`);
      content = `---\nphase: "${padded}"\nname: "${name || phaseInfo?.phase_name || 'Unnamed'}"\ncreated: ${today}\nstatus: pending\n---\n\n# Phase ${phase}: ${name || phaseInfo?.phase_name || 'Unnamed'} — Verification\n\n## Goal-Backward Verification\n\n**Phase Goal:** [From ROADMAP.md]\n\n## Checks\n\n| # | Requirement | Status | Evidence |\n|---|------------|--------|----------|\n\n## Result\n\n_Pending verification_\n`;
      break;
    }
    case 'phase-dir': {
      if (!phase || !name) {
        error('phase and name required for phase-dir scaffold');
      }
      const slug = generateSlugInternal(name);
      const dirName = `${padded}-${slug}`;
      const phasesParent = getPhasesDirPath(cwd);
      fs.mkdirSync(phasesParent, { recursive: true });
      const dirPath = path.join(phasesParent, dirName);
      fs.mkdirSync(dirPath, { recursive: true });
      output(
        { created: true, directory: path.relative(cwd, dirPath), path: dirPath },
        raw,
        dirPath
      );
      return;
    }
    case 'research-dir': {
      const researchDir = getResearchDirPath(cwd);
      const deepDivesDir = path.join(researchDir, 'deep-dives');
      fs.mkdirSync(deepDivesDir, { recursive: true });
      output({ created: true, directory: path.relative(cwd, researchDir) + '/' }, raw, researchDir);
      return;
    }
    case 'eval': {
      filePath = path.join(phaseDir, `${padded}-EVAL.md`);
      content = `---\nphase: "${padded}"\nname: "${name || phaseInfo?.phase_name || 'Unnamed'}"\ncreated: ${today}\nstatus: pending\nverification_level: proxy\n---\n\n# Phase ${phase}: ${name || phaseInfo?.phase_name || 'Unnamed'} — Evaluation Plan\n\n## Metrics\n\n| Metric | Baseline | Target | Level |\n|--------|----------|--------|-------|\n\n## Datasets\n\n## Protocol\n\n## Deferred Validations\n\n_Validations that cannot be run until integration phase_\n`;
      break;
    }
    case 'baseline': {
      const baselinePath = path.join(cwd, '.planning', 'BASELINE.md');
      if (fs.existsSync(baselinePath)) {
        output({ created: false, reason: 'already_exists', path: baselinePath }, raw, 'exists');
        return;
      }
      const baselineContent = `# Baseline Assessment\n\n**Assessed:** ${today}\n\n## Current Metrics\n\n| Metric | Value | Method | Notes |\n|--------|-------|--------|-------|\n\n## Environment\n\n## Quality Summary\n`;
      fs.writeFileSync(baselinePath, baselineContent, 'utf-8');
      output({ created: true, path: '.planning/BASELINE.md' }, raw, baselinePath);
      return;
    }
    default:
      error(
        `Unknown scaffold type: ${type}. Available: context, uat, verification, phase-dir, research-dir, eval, baseline`
      );
  }

  if (fs.existsSync(filePath)) {
    output({ created: false, reason: 'already_exists', path: filePath }, raw, 'exists');
    return;
  }

  fs.writeFileSync(filePath, content, 'utf-8');
  const relPath = path.relative(cwd, filePath);
  output({ created: true, path: relPath }, raw, relPath);
}

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
  cmdTemplateSelect,
  cmdTemplateFill,
  cmdScaffold,
};
