# Verification Report Template

Template for `.planning/phases/XX-name/{phase}-VERIFICATION.md` - phase goal verification results with tiered evaluation.

---

## File Template

```markdown
---
phase: XX-name
verified: YYYY-MM-DDTHH:MM:SSZ
status: passed | gaps_found | human_needed | deferred
score: N/M must-haves verified
verification_level: sanity | proxy | full | deferred
---

# Phase {X}: {Name} Verification Report

**Phase Goal:** {goal from ROADMAP.md}
**Phase Type:** {survey | implement | evaluate | integrate}
**Verified:** {timestamp}
**Status:** {passed | gaps_found | human_needed | deferred}
**Verification Level:** {sanity | proxy | full | deferred}

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | {truth from must_haves} | VERIFIED | {what confirmed it} |
| 2 | {truth from must_haves} | FAILED | {what's wrong} |
| 3 | {truth from must_haves} | UNCERTAIN | {why can't verify} |
| 4 | {truth from must_haves} | DEFERRED | {deferred to phase X} |

**Score:** {N}/{M} truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/model.py` | Model implementation | EXISTS + SUBSTANTIVE | Exports forward(), no stubs |
| `eval/run_eval.py` | Evaluation script | STUB | File exists but returns placeholder |

**Artifacts:** {N}/{M} verified

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| model.py | eval script | import | WIRED | Line 5: `from model import Model` |

**Wiring:** {N}/{M} connections verified

## Tiered Verification Results

### Sanity Check (Always Run)
- [ ] Code compiles/imports without errors
- [ ] Core function signatures match expected API
- [ ] No placeholder/stub implementations remain
- [ ] Basic smoke test passes

### Proxy Metrics (If verification_level >= proxy)
| Metric | Dataset | Result | Target | Status |
|--------|---------|--------|--------|--------|
| {metric} | {small test set} | {value} | {target} | MET/BELOW |

### Full Evaluation (If verification_level = full)
| Metric | Dataset | Baseline | Result | Delta | Target | Status |
|--------|---------|----------|--------|-------|--------|--------|
| {metric} | {full test set} | {baseline} | {value} | {+/-} | {target} | MET/BELOW |

**Method:** {approach used}
**Runtime:** {time taken}

### Deferred Validations (If verification_level = deferred)
| Validation | Deferred To | Reason | Must Resolve By |
|------------|-------------|--------|-----------------|
| {validation} | Phase {X} | {reason} | Phase {Y} |

## Requirements Coverage

| Requirement | Status | Blocking Issue |
|-------------|--------|----------------|
| {REQ-01}: {description} | SATISFIED | - |
| {REQ-02}: {description} | BLOCKED | API route is stub |

**Coverage:** {N}/{M} requirements satisfied

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| src/model.py | 12 | `# TODO: implement` | Blocker | Indicates incomplete |

## Gaps Summary

{If no gaps:}
**No gaps found.** Phase goal achieved. Ready to proceed.

{If gaps found:}

### Critical Gaps (Block Progress)

1. **{Gap name}**
   - Missing: {what's missing}
   - Impact: {why this blocks the goal}
   - Fix: {what needs to happen}

### Non-Critical Gaps (Can Defer)

1. **{Gap name}**
   - Issue: {what's wrong}
   - Recommendation: {fix now or defer}

## Recommended Fix Plans

{If gaps found:}

### {phase}-{next}-PLAN.md: {Fix Name}

**Objective:** {What this fixes}
**Tasks:**
1. {Task to fix gap}
2. {Verification task}
**Estimated scope:** {Small / Medium}

---

## Verification Metadata

**Verification approach:** Goal-backward (derived from phase goal)
**Verification level:** {sanity | proxy | full | deferred}
**Must-haves source:** {PLAN.md frontmatter | derived from ROADMAP.md goal}
**Automated checks:** {N} passed, {M} failed
**Human checks required:** {N}
**Total verification time:** {duration}

---
*Verified: {timestamp}*
*Verifier: Claude (subagent)*
```

---

## Tiered Verification Levels

| Level | When Used | What's Checked | Time |
|-------|-----------|----------------|------|
| `sanity` | Survey/early phases | Code compiles, no stubs, basic smoke test | < 1 min |
| `proxy` | Implement phases | Sanity + small-scale metric check | 1-5 min |
| `full` | Evaluate phases | All metrics on full datasets against baselines | 5-30 min |
| `deferred` | Integration phases | Log what needs checking, defer to later phase | < 1 min |

## Guidelines

Same core structure as GSD verification-report.md. See GSD for examples.

**GRD additions:**
- `verification_level` in frontmatter determines which checks run
- Tiered Verification Results section with sanity/proxy/full/deferred subsections
- Deferred Validations tracking for cross-phase verification
- Quantitative metrics tables with baseline/result/delta/target
- Status can be `deferred` (not just passed/gaps_found/human_needed)
