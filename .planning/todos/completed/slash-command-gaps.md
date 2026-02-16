# DONE: Slash Command Gaps — CLI-only features missing user-facing commands

**Captured:** 2026-02-16
**Completed:** 2026-02-17
**Priority:** P0
**Source:** User feedback during Phase 19 execution

## Resolution

All 5 gaps resolved:

### 1. `/grd:long-term-roadmap` — FIXED
- Created `commands/long-term-roadmap.md` wrapping existing CLI (parse, validate, display, mode, generate, refine, promote, tier, history)
- Supports wizard creation, display, --refine, and --promote flows

### 2. `/grd:requirement` — FIXED
- Created `commands/requirement.md` wrapping requirement CLI (get, list, traceability, update-status)

### 3-5. Skill registration for milestone commands — FIXED
- **Root cause:** Missing YAML frontmatter with `description:` field. Commands without frontmatter are not registered as skills by the plugin system.
- **Scope:** Not just the 3 milestone commands — 28 of 44 command files (64%) were missing frontmatter.
- **Fix:** Added YAML frontmatter (description + argument-hint where applicable) to all 28 command files.
- All 45 command files now have proper frontmatter and will register as skills.

### Audit results
- Full audit confirmed no other missing slash command wrappers.
- All `grd-tools.js` user-facing commands have corresponding `commands/*.md` files.

## Documentation
- No doc fixes needed — the docs were correct about what commands SHOULD exist. The implementation was the gap, now closed.
