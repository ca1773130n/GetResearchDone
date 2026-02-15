# Model Profiles

Model profiles control which Claude model each GRD agent uses. This allows balancing quality vs token spend.

## Profile Definitions

### Core Agents (from GSD)

| Agent | `quality` | `balanced` | `budget` |
|-------|-----------|------------|----------|
| grd-planner | opus | opus | sonnet |
| grd-roadmapper | opus | sonnet | sonnet |
| grd-executor | opus | sonnet | sonnet |
| grd-phase-researcher | opus | sonnet | haiku |
| grd-project-researcher | opus | sonnet | haiku |
| grd-research-synthesizer | sonnet | sonnet | haiku |
| grd-debugger | opus | sonnet | sonnet |
| grd-codebase-mapper | sonnet | haiku | haiku |
| grd-verifier | sonnet | sonnet | haiku |
| grd-plan-checker | sonnet | sonnet | haiku |
| grd-integration-checker | sonnet | sonnet | haiku |

### R&D Agents (new)

| Agent | `quality` | `balanced` | `budget` |
|-------|-----------|------------|----------|
| grd-surveyor | opus | sonnet | sonnet |
| grd-deep-diver | opus | opus | sonnet |
| grd-feasibility-analyst | opus | sonnet | sonnet |
| grd-eval-planner | opus | sonnet | sonnet |
| grd-eval-reporter | sonnet | sonnet | haiku |
| grd-product-owner | opus | opus | sonnet |
| grd-baseline-assessor | sonnet | sonnet | haiku |

### Development Practice Agents

| Agent | `quality` | `balanced` | `budget` |
|-------|-----------|------------|----------|
| grd-code-reviewer | opus | sonnet | haiku |

## Profile Philosophy

**quality** - Maximum reasoning power
- Opus for all decision-making and analysis agents
- Sonnet for data collection and verification
- Use when: quota available, critical architecture/research decisions

**balanced** (default) - Smart allocation
- Opus for planning and deep analysis (where research judgment matters most)
- Sonnet for execution, surveying, and evaluation (follows explicit instructions)
- Haiku for read-only mapping and reporting
- Use when: normal R&D workflow, good balance of quality and cost

**budget** - Minimal Opus usage
- Sonnet for anything that requires judgment
- Haiku for data collection and reporting
- Use when: conserving quota, high-volume iteration, less critical phases

## R&D Agent Rationale

**Why Opus for grd-deep-diver (even in balanced)?**
Deep dives require critical analysis of papers, identifying discrepancies between paper claims and code, and assessing production viability. This is high-judgment work where model quality directly impacts research direction decisions.

**Why Opus for grd-product-owner (even in balanced)?**
Product-level planning requires understanding the full research landscape, setting realistic targets, and making strategic decisions about which approaches to pursue. Poor product planning compounds into wasted research cycles.

**Why Sonnet for grd-surveyor (in balanced)?**
Surveys follow a structured process: search for papers, extract key information, categorize methods. The output is primarily data collection and organization rather than deep reasoning. Sonnet handles this well.

**Why Sonnet for grd-feasibility-analyst (in balanced)?**
Feasibility analysis requires judgment but follows a structured checklist (compute requirements, licensing, dependencies). Sonnet can evaluate these dimensions systematically.

**Why Sonnet for grd-eval-planner (in balanced)?**
Eval plans are structured documents that reference BENCHMARKS.md and BASELINE.md. The planner needs to select appropriate tiers and thresholds, which Sonnet handles adequately.

**Why Haiku for grd-eval-reporter (in budget)?**
Eval reporters primarily collect numbers, compute deltas, and format tables. This is data aggregation with minimal reasoning required.

**Why Haiku for grd-baseline-assessor (in budget)?**
Baseline assessment runs evaluation commands and records numbers. It is a structured, repeatable process with no judgment calls.

**Why Sonnet for grd-code-reviewer (in balanced)?**
Code review requires checking plan compliance and code quality, but follows a structured two-stage process with clear criteria. Opus adds value only in quality profile where subtle research methodology mismatches matter. Haiku suffices in budget mode for straightforward checklist-style review.

## Resolution Logic

Orchestrators resolve model before spawning:

```
1. Read .planning/config.json
2. Get model_profile (default: "balanced")
3. Look up agent in table above
4. Pass model parameter to Task call
```

## Switching Profiles

Runtime: `/grd:set-profile <profile>`

Per-project default: Set in `.planning/config.json`:
```json
{
  "model_profile": "balanced"
}
```

## Cost Estimation

Approximate relative cost per full iteration cycle (plan + execute + verify + eval):

| Profile | Relative Cost | Best For |
|---------|--------------|----------|
| quality | 3x | Critical research decisions, novel approaches |
| balanced | 1x (baseline) | Normal R&D workflow |
| budget | 0.4x | High-volume iteration, well-understood problems |

**Tip:** Use `quality` profile for survey and deep-dive phases (research judgment critical), then switch to `balanced` for implement and evaluate phases (execution follows plan).
