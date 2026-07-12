# v0.5.0 Interactive Research Steering — Research Synthesis

Synthesized from ECOSYSTEM.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md (2026-07-12).
Decision-oriented: feeds REQUIREMENTS.md and the roadmapper directly.

---

## 1. Executive summary

v0.5.0 adds optional human-in-the-loop steering to the autoresearch loop with **one
checkpoint mechanism, two answerers**. The TypeScript orchestrator never asks — it pauses
the thread exactly like the existing execute/kg_write gates (`status:'paused'`), persists a
typed, versioned Checkpoint JSON, and returns it in `ResearchResult`. The answerer is
either (a) the skill layer (`commands/research.md`) via AskUserQuestion →
`gd research resume <id> --answers <file>`, or (b) in autonomous runs, an AI panel via
`lib/discussion.ts` `resolveElicitation` answered inline (no pause). **Recommended defaults
are the universal fallback** — a checkpoint can never wedge a thread (resume without
answers, round exhaustion, malformed block, and panel failure all resolve to the
recommended option). Prior art (Agent Laboratory/HLER/TinyScientist, Deep Research
products, LangGraph, MCP elicitation) validates both the 4-point gate placement
(SEED/HYPOTHESIZE/DESIGN/DECIDE) and the pause-with-typed-payload + structured-resume
shape GRD already has.

Non-negotiable brownfield constraints: all new gates **default OFF** (R1 — bench,
portfolio, harness, autopilot, cli-kb would otherwise hang); all new thread fields
**optional** (`loadThread` is a bare JSON.parse; pre-0.5.0 threads must resume
bit-identically); the **deterministic verdict path is untouchable** (checkpoints may edit
the metric contract only pre-pin, and DECIDE only overrides continuation, never the
verdict).

---

## 2. Recommended feature set & priorities

| P | Feature | Notes |
|---|---------|-------|
| P1 | **F1 Checkpoint core plumbing** | types, `lib/research/checkpoints.ts` (new), emit/resolve/consume, `resume --answers <file\|->`, back-compat fixtures, caller-audit test |
| P1 | **F2 Config surface** | `research_gates.interactive` nested object (see §3), auto-skip matrix, `--interactive` flag |
| P1 | **F3 DESIGN approval checkpoint** | highest value, smallest delta; folds into the existing GATE-1 pause site — one pause, never two |
| P2 | **F4 SEED clarification interview** | skill-layer socratic interview + thin orchestrator `__CLARIFY__` checkpoint (see C4); once per thread |
| P2 | **F5b DECIDE branch checkpoint** | fires only when the loop would CONTINUE; single round; continue/pivot/stop/adjust-budget |
| P3 | **F5 HYPOTHESIZE candidate selection** | `__HYPOTHESES__` multi-candidate prompt/parser; unchosen candidates never enter the ledger |
| P3 | **F6 AI-panel fallback** | `answerViaDiscussion` wrapping `resolveElicitation`; one-shot, short timeout, rate-limit-aware, defaults on failure |

### Conflict resolutions (across the four documents)

- **C1 — Config shape.** FEATURES proposed nested `research_gates.interactive`;
  ARCHITECTURE proposed four flat keys + top-level `research_checkpoint_answerer`;
  PITFALLS R7 demanded prefixing or nesting to avoid namespace collision.
  **Resolution: nested `research_gates.interactive`** (FEATURES wins). It directly
  mitigates R7, gives one master kill-switch, groups bounds with points, and settings
  save/restore round-trips one key instead of five. The answerer/fallback lives inside it.
- **C2 — Default state.** ARCHITECTURE/PITFALLS: default OFF; FEATURES example showed
  enabled. **Resolution: absent/disabled by default** (R1 is Critical). Enabling is
  explicit config or `gd research --interactive`. Additionally `resolveGates(noGates)` is
  extended to zero ALL gates from a single `defaultGates()` source, and the new keys are
  pinned off in `BENCH_WORKDIR_CONFIG` belt-and-braces.
- **C3 — pendingCheckpoint type.** FEATURES: id string; ARCHITECTURE: full Checkpoint
  object. **Resolution: full Checkpoint object embedded in `thread.json` and in
  `ResearchResult`** (R10: the skill layer must render AskUserQuestion straight from CLI
  JSON without re-reading files; a stale-skill/new-binary pair still degrades safely).
  Resolved checkpoints append to `checkpoints.jsonl` (mirrors `ledger.jsonl`); FEATURES'
  per-file `checkpoints/<id>.json` directory is dropped — one audit scheme, not two.
- **C4 — SEED interview placement.** ECOSYSTEM: conversational Superpowers-style at skill
  layer; FEATURES: orchestrator clarify spawn; ARCHITECTURE: both. **Resolution: both,
  same gate.** The rich one-question-at-a-time socratic interview lives in
  `commands/research.md` (pre-CLI, discuss-phase precedent, stop condition = falsifiable
  metric target); the orchestrator carries a thin `__CLARIFY__`-spawn checkpoint so bare
  `gd` CLI users get the feature too. Zero ambiguous dimensions → no checkpoint (the
  well-formed-question path costs one spawn, zero pauses). Answers fold into
  `thread.refinedQuestion`; `thread.question` stays verbatim (it seeds `threadId`).
- **C5 — DESIGN vs GATE-1 ordering.** FEATURES: fold into GATE-1; ARCHITECTURE: emit
  before GATE-1 with approve covering execute. **Resolution: one combined pause at the
  GATE-1 site.** The pause carries the approval checkpoint; an explicit "Approve & run"
  answer sets `approved.execute = true` (the human just reviewed the exact plan.json the
  execute gate protects). Contract edits apply strictly BEFORE the committed pin (R4);
  resume reuses the persisted approved plan — never re-derives (execute-gate precedent).
- **C6 — answeredBy vocabulary.** FEATURES `user|panel|default` vs ARCHITECTURE
  `human|discussion`. **Resolution: `'human' | 'panel' | 'default'`** — three values are
  required (default-resolution is a real, common outcome and must be auditable).
- **C7 — Checkpoint fatigue scoping.** PITFALLS R2 wants iteration-1-only defaults;
  FEATURES allows every iteration. **Resolution: HYPOTHESIZE and DESIGN checkpoints fire
  on iteration 1 by default** (`interactive.every_iteration: true` to override); DECIDE
  fires only when the loop would continue (both docs agree); SEED once per thread ever.
  Bound: default total pauses ≤ 1 (SEED) + 2 (iter-1 HYPOTHESIZE/DESIGN) + maxIterations
  (DECIDE).
- **C8 — Answer transport.** ARCHITECTURE offered `--answers-json '<inline>'`; PITFALLS R8
  forbids answer text in argv (zsh `!`, ARG_MAX). **Resolution: file or stdin only** —
  `--answers <file|->`; the skill layer writes the answers file with the Write tool (no
  shell), argv carries only enum-ish flags.
- **C9 — Module name.** `lib/research/checkpoints.ts` (plural, FEATURES) — matches
  `gates.ts`; `gates.ts` itself stays untouched except `resolveGates`.

---

## 3. Config surface (single proposal — locked)

```jsonc
"research_gates": {
  "experiment_execution": true,        // existing, unchanged
  "kg_write": true,                    // existing, unchanged
  "plan_clarification": true,          // existing (skill-layer), unchanged
  "interactive": {                     // NEW — absent/false ⇒ exactly today's behavior
    "enabled": false,                  // master switch; `gd research --interactive` = one-shot true
    "seed": true,                      // per-point overrides, honored only when enabled
    "hypothesize": true,
    "design": true,
    "decide": true,
    "max_rounds": 2,                   // per point per iteration (plan-phase precedent)
    "max_questions": 4,                // per round (AskUserQuestion ceiling)
    "hypothesis_candidates": 3,        // clamp [1,5]; 1 ⇒ selection checkpoint auto-skipped
    "every_iteration": false,          // false ⇒ HYPOTHESIZE/DESIGN on iteration 1 only
    "fallback": "recommended"          // "recommended" | "panel" — answerer when no human
  }
}
```

Parsed by `readInteractiveConfig(cwd)` (raw-read sibling of `readResearchGatesConfig` —
`loadConfig` drops unknown keys). **Auto-skip matrix** (interactive treated as disabled, no
config mutation): `--no-gates`, `autonomous_mode: true`, autopilot/`GRD_AUTOPILOT`,
portfolio runs with concurrency > 1, and non-interactive spawns. When skipped with
`fallback:"panel"`, checkpoints are still built and panel-answered inline (no pause); with
`fallback:"recommended"` they resolve to defaults without pausing. `gd settings` must
round-trip unknown `research_gates` keys (R7 test).

---

## 4. Architecture decisions — LOCKED

1. **Emission mechanism.** Checkpoints are structured, versioned JSON
   (`checkpoint_version: 1`) — never prose blocks (R10, Spec Kit #1147). Emit follows the
   GATE-1 template: build Checkpoint → set `thread.pendingCheckpoint` (full object) +
   `status:'paused'` (`pendingGate` stays `null`) → `saveThread` BEFORE returning →
   increment `research.checkpoint_pauses_total` → return
   `{ status:'paused', paused:true, pendingCheckpoint }`. Validate at emit time (≤4
   questions, exactly one `recommended:true` option per question); malformed ⇒ log +
   proceed with defaults, never surface junk.
2. **Schema.** `Checkpoint { id: "ck-<iter>-<point>-r<round>", point:
   'seed'|'hypothesize'|'design'|'decide', type: 'clarification'|'selection'|'approval'|
   'branch', iteration, round, createdAt, context?, questions: [{ id, ask, options:
   [{label, description, recommended?}], freeform? }], answers?: [{ questionId, label,
   text?, answeredBy: 'human'|'panel'|'default' }], resolvedAt?, discussionFile? }`.
   MCP-elicitation-flat (enums + strings only); dedupe by ask TEXT across rounds; ids are
   per-checkpoint labels, not stable across rounds (plan-phase rules verbatim).
   `ResearchThread` gains only optional fields: `pendingCheckpoint?`, `refinedQuestion?`,
   `checkpointRounds?`. **`pendingGate` union and `ThreadStatus` are NOT widened** —
   portfolio.ts:74 / paper.ts:15 TERMINAL mirrors stay valid; reuse `'paused'`.
3. **Resume plumbing.** `gd research resume <id> [--answers <file|->]`. New branch in
   `resumeResearch` BEFORE pendingGate handling: record answers → append
   `checkpoints.jsonl` → clear `pendingCheckpoint` → `runLoop(..., { resumedCheckpoint })`.
   Each emission point calls `consumeAnswered(resumedCheckpoint, point, iteration)` — the
   exact analog of one-shot `approved.execute` (orchestrator.ts:410-414). Resume with a
   pending checkpoint and NO answers ⇒ resolve every question to its recommended option
   (`answeredBy:'default'`) — this IS the timeout behavior; no wall-clock timer. Three-way
   semantics: answers / skip-to-defaults / abort (abort-shaped option where meaningful).
4. **Discussion fallback.** `answerViaDiscussion(cwd, checkpoint, cfg)` in checkpoints.ts:
   `buildElicitationContext` + `resolveElicitation` (discussion.ts:1087/:1205), called
   inline (discussion.ts is sync `execFileSync`) — no pause, no discussion.ts changes.
   Participants exclude the loop's own spawn backend (`resolveReviewer`
   `requireDifferentFromPrimary` precedent, :130). One-shot (no rounds), explicit short
   `timeout_ms` (multiple-choice, not essays), run `detectFromStdout` on each response so
   a rate-limited panelist reads as unavailable — never as an answer (R6). Answer matched
   to option label exact → prefix → recommended default. Same Checkpoint record either
   way (`answeredBy:'panel'`, `discussionFile`) — identical audit trail.
5. **Verdict no-touch list** (hard constraints): `evaluateVerdict` (:569), committed
   contract pin + drift overwrite (:507-557), debug-loop gate re-check (:526-532 — the
   debug loop never raises a checkpoint, gate-deny precedent), `shouldTerminate`/
   `decideBranch` (:602-604 — DECIDE overrides continuation only), `finishKgSync`.
   `approve_design` may edit the contract only pre-pin/pre-RUN.
6. **Testing.** Injected `checkpointHandler` dep (matches spawn/runner/retrieve DI);
   default handler = pause; tests inject deterministic answerers; panel answerer is just
   another handler. checkpoints.ts gets its own jest threshold entry day one. Skill layer
   stays thin (parse → AskUserQuestion → write file → resume) — no logic in markdown.

---

## 5. Top risks & mitigations (from PITFALLS, priorities confirmed)

| # | Risk | Sev | Locked mitigation |
|---|------|-----|-------------------|
| R1 | New gates hang bench/portfolio/harness/autopilot/cli-kb (5 caller sites) | Critical | Default-OFF nested config; `resolveGates(noGates)` zeroes ALL gates from one `defaultGates()` source; pin new keys off in `BENCH_WORKDIR_CONFIG`; caller-audit test enumerating all 5 sites |
| R4 | DESIGN answers silently overwritten by debug-loop contract pinning | High | Checkpoint strictly before commit/pin; approved contract becomes the pinned object; resume reuses persisted plan, never re-derives |
| R3 | thread.json back-compat (bare JSON.parse, closed unions, TERMINAL mirrors) | High | All new fields optional; pendingGate/ThreadStatus untouched; pre-0.5.0 fixture must resume bit-identically (explicit test) |
| R2 | Checkpoint fatigue (≈15-20 pauses/thread) kills adoption | High | Plan-phase bounds verbatim; iteration-1-only default; DECIDE only on would-continue; pause counter telemetry |
| R5 | Double-asking on debug re-plan/resurvey/resume | Med-High | Persist resolved state before pausing; `consumeAnswered` one-shot; debug loop never asks |
| R6 | Panel bypasses scheduler — rate-limited backend looks like a valid answer | Med | One-shot panel, short timeout, `detectFromStdout` per response, defaults on any failure |
| R8 | Answer text through argv explodes in zsh | Med | File/stdin only; skill writes answers file via Write tool |
| R10 | Skill↔orchestrator protocol drift (stale plugin + new binary) | Low-Med | Versioned structured JSON; bare resume = defaults; `gd research status --raw` renders pending questions for skill-less use |

---

## 6. Phase breakdown (milestone starts at Phase 101)

- **Phase 101 — Checkpoint core plumbing + config (F1+F2, P1).** types.ts additions,
  `lib/research/checkpoints.ts` (emit/resolve/consume, `checkpoints.jsonl` IO),
  `readInteractiveConfig`, `resolveGates` all-off `noGates` fix + `defaultGates()`,
  `resume --answers <file|->` (cli.ts, grd-tools.ts), `renderThreadLog` checkpoint line,
  bench config belt-and-braces, `--interactive` flag. Tests: back-compat fixture (pre-0.5.0
  thread resumes bit-identically), caller-audit across all 5 call sites, settings key
  round-trip. *Exit: all plumbing exists, zero behavior change with default config.*
- **Phase 102 — DESIGN approval + skill checkpoint loop (F3, P1).** Combined
  GATE-1-site pause with approval checkpoint (approve consumes execute gate; contract
  edits pre-pin; revise re-plan round-capped at 2; abort → abandoned);
  `commands/research.md` "Interactive steering" section (AskUserQuestion loop, plan-phase
  §9 protocol verbatim, answers file via Write tool); `gd research status` renders pending
  checkpoints in `--raw`. *Exit: end-to-end human-steered DESIGN approval works.*
- **Phase 103 — SEED interview + DECIDE branch (F4+F5b, P2).** Skill-layer socratic
  pre-loop interview (one question at a time, stop at falsifiable metric target);
  orchestrator `buildClarifyPrompt` + `__CLARIFY__` parse + `refinedQuestion` fold (skipped
  for seeded threads); DECIDE checkpoint on would-continue only (continue/pivot/stop/
  adjust-budget; pivot → `pendingPivot`, stop → finalize path). *Exit: full pre-loop +
  iterate-vs-stop steering.*
- **Phase 104 — HYPOTHESIZE candidate selection (F5, P3).** `__HYPOTHESES__`
  multi-candidate prompt + `parseHypothesesOutput` (single-block parser untouched for the
  N=1/off path); selection checkpoint pauses BEFORE any ledger append; only the chosen
  candidate enters the ledger; freeform → user-authored statement; skipped for seeded/
  resume/crash-recovery paths. *Exit: multi-candidate steering with zero ledger pollution.*
- **Phase 105 — AI-panel fallback + hardening (F6, P3).** `answerViaDiscussion`
  (backend exclusion, one-shot, short timeout, `detectFromStdout` rate-limit guard,
  fuzzy option matching, defaults on failure); `fallback:"panel"` wiring incl. portfolio
  force-non-human; metrics counters; docs (CLAUDE.md config keys, `gd settings` skill,
  autoresearch tutorial). *Exit: autonomous runs get panel-answered checkpoints; milestone
  verification against the R1/R3/R4 proof obligations.*

Dependencies: 102–105 all require 101; 103/104/105 are independent of each other after 102
(102's skill loop is the shared surface). Suggested order as numbered.
