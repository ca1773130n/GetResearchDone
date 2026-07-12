# Requirements: v0.5.0 Interactive Research Steering (Human-in-the-Loop)

**Milestone:** v0.5.0
**Created:** 2026-07-12
**Source:** 4-angle ultracode research fan-out + synthesis (.planning/milestones/v0.5.0/research/SUMMARY.md)

Design anchor: **one checkpoint mechanism, two answerers** — the TS orchestrator pauses
with a typed, versioned Checkpoint JSON; answers come from a human (skill-layer
AskUserQuestion) or an AI panel (`resolveElicitation`), with recommended defaults as the
universal no-deadlock fallback. All new gates default OFF; all new thread fields optional;
the deterministic verdict path is untouchable.

## Checkpoint Core Plumbing (Foundation)

### REQ-194: Checkpoint Schema & Thread Fields
**Priority:** P1 — High
**Category:** Core
**Description:** Add `Checkpoint` types to lib/types.ts: `checkpoint_version: 1`, id (`ck-<iter>-<point>-r<round>`), point (`seed|hypothesize|design|decide`), type (`clarification|selection|approval|branch`), iteration, round, questions (≤4, each with options `{label, description, recommended?}`, exactly one recommended, optional freeform), answers (`{questionId, label, text?, answeredBy: 'human'|'panel'|'default'}`). `ResearchThread` gains only optional fields: `pendingCheckpoint?` (full object), `refinedQuestion?`, `checkpointRounds?`. `pendingGate` union and `ThreadStatus` are NOT widened (portfolio.ts/paper.ts TERMINAL mirrors stay valid); reuse `status:'paused'`.

### REQ-195: checkpoints.ts Module
**Priority:** P1 — High
**Category:** Core
**Description:** New `lib/research/checkpoints.ts`: emit (validate at emit time — ≤4 questions, one recommended per question; malformed ⇒ log + proceed with defaults), resolve, one-shot `consumeAnswered(resumedCheckpoint, point, iteration)` (analog of `approved.execute`), append-only `checkpoints.jsonl` IO (mirrors ledger.jsonl), and an injected `checkpointHandler` dependency (matches spawn/runner DI pattern; default handler = pause). Own jest per-file coverage threshold from day one.

### REQ-196: Interactive Config Surface
**Priority:** P1 — High
**Category:** Config
**Description:** Nested `research_gates.interactive` object (`enabled:false` default; per-point `seed/hypothesize/design/decide`; `max_rounds:2`, `max_questions:4`, `hypothesis_candidates:3` clamp [1,5], `every_iteration:false`, `fallback:"recommended"|"panel"`). Parsed by `readInteractiveConfig(cwd)` (raw-read sibling of `readResearchGatesConfig`). Auto-skip matrix: `--no-gates`, `autonomous_mode`, autopilot/`GRD_AUTOPILOT`, portfolio concurrency > 1, non-interactive spawns. `gd research --interactive` = one-shot enable. `gd settings` round-trips unknown `research_gates` keys.

### REQ-197: Default-OFF Gate Safety
**Priority:** P1 — High
**Category:** Core
**Description:** `resolveGates(noGates)` zeroes ALL gates from a single `defaultGates()` source (fixes the hardcoded `{execute, kg_write}` return); new interactive keys pinned off in `BENCH_WORKDIR_CONFIG` belt-and-braces. Caller-audit test enumerating all 5 runResearch/resumeResearch call sites (portfolio.ts, bench.ts, cli.ts, cli-kb.ts, index.ts) proving no unattended path can pause interactively.

### REQ-198: Resume-with-Answers Plumbing
**Priority:** P1 — High
**Category:** CLI
**Description:** `gd research resume <id> [--answers <file|->]` (file or stdin ONLY — never answer text in argv). New branch in `resumeResearch` before pendingGate handling: record answers → append checkpoints.jsonl → clear `pendingCheckpoint` → `runLoop({resumedCheckpoint})`. Bare resume with pending checkpoint ⇒ every question resolves to its recommended option (`answeredBy:'default'`) — this IS the timeout behavior. Back-compat: a pre-0.5.0 thread.json fixture must resume bit-identically (explicit test).

## DESIGN Approval + Skill Loop

### REQ-199: DESIGN Approval Checkpoint
**Priority:** P1 — High
**Category:** Loop
**Description:** Combined pause at the existing GATE-1 (execute gate) site — one pause, never two. Approval checkpoint carries metric/comparator/target + script approach; "Approve & run" consumes the execute gate (`approved.execute = true`); contract edits apply strictly BEFORE the committed pin (debug-loop pinning must never overwrite user edits); "Revise" re-plans round-capped at 2; "Abort" → abandoned. Resume reuses the persisted approved plan — never re-derives. Fires iteration 1 only unless `every_iteration:true`.

### REQ-200: Skill-Layer Checkpoint Protocol
**Priority:** P1 — High
**Category:** Skill
**Description:** "Interactive steering" section in commands/research.md: parse `pendingCheckpoint` from CLI JSON (never re-read files), AskUserQuestion loop per plan-phase §9 protocol verbatim (max 4 per call, recommended-first "(Recommended)", 2 rounds, de-dupe by ask TEXT), write answers file via the Write tool (no shell), `gd research resume <id> --answers <file>`. Skill stays thin — no logic in markdown.

### REQ-201: Status Rendering of Pending Checkpoints
**Priority:** P2 — Medium
**Category:** CLI
**Description:** `gd research status [<id>]` renders pending checkpoint questions in `--raw` (skill-less usage path; also the R10 protocol-drift escape hatch). `renderThreadLog` gains a checkpoint line.

## SEED Interview + DECIDE Branch

### REQ-202: Socratic Pre-Loop Interview (Skill Layer)
**Priority:** P2 — Medium
**Category:** Skill
**Description:** Superpowers-brainstorm-style interview in commands/research.md before `gd research` is invoked: context first, ONE question at a time, multiple-choice preferred, stop condition = the question yields a falsifiable metric target. Once per thread. Refined question passed to the CLI; original user question preserved verbatim.

### REQ-203: SEED Clarification Checkpoint (Orchestrator)
**Priority:** P2 — Medium
**Category:** Loop
**Description:** Thin orchestrator-side path so bare CLI users get clarification too: `buildClarifyPrompt` + `__CLARIFY__` block parse; zero ambiguous dimensions ⇒ no checkpoint (one spawn, zero pauses). Answers fold into `thread.refinedQuestion`; `thread.question` stays verbatim (seeds threadId). Skipped for seeded threads.

### REQ-204: DECIDE Branch Checkpoint
**Priority:** P2 — Medium
**Category:** Loop
**Description:** Fires ONLY when the loop would continue (never delays a terminal verdict); single round; options continue/pivot/stop/adjust-budget with evidence summary in context. Pivot → `pendingPivot`; stop → finalize path. Overrides continuation only — never the verdict (`evaluateVerdict`, contract pin, `shouldTerminate`/`decideBranch` untouched).

## HYPOTHESIZE Candidate Selection

### REQ-205: Multi-Candidate Hypothesis Generation
**Priority:** P3 — Low
**Category:** Loop
**Description:** `__HYPOTHESES__` multi-candidate prompt (N = `hypothesis_candidates`) + `parseHypothesesOutput`; existing single-block parser untouched for the N=1/disabled path.

### REQ-206: Hypothesis Selection Checkpoint
**Priority:** P3 — Low
**Category:** Loop
**Description:** Selection checkpoint pauses BEFORE any ledger append; only the chosen candidate enters the ledger (zero ledger pollution); freeform answer → user-authored hypothesis statement. Skipped for seeded/resume/crash-recovery paths.

## AI-Panel Fallback + Hardening

### REQ-207: answerViaDiscussion Panel Fallback
**Priority:** P3 — Low
**Category:** Integration
**Description:** `answerViaDiscussion(cwd, checkpoint, cfg)` in checkpoints.ts wrapping `buildElicitationContext` + `resolveElicitation` (lib/discussion.ts unchanged), called inline — no pause. Participants exclude the loop's own spawn backend. One-shot, short explicit timeout, `detectFromStdout` per response (rate-limited panelist reads as unavailable, never as an answer), option matching exact → prefix → recommended default. Same Checkpoint record (`answeredBy:'panel'`, `discussionFile`).

### REQ-208: Panel Wiring, Telemetry & Docs
**Priority:** P3 — Low
**Category:** Integration
**Description:** `fallback:"panel"` wiring incl. portfolio force-non-human; `research.checkpoint_pauses_total` + panel counters; docs: CLAUDE.md config keys, `gd settings` skill, autoresearch tutorial section.

### REQ-209: Milestone Verification Suite
**Priority:** P1 — High
**Category:** Testing
**Description:** Proof obligations verified end-to-end: R1 (no unattended path pauses — bench/portfolio/harness/autopilot/cli-kb), R3 (pre-0.5.0 thread back-compat), R4 (DESIGN answers survive debug-loop contract pinning), R5 (no double-asking on debug re-plan/resume). Offline deterministic tests via injected checkpointHandler; per-file coverage thresholds not lowered.

## Traceability Matrix

| REQ | Phase | Status |
|-----|-------|--------|
| REQ-194 | Phase 101 | PENDING |
| REQ-195 | Phase 101 | PENDING |
| REQ-196 | Phase 101 | PENDING |
| REQ-197 | Phase 101 | PENDING |
| REQ-198 | Phase 101 | PENDING |
| REQ-199 | Phase 102 | PENDING |
| REQ-200 | Phase 102 | PENDING |
| REQ-201 | Phase 102 | PENDING |
| REQ-202 | Phase 103 | PENDING |
| REQ-203 | Phase 103 | PENDING |
| REQ-204 | Phase 103 | PENDING |
| REQ-205 | Phase 104 | PENDING |
| REQ-206 | Phase 104 | PENDING |
| REQ-207 | Phase 105 | PENDING |
| REQ-208 | Phase 105 | PENDING |
| REQ-209 | Phase 105 | PENDING |
