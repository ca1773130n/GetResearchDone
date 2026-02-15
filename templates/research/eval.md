# Evaluation Plan Template

Template for `.planning/phases/XX-name/{phase}-EVAL.md` - tiered evaluation design for a phase.

**Purpose:** Define how to measure whether a phase achieved its quantitative goals. Created by `/grd:eval-plan`.

**Downstream consumers:**
- `grd-executor` - runs evaluations as plan tasks
- `grd-eval-reporter` - collects and analyzes results
- `grd-verifier` - uses eval results for phase verification

---

## File Template

```markdown
# Evaluation Plan: Phase [X] - [Name]

**Created:** [YYYY-MM-DD]
**Phase Type:** [implement | evaluate]
**Verification Level:** [sanity | proxy | full]

## Evaluation Objectives

**Primary question:** [What are we trying to determine?]
**Hypothesis:** [What we expect to see and why]
**Decision criteria:** [What result means continue vs iterate vs pivot]

## Metrics

### Primary (Must Pass)

| Metric | Implementation | Target | Baseline | Tolerance |
|--------|---------------|--------|----------|-----------|
| [metric] | `[library.function]` | [value] | [current] | [+/- acceptable] |

### Secondary (Track But Don't Block)

| Metric | Implementation | Expected Range | Purpose |
|--------|---------------|---------------|---------|
| [metric] | `[library.function]` | [range] | [why tracked] |

## Datasets

| Dataset | Split | Size | Source | Preprocessing |
|---------|-------|------|--------|---------------|
| [name] | [train/val/test] | [N] | [path or URL] | [steps] |

## Evaluation Tiers

### Tier 1: Sanity Check
**When:** After every code change
**Runtime:** < 1 minute
**Command:**
```bash
[evaluation command with small subset]
```
**Pass criteria:** [e.g., "PSNR > 20dB on 5 test images (proves model runs)"]

### Tier 2: Proxy Evaluation
**When:** After completing plan tasks
**Runtime:** 1-5 minutes
**Command:**
```bash
[evaluation command with standard small set]
```
**Pass criteria:**
- [Metric 1] >= [proxy target] on [small dataset]
- [Metric 2] <= [proxy target] on [small dataset]

### Tier 3: Full Evaluation
**When:** Phase completion, milestone boundaries
**Runtime:** [estimated time]
**Command:**
```bash
[full evaluation command]
```
**Pass criteria:**
- [Metric 1] >= [target] on [full dataset]
- [Metric 2] <= [target] on [full dataset]

## Ablation Studies

[Only for evaluate phases]

| Ablation | What's Removed/Changed | Expected Impact | Purpose |
|----------|----------------------|-----------------|---------|
| [name] | [modification] | [expected result] | [what it tells us] |

**Ablation command:**
```bash
[command to run ablation variant]
```

## Baseline Comparison

| Method | Source | [Metric 1] | [Metric 2] | Notes |
|--------|--------|-----------|-----------|-------|
| Our baseline | Phase [X] | [value] | [value] | Current performance |
| [Published method] | [paper] | [value] | [value] | SoTA comparison |
| [Simple baseline] | - | [value] | [value] | Sanity check |

## Result Recording

After evaluation, record results in:
1. `.planning/research/BENCHMARKS.md` → Our Results section
2. `.planning/STATE.md` → Current Baseline section
3. Phase SUMMARY.md → Experiment Results section

## Decision Matrix

| Result | Action | Next Step |
|--------|--------|-----------|
| All targets met | Continue to next phase | `/grd:progress` |
| Primary met, secondary missed | Continue with note | Document in KNOWHOW.md |
| Primary missed by < tolerance | Iterate (minor) | `/grd:iterate` with targeted fix |
| Primary missed by > tolerance | Iterate (major) | `/grd:iterate` with approach review |
| Significantly below baseline | Pivot | Review LANDSCAPE.md for alternative |

---

*Evaluation plan for: Phase [X]*
*Created: [date]*
*Planner: Claude (grd-eval-planner)*
```

---

## Guidelines

**When to create:**
- Via `/grd:eval-plan` before evaluate phases
- During plan-phase when verification_level is proxy or full
- Before any quantitative comparison

**Tier selection by phase type:**
- `survey` phases: Tier 1 only (sanity - does code run?)
- `implement` phases: Tier 1 + Tier 2 (proxy - is it reasonable?)
- `evaluate` phases: All tiers (full - does it meet targets?)
- `integrate` phases: Tier 2 (proxy - does integration work?)

**Decision matrix is critical:**
- Define BEFORE running evaluation what each outcome means
- Prevents post-hoc rationalization of poor results
- Feeds directly into `/grd:iterate` workflow

**Content quality:**
- Evaluation commands must be copy-pasteable
- Targets must reference BENCHMARKS.md
- Baselines must be already measured (via `/grd:assess-baseline`)
- Ablations should test one variable at a time
