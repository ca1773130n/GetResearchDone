# Baseline Assessment Template

Template for `.planning/research/BASELINE.md` - current performance metrics and system state.

**Purpose:** Quantitative snapshot of where we are RIGHT NOW. Updated by `/grd:assess-baseline`. Provides the "before" to every experiment's "after".

**Downstream consumers:**
- `grd-eval-planner` - uses as comparison point for targets
- `grd-eval-reporter` - computes deltas against this
- `grd-product-owner` - understands current capabilities
- STATE.md `Current Baseline` section mirrors key values from this

---

## File Template

```markdown
# Baseline Assessment

**Project:** [project name]
**Assessed:** [YYYY-MM-DD]
**Assessor:** [manual | grd-baseline-assessor]
**Git Commit:** [hash at time of assessment]

## Current Performance

### Primary Metrics

| Metric | Dataset | Value | Unit | Conditions |
|--------|---------|-------|------|------------|
| [metric] | [dataset] | [value] | [unit] | [e.g., "batch=1, fp32, no TTA"] |
| [metric] | [dataset] | [value] | [unit] | [conditions] |

### Secondary Metrics

| Metric | Dataset | Value | Unit | Notes |
|--------|---------|-------|------|-------|
| [metric] | [dataset] | [value] | [unit] | [notes] |

### System Metrics

| Metric | Value | Unit | Hardware |
|--------|-------|------|----------|
| Inference latency | [value] | ms | [GPU type] |
| Peak memory | [value] | GB | [GPU type] |
| Model size | [value] | MB | - |
| Parameters | [value] | M | - |
| FLOPs | [value] | G | [input size] |
| Throughput | [value] | images/sec | [GPU type, batch size] |

## Assessment Methodology

### Environment

```
Hardware: [GPU model, CPU, RAM]
Software: [Python version, PyTorch version, CUDA version]
OS: [OS and version]
```

### Reproduction Command

```bash
# Full command to reproduce these numbers
[assessment command]
```

### Evaluation Settings

- Input size: [dimensions]
- Batch size: [N]
- Precision: [fp32 | fp16 | bf16]
- Test-time augmentation: [None | Self-ensemble | Flip]
- Random seed: [seed]

## Qualitative Assessment

### Strengths

- [What the current system does well]
- [Specific cases where it excels]

### Weaknesses

- [What the current system does poorly]
- [Specific failure cases]
- [Edge cases that break]

### Sample Results

[Reference to saved sample outputs if applicable]

- Good case: [path/description] - [why it's good]
- Average case: [path/description] - [representative quality]
- Bad case: [path/description] - [what goes wrong]

## Comparison to Published Results

| Method | [Metric 1] | [Metric 2] | Source |
|--------|-----------|-----------|--------|
| **Ours (current)** | **[value]** | **[value]** | **This assessment** |
| [Published method A] | [value] | [value] | [paper ref] |
| [Published method B] | [value] | [value] | [paper ref] |

**Gap to target:** [metric] needs [+/- delta] improvement to reach [target]

## Baseline History

| Date | Git Commit | [Metric 1] | [Metric 2] | Phase | Change |
|------|-----------|-----------|-----------|-------|--------|
| [date] | [hash] | [value] | [value] | [phase] | Initial baseline |
| [date] | [hash] | [value] | [value] | [phase] | [what changed] |

## Assessment Notes

[Free-form observations about current state]

- [Observation 1]
- [Observation 2]

---

*Baseline assessed: [date]*
*Git: [commit hash]*
*Next assessment: [trigger condition or date]*
```

---

## Guidelines

**When to create:**
- At project start (initial baseline)
- Via `/grd:assess-baseline` command
- Before starting any new approach/method
- After major code changes that might affect metrics

**When to update:**
- After each evaluation phase completes
- When switching to a new approach (new baseline)
- At iteration boundaries
- When hardware/environment changes

**Content quality:**
- ALL values must be reproducible (include exact command)
- Include environment details (hardware, software versions)
- Include both quantitative AND qualitative assessment
- Record git commit hash for exact code state
- Sample results help understand what metrics don't capture

**Baseline history is crucial:**
- Tracks progress over time
- Enables regression detection
- Shows which changes actually improved things
- Feeds into STATE.md Current Baseline section

**Integration with other documents:**
- STATE.md mirrors key values in `Current Baseline` table
- BENCHMARKS.md references these values in `Our Results`
- EVAL plans use these as comparison baseline
- SUMMARY.md reports deltas against these values
