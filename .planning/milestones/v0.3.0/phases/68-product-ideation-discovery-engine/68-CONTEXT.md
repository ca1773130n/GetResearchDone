---
phase: "68"
name: "Product ideation discovery engine"
created: 2026-03-02
---

# Phase 68: Product ideation discovery engine — Context

The current evolve discovery engine only finds code-quality improvements (missing tests, long functions, TODO comments, empty catches, missing JSDoc, etc.). Even the 'new-features' and 'improve-features' dimensions are really just code hygiene — missing dry-run flags, missing validation, generic error messages. The Claude-powered discovery just scans source files for problems.

We need a completely new discovery pathway that thinks at the PRODUCT level:
1. Reads PROJECT.md, LONG-TERM-ROADMAP.md, product vision, user patterns, competitive landscape
2. Generates actual creative feature ideas (not code fixes) — things like new commands, new workflows, new integrations, new UX improvements
3. Scores and groups these product-level ideas alongside existing code-quality discoveries
4. Feeds into autoplan so infinite evolve can build REAL features, not just polish existing code

This should add a new dimension (e.g. 'product-ideation') or rework the existing 'new-features' dimension to actually generate novel feature proposals with business value. The Claude discovery prompt needs to be fundamentally different — it should think like a product manager, not a linter.
