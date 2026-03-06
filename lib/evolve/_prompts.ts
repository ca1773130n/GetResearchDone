'use strict';

/**
 * GRD Evolve -- Prompt templates
 *
 * Pure string template functions for building prompts used in the
 * evolve iteration loop (plan, execute, review, batch variants).
 *
 * Private helper module -- imported only by ./orchestrator.ts.
 *
 * @dependencies ./types
 */

import type { WorkItem, WorkGroup } from './types';

// ─── Prompt Builders ────────────────────────────────────────────────────────

/**
 * Build a prompt for planning a work item improvement.
 */
function buildPlanPrompt(item: WorkItem): string {
  return [
    'Read CLAUDE.md for project conventions.',
    `Analyze the codebase for the following improvement opportunity:`,
    `Title: ${item.title}`,
    `Description: ${item.description}`,
    `Dimension: ${item.dimension}`,
    `Effort: ${item.effort}`,
    'Create a brief implementation plan: what files to change and what changes to make.',
    'Do NOT implement anything — only plan.',
  ].join('\n');
}

/**
 * Build a prompt for executing a work item improvement.
 */
function buildExecutePrompt(item: WorkItem): string {
  return [
    'Read CLAUDE.md for project conventions.',
    `Implement the following improvement:`,
    `Title: ${item.title}`,
    `Description: ${item.description}`,
    `Dimension: ${item.dimension}`,
    `Effort: ${item.effort}`,
    'Run `npm test` to verify changes do not break tests.',
    'Fix any test failures before completing.',
    'Keep changes focused and minimal.',
  ].join('\n');
}

/**
 * Build a prompt for reviewing an executed improvement.
 */
function buildReviewPrompt(item: WorkItem): string {
  return [
    `Review the improvement that was just made:`,
    `Title: ${item.title}`,
    `Description: ${item.description}`,
    'Run `npm test` and `npm run lint` to check for regressions.',
    'Verify the improvement was actually made.',
    'Fix any issues found.',
  ].join('\n');
}

/**
 * Build execution prompt for an entire group of work items.
 */
function buildGroupExecutePrompt(group: WorkGroup): string {
  const itemList: string = group.items
    .map((item, i) => `${i + 1}. ${item.title}: ${item.description}`)
    .join('\n');

  return [
    'Read CLAUDE.md for project conventions.',
    `Implement the following improvements (theme: ${group.theme}, dimension: ${group.dimension}):`,
    '',
    itemList,
    '',
    'Run `npm test` to verify changes do not break tests.',
    'Fix any test failures before completing.',
    'Keep changes focused and minimal.',
  ].join('\n');
}

/**
 * Build review prompt for an entire group after execution.
 */
function buildGroupReviewPrompt(group: WorkGroup): string {
  return [
    `Review the improvements that were just made for group: ${group.title}`,
    `Theme: ${group.theme}, Dimension: ${group.dimension}`,
    `${group.items.length} items were addressed.`,
    'Run `npm test` and `npm run lint` to check for regressions.',
    'Verify the improvements were actually made.',
    'Fix any issues found.',
  ].join('\n');
}

/**
 * Build a single execution prompt for ALL groups in an iteration.
 */
function buildBatchExecutePrompt(groups: WorkGroup[], iterationNum?: number): string {
  const sections: string[] = groups.map((group) => {
    const itemList: string = group.items
      .map((item, i) => `${i + 1}. ${item.title}: ${item.description}`)
      .join('\n');
    return `### ${group.title} (${group.dimension}/${group.theme})\n${itemList}`;
  });

  const feedbackFile: string = `.planning/evolve-iteration-${iterationNum || 0}.json`;

  return [
    'Read CLAUDE.md for project conventions.',
    `Implement the following improvements across ${groups.length} groups:`,
    '',
    ...sections,
    '',
    '## CRITICAL RULES — READ CAREFULLY',
    '',
    '1. You MUST modify actual source code files (.ts, .js, .tsx, .jsx, .py, etc.)',
    '2. Do NOT create markdown files, todo files, or documentation stubs',
    '3. Do NOT create files in .planning/, docs/, or any markdown directory',
    '4. Do NOT just add JSDoc comments or rename variables — make real functional changes',
    '5. If an item requires creating a new feature, write the actual implementation code',
    '6. If an item is too vague to implement as code, SKIP it entirely',
    '7. Every change must be a real code improvement: new functions, bug fixes, refactors, tests, or feature code',
    '',
    'Do NOT run tests between groups — implement everything first.',
    'After ALL changes are done, run `npm test` once to verify nothing is broken.',
    'Fix any test failures before completing.',
    '',
    `After completing all changes, write a JSON feedback file to \`${feedbackFile}\` with this exact structure:`,
    '```json',
    '{',
    '  "decisions": ["Brief description of each design decision you made and why"],',
    '  "patterns": ["Any code patterns you noticed — good or bad — worth documenting"],',
    '  "takeaways": ["Observations about the codebase that could inform future improvements"],',
    '  "files_changed": ["list/of/files/you/modified.ts"],',
    '  "items_skipped": ["Items you skipped because they were too vague or not implementable as code"]',
    '}',
    '```',
    'Include at least 1 entry per array. Be specific and concise.',
  ].join('\n');
}

/**
 * Build a single review prompt for ALL groups after batch execution.
 */
function buildBatchReviewPrompt(groups: WorkGroup[]): string {
  const groupList: string = groups
    .map((g) => `- ${g.title} (${g.items.length} items)`)
    .join('\n');

  return [
    `Review ALL improvements that were just made across ${groups.length} groups:`,
    '',
    groupList,
    '',
    'Run `npm test` and `npm run lint` to check for regressions.',
    'Verify the improvements were actually made in source code files (.ts, .js, etc.).',
    '',
    'IMPORTANT: If you find any changes that are ONLY markdown files, todo files, or documentation stubs',
    'without corresponding source code changes, revert those files with `git checkout -- <file>`.',
    'Only real code changes should remain.',
    '',
    'Fix any issues found.',
  ].join('\n');
}

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
  buildPlanPrompt,
  buildExecutePrompt,
  buildReviewPrompt,
  buildGroupExecutePrompt,
  buildGroupReviewPrompt,
  buildBatchExecutePrompt,
  buildBatchReviewPrompt,
};
