# Roadmap

## v0.1 — baseline training pipeline

- [ ] **Phase 1: dataset preparation** — load {{DATASET}}, split into
  train/val/test with deterministic seed, write per-split sample counts
  to BASELINE.md
- [ ] **Phase 2: baseline training loop** — minimal training loop reaching
  ≥{{BASELINE_FRACTION}}% of {{TARGET_VALUE}} on the val split, with
  reproducible seed=0 run logged
- [ ] **Phase 3: held-out evaluation** — evaluate the baseline checkpoint
  on {{HELD_OUT_DATASET}}, report {{TARGET_METRIC}}, classify whether
  target is reachable from this baseline

## v0.2 — ablations

- [ ] **Phase 4: hyperparameter sweep** — sweep lr, batch_size, weight_decay;
  produce ablation table
- [ ] **Phase 5: architectural ablations** — vary depth/width; produce
  ablation table; pick winner
- [ ] **Phase 6: final evaluation** — best config evaluated on held-out;
  pass/fail vs target
