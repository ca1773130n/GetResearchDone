'use strict';

/**
 * GRD Verification Suite -- Plan structure, phase completeness, references, commits, artifacts, key-links
 *
 * Extracted from bin/grd-tools.js during Phase 03 modularization.
 * Depends on: lib/utils.ts (safeReadFile, execGit, findPhaseInternal, validateGitRef, output, error)
 *             lib/frontmatter.ts (extractFrontmatter, parseMustHavesBlock)
 */


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
const {
  extractFrontmatter,
  parseMustHavesBlock,
}: {
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

/** Clear the module-level file read cache. Call in test beforeEach to prevent stale reads across tests. */
function clearVerifyCache(): void {
  _fileReadCache.clear();
}

// ─── Verification Command Functions ──────────────────────────────────────────

/**
 * CLI command: Verify SUMMARY.md structure including file existence, commit hashes, and self-check.
 * @param cwd - Project working directory
 * @param summaryPath - Relative path to the SUMMARY.md file
 * @param checkFileCount - Number of mentioned files to spot-check for existence
 * @param raw - Output raw 'passed'/'failed' instead of JSON
 */
function cmdVerifySummary(
  cwd: string,
  summaryPath: string,
  checkFileCount: number,
  raw: boolean
): void {
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

  // Check 3: Commits exist. Codex r15 P2: every referenced commit must
  // exist (was sampling 3 and passing if any one resolved). Check the
  // first ~10 unique hashes to keep the cost bounded but catch
  // partial-failure cases.
  // Codex r27 P2: a context-free hex-token regex also matches
  // checksums, cache keys, content-hash IDs, and other non-commit
  // hex strings. Anchor on explicit commit labels first (commit:,
  // SHA:, ref:, hash:, parent:, `**Commit**`, hyperlinks to
  // /commit/<sha>, conventional `(abcdef1)` parens), and only fall
  // back to the bare hex scan if the labelled set is empty AND the
  // SUMMARY explicitly mentions "commit" somewhere (so we keep the
  // backward-compatible behaviour without false-failing on summaries
  // that legitimately reference no commits).
  const labelledPattern =
    /(?:commit|sha|ref|hash|parent)[s]?[:\s]+`?([0-9a-f]{7,40})\b|\/commit\/([0-9a-f]{7,40})\b|\(([0-9a-f]{7,40})\)/gi;
  const labelledHashes: string[] = [];
  for (const m of content.matchAll(labelledPattern)) {
    const h = m[1] ?? m[2] ?? m[3];
    if (h) labelledHashes.push(h.toLowerCase());
  }
  const commitHashPattern = /\b[0-9a-f]{7,40}\b/g;
  const hashes: string[] =
    labelledHashes.length > 0
      ? labelledHashes
      : /\bcommit\b/i.test(content)
        ? content.match(commitHashPattern) || []
        : [];
  let commitsExist = false;
  const invalidHashes: string[] = [];
  if (hashes.length > 0) {
    const uniqueHashes = Array.from(new Set(hashes)).slice(0, 10);
    let allValid = true;
    for (const hash of uniqueHashes) {
      try {
        validateGitRef(hash);
      } catch {
        allValid = false;
        invalidHashes.push(hash);
        continue;
      }
      const result: ExecGitResult = execGit(cwd, ['cat-file', '-t', hash]);
      if (!(result.exitCode === 0 && result.stdout === 'commit')) {
        allValid = false;
        invalidHashes.push(hash);
      }
    }
    commitsExist = allValid;
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
    errors.push(
      invalidHashes.length > 0
        ? `Referenced commit hashes not found in git history: ${invalidHashes.join(', ')}`
        : 'Referenced commit hashes not found in git history'
    );
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

  const passed: boolean = missing.length === 0 && selfCheck !== 'failed' && (commitsExist || hashes.length === 0);
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
  const found_sections: string[] = (content.match(headingPattern) || []).map((h: string) =>
    h.trim()
  );

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
    // Skip templated/dynamic refs (e.g. @${CLAUDE_PLUGIN_ROOT}/...) — same
    // guard used by the backtick-ref branch below.
    if (cleanRef.includes('${') || cleanRef.includes('{{')) continue;
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
    error(
      'At least one commit hash required. Usage: verify commits <hash1> [hash2 ...]. Run "git log --oneline" to find commit hashes'
    );
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
  const fullPath: string = path.isAbsolute(planFilePath)
    ? planFilePath
    : path.join(cwd, planFilePath);
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
        const exports: string[] = Array.isArray(artTyped.exports)
          ? artTyped.exports
          : [artTyped.exports];
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
  const fullPath: string = path.isAbsolute(planFilePath)
    ? planFilePath
    : path.join(cwd, planFilePath);
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

/**
 * Result of a single mechanical check inside the bundle.
 */
interface MechanicalCheckResult {
  check: 'frontmatter' | 'artifacts' | 'key_links' | 'references' | 'plan_summary_completeness';
  scope: string;
  passed: boolean;
  detail: string;
  data?: Record<string, unknown>;
}

/**
 * Aggregated result of cmdVerifyMechanical — the "Mechanical tier" of
 * the verifier agent's three-stage gate.
 */
interface MechanicalVerifyResult {
  passed: boolean;
  phase: string;
  plan_count: number;
  total_checks: number;
  passed_count: number;
  failed_count: number;
  checks: MechanicalCheckResult[];
}

/**
 * Bundle the four PLAN.md mechanical checks (frontmatter, artifacts,
 * key_links, references) plus a phase-level plan/summary completeness
 * check into a single aggregated JSON result. Reuses the same helpers
 * as the discrete verify commands so behavior stays consistent.
 *
 * Required PLAN.md frontmatter fields are kept in sync with
 * cmdVerifyPlanStructure. Frontmatter check passes if all required
 * fields are present; artifact and key-link checks pass when every
 * declared item resolves; reference check passes when every @-reference
 * and backtick path resolves; completeness check passes when every
 * PLAN has a matching SUMMARY.
 *
 * @param cwd - Project working directory
 * @param phase - Phase number or name passed to findPhaseInternal
 * @param raw - Output 'pass'/'fail' instead of JSON
 */
function cmdVerifyMechanical(cwd: string, phase: string, raw: boolean): void {
  if (!phase) {
    error('phase required');
  }
  const phaseInfo: PhaseInfo | null = findPhaseInternal(cwd, phase);
  if (!phaseInfo || !phaseInfo.found) {
    output({ error: 'Phase not found', phase }, raw);
    return;
  }

  const phaseDir: string = path.join(cwd, phaseInfo.directory);
  let files: string[];
  try {
    files = fs.readdirSync(phaseDir);
  } catch {
    output({ error: 'Cannot read phase directory', phase }, raw);
    return;
  }

  // Accept both prefixed (`01-01-PLAN.md`) and bare (`PLAN.md`) filenames —
  // matches the convention used across the codebase (phase.ts:336, utils.ts:1046,
  // gates.ts:199, knowledge.ts:230, roadmap.ts:614).
  const plans: string[] = files.filter(
    (f) => /-PLAN\.md$/i.test(f) || f === 'PLAN.md'
  );
  const summaries: string[] = files.filter(
    (f) => /-SUMMARY\.md$/i.test(f) || f === 'SUMMARY.md'
  );
  const checks: MechanicalCheckResult[] = [];

  // A phase with zero PLAN.md files cannot pass the mechanical gate by
  // vacuously satisfying every check. Emit an explicit failing check so the
  // aggregate result correctly reports passed=false.
  checks.push({
    check: 'plan_summary_completeness',
    scope: `phase:${phaseInfo.phase_number}`,
    passed: plans.length > 0,
    detail:
      plans.length > 0
        ? `Phase has ${plans.length} PLAN.md file(s)`
        : 'Phase has no PLAN.md files — nothing to verify',
    data: { plan_count: plans.length },
  });
  if (plans.length === 0) {
    const result: MechanicalVerifyResult = {
      passed: false,
      phase: phaseInfo.phase_number,
      plan_count: 0,
      total_checks: checks.length,
      passed_count: 0,
      failed_count: checks.length,
      checks,
    };
    output(result, raw, 'fail');
    return;
  }
  // The placeholder above will be replaced by the real plan_summary_completeness
  // check below; pop it so we don't double-report.
  checks.pop();

  const requiredFrontmatterFields: readonly string[] = [
    'phase',
    'plan',
    'type',
    'wave',
    'depends_on',
    'files_modified',
    'autonomous',
    'must_haves',
  ];

  for (const planFile of plans) {
    const planPath: string = path.join(phaseDir, planFile);
    const content: string | null = readFileCached(planPath);
    if (!content) {
      checks.push({
        check: 'frontmatter',
        scope: `plan:${planFile}`,
        passed: false,
        detail: 'PLAN.md unreadable',
      });
      continue;
    }
    const fm: FrontmatterObject = extractFrontmatter(content);

    // frontmatter check
    const missingFields: string[] = requiredFrontmatterFields.filter(
      (f) => fm[f] === undefined
    );
    checks.push({
      check: 'frontmatter',
      scope: `plan:${planFile}`,
      passed: missingFields.length === 0,
      detail:
        missingFields.length === 0
          ? `All ${requiredFrontmatterFields.length} required fields present`
          : `Missing: ${missingFields.join(', ')}`,
      data: { missing: missingFields, required: [...requiredFrontmatterFields] },
    });

    // artifacts check — mirror cmdVerifyArtifacts: existence AND content
    // constraints (min_lines / contains / exports).
    const artifacts: MustHavesEntry[] = parseMustHavesBlock(content, 'artifacts');
    if (artifacts.length > 0) {
      const failed: { path: string; issues: string[] }[] = [];
      for (const art of artifacts) {
        if (typeof art === 'string') continue;
        const artTyped = art as MustHavesArtifact;
        const artPath: string | undefined = artTyped.path;
        if (!artPath) continue;
        const artFullPath: string = path.join(cwd, artPath);
        const issues: string[] = [];
        if (!fs.existsSync(artFullPath)) {
          issues.push('File not found');
        } else {
          const fileContent: string = safeReadFile(artFullPath) || '';
          const lineCount: number = fileContent.split('\n').length;
          if (artTyped.min_lines && lineCount < artTyped.min_lines) {
            issues.push(`Only ${lineCount} lines, need ${artTyped.min_lines}`);
          }
          if (artTyped.contains && !fileContent.includes(artTyped.contains)) {
            issues.push(`Missing pattern: ${artTyped.contains}`);
          }
          if (artTyped.exports) {
            const exps: string[] = Array.isArray(artTyped.exports)
              ? artTyped.exports
              : [artTyped.exports];
            for (const exp of exps) {
              if (!fileContent.includes(exp)) issues.push(`Missing export: ${exp}`);
            }
          }
        }
        if (issues.length > 0) failed.push({ path: artPath, issues });
      }
      checks.push({
        check: 'artifacts',
        scope: `plan:${planFile}`,
        passed: failed.length === 0,
        detail:
          failed.length === 0
            ? `All ${artifacts.length} artifacts present and satisfy content constraints`
            : `Failed: ${failed.map((f) => `${f.path} (${f.issues.join('; ')})`).join('; ')}`,
        data: { failed },
      });
    }

    // key_links check
    const keyLinks: MustHavesEntry[] = parseMustHavesBlock(content, 'key_links');
    if (keyLinks.length > 0) {
      const failed: string[] = [];
      for (const link of keyLinks) {
        if (typeof link === 'string') continue;
        const linkTyped = link as MustHavesKeyLink;
        const fromContent: string | null = safeReadFile(path.join(cwd, linkTyped.from || ''));
        const toPath: string = path.join(cwd, linkTyped.to || '');
        let verified = false;
        if (fromContent) {
          if (linkTyped.pattern) {
            try {
              const regex = new RegExp(linkTyped.pattern);
              if (regex.test(fromContent)) verified = true;
              else {
                const toContent: string | null = safeReadFile(toPath);
                if (toContent && regex.test(toContent)) verified = true;
              }
            } catch {
              verified = false;
            }
          } else {
            verified = fromContent.includes(linkTyped.to || '');
          }
        }
        if (!verified) failed.push(`${linkTyped.from} → ${linkTyped.to}`);
      }
      checks.push({
        check: 'key_links',
        scope: `plan:${planFile}`,
        passed: failed.length === 0,
        detail:
          failed.length === 0
            ? `All ${keyLinks.length} key links verified`
            : `Failed: ${failed.join('; ')}`,
        data: { failed },
      });
    }

    // references check
    const missingRefs: string[] = [];
    const atRefs: string[] = content.match(/@([^\s\n,)]+\/[^\s\n,)]+)/g) || [];
    for (const ref of atRefs) {
      const cleanRef: string = ref.slice(1);
      // Skip templated/dynamic refs (e.g. @${CLAUDE_PLUGIN_ROOT}/...) — they
      // are not literal paths. Same guard the backtick branch uses below.
      if (cleanRef.includes('${') || cleanRef.includes('{{')) continue;
      const resolved: string = cleanRef.startsWith('~/')
        ? path.join(process.env.HOME || os.homedir() || '', cleanRef.slice(2))
        : path.join(cwd, cleanRef);
      if (!fs.existsSync(resolved)) missingRefs.push(cleanRef);
    }
    const backtickRefs: string[] = content.match(/`([^`]+\/[^`]+\.[a-zA-Z]{1,10})`/g) || [];
    for (const ref of backtickRefs) {
      const cleanRef: string = ref.slice(1, -1);
      if (cleanRef.startsWith('http') || cleanRef.includes('${') || cleanRef.includes('{{')) continue;
      if (missingRefs.includes(cleanRef)) continue;
      if (!fs.existsSync(path.join(cwd, cleanRef))) missingRefs.push(cleanRef);
    }
    const totalRefs: number = atRefs.length + backtickRefs.length;
    if (totalRefs > 0) {
      checks.push({
        check: 'references',
        scope: `plan:${planFile}`,
        passed: missingRefs.length === 0,
        detail:
          missingRefs.length === 0
            ? `All ${totalRefs} references resolve`
            : `Missing: ${missingRefs.join(', ')}`,
        data: { missing: missingRefs, total: totalRefs },
      });
    }
  }

  // phase-level: plan/summary completeness — bare PLAN.md / SUMMARY.md
  // normalise to '' so they pair off.
  const stripPlanId = (n: string): string =>
    n === 'PLAN.md' ? '' : n.replace(/-PLAN\.md$/i, '');
  const stripSummaryId = (n: string): string =>
    n === 'SUMMARY.md' ? '' : n.replace(/-SUMMARY\.md$/i, '');
  const planIds = new Set<string>(plans.map(stripPlanId));
  const summaryIds = new Set<string>(summaries.map(stripSummaryId));
  const incomplete: string[] = [...planIds].filter((id) => !summaryIds.has(id));
  checks.push({
    check: 'plan_summary_completeness',
    scope: `phase:${phaseInfo.phase_number}`,
    passed: incomplete.length === 0,
    detail:
      incomplete.length === 0
        ? `All ${plans.length} plans have summaries`
        : `Plans without summaries: ${incomplete.join(', ')}`,
    data: { incomplete, plan_count: plans.length, summary_count: summaries.length },
  });

  const passedCount: number = checks.filter((c) => c.passed).length;
  const failedCount: number = checks.length - passedCount;
  const result: MechanicalVerifyResult = {
    passed: failedCount === 0,
    phase: phaseInfo.phase_number,
    plan_count: plans.length,
    total_checks: checks.length,
    passed_count: passedCount,
    failed_count: failedCount,
    checks,
  };
  output(result, raw, failedCount === 0 ? 'pass' : 'fail');
}

// ─── Diagnose Phase ──────────────────────────────────────────────────────────

/** A single ranked root-cause finding from phase diagnosis. */
interface DiagnosisEntry {
  rank: number;
  cause: string;
  evidence: string;
  suggestion: string;
}

/** Result of phase diagnosis. */
interface DiagnosisResult {
  phase: string;
  verdict: string;
  root_causes: DiagnosisEntry[];
  failed_checks: string[];
  git_diff_lines: number;
  plans_missing_summaries: number;
}

/**
 * CLI command: Diagnose a failed phase by reading VERIFICATION.md, plan files,
 * and running git diff to produce a ranked root-cause list.
 *
 * Intended as a quick forensics tool after `gd verify-phase N` fails.
 * Reads:
 *   - .planning/milestones/{m}/phases/{N}/VERIFICATION.md (verdict + failed checks)
 *   - *-PLAN.md files in phase dir (detect plans without summaries)
 *   - `git diff HEAD` (scope estimate of uncommitted changes)
 * Ranks causes by heuristic signal strength.
 *
 * @param cwd - Project working directory
 * @param phase - Phase number or name
 * @param raw - Output raw text instead of JSON
 */
function cmdDiagnosePhase(cwd: string, phase: string, raw: boolean): void {
  if (!phase) {
    error('phase required. Usage: gd diagnose <phase>');
  }

  const phaseInfo: PhaseInfo | null = findPhaseInternal(cwd, phase);
  if (!phaseInfo || !phaseInfo.found) {
    output({ error: 'Phase not found', phase }, raw);
    return;
  }

  const phaseDir: string = path.join(cwd, phaseInfo.directory);
  // Codex r20 P2: scaffold/execution flow produces prefixed names like
  // `75-VERIFICATION.md`. Match both forms.
  let verificationPath: string = path.join(phaseDir, 'VERIFICATION.md');
  try {
    const files = require('fs').readdirSync(phaseDir) as string[];
    const prefixed = files.find((f: string) => /-VERIFICATION\.md$/.test(f));
    if (prefixed && !require('fs').existsSync(verificationPath)) {
      verificationPath = path.join(phaseDir, prefixed);
    }
  } catch { /* fall through */ }
  const verificationContent: string | null = safeReadFile(verificationPath);

  // Parse failed checks from VERIFICATION.md
  const failedChecks: string[] = [];
  let verdict = 'unknown';
  if (verificationContent) {
    const verdictMatch = verificationContent.match(/\*\*verdict\*\*[:\s]*([^\n]+)/i);
    if (verdictMatch) verdict = verdictMatch[1].trim();

    // Extract lines starting with ❌ or [FAIL] or "- FAIL"
    const failLines = verificationContent.match(/^(?:❌|[-*]\s*\[?FAIL[^]]*]?).*$/gim) || [];
    for (const line of failLines) {
      const clean = line.replace(/^[-*\s❌✗x]+/i, '').trim();
      if (clean) failedChecks.push(clean);
    }
    // Also parse "check: X passed: false" patterns in JSON-like blocks
    const checkFailMatches = verificationContent.match(/"check"\s*:\s*"([^"]+)"[^}]*"passed"\s*:\s*false/g) || [];
    for (const m of checkFailMatches) {
      const nameMatch = m.match(/"check"\s*:\s*"([^"]+)"/);
      if (nameMatch && !failedChecks.includes(nameMatch[1])) {
        failedChecks.push(nameMatch[1]);
      }
    }
  }

  // Check for plans without summaries
  let files: string[] = [];
  try {
    files = fs.readdirSync(phaseDir) as string[];
  } catch {
    // phase dir unreadable
  }
  const plans = files.filter((f) => /-PLAN\.md$/i.test(f) || f === 'PLAN.md');
  const summaries = files.filter((f) => /-SUMMARY\.md$/i.test(f) || f === 'SUMMARY.md');
  const planIds = plans.map((f) => (f === 'PLAN.md' ? '' : f.replace(/-PLAN\.md$/i, '')));
  const summaryIds = new Set(summaries.map((f) => (f === 'SUMMARY.md' ? '' : f.replace(/-SUMMARY\.md$/i, ''))));
  const plansMissingSummaries = planIds.filter((id) => !summaryIds.has(id)).length;

  // Measure uncommitted git diff size
  let gitDiffLines = 0;
  try {
    const diffResult = execGit(cwd, ['diff', 'HEAD', '--stat'], { allowBlocked: true });
    if (diffResult.stdout) {
      gitDiffLines = (diffResult.stdout.match(/\n/g) || []).length;
    }
  } catch {
    // git not available or not a repo
  }

  // Build ranked root causes
  const rootCauses: DiagnosisEntry[] = [];
  let rank = 1;

  if (plansMissingSummaries > 0) {
    rootCauses.push({
      rank: rank++,
      cause: `${plansMissingSummaries} plan(s) missing SUMMARY.md`,
      evidence: `Found ${plans.length} PLAN.md files, ${summaries.length} SUMMARY.md files`,
      suggestion: 'Run gd execute-phase N or manually write SUMMARY.md for each incomplete plan',
    });
  }

  if (!verificationContent) {
    rootCauses.push({
      rank: rank++,
      cause: 'VERIFICATION.md not found',
      evidence: `Expected at ${path.relative(cwd, verificationPath)}`,
      suggestion: 'Run gd verify-phase N to generate VERIFICATION.md before diagnosing',
    });
  } else if (verdict.toLowerCase().includes('fail') || verdict === 'unknown') {
    rootCauses.push({
      rank: rank++,
      cause: `Verification verdict: ${verdict}`,
      evidence: `${failedChecks.length} failed check(s) recorded`,
      suggestion: `Address failed checks: ${failedChecks.slice(0, 3).join(', ')}${failedChecks.length > 3 ? '...' : ''}`,
    });
  }

  for (const check of failedChecks.slice(0, 5)) {
    const cause = `Failed check: ${check}`;
    if (rootCauses.some((c) => c.cause === cause)) continue;
    rootCauses.push({
      rank: rank++,
      cause,
      evidence: `Recorded in VERIFICATION.md`,
      suggestion: _checkSuggestion(check),
    });
  }

  if (gitDiffLines > 10) {
    rootCauses.push({
      rank: rank,
      cause: `${gitDiffLines} uncommitted lines in working tree`,
      evidence: 'git diff HEAD --stat shows pending changes',
      suggestion: 'Commit or stash changes before re-running verification',
    });
  }

  if (rootCauses.length === 0) {
    rootCauses.push({
      rank: 1,
      cause: 'No obvious failure signals found',
      evidence: 'VERIFICATION.md exists, no missing summaries, no large diffs',
      suggestion: 'Review VERIFICATION.md manually or re-run gd verify-phase N for details',
    });
  }

  const result: DiagnosisResult = {
    phase: phaseInfo.phase_number,
    verdict,
    root_causes: rootCauses,
    failed_checks: failedChecks,
    git_diff_lines: gitDiffLines,
    plans_missing_summaries: plansMissingSummaries,
  };

  const summary = `Phase ${phaseInfo.phase_number}: ${rootCauses.length} root cause(s) — top: ${rootCauses[0].cause}`;
  output(result, raw, summary);
}

/** Map a failed check name to a human-readable next-step suggestion. */
function _checkSuggestion(check: string): string {
  if (/frontmatter/i.test(check)) return 'Ensure PLAN.md has all required frontmatter fields (phase, plan, type, wave, depends_on, files_modified, autonomous, must_haves)';
  if (/artifact/i.test(check)) return 'Verify all must_haves artifacts exist at the declared paths with required content';
  if (/reference/i.test(check)) return 'Fix broken @file or `path` references in PLAN.md';
  if (/key.?link/i.test(check)) return 'Confirm all key_links pairs are wired together in source/target files';
  if (/summary|completeness/i.test(check)) return 'Write a SUMMARY.md for each PLAN.md in the phase directory';
  return `Review the "${check}" section in VERIFICATION.md for details`;
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
  cmdVerifyMechanical,
  cmdDiagnosePhase,
  clearVerifyCache,
};
