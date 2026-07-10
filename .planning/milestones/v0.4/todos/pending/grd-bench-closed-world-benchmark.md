# GRD-Bench — closed-world autoresearch benchmark with deterministic grading

**Captured:** 2026-07-09
**Priority:** P0
**Source:** Competitive landscape 2026-07 (P5) — `.planning/research/competitive-landscape-2026-07.md`

## Problem

GRD has no published quality benchmark — the v0.4 roadmap itself flags that the 92.2%
singularity score is a "context number" while peers ship real metrics. AutoResearchClaw
released ARC-Bench (55-topic open-ended autonomous-research benchmark, per-topic
manifests + grading rubrics, on Hugging Face). DR3-Eval (arXiv 2604.14683) shows how to
make research-agent evaluation reproducible: a per-task **static sandbox corpus**
(evidential docs + confounders + ambient noise) instead of live-web retrieval.

## Solution

Build GRD-Bench: N research tasks, each with (a) a frozen corpus ingested via
`gd ingest` into a task-local Tesserae KG, (b) a task manifest (question,
metric/comparator/target, expected verdict), (c) network-off Docker sandbox, (d)
deterministic grading via the existing verdict machinery — no LLM judge. Optionally
score reports on DR3-Eval's five dimensions (recall, factual accuracy, citation
coverage, instruction following, depth) as an advisory layer. Publish results table
in README. This is GRD's answer to ARC-Bench, on GRD's differentiating terms
(closed-world, deterministic).

## Files

- New `bench/` or `lib/research/bench.ts` + task manifests
- `docs/` results page; README table
