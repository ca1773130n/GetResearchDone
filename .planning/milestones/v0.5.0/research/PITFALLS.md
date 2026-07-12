# PITFALLS — v0.5.0 Interactive Research Steering (ranked risk register)

Grounded in the repo as of 2026-07-12 (main @ 98a5b5d). Line refs are approximate.

---

## R1 — New default-on gates silently block bench / portfolio / harness / autopilot (CRITICAL)

**Risk.** `resolveGates()` (lib/research/gates.ts) uses the `!== false` convention: a gate
absent from config is ON. If the 4 new checkpoint gates (seed/hypothesize/design/decide)
follow the same convention, every existing non-interactive caller pauses forever:

- `lib/research/bench.ts` — `BENCH_WORKDIR_CONFIG` (line ~119, `Object.freeze`) pins
  `research_gates: { experiment_execution: false, kg_write: false }` and passes
  `noGates: true` (line ~359). The frozen object does NOT know about new keys; only the
  `noGates: true` belt saves it — and only if `resolveGates(noGates)` is extended to zero
  ALL gates, not just the two it hardcodes today (`return { execute: false, kg_write: false }`).
- `lib/research/portfolio.ts` — `runPortfolio` passes `noGates` (only true under
  `--no-gates`); a default-on DECIDE checkpoint would pause every thread each iteration
  under concurrency, filling the report with `paused` entries.
- `lib/research/cli-kb.ts:143` — kb resume path calls `resumeResearch` non-interactively.
- harness rounds (`lib/commands/harness.ts` → `bin/harness_driver.py` → autoresearch-core
  kernel) and autopilot (skill layer) never surface AskUserQuestion from a subprocess.

**Severity.** Critical — hangs CI/bench (GRD-Bench v1 just shipped in 0.4.16), corrupts
bench grades, breaks unattended harness rounds.

**Mitigation.**
1. New checkpoint gates are **default OFF** (`=== true` to enable), unlike execute/kg_write.
   Opt-in interactivity; zero behavior change for every existing caller. This single
   decision retires most of R1.
2. Extend `resolveGates(noGates)` to return all-false for every gate, and derive the
   all-false object from one source (e.g. `defaultGates()` map) so a future gate can't be
   forgotten.
3. Add the new keys explicitly to `BENCH_WORKDIR_CONFIG` anyway (belt-and-braces, matching
   the existing comment "both gates off (belt-and-braces with noGates)").
4. Auto-skip when `autonomous_mode: true` in `.planning/config.json` (note: THIS repo's own
   config has `autonomous_mode: true` — dogfooding will exercise the skip path first).
5. Test: a caller-audit test that enumerates every `runResearch`/`resumeResearch` import
   site (portfolio, bench, cli, cli-kb, index) and asserts non-interactive paths complete
   with all checkpoint gates forced on in config but `noGates`/autonomous set.

**Affected:** lib/research/gates.ts, orchestrator.ts, bench.ts, portfolio.ts, cli-kb.ts,
lib/commands/harness.ts, commands/research.md, commands/autopilot.md.

---

## R2 — Checkpoint fatigue: per-iteration checkpoints multiply (HIGH)

**Risk.** HYPOTHESIZE, DESIGN, and DECIDE run **every iteration** (default
`maxIterations: 5`, and resurveys can extend `baseMaxIterations`). 4 gates × 5 iterations
plus a pre-loop interview ≈ 15–20 interactive pauses per thread. Each pause is a full
process exit + `gd research resume` round trip (gates pause by returning
`status: 'paused'`, not by blocking in-process). Users will `--no-gates` everything and
the feature dies.

**Mitigation.**
- Copy plan-phase's bounds verbatim (commands/plan-phase.md steps 8–12): max 4 questions
  per checkpoint in ONE AskUserQuestion call, **2-round cap per checkpoint type**, de-dupe
  by question TEXT not id, recommended option listed first.
- Iteration scoping: SEED interview fires once per thread ever; HYPOTHESIZE/DESIGN fire on
  iteration 1 only by default (config `research_checkpoint_every_iteration: false`); DECIDE
  fires only when the loop would otherwise pivot/stop (it is the natural human decision
  point), not on every LEARN.
- Offer an "apply to all remaining iterations" option in each checkpoint's answers, stored
  on the thread so later iterations self-answer.
- Track `research.gate_pauses_total` (counter already exists, orchestrator.ts ~484) and add
  a per-thread checkpoint count to FINDING.md telemetry so fatigue is measurable.

**Affected:** lib/research/orchestrator.ts, commands/research.md, .planning/config.json.

---

## R3 — Thread-state schema back-compat (HIGH)

**Risk.** `loadThread` (lib/research/thread.ts) is a bare `JSON.parse` cast — no migration,
no defaults. Three concrete breakages:

1. **Old thread.json → new code:** `thread.gates` has only `{execute, kg_write}`. New code
   reading `thread.gates.hypothesize` gets `undefined`. `checkGate`'s
   `if (!thread.gates[gate] || approved)` happens to fail open (proceed) — acceptable ONLY
   if new gates are default-off (R1.1); document this as load-bearing.
2. **`pendingGate` is a closed union** (`'execute' | 'kg_write' | null`, types.ts).
   Widening it to checkpoint names breaks every consumer that switches on it, and old GRD
   versions reading a new paused thread will mis-handle an unknown `pendingGate`. Prefer a
   NEW optional field `pendingCheckpoint?: { station, questions, round, ... }` and leave
   `pendingGate` semantics untouched; `status: 'paused'` is reused as-is.
3. **Terminal-status mirrors:** portfolio.ts:74 and paper.ts:15 each hardcode
   `TERMINAL = supported|exhausted|abandoned` with a comment "no shared constant exists".
   Do NOT add a new ThreadStatus (e.g. 'awaiting_input') — reuse 'paused', or first extract
   the shared constant and update both mirrors in the same commit.
4. Golden fixtures: tests that build ResearchThread literals (orchestrator/portfolio/thread
   tests) will fail TS strict compile if new REQUIRED fields are added — all new thread
   fields must be optional (`?`).

**Mitigation.** All new thread fields optional; add a `loadThread` normalizer that fills
`gates` defaults for missing keys; add an explicit back-compat test loading a v0.4-era
thread.json fixture and resuming it.

**Affected:** lib/research/types.ts, thread.ts, portfolio.ts, paper.ts, tests/unit/*.

---

## R4 — DESIGN checkpoint vs the deterministic verdict contract + debug pinning (HIGH)

**Risk.** The verdict is deterministic off the committed metric/comparator/target, and the
debug-retry loop **pins** the DESIGN-committed contract across re-plans (orchestrator.ts
~547–553 overwrites drifted `metricKey/comparator/target` and records the drift). Two traps:

1. **Ordering:** if the DESIGN checkpoint (user edits/approves the metric contract) fires
   AFTER the contract is committed/pinned, the user's answer is silently overwritten by the
   pin on the next debug re-plan — the user believes they changed the target; the verdict
   uses the old one. The checkpoint must fire strictly BEFORE commit: parse plan → raise
   checkpoint → apply answers → THEN commit/pin. The user-approved contract becomes the
   pinned `committed` object.
2. **Resume non-determinism:** if resume-after-DESIGN-checkpoint re-spawns the design agent,
   the LLM may produce a different plan than the one the user approved. Precedent already
   solved this for the execute gate: "RESUME after execute-gate approval: reuse the reviewed
   hypothesis + plan" (orchestrator.ts ~411). Persist the approved plan + answers in the
   thread dir and reuse them on resume — never re-derive.

**Severity.** High — corrupts the core "deterministic verdict, no LLM-judged scoring"
guarantee that GRD-Bench grades against (bench grades the FULL frozen metric contract,
f493cae).

**Affected:** lib/research/orchestrator.ts (DESIGN commit + debug loop), verdict.ts
(read-only — must NOT change), bench.ts grading assumptions.

---

## R5 — Double-asking on debug re-plan / resurvey / iteration (MEDIUM-HIGH)

**Risk.** Three re-entry paths re-run stations that now carry checkpoints: (a) the debug
fix-and-retry loop re-plans (but the gate re-check at ~526 deliberately auto-DENIES rather
than re-asks — follow that precedent: never raise a checkpoint inside the debug loop);
(b) resurvey resets stations; (c) `resumeResearch` re-enters the loop and could re-raise the
same checkpoint it just answered if the answered flag isn't persisted before the pause
returns.

**Mitigation.** Persist per-checkpoint state on the thread (`checkpoints: { [station]:
{ round, answeredQuestions: string[], resolved: boolean } }`) saved via `saveThread` BEFORE
returning `paused` (the existing pause paths already `saveThread` first). De-dupe by
question text across rounds (plan-phase precedent). Debug loop and resurvey read
`resolved: true` and skip. Cap rounds at 2, then proceed with recommended defaults —
identical to plan-phase step 12b's "proceed with its recommended defaults (do not loop
further)".

**Affected:** lib/research/orchestrator.ts, thread.ts, commands/research.md.

---

## R6 — Discussion-fallback cost, latency, and rate limits (MEDIUM)

**Risk.** `lib/discussion.ts` `dispatchToBackend` uses **execFileSync** (blocks the event
loop), dispatches participants **sequentially**, default timeout **5 min per participant**.
A 3-backend panel answering 4 checkpoints × 5 iterations = up to 60 sequential 5-min-capped
CLI spawns per thread — and under portfolio concurrency N, that multiplies again. Worse,
discussion dispatch bypasses `lib/scheduler.ts` (no account rotation, no `detectFromStdout`
rate-limit detection — claude reports limits as exit-0 JSON, so a rate-limited panelist
looks like a successful empty answer and gets synthesized as a real opinion).

**Mitigation.**
- Panel answers a checkpoint at most ONCE (no rounds); single-backend fallback default,
  panel opt-in via config.
- Cap panel timeout well below 5 min for checkpoint answers (they're multiple-choice, not
  essays); pass `timeout_ms` explicitly.
- Route panel spawns through the scheduler OR at minimum run `detectFromStdout` on each
  BackendResponse and treat rate-limited/logged-out as "backend unavailable → use
  recommended default", never as an answer.
- Hard fallback: if all panelists fail, take the checkpoint's recommended option — the
  autonomous path must NEVER pause.

**Affected:** lib/discussion.ts, lib/scheduler.ts, lib/research/orchestrator.ts (or a new
lib/research/checkpoint-answerer.ts), .planning/config.json.

---

## R7 — research_gates config namespace collision (MEDIUM)

**Risk.** `research_gates` in `.planning/config.json` is ALREADY two overlapping
namespaces: the skill-layer gates (`survey_approval`, `phase_plan_approval`,
`plan_clarification`, ... — this repo's live config shows 8 of them) and the orchestrator's
(`experiment_execution`, `kg_write`). `readResearchGatesConfig` (orchestrator.ts ~121)
parses only its two keys but the TYPE it casts to lies about the object's shape. Adding 4
more keys (`seed_clarification`? `hypothesis_selection`? ...) risks name clashes with
future skill gates, and `gd settings` / autonomous-mode save/restore
(`_saved_research_gates` in live config) must round-trip the new keys without dropping them.

**Mitigation.** Prefix the new keys consistently (e.g. `checkpoint_seed`,
`checkpoint_hypothesize`, `checkpoint_design`, `checkpoint_decide`) or nest them under
`research_gates.checkpoints.{...}`; update the settings save/restore path and `gd settings`
skill in the same phase; one unit test asserting unknown keys in `research_gates` are
preserved by settings round-trip.

**Affected:** lib/research/orchestrator.ts, lib/research/gates.ts, commands/settings.md,
.planning/config.json docs in both CLAUDE.md files.

---

## R8 — Answer transport: zsh/CLI escaping (MEDIUM)

**Risk.** The skill layer must hand free-text answers back to
`gd research resume <id>`. Answers contain quotes, newlines, `!` (zsh history expansion —
already a documented repo gotcha), `$`, backticks. Passing them as argv
(`gd research resume x --answers "..."`) WILL mangle or explode in zsh, and long interview
transcripts can exceed ARG_MAX.

**Mitigation.** Never pass answer text through argv. The skill layer writes
`<threadDir>/checkpoints/<station>-answers.json` (Write tool, no shell involved) and calls
plain `gd research resume <id>`; the orchestrator picks the file up by convention. This
also gives replay/audit for free and matches the existing file-based thread-state design.
Reserve argv for enum-ish flags only (`--checkpoint-default` etc.).

**Affected:** lib/research/cli.ts, orchestrator.ts, commands/research.md.

---

## R9 — Test strategy and coverage thresholds (MEDIUM)

**Risk.** jest.config.js pins per-file thresholds (gates.ts 90/100/80, bench.ts 95/100/85,
portfolio.ts 90/90/60, ...) that must not drop. Checkpoint logic touching orchestrator.ts
(the biggest, hardest-to-cover file) with interactive branches would tank branch coverage
if it can only be exercised via real pauses. The pre-loop interview lives in skill markdown
(untestable by jest) — logic placed there is logic without coverage.

**Mitigation.**
- Follow the existing DI pattern exactly: checkpoints go through an injected handler
  (`opts.checkpointHandler?: (cp: Checkpoint) => CheckpointAnswers | 'pause'`) the same way
  `spawn`, `runner`, `retrieve`, `kgClient` are injected today. Default handler = pause
  (production); tests inject deterministic answerers; the AI-panel answerer is just another
  injected handler wrapping lib/discussion.ts.
- Keep skill-layer markdown thin (parse block → AskUserQuestion → write answers file →
  resume); all decision logic in TypeScript where jest reaches it.
- New module (e.g. lib/research/checkpoint.ts) gets its own threshold entry from day one;
  bench.ts/portfolio.ts threshold entries force the R1 caller-audit tests to exist.
- Repo hygiene: run live smoke tests only in `mktemp -d` workdirs (CLAUDE.md gotcha — stray
  `.planning/research/threads/` + KNOWHOW.md pollution), `TMPDIR` outside the repo.

**Affected:** jest.config.js, tests/unit/orchestrator.test.ts (new cases),
tests/unit/checkpoint.test.ts (new), lib/research/orchestrator.ts.

---

## R10 — Checkpoint block protocol drift between orchestrator and skill layer (LOW-MEDIUM)

**Risk.** Two components must agree on the typed checkpoint block: the orchestrator emits
it (into result JSON / thread.json), commands/research.md parses it. plan-phase's protocol
lives entirely in markdown ↔ subagent text (`## CHECKPOINT REACHED` / `TYPE:` /
`<question>` XML-ish), which drifts silently — there is no compile-time or test-time check
that the emitter and parser match. A stale plugin skill + newer `gd` binary (or vice versa,
common for a plugin) yields checkpoints that render as garbage or get ignored, leaving the
thread paused with the user never asked.

**Mitigation.** Emit the checkpoint as STRUCTURED JSON in the `ResearchResult` (and
persisted in thread.json), not as a prose block — the skill layer formats it for
AskUserQuestion. Version the shape (`checkpoint_version: 1`). Bare `gd research resume <id>`
on a checkpoint-paused thread without an answers file = "accept recommended defaults and
continue" (never crash, never dead-lock). `gd research status` must render pending
checkpoint questions in `--raw` so a human on plain CLI (no Claude skill layer) can still
answer via the answers file.

**Affected:** lib/research/orchestrator.ts (ResearchResult type), cli.ts (`status`/`resume`),
commands/research.md.

---

## Quick matrix

| # | Risk | Severity | Key mitigation |
|---|------|----------|----------------|
| R1 | New gates block bench/portfolio/harness/autopilot | Critical | Default-OFF gates; resolveGates zeroes all; pin bench config; caller-audit test |
| R2 | Checkpoint fatigue | High | Plan-phase bounds (4Q/2 rounds/dedupe); iteration-1-only defaults; "apply to rest" |
| R3 | Thread schema back-compat | High | Optional fields only; keep pendingGate closed; reuse status 'paused'; fixture test |
| R4 | Verdict contract vs pinning | High | Checkpoint strictly before commit; persist approved plan; never re-derive on resume |
| R5 | Double-asking on re-plan | Med-High | Persist per-checkpoint resolved state; debug loop never asks (gate-deny precedent) |
| R6 | Discussion cost/latency/limits | Medium | One-shot panel; short timeouts; detectFromStdout on responses; default-on-failure |
| R7 | research_gates key collision | Medium | Prefixed/nested keys; settings round-trip preserves unknown keys |
| R8 | zsh/CLI answer escaping | Medium | Answers via file in thread dir, never argv |
| R9 | Coverage/test strategy | Medium | Injected checkpointHandler (existing DI pattern); thin skill layer; new threshold entry |
| R10 | Protocol drift skill↔orchestrator | Low-Med | Structured versioned JSON checkpoint; resume-without-answers = defaults |
