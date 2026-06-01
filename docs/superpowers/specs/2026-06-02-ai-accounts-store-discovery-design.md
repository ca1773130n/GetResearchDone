# Serverless ai-accounts Discovery (read the SQLite store) — Design

> Follow-up to the API-based discovery: requiring a running ai-accounts HTTP
> sidecar to discover accounts is wrong. The account registry lives in a SQLite
> file; GRD should read it directly (no server, no new dependency — Node has
> built-in `node:sqlite`). The HTTP API becomes an explicit fallback. Spec date:
> 2026-06-02.

## Goal

`gd accounts discover`/`sync` discover accounts by reading ai-accounts' SQLite
store **directly** (`backends` table), so the user never runs a server. The
HTTP API path (built previously) is kept only as a fallback, used **only when
`AI_ACCOUNTS_URL` (or `opts.baseUrl`) is explicitly set**. If the store is
unreadable and no URL is set, discovery returns `null` (no implicit network).

## Evidence

- ai-accounts' playground server is `SqliteStorage("./playground.db")`
  (`apps/playground/server.py:35`) → the store is
  `<ai-accounts>/apps/playground/playground.db`. The user's real accounts
  (claude Personal1/Personal2, codex Personal2) are confirmed in its `backends`
  table.
- `backends` columns include `kind`, `display_name`, `status`, and `config`
  (TEXT JSON holding `config_path`). `config_path` + `status` are **unencrypted**
  — GRD needs only those, never the credentials (`backend_credentials`).
- Runtime is Node 24 → `node:sqlite` (`DatabaseSync`) is built in (stable in
  Node ≥ 22.5). GRD targets Node ≥18, so the store reader **lazy-requires**
  `node:sqlite` and degrades (returns null) when unavailable.

## Changes (refactor `lib/account-discovery.ts`)

Extract the shared row→account mapping so the store and API paths agree:

```ts
// Pure: filter known kinds + status==='ready' + expandable config_path; dedup; → DiscoverResult
function mapBackendItems(items: Array<{ kind?: unknown; display_name?: unknown; status?: unknown; config?: { config_path?: unknown }; last_error?: unknown }>): DiscoverResult;
```

- `discoverAccountsFromApi(opts)` — the existing HTTP path, now just
  `fetch → {items} → mapBackendItems`.
- `discoverAccountsFromStore(opts?: { dbPath?: string }): DiscoverResult | null`
  (synchronous — `node:sqlite` is sync):
  - `dbPath` default = `aiAccountsDbPath()`.
  - If the file doesn't exist → `null` (unavailable). Lazy
    `require('node:sqlite')`; if that throws (old Node) → `null`.
  - Open **read-only** (`new DatabaseSync(dbPath, { readOnly: true })` — exact
    camelCase per node:sqlite; never mutate the user's store), `SELECT kind,
    display_name, status, config FROM backends`. **Per-row** `JSON.parse(config)`
    in try/catch → a corrupt row is skipped (its item gets empty config →
    `mapBackendItems` routes it to `skipped`), NOT a whole-store failure (Codex
    P2). Open/query errors (`SQLITE_BUSY`, bad schema, can't open) → `null`.
    Always `db.close()` in a finally.
  - Reachable-but-empty (`backends` empty) → a `DiscoverResult` with empty
    accounts (NOT null) — same null-vs-empty contract as the API path.
- `aiAccountsDbPath(): string` — `process.env.AI_ACCOUNTS_DB` if set, else
  `path.join(process.env.AI_ACCOUNTS_DIR || path.join(os.homedir(),
  'Developer/Projects/ai-accounts'), 'apps/playground/playground.db')`.
- `discoverAccounts(opts?)` — **prefers the store**: `const s =
  discoverAccountsFromStore(opts); if (s) return s;` then, only if
  `process.env.AI_ACCOUNTS_URL || opts.baseUrl` is set, `return
  discoverAccountsFromApi(opts)`; else `return null`.

## Command + message changes (`lib/commands/accounts.ts`)

- Unchanged control flow (refuse-on-empty, dry-run, scheduler preserve).
- The unreachable message becomes store-oriented:
  `no ai-accounts store found at <dbPath> — set AI_ACCOUNTS_DB to your
  playground.db, or set AI_ACCOUNTS_URL to a running sidecar (loopback)`.
  Include the resolved `dbPath`.

## Files

- **Modify** `lib/account-discovery.ts` — `mapBackendItems`, `aiAccountsDbPath`,
  `discoverAccountsFromStore`, rename current to `discoverAccountsFromApi`, new
  `discoverAccounts` orchestrator (store-first). Keep exports back-compatible
  (`discoverAccounts` stays the entry point used by the command).
- **Modify** `lib/commands/accounts.ts` — store-oriented unreachable message
  (include resolved dbPath).
- **Modify** `tests/unit/account-discovery.test.ts`,
  `tests/unit/commands/accounts.test.ts`.

## Testing strategy

**Capability gate (Codex P2):** mapping + orchestrator tests always run; the
store-integration tests are gated behind `node:sqlite` availability
(`const hasSqlite = (() => { try { require('node:sqlite'); return true; } catch
{ return false; } })();` → `(hasSqlite ? describe : describe.skip)(...)`) so they
don't fail on Node 18/20 CI. With it, tests build a **real temp store**:

- `discoverAccountsFromStore`: create a temp `.db`, `CREATE TABLE backends(...)`,
  insert claude Personal1/Personal2 (ready) + gemini (unconfigured) + a row with
  **malformed `config` JSON** → `accounts.claude` has both abs dirs, gemini AND
  the malformed row both in `skipped` (per-row skip, not null); missing db file →
  null; empty `backends` → empty result (not null).
- **Read-only safety:** snapshot the db dir's file list + the db file mtime
  before discover; after, assert no new sidecar files (`-wal`/`-shm`) and an
  unchanged mtime (Codex P2).
- `mapBackendItems`: the existing API-shape assertions move here (kinds/dedup/
  expand/skip), proving store and API share semantics.
- `discoverAccounts` orchestrator: store present → returns store result without
  touching the API (inject a throwing `fetchImpl` and assert it's not called);
  store absent + no `AI_ACCOUNTS_URL` → null; store absent + `baseUrl` set →
  uses the API.
- `aiAccountsDbPath`: respects `AI_ACCOUNTS_DB`, then `AI_ACCOUNTS_DIR`, else the
  homedir default.
- `cmdAccountsSync`/`Discover`: inject `discover` dep (unchanged); the
  store-oriented message appears on null. Existing behavior tests stay green.

## Non-Goals

- Decrypting credentials (only config_path + status are read).
- Watching the store / auto-resync (still an explicit `gd accounts sync`).
- A hard dependency on `node:sqlite` (lazy + degrade for Node <22.5; API remains
  a fallback there).
