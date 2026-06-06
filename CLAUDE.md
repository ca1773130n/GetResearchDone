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
`research_persist_knowledge`, `research_eval_report`, `research_spawn_retries`;
harness (life-harness rounds: `autonomy`, `kill_switch`, `min_confidence`,
`min_interval_hours`, `allowed_targets`, `backend`, `min/max_evidence`).
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

# context-mode — MANDATORY routing rules

You have context-mode MCP tools available. These rules are NOT optional — they protect your context window from flooding. A single unrouted command can dump 56 KB into context and waste the entire session.

## BLOCKED commands — do NOT attempt these

### curl / wget — BLOCKED
Any Bash command containing `curl` or `wget` is intercepted and replaced with an error message. Do NOT retry.
Instead use:
- `ctx_fetch_and_index(url, source)` to fetch and index web pages
- `ctx_execute(language: "javascript", code: "const r = await fetch(...)")` to run HTTP calls in sandbox

### Inline HTTP — BLOCKED
Any Bash command containing `fetch('http`, `requests.get(`, `requests.post(`, `http.get(`, or `http.request(` is intercepted and replaced with an error message. Do NOT retry with Bash.
Instead use:
- `ctx_execute(language, code)` to run HTTP calls in sandbox — only stdout enters context

### WebFetch — BLOCKED
WebFetch calls are denied entirely. The URL is extracted and you are told to use `ctx_fetch_and_index` instead.
Instead use:
- `ctx_fetch_and_index(url, source)` then `ctx_search(queries)` to query the indexed content

## REDIRECTED tools — use sandbox equivalents

### Bash (>20 lines output)
Bash is ONLY for: `git`, `mkdir`, `rm`, `mv`, `cd`, `ls`, `npm install`, `pip install`, and other short-output commands.
For everything else, use:
- `ctx_batch_execute(commands, queries)` — run multiple commands + search in ONE call
- `ctx_execute(language: "shell", code: "...")` — run in sandbox, only stdout enters context

### Read (for analysis)
If you are reading a file to **Edit** it → Read is correct (Edit needs content in context).
If you are reading to **analyze, explore, or summarize** → use `ctx_execute_file(path, language, code)` instead. Only your printed summary enters context. The raw file content stays in the sandbox.

### Grep (large results)
Grep results can flood context. Use `ctx_execute(language: "shell", code: "grep ...")` to run searches in sandbox. Only your printed summary enters context.

## Tool selection hierarchy

1. **GATHER**: `ctx_batch_execute(commands, queries)` — Primary tool. Runs all commands, auto-indexes output, returns search results. ONE call replaces 30+ individual calls.
2. **FOLLOW-UP**: `ctx_search(queries: ["q1", "q2", ...])` — Query indexed content. Pass ALL questions as array in ONE call.
3. **PROCESSING**: `ctx_execute(language, code)` | `ctx_execute_file(path, language, code)` — Sandbox execution. Only stdout enters context.
4. **WEB**: `ctx_fetch_and_index(url, source)` then `ctx_search(queries)` — Fetch, chunk, index, query. Raw HTML never enters context.
5. **INDEX**: `ctx_index(content, source)` — Store content in FTS5 knowledge base for later search.

## Subagent routing

When spawning subagents (Agent/Task tool), the routing block is automatically injected into their prompt. Bash-type subagents are upgraded to general-purpose so they have access to MCP tools. You do NOT need to manually instruct subagents about context-mode.

## Output constraints

- Keep responses under 500 words.
- Write artifacts (code, configs, PRDs) to FILES — never return them as inline text. Return only: file path + 1-line description.
- When indexing content, use descriptive source labels so others can `ctx_search(source: "label")` later.

## ctx commands

| Command | Action |
|---------|--------|
| `ctx stats` | Call the `ctx_stats` MCP tool and display the full output verbatim |
| `ctx doctor` | Call the `ctx_doctor` MCP tool, run the returned shell command, display as checklist |
| `ctx upgrade` | Call the `ctx_upgrade` MCP tool, run the returned shell command, display as checklist |
