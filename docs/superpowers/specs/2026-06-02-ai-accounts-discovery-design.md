# GRD ↔ ai-accounts Account Discovery — Design

> Auto-discover the user's AI CLI accounts from the local **ai-accounts**
> Litestar sidecar and wire GRD's `superpowers.accounts` rotation config from
> them, instead of hand-maintaining config dirs. Spec date: 2026-06-02.

## Goal

`gd accounts sync` calls the ai-accounts API, discovers the registered accounts
(per backend, with their isolated config dirs and health status), and writes
GRD's account-rotation config (`superpowers.accounts` + `account_rotation`, plus
a minimal `scheduler` block if none exists). `gd accounts discover` (read-only)
shows what it would write without touching config. The result is that GRD's
rotation always reflects the user's real account registry — the source of truth
the user already maintains in ai-accounts.

## Background

`ai-accounts` (`~/Developer/Projects/ai-accounts`) is a Litestar sidecar +
TS/Vue client that manages multi-account auth across claude/codex/gemini/opencode
with per-account config-dir isolation. Discovered from its OpenAPI
(`packages/ts-core/src/client/openapi.json`) and store:

- Endpoint: **`GET /api/v1/backends`** → `{ items: BackendDTO[] }`.
- `BackendDTO = { id, kind, display_name, status, last_error, config }`.
  - `kind` ∈ claude/codex/gemini/opencode (matches GRD's `AdapterBackendId`).
  - `status` is a free string; observed values `ready` / `unconfigured`.
  - `config` is an object holding `config_path` (e.g. `~/.claude-personal1`),
    `email`, `plan`.
- Default API base: `http://127.0.0.1:30000` (justfile: `AIA_HOST:AIA_PORT`,
  default `127.0.0.1:30000`). The DTO does **not** expose `rate_limited_until`,
  so live rate-limit state is NOT available from this endpoint — that's fine:
  GRD's runtime detection (`detectFromStdout`/rotation, shipped 2f812f3) handles
  dynamic limits. Discovery provides the **account set**; rotation handles
  **dynamic health**.

GRD maps each account's `config_path` to the env var it already injects
(`CLAUDE_CONFIG_DIR`/`CODEX_HOME`/… via `ENV_VAR_MAP`), and config dirs must be
**absolute** (the env var is injected verbatim — `~` is not expanded).

## Non-Goals

- Reading credentials or the ai-accounts SQLite store directly (use the API).
- Auto-discovery on every scheduler init (no HTTP on the hot path) — discovery is
  an explicit `gd accounts sync` step.
- Live rate-limit filtering from ai-accounts (not in the DTO; runtime detection
  covers it).
- Chat/PTY/onboarding features of ai-accounts.

## Architecture

### `lib/account-discovery.ts` (new)

```ts
interface DiscoveredAccount { kind: string; displayName: string; status: string; configDir: string; }
interface DiscoverResult { accounts: SuperpowersConfig['accounts']; ready: DiscoveredAccount[]; skipped: DiscoveredAccount[]; }

function aiAccountsBaseUrl(): string;             // env AI_ACCOUNTS_URL || http://127.0.0.1:30000
function isLoopbackUrl(u: string): boolean;        // host ∈ 127.0.0.1 / localhost / [::1] / ::1
function expandConfigDir(p: unknown): string | null; // only ~ or ~/… → homedir; absolute passthrough; else null
async function discoverAccounts(opts?: {
  baseUrl?: string;
  fetchImpl?: typeof fetch;                        // injectable for tests
}): Promise<DiscoverResult | null>;                // null ONLY on unreachable/parse failure
```

- **Loopback constraint (Codex P2):** `baseUrl` must be loopback
  (`isLoopbackUrl`). The default is. If `AI_ACCOUNTS_URL` resolves to a
  non-loopback host, `discoverAccounts` refuses (returns `null`) and the command
  reports "AI_ACCOUNTS_URL must point at a local ai-accounts sidecar (loopback)".
  This is why the fetch can safely bypass the ingest SSRF `url-guard` (that guard
  exists for untrusted ingest URLs and blocks loopback): egress is pinned to a
  trusted local sidecar.
- `discoverAccounts`: `GET ${baseUrl}/api/v1/backends` (5s `AbortSignal.timeout`),
  parse `{items}`, keep items whose `kind` is a known GRD `AdapterBackendId`
  (claude/codex/gemini/opencode) **and** `String(status).trim().toLowerCase() ===
  'ready'` (Codex P3) **and** `expandConfigDir(config.config_path)` is non-null;
  group into `accounts[kind]` (dedup by the **expanded, trailing-slash-stripped**
  config_dir — Codex P3 — preserving API order). Items that are non-ready,
  unknown-kind, or have an unexpandable config_path go to `skipped` (carrying
  `status` + `last_error` for reporting).
- **null vs empty (Codex P1):** `null` is returned **only** when the sidecar is
  unreachable / non-200 / unparseable JSON / non-loopback baseUrl. A reachable
  sidecar with `{items:[]}` (or no ready accounts) returns a `DiscoverResult`
  with empty `accounts` — a real, non-error "nothing ready" answer.

### `gd accounts` command (`lib/commands/accounts.ts` + cli wiring)

- `gd accounts discover [--json]` — fetch + print discovered/ready/skipped; no
  writes. Errors clearly if the API is unreachable.
- `gd accounts sync [--dry-run] [--json]` — fetch, then merge into
  `.planning/config.json`:
  - **Refuse-on-empty (Codex P1):** if discovery is `null` (unreachable) OR has
    **zero ready accounts**, exit non-zero and write **nothing** — never clobber
    a valid config with an unusable block. Messages: unreachable → "ai-accounts
    API not reachable at <url> — start it with `just playground` in
    ~/Developer/Projects/ai-accounts, or set AI_ACCOUNTS_URL (loopback only)";
    reachable-but-empty → "no ready accounts found in ai-accounts (N skipped)".
  - With ≥1 ready account: `superpowers.default_backend` = `claude` if present
    among discovered kinds else the first discovered kind; `account_rotation` =
    true; `accounts` = discovered map (**replaces** `superpowers.accounts`;
    preserves other `superpowers` keys).
  - If no `scheduler` block exists, add a minimal one: `backend_priority` =
    discovered kinds (claude first, then codex/gemini/opencode), `free_fallback`
    `.backend` = last priority kind, `prediction` = `DEFAULT_PREDICTION`. If a
    `scheduler` block already exists, leave it untouched (don't clobber user
    tuning) **but warn (Codex P2)** when: its `backend_priority` has no overlap
    with discovered kinds, `default_backend` ∉ `backend_priority`, or a
    discovered backend is absent from `backend_priority`.
  - `--dry-run` prints the would-be config and writes nothing.
  - Writes via the existing atomic config writer; read-modify-write the parsed
    object so unrelated keys are preserved.

### Wiring

- `lib/cli/index.ts` — register `accounts` as a tool command; subcommands
  `discover`/`sync` route to the tool path.
- `bin/grd-tools.ts` — `case 'accounts':` dispatches to `cmdAccountsDiscover` /
  `cmdAccountsSync`.
- `commands/accounts.md` — skill doc (optional, mirrors other tool commands).

## Files

- **Create** `lib/account-discovery.ts` — `discoverAccounts`, `expandConfigDir`, `aiAccountsBaseUrl`.
- **Create** `lib/commands/accounts.ts` — `cmdAccountsDiscover`, `cmdAccountsSync`.
- **Create** `tests/unit/account-discovery.test.ts`, `tests/unit/commands/accounts.test.ts`.
- **Modify** `bin/grd-tools.ts` (dispatch), `lib/cli/index.ts` (register).
- **Modify** `docs/autoresearch-tutorial.md` — Prerequisites: mention `gd accounts sync`.

## Testing strategy

Offline via an injected `fetchImpl` (no real sidecar):

- `discoverAccounts`: fake fetch returns the real `{items}` shape (claude
  Personal1/Personal2 ready, gemini unconfigured) → `accounts.claude` has both
  absolute dirs, gemini in `skipped` (with its status); `config_path` `~/.x` →
  `${os.homedir()}/.x`; `status:'Ready '` (mixed case/space) still counts;
  unknown kind skipped; duplicate config_path collapses to one; non-200 → null;
  fetch throws → null; non-loopback baseUrl → null; `{items:[]}` → DiscoverResult
  with empty accounts (NOT null).
- `expandConfigDir`: `~/.claude-personal1` → `${os.homedir()}/.claude-personal1`;
  `~` → homedir; already-absolute passes through; relative `foo/bar` → null;
  `~user/x` → null; non-string → null.
- `isLoopbackUrl`: `http://127.0.0.1:30000` / `http://localhost:30000` /
  `http://[::1]:30000` → true; `http://10.0.0.5:30000` → false.
- `cmdAccountsSync` (injected discover dep): ≥1 ready → writes
  `superpowers.accounts` + `account_rotation:true` + a scheduler block when
  absent; an existing scheduler block is preserved (and a mismatch warns);
  `--dry-run` writes nothing; discovery null → non-zero + unreachable msg +
  config unchanged; **zero ready accounts → non-zero + "no ready accounts" +
  config unchanged (no clobber)**; preserves unrelated config keys.
- `cmdAccountsDiscover`: prints ready + skipped; `--json` shape; unreachable →
  non-zero.

## Known limitations

- Requires the ai-accounts sidecar running for `sync`/`discover` (clear error
  otherwise). It's an explicit step, not automatic.
- `status` filter is `=== 'ready'`; ai-accounts' own taxonomy could grow other
  healthy states — revisit if so.
- Live rate-limit state isn't in the API DTO; GRD's runtime detection covers it.
