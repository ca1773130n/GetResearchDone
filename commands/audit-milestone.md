<purpose>
Verify milestone achieved its definition of done by aggregating phase verifications, checking cross-phase integration, and assessing requirements coverage. Reads existing VERIFICATION.md files, aggregates tech debt and deferred gaps, then spawns integration checker for cross-phase wiring.
</purpose>

<required_reading>
Read all files referenced by the invoking prompt's execution_context before starting.
</required_reading>

<process>

## 0. Initialize Milestone Context

```bash
INIT=$(node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js init milestone-op)
```

Extract: `milestone_version`, `milestone_name`, `phase_count`, `completed_phases`, `commit_docs`.

```bash
CHECKER_MODEL=$(node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js resolve-model grd-integration-checker --raw)
```

## 1. Determine Milestone Scope

```bash
node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js phases list
```

Identify all phase directories in scope. Extract milestone definition of done and requirements.

## 2. Read All Phase Verifications

For each phase directory, read VERIFICATION.md. Extract: status, critical gaps, non-critical gaps, anti-patterns, requirements coverage.

If a phase is missing VERIFICATION.md, flag as "unverified phase" — blocker.

## 3. Spawn Integration Checker

```
Task(
  prompt="Check cross-phase integration and E2E flows.
Phases: {phase_dirs}
Phase exports: {from SUMMARYs}
API routes: {routes created}
Verify cross-phase wiring and E2E user flows.",
  subagent_type="grd-integration-checker",
  model="{integration_checker_model}"
)
```

## 4. Collect Results

Combine phase-level gaps/tech debt with integration checker's report.

## 5. Check Requirements Coverage

For each requirement: satisfied | partial | unsatisfied.

## 6. Aggregate into v{version}-MILESTONE-AUDIT.md

Create with YAML frontmatter (status: passed | gaps_found | tech_debt, scores, gaps, tech_debt) plus full markdown report.

## 7. Present Results

Route by status:

**If passed:** Offer `/grd:complete-milestone {version}`
**If gaps_found:** Offer `/grd:plan-milestone-gaps`
**If tech_debt:** Offer complete (accept debt) or plan cleanup phase

</process>

<success_criteria>
- [ ] Milestone scope identified
- [ ] All phase VERIFICATION.md files read
- [ ] Tech debt and deferred gaps aggregated
- [ ] Integration checker spawned for cross-phase wiring
- [ ] v{version}-MILESTONE-AUDIT.md created
- [ ] Results presented with actionable next steps
</success_criteria>
