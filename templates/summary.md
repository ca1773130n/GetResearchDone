# Summary Template

Template for `.planning/phases/XX-name/{phase}-{plan}-SUMMARY.md` - phase completion documentation.

---

## File Template

```markdown
---
phase: XX-name
plan: YY
subsystem: [primary category: auth, payments, ui, api, database, infra, testing, research, evaluation, etc.]
tags: [searchable tech: jwt, stripe, react, postgres, prisma, pytorch, onnx]

# Dependency graph
requires:
  - phase: [prior phase this depends on]
    provides: [what that phase built that this uses]
provides:
  - [bullet list of what this phase built/delivered]
affects: [list of phase names or keywords that will need this context]

# Tech tracking
tech-stack:
  added: [libraries/tools added in this phase]
  patterns: [architectural/code patterns established]

key-files:
  created: [important files created]
  modified: [important files modified]

key-decisions:
  - "Decision 1"
  - "Decision 2"

patterns-established:
  - "Pattern 1: description"
  - "Pattern 2: description"

# Metrics
duration: Xmin
completed: YYYY-MM-DD
---

# Phase [X]: [Name] Summary

**[Substantive one-liner describing outcome - NOT "phase complete" or "implementation finished"]**

## Performance

- **Duration:** [time] (e.g., 23 min, 1h 15m)
- **Started:** [ISO timestamp]
- **Completed:** [ISO timestamp]
- **Tasks:** [count completed]
- **Files modified:** [count]

## Accomplishments
- [Most important outcome]
- [Second key accomplishment]
- [Third if applicable]

## Experiment Results

<!-- R&D specific: quantitative results from this phase. Omit if not an evaluation phase. -->

| Metric | Baseline | Result | Delta | Target |
|--------|----------|--------|-------|--------|
| [metric] | [baseline] | [result] | [+/-] | [target] |

**Method:** [Brief description of approach used]
**Dataset:** [What was evaluated on]
**Verdict:** [Met target / Below target / Inconclusive]
**Next action:** [Continue / Iterate / Pivot]

## Task Commits

Each task was committed atomically:

1. **Task 1: [task name]** - `abc123f` (feat/fix/test/refactor)
2. **Task 2: [task name]** - `def456g` (feat/fix/test/refactor)
3. **Task 3: [task name]** - `hij789k` (feat/fix/test/refactor)

**Plan metadata:** `lmn012o` (docs: complete plan)

_Note: TDD tasks may have multiple commits (test -> feat -> refactor)_

## Files Created/Modified
- `path/to/file.ts` - What it does
- `path/to/another.ts` - What it does

## Decisions Made
[Key decisions with brief rationale, or "None - followed plan as specified"]

## Deviations from Plan

[If no deviations: "None - plan executed exactly as written"]

[If deviations occurred:]

### Auto-fixed Issues

**1. [Rule X - Category] Brief description**
- **Found during:** Task [N] ([task name])
- **Issue:** [What was wrong]
- **Fix:** [What was done]
- **Files modified:** [file paths]
- **Verification:** [How it was verified]
- **Committed in:** [hash] (part of task commit)

---

**Total deviations:** [N] auto-fixed ([breakdown by rule])
**Impact on plan:** [Brief assessment]

## Issues Encountered
[Problems and how they were resolved, or "None"]

## User Setup Required

[If USER-SETUP.md was generated:]
**External services require manual configuration.** See [{phase}-USER-SETUP.md](./{phase}-USER-SETUP.md) for details.

[If no USER-SETUP.md:]
None - no external service configuration required.

## Next Phase Readiness
[What's ready for next phase]
[Any blockers or concerns]

---
*Phase: XX-name*
*Completed: [date]*
```

<frontmatter_guidance>
Same as GSD. See GSD summary template for full frontmatter field guidance.
</frontmatter_guidance>

<one_liner_rules>
The one-liner MUST be substantive:

**Good:**
- "Implemented NeRF-based view synthesis with 28.5dB PSNR on Blender dataset"
- "SoTA survey covering 12 methods for single-image depth estimation"
- "Integrated TensorRT inference pipeline achieving 15ms per frame"

**Bad:**
- "Phase complete"
- "Research done"
- "Evaluation finished"

The one-liner should tell someone what actually shipped or was discovered.
</one_liner_rules>

<guidelines>
Same as GSD summary guidelines with the addition of the Experiment Results section.

**Experiment Results section:**
- Include only for evaluation or implement phases that produce quantitative results
- Omit entirely for survey or pure infrastructure phases
- Verdict drives the iteration loop: "Met target" proceeds, "Below target" triggers /grd:iterate
- Next action connects to the broader research flow
</guidelines>
