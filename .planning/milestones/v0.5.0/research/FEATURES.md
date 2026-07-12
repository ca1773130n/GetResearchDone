# v0.5.0 — Interactive Research Steering: Feature Design

Grounded in: `lib/research/orchestrator.ts` (runLoop stations, GATE 1/2, resume paths),
`lib/research/gates.ts` (checkGate → `status:'paused'` + `pendingGate`), `lib/research/types.ts`
(`ResearchThread`, `Station` already includes seed/hypothesize/design/decide),
`commands/plan-phase.md` §9 (clarification checkpoint protocol: max 4 Qs, 2 rounds, dedupe by
ask text, recommended-first), `lib/discussion.ts` (`resolveElicitation` — AI panel answerer),
`bin/grd-tools.ts` research subcommand, `.planning/config.json` `research_gates`.

## Design principle

**One checkpoint mechanism, two answerers.** The orchestrator NEVER asks — it pauses the thread
exactly like the existing execute/kg_write gates (`status:'paused'`), writes a typed checkpoint
JSON into the thread dir, and returns it in `ResearchResult`. The answerer is either (a) the
skill layer (`commands/research.md`) via AskUserQuestion → `gd research resume <id> --answers`,
or (b) `resolveElicitation()` from `lib/discussion.ts` in autonomous runs. Recommended defaults
are the universal fallback, so a checkpoint can never wedge a thread.

---

## F1 — Checkpoint core plumbing (P1, prerequisite for all others)

Extend the pause machinery that GATE 1/2 already use.

**Thread state** (`lib/research/types.ts`):

```ts
// widen — pendingGate stays for the two execution gates; checkpoints get their own field
export type CheckpointPoint = 'seed' | 'hypothesize' | 'design' | 'decide';
export interface ResearchThread {
  // ...existing...
  pendingCheckpoint?: string | null;   // checkpoint id when paused on a checkpoint
  refinedQuestion?: string;            // SEED interview output (original `question` untouched)
}
```

**Checkpoint payload** — written to `.planning/research/threads/<id>/checkpoints/<ck-id>.json`
(one file per checkpoint; the directory is the audit ledger — mirrors `debug-attempt-<n>.json`
precedent). Also embedded in the paused `ResearchResult` so the CLI JSON output carries it:

```ts
interface Checkpoint {
  id: string;                    // "ck-<iteration>-<point>-r<round>"  e.g. ck-0-design-r1
  point: CheckpointPoint;
  type: 'clarification' | 'selection' | 'approval' | 'branch';
  iteration: number;
  round: number;                 // 1-based; bounded by max_rounds
  createdAt: string;             // ISO
  context?: string;              // evidence summary (DECIDE) / grounding excerpt (SEED)
  questions: Array<{
    id: string;                  // per-checkpoint label, NOT stable across rounds (plan-phase rule)
    ask: string;                 // dedupe key across rounds — by TEXT, per plan-phase §9
    options: Array<{ label: string; description: string; recommended?: boolean }>;
    freeform?: boolean;          // allow "Other" free text
  }>;
  answers?: Array<{              // written at resolve time
    questionId: string;
    label: string;               // chosen option label (or "Other")
    text?: string;               // freeform text
    answeredBy: 'user' | 'panel' | 'default';
  }>;
  resolvedAt?: string;
}
```

**Resolution contract** (`lib/research/checkpoints.ts`, new — keep `gates.ts` untouched at 27
lines): `emitCheckpoint(cwd, thread, ck)` → saves file, sets `status:'paused'`,
`pendingCheckpoint: ck.id`, bumps a `research.checkpoint_pauses_total` counter, returns paused
`ResearchResult` with a `checkpoint` field. `resolveCheckpoint(cwd, thread, answers)` → merges
answers into the file, clears `pendingCheckpoint`. Exactly one checkpoint may be pending —
`ResearchResult` gains `pendingCheckpoint?: Checkpoint`.

**Resume** (`resumeResearch` + `cmdResearchResume` + `bin/grd-tools.ts`): new flag
`--answers <file|->` (JSON `{ "<questionId>": {"label": "...", "text": "..."} }`; `-` = stdin).
Resume with a pending checkpoint and NO `--answers` resolves every question to its recommended
option (`answeredBy:'default'`) — this IS the timeout behavior; no wall-clock timer needed
because the paused thread is inert on disk. `--no-gates` on resume clears interactive too
(mirrors the existing `thread.gates` override at orchestrator.ts:658-660).

---

## F2 — Config surface (P1)

**Recommendation: single nested `research_gates.interactive` object**, NOT four flat keys.
Rationale: `research_gates` is already a grab-bag of loop gates (`experiment_execution`,
`kg_write`) and skill-level gates (`survey_approval`, `plan_clarification`, …) — four more flat
booleans worsen it; a single object gives one master kill-switch, groups the bounds with the
points, and leaves room for later points without key sprawl.

```jsonc
"research_gates": {
  "experiment_execution": true,
  "kg_write": true,
  "interactive": {                 // absent/false → exactly today's behavior
    "enabled": true,
    "seed": true,                  // per-point overrides, default true when enabled
    "hypothesize": true,
    "design": true,
    "decide": true,
    "max_rounds": 2,               // per point per iteration (plan-phase precedent)
    "max_questions": 4,            // per round (AskUserQuestion ceiling)
    "hypothesis_candidates": 3,    // clamp [1,5]; 1 → selection checkpoint auto-skipped
    "fallback": "recommended"      // "recommended" | "panel" — answerer when no human
  }
}
```

Parsed by a `readInteractiveConfig(cwd)` sibling of `readResearchGatesConfig` (same raw-read
pattern — `loadConfig` drops unknown keys). **Auto-skip** (interactive treated as disabled, no
config mutation): `opts.noGates`, `autonomous_mode` in config, `GRD_AUTOPILOT` env /
autopilot-spawned runs, and portfolio runs with concurrency > 1 — mirrors
`plan_clarification`'s skip list. When skipped and `fallback:"panel"`, checkpoints are still
built but answered by the panel (F6); with `fallback:"recommended"` they are resolved inline to
defaults without ever pausing.

---

## F3 — DESIGN approval checkpoint (P1 — highest value, smallest delta)

**Placement:** fold into the existing GATE 1 pause point (orchestrator.ts:479-487). Today the
execute gate pauses with a bare `pendingGate:'execute'` and plan.json on disk; with
`interactive.design` on, the SAME pause additionally carries a checkpoint payload. One pause,
never two. The resume path already reuses the reviewed hyp + plan (orchestrator.ts:410-414) —
approval rides it unchanged.

**Ask** (type `approval`, single question):

```
q1  ask: "Approve experiment design for {hyp.id}?"
    context: procedure summary + "metric contract: {metricKey} {comparator} {target}" +
             language/runner + scriptPath
    options:
      - "Approve & run"            (recommended)
      - "Revise metric contract"   (freeform: new metricKey/comparator/target)
      - "Revise approach"          (freeform note → DESIGN re-spawned with note injected,
                                    same __PLAN__ contract; counts as round 2)
      - "Abort thread"             (status:'abandoned')
```

On approve, the approved contract becomes the pinned `committed` object — the debug loop's
drift-pinning (orchestrator.ts:507-557) already enforces it downstream. A revise re-plan gets
one round (`max_rounds:2` total), then auto-approves the latest plan.

---

## F4 — SEED clarification interview (P2)

**Placement:** in `runResearch` before `createThread`'s first `runLoop` entry — iteration 0
only, once per thread (`refinedQuestion` presence = already done; survives crash/resume).

**Generation:** one cheap spawn (`grd-hypothesizer` in CLARIFY mode, new
`buildClarifyPrompt(question, groundingPack)` in `_prompts.ts`) that emits `__CLARIFY__` JSON —
questions ONLY for dimensions actually ambiguous, each with a recommended concrete default:

| dimension | ask shape |
|---|---|
| metric   | "What measurable quantity decides success?" (candidate metricKeys from grounding) |
| scope    | "Which component/system boundary is under test?" |
| baseline | "Compare against what?" (current impl / naive / published number / none) |
| dataset  | "What data/fixture/environment?" (repo fixture / synthetic / named dataset) |

Zero ambiguous dimensions → no checkpoint, straight to HYPOTHESIZE (the common case for
well-formed questions must cost one spawn, zero pauses). Answers are folded into
`thread.refinedQuestion` ("<question> [metric: …; scope: …; baseline: …; data: …]") which
HYPOTHESIZE/DESIGN prompts and the grounding query use; `thread.question` stays verbatim for
provenance. Max 4 questions, max 2 rounds, dedupe by ask text.

---

## F5 — HYPOTHESIZE candidate selection (P3 — biggest surface change)

Prompt/parser change: `buildHypothesizePrompt` gains an N>1 mode emitting `__HYPOTHESES__`
(array of `{statement, rationale, risk, predictedOutcome}`, ranked, ≤ `hypothesis_candidates`);
`parseHypothesisOutput` grows `parseHypothesesOutput` (keep the old single-block parser as the
N=1 path — zero behavior change when interactive off). Checkpoint type `selection`:

```
q1  ask: "Which hypothesis should iteration {i} test?"
    options: one per candidate —
      label: "{Hn}: {statement ≤80ch}"
      description: "rationale: … | risk: …"
      recommended: rank 1
    freeform: true   // "Other" → user-authored statement, rationale "user-provided"
```

Only the chosen candidate is appended to the ledger (unchosen ones live only in the checkpoint
file — they are NOT hypotheses, so no ledger/verdict pollution). Skipped paths (seeded
synthesis hypothesis, crash-recovery `resumable`, execute-gate resume) bypass this checkpoint —
they already carry a committed hypothesis.

## F5b — DECIDE branch checkpoint (P2)

**Placement:** after LEARN/re-survey, before `shouldTerminate` is acted on (orchestrator.ts:
602-613) — only when the loop would CONTINUE (`branch !== 'finalize' && !term.done`); a
terminal verdict finalizes without asking (kg_write gate already covers persistence). Type
`branch`, single question, single round (no re-ask):

```
q1  ask: "Iteration {i}: {verdict}. Continue?"
    context: "{metricKey}={value} vs target {comparator} {target} | takeaway: {content ≤200ch}
              | iterations {i+1}/{max} | plateau: {yes/no} | budgetUsed: {n}"
    options:
      - "Continue — revise hypothesis"  (recommended unless plateau detected)
      - "Pivot — re-ground and broaden" (sets pendingPivot=true; recommended when plateau)
      - "Stop — finalize as exhausted"  (term path; FINDING.md written, kg gate as usual)
      - "Adjust budget"                 (freeform: new maxIterations)
```

---

## F6 — AI-panel fallback (P3)

In autonomous runs with `fallback:"panel"`, the checkpoint is answered without pausing:
the resolver formats `ck.context + questions` and calls `resolveElicitation(question, context,
{participants, synthesizer, cwd})` (`lib/discussion.ts:1205` — already returns a synthesized
decision string; participants from `discussion` config). Panel answer is matched to an option
label (fuzzy: exact → prefix → recommended default on no match), recorded
`answeredBy:'panel'`. Panel unavailable/empty → recommended defaults (`answeredBy:'default'`).
Because `resolveElicitation` is sync-spawning and degrade-safe (returns `''` on failure), no
new failure modes enter the loop. Checkpoint files are still written — the audit trail is
identical whether a human, panel, or default answered.

---

## Skill/CLI UX (`commands/research.md`)

```
gd research "<q>" [--interactive] ...        # --interactive = one-shot interactive.enabled
  → exits with {status:"paused", pendingCheckpoint:{...}}         (JSON, --raw human text)
skill: parse pendingCheckpoint → AskUserQuestion (all questions one call, ≤4,
       recommended option FIRST labeled "(Recommended)", dedupe by ask text vs
       answers already given this run — plan-phase §9 verbatim)
     → write answers JSON to temp file
     → gd research resume <id> --answers <file>
     → repeat until status ∉ {paused}
gd research status <id>                       # shows pendingCheckpoint id + point + ask
```

`commands/research.md` (39 lines today) grows a "## Interactive steering" section with this
loop; the existing gate-resume instructions are unchanged (a `pendingGate` pause without a
checkpoint resumes exactly as today).

## Bounds (summary)

- ≤4 questions/round, ≤2 rounds per point per iteration; DECIDE = 1 round.
- Dedupe by question ask TEXT across rounds (never by id).
- Resume without `--answers`, round exhaustion, panel failure → recommended defaults. Every
  question MUST carry exactly one `recommended:true` option — enforced at emit time.
- SEED interview once per thread; total checkpoint pauses per thread ≤ 1 + maxIterations × 3.
- Interactive off / autonomous / autopilot / --no-gates / portfolio-concurrent → zero new
  spawns except the single SEED clarify spawn (also off unless `interactive.enabled`).

## Priorities & touch list

| P | Feature | Files |
|---|---|---|
| P1 | F1 core plumbing | types.ts, checkpoints.ts (new), orchestrator.ts, research/index (cmdResearchResume), bin/grd-tools.ts |
| P1 | F2 config | orchestrator.ts (readInteractiveConfig), grd:settings skill |
| P1 | F3 DESIGN approval | orchestrator.ts GATE-1 site, _prompts.ts, commands/research.md |
| P2 | F4 SEED interview | _prompts.ts, agent-io.ts, orchestrator.ts (runResearch pre-loop) |
| P2 | F5b DECIDE branch | orchestrator.ts DECIDE site |
| P3 | F5 HYPOTHESIZE selection | _prompts.ts, agent-io.ts, orchestrator.ts |
| P3 | F6 panel fallback | checkpoints.ts ↔ lib/discussion.ts (reuse resolveElicitation) |

Tests mirror: `tests/unit/research/checkpoints.test.ts` + orchestrator gate-path extensions
(injected spawn/runner per repo testing convention).
