/**
 * GRD Long-Term Roadmap Operations -- LONG-TERM-ROADMAP.md parsing, validation,
 * generation, display formatting, and CRUD operations.
 *
 * Implements a flat LT-N milestone format where each LT milestone maps to
 * one or more normal milestones in ROADMAP.md.
 *
 * Depends on: lib/frontmatter.ts (extractFrontmatter)
 */

'use strict';

import type { FrontmatterObject } from './types';

const { extractFrontmatter } = require('./frontmatter') as {
  extractFrontmatter: (content: string) => FrontmatterObject;
};

// ─── Domain Types ─────────────────────────────────────────────────────────────

/**
 * An entry in the normal milestone list, with optional note (e.g., "planned").
 */
interface NormalMilestoneEntry {
  version: string;
  note?: string;
}

/**
 * A parsed LT milestone from LONG-TERM-ROADMAP.md.
 */
interface LtMilestone {
  id: string;
  name: string;
  status: string;
  goal: string;
  normal_milestones: NormalMilestoneEntry[];
}

/**
 * A parsed LONG-TERM-ROADMAP.md document.
 */
interface LongTermRoadmap {
  frontmatter: FrontmatterObject;
  milestones: LtMilestone[];
  refinement_history: RefinementHistoryEntry[];
}

/**
 * A single refinement history table row.
 */
interface RefinementHistoryEntry {
  date: string;
  action: string;
  details: string;
}

/**
 * Validation result from validateLongTermRoadmap.
 */
interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Result of adding an LT milestone: updated content and new ID.
 */
interface AddLtMilestoneResult {
  content: string;
  id: string;
}

/**
 * Error result from CRUD operations.
 */
interface ErrorResult {
  error: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Extract a bold field value from text.
 * @param text - Section text to search
 * @param fieldName - Bold field name (e.g., 'Status', 'Goal')
 * @returns The field value, or null if not found
 */
function extractBoldField(text: string, fieldName: string): string | null {
  const pattern = new RegExp(`\\*\\*${fieldName}:\\*\\*\\s*(.+)`, 'i');
  const match = text.match(pattern);
  return match ? match[1].trim() : null;
}

// ─── Refinement History ──────────────────────────────────────────────────────

/**
 * Parse the refinement history table from content.
 * @param content - Full markdown content
 * @returns Array of { date, action, details } objects
 */
function parseRefinementHistory(content: string): RefinementHistoryEntry[] {
  const sectionMatch = content.match(/^##\s+Refinement History/m);
  if (!sectionMatch || sectionMatch.index === undefined) return [];

  const afterHeading = content.slice(sectionMatch.index + sectionMatch[0].length);

  const lines = afterHeading.split('\n');
  const entries: RefinementHistoryEntry[] = [];
  let pastHeader = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#')) break;
    if (trimmed.startsWith('|') && trimmed.includes('Date') && trimmed.includes('Action')) {
      continue;
    }
    if (trimmed.match(/^\|[\s-|]+\|$/)) {
      pastHeader = true;
      continue;
    }
    if (pastHeader && trimmed.startsWith('|')) {
      const cells = trimmed
        .split('|')
        .map((c) => c.trim())
        .filter((c) => c !== '');
      if (cells.length >= 3) {
        entries.push({
          date: cells[0],
          action: cells[1],
          details: cells[2],
        });
      }
    }
  }

  return entries;
}

/**
 * Append a row to the Refinement History markdown table.
 * @param content - Raw LONG-TERM-ROADMAP.md content
 * @param action - Action description
 * @param details - Details of what was changed
 * @returns Updated content string
 */
function updateRefinementHistory(content: string, action: string, details: string): string {
  const sectionMatch = content.match(/^##\s+Refinement History/m);
  if (!sectionMatch || sectionMatch.index === undefined) return content;

  const today = new Date().toISOString().split('T')[0];
  const newRow = `| ${today} | ${action} | ${details} |`;

  const afterSection = content.slice(sectionMatch.index);
  const lines = afterSection.split('\n');

  let lastTableLineIdx = -1;
  let inTable = false;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (i > 0 && trimmed.startsWith('#')) break;
    if (trimmed.startsWith('|')) {
      inTable = true;
      lastTableLineIdx = i;
    } else if (inTable && trimmed === '') {
      break;
    }
  }

  if (lastTableLineIdx === -1) return content;

  const beforeSection = content.slice(0, sectionMatch.index);
  lines.splice(lastTableLineIdx + 1, 0, newRow);

  return beforeSection + lines.join('\n');
}

// ─── Normal Milestone List Parsing ───────────────────────────────────────────

/**
 * Parse comma-separated normal milestone list from field text.
 * e.g. "v0.0.5, v0.2.0 (planned)" -> [{ version: 'v0.0.5' }, { version: 'v0.2.0', note: 'planned' }]
 * Also handles "(none yet)" -> []
 * @param fieldText - The field text after "Normal milestones:"
 * @returns Array of { version, note? } objects
 */
function parseNormalMilestoneList(
  fieldText: string | null | undefined
): NormalMilestoneEntry[] {
  if (!fieldText || fieldText.trim() === '' || /\(none\s*yet\)/i.test(fieldText)) return [];

  return fieldText
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '')
    .map((s): NormalMilestoneEntry => {
      const noteMatch = s.match(/^(v[\d.]+)\s*\(([^)]+)\)$/);
      if (noteMatch) {
        return { version: noteMatch[1], note: noteMatch[2] };
      }
      const versionMatch = s.match(/^(v[\d.]+)$/);
      if (versionMatch) {
        return { version: versionMatch[1] };
      }
      return { version: s };
    });
}

/**
 * Format normal milestone list back to string.
 * @param milestones - Array of { version, note? }
 * @returns Formatted string
 */
function formatNormalMilestoneList(
  milestones: NormalMilestoneEntry[] | null | undefined
): string {
  if (!milestones || milestones.length === 0) return '(none yet)';
  return milestones.map((m) => (m.note ? `${m.version} (${m.note})` : m.version)).join(', ');
}

// ─── LT Milestone Parsing ────────────────────────────────────────────────────

/**
 * Parse a single ## LT-N: section into a structured object.
 * @param sectionText - Text of the section (after the ## heading)
 * @param id - The LT id (e.g., 'LT-1')
 * @param name - The name from the heading
 * @returns Parsed LT milestone
 */
function parseLtMilestone(sectionText: string, id: string, name: string): LtMilestone {
  const status = extractBoldField(sectionText, 'Status') || 'planned';
  const goal = extractBoldField(sectionText, 'Goal') || '';
  const normalField = extractBoldField(sectionText, 'Normal milestones');
  const normal_milestones = parseNormalMilestoneList(normalField);

  return {
    id,
    name,
    status,
    goal,
    normal_milestones,
  };
}

/**
 * Parse LONG-TERM-ROADMAP.md content into structured object (flat format).
 * @param content - Raw markdown content
 * @returns Parsed roadmap with frontmatter, milestones[], refinement_history[]
 */
function parseLongTermRoadmap(content: unknown): LongTermRoadmap | null {
  if (!content || typeof content !== 'string') return null;

  const frontmatter = extractFrontmatter(content);

  // Match all ## LT-N: headings
  const ltPattern = /^##\s+(LT-(\d+)):\s*(.+)/gm;
  const milestones: LtMilestone[] = [];
  const matches: Array<{
    id: string;
    num: number;
    name: string;
    index: number;
    fullMatch: string;
  }> = [];
  let match: RegExpExecArray | null;

  while ((match = ltPattern.exec(content)) !== null) {
    matches.push({
      id: match[1],
      num: parseInt(match[2], 10),
      name: match[3].trim(),
      index: match.index,
      fullMatch: match[0],
    });
  }

  if (matches.length === 0 && Object.keys(frontmatter).length === 0) return null;

  for (let i = 0; i < matches.length; i++) {
    const startIdx = matches[i].index + matches[i].fullMatch.length;
    // Find next ## heading (any ## heading, not just LT-)
    const rest = content.slice(startIdx);
    const nextH2 = rest.match(/^##\s/m);
    const endIdx = nextH2 && nextH2.index !== undefined ? startIdx + nextH2.index : content.length;

    const sectionText = content.slice(startIdx, endIdx).trim();
    milestones.push(parseLtMilestone(sectionText, matches[i].id, matches[i].name));
  }

  const refinement_history = parseRefinementHistory(content);

  return {
    frontmatter,
    milestones,
    refinement_history,
  };
}

// ─── Validation ──────────────────────────────────────────────────────────────

const VALID_STATUSES: string[] = ['completed', 'active', 'planned'];

/**
 * Validate a parsed long-term roadmap object.
 * @param parsed - Parsed roadmap from parseLongTermRoadmap
 * @returns Validation result with errors and warnings
 */
function validateLongTermRoadmap(parsed: LongTermRoadmap | null): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!parsed) {
    return { valid: false, errors: ['Parsed roadmap is null or undefined'], warnings: [] };
  }

  if (!parsed.frontmatter || !parsed.frontmatter.project) {
    errors.push('Missing required frontmatter field: project');
  }

  if (!parsed.milestones || parsed.milestones.length === 0) {
    errors.push('No LT milestones found');
  } else {
    const ids = new Set<string>();
    let activeCount = 0;

    for (const ms of parsed.milestones) {
      // Duplicate ID check
      if (ids.has(ms.id)) {
        errors.push(`Duplicate milestone ID: ${ms.id}`);
      }
      ids.add(ms.id);

      // Goal required
      if (!ms.goal || ms.goal.trim() === '') {
        errors.push(`${ms.id} (${ms.name}) is missing goal`);
      }

      // Valid status
      if (!VALID_STATUSES.includes(ms.status)) {
        errors.push(
          `${ms.id} has invalid status: ${ms.status}. Valid: ${VALID_STATUSES.join(', ')}`
        );
      }

      if (ms.status === 'active') activeCount++;
    }

    if (activeCount > 1) {
      warnings.push(
        `Multiple active LT milestones (${activeCount}). Consider having only one active.`
      );
    }

    if (activeCount === 0 && parsed.milestones.some((m) => m.status !== 'completed')) {
      warnings.push('No active LT milestone found');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ─── Generation ──────────────────────────────────────────────────────────────

/**
 * Generate LONG-TERM-ROADMAP.md content from structured milestone data.
 * @param milestones - Array of LT milestones
 * @param projectName - Project name for frontmatter
 * @returns Complete LONG-TERM-ROADMAP.md content
 */
function generateLongTermRoadmap(milestones: LtMilestone[], projectName: string): string {
  const today = new Date().toISOString().split('T')[0];
  const lines: string[] = [];

  lines.push('---');
  lines.push(`project: ${projectName}`);
  lines.push(`created: ${today}`);
  lines.push(`last_refined: ${today}`);
  lines.push('---');
  lines.push('');
  lines.push(`# Long-Term Roadmap: ${projectName}`);
  lines.push('');

  for (const ms of milestones) {
    lines.push(`## ${ms.id}: ${ms.name}`);
    lines.push(`**Status:** ${ms.status}`);
    lines.push(`**Goal:** ${ms.goal}`);
    lines.push(`**Normal milestones:** ${formatNormalMilestoneList(ms.normal_milestones)}`);
    lines.push('');
  }

  lines.push('## Refinement History');
  lines.push('');
  lines.push('| Date | Action | Details |');
  lines.push('|------|--------|---------|');
  lines.push(`| ${today} | Initial roadmap | Created ${milestones.length} LT milestones |`);
  lines.push('');

  return lines.join('\n');
}

// ─── Display Formatting ─────────────────────────────────────────────────────

/**
 * Format parsed long-term roadmap for human-readable display.
 * @param parsed - Parsed roadmap from parseLongTermRoadmap
 * @returns Formatted display string
 */
function formatLongTermRoadmap(parsed: LongTermRoadmap | null): string {
  if (!parsed) return '';

  const lines: string[] = [];
  const project =
    (parsed.frontmatter?.project as string | undefined) || 'Unknown Project';

  lines.push(`Long-Term Roadmap: ${project}`);
  lines.push('');

  if (parsed.milestones && parsed.milestones.length > 0) {
    for (const ms of parsed.milestones) {
      const icon =
        ms.status === 'completed' ? '[done]' : ms.status === 'active' ? '[active]' : '[planned]';
      const normalList = formatNormalMilestoneList(ms.normal_milestones);
      lines.push(`${icon}  ${ms.id}: ${ms.name}`);
      lines.push(`       ${ms.goal}`);
      lines.push(`       Normal milestones: ${normalList}`);
      lines.push('');
    }
  }

  return lines.join('\n');
}

// ─── Shipped Version Detection ───────────────────────────────────────────────

/**
 * Extract shipped versions from ROADMAP.md content.
 * Looks for `(shipped YYYY-MM-DD)` pattern in milestone bullet list.
 * @param roadmapContent - Raw ROADMAP.md content
 * @returns Array of shipped version strings
 */
function extractShippedVersions(roadmapContent: string | null | undefined): string[] {
  if (!roadmapContent) return [];

  const versions: string[] = [];
  const pattern = /^-\s+(v[\d.]+)\b.*\(shipped\s+\d{4}-\d{2}-\d{2}\)/gm;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(roadmapContent)) !== null) {
    versions.push(match[1]);
  }
  return versions;
}

// ─── ID Helpers ──────────────────────────────────────────────────────────────

/**
 * Compute the next LT-N id from parsed roadmap.
 * @param parsed - Parsed roadmap (or null)
 * @returns Next LT id (e.g., 'LT-3')
 */
function nextLtId(parsed: LongTermRoadmap | null | undefined): string {
  if (!parsed || !parsed.milestones || parsed.milestones.length === 0) return 'LT-1';

  const maxNum = Math.max(
    ...parsed.milestones.map((m) => {
      const numMatch = m.id.match(/LT-(\d+)/);
      return numMatch ? parseInt(numMatch[1], 10) : 0;
    })
  );
  return `LT-${maxNum + 1}`;
}

// ─── CRUD Operations ─────────────────────────────────────────────────────────

/**
 * Append a new LT milestone before the Refinement History section.
 * @param content - Raw LONG-TERM-ROADMAP.md content
 * @param name - LT milestone name
 * @param goal - LT milestone goal
 * @returns Updated content and new ID
 */
function addLtMilestone(
  content: string,
  name: string,
  goal: string
): AddLtMilestoneResult {
  const parsed = parseLongTermRoadmap(content);
  const id = nextLtId(parsed);

  const newSection = [
    `## ${id}: ${name}`,
    `**Status:** planned`,
    `**Goal:** ${goal}`,
    `**Normal milestones:** (none yet)`,
    '',
  ].join('\n');

  // Insert before Refinement History
  const historyMatch = content.match(/^##\s+Refinement History/m);
  if (historyMatch && historyMatch.index !== undefined) {
    const before = content.slice(0, historyMatch.index);
    const after = content.slice(historyMatch.index);
    return { content: before + newSection + '\n' + after, id };
  }

  // No history section, append at end
  return { content: content.trimEnd() + '\n\n' + newSection + '\n', id };
}

/**
 * Remove an LT milestone section. Protected: refuses if any linked normal milestone is shipped.
 * @param content - Raw LONG-TERM-ROADMAP.md content
 * @param id - LT milestone ID (e.g., 'LT-2')
 * @param roadmapContent - Optional ROADMAP.md content for shipped detection
 * @returns Updated content, or { error } if protected
 */
function removeLtMilestone(
  content: string,
  id: string,
  roadmapContent?: string
): string | ErrorResult {
  const parsed = parseLongTermRoadmap(content);
  if (!parsed) return { error: 'Could not parse LONG-TERM-ROADMAP.md' };

  const ms = parsed.milestones.find((m) => m.id === id);
  if (!ms) return { error: `${id} not found` };

  // Protection: check if any linked normal milestones are shipped
  if (roadmapContent && ms.normal_milestones.length > 0) {
    const shipped = extractShippedVersions(roadmapContent);
    const shippedLinked = ms.normal_milestones.filter((m) => shipped.includes(m.version));
    if (shippedLinked.length > 0) {
      return {
        error: `Cannot remove ${id}: linked milestone(s) ${shippedLinked.map((m) => m.version).join(', ')} already shipped`,
      };
    }
  }

  // Also refuse if status is completed
  if (ms.status === 'completed') {
    return { error: `Cannot remove ${id}: status is completed` };
  }

  // Find and remove the section
  const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const sectionPattern = new RegExp(`^##\\s+${escapedId}:\\s*[^\\n]+`, 'm');
  const sectionMatch = content.match(sectionPattern);
  if (!sectionMatch || sectionMatch.index === undefined) {
    return { error: `${id} section not found in content` };
  }

  const startIdx = sectionMatch.index;
  const afterHeading = content.slice(startIdx + sectionMatch[0].length);
  const nextH2 = afterHeading.match(/^##\s/m);
  const endIdx =
    nextH2 && nextH2.index !== undefined
      ? startIdx + sectionMatch[0].length + nextH2.index
      : content.length;

  const result = content.slice(0, startIdx) + content.slice(endIdx);
  return result;
}

/**
 * Update fields of an LT milestone in-place.
 * @param content - Raw LONG-TERM-ROADMAP.md content
 * @param id - LT milestone ID
 * @param updates - Fields to update: name, goal, status
 * @returns Updated content, or { error }
 */
function updateLtMilestone(
  content: string,
  id: string,
  updates: Partial<Pick<LtMilestone, 'name' | 'goal' | 'status'>>
): string | ErrorResult {
  const parsed = parseLongTermRoadmap(content);
  if (!parsed) return { error: 'Could not parse LONG-TERM-ROADMAP.md' };

  const ms = parsed.milestones.find((m) => m.id === id);
  if (!ms) return { error: `${id} not found` };

  if (updates.status && !VALID_STATUSES.includes(updates.status)) {
    return { error: `Invalid status: ${updates.status}. Valid: ${VALID_STATUSES.join(', ')}` };
  }

  let result = content;

  // Update heading name
  if (updates.name) {
    const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const headingPattern = new RegExp(`^(##\\s+${escapedId}:\\s*)(.+)$`, 'm');
    result = result.replace(headingPattern, `$1${updates.name}`);
  }

  // Update status
  if (updates.status) {
    // Find this milestone's section and update status within it
    const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const sectionStart = result.match(new RegExp(`^##\\s+${escapedId}:`, 'm'));
    if (sectionStart && sectionStart.index !== undefined) {
      const afterSection = result.slice(sectionStart.index);
      const nextH2 = afterSection.match(/\n##\s/);
      const sectionEnd =
        nextH2 && nextH2.index !== undefined
          ? sectionStart.index + nextH2.index
          : result.length;
      const section = result.slice(sectionStart.index, sectionEnd);
      const updatedSection = section.replace(
        /\*\*Status:\*\*\s*.+/,
        `**Status:** ${updates.status}`
      );
      result = result.slice(0, sectionStart.index) + updatedSection + result.slice(sectionEnd);
    }
  }

  // Update goal
  if (updates.goal) {
    const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const sectionStart = result.match(new RegExp(`^##\\s+${escapedId}:`, 'm'));
    if (sectionStart && sectionStart.index !== undefined) {
      const afterSection = result.slice(sectionStart.index);
      const nextH2 = afterSection.match(/\n##\s/);
      const sectionEnd =
        nextH2 && nextH2.index !== undefined
          ? sectionStart.index + nextH2.index
          : result.length;
      const section = result.slice(sectionStart.index, sectionEnd);
      const updatedSection = section.replace(/\*\*Goal:\*\*\s*.+/, `**Goal:** ${updates.goal}`);
      result = result.slice(0, sectionStart.index) + updatedSection + result.slice(sectionEnd);
    }
  }

  return result;
}

/**
 * Link a normal milestone version to an LT milestone.
 * @param content - Raw LONG-TERM-ROADMAP.md content
 * @param id - LT milestone ID
 * @param version - Normal milestone version (e.g., 'v0.2.0')
 * @param note - Optional note (e.g., 'planned')
 * @returns Updated content, or { error }
 */
function linkNormalMilestone(
  content: string,
  id: string,
  version: string,
  note?: string
): string | ErrorResult {
  const parsed = parseLongTermRoadmap(content);
  if (!parsed) return { error: 'Could not parse LONG-TERM-ROADMAP.md' };

  const ms = parsed.milestones.find((m) => m.id === id);
  if (!ms) return { error: `${id} not found` };

  // Check if already linked
  if (ms.normal_milestones.some((m) => m.version === version)) {
    return { error: `${version} is already linked to ${id}` };
  }

  const newEntry: NormalMilestoneEntry = note ? { version, note } : { version };
  const updatedList = [...ms.normal_milestones, newEntry];
  const newField = formatNormalMilestoneList(updatedList);

  // Replace the Normal milestones field in this section
  return replaceFieldInSection(content, id, 'Normal milestones', newField);
}

/**
 * Unlink a normal milestone version from an LT milestone.
 * Protected: refuses if the normal milestone is shipped.
 * @param content - Raw LONG-TERM-ROADMAP.md content
 * @param id - LT milestone ID
 * @param version - Normal milestone version
 * @param roadmapContent - Optional ROADMAP.md for shipped detection
 * @returns Updated content, or { error }
 */
function unlinkNormalMilestone(
  content: string,
  id: string,
  version: string,
  roadmapContent?: string
): string | ErrorResult {
  const parsed = parseLongTermRoadmap(content);
  if (!parsed) return { error: 'Could not parse LONG-TERM-ROADMAP.md' };

  const ms = parsed.milestones.find((m) => m.id === id);
  if (!ms) return { error: `${id} not found` };

  if (!ms.normal_milestones.some((m) => m.version === version)) {
    return { error: `${version} is not linked to ${id}` };
  }

  // Protection: check if shipped
  if (roadmapContent) {
    const shipped = extractShippedVersions(roadmapContent);
    if (shipped.includes(version)) {
      return { error: `Cannot unlink ${version} from ${id}: milestone is already shipped` };
    }
  }

  const updatedList = ms.normal_milestones.filter((m) => m.version !== version);
  const newField = formatNormalMilestoneList(updatedList);

  return replaceFieldInSection(content, id, 'Normal milestones', newField);
}

/**
 * Find an LT milestone by ID.
 * @param content - Raw LONG-TERM-ROADMAP.md content
 * @param id - LT milestone ID
 * @returns Parsed milestone, or null
 */
function getLtMilestoneById(content: string, id: string): LtMilestone | null {
  const parsed = parseLongTermRoadmap(content);
  if (!parsed) return null;
  return parsed.milestones.find((m) => m.id === id) || null;
}

/**
 * Auto-group existing ROADMAP.md milestones into a single LT-1 milestone.
 * All shipped + active milestones go into LT-1.
 * @param roadmapContent - Raw ROADMAP.md content
 * @param projectName - Project name
 * @returns Generated LONG-TERM-ROADMAP.md content
 */
function initFromRoadmap(roadmapContent: string, projectName: string): string {
  const shipped = extractShippedVersions(roadmapContent);

  // Also find non-shipped milestones from the bullet list
  const allVersions: string[] = [];
  const bulletPattern = /^-\s+(v[\d.]+)\b/gm;
  let match: RegExpExecArray | null;
  while ((match = bulletPattern.exec(roadmapContent)) !== null) {
    allVersions.push(match[1]);
  }

  const normalMilestones: NormalMilestoneEntry[] = allVersions.map((v) => {
    if (shipped.includes(v)) {
      return { version: v };
    }
    return { version: v, note: 'planned' };
  });

  const hasShipped = shipped.length > 0;
  const status = hasShipped ? 'active' : 'planned';

  const milestones: LtMilestone[] = [
    {
      id: 'LT-1',
      name: 'Initial Milestone Group',
      status,
      goal: 'Auto-grouped from existing ROADMAP.md milestones',
      normal_milestones: normalMilestones,
    },
  ];

  return generateLongTermRoadmap(milestones, projectName);
}

// ─── Internal Helpers ────────────────────────────────────────────────────────

/**
 * Replace a bold field value within a specific LT milestone section.
 * @param content - Full LONG-TERM-ROADMAP.md content
 * @param id - LT milestone ID
 * @param fieldName - Bold field name
 * @param newValue - New field value
 * @returns Updated content
 */
function replaceFieldInSection(
  content: string,
  id: string,
  fieldName: string,
  newValue: string
): string {
  const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const sectionStart = content.match(new RegExp(`^##\\s+${escapedId}:`, 'm'));
  if (!sectionStart || sectionStart.index === undefined) return content;

  const afterSection = content.slice(sectionStart.index);
  const nextH2 = afterSection.match(/\n##\s/);
  const sectionEnd =
    nextH2 && nextH2.index !== undefined
      ? sectionStart.index + nextH2.index
      : content.length;

  const section = content.slice(sectionStart.index, sectionEnd);
  const fieldPattern = new RegExp(`\\*\\*${fieldName}:\\*\\*\\s*.+`);
  const updatedSection = section.replace(fieldPattern, `**${fieldName}:** ${newValue}`);

  return content.slice(0, sectionStart.index) + updatedSection + content.slice(sectionEnd);
}

module.exports = {
  updateRefinementHistory,
  parseNormalMilestoneList,
  formatNormalMilestoneList,
  parseLtMilestone,
  parseLongTermRoadmap,
  validateLongTermRoadmap,
  generateLongTermRoadmap,
  formatLongTermRoadmap,
  extractShippedVersions,
  nextLtId,
  addLtMilestone,
  removeLtMilestone,
  updateLtMilestone,
  linkNormalMilestone,
  unlinkNormalMilestone,
  getLtMilestoneById,
  initFromRoadmap,
};
