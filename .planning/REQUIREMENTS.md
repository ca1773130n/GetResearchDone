# Requirements: v0.3.20 Multi-Agent Cross-Backend Discussion

**Milestone:** v0.3.20
**Created:** 2026-03-23

## Backend Role Registry

### REQ-134: Backend Role Configuration
**Priority:** P1 — High
**Category:** Infrastructure
**Description:** Add a `backend_roles` section to `.planning/config.json` allowing users to assign AI backends to specific roles. Roles include: `reviewer` (reviews plans, code, PRs), `brainstormer` (multi-perspective ideation and discussion), `verifier` (checks implementation correctness), `executor` (runs phase execution). Each role maps to a backend ID (`claude`, `codex`, `gemini`, `opencode`). Default: all roles map to the detected primary backend. Example config: `{ "backend_roles": { "reviewer": "codex", "brainstormer": "gemini", "verifier": "codex", "executor": "claude" } }`. Validation: role values must be valid backend IDs from `VALID_BACKENDS`.

### REQ-135: Backend Availability Detection
**Priority:** P1 — High
**Category:** Infrastructure
**Description:** Implement `detectAvailableBackends()` in `lib/backend.ts` that probes which AI CLI backends are actually installed and accessible on the current machine. Detection methods: check for CLI binaries in PATH (`claude`, `codex`, `gemini`, `opencode`), verify they respond to a version/help command. Returns a `Record<BackendId, { available: boolean, version: string | null }>`. Used by the role registry to validate that configured backends are actually usable. Cached with 5-minute TTL (reuses existing OpenCode model detection caching pattern).

### REQ-136: Cross-Backend Agent Dispatch
**Priority:** P1 — High
**Category:** Core
**Description:** Implement `dispatchToBackend(backendId, prompt, options)` in a new `lib/discussion.ts` module. Spawns an agent on a non-primary backend by invoking that backend's CLI with a structured prompt. For Claude Code: uses `claude --print` or Task agent. For Codex: uses `codex -q` with prompt. For Gemini: uses `gemini` CLI with prompt. For OpenCode: uses `opencode` CLI with prompt. Returns structured response with `backend`, `response_text`, `duration_ms`, `token_usage` (when available). Handles timeouts (configurable, default 5 minutes), backend unavailability (graceful skip with reason), and stderr capture for error reporting.

## Multi-Backend Discussion Protocol

### REQ-137: Discussion Round Orchestration
**Priority:** P1 — High
**Category:** Core
**Description:** Implement `runDiscussion(topic, participants, options)` in `lib/discussion.ts`. A discussion round consists of: (1) Present the topic/question to each participant backend in parallel, (2) Collect responses, (3) Share all responses with a synthesizer backend for cross-pollination, (4) Optionally run a second round where each participant can respond to the synthesis. `participants` is an array of backend IDs. `options` includes `rounds` (1-3, default 2), `synthesizer` (backend ID, default primary), `timeout_per_round` (default 3 minutes). Returns structured `DiscussionResult` with per-round responses, synthesis, and final consensus.

### REQ-138: Auto-Discussion Before Planning
**Priority:** P1 — High
**Category:** Integration
**Description:** Integrate discussion rounds into the plan-phase workflow. When `backend_roles.brainstormer` is configured and available, automatically run a discussion round before phase planning. The discussion topic is derived from the phase goal and requirements. Discussion output is written to the phase's research directory and included in the planner's context. This replaces/augments the existing research step. Controlled by a `discussion.before_planning` config flag (default: true when brainstormer role is configured).

### REQ-139: Auto-Discussion Before Execution
**Priority:** P2 — Medium
**Category:** Integration
**Description:** Optionally run a discussion round before phase execution to surface implementation concerns. When enabled via `discussion.before_execution` config flag (default: false), the executor receives discussion output as additional context. Discussion topic includes the plan being executed, known constraints, and potential pitfalls. Lighter than planning discussion — single round by default.

## Cross-Backend Review

### REQ-140: Plan Review via Configured Reviewer
**Priority:** P1 — High
**Category:** Review
**Description:** When `backend_roles.reviewer` is configured and points to a non-primary backend, dispatch generated plans to that backend for review before execution. The reviewer receives: the plan, phase goal, requirements, and relevant codebase context. Reviewer returns structured feedback: `approved` boolean, `concerns` (list of issues with severity), `suggestions` (list of improvements). If not approved, concerns are presented to the user. Integrates with the existing `plan_check` workflow config flag.

### REQ-141: Code Review via Configured Reviewer
**Priority:** P1 — High
**Category:** Review
**Description:** After phase execution completes, dispatch the code diff to the configured reviewer backend. The reviewer receives: `git diff` of changes, phase plan, requirements, and project coding standards (from CLAUDE.md/PRINCIPLES.md). Returns structured review: `approved` boolean, `issues` (with severity: blocker/warning/suggestion, file path, line range, description), `summary`. Integrates with the existing `code_review` config section. Blockers halt the completion flow; warnings are reported.

### REQ-142: PR Review via Configured Reviewer
**Priority:** P2 — Medium
**Category:** Review
**Description:** When the worktree completion flow creates a PR (option 2: push and create PR), optionally dispatch the PR for review by the configured reviewer backend. The reviewer receives: PR diff, PR description, linked requirements. Returns review comments that are added as PR review comments via GitHub API (`gh` CLI). Controlled by `code_review.pr_review` config flag (default: true when reviewer role is configured).

## Discussion Configuration

### REQ-143: Discussion Settings in config.json
**Priority:** P1 — High
**Category:** Infrastructure
**Description:** Add a `discussion` section to `.planning/config.json`: `{ "discussion": { "enabled": true, "before_planning": true, "before_execution": false, "max_rounds": 2, "timeout_per_round_seconds": 180, "synthesizer": "claude" } }`. Expose in `/grd:settings` interview. Validate on load. When `enabled: false`, all discussion features are skipped silently.

### REQ-144: Discussion State and History
**Priority:** P2 — Medium
**Category:** Infrastructure
**Description:** Track discussion outcomes in `.planning/milestones/{milestone}/discussions/` directory. Each discussion produces a markdown file: `discussion-{phase}-{type}-{timestamp}.md` containing topic, participants, per-round responses, synthesis, and final outcome. These files are committed with phase artifacts and serve as decision audit trail. Add `grd_discussion_history` MCP tool to list/read past discussions.

## MCP and CLI Integration

### REQ-145: Discussion MCP Tools
**Priority:** P1 — High
**Category:** Infrastructure
**Description:** Register discussion MCP tools: `grd_discussion_run` (run ad-hoc discussion on a topic), `grd_discussion_config` (read/write discussion config), `grd_backends_available` (list available backends with roles), `grd_discussion_history` (list past discussions). Follow existing MCP tool patterns.

### REQ-146: /grd:discuss Slash Command
**Priority:** P1 — High
**Category:** Command
**Description:** Register `/grd:discuss <topic>` as a GRD slash command. Runs a multi-backend discussion on the given topic using configured participants. Presents each round's responses and the final synthesis inline. When called without arguments, runs a discussion on the current phase's goal and approach.

## Testing

### REQ-147: Discussion Unit Tests
**Priority:** P1 — High
**Category:** Testing
**Description:** Unit tests for all discussion functions: backend availability detection, cross-backend dispatch (mocked CLI calls), discussion round orchestration, config validation, state management. Per-file coverage threshold of 85%+ lines. Tests mirror `lib/discussion.ts` → `tests/unit/discussion.test.ts`.

### REQ-148: Discussion Integration Tests
**Priority:** P2 — Medium
**Category:** Testing
**Description:** Integration test that validates the discussion flow with mocked backend CLIs. Tests the full pipeline: detect backends → configure roles → run discussion → synthesize → write history. Uses the testbed pattern established in v0.2.7. Validates that discussion output integrates correctly with plan-phase and execute-phase workflows.

### REQ-149: Sonnet-Tier Model Ceiling for Discussion
**Priority:** P1 — High
**Category:** Infrastructure
**Description:** All discussion subagent spawns on the primary backend use sonnet-tier models at most (matching evolve/wireup model ceiling). Cross-backend dispatches use whatever model the target backend defaults to — GRD does not control model selection on external backends, only the prompt.

## Traceability Matrix

| REQ | Phase | Status |
|-----|-------|--------|
| REQ-134 | TBD | PENDING |
| REQ-135 | TBD | PENDING |
| REQ-136 | TBD | PENDING |
| REQ-137 | TBD | PENDING |
| REQ-138 | TBD | PENDING |
| REQ-139 | TBD | PENDING |
| REQ-140 | TBD | PENDING |
| REQ-141 | TBD | PENDING |
| REQ-142 | TBD | PENDING |
| REQ-143 | TBD | PENDING |
| REQ-144 | TBD | PENDING |
| REQ-145 | TBD | PENDING |
| REQ-146 | TBD | PENDING |
| REQ-147 | TBD | PENDING |
| REQ-148 | TBD | PENDING |
| REQ-149 | TBD | PENDING |
