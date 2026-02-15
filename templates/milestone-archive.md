# Milestone Archive Template

This template is used by the complete-milestone workflow to create archive files in `.planning/milestones/`.

---

## File Template

# Milestone v{{VERSION}}: {{MILESTONE_NAME}}

**Status:** SHIPPED {{DATE}}
**Phases:** {{PHASE_START}}-{{PHASE_END}}
**Total Plans:** {{TOTAL_PLANS}}

## Overview

{{MILESTONE_DESCRIPTION}}

## Phases

{{PHASES_SECTION}}

[For each phase in this milestone, include:]

### Phase {{PHASE_NUM}}: {{PHASE_NAME}}

**Goal**: {{PHASE_GOAL}}
**Type**: {{PHASE_TYPE}}
**Depends on**: {{DEPENDS_ON}}
**Plans**: {{PLAN_COUNT}} plans

Plans:

- [x] {{PHASE}}-01: {{PLAN_DESCRIPTION}}
- [x] {{PHASE}}-02: {{PLAN_DESCRIPTION}}

**Details:**
{{PHASE_DETAILS_FROM_ROADMAP}}

---

## Milestone Summary

**Key Decisions:**
{{DECISIONS_FROM_PROJECT_STATE}}

**Research Outcomes:**
{{RESEARCH_RESULTS_AND_METRICS}}

**Issues Resolved:**
{{ISSUES_RESOLVED_DURING_MILESTONE}}

**Issues Deferred:**
{{ISSUES_DEFERRED_TO_LATER}}

**Deferred Validations Resolved:**
{{VALIDATIONS_COMPLETED_IN_THIS_MILESTONE}}

**Technical Debt Incurred:**
{{SHORTCUTS_NEEDING_FUTURE_WORK}}

---

_For current project status, see .planning/ROADMAP.md_

---

## Usage Guidelines

<guidelines>
Same as GSD milestone-archive template. See GSD milestone-archive.md for full guidelines.

**R&D additions:**
- Include "Research Outcomes" section with key findings and metric deltas
- Track "Deferred Validations Resolved" to show what was resolved in this milestone
- Archive location: `.planning/milestones/v{VERSION}-{NAME}.md`
</guidelines>
