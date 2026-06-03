# Autoresearch with GRD — a step-by-step tutorial

This guide takes you from zero to a finished, written-up research result using
GRD's autoresearch loop. You'll run a research thread, ground it on real
literature, let it run unattended, deepen it, and read the outputs.

- **Time:** ~20 minutes for Tutorials 1–2; the rest as you need them.
- **You write:** a research *question* and (optionally) sources to ground on.
- **GRD writes:** the hypothesis, the experiment script, the measurement, the
  takeaways, and the final write-up.

> New to GRD entirely? Read the [Quickstart](quickstart.md) first. This tutorial
> focuses only on the autoresearch loop (`gd research` and friends).

---

## Prerequisites

The loop spawns backend agents (to hypothesize, design experiments, and extract
takeaways), so two things must be in place **before** `gd research` will run:

1. **A backend CLI, installed and authenticated** — Claude Code, Codex, Gemini,
   or OpenCode. The loop shells out to it.
2. **A scheduler configured in `.planning/config.json`.** The easiest way is to
   create the project with `/grd:init`, which writes a complete `scheduler`
   block for you. If you're adding autoresearch to an existing `.planning/`
   directory, ensure it has at least:

   ```jsonc
   // .planning/config.json
   {
     "scheduler": {
       "backend_priority": ["claude"],
       "free_fallback": { "backend": "claude" },
       "prediction": { "safety_margin_tasks": 2, "window_minutes": 60, "ewma_alpha": 0.3 }
     }
   }
   ```

If the scheduler isn't configured you'll see `no scheduler available for
research loop`; if the `prediction` block is missing you'll see a
`safety_margin_tasks` error. (`/grd:init` avoids both.)

**Multiple accounts?** If you manage your AI CLI accounts with
**ai-accounts** (the local Litestar sidecar at `~/Developer/Projects/ai-accounts`,
or set `AI_ACCOUNTS_DIR`/`AI_ACCOUNTS_URL`), run
`gd accounts sync` — it discovers your registered, ready accounts and writes the
`superpowers.accounts` rotation block + a scheduler block for you (so you don't
hand-edit config dirs). `gd accounts discover` previews without writing. The loop
then rotates across accounts and skips ones that hit a rate limit automatically.
(Needs the ai-accounts API running: `just playground-api` in its repo — that's
the sidecar API only; `just playground` additionally starts the Vite browser UI,
which GRD doesn't need.)

---

## 0. What the loop actually does

`gd research "<question>"` runs a hypothesis-centric scientific cycle to a
verdict, persisting everything under `.planning/research/threads/<id>/`:

```
SEED → GROUND → HYPOTHESIZE → DESIGN → RUN → MEASURE → LEARN → DECIDE → PERSIST → FINALIZE
```

| Station | What happens |
|---|---|
| **SEED** | Create the thread + initial state from your question |
| **GROUND** | Read prior findings from the knowledge graph (+ a hybrid-retrieval pack) |
| **HYPOTHESIZE** | Generate **one** ranked, testable hypothesis with a predicted outcome |
| **DESIGN** | Write an experiment plan (`metric`, `comparator`, `target`) + a runnable script |
| **RUN** | Execute the script (subprocess or Docker) — **behind the execute gate** |
| **MEASURE** | Compare the measured metric to the target → **deterministic** verdict |
| **LEARN** | Extract a typed takeaway (with H2/H3/H4 failure classification) |
| **DECIDE** | `supported` → finalize; `refuted`/`inconclusive` → revise the hypothesis and loop |
| **PERSIST** | Write `FINDING.md`; sync to the shared KG — **behind the kg_write gate** |
| **FINALIZE** | Set the terminal verdict; promote learnings to `KNOWHOW.md` / `DEAD-ENDS.md` |

Two things make this trustworthy:

- **The verdict is deterministic.** MEASURE compares a number to a target. No LLM
  decides whether your hypothesis was supported. (An LLM *eval narrative* is
  available as an opt-in augmentation — see §6 — but it never touches the verdict.)
- **Two checkpoint gates** pause the loop before it does anything consequential:
  before running generated experiment code (`execute`), and before writing to the
  shared knowledge graph (`kg_write`). Both are on by default.

---

## 1. Your first research thread

### 1.1 Start it

```bash
gd research "Does memoizing the tokenizer cut our preprocessing time by 30%?"
```

A good question is **falsifiable and measurable** — it implies a metric and a
target. "Is X better?" works; "Tell me about X" does not.

The loop runs SEED → GROUND → HYPOTHESIZE → DESIGN and then **pauses at the
execute gate** before running any generated code. Every `gd` command emits JSON,
so you'll see the thread's state (pretty-printed by default):

```json
{
  "threadId": "gd-research-a1b2c3",
  "status": "paused",
  "iterations": 0,
  "paused": true,
  "pendingGate": "execute"
}
```

(`pendingGate: "execute"` is the gate you're paused at; add `--json` for the
compact single-line form.)

### 1.2 Inspect before approving

```bash
gd research status                 # list all threads + their state
gd research status gd-research-a1b2c3   # show one thread in detail
```

Look at what it's about to run:

```
.planning/research/threads/gd-research-a1b2c3/
├── THREAD.md                       # machine state (station, iteration, gates)
├── HYPOTHESES.md                   # the hypothesis ledger (with lineage)
└── experiments/0/
    ├── plan.json                   # metric, comparator, target, predicted outcome
    └── run.sh                       # the script the loop wants to execute
```

Open `experiments/0/run.sh` and `plan.json`. This is the whole point of the
execute gate: **you see the experiment before it runs.**

### 1.3 Approve and continue

```bash
gd research resume gd-research-a1b2c3
```

The loop runs the script, measures the metric against the target, records a
verdict, extracts a takeaway, and then either:

- **finalizes** (hypothesis supported), pausing once more at the `kg_write` gate; or
- **revises** the hypothesis and loops to the next iteration (pausing again at the
  next execute gate).

Resume each time it pauses. When it reaches the `kg_write` gate, one more
`gd research resume <id>` writes `FINDING.md` and syncs to the knowledge graph.

### 1.4 Read the result

```bash
cat .planning/research/threads/gd-research-a1b2c3/FINDING.md
```

`FINDING.md` is the honest summary: the question, the supported (or exhausted)
hypothesis, the evidence, and the takeaways. A thread that never reached support
is written up as a **negative result**, not hidden.

> **Tip:** the experiment script's only contract is to print one line:
> `__RESULT__ {"<metricKey>": <number>}` to stdout. The loop parses that line to
> get the metric. Everything else the script prints is captured as context.

---

## 2. Ground the loop on real literature

The loop is far stronger when GROUND/HYPOTHESIZE can read real prior work. You
build a knowledge graph by **ingesting** sources, then **synthesizing** over it.

### 2.1 Ingest sources

`gd ingest` auto-detects the argument type:

```bash
gd ingest ./notes/my-paper.md                 # a local markdown file
gd ingest 2401.12345                            # an arXiv id (metadata + abstract)
gd ingest arxiv:2401.12345                       # same, explicit
gd ingest https://arxiv.org/abs/2401.12345       # arXiv URL
gd ingest --pdf 2401.12345                       # fetch + extract the arXiv PDF body
gd ingest ./papers/method.pdf                    # a local PDF
gd ingest https://example.com/blog-post          # a web page → readable markdown
gd ingest ./session.jsonl                        # a Claude Code / Codex transcript
```

Remote sources are normalized to a committed staging file under
`.planning/fetched/<slug>.md` (provenance recorded in
`.planning/fetched/fetch-manifest.json`), then compiled into the graph. Web
fetches pass through an SSRF guard; arXiv stays dependency-free.

### 2.2 Synthesize — and let it propose hypotheses

```bash
gd synthesize "tokenizer caching strategies"
```

Synthesis does layered reasoning over the graph and **auto-emits a ranked list of
candidate hypotheses** (a `__CANDIDATES__` block). GRD seeds one research thread
per candidate (capped by `research_max_candidates`, default 3) and auto-runs the
top-ranked one — which then pauses at its execute gate, exactly like Tutorial 1.

```bash
gd research status                 # you'll see the seeded threads
gd research resume <top-id>        # drive the #1 candidate
gd research resume <other-id>      # promote a runner-up when you're ready
```

Seeded hypotheses carry their KG provenance, so you can trace every claim back to
a source.

### 2.3 Retrieve (optional, to sanity-check grounding)

```bash
gd retrieve "tokenizer memoization throughput"
```

This runs the same hybrid retriever the loop uses internally: lexical (BM25-lite)
+ graph-structure + optional semantic, fused with Reciprocal Rank Fusion. It's a
quick way to see what the loop "knows" before you run it.

> **Semantic mode is opt-in.** It only embeds when `GRD_EMBED_API_KEY` (or
> `OPENAI_API_KEY`) is set. Without a key, retrieval uses lexical + graph only —
> **zero network egress** — and never blocks the loop.

---

## 3. Run unattended, and deepen the loop

### 3.1 Hands-off mode

Once you trust a question, skip the gates:

```bash
gd research "Does X beat the baseline on metric M?" --no-gates --max-iterations 8
```

`--no-gates` runs the full loop without pausing (it runs generated code on the
host — see §3.3 to sandbox it). `--max-iterations` caps the revise loop.

### 3.2 Automatic re-survey on a plateau

If the loop stalls — `research_plateau_window` consecutive non-supported verdicts
(default 3) — instead of quietly giving up it **re-surveys**: it widens retrieval,
pivots the next hypothesis hard, and extends the iteration budget (up to
`research_max_resurveys` times, default 2). Turn on source-fetching during
re-survey to pull in new literature automatically:

```jsonc
// .planning/config.json
{ "research_resurvey_fetch": true }
```

### 3.3 Sandbox the experiments with Docker

To isolate generated experiment scripts from your machine:

```jsonc
// .planning/config.json
{
  "research_sandbox": "docker",
  "research_sandbox_image": "python:3.12-slim",   // optional; slim defaults otherwise
  "research_sandbox_network": "none"               // default; "bridge" to allow network
}
```

Each experiment then runs in a tightly-confined container: only the iteration
directory is mounted, no network, read-only rootfs, dropped capabilities,
non-root, and CPU/memory/pid caps. **If Docker isn't available it degrades to the
subprocess runner with a loud `UNSANDBOXED` warning** — and `result.json` records
which runner actually ran, so you can always tell.

### 3.4 Run a portfolio of threads

Advance several existing threads with bounded concurrency and get a ranked report:

```bash
gd research portfolio                       # all resumable threads
gd research portfolio --topic <synth-id>    # just one synthesis-seeded set
gd research portfolio id1 id2 --concurrency 3 --no-gates
```

Output: `.planning/research/PORTFOLIO.md`, ranked by status. Interrupted or
errored threads are skipped and reported (use `--force` to include them).

---

## 4. Read and publish the outputs

### 4.1 The finding

Every finished thread has a `FINDING.md` (written at PERSIST). That's the
canonical, honest summary.

### 4.2 A publication-style paper

For any **finished** thread (supported / exhausted / abandoned):

```bash
gd research report gd-research-a1b2c3
```

This writes `PAPER.md` — Abstract → … → Future Work — assembled deterministically
from the thread's ledger, per-iteration metrics, and takeaways, with a Related
Work section drawn from retrieval. An exhausted thread is written up as a negative
result. Re-running regenerates it.

### 4.3 Compounding knowledge (automatic)

At FINALIZE, with `research_persist_knowledge: true` (the default):

- positive takeaways promote to the project's `KNOWHOW.md`, and
- refuted hypotheses promote to `.planning/DEAD-ENDS.md`.

The next thread's hypothesizer reads `DEAD-ENDS.md`, so the loop **won't
re-propose an approach you already falsified**. This is how research compounds
across threads. Disable with `research_persist_knowledge: false`.

### 4.4 Richer per-iteration evals (opt-in)

```jsonc
// .planning/config.json
{ "research_eval_report": true }
```

After each deterministic verdict, a **read-only** evaluator writes
`experiments/<iter>/EVAL.md` — a rigorous narrative (metric-vs-target gap, all
metrics, delta vs the previous iteration, reproducibility note, recommendation).
It is purely additive: it **cannot** re-run the experiment or change the verdict.

---

## 5. Thread artifact layout

```
.planning/research/
├── threads/<id>/
│   ├── THREAD.md                 # machine state: station, iteration, gates, resurvey count
│   ├── HYPOTHESES.md             # hypothesis ledger with parent-id lineage + verdicts
│   ├── TAKEAWAYS.md              # typed takeaways accumulated across iterations
│   ├── FINDING.md                # the honest final summary (at PERSIST)
│   ├── PAPER.md                  # publication-style write-up (via `gd research report`)
│   └── experiments/<iter>/
│       ├── plan.json             # metric, comparator, target, predicted outcome
│       ├── run.sh | run.py       # the experiment script
│       ├── result.json           # parsed metrics, exit code, runner, failure class
│       └── EVAL.md               # opt-in eval narrative (research_eval_report)
├── fetched/<slug>.md             # normalized ingested sources (committed)
├── PORTFOLIO.md                  # ranked multi-thread report
└── seed-manifest.json            # synthesis → seeded-thread bookkeeping
```

Everything is plain text and committed with your project — fully auditable.

---

## 6. Configuration reference

All keys live at the top level of `.planning/config.json`. Set them with
`/grd:settings` or by editing the file.

| Key | Type / default | Effect |
|---|---|---|
| `research_gates` | `{experiment_execution:true, kg_write:true}` | Per-gate checkpoints. `experiment_execution:false` skips the execute gate; `kg_write:false` skips the KG-write gate. (The *config* sub-key is `experiment_execution`; the runtime gate it controls is named `execute`.) |
| `research_max_candidates` | `3` | Cap on synthesis-seeded candidate threads. |
| `research_plateau_window` | `3` | Consecutive non-supported verdicts that trigger a re-survey. |
| `research_max_resurveys` | `2` | Max re-surveys per thread (`0` disables). |
| `research_resurvey_fetch` | `false` | On re-survey, fetch + ingest up to 3 new sources first. |
| `research_portfolio_concurrency` | `2` | Bounded concurrency for `gd research portfolio`. |
| `research_sandbox` | `"subprocess"` | `"docker"` to isolate experiment scripts (degrades to subprocess if Docker is unavailable). |
| `research_sandbox_image` | slim defaults | Container image (`python:3.12-slim` / `bash:5` by language). |
| `research_sandbox_memory` / `_cpus` | `"512m"` / `"1"` | Container resource caps. |
| `research_sandbox_network` | `"none"` | `"bridge"` to allow network inside the container. |
| `research_persist_knowledge` | `true` | Promote takeaways → `KNOWHOW.md` and refuted hypotheses → `DEAD-ENDS.md`. |
| `research_eval_report` | `false` | Opt-in per-iteration `EVAL.md` from a read-only evaluator (verdict untouched). |

> **Note — `research_gates` is a shared object.** The autoresearch loop reads only
> the `experiment_execution` and `kg_write` sub-keys. If you open
> `.planning/config.json` you may also see phase/R&D-workflow gate keys under the
> same `research_gates` object (e.g. `verification_design`, `survey_approval`,
> `phase_plan_approval`) — those are consumed by other GRD commands and are
> ignored by the research loop. Unrecognized/absent keys leave the two research
> gates **on**.

**Environment variables (semantic retrieval, all optional):**

| Var | Effect |
|---|---|
| `GRD_EMBED_API_KEY` / `OPENAI_API_KEY` | Enables semantic retrieval (embeds via an OpenAI-compatible endpoint). Unset → lexical + graph only, zero egress. |
| `GRD_EMBED_MODEL` | Override the embedding model. |
| `GRD_EMBED_URL` | Override the embeddings endpoint. |

---

## 7. How it degrades (so it never wedges)

GRD's autoresearch loop is built to keep going:

- **No knowledge graph?** GROUND/retrieval degrade to whatever's available; the
  loop still runs.
- **No embedding key?** Retrieval drops semantic and uses lexical + graph.
- **Docker unavailable?** The sandbox falls back to subprocess with a loud
  warning; `result.json` records the real runner.
- **Re-survey fetch fails?** It's best-effort; the loop continues.
- **Knowledge promotion / eval report fails?** Both are degrade-safe — they log
  and return, never breaking the loop or touching the verdict.
- **An experiment fails to run?** That's data: the verdict is `inconclusive` with
  a failure class (H2 missing dep, H3 missing file/permission, H4 runtime/timeout),
  and the loop revises.
- **An agent returns empty/unparseable output?** The HYPOTHESIZE and DESIGN
  spawns are retried up to `research_spawn_retries` times (default 2) before
  giving up — a transient blank agent response won't kill a multi-iteration
  thread. Only after the retries are exhausted does the thread end with
  `status: error` and a recorded `errorReason` (with a short excerpt of the last
  output) — visible in `THREAD.md`, `thread.json`, and the command's `--json`
  output. (A hard scheduler failure — all accounts rate-limited — is surfaced
  immediately, not retried.)

---

## 8. Cheat sheet

```bash
# Ground
gd ingest <md|arxiv-id|url|pdf|session>     # add a source to the KG
gd synthesize "<topic>"                      # synthesize + auto-seed candidate threads
gd retrieve "<query>"                        # inspect hybrid retrieval

# Research
gd research "<question>"                      # start a thread (gated)
gd research "<question>" --no-gates           # run unattended
gd research status [<id>]                     # list / show
gd research resume <id>                        # approve a gate and continue
gd research portfolio [ids…] [--concurrency N] # advance many threads

# Publish
gd research report <id>                        # write PAPER.md

# All commands accept --json for machine-readable output.
```

Happy researching. The loop's whole promise: **a falsifiable answer with a
complete, honest audit trail — and a memory of what didn't work.**
