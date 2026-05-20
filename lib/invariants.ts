'use strict';

/**
 * GRD Plan Invariant Validation -- Typed interfaces and validation functions for plan artifacts
 *
 * Satisfies REQ-179 (Plan Artifact Schema): typed interfaces and three validation classes
 * plus research artifact validation.
 *
 * Functions:
 *   - extractPlanArtifact: Parses PLAN.md content into a typed PlanArtifact
 *   - validateStructural: Checks required fields and correct types
 *   - validateSemantic: Checks file path safety and objective relevance
 *   - validateCrossPhase: Detects duplicate provides and unmet requires across plans
 *   - validateResearchArtifacts: Validates LANDSCAPE.md, PAPERS.md, RESEARCH.md structure
 *
 * @module invariants
 */

import type { ValidationResult, PlanArtifact } from './types';

const { extractFrontmatter } = require('./frontmatter') as {
  extractFrontmatter: (content: string) => Record<string, unknown>;
};
const fs = require('fs') as typeof import('fs');
const path = require('path') as typeof import('path');
const { planningDir: getPlanningDir } = require('./paths') as {
  planningDir: (cwd: string) => string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a ValidationResult from accumulated errors and warnings.
 */
function makeResult(errors: string[], warnings: string[]): ValidationResult {
  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Coerce a raw frontmatter value to a string[], returning [] for missing/invalid.
 */
function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return (value as unknown[]).filter((v) => typeof v === 'string') as string[];
  }
  return [];
}

// ─── extractPlanArtifact ─────────────────────────────────────────────────────

/**
 * Parse PLAN.md content into a typed PlanArtifact.
 *
 * Extracts YAML frontmatter via extractFrontmatter and pulls the <objective> tag
 * content via regex. Missing or wrong-type fields are replaced with safe defaults.
 *
 * @param content - Raw PLAN.md file content
 * @returns Typed PlanArtifact with defaults for any missing fields
 */
function extractPlanArtifact(content: string): PlanArtifact {
  const fm = extractFrontmatter(content);

  // Extract <objective> tag content
  const objectiveMatch = content.match(/<objective>\s*([\s\S]*?)\s*<\/objective>/);
  const objective = objectiveMatch ? objectiveMatch[1].trim() : '';

  const rawPlan = fm['plan'];
  const plan =
    typeof rawPlan === 'number'
      ? rawPlan
      : typeof rawPlan === 'string' && !isNaN(parseInt(rawPlan, 10))
        ? parseInt(rawPlan, 10)
        : 0;

  const rawWave = fm['wave'];
  const wave =
    typeof rawWave === 'number'
      ? rawWave
      : typeof rawWave === 'string' && !isNaN(parseInt(rawWave, 10))
        ? parseInt(rawWave, 10)
        : 0;

  const rawAutonomous = fm['autonomous'];
  const autonomous =
    rawAutonomous === true ||
    rawAutonomous === 'true' ||
    rawAutonomous === 1;

  const filesModified = toStringArray(fm['files_modified']);
  const dependsOn = toStringArray(fm['depends_on']);
  const provides = toStringArray(fm['provides']);
  const requires = toStringArray(fm['requires']);
  const integrationPoints = toStringArray(fm['integration_points']);

  return {
    objective,
    files_modified: filesModified,
    phase: typeof fm['phase'] === 'string' ? fm['phase'] : '',
    plan,
    type: typeof fm['type'] === 'string' ? fm['type'] : '',
    wave,
    depends_on: dependsOn,
    autonomous,
    provides,
    requires,
    integration_points: integrationPoints,
  };
}

// ─── validateStructural ───────────────────────────────────────────────────────

/**
 * Structural validation: verify required fields are present and correctly typed.
 *
 * Errors (plan is invalid):
 *   - objective is empty/missing
 *   - files_modified is not an array or is empty
 *   - wave is not a positive integer
 *   - autonomous is not boolean
 *   - type is empty/missing
 *
 * Warnings (informational):
 *   - depends_on is not an array
 *   - provides/requires are empty (no dependency tracking)
 *
 * @param plan - PlanArtifact to validate
 * @returns ValidationResult
 */
function validateStructural(plan: PlanArtifact): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!plan.objective || plan.objective.trim() === '') {
    errors.push('objective is empty or missing');
  }

  if (!Array.isArray(plan.files_modified)) {
    errors.push('files_modified must be an array');
  } else if (plan.files_modified.length === 0) {
    errors.push('files_modified must not be empty');
  }

  if (!Number.isInteger(plan.wave) || plan.wave < 1) {
    errors.push(`wave must be a positive integer (got: ${JSON.stringify(plan.wave)})`);
  }

  if (typeof plan.autonomous !== 'boolean') {
    errors.push(`autonomous must be boolean (got: ${JSON.stringify(plan.autonomous)})`);
  }

  if (!plan.type || plan.type.trim() === '') {
    errors.push('type is empty or missing');
  }

  if (!Array.isArray(plan.depends_on)) {
    warnings.push('depends_on should be an array');
  }

  if (plan.provides.length === 0) {
    warnings.push('provides is empty — dependency tracking is disabled for this plan');
  }

  if (plan.requires.length === 0) {
    warnings.push('requires is empty — dependency tracking is disabled for this plan');
  }

  return makeResult(errors, warnings);
}

// ─── validateSemantic ─────────────────────────────────────────────────────────

/**
 * Semantic validation: check file path safety and objective relevance.
 *
 * Errors:
 *   - any file path starts with / (absolute paths disallowed)
 *   - any file path contains .. (directory traversal disallowed)
 *
 * Warnings:
 *   - file paths without extensions (may be intentional but unusual)
 *   - objective does not reference any known lib/ module or directory
 *
 * @param plan - PlanArtifact to validate
 * @param cwd - Project working directory (used for parent directory existence checks)
 * @returns ValidationResult
 */
function validateSemantic(plan: PlanArtifact, cwd: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const filePath of plan.files_modified) {
    if (filePath.startsWith('/')) {
      errors.push(`file path must be relative, not absolute: "${filePath}"`);
    }
    // From PR #25: use segment-based `..` check so filenames containing
    // `..` (e.g. `file..backup.ts`) aren't falsely flagged. Check the
    // basename for the extension warning so paths like `config.d/Makefile`
    // are warned about (legitimately extensionless) without false
    // positives on directories containing `.`.
    if (filePath.split('/').includes('..')) {
      errors.push(`file path must not use .. traversal: "${filePath}"`);
    }
    const basename = filePath.split('/').pop() || filePath;
    if (!basename.includes('.')) {
      warnings.push(`file path has no extension: "${filePath}"`);
    }
  }

  // Check if the objective references known lib/ modules or directories
  const planningRelDir = path.relative(cwd, getPlanningDir(cwd)) + '/';
  const knownDirs = ['lib/', 'bin/', 'commands/', 'agents/', 'tests/', planningRelDir, 'examples/'];
  const objectiveLower = plan.objective.toLowerCase();
  const referencesKnown = knownDirs.some((d) => objectiveLower.includes(d));

  if (!referencesKnown && plan.objective.trim() !== '') {
    // Check parent directories of files_modified exist on disk as a proxy
    const hasExistingParent = plan.files_modified.some((fp) => {
      const parts = fp.split('/');
      if (parts.length > 1) {
        const parentDir = parts.slice(0, -1).join('/');
        try {
          return fs.existsSync(`${cwd}/${parentDir}`);
        } catch {
          return false;
        }
      }
      return true; // root-level files are fine
    });
    if (!hasExistingParent) {
      warnings.push(
        'objective does not reference any known lib/ module or directory, and no parent directories were found on disk'
      );
    }
  }

  return makeResult(errors, warnings);
}

// ─── validateCrossPhase ───────────────────────────────────────────────────────

/**
 * Cross-phase validation: detect duplicate provides and unmet requires across a plan set.
 *
 * Errors:
 *   - multiple plans provide the same artifact string (duplicate provides)
 *   - a plan requires something no plan in the set provides (unmet requires)
 *
 * Warnings:
 *   - all provides and requires arrays are empty (no dependency tracking in this set)
 *
 * @param plans - Array of PlanArtifacts to validate as a set
 * @returns ValidationResult
 */
function validateCrossPhase(plans: PlanArtifact[]): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Collect all provides with their source plan
  const providesMap = new Map<string, string[]>();
  for (const plan of plans) {
    for (const artifact of plan.provides) {
      if (!providesMap.has(artifact)) {
        providesMap.set(artifact, []);
      }
      providesMap.get(artifact)!.push(`${plan.phase}-${plan.plan}`);
    }
  }

  // Collect all provides as a flat set for requires checking
  const allProvides = new Set<string>(providesMap.keys());

  // Detect duplicate provides
  for (const [artifact, sources] of providesMap.entries()) {
    if (sources.length > 1) {
      errors.push(
        `artifact "${artifact}" is provided by multiple plans: ${sources.join(', ')}`
      );
    }
  }

  // Detect unmet requires
  for (const plan of plans) {
    for (const req of plan.requires) {
      if (!allProvides.has(req)) {
        errors.push(
          `plan ${plan.phase}-${plan.plan} requires "${req}" but no plan in the set provides it`
        );
      }
    }
  }

  // Warn if no dependency tracking at all
  const hasAnyTracking = plans.some(
    (p) => p.provides.length > 0 || p.requires.length > 0
  );
  if (!hasAnyTracking) {
    warnings.push(
      'no plans in this set have provides or requires — dependency tracking is disabled'
    );
  }

  return makeResult(errors, warnings);
}

// ─── validateResearchArtifacts ───────────────────────────────────────────────

/**
 * Research artifact validation: check structure of research markdown files if they exist.
 *
 * Files not existing is OK — only validates if the file is present.
 *
 * Errors (for existing files with missing required sections):
 *   - LANDSCAPE.md present but has no | table rows
 *   - PAPERS.md present but has no structured headings (# or ##)
 *   - RESEARCH.md present but missing ## Method or ## Tradeoffs sections
 *
 * @param phaseDir - Absolute path to the phase directory containing research files
 * @returns ValidationResult
 */
function validateResearchArtifacts(phaseDir: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // LANDSCAPE.md — must have Markdown table rows if present
  const landscapePath = `${phaseDir}/LANDSCAPE.md`;
  if (fs.existsSync(landscapePath)) {
    const content = fs.readFileSync(landscapePath, 'utf-8') as string;
    const hasTableRows = /^\|.+\|/m.test(content);
    if (!hasTableRows) {
      errors.push('LANDSCAPE.md exists but has no Markdown table rows (|...|)');
    }
  }

  // PAPERS.md — must have structured headings if present
  const papersPath = `${phaseDir}/PAPERS.md`;
  if (fs.existsSync(papersPath)) {
    const content = fs.readFileSync(papersPath, 'utf-8') as string;
    const hasHeadings = /^#{1,2}\s+/m.test(content);
    if (!hasHeadings) {
      errors.push('PAPERS.md exists but has no structured headings (# or ##)');
    }
  }

  // RESEARCH.md — must have ## Method and ## Tradeoffs sections if present
  const researchPath = `${phaseDir}/RESEARCH.md`;
  if (fs.existsSync(researchPath)) {
    const content = fs.readFileSync(researchPath, 'utf-8') as string;
    if (!/^##\s+Method/m.test(content)) {
      errors.push('RESEARCH.md exists but is missing required ## Method section');
    }
    if (!/^##\s+Tradeoffs/m.test(content)) {
      errors.push('RESEARCH.md exists but is missing required ## Tradeoffs section');
    }
  }

  // Warn if none of the research files exist (informational only)
  const anyExists =
    fs.existsSync(landscapePath) ||
    fs.existsSync(papersPath) ||
    fs.existsSync(researchPath);
  if (!anyExists) {
    warnings.push(
      'no research artifacts found in phase directory (LANDSCAPE.md, PAPERS.md, RESEARCH.md)'
    );
  }

  return makeResult(errors, warnings);
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  extractPlanArtifact,
  validateStructural,
  validateSemantic,
  validateCrossPhase,
  validateResearchArtifacts,
};
