# Changelog

All notable changes to GRD are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)

## [Unreleased]

### Added
- **Kernel contract conformance** (`tests/conformance/kernel-contract.json`,
  `docs/kernel-contract.md`). The `autoresearch-core` Python kernel (life-harness) and the
  `lib/research` TS loop (autoresearch) share a decision philosophy — deterministic verdict,
  execute/kg_write gates — but were implemented twice, with only **unenforced** "Parity with
  GRD …" docstrings. A single golden-fixture file now pins `compare` / `evaluateVerdict` /
  `resolveGates` / `checkGate`; both a Python suite (`tests/python/test_kernel_contract.py`)
  and a TS suite (`tests/unit/research/kernel-contract.test.ts`) assert against it, and a
  jest wrapper runs the Python side inside `npm test` (needs only python3≥3.11 via the
  vendored kernel). Neither language can silently drift. Intentional divergences (e.g.
  unknown-gate handling — kernel raises, TS proceeds) are documented, not asserted. No
  implementation changes: both engines already agreed on every case.

## [0.4.11] - 2026-07-05

### Changed
- **ultracode now reaches the plugin's plan/execute loop** (`commands/plan-phase.md`,
  `commands/execute-phase.md`). Previously ultracode only applied to `gd`/scheduler-driven
  commands (autopilot, research); the interactive `/grd:plan-phase` and
  `/grd:execute-phase` dispatch Claude Code subagents that never saw it. Now: **planning
  always dispatches the planner at `effort: xhigh`** (rising to `max` + an injected
  `ultracode` keyword under an explicit `ultracode`) on every `Task()` call — including the
  revision and clarification-resume dispatches; **execution auto-runs under ultracode**
  (injected `ultracode` keyword + `effort: max` + opus on every executor) when the phase
  spans **multiple waves** or `ultracode` is passed, letting Claude Code's native dynamic
  workflow self-manage effort. Both commands accept the bare `ultracode` keyword.
  (Multi-phase autopilot already applies ultracode via the scheduler.)

## [0.4.10] - 2026-07-05

### Fixed
- **Milestone-archival scoping** (`lib/phase.ts`): `milestone complete <version>` now
  archives only the completing milestone's phases from the shared `anonymous/phases`
  bucket. Scope is bound to the ROADMAP milestone version being completed; an
  indeterminate or mismatched scope archives **nothing** (never the whole bucket,
  which previously mis-filed/deleted unrelated milestones' live docs); and the scope is
  limited to the first unshipped ROADMAP section, so a multi-milestone roadmap can't
  leak a later milestone's phase dirs. (#57)
- **Prerelease milestone versions** (`lib/paths.ts`, `lib/roadmap.ts`): `currentMilestone`
  and the `computeSchedule` / `analyzeRoadmap` milestone regexes keep prerelease
  suffixes (`v1.0.0-beta`, `v2.3-rc.1`) instead of truncating at the `-`, matching the
  `phase.ts` fix — milestone identity is now consistent across every parser. (#58)

## [0.4.9] - 2026-07-04

### Fixed
- **ultracode now works via the Claude Code plugin's `/grd:*` slash commands**, not
  just the `gd` CLI. ultracode detection + the env carrier were wired only into
  `bin/gd.ts`; the slash commands route through `bin/grd-tools.ts`, which had no
  ultracode handling, so `/grd:autopilot ultracode` was a no-op. Added a shared
  `maybeApplyUltracode()` (`lib/ultracode.ts`) called in `grd-tools.ts` before
  dispatch — lighting up `ultracode` / `--ultracode` for **every** `/grd:*` command
  (autopilot, execute-phase, quick, research). The token is stripped so no command
  parser mis-reads it. `/grd:autopilot` now lists `ultracode` in its argument-hint.
- **Tesserae 0.13 compatibility** (`lib/research/tesserae.ts`): 0.13 flipped the
  `extract --extractor` default to `llm` (the configured provider), so a default
  `gd ingest` would silently switch to LLM extraction (cost + latency). GRD now
  pins `--extractor deterministic` **explicitly** when `research_tesserae_extractor`
  is unset — ingest stays fast/offline/byte-stable unless opted in, regardless of
  Tesserae's own default. (0.13.1's `sources add|list|remove` is `compile`-only — GRD
  uses `extract` with explicit paths, so it's unaffected.)

### Changed
- **autoresearch-core kernel is now vendored into the GRD package**
  (`bin/vendor/`), so `gd harness round` works with no manual `pip install` —
  Python 3.11+ is the only prerequisite. `bin/harness_driver.py` prefers a
  version-compatible **and complete** installed copy and falls back to the vendored
  one (a stale/broken install can never crash the round); `GRD_HARNESS_CORE=vendored`
  forces the vendored copy.
- **`research_tesserae_extractor`** gains the provider-agnostic 0.13 values `llm`
  and `selective-llm` (codex/claude/anthropic per Tesserae's `llm_provider`);
  `selective-llm` uses `--llm-include`/`--llm-limit`. Legacy `claude-cli` /
  `selective-claude` (Claude-only, `--claude-*`) remain accepted. The concept-poor
  `gd ingest` hint now nudges toward `research_tesserae_extractor: llm`.

## [0.4.8] - 2026-06-29

### Added
- **Tesserae 0.12 `--extractor` opt-in** (`lib/research/tesserae.ts`): a new
  `research_tesserae_extractor` config key (`deterministic` (default) | `claude-cli`
  | `selective-claude`) makes `gd ingest` build the LLM concept/claim layer the
  deterministic extractor leaves sparse. `selective-claude` also honours
  `research_tesserae_extract_include` / `research_tesserae_extract_limit`. Default
  stays deterministic, so there is no new LLM cost unless opted in. Requires
  tesserae ≥ 0.12, which hardens the LLM extractor (per-doc timeout fallback +
  retry on transient invalid generation). No breaking changes from Tesserae 0.12 —
  GRD never used the removed `projects activate` / `activate_project`.
- **Concept-poor ingest hint** (`lib/research/tesserae.ts`): after a deterministic
  `gd ingest`, GRD mirrors Tesserae 0.12's concept-poor check on the produced
  `graph.json` (≥20 nodes, zero concept/claim-layer nodes) and surfaces a hint to
  set `research_tesserae_extractor: claude-cli`. Best-effort — never blocks ingest.

## [0.4.7] - 2026-06-28

Autoresearch gap-fixes (see `docs/autoresearch-gap-analysis-2026-06.md`).

### Added
- **`research_sandbox: "auto"`** — `research_sandbox` now accepts `docker |
  subprocess | auto`, and `auto` is the unset default. It uses Docker when a
  usable binary is present, otherwise falls back to the subprocess runner **and
  prints a visible `UNSANDBOXED`-on-host warning** on that default path
  (previously the unset default was a silent subprocess). `lib/research/docker-runner.ts`.
- **`harness.distillation_max_age_days`** (integer; default off/unset): drops
  distilled `Runbook`/`Gotcha` evidence older than N days before a life-harness
  round selects evidence. `bin/harness_driver.py`.
- **Three off-control-path research primitives** in `lib/research/` — all
  advisory; none gate the verdict or the paper:
  - `verifyCitations(paperMd, bundle)` (`verify-citations.ts`) — deterministically
    resolves cited names/sources against the assembled bundle/KG and flags
    unresolved/likely-fabricated citations; advisory only, never blocks the paper.
  - `scoreReconstructability(...)` (`reconstructability.ts`) — cheap
    structural-completeness score (script present + non-empty, valid metric spec,
    recognized language, runner metadata) reported at FINALIZE, never gating.
  - `runBenchCalibration({ runner, ... })` (`bench-calibration.ts`) —
    smoke-calibrates the runner + verdict against one tiny RE-bench-style task.
- **Portfolio FDR + early-stop** (`portfolio.ts`): presentational `fdr_flag` on
  supported winners (Benjamini–Hochberg, only when entries carry a p-value);
  optional `stopOnFirstSupported` early-stop (default off).
- **Keyless local embeddings** (`embedder.ts`): supports a keyless
  OpenAI-compatible endpoint when `GRD_EMBED_URL` is set (empty `Authorization`).
- **Harness lineage**: `RoundRecord.parent_sha` (= the prior applied_sha),
  populated by `bin/harness_driver.py`.

### Changed
- **`embedder.ts`** now warns once on the no-key degrade instead of silently
  dropping semantic retrieval.

### Fixed
- **Tesserae 0.11.0 compatibility** (`lib/research/tesserae.ts`): research-corpus
  ingest now invokes `tesserae extract <paths>` — 0.11.0 retired the bare
  `tesserae <paths>` form ("bare extraction has moved → tesserae extract"). The
  `--distill` flag is dropped (now a project `compile`/`refresh` concern,
  unsupported by `extract`), fixing `gd ingest` and `research-kb-cli` integration.
- **VERSION** synced to match `package.json`/`.claude-plugin/plugin.json`, and two
  pre-existing `no-useless-assignment` lint errors cleared (`account-discovery.ts`,
  `commands/accounts.ts`).

## [0.4.6] - 2026-06-21

ultracode max-effort mode + codex 0.14x exec + Antigravity backend.

### Added
- **ultracode max-effort mode** (`lib/ultracode.ts`): `--ultracode` flag or a
  bare `ultracode` keyword on any agent command (`autopilot`, `execute-phase`,
  `quick`, `research`) forces best model + maximum reasoning effort. Carried via
  a `GRD_ULTRACODE`/`GRD_EFFORT=max` env that propagates through the whole
  process tree (outer agent + internal scheduler spawns), so it reaches deep
  autopilot-pipeline and autoresearch-loop spawns without per-command threading.
  Per backend: claude → `--effort max` + opus, plus the literal `ultracode`
  keyword injected into the prompt so Claude Code's native dynamic-workflow
  orchestration fires; codex → `model_reasoning_effort=xhigh` + gpt-5.5.
- **Antigravity backend** (Google's Antigravity CLI, the Gemini-CLI successor):
  binary `agy` (`brew install antigravity-cli`). Wired through the scheduler
  adapter, a `BACKEND_BINARY` id→binary map, availability probe, capabilities,
  and `ENV_VAR_MAP`. Verified end-to-end against agy 1.0.10. agy exposes no
  reasoning-effort or JSON flag, so ultracode there only sets the
  account-default model.
- `SpawnEffort` type and `SpawnOpts.{effort,ultracode}`.

### Changed
- **Codex adapter rewritten** to the 0.14x `codex exec` interface
  (`codex exec <prompt> --dangerously-bypass-approvals-and-sandbox --json -m … -c
  model_reasoning_effort=…`). The previous `codex --prompt … --approval-mode
  full-auto` form was removed upstream and no longer worked.

### Fixed
- Backend availability probe now resolves the real binary name via
  `BACKEND_BINARY`, so backends whose executable differs from their id (e.g.
  antigravity → `agy`) are detected correctly.

## [0.4.5] - 2026-06-14

autoresearch-core conformance + planning-time clarification + Tesserae 0.9.0 wiring.

### Added
- **Planning-time clarification gate** (`research_gates.plan_clarification`,
  default on): the planner raises a `TYPE: clarification` checkpoint for
  ambiguous, unlocked design/implementation decisions, and `plan-phase` surfaces
  them via `AskUserQuestion` (recommended default first), resuming the planner
  with answers as `## Decisions`. Bounded to 2 rounds, de-duped by question text,
  auto-skipped under `autonomous_mode`, autopilot, and `--candidates N>1`.
  Enriched `discuss-phase` intake taxonomy. Exposed in `gd settings`.
- **Tesserae 0.9.0 AgentRunbook memory**: the harness consumes distilled
  `Runbook` (procedures) and `Gotcha` (failure-mode) nodes as evidence (mapped to
  `takeaway`/`insight`, content prefixed `[runbook]`/`[gotcha]`; `Event` nodes
  skipped). GRD's `tesserae compile` passes `--distill`; enable population via
  `distillation.enabled` in the Tesserae project config.
- **Loud-failure diagnostic**: the harness empty-evidence skip and the research
  retriever's no-graph path now point at `tesserae config status`, surfacing the
  rate-limited/silent-extraction trap Tesserae 0.9.0 reports.

### Changed
- The harness round-port classes (`TesseraeFindings`, `AgentProposer`,
  `RepoEvaluator`, `GitApplier`, `FsRoundStore`, `CompositeFindings`) explicitly
  conform to autoresearch-core's `@runtime_checkable` port Protocols; the import
  guard now requires `autoresearch-core>=0.4.4`.

### Fixed
- Harness eval no longer crashes when `lint`/`tsc`/`jest` time out or the tool is
  missing; failures are caught and classified via autoresearch-core
  `classify_run_failure` (`[H2]`/`[H3]`/`[H4]`), with output tails preserved.
- Autopilot: worktree-safe PR merge + local-main reconcile after merge.
- Phase completion: header-aware Status-column stamping in the roadmap table.

## [0.4.4] - 2026-06-08

Life-harness collective layer + first real evidence-fed round.

### Added
- Life-harness Phase E (collective layer): downstream rounds emit
  GRD-referencing findings as upstream candidates
  (`$CLAUDE_PLUGIN_DATA/harness/upstream`, fallback `~/.grd/harness/upstream`);
  rounds in the upstream root (`harness.upstream_root: true`) consume them as
  extra evidence with cross-project occurrence counting.
  `gd harness upstream list|clear`. Config: `harness.upstream_emit` (default
  on), `harness.upstream_root`, `harness.upstream_ttl_days` (90).

### Fixed
- The first live round surfaced three driver bugs, all fixed:
  - `TesseraeFindings` now matches `SessionTODO` (Tesserae mints the kind
    all-caps) and reads a finding's date from `metadata.first_seen_at` — the
    driver sees all 6 finding kinds with dates for recency ranking.
  - The evidence `since` cursor and interval guard advance only on rounds
    that consumed evidence; a skipped round no longer hides the (back-dated)
    finding backlog from the next round.
  - `Applier.apply` stages only the patch's entry paths, not the proposer
    scaffolding (evidence.md / patch.json / INSTRUCTIONS.md) it writes into
    the worktree.

## [0.4.3] - 2026-06-07

The life-harness: evidence-driven self-improvement replaces `gd evolve`.

### Added

- **`gd harness round [--auto|--dry-run|--full-eval]`** — one life-harness
  round: gather Tesserae Session findings (takeaways/decisions/insights
  compiled from real sessions), have a spawned agent propose ONE focused
  patch to GRD's primitives (commands/agents/skill markdown,
  `.planning/config.json`, `lib/**`), eval-gate it (frontmatter/JSON
  structural checks; lint + tsc + jest when code is touched), and land it
  as a single git commit on `harness/round-<id>`. Review mode by default —
  the branch waits for a human merge; `--auto` applies only when eval is
  green and confidence clears the configured floor. `gd harness status` /
  `gd harness revert <round-id>` complete the surface.
- **`harness` config block** (`.planning/config.json`): `autonomy`
  (review|auto), `kill_switch`, `min_confidence`, `min_interval_hours`,
  `allowed_targets`, `backend`, `min/max_evidence`.
- Round records persist under `.planning/harness/rounds/<id>/`
  (evidence.md, patch.json, eval.json, RECORD.json); deterministic
  rejections enter a dedupe set so refuted patches are never re-proposed.
- The round decision logic is pure and lives in the
  **`autoresearch-core>=0.4.3`** Python package (version-locked to GRD
  from this release on): path guards, self-protection deny-list (a round
  cannot patch its own driver or harness config), apply gate, dedupe.
  Driver: `bin/harness_driver.py` (requires Python 3.11+).

### Deprecated

- **`gd evolve`** no longer runs: static-scan discovery saturated (its
  dimensions were 100% false positives for 5+ consecutive iterations).
  It prints a pointer to `gd harness round` and exits 1. Read-only
  introspection subcommands keep working; `lib/evolve/` stays in-tree
  for `gd singularity` history.

## [0.4.2] - 2026-05-25

Harness installer + npm distribution. First release published to npm
(scoped) and the first to carry `gd install`.

### Added

- **`gd install <harness>`** — register GRD's MCP server (grd-mcp-server)
  into the AI coding harnesses GRD targets. Every supported backend
  advertises MCP, so MCP registration is the universal integration
  point. `gd install <harness…>` / `--all` / `--list` / `--dry-run`.
  Supports claude / codex / gemini / opencode, each written in its
  native schema (claude/gemini `mcpServers`, codex TOML
  `[mcp_servers.grd]`, opencode `mcp` with `type:local`). Home dirs
  honor CODEX_HOME / GEMINI_CLI_HOME / OPENCODE_CONFIG_DIR /
  CLAUDE_CONFIG_DIR. Idempotent and non-clobbering; the server runs as
  `node <abs grd-mcp-server.js>` so it works for local checkouts and
  global npm installs alike.

### Changed

- **npm package name is now `@jokerized/getresearchdone`** (scoped).
  npm's similarity filter rejected the unscoped names (`grd-tools` ~
  grpc-tools/rc-tools; `getresearchdone` ~ get-research-done). Install:
  `npm i -g @jokerized/getresearchdone`. Bin commands are unchanged:
  `gd`, `grd-tools`, `grd-mcp-server`.

### Fixed

- Release pipeline made reliable: `prepublishOnly` rebuilds `dist/`;
  the release gate verifies tests pass without re-enforcing per-file
  coverage (CI-runner skips suites needing absent binaries); release
  notes use a flag-based awk (a naive range matched the header against
  both range bounds and produced empty notes); `.claude-plugin/plugin.json`
  version is now test-pinned to VERSION (it had drifted to 0.3.28);
  workflow reads `docs/CHANGELOG.md` (not a nonexistent root path).
- HarnessSync / AI-tool artifacts (config.toml, opencode.json, .agents/,
  .cline/, .codeium/, .gemini/, .rules, .github/copilot-instructions.md,
  .github/prompts/) and the transient `.planning/autopilot/autopilot.log`
  are gitignored.

## [0.4.1] - 2026-05-25

Completes the v0.4 milestone with phase 5 (deterministic pattern
extractor) and brings the internal benchmark to the v0.5 promotion-gate
floor. Per-phase codex code review continued: the Phase 5 statistical
core (binomial test, Benjamini-Hochberg FDR) was independently executed
against reference values and confirmed exact; two P2s were fixed.

### Added

- **`gd patterns`** — deterministic pattern extractor. Scans
  VERIFICATION.md `<reflection>` verdicts, computes per-token statistics
  over each plan's vocabulary, and *suggests* heuristics that clear a
  statistical floor: appears in ≥10 plans, effect size ≥0.20, raw
  two-sided binomial p<0.05, AND Benjamini-Hochberg FDR q<0.10. The
  synthetic-null-corpus test confirms ≤1 false positive across 10 runs
  of random verdicts. Flags: `--dry-run` (default), `--apply` (requires
  `--yes`), `--min-occurrences`, `--effect-size`, `--fdr-q`. No LLM on
  the read or write path.
- **Suggestion/prescription separation** — `gd patterns` writes ONLY to
  `.planning/GENOME-SUGGESTIONS.md` (a separate file), NEVER GENOME.md.
  The planner contract (`agents/grd-planner.md`) now explicitly forbids
  reading GENOME-SUGGESTIONS.md. `gd genome promote-suggestion <slug>`
  is the sole human-curated path from advisory suggestion to
  prescriptive heuristic.
- **8 internal-benchmark fixtures** (`tests/benchmark/tasks/`, 8 → 16),
  meeting the v0.5 gate's ≥16-task floor. Ported from this milestone's
  per-phase codex reviews — real bugs with known fixes (verification-exec
  allowlist, effort-knob fallback, slug word-boundary, fail-closed
  parser, BH-FDR order, settings routing, hard-fail-before-cluster,
  PLAN.md overwrite guard).

### Fixed

- `gd patterns` baseline non-independence documented as a caveat
  (approximate association signal, not a calibrated p-value; suitable
  for a human-reviewed suggester). `promote-suggestion` now picks the
  latest run for a repeated slug and matches the slug exactly (codex P2).
- Benchmark task fixtures excluded from the jest test run (they are
  sandbox-only; jest was collecting two as project tests).

## [0.4.0] - 2026-05-24

Multi-candidate plan generation + deterministic selection. Replaces
single-plan dispatch with a generate→dedup→score→promote loop, gated
on deterministic axes only — zero LLM-judged scoring on the execution
path (GENOME heuristic). Phases 1-4 of the v0.4 milestone; phase 5
(pattern extractor) ships as v0.4.1.

Design converged through 9 rounds of codex adversarial review on the
specs (`v0.4.0-design` tag) plus per-phase code review. The
`gd plan-lint` spec-consistency linter (added below) automates the
deterministic fraction of that review.

### Added

- **`effort` config axis** — orthogonal to `model_profile` /
  `token_profile`. Values `thrifty | balanced | deep` scale the v0.4
  knob `candidates_per_plan_phase` (1 / 3 / 7). Set via
  `gd settings effort <value>`. `resolveEffortKnob` + `EFFORT_PROFILES`
  are structured to add more knobs in v0.5+ without an API change.
- **`gd plan-candidates <N> --candidates K`** — parses marker-fenced
  planner output (`<<<PLAN-i>>>…<<</PLAN-i>>>`) and writes
  `PLAN-1.md … PLAN-K.md` atomically. Fail-closed on count mismatch /
  nested / unclosed / duplicate / missing-index (no files written,
  exit 1) unless `--allow-partial-candidates`. Default K from the
  effort knob.
- **`gd select-candidate <N>`** — deterministic selector. Extends the
  v0.3.x `_scorePlan` with four axes: must_haves coverage, DEAD-ENDS
  hard-fail (slug citation OR curated `forbidden_terms`; Jaccard is
  advisory only), `verification_commands` (opt-in, allowlisted,
  shell-free), and a cost tiebreaker. Promotes the winner to `PLAN.md`
  and writes a `PLAN-SELECTION.json` audit trail. `--dry-run`,
  `--force`, `--run-verification-commands`.
- **Proximity dedup** — `clusterByJaccard` (single-link agglomerative)
  collapses near-identical candidates before scoring; one
  representative per cluster. Runs AFTER DEAD-ENDS hard-fail so a
  violator can never eliminate an innocent near-duplicate sibling.
- **`gd plan-lint <milestone>`** — deterministic spec-consistency
  linter detecting four drift categories (stale-text, over-promise,
  summary-vs-detail, scope-creep) across a milestone's ROADMAP.md +
  PLAN.md files. Built from the taxonomy the 9 codex rounds produced.
- **DEAD-ENDS `forbidden_terms`** — schema field carrying the curated
  mechanism phrases that confess a dead end; all 6 entries backfilled.

### Changed

- Autopilot detects multi-candidate phases and runs the selector
  inline (score → dedup → promote) before executing.

### Fixed

- Benchmark task fixtures (`tests/benchmark/tasks/**`) excluded from
  `tsc` — sandbox-only fixtures were breaking project type-check.

## [0.3.28] - 2026-05-24

Positioning + benchmarking release. No new runtime features for the core
agent loop; this release ships the artifacts the autoresearch
reality-check called out as missing.

### Added

- **`gd singularity`** — new deterministic CLI command measuring what
  fraction of LOC in a window was authored by `gd evolve`. Default
  window = most-recent-tag..HEAD; flags `--since <ref>`, `--all`,
  `--by-iteration`, `--raw`. Inspired by Aider's "Singularity %".
  Current Singularity on `v0.3.24..HEAD`: **92.2%**.
- **Ouroboros loop technical report** — `docs/ouroboros-loop.md`,
  11-section paper-style writeup suitable for arXiv preprint
  (cs.SE / cs.AI). Covers the four primitives (falsifiable
  reflections, DEAD-ENDS, drift, GENOME), the closed loop, codex-
  rescue validation methodology (47 review rounds), limitations,
  related work (Reflexion, SWE-agent, Sakana, STORM, Voyager).
- **Domain starter templates** — `templates/starters/{ml-train,
  fastapi-service, cli-tool}/` with PROJECT.md + ROADMAP.md scaffolds
  tailored to common R&D project shapes.
- **Internal benchmark spec + 8 task fixtures** —
  `docs/benchmark/INTERNAL-BENCH.md` defines 30 tasks across 5
  buckets; `tests/benchmark/tasks/` ships the first 8 (4 refactor +
  3 bug-fix + 1 feature-add), each ported from real codex-rescue
  history. `scripts/run-internal-bench.mjs` supports smoke mode and
  agent-driven mode (`--agent claude|aider|codex` or
  `--agent-cmd '<template>'`).
- **Single-page demo viewer** — `docs/demo/index.html`, zero infra,
  hostable on GitHub Pages or Vercel without a build step.

### Changed

- **`gd --help` reorganized.** New "Hero verbs" section at the top
  surfaces the 9 closed-loop verbs (init, plan-phase, execute-phase,
  verify-phase, autopilot, evolve, health, think, singularity).
  Auxiliary commands listed by name only.
- **README rewritten.** Top-line is now the hero output statement
  ("turns a research idea into a working, falsifiable feature — and
  remembers what didn't work") plus Singularity + Ouroboros paper
  badges. Four-primitive table replaces the prior bulleted feature
  list.

### Deprecated

Seven commands now emit stderr deprecation warnings; scheduled for
removal in v0.4.0. See `docs/DEPRECATIONS.md` for the full v0.4.x
trim plan (9 hero verbs + 30 demoted to `gd-tools` + 7 removed):

- `gd dashboard` → use `gd health` + `gd think`
- `gd health-check` → subset of `gd health`
- `gd coverage-report` → use `npx jest --coverage` directly
- `gd phase-time-budget` → subsumed by `gd estimate-phase`
- `gd todo-duplicates` → one-off helper; rarely used
- `gd markdown-split` → internal infrastructure exposed by accident
- `gd setup` → `gd init` does this

## [0.3.27] - 2026-05-24

### Fixed (codex-rescue r43–r47 — feature wiring audit)

Comprehensive feature-wiring audit found that several Ouroboros /
NERFIFY subsystems were *defined* but not *invoked* end-to-end. r43–
r47 closed every flagged gap. Codex r47: "all clean".

**NERFIFY closed-loop refinement (`lib/refinement.ts`,
`lib/autopilot-pipeline.ts`)**

- Metrics: `_measureMetrics` now runs **real** `npx jest --coverage`,
  `npx tsc --noEmit`, `npx eslint bin/ lib/` via `spawnSync`. The
  prior implementation sent the literal strings `"npm test"`/
  `"tsc"`/`"eslint"` to `claude -p` and regexed the LLM's prose
  reply, silently producing `0% coverage / 0 errors / 0 lint`.
- Worktree: `runRefinementLoop` accepts `workCwd` and runs
  measurements + critique inside `wtPath`, so edits land in the
  same branch the post-pipeline merges.
- Convergence: `checkConvergence` now returns
  `no progress (all metrics zero — measurement path likely broken)`
  instead of "all dimensions within epsilon" when both snapshots
  are all zeros.
- Regression guard: snapshot HEAD → run critique → re-measure → if
  coverage drops or error counts rise, `git reset --hard <head>`
  in the worktree and log `iteration-N-rolled-back`.
- Critique agent: dispatch metadata uses `agentType:
  'grd-critique-agent'` (was `grd-verifier`), with profile rows
  added to `MODEL_PROFILES` and `EFFORT_PROFILES`. The agent's
  markdown file (`agents/grd-critique-agent.md`) is now read into
  the prompt under `<agent-definition>` so its constraints and
  output schema actually reach the subprocess.
- Status: config-disabled skip now writes `skipped-disabled` marker
  (was silent).

**Plan-phase Ouroboros context injection (`commands/plan-phase.md`)**

- `DEAD_ENDS_MD`, `GENOME_MD`, `PRIOR_REFLECTIONS` are now extracted
  from the INIT JSON alongside the other context keys and injected
  into the planner prompt's `<planning_context>` block with explicit
  guidance:
  - Prior Reflections: "If verdict is falsified, refuse to re-propose"
  - Dead Ends Registry: "hard do-not-propose list"
  - Strategy Genome: "use heuristics to inform plan choices"
- Previously: `cmdInitPlanPhase` loaded all three into context, the
  planner agent docs documented them, but the orchestrator skill
  never piped them into the prompt — so the planner never saw any
  of it on real `/grd:plan-phase` runs.

**Benchmark report (`lib/commands/analysis.ts`,
`lib/context/research.ts`)**

- `cmdBenchmarkReport` now evaluates each corpus entry via
  `evaluateEntry()` then passes `(results, entries)` to
  `formatBenchmarkReport()`. Previously passed entries-only,
  crashing on `undefined.semantic` at runtime.
- Same fix applied to the sibling caller in eval-reporter init
  (`lib/context/research.ts`).

**Spin detector (`lib/scheduler.ts`, `lib/autopilot.ts`)**

- Live detection: rolling window of the last 5 stdout chunks scanned
  by `detectSpin` every 5 chunks during streaming. On detection,
  subprocess killed via SIGTERM and `liveSpinEvent` attached to the
  result. Previously only ran in the `close` handler, so an
  actively-spinning subprocess ran until total timeout.
- Spin-kill exit semantics: `code === null` from SIGTERM now maps
  to `exitCode: 1` when `liveSpinEvent` is set, so autopilot
  doesn't advance past a killed plan/execute step. Previously
  killed steps reported success.
- Wireup: new `_handleSpinIfDetected(cwd, phaseNum, result)` helper
  invoked from the plan and execute `scheduler.spawn` callsites in
  `autopilot.ts`. Previously only `spawnStep` (post-pipeline) wrote
  SPIN-REPORT.md — main autopilot dispatches dropped the event.

## [0.3.26] - 2026-05-21

### Fixed (codex-rescue r27–r41 — verify.ts SUMMARY commit-hash detection)

15 rounds of `codex exec review --base v0.3.25` against the
verify-summary commit-hash extractor, after r1–r26 hardened
everything else. Codex r42 returns clean.

The new extractor only collects hex tokens from commit contexts (no
more whole-document hash scan that false-failed on checksums / cache
keys / artifact IDs). Supported formats now include:

- Labelled lines: `Commit: <sha>`, `**Commits:**`, `- **Commits:** a, b`
- Colonless: `Commit <sha>`, `Commits a68da32, deadbee exist`,
  including backticked hashes (`` `8880489` ``)
- `/commit/<sha>` hyperlinks
- `## Commits`, `## Task Commits`, `### Commits` headings (with
  nested subheadings included until a sibling/shallower heading)
- Task-heading paren-suffix: `### Task 1: add parser (deadbee)`
- Checked-task paren-suffix: `- [x] Task X completed (abc1234)`
- Markdown commit-column tables (with or without trailing pipe;
  indented inside lists; commit-column-only scan, not whole row)
- Word boundaries everywhere so `Hash: <sha256>` isn't truncated to
  the first 40 chars and validated as a commit

### Fixed (other r27 codex findings)

- **eval-diff.ts**: zero-baseline metrics no longer report
  `unchanged` for nonzero deltas. `0 → 5` shows as `regressed`
  (or `improved` for lower-is-better), with sentinel `±999.99%`
  for display + sort so changes don't get buried at 0%.
- **utils.ts CONFIG_DRIFT_KEYS**: `drift` fix command now suggests
  `{weights: {goal:0.5, constraint:0.3, ontology:0.2}, threshold:0.3}`
  to match `lib/drift.ts` `DEFAULT_WEIGHTS` runtime fallback —
  applying the fix command no longer silently changes drift scoring
  semantics.

## [0.3.25] - 2026-05-20

### Added (Autonomous evolve loop — iters 3-10)

10 autonomous evolve iterations against v0.3.24 added ~19 new CLI
commands (all wired into both `bin/grd-tools.ts` and the public `gd`
CLI router via `lib/cli/index.ts`):

- **Phase forensics & planning**
  - `gd diagnose <N>` — phase failure post-mortem reading
    `<N>-VERIFICATION.md` (prefixed and bare forms)
  - `gd budget <N>`, `gd estimate <N>`, `gd estimate-phase <N>` —
    token + cost forecast per plan agent (counts both markdown
    checkboxes and `<task>` XML blocks)
  - `gd blame <N>` — map phase-range commits to plan tasks
  - `gd impact <N>` — BFS the phase dep graph from explicit
    `Depends on: Phase M` declarations plus sequential fallback
  - `gd deps`, `gd deps-risk`, `gd check-plans`,
    `gd check-assumptions`, `gd freshness [<N>]`, `gd rollback <N>`,
    `gd forecast-phase <N>`
- **Eval + research diffs**
  - `gd eval diff <A> <B>` (and `gd eval diff <A> latest`) —
    side-by-side metric deltas with lower-is-better direction
    inversion for latency/error/duration metrics
  - `gd research-gaps` — citation gap report across milestone +
    prefixed plan files
- **Knowledge maintenance**
  - `gd knowhow rank "<query>"` (TF-IDF), `gd knowhow audit`,
    `gd knowhow dedup`, `gd knowhow aggregate`,
    `gd knowledge search "<query>"`, `gd import-knowhow <src>`
  - All scan canonical KNOWHOW locations
    (`.planning/KNOWHOW.md`, `milestones/*/KNOWHOW.md`,
    `milestones/*/research/KNOWHOW.md`, and per-phase
    `phases/*/KNOWHOW.md`)
- **Live monitoring**
  - `gd tail [-f]` and `gd watch` — both streamed via inherited
    stdio so `--follow` mode no longer hangs in the CLI wrapper
- **Imports**
  - `gd export-research` / `gd import-research` —
    `.planning/research/` bundle pack/unpack with archive
    pre-validation (list entries via `tar -tzf`, reject absolute
    paths + `..` segments + symlinks before extraction). Staging
    dir is cleared before each extraction so stale prior-run
    files don't leak in.
  - `gd import-knowledge` — `--dry-run` is truly side-effect free
    (no mkdir, no destExists-blocked previews)

### Added (autopilot reliability)

- **Spin detector**: scheduler now runs bigram-Jaccard similarity
  detection on captured stdout when buffer > 500 bytes, attaches a
  `SpinDetectedEvent` to `SchedulerSpawnResult`, and
  `autopilot-pipeline.spawnStep` writes a per-phase `SPIN-REPORT.md`
  (resolved via `findPhaseInternal` from `workItemId`) to the
  durable project tree, not the soon-to-be-deleted worktree.

### Changed

- **`evolve.auto_genome_snapshot`** is now also honored by
  `runInfiniteEvolve` (was wired through one path; now both paths
  emit a deterministic snapshot at end of cycle).
- **Scheduler `opts.timeout: 0`** is now treated as "unlimited"
  (`null` total timer) instead of being coerced to the 2-hour
  default. `autoresearch` passes `0` explicitly on `--time-budget 0`
  so survey / experiment / deep-dive spawns can run unbounded.
- **`loadConfig`** passes `research_staleness_days` and `survey`
  through (were silently dropped), so `gd health`'s
  `STALE_RESEARCH` blocker and `gd progress`'s research-freshness
  warning respect configured thresholds.
- **`cmdVerifySummary`** now requires *every* referenced commit
  hash to resolve (was sampling 3 and passing if any one resolved),
  catching partial-failure cases.
- **`computeParallelGroups` + `_resolveLatestTwoPhases`** sort
  numerically by leading digits so `100-...` no longer collates
  before `99-...`.

### Fixed

The autonomous-evolve batch landed with project-convention bugs that
26 rounds of `codex exec review` flagged and the same codex pass
recommended fixes for. Highlights:

- **path traversal in `gd import-research` (P1)** — bundle import
  now resolves manifest entries against the staging + destination
  dirs and rejects anything that escapes either, plus rejects
  symlinks via `lstat`/`isFile()`. Archive entries are also
  pre-validated before `tar -xzf`.
- **phase-id resolution** — `gd budget`, `gd blame`, `gd freshness`,
  `gd check-plans`, `gd diagnose`, `gd estimate-phase`,
  `gd forecast-phase`, `gd deps-risk` all route phase args through
  `findPhaseInternal` (or padded resolution) so `gd budget 1`
  matches `phases/01-test/`.
- **prefixed artifact filenames** — every new command that reads
  PLAN/SUMMARY/VERIFICATION/EVAL/RESEARCH/LANDSCAPE/KNOWHOW now
  accepts both bare and `<N>-` prefixed forms.
- **CI Jest 30 flag** — `--testPathPattern` → `--testPathPatterns`
  in `.github/workflows/ci.yml`. Every CI run since the Jest 30
  upgrade had been failing.
- **`gd settings` drift-fix suggestions** — `gd health`'s
  config-drift remediation now emits `gd config-set <key> <value>`
  for keys that `gd settings` doesn't accept (autonomous_mode,
  branching_strategy, scheduler.*, drift, autopilot).
- **`gd execute-phase <N> --dry-run`** — now routes to the tool
  preview handler instead of the agent execute path
  (`bin/gd.ts` override on `--dry-run`).
- **`gd eval diff <padded> latest`** — phase ids are compared
  numerically when deciding whether `latest` resolved to the same
  phase as the explicit side; `05` no longer collapses to `5` and
  vice-versa.
- **lower-is-better metrics in `gd eval diff`** — latency/error/
  duration/memory/cost metric increases are now reported as
  regressions (with snake-case awareness so `response_time` is
  matched the same as `response time`).
- **knowhow_block injection at phase start** — `lib/context/agents.ts`
  scans all canonical KNOWHOW locations so the relevance-ranked
  block is no longer silently null on real projects.

### Ported from PR #25

- **`lib/invariants.ts`**: segment-based `..` check
  (`filePath.split('/').includes('..')`) so legitimate filenames
  like `file..backup.ts` aren't flagged; basename-based extension
  check so paths like `config.d/Makefile` are correctly warned
  about. Stale PR #25 closed with reference to this commit.

## [0.3.24] - 2026-05-18

### Added (Ouroboros integration — agentic self-monitoring and self-improvement)

The full plan and provenance are in `.planning/research/ouroboros-integration.md`.
Pattern set adopted from the Q00 / Kargatharaakash / razzant / TomzxCode
"Ouroboros" projects; every PR was independently reviewed by `codex exec
review` before merge.

- **Reflection loop with hypothesis / predicted_outcome** (PR #30) — planner
  emits a `<reflection>` YAML block with `hypothesis`, `predicted_outcome`,
  and verifier-fillable `actual_outcome` + `verdict` fields. Verifier
  reconciles outcome and emits a falsifiable verdict per phase.
- **Verifier Evidence Standard** (PR #31) — `agents/grd-verifier.md` now
  requires evidence per claim (command + exit code + observable artifact)
  before VERIFICATION.md can mark a phase passing.
- **`gd-tools verify mechanical`** (PR #32) — single CLI bundle that runs
  the four PLAN.md mechanical checks (frontmatter, artifacts, exports,
  content constraints) in one shot. Replaces ad-hoc verify-* chains in
  agent prompts. Fails fast on phases with zero PLAN.md files.
- **Planner reads prior phase reflections** (PR #33) — `plan-phase`
  context now injects the latest `<reflection>` blocks across completed
  phases so the planner can avoid re-validating falsified hypotheses.
  Phase IDs compared component-wise (`01.10 > 01.9`).
- **Verify-fail retry escalates to a stronger model** (PR #34) — when a
  phase verifier returns `verdict: falsified`, the retry runs against
  the next tier up in the backend's effort profile.
- **`DEAD-ENDS.md` registry — read path** (PR #35) — planner reads
  `.planning/DEAD-ENDS.md` and refuses to re-propose approaches recorded
  there. Schema documented in `agents/grd-planner.md` `<dead-ends>` block.
- **`gd-tools dead-end add`** (PR #36) — write path for the DEAD-ENDS
  registry. YAML scalars are escaped for round-trip safety.
- **`gd-tools dead-end promote-from-phase`** (PR #37) — auto-promotes
  every `verdict: falsified` Reflection in a phase's VERIFICATION.md to
  a DEAD-ENDS entry. Honours `--phase` for one-shot promotion.
- **Project drift score** (PR #38) — `gd health` now reports a weighted
  drift score across goal / constraint / ontology dimensions, sourced
  from real artifacts (PROJECT.md goal, REQUIREMENTS.md must_haves,
  SUMMARY.md patterns-established). Configurable via the new `drift`
  block in `.planning/config.json` (weights + threshold). `drift` is
  in `KNOWN_CONFIG_KEYS` so it survives `loadConfig`.
- **`GENOME.md` strategy snapshot — read path** (PR #39) — planner reads
  `.planning/GENOME.md` (project-scoped meta-strategy) before composing
  PLAN.md. Schema in `agents/grd-planner.md` `<genome>` block.
- **Ontology-similarity convergence** (PR #40) — autopilot detects when
  successive phases converge on the same ontology (similarity ≥ threshold)
  and terminates gracefully instead of looping. Convergence is a separate
  status (`converged_at` / status `converged`) from failure
  (`stopped_at` / status `failed`), propagated through autopilot →
  multi-milestone → evolve → cycles_completed.
- **Plan tournament** (PR #41) — `gd-tools plan-tournament score`
  evaluates multiple candidate PLAN.md files against the phase's roadmap
  goal and selects the highest-scoring one. Padded decimal phase IDs
  (`0*N\.0*M`) handled in both drift and tournament scoring. Path
  containment uses `path.relative` (not prefix).
- **`gd-tools think`** (PR #42) — one-shot project-state briefing.
  Aggregates active phase, recent verdicts, drift score, dead-ends, and
  open todos into a single context block. `--limit` argument strictly
  validated.
- **`gd-tools genome init / show / snapshot`** (PR #43) — write path for
  GENOME.md. `init` drops a starter template; `show` reads the current
  file (reassembling split-index via `safeReadMarkdown`); `snapshot`
  appends a dated `## Snapshot YYYY-MM-DD` section with current
  completed-phase count, drift score, dead-ends count, and verdict mix.
  Refuses to write into a split-index stub (would never reach planner
  context). Rollback policy: snapshots are append-only — `git revert`.
- **`evolve.auto_genome_snapshot`** (PR #44) — opt-in config flag
  (default `false`). When `true`, `runInfiniteEvolve` calls the new
  `runGenomeSnapshot` pure helper after each cycle that ends with
  status `completed` or `converged`. Failures (split-index or otherwise)
  are logged but never block the loop. New `GenomeSplitIndexError`
  sentinel for non-CLI callers.

### Changed

- **`lib/autopilot.ts` decomposed into 4 modules** — 2,702 lines split
  into orchestrator (`lib/autopilot.ts`, ~1,564 lines after extraction)
  + `lib/autopilot-pipeline.ts` (per-phase plan/execute/verify/post-pipeline/
  finalize sequence, ~990 lines) + `lib/autopilot-waves.ts` (wave splitting
  + write-intent locks + merge queue, ~361 lines) + `lib/autopilot-milestone.ts`
  (multi-milestone loop helpers, ~136 lines). Pure restructure — zero
  behavior changes. All 4,240 tests pass unchanged. External consumers
  continue importing from `./autopilot` via re-exports. Resolves audit
  finding O1 from `docs/architecture/RISKS.md`.

### Added

- **Scheduler idle watchdog (Spec 2B)** — new
  `SchedulerConfig.idle_timeout_seconds` (default 900) kills spawned
  backend subprocesses that produce no stdout/stderr data for the
  configured duration. Distinct from `opts.timeout` (total timeout);
  the idle watchdog only fires on complete silence, so legitimate
  streaming inference is unaffected. On trip: SIGTERM → 5-second
  grace → SIGKILL. New `idleTimedOut: boolean` flag on
  `SchedulerSpawnResult`.
- **`lib/scheduler.ts` `_spawnWithRetry` rewrite** — replaces
  `execFile` with `spawn` + manual stdout/stderr buffering, preserving
  50MB maxBuffer semantics and all other behaviors (rate-limit
  detection, token parsing, sample recording, persistence).
- **Prompt injection scanner** — new `gd scan` CLI subcommand (`gd scan`, `gd scan --diff`, `gd scan --file`, `gd scan --all`) detects 18 prompt injection patterns across 7 categories in bundled markdown (commands/, agents/, templates/, docs/). Patterns adopted from [gsd-2](https://github.com/gsd-build/gsd-2) v2.67 `scripts/docs-prompt-injection-scan.sh` and `scripts/base64-scan.sh`. Includes base64 obfuscation detection and `.prompt-injection-scanignore` for suppressing known false positives. First phase of the `gsd-2-selective-adoption` milestone. See `docs/superpowers/specs/2026-04-11-gsd2-prompt-injection-scan-design.md`.
- **`docs-check` CI job** — runs `gd scan --diff origin/<base>` on every PR, blocking PRs that introduce unignored prompt injection patterns.
- **`npm run hooks:install`** — opt-in installer for a vanilla `.git/hooks/pre-commit` stub that runs `gd scan` on staged markdown. Not installed by postinstall.
- **Scheduler wait-for-recovery fallback** — when `scheduler.spawn` would
  otherwise fall through to `free_fallback` because all priority accounts
  are exhausted, it now computes the soonest time any account will regain
  headroom (via sample aging) and sleeps until then. Wait is capped by
  new `SchedulerConfig.max_wait_minutes` (default 90). Cancellable via
  Ctrl+C. Pattern adopted from [gsd-2](https://github.com/gsd-build/gsd-2)
  v2.67 `auto-timeout-recovery.ts`. First phase of spec 2A/4 of the
  `gsd-2-selective-adoption` milestone.
- **`lib/scheduler-wait.ts`** — new module with `waitUntilOrAbort`
  cancellable sleep primitive and lazy SIGINT handler registration.
- **`computeSoonestRecovery` and `_anyPriorityHasHeadroom`** exported from
  `lib/scheduler.ts` for the wait-branch logic.
- **`SchedulerConfig.max_wait_minutes`** — new optional field, default 90
  minutes. Set to 0 to disable the wait (preserves pre-Spec-2A behavior).
- **Autoresearch scheduler routing** — `lib/autoresearch.ts` (Karpathy
  autonomous experiment loop) is now converted from synchronous spawn to
  async, and routes its Claude subprocess calls through `scheduler.spawn`
  when a scheduler is available. Autoresearch now participates in
  per-account token tracking and rate-limit handling.
- **`lib/phase-complete.ts`** — new module containing the extracted
  `_phaseCompleteCore` (moved from `lib/phase.ts`) and a new autopilot-safe
  `completePhaseAfterPostPipeline` wrapper. The wrapper catches all errors
  and returns `null` on failure instead of throwing, so autopilot cannot
  crash on a phase-finalize failure. Part of spec 3/4 of the
  `gsd-2-selective-adoption` milestone.
- **Autopilot `phase-finalize` status marker step** — new
  `phase-finalize: started/completed/failed` marker written after the
  post-pipeline step.
- **LLM fallback for phase completion (Spec 3B)** — opt-in
  `GrdConfig.phase_complete_llm_fallback` flag (default false). When
  `true`, `gd autopilot` and `gd phase complete` delegate to a new
  `lib/phase-complete-llm.ts` module that invokes Claude via the
  scheduler to perform ROADMAP.md + STATE.md edits when the mechanical
  regex path fails. Verification checks for a ticked
  `- [x] Phase N` checkbox. New `gd settings phase_complete_llm_fallback
  <bool>` CLI. New `PhaseCompleteResult.llm_fallback` flag on results
  produced by this path.
- **Follow-up items for gsd-2-selective-adoption milestone:**
  - Per-backend idle timeout overrides via
    `SchedulerConfig.idle_timeout_seconds_by_backend`
  - Per-agent complexity overrides via
    `GrdConfig.agent_complexity_overrides`
  - Configurable complexity heuristic cutoffs via
    `GrdConfig.complexity_heuristics`
  - Process-group SIGTERM on POSIX platforms (scheduler now signals
    the whole process tree instead of just the direct child)
  - Exponential-backoff retries for LLM phase-completion fallback via
    `GrdConfig.phase_complete_llm_fallback_retries`
  - Deeper verification for LLM phase-completion fallback (STATE.md
    advance check + progress-table row check, in addition to the
    ROADMAP checkbox)
  - New `gd metrics` CLI + `lib/metrics.ts` in-memory counters
    tracking scheduler pressure transitions, idle kills, and LLM
    fallback attempts/successes
- **Token optimization system (Spec 4)** — adaptive model-tier routing
  that downgrades expensive agents to cheaper tiers based on budget
  pressure and task complexity.
  - New `token_profile` preference in `.planning/config.json`
    (`frugal` / `balanced` / `quality`, default `balanced`). Set via
    `gd settings token_profile <value>`.
  - New `lib/complexity.ts` with `estimateComplexity` pure function
    (21-agent baseline table + prompt-length + sample-tail demotion).
  - New `isBudgetPressured` and `computeBudgetPressureLevel` in
    `lib/scheduler.ts`. Classifies pressure as `none` / `warning`
    (>=60%) / `high` (>=80%) / `critical` (>=95%).
  - New `computeEffectiveModelTier` in `lib/backend.ts`. Combines
    profile + pressure + complexity via an auditable 3x4x3 decision
    matrix.
  - New `getEffectiveTierForDispatch` helper in `lib/backend.ts` used
    by autopilot, evolve, and autoresearch.
  - New `SchedulerConfig.budget_pressure_thresholds` field.
  - New `Scheduler.getStates()` accessor.

### Changed

- **`gd autopilot`, `gd evolve`, and `gd autoresearch` now use adaptive
  model-tier routing.** Before each agent dispatch, these loops call
  the Spec 4 chain (complexity -> pressure -> effective tier) and pass
  the effective tier to `resolveModelForAgent`. When the scheduler is
  absent, behavior is unchanged from pre-Spec-4.
- **`gd autopilot` now auto-finalizes phases.** After a successful
  post-pipeline step, autopilot calls `completePhaseAfterPostPipeline`
  to tick the ROADMAP.md checkbox, update STATE.md's current phase,
  run quality analysis, and generate a cleanup plan if issues exceed
  threshold. Previously, autopilot stopped at the post-pipeline step
  and required the user to run `gd phase complete N` manually for
  every phase. The CLI command `gd phase complete` is unchanged and
  continues to work as a manual recovery path.

### Fixed

- README.md `## Credits` no longer links to the now-404 `coleam00/get-shit-done` repository. Replaced with `gsd-build/gsd-2` and noting v1 heritage plus v2 patterns.
- CLAUDE.md claim that a pre-commit hook runs lint was stale — no such hook was installed. Updated to describe the new opt-in `gd scan` hook.
- **"Stuck at rate limit" symptom in long-running operations** — the
  actual mechanism was `scheduler.spawn` giving up after cycling through
  exhausted accounts instead of waiting for the soonest sample window
  to age out. The new wait-for-recovery fallback addresses this directly.
- **Autopilot's next-milestone transition no longer stalls.** Because
  autopilot now finalizes phases automatically, `_isAllPhasesComplete`
  (which checks `disk_status === 'complete'`) reports completion
  correctly at the end of a milestone, unblocking the next-milestone
  transition.

### Known limitations

- `SchedulerSpawnResult` does not expose captured stdout, so autoresearch
  paths that need `captureOutput: true` (the experiment iteration
  hypothesis matcher) still use the synchronous fallback. Extending the
  scheduler result shape to include stdout is a follow-up improvement.

## [0.1.6] - 2026-02-19

### Added

- **Validation gate system:** New `lib/gates.js` module with 6 pre-flight checks (orphaned phases, phase-in-roadmap, phase-has-plans, stale artifacts, old-phases-archived, milestone-state-coherence) and declarative gate registry mapping 10 commands
- **Phase directory archival:** `cmdMilestoneComplete` now archives all phase directories to `.planning/milestones/{version}-phases/` and clears `.planning/phases/`
- **`suggested_start_phase`:** `cmdInitNewMilestone` scans archived and current phases to recommend next phase number
- **`consistency_warning`:** `findPhaseInternal` warns when a phase exists on disk but not in ROADMAP.md

### Changed

- **Gate integration:** Pre-flight gates run before `execute-phase`, `plan-phase`, `new-milestone`, `phase-add`, `phase-insert`, `phase-complete`, `milestone-complete`, `verify-work`, and `iterate`
- **`autonomous_mode` in config:** YOLO mode now bypasses validation gates (violations still reported with `bypassed: true`)
- **`cmdValidateConsistency` refactored:** Reuses `checkOrphanedPhases` from gates; orphaned phases promoted from warnings to errors

### Testing

- 1,433 tests (+34 from v0.1.5)
- New `tests/unit/gates.test.js` with 20 gate tests
- Phase archival and consistency_warning tests added

## [0.1.5] - 2026-02-17

### Changed

- **Long-term roadmap redesign:** Replaced rigid Now/Next/Later tier system with flat, ordered LT-N milestones supporting full CRUD operations
- **12 new subcommands:** `list`, `add`, `remove`, `update`, `refine`, `link`, `unlink`, `display`, `init`, `history`, `parse`, `validate`
- **Protection rules:** Cannot remove LT milestones with shipped normal milestones; cannot unlink shipped versions
- **Auto-initialization:** `init` subcommand auto-groups existing ROADMAP.md milestones into LT-1
- **Normal milestone linking:** Each LT milestone tracks linked normal milestones with `(planned)` annotations
- **12 MCP tools:** Replaced 9 old tools (`mode`, `generate`, `promote`, `tier`) with 12 new CRUD tools

### Removed

- `mode`, `generate`, `promote`, `tier` subcommands (replaced by flat LT-N model)
- Now/Next/Later tier hierarchy
- `roadmap_type` and `planning_horizon` frontmatter fields

### Documentation

- **New tutorial:** `docs/long-term-roadmap-tutorial.md` with step-by-step guide and breakdown refinement workflow
- Updated README, CLAUDE.md, MCP server docs, quickstart, slash command definition

## [0.1.4] - 2026-02-17

### Added

- **`/grd:long-term-roadmap` slash command:** Interactive wizard for creating/displaying LONG-TERM-ROADMAP.md, refining milestones, and promoting through tiers
- **`/grd:requirement` slash command:** Look up requirements by ID, list with filters, query traceability matrix, update status

### Fixed

- **Skill registration for 28 commands:** Added YAML frontmatter (`description` + `argument-hint`) to 28 command files that were missing it. Commands without frontmatter were not registered as skills by the plugin system, making them invisible to the AI model. All 45 commands now register as skills.
- **Documentation accuracy:** README command table expanded from 24 to 45 commands, MCP tool count updated to 102

### Commands now registered as skills (were previously invisible)

`add-phase`, `add-todo`, `audit-milestone`, `check-todos`, `complete-milestone`, `dashboard`, `debug`, `discuss-phase`, `execute-phase`, `health`, `insert-phase`, `list-phase-assumptions`, `map-codebase`, `new-milestone`, `new-project`, `pause-work`, `phase-detail`, `plan-milestone-gaps`, `plan-phase`, `progress`, `quick`, `remove-phase`, `research-phase`, `resume-project`, `set-profile`, `settings`, `verify-phase`, `verify-work`

## [0.1.3] - 2026-02-17

### Added

- **MCP extension wiring:** 5 new MCP tools (requirement get/list/traceability/update-status, search) — total 102
- **Execute-phase branching fix:** `base_branch` config field, checkout-and-pull before branch creation, 4 graceful edge-case handlers

## [0.1.2] - 2026-02-16

### Added

- **Requirement CLI commands:** `requirement get`, `requirement list`, `requirement traceability`, `requirement update-status`
- **Search CLI command:** Full-text search across planning documents
- **Phase cleanup analysis:** Complexity, dead exports, file size, doc drift, test coverage gaps

## [0.1.1] - 2026-02-16

### Added

- **Code review integration:** Auto code review with configurable timing and severity gates
- **Agent Teams execution:** Wave-based parallel plan execution with named teammates
- **Eval reporting:** Quantitative evaluation collection and ablation analysis

## [0.1.0] - 2026-02-16

### Added

- **Multi-backend support:** Detect and adapt to Claude Code, Codex CLI, Gemini CLI, and OpenCode backends
- **Dynamic model detection:** OpenCode backend discovers available models via `opencode models` CLI with 5-min TTL cache
- **Backend capabilities registry:** Per-backend feature flags (subagents, parallel, teams, hooks, mcp)
- **`detect-backend` CLI command:** Returns backend name, resolved models, `models_source` field, and capabilities
- **Long-term roadmap:** `LONG-TERM-ROADMAP.md` for multi-milestone planning (redesigned in v0.1.5)
- **`long-term-roadmap` CLI command:** Milestone management subcommands (redesigned in v0.1.5)
- **Auto-cleanup quality analysis:** Optional phase-boundary code quality checks (ESLint complexity, dead exports, file size)
- **`quality-analysis` CLI command:** Structured quality reports per phase
- **Long-term roadmap tutorial:** `docs/long-term-roadmap-tutorial.md` (rewritten in v0.1.5)

### Changed

- **`resolveBackendModel` signature:** New optional `cwd` param for dynamic model detection (backward compatible)
- **`cmdDetectBackend` output:** Added `models_source` field (`"detected"` or `"defaults"`)
- **All `cmdInit*` functions:** Now include `backend` and backend-resolved model names in output
- **Context init:** Backend capabilities integrated into all 14 workflow initializers

### Testing

- 858 tests (up from 594 in v0.0.5)
- `lib/backend.js` at 98.96% statement coverage
- All lib/ modules maintain >= 80% line coverage

## [0.0.5] - 2026-02-15

### Added

- **Input validation layer:** All CLI entry points validate phase numbers, file paths, git refs, and subcommands before dispatch
- **JSDoc documentation:** All exported functions in 10 lib/ modules have JSDoc comments with @param and @returns
- **CONTRIBUTING.md:** Contributor guide with architecture overview, test guide, and PR guidelines
- **Status dashboard commands:** `grd:dashboard`, `grd:phase-detail`, `grd:health` for project visibility

### Changed

- **Version bump to 0.0.5:** First production-quality release
- **Modular architecture:** Monolithic grd-tools.js (5,632 lines) decomposed into 10 lib/ modules (largest: 1,573 lines)
- **Security hardening:** All execSync calls replaced with execFileSync + argument arrays; git operation whitelist enforced
- **CI/CD pipeline:** GitHub Actions workflow with Node 18/20/22 matrix, lint, test, format check, security audit
- **Code style enforcement:** ESLint + Prettier configured and enforced in CI

### Security

- Zero command injection vectors (verified by code audit)
- Path traversal blocked in all file path arguments
- Git ref flag injection blocked
- Git operation whitelist prevents destructive commands

### Testing

- 594 tests (unit + integration)
- > = 80% line coverage on lib/ modules
- 27 golden snapshot tests for CLI output stability
- 78 integration tests for end-to-end CLI behavior

## [0.0.4] - 2026-02-12

### Added

- **Date scheduling for Jira Plans:** Milestone `**Start:**`/`**Target:**` and phase `**Duration:** Nd` metadata in ROADMAP.md
- `computeSchedule()` engine in grd-tools.js — deterministic date computation from milestone start + cumulative durations
- `tracker schedule` command — read-only computed schedule JSON
- `tracker prepare-reschedule` command — cascade date updates to synced Jira issues
- `/grd:sync reschedule` mode — manual trigger for date cascade
- `start_date_field` config (`customfield_10015` default) for Jira start date field mapping
- `default_duration_days` config (7 default) for phases without explicit `**Duration:**`
- Auto-reschedule in `/grd:add-phase` and `/grd:insert-phase` when `auto_sync` enabled
- Phase add generates `**Duration:** 7d`, phase insert generates `**Duration:** 3d`
- `prepare-roadmap-sync` now includes `start_date`, `due_date`, `start_date_field` in operations
- `roadmap analyze` now includes `duration_days`, `start_date`, `due_date` per phase

### Changed

- `templates/config.json`: added `start_date_field`, `default_duration_days` to `mcp_atlassian`
- `templates/roadmap.md`: added `**Duration:**` to phase templates, `**Start:**`/`**Target:**` to milestone template
- `commands/sync.md`: date-aware create operations, new reschedule mode
- `commands/add-phase.md`, `commands/insert-phase.md`: reschedule notification step
- `commands/tracker-setup.md`: start date field and duration configuration questions
- `agents/grd-roadmapper.md`: date fields in tracker create operations
- `references/mcp-tracker-protocol.md`: date scheduling and reschedule protocol
- `references/tracker-integration.md`: schedule section with date computation model

## [0.0.3] - 2026-02-12

### Changed

- **BREAKING:** Replaced Jira curl-based integration with mcp-atlassian MCP server
- **BREAKING:** Jira mapping hierarchy: Milestone → Epic, Phase → Task, Plan → Sub-task (was Phase → Epic, Plan → Task)
- Config keys: `milestone_issue_type`, `phase_issue_type`, `plan_issue_type` (auto-migrated from old `epic_issue_type`/`task_issue_type`)
- Tracker integration now uses prepare/execute/record pattern for MCP Atlassian
- Old `"jira"` provider configs auto-migrate to `"mcp-atlassian"` at read time
- `grd-tools.js`: removed `createJiraTracker()`, `jiraRequest()`, all curl-based Jira code
- `grd-tools.js`: added `prepare-roadmap-sync`, `prepare-phase-sync`, `record-mapping`, `record-status` subcommands
- `prepare-roadmap-sync` now creates operations for both milestones (Epics) and phases (Tasks)
- `prepare-phase-sync` now creates Sub-task operations (was Task)
- `record-mapping` supports `--type milestone` with `--milestone` flag
- TRACKER.md now has Milestone Issues, Phase Issues, and Plan Issues sections
- All agent/command tracker blocks updated with new mapping hierarchy
- `commands/sync.md` and `commands/tracker-setup.md` rewritten for MCP Atlassian

### Added

- `references/mcp-tracker-protocol.md` — protocol reference for MCP tracker sync
- MCP Atlassian auth handled transparently by MCP server (no env vars needed)

### Removed

- Jira curl-based REST API calls
- `JIRA_EMAIL`, `JIRA_API_TOKEN`, `JIRA_OAUTH_TOKEN` environment variable dependencies

## [0.0.2] - 2026-02-12

### Added

- Tracker integration: GitHub Issues + Jira with shared abstraction
- `/grd:sync` command for manual tracker sync
- `/grd:tracker-setup` command for interactive tracker configuration
- `/grd:update` command for self-update with patch preservation
- `/grd:reapply-patches` command for restoring local modifications
- `bin/grd-manifest.js` for SHA256-based modification detection
- `grd-file-manifest.json` generated manifest for update tracking
- CHANGELOG.md

### Changed

- Documentation: CLAUDE.md, README.md, help.md now document grd-tools.js capabilities
- `templates/config.json`: replaced `github_integration` with `tracker` section

## [0.0.1] - 2026-01-28

### Added

- Fork of GSD with R&D extensions
- 38 commands (28 from GSD + 10 R&D-specific)
- 19 agents (11 from GSD + 8 R&D-specific)
- `grd-tools.js` with 80+ CLI subcommands
- Research knowledge base (`.planning/research/`)
- Tiered verification (sanity / proxy / deferred)
- Autonomous mode (YOLO)
- Code review integration
- Agent Teams support
