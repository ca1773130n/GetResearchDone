<purpose>
Display a full graphical TUI overview of all milestones, phases, and plans with progress bars, status indicators, and key metrics summary.
</purpose>

<process>

<step name="load_dashboard">
Run the dashboard command to get structured project data:

```bash
DASHBOARD=$(node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js dashboard --raw)
```

This returns JSON with:
- `milestones[]` — each with phases, progress_percent, start/target dates
- `summary` — total_milestones, total_phases, total_plans, total_summaries, active_blockers, pending_deferred, total_decisions
</step>

<step name="render">
Render the TUI dashboard to the user. You can also get the pre-formatted TUI output directly:

```bash
node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js dashboard
```

This renders a tree view with:
- Milestone headings with date ranges
- Per-milestone progress bars
- Phase list with status symbols (checkmark=complete, diamond=in-progress, circle=planned, arrow=active)
- Plan counts per phase
- Summary footer with totals

Present the output to the user.
</step>

<step name="navigate">
Offer navigation options based on the dashboard data:

- `/grd:phase-detail <N>` — drill down into a specific phase
- `/grd:health` — project health indicators (blockers, deferred validations, velocity)
- `/grd:execute-phase <N>` — execute the next incomplete phase
- `/grd:progress` — alternative progress view with routing
</step>

</process>

<success_criteria>
- [ ] Dashboard data loaded successfully
- [ ] Tree view rendered with milestones, phases, and plans
- [ ] Status symbols correctly indicate completion state
- [ ] Navigation options presented to user
</success_criteria>
