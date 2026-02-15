<purpose>
Display project health indicators including blockers, deferred validations, velocity trends, stale phases, and risk register summary.
</purpose>

<process>

<step name="load_health">
Run the health command to get structured health data:

```bash
HEALTH=$(node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js health --raw)
```

This returns JSON with:
- `blockers` — count and items list
- `deferred_validations` — total, pending, resolved counts with item details
- `velocity` — total_plans, total_duration_min, avg_duration_min, recent_5_avg_min
- `stale_phases` — phases with plans but no summaries
- `risks` — risk register entries with probability, impact, and phase
- `baseline` — baseline assessment status (null if no BASELINE.md)
</step>

<step name="render">
Render the health indicators. You can also get pre-formatted TUI output:

```bash
node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js health
```

This renders:
- Blockers section (None with checkmark, or list of active blockers)
- Deferred validations with pending/resolved counts and item details
- Velocity metrics (average plan duration, recent trend)
- Stale phases list (warning indicator)
- Risk register table

Present the output to the user.
</step>

<step name="highlight_warnings">
After rendering, highlight any warning conditions that need attention:

- **Active blockers** — suggest resolving or escalating
- **Pending deferred validations** — note which phase will validate them
- **Stale phases** — phases with plans but no progress, suggest `/grd:execute-phase <N>`
- **High-impact risks** — risks with Critical impact that are not yet mitigated
- **Velocity trend** — if recent_5_avg is significantly higher than overall avg, note slowdown
</step>

<step name="navigate">
Offer relevant next actions based on health status:

- `/grd:dashboard` — full project overview
- `/grd:phase-detail <N>` — drill into a specific phase
- `/grd:execute-phase <N>` — address stale phases
- `/grd:progress` — progress check with smart routing
</step>

</process>

<success_criteria>
- [ ] Health data loaded successfully
- [ ] All health indicators rendered (blockers, deferred, velocity, stale, risks)
- [ ] Warning conditions highlighted with actionable suggestions
- [ ] Navigation options presented
</success_criteria>
