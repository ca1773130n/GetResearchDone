'use strict';
const fs = require('fs');
const path = require('path');
import type { SchedulerSpawnResult, SpawnOpts } from '../types';
import type { SpendRecord } from './types';
const { decodeSpawnResult } = require('../research/orchestrator') as {
  decodeSpawnResult: (r: { exitCode?: number; stdout?: string; stderr?: string }, agentType: string) => string;
};
const { readJsonl } = require('./jsonl') as { readJsonl: <T>(f: string, warn?: (m: string) => void) => T[] };

const BUILDER = 'grd-factory-builder';

/**
 * Tools the builder is spawned without. It needs Read, Write, Edit, Grep and Glob; everything
 * here either hands a shell straight back (`Bash`, `BashOutput`, `KillShell`, and `Task`, which
 * spawns a subagent that has one) or reaches a network the sandbox denies (`WebFetch`,
 * `WebSearch`). The `tools:` line in `agents/*.md` is not applied by any spawn path, so this
 * list is the whole restriction.
 *
 * It is a denylist, which means a tool Claude Code gains later is permitted by default:
 * REVISIT THIS LIST whenever Claude Code's tool set changes. An allowlist would be the better
 * shape, but it needs an `--allowedTools` option in the scheduler that every spawn path in the
 * product shares.
 *
 * The list only bites because the builder is spawned with `permissionMode: 'acceptEdits'`.
 * Under the scheduler's default `--dangerously-skip-permissions` it was inert — measured, not
 * assumed: see SpawnOpts.disallowedTools. Never spawn the builder without that mode.
 */
const BUILDER_DENIED: string[] = ['Bash', 'Task', 'WebFetch', 'WebSearch', 'NotebookEdit', 'KillShell', 'BashOutput'];

class BudgetSpentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BudgetSpentError';
    // Keeps `instanceof` working whatever the compile target.
    Object.setPrototypeOf(this, BudgetSpentError.prototype);
  }
}

export type FactorySpawnFn = (prompt: string, agentType: string) => Promise<string>;

export interface MeteredSpawn {
  /** A spawn function for the research loop. `cwdFor` picks each spawn's working directory. */
  spawnFn(cwdFor: (agentType: string) => string, candidateFor: () => string | null): FactorySpawnFn;
  spent(): number;
  /** Spawns that reported no token count, so `spent()` under-states what the run really cost. */
  unmeteredSpawns(): number;
}

/**
 * Tokens one spawn used. The scheduler parses them from stderr; claude with
 * `--output-format json` reports them in its stdout result instead, so fall back to that.
 * Cache reads are counted too, which over-states cost and never under-states it.
 */
function tokensFrom(r: SchedulerSpawnResult): number {
  if (r.tokensUsed > 0) return r.tokensUsed;
  try {
    const parsed = JSON.parse(r.stdout || '') as unknown;
    const events = Array.isArray(parsed) ? parsed : [parsed];
    for (let i = events.length - 1; i >= 0; i--) {
      const usage = (events[i] as { usage?: Record<string, unknown> }).usage;
      if (usage && typeof usage === 'object') {
        return ['input_tokens', 'output_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens']
          .reduce((s, k) => s + (typeof usage[k] === 'number' ? (usage[k] as number) : 0), 0);
      }
    }
  } catch { /* not JSON: no usage to read */ }
  return 0;
}

function spendFile(orderDir: string): string { return path.join(orderDir, 'spend.jsonl'); }

function readSpent(orderDir: string, warn?: (m: string) => void): number {
  return readJsonl<SpendRecord>(spendFile(orderDir), warn).reduce((s: number, r: SpendRecord) => s + r.tokens, 0);
}

function createMeteredSpawn(o: {
  scheduler: { spawn: (prompt: string, opts: SpawnOpts) => Promise<SchedulerSpawnResult> };
  orderDir: string;
  budgetTokens: number;
  /**
   * Epoch ms after which no new spawn starts. Checked here, at every spawn, because the line
   * only checks its own stop conditions between attempts — and one attempt can build several
   * candidates. So a run overshoots the wall clock by at most one spawn and the container runs
   * that follow it, never by a whole attempt.
   */
  deadline?: number;
  now?: () => number;
  model?: string;
  warn: (m: string) => void;
}): MeteredSpawn {
  let spent = readSpent(o.orderDir, o.warn);
  let unmetered = 0;
  const now = o.now || Date.now;
  return {
    spent: () => spent,
    unmeteredSpawns: () => unmetered,
    spawnFn(cwdFor, candidateFor) {
      return async (prompt: string, agentType: string): Promise<string> => {
        if (spent >= o.budgetTokens) {
          throw new BudgetSpentError(`the token budget ran out (${spent} of ${o.budgetTokens})`);
        }
        if (o.deadline !== undefined && now() >= o.deadline) {
          throw new BudgetSpentError('the wall-clock budget ran out');
        }
        const isBuilder = agentType === BUILDER;
        const r = await o.scheduler.spawn(prompt, {
          agentType, model: o.model, captureOutput: true, strictMcp: true, cwd: cwdFor(agentType),
          // acceptEdits, not the default skip-permissions: that flag would permit every tool
          // and the denylist below would do nothing at all. See SpawnOpts.permissionMode.
          ...(isBuilder ? { disallowedTools: BUILDER_DENIED, permissionMode: 'acceptEdits' as const } : {}),
        });
        const tokens = tokensFrom(r);
        const row: SpendRecord = { agent: agentType, candidate: candidateFor(), tokens, backend: String(r.backend), at: new Date().toISOString() };
        fs.appendFileSync(spendFile(o.orderDir), JSON.stringify(row) + '\n');
        spent += tokens;
        // A spawn that reports nothing contributes nothing to the total, but it never disables
        // the cap: every spawn that does report still counts, so one unparsed usage block cannot
        // uncap the money for the rest of the run. Said once, and disclosed in the report.
        if (r.exitCode === 0 && tokens === 0) {
          unmetered += 1;
          if (unmetered === 1) {
            o.warn(`[factory] the ${r.backend} backend reported no token count for a spawn; the cap is still enforced against the spawns that did report, so the real spend can exceed it.\n`);
          }
        }
        if (isBuilder && r.backend !== 'claude') {
          o.warn(`[factory] a builder ran on ${r.backend}, which cannot remove the shell; that builder had shell access.\n`);
        }
        return decodeSpawnResult(r, agentType);
      };
    },
  };
}

module.exports = { BUILDER, BUILDER_DENIED, BudgetSpentError, tokensFrom, readSpent, createMeteredSpawn };
