'use strict';
const fs = require('fs');
const path = require('path');
import type { SuperpowersConfig } from '../types';
const { error, output } = require('../utils') as {
  error: (msg: string) => never;
  output: (data: unknown, raw: boolean, rawText: string) => void;
};
const { atomicWriteFileSync } = require('../autopilot-waves') as {
  atomicWriteFileSync: (filePath: string, data: string) => void;
};
const { DEFAULT_PREDICTION } = require('../scheduler') as {
  DEFAULT_PREDICTION: { window_minutes: number; ewma_alpha: number; safety_margin_tasks: number; min_samples: number };
};
const { discoverAccounts, aiAccountsDbPath } = require('../account-discovery') as {
  discoverAccounts: () => Promise<DiscoverResult | null>;
  aiAccountsDbPath: () => string;
};

interface DiscoveredAccount { kind: string; displayName: string; status: string; configDir: string; lastError?: string | null; }
interface DiscoverResult { accounts: SuperpowersConfig['accounts']; ready: DiscoveredAccount[]; skipped: DiscoveredAccount[]; }
interface Deps { discover?: () => Promise<DiscoverResult | null> }

const KIND_ORDER = ['claude', 'codex', 'gemini', 'opencode'];

function unreachableMsg(): string {
  return `no ai-accounts store found at ${aiAccountsDbPath()} — set AI_ACCOUNTS_DB to your `
    + 'ai-accounts playground.db (or AI_ACCOUNTS_DIR to its repo). No server needed; '
    + 'alternatively set AI_ACCOUNTS_URL to a running sidecar (loopback only).';
}

async function cmdAccountsDiscover(cwd: string, raw: boolean, deps: Deps = {}): Promise<void> {
  const discover = deps.discover || discoverAccounts;
  const d = await discover();
  if (!d) { error(unreachableMsg()); return; }
  output(
    { kinds: Object.keys(d.accounts), ready: d.ready, skipped: d.skipped },
    raw,
    `ready: ${d.ready.length} account(s) across ${Object.keys(d.accounts).join(', ') || '(none)'}; skipped: ${d.skipped.length}`,
  );
}

async function cmdAccountsSync(cwd: string, opts: { dryRun: boolean; raw: boolean }, deps: Deps = {}): Promise<void> {
  const discover = deps.discover || discoverAccounts;
  const d = await discover();
  if (!d) { error(unreachableMsg()); return; }
  const kinds = Object.keys(d.accounts);
  if (kinds.length === 0) { error(`no ready accounts found in ai-accounts (${d.skipped.length} skipped)`); return; }

  const defaultBackend = kinds.includes('claude') ? 'claude' : kinds[0];
  const cfgPath = path.join(cwd, '.planning/config.json');
  let cfg: Record<string, unknown>;
  try { cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8')) as Record<string, unknown>; } catch { cfg = {}; }

  cfg.superpowers = {
    ...((cfg.superpowers as object) || {}),
    default_backend: defaultBackend,
    account_rotation: true,
    accounts: d.accounts,
  };

  const ordered = KIND_ORDER.filter((k) => kinds.includes(k));
  const warnings: string[] = [];
  if (!cfg.scheduler) {
    cfg.scheduler = {
      backend_priority: ordered,
      free_fallback: { backend: ordered[ordered.length - 1] },
      prediction: DEFAULT_PREDICTION,
    };
  } else {
    const sched = cfg.scheduler as { backend_priority?: unknown };
    const prio = Array.isArray(sched.backend_priority) ? (sched.backend_priority as string[]) : [];
    if (!prio.some((k) => kinds.includes(k))) {
      warnings.push('existing scheduler.backend_priority has no overlap with discovered accounts');
    }
    if (!prio.includes(defaultBackend)) {
      warnings.push(`default_backend "${defaultBackend}" is not in scheduler.backend_priority`);
    }
    for (const k of kinds) {
      if (!prio.includes(k)) warnings.push(`discovered backend "${k}" is not in scheduler.backend_priority`);
    }
  }

  if (opts.dryRun) {
    output(
      { dry_run: true, superpowers: cfg.superpowers, scheduler: cfg.scheduler, warnings },
      opts.raw,
      `would sync ${kinds.join(', ')} (${d.ready.length} account(s))${warnings.length ? `; warnings: ${warnings.length}` : ''}`,
    );
    return;
  }

  fs.mkdirSync(path.dirname(cfgPath), { recursive: true });
  atomicWriteFileSync(cfgPath, JSON.stringify(cfg, null, 2));
  output(
    { synced: kinds, ready: d.ready.length, skipped: d.skipped.length, warnings },
    opts.raw,
    `synced ${kinds.join(', ')} (${d.ready.length} account(s))${warnings.length ? `; warnings: ${warnings.join('; ')}` : ''}`,
  );
}

module.exports = { cmdAccountsDiscover, cmdAccountsSync };
