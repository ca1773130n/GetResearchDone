# Strategy Genome

Project-scoped meta-strategy. The planner reads this before composing
every PLAN.md. Heuristics here are *prescriptive*; the snapshot
section below is descriptive (deterministic, auto-appended after
successful evolve cycles via `evolve.auto_genome_snapshot`).

See [`agents/grd-planner.md`](../agents/grd-planner.md) `<genome>`
block for the consumer contract.

## Heuristics in use

- **No LLM-judged scoring on the core execution path.** Ground truth
  in agentic coding is cheap and absolute (jest / tsc / lint via
  `spawnSync`). Any "scorer" or "selector" or "judge" that uses LLM
  inference on the path between candidate generation and execution
  is strictly worse than direct measurement. (Validated by codex
  task `b2lc9ahqn`, 2026-05-24.)
- **Write-paths to project memory must be deterministic OR
  human-reviewed.** GENOME, DEAD-ENDS, and STATE are the project's
  long-term memory. Adding an LLM round-trip to a write path turns
  one LLM error into a permanent heuristic. The deterministic
  pattern extractor (v0.4 item 5) suggests; humans `--apply`.
- **Use `safeReadMarkdown`, not `safeReadFile`, for planning
  artifacts.** Planning files may be in GRD-INDEX split format;
  `safeReadMarkdown` reassembles them. `safeReadFile` returns the
  stub.
- **Phase IDs are component-wise compared, never floats.**
  `01.10 > 01.9` only holds under component-wise integer compare.
  `parseFloat('01.10') === parseFloat('01.1')` is the failure mode.
  Use `lib/utils.ts:comparePhaseIds` analog.
- **Filenames may be bare OR prefixed.** Both `PLAN.md` and
  `01-02-PLAN.md` are valid. Every file scanner must accept both.
  Same for VERIFICATION.md, SUMMARY.md, RESEARCH.md, LANDSCAPE.md,
  KNOWHOW.md, EVAL.md.
- **`opts.timeout: 0` means unlimited, not "use default".**
  Falsy-coalesce hides the explicit zero. Branch on
  `opts.timeout === 0` first.
- **Argument-array spawning, never shell-string interpolation.**
  Even for "internal" callers. The hook reminders are right.

## Agent preferences

- **Run codex rescue after every PR** with `CODEX_HOME=~/.codex-personal1`.
  Codex acting as the adversarial verifier-of-record caught 51 issues
  across 47 review rounds (1 P0-equivalent path traversal, 6 P1
  correctness, 40 P2 convention, 4 P3). No PR ships unreviewed.
- **Reflection blocks are required, not optional.** Planner emits
  `<reflection>` with `hypothesis` + `predicted_outcome`; verifier
  fills `actual_outcome` + `verdict` with Evidence Standard
  (command + exit code + observable artifact per claim).
- **Falsified reflections auto-promote.** `gd-tools dead-end
  promote-from-phase N` runs at phase close; planner reads
  DEAD-ENDS.md before composing next phase.

## Verdict thresholds

- Ontology similarity ≥ 0.95 → autopilot halts gracefully with
  status `converged` (distinct from `failed`).
- Drift `weighted > 0.3` → `gd health` flags `drift_exceeded:
  true` (currently informational; v0.4+ will gate on this).

## Snapshots

_Auto-appended by `evolve.auto_genome_snapshot` after each successful
cycle. Deterministic; no LLM ran to compose them._

## Snapshot 2026-05-24

| Field | Value |
|-------|-------|
| completed_phases | 47 |
| singularity_pct | 92.2 (v0.3.24..HEAD) |
| dead_ends_registered | 3 |
| genome_heuristics_active | 7 |
| recent_codex_rounds | 47 |
| recent_findings | 51 (7 P1, 40 P2, 4 P3) |
| dominant_failure_mode | convention coverage |

_Snapshot derived from project state. No LLM ran to compose this
section. Curate the heuristic sections above by hand; this auto-
appended block is the deterministic floor._
