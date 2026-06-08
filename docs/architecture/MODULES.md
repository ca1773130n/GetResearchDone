# GRD Module Reference

This document is a comprehensive reference for every module in `lib/`. Use it to answer "which file does X?" — each entry tells you the purpose, public API, and dependency relationships for fast navigation.

**Quick links:** [lib/*.ts modules](#top-level-libtss) | [lib/cli/](#subdirectory-libcli) | [lib/commands/](#subdirectory-libcommands) | [lib/context/](#subdirectory-libcontext) | [lib/evolve/](#subdirectory-libevolve) | [lib/scan/](#subdirectory-libscan) | [lib/wireup/](#subdirectory-libwireup) | [bin/](#bin-entry-points) | [tests/helpers/](#testshelpers)

---

## Top-Level lib/*.ts

There are 35 direct TypeScript files in `lib/` (excluding subdirectories). Total: ~30,900 lines.

### Size overview

| Module | Lines | Notes |
|--------|-------|-------|
| `lib/mcp-server.ts` | 3,292 | Largest file |
| `lib/autopilot.ts` | 2,706 | Over 2,000 lines |
| `lib/phase.ts` | 1,981 | Over 1,000 lines |
| `lib/tracker.ts` | 1,591 | |
| `lib/cleanup.ts` | 1,588 | |
| `lib/types.ts` | 1,566 | 113 exported type symbols |
| `lib/worktree.ts` | 1,309 | |
| `lib/utils.ts` | 1,308 | |
| `lib/discussion.ts` | 1,270 | |
| `lib/backend.ts` | 1,186 | |
| `lib/scheduler.ts` | 1,173 | |
| `lib/state.ts` | 1,009 | |
| `lib/long-term-roadmap.ts` | 806 | |
| `lib/autoresearch.ts` | 789 | |
| `lib/roadmap.ts` | 775 | |
| `lib/verify.ts` | 763 | |
| `lib/citations.ts` | 760 | |
| `lib/gates.ts` | 662 | |
| `lib/scan.ts` | ~580 | |
| `lib/scaffold.ts` | 480 | |
| `lib/requirements.ts` | 469 | |
| `lib/invariants.ts` | 367 | |
| `lib/got.ts` | 361 | |
| `lib/phase-complete-llm.ts` | 357 | |
| `lib/benchmark.ts` | 341 | |
| `lib/phase-complete.ts` | 332 | |
| `lib/refinement.ts` | 330 | |
| `lib/paths.ts` | 293 | |
| `lib/autoplan.ts` | 280 | |
| `lib/markdown-split.ts` | 273 | |
| `lib/knowledge.ts` | 273 | |
| `lib/overstory.ts` | 265 | |
| `lib/complexity.ts` | 119 | |
| `lib/phase-io.ts` | 73 | |
| `lib/metrics.ts` | 49 | |
| `lib/scheduler-wait.ts` | 58 | |

---

## Module: lib/types.ts

- **Path:** `lib/types.ts`
- **Size:** ~1,566 lines
- **Purpose:** Central type registry — all shared TypeScript interfaces, type aliases, and enums used across the codebase.
- **Key exports (selected):** `BackendId`, `AdapterBackendId`, `MetaBackendId`, `DirectBackendId`, `GrdConfig`, `EvolveConfig`, `SpawnOpts`, `SchedulerConfig`, `SchedulerSpawnResult`, `BackendUsageState`, `UsageSample`, `BackendAdapter`, `PhaseInfo`, `MilestoneInfo`, `DiscussionRoundEntry`, `ElicitationDetection`, `DiscussionResult`, `RunDiscussionOptions`, `Concern`, `PlanReviewResult`, `ReviewIssue`, `CodeReviewResult`, `PRReviewResult`, `PRReviewComment`, `TraversalOptions`, `TraversalResult`, `PhaseCompleteResult`, `Requirement`, `TraceabilityEntry`, `FrontmatterObject`, `GateViolation`, `PreflightResult`, `RunCache`, `CleanupConfig`, `QualityAnalysisSummary`, `MultiMilestoneOptions`, `MultiMilestoneResult`, `MilestoneStepResult`, `CritiqueBranch`, `RefinementMetrics`, `MetricSnapshot`, `MinimaRegion`, `ConvergenceConfig`, `PlanArtifact`, `ArtifactDAG`, `ArtifactDAGValidation`, `AutoplanOptions`, `AutoplanResult`, `ModelProfileName`, `BudgetPressureLevel`, `BudgetPressureThresholds`, `AccountResolution`, `SuperpowersConfig`, `ComplexityLevel` (113 total exports)
- **Direct dependencies:** None (pure type definitions)
- **Used by:** Nearly every module in `lib/` imports types from here via `import type`

---

## Module: lib/utils.ts

- **Path:** `lib/utils.ts`
- **Size:** ~1,308 lines
- **Purpose:** Shared utility functions — filesystem helpers, config loading, output/error formatting, text normalization, process execution, and milestone resolution.
- **Key exports:** `safeReadFile`, `safeReadMarkdown`, `safeReadJSON`, `output`, `error`, `loadConfig`, `getMilestoneInfo`, `normalizePhaseName`, `stripShippedSections`, `createRunCache`, `walkJsFiles`, `execGit`, `findPhaseInternal`
- **Direct dependencies:** `lib/backend.ts`
- **Used by:** `state`, `overstory`, `knowledge`, `parallel`, `verify`, `discussion`, `scheduler`, `worktree`, `scaffold`, `tracker`, `requirements`, `phase-complete`, `cleanup`, `gates`, `autoplan`, `autoresearch`, `phase-complete-llm`, `roadmap`, `frontmatter`, `deps`, `autopilot`, `markdown-split`, `phase`, `citations` — effectively the universal foundation

---

## Module: lib/autopilot.ts

- **Path:** `lib/autopilot.ts`
- **Size:** ~2,706 lines
- **Purpose:** Deterministic multi-phase orchestration — spawns isolated `claude -p` subprocesses per phase with no shared context, drives the full plan-execute-verify-complete lifecycle including convergence detection and artifact DAG validation.
- **Key exports:** (all internal, accessed via `module.exports`) `cmdAutopilot`, `cmdAutopilotMultiMilestone`, `runMilestoneStep`, `runPhaseStep`
- **Direct dependencies:** `utils`, `backend`, `roadmap`, `deps`, `long-term-roadmap`, `scheduler`, `overstory`, `worktree`, `refinement`, `knowledge`, `phase-complete`, `parallel`, `phase`, `gates`
- **Used by:** `mcp-server.ts`

---

## Module: lib/autoplan.ts

- **Path:** `lib/autoplan.ts`
- **Size:** ~280 lines
- **Purpose:** Converts evolve discovery results into structured milestones — bridges the evolve subsystem's (now-deprecated) grouped work items with the new-milestone skill to create phases, requirements, and a roadmap without human input.
- **Key exports:** `cmdAutoplan`, `runAutoplan`
- **Direct dependencies:** `utils`, `evolve/discovery`, `evolve/state`
- **Used by:** `mcp-server.ts`

---

## Module: lib/autoresearch.ts

- **Path:** `lib/autoresearch.ts`
- **Size:** ~789 lines
- **Purpose:** Autonomous research loop — dispatches research agents across backends, aggregates results, manages the research knowledge base, and integrates citations.
- **Key exports:** `cmdAutoresearch`, `runAutoresearch`
- **Direct dependencies:** `utils`, `backend`, `paths`, `knowledge`, `citations`
- **Used by:** `mcp-server.ts`

---

## Module: lib/backend.ts

- **Path:** `lib/backend.ts`
- **Size:** ~1,186 lines
- **Purpose:** Backend capability registry and spawn infrastructure — defines `BACKEND_CAPABILITIES`, `EFFORT_PROFILES`, `MODEL_PROFILES`, and provides account resolution, binary detection, and backend state management.
- **Key exports:** `ADAPTERS`, `ENV_VAR_MAP`, `FREE_FALLBACK_BUDGET`, `createBackendState`, `updateEWMA`, `evictExpiredSamples`, `recordSample`, `pickBackend`, `computeSoonestRecovery`, `isBudgetPressured`, `logPressureTransition`, `computeBudgetPressureLevel`, `resolveAccount`, `markInFlight`, `markComplete`, `checkBinary`, `Scheduler` (interface), `createScheduler`
- **Direct dependencies:** `scheduler`, `scheduler-wait`, `metrics`
- **Used by:** `parallel`, `mcp-server`, `discussion`, `utils`, `autoresearch`, `autopilot`

---

## Module: lib/benchmark.ts

- **Path:** `lib/benchmark.ts`
- **Size:** ~341 lines
- **Purpose:** LLM-as-judge evaluation framework — loads and saves benchmark corpus entries, scores agent outputs against rubrics, classifies integration categories, and formats benchmark reports.
- **Key exports:** `loadCorpus`, `saveCorpusEntry`, `scoreComposite`, `createDefaultRubric`, `classifyEntry`, `scoreSemanticFromSummary`, `assessTrainability`, `evaluateEntry`, `formatBenchmarkReport`
- **Direct dependencies:** None (pure computation + fs)
- **Used by:** `mcp-server.ts` (indirectly via command dispatch)

---

## Module: lib/citations.ts

- **Path:** `lib/citations.ts`
- **Size:** ~760 lines
- **Purpose:** Research citation management — parses, validates, deduplicates, and formats academic citations for research outputs; manages a CITATIONS.md file in the milestone research directory.
- **Key exports:** `cmdCitations`, `parseCitations`, `formatCitations`, `mergeCitations`, `validateCitation`
- **Direct dependencies:** `utils`, `paths`
- **Used by:** `autoresearch`, `mcp-server`

---

## Module: lib/cleanup.ts

- **Path:** `lib/cleanup.ts`
- **Size:** ~1,588 lines
- **Purpose:** Phase cleanup and code quality analysis — provides config reading for the `phase_cleanup` section, ESLint complexity analysis, dead export detection, file size checks, doc drift detection (changelog staleness, broken README links, JSDoc mismatches), test coverage gap detection, and config schema drift.
- **Key exports:** `cmdCleanup`, `runCleanup`, `analyzeQuality`, `getCleanupConfig`
- **Direct dependencies:** `utils`, `paths`
- **Used by:** `mcp-server`, `phase-complete`

---

## Module: lib/complexity.ts

- **Path:** `lib/complexity.ts`
- **Size:** ~119 lines
- **Purpose:** Task complexity estimator for adaptive model-tier routing — pure function mapping agent type + optional signals to a `ComplexityLevel` (`low` | `medium` | `high`); used in Spec 4 adaptive routing.
- **Key exports:** `AGENT_BASELINE_COMPLEXITY`, `ComplexityHeuristics` (interface), `estimateComplexity`
- **Direct dependencies:** None
- **Used by:** `backend.ts` (routing chain)

---

## Module: lib/deps.ts

- **Path:** `lib/deps.ts`
- **Size:** ~536 lines
- **Purpose:** Phase dependency graph analysis — builds a directed dependency graph from phase frontmatter `depends_on` fields, computes parallel execution groups, detects cycles, and validates plans against the artifact DAG.
- **Key exports:** `buildDependencyGraph`, `computeParallelGroups`, `detectCycles`, `validatePhases`, `validateCrossPhase`, `extractPlanArtifact`
- **Direct dependencies:** `utils`, `paths`, `frontmatter`
- **Used by:** `parallel`, `autopilot`, `mcp-server`

---

## Module: lib/discussion.ts

- **Path:** `lib/discussion.ts`
- **Size:** ~1,270 lines
- **Purpose:** Cross-backend dispatch primitive and discussion orchestration — provides `dispatchToBackend()` for single-backend prompt dispatch and `runDiscussion()` for full multi-backend round orchestration with synthesis and markdown history output.
- **Key exports:** `dispatchToBackend`, `runDiscussion`, `cmdDiscussion`
- **Direct dependencies:** `utils`, `backend`
- **Used by:** `mcp-server`

---

## Module: lib/frontmatter.ts

- **Path:** `lib/frontmatter.ts`
- **Size:** ~572 lines
- **Purpose:** YAML frontmatter parse, reconstruct, splice, and validate operations for plan and phase markdown files.
- **Key exports:** `extractFrontmatter`, `reconstructFrontmatter`, `spliceFrontmatter`, `parseMustHavesBlock`, `validateFrontmatter`
- **Direct dependencies:** `utils`
- **Used by:** `state`, `roadmap`, `phase`, `deps`, `gates`, `long-term-roadmap`

---

## Module: lib/gates.ts

- **Path:** `lib/gates.ts`
- **Size:** ~662 lines
- **Purpose:** Validation gate system — pre-flight checks for workflow commands; detects phase directory collisions, orphaned phases, stale artifacts, and milestone state inconsistencies before execution begins.
- **Key exports:** `runPreflight`, `checkGates`, `formatGateViolations`
- **Direct dependencies:** `utils`, `paths`
- **Used by:** `autopilot`, `phase`, `mcp-server`

---

## Module: lib/got.ts

- **Path:** `lib/got.ts`
- **Size:** ~361 lines
- **Purpose:** Graph-of-Thought synthesis execution engine — runs artifact DAG execution with frozen interface contracts; validates plan artifacts before spawning agent subprocesses.
- **Key exports:** `executeGot`, `validateArtifactDAG`, `validateCrossPhase`, `extractPlanArtifact`, `GotExecuteOptions` (interface), `GotExecutionResult` (interface)
- **Direct dependencies:** `utils`, `invariants`
- **Used by:** `autopilot`

---

## Module: lib/invariants.ts

- **Path:** `lib/invariants.ts`
- **Size:** ~367 lines
- **Purpose:** Runtime invariant checking — asserts structural contracts on plan files, phase directories, and state before operations proceed; throws descriptive errors on violation.
- **Key exports:** `assertPlanFile`, `assertPhaseDir`, `assertStateFile`, `assertConfig`, `assertMilestoneDir`
- **Direct dependencies:** `utils`, `paths`
- **Used by:** `got`, `phase`, `autopilot`

---

## Module: lib/knowledge.ts

- **Path:** `lib/knowledge.ts`
- **Size:** ~273 lines
- **Purpose:** Research knowledge base management — reads, writes, and merges structured knowledge entries (findings, summaries, context) for the active milestone's research directory.
- **Key exports:** `loadKnowledge`, `saveKnowledge`, `mergeKnowledge`, `formatKnowledge`
- **Direct dependencies:** `utils`, `paths`
- **Used by:** `autoresearch`, `autopilot`

---

## Module: lib/long-term-roadmap.ts

- **Path:** `lib/long-term-roadmap.ts`
- **Size:** ~806 lines
- **Purpose:** Long-term roadmap operations — parses, validates, generates, and formats `LONG-TERM-ROADMAP.md`; implements the flat LT-N milestone format mapping long-term milestones to short-term execution milestones.
- **Key exports:** `cmdLongTermRoadmap`, `parseLongTermRoadmap`, `generateLongTermRoadmap`, `formatLongTermRoadmap`
- **Direct dependencies:** `frontmatter`
- **Used by:** `autopilot`, `mcp-server`

---

## Module: lib/markdown-split.ts

- **Path:** `lib/markdown-split.ts`
- **Size:** ~273 lines
- **Purpose:** Large markdown file splitting at heading boundaries — provides token estimation, boundary detection, splitting, index file detection, reassembly, and transparent read-through for split files (implements REQ-60/REQ-61).
- **Key exports:** `splitMarkdown`, `estimateTokens`, `detectSplitIndex`, `reassembleMarkdown`, `readThroughSplit`
- **Direct dependencies:** `utils`
- **Used by:** `utils`, `state`, `roadmap`

---

## Module: lib/mcp-server.ts

- **Path:** `lib/mcp-server.ts`
- **Size:** ~3,292 lines — the largest file in the codebase
- **Purpose:** Model Context Protocol server — exposes all GRD CLI commands as MCP tools over JSON-RPC 2.0 stdio transport; all tool definitions auto-generated from a declarative `COMMAND_DESCRIPTORS` table; zero external runtime dependencies.
- **Key exports:** `McpServer` (class), `createMcpServer`, `COMMAND_DESCRIPTORS`
- **Direct dependencies:** `backend`, `commands`, `context`, `deps`, `discussion`, `evolve`, `frontmatter`, `markdown-split`, `parallel`, `phase`, `roadmap`, `scaffold`, `state`, `tracker`, `verify`, `wireup`, `worktree`
- **Used by:** `bin/grd-mcp-server.ts` (entry point only)

---

## Module: lib/metrics.ts

- **Path:** `lib/metrics.ts`
- **Size:** ~49 lines
- **Purpose:** In-memory event counters for observability — simple named counter module; each counter is a number keyed by event name, reset between test runs.
- **Key exports:** `incrementCounter`, `getCounters`, `resetCounters`
- **Direct dependencies:** None
- **Used by:** `scheduler`

---

## Module: lib/overstory.ts

- **Path:** `lib/overstory.ts`
- **Size:** ~265 lines
- **Purpose:** Overstory backend adapter — detection, plan dispatch, status polling, and merge lifecycle management for the Overstory AI coding assistant backend.
- **Key exports:** `detectOverstory`, `dispatchPlan`, `pollStatus`, `mergeOverstory`
- **Direct dependencies:** `utils`
- **Used by:** `autopilot`, `mcp-server`

---

## Module: lib/parallel.ts

- **Path:** `lib/parallel.ts`
- **Size:** ~570 lines
- **Purpose:** Parallel execution support — validates that requested phases can run in parallel (no dependency edges), builds per-phase execution context with worktree paths, and selects parallel vs sequential mode based on backend capabilities.
- **Key exports:** `validateParallel`, `buildParallelContext`, `selectExecutionMode`, `runParallelPhases`
- **Direct dependencies:** `deps`, `utils`, `backend`, `roadmap`, `worktree`
- **Used by:** `autopilot`, `mcp-server`

---

## Module: lib/paths.ts

- **Path:** `lib/paths.ts`
- **Size:** ~293 lines
- **Purpose:** Centralized path resolution — single source of truth for all `.planning/` subdirectory paths; all milestone-scoped directory construction goes here so no other module hardcodes `path.join(cwd, '.planning', ...)`.
- **Key exports:** `phasesDir`, `milestonesDir`, `planningDir`, `researchDir`, `todosDir`, `roadmapFile`, `stateFile`, `configFile`
- **Direct dependencies:** None (Node built-ins only)
- **Used by:** `state`, `roadmap`, `phase`, `scaffold`, `tracker`, `requirements`, `gates`, `cleanup`, `autoresearch`, `citations`, `knowledge`, `invariants`

---

## Module: lib/phase.ts

- **Path:** `lib/phase.ts`
- **Size:** ~1,981 lines
- **Purpose:** Phase execution orchestration — the core `gd execute-phase` implementation; manages agent spawning, plan loading, context injection, turn limits, post-pipeline (cleanup, verify, complete), and all phase lifecycle events.
- **Key exports:** `cmdExecutePhase`, `runPhase`, `loadPhasePlans`, `buildPhaseContext`
- **Direct dependencies:** `utils`, `paths`, `roadmap`, `scheduler`, `state`, `gates`, `phase-complete`, `phase-io`, `frontmatter`
- **Used by:** `autopilot`, `mcp-server`

---

## Module: lib/phase-complete.ts

- **Path:** `lib/phase-complete.ts`
- **Size:** ~332 lines
- **Purpose:** Phase completion pipeline — runs post-execution steps (cleanup, verify, state patch, tracker sync) and marks phases done; delegates to `phase-complete-llm` for LLM-assisted fallback verification.
- **Key exports:** `completePhaseAfterPostPipeline`, `runPhaseCompletePipeline`
- **Direct dependencies:** `utils`, `state`, `verify`, `cleanup`, `tracker`, `phase-complete-llm`
- **Used by:** `phase`, `autopilot`

---

## Module: lib/phase-complete-llm.ts

- **Path:** `lib/phase-complete-llm.ts`
- **Size:** ~357 lines
- **Purpose:** LLM-assisted fallback phase completion — when deterministic verification cannot confirm success, attempts an LLM-powered re-verification pass; also provides `_verifyFallbackOutput` for direct test injection.
- **Key exports:** `_verifyFallbackOutput`, `attemptLlmFallbackCompletion`
- **Direct dependencies:** `utils`, `paths`
- **Used by:** `phase-complete`

---

## Module: lib/phase-io.ts

- **Path:** `lib/phase-io.ts`
- **Size:** ~73 lines
- **Purpose:** Thin I/O helpers for phase file reads and writes — isolated from the main `phase.ts` to keep file I/O concerns separate from orchestration logic.
- **Key exports:** `readPlanFile`, `writePlanFile`
- **Direct dependencies:** `utils`
- **Used by:** `phase`

---

## Module: lib/refinement.ts

- **Path:** `lib/refinement.ts`
- **Size:** ~330 lines
- **Purpose:** Iterative plan refinement and convergence detection — implements critique-refine loops, tracks metric snapshots, detects local minima regions, and manages convergence configuration.
- **Key exports:** `runRefinementLoop`, `detectConvergence`, `computeMetricSnapshot`, `isMinimaRegion`, `buildRefinementConfig`
- **Direct dependencies:** `utils`
- **Used by:** `autopilot`

---

## Module: lib/requirements.ts

- **Path:** `lib/requirements.ts`
- **Size:** ~469 lines
- **Purpose:** Requirement management — parses `REQUIREMENTS.md`, lists requirements with filters, checks traceability against phases, and updates requirement status.
- **Key exports:** `cmdRequirements`, `parseRequirements`, `listRequirements`, `checkTraceability`, `updateRequirementStatus`
- **Direct dependencies:** `utils`, `paths`
- **Used by:** `mcp-server`

---

## Module: lib/roadmap.ts

- **Path:** `lib/roadmap.ts`
- **Size:** ~775 lines
- **Purpose:** Roadmap operations — parses `ROADMAP.md`, answers phase queries (status, order, dependencies), and computes schedules for tracker integration.
- **Key exports:** `cmdRoadmap`, `parseRoadmap`, `getPhaseStatus`, `computeSchedule`, `getScheduleForPhase`, `getScheduleForMilestone`
- **Direct dependencies:** `utils`, `paths`, `frontmatter`
- **Used by:** `tracker`, `autopilot`, `parallel`, `phase`, `mcp-server`

---

## Module: lib/scan.ts

- **Path:** `lib/scan.ts`
- **Size:** ~580 lines
- **Purpose:** Top-level prompt injection scanner command — composes `lib/scan/injection` and `lib/scan/base64`, loads the ignorefile, and drives the `gd scan` command output.
- **Key exports:** `cmdScan`, `runScan`
- **Direct dependencies:** `scan/injection`, `scan/base64`, `scan/ignorefile`, `utils`, `paths`
- **Used by:** `mcp-server`, `commands/scan`

---

## Module: lib/scaffold.ts

- **Path:** `lib/scaffold.ts`
- **Size:** ~480 lines
- **Purpose:** Project and milestone scaffolding — creates `.planning/` directory structure, initializes config, state, roadmap, and requirements files for new projects and milestones.
- **Key exports:** `cmdScaffold`, `scaffoldMilestone`, `scaffoldProject`, `writeDefaultConfig`
- **Direct dependencies:** `utils`, `paths`
- **Used by:** `mcp-server`

---

## Module: lib/scheduler.ts

- **Path:** `lib/scheduler.ts`
- **Size:** ~1,173 lines
- **Purpose:** Cross-backend rate-limit scheduler — manages per-backend token budgets, EWMA usage tracking, idle watchdog timers, budget pressure levels, and spawns agent processes with retry logic; the `createScheduler` factory is the primary entry point.
- **Key exports:** `ADAPTERS`, `ENV_VAR_MAP`, `FREE_FALLBACK_BUDGET`, `createBackendState`, `updateEWMA`, `evictExpiredSamples`, `recordSample`, `pickBackend`, `computeSoonestRecovery`, `isBudgetPressured`, `logPressureTransition`, `computeBudgetPressureLevel`, `resolveAccount`, `markInFlight`, `markComplete`, `checkBinary`, `Scheduler` (interface), `createScheduler`
- **Direct dependencies:** `scheduler-wait`, `metrics`
- **Used by:** `backend`, `autopilot`, `phase`

---

## Module: lib/scheduler-wait.ts

- **Path:** `lib/scheduler-wait.ts`
- **Size:** ~58 lines
- **Purpose:** Abortable async sleep primitive for the scheduler — `waitUntilOrAbort(targetMs)` resolves when either the target timestamp is reached or a SIGINT fires via AbortController.
- **Key exports:** `waitUntilOrAbort`
- **Direct dependencies:** None
- **Used by:** `scheduler`

---

## Module: lib/state.ts

- **Path:** `lib/state.ts`
- **Size:** ~1,009 lines
- **Purpose:** Project state operations — reads, writes, patches, and progresses `STATE.md`; implements `cmdStateLoad` returning the full `StateLoadResult` including config, current milestone, phase status, and existence flags.
- **Key exports:** `cmdStateLoad`, `cmdStatePatch`, `cmdStateProgress`, `patchState`, `readState`, `writeState`
- **Direct dependencies:** `utils`, `paths`, `frontmatter`
- **Used by:** `mcp-server`, `evolve/_product-ideation`, `evolve/orchestrator`, `evolve/cli`, `evolve/_dimensions`, `evolve/scoring`, `evolve/discovery`, `evolve/index`, `evolve/_dimensions-features`, `wireup/autofix`, `wireup/orchestrator`, `wireup/cli`, `wireup/index`

---

## Module: lib/tracker.ts

- **Path:** `lib/tracker.ts`
- **Size:** ~1,591 lines
- **Purpose:** Issue tracker integration — handles GitHub and Jira sync, tracker config, phase-to-issue mapping, schedule computation, and `cmdTracker` dispatch for the `gd sync` command.
- **Key exports:** `cmdTracker`, `syncTracker`, `mapPhaseToIssue`, `getTrackerConfig`
- **Direct dependencies:** `utils`, `roadmap`, `paths`
- **Used by:** `mcp-server`, `phase-complete`

---

## Module: lib/verify.ts

- **Path:** `lib/verify.ts`
- **Size:** ~763 lines
- **Purpose:** Phase verification — deterministic checks that a phase's plan `must_haves` artifacts exist and meet their contracts (file presence, line count, exports, content assertions); used as part of the post-execution pipeline.
- **Key exports:** `cmdVerify`, `runVerify`, `checkMustHaves`, `formatVerifyResult`
- **Direct dependencies:** `utils`, `paths`, `frontmatter`
- **Used by:** `phase-complete`, `mcp-server`

---

## Module: lib/worktree.ts

- **Path:** `lib/worktree.ts`
- **Size:** ~1,309 lines
- **Purpose:** Git worktree lifecycle management for phase isolation — creates, removes, lists, and cleans stale worktrees; each phase executes in its own worktree at `.worktrees/grd-worktree-{milestone}-{phase}`.
- **Key exports:** `cmdWorktree`, `createWorktree`, `removeWorktree`, `listWorktrees`, `cleanStaleWorktrees`
- **Direct dependencies:** `utils`
- **Used by:** `parallel`, `mcp-server`, `autopilot`

---

## Subdirectory: lib/cli/

Six files providing the `gd` CLI dispatch layer.

| File | Lines | Purpose |
|------|-------|---------|
| `lib/cli/adapters.ts` | ~90 | Derives `CliAdapter` from `BackendAdapter`; provides `getAdapter` and `checkBackendAvailable` |
| `lib/cli/agent.ts` | ~150 | Builds agent prompt strings and runs agent commands; exports `AgentOpts`, `buildPromptForCommand`, `runAgentCommand` |
| `lib/cli/index.ts` | ~200 | Main CLI dispatcher — exports `Flags`, `INIT_WORKFLOWS`, `AGENT_COMMANDS`, `parseFlags`, `classifyCommand` |
| `lib/cli/output.ts` | ~60 | JSON envelope formatter — exports `JsonEnvelope`, `formatJson`, `formatError` |
| `lib/cli/scan-dispatch.ts` | ~80 | Pure file-resolution helpers for `gd scan`; resolves staged/diff/file/all scan modes to file sets |
| `lib/cli/tools.ts` | ~70 | Builds argument lists for `grd-tools.js` delegation — exports `buildToolArgs`, `runToolCommand` |

---

## Subdirectory: lib/commands/

Fourteen files providing CLI command handler implementations.

| File | Lines (approx) | Purpose |
|------|----------------|---------|
| `lib/commands/_dashboard-parsers.ts` | ~150 | Internal parse helpers for dashboard metric extraction |
| `lib/commands/analysis.ts` | ~300 | Eval regression, time budget, config diff, readiness, health score, decision timeline, knowledge import, todo duplicate analysis |
| `lib/commands/config.ts` | ~100 | `gd settings` command — read/write config.json interactively |
| `lib/commands/dashboard.ts` | ~250 | `gd dashboard` — composites progress, health, and roadmap into a single view |
| `lib/commands/health.ts` | ~200 | `gd health` — surface blockers, velocity metrics, and risk indicators |
| `lib/commands/index.ts` | ~180 | Barrel re-export of all command handlers; primary entry point for `mcp-server` and `grd-tools` |
| `lib/commands/long-term-roadmap.ts` | ~100 | `gd long-term-roadmap` command wiring |
| `lib/commands/phase-info.ts` | ~150 | `gd phase-info` — detailed per-phase status and plan summary |
| `lib/commands/progress.ts` | ~200 | `gd progress` — project status and next action recommendation |
| `lib/commands/quality.ts` | ~180 | `gd quality` — code quality metrics rollup |
| `lib/commands/scan.ts` | ~120 | `gd scan` orchestrator — composes `lib/scan/injection` and `lib/scan/base64` |
| `lib/commands/search.ts` | ~100 | `gd search` — full-text search across planning documents |
| `lib/commands/slug-timestamp.ts` | ~60 | CLI slug/timestamp generation utilities |
| `lib/commands/todo.ts` | ~180 | `gd todo` — list, view, and manage pending todo items |

---

## Subdirectory: lib/context/

Seven files providing context initialization for all 48 agent `cmdInit*` functions.

| File | Purpose |
|------|---------|
| `lib/context/index.ts` | Barrel re-export — single entry point for all 48 `cmdInit*` functions |
| `lib/context/base.ts` | Shared utilities: `inferCeremonyLevel`, `buildInitContext` — used by all other context modules |
| `lib/context/agents.ts` | Init context builders for agent aliases and operation workflows (debug, integration-check, migrate, plan-check, etc.) |
| `lib/context/execute.ts` | Init context builders for execution and planning workflows (`cmdInitExecutePhase`, `cmdInitPlanPhase`, `cmdInitVerifyWork`) |
| `lib/context/progress.ts` | Progress cache helpers and progress/milestone-gaps init context functions |
| `lib/context/project.ts` | Project-level init context: evolve, scaffold, roadmap, autopilot, quick-task workflows |
| `lib/context/research.ts` | Research-specific init context: autoresearch, citations, knowledge base operations |

---

## Subdirectory: lib/commands/ — harness.ts (Life-Harness)

**Current self-improvement mechanism (v0.4.4+).** `gd harness round [--auto|--dry-run|--full-eval]` replaces `gd evolve` for ongoing GRD self-improvement. As of v0.4.4 it has a **collective layer** (Phase E): a cross-project `upstream` command surface plus emit/consume machinery in the driver.

| File | Purpose |
|------|---------|
| `lib/commands/harness.ts` | TS CLI surface for `gd harness round\|status\|revert <id>` — routed via `lib/cli` TOOL_COMMANDS. v0.4.4 adds `cmdHarnessUpstream` backing `gd harness upstream list\|clear [--origin <slug>]`. |
| `bin/harness_driver.py` | Python 3.11+ I/O driver; binds the pure decision kernel (`autoresearch-core>=0.4.3`) with GRD file I/O; entry point for `gd harness round` subprocess. v0.4.4 adds `UpstreamStore` (emit/read/prune of `UpstreamCandidate` records to `$CLAUDE_PLUGIN_DATA/harness/upstream/`), `CompositeFindings` (local Tesserae findings + pending upstream candidates for the upstream root), and the conservative "about GRD" emit heuristic — all pure I/O; the kernel is unchanged. |

Records land under `.planning/harness/rounds/<id>/` (evidence.md, patch.json, eval.json, RECORD.json), with additive `upstream_emitted` / `upstream_consumed` counts as of v0.4.4. Deterministic rejections are deduplicated via `hashes.jsonl`. See [docs/superpowers/specs/2026-06-06-life-harness-rounds-grd-host.md](../superpowers/specs/2026-06-06-life-harness-rounds-grd-host.md) and the Phase E collective-layer spec [docs/superpowers/specs/2026-06-07-life-harness-phaseE-collective-design.md](../superpowers/specs/2026-06-07-life-harness-phaseE-collective-design.md).

---

## Subdirectory: lib/evolve/ (Deprecated v0.4.3)

**Deprecated (v0.4.3):** superseded by the life-harness (`gd harness round`); kept in-tree for `gd singularity` history. `gd evolve` now exits 1 with a pointer to `gd harness round`; its read-only introspection subcommands (`evolve-discover`, `evolve-state`, `evolve-advance`, `evolve-reset`) still work as tool commands.

Eleven files implementing the former self-evolution loop.

| File | Purpose |
|------|---------|
| `lib/evolve/index.ts` | Barrel re-export of all 44 public evolve symbols |
| `lib/evolve/types.ts` | Domain types: `WorkGroup`, `GroupDiscoveryResult`, `EvolveGroupState`, `EvolveState`, etc. |
| `lib/evolve/state.ts` | Constants, state I/O, work item factory — reads/writes evolve iteration state |
| `lib/evolve/discovery.ts` | Claude-powered and hardcoded codebase discovery — `runDiscovery`, `runGroupDiscovery`, output parsing |
| `lib/evolve/orchestrator.ts` | Former main evolve iteration loop, iteration step handling, evolution notes, todos integration |
| `lib/evolve/scoring.ts` | Scores discovered work items and groups by priority and impact |
| `lib/evolve/_dimensions.ts` | Dimension-specific discoverers for code quality axes (error-recovery, JSDoc gaps, process.exit cleanup, refactors) |
| `lib/evolve/_dimensions-features.ts` | Feature-axis discoverers (product ideas, agent workflow gaps) |
| `lib/evolve/_product-ideation.ts` | Product ideation discovery logic — detects new todo opportunities |
| `lib/evolve/_prompts.ts` | Prompt templates used by the orchestrator and discovery engine |
| `lib/evolve/cli.ts` | CLI entry points: `evolve`, `evolve-discover`, `evolve-state`, `evolve-advance`, `evolve-reset`, `init-evolve` |

---

## Subdirectory: lib/scan/

Seven files implementing the prompt injection scanner.

| File | Purpose |
|------|---------|
| `lib/scan/types.ts` | Shared output type `ScanHit` used by all scan modules |
| `lib/scan/patterns.ts` | Prompt injection pattern definitions (adopted from gsd-2 v2.67+) |
| `lib/scan/injection.ts` | Prose-level scanner — applies `INJECTION_PATTERNS` to markdown content after stripping fenced code |
| `lib/scan/base64.ts` | Detects prompt injection patterns hidden inside base64-encoded blobs |
| `lib/scan/ignorefile.ts` | Parser for `.prompt-injection-scanignore` files (gsd-2 v2.67 compatible format) |
| `lib/scan/strip-markdown.ts` | Removes fenced code blocks and inline backtick spans from markdown while preserving line numbers |
| `lib/scan/_utils.ts` | Shared internal helpers used by both `injection.ts` and `base64.ts` |

---

## Subdirectory: lib/wireup/

Eleven files implementing the "wireup" feature-connection discovery and auto-fix system.

| File | Purpose |
|------|---------|
| `lib/wireup/index.ts` | Barrel re-export of all public wireup symbols |
| `lib/wireup/types.ts` | Domain type definitions: `UnwiredFeature`, `WireupScenario`, `ScenarioResult`, etc. |
| `lib/wireup/state.ts` | State I/O and iteration management — reads/writes wireup report state |
| `lib/wireup/discovery.ts` | Pure filesystem analysis to identify features that exist in code but are not connected to entry points |
| `lib/wireup/scenarios.ts` | Generates `WireupScenario[]` from `UnwiredFeature[]` discovered by the discovery engine |
| `lib/wireup/execution.ts` | HTTP and CLI scenario execution engine — runs generated scenarios against localhost services and CLI |
| `lib/wireup/detection.ts` | Analyses failed `ScenarioResult[]` and classifies each failure into a missing-connection type |
| `lib/wireup/autofix.ts` | Auto-fix capability with confidence gating and re-run verification |
| `lib/wireup/orchestrator.ts` | Main pipeline: discover → generate scenarios → execute → detect → autofix → report |
| `lib/wireup/report.ts` | Generates `WIREUP-REPORT.md` after each iteration |
| `lib/wireup/cli.ts` | CLI command functions: `gd wireup` entry point |

---

## bin/ Entry Points

Ten files in `bin/` — `.js` files are thin wrappers that register `tsx` and load the matching `.ts` file.

| File | Purpose |
|------|---------|
| `bin/gd.ts` | Unified `gd` CLI — routes commands to either agent dispatch (`lib/cli/`) or tool delegation (`bin/grd-tools.ts`) |
| `bin/gd.js` | Entry point: registers `tsx`, loads `bin/gd.ts` |
| `bin/grd-tools.ts` | Deterministic CLI — implements all non-agent commands (state, verify, scaffold, tracker, roadmap, scan, etc.) |
| `bin/grd-tools.js` | Entry point: registers `tsx`, loads `bin/grd-tools.ts` |
| `bin/grd-mcp-server.ts` | MCP stdio transport — reads JSON-RPC 2.0 from stdin, dispatches to `lib/mcp-server.ts`, writes to stdout |
| `bin/grd-mcp-server.js` | Entry point: registers `tsx`, loads `bin/grd-mcp-server.ts` |
| `bin/grd-manifest.ts` | Manifest generation — emits the list of available GRD tools/commands for external tooling |
| `bin/grd-manifest.js` | Entry point: registers `tsx`, loads `bin/grd-manifest.ts` |
| `bin/postinstall.ts` | Post-install validation — checks that `VERSION` file matches `package.json` version |
| `bin/postinstall.js` | Entry point: registers `tsx`, loads `bin/postinstall.ts` |

---

## tests/helpers/

Two utility modules shared across unit tests.

| File | Purpose |
|------|---------|
| `tests/helpers/fixtures.ts` | Creates isolated temp directories with a complete `.planning/` fixture structure; returns temp root path for tests that need filesystem state |
| `tests/helpers/setup.ts` | `process.exit` and stdout/stderr capture utilities — mocks `process.exit` with a sentinel throw so tests can verify exit behavior without killing the test process; exports `CaptureResult` and `captureOutput` |

---

## Dependency Quick Reference

The table below summarizes which top-level modules are consumed by the most other modules (high fan-in = foundational).

| Module | Fan-in (approximate consumers) |
|--------|--------------------------------|
| `utils` | 25+ modules — universal foundation |
| `types` | Nearly all modules via `import type` |
| `paths` | 12+ modules |
| `state` | 12+ modules (especially evolve/wireup) |
| `backend` | 6 modules |
| `scheduler` | 3 modules (`backend`, `autopilot`, `phase`) |
| `worktree` | 3 modules (`parallel`, `mcp-server`, `autopilot`) |
| `roadmap` | 4 modules (`tracker`, `autopilot`, `parallel`, `mcp-server`) |
| `research` (context) | `agents.ts`, `index.ts` |

---

## Notes on Oversized Modules

Two modules exceed 2,000 lines and deserve special attention when navigating or modifying:

- **`lib/mcp-server.ts` (3,292 lines):** Monolithic but structurally uniform — the `COMMAND_DESCRIPTORS` table dominates. Each tool entry follows the same pattern. When adding a new command, follow the declarative table pattern rather than adding procedural code.
- **`lib/autopilot.ts` (2,706 lines):** Complex orchestration logic with many interleaved concerns (convergence, artifact DAG, multi-milestone, critique-refine). Helper extraction is partially done (see `lib/refinement.ts`) but the core loop remains large.

`lib/phase.ts` (1,981 lines) is close to the threshold and contains the most critical runtime path.

---

## Cross-References

- **OVERVIEW.md** — high-level architecture, component diagram, and design principles
- **API.md** — public API reference for `grd-tools` and `grd-mcp-server` tool signatures
- **FLOWS.md** — end-to-end execution flows (autopilot, phase execution, evolve loop)
- **RISKS.md** — architectural risks and technical debt
- **MAINTENANCE.md** — how to add modules, update exports, maintain coverage thresholds
- **CONFIG.md** — `GrdConfig` schema, all config keys, and their effects
- **TESTING.md** — test structure, per-file coverage thresholds, fixture system
- **BACKENDS.md** — backend capability matrix, adapter pattern, effort profiles
- **USE_CASES.md** — annotated walkthroughs mapping user commands to module call chains
