# Architecture Template

Template for `.planning/codebase/ARCHITECTURE.md` - captures conceptual code organization.

**Purpose:** Document how the code is organized at a conceptual level. Complements STRUCTURE.md (which shows physical file locations).

---

## File Template

```markdown
# Architecture

**Analysis Date:** [YYYY-MM-DD]

## Pattern Overview

**Overall:** [Pattern name: e.g., "Pipeline Architecture", "Modular Research Framework"]

**Key Characteristics:**
- [Characteristic 1]
- [Characteristic 2]
- [Characteristic 3]

## Layers

**[Layer Name]:**
- Purpose: [What this layer does]
- Contains: [Types of code]
- Depends on: [What it uses]
- Used by: [What uses it]

## Data Flow

**[Flow Name]:**

1. [Entry point]
2. [Processing step]
3. [Processing step]
4. [Output]

**State Management:**
- [How state is handled]

## Key Abstractions

**[Abstraction Name]:**
- Purpose: [What it represents]
- Examples: [Concrete examples]
- Pattern: [Pattern used]

## Entry Points

**[Entry Point]:**
- Location: [Brief path]
- Triggers: [What invokes it]
- Responsibilities: [What it does]

## Error Handling

**Strategy:** [How errors are handled]

## Cross-Cutting Concerns

**Logging:** [Approach]
**Validation:** [Approach]

---

*Architecture analysis: [date]*
*Update when major patterns change*
```

<guidelines>
Same as GSD architecture template. See GSD codebase/architecture.md for good examples and full guidelines.
</guidelines>
