/** GRD Commands/LongTermRoadmap -- Long-term roadmap CRUD operations CLI interface */

'use strict';

const path = require('path');
const { safeReadFile, output, error }: {
  safeReadFile: (p: string) => string | null;
  output: (result: unknown, raw: boolean, rawValue?: unknown) => never;
  error: (message: string) => never;
} = require('../utils');
const { planningDir: getPlanningDir }: {
  planningDir: (cwd: string) => string;
} = require('../paths');
const {
  parseLongTermRoadmap, validateLongTermRoadmap, formatLongTermRoadmap,
  updateRefinementHistory, addLtMilestone, removeLtMilestone,
  updateLtMilestone, linkNormalMilestone, unlinkNormalMilestone,
  getLtMilestoneById, initFromRoadmap,
}: {
  parseLongTermRoadmap: (content: unknown) => LtRoadmapParsed | null;
  validateLongTermRoadmap: (parsed: LtRoadmapParsed | null) => LtValidationResult;
  formatLongTermRoadmap: (parsed: LtRoadmapParsed | null) => string;
  updateRefinementHistory: (content: string, action: string, details: string) => string;
  addLtMilestone: (content: string, name: string, goal: string) => { content: string; id: string };
  removeLtMilestone: (content: string, id: string, roadmapContent?: string) => string | LtErrorResult;
  updateLtMilestone: (content: string, id: string, updates: Record<string, string>) => string | LtErrorResult;
  linkNormalMilestone: (content: string, id: string, version: string, note?: string | null) => string | LtErrorResult;
  unlinkNormalMilestone: (content: string, id: string, version: string, roadmapContent?: string) => string | LtErrorResult;
  getLtMilestoneById: (content: string, id: string) => LtMilestoneEntry | null;
  initFromRoadmap: (roadmapContent: string, projectName: string) => string;
} = require('../long-term-roadmap');
const { readCachedRoadmap }: {
  readCachedRoadmap: (roadmapPath: string) => string | null;
} = require('./phase-info');

// ─── Domain Types ────────────────────────────────────────────────────────────

/** A normal milestone linked to a long-term milestone. */
interface LtNormalMilestone {
  version: string;
  note?: string;
}

/** A parsed LT milestone from LONG-TERM-ROADMAP.md. */
interface LtMilestoneEntry {
  id: string;
  name: string;
  status: string;
  goal: string;
  normal_milestones: LtNormalMilestone[];
}

/** A parsed LONG-TERM-ROADMAP.md document. */
interface LtRoadmapParsed {
  frontmatter: Record<string, unknown>;
  milestones: LtMilestoneEntry[];
  refinement_history: { date: string; action: string; details: string }[];
}

/** Validation result from validateLongTermRoadmap. */
interface LtValidationResult {
  valid: boolean;
  errors?: string[];
  warnings?: string[];
}

/** Error result from LT roadmap CRUD operations. */
interface LtErrorResult {
  error: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Extract --flag value from args array, returns value or fallback. */
function flag(args: string[], name: string, fallback?: string | null): string | null {
  const i = args.indexOf(name);
  return i !== -1 && i + 1 < args.length ? args[i + 1] : (fallback ?? null);
}

/** Compute relative path to LONG-TERM-ROADMAP.md from cwd. */
function ltrmRelPath(cwd: string): string {
  return path.relative(cwd, path.join(getPlanningDir(cwd), 'LONG-TERM-ROADMAP.md'));
}

// ─── Long-Term Roadmap Command ──────────────────────────────────────────────

/**
 * CLI command: Manage long-term roadmap operations.
 *
 * Delegates to the corresponding function in lib/long-term-roadmap.ts for each subcommand.
 * Supports: list, add, remove, update, refine, link, unlink, display, init, history, parse, validate.
 *
 * @param cwd - Project working directory
 * @param subcommand - Operation to perform
 * @param args - Remaining CLI arguments (flags and values)
 * @param raw - Output raw text instead of JSON
 */
function cmdLongTermRoadmap(cwd: string, subcommand: string, args: string[], raw: boolean): void {
  const ltrmPath = path.join(getPlanningDir(cwd), 'LONG-TERM-ROADMAP.md');
  const roadmapPath = path.join(getPlanningDir(cwd), 'ROADMAP.md');

  function readLtrm(): string | null {
    const content = safeReadFile(ltrmPath);
    if (!content) { output({ error: 'LONG-TERM-ROADMAP.md not found', exists: false }, raw, ''); return null; }
    return content;
  }

  switch (subcommand) {
    // List all LT milestones with ID, name, and status
    case 'list': {
      const content = readLtrm();
      if (!content) return;
      const parsed = parseLongTermRoadmap(content);
      const milestones = parsed ? parsed.milestones : [];
      const summary = milestones
        .map((m) => `${m.id}: ${m.name} [${m.status}]`)
        .join('\n');
      output(
        { milestones, count: milestones.length },
        raw,
        summary || '(no milestones)'
      );
      break;
    }

    // Add a new LT milestone with --name and --goal
    case 'add': {
      const name = flag(args, '--name');
      const goal = flag(args, '--goal');
      if (!name) { error('--name flag required'); return; }
      if (!goal) { error('--goal flag required'); return; }
      const content = readLtrm();
      if (!content) return;
      const result = addLtMilestone(content, name, goal);
      output(
        { content: result.content, path: ltrmRelPath(cwd), id: result.id },
        raw,
        result.content
      );
      break;
    }

    // Remove an LT milestone by --id (checks for linked normal milestones)
    case 'remove': {
      const id = flag(args, '--id');
      if (!id) { error('--id flag required'); return; }
      const content = readLtrm();
      if (!content) return;
      const roadmapContent = readCachedRoadmap(roadmapPath);
      const result = removeLtMilestone(content, id, roadmapContent ?? undefined);
      if (result && typeof result === 'object' && (result as LtErrorResult).error) {
        output({ error: (result as LtErrorResult).error }, raw, (result as LtErrorResult).error);
      } else {
        output({ content: result, path: ltrmRelPath(cwd), removed: id }, raw, result as string);
      }
      break;
    }
    case 'update': {
      const id = flag(args, '--id');
      if (!id) { error('--id flag required'); return; }
      const updates: Record<string, string> = {};
      const nameVal = flag(args, '--name'); const goalVal = flag(args, '--goal'); const statusVal = flag(args, '--status');
      if (nameVal) updates.name = nameVal;
      if (goalVal) updates.goal = goalVal;
      if (statusVal) updates.status = statusVal;
      if (Object.keys(updates).length === 0) {
        error('At least one of --name, --goal, --status required. Example: long-term-roadmap update <id> --name "New Name" --goal "New Goal" --status active');
        return;
      }
      const content = readLtrm(); if (!content) return;
      const result = updateLtMilestone(content, id, updates);
      if (result && typeof result === 'object' && (result as LtErrorResult).error) {
        output({ error: (result as LtErrorResult).error }, raw, (result as LtErrorResult).error);
      } else {
        output({ content: result, path: ltrmRelPath(cwd), id, updated_fields: Object.keys(updates) }, raw, result as string);
      }
      break;
    }
    case 'refine': {
      const id = flag(args, '--id');
      if (!id) { error('--id flag required'); return; }
      const content = readLtrm(); if (!content) return;
      const ms = getLtMilestoneById(content, id);
      if (!ms) { output({ error: `${id} not found` }, raw, `${id} not found`); return; }
      output(
        { milestone: ms, context: `Use this context to discuss refinements for ${id}` }, raw,
        `${ms.id}: ${ms.name}\nStatus: ${ms.status}\nGoal: ${ms.goal}\nNormal milestones: ${ms.normal_milestones.map((m) => m.version).join(', ') || '(none yet)'}`
      );
      break;
    }
    case 'link': {
      const id = flag(args, '--id'); const version = flag(args, '--version'); const note = flag(args, '--note');
      if (!id) { error('--id flag required'); return; }
      if (!version) { error('--version flag required'); return; }
      const content = readLtrm(); if (!content) return;
      const result = linkNormalMilestone(content, id, version, note);
      if (result && typeof result === 'object' && (result as LtErrorResult).error) {
        output({ error: (result as LtErrorResult).error }, raw, (result as LtErrorResult).error);
      } else {
        output({ content: result, path: ltrmRelPath(cwd), id, linked: version }, raw, result as string);
      }
      break;
    }
    case 'unlink': {
      const id = flag(args, '--id'); const version = flag(args, '--version');
      if (!id) { error('--id flag required'); return; }
      if (!version) { error('--version flag required'); return; }
      const content = readLtrm(); if (!content) return;
      const roadmapContent = readCachedRoadmap(roadmapPath);
      const result = unlinkNormalMilestone(content, id, version, roadmapContent ?? undefined);
      if (result && typeof result === 'object' && (result as LtErrorResult).error) {
        output({ error: (result as LtErrorResult).error }, raw, (result as LtErrorResult).error);
      } else {
        output({ content: result, path: ltrmRelPath(cwd), id, unlinked: version }, raw, result as string);
      }
      break;
    }
    case 'display': {
      const content = readLtrm(); if (!content) return;
      const parsed = parseLongTermRoadmap(content);
      const formatted = formatLongTermRoadmap(parsed);
      const milestoneCount = parsed && parsed.milestones ? parsed.milestones.length : 0;
      output({ formatted, milestone_count: milestoneCount }, raw, formatted);
      break;
    }
    case 'init': {
      const roadmapContent = readCachedRoadmap(roadmapPath);
      if (!roadmapContent) { output({ error: 'ROADMAP.md not found' }, raw, 'ROADMAP.md not found'); return; }
      const projectName = flag(args, '--project') || 'Project';
      const content = initFromRoadmap(roadmapContent, projectName);
      output({ content, path: ltrmRelPath(cwd) }, raw, content);
      break;
    }
    case 'history': {
      const histAction = flag(args, '--action'); const histDetails = flag(args, '--details');
      if (!histAction) { error('--action flag required'); return; }
      if (!histDetails) { error('--details flag required'); return; }
      const content = readLtrm(); if (!content) return;
      const histResult = updateRefinementHistory(content, histAction, histDetails);
      output({ content: histResult, path: ltrmRelPath(cwd), action: histAction, details: histDetails }, raw, histResult);
      break;
    }
    case 'parse': {
      const filePath = args[0] ? (path.isAbsolute(args[0]) ? args[0] : path.join(cwd, args[0])) : ltrmPath;
      const content = safeReadFile(filePath);
      if (!content) { output({ error: 'LONG-TERM-ROADMAP.md not found', exists: false }, raw, ''); return; }
      const parsed = parseLongTermRoadmap(content);
      const count = parsed && parsed.milestones ? parsed.milestones.length : 0;
      output(parsed, raw, `${count} LT milestones`);
      break;
    }
    case 'validate': {
      const valFilePath = args[0] ? (path.isAbsolute(args[0]) ? args[0] : path.join(cwd, args[0])) : ltrmPath;
      const valContent = safeReadFile(valFilePath);
      if (!valContent) { output({ error: 'LONG-TERM-ROADMAP.md not found', exists: false }, raw, ''); return; }
      const valParsed = parseLongTermRoadmap(valContent);
      const validation = validateLongTermRoadmap(valParsed);
      const valRawText = validation.valid ? 'valid' : 'invalid: ' + (validation.errors || []).join('; ');
      output(validation, raw, valRawText);
      break;
    }
    default:
      error('Unknown subcommand: ' + subcommand +
        '. Valid: list, add, remove, update, refine, link, unlink, display, init, history, parse, validate');
  }
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = { cmdLongTermRoadmap };
