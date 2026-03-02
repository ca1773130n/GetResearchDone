---
description: Plan and execute multiple phases on autopilot with fresh context per step
argument-hint: "[--from N] [--to N] [--resume] [--dry-run] [--max-milestones N]"
---

Run the autopilot command to plan and execute phases with dependency-aware parallel planning:

```bash
node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js autopilot $ARGUMENTS
```

Phases are grouped into dependency waves. Independent phases within each wave are planned in parallel (concurrent `claude -p` processes), then executed sequentially. This significantly speeds up multi-phase runs when phases have no inter-dependencies.

IMPORTANT: This command is long-running (spawns multiple Claude subprocesses). You MUST run it in the background using `run_in_background: true` on the Bash tool to avoid hitting the Bash tool's default timeout. Use `TaskOutput` with `block: false` to check progress periodically.

Report the JSON results including wave grouping. If any phase failed, explain what happened and suggest using `--resume` to continue from where it stopped.

## Multi-Milestone Mode

To orchestrate work across milestone boundaries -- completing one milestone and automatically starting the next -- use the multi-milestone autopilot command:

```bash
node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js multi-milestone-autopilot $ARGUMENTS
```

This extends single-milestone autopilot to process multiple milestones in sequence. The loop: completes all phases in the current milestone, archives the milestone, resolves the next milestone from LONG-TERM-ROADMAP.md, creates it, and continues.

### Multi-Milestone Flags

| Flag | Description | Default |
|------|-------------|---------|
| `--max-milestones N` | Maximum milestones to process (safety cap) | 10 |
| `--dry-run` | Preview what would happen without executing | false |
| `--resume` | Skip already-completed phases/milestones | false |
| `--timeout N` | Per-subprocess timeout in minutes | 120 |
| `--max-turns N` | Max turns per claude -p subprocess | -- |
| `--model <model>` | Model override for claude -p | -- |
| `--skip-plan` | Skip planning step | false |
| `--skip-execute` | Skip execution step | false |

### Multi-Milestone Examples

```bash
# Run multi-milestone autopilot (processes up to 10 milestones)
node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js multi-milestone-autopilot

# Preview without executing
node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js multi-milestone-autopilot --dry-run

# Limit to 3 milestones
node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js multi-milestone-autopilot --max-milestones 3

# Resume from where it stopped
node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js multi-milestone-autopilot --resume
```

### Pre-flight Context

To get pre-flight context for multi-milestone autopilot (LT roadmap state, current milestone, next milestone):

```bash
node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js init multi-milestone-autopilot
```

### Requirements

- LONG-TERM-ROADMAP.md must exist in .planning/ for cross-milestone resolution
- Claude CLI must be available for subprocess spawning
- Autonomous mode recommended for unattended operation
