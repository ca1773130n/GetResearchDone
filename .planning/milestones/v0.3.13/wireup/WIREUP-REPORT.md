# Wireup Report

**Milestone:** v0.0.5
**Iteration:** 4
**Generated:** 2026-03-23T07:29:05.194Z

## Summary

| Metric | Count |
|--------|-------|
| Features Tested | 266 |
| Scenarios Run | 266 |
| Scenarios Passed | 92 |
| Scenarios Failed | 174 |
| Scenarios Skipped | 0 |
| Issues Found | 10 |
| Fixes Applied | 10 |
| Fixes Verified | 0 |
| Fixes Failed | 10 |
| Remaining Unwired | 174 |

## Issues Found

| # | Type | Source | Target | Confidence | Fix Status |
|---|------|--------|--------|------------|------------|
| 1 | missing-export | lib/cli/index.ts | lib/cli/index.ts | high | skipped |
| 2 | missing-export | lib/cli/output.ts | lib/cli/output.ts | high | skipped |
| 3 | missing-export | lib/commands/_dashboard-parsers.ts | lib/commands/_dashboard-parsers.ts | high | skipped |
| 4 | missing-export | lib/commands/phase-info.ts | lib/commands/phase-info.ts | high | skipped |
| 5 | missing-export | lib/evolve/_dimensions.ts | lib/evolve/_dimensions.ts | high | skipped |
| 6 | missing-export | lib/overstory.ts | lib/overstory.ts | high | skipped |
| 7 | missing-export | lib/requirements.ts | lib/requirements.ts | high | skipped |
| 8 | missing-export | lib/scheduler.ts | lib/scheduler.ts | high | skipped |
| 9 | missing-export | lib/wireup/autofix.ts | lib/wireup/autofix.ts | high | skipped |
| 10 | missing-export | lib/wireup/discovery.ts | lib/wireup/discovery.ts | high | skipped |

## Fixes Applied

_No fixes attempted._

## Requires Manual Review

_All detected issues are high-confidence and were auto-fixed._

## Remaining Unwired Features

- TOOL_COMMANDS
- AGENT_COMMANDS
- outputJson
- makeShippedMilestone
- _roadmapContentCache
- _discoverDimension
- OV_MAX_AGENTS
- ovExec
- _reqContentCache
- readCachedRequirements
- VALID_REQUIREMENT_STATUSES
- DEFAULT_BUDGET_TPM
- WIREUP_FIX_MODEL
- tableName
- ComponentName
- ClassName
- GET /tests/unit/wireup-discovery.test
- POST /tests/unit/wireup-discovery.test
- search_gitignored
- phase_branch_template
- milestone_branch_template
- grd_state_get
- grd_state_patch
- grd_state_update
- grd_state_record_metric
- grd_state_add_decision
- grd_state_add_blocker
- grd_state_resolve_blocker
- grd_state_record_session
- grd_resolve_model
- grd_find_phase
- grd_commit
- grd_verify_summary
- grd_verify_phase_completeness
- grd_verify_references
- grd_verify_commits
- grd_template_select
- grd_template_fill
- grd_scaffold
- grd_frontmatter_get
- grd_frontmatter_set
- grd_frontmatter_merge
- grd_frontmatter_validate
- grd_generate_slug
- grd_current_timestamp
- grd_list_todos
- grd_todo_complete
- grd_verify_path_exists
- grd_config_ensure_section
- grd_config_set
- grd_phases_list
- grd_roadmap_analyze
- grd_phase_add
- grd_phase_insert
- grd_phase_remove
- grd_phase_analyze_deps
- grd_milestone_complete
- grd_validate_consistency
- grd_progress
- grd_summary_extract
- grd_tracker_get_config
- grd_tracker_sync_roadmap
- grd_tracker_sync_phase
- grd_tracker_update_status
- grd_tracker_add_comment
- grd_tracker_sync_status
- grd_tracker_schedule
- grd_tracker_prepare_reschedule
- grd_tracker_prepare_roadmap_sync
- grd_tracker_prepare_phase_sync
- grd_tracker_record_mapping
- grd_tracker_record_status
- grd_dashboard
- grd_phase_detail
- grd_health
- grd_init_execute_phase
- grd_init_execute_parallel
- grd_init_plan_phase
- grd_init_new_project
- grd_init_new_milestone
- grd_init_quick
- grd_init_resume
- grd_init_verify_work
- grd_init_phase_op
- grd_init_todos
- grd_init_milestone_op
- grd_init_plan_milestone_gaps
- grd_init_map_codebase
- grd_init_progress
- grd_init_survey
- grd_init_deep_dive
- grd_init_feasibility
- grd_init_eval_plan
- grd_init_eval_report
- grd_init_assess_baseline
- grd_init_product_plan
- grd_init_iterate
- grd_init_debug
- grd_init_debugger
- grd_init_integration_check
- grd_init_integration_checker
- grd_init_migrate
- grd_init_migrator
- grd_init_plan_check
- grd_init_plan_checker
- grd_init_executor
- grd_init_code_review
- grd_init_code_reviewer
- grd_init_phase_research
- grd_init_phase_researcher
- grd_init_codebase_mapper
- grd_init_baseline_assessor
- grd_init_deep_diver
- grd_init_eval_planner
- grd_init_eval_reporter
- grd_init_feasibility_analyst
- grd_init_product_owner
- grd_init_project_researcher
- grd_init_research_synthesizer
- grd_init_roadmapper
- grd_init_surveyor
- grd_init_verifier
- grd_init_assess_baseline_direct
- grd_init_deep_dive_direct
- grd_init_eval_plan_direct
- grd_init_eval_report_direct
- grd_init_feasibility_direct
- grd_long_term_roadmap_list
- grd_long_term_roadmap_add
- grd_long_term_roadmap_remove
- grd_long_term_roadmap_update
- grd_long_term_roadmap_link
- grd_long_term_roadmap_unlink
- grd_long_term_roadmap_init
- grd_long_term_roadmap_display
- grd_long_term_roadmap_parse
- grd_long_term_roadmap_validate
- grd_long_term_roadmap_refine
- grd_long_term_roadmap_history
- grd_quality_analysis
- grd_requirement_get
- grd_requirement_list
- grd_requirement_traceability
- grd_requirement_update_status
- grd_search
- grd_worktree_create
- grd_worktree_remove
- grd_worktree_list
- grd_worktree_push_pr
- grd_autopilot_run
- grd_autopilot_init
- grd_multi_milestone_autopilot_run
- grd_multi_milestone_autopilot_init
- grd_autoplan_run
- grd_autoplan_init
- grd_evolve_run
- grd_evolve_discover
- grd_evolve_state
- grd_evolve_advance
- grd_evolve_reset
- grd_evolve_init
- grd_wireup_state
- grd_wireup_scenarios
- grd_wireup_report
- grd_markdown_split
- grd_markdown_check
- grd_coverage_report
- grd_health_check
- OV_MAX_AGENTS
- ovExec
- _reqContentCache
- readCachedRequirements
- VALID_REQUIREMENT_STATUSES
- DEFAULT_BUDGET_TPM

## Iteration History

| Iteration | Date | Scenarios | Passed | Failed | Skipped | Issues | Fixes | Verified |
|-----------|------|-----------|--------|--------|---------|--------|-------|----------|
| 1 | 2026-03-23 | 266 | 92 | 174 | 0 | 0 | 0 | 0 |
| 2 | 2026-03-23 | 266 | 92 | 174 | 0 | 0 | 0 | 0 |
| 3 | 2026-03-23 | 266 | 92 | 174 | 0 | 0 | 0 | 0 |
| 4 | 2026-03-23 | 266 | 92 | 174 | 0 | 10 | 10 | 0 |
