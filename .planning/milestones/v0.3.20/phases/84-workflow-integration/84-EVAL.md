---
phase: 84-workflow-integration
type: eval
created: 2026-03-23
---

# Phase 84: Workflow Integration — Evaluation Plan

## Tier 1: Sanity Checks

| Check | Command | Pass Criteria |
|-------|---------|---------------|
| TypeScript compiles | `npm run build:check` | Exit code 0, no errors |
| ESLint passes | `npm run lint` | Exit code 0, no warnings |
| New functions exported | `node -e "const d = require('./lib/discussion'); console.log(typeof d.shouldRunDiscussion, typeof d.getDiscussionParticipants, typeof d.buildWorkflowTopic, typeof d.triggerWorkflowDiscussion)"` | Outputs `function function function function` |
| grd-tools discussion subcommand exists | `node bin/grd-tools.js discussion should-run 84 --trigger before_planning 2>&1` | Valid JSON output (not "unknown command") |

## Tier 2: Proxy Metrics

| Metric | Command | Target | Baseline |
|--------|---------|--------|----------|
| lib/discussion.ts line coverage | `npx jest tests/unit/discussion.test.ts --coverage` | >= 85% | 85% (Phase 83) |
| lib/discussion.ts function coverage | `npx jest tests/unit/discussion.test.ts --coverage` | 100% | 100% (Phase 83) |
| lib/discussion.ts branch coverage | `npx jest tests/unit/discussion.test.ts --coverage` | >= 85% | 85% (Phase 83) |
| Autopilot tests pass | `npx jest tests/unit/autopilot.test.ts` | All pass | All pass (Phase 83) |
| Full test suite | `npm test` | All pass, no regressions | All pass (Phase 83) |
| Workflow helper test count | `npx jest tests/unit/discussion.test.ts --verbose 2>&1 \| grep -c "✓\|✕\|PASS\|FAIL"` | >= 15 new tests | 71 existing |

## Tier 3: Deferred Validations

| ID | Description | Validates At | Rationale |
|----|-------------|-------------|-----------|
| DEFER-84-01 | Live autopilot run with discussion.before_planning enabled triggers actual multi-backend discussion | Next real autopilot run with multiple backends installed | Requires installed CLIs (codex, gemini, opencode) and discussion config in config.json |
| DEFER-84-02 | grd-tools discussion trigger produces a real discussion file with backend responses | Live environment with backends | Subprocess spawning cannot be tested without real CLIs |
| DEFER-84-03 | Discussion result file is readable by Phase 85 MCP tools | Phase 85 | MCP tool implementation not yet built |

## Success Gate

Phase 84 passes evaluation when:
- All Tier 1 checks pass (required)
- All Tier 2 metrics meet targets (required)
- Tier 3 items documented in STATE.md deferred validations (informational)
