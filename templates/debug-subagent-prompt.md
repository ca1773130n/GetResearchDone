# Debug Subagent Prompt Template

Template for spawning grd-debugger agent. The agent contains all debugging expertise - this template provides problem context only.

---

## Template

```markdown
<objective>
Investigate issue: {issue_id}

**Summary:** {issue_summary}
</objective>

<symptoms>
expected: {expected}
actual: {actual}
errors: {errors}
reproduction: {reproduction}
timeline: {timeline}
</symptoms>

<mode>
symptoms_prefilled: {true_or_false}
goal: {find_root_cause_only | find_and_fix}
</mode>

<debug_file>
Create: .planning/debug/{slug}.md
</debug_file>
```

---

## Placeholders

| Placeholder | Source | Example |
|-------------|--------|---------|
| `{issue_id}` | Orchestrator-assigned | `eval-metrics-drift` |
| `{issue_summary}` | User description | `PSNR dropped 2dB after refactor` |
| `{expected}` | From symptoms | `PSNR >= 32.5dB` |
| `{actual}` | From symptoms | `PSNR = 30.1dB` |
| `{errors}` | From symptoms | `None in console` |
| `{reproduction}` | From symptoms | `Run eval on test set` |
| `{timeline}` | From symptoms | `After phase 3 changes` |
| `{goal}` | Orchestrator sets | `find_and_fix` |
| `{slug}` | Generated | `eval-metrics-drift` |

---

## Usage

**From /grd:debug:**
```python
Task(
  prompt=filled_template,
  subagent_type="grd:grd-debugger",
  description="Debug {slug}"
)
```

**From diagnose-issues (UAT):**
```python
Task(prompt=template, subagent_type="grd:grd-debugger", description="Debug UAT-001")
```

---

## Continuation

For checkpoints, spawn fresh agent with:

```markdown
<objective>
Continue debugging {slug}. Evidence is in the debug file.
</objective>

<prior_state>
Debug file: @.planning/debug/{slug}.md
</prior_state>

<checkpoint_response>
**Type:** {checkpoint_type}
**Response:** {user_response}
</checkpoint_response>

<mode>
goal: {goal}
</mode>
```
