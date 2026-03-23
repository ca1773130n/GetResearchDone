# Requirements: v0.3.21 Elicitation Replacement

**Milestone:** v0.3.21
**Created:** 2026-03-23

## Elicitation Interception

### REQ-150: Elicitation Detection in Autopilot Subprocesses
**Priority:** P1 — High
**Category:** Core
**Description:** When autopilot spawns a `claude -p` subprocess for planning or execution, detect when the subprocess outputs clarifying questions instead of proceeding. Detection heuristic: parse subprocess stdout/stderr for question patterns (lines ending with `?`, numbered option lists, "Please clarify", "Which approach"). When detected, capture the question text and pause the subprocess output consumption. This is the foundation — without detection, no routing can happen. Implementation in `lib/discussion.ts` as `detectElicitation(output: string): ElicitationDetection | null`.

### REQ-151: Elicitation Context Builder
**Priority:** P1 — High
**Category:** Core
**Description:** When an elicitation is detected, build a context package for the discussion participants. The context includes: the question being asked, the phase goal, relevant plan text, recent code changes (git diff), and project state summary. Implementation as `buildElicitationContext(question: string, options: { cwd, phase, milestone }): string` in `lib/discussion.ts`. The context must be concise enough to fit in a single dispatch prompt (under 8K tokens) while giving participants enough information to answer meaningfully.

### REQ-152: Elicitation-to-Discussion Routing
**Priority:** P1 — High
**Category:** Core
**Description:** Route detected elicitations to `runDiscussion()` with the question as topic and all configured participants. Uses a single round (speed over depth) with the primary backend as synthesizer. Returns a synthesized answer string. Implementation as `resolveElicitation(question: string, context: string, options: { participants, synthesizer, cwd }): string` in `lib/discussion.ts`. Handles edge cases: all participants unavailable (return empty string — let primary backend proceed with defaults), synthesis failure (return best single-backend response).

## Workflow Integration

### REQ-153: Autopilot Elicitation Replacement Mode
**Priority:** P1 — High
**Category:** Integration
**Description:** Add `elicitation_replacement` config flag to `.planning/config.json` discussion section (default: true when `discussion.enabled` and at least one non-primary participant is available). When enabled, autopilot subprocess spawning wraps stdout consumption with elicitation detection. Detected questions are resolved via multi-backend discussion and the answer is piped back to the subprocess stdin. Requires changing subprocess spawning from `execFileSync` to `execFile` (async) with stdin/stdout streaming for the primary backend dispatch in autopilot mode.

### REQ-154: Plan-Phase Elicitation Integration
**Priority:** P1 — High
**Category:** Integration
**Description:** During `grd:plan-phase`, the planner agent may emit questions about scope, approach, or requirements. Wire elicitation replacement into the plan-phase flow: when the planner subprocess asks a question, route it to discussion participants, feed the consensus back, and let planning continue. This replaces the current behavior where questions either block (interactive mode) or get skipped (autonomous mode with `--dangerously-skip-permissions`).

### REQ-155: Execute-Phase Elicitation Integration
**Priority:** P2 — Medium
**Category:** Integration
**Description:** During `grd:execute-phase`, the executor agent may encounter implementation decisions (which pattern to use, how to handle edge cases). Wire elicitation replacement into execution: detected questions are resolved via discussion and fed back. Lower priority than planning because execution questions are less frequent and less impactful — the plan should have resolved most ambiguity.

### REQ-156: Evolve Loop Elicitation Integration
**Priority:** P2 — Medium
**Category:** Integration
**Description:** Wire elicitation replacement into the evolve loop. When the evolve orchestrator or its sub-agents (discovery, selection, execution) emit questions, route them through multi-backend discussion. This enables fully autonomous evolve runs where AI backends collectively decide what to improve and how.

## Testing & Configuration

### REQ-157: Elicitation Detection Unit Tests
**Priority:** P1 — High
**Category:** Testing
**Description:** Unit tests for `detectElicitation()`: various question patterns, false positives (rhetorical questions in code comments, question marks in strings), multi-line questions, numbered option lists. Coverage threshold: 90%+ lines.

### REQ-158: Elicitation Round-Trip Integration Test
**Priority:** P2 — Medium
**Category:** Testing
**Description:** Integration test validating the full elicitation replacement pipeline: mock primary backend emits question → detection fires → discussion dispatched to mock participants → consensus synthesized → answer fed back. Uses the testbed pattern from v0.2.7.

### REQ-159: Elicitation Configuration in Settings
**Priority:** P1 — High
**Category:** Infrastructure
**Description:** Add elicitation settings to the discussion config section: `{ "discussion": { "elicitation_replacement": true, "elicitation_timeout_seconds": 120, "elicitation_min_participants": 1 } }`. Expose in `/grd:settings` interview. When `elicitation_replacement` is false, questions pass through to user as before.

## Traceability Matrix

| REQ | Phase | Status |
|-----|-------|--------|
| REQ-150 | Phase 86 | PENDING |
| REQ-151 | Phase 86 | PENDING |
| REQ-152 | Phase 86 | PENDING |
| REQ-153 | Phase 87 | PENDING |
| REQ-154 | Phase 87 | PENDING |
| REQ-155 | Phase 88 | PENDING |
| REQ-156 | Phase 88 | PENDING |
| REQ-157 | Phase 86 | PENDING |
| REQ-158 | Phase 88 | PENDING |
| REQ-159 | Phase 87 | PENDING |
