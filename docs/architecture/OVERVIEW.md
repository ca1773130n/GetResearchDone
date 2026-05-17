# GRD Architecture Overview

GRD (Get Research Done) is an R&D project orchestrator CLI that drives AI coding backends (Claude Code, Codex, Gemini, OpenCode) through agent-based workflows. It manages multi-phase project lifecycles — from planning and execution to verification and evaluation — using a deterministic Node.js orchestration layer that spawns LLM subprocesses. Version 0.3.24, licensed privately.

---

## Top-Level Directory Layout

| Directory | Contents | Purpose |
|---|---|---|
| `bin/` | 10 files (5 `.js` + 5 `.ts` pairs) | Entry points: `gd.js/ts` (main CLI), `grd-tools.js/ts` (tool dispatch), `grd-mcp-server.js/ts` (MCP server), `grd-manifest.js/ts`, `postinstall.js/ts` |
| `lib/` | 38 `.ts` root files + 6 subdirectories | All runtime logic — see Module Categories below |
| `commands/` | 43 `.md` skill definitions | One markdown file per user-facing command; defines agent prompt, usage, frontmatter |
| `agents/` | 22 `.md` subagent definitions | One file per named subagent (grd-planner, grd-executor, etc.) with frontmatter for `effort`, `maxTurns`, `disallowedTools` |
| `tests/unit/` | ~55 test files | Mirror of `lib/` — one test file per module |
| `tests/integration/` | ~19 test files | CLI integration, E2E workflow, and scheduler tests |
| `docs/` | Architecture docs, CHANGELOG, specs, plans | Human-facing documentation; `docs/superpowers/specs/` holds milestone design specs |
| `.planning/` | `ROADMAP.md`, `STATE.md`, `config.json`, `milestones/`, `REQUIREMENTS.md`, `EVOLVE-STATE.json`, etc. | All project-scoped runtime state — committed to the repo, read/written by GRD at execution time |

---

## Entry Points and Command Dispatch

**`bin/gd.js`** is a 3-line CJS shim: it registers `tsx/cjs` (enabling direct `.ts` resolution without a build step) and delegates to `bin/gd.ts`. This is the pattern for all `bin/*.js` files — they are thin shims, never contain logic.

**`bin/gd.ts`** is the actual CLI entry point. It:

1. Calls `parseFlags(process.argv.slice(2))` from `lib/cli/index.ts` to extract named flags (`--json`, `--verbose`, `--backend`, `--model`, `--cwd`) and positional args.
2. Calls `classifyCommand(command, subcommand)` — also from `lib/cli/index.ts` — which returns `'tool'`, `'agent'`, or `'unknown'` by consulting two static `Set` objects: `TOOL_COMMANDS` (~50 entries) and `AGENT_COMMANDS` (~42 entries).
3. Routes to either `runToolCommand()` (`lib/cli/tools.ts`) or `runAgentCommand()` (`lib/cli/agent.ts`).

**Tool commands** are deterministic and fast. `lib/cli/tools.ts` delegates most to `bin/grd-tools.js` via `execFileSync`, but handles the `scan` command in-process. Tool commands produce JSON output by default.

**Agent commands** are LLM-driven. `lib/cli/agent.ts::runAgentCommand()` calls `getAdapter(backend)` from `lib/cli/adapters.ts`, constructs a `/grd:<command> <args>` skill invocation prompt, and spawns the backend CLI via `spawnSync`. The prompt becomes a skill name that the AI backend resolves against `commands/<command>.md`.

The special `gd init <workflow>` form is a tool command that builds context initialization payloads used to prime agent sessions — these live in `lib/context/`.

---

## Module Categories in `lib/`

### Orchestration and Phase Lifecycle
Key files: `lib/autopilot.ts` (2706 lines), `lib/phase.ts` (1981 lines), `lib/phase-complete.ts`, `lib/phase-complete-llm.ts`, `lib/parallel.ts`, `lib/worktree.ts`

`autopilot.ts` drives multi-phase runs: it iterates phases from ROADMAP.md, spawns plan→execute→verify pipelines via `spawnClaude()`, then calls `completePhaseAfterPostPipeline()` from `phase-complete.ts` to finalize each phase automatically. `parallel.ts` validates phase independence and coordinates multi-worktree execution. `worktree.ts` manages git worktree create/remove for phase isolation.

### Scheduler and Backend Adapters
Key files: `lib/scheduler.ts` (1173 lines), `lib/backend.ts` (1186 lines), `lib/scheduler-wait.ts`, `lib/complexity.ts`, `lib/metrics.ts`, `lib/overstory.ts`

`scheduler.ts` owns subprocess spawn, rate-limit detection, token budget tracking, budget pressure classification, and account rotation via `SuperpowersConfig`. It exports a `Scheduler` class used by autopilot, autoresearch, and autoplan. `backend.ts` defines `BACKEND_CAPABILITIES`, model tier maps, `detectBackend()`, and `resolveModelForAgent()`. `complexity.ts` provides `estimateComplexity()` for adaptive tier routing. `metrics.ts` tracks in-process counters (pressure transitions, idle kills, LLM fallback attempts).

### State Management and Roadmap
Key files: `lib/state.ts` (1009 lines), `lib/roadmap.ts` (775 lines), `lib/phase-io.ts`, `lib/paths.ts`, `lib/frontmatter.ts` (572 lines)

`state.ts` reads/writes/patches `STATE.md`. `roadmap.ts` parses `ROADMAP.md`, computes phase schedules, and queries milestone structure. `frontmatter.ts` handles YAML frontmatter extraction and reconstruction across all phase plan files. `paths.ts` centralizes directory path resolution (`.planning/`, phases dir, research dir).

### Gates and Validation
Key files: `lib/gates.ts` (662 lines), `lib/invariants.ts`, `lib/verify.ts` (763 lines), `lib/requirements.ts`

`gates.ts` runs pre-flight checks (phase collisions, orphaned phases, stale artifacts, milestone inconsistencies) before commands execute. `invariants.ts` validates plan artifact structure. `verify.ts` checks plan completeness, Git refs, and key-links.

### Evolve Loop
Key files: `lib/evolve/` (7 files, ~3000 lines total)

`lib/evolve/orchestrator.ts` (1086 lines) drives the self-improvement loop: discovering work items, scoring them, dispatching agents, and advancing state. `lib/evolve/discovery.ts` (570 lines) finds gaps across 6 dimensions (JSDoc, error recovery, refactors, etc.). `lib/evolve/state.ts` manages `EVOLVE-STATE.json`. `lib/evolve/_product-ideation.ts` runs product idea discovery.

### Wireup and Feature Discovery
Key files: `lib/wireup/` (10 files, ~3500 lines total)

`lib/wireup/orchestrator.ts` detects unwired features and generates connection scaffolding. `lib/wireup/discovery.ts` (1063 lines) finds feature-to-test disconnections. `lib/wireup/execution.ts` (686 lines) runs HTTP and CLI scenarios. `lib/wireup/report.ts` generates `WIREUP-REPORT.md`.

### Context Generation
Key files: `lib/context/` (6 files, 48 init functions total)

Builds structured context payloads injected into agent sessions. Grouped by workflow family: `execute.ts` (phase execution inits), `project.ts` (lifecycle inits), `research.ts` (R&D inits), `agents.ts` (23 agent aliases), `progress.ts` (progress cache). Used by `gd init <workflow>` tool commands.

### Commands Layer
Key files: `lib/commands/` (13 files)

Decomposed dashboard, health, progress, and quality analysis commands. `lib/commands/analysis.ts` (1497 lines) is the largest, covering codebase quality analysis. `lib/commands/dashboard.ts` (680 lines) powers `gd dashboard`.

### Research and Knowledge
Key files: `lib/autoresearch.ts` (789 lines), `lib/citations.ts` (760 lines), `lib/knowledge.ts`, `lib/benchmark.ts`, `lib/discussion.ts` (1270 lines)

`autoresearch.ts` implements a Karpathy-style hypothesis→implement→evaluate loop. `citations.ts` builds typed citation graphs from `PAPERS.md` files. `knowledge.ts` manages `KNOWHOW.md` entries. `discussion.ts` dispatches to multiple backends for multi-model synthesis. `benchmark.ts` manages evaluation corpora.

### Prompt Injection Scan
Key files: `lib/scan/` (7 files)

`lib/scan/injection.ts` scans markdown prose for injection patterns. `lib/scan/base64.ts` detects base64-encoded payloads. `lib/scan/patterns.ts` is the canonical pattern registry. `lib/scan/ignorefile.ts` manages `.grd-scan-ignore` suppression entries.

### Config, Types, and Utilities
Key files: `lib/types.ts` (1566 lines), `lib/utils.ts` (1308 lines), `lib/cleanup.ts` (1588 lines), `lib/tracker.ts` (1591 lines), `lib/mcp-server.ts` (3292 lines)

`types.ts` is the single source of truth for all TypeScript interfaces — no runtime code. `utils.ts` provides `loadConfig()`, `output()`, `error()`, `execGit()`, `MODEL_PROFILES`, and `resolveModelForAgent()`. `cleanup.ts` drives post-phase quality analysis (ESLint complexity, dead exports, doc drift). `tracker.ts` syncs phases to GitHub/Jira. `mcp-server.ts` exposes all GRD commands as MCP tools over JSON-RPC 2.0 via stdio.

---

## Key Abstractions

**Scheduler (`lib/scheduler.ts`):** A class that wraps subprocess spawning with rate-limit detection, token usage tracking, idle watchdog (`idle_timeout_seconds`, default 900s — trips SIGTERM then SIGKILL after 5s grace), budget pressure classification (`none` / `warning` ≥60% / `high` ≥80% / `critical` ≥95%), and account rotation. Spawns real adapters: `_claudeAdapter`, `_codexAdapter`, `_geminiAdapter`, `_opencodeAdapter`.

**Backend Adapters (`lib/backend.ts`):** `BACKEND_CAPABILITIES` is a static capability matrix. `detectBackend()` runs a detection waterfall: config override → env vars → filesystem clues → default. `resolveModelForAgent()` maps abstract agent names + model profile + token profile + budget pressure + complexity into a concrete model string.

**Agent Dispatch (`lib/cli/agent.ts`):** `runAgentCommand()` constructs `/grd:<command>` prompts and spawns the backend CLI. The AI backend resolves the skill name against `commands/<command>.md` and executes it. Effort level, maxTurns, and disallowedTools are injected via agent frontmatter from `EFFORT_PROFILES` in `lib/backend.ts`.

**Status Markers:** Phase plans use YAML frontmatter fields (`status: pending | running | complete`) written by the post-pipeline step. `disk_status` is derived by reading these markers from disk. `completePhaseAfterPostPipeline()` (`lib/phase-complete.ts`) ticks the ROADMAP.md checkbox and advances STATE.md's `Current Phase`.

**Gates (`lib/gates.ts`):** A registry maps command names to arrays of gate-check function names. `runPreflightGates()` runs all registered checks before a command executes and returns `PreflightResult` with violations.

**Config Profiles:** `model_profile` (`quality` / `balanced` / `budget`) controls global model tier selection per agent. `token_profile` (`frugal` / `balanced` / `quality`) is an orthogonal preference controlling how aggressively to downgrade under budget pressure. Both live in `.planning/config.json` and are loaded by `loadConfig()` (`lib/utils.ts`).

**Budget Pressure:** Computed from rolling-window token consumption per account. Thresholds are configurable via `SchedulerConfig.budget_pressure_thresholds`. Combined with `ComplexityLevel` from `lib/complexity.ts`, it drives `getEffectiveTierForDispatch()` in `lib/backend.ts`.

**SuperpowersConfig:** An optional config block enabling multi-account rotation. When present, the scheduler round-robins across accounts to extend available budget. Loaded from `.planning/config.json`.

---

## Data Flow

A typical `gd autopilot` invocation flows as follows:

1. **CLI parse:** `bin/gd.ts` calls `parseFlags()` → `classifyCommand('autopilot')` returns `'agent'`.
2. **Backend detection:** `detectBackend(cwd)` reads `.planning/config.json` for `backend` override, then falls back to env var detection.
3. **Prompt construction:** `buildPromptForCommand('autopilot', [])` returns `/grd:autopilot`. The backend CLI resolves this to `commands/autopilot.md`.
4. **Config load:** Inside the spawned agent session, `loadConfig(cwd)` reads `.planning/config.json` which carries `model_profile`, `token_profile`, `scheduler.*`, `gates.*`, and `superpowers.*` sections. `SchedulerConfig` gates whether parallel execution, idle watchdog, and LLM fallback are active.
5. **Scheduler init:** The autopilot agent constructs a `Scheduler` instance with the loaded config and calls `scheduler.spawn()` for each plan→execute→verify phase pipeline.
6. **Subprocess spawn:** `_spawnWithRetry()` in `lib/scheduler.ts` invokes `execFile(binary, args)`. The binary is resolved via the adapter (e.g. `_claudeAdapter.binary`). Idle watchdog wraps the stream with a per-chunk deadline timer.
7. **Budget pressure check:** Before each spawn, `computeBudgetPressure()` reads `BackendUsageState.samples[]` and classifies pressure. If `critical`, spawn blocks or waits via `waitUntilOrAbort()` (`lib/scheduler-wait.ts`).
8. **Phase completion:** After a successful pipeline, `completePhaseAfterPostPipeline()` (`lib/phase-complete.ts`) runs preflight gates, rewrites ROADMAP.md and STATE.md, and optionally falls back to the LLM completer (`lib/phase-complete-llm.ts`) if `config.phase_complete_llm_fallback` is `true`.
9. **Result aggregation:** `autopilot.ts` collects `PhaseCompleteResult` objects per phase and writes a summary. `gd metrics` can snapshot in-process counters from `lib/metrics.ts`.

---

## Relationship to the `gsd-2-selective-adoption` Milestone

This milestone ported four patterns from the reference `gsd-2` codebase into GRD's TypeScript style. All specs are now shipped on `main`:

- **Spec 1 — Prompt injection scanner** (`lib/scan/`): Added a markdown injection scanner with pattern registry, base64 detection, ignorefile support, and a pre-commit hook. See `docs/superpowers/specs/2026-04-11-gsd2-prompt-injection-scan-design.md`.
- **Spec 2A — Autopilot rate-limit hang fix** (`lib/scheduler.ts`, `lib/scheduler-wait.ts`): Replaced binary rate-limit blocking with `waitUntilOrAbort()` + `computeSoonestRecovery()` — bounds-waits for token sample aging instead of hanging indefinitely. See `docs/superpowers/specs/2026-04-11-gsd2-autopilot-hardening-design.md`.
- **Spec 2B — Idle watchdog** (`lib/scheduler.ts`): Per-spawn idle timeout (`idle_timeout_seconds`) kills silent subprocesses with SIGTERM→SIGKILL. See `docs/superpowers/specs/2026-04-12-gsd2-idle-watchdog-design.md`.
- **Spec 3 — Mechanical phase completion** (`lib/phase-complete.ts`, `lib/autopilot.ts`): Extracted `_phaseCompleteCore` into its own module and wired autopilot's post-pipeline step to call it automatically, eliminating the manual `gd phase complete N` step. See `docs/superpowers/specs/2026-04-11-gsd2-mechanical-completion-design.md`.
- **Spec 3B — LLM fallback** (`lib/phase-complete-llm.ts`): Opt-in fallback (`phase_complete_llm_fallback: true`) for when regex-based ROADMAP.md/STATE.md rewriting fails on non-standard formats. See `docs/superpowers/specs/2026-04-12-gsd2-mechanical-completion-llm-fallback-design.md`.
- **Spec 4 — Token optimization** (`lib/complexity.ts`, `lib/backend.ts`, `lib/scheduler.ts`): Added `token_profile`, `ComplexityLevel`, `BudgetPressureLevel`, and adaptive tier routing. See `docs/superpowers/specs/2026-04-11-gsd2-token-optimization-design.md`.

Details for all specs live in `docs/superpowers/specs/`. Corresponding implementation plans are in `docs/superpowers/plans/`.

---

## Related Docs

The following documents are being produced in parallel by other agents in this audit:

- [`MODULES.md`](MODULES.md) — Per-module reference: exports, dependencies, line counts
- [`FLOWS.md`](FLOWS.md) — Detailed data-flow diagrams for key workflows
- [`USE_CASES.md`](USE_CASES.md) — Common user workflows mapped to code paths
- [`RISKS.md`](RISKS.md) — Known risks, fragility hotspots, and mitigation notes
- [`MAINTENANCE.md`](MAINTENANCE.md) — How to add commands, agents, and modules; versioning rules
- [`API.md`](API.md) — Public API surface: exported functions, types, and CLI flags
- [`CONFIG.md`](CONFIG.md) — `.planning/config.json` field reference
- [`TESTING.md`](TESTING.md) — Test structure, coverage thresholds, and how to run tests
- [`BACKENDS.md`](BACKENDS.md) — Backend capability matrix, detection waterfall, adapter internals
