'use strict';
const fs = require('fs');
const path = require('path');
import type { SchedulerSpawnResult, SpawnOpts } from '../types';
import type { SpendRecord } from './types';
const { decodeSpawnResult } = require('../research/orchestrator') as {
  decodeSpawnResult: (r: { exitCode?: number; stdout?: string; stderr?: string }, agentType: string) => string;
};

const BUILDER = 'grd-factory-builder';

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
  tokenCapEnforced(): boolean;
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

function readSpent(orderDir: string): number {
  const f = spendFile(orderDir);
  if (!fs.existsSync(f)) return 0;
  return String(fs.readFileSync(f, 'utf8')).split('\n').filter(Boolean)
    .reduce((s: number, l: string) => s + (JSON.parse(l) as SpendRecord).tokens, 0);
}

function createMeteredSpawn(o: {
  scheduler: { spawn: (prompt: string, opts: SpawnOpts) => Promise<SchedulerSpawnResult> };
  orderDir: string;
  budgetTokens: number;
  model?: string;
  warn: (m: string) => void;
}): MeteredSpawn {
  let spent = readSpent(o.orderDir);
  let enforced = true;
  return {
    spent: () => spent,
    tokenCapEnforced: () => enforced,
    spawnFn(cwdFor, candidateFor) {
      return async (prompt: string, agentType: string): Promise<string> => {
        if (enforced && spent >= o.budgetTokens) {
          throw new BudgetSpentError(`token budget spent (${spent} of ${o.budgetTokens})`);
        }
        const isBuilder = agentType === BUILDER;
        const r = await o.scheduler.spawn(prompt, {
          agentType, model: o.model, captureOutput: true, strictMcp: true, cwd: cwdFor(agentType),
          ...(isBuilder ? { disallowedTools: ['Bash'] } : {}),
        });
        const tokens = tokensFrom(r);
        const row: SpendRecord = { agent: agentType, candidate: candidateFor(), tokens, backend: String(r.backend), at: new Date().toISOString() };
        fs.appendFileSync(spendFile(o.orderDir), JSON.stringify(row) + '\n');
        spent += tokens;
        if (r.exitCode === 0 && tokens === 0 && enforced) {
          enforced = false;
          o.warn(`[factory] the ${r.backend} backend reported no token count; the token cap cannot be enforced for this run. The candidate and wall-clock caps still apply.\n`);
        }
        if (isBuilder && r.backend !== 'claude') {
          o.warn(`[factory] a builder ran on ${r.backend}, which cannot remove the shell; that builder had shell access.\n`);
        }
        return decodeSpawnResult(r, agentType);
      };
    },
  };
}

module.exports = { BUILDER, BudgetSpentError, tokensFrom, readSpent, createMeteredSpawn };
