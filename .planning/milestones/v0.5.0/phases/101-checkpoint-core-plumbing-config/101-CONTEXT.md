# Phase 101: Checkpoint Core Plumbing + Config — Context

**Gathered:** 2026-07-12
**Requirements:** REQ-194–198
**Research base:** .planning/milestones/v0.5.0/research/SUMMARY.md (schema, config shape, module name, transport, default-OFF already locked there)

## Phase Boundary

Foundation layer only: Checkpoint types (lib/types.ts), `lib/research/checkpoints.ts`
(emit/resolve/consumeAnswered, checkpoints.jsonl IO, injected checkpointHandler),
`research_gates.interactive` config + `readInteractiveConfig`, `resolveGates`/`defaultGates()`
default-OFF safety, `resume --answers <file|->` plumbing. Exit criterion: **zero behavior
change with default config**. Checkpoint UX at specific loop points is Phases 102–104;
panel fallback is 105.

## Implementation Decisions

### Release model & orchestrator wiring scope
- **v0.5.0 ships as ONE release** — intermediate phases exist on main between releases but
  are never published alone. Dormant code between phases is acceptable.
- **Hybrid churn strategy (locked):** Phase 101 ships the checkpoints module **standalone —
  zero emission call sites in orchestrator.ts**. Phase 102 establishes the emission-site
  pattern at the GATE-1/DESIGN site; Phases 103/104 copy that proven pattern. (Accepts that
  103/104 sequence after 102 — the roadmap already orders them that way.)

### `--interactive` flag semantics
- Primary callers: **both** the skill layer (auto-passes when a human drives) and terminal
  users. Design for both: simple default + optional granularity.
- **Bare `--interactive`** = one-shot `enabled: true` for this run, **honoring** saved
  per-point keys and bounds from `research_gates.interactive` (defaults: all four points on).
- **`--interactive=seed,design`** (optional value list) additionally overrides WHICH points
  fire this run. Config file remains the sole source of bounds (max_rounds, max_questions,
  hypothesis_candidates, fallback).
- **Add `--no-interactive`**: symmetric one-shot disable for unattended runs against a
  saved enabled=true config. `--no-gates` implies `--no-interactive` (auto-skip matrix).

### Config validation posture
- **Warn + clamp/default, per field.** Out-of-range numbers clamp to bounds
  (hypothesis_candidates → [1,5], max_rounds ≥ 1); unknown enum values → field default
  (fallback → "recommended"); wrong types → field default. Each emits ONE stderr warning
  naming the offending key. A typo never crashes a run and never silently disables
  steering. Matches emit-time posture (malformed checkpoint ⇒ log + proceed with defaults).

### Back-compat fixture strategy
- **Freeze real 0.4.16-generated threads**: produce with the actual 0.4.16 binary in a
  sandbox — one thread paused at the execute gate, one terminal (supported) — scrub
  machine-specific paths, check into tests/fixtures/. Fixtures are frozen artifacts, never
  regenerated. Test asserts pre-0.5.0 threads resume bit-identically through the new
  resume path.

## Claude's Discretion

- `resolveGates`/`defaultGates()` refactor internals — keep the exported API
  backward-compatible; single-source all gate defaults.
- checkpointHandler DI seam shape (mirror existing spawn/runner/fetchImpl injection style).
- checkpoints.jsonl IO details (append-only, mirrors ledger.jsonl conventions).
- Exact warning message wording; flag parsing details in cli.ts/grd-tools.ts.
- Jest per-file threshold value for checkpoints.ts (present from day one per REQ-195).

## Specific Ideas

- Caller-audit test (REQ-197) should enumerate the five runResearch/resumeResearch call
  sites (portfolio.ts, bench.ts, cli.ts, cli-kb.ts, index.ts) by grep-style discovery so a
  NEW sixth caller fails the test until it declares its interactive posture.
- Pin the new interactive keys off in `BENCH_WORKDIR_CONFIG` belt-and-braces (research R1).

## Deferred Ideas

- Per-point flag UX beyond the `=seed,design` list form (e.g. interactive profiles) — later
  milestone if demanded.
- TTY detection / live terminal prompting — explicitly out: pause + resume IS the
  mechanism; recommended defaults ARE the timeout (no wall-clock timers, by design).
- Regenerating back-compat fixtures per release — fixtures stay frozen at 0.4.16.
