/**
 * GRD Requirements — Requirement management command functions
 *
 * Extracted from lib/commands.js during Phase modularization.
 * Contains all functions related to REQUIREMENTS.md parsing, listing,
 * traceability, and status updates.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const { safeReadFile, output, error } = require('./utils');
const { milestonesDir: getMilestonesDirPath } = require('./paths');

// Module-level cache for REQUIREMENTS.md reads across command calls.
// Prevents redundant disk reads when multiple requirement commands access the same file in one process.
const _reqContentCache = new Map();

/**
 * Read REQUIREMENTS.md with per-process caching.
 * @param {string} reqFilePath - Absolute path to REQUIREMENTS.md
 * @returns {string|null} File content or null if not found
 */
function readCachedRequirements(reqFilePath) {
  if (!_reqContentCache.has(reqFilePath)) {
    const content = safeReadFile(reqFilePath);
    if (content !== null) _reqContentCache.set(reqFilePath, content);
    return content;
  }
  return _reqContentCache.get(reqFilePath);
}

/**
 * Parse requirements from REQUIREMENTS.md content into structured array.
 * @param {string} content - Raw REQUIREMENTS.md file content
 * @returns {Array<Object>} Array of requirement objects with id, title, priority, category, description, deferred_from, resolves
 */
function parseRequirements(content) {
  if (!content) return [];
  const requirements = [];
  // Split by ### REQ- headings
  const parts = content.split(/(?=^### REQ-)/m);
  for (const part of parts) {
    const headingMatch = part.match(/^### (REQ-\d+):\s*(.+)/m);
    if (!headingMatch) continue;
    const id = headingMatch[1];
    const title = headingMatch[2].trim();
    const priorityMatch = part.match(/\*\*Priority:\*\*\s*(\S+)/);
    const categoryMatch = part.match(/\*\*Category:\*\*\s*(.+)/);
    const deferredMatch = part.match(/\*\*Deferred from:\*\*\s*(.+)/);
    const resolvesMatch = part.match(/\*\*Resolves:\*\*\s*(.+)/);

    // Description: everything after the metadata lines, stop at next section heading or separator
    const lines = part.split('\n');
    const descLines = [];
    let pastHeading = false;
    for (const line of lines) {
      if (/^### REQ-/.test(line)) {
        pastHeading = true;
        continue;
      }
      if (!pastHeading) continue;
      if (/^\*\*(Priority|Category|Deferred from|Resolves):\*\*/.test(line)) continue;
      // Stop at next section heading or separator
      if (/^##\s/.test(line) || /^---\s*$/.test(line)) break;
      descLines.push(line);
    }
    const description = descLines.join('\n').trim();

    requirements.push({
      id,
      title,
      priority: priorityMatch ? priorityMatch[1].trim() : null,
      category: categoryMatch ? categoryMatch[1].trim() : null,
      deferred_from: deferredMatch ? deferredMatch[1].trim() : null,
      resolves: resolvesMatch ? resolvesMatch[1].trim() : null,
      description: description || null,
    });
  }
  return requirements;
}

/**
 * Parse the Traceability Matrix table from REQUIREMENTS.md content.
 * @param {string} content - Raw REQUIREMENTS.md file content
 * @returns {Array<Object>} Array of objects with req, feature, priority, phase, status
 */
function parseTraceabilityMatrix(content) {
  if (!content) return [];
  const matrix = [];
  // Find section starting with ## Traceability Matrix
  const sectionMatch = content.match(/##\s*Traceability Matrix\s*\n([\s\S]*?)(?=\n---|\n##|$)/i);
  if (!sectionMatch) return [];

  const tableContent = sectionMatch[1];
  const rows = tableContent.split('\n').filter((r) => r.startsWith('|'));
  // Skip header row and separator row
  const dataRows = rows.filter((r) => !r.match(/^\|\s*REQ\s*\|/i) && !r.match(/^\|[\s-]+\|/));

  for (const row of dataRows) {
    const cells = row
      .split('|')
      .map((c) => c.trim())
      .filter(Boolean);
    if (cells.length >= 5) {
      matrix.push({
        req: cells[0],
        feature: cells[1],
        priority: cells[2],
        phase: cells[3],
        status: cells[4],
      });
    }
  }
  return matrix;
}

/**
 * CLI command: Look up a single requirement by ID, returning structured JSON.
 * Falls back to archived milestone REQUIREMENTS.md files if not in current file.
 * @param {string} cwd - Project working directory
 * @param {string} reqId - Requirement ID (e.g., "REQ-31")
 * @param {boolean} raw - Output raw JSON string instead of pretty-printed
 * @returns {void} Outputs requirement JSON to stdout and exits
 */
function cmdRequirementGet(cwd, reqId, raw) {
  const reqFilePath = path.join(cwd, '.planning', 'REQUIREMENTS.md');
  const content = readCachedRequirements(reqFilePath);

  // Search current file first
  if (content) {
    const requirements = parseRequirements(content);
    const match = requirements.find((r) => r.id.toLowerCase() === reqId.toLowerCase());
    if (match) {
      // Merge status and phase from traceability matrix
      const matrix = parseTraceabilityMatrix(content);
      const matrixRow = matrix.find((m) => m.req.toLowerCase() === reqId.toLowerCase());
      if (matrixRow) {
        match.status = matrixRow.status;
        match.phase = matrixRow.phase;
      }
      output(match, raw, `${match.id}: ${match.title || ''} [${match.status || 'unknown'}]`);
      return;
    }
  }

  // Fallback: scan archived milestone REQUIREMENTS.md files
  const milestonesDir = getMilestonesDirPath(cwd);
  try {
    const files = fs
      .readdirSync(milestonesDir)
      .filter((f) => f.match(/^v[\d.]+-REQUIREMENTS\.md$/i));
    for (const file of files) {
      const filePath = path.join(milestonesDir, file);
      const archiveContent = safeReadFile(filePath);
      if (!archiveContent) continue;
      const archiveReqs = parseRequirements(archiveContent);
      const match = archiveReqs.find((r) => r.id.toLowerCase() === reqId.toLowerCase());
      if (match) {
        // Merge status from archived traceability matrix
        const matrix = parseTraceabilityMatrix(archiveContent);
        const matrixRow = matrix.find((m) => m.req.toLowerCase() === reqId.toLowerCase());
        if (matrixRow) {
          match.status = matrixRow.status;
          match.phase = matrixRow.phase;
        }
        // Extract milestone version from filename
        const versionMatch = file.match(/^(v[\d.]+)-REQUIREMENTS\.md$/i);
        match.milestone = versionMatch ? versionMatch[1] : file;
        output(match, raw, `${match.id}: ${match.title || ''} [${match.status || 'unknown'}]`);
        return;
      }
    }
  } catch {
    // milestones directory may not exist
  }

  // Not found anywhere
  output({ error: 'Requirement not found', id: reqId }, raw);
}

/**
 * CLI command: List requirements with optional filters.
 * @param {string} cwd - Project working directory
 * @param {Object} filters - Filter object: { phase, priority, status, category, all }
 * @param {boolean} raw - Output raw JSON string instead of pretty-printed
 * @returns {void} Outputs filtered requirements list to stdout and exits
 */
function cmdRequirementList(cwd, filters, raw) {
  filters = filters || {};
  const reqFilePath = path.join(cwd, '.planning', 'REQUIREMENTS.md');
  const content = readCachedRequirements(reqFilePath);

  let allReqs = [];

  if (content) {
    allReqs = parseRequirements(content);
    const matrix = parseTraceabilityMatrix(content);

    // Merge status/phase from matrix into each requirement
    for (const req of allReqs) {
      const matrixRow = matrix.find((m) => m.req.toLowerCase() === req.id.toLowerCase());
      if (matrixRow) {
        req.status = matrixRow.status;
        req.phase = matrixRow.phase;
      }
    }
  }

  // If --all, include archived milestone requirements
  if (filters.all) {
    const milestonesDir = getMilestonesDirPath(cwd);
    try {
      const files = fs
        .readdirSync(milestonesDir)
        .filter((f) => f.match(/^v[\d.]+-REQUIREMENTS\.md$/i));
      for (const file of files) {
        const filePath = path.join(milestonesDir, file);
        const archiveContent = safeReadFile(filePath);
        if (!archiveContent) continue;
        const archiveReqs = parseRequirements(archiveContent);
        const archiveMatrix = parseTraceabilityMatrix(archiveContent);
        const versionMatch = file.match(/^(v[\d.]+)-REQUIREMENTS\.md$/i);
        const milestone = versionMatch ? versionMatch[1] : file;

        for (const req of archiveReqs) {
          // Skip if already in current file
          if (allReqs.find((r) => r.id.toLowerCase() === req.id.toLowerCase())) continue;
          const matrixRow = archiveMatrix.find((m) => m.req.toLowerCase() === req.id.toLowerCase());
          if (matrixRow) {
            req.status = matrixRow.status;
            req.phase = matrixRow.phase;
          }
          req.milestone = milestone;
          allReqs.push(req);
        }
      }
    } catch {
      // milestones directory may not exist
    }
  }

  // Apply filters (AND logic)
  let filtered = allReqs;

  if (filters.phase) {
    filtered = filtered.filter((r) => {
      if (!r.phase) return false;
      // Match "Phase N" where N matches filter value
      const phaseNum = r.phase.match(/(\d+)/);
      return phaseNum && phaseNum[1] === String(filters.phase);
    });
  }

  if (filters.priority) {
    filtered = filtered.filter((r) => r.priority === filters.priority);
  }

  if (filters.status) {
    filtered = filtered.filter((r) => r.status === filters.status);
  }

  if (filters.category) {
    filtered = filtered.filter((r) => r.category === filters.category);
  }

  const filtersApplied = {};
  if (filters.phase) filtersApplied.phase = filters.phase;
  if (filters.priority) filtersApplied.priority = filters.priority;
  if (filters.status) filtersApplied.status = filters.status;
  if (filters.category) filtersApplied.category = filters.category;
  if (filters.all) filtersApplied.all = true;

  const result = {
    requirements: filtered,
    count: filtered.length,
    filters_applied: filtersApplied,
  };
  output(result, raw, `${result.count} requirement(s)`);
}

/**
 * CLI command: Return traceability matrix as structured JSON.
 * @param {string} cwd - Project working directory
 * @param {Object} filters - Filter object: { phase }
 * @param {boolean} raw - Output raw JSON string instead of pretty-printed
 * @returns {void} Outputs traceability matrix to stdout and exits
 */
function cmdRequirementTraceability(cwd, filters, raw) {
  filters = filters || {};
  const reqFilePath = path.join(cwd, '.planning', 'REQUIREMENTS.md');
  const content = readCachedRequirements(reqFilePath);

  let matrix = [];
  if (content) {
    matrix = parseTraceabilityMatrix(content);
  }

  // Apply phase filter
  if (filters.phase) {
    matrix = matrix.filter((row) => {
      const phaseNum = row.phase.match(/(\d+)/);
      return phaseNum && phaseNum[1] === String(filters.phase);
    });
  }

  const result = { matrix, count: matrix.length };
  output(result, raw, `${result.count} traceability entries`);
}

/** Valid requirement statuses */
const VALID_REQUIREMENT_STATUSES = ['Pending', 'In Progress', 'Done', 'Deferred'];

/**
 * CLI command: Update the status of a requirement in the Traceability Matrix.
 * Validates REQ-ID exists and status is valid before writing.
 * @param {string} cwd - Project working directory
 * @param {string} reqId - Requirement ID (e.g., "REQ-31")
 * @param {string} newStatus - New status value (Pending, In Progress, Done, Deferred)
 * @param {boolean} raw - Output raw JSON string instead of pretty-printed
 * @param {boolean} [dryRun=false] - If true, preview changes without writing
 */
function cmdRequirementUpdateStatus(cwd, reqId, newStatus, raw, dryRun) {
  // Validate status
  if (!VALID_REQUIREMENT_STATUSES.includes(newStatus)) {
    error(
      `Invalid status "${newStatus}". Valid statuses: ${VALID_REQUIREMENT_STATUSES.join(', ')}`
    );
  }

  const reqFilePath = path.join(cwd, '.planning', 'REQUIREMENTS.md');
  const content = readCachedRequirements(reqFilePath);
  if (!content) {
    error('REQUIREMENTS.md not found');
  }

  // Parse traceability matrix to validate REQ-ID exists and get old status
  const matrix = parseTraceabilityMatrix(content);
  const matrixRow = matrix.find((m) => m.req.toLowerCase() === reqId.toLowerCase());
  if (!matrixRow) {
    error(`Requirement ${reqId} not found in Traceability Matrix. Run "requirement list" to see valid requirement IDs, or check .planning/REQUIREMENTS.md`);
  }

  const oldStatus = matrixRow.status;

  // Use regex to replace the status cell in the matching row
  // Escape special regex characters in reqId and oldStatus
  const escapedReqId = matrixRow.req.replace(/[-]/g, '\\-');
  const escapedOldStatus = oldStatus.replace(/\s+/g, '\\s+');
  const reqPattern = new RegExp(
    `^(\\|\\s*${escapedReqId}\\s*\\|.+\\|)\\s*${escapedOldStatus}\\s*(\\|)\\s*$`,
    'im'
  );
  // If old and new status are the same, skip the write but still report success
  if (oldStatus === newStatus) {
    output(
      {
        updated: true,
        id: matrixRow.req,
        old_status: oldStatus,
        new_status: newStatus,
      },
      raw
    );
    return;
  }

  const updatedContent = content.replace(reqPattern, `$1 ${newStatus} $2`);

  if (updatedContent === content) {
    error(`Failed to update status for ${reqId} in Traceability Matrix. Ensure the requirement row format matches the expected pattern in .planning/REQUIREMENTS.md`);
  }

  if (dryRun) {
    output(
      {
        dry_run: true,
        id: matrixRow.req,
        old_status: oldStatus,
        new_status: newStatus,
      },
      raw,
      `dry-run: would update ${reqId} from "${oldStatus}" to "${newStatus}"`
    );
    return;
  }

  // Write updated content back to disk and invalidate the cache so subsequent reads see the new content
  fs.writeFileSync(reqFilePath, updatedContent, 'utf-8');
  _reqContentCache.delete(reqFilePath);

  output(
    {
      updated: true,
      id: matrixRow.req,
      old_status: oldStatus,
      new_status: newStatus,
    },
    raw
  );
}

module.exports = {
  _reqContentCache,
  readCachedRequirements,
  parseRequirements,
  parseTraceabilityMatrix,
  VALID_REQUIREMENT_STATUSES,
  cmdRequirementGet,
  cmdRequirementList,
  cmdRequirementTraceability,
  cmdRequirementUpdateStatus,
};
