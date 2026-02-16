# TODO: Slash Command Gaps — CLI-only features missing user-facing commands

**Captured:** 2026-02-16
**Priority:** P0
**Source:** User feedback during Phase 19 execution

## Problem

Multiple features have working `grd-tools.js` CLI implementations but NO corresponding slash commands (`commands/*.md` files). The tutorial docs (`docs/hierarchical-roadmap-tutorial.md`) and README.md reference `/grd:long-term-roadmap` as a working command, but the command file was never created. This is a documentation accuracy bug AND a usability gap.

Users cannot invoke these features from Claude Code — they're buried in CLI-only tools.

## Missing Slash Commands

### 1. `/grd:long-term-roadmap` — DOCUMENTED BUT DOESN'T EXIST
- **Implementation:** `lib/long-term-roadmap.js`, `bin/grd-tools.js` routing, `lib/mcp-server.js` MCP tool
- **Docs claiming it exists:** `docs/hierarchical-roadmap-tutorial.md`, `README.md`, `docs/CHANGELOG.md`, `docs/mcp-server.md`
- **What it should do:** Interactive wizard for creating/refining LONG-TERM-ROADMAP.md, display mode, tier management
- **Severity:** P0 — documentation lies to users

### 2. `/grd:requirement` — IMPLEMENTED IN PHASE 19 BUT NO COMMAND FILE
- **Implementation:** `lib/commands.js` (cmdRequirementGet, cmdRequirementList, cmdRequirementTraceability), `bin/grd-tools.js` routing
- **What it should do:** Look up requirements by ID, list with filters, query traceability matrix
- **Severity:** P1 — feature exists but not accessible as slash command

### 3. `/grd:new-milestone` — COMMAND FILE EXISTS BUT NOT REGISTERED AS SKILL
- **Implementation:** `commands/new-milestone.md` exists
- **Issue:** Not showing up in skill list — investigate registration mechanism
- **Severity:** P1

### 4. `/grd:audit-milestone` — COMMAND FILE EXISTS BUT NOT REGISTERED AS SKILL
- **Implementation:** `commands/audit-milestone.md` exists
- **Issue:** Same as above
- **Severity:** P1

### 5. `/grd:complete-milestone` — COMMAND FILE EXISTS BUT NOT REGISTERED AS SKILL
- **Implementation:** `commands/complete-milestone.md` exists
- **Issue:** Same as above
- **Severity:** P1

## Documentation Fixes Needed

- `docs/hierarchical-roadmap-tutorial.md` — References `/grd:long-term-roadmap` throughout
- `README.md` — Lists `/grd:long-term-roadmap` in command table and CLI reference
- `docs/CHANGELOG.md` — Claims command was shipped in v0.1.0
- `docs/mcp-server.md` — Lists MCP tool for it
- `.planning/MILESTONES.md` — Claims it was shipped in v0.1.0

## Next Milestone Requirements

These should become requirements in the next milestone (v0.1.3 or v0.2.0):

1. Create `commands/long-term-roadmap.md` slash command wrapping the existing CLI
2. Create `commands/requirement.md` slash command wrapping Phase 19 CLI commands
3. Investigate and fix skill registration for existing milestone command files
4. Audit ALL `grd-tools.js` commands and identify any other missing slash command wrappers
5. Fix all documentation references to match actual available commands
