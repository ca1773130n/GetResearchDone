---
phase: "96"
name: "Closed-Loop Metric-Driven Refinement"
created: 2026-03-25
---

# Phase 96: Closed-Loop Metric-Driven Refinement -- Context

Implement NERFIFY Stage 4: a critique agent system with three refinement branches (Macro: metric-minima guided patching, Geometry: structural validation of generated artifacts, Generative: VLM-guided artifact analysis). The system iteratively patches code/artifacts until convergence criteria are met. Includes grd-critique-agent definition, iterative refinement loop in lib/refinement.ts, convergence detection, and integration with the autopilot post-phase pipeline. Adapts NERFIFY PSNR-minima ROI analysis to GRD domain (test coverage minima, type error density, lint violation clustering).
