# State

**Updated:** 2026-02-16

## Current Position

- **Active phase:** Phase 13 complete — proceeding to Phase 14
- **Current plan:** All plans complete (13-01 and 13-02 done)
- **Milestone:** v0.1.0 — Setup Functionality & Usability
- **Progress:** Phase 13 of 15 [#########-] 79% (11/14 plans in v0.1.0, 858 tests)
- **Next:** Phase 14 — Auto-Cleanup Doc Drift & Plan Generation

## Pending Decisions

None.

## Deferred Validations

| ID | Description | From Phase | Validates At | Status |
|----|-------------|-----------|-------------|--------|
| DEFER-08-01 | User acceptance testing of TUI dashboard commands | Phase 8 | post-v1.0 | PENDING |
| DEFER-09-01 | Backend detection accuracy across real environments | Phase 9 | Phase 15 | PENDING |
| DEFER-10-01 | Context init backward compatibility under all 4 backends | Phase 10 | Phase 15 | PENDING |
| DEFER-11-01 | Long-term roadmap round-trip integrity | Phase 11 | Phase 15 | PENDING |
| DEFER-13-01 | Auto-cleanup non-interference when disabled | Phase 13 | Phase 15 | PENDING |

## Key Decisions

| Date | Decision | Phase | Rationale |
|------|----------|-------|-----------|
| 2026-02-16 | Scope v0.1.0 to detection + model resolution only | Planning | Sub-agent spawning divergence is critical risk; defer orchestrator adaptation to v0.2.0 |
| 2026-02-16 | Mark Gemini capabilities as experimental | Planning | Gemini CLI sub-agents are experimental; degrade gracefully |
| 2026-02-16 | Three independent feature streams with integration phase | Planning | Backend, hierarchical roadmap, and auto-cleanup are independent; converge at Phase 15 |
| 2026-02-16 | Read config.json directly in backend.js (no utils.js import) | Phase 9 | Avoids circular dependency; utils.js will import from backend.js in plan 09-02 |
| 2026-02-16 | Exclude AGENT env var from OpenCode detection | Phase 9 | Per PITFALLS.md P5: too generic, collision risk with other tools |
| 2026-02-16 | Optional cwd param on resolveModelForAgent (not breaking) | Phase 9 | Appended as third parameter; existing 2-arg callers unchanged |
| 2026-02-16 | Dynamic CLAUDE_CODE_* env var cleanup in tests | Phase 9 | Hardcoding specific vars would break as Claude Code adds new env vars |
| 2026-02-16 | Use loadConfig in cmdDetectBackend (not backend.js readConfig) | Phase 10 | Consistent with other cmd* functions; avoids duplicating internal readConfig |
| 2026-02-16 | Wire detect-backend as top-level CLI route (no subcommand) | Phase 10 | Matches flat CLI pattern of existing commands |
| 2026-02-16 | Direct import from lib/backend.js in context.js | Phase 10 | utils.js does not re-export getBackendCapabilities; cleaner than adding re-export |
| 2026-02-16 | All 14 cmdInit* get backend fields regardless of model usage | Phase 10 | Consistent output shape; any downstream agent can adapt behavior |
| 2026-02-16 | Used extractFrontmatter from lib/frontmatter.js for YAML parsing | Phase 11 | Consistency with existing codebase; avoids duplicating YAML parser |
| 2026-02-16 | Later milestones: success_criteria optional (warning not error) | Phase 11 | Per research: Later tier is rough; forcing success criteria adds false precision |
| 2026-02-16 | getPlanningMode reads frontmatter for explicit override | Phase 11 | Allows users to opt-out of hierarchical mode without deleting file |
| 2026-02-16 | Local flag() helper in commands.js for generate subcommand args | Phase 11 | Avoids importing grd-tools.js flag(); keeps commands.js self-contained |
| 2026-02-16 | In-place markdown editing via replaceSubsection helper | Phase 12 | Preserves exact formatting; avoids serialize/deserialize round-trip |
| 2026-02-16 | Later->Next promotion fills TBD placeholders for required fields | Phase 12 | Allows user to fill in details after promotion |
| 2026-02-16 | Next->Now uses estimated_start as Start date when available | Phase 12 | Falls back to today's date if no estimated_start |
| 2026-02-16 | Structured JSON output includes content field with full updated markdown | Phase 12 | Downstream agents can write the file directly without re-parsing |
| 2026-02-16 | Promote subcommand calls getMilestoneTier on result to report new_tier | Phase 12 | Provides immediate feedback on promotion result |
| 2026-02-16 | Refine subcommand reports updated_fields array from Object.keys(updates) | Phase 12 | Audit trail for which fields were updated |
| 2026-02-16 | execFileSync over execSync for ESLint subprocess | Phase 13 | Avoids shell quoting issues with JSON rule arguments |
| 2026-02-16 | Relative paths with -- separator for ESLint v10 | Phase 13 | ESLint v10 rejects absolute paths outside base path |
| 2026-02-16 | fs.realpathSync for macOS path resolution in ESLint parser | Phase 13 | Handles /var vs /private/var symlink for correct relative paths |
| 2026-02-16 | Regex-based dead export detection (not AST) for v0.1.0 | Phase 13 | Simplicity goal; catches obvious dead exports, edge cases accepted |
| 2026-02-16 | Non-blocking quality analysis in phase completion | Phase 13 | Errors swallowed via try/catch; phase completion never fails due to quality checks |
| 2026-02-16 | quality_report field conditionally spread (absent when disabled) | Phase 13 | Clean JSON output; no null fields when feature is off |
| 2026-02-16 | Raw output appends quality only when issues > 0 | Phase 13 | Non-interference: clean output when no problems found |
| 2026-02-16 | Dynamic model detection via CLI probing for OpenCode only | Post-13 | Only OpenCode has `opencode models` CLI; other backends lack programmatic listing |
| 2026-02-16 | 5-min TTL cache for detected models | Post-13 | Avoids repeated subprocess spawns; clearModelCache() exported for tests |
| 2026-02-16 | Resolution priority: config > detected > defaults | Post-13 | User overrides always win; detected models fill gap between config and stale defaults |

<details>
<summary>v0.0.5 Decisions (57 decisions)</summary>

| Date | Decision | Phase | Rationale |
|------|----------|-------|-----------|
| 2026-02-12 | Modularize before testing | Planning | 5,632-line monolith is untestable; modules enable unit testing |
| 2026-02-12 | Jest for test framework | Planning | Largest ecosystem, snapshot testing, coverage tooling |
| 2026-02-12 | Defer TypeScript to post-v1.0 | Planning | Scope control; v1.0 is quality infrastructure only |
| 2026-02-12 | Defer async I/O migration | Planning | Sync is fine for CLI tools; no measurable benefit |
| 2026-02-12 | Security before modularization | Planning | Small, high-impact, low-risk changes land first |
| 2026-02-15 | JSDoc only on exported functions | Phase 7 | Internal helpers left undocumented; 105 exported functions across 10 modules |
| 2026-02-15 | Accepted module sizes above 500 lines per Phase 3 decisions | Phase 7 | commands.js (1,573), tracker.js (996), phase.js (904), context.js (840) accepted |

(Full log: see `.planning/milestones/v0.0.5-ROADMAP.md`)

</details>

## Blockers

None.

## Performance Metrics

**Velocity (v0.0.5):**
- Total plans completed: 23
- Average duration: 5.6 min
- Total execution time: ~2.2 hours

**v0.1.0:**

| Phase | Plan | Duration | Tasks | Files | Test Delta |
|-------|------|----------|-------|-------|------------|
| 09 | 01 | 3min | 2 | 3 | +62 tests (656 total) |
| 09 | 02 | 3min | 2 | 2 | +18 tests (674 total) |
| 10 | 01 | 3min | 2 | 3 | +8 tests (682 total) |
| 10 | 02 | 4min | 2 | 2 | +8 tests (690 total) |
| 11 | 01 | 4min | 2 | 2 | +32 tests (722 total) |
| 11 | 02 | 4min | 2 | 3 | +22 tests (744 total) |
| 12 | 01 | 3min | 2 | 2 | +28 tests (772 total) |
| 12 | 02 | 3min | 2 | 3 | +24 tests (796 total) |
| 13 | 01 | 6min | 2 | 2 | +25 tests (821 total) |
| 13 | 02 | 4min | 2 | 5 | +20 tests (841 total) |
| — | dynamic-models | 5min | 4 | 6 | +17 tests (858 total) |

## Session Continuity

- **Last action:** Implemented dynamic model detection via CLI probing (OpenCode `opencode models`)
- **Next action:** Proceed to Phase 14 (Auto-Cleanup Doc Drift & Plan Generation)
- **Context needed:** `detect-backend` now includes `models_source` field ("detected" or "defaults"); `resolveBackendModel` accepts optional `cwd` param for dynamic detection

---

*State managed by: Claude (grd-executor)*
*Last updated: 2026-02-16*
