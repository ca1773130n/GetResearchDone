# Requirements: v0.1.1 — Completeness, Interoperability & Distribution

**Created:** 2026-02-16
**Milestone:** v0.1.1

## Feature 1: Deferred Completion (from v0.1.0)

### REQ-18: Doc Drift Detection
**Priority:** P1
**Category:** Auto-cleanup
**Deferred from:** REQ-10 (v0.1.0 Phase 14)
Detect stale documentation at phase boundaries: CHANGELOG not updated since last plan, README links broken, JSDoc parameter mismatches. Report as warnings in phase completion summary. Integrate with existing `lib/cleanup.js` quality analysis pipeline.

### REQ-19: Auto-Generated Cleanup Plan
**Priority:** P2
**Category:** Auto-cleanup
**Deferred from:** REQ-11 (v0.1.0 Phase 14)
When quality analysis (including doc drift) finds issues above configured thresholds, auto-generate a cleanup PLAN.md and append it to the current phase. User can execute or skip. Plan follows standard PLAN.md format with frontmatter.

### REQ-20: Integration & Cross-Feature Validation
**Priority:** P0
**Category:** Integration
**Deferred from:** v0.1.0 Phase 15
End-to-end validation that all v0.1.0 and v0.1.1 features work together: backend detection + context init + quality analysis + doc drift + MCP server. Run full test suite, verify no regressions, validate deferred items.

## Feature 2: Deferred Validations

### REQ-21: Backend Detection Real-Environment Accuracy
**Priority:** P1
**Category:** Validation
**Resolves:** DEFER-09-01
Validate that `detectBackend()` returns correct results in real (non-mocked) environments. Test with actual environment variable patterns from each backend. Document any detection edge cases found.

### REQ-22: Context Init Backward Compatibility
**Priority:** P1
**Category:** Validation
**Resolves:** DEFER-10-01
Validate that all 14 `cmdInit*` functions produce correct output when running under each of the 4 backends. Verify backward compatibility: existing orchestrator commands work unchanged when backend is `claude`.

### REQ-23: Long-Term Roadmap Round-Trip Integrity
**Priority:** P1
**Category:** Validation
**Resolves:** DEFER-11-01
Validate the full long-term roadmap lifecycle: create LONG-TERM-ROADMAP.md -> refine milestone -> promote through tiers -> generate ROADMAP.md. Verify no data loss or format corruption through the round-trip.

### REQ-24: Auto-Cleanup Non-Interference
**Priority:** P1
**Category:** Validation
**Resolves:** DEFER-13-01
Validate that when `phase_cleanup.enabled` is false (default), the cleanup system does not interfere with normal phase execution. No extra output, no performance impact, no side effects.

## Feature 3: MCP Server Mode

### REQ-25: MCP Server Implementation
**Priority:** P0
**Category:** MCP
Implement an MCP server (`bin/grd-mcp-server.js`) that exposes all GRD CLI commands as MCP tools. Server uses stdio transport (stdin/stdout JSON-RPC). Each grd-tools.js command maps to one MCP tool with structured input schema and JSON output. Zero external runtime deps (implement MCP protocol directly over stdio).

### REQ-26: MCP Tool Schema Generation
**Priority:** P1
**Category:** MCP
Auto-generate MCP tool definitions (name, description, inputSchema) from the existing CLI command registry. Schema includes parameter types, required/optional flags, and descriptions. Generated at server startup, not hardcoded.

### REQ-27: MCP Server Tests
**Priority:** P0
**Category:** MCP
Unit tests for MCP server: protocol handshake (initialize), tool listing (tools/list), tool execution (tools/call) for representative commands, error handling for invalid tool names and malformed input. Coverage >= 80%.

## Feature 4: Plugin Marketplace Prep (npm)

### REQ-28: npm Package Configuration
**Priority:** P1
**Category:** Distribution
Configure `package.json` for npm publishing: name (`grd-tools` or scoped `@grd/tools`), version sync with VERSION file, bin entries for `grd-tools` and `grd-mcp-server`, files whitelist (bin/, lib/, commands/, agents/, plugin.json), engines (Node >= 18). No bundling — ship source directly.

### REQ-29: Install & Setup Scripts
**Priority:** P2
**Category:** Distribution
Post-install script that creates `.planning/` directory structure and default `config.json` if not present. Setup command (`grd-tools setup`) that configures Claude Code plugin.json to point at the installed package. Uninstall cleanup optional.

### REQ-30: Distribution Validation
**Priority:** P1
**Category:** Distribution
Validate the npm package works end-to-end: `npm pack` produces valid tarball, `npm install` from tarball works, `grd-tools` CLI is accessible, MCP server starts, plugin.json paths resolve correctly. Add CI job for pack + install test.

---

## Traceability Matrix

| REQ | Feature | Priority | Phase | Status |
|-----|---------|----------|-------|--------|
| REQ-18 | Auto-cleanup | P1 | TBD | Pending |
| REQ-19 | Auto-cleanup | P2 | TBD | Pending |
| REQ-20 | Integration | P0 | TBD | Pending |
| REQ-21 | Validation | P1 | TBD | Pending |
| REQ-22 | Validation | P1 | TBD | Pending |
| REQ-23 | Validation | P1 | TBD | Pending |
| REQ-24 | Validation | P1 | TBD | Pending |
| REQ-25 | MCP | P0 | TBD | Pending |
| REQ-26 | MCP | P1 | TBD | Pending |
| REQ-27 | MCP | P0 | TBD | Pending |
| REQ-28 | Distribution | P1 | TBD | Pending |
| REQ-29 | Distribution | P2 | TBD | Pending |
| REQ-30 | Distribution | P1 | TBD | Pending |

---

*Requirements defined: 2026-02-16*
