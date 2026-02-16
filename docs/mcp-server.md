# GRD MCP Server

The GRD MCP Server exposes all 97 GRD CLI commands as [Model Context Protocol](https://modelcontextprotocol.io/) tools over JSON-RPC 2.0 stdio transport. This lets any MCP-compatible client (Claude Code, Claude Desktop, Cursor, Windsurf, etc.) call GRD operations as structured tool calls instead of shelling out to the CLI.

## Setup

### Claude Code

Add to your project's `.mcp.json` (or `~/.claude/mcp.json` for global):

```json
{
  "mcpServers": {
    "grd": {
      "command": "grd-mcp-server",
      "args": []
    }
  }
}
```

If installed locally (not globally), use the full path:

```json
{
  "mcpServers": {
    "grd": {
      "command": "node",
      "args": ["node_modules/.bin/grd-mcp-server"]
    }
  }
}
```

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "grd": {
      "command": "npx",
      "args": ["grd-tools", "--mcp"],
      "env": {}
    }
  }
}
```

Or with explicit path after `npm install -g grd-tools`:

```json
{
  "mcpServers": {
    "grd": {
      "command": "grd-mcp-server"
    }
  }
}
```

### Other MCP Clients

Any MCP client that supports stdio transport can use the server. The binary is `grd-mcp-server` (installed via `npm install -g grd-tools` or available at `node_modules/.bin/grd-mcp-server`).

## How It Works

The server reads newline-delimited JSON-RPC 2.0 messages from stdin and writes responses to stdout. It implements three MCP methods:

| Method | Purpose |
|--------|---------|
| `initialize` | Handshake — returns server info and capabilities |
| `tools/list` | Returns all 97 tool definitions with JSON Schema |
| `tools/call` | Executes a tool and returns structured results |

All tool outputs are JSON by default. The server runs in the current working directory, so GRD operations target the project where the server was started.

## Tool Reference

### State Management (12 tools)

| Tool | Description |
|------|-------------|
| `grd_state_load` | Load full project config, state, and roadmap status |
| `grd_state_get` | Read a specific field or section from STATE.md |
| `grd_state_patch` | Batch update STATE.md fields |
| `grd_state_update` | Update a single STATE.md field |
| `grd_state_advance_plan` | Increment the current plan counter |
| `grd_state_record_metric` | Record execution metrics (phase, plan, duration) |
| `grd_state_update_progress` | Recalculate progress bar from disk state |
| `grd_state_add_decision` | Add a decision to Key Decisions table |
| `grd_state_add_blocker` | Add a blocker |
| `grd_state_resolve_blocker` | Resolve a blocker |
| `grd_state_record_session` | Update session continuity info |
| `grd_state_snapshot` | Structured parse of STATE.md |

### Verification (8 tools)

| Tool | Description |
|------|-------------|
| `grd_verify_summary` | Verify a SUMMARY.md file structure |
| `grd_verify_plan_structure` | Validate PLAN.md structure and frontmatter |
| `grd_verify_phase_completeness` | Check all plans have summaries |
| `grd_verify_references` | Validate @-references and file paths |
| `grd_verify_commits` | Batch verify git commits exist |
| `grd_verify_artifacts` | Check must_haves.artifacts exist on disk |
| `grd_verify_key_links` | Validate must_haves.key_links patterns |
| `grd_validate_consistency` | Validate phase numbering and disk/roadmap sync |

### Phase & Roadmap (10 tools)

| Tool | Description |
|------|-------------|
| `grd_phases_list` | List all phases with optional filters |
| `grd_phase_add` | Add a new phase to the roadmap |
| `grd_phase_insert` | Insert a phase at a specific position |
| `grd_phase_remove` | Remove a phase from the roadmap |
| `grd_phase_complete` | Mark a phase as complete |
| `grd_phase_next_decimal` | Get next decimal phase number |
| `grd_phase_plan_index` | Index plans with wave grouping and status |
| `grd_phase_detail` | Detailed drill-down for a single phase |
| `grd_roadmap_get_phase` | Get roadmap section for a phase |
| `grd_roadmap_analyze` | Analyze roadmap structure and status |

### Tracker Integration (12 tools)

| Tool | Description |
|------|-------------|
| `grd_tracker_get_config` | Get tracker configuration |
| `grd_tracker_sync_roadmap` | Sync roadmap to issue tracker |
| `grd_tracker_sync_phase` | Sync a phase to issue tracker |
| `grd_tracker_update_status` | Update phase status in tracker |
| `grd_tracker_add_comment` | Add comment to a phase issue |
| `grd_tracker_sync_status` | Sync all phase statuses |
| `grd_tracker_schedule` | Compute schedule for tracker |
| `grd_tracker_prepare_reschedule` | Prepare reschedule data |
| `grd_tracker_prepare_roadmap_sync` | Prepare roadmap sync payload |
| `grd_tracker_prepare_phase_sync` | Prepare phase sync payload |
| `grd_tracker_record_mapping` | Record tracker mapping entry |
| `grd_tracker_record_status` | Record tracker status update |

### Workflow Init (21 tools)

Context loaders for GRD workflows. Each returns structured JSON with all context needed for the workflow.

| Tool | Description |
|------|-------------|
| `grd_init_execute_phase` | Context for execute-phase workflow |
| `grd_init_plan_phase` | Context for plan-phase workflow |
| `grd_init_new_project` | Context for new-project workflow |
| `grd_init_new_milestone` | Context for new-milestone workflow |
| `grd_init_quick` | Context for quick workflow |
| `grd_init_resume` | Context for resume workflow |
| `grd_init_verify_work` | Context for verify-work workflow |
| `grd_init_phase_op` | Context for phase-op workflow |
| `grd_init_todos` | Context for todos workflow |
| `grd_init_milestone_op` | Context for milestone-op workflow |
| `grd_init_plan_milestone_gaps` | Context for plan-milestone-gaps workflow |
| `grd_init_map_codebase` | Context for map-codebase workflow |
| `grd_init_progress` | Context for progress workflow |
| `grd_init_survey` | Context for survey research workflow |
| `grd_init_deep_dive` | Context for deep-dive research workflow |
| `grd_init_feasibility` | Context for feasibility research workflow |
| `grd_init_eval_plan` | Context for eval-plan workflow |
| `grd_init_eval_report` | Context for eval-report workflow |
| `grd_init_assess_baseline` | Context for assess-baseline workflow |
| `grd_init_product_plan` | Context for product-plan workflow |
| `grd_init_iterate` | Context for iterate workflow |

### Long-Term Roadmap (9 tools)

| Tool | Description |
|------|-------------|
| `grd_long_term_roadmap_parse` | Parse LONG-TERM-ROADMAP.md into structured data |
| `grd_long_term_roadmap_validate` | Validate roadmap structure |
| `grd_long_term_roadmap_display` | Display formatted roadmap |
| `grd_long_term_roadmap_mode` | Get planning mode (flat/hierarchical) |
| `grd_long_term_roadmap_generate` | Generate roadmap from milestone definitions |
| `grd_long_term_roadmap_refine` | Refine a milestone |
| `grd_long_term_roadmap_promote` | Promote a milestone to next tier |
| `grd_long_term_roadmap_tier` | Get tier of a milestone |
| `grd_long_term_roadmap_history` | Update refinement history |

### Templates & Scaffold (3 tools)

| Tool | Description |
|------|-------------|
| `grd_template_select` | Select template for a given type |
| `grd_template_fill` | Fill a template with values |
| `grd_scaffold` | Scaffold project structures |

### Frontmatter (4 tools)

| Tool | Description |
|------|-------------|
| `grd_frontmatter_get` | Get frontmatter from a markdown file |
| `grd_frontmatter_set` | Set a frontmatter field |
| `grd_frontmatter_merge` | Merge data into frontmatter |
| `grd_frontmatter_validate` | Validate frontmatter against schema |

### Dashboard & Navigation (4 tools)

| Tool | Description |
|------|-------------|
| `grd_dashboard` | Full project dashboard with milestones and phases |
| `grd_health` | Project health indicators (blockers, velocity, risks) |
| `grd_progress` | Render progress in json, table, or bar format |
| `grd_summary_extract` | Extract structured data from SUMMARY.md |

### Utility (9 tools)

| Tool | Description |
|------|-------------|
| `grd_resolve_model` | Resolve model name for an agent type |
| `grd_find_phase` | Find phase directory by number |
| `grd_commit` | Create a git commit with specified files |
| `grd_generate_slug` | Generate kebab-case slug |
| `grd_current_timestamp` | Current timestamp in date/filename/full format |
| `grd_list_todos` | List pending todo files |
| `grd_todo_complete` | Mark a todo as completed |
| `grd_verify_path_exists` | Check if a path exists |
| `grd_config_ensure_section` | Ensure config.json has required sections |
| `grd_config_set` | Set a config value by dot-path key |
| `grd_history_digest` | Aggregate metrics from all SUMMARY.md files |
| `grd_detect_backend` | Detect current AI coding CLI backend |
| `grd_quality_analysis` | Run quality analysis for a phase |
| `grd_milestone_complete` | Mark milestone as complete and archive |

## Examples

### Check project progress

```json
{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"grd_progress","arguments":{"format":"table"}}}
```

### Load project state

```json
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"grd_state_load","arguments":{}}}
```

### Analyze roadmap

```json
{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"grd_roadmap_analyze","arguments":{}}}
```

### Get phase details

```json
{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"grd_phase_detail","arguments":{"phase":"14"}}}
```

### Add a decision

```json
{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"grd_state_add_decision","arguments":{"summary":"Use MCP over REST for tool exposure","phase":"16","rationale":"MCP has native Claude Code integration"}}}
```

### Initialize execute-phase context

```json
{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"grd_init_execute_phase","arguments":{"phase":"14","include":"state,roadmap"}}}
```

## Protocol Details

- **Transport:** stdio (stdin/stdout, newline-delimited JSON)
- **Protocol:** JSON-RPC 2.0
- **MCP version:** 2024-11-05
- **Notifications:** `notifications/initialized` is accepted silently
- **Error codes:** Standard JSON-RPC (-32700 parse error, -32600 invalid request, -32601 method not found, -32602 invalid params, -32603 internal error)
- **Tool errors:** Returned as `isError: true` in the result content, not as JSON-RPC errors — this follows MCP convention so the client can display the error message

## Notes

- The server runs synchronously — each request is processed before the next
- All tools operate on the current working directory (where the server process was started)
- Zero runtime dependencies — Node.js 18+ built-ins only
- Tool definitions include full JSON Schema for parameter validation
