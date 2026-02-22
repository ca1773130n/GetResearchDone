# Requirements: v0.2.8 Self-Evolving Loop

**Milestone:** v0.2.8
**Created:** 2026-02-22

## Categories

### Evolve Command

| ID | Requirement | Priority | Phase | Status |
|----|------------|----------|-------|--------|
| REQ-54 | `/grd:evolve` command that orchestrates the full self-improvement loop: discover work items, plan, execute, review, hand off remaining items | P0 | TBD | PLANNED |
| REQ-55 | Work item discovery engine: analyze codebase for improvements in productivity, quality, usability, consistency, stability, and new features; load items from previous evolve iteration | P0 | TBD | PLANNED |
| REQ-56 | Priority selection: select N priority items per iteration, generate phase plans using subagents sequentially | P0 | TBD | PLANNED |
| REQ-57 | Iteration handoff: persist remaining and newly-discovered bugfix work items to disk for next evolve iteration; structured state file tracking iteration history | P0 | TBD | PLANNED |
| REQ-58 | Evolution notes: keep takeaways, decisions, patterns discovered, and iteration history in planning docs (e.g., EVOLUTION.md) | P1 | TBD | PLANNED |
| REQ-59 | Sonnet-tier model enforcement: all evolve operations (discovery, planning, execution, review) use sonnet/moderate model at most; no opus agents in evolve flow | P0 | TBD | PLANNED |

### Markdown Management

| ID | Requirement | Priority | Phase | Status |
|----|------------|----------|-------|--------|
| REQ-60 | Auto-detect markdown files exceeding ~25,000 tokens and split into numbered partial files (e.g., STATE-part1.md, STATE-part2.md) | P1 | TBD | PLANNED |
| REQ-61 | Original file becomes an index with links to partials; all GRD readers (state.js, roadmap.js, utils.js) transparently handle both single-file and split formats | P1 | TBD | PLANNED |

## Traceability Matrix

| REQ | Phase | Plans | Verified |
|-----|-------|-------|----------|
| REQ-54 | TBD | — | — |
| REQ-55 | TBD | — | — |
| REQ-56 | TBD | — | — |
| REQ-57 | TBD | — | — |
| REQ-58 | TBD | — | — |
| REQ-59 | TBD | — | — |
| REQ-60 | TBD | — | — |
| REQ-61 | TBD | — | — |
