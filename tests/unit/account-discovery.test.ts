'use strict';
const os = require('os');
const path = require('path');
const { isLoopbackUrl, expandConfigDir, discoverAccounts } = require('../../lib/account-discovery');

const ITEMS = {
  items: [
    { id: '1', kind: 'claude', display_name: 'Personal1', status: 'ready', config: { config_path: '~/.claude-personal1', email: 'a@x' } },
    { id: '2', kind: 'claude', display_name: 'Personal2', status: 'Ready ', config: { config_path: '~/.claude-personal2' } },
    { id: '3', kind: 'codex', display_name: 'Personal2', status: 'ready', config: { config_path: '/abs/.codex-personal2' } },
    { id: '4', kind: 'gemini', display_name: 'Personal1', status: 'unconfigured', config: { config_path: '~/.gemini-personal1' } },
    { id: '5', kind: 'claude', display_name: 'Dup', status: 'ready', config: { config_path: '~/.claude-personal1' } }, // dup of #1
  ],
};
const fakeFetch = (body: unknown, ok = true, status = 200) =>
  (async () => ({ ok, status, json: async () => body })) as unknown as typeof fetch;

describe('isLoopbackUrl', () => {
  it('accepts loopback hosts, rejects others', () => {
    expect(isLoopbackUrl('http://127.0.0.1:30000')).toBe(true);
    expect(isLoopbackUrl('http://localhost:30000')).toBe(true);
    expect(isLoopbackUrl('http://[::1]:30000')).toBe(true);
    expect(isLoopbackUrl('http://10.0.0.5:30000')).toBe(false);
    expect(isLoopbackUrl('not a url')).toBe(false);
  });
});

describe('expandConfigDir', () => {
  it('expands ~ forms, passes absolute, rejects the rest', () => {
    expect(expandConfigDir('~/.claude-personal1')).toBe(path.join(os.homedir(), '.claude-personal1'));
    expect(expandConfigDir('~')).toBe(os.homedir());
    expect(expandConfigDir('/abs/x')).toBe('/abs/x');
    expect(expandConfigDir('foo/bar')).toBeNull();
    expect(expandConfigDir('~root/x')).toBeNull();
    expect(expandConfigDir(42)).toBeNull();
    expect(expandConfigDir('')).toBeNull();
  });
});

describe('discoverAccounts', () => {
  const base = 'http://127.0.0.1:30000';
  it('maps ready accounts, skips others, dedups, expands paths', async () => {
    const r = await discoverAccounts({ baseUrl: base, fetchImpl: fakeFetch(ITEMS) });
    expect(r).not.toBeNull();
    expect(r.accounts.claude.map((a: { config_dir: string }) => a.config_dir)).toEqual([
      path.join(os.homedir(), '.claude-personal1'),
      path.join(os.homedir(), '.claude-personal2'),
    ]); // dup collapsed, mixed-case 'Ready ' counted
    expect(r.accounts.codex).toEqual([{ config_dir: '/abs/.codex-personal2' }]);
    expect(r.skipped.some((s: { kind: string }) => s.kind === 'gemini')).toBe(true);
  });
  it('non-200 → null; throw → null; non-loopback → null', async () => {
    expect(await discoverAccounts({ baseUrl: base, fetchImpl: fakeFetch(ITEMS, false, 500) })).toBeNull();
    const throwing = (async () => { throw new Error('down'); }) as unknown as typeof fetch;
    expect(await discoverAccounts({ baseUrl: base, fetchImpl: throwing })).toBeNull();
    expect(await discoverAccounts({ baseUrl: 'http://10.0.0.5:30000', fetchImpl: fakeFetch(ITEMS) })).toBeNull();
  });
  it('reachable-but-empty → empty result (not null)', async () => {
    const r = await discoverAccounts({ baseUrl: base, fetchImpl: fakeFetch({ items: [] }) });
    expect(r).not.toBeNull();
    expect(r.accounts).toEqual({});
    expect(r.ready).toEqual([]);
  });
});
