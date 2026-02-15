# Debug Template

Template for `.planning/debug/[slug].md` - active debug session tracking.

---

## File Template

```markdown
---
status: gathering | investigating | fixing | verifying | resolved
trigger: "[verbatim user input]"
created: [ISO timestamp]
updated: [ISO timestamp]
---

## Current Focus
<!-- OVERWRITE on each update - always reflects NOW -->

hypothesis: [current theory being tested]
test: [how testing it]
expecting: [what result means if true/false]
next_action: [immediate next step]

## Symptoms
<!-- Written during gathering, then immutable -->

expected: [what should happen]
actual: [what actually happens]
errors: [error messages if any]
reproduction: [how to trigger]
started: [when it broke / always broken]

## Eliminated
<!-- APPEND only - prevents re-investigating after /clear -->

- hypothesis: [theory that was wrong]
  evidence: [what disproved it]
  timestamp: [when eliminated]

## Evidence
<!-- APPEND only - facts discovered during investigation -->

- timestamp: [when found]
  checked: [what was examined]
  found: [what was observed]
  implication: [what this means]

## Resolution
<!-- OVERWRITE as understanding evolves -->

root_cause: [empty until found]
fix: [empty until applied]
verification: [empty until verified]
files_changed: []
```

<guidelines>
Same as GSD DEBUG template. See GSD DEBUG.md for full section rules, lifecycle, resume behavior, and size constraints.
</guidelines>
