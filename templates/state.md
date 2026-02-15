# State Template

Template for `.planning/STATE.md` — the project's living memory for R&D projects.

---

## File Template

```markdown
# Project State

## Project Reference

See: .planning/PROJECT.md (updated [date])

**Core value:** [One-liner from PROJECT.md Core Value section]
**Current focus:** [Current phase name]
**Primary hypothesis:** [From Research Objectives]

## Current Position

Phase: [X] of [Y] ([Phase name])
Plan: [A] of [B] in current phase
Status: [Ready to plan / Planning / Ready to execute / In progress / Phase complete]
Last activity: [YYYY-MM-DD] — [What happened]

Progress: [----------] 0%

## Current Baseline

<!-- Latest quantitative metrics from most recent evaluation. -->

| Metric | Value | Target | Delta | Phase |
|--------|-------|--------|-------|-------|
| [e.g., PSNR] | [value] | [target] | [+/-] | [when measured] |
| [e.g., SSIM] | [value] | [target] | [+/-] | [when measured] |

**Last evaluated:** [date] in Phase [N]
**Trend:** [Improving / Stable / Degrading / Not enough data]

## Pending Validations

<!-- Deferred verifications from prior phases that must be resolved. -->

| From Phase | Validation | Resolve By | Priority |
|-----------|-----------|------------|----------|
| [Phase N] | [What was deferred] | [Phase M] | [High/Medium/Low] |

(None yet)

## Research Progress

<!-- Track research activities across the project. -->

**Papers surveyed:** [N]
**Methods tried:** [N]
**Current approach:** [Brief description of active method/approach]

### Iteration History

| Iteration | Phase | Method | Key Metric | Result | Decision |
|-----------|-------|--------|-----------|--------|----------|
| 1 | [N] | [method] | [metric: value] | [pass/fail] | [next step] |

## Performance Metrics

**Velocity:**
- Total plans completed: [N]
- Average duration: [X] min
- Total execution time: [X.X] hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Recent Trend:**
- Last 5 plans: [durations]
- Trend: [Improving / Stable / Degrading]

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Phase X]: [Decision summary]
- [Phase Y]: [Decision summary]

### Pending Todos

[From .planning/todos/pending/ — ideas captured during sessions]

None yet.

### Blockers/Concerns

[Issues that affect future work]

None yet.

## Session Continuity

Last session: [YYYY-MM-DD HH:MM]
Stopped at: [Description of last completed action]
Resume file: [Path to .continue-here*.md if exists, otherwise "None"]
```

<purpose>

STATE.md is the project's short-term memory spanning all phases and sessions.

**Problem it solves:** Information is captured in summaries, issues, and decisions but not systematically consumed. Sessions start without context.

**Solution:** A single, small file that's:
- Read first in every workflow
- Updated after every significant action
- Contains digest of accumulated context
- Enables instant session restoration
- Tracks R&D-specific state (baselines, validations, iterations)

</purpose>

<lifecycle>

**Creation:** After ROADMAP.md is created (during init)
- Reference PROJECT.md (read it for current context)
- Initialize empty accumulated context sections
- Set position to "Phase 1 ready to plan"
- Initialize empty Current Baseline from Quality Targets

**Reading:** First step of every workflow
- progress: Present status to user
- plan: Inform planning decisions
- execute: Know current position
- transition: Know what's complete
- eval: Know current baseline to compare against

**Writing:** After every significant action
- execute: After SUMMARY.md created
  - Update position (phase, plan, status)
  - Note new decisions (detail in PROJECT.md)
  - Add blockers/concerns
- transition: After phase marked complete
  - Update progress bar
  - Clear resolved blockers
  - Refresh Project Reference date
- eval: After evaluation phase
  - Update Current Baseline with new metrics
  - Update Research Progress
  - Add to Iteration History
- verify: After verification
  - Update Pending Validations (add deferred, resolve completed)

</lifecycle>

<sections>

### Project Reference
Points to PROJECT.md for full context. Includes:
- Core value (the ONE thing that matters)
- Current focus (which phase)
- Primary hypothesis (research direction)
- Last update date (triggers re-read if stale)

### Current Position
Where we are right now in the execution flow.

### Current Baseline
Latest quantitative metrics from evaluation. This is the R&D heartbeat.
- Updated after each evaluation phase
- Shows delta from target (are we improving?)
- Trend indicates project health

### Pending Validations
Deferred verifications that must be resolved before milestone completion.
- Tracks what was skipped and when it must be done
- Priority helps planning decisions
- Cleared when validation is performed

### Research Progress
High-level R&D tracking across the project.
- Papers surveyed count
- Methods attempted count
- Current approach description
- Iteration History shows the experiment-evaluate-decide loop

### Performance Metrics
Same as GSD — velocity tracking for plans.

### Accumulated Context
Same as GSD — decisions, todos, blockers.

### Session Continuity
Same as GSD — enables instant resumption.

</sections>

<size_constraint>

Keep STATE.md under 120 lines.

It's a DIGEST, not an archive. If accumulated context grows too large:
- Keep only 3-5 recent decisions in summary (full log in PROJECT.md)
- Keep only active blockers, remove resolved ones
- Keep only last 5 iterations in Iteration History
- Keep only current baseline metrics (history in eval reports)

The goal is "read once, know where we are" — if it's too long, that fails.

</size_constraint>
