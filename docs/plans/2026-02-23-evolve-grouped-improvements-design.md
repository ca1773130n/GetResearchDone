# Evolve Command: Grouped Improvements Design

**Date:** 2026-02-23
**Status:** Approved

## Problem

The evolve command discovers 300+ individual items and processes each with 3 sequential Claude subprocess calls (plan/execute/review). This is too slow and granular. Per-file test coverage items add noise. Users cannot control iteration count or pick percentage.

## Design

### Data Structure: WorkItemGroup

```js
{
  id: "quality/test-coverage",          // dimension/theme
  theme: "test-coverage",               // grouping key
  dimension: "quality",                 // primary dimension
  title: "Improve test coverage across modules",
  items: [ ...WorkItem[] ],             // individual child items
  priority: 8.5,                        // weighted aggregate: sum(scores)/count
  effort: "large",                      // derived from item count (1-3: small, 4-8: medium, 9+: large)
  status: "pending"                     // pending | selected | completed | failed
}
```

### Grouping Engine

`groupDiscoveredItems(items)` clusters items by slug prefix patterns:

| Slug prefix pattern | Theme |
|---|---|
| `split-*` | long-function-refactors |
| `improve-coverage-*` | test-coverage |
| `add-jsdoc-*` | jsdoc-gaps |
| `add-description-*` | command-descriptions |
| `resolve-todo-*`, `resolve-fixme-*`, `resolve-hack-*` | code-markers |
| `fix-empty-catch-*` | empty-catch-blocks |
| `add-module-header-*` | module-headers |
| `remove-process-exit-*` | process-exit-cleanup |
| `use-paths-module-*` | hardcoded-paths |
| `add-tests-*` | missing-test-files |
| `mcp-tool-*` | mcp-tool-bindings |

Items not matching any pattern fall into `{dimension}/miscellaneous`.

Group priority = `sum(child_scores) / child_count` (weighted aggregate). Groups are sorted descending by priority.

### CLI Flags

| Flag | Default | Description |
|---|---|---|
| `--iterations` | `0` (unlimited) | Number of iterations. 0 = run until all groups done or failed |
| `--pick-pct` | `15` | Percentage of total groups to pick per iteration (min 1 group) |
| `--timeout` | (unchanged) | Timeout per subprocess in minutes |
| `--max-turns` | (unchanged) | Max turns per subprocess |
| `--dry-run` | (unchanged) | Discover + group only, don't execute |

Replaces `--items N` (absolute count).

### State Format

`EVOLVE-STATE.json` stores groups instead of flat items:

```json
{
  "iteration": 1,
  "timestamp": "...",
  "milestone": "v0.2.8",
  "pick_pct": 15,
  "selected_groups": [],
  "remaining_groups": [],
  "completed_groups": [],
  "failed_groups": [],
  "all_items_count": 312,
  "groups_count": 14,
  "history": []
}
```

Backward compat: old state with flat `remaining` array auto-regroups on next run.

### Execution Model

Each group = 1 execute Claude session + 1 review Claude session (2 calls per group, not 3*N per N items).

Execute prompt includes all items in the group:

```
Implement the following improvements (theme: test-coverage):
1. lib/context.js - coverage at 62%, target 90%
2. lib/phase.js - coverage at 71%, target 90%
...
Run `npm test` to verify. Fix any failures.
```

### Unlimited Iterations

When `--iterations 0`, loop continues until `remaining_groups` is empty. Each iteration:
1. Pick top `ceil(groups_count * pick_pct / 100)` groups (min 1)
2. Execute + review each group
3. Move to completed or failed
4. Advance iteration, continue

### Dry-Run Output

```json
{
  "groups": [
    { "id": "quality/test-coverage", "priority": 8.5, "item_count": 12, "effort": "large" },
    { "id": "stability/empty-catch-blocks", "priority": 7.0, "item_count": 8, "effort": "medium" }
  ],
  "total_items": 312,
  "total_groups": 14,
  "groups_per_iteration": 2,
  "estimated_iterations": 7
}
```
