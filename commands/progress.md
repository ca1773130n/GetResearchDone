<purpose>
Check project progress, summarize recent work and what's ahead, then intelligently route to the next action — either executing an existing plan or creating the next one. Provides situational awareness before continuing work.
</purpose>

<required_reading>
Read all files referenced by the invoking prompt's execution_context before starting.
</required_reading>

<process>

<step name="init_context">
**Load progress context (with file contents to avoid redundant reads):**

```bash
INIT=$(node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js init progress --include state,roadmap,project,config)
```

Extract from init JSON: `project_exists`, `roadmap_exists`, `state_exists`, `phases`, `current_phase`, `next_phase`, `milestone_version`, `completed_count`, `phase_count`, `paused_at`.

**File contents (from --include):** `state_content`, `roadmap_content`, `project_content`, `config_content`. These are null if files don't exist.

If `project_exists` is false (no `.planning/` directory):

```
No planning structure found.

Run /grd:new-project to start a new project.
```

Exit.

If missing STATE.md: suggest `/grd:new-project`.

**If ROADMAP.md missing but PROJECT.md exists:**

This means a milestone was completed and archived. Go to **Route F** (between milestones).

If missing both ROADMAP.md and PROJECT.md: suggest `/grd:new-project`.
</step>

<step name="load">
**Use project context from INIT:**

All file contents are already loaded via `--include` in init_context step:
- `state_content` — living memory (position, decisions, issues)
- `roadmap_content` — phase structure and objectives
- `project_content` — current state (What This Is, Core Value, Requirements)
- `config_content` — settings (model_profile, workflow toggles)

No additional file reads needed.
</step>

<step name="analyze_roadmap">
**Get comprehensive roadmap analysis (replaces manual parsing):**

```bash
ROADMAP=$(node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js roadmap analyze)
```

This returns structured JSON with:
- All phases with disk status (complete/partial/planned/empty/no_directory)
- Goal and dependencies per phase
- Plan and summary counts per phase
- Aggregated stats: total plans, summaries, progress percent
- Current and next phase identification

Use this instead of manually reading/parsing ROADMAP.md.
</step>

<step name="recent">
**Gather recent work context:**

- Find the 2-3 most recent SUMMARY.md files
- Use `summary-extract` for efficient parsing:
  ```bash
  node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js summary-extract <path> --fields one_liner
  ```
- This shows "what we've been working on"
</step>

<step name="position">
**Parse current position from init context and roadmap analysis:**

- Use `current_phase` and `next_phase` from roadmap analyze
- Use phase-level `has_context` and `has_research` flags from analyze
- Note `paused_at` if work was paused (from init context)
- Count pending todos: use `init todos` or `list-todos`
- Check for active debug sessions: `ls .planning/debug/*.md 2>/dev/null | grep -v resolved | wc -l`
</step>

<step name="report">
**Generate progress bar from grd-tools, then present rich status report:**

```bash
PROGRESS_BAR=$(node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js progress bar --raw)
```

Present:

```
# [Project Name]

**Progress:** {PROGRESS_BAR}
**Profile:** [quality/balanced/budget]

## Recent Work
- [Phase X, Plan Y]: [what was accomplished - 1 line from summary-extract]
- [Phase X, Plan Z]: [what was accomplished - 1 line from summary-extract]

## Current Position
Phase [N] of [total]: [phase-name]
Plan [M] of [phase-total]: [status]
CONTEXT: [Y if has_context | - if not]

## Key Decisions Made
- [decision 1 from STATE.md]
- [decision 2]

## Blockers/Concerns
- [any blockers or concerns from STATE.md]

## Pending Todos
- [count] pending — /grd:check-todos to review

## Active Debug Sessions
- [count] active — /grd:debug to continue
(Only show this section if count > 0)

## What's Next
[Next phase/plan objective from roadmap analyze]
```

</step>

<step name="route">
**Determine next action based on verified counts.**

**Step 1: Count plans, summaries, and issues in current phase**

```bash
ls -1 .planning/phases/[current-phase-dir]/*-PLAN.md 2>/dev/null | wc -l
ls -1 .planning/phases/[current-phase-dir]/*-SUMMARY.md 2>/dev/null | wc -l
ls -1 .planning/phases/[current-phase-dir]/*-UAT.md 2>/dev/null | wc -l
```

**Step 2: Route based on counts**

| Condition | Meaning | Action |
|-----------|---------|--------|
| uat_with_gaps > 0 | UAT gaps need fix plans | Go to **Route E** |
| summaries < plans | Unexecuted plans exist | Go to **Route A** |
| summaries = plans AND plans > 0 | Phase complete | Go to Step 3 |
| plans = 0 | Phase not yet planned | Go to **Route B** |

**Route A: Unexecuted plan exists**

```
---

## Next Up

**{phase}-{plan}: [Plan Name]** — [objective summary from PLAN.md]

`/grd:execute-phase {phase}`

<sub>`/clear` first -> fresh context window</sub>

---
```

**Route B: Phase needs planning**

Check if CONTEXT.md exists.

**If CONTEXT.md exists:**
```
---

## Next Up

**Phase {N}: {Name}** — {Goal from ROADMAP.md}
<sub>Context gathered, ready to plan</sub>

`/grd:plan-phase {phase-number}`

<sub>`/clear` first -> fresh context window</sub>

---
```

**If CONTEXT.md does NOT exist:**
```
---

## Next Up

**Phase {N}: {Name}** — {Goal from ROADMAP.md}

`/grd:discuss-phase {phase}` — gather context and clarify approach

<sub>`/clear` first -> fresh context window</sub>

---

**Also available:**
- `/grd:plan-phase {phase}` — skip discussion, plan directly
- `/grd:list-phase-assumptions {phase}` — see Claude's assumptions

---
```

**Route E: UAT gaps need fix plans**
```
---

## UAT Gaps Found

**{phase}-UAT.md** has {N} gaps requiring fixes.

`/grd:plan-phase {phase} --gaps`

<sub>`/clear` first -> fresh context window</sub>

---
```

**Step 3: Check milestone status (only when phase complete)**

**Route C: Phase complete, more phases remain**
```
---

## Phase {Z} Complete

## Next Up

**Phase {Z+1}: {Name}** — {Goal from ROADMAP.md}

`/grd:discuss-phase {Z+1}` — gather context and clarify approach

<sub>`/clear` first -> fresh context window</sub>

---
```

**Route D: Milestone complete**
```
---

## Milestone Complete

All {N} phases finished!

## Next Up

**Complete Milestone** — archive and prepare for next

`/grd:complete-milestone`

<sub>`/clear` first -> fresh context window</sub>

---
```

**Route F: Between milestones (ROADMAP.md missing, PROJECT.md exists)**
```
---

## Milestone v{X.Y} Complete

Ready to plan the next milestone.

## Next Up

**Start Next Milestone** — questioning -> research -> requirements -> roadmap

`/grd:new-milestone`

<sub>`/clear` first -> fresh context window</sub>

---
```

</step>

</process>

<success_criteria>

- [ ] Rich context provided (recent work, decisions, issues)
- [ ] Current position clear with visual progress
- [ ] What's next clearly explained
- [ ] Smart routing: /grd:execute-phase if plans exist, /grd:plan-phase if not
- [ ] User confirms before any action
- [ ] Seamless handoff to appropriate grd command
</success_criteria>
