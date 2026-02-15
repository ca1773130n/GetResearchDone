# Architecture Research Template

Template for `.planning/research/ARCHITECTURE.md` - system structure patterns for the project domain.

<template>

```markdown
# Architecture Research

**Domain:** [domain type]
**Researched:** [date]
**Confidence:** [HIGH/MEDIUM/LOW]

## Standard Architecture

### System Overview

```
[ASCII diagram of major components and layers]
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| [name] | [what it owns] | [how it's usually built] |

## Recommended Project Structure

```
src/
├── [folder]/           # [purpose]
│   └── [file].py       # [purpose]
├── [folder]/           # [purpose]
└── [folder]/           # [purpose]
```

## Architectural Patterns

### Pattern 1: [Pattern Name]

**What:** [description]
**When to use:** [conditions]
**Trade-offs:** [pros and cons]

## Data Flow

### Request Flow

```
[Input] → [Component] → [Processing] → [Output]
```

### Key Data Flows

1. **[Flow name]:** [description]

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| Small dataset | [approach] |
| Large dataset | [approach] |

## Anti-Patterns

### Anti-Pattern 1: [Name]

**What people do:** [the mistake]
**Why it's wrong:** [the problem]
**Do this instead:** [the correct approach]

## Sources

- [Architecture references]

---
*Architecture research for: [domain]*
*Researched: [date]*
```

</template>

<guidelines>
Same as GSD research-project ARCHITECTURE template. See GSD for full guidelines on system overview diagrams, project structure rationale, and scaling considerations.
</guidelines>
