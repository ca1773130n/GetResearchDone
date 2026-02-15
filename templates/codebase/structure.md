# Structure Template

Template for `.planning/codebase/STRUCTURE.md` - captures physical file organization.

**Purpose:** Document where things physically live in the codebase. Answers "where do I put X?"

---

## File Template

```markdown
# Codebase Structure

**Analysis Date:** [YYYY-MM-DD]

## Directory Layout

```
[project-root]/
├── [dir]/          # [Purpose]
├── [dir]/          # [Purpose]
└── [file]          # [Purpose]
```

## Directory Purposes

**[Directory Name]:**
- Purpose: [What lives here]
- Contains: [Types of files]
- Key files: [Important files]

## Key File Locations

**Entry Points:** [Path]: [Purpose]
**Configuration:** [Path]: [Purpose]
**Core Logic:** [Path]: [Purpose]
**Testing:** [Path]: [Purpose]

## Naming Conventions

**Files:** [Pattern]
**Directories:** [Pattern]

## Where to Add New Code

**New Feature:** [Directory path]
**New Component/Module:** [Directory path]
**Utilities:** [Directory path]

## Special Directories

**[Directory]:**
- Purpose: [e.g., "Generated code", "Build output"]
- Committed: [Yes/No]

---

*Structure analysis: [date]*
*Update when directory structure changes*
```

<guidelines>
Same as GSD structure template. See GSD codebase/structure.md for good examples and full guidelines.
</guidelines>
