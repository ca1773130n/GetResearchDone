'use strict';
const os = require('os');
const fs = require('fs');
const path = require('path');
const {
  isLoopbackUrl, expandConfigDir, mapBackendItems,
  discoverAccountsFromApi, discoverAccountsFromStore, discoverAccounts, aiAccountsDbPath,
} = require('../../lib/account-discovery');

const ITEMS = [
  { id: '1', kind: 'claude', display_name: 'Personal1', status: 'ready', config: { config_path: '~/.claude-personal1', email: 'a@x' } },
  { id: '2', kind: 'claude', display_name: 'Personal2', status: 'Ready ', config: { config_path: '~/.claude-personal2' } },
  { id: '3', kind: 'codex', display_name: 'Personal2', status: 'ready', config: { config_path: '/abs/.codex-personal2' } },
  { id: '4', kind: 'gemini', display_name: 'Personal1', status: 'unconfigured', config: { config_path: '~/.gemini-personal1' } },
  { id: '5', kind: 'claude', display_name: 'Dup', status: 'ready', config: { config_path: '~/.claude-personal1' } },
];
const fakeFetch = (body: unknown, ok = true, status = 200) =>
  (async () => ({ ok, status, json: async () => body })) as unknown as typeof fetch;

const hasSqlite = (() => { try { require('node:sqlite'); return true; } catch { return false; } })();

describe('isLoopbackUrl', () => {
  it('accepts loopback, rejects others', () => {
    expect(isLoopbackUrl('http://127.0.0.1:30000')).toBe(true);
    expect(isLoopbackUrl('http://localhost:30000')).toBe(true);
    expect(isLoopbackUrl('http://[::1]:30000')).toBe(true);
    expect(isLoopbackUrl('http://10.0.0.5:30000')).toBe(false);
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
  });
});

describe('mapBackendItems', () => {
  it('maps ready accounts, skips others, dedups, expands', () => {
    const r = mapBackendItems(ITEMS);
    expect(r.accounts.claude.map((a: { config_dir: string }) => a.config_dir)).toEqual([
      path.join(os.homedir(), '.claude-personal1'),
      path.join(os.homedir(), '.claude-personal2'),
    ]);
    expect(r.accounts.codex).toEqual([{ config_dir: '/abs/.codex-personal2' }]);
    expect(r.skipped.some((s: { kind: string }) => s.kind === 'gemini')).toBe(true);
  });
  it('empty items → empty result', () => {
    expect(mapBackendItems([])).toEqual({ accounts: {}, ready: [], skipped: [] });
  });
});

describe('discoverAccountsFromApi', () => {
  const base = 'http://127.0.0.1:30000';
  it('maps {items}; non-200/throw/non-loopback → null; {items:[]} → empty', async () => {
    expect((await discoverAccountsFromApi({ baseUrl: base, fetchImpl: fakeFetch({ items: ITEMS }) })).accounts.claude.length).toBe(2);
    expect(await discoverAccountsFromApi({ baseUrl: base, fetchImpl: fakeFetch({}, false, 500) })).toBeNull();
    expect(await discoverAccountsFromApi({ baseUrl: 'http://10.0.0.5:1', fetchImpl: fakeFetch({ items: ITEMS }) })).toBeNull();
    const r = await discoverAccountsFromApi({ baseUrl: base, fetchImpl: fakeFetch({ items: [] }) });
    expect(r.accounts).toEqual({});
  });
});

describe('aiAccountsDbPath', () => {
  const save = { db: process.env.AI_ACCOUNTS_DB, dir: process.env.AI_ACCOUNTS_DIR };
  afterEach(() => { process.env.AI_ACCOUNTS_DB = save.db; process.env.AI_ACCOUNTS_DIR = save.dir; });
  it('respects AI_ACCOUNTS_DB, then AI_ACCOUNTS_DIR, else homedir default', () => {
    process.env.AI_ACCOUNTS_DB = '/x/y.db'; expect(aiAccountsDbPath()).toBe('/x/y.db');
    delete process.env.AI_ACCOUNTS_DB; process.env.AI_ACCOUNTS_DIR = '/repo';
    expect(aiAccountsDbPath()).toBe(path.join('/repo', 'apps/playground/playground.db'));
    delete process.env.AI_ACCOUNTS_DIR;
    expect(aiAccountsDbPath()).toBe(path.join(os.homedir(), 'Developer/Projects/ai-accounts/apps/playground/playground.db'));
  });
});

(hasSqlite ? describe : describe.skip)('discoverAccountsFromStore (node:sqlite)', () => {
  function makeDb(rows: Array<[string, string, string, string]>) {
    const { DatabaseSync } = require('node:sqlite');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aia-store-'));
    const dbPath = path.join(dir, 'playground.db');
    const db = new DatabaseSync(dbPath);
    db.exec('CREATE TABLE backends(kind TEXT, display_name TEXT, status TEXT, config TEXT)');
    const ins = db.prepare('INSERT INTO backends VALUES(?,?,?,?)');
    for (const r of rows) ins.run(...r);
    db.close();
    return { dir, dbPath };
  }
  it('reads ready accounts, per-row skips malformed config, empty→empty, missing→null', () => {
    const { dbPath } = makeDb([
      ['claude', 'P1', 'ready', JSON.stringify({ config_path: '~/.claude-personal1' })],
      ['claude', 'P2', 'ready', JSON.stringify({ config_path: '~/.claude-personal2' })],
      ['gemini', 'G', 'unconfigured', JSON.stringify({ config_path: '~/.gemini-personal1' })],
      ['claude', 'Bad', 'ready', '{not json'],
    ]);
    const r = discoverAccountsFromStore({ dbPath });
    expect(r.accounts.claude.length).toBe(2);
    expect(r.skipped.length).toBe(2); // gemini + malformed
    expect(discoverAccountsFromStore({ dbPath: '/no/such.db' })).toBeNull();
    const { dbPath: empty } = makeDb([]);
    expect(discoverAccountsFromStore({ dbPath: empty }).accounts).toEqual({});
  });
  it('opens read-only — no mutation, no -wal/-shm sidecar files', () => {
    const { dir, dbPath } = makeDb([['claude', 'P1', 'ready', JSON.stringify({ config_path: '~/.claude-personal1' })]]);
    const before = fs.readdirSync(dir).sort();
    const mtimeBefore = fs.statSync(dbPath).mtimeMs;
    discoverAccountsFromStore({ dbPath });
    expect(fs.readdirSync(dir).sort()).toEqual(before); // no -wal/-shm created
    expect(fs.statSync(dbPath).mtimeMs).toBe(mtimeBefore);
  });
  it('orchestrator: store present → no API call (throwing fetch not invoked)', async () => {
    const { dbPath } = makeDb([['claude', 'P1', 'ready', JSON.stringify({ config_path: '~/.claude-personal1' })]]);
    const throwing = (async () => { throw new Error('should not be called'); }) as unknown as typeof fetch;
    const r = await discoverAccounts({ dbPath, baseUrl: 'http://127.0.0.1:30000', fetchImpl: throwing });
    expect(r.accounts.claude.length).toBe(1);
  });
});

describe('discoverAccounts orchestrator (store absent)', () => {
  it('store absent + no URL → null; store absent + baseUrl set → API', async () => {
    const save = process.env.AI_ACCOUNTS_URL; delete process.env.AI_ACCOUNTS_URL;
    expect(await discoverAccounts({ dbPath: '/no/such.db' })).toBeNull();
    const r = await discoverAccounts({ dbPath: '/no/such.db', baseUrl: 'http://127.0.0.1:30000', fetchImpl: fakeFetch({ items: ITEMS }) });
    expect(r.accounts.claude.length).toBe(2);
    process.env.AI_ACCOUNTS_URL = save;
  });
});
