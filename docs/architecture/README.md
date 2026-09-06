# GRD Architecture Documentation

Comprehensive audit of the GRD (Get Research Done) codebase produced post-`gsd-2-selective-adoption` milestone. Written in parallel by 10 specialized agents, each focused on a specific aspect of the system.

## What's in this directory

Nine reference documents plus this index:

| Document | Audience | Purpose | Size |
|---|---|---|---|
| [OVERVIEW.md](OVERVIEW.md) | Every new contributor | High-level mental model — 5-10 minute read | ~2,600 words |
| [MODULES.md](MODULES.md) | Engineers searching "which file does X?" | Per-file reference for every `lib/` module with purpose, exports, dependencies | ~4,100 words |
| [FLOWS.md](FLOWS.md) | Engineers tracing user commands | Call sequences for the key flows (`init`, `plan-phase` — incl. the v0.4.5 planning-time clarification gate, `execute-phase` — incl. the v0.6.0 falsified→DEAD-ENDS promotion step, `autopilot`, `harness round`, the v0.4.4 life-harness collective layer / `harness upstream`, and Flow 7a — the `gd research` station loop with its v0.6.0 `metric_absent` redesign branch and v0.5.0 interactive checkpoints); `gd evolve` flow retained as deprecated historical reference | ~4,800 words |
| [USE_CASES.md](USE_CASES.md) | Product / onboarding | Personas, scenarios, decision matrix | ~3,600 words |
| [RISKS.md](RISKS.md) | Maintainers doing triage | 14 findings (0 critical, 9 important, 3 minor, 4 observations) with file:line refs | ~3,100 words |
| [MAINTENANCE.md](MAINTENANCE.md) | Engineers adding features | 12 step-by-step procedures (add command, agent, backend, gate, config, etc.) | ~2,100 words |
| [API.md](API.md) | API consumers | Exported symbols across 38 `lib/` modules (~270 entries) | ~9,200 words |
| [CONFIG.md](CONFIG.md) | Users tuning behavior | Full `.planning/config.json` schema + agent frontmatter + env vars | ~3,700 words |
| [TESTING.md](TESTING.md) | Engineers writing tests | Test layout, helpers, coverage thresholds, CI considerations | ~1,600 words |
| [BACKENDS.md](BACKENDS.md) | Backend integration | Adapter interface, capability flags, adding a new backend | ~2,600 words |

**Total:** 10 files covering a `lib/` directory of 49 root modules plus 7 subdirectories (`cli/`, `commands/`, `context/`, `evolve/`, `research/`, `scan/`, `wireup/`), 139 unit and 27 integration test files, and the milestone specs under `docs/superpowers/specs/`.

## How to read this

**New contributor?** Start with [OVERVIEW.md](OVERVIEW.md), then skim [USE_CASES.md](USE_CASES.md) to understand what GRD does for users, then [FLOWS.md](FLOWS.md) for how the code flows.

**Debugging an issue?** Start with [RISKS.md](RISKS.md) to see if it's already known. Then [FLOWS.md](FLOWS.md) to trace the affected command and [MODULES.md](MODULES.md) to locate the relevant file.

**Adding a feature?** Read [MAINTENANCE.md](MAINTENANCE.md) for the relevant procedure (add command, agent, gate, etc.). Reference [API.md](API.md) for the exported symbols you'll work with and [CONFIG.md](CONFIG.md) for any new config fields.

**Tuning behavior?** [CONFIG.md](CONFIG.md) is the canonical reference for every config knob.

**Integrating with a new CLI backend?** [BACKENDS.md](BACKENDS.md) has the adapter interface and step-by-step.

**Writing tests?** [TESTING.md](TESTING.md) explains the layout, fixtures, and coverage policy.

## Top issues found by the audit

From [RISKS.md](RISKS.md), the three findings most worth addressing first:

1. **I2** — `lib/scheduler.ts:961–975` — uncleared SIGKILL escalation timers can terminate recycled PIDs after the tracked child exited.
2. **I1** — `lib/scheduler.ts:917` — orphan state object causes `markInFlight`/`markComplete` to silently no-op for the free-fallback backend.
3. **I5** — `lib/phase-complete.ts:134,140` — `.replace('.', '\\.')` only escapes the first dot, corrupting regex for multi-level phase numbers like `1.1.2`.

Zero critical-severity findings. The codebase is in good shape overall; most of the risks are edge cases that haven't shown up in practice but would compound in long-running or multi-account autopilot sessions.

## Key observations about the codebase

From the parallel-agent exploration:

- **`lib/mcp-server.ts` is the largest file at 3,292 lines** — exposes every GRD command as MCP tools over JSON-RPC 2.0. Highest-maintenance surface.
- **`lib/autopilot.ts` is 2,706 lines and still growing** — every recent spec landed code here. Candidate for extraction into `lib/autopilot-pipeline.ts`, `lib/autopilot-milestone.ts`, `lib/autopilot-waves.ts`.
- **Two parallel dispatch paths from a single CLI** — `classifyCommand()` in `lib/cli/index.ts` routes commands to either tool-path (deterministic) or agent-path (LLM-driven). The split is controlled by two static Sets.
- **`.planning/` is runtime state, not just documentation** — autopilot reads and writes `ROADMAP.md` and `STATE.md` as its primary coordination mechanism.
- **~85 config fields** across `GrdConfig`, `SchedulerConfig`, `SuperpowersConfig`, `CleanupConfig`, `DiscussionConfig`, `CeremonyConfig`, `HarnessConfig` (v0.4.4+; includes the Phase E `upstream_emit` / `upstream_root` / `upstream_ttl_days` collective-layer keys), `EvolveConfig` (deprecated v0.4.3), and agent frontmatter. The `research_gates` map gained `plan_clarification` (v0.4.5+, default on) — the planning-time clarification gate that resolves ambiguous design decisions via AskUserQuestion before `plan-phase` writes a plan — plus `interactive` (v0.5.0+, `enabled` default **off**: human checkpoints at SEED / HYPOTHESIZE / DESIGN / DECIDE with a `fallback` of `recommended` or `panel` so unattended runs never pause) and `auto_promote_falsified` (v0.6.0+, default **false**: phase-boundary promotion of falsified reflections into `.planning/DEAD-ENDS.md`).
- **No global coverage threshold in `jest.config.js`** — every `lib/` file has an explicit per-file threshold (35 entries). New files must register a threshold.
- **CI has 4 jobs** — lint, test-unit (with thresholds), test-integration (with relaxed thresholds), validate (`npm pack` smoke test). A separate `docs-check` job runs `gd scan --diff` on PRs.
- **7 backends exist in code** (claude, codex, gemini, opencode, overstory, superpowers, grd) but CLAUDE.md's capability table only lists the first 4 — a documentation gap noted in [BACKENDS.md](BACKENDS.md).
- **No `as any` casts found** — CLAUDE.md's "zero any" rule is being enforced consistently.
- **No silent `catch {}` blocks found** — error paths all have either logging or structured handling.

## Related reference material

Outside this directory:

- `CLAUDE.md` — project-level conventions and commands. Condensed.
- `docs/superpowers/specs/` — every spec written during development, including the `gsd-2-selective-adoption` milestone's 6 specs.
- `docs/superpowers/plans/` — implementation plans paired with the specs.
- `docs/CHANGELOG.md` — chronological change log.
- `agents/*.md` — agent definitions with frontmatter + prompt.
- `commands/*.md` — user-facing command documentation.
- `tests/unit/` and `tests/integration/` — test source, one file per `lib/` module.

## Maintenance

This documentation should be refreshed when:

- A new milestone ships (re-run the parallel-agent audit against the new state)
- A major refactor changes module boundaries (update MODULES.md + API.md)
- New backends or agents are added (update BACKENDS.md + CONFIG.md)
- A notable bug is discovered (add it to RISKS.md)
- New commands are added (update FLOWS.md + MAINTENANCE.md)

Regeneration is cheap: dispatch the 10 parallel agents again from the current `main` and collect their outputs. Each agent is scoped to its own file, so they don't conflict.

---

Generated 2026-04-12 as part of the post-`gsd-2-selective-adoption` maintenance pass. 10 agents worked in parallel over ~10 minutes of wall-clock time to produce the words above.

Behaviour docs (`OVERVIEW.md`, `FLOWS.md`, `USE_CASES.md`, this index) refreshed 2026-09-06 against
GRD 0.6.0, covering the 0.5.0 interactive research checkpoints and the 0.6.0 artifact-shaped gates.
The "Top issues" and "Key observations" sections above were not re-derived in that pass and still
carry their 2026-04-12 line numbers — treat them as pointers, not as current `file:line` refs.
