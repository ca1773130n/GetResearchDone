# Vendor autoresearch-core into GRD — design & plan

**Date:** 2026-06-30 · **Branch:** `feat/vendor-autoresearch-core` · **Status:** approved

## Problem

`gd harness round` shells to `bin/harness_driver.py`, which imports
`autoresearch_core` — a separate PyPI package users must `pip install` manually
(version-locked to GRD). This is deployment friction and a recurring
version-mismatch bug source (the `>=0.4.7` crash Codex flagged).

## Decision

Vendor the package into GRD. It is pure-Python, **zero third-party deps**
(`dependencies = []`), 10 files / ~156 KB source, `requires-python >=3.11` —
trivially vendorable. Ship a copy inside the npm package; the driver uses an
installed copy **only if version-compatible**, else the vendored copy. This
removes the manual install and makes the version-lock automatic. `python3 >=3.11`
remains a prerequisite (bundling an interpreter is out of scope and not the pain).

## Components

1. **Vendored copy** — `bin/vendor/autoresearch_core/` (ships via `files: ["bin/"]`,
   which is recursive).
2. **Packaging hygiene** — `.npmignore` excluding `**/__pycache__` + `*.pyc` (also
   fixes a stray `bin/__pycache__/*.pyc` already being packed).
3. **`bin/harness_driver.py` `_import_core()`** — replaces today's
   try/except-then-exit. Precedence: (a) installed/editable `autoresearch_core` iff
   `__version__ >= REQUIRED`; (b) else the vendored copy (`sys.path.insert`, purge any
   stale `autoresearch_core` from `sys.modules`, re-import); (c) else a clear error.
   `REQUIRED = (0, 4, 7)`. `GRD_HARNESS_CORE=vendored` forces the vendored copy.
   Error messages change from "pip install autoresearch-core>=…" to "python3 >=3.11
   required".
4. **`lib/commands/harness.ts`** — update the two `python3 not found … autoresearch-core>=…`
   error strings to reflect python3-only prereq (kernel ships vendored).
5. **`scripts/sync-vendor.mjs`** — copy `<autoresearch-core>/autoresearch_core/` →
   `bin/vendor/`, strip `__pycache__`, assert copied `__version__ >= REQUIRED`. Run
   at GRD release time.
6. **Tests** — jest guard (vendored `__init__.py` present + `__version__ >= REQUIRED`;
   `.npmignore` excludes `__pycache__`); pytest (vendored fallback loads in a
   clean-env subprocess; a too-old installed version falls back to vendored; existing
   conformance tests stay green).
7. **Docs** — `commands/harness.md`, `CLAUDE.md`, `docs/CHANGELOG.md`,
   `docs/architecture/CONFIG.md`: reframe "install autoresearch-core" → "ships with
   GRD; `python3 >=3.11` is the only prereq; pip-install only to override for dev."

## Plan

- **P1 foundation** (done by orchestrator): vendor dir + `.npmignore` + spec.
- **P2 implement** (parallel, disjoint files): driver precedence + pytests · `harness.ts`
  strings · `sync-vendor.mjs` + jest guard · docs (non-`CLAUDE.md`).
- **P3 verify** (adversarial): full gate (lint/build:check/jest/pytest/`npm pack`) +
  prove the vendored fallback works end-to-end in a clean environment.
- **Integration**: orchestrator handles `CLAUDE.md` edits (hook-proof) + final gate + commit.

## Non-goals

Bundling a Python interpreter. Removing autoresearch-core from PyPI — it stays
published for external consumers and dev editable installs; vendoring is additive.

## Precedence decision

**installed-if-compatible-else-vendored** (vs always-vendored): preserves the dev
editable-install workflow and still gives end users zero-touch; `GRD_HARNESS_CORE=vendored`
forces the shipped copy. A stale installed copy is *rejected* (not crashed on) in
favour of vendored.
