---
phase: 86-elicitation-detection-and-resolution-core
plan: "01"
subsystem: discussion
tags: [elicitation, detection, types, tdd]
dependency_graph:
  requires: []
  provides: [ElicitationDetection type, detectElicitation function]
  affects: [lib/types.ts, lib/discussion.ts, tests/unit/discussion.test.ts]
tech_stack:
  added: []
  patterns: [regex-based line-by-line parsing, discriminated union detection, TDD]
key_files:
  created: []
  modified:
    - lib/types.ts
    - lib/discussion.ts
    - tests/unit/discussion.test.ts
decisions:
  - "detectElicitation uses two-pass approach: numbered_options checked first (requires consecutive line scan), then line-by-line for other patterns"
  - "Rhetorical question guard handles mid-line '?' (not at line end) rather than single-word heuristic"
  - "Pattern priority: numbered_options > clarification_phrase > direct_question > option_prompt"
  - "String literal heuristic: count unescaped quotes before '?'; odd count = inside string"
metrics:
  duration: "3m43s"
  completed: "2026-03-23"
  tasks_completed: 2
  files_modified: 3
---

# Phase 86 Plan 01: ElicitationDetection Type and detectElicitation() Summary

Regex-based elicitation detection for backend subprocess output with four pattern types and comprehensive false-positive guards, achieving 100% line coverage across 34 tests.

## What Was Built

### ElicitationDetection type (lib/types.ts)

Added `ElicitationDetection` interface with three fields:
- `question: string` — the extracted question text (matched line or joined numbered-option lines)
- `patterns: string[]` — which detection patterns matched (for debugging/logging)
- `confidence: 'high' | 'medium'` — high for direct questions/numbered options/clarification phrases; medium for option prompts

### detectElicitation() function (lib/discussion.ts)

Exported function `detectElicitation(output: string): ElicitationDetection | null` implementing:

**Detection patterns (in priority order):**
1. `numbered_options` — two-pass pre-scan for 2+ consecutive lines matching `/^\s*\d+[.)]\s+/` (confidence: high)
2. `clarification_phrase` — case-insensitive match for: "please clarify", "which approach", "could you specify", "would you prefer", "do you want" (confidence: high)
3. `direct_question` — line ends with `?` after trimming (confidence: high)
4. `option_prompt` — case-insensitive match for: "choose one", "select an option", "pick one" (confidence: medium)

**False-positive guards:**
- Lines inside ``` code block fences are skipped
- Lines starting with `//`, `/*`, `*` (comments) are skipped
- Lines starting with `#` (markdown headers) are skipped
- Lines starting with `at `, `Error:`, `Warning:` (stack traces) are skipped
- Lines where `?` appears to be inside a string literal (odd quote count before `?`) are skipped
- Lines where `?` is mid-sentence (not at line end) do not trigger `direct_question`

### Unit tests (tests/unit/discussion.test.ts)

Added 34 `detectElicitation` tests in three groups:
- 15 true positive tests (all detection patterns)
- 13 false positive tests (all guard cases)
- 6 edge case tests (confidence levels, multi-question, post-code-block, numbered options combined)

## Deviations from Plan

None — plan executed exactly as written.

## Verification Results

| Check | Result |
|-------|--------|
| `npm run build:check` | PASS |
| `npx jest tests/unit/discussion.test.ts` (162 tests) | PASS |
| `npm run lint` | PASS |
| Line coverage on detectElicitation | 100% (target: 90%) |
| Branch coverage on discussion.ts | 94.52% |
| Function coverage on discussion.ts | 100% |

## Self-Check

- [x] `lib/types.ts` contains `ElicitationDetection` interface — FOUND
- [x] `lib/discussion.ts` exports `detectElicitation` — FOUND in module.exports
- [x] `tests/unit/discussion.test.ts` contains `detectElicitation` describe block — FOUND
- [x] Commit 17e6a57 (Task 1) — FOUND
- [x] Commit 701904c (Task 2) — FOUND

## Self-Check: PASSED
