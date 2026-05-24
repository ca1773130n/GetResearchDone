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
    - "`--apply --yes` writes to .planning/GENOME-SUGGESTIONS.md (separate file), NEVER GENOME.md"
    - "promotion to GENOME.md requires `gd genome promote-suggestion <slug>` (human-curated)"
    - "planner contract: planner reads GENOME.md only; never reads GENOME-SUGGESTIONS.md"
    - "statistical floor: n >= 10, effect_size >= 0.20, BH-FDR q < 0.10"
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

<task name="verdict-statistics-with-fdr">
**Codex review P2 #7: per-token binomial p<0.05 across many
tokens invites multiple-comparison noise.** v2 adds standard
corrections:

Compute per-token verdict statistics:
- For each vocabulary token T appearing in a plan: `confirmed_rate
  = confirmed_count / total_count_for_T`.
- Compute the project-wide baseline rate.
- Token is "statistically significant" if ALL of:
  (a) appears in ≥10 plans (raised from 5)
  (b) absolute effect size ≥ 0.20 (NEW — rate deviates from
      baseline by ≥20 percentage points)
  (c) raw p < 0.05 via binomial test against baseline
  (d) **Benjamini-Hochberg FDR-corrected** q < 0.10 across all
      tokens tested in the run (NEW — prevents multiple-
      comparison noise)
- Suppress low-information implementation tokens (configurable
  stopword list: `function`, `const`, `import`, `test`, `module`,
  etc. + the existing `lib/drift.ts` stopword list).
</task>

<task name="suggestion-output-to-separate-file">
**Codex review P1 #5 + DEAD-ENDS slug
`auto-suggestions-in-genome-file`**: writes go to
`.planning/GENOME-SUGGESTIONS.md`, NOT GENOME.md. The planner
contract is that GENOME.md sections are prescriptive; mixing
auto-generated suggestions in the same file blurs that.

For each significant token, append a suggested heuristic to
GENOME-SUGGESTIONS.md (under a per-run dated header):

```
## Run 2026-05-24

- Plans containing "refactor" have 78% confirmed (baseline 35%,
  n=12, raw_p=0.0021, fdr_q=0.018, effect_size=+0.43).
  Suggested heuristic: "Plans with explicit refactor-style task
  names succeed more often."
  Promote with: `gd genome promote-suggestion refactor-rate`
```

In `--dry-run`, print only. In `--apply --yes`, write the file.
Promotion to GENOME.md `## Heuristics in use` is a SEPARATE
human-curated command (`gd genome promote-suggestion <slug>`)
that takes the suggestion text + a human-edited heuristic
formulation. The planner never reads GENOME-SUGGESTIONS.md.
</task>

<task name="planner-contract-no-suggestions-leak">
Update `agents/grd-planner.md` `<genome>` block to explicitly
state: "Read GENOME.md only. NEVER read GENOME-SUGGESTIONS.md
or other auto-generated artifacts that have not been
human-promoted." This is a defensive measure against future
context-injection drift.
</task>

<task name="cli-wireup">
Register `patterns` in lib/cli/index.ts (TOOL_COMMANDS) and
bin/grd-tools.ts. Flags:
- `--dry-run` (default)
- `--apply` (requires `--yes`)
- `--min-occurrences N` (default **10** to match the v2
  statistical floor; codex r2 caught the stale 5)
- `--effect-size F` (default 0.20)
- `--fdr-q F` (default 0.10 for BH-FDR cutoff)
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
- Unit: statistical floor honored — n=9 never significant; n=10
  with skewed mix AND effect_size >= 0.20 AND BH-FDR q < 0.10
  is significant.
- Unit: BH-FDR multiple-comparison correction reduces spurious
  positives on a synthetic null corpus (verdicts assigned
  uniform-random) to ≤1 false positive across 10 runs.
- Integration: `gd patterns --dry-run` on the live GRD .planning/
  tree produces a sensible list (manual eyeball check; not
  asserted in tests).
- Integration: `gd patterns --apply` without --yes flag refuses
  to write; with --yes appends correctly to
  **.planning/GENOME-SUGGESTIONS.md** (NOT GENOME.md).
- Integration: GENOME.md is byte-identical before and after
  `gd patterns --apply --yes` (defensive check that we don't
  accidentally write to the prescriptive file).
</task>
</tasks>

## Verification (proxy)

```yaml
sanity:
  - "gd patterns --help works"
  - "gd patterns --dry-run on empty .planning/ exits 0 with empty list"
proxy:
  - "synthetic-corpus unit test: tokens with skewed verdict mix flagged correctly only when n>=10 AND effect_size>=0.20 AND BH-FDR q<0.10"
  - "boundary test: n=9 never significant; n=10 with skewed mix significant when other thresholds met"
  - "gd patterns --apply requires --yes (refuses otherwise)"
  - "gd patterns --apply --yes writes to GENOME-SUGGESTIONS.md; GENOME.md byte-identical"
deferred:
  - id: DEFER-v0.4-5-1
    description: "Real value of suggested heuristics — requires manual review of output on a project with ≥30 reflections"
    validates_at: post-v0.4.1 manual review
```

## <reflection>

(Codex review P2 #6 + P2 #7: in-phase falsifiable + tracked
deferred + FDR-corrected statistical floor.)

```yaml
hypothesis: "FDR-corrected per-token binomial test + n≥10 + effect-size ≥ 0.20 + stopword suppression yields zero false-positive heuristic suggestions on a synthetic null corpus (all reflections randomly verdicted with uniform 50/50 confirmed/falsified)."
predicted_outcome: "Unit test: feed the extractor 100 synthetic reflections with verdicts assigned by uniform random. Expected output: empty suggestion list (within 1 spurious suggestion across 10 runs at q<0.10 FDR cutoff)."
deferred_validations:
  - id: DEFER-v0.4-5-real-utility
    claim: "On the real GRD reflection history (≥47 reflections), the extractor produces ≥1 suggestion that a human reviewer accepts as a real, actionable heuristic."
    validates_at: post-ship manual review
    measure: "human accept / reject rate on the first N suggestions emitted"
```

## Notes

- This is the most P2-prone phase on v0.4. Statistics on a small
  corpus produce false positives; the `--min-occurrences` (n>=10),
  `--effect-size` (>=0.20), and `--fdr-q` (BH-FDR cutoff 0.10)
  defaults exist to mitigate but won't eliminate. Synthetic-null-
  corpus unit test (see tasks) is the empirical guard.
- The intent is "suggest heuristics to a human"; the intent is
  NOT "auto-curate GENOME". The `--yes` requirement enforces this.
- Estimated cost: ~1 day. ~350 lines incl. tests.
