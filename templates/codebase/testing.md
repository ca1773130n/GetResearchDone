# Testing Patterns Template

Template for `.planning/codebase/TESTING.md` - captures test framework and patterns.

**Purpose:** Document how tests are written and run. Guide for adding tests that match existing patterns.

---

## File Template

```markdown
# Testing Patterns

**Analysis Date:** [YYYY-MM-DD]

## Test Framework

**Runner:** [Framework and config]
**Assertion Library:** [Library]

**Run Commands:**
```bash
[command]              # Run all tests
[command]              # Watch mode
[command]              # Single file
[command]              # Coverage report
```

## Test File Organization

**Location:** [Pattern]
**Naming:** [Pattern]

## Test Structure

**Suite Organization:**
```python
# [Show actual pattern used]
```

**Patterns:** [Setup, teardown, structure]

## Mocking

**Framework:** [Tool]
**What to Mock:** [Guidelines]
**What NOT to Mock:** [Guidelines]

## Fixtures and Factories

**Test Data:** [Pattern]
**Location:** [Where fixtures live]

## Coverage

**Requirements:** [Target]
**Configuration:** [Tool]

## Test Types

**Unit Tests:** [Scope and approach]
**Integration Tests:** [Scope and approach]
**E2E Tests:** [Framework and scope]

---

*Testing analysis: [date]*
*Update when test patterns change*
```

<guidelines>
Same as GSD testing template. See GSD codebase/testing.md for good examples and full guidelines.
</guidelines>
