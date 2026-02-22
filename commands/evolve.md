---
description: Run autonomous self-improvement loop with sonnet-tier models
argument-hint: "[--iterations N] [--items N] [--dry-run]"
---

Run the evolve command to discover improvements and execute them autonomously:

```bash
node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js evolve run $ARGUMENTS
```

The evolve loop:
1. Discovers improvement opportunities across the codebase (productivity, quality, usability, consistency, stability, new features)
2. Selects top priority items using a scoring heuristic
3. For each item: plans, executes, and reviews the improvement using sonnet-tier models
4. Writes evolution notes to `.planning/EVOLUTION.md`
5. Persists remaining items to the evolve state file for the next iteration

All operations enforce a sonnet model ceiling — no opus-class models are used.

Report the JSON results. If any items failed, explain what happened. Suggest running again for continued improvement.
