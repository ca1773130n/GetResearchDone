<mcp_tracker_protocol>

## MCP Tracker Sync Protocol

When `provider` is `"mcp-atlassian"` in tracker config, use MCP tools from the `mcp-atlassian` server directly instead of grd-tools.js curl-based commands.

**Pattern:** grd-tools.js prepares operations → Claude agent executes MCP calls → grd-tools.js records results.

**Mapping hierarchy:**

| GRD Concept | Jira Object | Issue Type Config Key |
|-------------|-------------|----------------------|
| Roadmap | Plan (conceptual) | — |
| Milestone | Epic | `milestone_issue_type` |
| Phase | Task (child of Epic) | `phase_issue_type` |
| Plan | Sub-task (child of Task) | `plan_issue_type` |

### Create Milestone Epics and Phase Tasks (Roadmap Sync)

1. Get operations list:
```bash
OPS=$(node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js tracker prepare-roadmap-sync --raw)
```

2. Process operations in order. First create milestones, then phases:

   **For milestone operations** (`"type": "milestone"`, `"action": "create"`), call MCP tool `create_issue`:
   - `project_key`: from `project_key` in response
   - `summary`: from operation `summary` (e.g., "v1.0 Baseline Model")
   - `issue_type`: from `milestone_issue_type` in response (default: "Epic")
   - `description`: from operation `description`

   Record each result:
   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js tracker record-mapping --type milestone --milestone {version} --key {issue_key} --url {issue_url} 2>/dev/null || true
   ```

   **For phase operations** (`"type": "phase"`, `"action": "create"`), call MCP tool `create_issue`:
   - `project_key`: from `project_key` in response
   - `summary`: from operation `summary` (e.g., "Phase 1: Research")
   - `issue_type`: from `phase_issue_type` in response (default: "Task")
   - `additional_fields`: `{"parent": {"key": "{parent_key}"}}` if `parent_key` is present (links Task to milestone Epic)

   Record each result:
   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js tracker record-mapping --type phase --phase {N} --key {issue_key} --url {issue_url} --parent {parent_epic_key} 2>/dev/null || true
   ```

   **Important:** Create all milestone Epics before creating phase Tasks, so that `parent_key` values are available. If a phase's `parent_key` is null (milestone Epic not yet created), re-run `prepare-roadmap-sync` after recording milestone mappings to get updated parent keys.

### Create Plan Sub-tasks (Phase Sync)

1. Get operations list:
```bash
OPS=$(node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js tracker prepare-phase-sync {N} --raw)
```

2. For each operation with `"action": "create"`, call MCP tool `create_issue`:
   - `project_key`: from `project_key` in response
   - `summary`: from operation `summary` (e.g., "Plan 1-01: Literature Review")
   - `issue_type`: from `plan_issue_type` in response (default: "Sub-task")
   - `additional_fields`: `{"parent": {"key": "{parent_key}"}}` (from `parent_key` in response — links Sub-task to phase Task)

3. Record each result:
```bash
node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js tracker record-mapping --type plan --phase {N} --plan {M} --key {issue_key} --url {issue_url} --parent {parent_key} 2>/dev/null || true
```

### Update Status (Transition Issue)

1. Get issue key from TRACKER.md mapping:
```bash
STATUS_INFO=$(node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js tracker update-status {N} {status} --raw)
```
This updates the local mapping. Parse `issue_key` from response.

2. Call MCP tool `transition_issue`:
   - `issue_key`: from response `issue_key`
   - First call `get_transitions` with the `issue_key` to find the right transition ID
   - Map GRD status → Jira: `pending` → "To Do", `in_progress` → "In Progress", `complete` → "Done"

### Add Comment

1. Get issue key and content:
```bash
COMMENT_INFO=$(node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js tracker add-comment {N} {file-path} --raw)
```
For mcp-atlassian, this returns `issue_key` and `content` instead of posting.

2. Call MCP tool `add_comment`:
   - `issue_key`: from response `issue_key`
   - `comment`: from response `content` (or read file directly)

### Date Scheduling in Create Operations

When `prepare-roadmap-sync` returns operations with `start_date` and `due_date` fields, include them in `additional_fields` for `create_issue` calls:

The response includes a `start_date_field` key (e.g., `"customfield_10015"`) that specifies which Jira field to use for start dates. The due date field is always `"duedate"`.

**For milestone operations** with dates:
```
additional_fields: {
  [start_date_field]: operation.start_date,   // e.g., "2026-03-01"
  "duedate": operation.due_date               // e.g., "2026-05-15"
}
```

**For phase operations** with dates (combined with parent linking):
```
additional_fields: {
  "parent": {"key": parent_key},
  [start_date_field]: operation.start_date,   // e.g., "2026-03-01"
  "duedate": operation.due_date               // e.g., "2026-03-14"
}
```

If `start_date` or `due_date` is absent from an operation, omit those fields from `additional_fields`.

### Reschedule (Cascade Date Updates)

After phase add/insert operations shift the schedule, use `prepare-reschedule` to cascade date changes to already-synced Jira issues:

1. Get update operations:
```bash
OPS=$(node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js tracker prepare-reschedule --raw)
```

2. For each operation with `"action": "update"`, call MCP tool `update_issue`:
   - `issue_key`: from operation `issue_key`
   - `additional_fields`: `{[start_date_field]: start_date, "duedate": due_date}`

This is used by `/grd:sync reschedule` and automatically by `/grd:add-phase` and `/grd:insert-phase` when `auto_sync` is enabled.

### Error Handling

All MCP calls should be wrapped in try/catch logic. If an MCP call fails:
- Log warning, continue workflow
- Tracker integration is enhancement, not blocker
- Never let tracker failures block the main workflow

</mcp_tracker_protocol>
