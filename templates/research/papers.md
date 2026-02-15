# Paper Index Template

Template for `.planning/research/PAPERS.md` - indexed collection of relevant papers with summaries.

**Purpose:** Quick-reference index of all papers encountered during research. Complements LANDSCAPE.md (which focuses on methods) by tracking individual papers with enough detail for citation and retrieval.

**Downstream consumers:**
- `grd-deep-diver` - selects papers for detailed analysis
- `grd-surveyor` - updates index during surveys
- `grd-planner` - references for implementation context

---

## File Template

```markdown
# Paper Index

**Project:** [project name]
**Last Updated:** [YYYY-MM-DD]
**Total Papers:** [N]

## Index

### Core Papers (Directly Relevant)

#### P01: [Short Title]
- **Full Title:** [Full paper title]
- **Authors:** [First Author et al.]
- **Venue:** [Conference/Journal, Year]
- **Link:** [arxiv/doi URL]
- **Tags:** [method-family], [technique], [dataset]
- **Summary:** [1-paragraph: what they did, key result, why it matters for us]
- **Key Figure/Table:** [Which figure/table to look at first]
- **Code:** [GitHub link or "Not available"]
- **Deep Dive:** [link to deep-dive doc or "Not done"]
- **Status:** read | skimmed | cited-only

#### P02: [Short Title]
- **Full Title:** [Full paper title]
- **Authors:** [First Author et al.]
- **Venue:** [Conference/Journal, Year]
- **Link:** [arxiv/doi URL]
- **Tags:** [tags]
- **Summary:** [1-paragraph summary]
- **Code:** [GitHub link or "Not available"]
- **Status:** read | skimmed | cited-only

### Supporting Papers (Background/Context)

#### P10: [Short Title]
- **Full Title:** [Full paper title]
- **Authors:** [First Author et al.]
- **Venue:** [Conference/Journal, Year]
- **Link:** [URL]
- **Tags:** [tags]
- **Summary:** [1-paragraph: why it's relevant background]
- **Status:** skimmed | cited-only

### Tangential Papers (May Be Useful Later)

#### P20: [Short Title]
- **Full Title:** [Full paper title]
- **Link:** [URL]
- **Tags:** [tags]
- **Why tracked:** [1-line: why we noted this paper]
- **Status:** cited-only

## Tag Index

| Tag | Papers |
|-----|--------|
| [tag1] | P01, P03, P05 |
| [tag2] | P02, P04 |
| [tag3] | P01, P02, P10 |

## Reading Queue

Papers identified but not yet read/analyzed:

1. [Paper title] - [why it's queued] - [priority: HIGH/MEDIUM/LOW]
2. [Paper title] - [why it's queued] - [priority]

## Citation Map

Key citation relationships between tracked papers:

```
P01 ──cites──> P10 (foundational architecture)
P02 ──extends──> P01 (adds attention mechanism)
P03 ──competes──> P02 (different approach, similar results)
```

---

*Paper index for: [project]*
*Last updated: [date]*
```

---

## Guidelines

**When to create:**
- During first `/grd:survey` run
- When project involves implementing methods from literature

**Paper numbering:**
- P01-P09: Core papers (directly relevant to implementation)
- P10-P19: Supporting papers (background, foundations)
- P20+: Tangential papers (may be useful later)

**Status values:**
- `read` - Full paper read, summary reflects understanding
- `skimmed` - Abstract + key sections read
- `cited-only` - Referenced in another paper, not directly read

**Content quality:**
- Summaries should explain relevance to THIS project, not just what the paper does
- Always include code link if available
- Tag index enables quick lookup by topic
- Citation map shows intellectual lineage

**Size management:**
- Keep to 20-30 papers maximum
- Move truly tangential papers to an archive section
- Deep analysis goes in separate deep-dive docs, not here
