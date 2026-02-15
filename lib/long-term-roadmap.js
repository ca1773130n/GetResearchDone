/**
 * GRD Long-Term Roadmap Operations — LONG-TERM-ROADMAP.md parsing, validation,
 * generation, display formatting, and planning mode detection.
 *
 * Implements the Now-Next-Later hierarchical roadmap schema from
 * .planning/research/hierarchical-roadmap.md.
 *
 * Depends on: lib/utils.js (safeReadFile)
 * Depends on: lib/frontmatter.js (extractFrontmatter)
 */

const fs = require('fs');
const path = require('path');
const { safeReadFile } = require('./utils');
const { extractFrontmatter } = require('./frontmatter');

// ─── Section Parsing Helpers ─────────────────────────────────────────────────

/**
 * Extract text between two section headings at a given level.
 * @param {string} content - Full markdown content
 * @param {RegExp} startPattern - Regex to match the start heading
 * @param {number} headingLevel - The heading level (number of # characters)
 * @returns {string|null} Section text between start and next same-level heading, or null
 */
function extractSection(content, startPattern, headingLevel) {
  const match = content.match(startPattern);
  if (!match) return null;

  const startIdx = match.index + match[0].length;
  const rest = content.slice(startIdx);

  // Find next heading at same or higher level
  const nextHeadingPattern = new RegExp(`^#{1,${headingLevel}}\\s`, 'm');
  const nextMatch = rest.match(nextHeadingPattern);
  const endIdx = nextMatch ? nextMatch.index : rest.length;

  return rest.slice(0, endIdx).trim();
}

/**
 * Extract a bold field value from text.
 * @param {string} text - Section text to search
 * @param {string} fieldName - Bold field name (e.g., 'Status', 'Milestone')
 * @returns {string|null} The field value, or null if not found
 */
function extractBoldField(text, fieldName) {
  const pattern = new RegExp(`\\*\\*${fieldName}:\\*\\*\\s*(.+)`, 'i');
  const match = text.match(pattern);
  return match ? match[1].trim() : null;
}

/**
 * Extract bullet list items following a heading.
 * @param {string} text - Section text to search
 * @param {string|RegExp} heading - Heading to find list after
 * @returns {string[]} Array of bullet item text
 */
function extractBulletList(text, heading) {
  const headingPattern =
    typeof heading === 'string'
      ? new RegExp(`^#{2,4}\\s+${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'm')
      : heading;

  const match = text.match(headingPattern);
  if (!match) return [];

  const afterHeading = text.slice(match.index + match[0].length);
  const items = [];
  const lines = afterHeading.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('- ')) {
      items.push(trimmed.slice(2).trim());
    } else if (trimmed.startsWith('#') || (trimmed.startsWith('**') && trimmed.includes(':**'))) {
      // Hit next section
      break;
    }
    // Skip blank lines and other content
  }

  return items;
}

/**
 * Extract numbered list items following a heading.
 * @param {string} text - Section text
 * @param {string} heading - Heading to find list after
 * @returns {string[]} Array of numbered item text
 */
function extractNumberedList(text, heading) {
  const headingPattern = new RegExp(
    `^#{2,4}\\s+${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
    'm'
  );
  const match = text.match(headingPattern);
  if (!match) return [];

  const afterHeading = text.slice(match.index + match[0].length);
  const items = [];
  const lines = afterHeading.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    const numMatch = trimmed.match(/^\d+\.\s+(.+)/);
    if (numMatch) {
      items.push(numMatch[1].trim());
    } else if (trimmed.startsWith('#') || (trimmed.startsWith('**') && trimmed.includes(':**'))) {
      break;
    }
  }

  return items;
}

/**
 * Extract paragraph text following a heading (first non-empty paragraph).
 * @param {string} text - Section text
 * @param {string} heading - Heading to find text after
 * @returns {string|null} Paragraph text, or null
 */
function extractParagraph(text, heading) {
  const headingPattern = new RegExp(
    `^#{2,4}\\s+${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
    'm'
  );
  const match = text.match(headingPattern);
  if (!match) return null;

  const afterHeading = text.slice(match.index + match[0].length);
  const lines = afterHeading.split('\n');
  const paragraphLines = [];

  let started = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!started && trimmed === '') continue;
    if (trimmed.startsWith('#') || trimmed.startsWith('---')) break;
    if (trimmed.startsWith('- ') && started) break;
    if (trimmed !== '') {
      started = true;
      paragraphLines.push(trimmed);
    } else if (started) {
      break;
    }
  }

  return paragraphLines.length > 0 ? paragraphLines.join(' ') : null;
}

/**
 * Extract version pattern from a string.
 * @param {string} text - Text to search for version
 * @returns {string|null} Version string (e.g., 'v0.1.0'), or null
 */
function extractVersion(text) {
  const match = text.match(/v\d+\.\d+(?:\.\d+)?/);
  return match ? match[0] : null;
}

// ─── Now Milestone Parsing ───────────────────────────────────────────────────

/**
 * Parse the Now milestone from its section text.
 * @param {string} sectionText - Text of the Now section
 * @returns {Object|null} Parsed Now milestone object
 */
function parseNowMilestone(sectionText) {
  if (!sectionText || sectionText.trim() === '') return null;

  const milestoneField = extractBoldField(sectionText, 'Milestone');
  if (!milestoneField) return null;

  const version = extractVersion(milestoneField);
  const status = extractBoldField(sectionText, 'Status');
  const start = extractBoldField(sectionText, 'Start');
  const target = extractBoldField(sectionText, 'Target');
  const goal = extractParagraph(sectionText, 'Goal');
  const success_criteria = extractBulletList(sectionText, 'Success Criteria');
  const open_questions = extractBulletList(sectionText, 'Open Questions');

  return {
    milestone: milestoneField,
    version,
    status,
    start,
    target,
    goal,
    success_criteria,
    open_questions,
  };
}

// ─── Next/Later Milestone Parsing ────────────────────────────────────────────

/**
 * Parse individual milestones from a tier section (Next or Later).
 * @param {string} sectionText - Text of the tier section
 * @param {string} tier - 'next' or 'later'
 * @returns {Object[]} Array of parsed milestone objects
 */
function parseTierMilestones(sectionText, tier) {
  if (!sectionText || sectionText.trim() === '') return [];

  // Split by ### headings (individual milestones)
  const milestonePattern = /^###\s+(.+)/gm;
  const milestoneMatches = [];
  let match;

  while ((match = milestonePattern.exec(sectionText)) !== null) {
    milestoneMatches.push({ heading: match[1].trim(), index: match.index });
  }

  if (milestoneMatches.length === 0) return [];

  const milestones = [];

  for (let i = 0; i < milestoneMatches.length; i++) {
    const start = milestoneMatches[i].index;
    const end =
      i < milestoneMatches.length - 1 ? milestoneMatches[i + 1].index : sectionText.length;
    const milestoneText = sectionText.slice(start, end);
    const heading = milestoneMatches[i].heading;
    const version = extractVersion(heading);

    // Extract the milestone name from heading (after version)
    const nameMatch = heading.match(/v\d+\.\d+(?:\.\d+)?\s*-\s*(.+)/);
    const name = nameMatch ? nameMatch[1].trim() : heading;

    const status = extractBoldField(milestoneText, 'Status');
    const dependencies = extractBoldField(milestoneText, 'Dependencies');
    const goal = extractParagraph(milestoneText, 'Goal');
    const success_criteria = extractBulletList(milestoneText, 'Success Criteria');

    if (tier === 'next') {
      const estimated_start = extractBoldField(milestoneText, 'Estimated Start');
      const estimated_duration = extractBoldField(milestoneText, 'Estimated Duration');
      const rough_phase_sketch = extractNumberedList(milestoneText, 'Rough Phase Sketch');
      const open_questions = extractBulletList(milestoneText, 'Open Questions');

      milestones.push({
        milestone: `${version} - ${name}`,
        version,
        status,
        estimated_start,
        estimated_duration,
        dependencies,
        goal,
        success_criteria,
        rough_phase_sketch,
        open_questions,
      });
    } else {
      // Later tier
      const estimated_timeline = extractBoldField(milestoneText, 'Estimated Timeline');
      const open_research_questions = extractBulletList(
        milestoneText,
        'Open Research Questions'
      );

      milestones.push({
        milestone: `${version} - ${name}`,
        version,
        status,
        estimated_timeline,
        dependencies,
        goal,
        success_criteria,
        open_research_questions,
      });
    }
  }

  return milestones;
}

// ─── Refinement History Parsing ──────────────────────────────────────────────

/**
 * Parse the refinement history table from content.
 * @param {string} content - Full markdown content
 * @returns {Object[]} Array of { date, action, details } objects
 */
function parseRefinementHistory(content) {
  const sectionMatch = content.match(/^##\s+Refinement History/m);
  if (!sectionMatch) return [];

  const afterHeading = content.slice(sectionMatch.index + sectionMatch[0].length);

  // Find the table rows (skip header and separator)
  const lines = afterHeading.split('\n');
  const entries = [];
  let pastHeader = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#')) break;
    if (trimmed.startsWith('|') && trimmed.includes('Date') && trimmed.includes('Action')) {
      continue; // Header row
    }
    if (trimmed.match(/^\|[\s-|]+\|$/)) {
      pastHeader = true;
      continue; // Separator row
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

// ─── Core Functions ──────────────────────────────────────────────────────────

/**
 * Parse LONG-TERM-ROADMAP.md content into structured object.
 * @param {string} content - Raw markdown content of LONG-TERM-ROADMAP.md
 * @returns {Object|null} Parsed roadmap with frontmatter, now, next, later, refinement_history
 */
function parseLongTermRoadmap(content) {
  if (!content || typeof content !== 'string') return null;

  const frontmatter = extractFrontmatter(content);

  // Check if this looks like a long-term roadmap
  const hasNowSection = /^##\s+Current Milestone\s*\(Now\)/m.test(content);
  if (!hasNowSection && Object.keys(frontmatter).length === 0) return null;

  // Extract Now section
  const nowSection = extractSection(content, /^##\s+Current Milestone\s*\(Now\)/m, 2);
  const now = nowSection ? parseNowMilestone(nowSection) : null;

  // If no now section and no frontmatter, not a roadmap
  if (!now && Object.keys(frontmatter).length === 0) return null;

  // Extract Next section
  const nextSection = extractSection(content, /^##\s+Next Milestones/m, 2);
  const next = nextSection ? parseTierMilestones(nextSection, 'next') : [];

  // Extract Later section
  const laterSection = extractSection(content, /^##\s+Later Milestones/m, 2);
  const later = laterSection ? parseTierMilestones(laterSection, 'later') : [];

  // Extract refinement history
  const refinement_history = parseRefinementHistory(content);

  return {
    frontmatter,
    now,
    next,
    later,
    refinement_history,
  };
}

/**
 * Validate a parsed long-term roadmap object against the schema.
 * @param {Object} parsed - Parsed roadmap object from parseLongTermRoadmap
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }} Validation result
 */
function validateLongTermRoadmap(parsed) {
  const errors = [];
  const warnings = [];

  if (!parsed) {
    return { valid: false, errors: ['Parsed roadmap is null or undefined'], warnings: [] };
  }

  // Check frontmatter
  if (!parsed.frontmatter || !parsed.frontmatter.project) {
    errors.push('Missing required frontmatter field: project');
  }

  // Check Now milestone
  if (!parsed.now) {
    errors.push('Missing Now milestone (current milestone is required)');
  } else {
    if (!parsed.now.goal) {
      errors.push('Now milestone is missing goal');
    }
    if (!parsed.now.milestone) {
      errors.push('Now milestone is missing milestone name');
    }
  }

  // Check Next milestones
  if (parsed.next && parsed.next.length > 0) {
    for (let i = 0; i < parsed.next.length; i++) {
      const ms = parsed.next[i];
      if (!ms.goal) {
        errors.push(`Next milestone ${i + 1} (${ms.version || 'unknown'}) is missing goal`);
      }
    }
  }

  // Check Later milestones
  if (parsed.later && parsed.later.length > 0) {
    for (let i = 0; i < parsed.later.length; i++) {
      const ms = parsed.later[i];
      if (!ms.goal) {
        errors.push(`Later milestone ${i + 1} (${ms.version || 'unknown'}) is missing goal`);
      }
      if (
        !ms.success_criteria ||
        !Array.isArray(ms.success_criteria) ||
        ms.success_criteria.length === 0
      ) {
        warnings.push(
          `Later milestone ${ms.version || i + 1} is missing success criteria (optional for Later tier)`
        );
      }
    }
  }

  // Soft limit: warn if more than 5 milestones in Next+Later
  const totalFuture =
    (parsed.next ? parsed.next.length : 0) + (parsed.later ? parsed.later.length : 0);
  if (totalFuture > 5) {
    warnings.push(
      `Total Next+Later milestone count (${totalFuture}) exceeds recommended limit of 5`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Detect planning mode from filesystem.
 * Returns 'hierarchical' when LONG-TERM-ROADMAP.md exists (and does not
 * explicitly set roadmap_type to 'progressive'), 'progressive' otherwise.
 * @param {string} cwd - Project working directory
 * @returns {'hierarchical'|'progressive'} Planning mode
 */
function getPlanningMode(cwd) {
  const roadmapPath = path.join(cwd, '.planning', 'LONG-TERM-ROADMAP.md');
  const content = safeReadFile(roadmapPath);

  if (!content) return 'progressive';

  const frontmatter = extractFrontmatter(content);
  if (frontmatter.roadmap_type === 'progressive') return 'progressive';

  return 'hierarchical';
}

/**
 * Generate LONG-TERM-ROADMAP.md content from structured milestone data.
 *
 * milestones[0] = Now milestone (detailed)
 * milestones[1..N-1] where status='Next' = Next milestones
 * remaining = Later milestones
 *
 * @param {Object[]} milestones - Array of milestone objects
 * @param {string} projectName - Project name for frontmatter
 * @param {string} [planningHorizon='6 months'] - Planning horizon description
 * @returns {string} Complete LONG-TERM-ROADMAP.md content
 */
function generateLongTermRoadmap(milestones, projectName, planningHorizon) {
  const horizon = planningHorizon || '6 months';
  const today = new Date().toISOString().split('T')[0];
  const lines = [];

  // YAML frontmatter
  lines.push('---');
  lines.push(`project: ${projectName}`);
  lines.push('roadmap_type: hierarchical');
  lines.push(`created: ${today}`);
  lines.push(`last_refined: ${today}`);
  lines.push(`planning_horizon: ${horizon}`);
  lines.push('---');
  lines.push('');
  lines.push(`# Long-Term Roadmap: ${projectName}`);
  lines.push('');

  // Categorize milestones
  const nowMs = milestones[0];
  const nextMs = milestones.filter(
    (m, i) => i > 0 && (m.status === 'Next' || (i <= 2 && m.status !== 'Later'))
  );
  const laterMs = milestones.filter(
    (m, i) => i > 0 && !nextMs.includes(m)
  );

  // Now section
  if (nowMs) {
    lines.push('## Current Milestone (Now)');
    lines.push('');
    lines.push(`**Milestone:** ${nowMs.version} - ${nowMs.name}`);
    lines.push(`**Status:** ${nowMs.status || 'In Progress'}`);
    if (nowMs.start) lines.push(`**Start:** ${nowMs.start}`);
    if (nowMs.target) lines.push(`**Target:** ${nowMs.target}`);
    lines.push('');
    lines.push('### Goal');
    lines.push(nowMs.goal || 'TBD');
    lines.push('');
    if (nowMs.success_criteria && nowMs.success_criteria.length > 0) {
      lines.push('### Success Criteria');
      for (const criterion of nowMs.success_criteria) {
        lines.push(`- ${criterion}`);
      }
      lines.push('');
    }
    lines.push('---');
    lines.push('');
  }

  // Next section
  lines.push('## Next Milestones');
  lines.push('');

  if (nextMs.length > 0) {
    for (const ms of nextMs) {
      lines.push(`### ${ms.version} - ${ms.name}`);
      lines.push('');
      lines.push(`**Status:** ${ms.status || 'Next'}`);
      if (ms.estimated_start) lines.push(`**Estimated Start:** ${ms.estimated_start}`);
      if (ms.estimated_duration) lines.push(`**Estimated Duration:** ${ms.estimated_duration}`);
      if (ms.dependencies) lines.push(`**Dependencies:** ${ms.dependencies}`);
      lines.push('');
      lines.push('#### Goal');
      lines.push(ms.goal || 'TBD');
      lines.push('');
      if (ms.success_criteria && ms.success_criteria.length > 0) {
        lines.push('#### Success Criteria');
        for (const criterion of ms.success_criteria) {
          lines.push(`- ${criterion}`);
        }
        lines.push('');
      }
      if (ms.rough_phase_sketch && ms.rough_phase_sketch.length > 0) {
        lines.push('#### Rough Phase Sketch');
        ms.rough_phase_sketch.forEach((phase, idx) => {
          lines.push(`${idx + 1}. ${phase}`);
        });
        lines.push('');
      }
      if (ms.open_questions && ms.open_questions.length > 0) {
        lines.push('#### Open Questions');
        for (const q of ms.open_questions) {
          lines.push(`- ${q}`);
        }
        lines.push('');
      }
      lines.push('---');
      lines.push('');
    }
  }

  // Later section
  lines.push('## Later Milestones');
  lines.push('');

  if (laterMs.length > 0) {
    for (const ms of laterMs) {
      lines.push(`### ${ms.version} - ${ms.name}`);
      lines.push('');
      lines.push(`**Status:** ${ms.status || 'Later'}`);
      if (ms.estimated_timeline) lines.push(`**Estimated Timeline:** ${ms.estimated_timeline}`);
      if (ms.dependencies) lines.push(`**Dependencies:** ${ms.dependencies}`);
      lines.push('');
      lines.push('#### Goal');
      lines.push(ms.goal || 'TBD');
      lines.push('');
      if (ms.success_criteria && ms.success_criteria.length > 0) {
        lines.push('#### Success Criteria');
        for (const criterion of ms.success_criteria) {
          lines.push(`- ${criterion}`);
        }
        lines.push('');
      }
      if (ms.open_research_questions && ms.open_research_questions.length > 0) {
        lines.push('#### Open Research Questions');
        for (const q of ms.open_research_questions) {
          lines.push(`- ${q}`);
        }
        lines.push('');
      }
      lines.push('---');
      lines.push('');
    }
  }

  // Dependency graph
  lines.push('## Milestone Dependency Graph');
  lines.push('');
  lines.push('```');
  if (nowMs) {
    lines.push(`${nowMs.version} (Now)`);
  }
  for (const ms of nextMs) {
    lines.push(`  |`);
    lines.push(`${ms.version} (Next)`);
  }
  for (const ms of laterMs) {
    lines.push(`  |`);
    lines.push(`${ms.version} (Later)`);
  }
  lines.push('```');
  lines.push('');

  // Refinement History
  lines.push('## Refinement History');
  lines.push('');
  lines.push('| Date | Action | Details |');
  lines.push('|------|--------|---------|');
  lines.push(
    `| ${today} | Initial roadmap | Defined ${milestones.map((m) => m.version).join(', ')} with Now-Next-Later tiers |`
  );
  lines.push('');

  return lines.join('\n');
}

/**
 * Format parsed long-term roadmap for human-readable display.
 * @param {Object} parsed - Parsed roadmap from parseLongTermRoadmap
 * @returns {string} Formatted display string
 */
function formatLongTermRoadmap(parsed) {
  if (!parsed) return '';

  const lines = [];
  const project = parsed.frontmatter?.project || 'Unknown Project';
  const horizon = parsed.frontmatter?.planning_horizon || 'unspecified';

  lines.push(`Long-Term Roadmap: ${project}`);
  lines.push(`Planning Horizon: ${horizon}`);
  lines.push('');

  // Now milestone
  if (parsed.now) {
    const n = parsed.now;
    lines.push(`[Now]  ${n.version || '?'} - ${n.milestone?.replace(n.version, '').replace(/^\s*-\s*/, '') || 'Current'}  Status: ${n.status || 'Unknown'}`);
    if (n.goal) lines.push(`       ${n.goal}`);
    if (n.start && n.target) lines.push(`       ${n.start} -> ${n.target}`);
    lines.push('');
  }

  // Next milestones
  if (parsed.next && parsed.next.length > 0) {
    for (const ms of parsed.next) {
      lines.push(`[Next]  ${ms.version || '?'} - ${ms.milestone?.replace(ms.version, '').replace(/^\s*-\s*/, '') || 'Upcoming'}  Status: ${ms.status || 'Next'}`);
      if (ms.goal) lines.push(`        ${ms.goal}`);
      if (ms.dependencies) lines.push(`        Depends on: ${ms.dependencies}`);
      lines.push('');
    }
  }

  // Later milestones
  if (parsed.later && parsed.later.length > 0) {
    for (const ms of parsed.later) {
      lines.push(`[Later] ${ms.version || '?'} - ${ms.milestone?.replace(ms.version, '').replace(/^\s*-\s*/, '') || 'Future'}  Timeline: ${ms.estimated_timeline || 'TBD'}`);
      if (ms.goal) lines.push(`        ${ms.goal}`);
      if (ms.dependencies) lines.push(`        Depends on: ${ms.dependencies}`);
      lines.push('');
    }
  }

  // Dependency graph summary
  const allMs = [
    ...(parsed.now ? [{ version: parsed.now.version, tier: 'Now' }] : []),
    ...(parsed.next || []).map((m) => ({ version: m.version, tier: 'Next', deps: m.dependencies })),
    ...(parsed.later || []).map((m) => ({
      version: m.version,
      tier: 'Later',
      deps: m.dependencies,
    })),
  ];

  if (allMs.length > 1) {
    lines.push('Dependencies:');
    for (const ms of allMs) {
      if (ms.deps) {
        lines.push(`  ${ms.version} -> ${ms.deps}`);
      }
    }
  }

  return lines.join('\n');
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  parseLongTermRoadmap,
  validateLongTermRoadmap,
  getPlanningMode,
  generateLongTermRoadmap,
  formatLongTermRoadmap,
};
