'use strict';

/**
 * GRD Evolve -- Product ideation discoverer
 *
 * Claude-powered product-level feature discovery. Unlike the code-quality
 * discoverers in _dimensions.ts, this module thinks like a product manager:
 * it reads PROJECT.md, LONG-TERM-ROADMAP.md, existing commands/agents,
 * and generates creative feature ideas with business value.
 *
 * Private helper module -- imported only by ./discovery.ts.
 *
 * @dependencies ./types, ./state, ../utils, ../autopilot
 */

import type { WorkItem, WorkItemEffort, ProductIdeationContext } from './types';

const path = require('path') as typeof import('path');
const fs = require('fs') as typeof import('fs');
const { safeReadFile } = require('../utils') as {
  safeReadFile: (filePath: string) => string | null;
};
const { spawnClaudeAsync } = require('../autopilot') as {
  spawnClaudeAsync: (
    cwd: string,
    prompt: string,
    opts?: {
      captureOutput?: boolean;
      model?: string;
      maxTurns?: number;
      timeout?: number;
      outputFormat?: string;
      captureStderr?: boolean;
    }
  ) => Promise<{
    exitCode: number;
    stdout?: string;
    stderr?: string;
    timedOut: boolean;
  }>;
};
const { createWorkItem, SONNET_MODEL } = require('./state') as {
  createWorkItem: (
    dimension: string,
    slug: string,
    title: string,
    description: string,
    opts?: { effort?: string }
  ) => WorkItem;
  SONNET_MODEL: string;
};

// ── Context Gathering ────────────────────────────────────────────────────────

/**
 * Gather product context from planning files and codebase structure.
 * Each file read is wrapped in try/catch; missing files produce null/empty fallbacks.
 */
function gatherProductContext(cwd: string): ProductIdeationContext {
  const planningDir: string = path.join(cwd, '.planning');

  // PROJECT.md -- extract first 3000 chars (vision section)
  let projectVision: string | null = null;
  try {
    const raw: string | null = safeReadFile(path.join(planningDir, 'PROJECT.md'));
    if (raw) {
      projectVision = raw.substring(0, 3000);
    }
  } catch (err) {
    process.stderr.write(
      `[evolve] Product ideation: failed to read PROJECT.md: ${(err as Error).message}\n`
    );
  }

  // LONG-TERM-ROADMAP.md -- extract first 2000 chars
  let longTermGoals: string | null = null;
  try {
    const raw: string | null = safeReadFile(
      path.join(planningDir, 'LONG-TERM-ROADMAP.md')
    );
    if (raw) {
      longTermGoals = raw.substring(0, 2000);
    }
  } catch (err) {
    process.stderr.write(
      `[evolve] Product ideation: failed to read LONG-TERM-ROADMAP.md: ${(err as Error).message}\n`
    );
  }

  // PRODUCT-QUALITY.md -- extract first 1500 chars if exists
  let productQuality: string | null = null;
  try {
    const raw: string | null = safeReadFile(
      path.join(planningDir, 'PRODUCT-QUALITY.md')
    );
    if (raw) {
      productQuality = raw.substring(0, 1500);
    }
  } catch (err) {
    process.stderr.write(
      `[evolve] Product ideation: failed to read PRODUCT-QUALITY.md: ${(err as Error).message}\n`
    );
  }

  // commands/ directory -- list .md files, extract command names
  let existingCommands: string[] = [];
  try {
    const cmdDir: string = path.join(cwd, 'commands');
    const entries = fs.readdirSync(cmdDir, { withFileTypes: true });
    existingCommands = entries
      .filter(
        (e: { isFile: () => boolean; name: string }) =>
          e.isFile() && e.name.endsWith('.md')
      )
      .map((e: { name: string }) => e.name.replace(/\.md$/, ''));
  } catch {
    // commands/ directory missing -- not critical
  }

  // agents/ directory -- list .md files, extract agent names
  let existingAgents: string[] = [];
  try {
    const agentDir: string = path.join(cwd, 'agents');
    const entries = fs.readdirSync(agentDir, { withFileTypes: true });
    existingAgents = entries
      .filter(
        (e: { isFile: () => boolean; name: string }) =>
          e.isFile() && e.name.endsWith('.md')
      )
      .map((e: { name: string }) => e.name.replace(/\.md$/, ''));
  } catch {
    // agents/ directory missing -- not critical
  }

  // ROADMAP.md -- extract last ~2000 chars (recent phases)
  let recentPhases: string | null = null;
  try {
    const raw: string | null = safeReadFile(
      path.join(planningDir, 'ROADMAP.md')
    );
    if (raw) {
      recentPhases = raw.length > 2000 ? raw.substring(raw.length - 2000) : raw;
    }
  } catch (err) {
    process.stderr.write(
      `[evolve] Product ideation: failed to read ROADMAP.md: ${(err as Error).message}\n`
    );
  }

  return {
    projectVision,
    longTermGoals,
    existingCommands,
    existingAgents,
    recentPhases,
    productQuality,
  };
}

// ── Prompt Construction ──────────────────────────────────────────────────────

/**
 * Build a product-manager-focused prompt for Claude.
 * This is fundamentally different from buildDiscoveryPrompt in discovery.ts --
 * it asks for creative feature ideas, not code-quality improvements.
 */
function buildProductIdeationPrompt(context: ProductIdeationContext): string {
  const sections: string[] = [];

  sections.push(
    'You are a product manager for a developer tools company. Your job is to generate creative, high-value feature ideas for this product.'
  );

  sections.push('');
  sections.push('## Product Vision');
  if (context.projectVision) {
    sections.push(context.projectVision);
  } else {
    sections.push('(No PROJECT.md found -- infer from existing commands and agents.)');
  }

  if (context.longTermGoals) {
    sections.push('');
    sections.push('## Long-Term Roadmap Goals');
    sections.push(context.longTermGoals);
  }

  if (context.productQuality) {
    sections.push('');
    sections.push('## Known Product Quality Gaps');
    sections.push(context.productQuality);
  }

  sections.push('');
  sections.push('## What Already Exists');

  if (context.existingCommands.length > 0) {
    sections.push('');
    sections.push('### Commands');
    sections.push(context.existingCommands.map((c) => `- /${c}`).join('\n'));
  }

  if (context.existingAgents.length > 0) {
    sections.push('');
    sections.push('### Agents');
    sections.push(context.existingAgents.map((a) => `- ${a}`).join('\n'));
  }

  if (context.recentPhases) {
    sections.push('');
    sections.push('## Recently Built (for context on momentum)');
    sections.push(context.recentPhases);
  }

  sections.push('');
  sections.push('## Your Task');
  sections.push('');
  sections.push(
    'Generate creative feature ideas across these categories:'
  );
  sections.push('- New user-facing commands or workflows');
  sections.push('- New integrations with external tools/services');
  sections.push('- UX improvements to existing workflows');
  sections.push('- Developer experience enhancements');
  sections.push('- New analysis or insight capabilities');
  sections.push('- Automation or productivity features');

  sections.push('');
  sections.push('## Output Format');
  sections.push('');
  sections.push(
    'Output ONLY a JSON array. Each item:'
  );
  sections.push(
    '{"dimension":"product-ideation","slug":"<kebab-id>","title":"<short title>","description":"<what it does + why users need it + what pain point it solves>","effort":"small|medium|large"}'
  );

  sections.push('');
  sections.push('## Rules');
  sections.push('- Think about USER VALUE, not code hygiene');
  sections.push(
    '- Each idea should solve a real user problem or unlock a new capability'
  );
  sections.push('- Be creative but realistic -- ideas should be implementable');
  sections.push(
    '- Include the "why" -- what user pain point does this address?'
  );
  sections.push('- 15-40 items');
  sections.push('- ONLY the JSON array, no other text');
  sections.push(
    '- Every item MUST have dimension "product-ideation"'
  );
  sections.push(
    '- Slugs should be descriptive kebab-case (e.g. "auto-changelog-generation", "dependency-impact-analysis")'
  );

  return sections.join('\n');
}

// ── Output Parsing ───────────────────────────────────────────────────────────

/**
 * Parse Claude's product ideation output into validated WorkItem objects.
 * Only accepts items where dimension === 'product-ideation'.
 * Returns empty array if parsing fails (no crash).
 */
function parseProductIdeationOutput(raw: string): WorkItem[] {
  let jsonStr: string = raw.trim();

  // Strip markdown fences if present
  const fenceMatch: RegExpMatchArray | null = jsonStr.match(
    /```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/
  );
  if (fenceMatch) {
    jsonStr = fenceMatch[1].trim();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) {
    return [];
  }

  const validEfforts: string[] = ['small', 'medium', 'large'];
  const items: WorkItem[] = [];

  for (const entry of parsed as Array<Record<string, unknown>>) {
    if (
      !entry ||
      typeof entry.dimension !== 'string' ||
      typeof entry.slug !== 'string' ||
      typeof entry.title !== 'string' ||
      typeof entry.description !== 'string'
    ) {
      continue;
    }

    // Only accept product-ideation dimension
    if (entry.dimension !== 'product-ideation') {
      continue;
    }

    const effort: WorkItemEffort = validEfforts.includes(entry.effort as string)
      ? (entry.effort as WorkItemEffort)
      : 'medium';

    try {
      items.push(
        createWorkItem(
          entry.dimension,
          entry.slug,
          entry.title,
          entry.description,
          { effort }
        )
      );
    } catch {
      // Skip invalid items (e.g., if createWorkItem rejects the dimension)
    }
  }

  return items;
}

// ── Main Discovery Function ──────────────────────────────────────────────────

/**
 * Discover product-level feature ideas by spawning Claude with a product-manager prompt.
 * Returns empty array on failure (graceful fallback, no crash).
 */
async function discoverProductIdeationItems(cwd: string): Promise<WorkItem[]> {
  const context: ProductIdeationContext = gatherProductContext(cwd);

  // If no PROJECT.md found, skip product ideation entirely
  if (context.projectVision === null) {
    process.stderr.write(
      '[evolve] Product ideation skipped: no PROJECT.md found\n'
    );
    return [];
  }

  const prompt: string = buildProductIdeationPrompt(context);

  try {
    const result = await spawnClaudeAsync(cwd, prompt, {
      captureOutput: true,
      model: SONNET_MODEL,
      maxTurns: 15,
      timeout: 120_000,
      outputFormat: 'text',
    });

    if (result.timedOut) {
      process.stderr.write(
        '[evolve] Product ideation timed out after 120s, returning empty\n'
      );
      return [];
    }

    if (result.exitCode !== 0 || !result.stdout) {
      process.stderr.write(
        `[evolve] Product ideation failed (exit=${result.exitCode}), returning empty\n`
      );
      return [];
    }

    // Check for error message in stdout (e.g., max-turns exceeded)
    if (result.stdout.startsWith('Error:')) {
      process.stderr.write(
        `[evolve] Product ideation error: ${result.stdout.trim()}, returning empty\n`
      );
      return [];
    }

    const items: WorkItem[] = parseProductIdeationOutput(result.stdout);

    if (items.length === 0) {
      process.stderr.write(
        `[evolve] Product ideation returned unparseable output (${result.stdout.length} chars), returning empty\n`
      );
      return [];
    }

    return items;
  } catch (err) {
    process.stderr.write(
      `[evolve] Product ideation threw: ${(err as Error).message}, returning empty\n`
    );
    return [];
  }
}

// ── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  gatherProductContext,
  buildProductIdeationPrompt,
  parseProductIdeationOutput,
  discoverProductIdeationItems,
};
