# Phase Prompt Template

> **Note:** Planning methodology is in `agents/grd-planner.md`.
> This template defines the PLAN.md output format that the agent produces.

Template for `.planning/phases/XX-name/{phase}-{plan}-PLAN.md` - executable phase plans optimized for parallel execution.

**Naming:** Use `{phase}-{plan}-PLAN.md` format (e.g., `01-02-PLAN.md` for Phase 1, Plan 2)

---

## File Template

```markdown
---
phase: XX-name
plan: NN
type: execute
wave: N                     # Execution wave (1, 2, 3...). Pre-computed at plan time.
depends_on: []              # Plan IDs this plan requires (e.g., ["01-01"]).
files_modified: []          # Files this plan modifies.
autonomous: true            # false if plan has checkpoints requiring user interaction
user_setup: []              # Human-required setup Claude cannot automate (see below)
phase_type: implement       # survey | implement | evaluate | integrate
verification_level: full    # sanity | proxy | full | deferred

# Goal-backward verification (derived during planning, verified after execution)
must_haves:
  truths: []                # Observable behaviors that must be true for goal achievement
  artifacts: []             # Files that must exist with real implementation
  key_links: []             # Critical connections between artifacts
---

<objective>
[What this plan accomplishes]

Purpose: [Why this matters for the project]
Output: [What artifacts will be created]
</objective>

<execution_context>
@${CLAUDE_PLUGIN_ROOT}/references/execute-plan.md
@${CLAUDE_PLUGIN_ROOT}/templates/summary.md
[If plan contains checkpoint tasks (type="checkpoint:*"), add:]
@${CLAUDE_PLUGIN_ROOT}/references/checkpoints.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md

# Only reference prior plan SUMMARYs if genuinely needed:
# - This plan uses types/exports from prior plan
# - Prior plan made decision that affects this plan
# Do NOT reflexively chain: Plan 02 refs 01, Plan 03 refs 02...

[Relevant source files:]
@src/path/to/relevant.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: [Action-oriented name]</name>
  <files>path/to/file.ext, another/file.ext</files>
  <action>[Specific implementation - what to do, how to do it, what to avoid and WHY]</action>
  <verify>[Command or check to prove it worked]</verify>
  <done>[Measurable acceptance criteria]</done>
</task>

<task type="auto">
  <name>Task 2: [Action-oriented name]</name>
  <files>path/to/file.ext</files>
  <action>[Specific implementation]</action>
  <verify>[Command or check]</verify>
  <done>[Acceptance criteria]</done>
</task>

</tasks>

<verification>
Before declaring plan complete:
- [ ] [Specific test command]
- [ ] [Build/type check passes]
- [ ] [Behavior verification]
</verification>

<success_criteria>

- All tasks completed
- All verification checks pass
- No errors or warnings introduced
- [Plan-specific criteria]
  </success_criteria>

<output>
After completion, create `.planning/phases/XX-name/{phase}-{plan}-SUMMARY.md`
</output>
```

---

## Frontmatter Fields

| Field | Required | Purpose |
|-------|----------|---------|
| `phase` | Yes | Phase identifier (e.g., `01-foundation`) |
| `plan` | Yes | Plan number within phase (e.g., `01`, `02`) |
| `type` | Yes | Always `execute` for standard plans, `tdd` for TDD plans |
| `wave` | Yes | Execution wave number (1, 2, 3...). Pre-computed at plan time. |
| `depends_on` | Yes | Array of plan IDs this plan requires. |
| `files_modified` | Yes | Files this plan touches. |
| `autonomous` | Yes | `true` if no checkpoints, `false` if has checkpoints |
| `user_setup` | No | Array of human-required setup items (external services) |
| `phase_type` | Yes | Research phase type: survey, implement, evaluate, integrate |
| `verification_level` | Yes | Tiered verification: sanity, proxy, full, deferred |
| `must_haves` | Yes | Goal-backward verification criteria |

**GRD additions to frontmatter:**
- `phase_type` determines the nature of work (survey vs implement vs evaluate)
- `verification_level` determines rigor of post-plan verification

---

## Scope Guidance

Same as GSD. See GSD phase-prompt.md for:
- Parallel vs Sequential examples
- Context section guidance
- Plan sizing (2-3 tasks per plan, ~50% context max)
- Vertical slices preferred
- TDD plans
- Task types (auto, checkpoint:human-verify, checkpoint:decision, checkpoint:human-action)
- User setup schema
- Must-haves (goal-backward verification)

---

## Guidelines

- Always use XML structure for Claude parsing
- Include `wave`, `depends_on`, `files_modified`, `autonomous` in every plan
- Include `phase_type` and `verification_level` for R&D tracking
- Prefer vertical slices over horizontal layers
- Only reference prior SUMMARYs when genuinely needed
- 2-3 tasks per plan, ~50% context max
