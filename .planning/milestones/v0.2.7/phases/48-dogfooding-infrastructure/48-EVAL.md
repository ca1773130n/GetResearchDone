# Evaluation Plan: Phase 48 — Dogfooding Infrastructure

**Phase:** 48: Dogfooding Infrastructure
**Verification Level:** sanity
**Created:** 2026-02-22

## Tier 1: Sanity Checks

Quick checks that run in seconds -- verifying basic structure and file existence.

| # | Check | Command | Pass Criteria |
|---|-------|---------|---------------|
| S1 | testbed .planning/ exists | `test -d testbed/.planning` | Directory exists |
| S2 | config.json is valid JSON | `node -e "JSON.parse(require('fs').readFileSync('testbed/.planning/config.json','utf8'))"` | No parse error |
| S3 | PROJECT.md exists and non-empty | `test -s testbed/.planning/PROJECT.md` | File exists and has content |
| S4 | ROADMAP.md has parseable phases | `grep -c "### Phase" testbed/.planning/ROADMAP.md` | Count >= 1 |
| S5 | STATE.md has current position | `grep "Current Position" testbed/.planning/STATE.md` | Match found |
| S6 | test-grd.sh is executable | `test -x testbed/test-grd.sh` | Executable bit set |
| S7 | test-grd.sh references local CLI | `grep "bin/grd-tools.js" testbed/test-grd.sh` | Pattern found |
| S8 | Milestone directory exists | `test -d testbed/.planning/milestones/v1.0.0/phases` | Directory exists |
| S9 | Bug catalog exists | `test -f .planning/milestones/v0.2.7/phases/48-dogfooding-infrastructure/48-BUG-CATALOG.md` | File exists |

**Target:** 9/9 pass

## Tier 2: Proxy Metrics

Automated metrics that approximate real quality -- verifying GRD CLI actually works against testbed.

| # | Check | Command | Pass Criteria |
|---|-------|---------|---------------|
| P1 | state load returns valid JSON | `cd testbed && node ../bin/grd-tools.js state load` | Valid JSON output, `planning_exists: true` |
| P2 | roadmap get-phase finds phase | `cd testbed && node ../bin/grd-tools.js roadmap get-phase 1` | `found: true` |
| P3 | state-snapshot returns JSON | `cd testbed && node ../bin/grd-tools.js state-snapshot` | Valid JSON output |
| P4 | Plan frontmatter validates | `node bin/grd-tools.js frontmatter validate testbed/.planning/milestones/v1.0.0/phases/01-project-setup-and-ci/01-01-PLAN.md --schema plan` | `valid: true` |
| P5 | No cached plugin references | `grep -r "plugins/cache" testbed/ --include="*.sh" --include="*.md"` | No matches |
| P6 | Bug catalog has entries | `grep -c "BUG-48" .planning/milestones/v0.2.7/phases/48-dogfooding-infrastructure/48-BUG-CATALOG.md` | Count >= 1 |

**Target:** 6/6 pass (P1-P3 may expose bugs -- document them rather than fail)

## Tier 3: Deferred Evaluations

Validations that require human/integration and are deferred to Phase 53.

| # | Check | Defers To | Description |
|---|-------|-----------|-------------|
| D1 | Full agent execution on testbed | Phase 53 | Run `/grd:plan-phase 1` and `/grd:execute-phase 1` as real agent workflows against testbed |
| D2 | Testbed milestone lifecycle | Phase 53 | Complete milestone on testbed (add phases, complete phases, archive milestone) |
| D3 | Multi-backend validation | Phase 53 | Verify testbed works with non-Claude-Code backends |

**Deferred Validation IDs:**
- DEFER-48-01: Full testbed lifecycle validation with real agent execution

## Summary

- Tier 1 (Sanity): 9 checks -- all must pass
- Tier 2 (Proxy): 6 metrics -- 6/6 target (document failures as bugs)
- Tier 3 (Deferred): 3 evaluations -- tracked for Phase 53

---

*Eval plan created: 2026-02-22*
