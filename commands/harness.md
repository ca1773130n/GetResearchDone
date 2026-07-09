---
description: Run a life-harness round — improve GRD primitives from Tesserae session evidence (eval-gated, git-reversible)
---

# gd harness

- `gd harness round [--auto] [--dry-run] [--full-eval]` — gather session findings,
  propose a patch, eval-gate it; review mode (default) leaves branch
  `harness/round-<id>` for human merge.
- `gd harness status` — list recorded rounds.
- `gd harness revert <round-id>` — git-revert an applied round.
- `gd harness upstream list` / `gd harness upstream clear [--origin <slug>]` —
  inspect or prune cross-project upstream candidates
  (`$CLAUDE_PLUGIN_DATA/harness/upstream`, fallback `~/.grd/harness/upstream`).
- `gd harness conversion [--raw]` — audit whether recorded lessons actually changed
  later behavior (Sibyl-style trial-to-behavior + trial-to-harness-behavior
  conversion): counts, conversion rate, median latency, top unconverted lessons.

Config: `.planning/config.json` → `harness` block (autonomy, kill_switch,
min_confidence, min_interval_hours, allowed_targets, backend, min/max_evidence,
distillation_max_age_days).
Requires: Python 3.11+ — the autoresearch-core kernel ships vendored with GRD
(no manual install); `pip install autoresearch-core` only to override with a
newer dev build. Also a compiled Tesserae project (`tesserae sessions-import` +
`tesserae refresh`).
