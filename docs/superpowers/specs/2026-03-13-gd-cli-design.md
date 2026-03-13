# `gd` CLI — Agent-Native Interface for GRD

**Date:** 2026-03-13
**Status:** Draft
**Scope:** CLI-Anything generated CLI exposing all GRD operations

## Problem

GRD operations are only accessible via slash commands inside an active Claude Code session or via the low-level `grd-tools.js` CLI. There is no unified, discoverable CLI that both humans and AI agents can invoke from any shell with `--help` and `--json` support.

## Solution

Use CLI-Anything's 7-phase pipeline to generate a `gd` CLI that wraps all 43 slash commands and all grd-tools.js subcommands. The CLI is bundled with GRD as a `bin.gd` entry in package.json and installed via `npm install -g`.

## Command Structure

```
gd <command> [subcommand] [args] [--json] [--help] [--version]
```

### Workflow Commands (map to slash commands — spawn backend subprocess)

```
gd new-project                       # /grd:new-project
gd new-milestone                     # /grd:new-milestone
gd plan-phase <N>                    # /grd:plan-phase
gd execute-phase <N>                 # /grd:execute-phase
gd verify-phase <N>                  # /grd:verify-phase
gd autopilot                         # /grd:autopilot
gd autoplan                          # /grd:autoplan
gd evolve                            # /grd:evolve
gd progress                          # /grd:progress
gd resume-project                    # /grd:resume-project
gd pause-work                        # /grd:pause-work
gd quick                             # /grd:quick
gd migrate                           # /grd:migrate
```

### Research Commands

```
gd survey <topic>                    # /grd:survey
gd deep-dive <paper>                 # /grd:deep-dive
gd compare-methods                   # /grd:compare-methods
gd feasibility <approach>            # /grd:feasibility
```

### Planning Commands

```
gd product-plan                      # /grd:product-plan
gd discuss-phase <N>                 # /grd:discuss-phase
gd list-phase-assumptions <N>        # /grd:list-phase-assumptions
gd long-term-roadmap <subcommand>    # /grd:long-term-roadmap
gd add-phase                         # /grd:add-phase
gd insert-phase                      # /grd:insert-phase
gd remove-phase                      # /grd:remove-phase
gd complete-milestone                # /grd:complete-milestone
gd plan-milestone-gaps               # /grd:plan-milestone-gaps
```

### Evaluation Commands

```
gd assess-baseline                   # /grd:assess-baseline
gd eval-report <N>                   # /grd:eval-report
gd iterate <N>                       # /grd:iterate
gd verify-work                       # /grd:verify-work
```

### Configuration Commands

```
gd settings [subcommand]             # /grd:settings
gd principles                        # /grd:principles
gd discover [area]                   # /grd:discover
gd tracker-setup                     # /grd:tracker-setup
gd sync [subcommand]                 # /grd:sync
```

### Utility Commands

```
gd check-todos                       # /grd:check-todos
gd add-todo                          # /grd:add-todo
gd map-codebase                      # /grd:map-codebase
gd update                            # /grd:update
gd reapply-patches                   # /grd:reapply-patches
gd help                              # /grd:help
gd debug                             # /grd:debug
gd requirement [id]                  # /grd:requirement
```

### Tool Commands (map to grd-tools.js — in-process, no subprocess)

Tool commands delegate directly to grd-tools.ts functions. The `--json` flag maps to the existing `--raw` flag internally.

**Namespaced groups (pass-through to grd-tools.js):**
```
gd state <subcommand>                # state load|get|patch|advance-plan|record-metric|add-decision|add-blocker|resolve-blocker
gd verify <subcommand>               # verify plan-structure|phase-completeness|references|commits|artifacts|key-links
gd phase <subcommand>                # phase add|insert|remove|complete (deterministic file ops)
gd scaffold <subcommand>             # scaffold context|uat|verification|phase-dir|research-dir|eval|baseline
gd frontmatter <subcommand>          # frontmatter get|set|merge|validate
gd tracker <subcommand>              # tracker get-config|sync-roadmap|sync-phase|update-status|add-comment|...
gd roadmap <subcommand>              # roadmap get-phase|analyze
gd init <subcommand>                 # init execute-phase|plan-phase|new-project|... (36 workflow inits, all passthrough)
gd evolve <subcommand>               # evolve run|discover|state|advance|reset (tool ops, not agent)
```

**`init` coverage:** All 36 init subcommands are passthrough, including agent-specific inits (project-researcher, research-synthesizer, roadmapper, verifier, integration-check, plan-check, phase-research, code-review, execute-parallel, multi-milestone-autopilot).

**Routing note:** `gd evolve` (no subcommand) → agent command (spawns backend, runs full evolve loop). `gd evolve <subcommand>` → tool command (deterministic grd-tools.js operations like `discover`, `state`, `advance`, `reset`).

**Standalone tool commands (also pass-through):**
```
gd milestone <subcommand>            # milestone complete
gd validate consistency              # validate consistency
gd state-snapshot                    # state-snapshot
gd summary-extract <path>            # summary-extract
gd history-digest                    # history-digest
gd phase-plan-index <N>              # phase-plan-index
gd detect-backend                    # detect-backend
gd resolve-model <agent> [backend]   # resolve-model
gd version                           # version
gd dashboard                         # dashboard
gd health                            # health / health-check
gd coverage-report                   # coverage-report
gd quality-analysis                  # quality-analysis
gd todo <subcommand>                 # todo list|add|complete
gd worktree <subcommand>             # worktree create|remove
gd search <pattern>                  # search
gd generate-slug <text>              # generate-slug
gd config-set <key> <value>          # config-set
gd config-diff                       # config-diff
gd phase-detail <N>                  # phase-detail
gd phase-risk <N>                    # phase-risk
gd phase-readiness <N>               # phase-readiness
gd milestone-health                  # milestone-health
gd decision-timeline                 # decision-timeline
gd parallel-progress                 # parallel-progress
gd find-phase <query>                # find-phase
gd commit                            # commit
gd verify-summary <path>             # verify-summary
gd template <name>                   # template
gd current-timestamp                 # current-timestamp
gd list-todos                        # list-todos
gd verify-path-exists <path>         # verify-path-exists
gd config-ensure-section <section>   # config-ensure-section
gd phases                            # phases (list all)
gd migrate-dirs                      # migrate-dirs
gd setup                             # setup
gd citation-backlinks                # citation-backlinks
gd eval-regression-check             # eval-regression-check
gd phase-time-budget <N>             # phase-time-budget
gd import-knowledge                  # import-knowledge
gd todo-duplicates                   # todo-duplicates
gd markdown-split <path>             # markdown-split
gd overstory <subcommand>            # overstory passthrough
```

**Intentionally excluded:** Internal hook handlers (`teammate-idle-hook`, `task-completed-hook`, `instructions-loaded-hook`, `worktree-hook-create`, `worktree-hook-remove`) are not exposed as user-facing commands — they are triggered by Claude Code lifecycle events only.

**Collision resolution:** `gd phase add` (tool — deterministic file op) vs `gd add-phase` (agent — LLM-guided). Both exist. Tool commands are fast file operations; agent commands invoke the full skill with LLM reasoning. `gd help` documents this distinction.

### Global Flags

```
--json          Machine-parseable JSON output (maps to --raw for tool commands)
--help          Self-describing help text
--verbose       Extended output (passed through to subprocess)
--version       Print version and exit
--cwd <path>    Override working directory
--backend <id>  Force a specific backend (agent commands only)
```

## Per-Backend CLI Adapter

Agent commands spawn backend subprocesses. Each backend has different CLI binaries and flags. The `gd` CLI reuses the `BackendAdapter` from `lib/scheduler.ts` (when available) or falls back to a built-in adapter map:

```typescript
// Per-backend CLI invocation patterns
const BACKEND_CLI: Record<BackendId, { binary: string; buildArgs: (prompt: string, opts: Flags) => string[] }> = {
  claude: {
    binary: 'claude',
    buildArgs: (prompt, opts) => [
      '-p', prompt,
      '--verbose',
      '--dangerously-skip-permissions',
      ...(opts.model ? ['--model', opts.model] : []),
      '--output-format', 'json',
    ],
  },
  codex: {
    binary: 'codex',
    buildArgs: (prompt, opts) => [
      '--prompt', prompt,
      '--approval-mode', 'full-auto',
      ...(opts.model ? ['--model', opts.model] : []),
    ],
  },
  gemini: {
    binary: 'gemini',
    buildArgs: (prompt, opts) => [
      '-p', prompt,
      '--sandbox', 'off',
      ...(opts.model ? ['--model', opts.model] : []),
    ],
  },
  opencode: {
    binary: 'opencode',
    buildArgs: (prompt, opts) => [
      '--non-interactive',
      '--prompt', prompt,
      ...(opts.model ? ['--model', opts.model] : []),
    ],
  },
  overstory: {
    binary: 'ov',
    buildArgs: (prompt, opts) => [
      'run', '--prompt', prompt,
      ...(opts.model ? ['--model', opts.model] : []),
    ],
  },
};
```

## Generation Pipeline

Using CLI-Anything's 7-phase methodology adapted for TypeScript:

### Phase 1: Analyze

Scan the GRD codebase to map all operations:
- `commands/*.md` — 43 skill definitions with frontmatter (name, description, args)
- `bin/grd-tools.ts` — all deterministic subcommands (namespaced + standalone)
- `lib/types.ts` — TypeScript interfaces for inputs/outputs

### Phase 2: Design

Architect the command tree:
- Group commands by domain (workflow, research, planning, eval, config, tools, utility)
- Map skill frontmatter `description` → `--help` text
- Map skill `args` → CLI positional/flag arguments
- Design JSON output schemas per command

### Phase 3: Implement

Generate TypeScript CLI:
- **Agent commands** (slash command equivalents): spawn the detected backend CLI using the per-backend adapter
- **Tool commands** (grd-tools.js equivalents): delegate directly to `grd-tools.ts` functions (in-process, no subprocess)
- Argument parsing: hand-rolled minimal parser (matching existing `grd-tools.ts` pattern — no new runtime dependencies)
- `--json` flag behavior:
  - **Tool commands:** maps to existing `--raw` flag, outputs native JSON
  - **Agent commands:** wraps subprocess output in envelope: `{ "status": "ok"|"error", "output": "<raw text>", "meta": { "backend": "...", "duration_ms": N, "exit_code": N } }`

### Phase 4: Plan Tests

Generate test strategy from command inventory:
- Each command gets at least one subprocess test (`gd <cmd> --help` exits 0)
- Tool commands get unit tests (in-process delegation)
- Agent commands get integration tests (mock subprocess)

### Phase 5: Write Tests

Implement tests following existing patterns:
- TypeScript `.test.ts` files in `tests/unit/cli/` and `tests/integration/cli/`
- Use `execFileSync('node', ['bin/gd.js', ...])` pattern from existing integration tests
- Golden tests in `tests/golden/` for `gd help` and `gd progress --json` output
- Golden snapshot update via existing `capture.sh` workflow

### Phase 6: Document

- `--help` text auto-generated from skill frontmatter descriptions
- `gd help` prints full command tree with descriptions
- `gd <command> --help` prints command-specific usage

### Phase 7: Publish

- Add `"gd": "./bin/gd.js"` to `package.json` `bin` field
- `bin/gd.js` — CJS proxy (same `require('./gd.ts')` pattern as `grd-tools.js`, works via ts-jest/TypeScript runtime loader)
- `bin/gd.ts` — TypeScript entry point
- Available after `npm install -g` or `npx gd`

## Architecture

```
bin/
├── gd.ts                  # CLI entry point (TypeScript)
├── gd.js                  # CJS proxy (requires gd.ts)
lib/cli/
├── index.ts               # Command routing + hand-rolled argument parsing
├── workflow.ts             # Agent commands: new-project, plan-phase, execute-phase, autopilot, evolve, etc.
├── research.ts             # Agent commands: survey, deep-dive, feasibility, compare-methods
├── planning.ts             # Agent commands: product-plan, discuss-phase, long-term-roadmap, etc.
├── eval.ts                 # Agent commands: assess-baseline, eval-report, iterate, verify-work
├── config.ts               # Agent commands: settings, principles, discover, tracker-setup, sync
├── utility.ts              # Agent commands: check-todos, add-todo, map-codebase, update, debug, etc.
├── tools.ts                # In-process delegation to grd-tools.ts functions (all 88 subcommands)
├── adapters.ts             # Per-backend CLI adapters (shared with scheduler if available)
└── output.ts               # JSON envelope / text output formatting
```

### Command Routing

```typescript
// bin/gd.ts
const command = process.argv[2];
const subcommand = process.argv[3];
const flags = parseFlags(process.argv.slice(2));

// --version
if (flags.version) { printVersion(); process.exit(0); }

// --help with no command
if (!command || flags.help && !command) { printFullHelp(); process.exit(0); }

// Tool commands → in-process (fast, no subprocess)
if (TOOL_COMMANDS.has(command)) {
  return toolHandler(command, subcommand, flags);
}

// Agent commands → spawn backend subprocess
return agentHandler(command, subcommand, flags);
```

### Agent Command Execution

```typescript
function agentHandler(command: string, args: string[], flags: Flags) {
  const cwd = flags.cwd || process.cwd();
  const backend = flags.backend || detectBackend(cwd);
  // buildPromptForCommand loads commands/{command}.md, reads its frontmatter
  // description and content, then constructs: "/grd:{command} {args.join(' ')}"
  // wrapped with the skill's system prompt context
  const prompt = buildPromptForCommand(command, args);

  // If scheduler module is available and configured, use it
  let scheduler: Scheduler | null = null;
  try {
    scheduler = loadScheduler(cwd);
  } catch { /* scheduler not configured — proceed without */ }

  if (scheduler) {
    return scheduler.spawn(prompt, { cwd, workItemId: `gd-${command}` });
  }

  // Direct spawn using per-backend adapter
  const adapter = BACKEND_CLI[backend] || BACKEND_CLI.claude;
  const cliArgs = adapter.buildArgs(prompt, flags);
  const result = spawnSync(adapter.binary, cliArgs, { cwd, stdio: 'pipe' });

  if (flags.json) {
    return outputJson({
      status: result.status === 0 ? 'ok' : 'error',
      output: result.stdout?.toString() || '',
      meta: { backend, duration_ms: 0, exit_code: result.status },
    });
  }

  process.stdout.write(result.stdout || '');
  process.exit(result.status || 0);
}
```

### Error Handling

- **Backend CLI not installed:** Check with `which <binary>` before spawning. If not found, print actionable error: `Error: Backend "${backend}" CLI not found. Install it or set --backend to an available option.`
- **Subprocess timeout:** Forward the timeout from opts (default 120 min for agent commands). On timeout, print: `Error: Command timed out after ${timeout}ms. Try a simpler prompt or different backend.`
- **Non-zero exit code:** Capture stderr, wrap in JSON envelope if `--json`, print to stderr otherwise
- **Backend produces free-form text:** Agent command `--json` always wraps raw output in the envelope — no attempt to parse structured data from LLM output

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `bin/gd.ts` | Create | CLI entry point |
| `bin/gd.js` | Create | CJS proxy |
| `lib/cli/index.ts` | Create | Command routing + argument parsing |
| `lib/cli/workflow.ts` | Create | Workflow agent commands |
| `lib/cli/research.ts` | Create | Research agent commands |
| `lib/cli/planning.ts` | Create | Planning agent commands |
| `lib/cli/eval.ts` | Create | Eval agent commands |
| `lib/cli/config.ts` | Create | Config agent commands |
| `lib/cli/utility.ts` | Create | Utility agent commands |
| `lib/cli/tools.ts` | Create | Tool command delegation (all grd-tools.js subcommands) |
| `lib/cli/adapters.ts` | Create | Per-backend CLI adapters |
| `lib/cli/output.ts` | Create | Output formatting |
| `package.json` | Modify | Add `bin.gd` entry |
| `tests/unit/cli/*.test.ts` | Create | Unit tests |
| `tests/integration/cli/*.test.ts` | Create | Integration tests |
| `tests/golden/gd-help.txt` | Create | Golden snapshot for `gd help` |

## Integration with Scheduler

When `lib/scheduler.ts` exists and `config.scheduler` is configured, the `gd` CLI's `agentHandler` loads the scheduler and delegates to `scheduler.spawn()` for backend-aware spawning. This is a soft dependency — the `gd` CLI works without the scheduler (direct backend spawn), and gains cross-backend failover when the scheduler is present. The scheduler is designed and built as a separate spec.

## Out of Scope

- GUI/TUI — this is a CLI only
- Tab completion — future enhancement
- Plugin system for third-party commands — future enhancement
