# Deep Dive Template

Template for `.planning/research/deep-dives/[paper-slug].md` - individual paper deep analysis.

**Purpose:** Detailed analysis of a single paper's method, code, limitations, and production considerations. Created by `/grd:deep-dive`.

**Downstream consumers:**
- `grd-planner` - implementation details inform task design
- `grd-feasibility-analyst` - limitations and requirements inform viability
- Updates LANDSCAPE.md (deep dive link) and KNOWHOW.md (production notes)

---

## File Template

```markdown
# Deep Dive: [Paper Short Title]

**Paper:** [Full Title]
**Authors:** [Authors]
**Venue:** [Conference/Journal, Year]
**Link:** [arxiv/doi URL]
**Code:** [GitHub URL or "Not available"]
**Analyzed:** [YYYY-MM-DD]

## TL;DR

[2-3 sentences: what it does, why it matters, should we use it]

**Verdict:** ADOPT | EVALUATE | SKIP | ADAPT
**Confidence:** HIGH | MEDIUM | LOW

## Method Summary

### Core Idea

[1 paragraph explaining the key insight/contribution]

### Architecture

```
[ASCII diagram or pseudocode of the method]
```

### Key Components

1. **[Component Name]:** [What it does, why it's needed]
2. **[Component Name]:** [What it does, why it's needed]
3. **[Component Name]:** [What it does, why it's needed]

### Training Procedure

- **Loss function:** [description]
- **Optimizer:** [name + hyperparameters]
- **Schedule:** [learning rate schedule]
- **Data augmentation:** [techniques used]
- **Batch size:** [size]
- **Training time:** [duration + hardware]

### Key Equations

[Include 1-3 most important equations with plain-English explanation]

```
L_total = lambda_1 * L_pixel + lambda_2 * L_perceptual + lambda_3 * L_adversarial
```

Where:
- `L_pixel`: [what it does]
- `L_perceptual`: [what it does]
- `L_adversarial`: [what it does]

## Results Analysis

### Claimed Results

| Metric | Dataset | Value | vs Previous SoTA |
|--------|---------|-------|------------------|
| [metric] | [dataset] | [value] | [+/- delta] |

### Result Quality Assessment

- **Are results reproducible?** [Yes/Partially/No + evidence]
- **Cherry-picked examples?** [Assessment of figure selection]
- **Ablation quality:** [Are ablations thorough?]
- **Statistical significance:** [Reported? Meaningful?]

## Code Analysis

[Only if code is available]

### Code Quality

- **Language:** [Python/C++/etc]
- **Framework:** [PyTorch/TensorFlow/JAX]
- **Dependencies:** [key dependencies and versions]
- **Documentation:** [quality assessment]
- **Tests:** [presence and coverage]

### Implementation Notes

- [Note 1: e.g., "Custom CUDA kernels for attention - not portable"]
- [Note 2: e.g., "Hardcoded paths in config - needs cleanup"]
- [Note 3: e.g., "Training script well-structured, easy to modify"]

### Discrepancies vs Paper

| Aspect | Paper | Code | Impact |
|--------|-------|------|--------|
| [aspect] | [paper says] | [code does] | [does it matter?] |

## Limitations

### Acknowledged in Paper

- [Limitation 1]
- [Limitation 2]

### Unacknowledged

- [Limitation 1: e.g., "Fails on images with text"]
- [Limitation 2: e.g., "4x slower than claimed when using batch size 1"]
- [Limitation 3: e.g., "Training requires 8 GPUs minimum for stability"]

### For Our Use Case

- [Limitation 1: e.g., "Our images are higher resolution than paper tested"]
- [Limitation 2: e.g., "We need real-time inference, paper uses batch processing"]

## Production Considerations

### Compute Requirements

| Task | GPU Memory | GPU Count | Wall Time |
|------|-----------|-----------|-----------|
| Training | [GB] | [N] | [hours] |
| Fine-tuning | [GB] | [N] | [hours] |
| Inference | [GB] | [N] | [ms/image] |

### Integration Effort

- **Estimated effort:** [days/weeks]
- **Key integration points:** [what needs adapting]
- **Dependency conflicts:** [with our existing stack]

### Licensing

- **Paper license:** [license type]
- **Code license:** [license type]
- **Model weights:** [available? license?]
- **Compatible with our project?** [Yes/No + reason]

## Adaptation Plan

[If verdict is ADOPT or ADAPT]

### What to Keep

- [Component/technique to use as-is]

### What to Modify

- [Component: modification needed and why]

### What to Replace

- [Component: replacement and why]

### Implementation Phases

1. [Phase: e.g., "Port core model architecture"]
2. [Phase: e.g., "Adapt training pipeline to our data"]
3. [Phase: e.g., "Optimize inference for our latency budget"]

## Related Papers

- [Paper]: [relationship - extends/competes/builds-on]
- [Paper]: [relationship]

## Notes

[Free-form observations, questions, and ideas]

---

*Deep dive: [paper title]*
*Analyzed: [date]*
*Analyst: Claude (grd-deep-diver)*
```

---

## Guidelines

**When to create:**
- Via `/grd:deep-dive [paper]` command
- When a paper moves from "interesting" to "implementation candidate"
- Before starting implementation of a paper's method

**Location:**
- `.planning/research/deep-dives/[paper-slug].md`
- Paper slug: lowercase, hyphenated (e.g., `swinir-2021`, `real-esrgan-2021`)

**Verdict definitions:**
- `ADOPT` - Use this method as primary approach
- `EVALUATE` - Promising but needs testing on our data/constraints first
- `SKIP` - Not suitable for our use case (document why)
- `ADAPT` - Core idea is good but needs significant modification

**Content quality:**
- Code analysis is critical - papers lie, code doesn't
- Discrepancies between paper and code are high-value findings
- Unacknowledged limitations are the most important section
- Production considerations determine feasibility, not paper metrics

**After creation:**
- Update LANDSCAPE.md with deep dive link
- Update PAPERS.md status to "read"
- Add production notes to KNOWHOW.md
