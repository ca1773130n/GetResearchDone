# Phase Context Template

Template for `.planning/phases/XX-name/{phase}-CONTEXT.md` - captures implementation decisions for a phase.

**Purpose:** Document decisions that downstream agents need. Researcher uses this to know WHAT to investigate. Planner uses this to know WHAT choices are locked vs flexible.

**Key principle:** Categories are NOT predefined. They emerge from what was actually discussed for THIS phase.

**Downstream consumers:**
- `grd-phase-researcher` — Reads decisions to focus research
- `grd-planner` — Reads decisions to create specific tasks

---

## File Template

```markdown
# Phase [X]: [Name] - Context

**Gathered:** [date]
**Status:** Ready for planning

<domain>
## Phase Boundary

[Clear statement of what this phase delivers — the scope anchor. This comes from ROADMAP.md and is fixed.]

</domain>

<decisions>
## Implementation Decisions

### [Area 1 that was discussed]
- [Specific decision made]

### [Area 2 that was discussed]
- [Specific decision made]

### Claude's Discretion
[Areas where user explicitly said "you decide"]

</decisions>

<specifics>
## Specific Ideas

[Any particular references, examples, or "I want it like X" moments from discussion.]

[If none: "No specific requirements — open to standard approaches"]

</specifics>

<deferred>
## Deferred Ideas

[Ideas that came up during discussion but belong in other phases.]

[If none: "None — discussion stayed within phase scope"]

</deferred>

---

*Phase: XX-name*
*Context gathered: [date]*
```

<guidelines>
Same structure and principles as GSD context template.
See GSD context.md template for detailed examples (CLI tool, visual feature, organization task).

Categories emerge from discussion, not a predefined list.
Good content = concrete decisions. Bad content = vague aspirations.

**After creation:**
- File lives in phase directory: `.planning/phases/XX-name/{phase}-CONTEXT.md`
- `grd-phase-researcher` uses decisions to focus investigation
- `grd-planner` uses decisions + research to create executable tasks
</guidelines>
