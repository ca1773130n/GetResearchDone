# Life-Harness Rounds — GRD Host (cross-reference)

**Date:** 2026-06-06
**Canonical spec:** `autoresearch-core` repo,
`docs/superpowers/specs/2026-06-06-life-harness-rounds-design.md` — the round
logic lives in the package; this doc records only what lands in GRD.

## Summary

`gd evolve` is deprecated. Its replacement is the life-harness: improve the
harness from **runtime evidence** (Tesserae Session findings — takeaways,
decisions, insights compiled from real sessions) via eval-gated, reversible,
git-anchored patch rounds. Round logic is pure in `autoresearch-core>=0.2`
(`rounds.py` + ports); GRD binds the I/O.

## What lands in GRD

| Piece | Description |
|---|---|
| `bin/harness_driver.py` | ~150-line Python driver binding the kernel's five ports: Tesserae CLI (findings), spawned codex/claude (proposal), npm lint/build:check/targeted jest + markdown/config structural checks (eval), git branch+commit (apply/revert), `.planning/harness/` (records). |
| `gd harness round [--auto\|--dry-run\|--full-eval]` | Runs one round. Resolves backend + account rotation env in gd (TS) and passes it to the driver. Review mode (default) leaves branch `harness/round-<id>` for human merge. |
| `gd harness status` / `gd harness revert <id>` | Render round records / `git revert` an applied round. |
| `.planning/config.json` → `harness` block | `autonomy` (review default), `kill_switch`, `min_confidence`, `min_interval_hours`, `allowed_targets` (markdown+config+code), `backend`, `min/max_evidence`. |
| `gd evolve` deprecation | Prints pointer to `gd harness round`, runs nothing. `lib/evolve/` stays for now (`gd singularity` history); `DEPRECATIONS.md` entry added. |

## Safety invariants (enforced by the kernel)

No absolute/`..`/`.git` paths; `bin/harness_driver.py` and the `harness`
config block are deny-listed (the loop cannot patch its own controls); one
atomic commit per round; deterministic rejections enter the dedupe set and
are never re-proposed.

## Constraints that shaped this

1. **Tesserae owns capture + synthesis** — GRD must not re-implement session
   parsing or takeaway extraction (operator directive, 2026-06-06).
2. **Round logic belongs to `autoresearch-core`** — pure contracts + ports,
   so Agented can converge on the same module later.
