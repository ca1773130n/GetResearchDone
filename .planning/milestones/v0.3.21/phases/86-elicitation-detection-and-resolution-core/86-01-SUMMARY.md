---
phase: 86-elicitation-detection-and-resolution-core
plan: "01"
subsystem: discussion
tags:
  - elicitation
  - detection
  - tdd
  - types
dependency_graph:
  requires: []
  provides:
    - ElicitationDetection type (lib/types.ts)
    - detectElicitation() function (lib/discussion.ts)
  affects:
    - lib/discussion.ts
    - lib/types.ts
    - tests/unit/discussion.test.ts
tech_stack:
  added: []
  patterns:
    - Line-by-line regex parsing with code-block fence tracking
    - False-positive filtering via skip patterns and string-literal heuristics
key_files:
  created: []
  modified:
    - lib/types.ts
    - lib/discussion.ts
    - tests/unit/discussion.test.ts
decisions:
  - "detectElicitation uses regex-based line-by-line parsing (no NLP/AST) for maintainability"
  - "Numbered options require 2+ consecutive lines to avoid false positives on single-item lists"
  - "Rhetorical questions filtered by word count (<=3 words) AND multi-sentence context heuristic"
  - "String literal detection uses odd-quote-count heuristic before question mark position"
  - "confidence: high for direct/clarification patterns; medium for option_prompt"
metrics:
  duration: "8 minutes"
  completed: "2026-03-23T15:19:31Z"
  tasks_completed: 2
  files_modified: 3
---

# Phase 86 Plan 01: ElicitationDetection Type and detectElicitation() Summary

Implemented the `ElicitationDetection` interface and `detectElicitation()` function — the foundational layer for the v0.3.21 elicitation replacement pipeline. The function reliably identifies when a backend output is asking the user a question vs producing normal output, with 99.6% line coverage and comprehensive false-positive rejection.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Define ElicitationDetection type and implement detectElicitation() | 28acf21 | lib/types.ts, lib/discussion.ts |
| 2 | TDD unit tests for detectElicitation() | d2ceac2 | tests/unit/discussion.test.ts |

## What Was Built

### ElicitationDetection interface (lib/types.ts)

Added after the `DiscussionRoundEntry` type in the Discussion Types section:

```typescript
export interface ElicitationDetection {
  question: string;    // Extracted question text
  patterns: string[];  // Which patterns matched (for debugging)
  confidence: 'high' | 'medium';
}
```

### detectElicitation() function (lib/discussion.ts)

Line-by-line parser that:

1. Tracks ` ``` ` code fences — skips everything inside code blocks
2. Resets numbered-option runs on non-numeric lines
3. Detects numbered options (2+ consecutive `\d+[.)]` lines) before applying skip filters
4. Skips comment/header/stack-trace lines (`//`, `*`, `#`, `Error:`, `Warning:`, `at `)
5. Rejects questions inside string literals (odd-quote-count heuristic)
6. Detects clarification phrases case-insensitively
7. Filters short rhetorical questions (<=3 words in multi-sentence context)

Detection priority order:
- `numbered_options` — confidence: high
- `clarification_phrase` — confidence: high (Please clarify, Which approach, Could you specify, Would you prefer, Do you want)
- `option_prompt` — confidence: medium (Choose one, Select an option, Pick one)
- `direct_question` — confidence: high (line ends with ?)

### Unit Tests (tests/unit/discussion.test.ts)

30 new tests in `describe('detectElicitation', ...)` added to the existing `describe('lib/discussion.ts', ...)`:

- 14 true positive tests covering all detection patterns
- 9 false positive tests (comments, headers, string literals, code blocks, error lines, rhetorical questions, empty input, normal output, single numbered item)
- 7 edge case tests (first-match behavior, joined numbered lines, confidence values, post-code-block detection)

## Verification Results

- `npm run build:check` — PASS (type-check clean)
- `npx jest tests/unit/discussion.test.ts` — 158 tests pass (30 new detectElicitation tests)
- Coverage on `lib/discussion.ts`: **99.6% lines, 97.1% branches, 100% functions** (target: 90%+)
- `npm run lint` — PASS (no lint errors)

## Deviations from Plan

None — plan executed exactly as written.

The implementation followed the spec precisely:
- All 4 detection patterns implemented in priority order
- All specified false-positive cases handled
- Clarification phrases matched case-insensitively
- numbered_options returns joined lines with newlines in the `question` field
- Export added to `module.exports`

## Self-Check: PASSED

- [x] lib/types.ts contains `ElicitationDetection` interface (line 207)
- [x] lib/discussion.ts exports `detectElicitation` (lines 899, 1029)
- [x] tests/unit/discussion.test.ts contains `detectElicitation` describe block (30 tests)
- [x] Commits 28acf21, d2ceac2 exist in git log
- [x] All tests pass (158/158)
- [x] Coverage 99.6% (>90% threshold)
- [x] Type-check passes
- [x] Lint passes
