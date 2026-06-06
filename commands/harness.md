---
description: Run a life-harness round — improve GRD primitives from Tesserae session evidence (eval-gated, git-reversible)
---

# gd harness

- `gd harness round [--auto] [--dry-run] [--full-eval]` — gather session findings,
  propose a patch, eval-gate it; review mode (default) leaves branch
  `harness/round-<id>` for human merge.
- `gd harness status` — list recorded rounds.
- `gd harness revert <round-id>` — git-revert an applied round.

Config: `.planning/config.json` → `harness` block (autonomy, kill_switch,
min_confidence, min_interval_hours, allowed_targets, backend, min/max_evidence).
Requires: `pip install 'autoresearch-core>=0.4.3'`; a compiled Tesserae project
(`tesserae sessions-import` + `tesserae refresh`).
