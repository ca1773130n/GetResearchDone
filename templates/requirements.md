# Requirements Template

Template for `.planning/REQUIREMENTS.md` — checkable requirements that define "done."

Adapted from GSD for R&D projects. See GSD requirements template for full examples.

<template>

```markdown
# Requirements: [Project Name]

**Defined:** [date]
**Core Value:** [from PROJECT.md]

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### [Category 1]

- [ ] **[CAT]-01**: [Requirement description]
- [ ] **[CAT]-02**: [Requirement description]

### [Category 2]

- [ ] **[CAT]-01**: [Requirement description]
- [ ] **[CAT]-02**: [Requirement description]

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### [Category]

- **[CAT]-01**: [Requirement description]

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| [Feature] | [Why excluded] |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| [REQ-ID] | Phase [N] | Pending |

**Coverage:**
- v1 requirements: [X] total
- Mapped to phases: [Y]
- Unmapped: [Z]

---
*Requirements defined: [date]*
*Last updated: [date] after [trigger]*
```

</template>

<guidelines>

Same structure as GSD requirements. See GSD template for detailed field-by-field guidance.

**R&D additions:**
- Requirements may include quantitative targets (e.g., "PSNR > 30dB on test set")
- Traceability should reference phase types (survey/implement/evaluate/integrate)
- Status includes "Validated by eval" for requirements verified by quantitative evaluation

</guidelines>
