# Changelog

All notable changes to GRD are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)

## [Unreleased]

### Added

- **Scheduler idle watchdog (Spec 2B)** — new
  `SchedulerConfig.idle_timeout_seconds` (default 900) kills spawned
  backend subprocesses that produce no stdout/stderr data for the
  configured duration. Distinct from `opts.timeout` (total timeout);
  the idle watchdog only fires on complete silence, so legitimate
  streaming inference is unaffected. On trip: SIGTERM → 5-second
  grace → SIGKILL. New `idleTimedOut: boolean` flag on
  `SchedulerSpawnResult`.
- **`lib/scheduler.ts` `_spawnWithRetry` rewrite** — replaces
  `execFile` with `spawn` + manual stdout/stderr buffering, preserving
  50MB maxBuffer semantics and all other behaviors (rate-limit
  detection, token parsing, sample recording, persistence).
- **Prompt injection scanner** — new `gd scan` CLI subcommand (`gd scan`, `gd scan --diff`, `gd scan --file`, `gd scan --all`) detects 18 prompt injection patterns across 7 categories in bundled markdown (commands/, agents/, templates/, docs/). Patterns adopted from [gsd-2](https://github.com/gsd-build/gsd-2) v2.67 `scripts/docs-prompt-injection-scan.sh` and `scripts/base64-scan.sh`. Includes base64 obfuscation detection and `.prompt-injection-scanignore` for suppressing known false positives. First phase of the `gsd-2-selective-adoption` milestone. See `docs/superpowers/specs/2026-04-11-gsd2-prompt-injection-scan-design.md`.
- **`docs-check` CI job** — runs `gd scan --diff origin/<base>` on every PR, blocking PRs that introduce unignored prompt injection patterns.
- **`npm run hooks:install`** — opt-in installer for a vanilla `.git/hooks/pre-commit` stub that runs `gd scan` on staged markdown. Not installed by postinstall.
- **Scheduler wait-for-recovery fallback** — when `scheduler.spawn` would
  otherwise fall through to `free_fallback` because all priority accounts
  are exhausted, it now computes the soonest time any account will regain
  headroom (via sample aging) and sleeps until then. Wait is capped by
  new `SchedulerConfig.max_wait_minutes` (default 90). Cancellable via
  Ctrl+C. Pattern adopted from [gsd-2](https://github.com/gsd-build/gsd-2)
  v2.67 `auto-timeout-recovery.ts`. First phase of spec 2A/4 of the
  `gsd-2-selective-adoption` milestone.
- **`lib/scheduler-wait.ts`** — new module with `waitUntilOrAbort`
  cancellable sleep primitive and lazy SIGINT handler registration.
- **`computeSoonestRecovery` and `_anyPriorityHasHeadroom`** exported from
  `lib/scheduler.ts` for the wait-branch logic.
- **`SchedulerConfig.max_wait_minutes`** — new optional field, default 90
  minutes. Set to 0 to disable the wait (preserves pre-Spec-2A behavior).
- **Autoresearch scheduler routing** — `lib/autoresearch.ts` (Karpathy
  autonomous experiment loop) is now converted from synchronous spawn to
  async, and routes its Claude subprocess calls through `scheduler.spawn`
  when a scheduler is available. Autoresearch now participates in
  per-account token tracking and rate-limit handling.
- **`lib/phase-complete.ts`** — new module containing the extracted
  `_phaseCompleteCore` (moved from `lib/phase.ts`) and a new autopilot-safe
  `completePhaseAfterPostPipeline` wrapper. The wrapper catches all errors
  and returns `null` on failure instead of throwing, so autopilot cannot
  crash on a phase-finalize failure. Part of spec 3/4 of the
  `gsd-2-selective-adoption` milestone.
- **Autopilot `phase-finalize` status marker step** — new
  `phase-finalize: started/completed/failed` marker written after the
  post-pipeline step.
- **Token optimization system (Spec 4)** — adaptive model-tier routing
  that downgrades expensive agents to cheaper tiers based on budget
  pressure and task complexity.
  - New `token_profile` preference in `.planning/config.json`
    (`frugal` / `balanced` / `quality`, default `balanced`). Set via
    `gd settings token_profile <value>`.
  - New `lib/complexity.ts` with `estimateComplexity` pure function
    (21-agent baseline table + prompt-length + sample-tail demotion).
  - New `isBudgetPressured` and `computeBudgetPressureLevel` in
    `lib/scheduler.ts`. Classifies pressure as `none` / `warning`
    (>=60%) / `high` (>=80%) / `critical` (>=95%).
  - New `computeEffectiveModelTier` in `lib/backend.ts`. Combines
    profile + pressure + complexity via an auditable 3x4x3 decision
    matrix.
  - New `getEffectiveTierForDispatch` helper in `lib/backend.ts` used
    by autopilot, evolve, and autoresearch.
  - New `SchedulerConfig.budget_pressure_thresholds` field.
  - New `Scheduler.getStates()` accessor.

### Changed

- **`gd autopilot`, `gd evolve`, and `gd autoresearch` now use adaptive
  model-tier routing.** Before each agent dispatch, these loops call
  the Spec 4 chain (complexity -> pressure -> effective tier) and pass
  the effective tier to `resolveModelForAgent`. When the scheduler is
  absent, behavior is unchanged from pre-Spec-4.
- **`gd autopilot` now auto-finalizes phases.** After a successful
  post-pipeline step, autopilot calls `completePhaseAfterPostPipeline`
  to tick the ROADMAP.md checkbox, update STATE.md's current phase,
  run quality analysis, and generate a cleanup plan if issues exceed
  threshold. Previously, autopilot stopped at the post-pipeline step
  and required the user to run `gd phase complete N` manually for
  every phase. The CLI command `gd phase complete` is unchanged and
  continues to work as a manual recovery path.

### Fixed

- README.md `## Credits` no longer links to the now-404 `coleam00/get-shit-done` repository. Replaced with `gsd-build/gsd-2` and noting v1 heritage plus v2 patterns.
- CLAUDE.md claim that a pre-commit hook runs lint was stale — no such hook was installed. Updated to describe the new opt-in `gd scan` hook.
- **"Stuck at rate limit" symptom in long-running operations** — the
  actual mechanism was `scheduler.spawn` giving up after cycling through
  exhausted accounts instead of waiting for the soonest sample window
  to age out. The new wait-for-recovery fallback addresses this directly.
- **Autopilot's next-milestone transition no longer stalls.** Because
  autopilot now finalizes phases automatically, `_isAllPhasesComplete`
  (which checks `disk_status === 'complete'`) reports completion
  correctly at the end of a milestone, unblocking the next-milestone
  transition.

### Known limitations

- `SchedulerSpawnResult` does not expose captured stdout, so autoresearch
  paths that need `captureOutput: true` (the experiment iteration
  hypothesis matcher) still use the synchronous fallback. Extending the
  scheduler result shape to include stdout is a follow-up improvement.

## [0.1.6] - 2026-02-19

### Added

- **Validation gate system:** New `lib/gates.js` module with 6 pre-flight checks (orphaned phases, phase-in-roadmap, phase-has-plans, stale artifacts, old-phases-archived, milestone-state-coherence) and declarative gate registry mapping 10 commands
- **Phase directory archival:** `cmdMilestoneComplete` now archives all phase directories to `.planning/milestones/{version}-phases/` and clears `.planning/phases/`
- **`suggested_start_phase`:** `cmdInitNewMilestone` scans archived and current phases to recommend next phase number
- **`consistency_warning`:** `findPhaseInternal` warns when a phase exists on disk but not in ROADMAP.md

### Changed

- **Gate integration:** Pre-flight gates run before `execute-phase`, `plan-phase`, `new-milestone`, `phase-add`, `phase-insert`, `phase-complete`, `milestone-complete`, `verify-work`, and `iterate`
- **`autonomous_mode` in config:** YOLO mode now bypasses validation gates (violations still reported with `bypassed: true`)
- **`cmdValidateConsistency` refactored:** Reuses `checkOrphanedPhases` from gates; orphaned phases promoted from warnings to errors

### Testing

- 1,433 tests (+34 from v0.1.5)
- New `tests/unit/gates.test.js` with 20 gate tests
- Phase archival and consistency_warning tests added

## [0.1.5] - 2026-02-17

### Changed

- **Long-term roadmap redesign:** Replaced rigid Now/Next/Later tier system with flat, ordered LT-N milestones supporting full CRUD operations
- **12 new subcommands:** `list`, `add`, `remove`, `update`, `refine`, `link`, `unlink`, `display`, `init`, `history`, `parse`, `validate`
- **Protection rules:** Cannot remove LT milestones with shipped normal milestones; cannot unlink shipped versions
- **Auto-initialization:** `init` subcommand auto-groups existing ROADMAP.md milestones into LT-1
- **Normal milestone linking:** Each LT milestone tracks linked normal milestones with `(planned)` annotations
- **12 MCP tools:** Replaced 9 old tools (`mode`, `generate`, `promote`, `tier`) with 12 new CRUD tools

### Removed

- `mode`, `generate`, `promote`, `tier` subcommands (replaced by flat LT-N model)
- Now/Next/Later tier hierarchy
- `roadmap_type` and `planning_horizon` frontmatter fields

### Documentation

- **New tutorial:** `docs/long-term-roadmap-tutorial.md` with step-by-step guide and breakdown refinement workflow
- Updated README, CLAUDE.md, MCP server docs, quickstart, slash command definition

## [0.1.4] - 2026-02-17

### Added

- **`/grd:long-term-roadmap` slash command:** Interactive wizard for creating/displaying LONG-TERM-ROADMAP.md, refining milestones, and promoting through tiers
- **`/grd:requirement` slash command:** Look up requirements by ID, list with filters, query traceability matrix, update status

### Fixed

- **Skill registration for 28 commands:** Added YAML frontmatter (`description` + `argument-hint`) to 28 command files that were missing it. Commands without frontmatter were not registered as skills by the plugin system, making them invisible to the AI model. All 45 commands now register as skills.
- **Documentation accuracy:** README command table expanded from 24 to 45 commands, MCP tool count updated to 102

### Commands now registered as skills (were previously invisible)

`add-phase`, `add-todo`, `audit-milestone`, `check-todos`, `complete-milestone`, `dashboard`, `debug`, `discuss-phase`, `execute-phase`, `health`, `insert-phase`, `list-phase-assumptions`, `map-codebase`, `new-milestone`, `new-project`, `pause-work`, `phase-detail`, `plan-milestone-gaps`, `plan-phase`, `progress`, `quick`, `remove-phase`, `research-phase`, `resume-project`, `set-profile`, `settings`, `verify-phase`, `verify-work`

## [0.1.3] - 2026-02-17

### Added

- **MCP extension wiring:** 5 new MCP tools (requirement get/list/traceability/update-status, search) — total 102
- **Execute-phase branching fix:** `base_branch` config field, checkout-and-pull before branch creation, 4 graceful edge-case handlers

## [0.1.2] - 2026-02-16

### Added

- **Requirement CLI commands:** `requirement get`, `requirement list`, `requirement traceability`, `requirement update-status`
- **Search CLI command:** Full-text search across planning documents
- **Phase cleanup analysis:** Complexity, dead exports, file size, doc drift, test coverage gaps

## [0.1.1] - 2026-02-16

### Added

- **Code review integration:** Auto code review with configurable timing and severity gates
- **Agent Teams execution:** Wave-based parallel plan execution with named teammates
- **Eval reporting:** Quantitative evaluation collection and ablation analysis

## [0.1.0] - 2026-02-16

### Added

- **Multi-backend support:** Detect and adapt to Claude Code, Codex CLI, Gemini CLI, and OpenCode backends
- **Dynamic model detection:** OpenCode backend discovers available models via `opencode models` CLI with 5-min TTL cache
- **Backend capabilities registry:** Per-backend feature flags (subagents, parallel, teams, hooks, mcp)
- **`detect-backend` CLI command:** Returns backend name, resolved models, `models_source` field, and capabilities
- **Long-term roadmap:** `LONG-TERM-ROADMAP.md` for multi-milestone planning (redesigned in v0.1.5)
- **`long-term-roadmap` CLI command:** Milestone management subcommands (redesigned in v0.1.5)
- **Auto-cleanup quality analysis:** Optional phase-boundary code quality checks (ESLint complexity, dead exports, file size)
- **`quality-analysis` CLI command:** Structured quality reports per phase
- **Long-term roadmap tutorial:** `docs/long-term-roadmap-tutorial.md` (rewritten in v0.1.5)

### Changed

- **`resolveBackendModel` signature:** New optional `cwd` param for dynamic model detection (backward compatible)
- **`cmdDetectBackend` output:** Added `models_source` field (`"detected"` or `"defaults"`)
- **All `cmdInit*` functions:** Now include `backend` and backend-resolved model names in output
- **Context init:** Backend capabilities integrated into all 14 workflow initializers

### Testing

- 858 tests (up from 594 in v0.0.5)
- `lib/backend.js` at 98.96% statement coverage
- All lib/ modules maintain >= 80% line coverage

## [0.0.5] - 2026-02-15

### Added

- **Input validation layer:** All CLI entry points validate phase numbers, file paths, git refs, and subcommands before dispatch
- **JSDoc documentation:** All exported functions in 10 lib/ modules have JSDoc comments with @param and @returns
- **CONTRIBUTING.md:** Contributor guide with architecture overview, test guide, and PR guidelines
- **Status dashboard commands:** `grd:dashboard`, `grd:phase-detail`, `grd:health` for project visibility

### Changed

- **Version bump to 0.0.5:** First production-quality release
- **Modular architecture:** Monolithic grd-tools.js (5,632 lines) decomposed into 10 lib/ modules (largest: 1,573 lines)
- **Security hardening:** All execSync calls replaced with execFileSync + argument arrays; git operation whitelist enforced
- **CI/CD pipeline:** GitHub Actions workflow with Node 18/20/22 matrix, lint, test, format check, security audit
- **Code style enforcement:** ESLint + Prettier configured and enforced in CI

### Security

- Zero command injection vectors (verified by code audit)
- Path traversal blocked in all file path arguments
- Git ref flag injection blocked
- Git operation whitelist prevents destructive commands

### Testing

- 594 tests (unit + integration)
- > = 80% line coverage on lib/ modules
- 27 golden snapshot tests for CLI output stability
- 78 integration tests for end-to-end CLI behavior

## [0.0.4] - 2026-02-12

### Added

- **Date scheduling for Jira Plans:** Milestone `**Start:**`/`**Target:**` and phase `**Duration:** Nd` metadata in ROADMAP.md
- `computeSchedule()` engine in grd-tools.js — deterministic date computation from milestone start + cumulative durations
- `tracker schedule` command — read-only computed schedule JSON
- `tracker prepare-reschedule` command — cascade date updates to synced Jira issues
- `/grd:sync reschedule` mode — manual trigger for date cascade
- `start_date_field` config (`customfield_10015` default) for Jira start date field mapping
- `default_duration_days` config (7 default) for phases without explicit `**Duration:**`
- Auto-reschedule in `/grd:add-phase` and `/grd:insert-phase` when `auto_sync` enabled
- Phase add generates `**Duration:** 7d`, phase insert generates `**Duration:** 3d`
- `prepare-roadmap-sync` now includes `start_date`, `due_date`, `start_date_field` in operations
- `roadmap analyze` now includes `duration_days`, `start_date`, `due_date` per phase

### Changed

- `templates/config.json`: added `start_date_field`, `default_duration_days` to `mcp_atlassian`
- `templates/roadmap.md`: added `**Duration:**` to phase templates, `**Start:**`/`**Target:**` to milestone template
- `commands/sync.md`: date-aware create operations, new reschedule mode
- `commands/add-phase.md`, `commands/insert-phase.md`: reschedule notification step
- `commands/tracker-setup.md`: start date field and duration configuration questions
- `agents/grd-roadmapper.md`: date fields in tracker create operations
- `references/mcp-tracker-protocol.md`: date scheduling and reschedule protocol
- `references/tracker-integration.md`: schedule section with date computation model

## [0.0.3] - 2026-02-12

### Changed

- **BREAKING:** Replaced Jira curl-based integration with mcp-atlassian MCP server
- **BREAKING:** Jira mapping hierarchy: Milestone → Epic, Phase → Task, Plan → Sub-task (was Phase → Epic, Plan → Task)
- Config keys: `milestone_issue_type`, `phase_issue_type`, `plan_issue_type` (auto-migrated from old `epic_issue_type`/`task_issue_type`)
- Tracker integration now uses prepare/execute/record pattern for MCP Atlassian
- Old `"jira"` provider configs auto-migrate to `"mcp-atlassian"` at read time
- `grd-tools.js`: removed `createJiraTracker()`, `jiraRequest()`, all curl-based Jira code
- `grd-tools.js`: added `prepare-roadmap-sync`, `prepare-phase-sync`, `record-mapping`, `record-status` subcommands
- `prepare-roadmap-sync` now creates operations for both milestones (Epics) and phases (Tasks)
- `prepare-phase-sync` now creates Sub-task operations (was Task)
- `record-mapping` supports `--type milestone` with `--milestone` flag
- TRACKER.md now has Milestone Issues, Phase Issues, and Plan Issues sections
- All agent/command tracker blocks updated with new mapping hierarchy
- `commands/sync.md` and `commands/tracker-setup.md` rewritten for MCP Atlassian

### Added

- `references/mcp-tracker-protocol.md` — protocol reference for MCP tracker sync
- MCP Atlassian auth handled transparently by MCP server (no env vars needed)

### Removed

- Jira curl-based REST API calls
- `JIRA_EMAIL`, `JIRA_API_TOKEN`, `JIRA_OAUTH_TOKEN` environment variable dependencies

## [0.0.2] - 2026-02-12

### Added

- Tracker integration: GitHub Issues + Jira with shared abstraction
- `/grd:sync` command for manual tracker sync
- `/grd:tracker-setup` command for interactive tracker configuration
- `/grd:update` command for self-update with patch preservation
- `/grd:reapply-patches` command for restoring local modifications
- `bin/grd-manifest.js` for SHA256-based modification detection
- `grd-file-manifest.json` generated manifest for update tracking
- CHANGELOG.md

### Changed

- Documentation: CLAUDE.md, README.md, help.md now document grd-tools.js capabilities
- `templates/config.json`: replaced `github_integration` with `tracker` section

## [0.0.1] - 2026-01-28

### Added

- Fork of GSD with R&D extensions
- 38 commands (28 from GSD + 10 R&D-specific)
- 19 agents (11 from GSD + 8 R&D-specific)
- `grd-tools.js` with 80+ CLI subcommands
- Research knowledge base (`.planning/research/`)
- Tiered verification (sanity / proxy / deferred)
- Autonomous mode (YOLO)
- Code review integration
- Agent Teams support
