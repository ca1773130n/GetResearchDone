# External Integrations

**Analysis Date:** 2026-02-12

## APIs & External Services

**Claude Code Agent SDK:**
- Purpose: Agent spawning and orchestration
- Integration: Native plugin via `.claude-plugin/plugin.json`
- Config: SessionStart hook validates `.planning` directory existence
- Usage: All agent definitions in `agents/` directory (grd-planner, grd-executor, grd-surveyor, etc.)

**Model Profiles:**
- Agent-specific model selection (Opus 4.6, Sonnet 4.5, Haiku)
- Configured via `model_profile` in `.planning/config.json` (quality/balanced/budget)
- Mapping table in `bin/grd-tools.js` lines 123-145

## Data Storage

**Databases:**
- None - File-based storage only

**File Storage:**
- Local filesystem only
- Structured hierarchy in `.planning/` directory:
  - `PROJECT.md`, `ROADMAP.md`, `STATE.md`, `BASELINE.md` - Project state
  - `research/` - Persistent research knowledge base (LANDSCAPE.md, PAPERS.md, etc.)
  - `phases/{NN}-{name}/` - Per-phase execution artifacts
  - `codebase/` - Codebase analysis documents
  - `todos/` - Captured ideas and task backlog

**Model Storage:**
- Not applicable - No ML models stored

## Experiment Tracking

**Service:** File-based tracking via STATE.md and BASELINE.md
- Execution metrics: duration, task count, file count per plan
- Baseline performance: quantitative metrics (PSNR, SSIM, LPIPS)
- Verification levels: sanity/proxy/deferred validation tracking
- Decision log: architectural and research decisions with rationale

## Monitoring & Observability

**Error Tracking:**
- None - No external error tracking service

**Self-Update System:**
- SHA256-based file manifest (`grd-file-manifest.json`)
- Patch backup to `grd-local-patches/` on update
- Detection of local modifications via `bin/grd-manifest.js`
- Commands: `/grd:update`, `/grd:reapply-patches`

## CI/CD & Deployment

**Hosting:**
- Not applicable - Distributed as Claude Code plugin

**CI Pipeline:**
- None detected - No `.github/workflows/` or other CI config

**Version Control:**
- Git integration throughout:
  - Automatic commits via `bin/grd-tools.js commit` command
  - Branching strategies: phase branches, milestone branches
  - Commit message templates with Co-Authored-By attribution
  - Git hooks awareness (never skip with --no-verify)

## Issue Tracker Integration

**GitHub Issues:**
- Provider: `github` in tracker config
- Mechanism: `gh` CLI via `bin/grd-tools.js tracker` commands
- Auth: `gh auth login`
- Mapping:
  - Phase → Issue with `epic` label
  - Plan → Issue with `task` label, linked via `gh sub-issue`
  - Status → Labels: `status:todo`, `status:in-progress`, `status:done`
- Operations: `tracker sync-roadmap`, `tracker sync-phase`, `tracker update-status`, `tracker add-comment`

**Jira (MCP Atlassian):**
- Provider: `mcp-atlassian` in tracker config
- Mechanism: MCP tools from `mcp-atlassian` server (agents call directly)
- Auth: MCP server config (separate from GRD)
- Mapping hierarchy:
  - Roadmap → Plan (conceptual)
  - Milestone → Epic (`milestone_issue_type` config, default "Epic")
  - Phase → Task (`phase_issue_type` config, default "Task", child of Epic)
  - Plan → Sub-task (`plan_issue_type` config, default "Sub-task", child of Task)
- Operations: Prepare/execute/record pattern
  - Prepare: `tracker prepare-roadmap-sync`, `tracker prepare-phase-sync`, `tracker prepare-reschedule`
  - Execute: Agents call MCP tools (`create_issue`, `transition_issue`, `add_comment`, `update_issue`)
  - Record: `tracker record-mapping`, `tracker record-status`
- Protocol reference: `references/mcp-tracker-protocol.md`
- Date scheduling: Milestone start/target dates + phase duration → computed dates synced to Jira Plans timeline
- Cascade reschedule: Phase add/insert → automatic date shift for subsequent phases

**Sync Strategy:**
- One-way push (GRD → Tracker)
- GRD is source of truth
- Idempotency via `.planning/TRACKER.md` mapping file
- Non-blocking (tracker failures never block workflow)
- Auto-sync toggle: `tracker.auto_sync` in config
- Manual sync: `/grd:sync [roadmap | phase <N> | status | reschedule]`

## Environment Configuration

**Required env vars:**
- None for core GRD functionality

**Optional env vars:**
- GitHub Issues: Requires `gh` CLI authenticated (`gh auth login`)
- MCP Atlassian: Requires MCP server configuration (separate from GRD)
  - `project_key`, `milestone_issue_type`, `phase_issue_type`, `plan_issue_type`
  - `start_date_field` (custom field ID for start dates)
  - `default_duration_days` (fallback phase duration)

**Plugin root resolution:**
- `${CLAUDE_PLUGIN_ROOT}` environment variable
- All bin scripts referenced via `${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js`

---

*Integration audit: 2026-02-12*
