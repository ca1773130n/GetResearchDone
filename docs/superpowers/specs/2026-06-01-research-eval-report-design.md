# Research Eval-Report Augmentation — Design (Slice B)

> Deferred MEASURE-station item #2: optionally augment the deterministic MEASURE
> verdict with a richer human-facing EVAL.md produced by a read-only
> `grd-research-evaluator`,
> WITHOUT letting the LLM touch the loop-controlling verdict. Spec date: 2026-06-01.

## Goal

After MEASURE computes its deterministic verdict, optionally spawn a dedicated
read-only `grd-research-evaluator` to write a per-iteration
`experiments/<iter>/EVAL.md` — a
rigorous evaluation narrative (metric-vs-target gap with sign/%, all metrics in
`result.json` not just the decision metric, delta vs the previous iteration,
reproducibility note, recommendation). Opt-in via `research_eval_report` (default
false), degrade-safe, and the deterministic verdict / branch / termination logic
is **never** altered.

## The hard constraint (why augment, not replace)

The deterministic `evaluateVerdict(plan, result)` (metricKey/comparator/target)
MUST remain the sole authority for `verdict` → `decideBranch` → `shouldTerminate`.
This is not a preference: `.planning/DEAD-ENDS.md` already records
`elo-rated-plan-tournament` as **falsified** because "the §1 thesis of
`docs/ouroboros-loop.md` is 'no LLM-judged scoring on the core path.'" Replacing
the verdict with an LLM judgment is that exact dead-end. So this slice is
strictly additive: the eval-reporter reads the already-collected numbers and
writes a report; it does not re-run experiments, score, or vote.

## Background (current state)

- MEASURE (orchestrator.ts) = `const outcome = evaluateVerdict(plan, result);`
  then `updateHypothesisStatus(...)` + verdict counter. `result.json` (written at
  RUN) holds ALL parsed metrics; `evaluateVerdict` only inspects `plan.metricKey`.
- `grd-eval-reporter` (agents/grd-eval-reporter.md) is GRD's eval specialist but
  it has `Bash`/`Write`/`Edit` and a phase-oriented role ("runs scripts", "drives
  iteration decisions"). Reusing it here is unsafe: prompt instructions alone
  cannot stop it from re-executing the experiment or directly editing
  `result.json`/ledger/finding files — which plateau-detection and
  finding-generation later re-read from disk (Codex P1b/P2b). So this slice uses
  a **new, read-only** agent instead (see below).
- Spawn contract: `spawn(prompt, agentType) → stdout`. Agent outputs are parsed
  from tagged blocks (`agent-io.ts` `extractTaggedJson` for JSON; this slice adds
  a markdown-block extractor).
- `_prompts.ts` builds the other station prompts (`buildHypothesizePrompt`,
  `buildExperimentPrompt`, `buildLearnPrompt`).

## Non-Goals

- Changing verdict/branch/terminate, or making EVAL.md feed any loop decision.
- BENCHMARKS.md, ablations, cross-thread baselines, deferred-validation tiers
  (the agent's full phase repertoire) — YAGNI for the research loop.
- Re-running the experiment (it already ran; metrics are in `result.json`).
- Wiring EVAL.md into PAPER.md / FINDING.md (possible later slice; out of scope).

## New agent: `grd-research-evaluator` (read-only)

A dedicated evaluator with `tools: Read, Grep, Glob` ONLY — no `Bash`, `Write`,
or `Edit`. It therefore cannot re-run the experiment, recompute metrics, or
mutate any loop artifact (Codex P1b/P2b are closed structurally, not by prompt).
Its sole job: read the supplied numbers and emit exactly one `__EVAL__` …
`__END_EVAL__` markdown block on stdout. The orchestrator is the only writer of
`EVAL.md`. (Agent count 26 → 27; `tests/unit/agent-audit.test.ts` updated.)

## Architecture

A new `lib/research/eval.ts`, all decomposed + unit-testable, plus a one-block
addition to the MEASURE/DECIDE flow. Default-off; when `research_eval_report:
true`:

1. MEASURE computes `outcome` deterministically (unchanged), and DECIDE computes
   `term`/`branch` from it (unchanged).
2. **After** `term`/`branch` are computed — so the control decision is already
   final and immutable — `maybeRunEvalReport(cwd, thread, plan, result, outcome,
   { spawn })` is awaited (Codex P1a: never on the control path). It:
   - reads the previous iteration's `result.json` (if any) for a baseline delta,
     degrading to "no prior comparable metric" on missing/malformed/no-match;
   - builds the prompt via `buildEvalPrompt`;
   - `spawn(prompt, 'grd-research-evaluator')`;
   - extracts the `__EVAL__`…`__END_EVAL__` block via `parseEvalReport`;
   - on a successful parse, writes `experiments/<iter>/EVAL.md` via
     `writeEvalReport` (overwrite-on-success ONLY).
   - The whole body is try/catch-wrapped: any failure (spawn throws, no block,
     write error) logs one stderr line, **leaves any prior EVAL.md intact**, and
     returns `{ wrote: false }`. It NEVER throws into the loop and NEVER touches
     `outcome`/`term`/`branch`.

The orchestrator gates the call on `readEvalReportConfig(cwd)`, which is itself
degrade-safe (returns `false` on missing/malformed/unreadable config — Codex
P2a), so even the gate cannot break the loop.

## `lib/research/eval.ts`

```ts
function readEvalReportConfig(cwd: string): boolean;        // research_eval_report, default false

function buildEvalPrompt(
  thread: ResearchThread, plan: ExperimentPlan, result: ExperimentResult,
  outcome: MeasureOutcome, prior: { iteration: number; metrics: Record<string, number> } | null,
): string;

function parseEvalReport(stdout: string): string | null;   // markdown between __EVAL__ and __END_EVAL__ (or to EOF)

function writeEvalReport(cwd: string, threadId: string, iteration: number, markdown: string): void;

function maybeRunEvalReport(
  cwd: string, thread: ResearchThread, plan: ExperimentPlan, result: ExperimentResult,
  outcome: MeasureOutcome, deps: { spawn: SpawnFn },
): Promise<{ wrote: boolean }>;
```

- `readEvalReportConfig`: raw-read `.planning/config.json` in try/catch; `true`
  only when `research_eval_report === true`; `false` on default/missing/malformed/
  unreadable (degrade-safe — Codex P2a).
- `buildEvalPrompt`: hands the agent the question, hypothesis statement, the
  decision metric (`metricKey comparator target`) and deterministic verdict, the
  FULL `result.metrics` map, `result.stdoutExcerpt`/`failureClass`, and the prior
  iteration's metrics for delta. Explicit instructions: (a) the experiment has
  ALREADY run — report on the supplied numbers, do not attempt to recompute;
  (b) the deterministic verdict is authoritative — contextualize, never
  contradict/override; (c) when `target == 0` report the absolute gap (percent is
  undefined), and respect comparator direction (which way is "better"); (d) emit
  exactly one `__EVAL__` … `__END_EVAL__` markdown block beginning with a
  metadata line `iteration=<n> metric=<key> verdict=<v>` (so a stale report is
  identifiable), then a Results table, gap, all metrics, delta-vs-prior,
  reproducibility note (the script path), and a recommendation.
- `parseEvalReport`: returns the trimmed markdown strictly BETWEEN `__EVAL__` and
  `__END_EVAL__`; returns `null` if EITHER marker is absent (Codex P3a — the
  closing marker is required, so trailing logs can't leak in).
- `writeEvalReport`: `atomicWriteFileSync` to
  `.planning/research/threads/<id>/experiments/<iter>/EVAL.md` (mkdir -p the iter
  dir defensively). Called ONLY on a successful parse, so a failed re-run leaves
  any prior EVAL.md intact (Codex P2c).
- `maybeRunEvalReport`: gate check is done by the CALLER (orchestrator) so the
  function itself is unconditional + injectable for tests; it builds prompt →
  `spawn(prompt, 'grd-research-evaluator')` → parse → (on success) write, all
  wrapped in try/catch → `{ wrote }`. Returns only `{ wrote }`; never returns or
  mutates `outcome`.

## MEASURE/DECIDE wiring (orchestrator.ts)

The verdict counter and LEARN/RE-SURVEY stay as-is. The eval pass is inserted in
the DECIDE region, AFTER `term`/`branch` are computed (so the control decision is
final before any LLM runs — Codex P1a) and before acting on them:

```ts
const term = shouldTerminate(thread, outcome.verdict);
const branch = decideBranch(outcome.verdict);
incrementCounter('research.iterations_total');

// OPTIONAL eval-report augmentation (opt-in). The control decision (term/branch)
// is already computed and is NOT read back; this only writes a human-facing
// EVAL.md and is fully degrade-safe.
if (readEvalReportConfig(cwd)) {
  await maybeRunEvalReport(cwd, thread, plan, result, outcome, { spawn });
}

if (term.done || branch === 'finalize') { /* ...unchanged finalize... */ }
```

`spawn` is the same `opts.spawn || defaultSpawn(...)` already resolved in
`runLoop`. No new options field.

## Configuration

- `research_eval_report`: `true|false`, default `false`. Registered in
  `KNOWN_CONFIG_KEYS` (`lib/utils.ts`).

## Files

- **Create** `agents/grd-research-evaluator.md` — read-only evaluator (`tools:
  Read, Grep, Glob`; effort medium), emits `__EVAL__`…`__END_EVAL__`.
- **Create** `lib/research/eval.ts` — the five functions above.
- **Create** `tests/unit/research/eval.test.ts`.
- **Modify** `lib/research/orchestrator.ts` — `require('./eval')`; the one gated
  `await maybeRunEvalReport` line in the DECIDE region.
- **Modify** `lib/utils.ts` — register `research_eval_report`.
- **Modify** `tests/unit/agent-audit.test.ts` — agent count 26 → 27.
- **Modify** `CLAUDE.md` — Autoresearch subsection.

## Testing strategy

Fully offline (injected `spawn`, real tmp dirs):

- `readEvalReportConfig`: default false; true only on explicit `true`; false on
  malformed/unreadable config (no throw).
- `buildEvalPrompt`: includes the decision metric+verdict, the full metrics map,
  the prior-iteration delta when supplied, the target-zero/direction note, and the
  explicit "already ran" + "verdict is authoritative" + metadata-line +
  `__EVAL__`/`__END_EVAL__` contract.
- `parseEvalReport`: extracts markdown strictly between both markers; returns null
  when `__EVAL__` OR `__END_EVAL__` is missing.
- `writeEvalReport`: writes `experiments/<iter>/EVAL.md` (creates the dir),
  content round-trips.
- `maybeRunEvalReport`: injected spawn returning a complete block → writes
  EVAL.md, `{wrote:true}`, and was called with agentType `grd-research-evaluator`;
  spawn returning no/!partial block → no write, prior EVAL.md (if any) intact,
  `{wrote:false}`; spawn that throws → swallowed, `{wrote:false}`, no throw;
  returns only `{wrote}` (never `outcome`).
- Orchestrator: with `research_eval_report:true` + an injected spawn that returns
  an `__EVAL__` block, a finalized thread has `experiments/<iter>/EVAL.md` AND the
  verdict/status is byte-identical to the same run with the flag off (proves
  augment-only); with the flag off (default), no EVAL.md and no
  `grd-research-evaluator` spawn occurs; existing orchestrator tests stay green.
- `agent-audit`: the new agent passes the audit (count 27, valid frontmatter,
  read-only toolset).

## Known limitations

- One extra LLM spawn per iteration when enabled (hence opt-in/default-off).
- The eval narrative is advisory; nothing downstream consumes EVAL.md yet
  (a later slice could fold it into FINDING.md/PAPER.md).
- Baseline delta is vs the immediately-previous iteration only (cheap, single
  `result.json` read); no cross-thread or historical baselines.
