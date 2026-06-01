# GRD ↔ ai-accounts Discovery — Implementation Plan

> REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use `- [ ]`.
> **Spec:** `docs/superpowers/specs/2026-06-02-ai-accounts-discovery-design.md`

Conventions: `'use strict'`, CommonJS, zero `any`, typed requires; commit per task; footer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

### Task 1: `lib/account-discovery.ts`

**Files:** Create `lib/account-discovery.ts`, `tests/unit/account-discovery.test.ts`

- [ ] **Test** (inject `fetchImpl`): `isLoopbackUrl` (127.0.0.1/localhost/[::1] true; 10.0.0.5 false); `expandConfigDir` (`~/.x`→homedir/.x, `~`→homedir, absolute passthrough, `foo/bar`→null, `~user/x`→null, non-string→null); `discoverAccounts`: real `{items}` shape (claude Personal1+Personal2 ready, gemini unconfigured) → `accounts.claude` two abs dirs + gemini skipped; `status:'Ready '`→counts; dup config_path→one; non-200→null; throws→null; non-loopback baseUrl→null; `{items:[]}`→`{accounts:{},ready:[],skipped:[]}` (not null).

- [ ] **Run → fail.**

- [ ] **Implement** (`fetch`/`AbortSignal.timeout` are global in Node 18+):

```ts
'use strict';
const os = require('os');
const path = require('path');
import type { SuperpowersConfig } from './types';

interface DiscoveredAccount { kind: string; displayName: string; status: string; configDir: string; lastError?: string | null; }
interface DiscoverResult { accounts: SuperpowersConfig['accounts']; ready: DiscoveredAccount[]; skipped: DiscoveredAccount[]; }

const KNOWN_KINDS = new Set(['claude', 'codex', 'gemini', 'opencode']);

function aiAccountsBaseUrl(): string {
  return process.env.AI_ACCOUNTS_URL || 'http://127.0.0.1:30000';
}

function isLoopbackUrl(u: string): boolean {
  try {
    const h = new URL(u).hostname;
    return h === '127.0.0.1' || h === 'localhost' || h === '::1' || h === '[::1]';
  } catch { return false; }
}

function expandConfigDir(p: unknown): string | null {
  if (typeof p !== 'string') return null;
  const t = p.trim();
  if (!t) return null;
  if (t === '~') return os.homedir();
  if (t.startsWith('~/')) return path.join(os.homedir(), t.slice(2));
  if (t.startsWith('~')) return null;        // ~user — unsupported
  if (path.isAbsolute(t)) return t;
  return null;                               // relative — refuse
}

async function discoverAccounts(opts: { baseUrl?: string; fetchImpl?: typeof fetch } = {}): Promise<DiscoverResult | null> {
  const baseUrl = opts.baseUrl || aiAccountsBaseUrl();
  if (!isLoopbackUrl(baseUrl)) return null;
  const f = opts.fetchImpl || fetch;
  try {
    const res = await f(`${baseUrl.replace(/\/+$/, '')}/api/v1/backends`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const body = await res.json() as { items?: unknown };
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
      const rec: DiscoveredAccount = { kind, displayName: String(raw?.display_name ?? ''), status: String(raw?.status ?? ''), configDir: dir || '', lastError: (raw?.last_error as string) ?? null };
      if (!KNOWN_KINDS.has(kind) || status !== 'ready' || !dir) { skipped.push(rec); continue; }
      const norm = dir.replace(/\/+$/, '');
      const key = `${kind}:${norm}`;
      if (seen.has(key)) continue;
      seen.add(key);
      (accounts[kind as keyof SuperpowersConfig['accounts']] = accounts[kind as keyof SuperpowersConfig['accounts']] || []).push({ config_dir: norm });
      ready.push({ ...rec, configDir: norm });
    }
    return { accounts, ready, skipped };
  } catch { return null; }
}

module.exports = { aiAccountsBaseUrl, isLoopbackUrl, expandConfigDir, discoverAccounts };
```

- [ ] **Run → pass; build:check; commit** `feat(accounts): discoverAccounts from ai-accounts API (discovery task 1)`.

---

### Task 2: `lib/commands/accounts.ts`

**Files:** Create `lib/commands/accounts.ts`, `tests/unit/commands/accounts.test.ts`

- [ ] **Test** (inject a `discover` dep returning a `DiscoverResult`/null; use a tmp cwd with `.planning/config.json`): `cmdAccountsSync` with ≥1 ready → config gets `superpowers.account_rotation:true` + `accounts.claude` + a `scheduler` block; pre-existing `scheduler` preserved; `--dry-run` writes nothing; `discover`→null → exit 1 + unreachable msg + config unchanged; zero-ready → exit 1 + "no ready accounts" + config unchanged; unrelated config keys preserved. `cmdAccountsDiscover` prints ready+skipped (capture stdout).

- [ ] **Run → fail.**

- [ ] **Implement** `lib/commands/accounts.ts` — `cmdAccountsDiscover(cwd, raw, deps?)` and `cmdAccountsSync(cwd, opts:{dryRun,raw}, deps?)`. `deps.discover` defaults to `require('../account-discovery').discoverAccounts`. Use `error`/`output` from `../utils`; read/parse `.planning/config.json`; write via `atomicWriteFileSync` from `../autopilot-waves`. Sync logic:
  - `const d = await discover();` if `!d` → `error('ai-accounts API not reachable at <url> — start it with `just playground` in ~/Developer/Projects/ai-accounts, or set AI_ACCOUNTS_URL (loopback only)')`.
  - `const kinds = Object.keys(d.accounts);` if `kinds.length === 0` → `error('no ready accounts found in ai-accounts (' + d.skipped.length + ' skipped)')`.
  - `const defaultBackend = kinds.includes('claude') ? 'claude' : kinds[0];`
  - read config obj; set `cfg.superpowers = { ...(cfg.superpowers||{}), default_backend: defaultBackend, account_rotation: true, accounts: d.accounts };`
  - if `!cfg.scheduler`: ordered = `['claude','codex','gemini','opencode'].filter(k=>kinds.includes(k))`; `cfg.scheduler = { backend_priority: ordered, free_fallback: { backend: ordered[ordered.length-1] }, prediction: DEFAULT_PREDICTION };` (import `DEFAULT_PREDICTION` from `../scheduler`). Else compute warnings (no overlap / default_backend ∉ priority / discovered kind absent) and include in output.
  - if `opts.dryRun` → `output({would_write: {superpowers: cfg.superpowers, scheduler: cfg.scheduler}, warnings}, raw, ...)` and return (no write).
  - else `atomicWriteFileSync(path.join(cwd,'.planning/config.json'), JSON.stringify(cfg,null,2))`; `output({synced: kinds, ready: d.ready.length, skipped: d.skipped.length, warnings}, raw, ...)`.

- [ ] **Run → pass; build:check; lint; commit** `feat(accounts): gd accounts discover/sync commands (discovery task 2)`.

---

### Task 3: Wire CLI dispatch + registration

**Files:** `bin/grd-tools.ts`, `lib/cli/index.ts`, test `tests/unit/cli.test.ts` (or the cli classify test)

- [ ] **Test:** in the cli classify test, `classifyCommand('accounts')` → `'tool'`. (Mirror the `ingest`/`synthesize` assertion if present; else add one.)

- [ ] **Run → fail.**

- [ ] **Implement:**
  - `lib/cli/index.ts`: add `'accounts'` to the tool-commands set; in `classifyCommand`, treat `accounts` as `'tool'` (mirror the `ingest||synthesize||retrieve` line).
  - `bin/grd-tools.ts`: add `case 'accounts':` — `const sub = args[1]; validateSubcommand(sub, ['discover','sync'], 'accounts');` then route to `cmdAccountsDiscover(cwd, raw)` or `cmdAccountsSync(cwd, { dryRun: args.includes('--dry-run'), raw })` (require from `../lib/commands/accounts`).

- [ ] **Run → pass; build:check; lint; commit** `feat(accounts): wire gd accounts CLI dispatch (discovery task 3)`.

---

### Task 4: Docs + verify + finish

- [ ] **`docs/autoresearch-tutorial.md` Prerequisites:** add a note — if you use `ai-accounts`, run `gd accounts sync` to auto-wire rotation from your registered accounts (instead of hand-editing the scheduler/superpowers block).
- [ ] `npx jest tests/unit/account-discovery.test.ts tests/unit/commands/accounts.test.ts tests/unit/cli.test.ts tests/unit/scheduler.test.ts` → pass; `npm run build:check`; `npm run lint`; `gd scan --all`; `npm test` (full).
- [ ] **Live check:** with the ai-accounts sidecar running, `gd accounts discover` lists your claude Personal1/Personal2 + codex; `gd accounts sync --dry-run` shows the would-be config. (If the sidecar isn't running, confirm the clear unreachable error.)
- [ ] Commit docs; superpowers:finishing-a-development-branch → merge `--no-ff` + push.

---

## Self-Review
- Spec coverage: discovery+loopback+expand (T1), sync/discover commands incl. refuse-on-empty + scheduler-preserve + warnings (T2), CLI wiring (T3), docs+verify+live (T4). ✓
- Degrade-safe: discoverAccounts never throws (null); sync refuses on null/zero-ready without clobber. ✓
- Types: `discoverAccounts(): DiscoverResult|null`; `DEFAULT_PREDICTION` from scheduler; `atomicWriteFileSync` from autopilot-waves; `error`/`output` from utils. ✓
