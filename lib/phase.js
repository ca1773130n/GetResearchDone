/**
 * Phase Lifecycle Operations — add, insert, remove, complete, list
 * plus milestone complete and validate consistency.
 *
 * Extracted from bin/grd-tools.js (Phase 03, Plan 05).
 *
 * Dependencies: utils.js, frontmatter.js (one-directional, no circular deps)
 */

const fs = require('fs');
const path = require('path');

const {
  normalizePhaseName,
  findPhaseInternal,
  generateSlugInternal,
  stripShippedSections,
  execGit,
  loadConfig,
  getMilestoneInfo: getMilestoneInfoUtil,
  output,
  error,
} = require('./utils');

const { extractFrontmatter } = require('./frontmatter');
const { runQualityAnalysis, generateCleanupPlan } = require('./cleanup');
const { runPreflightGates, checkOrphanedPhases } = require('./gates');
const {
  phasesDir: getPhasesDirPath,
  phaseDir: getPhaseDirPath,
  milestonesDir: getMilestonesDirPath,
  archivedPhasesDir: getArchivedPhasesDir,
} = require('./paths');

// ─── Phases List ──────────────────────────────────────────────────────────────

/**
 * CLI command: List phase directories with optional filtering by type or phase number.
 * @param {string} cwd - Project working directory
 * @param {Object} options - List options
 * @param {string} [options.type] - File type filter: 'plans', 'summaries', or undefined for directories
 * @param {string} [options.phase] - Phase number to filter to a single phase
 * @param {boolean} raw - Output raw text (newline-separated) instead of JSON
 * @returns {void} Outputs result to stdout and exits
 */
function cmdPhasesList(cwd, options, raw) {
  const phasesDir = getPhasesDirPath(cwd);
  const { type, phase } = options;

  // If no phases directory, return empty
  if (!fs.existsSync(phasesDir)) {
    if (type) {
      output({ files: [], count: 0 }, raw, '');
    } else {
      output({ directories: [], count: 0 }, raw, '');
    }
    return;
  }

  try {
    // Get all phase directories
    const entries = fs.readdirSync(phasesDir, { withFileTypes: true });
    let dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);

    // Sort numerically (handles decimals: 01, 02, 02.1, 02.2, 03)
    dirs.sort((a, b) => {
      const aNum = parseFloat(a.match(/^(\d+(?:\.\d+)?)/)?.[1] || '0');
      const bNum = parseFloat(b.match(/^(\d+(?:\.\d+)?)/)?.[1] || '0');
      return aNum - bNum;
    });

    // If filtering by phase number
    if (phase) {
      const normalized = normalizePhaseName(phase);
      const match = dirs.find((d) => d.startsWith(normalized));
      if (!match) {
        output({ files: [], count: 0, phase_dir: null, error: 'Phase not found' }, raw, '');
        return;
      }
      dirs = [match];
    }

    // If listing files of a specific type
    if (type) {
      const files = [];
      for (const dir of dirs) {
        const dirPath = path.join(phasesDir, dir);
        const dirFiles = fs.readdirSync(dirPath);

        let filtered;
        if (type === 'plans') {
          filtered = dirFiles.filter((f) => f.endsWith('-PLAN.md') || f === 'PLAN.md');
        } else if (type === 'summaries') {
          filtered = dirFiles.filter((f) => f.endsWith('-SUMMARY.md') || f === 'SUMMARY.md');
        } else {
          filtered = dirFiles;
        }

        files.push(...filtered.sort());
      }

      const result = {
        files,
        count: files.length,
        phase_dir: phase ? dirs[0].replace(/^\d+(?:\.\d+)?-?/, '') : null,
      };
      output(result, raw, files.join('\n'));
      return;
    }

    // Default: list directories
    output({ directories: dirs, count: dirs.length }, raw, dirs.join('\n'));
  } catch (e) {
    error('Failed to list phases: ' + e.message);
  }
}

// ─── Phase Add ────────────────────────────────────────────────────────────────

/**
 * CLI command: Add a new phase to the end of the roadmap and create its directory.
 * @param {string} cwd - Project working directory
 * @param {string} description - Human-readable phase description for the roadmap heading
 * @param {boolean} raw - Output raw padded number instead of JSON
 * @returns {void} Outputs result to stdout and exits
 */
function cmdPhaseAdd(cwd, description, raw, context) {
  if (!description) {
    error('description required for phase add');
  }

  if (description.length > 60) {
    error(`description too long (${description.length} chars): must not exceed 60 characters`);
  }

  // Pre-flight gate checks
  const gates = runPreflightGates(cwd, 'phase-add');
  if (!gates.passed) {
    output({ gate_failed: true, gate_errors: gates.errors, gate_warnings: gates.warnings }, raw);
    return;
  }

  const roadmapPath = path.join(cwd, '.planning', 'ROADMAP.md');
  let content;
  try {
    content = fs.readFileSync(roadmapPath, 'utf-8');
  } catch {
    error('ROADMAP.md not found');
    return;
  }
  const slug = generateSlugInternal(description);

  // Find highest integer phase number across full content (including shipped sections)
  const phasePattern = /#{2,3}\s*Phase\s+(\d+)(?:\.\d+)?:/gi;
  let maxPhase = 0;
  const existingPhaseNums = [];
  let m;
  while ((m = phasePattern.exec(content)) !== null) {
    const num = parseInt(m[1], 10);
    if (!existingPhaseNums.includes(num)) existingPhaseNums.push(num);
    if (num > maxPhase) maxPhase = num;
  }

  // Detect numbering gaps in existing phases
  const addWarnings = [];
  existingPhaseNums.sort((a, b) => a - b);
  for (let i = 1; i < existingPhaseNums.length; i++) {
    if (existingPhaseNums[i] !== existingPhaseNums[i - 1] + 1) {
      addWarnings.push(
        `Gap in phase sequence: ${existingPhaseNums[i - 1]} to ${existingPhaseNums[i]} (missing ${existingPhaseNums[i - 1] + 1})`
      );
    }
  }

  const newPhaseNum = maxPhase + 1;
  const paddedNum = String(newPhaseNum).padStart(2, '0');
  const dirName = `${paddedNum}-${slug}`;
  const dirPath = getPhaseDirPath(cwd, null, dirName);

  // Create directory
  fs.mkdirSync(dirPath, { recursive: true });

  // Write CONTEXT.md if context provided
  if (context) {
    const today = new Date().toISOString().slice(0, 10);
    const contextContent = `---\nphase: "${paddedNum}"\nname: "${description}"\ncreated: ${today}\n---\n\n# Phase ${newPhaseNum}: ${description} — Context\n\n${context}\n`;
    fs.writeFileSync(path.join(dirPath, `${paddedNum}-CONTEXT.md`), contextContent, 'utf-8');
  }

  // Detect heading level used in existing ROADMAP (## or ###)
  const headingLevel = /^## Phase \d+:/m.test(content) ? '##' : '###';

  // Build phase entry (includes Duration for schedule computation)
  const phaseEntry = `\n${headingLevel} Phase ${newPhaseNum}: ${description}\n\n**Goal:** ${description}\n**Depends on:** Phase ${maxPhase}\n**Duration:** 7d\n**Plans:** 0 plans\n\nPlans:\n- [ ] TBD (run /grd:plan-phase ${newPhaseNum} to break down)\n`;

  // Find insertion point: before last "---" or at end
  let updatedContent;
  const lastSeparator = content.lastIndexOf('\n---');
  if (lastSeparator > 0) {
    updatedContent = content.slice(0, lastSeparator) + phaseEntry + content.slice(lastSeparator);
  } else {
    updatedContent = content + phaseEntry;
  }

  fs.writeFileSync(roadmapPath, updatedContent, 'utf-8');

  const result = {
    phase_number: newPhaseNum,
    padded: paddedNum,
    name: description,
    slug,
    directory: path.relative(cwd, dirPath),
    schedule_affected: true,
    ...(addWarnings.length > 0 ? { warnings: addWarnings } : {}),
  };

  output(result, raw, paddedNum);
}

// ─── Phase Insert (Decimal) ──────────────────────────────────────────────────

/**
 * CLI command: Insert a decimal phase after a specified phase in the roadmap.
 * @param {string} cwd - Project working directory
 * @param {string} afterPhase - Phase number to insert after (e.g., '06')
 * @param {string} description - Human-readable phase description
 * @param {boolean} raw - Output raw decimal phase number instead of JSON
 * @returns {void} Outputs result to stdout and exits
 */
function cmdPhaseInsert(cwd, afterPhase, description, raw) {
  if (!afterPhase || !description) {
    error('after-phase and description required for phase insert. Usage: phase insert <after-phase-number> <description>');
  }

  // Pre-flight gate checks
  const gates = runPreflightGates(cwd, 'phase-insert');
  if (!gates.passed) {
    output({ gate_failed: true, gate_errors: gates.errors, gate_warnings: gates.warnings }, raw);
    return;
  }

  const roadmapPath = path.join(cwd, '.planning', 'ROADMAP.md');
  let content;
  try {
    content = fs.readFileSync(roadmapPath, 'utf-8');
  } catch {
    error('ROADMAP.md not found');
    return;
  }
  const activeContent = stripShippedSections(content);
  const slug = generateSlugInternal(description);

  // Verify target phase exists (in active section only)
  const afterPhaseEscaped = afterPhase.replace(/\./g, '\\.');
  const targetPattern = new RegExp(`#{2,}\\s*Phase\\s+${afterPhaseEscaped}:`, 'i');
  if (!targetPattern.test(activeContent)) {
    error(`Phase ${afterPhase} not found in ROADMAP.md. Run "roadmap get-phase ${afterPhase}" to verify the phase exists, or check .planning/ROADMAP.md`);
  }

  // Calculate next decimal using existing logic
  const phasesDir = getPhasesDirPath(cwd);
  const normalizedBase = normalizePhaseName(afterPhase);
  let existingDecimals = [];

  try {
    const entries = fs.readdirSync(phasesDir, { withFileTypes: true });
    const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
    const decimalPattern = new RegExp(`^${normalizedBase}\\.(\\d+)`);
    for (const dir of dirs) {
      const dm = dir.match(decimalPattern);
      if (dm) existingDecimals.push(parseInt(dm[1], 10));
    }
  } catch {}

  const nextDecimal = existingDecimals.length === 0 ? 1 : Math.max(...existingDecimals) + 1;
  const decimalPhase = `${normalizedBase}.${nextDecimal}`;
  const dirName = `${decimalPhase}-${slug}`;
  const dirPath = path.join(phasesDir, dirName);

  // Create directory
  fs.mkdirSync(dirPath, { recursive: true });

  // Detect heading level used in existing ROADMAP (## or ###)
  const headingLevel = /^## Phase \d+:/m.test(content) ? '##' : '###';

  // Build phase entry (includes Duration for schedule computation)
  const phaseEntry = `\n${headingLevel} Phase ${decimalPhase}: ${description} (INSERTED)\n\n**Goal:** [Urgent work - to be planned]\n**Depends on:** Phase ${afterPhase}\n**Duration:** 3d\n**Plans:** 0 plans\n\nPlans:\n- [ ] TBD (run /grd:plan-phase ${decimalPhase} to break down)\n`;

  // Insert after the target phase section
  const headerPattern = new RegExp(`(#{2,}\\s*Phase\\s+${afterPhaseEscaped}:[^\\n]*\\n)`, 'i');
  const headerMatch = content.match(headerPattern);
  if (!headerMatch) {
    error(`Could not find Phase ${afterPhase} header in ROADMAP.md. Ensure the phase heading matches the format "## Phase ${afterPhase}: <description>"`);
  }

  const headerIdx = content.indexOf(headerMatch[0]);
  const afterHeader = content.slice(headerIdx + headerMatch[0].length);
  const nextPhaseMatch = afterHeader.match(/\n#{2,}\s+Phase\s+\d/i);

  let insertIdx;
  if (nextPhaseMatch) {
    insertIdx = headerIdx + headerMatch[0].length + nextPhaseMatch.index;
  } else {
    insertIdx = content.length;
  }

  const updatedContent = content.slice(0, insertIdx) + phaseEntry + content.slice(insertIdx);
  fs.writeFileSync(roadmapPath, updatedContent, 'utf-8');

  const result = {
    phase_number: decimalPhase,
    after_phase: afterPhase,
    name: description,
    slug,
    directory: path.relative(cwd, dirPath),
    schedule_affected: true,
  };

  output(result, raw, decimalPhase);
}

// ─── Phase Remove ─────────────────────────────────────────────────────────────

/**
 * CLI command: Remove a phase from the roadmap, delete its directory, and renumber subsequent phases.
 * @param {string} cwd - Project working directory
 * @param {string} targetPhase - Phase number to remove (integer or decimal)
 * @param {Object} options - Remove options
 * @param {boolean} [options.force=false] - Force removal even if phase has executed summaries
 * @param {boolean} raw - Output raw text instead of JSON
 * @returns {void} Outputs result to stdout and exits
 */
function cmdPhaseRemove(cwd, targetPhase, options, raw) {
  if (!targetPhase) {
    error('phase number required for phase remove. Usage: phase remove <phase-number>');
  }

  const roadmapPath = path.join(cwd, '.planning', 'ROADMAP.md');
  const phasesDir = getPhasesDirPath(cwd);
  const force = options.force || false;
  const dryRun = options.dryRun || false;

  // Read ROADMAP.md FIRST (before any mutations) to detect unreadable state early
  let roadmapContent;
  try {
    roadmapContent = fs.readFileSync(roadmapPath, 'utf-8');
  } catch (readErr) {
    error(`Cannot read ROADMAP.md: ${readErr.message}`);
    return;
  }

  // Normalize the target
  const normalized = normalizePhaseName(targetPhase);
  const isDecimal = targetPhase.includes('.');

  // Find and validate target directory
  let targetDir = null;
  try {
    const entries = fs.readdirSync(phasesDir, { withFileTypes: true });
    const dirs = entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
    targetDir = dirs.find((d) => d.startsWith(normalized + '-') || d === normalized);
  } catch {}

  // Check for executed work (SUMMARY.md files) — skip when dry-run
  if (targetDir && !force && !dryRun) {
    const targetPath = path.join(phasesDir, targetDir);
    const files = fs.readdirSync(targetPath);
    const summaries = files.filter((f) => f.endsWith('-SUMMARY.md') || f === 'SUMMARY.md');
    if (summaries.length > 0) {
      error(
        `Phase ${targetPhase} has ${summaries.length} executed plan(s). Use --force to remove anyway.`
      );
    }
  }

  // Dry-run: collect what would happen and return early
  if (dryRun) {
    // Predict which phases would be renumbered
    const wouldRenumber = [];
    try {
      const entries = fs.readdirSync(phasesDir, { withFileTypes: true });
      const dirs = entries
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .sort();
      const removedInt = parseInt(normalized, 10);
      for (const dir of dirs) {
        const dm = dir.match(/^(\d+)(?:\.(\d+))?-(.+)$/);
        if (!dm) continue;
        const dirInt = parseInt(dm[1], 10);
        if (dirInt > removedInt) {
          wouldRenumber.push(dir);
        }
      }
    } catch {}

    const result = {
      dry_run: true,
      would_remove: targetDir || normalized,
      would_renumber: wouldRenumber,
    };
    output(result, raw, `dry-run: would remove phase ${targetPhase}`);
    return;
  }

  // Delete target directory
  if (targetDir) {
    fs.rmSync(path.join(phasesDir, targetDir), { recursive: true, force: true });
  }

  // Clean up matching .worktrees/ directories
  const cleanedWorktrees = [];
  const worktreesDir = path.join(cwd, '.worktrees');
  if (fs.existsSync(worktreesDir)) {
    try {
      const wtEntries = fs.readdirSync(worktreesDir, { withFileTypes: true });
      for (const entry of wtEntries) {
        if (entry.isDirectory() && entry.name.includes(`-${normalized}`)) {
          const wtPath = path.join(worktreesDir, entry.name);
          fs.rmSync(wtPath, { recursive: true, force: true });
          cleanedWorktrees.push(entry.name);
        }
      }
    } catch {
      // Non-fatal
    }
  }

  // Renumber subsequent phases
  const renamedDirs = [];
  const renamedFiles = [];

  if (isDecimal) {
    // Decimal removal: renumber sibling decimals (e.g., removing 06.2 -> 06.3 becomes 06.2)
    const baseParts = normalized.split('.');
    const baseInt = baseParts[0];
    const removedDecimal = parseInt(baseParts[1], 10);

    try {
      const entries = fs.readdirSync(phasesDir, { withFileTypes: true });
      const dirs = entries
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .sort();

      // Find sibling decimals with higher numbers
      const decPattern = new RegExp(`^${baseInt}\\.(\\d+)-(.+)$`);
      const toRename = [];
      for (const dir of dirs) {
        const dm = dir.match(decPattern);
        if (dm && parseInt(dm[1], 10) > removedDecimal) {
          toRename.push({ dir, oldDecimal: parseInt(dm[1], 10), slug: dm[2] });
        }
      }

      // Sort descending to avoid conflicts
      toRename.sort((a, b) => b.oldDecimal - a.oldDecimal);

      for (const item of toRename) {
        const newDecimal = item.oldDecimal - 1;
        const oldPhaseId = `${baseInt}.${item.oldDecimal}`;
        const newPhaseId = `${baseInt}.${newDecimal}`;
        const newDirName = `${baseInt}.${newDecimal}-${item.slug}`;

        // Rename directory
        fs.renameSync(path.join(phasesDir, item.dir), path.join(phasesDir, newDirName));
        renamedDirs.push({ from: item.dir, to: newDirName });

        // Rename files inside
        const dirFiles = fs.readdirSync(path.join(phasesDir, newDirName));
        for (const f of dirFiles) {
          // Files may have phase prefix like "06.2-01-PLAN.md"
          if (f.includes(oldPhaseId)) {
            const newFileName = f.replace(oldPhaseId, newPhaseId);
            fs.renameSync(
              path.join(phasesDir, newDirName, f),
              path.join(phasesDir, newDirName, newFileName)
            );
            renamedFiles.push({ from: f, to: newFileName });
          }
        }
      }
    } catch {}
  } else {
    // Integer removal: renumber all subsequent integer phases
    const removedInt = parseInt(normalized, 10);

    try {
      const entries = fs.readdirSync(phasesDir, { withFileTypes: true });
      const dirs = entries
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .sort();

      // Collect directories that need renumbering (integer phases > removed, and their decimals)
      const toRename = [];
      for (const dir of dirs) {
        const dm = dir.match(/^(\d+)(?:\.(\d+))?-(.+)$/);
        if (!dm) continue;
        const dirInt = parseInt(dm[1], 10);
        if (dirInt > removedInt) {
          toRename.push({
            dir,
            oldInt: dirInt,
            decimal: dm[2] ? parseInt(dm[2], 10) : null,
            slug: dm[3],
          });
        }
      }

      // Sort descending to avoid conflicts
      toRename.sort((a, b) => {
        if (a.oldInt !== b.oldInt) return b.oldInt - a.oldInt;
        return (b.decimal || 0) - (a.decimal || 0);
      });

      for (const item of toRename) {
        const newInt = item.oldInt - 1;
        const newPadded = String(newInt).padStart(2, '0');
        const oldPadded = String(item.oldInt).padStart(2, '0');
        const decimalSuffix = item.decimal !== null ? `.${item.decimal}` : '';
        const oldPrefix = `${oldPadded}${decimalSuffix}`;
        const newPrefix = `${newPadded}${decimalSuffix}`;
        const newDirName = `${newPrefix}-${item.slug}`;

        // Rename directory
        fs.renameSync(path.join(phasesDir, item.dir), path.join(phasesDir, newDirName));
        renamedDirs.push({ from: item.dir, to: newDirName });

        // Rename files inside
        let dirFiles;
        try {
          dirFiles = fs.readdirSync(path.join(phasesDir, newDirName));
        } catch (readDirErr) {
          if (readDirErr && readDirErr.code && readDirErr.code !== 'ENOENT') {
            process.stderr.write(
              `[phase] renumber read error (${readDirErr.code}): ${readDirErr.message}\n`
            );
          }
          continue;
        }
        for (const f of dirFiles) {
          if (f.startsWith(oldPrefix)) {
            const newFileName = newPrefix + f.slice(oldPrefix.length);
            fs.renameSync(
              path.join(phasesDir, newDirName, f),
              path.join(phasesDir, newDirName, newFileName)
            );
            renamedFiles.push({ from: f, to: newFileName });
          }
        }
      }
    } catch (renumberErr) {
      if (renumberErr && renumberErr.code && renumberErr.code !== 'ENOENT') {
        process.stderr.write(
          `[phase] renumber error (${renumberErr.code}): ${renumberErr.message}\n`
        );
      }
    }
  }

  // Update ROADMAP.md (already read above)

  // Remove the target phase section
  const targetEscaped = targetPhase.replace(/\./g, '\\.');
  const sectionPattern = new RegExp(
    `\\n?#{2,}\\s*Phase\\s+${targetEscaped}\\s*:[\\s\\S]*?(?=\\n#{2,}\\s+Phase\\s+\\d|$)`,
    'i'
  );
  roadmapContent = roadmapContent.replace(sectionPattern, '');

  // Remove from phase list (checkbox)
  const checkboxPattern = new RegExp(
    `\\n?-\\s*\\[[ x]\\]\\s*.*Phase\\s+${targetEscaped}[:\\s][^\\n]*`,
    'gi'
  );
  roadmapContent = roadmapContent.replace(checkboxPattern, '');

  // Remove from progress table
  const tableRowPattern = new RegExp(`\\n?\\|\\s*${targetEscaped}\\.?\\s[^|]*\\|[^\\n]*`, 'gi');
  roadmapContent = roadmapContent.replace(tableRowPattern, '');

  // Renumber references in ROADMAP for subsequent phases
  if (!isDecimal) {
    const removedInt = parseInt(normalized, 10);

    // Collect all integer phases > removedInt
    const maxPhase = 99; // reasonable upper bound
    for (let oldNum = maxPhase; oldNum > removedInt; oldNum--) {
      const newNum = oldNum - 1;
      const oldStr = String(oldNum);
      const newStr = String(newNum);
      const oldPad = oldStr.padStart(2, '0');
      const newPad = newStr.padStart(2, '0');

      // Phase headings: ### Phase 18: -> ### Phase 17: (or ## Phase)
      roadmapContent = roadmapContent.replace(
        new RegExp(`(#{2,}\\s*Phase\\s+)${oldStr}(\\s*:)`, 'gi'),
        `$1${newStr}$2`
      );

      // Checkbox items: - [ ] **Phase 18:** -> - [ ] **Phase 17:**
      roadmapContent = roadmapContent.replace(
        new RegExp(`(Phase\\s+)${oldStr}([:\\s])`, 'g'),
        `$1${newStr}$2`
      );

      // Plan references: 18-01 -> 17-01
      roadmapContent = roadmapContent.replace(
        new RegExp(`${oldPad}-(\\d{2})`, 'g'),
        `${newPad}-$1`
      );

      // Table rows: | 18. -> | 17.
      roadmapContent = roadmapContent.replace(
        new RegExp(`(\\|\\s*)${oldStr}\\.\\s`, 'g'),
        `$1${newStr}. `
      );

      // Depends on references
      roadmapContent = roadmapContent.replace(
        new RegExp(`(Depends on:\\*\\*\\s*Phase\\s+)${oldStr}\\b`, 'gi'),
        `$1${newStr}`
      );
    }
  }

  fs.writeFileSync(roadmapPath, roadmapContent, 'utf-8');

  // Update STATE.md phase count
  const statePath = path.join(cwd, '.planning', 'STATE.md');
  if (fs.existsSync(statePath)) {
    let stateContent = fs.readFileSync(statePath, 'utf-8');
    // Update "Total Phases" field
    const totalPattern = /(\*\*Total Phases:\*\*\s*)(\d+)/;
    const totalMatch = stateContent.match(totalPattern);
    if (totalMatch) {
      const oldTotal = parseInt(totalMatch[2], 10);
      stateContent = stateContent.replace(totalPattern, `$1${oldTotal - 1}`);
    }
    // Update "Phase: X of Y" pattern
    const ofPattern = /(\bof\s+)(\d+)(\s*(?:\(|phases?))/i;
    const ofMatch = stateContent.match(ofPattern);
    if (ofMatch) {
      const oldTotal = parseInt(ofMatch[2], 10);
      stateContent = stateContent.replace(ofPattern, `$1${oldTotal - 1}$3`);
    }
    fs.writeFileSync(statePath, stateContent, 'utf-8');
  }

  const result = {
    removed: targetPhase,
    directory_deleted: targetDir || null,
    renamed_directories: renamedDirs,
    renamed_files: renamedFiles,
    roadmap_updated: true,
    state_updated: fs.existsSync(statePath),
    ...(cleanedWorktrees.length > 0 ? { cleaned_worktrees: cleanedWorktrees } : {}),
  };

  output(result, raw, `Removed phase ${result.removed}`);
}

// ─── Phase Complete (Transition) ──────────────────────────────────────────────

/**
 * CLI command: Mark a phase as complete in ROADMAP.md and transition STATE.md to next phase.
 * @param {string} cwd - Project working directory
 * @param {string} phaseNum - Phase number to mark complete
 * @param {boolean} raw - Output raw text instead of JSON
 * @returns {void} Outputs result to stdout and exits
 */
function cmdPhaseComplete(cwd, phaseNum, raw, options) {
  if (!phaseNum) {
    error('phase number required for phase complete. Usage: phase complete <phase-number>');
  }

  const dryRun = (options && options.dryRun) || false;

  // Dry-run: return preview without modifying anything
  if (dryRun) {
    const phaseInfo = findPhaseInternal(cwd, phaseNum);
    const result = {
      dry_run: true,
      would_complete_phase: phaseNum,
      phase_found: !!phaseInfo,
    };
    output(result, raw, `dry-run: would complete phase ${phaseNum}`);
    return;
  }

  // Pre-flight gate checks
  const gates = runPreflightGates(cwd, 'phase-complete', { phase: phaseNum });
  if (!gates.passed) {
    output({ gate_failed: true, gate_errors: gates.errors, gate_warnings: gates.warnings }, raw);
    return;
  }

  const roadmapPath = path.join(cwd, '.planning', 'ROADMAP.md');
  const statePath = path.join(cwd, '.planning', 'STATE.md');
  const phasesDir = getPhasesDirPath(cwd);
  const today = new Date().toISOString().split('T')[0];

  // Verify phase info
  const phaseInfo = findPhaseInternal(cwd, phaseNum);
  if (!phaseInfo) {
    error(`Phase ${phaseNum} not found`);
  }

  const planCount = phaseInfo.plans.length;
  const summaryCount = phaseInfo.summaries.length;

  // Update ROADMAP.md: mark phase complete
  if (fs.existsSync(roadmapPath)) {
    let roadmapContent = fs.readFileSync(roadmapPath, 'utf-8');

    // Checkbox: - [ ] Phase N: -> - [x] Phase N: (...completed DATE)
    const checkboxPattern = new RegExp(
      `(-\\s*\\[)[ ](\\]\\s*.*Phase\\s+${phaseNum.replace('.', '\\.')}[:\\s][^\\n]*)`,
      'i'
    );
    roadmapContent = roadmapContent.replace(checkboxPattern, `$1x$2 (completed ${today})`);

    // Progress table: update Status to Complete, add date
    const phaseEscaped = phaseNum.replace('.', '\\.');
    const tablePattern = new RegExp(
      `(\\|\\s*${phaseEscaped}\\.?\\s[^|]*\\|[^|]*\\|)\\s*[^|]*(\\|)\\s*[^|]*(\\|)`,
      'i'
    );
    roadmapContent = roadmapContent.replace(tablePattern, `$1 Complete    $2 ${today} $3`);

    // Update plan count in phase section
    const planCountPattern = new RegExp(
      `(#{2,}\\s*Phase\\s+${phaseEscaped}[\\s\\S]*?\\*\\*Plans:\\*\\*\\s*)[^\\n]+`,
      'i'
    );
    roadmapContent = roadmapContent.replace(
      planCountPattern,
      `$1${summaryCount}/${planCount} plans complete`
    );

    fs.writeFileSync(roadmapPath, roadmapContent, 'utf-8');
  }

  // Find next phase
  let nextPhaseNum = null;
  let nextPhaseName = null;
  let isLastPhase = true;

  try {
    const entries = fs.readdirSync(phasesDir, { withFileTypes: true });
    const dirs = entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
    const currentFloat = parseFloat(phaseNum);

    // Find the next phase directory after current
    for (const dir of dirs) {
      const dm = dir.match(/^(\d+(?:\.\d+)?)-?(.*)/);
      if (dm) {
        const dirFloat = parseFloat(dm[1]);
        if (dirFloat > currentFloat) {
          nextPhaseNum = dm[1];
          nextPhaseName = dm[2] || null;
          isLastPhase = false;
          break;
        }
      }
    }
  } catch {}

  // Update STATE.md
  if (fs.existsSync(statePath)) {
    let stateContent = fs.readFileSync(statePath, 'utf-8');

    // Update Current Phase
    stateContent = stateContent.replace(
      /(\*\*Current Phase:\*\*\s*).*/,
      `$1${nextPhaseNum || phaseNum}`
    );

    // Update Current Phase Name
    if (nextPhaseName) {
      stateContent = stateContent.replace(
        /(\*\*Current Phase Name:\*\*\s*).*/,
        `$1${nextPhaseName.replace(/-/g, ' ')}`
      );
    }

    // Update Status
    stateContent = stateContent.replace(
      /(\*\*Status:\*\*\s*).*/,
      `$1${isLastPhase ? 'Milestone complete' : 'Ready to plan'}`
    );

    // Update Current Plan
    stateContent = stateContent.replace(/(\*\*Current Plan:\*\*\s*).*/, `$1Not started`);

    // Update Last Activity
    stateContent = stateContent.replace(/(\*\*Last Activity:\*\*\s*).*/, `$1${today}`);

    // Update Last Activity Description
    stateContent = stateContent.replace(
      /(\*\*Last Activity Description:\*\*\s*).*/,
      `$1Phase ${phaseNum} complete${nextPhaseNum ? `, transitioned to Phase ${nextPhaseNum}` : ''}`
    );

    fs.writeFileSync(statePath, stateContent, 'utf-8');
  }

  // Run quality analysis if enabled
  let qualityReport = null;
  try {
    const qaResult = runQualityAnalysis(cwd, phaseNum);
    if (!qaResult.skipped) {
      qualityReport = qaResult;
    }
  } catch {
    // Quality analysis is non-blocking; swallow errors
  }

  // Generate cleanup plan if quality issues exceed threshold
  let cleanupPlanResult = null;
  if (qualityReport && !qualityReport.skipped) {
    try {
      cleanupPlanResult = generateCleanupPlan(cwd, phaseNum, qualityReport);
    } catch {
      // Cleanup plan generation is non-blocking
    }
  }

  const result = {
    completed_phase: phaseNum,
    phase_name: phaseInfo.phase_name,
    plans_executed: `${summaryCount}/${planCount}`,
    next_phase: nextPhaseNum,
    next_phase_name: nextPhaseName,
    is_last_phase: isLastPhase,
    date: today,
    roadmap_updated: fs.existsSync(roadmapPath),
    state_updated: fs.existsSync(statePath),
    ...(qualityReport ? { quality_report: qualityReport } : {}),
    ...(cleanupPlanResult ? { cleanup_plan_generated: cleanupPlanResult } : {}),
  };

  let rawOutput = '';
  if (raw) {
    rawOutput = `Phase ${phaseNum} complete. ${summaryCount}/${planCount} plans executed.`;
    if (nextPhaseNum) {
      rawOutput += ` Next: Phase ${nextPhaseNum}`;
    }
    if (qualityReport && qualityReport.summary.total_issues > 0) {
      rawOutput += ` | Quality: ${qualityReport.summary.total_issues} issue(s) found`;
    }
    if (cleanupPlanResult) {
      rawOutput += ` | Cleanup plan generated: ${cleanupPlanResult.path}`;
    }
  }

  output(result, raw, rawOutput);
}

// ─── Milestone Complete ───────────────────────────────────────────────────────

/**
 * CLI command: Archive a completed milestone, gather stats, and update MILESTONES.md and STATE.md.
 * @param {string} cwd - Project working directory
 * @param {string} version - Milestone version to complete (e.g., 'v1.0')
 * @param {Object} options - Milestone options
 * @param {string} [options.name] - Display name override for the milestone
 * @param {boolean} raw - Output raw text instead of JSON
 * @returns {void} Outputs result to stdout and exits
 */
function cmdMilestoneComplete(cwd, version, options, raw) {
  if (!version) {
    error('version required for milestone complete (e.g., v1.0). Usage: milestone complete <version>');
  }

  const dryRun = (options && options.dryRun) || false;

  // Dry-run: return preview without modifying anything
  if (dryRun) {
    const result = {
      dry_run: true,
      would_archive_version: version,
    };
    output(result, raw, `dry-run: would archive milestone ${version}`);
    return;
  }

  // Pre-flight gate checks
  const gates = runPreflightGates(cwd, 'milestone-complete');
  if (!gates.passed) {
    output({ gate_failed: true, gate_errors: gates.errors, gate_warnings: gates.warnings }, raw);
    return;
  }

  const roadmapPath = path.join(cwd, '.planning', 'ROADMAP.md');
  const reqPath = path.join(cwd, '.planning', 'REQUIREMENTS.md');
  const statePath = path.join(cwd, '.planning', 'STATE.md');
  const milestonesPath = path.join(cwd, '.planning', 'MILESTONES.md');
  const archiveDir = getMilestonesDirPath(cwd);
  const phasesDir = getPhasesDirPath(cwd);
  const today = new Date().toISOString().split('T')[0];
  const milestoneName = options.name || version;

  // Ensure archive directory exists
  fs.mkdirSync(archiveDir, { recursive: true });

  // Check if phases are already under the milestone directory (new-style layout)
  const milestonePhaseDir = path.join(cwd, '.planning', 'milestones', version, 'phases');
  let phasesAlreadyInPlace = false;
  try {
    phasesAlreadyInPlace =
      fs.existsSync(milestonePhaseDir) &&
      fs.readdirSync(milestonePhaseDir, { withFileTypes: true }).some((e) => e.isDirectory());
  } catch {}

  // Determine the source directory for stat gathering
  const statsSourceDir = phasesAlreadyInPlace ? milestonePhaseDir : phasesDir;

  // Gather stats from phases
  let phaseCount = 0;
  let totalPlans = 0;
  let totalTasks = 0;
  const accomplishments = [];

  try {
    const entries = fs.readdirSync(statsSourceDir, { withFileTypes: true });
    const dirs = entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();

    for (const dir of dirs) {
      phaseCount++;
      const phaseFiles = fs.readdirSync(path.join(statsSourceDir, dir));
      const plans = phaseFiles.filter((f) => f.endsWith('-PLAN.md') || f === 'PLAN.md');
      const summaries = phaseFiles.filter((f) => f.endsWith('-SUMMARY.md') || f === 'SUMMARY.md');
      totalPlans += plans.length;

      // Extract one-liners from summaries
      for (const s of summaries) {
        try {
          const content = fs.readFileSync(path.join(statsSourceDir, dir, s), 'utf-8');
          const fm = extractFrontmatter(content);
          if (fm['one-liner']) {
            accomplishments.push(fm['one-liner']);
          }
          // Count tasks
          const taskMatches = content.match(/##\s*Task\s*\d+/gi) || [];
          totalTasks += taskMatches.length;
        } catch {}
      }
    }
  } catch {}

  // Archive phase directories to .planning/milestones/{version}-phases/
  const phasesArchiveDir = getArchivedPhasesDir(cwd, version);
  let archivedPhaseCount = 0;

  if (phasesAlreadyInPlace) {
    // Phases already live under milestones/{version}/phases/ — skip redundant copy
    archivedPhaseCount = phaseCount;
  } else {
    // Old-style layout — copy phases to archive, then delete originals
    try {
      const phaseEntries = fs.readdirSync(phasesDir, { withFileTypes: true });
      const phaseDirs = phaseEntries.filter((e) => e.isDirectory()).map((e) => e.name);
      if (phaseDirs.length > 0) {
        fs.mkdirSync(phasesArchiveDir, { recursive: true });
        for (const dir of phaseDirs) {
          fs.cpSync(path.join(phasesDir, dir), path.join(phasesArchiveDir, dir), {
            recursive: true,
          });
          fs.rmSync(path.join(phasesDir, dir), { recursive: true, force: true });
          archivedPhaseCount++;
        }
      }
    } catch {
      // Phase archival is non-blocking
    }
  }

  // Archive ROADMAP.md
  if (fs.existsSync(roadmapPath)) {
    const roadmapContent = fs.readFileSync(roadmapPath, 'utf-8');
    fs.writeFileSync(path.join(archiveDir, `${version}-ROADMAP.md`), roadmapContent, 'utf-8');
  }

  // Archive REQUIREMENTS.md
  if (fs.existsSync(reqPath)) {
    const reqContent = fs.readFileSync(reqPath, 'utf-8');
    const archiveHeader = `# Requirements Archive: ${version} ${milestoneName}\n\n**Archived:** ${today}\n**Status:** SHIPPED\n\nFor current requirements, see \`.planning/REQUIREMENTS.md\`.\n\n---\n\n`;
    fs.writeFileSync(
      path.join(archiveDir, `${version}-REQUIREMENTS.md`),
      archiveHeader + reqContent,
      'utf-8'
    );
  }

  // Archive audit file if exists
  const auditFile = path.join(cwd, '.planning', `${version}-MILESTONE-AUDIT.md`);
  if (fs.existsSync(auditFile)) {
    fs.renameSync(auditFile, path.join(archiveDir, `${version}-MILESTONE-AUDIT.md`));
  }

  // Write archived.json metadata marker (REQ-60)
  const milestoneVersionDir = path.join(cwd, '.planning', 'milestones', version);
  fs.mkdirSync(milestoneVersionDir, { recursive: true });
  const markerPath = path.join(milestoneVersionDir, 'archived.json');
  const marker = {
    version,
    name: milestoneName,
    archived_date: today,
    phases: phaseCount,
    plans: totalPlans,
    tasks: totalTasks,
    accomplishments,
  };
  fs.writeFileSync(markerPath, JSON.stringify(marker, null, 2) + '\n', 'utf-8');

  // Create/append MILESTONES.md entry
  const accomplishmentsList = accomplishments.map((a) => `- ${a}`).join('\n');
  const milestoneEntry = `## ${version} ${milestoneName} (Shipped: ${today})\n\n**Phases completed:** ${phaseCount} phases, ${totalPlans} plans, ${totalTasks} tasks\n\n**Key accomplishments:**\n${accomplishmentsList || '- (none recorded)'}\n\n---\n\n`;

  if (fs.existsSync(milestonesPath)) {
    const existing = fs.readFileSync(milestonesPath, 'utf-8');
    fs.writeFileSync(milestonesPath, existing + '\n' + milestoneEntry, 'utf-8');
  } else {
    fs.writeFileSync(milestonesPath, `# Milestones\n\n${milestoneEntry}`, 'utf-8');
  }

  // Update STATE.md
  if (fs.existsSync(statePath)) {
    let stateContent = fs.readFileSync(statePath, 'utf-8');
    stateContent = stateContent.replace(
      /(\*\*Status:\*\*\s*).*/,
      `$1${version} milestone complete`
    );
    stateContent = stateContent.replace(/(\*\*Last Activity:\*\*\s*).*/, `$1${today}`);
    stateContent = stateContent.replace(
      /(\*\*Last Activity Description:\*\*\s*).*/,
      `$1${version} milestone completed and archived`
    );
    fs.writeFileSync(statePath, stateContent, 'utf-8');
  }

  // Merge milestone branch into base branch (if branching strategy is active)
  let gitMerge = null;
  try {
    const config = loadConfig(cwd);
    if (config.branching_strategy && config.branching_strategy !== 'none') {
      const template = config.milestone_branch_template || 'grd/{milestone}-{slug}';
      let msName = milestoneName;
      try {
        const msInfo = getMilestoneInfoUtil(cwd);
        msName = msInfo.name || milestoneName;
      } catch {
        // Use milestoneName from options
      }
      const msSlug = generateSlugInternal(msName) || 'milestone';
      const msBranch = template.replace('{milestone}', version).replace('{slug}', msSlug);
      const baseBranch = config.base_branch || 'main';

      // Check if milestone branch exists
      const msCheck = execGit(cwd, ['rev-parse', '--verify', msBranch]);
      if (msCheck.exitCode !== 0) {
        gitMerge = { skipped: true, reason: `Milestone branch '${msBranch}' not found` };
      } else {
        // Record current branch
        const headResult = execGit(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
        const originalBranch = headResult.exitCode === 0 ? headResult.stdout.trim() : baseBranch;

        // Checkout base branch
        const coResult = execGit(cwd, ['checkout', baseBranch]);
        if (coResult.exitCode !== 0) {
          gitMerge = { skipped: true, reason: `Failed to checkout '${baseBranch}'` };
        } else {
          // Merge milestone branch
          const mergeResult = execGit(cwd, [
            'merge',
            '--no-ff',
            msBranch,
            '-m',
            `Merge milestone ${version}: ${milestoneName}`,
          ]);

          if (mergeResult.exitCode !== 0) {
            // Conflict — abort and restore
            execGit(cwd, ['merge', '--abort']);
            execGit(cwd, ['checkout', originalBranch]);
            gitMerge = {
              error: 'Merge conflict',
              milestone_branch: msBranch,
              base_branch: baseBranch,
            };
          } else {
            // Delete milestone branch after successful merge
            execGit(cwd, ['branch', '-d', msBranch]);
            // Restore original branch (stay on base after milestone merge)
            if (originalBranch !== baseBranch) {
              execGit(cwd, ['checkout', originalBranch]);
            }
            gitMerge = {
              merged: true,
              milestone_branch: msBranch,
              base_branch: baseBranch,
              branch_deleted: true,
            };
          }
        }
      }
    }
  } catch {
    // Git merge is non-blocking
  }

  const result = {
    version,
    name: milestoneName,
    date: today,
    phases: phaseCount,
    plans: totalPlans,
    tasks: totalTasks,
    accomplishments,
    phases_already_in_place: phasesAlreadyInPlace,
    archived: {
      roadmap: fs.existsSync(path.join(archiveDir, `${version}-ROADMAP.md`)),
      requirements: fs.existsSync(path.join(archiveDir, `${version}-REQUIREMENTS.md`)),
      audit: fs.existsSync(path.join(archiveDir, `${version}-MILESTONE-AUDIT.md`)),
      phases: archivedPhaseCount > 0,
      phase_count: archivedPhaseCount,
      marker: true,
    },
    milestones_updated: true,
    state_updated: fs.existsSync(statePath),
    ...(gitMerge ? { git_merge: gitMerge } : {}),
  };

  output(result, raw, `Milestone ${result.version} complete: ${result.phases} phases, ${result.plans} plans`);
}

// ─── Validate Consistency ─────────────────────────────────────────────────────

/**
 * CLI command: Validate phase numbering consistency between ROADMAP.md and disk directories.
 * @param {string} cwd - Project working directory
 * @param {boolean} raw - Output raw 'passed'/'failed' instead of JSON
 * @returns {void} Outputs validation result to stdout and exits
 */
function cmdValidateConsistency(cwd, raw, options) {
  const fix = (options && options.fix) || false;
  const roadmapPath = path.join(cwd, '.planning', 'ROADMAP.md');
  const phasesDir = getPhasesDirPath(cwd);
  const errors_list = [];
  const warnings = [];
  const fixed = [];

  // Check for ROADMAP
  let roadmapContent;
  try {
    roadmapContent = fs.readFileSync(roadmapPath, 'utf-8');
  } catch {
    errors_list.push('ROADMAP.md not found');
    output({ passed: false, errors: errors_list, warnings }, raw, 'failed');
    return;
  }
  const activeContent = stripShippedSections(roadmapContent);

  // Extract phases from ROADMAP (active section only)
  const roadmapPhases = new Set();
  const phasePattern = /#{2,3}\s*Phase\s+(\d+(?:\.\d+)?)\s*:/gi;
  let m;
  while ((m = phasePattern.exec(activeContent)) !== null) {
    roadmapPhases.add(m[1]);
  }

  // Get phases on disk
  const diskPhases = new Set();
  try {
    const entries = fs.readdirSync(phasesDir, { withFileTypes: true });
    const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
    for (const dir of dirs) {
      const dm = dir.match(/^(\d+(?:\.\d+)?)/);
      if (dm) diskPhases.add(dm[1]);
    }
  } catch {}

  // Check: phases in ROADMAP but not on disk
  for (const p of roadmapPhases) {
    if (!diskPhases.has(p) && !diskPhases.has(normalizePhaseName(p))) {
      warnings.push(`Phase ${p} in ROADMAP.md but no directory on disk`);
    }
  }

  // Check: orphaned phases on disk but not in ROADMAP (errors, not warnings)
  const orphanViolations = checkOrphanedPhases(cwd);
  for (const v of orphanViolations) {
    errors_list.push(v.message);
  }

  // Check: sequential phase numbers (integers only)
  const integerPhases = [...diskPhases]
    .filter((p) => !p.includes('.'))
    .map((p) => parseInt(p, 10))
    .sort((a, b) => a - b);

  for (let i = 1; i < integerPhases.length; i++) {
    if (integerPhases[i] !== integerPhases[i - 1] + 1) {
      warnings.push(`Gap in phase numbering: ${integerPhases[i - 1]} \u2192 ${integerPhases[i]}`);
    }
  }

  // Check: plan numbering within phases
  try {
    const entries = fs.readdirSync(phasesDir, { withFileTypes: true });
    const dirs = entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();

    for (const dir of dirs) {
      const phaseFiles = fs.readdirSync(path.join(phasesDir, dir));
      const plans = phaseFiles.filter((f) => f.endsWith('-PLAN.md')).sort();

      // Extract plan numbers
      const planNums = plans
        .map((p) => {
          const pm = p.match(/-(\d{2})-PLAN\.md$/);
          return pm ? parseInt(pm[1], 10) : null;
        })
        .filter((n) => n !== null);

      for (let i = 1; i < planNums.length; i++) {
        if (planNums[i] !== planNums[i - 1] + 1) {
          warnings.push(
            `Gap in plan numbering in ${dir}: plan ${planNums[i - 1]} \u2192 ${planNums[i]}`
          );
        }
      }

      // Check: plans without summaries (completed plans)
      const summaries = phaseFiles.filter((f) => f.endsWith('-SUMMARY.md'));
      const planIds = new Set(plans.map((p) => p.replace('-PLAN.md', '')));
      const summaryIds = new Set(summaries.map((s) => s.replace('-SUMMARY.md', '')));

      // Summary without matching plan is suspicious (orphaned)
      for (const sid of summaryIds) {
        if (!planIds.has(sid)) {
          const orphanFile = `${sid}-SUMMARY.md`;
          const orphanPath = path.join(phasesDir, dir, orphanFile);
          if (fix) {
            try {
              fs.unlinkSync(orphanPath);
              fixed.push(orphanPath);
            } catch {
              warnings.push(`Failed to remove orphaned summary: ${orphanFile} in ${dir}`);
            }
          } else {
            warnings.push(`Orphaned summary ${orphanFile} in ${dir} has no matching PLAN.md`);
          }
        }
      }
    }
  } catch {}

  // Check: frontmatter in plans has required fields
  try {
    const entries = fs.readdirSync(phasesDir, { withFileTypes: true });
    const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);

    for (const dir of dirs) {
      const phaseFiles = fs.readdirSync(path.join(phasesDir, dir));
      const plans = phaseFiles.filter((f) => f.endsWith('-PLAN.md'));

      for (const plan of plans) {
        const content = fs.readFileSync(path.join(phasesDir, dir, plan), 'utf-8');
        const fm = extractFrontmatter(content);

        if (!fm.wave) {
          warnings.push(`${dir}/${plan}: missing 'wave' in frontmatter`);
        }
      }
    }
  } catch {}

  const passed = errors_list.length === 0;
  output(
    {
      passed,
      errors: errors_list,
      warnings,
      warning_count: warnings.length,
      ...(fix ? { fixed } : {}),
    },
    raw,
    passed ? 'passed' : 'failed'
  );
}

// ─── Version Bump ─────────────────────────────────────────────────────────────

/**
 * CLI command: Bump version in plugin.json, VERSION, and package.json.
 * @param {string} cwd - Project working directory
 * @param {string} version - Version string (with or without 'v' prefix)
 * @param {boolean} raw - Output raw text instead of JSON
 * @returns {void} Outputs result to stdout and exits
 */
function cmdVersionBump(cwd, version, raw) {
  if (!version) {
    error('version required for version bump (e.g., v1.0.0). Usage: milestone version-bump <version>');
  }

  // Strip leading 'v' prefix
  const semver = version.replace(/^v/, '');

  const files = {
    VERSION: path.join(cwd, 'VERSION'),
    'package.json': path.join(cwd, 'package.json'),
    '.claude-plugin/plugin.json': path.join(cwd, '.claude-plugin', 'plugin.json'),
  };

  const updated = [];

  // Update VERSION file
  if (fs.existsSync(files.VERSION)) {
    fs.writeFileSync(files.VERSION, semver + '\n', 'utf-8');
    updated.push('VERSION');
  }

  // Update package.json
  if (fs.existsSync(files['package.json'])) {
    const pkg = JSON.parse(fs.readFileSync(files['package.json'], 'utf-8'));
    pkg.version = semver;
    fs.writeFileSync(files['package.json'], JSON.stringify(pkg, null, 2) + '\n', 'utf-8');
    updated.push('package.json');
  }

  // Update .claude-plugin/plugin.json
  if (fs.existsSync(files['.claude-plugin/plugin.json'])) {
    const plugin = JSON.parse(fs.readFileSync(files['.claude-plugin/plugin.json'], 'utf-8'));
    plugin.version = semver;
    fs.writeFileSync(
      files['.claude-plugin/plugin.json'],
      JSON.stringify(plugin, null, 2) + '\n',
      'utf-8'
    );
    updated.push('.claude-plugin/plugin.json');
  }

  const result = {
    version: semver,
    files_updated: updated,
    count: updated.length,
  };

  output(result, raw, `Bumped ${updated.length} files to ${semver}`);
}

// ─── Batch Phase Complete ─────────────────────────────────────────────────────

/**
 * CLI command: Complete multiple phases in a single call.
 * @param {string} cwd - Project working directory
 * @param {string[]} phases - Array of phase numbers to complete
 * @param {Object} options - Options passed to each cmdPhaseComplete call
 * @param {boolean} raw - Output raw text instead of JSON
 * @returns {void} Outputs combined result to stdout and exits
 */
function cmdPhaseBatchComplete(cwd, phases, options, raw) {
  if (!phases || phases.length === 0) {
    output({ error: 'phases list is required and must not be empty' }, raw, 'error');
    return;
  }

  const results = [];
  let completedCount = 0;

  for (const phase of phases) {
    let phaseResult = null;
    let phaseError = null;

    // Temporarily capture stdout and intercept process.exit to run cmdPhaseComplete
    let capturedStdout = '';
    const origWrite = process.stdout.write.bind(process.stdout);
    const origExit = process.exit.bind(process);

    process.stdout.write = (data) => {
      capturedStdout += data;
      return true;
    };

    let exitCalled = false;
    process.exit = (_code) => {
      exitCalled = true;
    };

    try {
      cmdPhaseComplete(cwd, phase, false, options);
    } catch {
      // Ignore errors from cmdPhaseComplete
    } finally {
      process.stdout.write = origWrite;
      process.exit = origExit;
    }

    if (capturedStdout) {
      try {
        phaseResult = JSON.parse(capturedStdout);
        completedCount++;
      } catch {
        phaseError = `Failed to parse result for phase ${phase}`;
      }
    } else if (!exitCalled) {
      phaseError = `No output from phase ${phase} completion`;
    } else {
      completedCount++;
    }

    results.push({
      phase,
      ...(phaseResult ? { result: phaseResult } : {}),
      ...(phaseError ? { error: phaseError } : {}),
    });
  }

  output(
    {
      results,
      total_phases: phases.length,
      completed_count: completedCount,
    },
    raw,
    `Completed ${completedCount}/${phases.length} phases`
  );
}

// ─── Atomic Write ─────────────────────────────────────────────────────────────

/**
 * Write content to a file atomically using a .tmp intermediate file.
 * On success, the .tmp file is renamed to the target path.
 * On failure, the original file is left untouched.
 * @param {string} filePath - Absolute path to the target file
 * @param {string} content - Content to write
 * @returns {void}
 */
function atomicWriteFile(filePath, content) {
  const tmpPath = filePath + '.tmp';
  fs.writeFileSync(tmpPath, content, 'utf-8');
  fs.renameSync(tmpPath, filePath);
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  cmdPhasesList,
  cmdPhaseAdd,
  cmdPhaseInsert,
  cmdPhaseRemove,
  cmdPhaseComplete,
  cmdMilestoneComplete,
  cmdValidateConsistency,
  cmdVersionBump,
  cmdPhaseBatchComplete,
  atomicWriteFile,
};
