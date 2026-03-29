---
phase: "99"
name: "Knowledge Injection Loop"
created: 2026-03-25
---

# Phase 99: Knowledge Injection Loop -- Context

Close the NERFIFY knowledge enhancement loop. selectTopEntries() in lib/knowledge.ts is exported but never consumed. This phase wires it into planning and execution prompts: grd-planner injects top-5 KNOWHOW entries relevant to the current phase before plan generation, grd-phase-researcher injects domain-relevant entries before research, grd-executor injects implementation-relevant patterns before code generation. Implements the knowhow_injection blocks referenced in agent markdown. Adds knowledge relevance scoring and validates compounding improvement across phases.
