<tracker_integration>

## Issue Tracker Integration

GRD supports one-way push to GitHub Issues and Jira (via mcp-atlassian MCP server). GRD is always the source of truth — trackers are synced mirrors.

### Model

- **Direction:** GRD → Tracker (one-way push). Never pull from tracker.
- **Idempotency:** `.planning/TRACKER.md` records what has been synced. Re-running sync skips already-pushed items.
- **Error handling:** All tracker calls are non-blocking. Never let tracker failures block workflow.
- **Auto-sync:** When `tracker.auto_sync: true` in config, tracker operations fire automatically during roadmap creation, plan creation, execution, and verification.

### Providers

| Provider | Mechanism | Auth |
|----------|-----------|------|
| `github` | `gh` CLI via grd-tools.js | `gh auth login` |
| `mcp-atlassian` | MCP tools called by Claude agents | MCP server config |

### GRD → Tracker Concept Mapping

| GRD Concept | GitHub | MCP Atlassian (Jira) |
|-------------|--------|----------------------|
| Roadmap | — | Plan (conceptual, not API-managed) |
| Milestone | — | Epic (`milestone_issue_type`) via MCP `create_issue` |
| Phase | Issue + `epic` label | Task (`phase_issue_type`) linked to Epic, via MCP `create_issue` |
| Plan | Issue + `task` label, linked via `gh sub-issue` | Sub-task (`plan_issue_type`) linked to Task, via MCP `create_issue` |
| Status: pending | `status:todo` label | "To Do" via MCP `transition_issue` |
| Status: in_progress | `status:in-progress` label | "In Progress" via MCP `transition_issue` |
| Status: complete | `status:done` label + close issue | "Done" via MCP `transition_issue` |
| Eval results | Comment on phase issue | Comment on phase Task via MCP `add_comment` |
| Verification report | Comment on phase issue | Comment on phase Task via MCP `add_comment` |

### CLI API — GitHub Provider

All GitHub tracker operations go through `grd-tools.js` directly:

```bash
# Check tracker configuration and auth status
node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js tracker get-config --raw

# Sync all phases from ROADMAP.md to tracker
node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js tracker sync-roadmap --raw

# Sync a single phase (creates task issues for plans)
node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js tracker sync-phase <N> --raw

# Update phase issue status (pending/in_progress/complete)
node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js tracker update-status <N> <status> --raw

# Post file content as comment on phase issue
node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js tracker add-comment <N> <file-path> --raw

# Show sync status (what's synced vs what's not)
node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js tracker sync-status --raw
```

### CLI API — MCP Atlassian Provider

MCP Atlassian uses a prepare/execute/record pattern. grd-tools.js prepares operations, Claude agents call MCP tools, then grd-tools.js records results.

See @${CLAUDE_PLUGIN_ROOT}/references/mcp-tracker-protocol.md for full protocol.

```bash
# Prepare roadmap sync — returns operations list for milestones (Epics) and phases (Tasks)
node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js tracker prepare-roadmap-sync --raw

# Prepare phase sync — returns operations list for plans (Sub-tasks)
node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js tracker prepare-phase-sync <N> --raw

# Record a mapping after MCP create_issue call
node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js tracker record-mapping --type milestone --milestone v1.0 --key PROJ-1 --url URL
node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js tracker record-mapping --type phase --phase N --key PROJ-2 --url URL --parent PROJ-1
node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js tracker record-mapping --type plan --phase N --plan M --key PROJ-3 --url URL --parent PROJ-2

# Record status update (local mapping only — agent calls MCP transition_issue separately)
node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js tracker record-status --phase N --status in_progress

# Get issue key + content for MCP add_comment
node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js tracker add-comment <N> <file-path> --raw
# Returns { provider: "mcp-atlassian", issue_key, content } — agent calls MCP add_comment

# Update local status mapping
node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js tracker update-status <N> <status> --raw
# For mcp-atlassian: updates local mapping, returns issue_key — agent calls MCP transition_issue
```

### Integration Points

Agents and commands should call tracker operations at these moments:

| Moment | GitHub Operation | MCP Atlassian Operation | Who Calls |
|--------|------------------|-------------------------|-----------|
| Roadmap created | `tracker sync-roadmap` | `prepare-roadmap-sync` → MCP `create_issue` (Epics for milestones, Tasks for phases) → `record-mapping` | grd-roadmapper |
| Plan created | `tracker sync-phase <N>` | `prepare-phase-sync` → MCP `create_issue` (Sub-tasks for plans) → `record-mapping` | grd-planner, plan-phase command |
| Execution starts | `tracker update-status <N> in_progress` | `update-status` + MCP `transition_issue` | grd-executor |
| Execution completes | `tracker update-status <N> complete` | `update-status` + MCP `transition_issue` | grd-executor |
| SUMMARY.md written | `tracker add-comment <N> <path>` | `add-comment` → MCP `add_comment` | grd-executor |
| VERIFICATION.md written | `tracker add-comment <N> <path>` | `add-comment` → MCP `add_comment` | grd-verifier |
| EVAL.md results written | `tracker add-comment <N> <path>` | `add-comment` → MCP `add_comment` | grd-eval-reporter |

### Date Scheduling

GRD computes phase start/due dates deterministically from ROADMAP.md metadata for Jira Plans (Advanced Roadmaps) timeline display.

**Date model:**
- Milestone dates: `**Start:** YYYY-MM-DD` and `**Target:** YYYY-MM-DD` in ROADMAP.md
- Phase durations: `**Duration:** Nd` in ROADMAP.md (defaults to `default_duration_days` from config)
- Dates computed at sync time: phases laid out sequentially from milestone start date

**Computation:**
```
Milestone start → Phase 1 start
Phase 1 start + duration → Phase 1 end
Phase 1 end + 1 day → Phase 2 start
...
```

**Jira field mapping:**
- Start date: configurable via `start_date_field` (default: `customfield_10015`)
- Due date: always `duedate` (standard Jira field)

**Reschedule cascade:**
When phases are added/inserted, subsequent phase dates shift. Use `prepare-reschedule` to emit update operations for all synced issues with recomputed dates. Triggered by:
- `/grd:sync reschedule` (manual)
- `/grd:add-phase` and `/grd:insert-phase` (automatic when `auto_sync` is true)

**CLI commands:**
```bash
# Read-only: inspect computed schedule
node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js tracker schedule --raw

# Prepare update operations for synced issues
node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js tracker prepare-reschedule --raw
```

**Graceful degradation:** If a milestone has no `**Start:**` field, no dates are computed for its phases. Dates are only included in operations when available.

### Shell Pattern

All tracker calls in agents/commands MUST be non-blocking:

**GitHub:**
```bash
node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js tracker <subcommand> <args> 2>/dev/null || true
```

**MCP Atlassian:** MCP tool calls should be wrapped in try/catch logic. Failures are logged but never block the workflow.

### Configuration

Tracker is configured in `.planning/config.json` under the `tracker` key:

```json
{
  "tracker": {
    "provider": "none",
    "auto_sync": true,
    "github": {
      "project_board": "",
      "default_assignee": "",
      "default_labels": ["research", "implementation", "evaluation", "integration"],
      "auto_issues": true,
      "pr_per_phase": false
    },
    "mcp_atlassian": {
      "project_key": "",
      "milestone_issue_type": "Epic",
      "phase_issue_type": "Task",
      "plan_issue_type": "Sub-task",
      "start_date_field": "customfield_10015",
      "default_duration_days": 7
    }
  }
}
```

**Provider values:** `"none"` (disabled), `"github"`, `"mcp-atlassian"`

**GitHub auth:** Uses `gh` CLI (must be authenticated via `gh auth login`)

**MCP Atlassian auth:** Handled transparently by the mcp-atlassian MCP server configuration. No environment variables needed in GRD.

### Backward Compatibility

- `loadTrackerConfig()` in grd-tools.js automatically migrates the old `github_integration` config format to the new `tracker` format at read time.
- Old `"jira"` provider configs are auto-migrated to `"mcp-atlassian"` at read time, preserving project_key and issue types.
- Old `epic_issue_type`/`task_issue_type` config keys are auto-migrated to `milestone_issue_type`/`phase_issue_type`/`plan_issue_type`.

</tracker_integration>
