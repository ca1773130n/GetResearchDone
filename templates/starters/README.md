# GRD project starter templates

Three minimal `.planning/` scaffolds for common R&D project shapes. Each
template provides a `PROJECT.md`, a starter `ROADMAP.md` with 3–5 phases,
and a `REQUIREMENTS.md` with measurable `must_haves`.

Pick the template that matches your project shape, then point
`gd init --template <name>` at it (or copy the contents into your
project's `.planning/` directory by hand).

| Template | Project shape | First three phases |
|---|---|---|
| **ml-train** | An ML model: dataset → training loop → eval against a held-out benchmark | dataset prep · baseline train · ablations |
| **fastapi-service** | A Python web service: schema-first API with tests and OpenAPI contract | API contract · endpoints + tests · deploy-readiness |
| **cli-tool** | A self-contained CLI: argparse / clap / commander surface + golden-file tests | command surface · core ops · packaging |

Each template uses the Ouroboros primitives (falsifiable reflections,
DEAD-ENDS, drift, GENOME) but in a way appropriate to the project shape —
e.g. the ml-train GENOME has an "Evaluation thresholds" section the others
don't; the fastapi-service template's drift weights emphasize
constraint-fidelity (REQUIREMENTS) over ontology drift.

See [docs/ouroboros-loop.md](../../docs/ouroboros-loop.md) for the full
substrate these templates target.
