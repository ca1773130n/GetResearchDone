# PROJECT.md Template

Template for `.planning/PROJECT.md` — the living project context document for R&D projects.

<template>

```markdown
# [Project Name]

## What This Is

[Current accurate description — 2-3 sentences. What does this product/system do and who is it for?
Use the user's language and framing. Update whenever reality drifts from this description.]

## Core Value

[The ONE thing that matters most. If everything else fails, this must work.
One sentence that drives prioritization when tradeoffs arise.]

## Research Objectives

<!-- Hypotheses to validate through this project. -->

| # | Hypothesis | Status | Evidence |
|---|-----------|--------|----------|
| H1 | [Hypothesis statement] | Untested | - |
| H2 | [Hypothesis statement] | Untested | - |
| H3 | [Hypothesis statement] | Untested | - |

**Primary question:** [The central research question this project answers]

## Quality Targets

<!-- Quantitative metrics and their target values. -->

| Metric | Current | Target | Stretch | Notes |
|--------|---------|--------|---------|-------|
| [e.g., PSNR] | - | [value] | [value] | [dataset/conditions] |
| [e.g., SSIM] | - | [value] | [value] | [dataset/conditions] |
| [e.g., Latency] | - | [value] | [value] | [hardware/conditions] |

**Baseline reference:** [Method/system we compare against]

## External References

<!-- Key papers, repos, datasets that inform this project. -->

### Key Papers
| Paper | Year | Relevance | Status |
|-------|------|-----------|--------|
| [Title (Authors)] | [year] | [why relevant] | To read / Surveyed / Implemented |

### Key Repositories
| Repo | Stars | What It Does | Status |
|------|-------|-------------|--------|
| [repo URL] | [N] | [description] | To review / Reviewed / Forked |

### Datasets
| Dataset | Size | What It Covers | Access |
|---------|------|---------------|--------|
| [name] | [size] | [description] | [public/restricted/proprietary] |

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

(None yet — ship to validate)

### Active

<!-- Current scope. Building toward these. -->

- [ ] [Requirement 1]
- [ ] [Requirement 2]
- [ ] [Requirement 3]

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- [Exclusion 1] — [why]
- [Exclusion 2] — [why]

## Context

[Background information that informs implementation:
- Technical environment or ecosystem
- Relevant prior work or experience
- User research or feedback themes
- Known issues to address]

## Constraints

- **[Type]**: [What] — [Why]
- **[Type]**: [What] — [Why]

Common types: Tech stack, Timeline, Budget, Dependencies, Compatibility, Performance, Security, Hardware

## Key Decisions

<!-- Decisions that constrain future work. Add throughout project lifecycle. -->

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| [Choice] | [Why] | [Good / Revisit / Pending] |

---
*Last updated: [date] after [trigger]*
```

</template>

<guidelines>

**What This Is:**
- Current accurate description of the product/system
- 2-3 sentences capturing what it does and who it's for
- Use the user's words and framing
- Update when the product evolves beyond this description

**Core Value:**
- The single most important thing
- Everything else can fail; this cannot
- Drives prioritization when tradeoffs arise
- Rarely changes; if it does, it's a significant pivot

**Research Objectives:**
- Hypotheses stated in testable form
- Status: Untested / Testing / Validated / Invalidated
- Evidence column links to eval results or experiment data
- Primary question drives the overall direction

**Quality Targets:**
- Quantitative metrics with numeric targets
- Current column updated after each evaluation phase
- Stretch targets for aspirational performance
- Always specify conditions (dataset, hardware, etc.)

**External References:**
- Papers that inform the approach
- Repositories with reference implementations
- Datasets for training/evaluation
- Status tracking prevents re-surveying

**Requirements — Validated/Active/Out of Scope:**
- Same as GSD: track what's shipped, what's in progress, what's excluded
- Requirements should connect to research objectives where applicable

**Key Decisions:**
- Log all significant technical and research direction choices
- Track outcome when known

**Last Updated:**
- Always note when and why the document was updated

</guidelines>

<evolution>

PROJECT.md evolves throughout the project lifecycle.

**After each phase transition:**
1. Update Quality Targets current column with latest metrics
2. Update Research Objectives status based on evaluation results
3. Requirements invalidated? Move to Out of Scope with reason
4. Requirements validated? Move to Validated with phase reference
5. New requirements emerged? Add to Active
6. Decisions to log? Add to Key Decisions
7. "What This Is" still accurate? Update if drifted

**After each milestone:**
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update External References — new papers, repos?
5. Update Context with current state

</evolution>

<brownfield>

For existing codebases:

1. **Map codebase first** via `/grd:map-codebase`

2. **Infer Validated requirements** from existing code:
   - What does the codebase actually do?
   - What patterns are established?
   - What's clearly working and relied upon?

3. **Gather Active requirements** from user:
   - Present inferred current state
   - Ask what they want to build next

4. **Establish baselines** from existing system:
   - Run current metrics to populate Quality Targets
   - Survey existing literature references

5. **Initialize:**
   - Validated = inferred from existing code
   - Active = user's goals for this work
   - Out of Scope = boundaries user specifies
   - Context = includes current codebase state

</brownfield>

<state_reference>

STATE.md references PROJECT.md:

```markdown
## Project Reference

See: .planning/PROJECT.md (updated [date])

**Core value:** [One-liner from Core Value section]
**Current focus:** [Current phase name]
**Primary hypothesis:** [From Research Objectives]
```

This ensures Claude reads current PROJECT.md context.

</state_reference>
