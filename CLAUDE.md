# GRD — Get Research Done

## Commands

### Context-Mode MCP (prefer over Bash/Read for large output)

| Tool                  | Use Instead Of          | Description                                              |
| --------------------- | ----------------------- | -------------------------------------------------------- |
| `ctx_batch_execute`   | Multiple Bash calls     | Run multiple commands + search results in ONE call       |
| `ctx_execute`         | Bash (>20 lines output) | Run code in sandbox; only printed summary enters context |
| `ctx_execute_file`    | Read/cat for analysis   | Read file into sandbox; process and print summary only   |
| `ctx_search`          | Grep (follow-up)        | Search previously indexed content with multiple queries  |
| `ctx_index`           | Read (large docs)       | Index markdown/docs into searchable knowledge base       |
| `ctx_fetch_and_index` | WebFetch                | Fetch URL, convert to markdown, index for search         |
| `ctx_stats`           | —                       | Show session context consumption statistics              |
| `ctx_doctor`          | —                       | Diagnose context-mode installation                       |
| `ctx_upgrade`         | —                       | Upgrade context-mode to latest version                   |

### Dev

| Command               | Description                 |
| --------------------- | --------------------------- |
| `npm test`            | Run all tests with coverage |
| `npm run test:unit`   | Unit tests only             |
| `npm run lint`        | ESLint on `bin/` and `lib/` |
| `npm run build:check` | Type-check (`tsc --noEmit`) |

Single test: `npx jest tests/unit/state.test.ts`
By name: `npx jest -t "should parse frontmatter"`

### GD CLI (`gd <command> [args] [--json]`)

| Command                | Description                      |
| ---------------------- | -------------------------------- |
| `gd progress`          | Project status and next action   |
| `gd state load`        | Load full project config + state |
| `gd plan-phase <N>`    | Plan a phase                     |
| `gd execute-phase <N>` | Execute a phase                  |
| `gd autopilot`         | Run phases autonomously          |
| `gd evolve`            | Self-improvement loop            |
| `gd quick <desc>`      | Ad-hoc task with GRD guarantees  |
| `gd health`            | Blockers, velocity, risk         |
| `gd settings`          | Configure workflow               |
| `gd metrics`           | Print in-memory counter snapshot |
| `gd help`              | Full command reference           |

## Architecture

- `bin/*.js` — Entry points (register tsx, load `.ts`). `bin/*.ts` — Actual implementations.
- `lib/` — 24 TypeScript modules + 4 subdirectories (`cli/`, `commands/`, `context/`, `evolve/`)
- `commands/` — 43 skill definitions (markdown). `agents/` — 20 subagent definitions (markdown).
- `tests/unit/` — One test file per `lib/` module. `tests/integration/` — CLI + E2E tests.
- `examples/` — Tutorial projects. `examples/taskmark/` — hands-on GRD tutorial (Quick + Deep paths).
- `.planning/` — Project plans, roadmap, state, and config. Read `.planning/STATE.md` first.

## Code Style

- TypeScript `strict: true`, CommonJS (`require`/`module.exports`, not ESM)
- `tsx` at entry points for direct `.ts` resolution — no CJS proxy files
- `'use strict'` at top of every file
- Prefix unused args with `_` (enforced by ESLint `no-unused-vars`)
- Zero `any` — use `Record<string, unknown>` or specific interfaces
- Typed require: `const { fn } = require('./module') as { fn: (arg: Type) => ReturnType }`

## Testing

- Tests mirror `lib/`: `lib/state.ts` → `tests/unit/state.test.ts`
- Per-file coverage thresholds in `jest.config.js` — do not lower them
- Pre-commit hook (optional, installed via `npm run hooks:install`) runs `gd scan` on staged markdown to block prompt injection patterns before commit. No other pre-commit hooks are installed by default.
- Timeout: 15s

## Backend Capabilities

Capability flags per backend. Source: `BACKEND_CAPABILITIES` in `lib/backend.ts`.

| Flag                        | claude   | codex | gemini | opencode |
| --------------------------- | -------- | ----- | ------ | -------- |
| `subagents`                 | true     | true  | true   | true     |
| `parallel`                  | true     | true  | true   | true     |
| `teams`                     | true     | true  | false  | false    |
| `hooks`                     | true     | true  | true   | true     |
| `mcp`                       | true     | true  | true   | true     |
| `native_worktree_isolation` | true     | false | false  | false    |
| `effort`                    | true     | false | false  | false    |
| `http_hooks`                | true     | false | false  | false    |
| `cron`                      | true     | false | false  | false    |
| `smart_approvals`           | false    | true  | false  | false    |
| `plan_mode`                 | false    | false | true   | false    |
| `sandbox_gvisor`            | false    | false | true   | false    |
| `sandbox_lxc`               | false    | false | false  | false    |
| `mcp_elicitation`           | true     | false | false  | false    |
| `model_overrides`           | true     | true  | true   | true     |
| `max_output_tokens`         | 64K/128K | null  | null   | null     |

## Agent Frontmatter

Three fields control per-agent behavior (Claude Code v2.1.68+ for `effort`):

- **`effort`** (`low` / `medium` / `high`) — Controls reasoning depth. Set per agent per profile from `EFFORT_PROFILES` in `lib/backend.ts`.
- **`maxTurns`** — Caps the number of turns an agent can take before stopping.
- **`disallowedTools`** — Restricts which tools an agent may call (e.g. `["Bash", "Write"]`).

### Effort Profiles (from EFFORT_PROFILES)

| Agent               | quality     | balanced   | budget |
| ------------------- | ----------- | ---------- | ------ |
| grd-planner         | high        | high       | low    |
| grd-executor        | high        | medium     | low    |
| grd-verifier        | medium      | low        | low    |
| grd-debugger        | high        | medium     | low    |
| grd-codebase-mapper | medium      | low        | low    |
| (others)            | high/medium | medium/low | low    |

### /effort Slash Command

- `/effort` (Claude Code v2.1.76+) lets users override effort level mid-session.
- GRD sets effort via agent frontmatter using `EFFORT_PROFILES`; user `/effort` overrides take precedence.
- A user can lower effort for fast iteration or raise it for thorough analysis, independent of GRD's profile system.

## Plugin Data

Clear boundary between project state and plugin state:

- **`.planning/`** — Project-scoped state: plans, roadmap, config, research, state. Lives in the repo, committed with the project.
- **`CLAUDE_PLUGIN_DATA`** — Plugin-scoped state that survives plugin updates. Used for cross-project config (scheduler state, evolve global config). Set by Claude Code, points to a persistent directory outside the project.
- Rule: project artifacts go in `.planning/`; plugin infrastructure goes in `CLAUDE_PLUGIN_DATA`.

## Backend-Specific Notes

### Codex CLI (v0.115.0+)

- Realtime websocket sessions and filesystem RPC capabilities are available but not currently used by GRD.
- Smart approvals (`smart_approvals: true`) route code review requests through a guardian subagent before applying changes.
- `CODEX_THREAD_ID` kept for backward compatibility; may be deprecated in newer versions.

### Gemini CLI (v0.31–v0.34)

- **v0.34**: Tracker CRUD MCP tools added; plan mode enabled by default (`plan_mode: true`).
- **v0.32**: Generalist agent added.
- **v0.31**: Browser agent added (experimental).
- A2A agent timeout increased to 30 minutes (was shorter in earlier versions).
- gVisor sandboxing available (`sandbox_gvisor: true`); LXC sandboxing not yet supported.

### OpenCode (v1.2.25–v1.2.27)

- **v1.2.27**: Fix for lost sessions across worktrees and orphan branches — directly relevant to GRD's worktree isolation mode.
- 5-minute chunk timeout (increased from 2 minutes in earlier versions).
- Multi-account workspace authentication support.
- Non-OpenAI Azure completions endpoint support.

### Token profile (Spec 4)

`token_profile` is a user preference in `.planning/config.json` orthogonal
to `model_profile`. Values: `frugal`, `balanced` (default), `quality`.
Controls adaptive model-tier downgrade under budget pressure or low task
complexity. Set via `gd settings token_profile <value>`.

- `quality`: never downgrade unless budget pressure is >=95% (critical).
- `balanced`: downgrade 0-2 steps based on (pressure, complexity).
- `frugal`: aggressively downgrade non-high-complexity tasks even at
  low pressure.

Budget pressure is classified as `none` / `warning` (>=60%) / `high`
(>=80%) / `critical` (>=95%) per account. Autopilot, evolve, and
autoresearch check this before each agent dispatch. Thresholds are
configurable via `.planning/config.json`
`scheduler.budget_pressure_thresholds`.

### AI account rotation

Account rotation lets users register multiple AI service accounts (e.g., personal + work Claude subscriptions) so the scheduler can route tasks to a healthy account when another hits a rate limit. Rotation interacts with `token_profile`: per-account budget pressure drives adaptive model-tier selection, and `max_wait_minutes` controls how long the scheduler blocks before falling back when all priority accounts are exhausted.

**Env var injected per backend:**

| Backend    | Env var injected         |
| ---------- | ------------------------ |
| `claude`   | `CLAUDE_CONFIG_DIR`      |
| `codex`    | `CODEX_HOME`             |
| `gemini`   | `GEMINI_CLI_HOME`        |
| `opencode` | `OPENCODE_CONFIG_DIR`    |
| `overstory`| `OVERSTORY_HOME`         |

**Example config shape** (`superpowers` key in `.planning/config.json`):

```json
"superpowers": {
  "account_rotation": true,
  "accounts": {
    "claude": [
      { "config_dir": "~/.claude-personal" },
      { "config_dir": "~/.claude-work" }
    ],
    "codex": [
      { "config_dir": "~/.codex-personal" }
    ]
  }
}
```

**Setup:** Use `gd init` (Round 5 interview) or `gd settings` (mention accounts/rotation/credentials). Do not edit the JSON directly.

**Authentication:** Authenticate each account via the standard CLI flow before using GRD — e.g. `CLAUDE_CONFIG_DIR=~/.claude-work claude auth login`. GRD handles routing only; OAuth is handled by the backend CLI.

### LLM fallback for phase completion (Spec 3B)

`phase_complete_llm_fallback` is an opt-in config flag (default `false`).
When `true`, both `gd autopilot`'s phase-finalize step and `gd phase complete N`
fall back to asking Claude to perform the ROADMAP.md and STATE.md edits
directly via the scheduler, if the regex-based mechanical path throws or
gate-fails. Verification is shallow: ROADMAP.md is re-read and checked for a
ticked `- [x] Phase N` checkbox.

Set via `gd settings phase_complete_llm_fallback true`. Opt-in only —
existing users see no change.

The fallback respects `token_profile`, budget pressure, and the idle
watchdog just like any other scheduler spawn.

### Scheduler idle watchdog (Spec 2B)

`scheduler.idle_timeout_seconds` (default 900) kills a spawned backend
subprocess if it produces no stdout/stderr data for the configured
number of seconds. Distinct from the total-timeout upper bound: the
idle timeout only fires when the subprocess is completely silent, so
legitimate streaming inference is unaffected. On trip: SIGTERM →
5-second grace → SIGKILL. Result carries `idleTimedOut: true` flag
so callers can distinguish idle-kills from total-timeout kills.

Per-backend overrides are available via
`SchedulerConfig.idle_timeout_seconds_by_backend` (e.g. set a higher
limit for `gemini` if it batches output less frequently).

### In-process metrics (Spec gsd-2 follow-up)

`gd metrics` prints a JSON snapshot of in-memory counters for the
current process. Counters reset on each `gd` invocation; they are
most useful in long-running `gd autopilot` sessions. Tracked events:

- `scheduler.pressure_transitions.<level>` — budget pressure level changes
- `scheduler.idle_kills_total` — idle watchdog trips
- `phase_complete_llm_fallback.attempts_total` — LLM fallback phase-complete attempts
- `phase_complete_llm_fallback.successes_total` — successful LLM fallback completions

## Autoresearch Loop (`lib/research/`)

The scientific loop: `gd research "<q>"` runs SEED→GROUND→HYPOTHESIZE→DESIGN→RUN→MEASURE→
LEARN→DECIDE→PERSIST→FINALIZE in `.planning/research/threads/<id>/`, with two default-on
checkpoint gates (execute, kg_write). `gd ingest <md>` + `gd synthesize "<topic>"` feed a
Tesserae knowledge graph (compiled via the `TesseraeClient` adapter; never edit graph.json
by hand). The hypothesizer grounds on the Tesserae KG via MCP (LANDSCAPE/KNOWHOW are
deprecated for the loop's grounding).

### Insight → hypothesis seeding (SP2-C)

`gd synthesize "<topic>"` auto-emits ranked candidate hypotheses (a `__CANDIDATES__` block
after `__SYNTHESIS__`), seeds one research thread per candidate (capped by
`research_max_candidates`, default 3 — a top-level `config.json` key), and auto-runs only the
#1-ranked thread (which pauses at the default execute gate). Seeded hypotheses carry
`origin: 'synthesis'` + `sourceNodeIds` (KG provenance); the orchestrator adopts them
directly, skipping the cold HYPOTHESIZE spawn. Idempotent via
`.planning/research/seed-manifest.json` plus a thread-scan fallback. Remaining candidates wait
for `gd research resume <id>`.

### Remote ingestion (arXiv / web)

`gd ingest <arg>` auto-detects the argument: an existing local `.md` path (ingested as today),
an arXiv id/URL (`2401.12345`, `arxiv:<id>`, `arxiv.org/abs|pdf/<id>` → fetched via the
dependency-free Atom API as title/authors/abstract markdown), or an `http(s)` URL (fetched and
converted to markdown via lazy-loaded readability+turndown+jsdom; arXiv stays dep-free). Remote
sources are normalized to a deterministic staging file at `.planning/fetched/<slug>.md`
(committed; provenance in `.planning/fetched/fetch-manifest.json`) **outside** the compile root,
then run through the normal `ingest()` pipeline. A best-effort SSRF guard (`lib/research/url-guard.ts`)
blocks non-http(s) schemes, credentials-in-URL, and loopback/private/link-local/metadata hosts
(all IP encodings) on the initial URL and every redirect hop.

`gd ingest` also accepts a **PDF** (local `.pdf`, a direct `.pdf` URL, or `gd ingest --pdf
<arxiv-id|url>` to fetch + extract an arXiv paper's body via pdfjs-dist, lazy-loaded through a
dynamic ESM import in `lib/research/pdf.ts`) and a **Claude Code / Codex session transcript**
(`.jsonl` → readable markdown via the GRD-native parser in `lib/research/session.ts`). Both
normalize to a staging `.md` and run through the same pipeline. arXiv ids/URLs without `--pdf`
stay metadata-only. Suffix-based `.pdf`/`.jsonl` detection runs before the existing-path check.

### Hybrid retrieval (SP2-D)

`gd retrieve "<query>"` runs a deterministic hybrid retriever over the compiled `graph.json`:
lexical (BM25-lite) + graph-structure (PPR-lite over edges) + optional semantic (cosine over
embeddings), fused via Reciprocal Rank Fusion. The orchestrator (cold HYPOTHESIZE) and
`gd synthesize` inject the top-K as a grounding pack into the agent prompt — augmenting, not
replacing, the agent's Tesserae MCP grounding. Retrieval degrades gracefully (missing graph,
no embedder → it never blocks the loop). Semantic mode is **opt-in**: it embeds via an
OpenAI-compatible endpoint only when `GRD_EMBED_API_KEY` (or `OPENAI_API_KEY`) is set
(`GRD_EMBED_MODEL`/`GRD_EMBED_URL` optional) — otherwise zero network egress. Node vectors are
cached in `.planning/research/.embeddings.json` (gitignored) by content hash.

### Plateau re-survey (loop deepening #1)

When the loop plateaus (`research_plateau_window` consecutive non-supported verdicts, default 3),
the orchestrator triggers a **re-survey** instead of drifting to `exhausted`: it bumps
`resurveyCount`, extends `maxIterations` by the window (hard ceiling
`baseMaxIterations + research_max_resurveys × window`, default cap 2), and pivots the next
hypothesis — one widened hybrid retrieval (k=16, query augmented with takeaways) plus a "PLATEAU,
pivot hard" prompt directive. With `research_resurvey_fetch: true` it also spawns `grd-surveyor`
to fetch+ingest up to 3 new sources first (degrades fully on any failure). Config keys
`research_max_resurveys` / `research_plateau_window` / `research_resurvey_fetch` are top-level,
read raw, and registered in KNOWN_CONFIG_KEYS.

### Paper-draft generation (loop deepening #2)

`gd research report <id>` turns a **completed** thread (status supported/exhausted/abandoned)
into a publication-style `PAPER.md`. `lib/research/paper.ts` deterministically gathers a
`PaperBundle` (question, supported hypothesis, full ledger, per-iteration plan+metrics+verdict,
takeaways, and SP2-D Related Work via `retrieve`), then spawns `grd-paper-writer` which emits a
`__PAPER__` markdown block (Abstract→Future Work). Honest by contract: an exhausted thread is
written up as a negative/inconclusive result. Related Work degrades to empty if retrieval fails;
non-terminal threads are refused. Written atomically (temp+rename), regenerated on each call.

### Eval-report augmentation (MEASURE, opt-in)

With `research_eval_report: true` (default false), after the deterministic
verdict and AFTER branch/termination are computed, the loop spawns a dedicated
read-only `grd-research-evaluator` (Read/Grep/Glob only — cannot re-run or mutate
anything) to write a per-iteration `experiments/<iter>/EVAL.md` from the
already-collected `result.json` metrics (`lib/research/eval.ts`). The agent emits
an `__EVAL__`…`__END_EVAL__` markdown block; the orchestrator is the only writer.
The deterministic `evaluateVerdict` remains the sole authority for
verdict/branch/terminate (LLM-judged core-path scoring is a registered
dead-end) — this is purely an additive, degrade-safe human-facing report.

### Knowledge promotion (LEARN → shared KB)

At PERSIST (inside `finishKgSync`, after the `kg_write` gate — so both the
`runLoop` finalize path and the `resumeResearch` kg_write-resume path are
covered), a terminal thread's takeaways are promoted into the shared project
knowledge base via `lib/research/promote.ts`: positive takeaways (kinds
success_pattern/constraint/domain_fact/tool_pattern, confidence ≥ 0.5) →
`KNOWHOW.md` (`appendKnowhowEntries`, dedup by pattern_name); refuted ledger
hypotheses → `.planning/DEAD-ENDS.md` via the existing `lib/dead-ends.ts`
`addDeadEnd` (approach-schema, slug-merge, the file the hypothesizer reads to
avoid re-proposing dead approaches). Provenance is tagged
`source: research:<id>#iterN` / `tried_in_phases: research:<id>#iterN`.
Default-on; disable with `research_persist_knowledge: false`. Fully
degrade-safe — any failure logs and returns zeros, never breaking the loop.

### Docker experiment sandbox (RUN station)

The RUN station can run each experiment script inside a Docker container instead
of as a host subprocess. Opt in with `research_sandbox: "docker"` (top-level
config key, read raw via `readSandboxConfig` in `lib/research/docker-runner.ts`).
`selectRunner(cwd, …)` picks the runner: docker when configured **and** the
daemon probe (`docker version`) succeeds, else it degrades to the subprocess
runner with a loud `UNSANDBOXED` stderr warning (the actual runner is recorded
in `result.json` as `runner: subprocess|docker`). The container runs with a
tight posture: only the iteration dir bind-mounted RW at `/work`, `--network
none`, `--read-only` rootfs + `--tmpfs /tmp`, `--cap-drop ALL`,
`--security-opt no-new-privileges`, `--ipc none`, non-root `--user` on POSIX,
`--memory`/`--cpus`/`--pids-limit` caps, `--entrypoint` pinned to bash/python3,
and a force-remove on timeout. `plan.scriptPath` is realpath-contained under the
thread dir and `research_sandbox_image` is reference-validated (no flag
injection). Config keys: `research_sandbox`, `research_sandbox_image`,
`research_sandbox_memory` (default `512m`), `research_sandbox_cpus` (default
`1`), `research_sandbox_network` (`none`|`bridge`). Defaults to slim images
(`python:3.12-slim` / `bash:5`).

### Multi-thread portfolio (loop deepening #3)

`gd research portfolio [ids...] [--topic <id>] [--concurrency N] [--force] [--no-gates]` advances a
set of existing threads with bounded concurrency (default `research_portfolio_concurrency`=2) and
writes a ranked `.planning/research/PORTFOLIO.md`. It runs only **safely-resumable** threads (paused,
or active-at-`seed`); interrupted (`active` mid-station) / `error` threads are skipped+reported unless
`--force`. All threads share ONE scheduler `spawn`, ONE retriever, and ONE mutex-wrapped `kgClient`
(so the `kg_write` compile serializes — via `ResearchOptions.kgClient`). Per-thread failures are
isolated (envelopes); only a report-write failure exits non-zero. Default selection = all threads;
`--topic` = the SP2-C synthesis-seeded set. The compile lock is process-local (not a global KG lock).

## Gotchas

- **zsh `!` escaping**: Never use `node -e` with `!=`/`!==` — zsh mangles them. Use `gd` subcommands instead of ad-hoc JSON parsing.
- **CLI output**: `gd` tool commands output JSON by default (`--json` flag, `--raw` for plain text via grd-tools).
- **Config**: `.planning/config.json` controls all workflow behavior (gates, scheduler, ceremony, tracker, code review).

<!-- Managed by HarnessSync -->
# Rules synced from Claude Code

<!-- [harness-sync:start source=CLAUDE.md line=1-250] -->
# [Project rules from CLAUDE.md]

# GRD — Get Research Done

## Commands

### Context-Mode MCP (prefer over Bash/Read for large output)

| Tool                  | Use Instead Of          | Description                                              |
| --------------------- | ----------------------- | -------------------------------------------------------- |
| `ctx_batch_execute`   | Multiple Bash calls     | Run multiple commands + search results in ONE call       |
| `ctx_execute`         | Bash (>20 lines output) | Run code in sandbox; only printed summary enters context |
| `ctx_execute_file`    | Read/cat for analysis   | Read file into sandbox; process and print summary only   |
| `ctx_search`          | Grep (follow-up)        | Search previously indexed content with multiple queries  |
| `ctx_index`           | Read (large docs)       | Index markdown/docs into searchable knowledge base       |
| `ctx_fetch_and_index` | WebFetch                | Fetch URL, convert to markdown, index for search         |
| `ctx_stats`           | —                       | Show session context consumption statistics              |
| `ctx_doctor`          | —                       | Diagnose context-mode installation                       |
| `ctx_upgrade`         | —                       | Upgrade context-mode to latest version                   |

### Dev

| Command               | Description                 |
| --------------------- | --------------------------- |
| `npm test`            | Run all tests with coverage |
| `npm run test:unit`   | Unit tests only             |
| `npm run lint`        | ESLint on `bin/` and `lib/` |
| `npm run build:check` | Type-check (`tsc --noEmit`) |

Single test: `npx jest tests/unit/state.test.ts`
By name: `npx jest -t "should parse frontmatter"`

### GD CLI (`gd <command> [args] [--json]`)

| Command                | Description                      |
| ---------------------- | -------------------------------- |
| `gd progress`          | Project status and next action   |
| `gd state load`        | Load full project config + state |
| `gd plan-phase <N>`    | Plan a phase                     |
| `gd execute-phase <N>` | Execute a phase                  |
| `gd autopilot`         | Run phases autonomously          |
| `gd evolve`            | Self-improvement loop            |
| `gd quick <desc>`      | Ad-hoc task with GRD guarantees  |
| `gd health`            | Blockers, velocity, risk         |
| `gd settings`          | Configure workflow               |
| `gd metrics`           | Print in-memory counter snapshot |
| `gd help`              | Full command reference           |

## Architecture

- `bin/*.js` — Entry points (register tsx, load `.ts`). `bin/*.ts` — Actual implementations.
- `lib/` — 24 TypeScript modules + 4 subdirectories (`cli/`, `commands/`, `context/`, `evolve/`)
- `commands/` — 43 skill definitions (markdown). `agents/` — 20 subagent definitions (markdown).
- `tests/unit/` — One test file per `lib/` module. `tests/integration/` — CLI + E2E tests.
- `examples/` — Tutorial projects. `examples/taskmark/` — hands-on GRD tutorial (Quick + Deep paths).
- `.planning/` — Project plans, roadmap, state, and config. Read `.planning/STATE.md` first.

## Code Style

- TypeScript `strict: true`, CommonJS (`require`/`module.exports`, not ESM)
- `tsx` at entry points for direct `.ts` resolution — no CJS proxy files
- `'use strict'` at top of every file
- Prefix unused args with `_` (enforced by ESLint `no-unused-vars`)
- Zero `any` — use `Record<string, unknown>` or specific interfaces
- Typed require: `const { fn } = require('./module') as { fn: (arg: Type) => ReturnType }`

## Testing

- Tests mirror `lib/`: `lib/state.ts` → `tests/unit/state.test.ts`
- Per-file coverage thresholds in `jest.config.js` — do not lower them
- Pre-commit hook (optional, installed via `npm run hooks:install`) runs `gd scan` on staged markdown to block prompt injection patterns before commit. No other pre-commit hooks are installed by default.
- Timeout: 15s

## Backend Capabilities

Capability flags per backend. Source: `BACKEND_CAPABILITIES` in `lib/backend.ts`.

| Flag                        | claude   | codex | gemini | opencode |
| --------------------------- | -------- | ----- | ------ | -------- |
| `subagents`                 | true     | true  | true   | true     |
| `parallel`                  | true     | true  | true   | true     |
| `teams`                     | true     | true  | false  | false    |
| `hooks`                     | true     | true  | true   | true     |
| `mcp`                       | true     | true  | true   | true     |
| `native_worktree_isolation` | true     | false | false  | false    |
| `effort`                    | true     | false | false  | false    |
| `http_hooks`                | true     | false | false  | false    |
| `cron`                      | true     | false | false  | false    |
| `smart_approvals`           | false    | true  | false  | false    |
| `plan_mode`                 | false    | false | true   | false    |
| `sandbox_gvisor`            | false    | false | true   | false    |
| `sandbox_lxc`               | false    | false | false  | false    |
| `mcp_elicitation`           | true     | false | false  | false    |
| `model_overrides`           | true     | true  | true   | true     |
| `max_output_tokens`         | 64K/128K | null  | null   | null     |

## Agent Frontmatter

Three fields control per-agent behavior (Claude Code v2.1.68+ for `effort`):

- **`effort`** (`low` / `medium` / `high`) — Controls reasoning depth. Set per agent per profile from `EFFORT_PROFILES` in `lib/backend.ts`.
- **`maxTurns`** — Caps the number of turns an agent can take before stopping.
- **`disallowedTools`** — Restricts which tools an agent may call (e.g. `["Bash", "Write"]`).

### Effort Profiles (from EFFORT_PROFILES)

| Agent               | quality     | balanced   | budget |
| ------------------- | ----------- | ---------- | ------ |
| grd-planner         | high        | high       | low    |
| grd-executor        | high        | medium     | low    |
| grd-verifier        | medium      | low        | low    |
| grd-debugger        | high        | medium     | low    |
| grd-codebase-mapper | medium      | low        | low    |
| (others)            | high/medium | medium/low | low    |

### /effort Slash Command

- `/effort` (Claude Code v2.1.76+) lets users override effort level mid-session.
- GRD sets effort via agent frontmatter using `EFFORT_PROFILES`; user `/effort` overrides take precedence.
- A user can lower effort for fast iteration or raise it for thorough analysis, independent of GRD's profile system.

## Plugin Data

Clear boundary between project state and plugin state:

- **`.planning/`** — Project-scoped state: plans, roadmap, config, research, state. Lives in the repo, committed with the project.
- **`CLAUDE_PLUGIN_DATA`** — Plugin-scoped state that survives plugin updates. Used for cross-project config (scheduler state, evolve global config). Set by Claude Code, points to a persistent directory outside the project.
- Rule: project artifacts go in `.planning/`; plugin infrastructure goes in `CLAUDE_PLUGIN_DATA`.

## Backend-Specific Notes

### Codex CLI (v0.115.0+)

- Realtime websocket sessions and filesystem RPC capabilities are available but not currently used by GRD.
- Smart approvals (`smart_approvals: true`) route code review requests through a guardian subagent before applying changes.
- `CODEX_THREAD_ID` kept for backward compatibility; may be deprecated in newer versions.

### Gemini CLI (v0.31–v0.34)

- **v0.34**: Tracker CRUD MCP tools added; plan mode enabled by default (`plan_mode: true`).
- **v0.32**: Generalist agent added.
- **v0.31**: Browser agent added (experimental).
- A2A agent timeout increased to 30 minutes (was shorter in earlier versions).
- gVisor sandboxing available (`sandbox_gvisor: true`); LXC sandboxing not yet supported.

### OpenCode (v1.2.25–v1.2.27)

- **v1.2.27**: Fix for lost sessions across worktrees and orphan branches — directly relevant to GRD's worktree isolation mode.
- 5-minute chunk timeout (increased from 2 minutes in earlier versions).
- Multi-account workspace authentication support.
- Non-OpenAI Azure completions endpoint support.

### Token profile (Spec 4)

`token_profile` is a user preference in `.planning/config.json` orthogonal
to `model_profile`. Values: `frugal`, `balanced` (default), `quality`.
Controls adaptive model-tier downgrade under budget pressure or low task
complexity. Set via `gd settings token_profile <value>`.

- `quality`: never downgrade unless budget pressure is >=95% (critical).
- `balanced`: downgrade 0-2 steps based on (pressure, complexity).
- `frugal`: aggressively downgrade non-high-complexity tasks even at
  low pressure.

Budget pressure is classified as `none` / `warning` (>=60%) / `high`
(>=80%) / `critical` (>=95%) per account. Autopilot, evolve, and
autoresearch check this before each agent dispatch. Thresholds are
configurable via `.planning/config.json`
`scheduler.budget_pressure_thresholds`.

### AI account rotation

Account rotation lets users register multiple AI service accounts (e.g., personal + work Claude subscriptions) so the scheduler can route tasks to a healthy account when another hits a rate limit. Rotation interacts with `token_profile`: per-account budget pressure drives adaptive model-tier selection, and `max_wait_minutes` controls how long the scheduler blocks before falling back when all priority accounts are exhausted.

**Env var injected per backend:**

| Backend    | Env var injected         |
| ---------- | ------------------------ |
| `claude`   | `CLAUDE_CONFIG_DIR`      |
| `codex`    | `CODEX_HOME`             |
| `gemini`   | `GEMINI_CLI_HOME`        |
| `opencode` | `OPENCODE_CONFIG_DIR`    |
| `overstory`| `OVERSTORY_HOME`         |

**Example config shape** (`superpowers` key in `.planning/config.json`):

```json
"superpowers": {
  "account_rotation": true,
  "accounts": {
    "claude": [
      { "config_dir": "~/.claude-personal" },
      { "config_dir": "~/.claude-work" }
    ],
    "codex": [
      { "config_dir": "~/.codex-personal" }
    ]
  }
}
```

**Setup:** Use `gd init` (Round 5 interview) or `gd settings` (mention accounts/rotation/credentials). Do not edit the JSON directly.

**Authentication:** Authenticate each account via the standard CLI flow before using GRD — e.g. `CLAUDE_CONFIG_DIR=~/.claude-work claude auth login`. GRD handles routing only; OAuth is handled by the backend CLI.

### LLM fallback for phase completion (Spec 3B)

`phase_complete_llm_fallback` is an opt-in config flag (default `false`).
When `true`, both `gd autopilot`'s phase-finalize step and `gd phase complete N`
fall back to asking Claude to perform the ROADMAP.md and STATE.md edits
directly via the scheduler, if the regex-based mechanical path throws or
gate-fails. Verification is shallow: ROADMAP.md is re-read and checked for a
ticked `- [x] Phase N` checkbox.

Set via `gd settings phase_complete_llm_fallback true`. Opt-in only —
existing users see no change.

The fallback respects `token_profile`, budget pressure, and the idle
watchdog just like any other scheduler spawn.

### Scheduler idle watchdog (Spec 2B)

`scheduler.idle_timeout_seconds` (default 900) kills a spawned backend
subprocess if it produces no stdout/stderr data for the configured
number of seconds. Distinct from the total-timeout upper bound: the
idle timeout only fires when the subprocess is completely silent, so
legitimate streaming inference is unaffected. On trip: SIGTERM →
5-second grace → SIGKILL. Result carries `idleTimedOut: true` flag
so callers can distinguish idle-kills from total-timeout kills.

Per-backend overrides are available via
`SchedulerConfig.idle_timeout_seconds_by_backend` (e.g. set a higher
limit for `gemini` if it batches output less frequently).

### In-process metrics (Spec gsd-2 follow-up)

`gd metrics` prints a JSON snapshot of in-memory counters for the
current process. Counters reset on each `gd` invocation; they are
most useful in long-running `gd autopilot` sessions. Tracked events:

- `scheduler.pressure_transitions.<level>` — budget pressure level changes
- `scheduler.idle_kills_total` — idle watchdog trips
- `phase_complete_llm_fallback.attempts_total` — LLM fallback phase-complete attempts
- `phase_complete_llm_fallback.successes_total` — successful LLM fallback completions

## Gotchas

- **zsh `!` escaping**: Never use `node -e` with `!=`/`!==` — zsh mangles them. Use `gd` subcommands instead of ad-hoc JSON parsing.
- **CLI output**: `gd` tool commands output JSON by default (`--json` flag, `--raw` for plain text via grd-tools).
- **Config**: `.planning/config.json` controls all workflow behavior (gates, scheduler, ceremony, tracker, code review).

<!-- [harness-sync:end] -->

---
*Last synced by HarnessSync: 2026-05-24 15:13:13 UTC*
<!-- End HarnessSync managed content -->