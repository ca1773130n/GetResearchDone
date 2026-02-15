# Research Landscape Template

Template for `.planning/research/LANDSCAPE.md` - SoTA research landscape for the project domain.

**Purpose:** Track the state-of-the-art methods, papers, and approaches relevant to the project. Central hub for research-driven development. Updated by `/grd:survey` and `/grd:deep-dive`.

**Downstream consumers:**
- `grd-planner` - reads methods to inform implementation approach
- `grd-feasibility-analyst` - reads methods to assess production viability
- `grd-eval-planner` - reads metrics to design evaluation
- `grd-product-owner` - reads landscape for strategic decisions

---

## File Template

```markdown
# Research Landscape: [Project Domain]

**Last Updated:** [YYYY-MM-DD]
**Domain:** [e.g., "Image Super-Resolution", "Neural Style Transfer", "Speech Enhancement"]
**Scope:** [e.g., "Single-image SR methods, 2022-2025, focusing on real-world degradation"]

## Problem Statement

[1-2 paragraphs defining the research problem being addressed]

**Input:** [What goes in]
**Output:** [What comes out]
**Key Challenge:** [Why this is hard]
**Our Constraint:** [Project-specific constraints: latency, model size, data availability]

## Method Taxonomy

[Categorize approaches by family/paradigm]

### [Category 1: e.g., "CNN-Based Methods"]

| Method | Paper | Year | Key Idea | PSNR (Set5) | Params | Speed | Code |
|--------|-------|------|----------|-------------|--------|-------|------|
| [name] | [arxiv link] | [year] | [1-line summary] | [metric] | [size] | [speed] | [repo link] |
| [name] | [arxiv link] | [year] | [1-line summary] | [metric] | [size] | [speed] | [repo link] |

**Category insight:** [What this family of methods does well/poorly]

### [Category 2: e.g., "Transformer-Based Methods"]

| Method | Paper | Year | Key Idea | PSNR (Set5) | Params | Speed | Code |
|--------|-------|------|----------|-------------|--------|-------|------|
| [name] | [arxiv link] | [year] | [1-line summary] | [metric] | [size] | [speed] | [repo link] |

**Category insight:** [What this family does well/poorly]

### [Category 3: e.g., "Diffusion-Based Methods"]

| Method | Paper | Year | Key Idea | PSNR (Set5) | Params | Speed | Code |
|--------|-------|------|----------|-------------|--------|-------|------|
| [name] | [arxiv link] | [year] | [1-line summary] | [metric] | [size] | [speed] | [repo link] |

**Category insight:** [What this family does well/poorly]

## Performance Overview

### Benchmark Comparison

| Method | [Metric 1] | [Metric 2] | [Metric 3] | Params | FLOPs | Latency |
|--------|-----------|-----------|-----------|--------|-------|---------|
| [method] | [value] | [value] | [value] | [size] | [ops] | [ms] |

**Pareto front:** [Which methods offer best tradeoff of quality vs cost]

### Trends

- **Accuracy trend:** [e.g., "PSNR gains plateauing, perceptual quality improving"]
- **Efficiency trend:** [e.g., "Knowledge distillation enabling 10x smaller models"]
- **Data trend:** [e.g., "Shift from synthetic to real-world training data"]

## Key Papers

[Top 5-10 most relevant papers with 1-paragraph summaries]

### [Paper Title] ([Year])
- **Authors:** [authors]
- **Link:** [arxiv/doi]
- **Key contribution:** [What they introduced]
- **Relevance to us:** [Why this matters for our project]
- **Deep dive:** [Yes/No - link to deep-dive doc if done]

### [Paper Title] ([Year])
- **Authors:** [authors]
- **Link:** [arxiv/doi]
- **Key contribution:** [What they introduced]
- **Relevance to us:** [Why this matters for our project]
- **Deep dive:** [Yes/No]

## Method Selection Matrix

[For our project specifically, which methods are candidates]

| Method | Fits Constraints? | Implementation Effort | Risk | Recommendation |
|--------|-------------------|----------------------|------|----------------|
| [method] | [yes/partial/no + why] | [LOW/MEDIUM/HIGH] | [risk factors] | ADOPT / EVALUATE / SKIP |
| [method] | [yes/partial/no + why] | [LOW/MEDIUM/HIGH] | [risk factors] | ADOPT / EVALUATE / SKIP |

**Primary candidate:** [method] - [1-line justification]
**Backup candidate:** [method] - [when to switch to this]

## Open Research Questions

1. **[Question]:** [What's unknown, how it affects us]
2. **[Question]:** [What's unknown, how it affects us]

## Datasets & Benchmarks

| Dataset | Size | Purpose | Access |
|---------|------|---------|--------|
| [name] | [size] | [what it measures] | [link/access method] |

## Update Log

| Date | Update | Source |
|------|--------|--------|
| [date] | [what changed] | [survey/deep-dive/manual] |

---

*Landscape for: [domain]*
*Last surveyed: [date]*
*Next survey due: [date or trigger condition]*
```

---

## Guidelines

**When to create:**
- At project start via `/grd:survey`
- When entering a new research domain
- When existing approach is not meeting targets (iteration trigger)

**When to update:**
- After each `/grd:survey` run
- After `/grd:deep-dive` completes (add deep dive link)
- When new papers/methods are discovered during implementation
- At iteration boundaries (after `/grd:iterate`)

**Content quality:**
- Method tables: Include quantitative results, not just descriptions
- Performance overview: Use same metrics and datasets for fair comparison
- Method selection: Be explicit about why methods fit or don't fit our constraints
- Open questions: These drive future research phases

**Size management:**
- Keep method tables to top 5-10 per category
- Move detailed analysis to individual deep-dive docs
- Archive superseded methods to a "Historical" section if landscape grows too large

**Integration with planning:**
- LANDSCAPE.md is loaded as context during plan-phase for evaluate/implement phases
- Method selection matrix directly informs which approach to implement
- Primary candidate becomes the target for implementation phases
- Backup candidate informs iteration strategy if primary fails targets
