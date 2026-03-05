/**
 * GRD Verification Suite -- Plan structure, phase completeness, references, commits, artifacts, key-links
 *
 * Extracted from bin/grd-tools.js during Phase 03 modularization.
 * Depends on: lib/utils.ts (safeReadFile, execGit, findPhaseInternal, validateGitRef, output, error)
 *             lib/frontmatter.ts (extractFrontmatter, parseMustHavesBlock)
 */

'use strict';

import type { FrontmatterObject, PhaseInfo, ExecGitResult } from './types';

const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  safeReadFile,
  execGit,
  findPhaseInternal,
  validateGitRef,
  output,
  error,
}: {
  safeReadFile: (filePath: string) => string | null;
  execGit: (cwd: string, args: string[], opts?: { allowBlocked?: boolean }) => ExecGitResult;
  findPhaseInternal: (cwd: string, phase: string) => PhaseInfo | null;
  validateGitRef: (ref: string) => string;
  output: (result: unknown, raw: boolean, rawValue?: unknown) => never;
  error: (message: string) => never;
} = require('./utils');
const { extractFrontmatter, parseMustHavesBlock }: {
  extractFrontmatter: (content: string) => FrontmatterObject;
  parseMustHavesBlock: (content: string, field: string) => MustHavesEntry[];
} = require('./frontmatter');

// ─── Domain Types ────────────────────────────────────────────────────────────

/**
 * A must_haves artifact entry from plan frontmatter.
 */
interface MustHavesArtifact {
  path: string;
  provides?: string;
  exports?: string | string[];
  min_lines?: number;
  contains?: string;
}

/**
 * A must_haves key_links entry from plan frontmatter.
 */
interface MustHavesKeyLink {
  from: string;
  to: string;
  via?: string;
  pattern?: string;
}

/**
 * Union type for entries returned by parseMustHavesBlock.
 */
type MustHavesEntry = string | MustHavesArtifact | MustHavesKeyLink;

/**
 * Result of file creation check in summary verification.
 */
interface FilesCreatedCheck {
  checked: number;
  found: number;
  missing: string[];
}

/**
 * Checks performed during summary verification.
 */
interface SummaryVerifyChecks {
  summary_exists: boolean;
  files_created: FilesCreatedCheck;
  commits_exist: boolean;
  self_check: string;
}

/**
 * Result of summary verification.
 */
interface SummaryVerifyResult {
  passed: boolean;
  checks: SummaryVerifyChecks;
  errors: string[];
}

/**
 * Task info extracted from plan structure verification.
 */
interface PlanTask {
  name: string;
  hasFiles: boolean;
  hasAction: boolean;
  hasVerify: boolean;
  hasDone: boolean;
}

/**
 * Result of plan structure verification.
 */
interface PlanVerifyResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  task_count: number;
  tasks: PlanTask[];
  frontmatter_fields: string[];
  found_sections: string[];
}

/**
 * Result of phase completeness verification.
 */
interface PhaseCompletenessResult {
  complete: boolean;
  phase: string;
  plan_count: number;
  summary_count: number;
  incomplete_plans: string[];
  orphan_summaries: string[];
  errors: string[];
  warnings: string[];
}

/**
 * Result of reference verification.
 */
interface ReferenceVerifyResult {
  valid: boolean;
  found: number;
  missing: string[];
  total: number;
}

/**
 * Result of commit verification.
 */
interface CommitVerifyResult {
  all_valid: boolean;
  valid: string[];
  invalid: string[];
  total: number;
}

/**
 * Result of a single artifact check.
 */
interface ArtifactCheck {
  path: string;
  exists: boolean;
  issues: string[];
  passed: boolean;
  plan_file: string;
  must_haves_field: string;
  remediation?: string;
}

/**
 * Result of artifact verification.
 */
interface ArtifactVerifyResult {
  all_passed: boolean;
  passed: number;
  total: number;
  artifacts: ArtifactCheck[];
}

/**
 * Result of a single key-link check.
 */
interface KeyLinkCheck {
  from: string;
  to: string;
  via: string;
  verified: boolean;
  detail: string;
}

/**
 * Result of key-link verification.
 */
interface KeyLinkVerifyResult {
  all_verified: boolean;
  verified: number;
  total: number;
  links: KeyLinkCheck[];
}

// Module-level cache for file reads within a single process invocation.
// Safe for verify functions since they never write files.
const _fileReadCache = new Map<string, string | null>();
function readFileCached(fullPath: string): string | null {
  if (!_fileReadCache.has(fullPath)) {
    _fileReadCache.set(fullPath, safeReadFile(fullPath));
  }
  return _fileReadCache.get(fullPath) as string | null;
}

// ─── Verification Command Functions ──────────────────────────────────────────

/**
 * CLI command: Verify SUMMARY.md structure including file existence, commit hashes, and self-check.
 * @param cwd - Project working directory
 * @param summaryPath - Relative path to the SUMMARY.md file
 * @param checkFileCount - Number of mentioned files to spot-check for existence
 * @param raw - Output raw 'passed'/'failed' instead of JSON
 */
function cmdVerifySummary(cwd: string, summaryPath: string, checkFileCount: number, raw: boolean): void {
  if (!summaryPath) {
    error('summary-path required');
  }

  const fullPath: string = path.join(cwd, summaryPath);
  const checkCount: number = checkFileCount || 2;

  // Check 1: Summary exists
  let content: string;
  try {
    content = fs.readFileSync(fullPath, 'utf-8');
  } catch {
    const result: SummaryVerifyResult = {
      passed: false,
      checks: {
        summary_exists: false,
        files_created: { checked: 0, found: 0, missing: [] },
        commits_exist: false,
        self_check: 'not_found',
      },
      errors: ['SUMMARY.md not found'],
    };
    output(result, raw, 'failed');
    return;
  }
  const errors: string[] = [];

  // Check 2: Spot-check files mentioned in summary
  const mentionedFiles = new Set<string>();
  const patterns: RegExp[] = [
    /`([^`]+\.[a-zA-Z]+)`/g,
    /(?:Created|Modified|Added|Updated|Edited):\s*`?([^\s`]+\.[a-zA-Z]+)`?/gi,
  ];

  for (const pattern of patterns) {
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(content)) !== null) {
      const filePath: string = m[1];
      if (filePath && !filePath.startsWith('http') && filePath.includes('/')) {
        mentionedFiles.add(filePath);
      }
    }
  }

  const filesToCheck: string[] = Array.from(mentionedFiles).slice(0, checkCount);
  const missing: string[] = [];
  for (const file of filesToCheck) {
    if (!fs.existsSync(path.join(cwd, file))) {
      missing.push(file);
    }
  }

  // Check 3: Commits exist
  const commitHashPattern = /\b[0-9a-f]{7,40}\b/g;
  const hashes: string[] = content.match(commitHashPattern) || [];
  let commitsExist = false;
  if (hashes.length > 0) {
    for (const hash of hashes.slice(0, 3)) {
      try {
        validateGitRef(hash);
      } catch {
        continue;
      }
      const result: ExecGitResult = execGit(cwd, ['cat-file', '-t', hash]);
      if (result.exitCode === 0 && result.stdout === 'commit') {
        commitsExist = true;
        break;
      }
    }
  }

  // Check 4: Self-check section
  let selfCheck = 'not_found';
  const selfCheckPattern = /##\s*(?:Self[- ]?Check|Verification|Quality Check)/i;
  if (selfCheckPattern.test(content)) {
    const passPattern = /(?:all\s+)?(?:pass|✓|✅|complete|succeeded)/i;
    const failPattern = /(?:fail|✗|❌|incomplete|blocked)/i;
    const checkSection: string = content.slice(content.search(selfCheckPattern));
    if (failPattern.test(checkSection)) {
      selfCheck = 'failed';
    } else if (passPattern.test(checkSection)) {
      selfCheck = 'passed';
    }
  }

  if (missing.length > 0) errors.push('Missing files: ' + missing.join(', '));
  if (!commitsExist && hashes.length > 0)
    errors.push('Referenced commit hashes not found in git history');
  if (selfCheck === 'failed') errors.push('Self-check section indicates failure');

  const checks: SummaryVerifyChecks = {
    summary_exists: true,
    files_created: {
      checked: filesToCheck.length,
      found: filesToCheck.length - missing.length,
      missing,
    },
    commits_exist: commitsExist,
    self_check: selfCheck,
  };

  const passed: boolean = missing.length === 0 && selfCheck !== 'failed';
  const result: SummaryVerifyResult = { passed, checks, errors };
  output(result, raw, passed ? 'passed' : 'failed');
}

/**
 * CLI command: Verify PLAN.md structure, frontmatter fields, and task element completeness.
 * @param cwd - Project working directory
 * @param filePath - Path to the PLAN.md file to validate
 * @param raw - Output raw 'valid'/'invalid' instead of JSON
 */
function cmdVerifyPlanStructure(cwd: string, filePath: string, raw: boolean): void {
  if (!filePath) {
    error('file path required');
  }
  const fullPath: string = path.isAbsolute(filePath) ? filePath : path.join(cwd, filePath);
  const content: string | null = readFileCached(fullPath);
  if (!content) {
    output({ error: 'File not found', path: filePath }, raw);
    return;
  }

  const fm: FrontmatterObject = extractFrontmatter(content);
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check required frontmatter fields
  const required: string[] = [
    'phase',
    'plan',
    'type',
    'wave',
    'depends_on',
    'files_modified',
    'autonomous',
    'must_haves',
  ];
  const missingFields: string[] = [];
  for (const field of required) {
    if (fm[field] === undefined) {
      errors.push(`Missing required frontmatter field: ${field}`);
      missingFields.push(field);
    }
  }
  // Include found frontmatter fields context when fields are missing
  if (missingFields.length > 0) {
    const foundFields: string[] = Object.keys(fm);
    if (foundFields.length > 0) {
      errors.push(`Found frontmatter fields: ${foundFields.join(', ')}`);
    }
  }

  // Parse and check task elements
  const taskPattern = /<task[^>]*>([\s\S]*?)<\/task>/g;
  const tasks: PlanTask[] = [];
  let taskMatch: RegExpExecArray | null;
  while ((taskMatch = taskPattern.exec(content)) !== null) {
    const taskContent: string = taskMatch[1];
    const nameMatch: RegExpMatchArray | null = taskContent.match(/<name>([\s\S]*?)<\/name>/);
    const taskName: string = nameMatch ? nameMatch[1].trim() : 'unnamed';
    const hasFiles: boolean = /<files>/.test(taskContent);
    const hasAction: boolean = /<action>/.test(taskContent);
    const hasVerify: boolean = /<verify>/.test(taskContent);
    const hasDone: boolean = /<done>/.test(taskContent);

    if (!nameMatch) errors.push('Task missing <name> element');
    if (!hasAction) errors.push(`Task '${taskName}' missing <action>`);
    if (!hasVerify) warnings.push(`Task '${taskName}' missing <verify>`);
    if (!hasDone) warnings.push(`Task '${taskName}' missing <done>`);
    if (!hasFiles) warnings.push(`Task '${taskName}' missing <files>`);

    tasks.push({ name: taskName, hasFiles, hasAction, hasVerify, hasDone });
  }

  if (tasks.length === 0) warnings.push('No <task> elements found');

  // Wave/depends_on consistency
  if (
    fm.wave &&
    parseInt(String(fm.wave)) > 1 &&
    (!fm.depends_on || (Array.isArray(fm.depends_on) && fm.depends_on.length === 0))
  ) {
    warnings.push('Wave > 1 but depends_on is empty');
  }

  // Autonomous/checkpoint consistency
  const hasCheckpoints: boolean = /<task\s+type=["']?checkpoint/.test(content);
  // fm.autonomous may arrive as boolean or string from YAML parsing -- check both
  const autonomousVal: unknown = fm.autonomous;
  if (hasCheckpoints && autonomousVal !== 'false' && autonomousVal !== false) {
    errors.push('Has checkpoint tasks but autonomous is not false');
  }

  // Extract markdown headings for found_sections
  const headingPattern = /^#{1,6}\s+.+$/gm;
  const found_sections: string[] = (content.match(headingPattern) || []).map((h: string) => h.trim());

  const result: PlanVerifyResult = {
    valid: errors.length === 0,
    errors,
    warnings,
    task_count: tasks.length,
    tasks,
    frontmatter_fields: Object.keys(fm),
    found_sections,
  };
  output(result, raw, errors.length === 0 ? 'valid' : 'invalid');
}

/**
 * CLI command: Check that all plans in a phase have corresponding summaries.
 * @param cwd - Project working directory
 * @param phase - Phase number to check
 * @param raw - Output raw 'complete'/'incomplete' instead of JSON
 */
function cmdVerifyPhaseCompleteness(cwd: string, phase: string, raw: boolean): void {
  if (!phase) {
    error('phase required');
  }
  const phaseInfo: PhaseInfo | null = findPhaseInternal(cwd, phase);
  if (!phaseInfo || !phaseInfo.found) {
    output({ error: 'Phase not found', phase }, raw);
    return;
  }

  const errors: string[] = [];
  const warnings: string[] = [];
  const phaseDir: string = path.join(cwd, phaseInfo.directory);

  // List plans and summaries
  let files: string[];
  try {
    files = fs.readdirSync(phaseDir);
  } catch {
    output({ error: 'Cannot read phase directory' }, raw);
    return;
  }

  const plans: string[] = files.filter((f: string) => f.match(/-PLAN\.md$/i));
  const summaries: string[] = files.filter((f: string) => f.match(/-SUMMARY\.md$/i));

  // Extract plan IDs (everything before -PLAN.md)
  const planIds = new Set<string>(plans.map((p: string) => p.replace(/-PLAN\.md$/i, '')));
  const summaryIds = new Set<string>(summaries.map((s: string) => s.replace(/-SUMMARY\.md$/i, '')));

  // Plans without summaries
  const incompletePlans: string[] = [...planIds].filter((id) => !summaryIds.has(id));
  if (incompletePlans.length > 0) {
    errors.push(`Plans without summaries: ${incompletePlans.join(', ')}`);
  }

  // Summaries without plans (orphans)
  const orphanSummaries: string[] = [...summaryIds].filter((id) => !planIds.has(id));
  if (orphanSummaries.length > 0) {
    warnings.push(`Summaries without plans: ${orphanSummaries.join(', ')}`);
  }

  const result: PhaseCompletenessResult = {
    complete: errors.length === 0,
    phase: phaseInfo.phase_number,
    plan_count: plans.length,
    summary_count: summaries.length,
    incomplete_plans: incompletePlans,
    orphan_summaries: orphanSummaries,
    errors,
    warnings,
  };
  output(result, raw, errors.length === 0 ? 'complete' : 'incomplete');
}

/**
 * CLI command: Validate @-references and backtick file paths in a markdown file.
 * @param cwd - Project working directory
 * @param filePath - Path to the markdown file to check
 * @param raw - Output raw 'valid'/'invalid' instead of JSON
 */
function cmdVerifyReferences(cwd: string, filePath: string, raw: boolean): void {
  if (!filePath) {
    error('file path required');
  }
  const fullPath: string = path.isAbsolute(filePath) ? filePath : path.join(cwd, filePath);
  const content: string | null = readFileCached(fullPath);
  if (!content) {
    output({ error: 'File not found', path: filePath }, raw);
    return;
  }

  const found: string[] = [];
  const missing: string[] = [];

  // Find @-references: @path/to/file (must contain / to be a file path)
  const atRefs: string[] = content.match(/@([^\s\n,)]+\/[^\s\n,)]+)/g) || [];
  for (const ref of atRefs) {
    const cleanRef: string = ref.slice(1); // remove @
    const resolved: string = cleanRef.startsWith('~/')
      ? path.join(process.env.HOME || os.homedir() || '', cleanRef.slice(2))
      : path.join(cwd, cleanRef);
    if (fs.existsSync(resolved)) {
      found.push(cleanRef);
    } else {
      missing.push(cleanRef);
    }
  }

  // Find backtick file paths that look like real paths (contain / and have extension)
  const backtickRefs: string[] = content.match(/`([^`]+\/[^`]+\.[a-zA-Z]{1,10})`/g) || [];
  for (const ref of backtickRefs) {
    const cleanRef: string = ref.slice(1, -1); // remove backticks
    if (cleanRef.startsWith('http') || cleanRef.includes('${') || cleanRef.includes('{{')) continue;
    if (found.includes(cleanRef) || missing.includes(cleanRef)) continue; // dedup
    const resolved: string = path.join(cwd, cleanRef);
    if (fs.existsSync(resolved)) {
      found.push(cleanRef);
    } else {
      missing.push(cleanRef);
    }
  }

  const result: ReferenceVerifyResult = {
    valid: missing.length === 0,
    found: found.length,
    missing,
    total: found.length + missing.length,
  };
  output(result, raw, missing.length === 0 ? 'valid' : 'invalid');
}

/**
 * CLI command: Batch verify that git commit hashes exist in the repository.
 * @param cwd - Project working directory
 * @param hashes - Array of commit hashes to verify
 * @param raw - Output raw 'valid'/'invalid' instead of JSON
 */
function cmdVerifyCommits(cwd: string, hashes: string[], raw: boolean): void {
  if (!hashes || hashes.length === 0) {
    error('At least one commit hash required. Usage: verify commits <hash1> [hash2 ...]. Run "git log --oneline" to find commit hashes');
  }

  const valid: string[] = [];
  const invalid: string[] = [];
  for (const hash of hashes) {
    try {
      validateGitRef(hash);
    } catch {
      invalid.push(hash);
      continue;
    }
    const result: ExecGitResult = execGit(cwd, ['cat-file', '-t', hash]);
    if (result.exitCode === 0 && result.stdout.trim() === 'commit') {
      valid.push(hash);
    } else {
      invalid.push(hash);
    }
  }

  const verifyResult: CommitVerifyResult = {
    all_valid: invalid.length === 0,
    valid,
    invalid,
    total: hashes.length,
  };
  output(verifyResult, raw, invalid.length === 0 ? 'valid' : 'invalid');
}

/**
 * CLI command: Check that must_haves.artifacts from a plan exist on disk with required content.
 * @param cwd - Project working directory
 * @param planFilePath - Path to the PLAN.md file containing must_haves.artifacts
 * @param raw - Output raw 'valid'/'invalid' instead of JSON
 */
function cmdVerifyArtifacts(cwd: string, planFilePath: string, raw: boolean): void {
  if (!planFilePath) {
    error('plan file path required');
  }
  const fullPath: string = path.isAbsolute(planFilePath) ? planFilePath : path.join(cwd, planFilePath);
  const content: string | null = readFileCached(fullPath);
  if (!content) {
    output({ error: 'File not found', path: planFilePath }, raw);
    return;
  }

  const artifacts: MustHavesEntry[] = parseMustHavesBlock(content, 'artifacts');
  if (artifacts.length === 0) {
    output({ error: 'No must_haves.artifacts found in frontmatter', path: planFilePath }, raw);
    return;
  }

  const results: ArtifactCheck[] = [];
  for (const artifact of artifacts) {
    if (typeof artifact === 'string') continue; // skip simple string items
    const artPath: string | undefined = (artifact as MustHavesArtifact).path;
    if (!artPath) continue;

    const artFullPath: string = path.join(cwd, artPath);
    const exists: boolean = fs.existsSync(artFullPath);
    const check: ArtifactCheck = {
      path: artPath,
      exists,
      issues: [],
      passed: false,
      plan_file: planFilePath,
      must_haves_field: 'must_haves.artifacts',
    };

    if (exists) {
      const fileContent: string = safeReadFile(artFullPath) || '';
      const lineCount: number = fileContent.split('\n').length;
      const artTyped = artifact as MustHavesArtifact;

      if (artTyped.min_lines && lineCount < artTyped.min_lines) {
        check.issues.push(`Only ${lineCount} lines, need ${artTyped.min_lines}`);
      }
      if (artTyped.contains && !fileContent.includes(artTyped.contains)) {
        check.issues.push(`Missing pattern: ${artTyped.contains}`);
      }
      if (artTyped.exports) {
        const exports: string[] = Array.isArray(artTyped.exports) ? artTyped.exports : [artTyped.exports];
        for (const exp of exports) {
          if (!fileContent.includes(exp)) check.issues.push(`Missing export: ${exp}`);
        }
      }
      check.passed = check.issues.length === 0;
    } else {
      check.issues.push('File not found');
      check.remediation = `Create the missing file at: ${artPath}`;
    }

    results.push(check);
  }

  const passed: number = results.filter((r) => r.passed).length;
  const verifyResult: ArtifactVerifyResult = {
    all_passed: passed === results.length,
    passed,
    total: results.length,
    artifacts: results,
  };
  output(verifyResult, raw, passed === results.length ? 'valid' : 'invalid');
}

/**
 * CLI command: Validate must_haves.key_links patterns between source and target files.
 * @param cwd - Project working directory
 * @param planFilePath - Path to the PLAN.md file containing must_haves.key_links
 * @param raw - Output raw 'valid'/'invalid' instead of JSON
 */
function cmdVerifyKeyLinks(cwd: string, planFilePath: string, raw: boolean): void {
  if (!planFilePath) {
    error('plan file path required');
  }
  const fullPath: string = path.isAbsolute(planFilePath) ? planFilePath : path.join(cwd, planFilePath);
  const content: string | null = readFileCached(fullPath);
  if (!content) {
    output({ error: 'File not found', path: planFilePath }, raw);
    return;
  }

  const keyLinks: MustHavesEntry[] = parseMustHavesBlock(content, 'key_links');
  if (keyLinks.length === 0) {
    output({ error: 'No must_haves.key_links found in frontmatter', path: planFilePath }, raw);
    return;
  }

  const results: KeyLinkCheck[] = [];
  for (const link of keyLinks) {
    if (typeof link === 'string') continue;
    const linkTyped = link as MustHavesKeyLink;
    const check: KeyLinkCheck = {
      from: linkTyped.from,
      to: linkTyped.to,
      via: linkTyped.via || '',
      verified: false,
      detail: '',
    };

    const sourceContent: string | null = safeReadFile(path.join(cwd, linkTyped.from || ''));
    if (!sourceContent) {
      check.detail = 'Source file not found';
    } else if (linkTyped.pattern) {
      try {
        const regex = new RegExp(linkTyped.pattern);
        if (regex.test(sourceContent)) {
          check.verified = true;
          check.detail = 'Pattern found in source';
        } else {
          const targetContent: string | null = safeReadFile(path.join(cwd, linkTyped.to || ''));
          if (targetContent && regex.test(targetContent)) {
            check.verified = true;
            check.detail = 'Pattern found in target';
          } else {
            check.detail = `Pattern "${linkTyped.pattern}" not found in source or target`;
          }
        }
      } catch {
        check.detail = `Invalid regex pattern: ${linkTyped.pattern}`;
      }
    } else {
      // No pattern: just check source references target
      if (sourceContent.includes(linkTyped.to || '')) {
        check.verified = true;
        check.detail = 'Target referenced in source';
      } else {
        check.detail = 'Target not referenced in source';
      }
    }

    results.push(check);
  }

  const verified: number = results.filter((r) => r.verified).length;
  const verifyResult: KeyLinkVerifyResult = {
    all_verified: verified === results.length,
    verified,
    total: results.length,
    links: results,
  };
  output(verifyResult, raw, verified === results.length ? 'valid' : 'invalid');
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  cmdVerifySummary,
  cmdVerifyPlanStructure,
  cmdVerifyPhaseCompleteness,
  cmdVerifyReferences,
  cmdVerifyCommits,
  cmdVerifyArtifacts,
  cmdVerifyKeyLinks,
};
