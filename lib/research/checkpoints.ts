'use strict';
const fs = require('fs');
const path = require('path');
import type {
  Checkpoint,
  CheckpointAnswer,
  CheckpointPoint,
  CheckpointQuestion,
  InteractiveConfig,
  ResearchThread,
} from './types';

const { threadDir, saveThread: saveThreadImpl } = require('./thread') as {
  threadDir: (cwd: string, id: string) => string;
  saveThread: (cwd: string, thread: ResearchThread) => void;
};
const { incrementCounter: incrementCounterImpl } = require('./../metrics') as {
  incrementCounter: (name: string, delta?: number) => void;
};

// ── Dependency-injection seams (mirror spawn/runner injection style) ─────────

/** Handler invoked for a VALID checkpoint. The default handler pauses the thread. */
export type CheckpointHandler = (
  cwd: string,
  thread: ResearchThread,
  ck: Checkpoint,
  deps: ResolvedEmitDeps,
) => Checkpoint;

export interface EmitDeps {
  checkpointHandler?: CheckpointHandler;
  saveThread?: (cwd: string, thread: ResearchThread) => void;
  incrementCounter?: (name: string, delta?: number) => void;
}

interface ResolvedEmitDeps {
  saveThread: (cwd: string, thread: ResearchThread) => void;
  incrementCounter: (name: string, delta?: number) => void;
}

export interface ResolveInteractiveOpts {
  noGates?: boolean;
  autonomousMode?: boolean;
  autopilot?: boolean;
  concurrency?: number;
  nonInteractive?: boolean;
  /** Injectable env accessor (opts.env ?? process.env) — GRD_AUTOPILOT is a NEW env contract. */
  env?: Record<string, string | undefined>;
}

// ── id construction ─────────────────────────────────────────────────────────

/** Canonical checkpoint id: `ck-<iteration>-<point>-r<round>`. */
export function makeCheckpointId(iteration: number, point: CheckpointPoint, round: number): string {
  return `ck-${iteration}-${point}-r${round}`;
}

// ── emit-time validation ────────────────────────────────────────────────────

/** A checkpoint is valid iff ≤4 questions and each has exactly one recommended option. */
export function validateCheckpoint(ck: Checkpoint): { ok: boolean; reason: string } {
  const qs = ck.questions || [];
  if (qs.length < 1) return { ok: false, reason: 'no questions' };
  if (qs.length > 4) return { ok: false, reason: `too many questions (${qs.length} > 4)` };
  for (const q of qs) {
    const rec = (q.options || []).filter((o) => o.recommended === true).length;
    if (rec !== 1) {
      return { ok: false, reason: `question "${q.id}" has ${rec} recommended options (need exactly 1)` };
    }
  }
  return { ok: true, reason: '' };
}

/** The recommended option for a question (falls back to the first option). */
function recommendedOption(q: CheckpointQuestion): { label: string } {
  return (q.options || []).find((o) => o.recommended === true) || (q.options || [])[0] || { label: '' };
}

/** Build answers by resolving every question to its recommended option (timeout / invalid path). */
function answersFromRecommended(ck: Checkpoint): CheckpointAnswer[] {
  return (ck.questions || []).map((q) => ({
    questionId: q.id,
    label: recommendedOption(q).label,
    answeredBy: 'default' as const,
  }));
}

/** Return a resolved-to-defaults copy of ck WITHOUT touching the thread. */
function resolveToDefaults(ck: Checkpoint): Checkpoint {
  return { ...ck, answers: answersFromRecommended(ck), resolvedAt: new Date().toISOString() };
}

// ── emit / default handler ──────────────────────────────────────────────────

function defaultCheckpointHandler(
  cwd: string,
  thread: ResearchThread,
  ck: Checkpoint,
  deps: ResolvedEmitDeps,
): Checkpoint {
  thread.pendingCheckpoint = ck;
  thread.status = 'paused';
  deps.saveThread(cwd, thread);
  deps.incrementCounter('research.checkpoint_pauses_total');
  return ck;
}

/**
 * Emit a checkpoint. Invalid input → ONE stderr warning + resolve-to-defaults (never throws,
 * never pauses). Valid input → the injected (or default-pause) checkpointHandler.
 * NOTE: wiring into runLoop is Phase 102 — here the seam + default behavior are built/tested only.
 */
export function emitCheckpoint(
  cwd: string,
  thread: ResearchThread,
  ck: Checkpoint,
  deps: EmitDeps = {},
): Checkpoint {
  const resolved: ResolvedEmitDeps = {
    saveThread: deps.saveThread || saveThreadImpl,
    incrementCounter: deps.incrementCounter || incrementCounterImpl,
  };
  const v = validateCheckpoint(ck);
  if (!v.ok) {
    console.warn(`[checkpoints] invalid checkpoint ${ck.id}: ${v.reason} — resolving to recommended defaults`);
    return resolveToDefaults(ck);
  }
  const handler = deps.checkpointHandler || defaultCheckpointHandler;
  return handler(cwd, thread, ck, resolved);
}

// ── resolve ─────────────────────────────────────────────────────────────────

/**
 * Merge answers into a checkpoint (missing answers fall back to the recommended default),
 * append the resolved record to checkpoints.jsonl, and clear thread.pendingCheckpoint.
 */
export function resolveCheckpoint(
  cwd: string,
  thread: ResearchThread,
  ck: Checkpoint,
  answers: CheckpointAnswer[],
  deps: { saveThread?: (cwd: string, thread: ResearchThread) => void } = {},
): Checkpoint {
  const byId = new Map((answers || []).map((a) => [a.questionId, a]));
  const merged: CheckpointAnswer[] = (ck.questions || []).map((q) => {
    const given = byId.get(q.id);
    if (given) return given;
    return { questionId: q.id, label: recommendedOption(q).label, answeredBy: 'default' as const };
  });
  const resolved: Checkpoint = { ...ck, answers: merged, resolvedAt: new Date().toISOString() };
  appendCheckpointRecord(threadDir(cwd, thread.id), resolved);
  thread.pendingCheckpoint = null;
  (deps.saveThread || saveThreadImpl)(cwd, thread);
  return resolved;
}

// ── consumeAnswered (one-shot analog of approved.execute) ────────────────────

const consumed = new WeakSet<object>();

/**
 * One-shot read of a resumed checkpoint's answers: returns the stored answers when
 * (point, iteration) match and they have not been consumed yet; null otherwise.
 */
export function consumeAnswered(
  resumedCheckpoint: Checkpoint | null | undefined,
  point: CheckpointPoint,
  iteration: number,
): CheckpointAnswer[] | null {
  if (!resumedCheckpoint) return null;
  if (consumed.has(resumedCheckpoint)) return null;
  if (resumedCheckpoint.point !== point || resumedCheckpoint.iteration !== iteration) return null;
  if (!resumedCheckpoint.answers || resumedCheckpoint.answers.length === 0) return null;
  consumed.add(resumedCheckpoint);
  return resumedCheckpoint.answers;
}

// ── append-only checkpoints.jsonl IO (mirrors ledger.jsonl) ──────────────────

function checkpointLogPath(dir: string): string {
  return path.join(dir, 'checkpoints.jsonl');
}

/** Append a record as one JSON line; never rewrites the file. */
export function appendCheckpointRecord(dir: string, record: Checkpoint): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(checkpointLogPath(dir), JSON.stringify(record) + '\n');
}

/** Read all records in append order; missing log → []. */
export function readCheckpointLog(dir: string): Checkpoint[] {
  const p = checkpointLogPath(dir);
  if (!fs.existsSync(p)) return [];
  return fs
    .readFileSync(p, 'utf8')
    .split('\n')
    .filter((l: string) => l.trim().length > 0)
    .map((l: string) => JSON.parse(l) as Checkpoint);
}

// ── interactive config: raw read + warn/clamp ────────────────────────────────

function defaultInteractive(): InteractiveConfig {
  return {
    enabled: false,
    seed: true,
    hypothesize: true,
    design: true,
    decide: true,
    max_rounds: 2,
    max_questions: 4,
    hypothesis_candidates: 3,
    every_iteration: false,
    fallback: 'recommended',
  };
}

function warnKey(key: string, msg: string): void {
  console.warn(`[interactive-config] ${key}: ${msg}`);
}

function coerceBool(v: unknown, def: boolean, key: string): boolean {
  if (v === undefined) return def;
  if (typeof v !== 'boolean') {
    warnKey(key, `expected boolean, using default (${def})`);
    return def;
  }
  return v;
}

/**
 * Raw read of research_gates.interactive (loadConfig drops unknown keys, so raw-read like
 * readResearchGatesConfig). Applies the warn+clamp matrix; returns a fully-populated config.
 */
export function readInteractiveConfig(cwd: string): InteractiveConfig {
  const def = defaultInteractive();
  let raw: { research_gates?: { interactive?: Record<string, unknown> } };
  try {
    raw = JSON.parse(fs.readFileSync(path.join(cwd, '.planning/config.json'), 'utf8'));
  } catch {
    return def;
  }
  const ic = raw?.research_gates?.interactive;
  if (!ic || typeof ic !== 'object') return def;

  const out: InteractiveConfig = {
    enabled: coerceBool(ic.enabled, def.enabled, 'enabled'),
    seed: coerceBool(ic.seed, def.seed, 'seed'),
    hypothesize: coerceBool(ic.hypothesize, def.hypothesize, 'hypothesize'),
    design: coerceBool(ic.design, def.design, 'design'),
    decide: coerceBool(ic.decide, def.decide, 'decide'),
    every_iteration: coerceBool(ic.every_iteration, def.every_iteration, 'every_iteration'),
    max_rounds: def.max_rounds,
    max_questions: def.max_questions,
    hypothesis_candidates: def.hypothesis_candidates,
    fallback: def.fallback,
  };

  // max_rounds: number ≥ 1, else default 2
  if (ic.max_rounds !== undefined) {
    const n = ic.max_rounds;
    if (typeof n !== 'number' || !Number.isFinite(n) || n < 1) {
      warnKey('max_rounds', `expected a number ≥ 1, using default (${def.max_rounds})`);
    } else {
      out.max_rounds = Math.floor(n);
    }
  }

  // max_questions: number ≥ 1, else default 4
  if (ic.max_questions !== undefined) {
    const n = ic.max_questions;
    if (typeof n !== 'number' || !Number.isFinite(n) || n < 1) {
      warnKey('max_questions', `expected a number ≥ 1, using default (${def.max_questions})`);
    } else {
      out.max_questions = Math.floor(n);
    }
  }

  // hypothesis_candidates: clamped to [1, 5]
  if (ic.hypothesis_candidates !== undefined) {
    const n = ic.hypothesis_candidates;
    if (typeof n !== 'number' || !Number.isFinite(n)) {
      warnKey('hypothesis_candidates', `expected a number, using default (${def.hypothesis_candidates})`);
    } else if (n < 1) {
      warnKey('hypothesis_candidates', 'below range, clamped to 1');
      out.hypothesis_candidates = 1;
    } else if (n > 5) {
      warnKey('hypothesis_candidates', 'above range, clamped to 5');
      out.hypothesis_candidates = 5;
    } else {
      out.hypothesis_candidates = Math.floor(n);
    }
  }

  // fallback: 'recommended' | 'panel'
  if (ic.fallback !== undefined) {
    if (ic.fallback === 'recommended' || ic.fallback === 'panel') {
      out.fallback = ic.fallback;
    } else {
      warnKey('fallback', `unknown value "${String(ic.fallback)}", using 'recommended'`);
    }
  }

  return out;
}

// ── resolveInteractive: auto-skip matrix (pure, no IO) ───────────────────────

/**
 * Interactive steering is DISABLED (active:false) under any unattended condition:
 * --no-gates, autonomous_mode, autopilot/GRD_AUTOPILOT, portfolio concurrency>1, non-interactive.
 * Otherwise active mirrors cfg.enabled.
 */
export function resolveInteractive(
  cfg: InteractiveConfig,
  opts: ResolveInteractiveOpts = {},
): { active: boolean } {
  const env = opts.env || process.env;
  const disabled =
    Boolean(opts.noGates) ||
    Boolean(opts.autonomousMode) ||
    Boolean(opts.autopilot) ||
    Boolean(env.GRD_AUTOPILOT) ||
    (typeof opts.concurrency === 'number' && opts.concurrency > 1) ||
    Boolean(opts.nonInteractive);
  if (disabled) return { active: false };
  return { active: Boolean(cfg && cfg.enabled) };
}

module.exports = {
  makeCheckpointId,
  validateCheckpoint,
  emitCheckpoint,
  resolveCheckpoint,
  consumeAnswered,
  appendCheckpointRecord,
  readCheckpointLog,
  readInteractiveConfig,
  resolveInteractive,
};
