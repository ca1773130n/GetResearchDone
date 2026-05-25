# Autoresearch Loop — Closed-Loop Spine (Thin Vertical Slice)

**Date:** 2026-05-25
**Status:** Design approved; ready for implementation planning
**Scope:** Sub-project 1 of ~4 in the "research part" of GRD

---

## 1. Background & motivation

GRD's original purpose was a **harness for agentic autoresearch** — a long-running agent
that does scientific problem solving in a feedback loop: understand the literature, extract
insights, form a hypothesis, set up an experiment environment and evaluation, learn from
results, and iterate on environment / data / method / hypothesis.

GRD today has strong research *scaffolding* but it is a **research-informed
software-engineering phase loop**, not a true scientific loop:

- `grd-surveyor` → `LANDSCAPE.md`, `grd-deep-diver` → `PAPERS.md` (literature)
- `grd-eval-planner` → tiered `EVAL.md`, `grd-eval-reporter` → `BENCHMARKS.md` (measurement)
- `grd-knowledge-miner` → `KNOWHOW.md`, dead-ends registry → `DEAD-ENDS.md` (learning)

The genuinely missing pieces:

1. **No first-class hypothesis** — hypotheses exist only as side-fields in
   `VERIFICATION.md` / `experiment.yaml`; nothing generates, ranks, or tracks lineage.
2. **No closed hypothesis → experiment → result → revised-hypothesis loop** —
   `/grd:iterate` is human-gated and SE-shaped.
3. **No accumulating cross-project knowledge** — KNOWHOW/DEAD-ENDS reset per project;
   there is no ontology / knowledge graph that compounds across projects.

### Reuse of existing sibling projects

Three sibling projects each supply one missing organ:

| Capability | Source project | Mechanism reused |
|---|---|---|
| Accumulating cross-project memory | **LLM-Wiki / Tesserae** | Typed knowledge graph, reused **via its MCP server** |
| Closed autonomous loop template | **HypePaper** | `run_autopilot`: problem → hypothesis → plan → execute → analyze → branch (SUPPORTED/REFUTED) → revise/draft |
| Sandboxed experiment execution | **HypePaper** | `layer3_executor` (Docker/subprocess) — deferred to sub-project #4 |
| Self-improvement from takeaways + failure taxonomy | **Agented** | Typed takeaways + H2/H3/H4 failure classification; observe → extract → propose → validate → apply → audit |
| **Measure result vs baseline/target (the fitness step)** | **GRD itself** | `grd-eval-reporter` + `BENCHMARKS.md` |

The key synthesis: **Agented's evolution loop has no fitness step** (it cannot measure
whether a change helped) — and that is exactly GRD's strength (`eval-reporter` quantifies
result vs baseline/target). Bolting Agented's takeaway/failure extraction onto GRD's eval
measurement yields a **fitness-closed feedback loop**. Tesserae is the memory that makes it
compound across projects. HypePaper is the orchestration template.

---

## 2. Decisions taken in brainstorming

1. **Architecture: hybrid.** Reuse **Tesserae over its MCP** for the knowledge graph (do
   not port it). Delegate heavy experiment execution to a **sandboxed runner**.
2. **First slice: the closed-loop spine as a thin vertical slice** — prove the loop closes
   and compounds end-to-end with each station minimal, then deepen each station in later
   cycles.
3. **Placement: a new parallel loop + artifact** — `gd research "<question>"` with a
   persistent `.planning/research/threads/<id>/` "research thread" (analogous to
   `gd autopilot`, not bent into the SE-phase model).
4. **Autonomy: autonomous + checkpoint gates** — runs hands-off up to a
   max-iterations/budget cap (reusing GRD's scheduler + budget-pressure infra), pausing only
   at two default-on gates: before executing experiment code, and before writing findings to
   the shared cross-project KG.
5. **Experiment execution (thin slice): pluggable runner with a subprocess-in-repo default.**
   Docker isolation is deferred to sub-project #4.

### The larger decomposition (later cycles)

This spec covers **sub-project 1: the closed-loop spine**. The remaining sub-projects, each
its own design → plan → implementation cycle:

2. First-class hypothesis artifact + insight→hypothesis pipeline (deepen `HYPOTHESIZE`)
3. Closed scientific loop deepening (auto-re-survey on plateau, multi-thread, paper draft)
4. Full Docker experiment sandbox (deepen `RUN`)

---

## 3. The loop (state machine)

`gd research "<question>"` creates a **research thread** that runs this loop autonomously up
to `max_iterations` / budget:

```
SEED        question + config → create thread
  │
GROUND      read prior findings: Tesserae KG (MCP query) + local LANDSCAPE/KNOWHOW
  │
HYPOTHESIZE generate ONE ranked, testable hypothesis (steered by prior results on re-loop)
  │
DESIGN      experiment plan: procedure + metric + predicted outcome + pass/fail threshold
  │
 [GATE 1: execute experiment code?] ──denied──▶ pause/persist (resumable)
  │
RUN         pluggable runner → sandboxed execution → structured result.json
  │
MEASURE     grd-eval-reporter: result vs baseline/target → verdict
  │
LEARN       extract takeaway (typed, Agented-style) + classify failure (H2/H3/H4)
  │
DECIDE      SUPPORTED → finalize │ REFUTED/INCONCLUSIVE → revise hypothesis, loop
  │
 [GATE 2: write finding to shared cross-project KG?] ──denied──▶ local-only
  │
PERSIST     append hypothesis ledger + write finding (→ Tesserae source)
  │
  └─▶ loop until SUPPORTED | max_iterations | budget exhausted
        │
FINALIZE    FINDING.md (verdict, evidence, takeaways, open questions)
```

**Key properties**

- **A failed experiment is not a failed loop** — failure classification *is* a takeaway that
  steers the next hypothesis (the Agented insight).
- **Fitness-closed** — `MEASURE` (GRD's existing eval) is the fitness step Agented lacks.
- **Compounds** — `GROUND` reads what prior threads/projects learned; `PERSIST` writes back.
- Both gates default-on; everything between runs hands-off.

---

## 4. Artifact layout

```
.planning/research/threads/<thread-id>/        # id = slug(question) + short hash
├── THREAD.md          # frontmatter = machine state (resumable):
│                      #   id, question, status, iteration, max_iterations,
│                      #   gates{execute, kg_write}, budget_used,
│                      #   model_profile/token_profile, current_station, pending_gate
│                      # body = human-readable run log
├── HYPOTHESES.md      # the hypothesis LEDGER (the heart of the thread)
│                      #   per entry: id(h1,h2…), iteration, statement, rationale,
│                      #   predicted_outcome, status(open/testing/supported/refuted/
│                      #   inconclusive/superseded), parent_id (lineage), verdict
├── experiments/<iter>/
│   ├── PLAN.md        # procedure, metric, pass/fail threshold, runnable block(s)
│   ├── result.json    # metrics, exit status, runner type, duration, stdout excerpt
│   └── RUN.md         # human log of the run
├── TAKEAWAYS.md       # typed takeaway ledger (Agented-style, file-based):
│                      #   kind, content, confidence, evidence, failure_class(H2/H3/H4),
│                      #   suggested_target, applied
├── FINDING.md         # final structured finding (written at FINALIZE)
└── kg.json            # Tesserae node IDs read (grounding) + written (provenance)
```

`status` values: `active` / `paused` / `supported` / `exhausted` / `error` / `abandoned`.

The hypothesis ledger is **append-only with lineage** (`parent_id`) so a refuted `h1` →
revised `h2` is traceable — mirroring Tesserae's `superseded_by` idea locally.

Machine state lives in `THREAD.md` frontmatter (GRD-idiomatic, parseable via `lib/state`
patterns) rather than a separate `state.json`. Thin slice runs **one active thread at a
time**.

---

## 5. Agents (2 new, 2 reused)

GRD's pattern is command-orchestrates-agents: the `gd research` command drives a
deterministic state machine that spawns per-station agents via the existing scheduler.

| Station | Agent | New/Reuse | Notes |
|---|---|---|---|
| GROUND + HYPOTHESIZE + revise | **grd-hypothesizer** | **NEW** | Reads Tesserae KG (MCP `search_nodes`/`ask`/`node_context`) + LANDSCAPE/KNOWHOW; emits/revises one ranked testable hypothesis. Reasoning core (effort: high). Borrows `grd-phase-researcher` patterns. |
| DESIGN + RUN | **grd-experiment-runner** | **NEW** | Writes `PLAN.md` + experiment script, executes via the pluggable runner, captures `result.json`. Reuses `grd-executor` execution patterns (effort: medium). |
| MEASURE | **grd-eval-reporter** | **REUSE** | Already computes result vs baseline/target → verdict. Fed `result.json` + thread EVAL targets. |
| LEARN | **grd-knowledge-miner** | **REUSE + extend** | Already mines patterns → KNOWHOW. Extend output schema with typed-takeaway + failure-class (H2/H3/H4). |

**Decision:** LEARN reuses `grd-knowledge-miner` (extended) rather than a dedicated
`grd-takeaway-miner` — leaner, at the cost of coupling research-takeaways to the miner's
schema. Revisit if the schemas diverge.

---

## 6. Orchestration (deterministic TypeScript)

New `lib/research/` (mirroring `lib/evolve/`):

- `index.ts` — the loop driver (state machine: transitions; spawns station agents via the
  existing scheduler)
- `thread.ts` — thread CRUD + frontmatter parse/save (reuses `lib/state` patterns)
- `ledger.ts` — hypothesis ledger parse/format + lineage
- `runner.ts` — **pluggable runner** (subprocess default; Docker slot for sub-project #4)
- `gates.ts` — checkpoint gates (reuses `confirmation_gates` config)
- `verdict.ts` — verdict→branch + termination + plateau detection

Plus `bin/research.js` (tsx entry) + `commands/research.md` (the `/grd:research` skill).

Mechanical work (transitions, ledger writes, gate checks, termination, budget) stays
deterministic TypeScript; only the four LLM-shaped stations are agents.

CLI surface (thin slice):

- `gd research "<question>" [--max-iterations N] [--no-gates]` — start a thread
- `gd research resume <id>` — resume a gate-paused / error thread
- `gd research status [<id>]` — show thread state / list threads

---

## 7. Tesserae KG integration

Tesserae's MCP surface is **read-only** (`search_nodes`, `ask`, `node_context`,
`search_facts`, `timeline`, `fresh_insights`, `find_session_findings`, …). There is **no
`upsert_node` MCP tool** — Tesserae is a *compiler* that accumulates knowledge by extracting
a graph from source documents and session transcripts. The two directions are therefore
asymmetric:

### READ (GROUND) — synchronous, direct

`mcp__…tesserae__search_nodes` / `ask` / `node_context` query prior findings for the
question. Always available. Results recorded in `kg.json` for provenance.

### WRITE (PERSIST) — indirect, compile-based

1. **One-time setup:** register the GRD project as a Tesserae project (`register_project`
   MCP tool — GRD is not yet in Tesserae's registry; only `tesserae` and `Agented` are).
2. PERSIST writes a **compile-ready `FINDING.md`** structured for clean extraction (explicit
   hypothesis, verdict, method, metric, evidence).
3. After GATE 2, trigger `tesserae refresh` (CLI via Bash) on the GRD project → the finding
   lands in the graph.
4. **Graceful degrade:** if the Tesserae CLI/MCP is unavailable, the finding is still written
   locally and into KNOWHOW/DEAD-ENDS; KG sync happens the next time the user runs
   `tesserae:refresh`. The loop never blocks on Tesserae.

Cross-project compounding is **eventually-consistent**, not transactional — acceptable for a
research memory and avoids coupling the loop to Tesserae's availability.

---

## 8. Gates

Reuse the existing `confirmation_gates` config.

- **GATE 1 — execute experiment code** (before RUN). Default on. On hit in autonomous mode →
  persist state to `THREAD.md`, surface `PLAN.md` + the runnable block, pause. Resume via
  `gd research resume <id>`.
- **GATE 2 — write to shared KG** (before the Tesserae compile). Default on. Denied →
  local-only (FINDING.md + KNOWHOW, no KG sync).
- Both gates are config-toggleable; a trusted unattended run can pre-approve them (matches
  `gd autopilot` semantics, exposed as `--no-gates`).

---

## 9. GRD infrastructure reused

| Concern | Reused subsystem |
|---|---|
| Agent dispatch, budget pressure, idle watchdog, account rotation, model/token tiering | `lib/scheduler` |
| Checkpoint gates | `confirmation_gates` config |
| **Local** learning mirror (works without Tesserae) | takeaways → `KNOWHOW.md`; refuted hypotheses → `DEAD-ENDS.md` |
| Result vs baseline/target | `EVAL.md` / `BASELINE.md` / `BENCHMARKS.md` via `grd-eval-reporter` |
| Pause/resume of a gate-blocked thread | `gd pause-work` / `resume-project` patterns |
| Counters | `gd metrics` — add `research.iterations_total`, `research.hypotheses_supported`, `research.hypotheses_refuted`, `research.gate_pauses`, `research.kg_writes` |

Tesserae is the **global, cross-project** memory layer; KNOWHOW/DEAD-ENDS remain the
**in-project** mirror — the loop learns and compounds locally even if Tesserae is offline.

---

## 10. Error handling

Failures are first-class research signal, not crashes.

| Failure | Handling |
|---|---|
| **Experiment run fails** (non-zero exit, crash, timeout) | Not a loop failure. Classified via Agented's taxonomy — **H2** interface / **H3** environment-contract / **H4** trajectory — recorded as a takeaway; verdict → INCONCLUSIVE. The failure-class steers the revision (e.g. H3 → fix experiment setup, not the hypothesis). |
| **Station agent dies / idle-timeout / scheduler kill** | Reuse scheduler idle watchdog + total timeout (`idleTimedOut` flag). Persist state, retry once (config), else pause with `status=error`. |
| **Budget pressure / account exhaustion** | Check pressure before each station dispatch (as `autopilot`/`evolve` do). At critical → pause `status=paused, reason=budget`; `token_profile` governs tier downgrade. |
| **Max iterations / budget exhausted, not yet supported** | Clean termination: FINALIZE writes FINDING.md with best hypothesis, `status=exhausted`, open questions + suggested next steps. |
| **Malformed agent output** (no testable hypothesis, unparseable result.json) | Validate station outputs against a schema; retry once with corrective prompt, else pause `status=error`. |
| **Plateau** (N consecutive REFUTED/INCONCLUSIVE, no metric gain) | Detect (reuse `/grd:iterate` plateau logic) → pause + suggest re-survey. (Auto-re-survey is a sub-project #3 deepening.) |
| **Injection in fetched papers / KG content** | Scan GROUND inputs with existing `gd scan` before feeding agents. |
| **Tesserae unavailable** | Local-only path; never blocks (see §7). |

---

## 11. Testing

TDD; mirrors `lib/`, honors per-file coverage thresholds in `jest.config.js`, ts-jest, 15s
timeout.

**Unit (`tests/unit/research/`)**

- `thread.test.ts` — frontmatter ↔ state round-trip, resumability fields
- `ledger.test.ts` — hypothesis parse/format, `parent_id` lineage chains, status
  transitions, supersede
- `verdict.test.ts` — verdict→branch mapping, termination (supported / max_iter / budget),
  plateau detection
- `gates.test.ts` — gate on/off, pause/persist/resume, denied→local-only
- `runner.test.ts` — subprocess execution, structured result capture, timeout,
  run-failure→H2/H3/H4 classification
- `index.test.ts` — orchestrator transitions with mocked agent dispatch (assert station
  sequence, verdict branch, termination)

**Integration (`tests/integration/`)**

- **Full loop, stubbed agents + canned experiment:** toy question, fixed script returns a
  known metric. Assert a REFUTED→revise→SUPPORTED path across 2 iterations, FINDING.md
  emitted, gates auto-approve, KNOWHOW updated, metrics counters increment.
- **Gate pause/resume:** deny GATE 1 → `status=paused` → resume from RUN.
- **Tesserae degrade:** MCP/CLI mocked-unavailable → local-only completes, KNOWHOW written,
  no error.
- **Budget pressure:** simulate critical → thread pauses instead of dispatching.

Deterministic TypeScript is the unit-test target; agent reasoning quality is covered by the
integration smoke test + manual validation.

---

## 12. Out of scope (this slice)

- Full Docker experiment sandbox (sub-project #4) — runner interface has the slot; default
  is subprocess.
- Rich hypothesis generation / ranking / insight-mining pipeline (sub-project #2) —
  thin-slice `HYPOTHESIZE` generates one hypothesis.
- Auto-re-survey on plateau, multi-thread concurrency, full paper-draft generation
  (sub-project #3) — thin-slice FINALIZE produces a structured `FINDING.md`, not a paper.
- Direct KG upsert — not supported by Tesserae; write is compile-based and
  eventually-consistent.

---

## 13. Success criteria

The thin slice is done when:

1. `gd research "<question>"` runs the full SEED→FINALIZE loop autonomously with both gates.
2. A REFUTED hypothesis produces a takeaway that steers a revised hypothesis (loop closes).
3. A SUPPORTED verdict terminates the loop and emits `FINDING.md`.
4. GROUND reads prior findings from Tesserae; PERSIST writes a compile-ready finding (or
   degrades to local-only cleanly).
5. The integration smoke test (REFUTED→revise→SUPPORTED across 2 iterations) passes.
6. Metrics counters and KNOWHOW/DEAD-ENDS reflect the run.
