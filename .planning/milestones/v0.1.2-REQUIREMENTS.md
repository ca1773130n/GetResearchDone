# Requirements Archive: v0.1.2 Developer Experience & Requirement Traceability

**Archived:** 2026-02-16
**Status:** SHIPPED

For current requirements, see `.planning/REQUIREMENTS.md`.

---

# Requirements: v0.1.2 — Developer Experience & Requirement Traceability

**Created:** 2026-02-16
**Milestone:** v0.1.2

## Feature 1: Requirement Inspection Commands

### REQ-31: Requirement Lookup by ID
**Priority:** P0
**Category:** CLI
Implement `grd-tools requirement get <REQ-ID>` command that parses REQUIREMENTS.md (current or archived milestones) and returns structured JSON with all fields: ID, title, priority, category, description, phase mapping, status, deferred-from, and resolves references. Falls back to archived milestone requirements if not found in current file.

### REQ-32: Requirement Listing with Filters
**Priority:** P1
**Category:** CLI
Implement `grd-tools requirement list` command with optional filters: `--phase N`, `--priority P0|P1|P2`, `--status Pending|Done`, `--category <name>`. Returns filtered list of requirements with summary fields. Supports `--all` flag to include archived milestone requirements.

### REQ-33: Requirement Traceability Query
**Priority:** P1
**Category:** CLI
Implement `grd-tools requirement traceability` command that parses the Traceability Matrix from REQUIREMENTS.md and returns it as structured JSON. Supports optional `--phase N` filter to show only requirements mapped to a specific phase.

## Feature 2: Phase-Detail Enhancement

### REQ-34: Phase-Detail Shows Requirements
**Priority:** P0
**Category:** Enhancement
Enhance `cmdPhaseDetail` to extract `**Requirements**: REQ-XX, REQ-YY` from the ROADMAP.md phase section and display a requirements summary block. For each REQ-ID, show: ID, title, priority, and status. Works for both planned and unplanned phases (requirements come from ROADMAP.md, not plan files).

## Feature 3: Convenience Commands

### REQ-35: Planning Artifact Search
**Priority:** P2
**Category:** CLI
Implement `grd-tools search <query>` command that searches across all `.planning/` markdown files (STATE.md, ROADMAP.md, REQUIREMENTS.md, PLAN.md, SUMMARY.md, VERIFICATION.md) for a given text query. Returns file paths, line numbers, and matching lines. Useful for finding all references to a requirement ID, decision, or concept across planning artifacts.

### REQ-36: Requirement Status Update
**Priority:** P2
**Category:** CLI
Implement `grd-tools requirement update-status <REQ-ID> <status>` command that updates the Status column in the Traceability Matrix for a specific requirement. Valid statuses: Pending, In Progress, Done, Deferred. Validates the REQ-ID exists before updating.

## Feature 4: MCP Server Extension

### REQ-37: MCP Tools for New Commands
**Priority:** P1
**Category:** MCP
Add MCP tool definitions in COMMAND_DESCRIPTORS for all new CLI commands (requirement get, requirement list, requirement traceability, search, requirement update-status). Update MCP server test coverage to include new tools. Update docs/mcp-server.md with new tool entries.

---

## Traceability Matrix

| REQ | Feature | Priority | Phase | Status |
|-----|---------|----------|-------|--------|
| REQ-31 | Requirement Inspection | P0 | Phase 19 | Done |
| REQ-32 | Requirement Inspection | P1 | Phase 19 | Pending |
| REQ-33 | Requirement Inspection | P1 | Phase 19 | Pending |
| REQ-34 | Phase-Detail Enhancement | P0 | Phase 19 | Pending |
| REQ-35 | Convenience Commands | P2 | Phase 20 | Pending |
| REQ-36 | Convenience Commands | P2 | Phase 20 | Pending |
| REQ-37 | MCP Server Extension | P1 | Phase 21 | Pending |

---

*Requirements defined: 2026-02-16*
