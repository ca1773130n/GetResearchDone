# v0.5.0 Interactive Research Steering — Architecture & Integration Map

Brownfield integration research: how checkpoints thread through the existing autoresearch
loop. All line references are against the current `main` (post-0.4.16).

---

## 1. How the existing gates pause threads today

### 1.1 Gate resolution & check — `lib/research/gates.ts`

- `gates.ts:8-15` `resolveGates(config, noGates)` → `ThreadGates { execute, kg_write }`.
  Both default **on** (`!== false`); `--no-gates` forces both off.
- `gates.ts:17-25` `checkGate(thread, gate, approved)` is a pure function:
  `proceed: true` when the gate is off **or** a one-shot `approved` flag is set; otherwise
  returns a *copy* of the thread with `status: 'paused', pendingGate: gate`. The caller
  `Object.assign`s the copy back and saves.

### 1.2 The two pause points — `lib/research/orchestrator.ts`

- **GATE 1 (execute)** `orchestrator.ts:479-487`: fires *after* DESIGN persisted
  `experiments/<iter>/plan.json` (`:477`) and *before* RUN. On pause:
  `currentStation = 'run'`, `saveThread`, `incrementCounter('research.gate_pauses_total')`,
  return `{ status: 'paused', paused: true, pendingGate: 'execute' }` (`ResearchResult`,
  `orchestrator.ts:72-81`).
- **GATE 1 re-check in the debug loop** `orchestrator.ts:526-532`: `checkGate(thread,
  'execute', false)` — with the gate on it *denies and degrades* (never pauses mid-RUN,
  never executes an unapproved rewritten script). Checkpoints must preserve this property.
- **GATE 2 (kg_write)** `orchestrator.ts:622-628`: fires at FINALIZE *after* FINDING.md is
  written (`:620`). On pause: `currentStation = 'persist'`, same paused return shape.

### 1.3 Thread state on disk — `lib/research/thread.ts`

`.planning/research/threads/<id>/` (`THREADS_REL`, `thread.ts:8`):

| File | Writer |
|---|---|
| `thread.json` | `saveThread` `thread.ts:88-93` — the whole `ResearchThread` (types.ts:18-36) |
| `THREAD.md` | `renderThreadLog` `thread.ts:69-86` (human mirror, regenerated every save) |
| `ledger.jsonl` (hypotheses) | `lib/research/ledger.ts` append-only |
| `takeaways.jsonl` | `lib/research/takeaways.ts` |
| `experiments/<iter>/plan.json`, `result.json`, `debug-attempt-<n>.json` | orchestrator `:477,:496,:530,:563` |
| `FINDING.md` | `writeFinding` at FINALIZE `:620` |

`ResearchThread` pause-relevant fields (`types.ts:18-36`): `status: ThreadStatus`
(`'paused'` is a first-class status), `currentStation: Station`, `pendingGate:
'execute' | 'kg_write' | null`. `loadThread` (`thread.ts:64-67`) is a bare
`JSON.parse` — **no schema migration layer exists**; new fields must be optional.

### 1.4 Resume path — `resumeResearch` `orchestrator.ts:647-672`

1. `loadThread`; terminal statuses (`supported|exhausted|abandoned`) short-circuit (`:650-657`).
2. `--no-gates` on resume force-disables both gates (`:658-660`).
3. `pending = thread.pendingGate`; clear it, `status = 'active'`, save (`:661-662`).
4. `pending === 'kg_write'` → `finishKgSync` directly (`:663-670`) — FINDING.md already exists.
5. Else → `runLoop(..., { execute: pending === 'execute', kg_write: false })`.

Inside `runLoop`, the **execute-resume re-entry** is `orchestrator.ts:410-414`: find the
`'testing'` hypothesis for the current iteration + existing `plan.json` → reuse both, consume
`approved.execute` (one-shot). Crash recovery (hyp without plan) is `:424-430`. CLI wiring:
`bin/grd-tools.ts:2260-2289` (parses `--no-gates`, `--max-iterations`) →
`cmdResearchResume` `lib/research/cli.ts:29-34`.

### 1.5 Where SEED / HYPOTHESIZE / DESIGN / DECIDE happen

| Station | Where | Notes |
|---|---|---|
| SEED | `createThread` sets `currentStation: 'seed'` (`thread.ts:54`); seeded-hypothesis adoption check `orchestrator.ts:416-423` | `lib/research/seed.ts` pre-creates threads from synthesis candidates |
| GROUND | implicit — `retrieveFn` + `buildGroundingPack` inside HYPOTHESIZE (`:441-445`); the `'ground'` station value is never written today | |
| HYPOTHESIZE | `:431-460` — station set `:434`, spawn `grd-hypothesizer`, parse `__HYPOTHESIS__`, `appendHypothesis` `:459` | exactly ONE hypothesis today (`_prompts.ts` contract) |
| DESIGN | `:462-477` — station set `:463`, spawn `grd-experiment-runner`, parse `__PLAN__`, write `plan.json` | metric contract (metricKey/comparator/target) is committed here |
| RUN | `:489-565` incl. bounded debug loop; contract pinned `:507-557` | |
| MEASURE | `:567-571` — `evaluateVerdict(plan, result)` — **deterministic verdict** | |
| LEARN | `:573-585` | |
| DECIDE | `:602-613` — `shouldTerminate` + `decideBranch`; **no station write today** (the `'decide'` Station value is unused) | |
| FINALIZE/PERSIST | `:613-630` | |

### 1.6 How `commands/research.md` surfaces pauses today

`commands/research.md` (39 lines) just shells to
`node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js research $ARGUMENTS` and documents
`resume <id>`. There is **no interactive protocol** — the skill layer sees the JSON
`{ paused: true, pendingGate: 'execute' }` and (by convention) tells the user to review
`plan.json` and run `gd research resume <id>`. This is the surface we extend.

### 1.7 The in-repo checkpoint precedent — plan-phase clarification

`commands/plan-phase.md`:
- `:248-260` — `clarification_allowed` resolved once: `research_gates.plan_clarification
  // true` AND NOT `autonomous_mode` AND NOT autopilot AND NOT `--candidates N>1`.
- `:348-360` — planner returns `## CHECKPOINT REACHED` / `TYPE: clarification` with
  `<question>` blocks → orchestrating skill calls **AskUserQuestion** (all questions in one
  call, max 4, `<option recommended="true">` listed first + "(Recommended)"), max **2
  rounds**, de-duped by question TEXT (not id), then spawns a continuation carrying
  `## Decisions` marked LOCKED (`:476-503`).

This is exactly the split we need: **the spawned worker cannot ask; it emits a typed block
and the skill layer asks.** For v0.5.0 the "worker" is the TS orchestrator process, so the
typed block becomes a typed *pause record* in `thread.json` + the `ResearchResult`.

### 1.8 Multi-backend discussion — `lib/discussion.ts`

- `BACKEND_CLI_MAP` `:142-177` — dispatchable backends: `claude`, `codex`, `gemini`,
  `opencode`. `dispatchToBackend` `:194` is **synchronous** (`execFileSync`, default 5-min
  timeout, structured error instead of throw) → callable inline from the orchestrator.
- `runDiscussion(topic, participants, opts)` `:380-457` — rounds clamped 1..3, sequential
  `dispatchRound` `:351-363` (unavailable backends → `{skipped, reason}`), synthesizer
  (default `'claude'`) synthesizes after each round, writes
  `discussion-<phase>-<type>-<ts>.md` under `discussionsDir(cwd, milestone)`.
- **Meta-backend exclusion precedent**: `resolveReviewer` `:123-136` —
  `requireDifferentFromPrimary` rejects a reviewer equal to `config.backend` (the backend
  running the session). Checkpoint panels should exclude the loop's own spawn backend the
  same way.
- **Elicitation trio** (the fallback engine to reuse): `detectElicitation` `:878`,
  `buildElicitationContext(question, {cwd, phase, milestone})` `:1087-1190` (budgeted
  context: question / phase goal / plan summary / git diffstat / STATE.md),
  `resolveElicitation(question, context, {participants, synthesizer, cwd})` `:1205-1255` —
  single-round discussion, returns synthesis text (fallback: first non-skipped response;
  `''` when nothing available).

---

## 2. Proposed integration design

### 2.1 One checkpoint mechanism, two answerers

A **checkpoint** is a typed pause record stored on the thread, structurally parallel to
`pendingGate` but carrying questions/options/answers. Answerer A: the human, via
`commands/research.md` + AskUserQuestion + `gd research resume --answers`. Answerer B: an
AI panel via `resolveElicitation` — answered **inline** (no pause) because `discussion.ts`
is synchronous.

### 2.2 Schema additions (all optional → old threads keep resuming)

`lib/research/types.ts` — new types + additive fields:

```ts
export type CheckpointKind =
  | 'clarify_question'   // SEED
  | 'choose_hypothesis'  // HYPOTHESIZE
  | 'approve_design'     // DESIGN (pre-execute-gate)
  | 'decide_continuation'; // DECIDE

export interface CheckpointOption { label: string; detail?: string; recommended?: boolean; }
export interface CheckpointQuestion {
  id: string;                 // per-checkpoint label (plan-phase precedent: not stable across rounds)
  ask: string;
  options: CheckpointOption[]; // recommended option FIRST
  allowFreeform?: boolean;
}
export interface CheckpointAnswer { questionId: string; answer: string; }
export interface Checkpoint {
  id: string;                 // `${kind}-i${iteration}-r${round}`
  kind: CheckpointKind;
  station: Station;
  iteration: number;
  round: number;              // per-kind round counter, cap 2 (plan-phase precedent)
  createdAt: string;
  questions: CheckpointQuestion[];
  context?: string;           // short rendered summary (candidates / plan contract / verdict)
  status: 'pending' | 'answered' | 'skipped';
  answers?: CheckpointAnswer[];
  answeredBy?: 'human' | 'discussion';
  answeredAt?: string;
  discussionFile?: string;    // when answeredBy === 'discussion'
}

// ThreadGates — additive optional flags (old thread.json lacks them → undefined → off):
export interface ThreadGates {
  execute: boolean; kg_write: boolean;
  seed_clarify?: boolean; hypothesis_select?: boolean;
  design_approve?: boolean; decide_approve?: boolean;
}

// ResearchThread — additive:
//   pendingCheckpoint?: Checkpoint | null;   // set while paused-on-checkpoint
//   checkpointRounds?: Partial<Record<CheckpointKind, number>>; // 2-round caps
```

**Deliberate choice: do NOT widen `pendingGate`.** `pendingGate` stays
`'execute' | 'kg_write' | null` — every existing branch (`resumeResearch :661-671`, seeded
adoption `:420`, portfolio pause accounting, tests) keys off it. Checkpoints get a
*parallel* field, `pendingCheckpoint`. Old threads deserialize with it `undefined` → every
new branch is skipped → **byte-for-byte old behavior**. Answered checkpoints are appended
to `checkpoints.jsonl` in the thread dir (mirrors `ledger.jsonl`); `thread.json` holds only
the pending one. `renderThreadLog` (`thread.ts:69-86`) gains a guarded
`- **pending checkpoint:** kind (n questions)` line.

`ResearchResult` (`orchestrator.ts:72-81`) — additive:
`pendingCheckpoint?: Checkpoint` (so the skill layer renders AskUserQuestion straight from
the CLI JSON without re-reading `thread.json`).

### 2.3 Config — `.planning/config.json`

```jsonc
"research_gates": {
  "experiment_execution": true,      // existing
  "kg_write": true,                  // existing
  "plan_clarification": true,        // existing (plan-phase, skill-layer only)
  "seed_clarification": false,       // NEW — all four default OFF (brownfield: no behavior change)
  "hypothesis_selection": false,     // NEW
  "design_approval": false,          // NEW
  "decide_approval": false           // NEW
},
"research_checkpoint_answerer": "human" | "discussion" | "skip"  // NEW, default "human"
```

`resolveGates` (`gates.ts:8-15`) maps them into `ThreadGates`; `noGates` zeroes all six
(preserves the documented `--no-gates` = fully unattended contract). A new
`checkCheckpointGate(thread, kind)` helper lives beside `checkGate` in `gates.ts`.

**Auto-skip matrix** (milestone requirement "full-autopilot behavior unchanged"):
- `--no-gates` → all checkpoint gates off (via `resolveGates`, and forced off on resume at
  `orchestrator.ts:658-660` exactly like today).
- `autonomous_mode` / autopilot → the *skill layer* passes `--no-gates` today already for
  autopilot research; additionally the orchestrator downgrades `answerer: 'human'` to
  `research_checkpoint_answerer` fallback (`'discussion'` if configured, else skip) when
  `autonomous_mode: true` in config — same one-time resolution pattern as
  plan-phase.md:248-260.
- `runPortfolio` (`lib/research/portfolio.ts`, concurrent threads) → forces
  `answerer != 'human'` (a human cannot answer N concurrent interviews; paused threads
  already count in `PortfolioResult.paused` and are resumable individually).

### 2.4 Checkpoint emission points in `runLoop`

Each point follows the GATE 1 template (`:479-487`): build `Checkpoint`, set
`thread.pendingCheckpoint`, `status='paused'`, keep `pendingGate=null`, save, increment
`research.checkpoint_pauses_total`, return
`{ status:'paused', paused:true, pendingCheckpoint }`. If `answerer === 'discussion'`,
instead call the new `answerViaDiscussion(checkpoint, cwd)` (wraps
`buildElicitationContext` + `resolveElicitation`, one question per call or a combined
prompt), record `answeredBy:'discussion'` + `discussionFile`, append to
`checkpoints.jsonl`, and **fall through without pausing**.

1. **SEED — `clarify_question`** (pre-loop, in `runResearch` `:636-645` after
   `createThread`, before `runLoop`): spawn a lightweight "question critic" prompt
   (new `buildSeedClarifyPrompt` in `_prompts.ts`; output contract `__CHECKPOINT__ {json}`
   or `__OK__`, parsed by a new `parseCheckpointOutput` in `agent-io.ts`). If the critic
   finds the question well-specified → no checkpoint. Answers are folded into a
   `thread.questionNotes?: string[]` (additive field) that `buildHypothesizePrompt`
   `:447` includes — the original `thread.question` string is never mutated (it seeds
   `threadId`, `thread.ts:14-18`). Skipped entirely for seeded threads
   (`seededFrom` set — the question came from synthesis, already curated).
   *The richer pre-loop socratic interview stays at the skill layer* (§2.6), mirroring
   discuss-phase; this in-orchestrator gate is the thin version for `gd`-CLI-only users.
2. **HYPOTHESIZE — `choose_hypothesis`** (between parse `:450` and `appendHypothesis`
   `:459`): when the gate is on, `buildHypothesizePrompt` asks for **up to 3 ranked
   candidates** (`__HYPOTHESES__` JSON array; `parseHypothesisOutput` grows a
   multi-candidate mode — single `__HYPOTHESIS__` stays the default contract when the gate
   is off, zero drift for existing tests). Checkpoint options = candidate statements,
   rank-1 `recommended`. Pause **before** anything is appended to the ledger; the
   candidates are persisted in the checkpoint record itself. On resume, append only the
   chosen one (freeform answer → treat as a user-authored statement, rationale
   "user-provided at checkpoint"). Skipped when a seeded hypothesis is adopted (`:416-423`).
3. **DESIGN — `approve_design`** (immediately before GATE 1, after `plan.json` written
   `:477`): options `Approve (Recommended) / Revise (freeform feedback) / Abort thread`.
   `Approve` → proceed into `checkGate('execute', ...)` unchanged (a human may face two
   stops here if both gates are on; when `design_approval` is on we treat an explicit
   Approve answer as covering the execute gate too — pass `approved.execute = true` —
   since the human just reviewed the exact plan.json the execute gate protects).
   `Revise` → re-run DESIGN with feedback appended (round cap 2, then proceed with the
   last plan). `Abort` → `thread.status='abandoned'`, save, return.
4. **DECIDE — `decide_continuation`** (after `term`/`branch` computed `:602-604`, only when
   `!term.done && branch !== 'finalize'`): options `Continue iterating (Recommended) /
   Stop and finalize / Pivot (re-ground next hypothesis)`. `Stop` → jump into the
   FINALIZE block (`:613-630`) with `term.status = 'abandoned'`; `Pivot` → set
   `thread.pendingPivot = true` (existing plumbing, `:437`) and continue. The verdict shown
   in the checkpoint context is the already-computed deterministic one — read-only.

### 2.5 Resume-with-answers plumbing

- CLI: `gd research resume <id> [--answers-json '<json>' | --answers-file <path>]`
  (`bin/grd-tools.ts` research arg parse near `:2260`; `cmdResearchResume`
  `cli.ts:29-34` passes `opts.checkpointAnswers`).
- `resumeResearch` (`:647-672`) gains one branch **before** the pendingGate handling:

```
if (thread.pendingCheckpoint?.status === 'pending') {
  if (!opts.checkpointAnswers) → error: "thread is paused on a checkpoint; pass --answers-file"
     (unless --no-gates: mark checkpoint 'skipped', proceed with recommended defaults)
  record answers (answeredBy:'human', answeredAt), append to checkpoints.jsonl,
  thread.pendingCheckpoint = null; status='active'; save;
  runLoop(cwd, thread, opts, config, approved, { resumedCheckpoint: <the answered record> })
}
```

- `runLoop` re-entry: each emission point first asks a tiny helper
  `consumeAnswered(resumedCheckpoint, kind, iteration)` — if the just-answered checkpoint
  matches this (kind, iteration), consume its answers instead of emitting (exact analog of
  the one-shot `approved.execute` at `:410-414`). Repro state per kind:
  - `choose_hypothesis`: candidates live inside the checkpoint record → append chosen hyp,
    continue to DESIGN.
  - `approve_design`: `plan.json` already on disk (same reuse path as `:410-414`).
  - `decide_continuation`: verdict/takeaway already persisted (ledger + takeaways.jsonl);
    re-entry lands directly at the DECIDE branch (guarded by
    `hyp.verdict !== null` for the current iteration).
  - `clarify_question`: notes folded, proceed to first iteration.

### 2.6 Skill layer — `commands/research.md`

New sections (protocol copied from plan-phase.md:248-360):
1. **Pre-loop interview** (before invoking the CLI, when not autonomous/autopilot and
   `research_gates.seed_clarification` on): socratic sharpening of the question via
   AskUserQuestion — max 4 questions, ≤2 rounds, recommended-first — then pass the
   sharpened question to `gd research`. (Skill-layer only; discuss-phase precedent.)
2. **Checkpoint loop**: run the CLI; while the JSON result has
   `paused && pendingCheckpoint`: render `pendingCheckpoint.questions` via one
   AskUserQuestion call (max 4, recommended option first + "(Recommended)", de-dupe by
   question TEXT across rounds), write answers to a temp JSON file, run
   `gd research resume <id> --answers-file <tmp>`. `paused && pendingGate` keeps today's
   behavior (show plan.json / FINDING.md, ask approve → `resume`). Cap: if the same kind
   re-pauses ≥2 times in one sitting, resume with recommended defaults (plan-phase
   `clarification_rounds >= 2` rule).

### 2.7 Discussion fallback — where it hooks in

Single hook: `answerViaDiscussion(cwd, checkpoint, cfg)` in a new
`lib/research/checkpoint.ts`, called at each emission point when the resolved answerer is
`'discussion'`. It:
- builds context with `buildElicitationContext(ask, { cwd })` (`discussion.ts:1087`) plus
  the checkpoint's own `context` string;
- picks participants = available backends from `detectAvailableBackends` **minus the
  loop's spawn backend** (`superpowers.default_backend` / scheduler backend — the
  `resolveReviewer` `requireDifferentFromPrimary` pattern, `discussion.ts:130`); if the
  exclusion empties the panel, fall back to recommended defaults (`status:'skipped'`);
- calls `resolveElicitation` (`:1205`) — synchronous, degrade-safe (`''` → recommended
  default);
- maps the synthesis text onto the option set (exact/fuzzy label match, else freeform);
- records the SAME `Checkpoint` shape with `answeredBy: 'discussion'`,
  `discussionFile: result.discussion_file`, appends to `checkpoints.jsonl`, no pause.

`discussion.ts` needs **no changes** — it is already sync, budgeted, and exports the trio
(`:1259-1275`).

### 2.8 Deterministic-verdict no-touch list (hard constraints)

| Site | Constraint |
|---|---|
| `evaluateVerdict(plan, result)` `orchestrator.ts:569`, `lib/research/verdict.ts` | No checkpoint between RUN and MEASURE. The verdict function's inputs (plan.json metric contract + result.json metrics) are never sourced from checkpoint answers. |
| Committed-contract pinning `:507-510` + drift overwrite `:547-557` | `approve_design` may alter metricKey/comparator/target **only before** the pin is taken (pre-RUN). After RUN, nothing — the DECIDE checkpoint is emitted strictly after `evaluateVerdict` + `updateHypothesisStatus` `:570` have persisted. |
| Debug-loop gate re-check `:526-532` | Unchanged; checkpoints never approve a debug re-plan (same "no fresh approval mid-RUN" rule). |
| `shouldTerminate` / `decideBranch` `:602-604` | Computed first; the DECIDE checkpoint may only *override the continuation* (stop/pivot), never rewrite `outcome.verdict`, ledger status, or takeaways already appended `:585`. |
| Reconstructability `:347-367,:620` and eval-report `:609-611` | Stay advisory/degrade-safe; no checkpoint reads them, they read no checkpoint. |
| `finishKgSync` `:370-388` | Untouched; kg_write gate semantics identical. |

### 2.9 Sequence — a paused + resumed `choose_hypothesis` checkpoint

```
user: /grd:research "Does X improve Y?"
  research.md ──▶ gd research "Does X improve Y?"
    runResearch :636 → createThread (station=seed) → runLoop
      HYPOTHESIZE :434 — gate hypothesis_selection ON, answerer=human
        spawn grd-hypothesizer (multi-candidate prompt) → 3 candidates parsed
        build Checkpoint{kind:choose_hypothesis, iteration:1, questions:[1], options:[c1★,c2,c3]}
        thread.pendingCheckpoint=cp; status='paused'; saveThread  (ledger UNTOUCHED)
        return {paused:true, pendingCheckpoint}
  research.md: AskUserQuestion(cp.questions)  ← user picks c2
  research.md ──▶ gd research resume <id> --answers-file /tmp/ans.json
    resumeResearch :647 → pendingCheckpoint pending → record {answers, answeredBy:'human'}
      append checkpoints.jsonl; pendingCheckpoint=null; status='active'
      runLoop(..., {resumedCheckpoint: cp})
        HYPOTHESIZE re-entry: consumeAnswered(cp,'choose_hypothesis',1) → append c2 to ledger
        DESIGN :463 → plan.json → [approve_design off] → GATE 1 execute (existing :479)
          gate on → status='paused', pendingGate='execute'   ← existing behavior, unchanged
  research.md: show plan.json → user approves → gd research resume <id>
    resumeResearch → pendingGate='execute' → runLoop({execute:true}) → :410 reuse hyp+plan
      RUN → MEASURE (deterministic) → LEARN → DECIDE → … → FINALIZE
(autonomous variant: at the checkpoint, answerViaDiscussion() answers inline via
 resolveElicitation — participants exclude the loop backend — answeredBy:'discussion',
 no pause; the flow above collapses to a single CLI invocation.)
```

### 2.10 Touch list

| File | Change |
|---|---|
| `lib/research/types.ts` | Checkpoint types; optional `ThreadGates`/`ResearchThread` fields |
| `lib/research/gates.ts` | extend `resolveGates`; add `checkCheckpointGate` |
| `lib/research/checkpoint.ts` (new) | build/record/consume checkpoints; `answerViaDiscussion`; `checkpoints.jsonl` IO |
| `lib/research/orchestrator.ts` | 4 emission points; `resumeResearch` answers branch; `ResearchResult.pendingCheckpoint` |
| `lib/research/_prompts.ts` | multi-candidate hypothesize prompt; seed-clarify prompt |
| `lib/research/agent-io.ts` | `parseCheckpointOutput`; multi-candidate hypothesis parse |
| `lib/research/thread.ts` | `renderThreadLog` guarded checkpoint line |
| `lib/research/cli.ts` + `bin/grd-tools.ts` | `--answers-file` / `--answers-json` on resume |
| `lib/research/portfolio.ts` | force non-human answerer |
| `commands/research.md` | pre-loop interview + checkpoint AskUserQuestion loop |
| `lib/metrics` counters | `research.checkpoint_pauses_total`, `research.checkpoint_discussion_answers_total` |
| `tests/unit/{gates,orchestrator,thread,checkpoint,cli}.test.ts` | mirrors; old-thread.json fixture must resume unchanged |

**Backward-compat proof obligations (test fixtures):** (a) a pre-0.5.0 `thread.json`
(no `pendingCheckpoint`, 2-key `gates`) resumes through both gate paths bit-identically;
(b) default config (all four new gates absent) produces zero checkpoint emissions;
(c) `--no-gates` yields today's fully-unattended run.
