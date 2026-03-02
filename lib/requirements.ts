/**
 * GRD Requirements — Requirement management command functions
 *
 * Extracted from lib/commands.js during Phase modularization.
 * Contains all functions related to REQUIREMENTS.md parsing, listing,
 * traceability, and status updates.
 */

'use strict';

import type { Requirement, TraceabilityEntry } from './types';

const fs = require('fs');
const path = require('path');

const { safeReadFile, output, error } = require('./utils');
const { milestonesDir: getMilestonesDirPath } = require('./paths');

// ─── Domain Types ─────────────────────────────────────────────────────────────

/** Filters for requirement list command. */
interface RequirementFilters {
  phase?: string | number;
  priority?: string;
  status?: string;
  category?: string;
  all?: boolean;
}

/** Result from cmdRequirementList. */
interface RequirementListResult {
  requirements: Requirement[];
  count: number;
  filters_applied: Record<string, unknown>;
}

/** Result from cmdRequirementTraceability. */
interface TraceabilityResult {
  matrix: TraceabilityEntry[];
  count: number;
}

/** Result from cmdRequirementUpdateStatus. */
interface UpdateStatusResult {
  updated?: boolean;
  dry_run?: boolean;
  id: string;
  old_status: string;
  new_status: string;
}

// Module-level cache for REQUIREMENTS.md reads across command calls.
// Prevents redundant disk reads when multiple requirement commands access the same file in one process.
const _reqContentCache: Map<string, string> = new Map();

/**
 * Read REQUIREMENTS.md with per-process caching.
 */
function readCachedRequirements(reqFilePath: string): string | null {
  if (!_reqContentCache.has(reqFilePath)) {
    const content: string | null = safeReadFile(reqFilePath);
    if (content !== null) _reqContentCache.set(reqFilePath, content);
    return content;
  }
  return _reqContentCache.get(reqFilePath) as string;
}

/**
 * Parse requirements from REQUIREMENTS.md content into structured array.
 */
function parseRequirements(content: string): Requirement[] {
  if (!content) return [];
  const requirements: Requirement[] = [];
  // Split by ### REQ- headings
  const parts: string[] = content.split(/(?=^### REQ-)/m);
  for (const part of parts) {
    const headingMatch: RegExpMatchArray | null = part.match(
      /^### (REQ-\d+):\s*(.+)/m
    );
    if (!headingMatch) continue;
    const id: string = headingMatch[1];
    const title: string = headingMatch[2].trim();
    const priorityMatch: RegExpMatchArray | null = part.match(
      /\*\*Priority:\*\*\s*(\S+)/
    );
    const categoryMatch: RegExpMatchArray | null = part.match(
      /\*\*Category:\*\*\s*(.+)/
    );
    const deferredMatch: RegExpMatchArray | null = part.match(
      /\*\*Deferred from:\*\*\s*(.+)/
    );
    const resolvesMatch: RegExpMatchArray | null = part.match(
      /\*\*Resolves:\*\*\s*(.+)/
    );

    // Description: everything after the metadata lines, stop at next section heading or separator
    const lines: string[] = part.split('\n');
    const descLines: string[] = [];
    let pastHeading: boolean = false;
    for (const line of lines) {
      if (/^### REQ-/.test(line)) {
        pastHeading = true;
        continue;
      }
      if (!pastHeading) continue;
      if (
        /^\*\*(Priority|Category|Deferred from|Resolves):\*\*/.test(line)
      )
        continue;
      // Stop at next section heading or separator
      if (/^##\s/.test(line) || /^---\s*$/.test(line)) break;
      descLines.push(line);
    }
    const description: string = descLines.join('\n').trim();

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
 */
function parseTraceabilityMatrix(content: string): TraceabilityEntry[] {
  if (!content) return [];
  const matrix: TraceabilityEntry[] = [];
  // Find section starting with ## Traceability Matrix
  const sectionMatch: RegExpMatchArray | null = content.match(
    /##\s*Traceability Matrix\s*\n([\s\S]*?)(?=\n---|\n##|$)/i
  );
  if (!sectionMatch) return [];

  const tableContent: string = sectionMatch[1];
  const rows: string[] = tableContent
    .split('\n')
    .filter((r: string) => r.startsWith('|'));
  // Skip header row and separator row
  const dataRows: string[] = rows.filter(
    (r: string) =>
      !r.match(/^\|\s*REQ\s*\|/i) && !r.match(/^\|[\s-]+\|/)
  );

  for (const row of dataRows) {
    const cells: string[] = row
      .split('|')
      .map((c: string) => c.trim())
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
 */
function cmdRequirementGet(
  cwd: string,
  reqId: string,
  raw: boolean
): void {
  const reqFilePath: string = path.join(
    cwd,
    '.planning',
    'REQUIREMENTS.md'
  );
  const content: string | null = readCachedRequirements(reqFilePath);

  // Search current file first
  if (content) {
    const requirements: Requirement[] = parseRequirements(content);
    const match: Requirement | undefined = requirements.find(
      (r: Requirement) => r.id.toLowerCase() === reqId.toLowerCase()
    );
    if (match) {
      // Merge status and phase from traceability matrix
      const matrix: TraceabilityEntry[] = parseTraceabilityMatrix(content);
      const matrixRow: TraceabilityEntry | undefined = matrix.find(
        (m: TraceabilityEntry) =>
          m.req.toLowerCase() === reqId.toLowerCase()
      );
      if (matrixRow) {
        match.status = matrixRow.status;
        match.phase = matrixRow.phase;
      }
      output(
        match,
        raw,
        `${match.id}: ${match.title || ''} [${match.status || 'unknown'}]`
      );
      return;
    }
  }

  // Fallback: scan archived milestone REQUIREMENTS.md files
  const milestonesDir: string = getMilestonesDirPath(cwd);
  try {
    const files: string[] = fs
      .readdirSync(milestonesDir)
      .filter((f: string) => f.match(/^v[\d.]+-REQUIREMENTS\.md$/i));
    for (const file of files) {
      const filePath: string = path.join(milestonesDir, file);
      const archiveContent: string | null = safeReadFile(filePath);
      if (!archiveContent) continue;
      const archiveReqs: Requirement[] = parseRequirements(archiveContent);
      const match: Requirement | undefined = archiveReqs.find(
        (r: Requirement) => r.id.toLowerCase() === reqId.toLowerCase()
      );
      if (match) {
        // Merge status from archived traceability matrix
        const matrix: TraceabilityEntry[] =
          parseTraceabilityMatrix(archiveContent);
        const matrixRow: TraceabilityEntry | undefined = matrix.find(
          (m: TraceabilityEntry) =>
            m.req.toLowerCase() === reqId.toLowerCase()
        );
        if (matrixRow) {
          match.status = matrixRow.status;
          match.phase = matrixRow.phase;
        }
        // Extract milestone version from filename
        const versionMatch: RegExpMatchArray | null = file.match(
          /^(v[\d.]+)-REQUIREMENTS\.md$/i
        );
        match.milestone = versionMatch ? versionMatch[1] : file;
        output(
          match,
          raw,
          `${match.id}: ${match.title || ''} [${match.status || 'unknown'}]`
        );
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
 */
function cmdRequirementList(
  cwd: string,
  filters: RequirementFilters | null,
  raw: boolean
): void {
  const f: RequirementFilters = filters || {};
  const reqFilePath: string = path.join(
    cwd,
    '.planning',
    'REQUIREMENTS.md'
  );
  const content: string | null = readCachedRequirements(reqFilePath);

  let allReqs: Requirement[] = [];

  if (content) {
    allReqs = parseRequirements(content);
    const matrix: TraceabilityEntry[] = parseTraceabilityMatrix(content);

    // Merge status/phase from matrix into each requirement
    for (const req of allReqs) {
      const matrixRow: TraceabilityEntry | undefined = matrix.find(
        (m: TraceabilityEntry) =>
          m.req.toLowerCase() === req.id.toLowerCase()
      );
      if (matrixRow) {
        req.status = matrixRow.status;
        req.phase = matrixRow.phase;
      }
    }
  }

  // If --all, include archived milestone requirements
  if (f.all) {
    const milestonesDir: string = getMilestonesDirPath(cwd);
    try {
      const files: string[] = fs
        .readdirSync(milestonesDir)
        .filter((fname: string) =>
          fname.match(/^v[\d.]+-REQUIREMENTS\.md$/i)
        );
      for (const file of files) {
        const filePath: string = path.join(milestonesDir, file);
        const archiveContent: string | null = safeReadFile(filePath);
        if (!archiveContent) continue;
        const archiveReqs: Requirement[] =
          parseRequirements(archiveContent);
        const archiveMatrix: TraceabilityEntry[] =
          parseTraceabilityMatrix(archiveContent);
        const versionMatch: RegExpMatchArray | null = file.match(
          /^(v[\d.]+)-REQUIREMENTS\.md$/i
        );
        const milestone: string = versionMatch ? versionMatch[1] : file;

        for (const req of archiveReqs) {
          // Skip if already in current file
          if (
            allReqs.find(
              (r: Requirement) =>
                r.id.toLowerCase() === req.id.toLowerCase()
            )
          )
            continue;
          const matrixRow: TraceabilityEntry | undefined =
            archiveMatrix.find(
              (m: TraceabilityEntry) =>
                m.req.toLowerCase() === req.id.toLowerCase()
            );
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
  let filtered: Requirement[] = allReqs;

  if (f.phase) {
    filtered = filtered.filter((r: Requirement) => {
      if (!r.phase) return false;
      // Match "Phase N" where N matches filter value
      const phaseNum: RegExpMatchArray | null = r.phase.match(/(\d+)/);
      return phaseNum && phaseNum[1] === String(f.phase);
    });
  }

  if (f.priority) {
    filtered = filtered.filter(
      (r: Requirement) => r.priority === f.priority
    );
  }

  if (f.status) {
    filtered = filtered.filter(
      (r: Requirement) => r.status === f.status
    );
  }

  if (f.category) {
    filtered = filtered.filter(
      (r: Requirement) => r.category === f.category
    );
  }

  const filtersApplied: Record<string, unknown> = {};
  if (f.phase) filtersApplied.phase = f.phase;
  if (f.priority) filtersApplied.priority = f.priority;
  if (f.status) filtersApplied.status = f.status;
  if (f.category) filtersApplied.category = f.category;
  if (f.all) filtersApplied.all = true;

  const result: RequirementListResult = {
    requirements: filtered,
    count: filtered.length,
    filters_applied: filtersApplied,
  };
  output(result, raw, `${result.count} requirement(s)`);
}

/**
 * CLI command: Return traceability matrix as structured JSON.
 */
function cmdRequirementTraceability(
  cwd: string,
  filters: RequirementFilters | null,
  raw: boolean
): void {
  const f: RequirementFilters = filters || {};
  const reqFilePath: string = path.join(
    cwd,
    '.planning',
    'REQUIREMENTS.md'
  );
  const content: string | null = readCachedRequirements(reqFilePath);

  let matrix: TraceabilityEntry[] = [];
  if (content) {
    matrix = parseTraceabilityMatrix(content);
  }

  // Apply phase filter
  if (f.phase) {
    matrix = matrix.filter((row: TraceabilityEntry) => {
      const phaseNum: RegExpMatchArray | null = row.phase.match(/(\d+)/);
      return phaseNum && phaseNum[1] === String(f.phase);
    });
  }

  const result: TraceabilityResult = { matrix, count: matrix.length };
  output(result, raw, `${result.count} traceability entries`);
}

/** Valid requirement statuses */
const VALID_REQUIREMENT_STATUSES: readonly string[] = [
  'Pending',
  'In Progress',
  'Done',
  'Deferred',
];

/**
 * CLI command: Update the status of a requirement in the Traceability Matrix.
 * Validates REQ-ID exists and status is valid before writing.
 */
function cmdRequirementUpdateStatus(
  cwd: string,
  reqId: string,
  newStatus: string,
  raw: boolean,
  dryRun?: boolean
): void {
  // Validate status
  if (!VALID_REQUIREMENT_STATUSES.includes(newStatus)) {
    error(
      `Invalid status "${newStatus}". Valid statuses: ${VALID_REQUIREMENT_STATUSES.join(', ')}`
    );
  }

  const reqFilePath: string = path.join(
    cwd,
    '.planning',
    'REQUIREMENTS.md'
  );
  const content: string | null = readCachedRequirements(reqFilePath);
  if (!content) {
    error('REQUIREMENTS.md not found');
  }

  // Parse traceability matrix to validate REQ-ID exists and get old status
  const matrix: TraceabilityEntry[] = parseTraceabilityMatrix(
    content as string
  );
  const matrixRow: TraceabilityEntry | undefined = matrix.find(
    (m: TraceabilityEntry) =>
      m.req.toLowerCase() === reqId.toLowerCase()
  );
  if (!matrixRow) {
    error(
      `Requirement ${reqId} not found in Traceability Matrix. Run "requirement list" to see valid requirement IDs, or check .planning/REQUIREMENTS.md`
    );
  }

  // After the error() calls above (which call process.exit), TypeScript needs
  // to know matrixRow is defined. The error() function has return type never,
  // so execution cannot reach here if matrixRow is undefined.
  const row: TraceabilityEntry = matrixRow as TraceabilityEntry;
  const oldStatus: string = row.status;

  // Use regex to replace the status cell in the matching row
  // Escape special regex characters in reqId and oldStatus
  const escapedReqId: string = row.req.replace(/[-]/g, '\\-');
  const escapedOldStatus: string = oldStatus.replace(/\s+/g, '\\s+');
  const reqPattern: RegExp = new RegExp(
    `^(\\|\\s*${escapedReqId}\\s*\\|.+\\|)\\s*${escapedOldStatus}\\s*(\\|)\\s*$`,
    'im'
  );
  // If old and new status are the same, skip the write but still report success
  if (oldStatus === newStatus) {
    output(
      {
        updated: true,
        id: row.req,
        old_status: oldStatus,
        new_status: newStatus,
      } as UpdateStatusResult,
      raw
    );
    return;
  }

  const updatedContent: string = (content as string).replace(
    reqPattern,
    `$1 ${newStatus} $2`
  );

  if (updatedContent === content) {
    error(
      `Failed to update status for ${reqId} in Traceability Matrix. Ensure the requirement row format matches the expected pattern in .planning/REQUIREMENTS.md`
    );
  }

  if (dryRun) {
    output(
      {
        dry_run: true,
        id: row.req,
        old_status: oldStatus,
        new_status: newStatus,
      } as UpdateStatusResult,
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
      id: row.req,
      old_status: oldStatus,
      new_status: newStatus,
    } as UpdateStatusResult,
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
