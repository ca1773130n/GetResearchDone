---
phase: 97-transitive-citation-graph-traversal
plan: 01
subsystem: citations
tags: [bfs, traversal, citation-graph, tdd, types]
dependency_graph:
  requires: [lib/types.ts, lib/citations.ts]
  provides: [traverseCitationGraph, resolveTransitiveDeps, TraversalOptions, TraversalResult]
  affects: [lib/citations.ts, lib/types.ts, tests/unit/citations.test.ts]
tech_stack:
  added: []
  patterns: [BFS with visited-set cycle detection, configurable depth/node limits, transitive graph merging]
key_files:
  created: []
  modified:
    - lib/types.ts
    - lib/citations.ts
    - tests/unit/citations.test.ts
decisions:
  - traverseCitationGraph seeds BFS from nodes with no incoming edges; falls back to all nodes if none qualify (e.g., pure cycles)
  - unresolved_leaves only populated for resolved=false leaf nodes (no outgoing edges)
  - resolveTransitiveDeps deduplicates edges by (from_slug, to_slug, component_name) triple
  - max_nodes cap is enforced at dequeue time so total_visited never exceeds the limit
metrics:
  duration_minutes: 3
  tasks_completed: 2
  files_modified: 3
  completed_date: "2026-03-25"
---

# Phase 97 Plan 01: Transitive Citation Graph Traversal — BFS Core

BFS citation traversal with cycle detection and configurable depth/node limits, plus transitive dependency resolution that merges discovered nodes/edges into a CitationGraph without duplication.

## Objective

Define `TraversalOptions` and `TraversalResult` interfaces and implement `traverseCitationGraph` (BFS traversal with cycle detection, depth/node limits) and `resolveTransitiveDeps` (merge transitive discoveries into a CitationGraph) in `lib/citations.ts`.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Define interfaces, write RED tests | 0a4ebec | lib/types.ts, tests/unit/citations.test.ts |
| 2 | Implement traversal functions (GREEN) | f09c10f | lib/citations.ts |

## Implementation

### TraversalOptions and TraversalResult (lib/types.ts)

Added to the Citation Types section after `CitationGraph`, before `ApiConfig`:

- `TraversalOptions`: max_depth (default 3), max_nodes (default 50), optional fetchFn
- `TraversalResult`: visited_nodes, edges_traversed, unresolved_leaves, depth_reached, total_visited

### traverseCitationGraph (lib/citations.ts)

Standard BFS with visited Set for O(1) cycle detection. Key design decisions:

- Root seeding: nodes with no incoming edges are BFS roots. Falls back to all nodes if every node has incoming edges (handles pure-cycle graphs).
- Depth tracking: `depth_reached` is the maximum depth seen across all dequeued entries.
- Node limit: enforced at dequeue time (`totalVisited >= max_nodes` breaks the loop immediately).
- Unresolved leaves: a node is added to `unresolved_leaves` when it has no outgoing edges in the adjacency map AND `resolved === false`.
- Adjacency map built upfront for O(1) edge lookup per node.

### resolveTransitiveDeps (lib/citations.ts)

Calls `traverseCitationGraph`, then merges results back into a new `CitationGraph`:

- Node deduplication: filters `visited_nodes` by slug not already in `graph.nodes`
- Edge deduplication: keys by `from_slug::to_slug::component_name`
- Returns a new object (does not mutate input)

## Verification

### Level 1 (Sanity)
- `lib/citations.ts` exports `traverseCitationGraph` and `resolveTransitiveDeps`: PASS
- `lib/types.ts` defines `TraversalOptions` and `TraversalResult`: PASS
- `npm run build:check`: PASS (zero errors)
- `npm run lint`: PASS (zero violations)

### Level 2 (Proxy)
- `npx jest tests/unit/citations.test.ts --coverage`: 62 tests pass
- `citations.ts` line coverage: 95.9% (threshold: 85%)
- `citations.ts` function coverage: 87.5% (threshold: 85%)
- `citations.ts` branch coverage: 88.9% (threshold: 75%)

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- `lib/types.ts` — TraversalOptions and TraversalResult interfaces present
- `lib/citations.ts` — traverseCitationGraph and resolveTransitiveDeps exported
- `tests/unit/citations.test.ts` — 62 tests (50 pre-existing + 12 new)
- Commits 0a4ebec and f09c10f exist in git history
