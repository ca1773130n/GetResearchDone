'use strict';
const os = require('os');
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

const KNOWN_KINDS = new Set(['claude', 'codex', 'gemini', 'opencode']);

function aiAccountsBaseUrl(): string {
  return process.env.AI_ACCOUNTS_URL || 'http://127.0.0.1:30000';
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
  return null; // relative — refuse (no cwd-dependent account location)
}

async function discoverAccounts(
  opts: { baseUrl?: string; fetchImpl?: typeof fetch } = {},
): Promise<DiscoverResult | null> {
  const baseUrl = opts.baseUrl || aiAccountsBaseUrl();
  if (!isLoopbackUrl(baseUrl)) return null;
  const f = opts.fetchImpl || fetch;
  try {
    const res = await f(`${baseUrl.replace(/\/+$/, '')}/api/v1/backends`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { items?: unknown };
    if (!Array.isArray(body.items)) return null;
    const accounts: SuperpowersConfig['accounts'] = {};
    const ready: DiscoveredAccount[] = [];
    const skipped: DiscoveredAccount[] = [];
    const seen = new Set<string>();
    for (const raw of body.items as Array<Record<string, unknown>>) {
      const kind = String(raw?.kind ?? '');
      const cfg = (raw?.config || {}) as { config_path?: unknown };
      const dir = expandConfigDir(cfg.config_path);
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
  } catch {
    return null;
  }
}

module.exports = { aiAccountsBaseUrl, isLoopbackUrl, expandConfigDir, discoverAccounts };
