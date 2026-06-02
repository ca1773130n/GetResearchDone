# GRD — Get Research Done

GRD is an autoresearch + R&D engineering harness (a CLI and a Claude Code plugin).
It runs a hypothesis → experiment → measure → learn loop, and a survey → plan →
execute → verify phase workflow, with closed-loop self-monitoring (falsifiable
reflections, a `DEAD-ENDS` registry, a drift score, a strategy GENOME).

## Commands

### Dev

| Command | Description |
|---|---|
| `npm test` | Full suite (ts-jest, ~5000 tests, with coverage) |
| `npm run test:unit` | Unit tests only |
| `npm run lint` | ESLint on `bin/` and `lib/` |
| `npm run build:check` | `tsc --noEmit` |

Single test: `npx jest tests/unit/<file>.test.ts` · by name: `npx jest -t "<substr>"`.

**Test hygiene (important):** some test helpers call `fs.mkdtempSync('grd-…')`
with a *relative* prefix, so they create temp dirs in the CWD (repo root) and
never clean up — `npm test` floods the root with thousands of gitignored
`grd-*`/`tsx-*` dirs. Run tests with `TMPDIR` set outside the repo, or clean after:
`find . -maxdepth 1 -type d -name 'grd-*' -exec rm -rf {} +`.

### gd CLI

`gd <command> [args] [--json|--raw]` — tool commands output JSON by default,
`--raw` for human text. Core: `progress`, `plan-phase N`, `execute-phase N`,
`autopilot`, `evolve`, `quick "<desc>"`, `health`, `settings`, `metrics`, `help`.
Research: `research "<q>"` (+ `resume <id>` / `status` / `report <id>` /
`portfolio`), `ingest <md|arxiv|url|pdf|jsonl>`, `synthesize "<topic>"`,
`retrieve "<q>"`, `accounts discover|sync`.

### Context-mode MCP

Prefer `ctx_*` MCP tools over Bash/Read for large output (`ctx_batch_execute`,
`ctx_execute`, `ctx_search`, `ctx_fetch_and_index`). `curl`/`wget`/inline-HTTP/
`WebFetch` are intercepted — use `ctx_fetch_and_index` / `ctx_execute` instead.

## Architecture

- `bin/*.ts` — CLIs (`gd.ts`, `grd-tools.ts`, `grd-mcp-server.ts`). `bin/*.js` are
  thin tsx-loader proxies (no compile step for dev).
- `lib/` — 25+ TypeScript modules:
  - `lib/research/` — the autoresearch loop: `orchestrator`, `ingest`,
    `synthesize`, `retrieve`, `runner`/`docker-runner`, `promote`, `eval`,
    `paper`, `portfolio`, `account-discovery`.
  - `lib/scheduler.ts` — cross-backend rate-limit scheduler + account rotation.
  - `lib/evolve/`, `lib/commands/`, `lib/context/`.
- `commands/` — skill markdown. `agents/` — subagent definitions.
- `tests/unit/` mirrors `lib/` (`lib/x.ts` → `tests/unit/x.test.ts`).
- `.planning/` — project state (plans, roadmap, config, research threads).
  `CLAUDE_PLUGIN_DATA` — cross-project plugin state (outside the repo).

## Code style

TypeScript `strict`; CommonJS (`require`/`module.exports`; `import type` allowed,
no ESM); zero `any` (use `Record<string, unknown>` or specific interfaces);
`'use strict'` first line; unused args prefixed `_`; typed requires
(`const { fn } = require('./m') as { fn: (a: T) => R }`).

## Testing

Tests mirror `lib/`. Per-file coverage thresholds live in `jest.config.js` — do
not lower them. Inject dependencies (`spawn` / `runner` / `fetchImpl` / clients)
for offline, deterministic tests. Timeout 15s.

## Autoresearch loop (`lib/research/`)

`gd research "<q>"` runs SEED → GROUND → HYPOTHESIZE → DESIGN → RUN → MEASURE →
LEARN → DECIDE → PERSIST → FINALIZE under two default-on gates (`execute`,
`kg_write`). The verdict is **deterministic** (metric/comparator/target) — no
LLM-judged scoring on the control path. Grounds on a Tesserae knowledge graph
(built via `gd ingest` + `gd synthesize`) plus hybrid retrieval. The scheduler
does account rotation + rate-limit detection (claude reports limits/logged-out as
exit-0 JSON — detected via `detectFromStdout`). Top-level `.planning/config.json`
keys: `research_gates`, `research_max_candidates`, `research_max_resurveys`,
`research_plateau_window`, `research_resurvey_fetch`, `research_portfolio_concurrency`,
`research_sandbox` (+ `_image`/`_memory`/`_cpus`/`_network`),
`research_persist_knowledge`, `research_eval_report`, `research_spawn_retries`.
Account rotation: `superpowers.{account_rotation, accounts, default_backend}` —
each account's `config_dir` is injected as `CLAUDE_CONFIG_DIR`/`CODEX_HOME`, so
use **absolute** paths (`~` is not expanded). `gd accounts sync` populates this
from a local ai-accounts store. Full walkthrough: `docs/autoresearch-tutorial.md`.

## Gotchas

- **Never create test/scratch artifacts in the repo.** Run live `gd research` /
  smoke tests in a throwaway `mktemp -d` (with its own `.planning/`); they
  otherwise drop `.planning/research/threads/`, a root `KNOWHOW.md`, and mutate
  `.planning/DEAD-ENDS.md`. Scratch logs go in `/tmp`.
- zsh `!` escaping: never use `node -e` with `!=`/`!==` — use `gd` subcommands.
- `.planning/config.json` controls all workflow behavior (gates, scheduler, ceremony).
- Claude OAuth lives in the macOS Keychain, not files; `~/.claude*` dirs hold
  settings only.
