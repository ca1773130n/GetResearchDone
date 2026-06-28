'use strict';
const os = require('os');
const fs = require('fs');
const path = require('path');
import type { SuperpowersConfig } from './types';

interface DiscoveredAccount {
  kind: string;
  displayName: string;
  status: string;
  configDir: string;
  lastError?: string | null;
}
interface DiscoverResult {
  accounts: SuperpowersConfig['accounts'];
  ready: DiscoveredAccount[];
  skipped: DiscoveredAccount[];
}
interface BackendItem {
  kind?: unknown;
  display_name?: unknown;
  status?: unknown;
  config?: { config_path?: unknown } | null;
  last_error?: unknown;
}

const KNOWN_KINDS = new Set(['claude', 'codex', 'gemini', 'opencode']);

function aiAccountsBaseUrl(): string {
  return process.env.AI_ACCOUNTS_URL || 'http://127.0.0.1:30000';
}

function aiAccountsDbPath(): string {
  if (process.env.AI_ACCOUNTS_DB) return process.env.AI_ACCOUNTS_DB;
  const repo = process.env.AI_ACCOUNTS_DIR || path.join(os.homedir(), 'Developer/Projects/ai-accounts');
  return path.join(repo, 'apps/playground/playground.db');
}

function isLoopbackUrl(u: string): boolean {
  try {
    const h = new URL(u).hostname;
    return h === '127.0.0.1' || h === 'localhost' || h === '::1' || h === '[::1]';
  } catch {
    return false;
  }
}

function expandConfigDir(p: unknown): string | null {
  if (typeof p !== 'string') return null;
  const t = p.trim();
  if (!t) return null;
  if (t === '~') return os.homedir();
  if (t.startsWith('~/')) return path.join(os.homedir(), t.slice(2));
  if (t.startsWith('~')) return null; // ~user — unsupported
  if (path.isAbsolute(t)) return t;
  return null; // relative — refuse
}

/** Pure: filter known kinds + status 'ready' + expandable config_path; dedup → DiscoverResult. */
function mapBackendItems(items: BackendItem[]): DiscoverResult {
  const accounts: SuperpowersConfig['accounts'] = {};
  const ready: DiscoveredAccount[] = [];
  const skipped: DiscoveredAccount[] = [];
  const seen = new Set<string>();
  for (const raw of items || []) {
    const kind = String(raw?.kind ?? '');
    const dir = expandConfigDir(raw?.config?.config_path);
    const status = String(raw?.status ?? '').trim().toLowerCase();
    const rec: DiscoveredAccount = {
      kind,
      displayName: String(raw?.display_name ?? ''),
      status: String(raw?.status ?? ''),
      configDir: dir || '',
      lastError: (raw?.last_error as string) ?? null,
    };
    if (!KNOWN_KINDS.has(kind) || status !== 'ready' || !dir) {
      skipped.push(rec);
      continue;
    }
    const norm = dir.replace(/\/+$/, '');
    const key = `${kind}:${norm}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const k = kind as keyof SuperpowersConfig['accounts'];
    (accounts[k] = accounts[k] || []).push({ config_dir: norm });
    ready.push({ ...rec, configDir: norm });
  }
  return { accounts, ready, skipped };
}

/** Read accounts from ai-accounts' SQLite store directly (no server). null when unavailable. */
function discoverAccountsFromStore(opts: { dbPath?: string } = {}): DiscoverResult | null {
  const dbPath = opts.dbPath || aiAccountsDbPath();
  if (!fs.existsSync(dbPath)) return null;
  let DatabaseSync: new (p: string, o?: { readOnly?: boolean }) => {
    prepare: (sql: string) => { all: () => Array<Record<string, unknown>> };
    close: () => void;
  };
  try {
    ({ DatabaseSync } = require('node:sqlite'));
  } catch {
    return null; // Node < 22.5 — degrade (API fallback may still apply)
  }
  let db: { prepare: (sql: string) => { all: () => Array<Record<string, unknown>> }; close: () => void } | null = null;
  try {
    db = new DatabaseSync(dbPath, { readOnly: true });
    const rows = db.prepare('SELECT kind, display_name, status, config FROM backends').all();
    const items: BackendItem[] = rows.map((r) => {
      let config: { config_path?: unknown };
      try { config = JSON.parse(String(r.config ?? '{}')); } catch { config = {}; } // per-row skip on bad JSON
      return { kind: r.kind, display_name: r.display_name, status: r.status, config };
    });
    return mapBackendItems(items);
  } catch {
    return null; // SQLITE_BUSY / bad schema / can't open
  } finally {
    try { db?.close(); } catch { /* ignore */ }
  }
}

/** Fetch accounts from the ai-accounts HTTP sidecar (fallback). null when unreachable. */
async function discoverAccountsFromApi(
  opts: { baseUrl?: string; fetchImpl?: typeof fetch } = {},
): Promise<DiscoverResult | null> {
  const baseUrl = opts.baseUrl || aiAccountsBaseUrl();
  if (!isLoopbackUrl(baseUrl)) return null;
  const f = opts.fetchImpl || fetch;
  try {
    const res = await f(`${baseUrl.replace(/\/+$/, '')}/api/v1/backends`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const body = (await res.json()) as { items?: unknown };
    if (!Array.isArray(body.items)) return null;
    return mapBackendItems(body.items as BackendItem[]);
  } catch {
    return null;
  }
}

/**
 * Discover accounts, preferring the local SQLite store (no server). Falls back
 * to the HTTP API ONLY when an explicit URL is configured. null when neither
 * source is available.
 */
async function discoverAccounts(
  opts: { dbPath?: string; baseUrl?: string; fetchImpl?: typeof fetch } = {},
): Promise<DiscoverResult | null> {
  const store = discoverAccountsFromStore({ dbPath: opts.dbPath });
  if (store) return store;
  if (process.env.AI_ACCOUNTS_URL || opts.baseUrl) {
    return discoverAccountsFromApi({ baseUrl: opts.baseUrl, fetchImpl: opts.fetchImpl });
  }
  return null;
}

module.exports = {
  aiAccountsBaseUrl, aiAccountsDbPath, isLoopbackUrl, expandConfigDir, mapBackendItems,
  discoverAccountsFromStore, discoverAccountsFromApi, discoverAccounts,
};
