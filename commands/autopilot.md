---
description: Plan and execute multiple phases on autopilot with fresh context per step
argument-hint: "[--from N] [--to N] [--resume] [--dry-run]"
---

Run the autopilot command to plan and execute phases sequentially, each in a fresh Claude process:

```bash
node ${PLUGIN_ROOT}/bin/grd-tools.js autopilot $ARGUMENTS
```

Report the JSON results. If any phase failed, explain what happened and suggest using `--resume` to continue from where it stopped.
