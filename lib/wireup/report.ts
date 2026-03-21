'use strict';

/**
 * GRD Wireup -- Report generation
 *
 * Generates WIREUP-REPORT.md in the milestone wireup directory after each iteration.
 * The report summarises features tested, scenarios run/passed/failed/skipped, issues
 * found, fixes applied, and surfaces issues that require manual review.
 *
 * Each run appends a row to the ## Iteration History section at the bottom of the
 * report, enabling trend tracking across multiple wireup runs.
 *
 * @dependencies ./types, ../paths (currentMilestone), fs, path
 */

import type { MissingConnection, FixAttempt } from './types';

const fs = require('fs');
const path = require('path');

const {
  currentMilestone,
}: {
  currentMilestone: (cwd: string) => string;
} = require('../paths');

// ─── Report Data Type ────────────────────────────────────────────────────────

/**
 * All data required to generate a WIREUP-REPORT.md for a single iteration.
 */
export interface WireupReportData {
  /** Milestone version string (e.g. 'v0.3.13'). */
  milestone: string;
  /** Iteration number (1-based). */
  iteration: number;
  /** ISO timestamp when this report was generated. */
  timestamp: string;
  /** Number of distinct features that had scenarios executed. */
  features_tested: number;
  /** Scenario execution counts. */
  scenarios: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
  };
  /** Full list of detected missing connections. */
  issues_found: MissingConnection[];
  /** Fix attempt results grouped by outcome. */
  fixes: {
    applied: FixAttempt[];
    verified: number;
    failed: number;
    skipped: number;
  };
  /** Feature IDs / function names that still have failing or skipped scenarios. */
  remaining_unwired: string[];
  /** Medium and low confidence issues that were NOT auto-fixed (require human review). */
  manual_review: MissingConnection[];
}

// ─── Path Helper ─────────────────────────────────────────────────────────────

/**
 * Resolve the absolute path to WIREUP-REPORT.md for the current milestone.
 *
 * @param cwd - Absolute path to the project root.
 * @returns Absolute path: {cwd}/.planning/milestones/{milestone}/wireup/WIREUP-REPORT.md
 */
function formatReportPath(cwd: string): string {
  const milestone: string = currentMilestone(cwd);
  return path.join(cwd, '.planning', 'milestones', milestone, 'wireup', 'WIREUP-REPORT.md');
}

// ─── Iteration History Extraction ─────────────────────────────────────────────

/**
 * Extract existing iteration history table rows from a WIREUP-REPORT.md file.
 *
 * Finds the `## Iteration History` section and returns all data rows
 * (excluding the header row and separator row). Returns an empty string
 * when the section is absent or contains no data rows.
 *
 * @param existingContent - Raw content of an existing WIREUP-REPORT.md file.
 * @returns Table data rows (each separated by '\n'), or '' if none found.
 */
function extractIterationHistory(existingContent: string): string {
  // Find the ## Iteration History section
  const sectionMatch: RegExpMatchArray | null = existingContent.match(
    /## Iteration History\s*\n([\s\S]*?)(?:\n## |\n*$)/
  );
  if (!sectionMatch) return '';

  const sectionContent: string = sectionMatch[1];

  // Split into lines and extract data rows (skip header and separator lines)
  const lines: string[] = sectionContent.split('\n');
  const dataRows: string[] = lines.filter((line) => {
    const trimmed = line.trim();
    // Keep rows that start with '|' but are NOT header or separator rows
    if (!trimmed.startsWith('|')) return false;
    // Skip separator rows (contain only dashes, pipes, spaces)
    if (/^\|[\s\-|]+\|$/.test(trimmed)) return false;
    // Skip the header row (contains column names like 'Iteration')
    if (trimmed.includes('| Iteration |') || trimmed.includes('|Iteration|')) return false;
    return true;
  });

  return dataRows.join('\n');
}

// ─── Report Generation ───────────────────────────────────────────────────────

/**
 * Generate and write WIREUP-REPORT.md for a wireup iteration.
 *
 * The report file is written to:
 *   {cwd}/.planning/milestones/{milestone}/wireup/WIREUP-REPORT.md
 *
 * If the file already exists, the main report sections (Summary through Remaining
 * Unwired Features) are overwritten with fresh data, but the ## Iteration History
 * section is preserved and the new iteration's row is appended.
 *
 * @param cwd  - Absolute path to the project root.
 * @param data - Report data for the current iteration.
 * @returns The absolute path where WIREUP-REPORT.md was written.
 */
function generateWireupReport(cwd: string, data: WireupReportData): string {
  const reportPath: string = formatReportPath(cwd);

  // Ensure the wireup directory exists
  const wireupDir: string = path.dirname(reportPath);
  fs.mkdirSync(wireupDir, { recursive: true });

  // Read existing report (if any) to preserve iteration history
  let existingHistory = '';
  try {
    const existingContent: string = fs.readFileSync(reportPath, 'utf-8');
    existingHistory = extractIterationHistory(existingContent);
  } catch {
    // File does not exist yet — start with empty history
  }

  // ─── Build new iteration history row ──────────────────────────────────────

  const dateStr: string = data.timestamp.slice(0, 10); // YYYY-MM-DD
  const newHistoryRow =
    `| ${data.iteration} | ${dateStr} | ${data.scenarios.total} | ${data.scenarios.passed} | ${data.scenarios.failed} | ${data.scenarios.skipped} | ${data.issues_found.length} | ${data.fixes.verified + data.fixes.failed} | ${data.fixes.verified} |`;

  const historyRows: string = existingHistory
    ? existingHistory + '\n' + newHistoryRow
    : newHistoryRow;

  // ─── Build Issues Found table ──────────────────────────────────────────────

  let issuesTable: string;
  if (data.issues_found.length === 0) {
    issuesTable = '_No issues detected._';
  } else {
    const rows: string = data.issues_found
      .map((issue, idx) => {
        const fixAttempt: FixAttempt | undefined = data.fixes.applied.find(
          (f) => f.issue.scenario_id === issue.scenario_id && f.issue.issue_type === issue.issue_type
        );
        const fixStatus: string = fixAttempt ? fixAttempt.fix_status : 'skipped';
        return `| ${idx + 1} | ${issue.issue_type} | ${issue.source_file} | ${issue.target_file} | ${issue.confidence} | ${fixStatus} |`;
      })
      .join('\n');

    issuesTable =
      `| # | Type | Source | Target | Confidence | Fix Status |\n` +
      `|---|------|--------|--------|------------|------------|\n` +
      rows;
  }

  // ─── Build Fixes Applied table ────────────────────────────────────────────

  let fixesTable: string;
  if (data.fixes.applied.length === 0) {
    fixesTable = '_No fixes attempted._';
  } else {
    const rows: string = data.fixes.applied
      .map((fix, idx) => {
        const rerunStr: string =
          fix.rerun_passed === true ? 'Yes' : fix.rerun_passed === false ? 'No' : 'N/A';
        const description: string = fix.fix_description ?? fix.error ?? '—';
        return `| ${idx + 1} | ${fix.issue.issue_type} | ${description} | ${fix.fix_status} | ${rerunStr} |`;
      })
      .join('\n');

    fixesTable =
      `| # | Issue Type | Description | Status | Re-run Passed |\n` +
      `|---|------------|-------------|--------|---------------|\n` +
      rows;
  }

  // ─── Build Manual Review section ──────────────────────────────────────────

  let manualReviewSection: string;
  if (data.manual_review.length === 0) {
    manualReviewSection = '_All detected issues are high-confidence and were auto-fixed._';
  } else {
    manualReviewSection = data.manual_review
      .map((issue) => {
        return (
          `### ${issue.issue_type}: ${issue.source_file} -> ${issue.target_file}\n` +
          `**Confidence:** ${issue.confidence}\n` +
          `**Suggested Fix:** ${issue.suggested_fix}`
        );
      })
      .join('\n\n');
  }

  // ─── Build Remaining Unwired Features list ────────────────────────────────

  let remainingSection: string;
  if (data.remaining_unwired.length === 0) {
    remainingSection = '_All tested features are now wired._';
  } else {
    remainingSection = data.remaining_unwired.map((f) => `- ${f}`).join('\n');
  }

  // ─── Assemble full report ─────────────────────────────────────────────────

  const report =
    `# Wireup Report\n` +
    `\n` +
    `**Milestone:** ${data.milestone}\n` +
    `**Iteration:** ${data.iteration}\n` +
    `**Generated:** ${data.timestamp}\n` +
    `\n` +
    `## Summary\n` +
    `\n` +
    `| Metric | Count |\n` +
    `|--------|-------|\n` +
    `| Features Tested | ${data.features_tested} |\n` +
    `| Scenarios Run | ${data.scenarios.total} |\n` +
    `| Scenarios Passed | ${data.scenarios.passed} |\n` +
    `| Scenarios Failed | ${data.scenarios.failed} |\n` +
    `| Scenarios Skipped | ${data.scenarios.skipped} |\n` +
    `| Issues Found | ${data.issues_found.length} |\n` +
    `| Fixes Applied | ${data.fixes.verified + data.fixes.failed} |\n` +
    `| Fixes Verified | ${data.fixes.verified} |\n` +
    `| Fixes Failed | ${data.fixes.failed} |\n` +
    `| Remaining Unwired | ${data.remaining_unwired.length} |\n` +
    `\n` +
    `## Issues Found\n` +
    `\n` +
    issuesTable +
    `\n` +
    `\n` +
    `## Fixes Applied\n` +
    `\n` +
    fixesTable +
    `\n` +
    `\n` +
    `## Requires Manual Review\n` +
    `\n` +
    manualReviewSection +
    `\n` +
    `\n` +
    `## Remaining Unwired Features\n` +
    `\n` +
    remainingSection +
    `\n` +
    `\n` +
    `## Iteration History\n` +
    `\n` +
    `| Iteration | Date | Scenarios | Passed | Failed | Skipped | Issues | Fixes | Verified |\n` +
    `|-----------|------|-----------|--------|--------|---------|--------|-------|----------|\n` +
    historyRows +
    `\n`;

  fs.writeFileSync(reportPath, report, 'utf-8');

  return reportPath;
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  generateWireupReport,
  formatReportPath,
  extractIterationHistory,
};
