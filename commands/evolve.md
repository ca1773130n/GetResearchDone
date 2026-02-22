---
description: Run autonomous self-improvement loop with sonnet-tier models
argument-hint: "[--iterations N] [--pick-pct N] [--dry-run] [--no-worktree]"
---

Run the evolve command to discover improvements and execute them autonomously:

```bash
node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js evolve run $ARGUMENTS
```

The evolve loop:
1. Discovers improvement opportunities across the codebase (productivity, quality, usability, consistency, stability, new features)
2. Groups items by theme (test-coverage, jsdoc-gaps, code-markers, etc.) into WorkItemGroups
3. Selects top priority groups using `--pick-pct` (default 15% of total groups per iteration)
4. For each group: executes and reviews the improvement using sonnet-tier models (2 calls per group)
5. Writes evolution notes to `.planning/EVOLUTION.md`
6. Persists remaining groups to the evolve state file for the next iteration

Flags:
- `--iterations N` — Number of iterations (0 = unlimited, runs until all groups done)
- `--pick-pct N` — Percentage of total groups to pick per iteration (default: 15, min 1 group)
- `--dry-run` — Discover and group only, don't execute
- `--no-worktree` — Disable git worktree isolation (by default, enabled when `branching_strategy !== 'none'`)
- `--timeout N` — Timeout per subprocess in minutes
- `--max-turns N` — Max turns per subprocess

When git isolation is enabled (config `branching_strategy` is not `'none'`), all execution runs in a dedicated worktree. A PR is created automatically after completion. Use `--no-worktree` to disable.

All operations enforce a sonnet model ceiling — no opus-class models are used.

IMPORTANT: This command is long-running (spawns multiple Claude subprocesses). You MUST run it in the background using `run_in_background: true` on the Bash tool to avoid hitting the Bash tool's default timeout. Use `TaskOutput` with `block: false` to check progress periodically.

Report the JSON results. If any groups failed, explain what happened. Suggest running again for continued improvement.
