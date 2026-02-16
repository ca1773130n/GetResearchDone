---
description: Detailed drill-down view for a single phase with plans, status, and metrics
argument-hint: <phase number>
---

<purpose>
Display a detailed drill-down view for a single phase, showing all plans with status, duration, task/file counts, decisions, and artifact status.
</purpose>

<process>

<step name="parse_args">
Extract the phase number from the user's command. The phase number is required.

If no phase number provided, show usage:
```
Usage: /grd:phase-detail <N>
Example: /grd:phase-detail 4
```
</step>

<step name="load_phase_detail">
Run the phase-detail command to get structured phase data:

```bash
PHASE_DETAIL=$(node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js phase-detail ${PHASE_NUM} --raw)
```

This returns JSON with:
- `phase_number`, `phase_name`, `directory`
- `plans[]` — each with id, wave, type, status, duration, tasks, files, objective
- `decisions[]` — key decisions made in this phase
- `artifacts[]` — files created
- `has_eval`, `has_verification`, `has_review`, `has_context`, `has_research` — supplementary file flags
- `summary_stats` — total_plans, completed, total_duration, total_tasks, total_files

Check for error: if `error` field exists in response, the phase was not found.
</step>

<step name="render">
Render the detailed phase view. You can also get pre-formatted TUI output:

```bash
node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js phase-detail ${PHASE_NUM}
```

This renders:
- Phase header with status and plan count
- Plans table with wave, status symbol, duration, tasks, files, objective
- Totals row
- Decisions list
- Artifact status indicators (Context, Research, Eval, Verification, Review)

Present the output to the user.
</step>

<step name="navigate">
Offer navigation options based on phase status:

- `/grd:dashboard` — return to full project view
- `/grd:execute-phase <N>` — execute this phase (if plans exist but incomplete)
- `/grd:plan-phase <N>` — create plans for this phase (if no plans exist)
- `/grd:phase-detail <N+1>` — view next phase
- `/grd:health` — project health check
</step>

</process>

<success_criteria>
- [ ] Phase data loaded for requested phase number
- [ ] Plans table rendered with all metadata
- [ ] Decisions and artifact status displayed
- [ ] Error handled gracefully if phase not found
- [ ] Navigation options presented
</success_criteria>
