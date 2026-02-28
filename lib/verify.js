/**
 * GRD Verification Suite — Plan structure, phase completeness, references, commits, artifacts, key-links
 *
 * Extracted from bin/grd-tools.js during Phase 03 modularization.
 * Depends on: lib/utils.js (safeReadFile, execGit, findPhaseInternal, validateGitRef, output, error)
 *             lib/frontmatter.js (extractFrontmatter, parseMustHavesBlock)
 */

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
} = require('./utils');
const { extractFrontmatter, parseMustHavesBlock } = require('./frontmatter');

// Module-level cache for file reads within a single process invocation.
// Safe for verify functions since they never write files.
const _fileReadCache = new Map();
function readFileCached(fullPath) {
  if (!_fileReadCache.has(fullPath)) {
    _fileReadCache.set(fullPath, safeReadFile(fullPath));
  }
  return _fileReadCache.get(fullPath);
}

// ─── Verification Command Functions ──────────────────────────────────────────

/**
 * CLI command: Verify SUMMARY.md structure including file existence, commit hashes, and self-check.
 * @param {string} cwd - Project working directory
 * @param {string} summaryPath - Relative path to the SUMMARY.md file
 * @param {number} [checkFileCount=2] - Number of mentioned files to spot-check for existence
 * @param {boolean} raw - Output raw 'passed'/'failed' instead of JSON
 * @returns {void} Outputs verification result to stdout and exits
 */
function cmdVerifySummary(cwd, summaryPath, checkFileCount, raw) {
  if (!summaryPath) {
    error('summary-path required');
  }

  const fullPath = path.join(cwd, summaryPath);
  const checkCount = checkFileCount || 2;

  // Check 1: Summary exists
  let content;
  try {
    content = fs.readFileSync(fullPath, 'utf-8');
  } catch {
    const result = {
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
  const errors = [];

  // Check 2: Spot-check files mentioned in summary
  const mentionedFiles = new Set();
  const patterns = [
    /`([^`]+\.[a-zA-Z]+)`/g,
    /(?:Created|Modified|Added|Updated|Edited):\s*`?([^\s`]+\.[a-zA-Z]+)`?/gi,
  ];

  for (const pattern of patterns) {
    let m;
    while ((m = pattern.exec(content)) !== null) {
      const filePath = m[1];
      if (filePath && !filePath.startsWith('http') && filePath.includes('/')) {
        mentionedFiles.add(filePath);
      }
    }
  }

  const filesToCheck = Array.from(mentionedFiles).slice(0, checkCount);
  const missing = [];
  for (const file of filesToCheck) {
    if (!fs.existsSync(path.join(cwd, file))) {
      missing.push(file);
    }
  }

  // Check 3: Commits exist
  const commitHashPattern = /\b[0-9a-f]{7,40}\b/g;
  const hashes = content.match(commitHashPattern) || [];
  let commitsExist = false;
  if (hashes.length > 0) {
    for (const hash of hashes.slice(0, 3)) {
      try {
        validateGitRef(hash);
      } catch {
        continue;
      }
      const result = execGit(cwd, ['cat-file', '-t', hash]);
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
    const checkSection = content.slice(content.search(selfCheckPattern));
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

  const checks = {
    summary_exists: true,
    files_created: {
      checked: filesToCheck.length,
      found: filesToCheck.length - missing.length,
      missing,
    },
    commits_exist: commitsExist,
    self_check: selfCheck,
  };

  const passed = missing.length === 0 && selfCheck !== 'failed';
  const result = { passed, checks, errors };
  output(result, raw, passed ? 'passed' : 'failed');
}

/**
 * CLI command: Verify PLAN.md structure, frontmatter fields, and task element completeness.
 * @param {string} cwd - Project working directory
 * @param {string} filePath - Path to the PLAN.md file to validate
 * @param {boolean} raw - Output raw 'valid'/'invalid' instead of JSON
 * @returns {void} Outputs validation result to stdout and exits
 */
function cmdVerifyPlanStructure(cwd, filePath, raw) {
  if (!filePath) {
    error('file path required');
  }
  const fullPath = path.isAbsolute(filePath) ? filePath : path.join(cwd, filePath);
  const content = readFileCached(fullPath);
  if (!content) {
    output({ error: 'File not found', path: filePath }, raw);
    return;
  }

  const fm = extractFrontmatter(content);
  const errors = [];
  const warnings = [];

  // Check required frontmatter fields
  const required = [
    'phase',
    'plan',
    'type',
    'wave',
    'depends_on',
    'files_modified',
    'autonomous',
    'must_haves',
  ];
  const missingFields = [];
  for (const field of required) {
    if (fm[field] === undefined) {
      errors.push(`Missing required frontmatter field: ${field}`);
      missingFields.push(field);
    }
  }
  // Include found frontmatter fields context when fields are missing
  if (missingFields.length > 0) {
    const foundFields = Object.keys(fm);
    if (foundFields.length > 0) {
      errors.push(`Found frontmatter fields: ${foundFields.join(', ')}`);
    }
  }

  // Parse and check task elements
  const taskPattern = /<task[^>]*>([\s\S]*?)<\/task>/g;
  const tasks = [];
  let taskMatch;
  while ((taskMatch = taskPattern.exec(content)) !== null) {
    const taskContent = taskMatch[1];
    const nameMatch = taskContent.match(/<name>([\s\S]*?)<\/name>/);
    const taskName = nameMatch ? nameMatch[1].trim() : 'unnamed';
    const hasFiles = /<files>/.test(taskContent);
    const hasAction = /<action>/.test(taskContent);
    const hasVerify = /<verify>/.test(taskContent);
    const hasDone = /<done>/.test(taskContent);

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
    parseInt(fm.wave) > 1 &&
    (!fm.depends_on || (Array.isArray(fm.depends_on) && fm.depends_on.length === 0))
  ) {
    warnings.push('Wave > 1 but depends_on is empty');
  }

  // Autonomous/checkpoint consistency
  const hasCheckpoints = /<task\s+type=["']?checkpoint/.test(content);
  if (hasCheckpoints && fm.autonomous !== 'false' && fm.autonomous !== false) {
    errors.push('Has checkpoint tasks but autonomous is not false');
  }

  // Extract markdown headings for found_sections
  const headingPattern = /^#{1,6}\s+.+$/gm;
  const found_sections = (content.match(headingPattern) || []).map((h) => h.trim());

  output(
    {
      valid: errors.length === 0,
      errors,
      warnings,
      task_count: tasks.length,
      tasks,
      frontmatter_fields: Object.keys(fm),
      found_sections,
    },
    raw,
    errors.length === 0 ? 'valid' : 'invalid'
  );
}

/**
 * CLI command: Check that all plans in a phase have corresponding summaries.
 * @param {string} cwd - Project working directory
 * @param {string} phase - Phase number to check
 * @param {boolean} raw - Output raw 'complete'/'incomplete' instead of JSON
 * @returns {void} Outputs completeness result to stdout and exits
 */
function cmdVerifyPhaseCompleteness(cwd, phase, raw) {
  if (!phase) {
    error('phase required');
  }
  const phaseInfo = findPhaseInternal(cwd, phase);
  if (!phaseInfo || !phaseInfo.found) {
    output({ error: 'Phase not found', phase }, raw);
    return;
  }

  const errors = [];
  const warnings = [];
  const phaseDir = path.join(cwd, phaseInfo.directory);

  // List plans and summaries
  let files;
  try {
    files = fs.readdirSync(phaseDir);
  } catch {
    output({ error: 'Cannot read phase directory' }, raw);
    return;
  }

  const plans = files.filter((f) => f.match(/-PLAN\.md$/i));
  const summaries = files.filter((f) => f.match(/-SUMMARY\.md$/i));

  // Extract plan IDs (everything before -PLAN.md)
  const planIds = new Set(plans.map((p) => p.replace(/-PLAN\.md$/i, '')));
  const summaryIds = new Set(summaries.map((s) => s.replace(/-SUMMARY\.md$/i, '')));

  // Plans without summaries
  const incompletePlans = [...planIds].filter((id) => !summaryIds.has(id));
  if (incompletePlans.length > 0) {
    errors.push(`Plans without summaries: ${incompletePlans.join(', ')}`);
  }

  // Summaries without plans (orphans)
  const orphanSummaries = [...summaryIds].filter((id) => !planIds.has(id));
  if (orphanSummaries.length > 0) {
    warnings.push(`Summaries without plans: ${orphanSummaries.join(', ')}`);
  }

  output(
    {
      complete: errors.length === 0,
      phase: phaseInfo.phase_number,
      plan_count: plans.length,
      summary_count: summaries.length,
      incomplete_plans: incompletePlans,
      orphan_summaries: orphanSummaries,
      errors,
      warnings,
    },
    raw,
    errors.length === 0 ? 'complete' : 'incomplete'
  );
}

/**
 * CLI command: Validate @-references and backtick file paths in a markdown file.
 * @param {string} cwd - Project working directory
 * @param {string} filePath - Path to the markdown file to check
 * @param {boolean} raw - Output raw 'valid'/'invalid' instead of JSON
 * @returns {void} Outputs reference validation result to stdout and exits
 */
function cmdVerifyReferences(cwd, filePath, raw) {
  if (!filePath) {
    error('file path required');
  }
  const fullPath = path.isAbsolute(filePath) ? filePath : path.join(cwd, filePath);
  const content = readFileCached(fullPath);
  if (!content) {
    output({ error: 'File not found', path: filePath }, raw);
    return;
  }

  const found = [];
  const missing = [];

  // Find @-references: @path/to/file (must contain / to be a file path)
  const atRefs = content.match(/@([^\s\n,)]+\/[^\s\n,)]+)/g) || [];
  for (const ref of atRefs) {
    const cleanRef = ref.slice(1); // remove @
    const resolved = cleanRef.startsWith('~/')
      ? path.join(process.env.HOME || os.homedir() || '', cleanRef.slice(2))
      : path.join(cwd, cleanRef);
    if (fs.existsSync(resolved)) {
      found.push(cleanRef);
    } else {
      missing.push(cleanRef);
    }
  }

  // Find backtick file paths that look like real paths (contain / and have extension)
  const backtickRefs = content.match(/`([^`]+\/[^`]+\.[a-zA-Z]{1,10})`/g) || [];
  for (const ref of backtickRefs) {
    const cleanRef = ref.slice(1, -1); // remove backticks
    if (cleanRef.startsWith('http') || cleanRef.includes('${') || cleanRef.includes('{{')) continue;
    if (found.includes(cleanRef) || missing.includes(cleanRef)) continue; // dedup
    const resolved = path.join(cwd, cleanRef);
    if (fs.existsSync(resolved)) {
      found.push(cleanRef);
    } else {
      missing.push(cleanRef);
    }
  }

  output(
    {
      valid: missing.length === 0,
      found: found.length,
      missing,
      total: found.length + missing.length,
    },
    raw,
    missing.length === 0 ? 'valid' : 'invalid'
  );
}

/**
 * CLI command: Batch verify that git commit hashes exist in the repository.
 * @param {string} cwd - Project working directory
 * @param {string[]} hashes - Array of commit hashes to verify
 * @param {boolean} raw - Output raw 'valid'/'invalid' instead of JSON
 * @returns {void} Outputs verification result to stdout and exits
 */
function cmdVerifyCommits(cwd, hashes, raw) {
  if (!hashes || hashes.length === 0) {
    error('At least one commit hash required. Usage: verify commits <hash1> [hash2 ...]. Run "git log --oneline" to find commit hashes');
  }

  const valid = [];
  const invalid = [];
  for (const hash of hashes) {
    try {
      validateGitRef(hash);
    } catch {
      invalid.push(hash);
      continue;
    }
    const result = execGit(cwd, ['cat-file', '-t', hash]);
    if (result.exitCode === 0 && result.stdout.trim() === 'commit') {
      valid.push(hash);
    } else {
      invalid.push(hash);
    }
  }

  output(
    {
      all_valid: invalid.length === 0,
      valid,
      invalid,
      total: hashes.length,
    },
    raw,
    invalid.length === 0 ? 'valid' : 'invalid'
  );
}

/**
 * CLI command: Check that must_haves.artifacts from a plan exist on disk with required content.
 * @param {string} cwd - Project working directory
 * @param {string} planFilePath - Path to the PLAN.md file containing must_haves.artifacts
 * @param {boolean} raw - Output raw 'valid'/'invalid' instead of JSON
 * @returns {void} Outputs artifact verification result to stdout and exits
 */
function cmdVerifyArtifacts(cwd, planFilePath, raw) {
  if (!planFilePath) {
    error('plan file path required');
  }
  const fullPath = path.isAbsolute(planFilePath) ? planFilePath : path.join(cwd, planFilePath);
  const content = readFileCached(fullPath);
  if (!content) {
    output({ error: 'File not found', path: planFilePath }, raw);
    return;
  }

  const artifacts = parseMustHavesBlock(content, 'artifacts');
  if (artifacts.length === 0) {
    output({ error: 'No must_haves.artifacts found in frontmatter', path: planFilePath }, raw);
    return;
  }

  const results = [];
  for (const artifact of artifacts) {
    if (typeof artifact === 'string') continue; // skip simple string items
    const artPath = artifact.path;
    if (!artPath) continue;

    const artFullPath = path.join(cwd, artPath);
    const exists = fs.existsSync(artFullPath);
    const check = {
      path: artPath,
      exists,
      issues: [],
      passed: false,
      plan_file: planFilePath,
      must_haves_field: 'must_haves.artifacts',
    };

    if (exists) {
      const fileContent = safeReadFile(artFullPath) || '';
      const lineCount = fileContent.split('\n').length;

      if (artifact.min_lines && lineCount < artifact.min_lines) {
        check.issues.push(`Only ${lineCount} lines, need ${artifact.min_lines}`);
      }
      if (artifact.contains && !fileContent.includes(artifact.contains)) {
        check.issues.push(`Missing pattern: ${artifact.contains}`);
      }
      if (artifact.exports) {
        const exports = Array.isArray(artifact.exports) ? artifact.exports : [artifact.exports];
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

  const passed = results.filter((r) => r.passed).length;
  output(
    {
      all_passed: passed === results.length,
      passed,
      total: results.length,
      artifacts: results,
    },
    raw,
    passed === results.length ? 'valid' : 'invalid'
  );
}

/**
 * CLI command: Validate must_haves.key_links patterns between source and target files.
 * @param {string} cwd - Project working directory
 * @param {string} planFilePath - Path to the PLAN.md file containing must_haves.key_links
 * @param {boolean} raw - Output raw 'valid'/'invalid' instead of JSON
 * @returns {void} Outputs key-link verification result to stdout and exits
 */
function cmdVerifyKeyLinks(cwd, planFilePath, raw) {
  if (!planFilePath) {
    error('plan file path required');
  }
  const fullPath = path.isAbsolute(planFilePath) ? planFilePath : path.join(cwd, planFilePath);
  const content = readFileCached(fullPath);
  if (!content) {
    output({ error: 'File not found', path: planFilePath }, raw);
    return;
  }

  const keyLinks = parseMustHavesBlock(content, 'key_links');
  if (keyLinks.length === 0) {
    output({ error: 'No must_haves.key_links found in frontmatter', path: planFilePath }, raw);
    return;
  }

  const results = [];
  for (const link of keyLinks) {
    if (typeof link === 'string') continue;
    const check = {
      from: link.from,
      to: link.to,
      via: link.via || '',
      verified: false,
      detail: '',
    };

    const sourceContent = safeReadFile(path.join(cwd, link.from || ''));
    if (!sourceContent) {
      check.detail = 'Source file not found';
    } else if (link.pattern) {
      try {
        const regex = new RegExp(link.pattern);
        if (regex.test(sourceContent)) {
          check.verified = true;
          check.detail = 'Pattern found in source';
        } else {
          const targetContent = safeReadFile(path.join(cwd, link.to || ''));
          if (targetContent && regex.test(targetContent)) {
            check.verified = true;
            check.detail = 'Pattern found in target';
          } else {
            check.detail = `Pattern "${link.pattern}" not found in source or target`;
          }
        }
      } catch {
        check.detail = `Invalid regex pattern: ${link.pattern}`;
      }
    } else {
      // No pattern: just check source references target
      if (sourceContent.includes(link.to || '')) {
        check.verified = true;
        check.detail = 'Target referenced in source';
      } else {
        check.detail = 'Target not referenced in source';
      }
    }

    results.push(check);
  }

  const verified = results.filter((r) => r.verified).length;
  output(
    {
      all_verified: verified === results.length,
      verified,
      total: results.length,
      links: results,
    },
    raw,
    verified === results.length ? 'valid' : 'invalid'
  );
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
