'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { captureOutputAsync, captureErrorAsync } = require('../../helpers/setup');
const { cmdAccountsDiscover, cmdAccountsSync } = require('../../../lib/commands/accounts');

function tmp(config?: object) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-acct-'));
  fs.mkdirSync(path.join(d, '.planning'), { recursive: true });
  if (config) fs.writeFileSync(path.join(d, '.planning/config.json'), JSON.stringify(config));
  return d;
}
const readCfg = (d: string) => JSON.parse(fs.readFileSync(path.join(d, '.planning/config.json'), 'utf8'));
const result = (over = {}) => ({
  accounts: { claude: [{ config_dir: '/h/.claude-personal1' }, { config_dir: '/h/.claude-personal2' }] },
  ready: [{ kind: 'claude' }, { kind: 'claude' }],
  skipped: [{ kind: 'gemini', status: 'unconfigured' }],
  ...over,
});

describe('cmdAccountsDiscover', () => {
  it('prints ready + skipped', async () => {
    const res = await captureOutputAsync(() => cmdAccountsDiscover(tmp(), true, { discover: async () => result() }));
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toMatch(/claude/);
  });
  it('errors when the API is unreachable (discover null)', async () => {
    const res = await captureErrorAsync(() => cmdAccountsDiscover(tmp(), true, { discover: async () => null }));
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toMatch(/not reachable|loopback/i);
  });
});

describe('cmdAccountsSync', () => {
  it('writes superpowers + scheduler when ≥1 ready account', async () => {
    const cwd = tmp({ existing_key: 'keep' });
    const res = await captureOutputAsync(() => cmdAccountsSync(cwd, { dryRun: false, raw: true }, { discover: async () => result() }));
    expect(res.exitCode).toBe(0);
    const cfg = readCfg(cwd);
    expect(cfg.superpowers.account_rotation).toBe(true);
    expect(cfg.superpowers.default_backend).toBe('claude');
    expect(cfg.superpowers.accounts.claude.length).toBe(2);
    expect(cfg.scheduler.backend_priority).toEqual(['claude']);
    expect(cfg.existing_key).toBe('keep'); // unrelated keys preserved
  });
  it('preserves an existing scheduler block', async () => {
    const cwd = tmp({ scheduler: { backend_priority: ['claude'], free_fallback: { backend: 'claude' }, prediction: { window_minutes: 99, ewma_alpha: 0.1, safety_margin_tasks: 1, min_samples: 1 } } });
    await captureOutputAsync(() => cmdAccountsSync(cwd, { dryRun: false, raw: true }, { discover: async () => result() }));
    expect(readCfg(cwd).scheduler.prediction.window_minutes).toBe(99); // untouched
  });
  it('--dry-run writes nothing', async () => {
    const cwd = tmp({ a: 1 });
    await captureOutputAsync(() => cmdAccountsSync(cwd, { dryRun: true, raw: true }, { discover: async () => result() }));
    expect(readCfg(cwd)).toEqual({ a: 1 });
  });
  it('refuses (exit 1) and does not write when discover is null', async () => {
    const cwd = tmp({ a: 1 });
    const res = await captureErrorAsync(() => cmdAccountsSync(cwd, { dryRun: false, raw: true }, { discover: async () => null }));
    expect(res.exitCode).toBe(1);
    expect(readCfg(cwd)).toEqual({ a: 1 });
  });
  it('refuses (exit 1) when zero ready accounts — no clobber', async () => {
    const cwd = tmp({ a: 1 });
    const res = await captureErrorAsync(() => cmdAccountsSync(cwd, { dryRun: false, raw: true }, { discover: async () => result({ accounts: {}, ready: [] }) }));
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toMatch(/no ready accounts/i);
    expect(readCfg(cwd)).toEqual({ a: 1 });
  });
});
