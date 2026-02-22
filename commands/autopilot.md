---
description: Plan and execute multiple phases on autopilot with fresh context per step
argument-hint: "[--from N] [--to N] [--resume] [--dry-run]"
---

Run the autopilot command to plan and execute phases with dependency-aware parallel planning:

```bash
node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js autopilot $ARGUMENTS
```

Phases are grouped into dependency waves. Independent phases within each wave are planned in parallel (concurrent `claude -p` processes), then executed sequentially. This significantly speeds up multi-phase runs when phases have no inter-dependencies.

Report the JSON results including wave grouping. If any phase failed, explain what happened and suggest using `--resume` to continue from where it stopped.
