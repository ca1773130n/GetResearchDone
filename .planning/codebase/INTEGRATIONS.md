# External Integrations

**Analysis Date:** 2026-02-20

## Claude Code Plugin System

**Integration type:** Native Claude Code plugin
- Plugin manifest: `.claude-plugin/plugin.json`
- Plugin name: `grd`, version `0.2.2`
- `SessionStart` hook verifies `.planning` directory exists on every session start (5s timeout)
- Plugin root resolved via `CLAUDE_PLUGIN_ROOT` environment variable injected by Claude Code
- All `bin/grd-tools.js` invocations from commands reference `${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js`

**Agent definitions** (`agents/`, 19 files):
- Each `.md` file defines a subagent with YAML frontmatter
- Agents: `grd-planner`, `grd-executor`, `grd-surveyor`, `grd-deep-diver`, `grd-eval-planner`, `grd-product-owner`, `grd-code-reviewer`, `grd-verifier`, `grd-codebase-mapper`, `grd-roadmapper`, `grd-phase-researcher`, `grd-project-researcher`, `grd-research-synthesizer`, `grd-debugger`, `grd-feasibility-analyst`, `grd-eval-reporter`, `grd-baseline-assessor`, `grd-plan-checker`, `grd-integration-checker`

**Command definitions** (`commands/`, 45 files):
- Each `.md` file is a slash command exposed to Claude Code
- Examples: `execute-phase.md`, `plan-phase.md`, `new-project.md`, `survey.md`, `deep-dive.md`, `eval-plan.md`

## MCP Server

**Protocol:** Model Context Protocol (MCP), JSON-RPC 2.0
- Server entrypoint: `bin/grd-mcp-server.js`
- Transport: stdio (newline-delimited JSON over stdin/stdout)
- Protocol version: `2024-11-05`
- Server name: `grd-mcp-server`, version `0.1.0`

**Implementation:** `lib/mcp-server.js` (`McpServer` class)
- Zero external dependencies — pure Node.js built-ins only
- Methods supported: `initialize`, `notifications/initialized`, `tools/list`, `tools/call`
- Tool execution: captures stdout/stderr/process.exit from `cmd*` functions via `captureExecution()`
- Tool count: ~90 tools auto-generated from `COMMAND_DESCRIPTORS` table in `lib/mcp-server.js`

**MCP tool namespacing:**
- All tools prefixed with `grd_` (e.g., `grd_state_load`, `grd_phase_add`, `grd_tracker_sync_roadmap`)
- Categories: state, frontmatter, roadmap, phases, milestone, scaffold, verify, tracker, worktree, progress, todos, init-workflows, long-term-roadmap, quality analysis, requirements, search, dashboard

## Multi-Backend AI CLI Support

**Detected backends** (`lib/backend.js`):
- `claude` — Claude Code (default)
- `codex` — OpenAI Codex CLI
- `gemini` — Google Gemini CLI
- `opencode` — OpenCode CLI

**Detection waterfall** (highest to lowest priority):
1. Config override: `.planning/config.json` `backend` field
2. Environment variables: `CLAUDE_CODE_*` prefix to claude; `CODEX_HOME`/`CODEX_THREAD_ID` to codex; `GEMINI_CLI_HOME` to gemini; `OPENCODE` to opencode
3. Filesystem clues: `.claude-plugin/plugin.json` to claude; `.codex/config.toml` to codex; `.gemini/settings.json` to gemini; `opencode.json` to opencode
4. Default: `claude`

**Model tier mapping** (abstract to backend-specific):

| Backend | opus | sonnet | haiku |
|---------|------|--------|-------|
| claude | `opus` | `sonnet` | `haiku` |
| codex | `gpt-5.3-codex` | `gpt-5.3-codex-spark` | `gpt-5.3-codex-spark` |
| gemini | `gemini-3-pro` | `gemini-3-flash` | `gemini-2.5-flash` |
| opencode | `anthropic/claude-opus-4-5` | `anthropic/claude-sonnet-4-5` | `anthropic/claude-haiku-4-5` |

**Capability flags per backend:**

| Feature | claude | codex | gemini | opencode |
|---------|--------|-------|--------|----------|
| subagents | true | true | experimental | true |
| parallel | true | true | false | true |
| teams | true | false | false | false |
| hooks | true | false | true | true |
| mcp | true | true | true | true |

**Dynamic model detection:** OpenCode only — runs `opencode models` CLI via `child_process.execFileSync`, caches result for 5 minutes. Override via `config.backend_models` in `.planning/config.json`.

## Issue Tracker Integrations

### GitHub Issues

**Provider key:** `"github"` in `.planning/config.json` `tracker.provider`
- Client: `gh` CLI (must be installed and authenticated via `gh auth login`)
- Auth: `gh` CLI session — no env vars required in GRD
- Mapping (GRD to GitHub):
  - Milestone → GitHub Milestone
  - Phase → Issue with labels
  - Plan → Issue linked as sub-issue

**Operations** (via `lib/tracker.js` invoking `gh` CLI):
- `tracker sync-roadmap` — create/update GitHub Milestones and phase Issues
- `tracker sync-phase <N>` — sync single phase to tracker
- `tracker update-status <N> <status>` — update phase Issue status via labels
- `tracker add-comment <N> <file>` — post file content as Issue comment
- `tracker sync-status` — sync all phase statuses

**Config fields** in `tracker.github`:
- `project_board` — GitHub Projects board name
- `default_assignee` — default Issue assignee
- `default_labels` — default label list (e.g., `["research", "implementation"]`)
- `auto_issues` — boolean auto-sync toggle
- `pr_per_phase` — create PRs per phase

### MCP Atlassian (Jira)

**Provider key:** `"mcp-atlassian"` in `.planning/config.json` `tracker.provider`
- Client: MCP Atlassian server (external, configured separately from GRD)
- Auth: MCP server handles auth — GRD issues MCP tool calls via agents
- Legacy `"jira"` provider key auto-migrated to `"mcp-atlassian"` in `lib/tracker.js`

**Mapping hierarchy:**
- Milestone → Jira Epic (configurable via `milestone_issue_type`)
- Phase → Jira Task, child of Epic (configurable via `phase_issue_type`)
- Plan → Jira Sub-task, child of Task (configurable via `plan_issue_type`)

**Prepare/execute/record pattern:**
- Prepare: GRD CLI generates sync payload JSON (`tracker prepare-roadmap-sync`, `tracker prepare-phase-sync`, `tracker prepare-reschedule`)
- Execute: Agents call MCP Atlassian tools directly (`create_issue`, `transition_issue`, `add_comment`, `update_issue`)
- Record: GRD CLI records resulting IDs (`tracker record-mapping`, `tracker record-status`)

**Date scheduling:**
- Milestone `**Start:**`/`**Target:**` dates + phase `**Duration:** Nd` → computed dates synced to Jira Plans timeline
- Cascade reschedule: phase add/insert triggers automatic date shift for subsequent phases via `tracker prepare-reschedule`

**Config fields** in `tracker.mcp_atlassian`:
- `project_key` — Jira project key
- `milestone_issue_type` — default: `"Epic"`
- `phase_issue_type` — default: `"Task"`
- `plan_issue_type` — default: `"Sub-task"`
- `start_date_field` — Jira custom field ID for start dates (e.g., `"customfield_10015"`)
- `default_duration_days` — fallback phase duration (default: 7)

**Sync strategy (both providers):**
- One-way push: GRD → Tracker (GRD is source of truth)
- Idempotency via `.planning/TRACKER.md` mapping file (milestone/phase/plan ID tables)
- All tracker calls non-blocking — failures never block workflow
- `auto_sync` toggle in config

## Git Integration

**Client:** Git CLI invoked via `child_process.execFileSync` in `lib/utils.js` (`execGit` function)

**Allowed git commands whitelist** (`GIT_ALLOWED_COMMANDS` in `lib/utils.js`):
`add`, `commit`, `log`, `status`, `diff`, `show`, `rev-parse`, `cat-file`, `check-ignore`, `ls-files`, `branch`, `checkout`, `merge`, `rebase`, `cherry-pick`, `tag`, `stash`, `remote`, `fetch`, `pull`

**Blocked commands:** `config`, `push`, `clean`

**Blocked flags:** `--force`, `-f`, `--hard`, `--delete`, `-D`

**Branching patterns** (configurable in `.planning/config.json`):
- Phase branch template: `grd/{milestone}/{phase}-{slug}` (e.g., `grd/v0.2.2/27-worktree-infrastructure`)
- Milestone branch template: `grd/{milestone}-{slug}`

**Worktree isolation** (`lib/worktree.js`):
- Each phase can execute in an isolated git worktree
- Worktree path: `os.tmpdir()/grd-worktree-{milestone}-{phase}` (resolves macOS `/tmp` to `/private/tmp` symlink)
- Operations: create, remove, list, remove-stale, push-and-create-PR
- PR creation invokes `gh` CLI (`cmdWorktreePushAndPR`)

**Commit operations** (`lib/commands.js` `cmdCommit`):
- Stages specified files (defaults to `.planning/`)
- Uses `git add` then `git commit -m <message>` via `execGit`

## Self-Update System

**File:** `bin/grd-manifest.js`
- SHA256 hashing via Node.js `crypto` module
- `generate` — creates `grd-file-manifest.json` with per-file SHA256 hashes and current VERSION
- `detect` — compares installed files against manifest, reports modifications
- `save-patches [--dir path]` — backs up modified files to `grd-local-patches/` with `backup-meta.json`
- `load-patches [--dir path]` — reads patch backup metadata

**Workflow:**
- `/grd:update` — checks for updates, displays changelog, backs up local modifications, pulls latest
- `/grd:reapply-patches` — restores local modifications after update

## File Format Dependencies

**Markdown with YAML frontmatter:**
- All `commands/`, `agents/`, and `.planning/milestones/*/phases/` files use YAML frontmatter
- Parsed by `lib/frontmatter.js` (`extractFrontmatter`, `updateFrontmatter`)
- Schema validation in `lib/verify.js`
- Key fields: `status`, `phase`, `plan`, `verification_level`, `must_haves`

**JSON:**
- `.planning/config.json` — project configuration (read by `lib/utils.js` `loadConfig`)
- `.planning/TRACKER.md` — tracker ID mapping (parsed as Markdown table in `lib/tracker.js`)
- All CLI output — JSON by default; `--raw` flag for plain text

**Markdown documents (structured, no frontmatter):**
- `.planning/STATE.md` — living project memory, parsed by `lib/state.js`
- `.planning/ROADMAP.md` — phase structure, parsed by `lib/roadmap.js`
- `.planning/milestones/*/LONG-TERM-ROADMAP.md` — parsed by `lib/long-term-roadmap.js`

## Inter-Process Communication

**CLI to lib/ (primary pattern):**
- `bin/grd-tools.js` routes CLI args to `lib/*.js` `cmd*` functions
- All `cmd*` functions write JSON to stdout and call `process.exit()`
- Output format: `{ ok: true, data: {...} }` or `{ ok: false, error: "..." }`
- `--raw` flag produces plain text instead of JSON

**MCP server (secondary pattern):**
- `bin/grd-mcp-server.js` reads newline-delimited JSON from stdin
- Dispatches to `lib/mcp-server.js` `McpServer.handleMessage()`
- MCP server captures `cmd*` stdout/stderr/exit via `captureExecution()` monkey-patching (`process.stdout.write`, `process.stderr.write`, `process.exit` overrides)
- Writes JSON-RPC 2.0 responses to stdout

**Claude Code commands to GRD CLI:**
- Commands in `commands/*.md` invoke `node "${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js" <subcommand> [args]`
- MCP tools called by agents directly via MCP protocol

**Subagent spawning:**
- Agents in `agents/*.md` spawned by Claude Code's agent system
- `lib/context.js` `cmdInit*` functions assemble context bundles before spawning
- Model selection via `lib/backend.js` `resolveBackendModel()` using `model_profile` config
- Model profiles defined in `lib/utils.js` `MODEL_PROFILES` table (19 agent types, 3 tiers each)

## Environment Variables

**Used by GRD:**
- `CLAUDE_PLUGIN_ROOT` — injected by Claude Code, used in all `bin/` script references from commands
- `CLAUDE_CODE_*` prefix — backend detection (any var with this prefix indicates claude backend)
- `CODEX_HOME`, `CODEX_THREAD_ID` — codex backend detection
- `GEMINI_CLI_HOME` — gemini backend detection
- `OPENCODE` — opencode backend detection

**Not required for core functionality:**
- No API keys, tokens, or secrets needed for base GRD operation
- GitHub Issues: requires authenticated `gh` CLI session (`gh auth login`)
- MCP Atlassian: auth handled by external MCP Atlassian server process

---

*Integration audit: 2026-02-20*
