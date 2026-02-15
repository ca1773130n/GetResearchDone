# Benchmarks Template

Template for `.planning/research/BENCHMARKS.md` - evaluation metrics, datasets, and benchmark results.

**Purpose:** Central reference for how we measure success. Defines which metrics matter, which datasets to use, what targets to hit, and how our results compare to published baselines.

**Downstream consumers:**
- `grd-eval-planner` - designs evaluation plans from this
- `grd-eval-reporter` - compares results against this
- `grd-baseline-assessor` - records baseline measurements here
- `grd-product-owner` - sets targets based on this

---

## File Template

```markdown
# Benchmarks

**Project:** [project name]
**Last Updated:** [YYYY-MM-DD]

## Metrics

### Primary Metrics

| Metric | What It Measures | Higher/Lower Better | Range | Our Target |
|--------|-----------------|---------------------|-------|------------|
| [metric] | [description] | Higher | [range] | [target value] |
| [metric] | [description] | Lower | [range] | [target value] |

### Secondary Metrics

| Metric | What It Measures | Higher/Lower Better | Purpose |
|--------|-----------------|---------------------|---------|
| [metric] | [description] | [direction] | [why we track this] |

### Metric Definitions

**[Metric Name]:**
- Formula: [mathematical definition or reference]
- Library: [implementation: e.g., "torchmetrics.PSNR", "skimage.metrics.structural_similarity"]
- Notes: [gotchas, scale sensitivity, common misuses]
- Reference: [paper or standard defining this metric]

**[Metric Name]:**
- Formula: [definition]
- Library: [implementation]
- Notes: [gotchas]

## Datasets

### Evaluation Datasets

| Dataset | Size | Resolution | Purpose | Access | License |
|---------|------|-----------|---------|--------|---------|
| [name] | [N images/samples] | [dimensions] | [what it tests] | [URL] | [license] |
| [name] | [N images/samples] | [dimensions] | [what it tests] | [URL] | [license] |

### Training Datasets (if applicable)

| Dataset | Size | Purpose | Access | License |
|---------|------|---------|--------|---------|
| [name] | [size] | [what it provides] | [URL] | [license] |

### Dataset Notes

- **[Dataset]:** [Important notes: preprocessing, known issues, version to use]
- **[Dataset]:** [Important notes]

## Published Baselines

Results from papers on standard benchmarks:

### [Benchmark Name / Dataset]

| Method | [Metric 1] | [Metric 2] | [Metric 3] | Year | Source |
|--------|-----------|-----------|-----------|------|--------|
| [method] | [value] | [value] | [value] | [year] | [paper ref] |
| [method] | [value] | [value] | [value] | [year] | [paper ref] |
| [method] | [value] | [value] | [value] | [year] | [paper ref] |

**SoTA (as of [date]):** [method] achieving [metric value] on [dataset]

### [Benchmark Name / Dataset 2]

| Method | [Metric 1] | [Metric 2] | Year | Source |
|--------|-----------|-----------|------|--------|
| [method] | [value] | [value] | [year] | [paper ref] |

## Our Results

### Current Baseline

| Metric | Dataset | Baseline Value | Date | Phase |
|--------|---------|---------------|------|-------|
| [metric] | [dataset] | [value] | [date] | [phase that measured] |

### Result History

| Date | Phase | Method | [Metric 1] | [Metric 2] | Delta vs Baseline | Notes |
|------|-------|--------|-----------|-----------|-------------------|-------|
| [date] | [phase] | [approach] | [value] | [value] | [+/- change] | [what changed] |

## Evaluation Protocol

### Standard Evaluation

```bash
# Command to run standard evaluation
[evaluation command]
```

**Settings:**
- [Setting 1: e.g., "Input size: 256x256"]
- [Setting 2: e.g., "Batch size: 1 for inference"]
- [Setting 3: e.g., "No self-ensemble, no flip augmentation"]

### Tiered Evaluation

**Sanity (< 1 min):**
- Dataset: [small subset, e.g., "first 10 images of Set5"]
- Metrics: [primary metric only]
- Purpose: Smoke test after code changes

**Proxy (1-5 min):**
- Dataset: [small standard set, e.g., "Set5 + Set14"]
- Metrics: [primary + secondary metrics]
- Purpose: Quick quality check during development

**Full (5-30 min):**
- Dataset: [all evaluation datasets]
- Metrics: [all metrics]
- Purpose: Milestone evaluation, paper comparison

## Targets

| Metric | Dataset | Current | Target | Stretch | Status |
|--------|---------|---------|--------|---------|--------|
| [metric] | [dataset] | [current] | [target] | [stretch] | NOT MET / MET / EXCEEDED |

**Target rationale:**
- [Metric] target of [value]: [why this target - e.g., "matches SoTA from 2024 with 10x fewer params"]
- [Metric] target of [value]: [why this target]

---

*Benchmarks for: [project]*
*Last updated: [date]*
```

---

## Guidelines

**When to create:**
- During `/grd:new-project` or first `/grd:survey`
- Before any evaluation phase begins

**When to update:**
- After `/grd:assess-baseline` (adds baseline values)
- After `/grd:eval-report` (adds result history)
- After `/grd:survey` discovers new methods/benchmarks
- When targets are revised by product owner

**Content quality:**
- Metric definitions must include library/implementation reference
- Published baselines must cite source paper
- Our results must be reproducible (include eval command)
- Targets must have rationale, not arbitrary numbers

**Tiered evaluation protocol:**
- Sanity: Run after every code change, catches regressions
- Proxy: Run during development, guides iteration
- Full: Run at phase boundaries, enables comparison

**Integration with workflows:**
- `/grd:eval-plan` reads Metrics and Datasets sections
- `/grd:eval-report` reads Published Baselines and writes to Our Results
- `/grd:assess-baseline` writes to Current Baseline
- `/grd:iterate` reads Targets to decide continue/pivot
