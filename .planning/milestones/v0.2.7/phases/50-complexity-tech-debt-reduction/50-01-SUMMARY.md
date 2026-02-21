---
phase: 50-complexity-tech-debt-reduction
plan: 01
one-liner: "Removed 6 dead exports and decomposed cmdTracker into 12 handler functions"
status: complete
duration: 15min
key-files:
  - lib/commands.js
  - lib/long-term-roadmap.js
  - lib/tracker.js
  - tests/unit/tracker.test.js
key-decisions:
  - "Kept function definitions intact, only removed from module.exports: zero risk of behavioral change"
  - "Used handler dispatch map pattern for cmdTracker: enables O(1) lookup and self-documenting subcommand list"
patterns-established:
  - "Handler-per-subcommand pattern: monolithic switch -> named handlers + dispatch map"
---

## Summary

Removed 6 dead exports from `lib/commands.js` (parseRequirements, parseTraceabilityMatrix) and `lib/long-term-roadmap.js` (extractSection, extractBoldField, extractVersion, parseRefinementHistory). Verified no tests or external modules import these functions.

Decomposed `cmdTracker` (634-line switch statement with 12 cases) into 12 named handler functions (`handleGetConfig`, `handleSyncRoadmap`, etc.) plus a clean dispatcher using a `trackerHandlers` map. The dispatcher provides O(1) subcommand lookup and auto-generates the available subcommand list in error messages.

Added 2 new tests: unknown subcommand produces error with available list, and all 12 subcommands dispatch without "Unknown tracker subcommand" error.

## Verification

- All 1,844 tests pass (1,842 existing + 2 new)
- `npm run lint` exits 0
- Zero behavioral changes: all existing tracker tests pass unchanged
