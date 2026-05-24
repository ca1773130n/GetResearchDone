# {{PROJECT_NAME}}

**Project shape:** ML training loop with held-out benchmark
**Template:** `ml-train` from GRD starters

## Goal

Train a {{MODEL_KIND}} model that achieves {{TARGET_METRIC}} ≥ {{TARGET_VALUE}}
on {{HELD_OUT_DATASET}}, reproducibly from a single `make train` invocation.

## Concepts (ontology)

dataset · training loop · checkpoint · ablation · evaluation · baseline
· held-out benchmark · reproducibility · seed · hyperparameter

## Targets

- **Primary:** {{TARGET_METRIC}} ≥ {{TARGET_VALUE}} on {{HELD_OUT_DATASET}}
- **Secondary:** training reproducible from seed=0 within ±0.5%
- **Cost ceiling:** {{COST_CEILING}} GPU-hours per ablation

## Non-goals

- Production serving infrastructure (separate project)
- Model compression / quantization (future milestone)
- Distributed training (single-node only)
