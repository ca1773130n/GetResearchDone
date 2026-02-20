# Architecture

**Analysis Date:** 2026-02-20

## High-Level Pattern

GRD is a **plugin-based CLI tool** distributed as an npm package and integrated into AI coding assistants (Claude Code, Codex, Gemini CLI, OpenCode) via a plugin manifest. It follows a strict two-layer architecture:

1. **Command Layer** — Markdown skill files in `commands/` and `agents/` define what agents do. These are prompt templates read by the AI assistant.
2. **Tool Layer** — `bin/grd-tools.js` is the deterministic subprocess invoked by command templates. All state reads and writes go through this binary.

The design enforces a clean separation: AI agents handle reasoning and orchestration; `grd-tools` handles all filesystem and git I/O deterministically. Business logic lives in 19 modules under `lib/` — the binary is a thin router that imports and calls them.

## Entry Points

### CLI Binary: `bin/grd-tools.js`
The single entry point for all deterministic operations. Invoked via shell from within command templates:
```bash
node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js <command> [args] [--raw]
```
- Parses `process.argv`
- Routes to `routeCommand()` — a large switch/case dispatching to `lib/` module functions
- Outputs JSON to stdout by default; `--raw` switches to plain text
- All errors write to stderr and exit with code 1; success exits with code 0
- Has no business logic of its own — every command delegates to a `lib/` module

### MCP Server: `bin/grd-mcp-server.js`
Exposes all GRD CLI commands as MCP (Model Context Protocol) tools over JSON-RPC 2.0 via stdio transport. Thin wire-up that:
- Reads newline-delimited JSON from stdin
- Delegates to `lib/mcp-server.js` `McpServer` class
- Writes JSON-RPC responses to stdout

### Claude Code Plugin: `.claude-plugin/plugin.json`
Registers a `SessionStart` hook that runs `verify-path-exists .planning` to detect whether a GRD project exists. This is the integration point with Claude Code's plugin system.

### npm Postinstall: `bin/postinstall.js`
Creates the `.planning/` directory skeleton and default `config.json` on first install. Idempotent — skips if `.planning/` already exists. Never exits non-zero (postinstall failures would block `npm install`).

### Self-Update: `bin/grd-manifest.js`
SHA256-based file tracking for the `/grd:update` and `/grd:reapply-patches` commands. Generates and validates `grd-file-manifest.json` to detect local modifications before pulling updates.

## Core Modules and Responsibilities

All business logic lives in `lib/` (19 modules). Modules are CommonJS (`require`/`module.exports`), stateless (no module-level mutable state), and pure with respect to the filesystem — they accept `cwd` as a parameter rather than using globals.

### Foundation Layer (no lib/ deps)

**`lib/paths.js`** — Single source of truth for all `.planning/` subdirectory paths.
- Exposes: `currentMilestone(cwd)`, `phasesDir(cwd, milestone?)`, `phaseDir(cwd, milestone?, phaseDirName)`, `researchDir(cwd)`, `codebaseDir(cwd)`, `todosDir(cwd)`, `quickDir(cwd)`, `milestonesDir(cwd)`, `archivedPhasesDir(cwd, version)`
- Reads `STATE.md` `**Milestone:**` field to detect the active milestone version, then constructs milestone-scoped paths under `.planning/milestones/{milestone}/`
- Falls back to old flat layout (`.planning/phases/`, `.planning/research/`) if the milestone directory does not exist on disk — backward compat for projects that haven't been migrated
- No circular dependencies — only uses Node built-ins (`fs`, `path`)

**`lib/backend.js`** — AI coding CLI detection and capability flags.
- Detects which backend is running via a waterfall: config `backend` field override → env vars → filesystem clues → default `claude`
- Valid backends: `claude`, `codex`, `gemini`, `opencode`
- `DEFAULT_BACKEND_MODELS` — maps abstract tiers (`opus`/`sonnet`/`haiku`) to backend-specific model names
- `BACKEND_CAPABILITIES` — flags per backend: `subagents`, `parallel`, `teams`, `hooks`, `mcp`
- Reads `.planning/config.json` directly with `fs.readFileSync` to avoid circular dependency with `lib/utils.js`

**`lib/frontmatter.js`** — YAML frontmatter parse/reconstruct/validate.
- `extractFrontmatter(content)` — handwritten YAML parser (no external deps), handles nested objects and inline arrays
- `reconstructFrontmatter(obj)` — serialize object back to YAML frontmatter block
- `parseMustHavesBlock(content)` — extracts `must_haves` block from plan markdown
- `cmdFrontmatterGet/Set/Merge/Validate` — CLI command functions
- Imports from: `./utils`

### Core Infrastructure Layer

**`lib/utils.js`** — Shared utilities used by almost all other modules.
- `loadConfig(cwd)` — merges `.planning/config.json` with defaults; handles legacy config key migration (e.g., nested `git.branching_strategy` → top-level `branching_strategy`)
- `safeReadFile(filePath)` — `fs.readFileSync` returning null on error
- `execGit(cwd, args, opts?)` — git command runner with allowlist/blocklist for security
  - Blocked commands: `config`, `push`, `clean`
  - Blocked flags: `--force`, `-f`, `--hard`, `--delete`, `-D`
  - Blocked commands return `{exitCode: 1, stderr: "Blocked: ..."}` without throwing
- `normalizePhaseName(phase)` — zero-pads phase numbers (`"7"` → `"07"`, `"7.1"` → `"07.1"`)
- `findPhaseInternal(cwd, phase)` — locates a phase directory by number using `lib/paths.js`
- `MODEL_PROFILES` — static table mapping 18 agent names to model tiers per profile
- `output(result, raw, plainText)` — writes JSON or plain text to stdout then `process.exit(0)`
- `error(message)` — writes to stderr then `process.exit(1)`
- Imports from: `./backend`, `./paths`

**`lib/gates.js`** — Pre-flight validation checks run before workflow commands execute.
- `checkOrphanedPhases(cwd)` — finds phase directories on disk not referenced in ROADMAP.md
- `checkPhaseInRoadmap(cwd, phase)` — verifies a target phase exists in ROADMAP.md
- `checkPhaseDirectoryCollision(cwd, phase)` — detects duplicate phase number directories
- `runPreflightGates(cwd, command, options)` — aggregates all applicable checks, returns `{passed, errors, warnings}`
- Imports from: `./utils`, `./paths`

### State Management Layer

**`lib/state.js`** — Read/write operations on `.planning/STATE.md`.
- STATE.md is a markdown file with bold `**Field:** value` key-value pairs and freeform sections
- `stateExtractField(content, fieldName)` — extracts a `**Field:**` value via regex
- `stateReplaceField(content, fieldName, newValue)` — replaces a field value in-place
- `cmdStateLoad` — loads full config + STATE.md + existence flags as one JSON bundle
- `cmdStateGet` — reads a specific field or section
- `cmdStatePatch` — batch-updates multiple fields
- `cmdStateAdvancePlan` — increments plan counter (`**Current Plan:**`)
- `cmdStateRecordMetric` — appends phase/plan execution metrics
- `cmdStateAddDecision`, `cmdStateAddBlocker`, `cmdStateResolveBlocker` — structured log entries
- `cmdStateSnapshot` — structured parse of entire STATE.md into JSON
- Imports from: `./utils`, `./paths`

**`lib/roadmap.js`** — ROADMAP.md parsing and phase queries.
- Parses milestone headings (`## vX.Y.Z Name`), phase headings (`### Phase N: Name`), and phase metadata (status, depends_on, duration, type)
- `analyzeRoadmap(cwd)` — full parse returning `{milestones: [...phases: [...]]}` array
- `cmdRoadmapGetPhase(cwd, phase)` — single phase lookup
- `cmdRoadmapAnalyze(cwd)` — full analysis for CLI output
- `computeSchedule(cwd)` — computes start/due dates from milestone start dates and `**Duration:** Nd` fields
- `getScheduleForPhase(cwd, phase)` / `getScheduleForMilestone(cwd, version)` — targeted lookups
- `stripShippedSections(content)` — removes `## Shipped` sections before parsing to exclude historical data
- Imports from: `./utils`, `./paths`

### Domain Logic Layer

**`lib/phase.js`** — Phase lifecycle CRUD operations.
- `cmdPhaseAdd(cwd, description, opts)` — appends a new phase to ROADMAP.md, creates phase directory
- `cmdPhaseInsert(cwd, after, description, opts)` — inserts at a specific position with decimal numbering (e.g., 2.1)
- `cmdPhaseRemove(cwd, phase, opts)` — removes phase from ROADMAP.md, optionally removes directory
- `cmdPhaseComplete(cwd, phase, opts)` — marks phase complete; optionally runs quality analysis via `lib/cleanup.js`
- `cmdMilestoneComplete(cwd, version, opts)` — archives milestone, moves phases to `{version}-phases/` directory, archives requirements
- `cmdValidateConsistency(cwd)` — checks phase numbering consistency between ROADMAP.md and disk directories
- `cmdVersionBump(cwd, type)` — bumps VERSION file
- Imports from: `./utils`, `./frontmatter`, `./cleanup`, `./gates`, `./paths`

**`lib/deps.js`** — Phase dependency graph and parallel group computation.
- `parseDependsOn(str)` — parses `**Depends On:** Phase N, Phase M` and `Nothing` strings into array
- `buildDependencyGraph(phases)` — returns `{nodes: [{id, name}], edges: [{from, to}]}` from phase array
- `computeParallelGroups(graph)` — Kahn's algorithm (topological sort by levels) producing `string[][]` execution groups
- `detectCycles(graph)` — returns array of cycle descriptions for validation
- `cmdPhaseAnalyzeDeps(cwd, phase, raw)` — CLI command returning dependency analysis JSON
- Imports from: `./utils`, `./roadmap`

**`lib/parallel.js`** — Multi-phase parallel execution context builder.
- `validateIndependentPhases(graph, requestedPhases)` — checks no direct edges exist between requested phases (prevents requesting parallel phases that depend on each other)
- `buildParallelContext(cwd, phaseNumbers)` — builds structured JSON context for `execute-parallel` workflow including worktree paths, per-phase info, mode selection
- Mode: `parallel` if backend supports `teams === true` AND `config.use_teams !== false`; otherwise `sequential`
- Imports from: `./utils`, `./backend`, `./deps`, `./roadmap`, `./gates`

**`lib/worktree.js`** — Git worktree lifecycle for phase isolation.
- Worktrees created at `os.tmpdir()/grd-worktree-{milestone}-{phase}` (resolves macOS `/tmp` → `/private/tmp` symlink)
- Branch names computed from config template `phase_branch_template` (default: `grd/{milestone}/{phase}-{slug}`)
- `cmdWorktreeCreate(cwd, phase, raw)` — creates worktree + branch
- `cmdWorktreeRemove(cwd, phase, raw)` — removes worktree and optionally branch
- `cmdWorktreeList(cwd, raw)` — lists all GRD worktrees by parsing `git worktree list --porcelain`
- `cmdWorktreeRemoveStale(cwd, raw)` — removes worktrees whose branches no longer exist
- `cmdWorktreePushAndPR(cwd, phase, raw)` — pushes branch and creates GitHub PR via `gh`
- Imports from: `./utils`

**`lib/tracker.js`** — Issue tracker sync (GitHub Issues / MCP Atlassian).
- `loadTrackerConfig(cwd)` — reads `tracker` section from config; auto-migrates legacy `jira` provider to `mcp-atlassian`
- Tracker hierarchy: Milestone → Epic, Phase → Task, Plan → Sub-task
- `cmdTracker(cwd, sub, args, raw)` — dispatches all tracker subcommands
- Schedule computation: syncs milestone `**Start:**`/`**Target:**` dates + phase `**Duration:** Nd` to Jira Plans timeline
- Non-blocking by design: tracker call failures never block the GRD workflow
- Imports from: `./utils`, `./roadmap`, `./paths`

**`lib/long-term-roadmap.js`** — `LONG-TERM-ROADMAP.md` CRUD.
- Manages `LT-N` milestone format: strategic milestones that link to one or more normal milestones in ROADMAP.md
- Operations: `parseLongTermRoadmap`, `formatLongTermRoadmap`, `addLtMilestone`, `removeLtMilestone`, `updateLtMilestone`, `linkNormalMilestone`, `unlinkNormalMilestone`, `getLtMilestoneById`, `initFromRoadmap`, `updateRefinementHistory`
- Tracks a refinement history table in LONG-TERM-ROADMAP.md
- Imports from: `./frontmatter`

**`lib/cleanup.js`** — Phase-boundary quality analysis.
- `runQualityAnalysis(cwd, files, opts)` — orchestrates all quality checks for changed files at phase boundary
- `analyzeComplexity(cwd, files, opts)` — runs ESLint complexity rule via subprocess, returns violations array
- Dead export detection, file size checks, doc drift detection (changelog staleness, broken README links, JSDoc mismatches), test coverage gap detection, export consistency checking, CLAUDE.md doc staleness, config schema drift
- `generateCleanupPlan(violations)` — produces human-readable cleanup recommendations
- `getCleanupConfig(cwd)` — reads `phase_cleanup` section from config with defaults (all checks off by default)
- Invoked automatically at phase completion when `phase_cleanup.enabled: true` in config
- Imports from: `./paths`

**`lib/verify.js`** — Artifact verification suite.
- `cmdVerifySummary(cwd, summaryPath, checkFileCount, raw)` — checks SUMMARY.md structure, spot-checks file existence, validates commit hashes
- `cmdVerifyPlanStructure(cwd, planPath, raw)` — validates PLAN.md frontmatter and required sections
- `cmdVerifyPhaseCompleteness(cwd, phase, raw)` — checks all plans have corresponding SUMMARY.md files
- `cmdVerifyReferences(cwd, filePath, raw)` — validates `@`-refs and file paths in markdown
- `cmdVerifyCommits(cwd, hashes, raw)` — batch validates git commit hashes exist via `git cat-file`
- `cmdVerifyArtifacts(cwd, planPath, raw)` — checks `must_haves.artifacts` files exist on disk
- `cmdVerifyKeyLinks(cwd, planPath, raw)` — validates `must_haves.key_links` are resolvable
- Imports from: `./utils`, `./frontmatter`

**`lib/scaffold.js`** — Template selection and file scaffolding.
- `cmdTemplateSelect(cwd, planPath, raw)` — heuristic-based template picker (minimal/standard/complex) based on task count, file count mentions, decision presence
- `cmdTemplateFill(cwd, template, opts, raw)` — fills template variables from runtime context
- `cmdScaffold(cwd, type, opts, raw)` — scaffolds phase dirs, research dirs, eval files, baseline files, UAT files, verification reports
- Imports from: `./utils`, `./frontmatter`, `./paths`

**`lib/context.js`** — Workflow initialization context builders (20 workflows).
- Each `cmdInit*` function collects all information a workflow agent needs and returns it as one JSON object — eliminating the need for agents to make multiple tool calls
- Covers: `execute-phase`, `plan-phase`, `new-project`, `new-milestone`, `quick`, `resume`, `verify-work`, `phase-op`, `todos`, `milestone-op`, `plan-milestone-gaps`, `map-codebase`, `progress`, `survey`, `deep-dive`, `feasibility`, `eval-plan`, `eval-report`, `assess-baseline`, `product-plan`, `iterate`
- Each context bundle includes: backend type + capabilities, model resolutions per agent role, config flags, phase info (directory, number, name, slug, plans), file existence checks, milestone info, research/codebase/todos dir paths
- Imports from: `./utils`, `./backend`, `./gates`, `./paths`

**`lib/mcp-server.js`** — MCP server implementation.
- `McpServer` class: `handleMessage(message)` dispatches JSON-RPC 2.0 requests
- `COMMAND_DESCRIPTORS` table — ~80 declarative tool definitions with name, description, params, execute function
- `buildToolDefinitions()` — transforms descriptors into MCP-format tool definitions for `tools/list` response
- All lib/ module commands are imported and wired to MCP tool handlers
- Handles all JSON-RPC 2.0 methods: `initialize`, `tools/list`, `tools/call`
- Imports from: all other lib/ modules

**`lib/commands.js`** — Miscellaneous command functions extracted from `bin/grd-tools.js`.
- Slug generation (`cmdGenerateSlug`), timestamp formatting (`cmdCurrentTimestamp`), todo management (`cmdListTodos`, `cmdTodoComplete`), config operations (`cmdConfigEnsureSection`, `cmdConfigSet`), history digest (`cmdHistoryDigest`), progress rendering (`cmdProgressRender`), model resolution (`cmdResolveModel`), phase lookup (`cmdFindPhase`), git commit (`cmdCommit`), plan indexing (`cmdPhasePlanIndex`), summary extraction (`cmdSummaryExtract`), dashboard (`cmdDashboard`), health check (`cmdHealth`), backend detection (`cmdDetectBackend`), long-term roadmap commands (`cmdLongTermRoadmap`), quality analysis (`cmdQualityAnalysis`), requirements (`cmdRequirementGet/List/Traceability/UpdateStatus`), full-text search (`cmdSearch`), directory migration (`cmdMigrateDirs`)
- Imports from: `./utils`, `./frontmatter`, `./backend`, `./long-term-roadmap`, `./cleanup`, `./paths`

## Data Flow

### Typical Command Execution Flow
```
Claude Code agent reads commands/execute-phase.md
  → agent calls: node bin/grd-tools.js init execute-phase 37
  → bin/grd-tools.js routes to lib/context.js cmdInitExecutePhase()
    → lib/utils.js loadConfig() reads .planning/config.json
    → lib/backend.js detectBackend() checks env/filesystem clues
    → lib/paths.js phasesDir() resolves milestone-scoped path
    → lib/gates.js runPreflightGates() validates state (no orphaned phases)
  → returns JSON context bundle to agent via stdout
  → agent uses context to spawn subagents (grd-executor agents)
  → subagents modify source files
  → agent calls: node bin/grd-tools.js verify-summary <path>
  → agent calls: node bin/grd-tools.js state record-metric --phase 37 ...
  → agent calls: node bin/grd-tools.js phase complete 37
    → lib/phase.js cmdPhaseComplete() updates ROADMAP.md
    → lib/cleanup.js runQualityAnalysis() if phase_cleanup.enabled
```

### State Storage
- `.planning/STATE.md` — primary living memory (markdown with `**Field:** value` pairs)
- `.planning/ROADMAP.md` — source of truth for phase structure and milestone hierarchy
- `.planning/config.json` — all configuration; re-read on every command invocation
- `.planning/milestones/{version}/phases/{NN}-{name}/` — phase artifacts (PLAN.md, SUMMARY.md, etc.)
- `.planning/milestones/{version}/research/` — research knowledge base
- `.planning/milestones/{version}/todos/` — pending and completed todos
- `.planning/LONG-TERM-ROADMAP.md` — multi-milestone strategic planning
- `.planning/TRACKER.md` — issue tracker ID mapping (created at first sync)

### Output Protocol
All lib/ module command functions follow a consistent output convention:
- `output(jsonObj, raw, plainText)` — writes JSON (default) or plain text (`--raw`), then calls `process.exit(0)`
- `error(message)` — writes to stderr, calls `process.exit(1)`
- In MCP mode, `McpServer` captures return values from the command functions directly rather than intercepting process output

## Module Dependency Graph

```
paths.js              ← (no lib/ deps — only Node built-ins)
backend.js            ← (no lib/ deps — reads config directly via fs)
frontmatter.js        ← utils.js
utils.js              ← backend.js, paths.js
gates.js              ← utils.js, paths.js
state.js              ← utils.js, paths.js
roadmap.js            ← utils.js, paths.js
cleanup.js            ← paths.js

deps.js               ← utils.js, roadmap.js
tracker.js            ← utils.js, roadmap.js, paths.js
long-term-roadmap.js  ← frontmatter.js
verify.js             ← utils.js, frontmatter.js
scaffold.js           ← utils.js, frontmatter.js, paths.js
worktree.js           ← utils.js

phase.js              ← utils.js, frontmatter.js, cleanup.js, gates.js, paths.js
parallel.js           ← utils.js, backend.js, deps.js, roadmap.js, gates.js
context.js            ← utils.js, backend.js, gates.js, paths.js

commands.js           ← utils.js, frontmatter.js, backend.js, long-term-roadmap.js, cleanup.js, paths.js
mcp-server.js         ← (imports all lib/ modules)

bin/grd-tools.js      ← (imports all lib/ modules — thin router)
bin/grd-mcp-server.js ← mcp-server.js
```

Key rules enforced:
- `paths.js` and `backend.js` are at the foundation — they import only Node built-ins
- `utils.js` imports `backend.js` and `paths.js` but nothing higher in the graph
- No circular dependencies anywhere in the graph

## Error Handling Patterns

**In lib/ modules — filesystem errors:**
- Functions use `try/catch` with silent recovery on filesystem read errors (return null/empty)
- Pattern: `try { content = fs.readFileSync(path, 'utf-8'); } catch { return 'anonymous'; }`

**In lib/ modules — validation errors:**
- Call `error(message)` which writes to stderr and exits 1
- Example: `if (!phase) error('phase required for init execute-phase');`

**In lib/utils.js execGit() — git security:**
- Blocked commands/flags return `{exitCode: 1, stderr: "Blocked: ..."}` without throwing
- All external process calls wrapped in try/catch; errors return structured objects

**In bin/grd-tools.js — top-level:**
```javascript
try {
  routeCommand(command, args, cwd, raw);
} catch (e) {
  if (e && e.message) error(e.message);
  else throw e;
}
```

**In MCP server — JSON-RPC errors:**
- Parse errors return `{code: -32700, message: "Parse error"}`
- Method not found returns `{code: -32601, message: "Method not found"}`
- Tool execution errors caught and returned as JSON-RPC error responses

## Key Abstractions

**`cwd` parameter convention:** Every lib/ function accepts `cwd` (project working directory) as its first argument. No module reads `process.cwd()`. This makes all functions testable without subprocess isolation.

**`output(result, raw, plainText)`:** Standard exit-with-output pattern used universally across all command functions. Prevents partial output by always exiting after writing.

**Model tier resolution:** Abstract tiers (`opus`/`sonnet`/`haiku`) → `lib/utils.js resolveModelInternal()` → `lib/backend.js resolveBackendModel()` → backend-specific model name. Command templates remain backend-agnostic.

**Pre-flight gates:** All workflow-triggering commands run `runPreflightGates()` first, checking for conditions that would cause the workflow to fail midway (orphaned phases, naming collisions, missing milestones).

**Context bundles:** `cmdInit*` functions in `lib/context.js` pack all information for a workflow into one JSON response. Agents call `init <workflow>` once and get backend, models, config, phase info, file paths, existence checks — eliminating redundant reads across 45 command files.

**Milestone-scoped path fallback:** `lib/paths.js` implements backward compatibility by checking whether `.planning/milestones/{milestone}/` exists on disk before returning the new-style path. This lets pre-migration and post-migration layouts coexist.

---

*Architecture analysis: 2026-02-20*
