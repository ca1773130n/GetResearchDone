---
phase_number: "5"
phase_slug: pattern-extractor
plan_number: "05-01"
wave: 5
depends_on: []
autonomous: true
verification_level: proxy
files_modified:
  - lib/commands/patterns.ts
  - bin/grd-tools.ts
  - lib/cli/index.ts
  - tests/unit/patterns.test.ts
must_haves:
  artifacts:
    - lib/commands/patterns.ts
    - tests/unit/patterns.test.ts
  key_links:
    - "`gd patterns --dry-run` lists suggested heuristics from VERIFICATION.md verdicts"
    - "`--apply` requires explicit flag; writes to GENOME.md only with confirmation"
    - "no LLM round-trip on the read or write path"
---

# Phase 5 — Deterministic pattern extractor

## Goal

Implement `gd patterns` — scan recent VERIFICATION.md `<reflection>`
blocks, compute verdict-outcome statistics per plan vocabulary
token, and *suggest* (with `--dry-run`) statistically significant
patterns for GENOME.md heuristics.

## Context

This is the *defensible fraction* of the meta-review-agent idea
that DEAD-ENDS now rules out
(`meta-review-agent-with-write-access`). Same data source
(reflections), same end goal (compound learnings into GENOME),
but the write path is deterministic statistics + human review,
not LLM judgment.

GENOME heuristic *"Write-paths to project memory must be
deterministic OR human-reviewed"* applies directly. This phase
honors it: extraction is deterministic; writes require `--apply`.

This phase is *independent* of phases 1-4. Ships as v0.4.1 (after
the v0.4.0 multi-candidate work lands).

## Tasks

<tasks>
<task name="reflection-scanner">
Scan `.planning/milestones/*/phases/*/VERIFICATION.md` (and bare
`VERIFICATION.md`). Parse `<reflection>` blocks. Extract
`hypothesis`, `actual_outcome`, `verdict`, plus the parent
phase's PLAN.md token vocabulary.
</task>

<task name="verdict-statistics">
Compute per-token verdict statistics:
- For each vocabulary token T appearing in a plan: `confirmed_rate
  = confirmed_count / total_count_for_T`.
- Compute the project-wide baseline rate.
- Token is "statistically significant" if (a) it appears in ≥5
  plans, (b) its rate deviates from baseline by ≥1.5 standard
  deviations, AND (c) the deviation reaches p<0.05 via a binomial
  test against the baseline.
</task>

<task name="suggestion-output">
For each significant token, generate a suggested heuristic line:

```
- Plans containing "{token}" have {rate}% confirmed (baseline
  {baseline}%, n={count}, p={pvalue}). Consider promoting to
  prescriptive heuristic.
```

In `--dry-run`, just print. In `--apply`, append to GENOME.md
under a new `## Suggested heuristics (auto-generated)` section
(separate from the human-curated `## Heuristics in use`).
</task>

<task name="cli-wireup">
Register `patterns` in lib/cli/index.ts (TOOL_COMMANDS) and
bin/grd-tools.ts. Flags: `--dry-run` (default), `--apply`,
`--min-occurrences N` (default 5), `--significance P` (default
0.05).
</task>

<task name="never-auto-write">
The `gd patterns --apply` path requires either an interactive
confirmation OR an explicit `--yes` flag. Default behavior is
dry-run. There is no autopilot integration that auto-runs this
command. (GENOME heuristic enforcement.)
</task>

<task name="tests">
- Unit: reflection scanner correctly parses split-index and
  prefixed VERIFICATION.md files (use safeReadMarkdown per
  GENOME heuristic).
- Unit: verdict-statistics on a synthetic reflection corpus with
  known token-to-verdict distributions.
- Unit: significance threshold (binomial test) correctly fires
  only when n is large enough.
- Integration: `gd patterns --dry-run` on the live GRD .planning/
  tree produces a sensible list (manual eyeball check; not
  asserted in tests).
- Integration: `gd patterns --apply` without --yes flag refuses
  to write; with --yes appends correctly to GENOME.md.
</task>
</tasks>

## Verification (proxy)

```yaml
sanity:
  - "gd patterns --help works"
  - "gd patterns --dry-run on empty .planning/ exits 0 with empty list"
proxy:
  - "synthetic-corpus unit test: tokens with skewed verdict mix flagged correctly"
  - "binomial test boundary: n=4 never significant; n=5 with skewed mix significant"
  - "gd patterns --apply requires --yes (refuses otherwise)"
deferred:
  - id: DEFER-v0.4-5-1
    description: "Real value of suggested heuristics — requires manual review of output on a project with ≥30 reflections"
    validates_at: post-v0.4.1 manual review
```

## <reflection>

```yaml
hypothesis: "Deterministic vocabulary-frequency-vs-verdict statistics over reflection history produces useful heuristic suggestions that a human reviewer would accept ≥50% of the time."
predicted_outcome: "Mechanical tests pass. The 'useful' claim requires manual review on real data; deferred to post-ship."
```

## Notes

- This is the most P2-prone phase on v0.4. Statistics on a small
  corpus produce false positives; the `--min-occurrences` and
  `--significance` defaults exist to mitigate but won't eliminate.
- The intent is "suggest heuristics to a human"; the intent is
  NOT "auto-curate GENOME". The `--yes` requirement enforces this.
- Estimated cost: ~1 day. ~350 lines incl. tests.
