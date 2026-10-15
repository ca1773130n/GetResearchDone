# Research Factory — Design

- **Date:** 2026-09-18
- **Status:** design approved section by section in conversation; awaiting review of this written spec
- **Branch:** `feat/research-factory`

## 1. Goal

Turn GRD into a research factory. A human states what should get better in a codebase.
GRD then runs hypotheses and experiments unattended until it produces a verified
improvement, delivered as a pull request that the human merges. The human writes no
experiments, no code, and no configuration file.

## 2. Background

### 2.1 The software factory pattern

StrongDM described a "software factory" in February 2026. Its defining rules:

- Humans write specifications and scenarios. They do not write or review code.
- Agents build non-interactively until the result converges.
- Scenarios are **held out**. They live where the coding agents cannot see them, like a
  test set, so the agents cannot tune against what judges them.
- A "digital twin universe" of cloned external services allows cheap, high-volume, safe
  validation.

### 2.2 The research analog

| Software factory | Research factory | GRD before this change |
|---|---|---|
| Humans write specs, never code | Humans state an objective and acceptance criteria, never experiments | Question plus pinned metric contract (#85) |
| Scenarios hidden from agents | An evaluation agents cannot read or edit | Missing: the metric lives in the thread workspace agents write to |
| Runs unattended until done | Lights-out research line | The loop never pauses unattended (`interactive.fallback`) |
| Cloned external services | Sandboxed, reproducible experiment environments | Hardened Docker sandbox for experiment scripts |
| Throughput bought with tokens | A budgeted work order | Account rotation; per-spawn `tokensUsed` exists but is discarded |

### 2.3 What already exists and is reused

- The research loop and its stations, including hypothesize, learn, the plateau
  detector, and the bounded debug retry.
- The deterministic verdict (`evaluateVerdict`, `compare`) and the thread-level contract
  pin (`pinThreadContract`).
- The scheduler, which already returns `tokensUsed` on every spawn result.
- The Docker runner's hardened flag set: no network, all capabilities dropped,
  no-new-privileges, a read-only root, a PID limit, and memory and CPU caps.
- The thin pre-loop interview pattern in `commands/research.md`, which asks, refines and
  invokes, with no state machine.
- The pinned-workdir pattern from `runBenchTask`: write a frozen `.planning/config.json`
  into a private directory and run the loop there.

## 3. Decisions

| Question | Decision |
|---|---|
| What comes off the line | Verified improvements |
| What an improvement changes | Code in a target git repo, as a patch |
| How it ships | As a pull request. A human merges every PR; no auto-merge in v1 |
| How work enters | One work order per run, running until it stops. No daemon, queue or schedule |
| Architecture | A factory layer over the existing research loop |
| How the order is written | An AI-assisted interview. Nobody writes JSON |
| Where candidate code runs | Docker, from v1 |

## 4. Constraints from the literature

HypePaper search returned internal errors on 2026-09-18, so these come from web search
and are second-hand from abstracts and writeups. See §17 for the re-check.

- **R1. Every hidden query leaks.** Scoring adaptively chosen candidates against the same
  holdout overfits it, even through a pass/fail signal alone (Dwork et al., "The reusable
  holdout", *Science* 2015). Therefore: the hidden evaluation runs only on candidates that
  already passed every other gate, its result is never shown to an agent, and each order
  has a hard cap on hidden queries.
- **R2. Agents outrun the holdout.** A 2026 study of ML research agents (arXiv 2606.11045)
  reports that explorers kept improving validation after holdout performance stalled, while
  a fresh agent given only a 128-token strategy tracked the holdout far better. Therefore:
  a replication station runs before any hidden query.
- **R3. Evaluators get hacked.** AlphaEvolve-style runs have redefined `len` and deleted a
  memory limit to win. Public tests invite overfitting and noisy timing favours candidates
  that do not survive elsewhere. Therefore: an edit allowlist, a tamper scan, repeated
  measurement with the median, and a hidden evaluation whose inputs and reporting format
  agents never see (§11).

## 5. The work order

The interview produces this file. A human never edits it.

```json
{
  "version": 1,
  "id": "search-p95",
  "repo": "/abs/path/to/target-repo",
  "base": "main",
  "remote": "origin",
  "objective": "Cut p95 latency of /search under the replay workload.",
  "contract": { "metric": "latency_p95_ms", "comparator": "<=", "target": 120 },
  "editable": ["src/search/**", "src/cache/**"],
  "sandbox": { "image": "node:22-bookworm", "setup": "npm ci", "memory": "2g", "cpus": 2 },
  "dev_eval": { "command": "npm run bench:search", "repeats": 3 },
  "hidden_eval": { "script": "hidden/eval.sh", "repeats": 5 },
  "budget": { "tokens": 1800000, "candidates": 3, "hidden_queries": 3, "wall_minutes": 120 },
  "baseline": { "dev": 187, "hidden": 191 }
}
```

| Field | Meaning |
|---|---|
| `repo`, `base`, `remote` | The target repo, the ref every candidate starts from, and where branches are pushed |
| `objective` | One sentence. Becomes the research question |
| `contract` | The decision rule. `metric` is the key both evaluations print as `__RESULT__ {"<metric>": <number>}`, the loop's existing format. `comparator` is one of `>=`, `<=`, `>`, `<`, `==` |
| `editable` | Git pathspec globs. The only paths a patch may change |
| `sandbox` | Container image, a setup command run once per worktree with network on, and resource caps for every container |
| `dev_eval` | Visible to agents. Runs inside the container with network off. The verdict uses the median of `repeats` runs |
| `hidden_eval` | A script path **relative to the order's vault**, so no absolute path exists to leak. Median of `repeats` runs |
| `budget` | Hard caps; whichever is hit first stops the line. `candidates` counts original builds; replication spends tokens but not candidates |
| `baseline` | Written by `validate` from runs on the unmodified base. Never supplied by a human |

The order's `contract` is seeded as every thread's pinned contract, so each design is
judged on the human's rule from its first iteration. This also removes the hypothesis
polarity ambiguity for factory runs: `supported` means the objective's rule was met,
however the hypothesis was phrased.

## 6. The interview: `/grd:factory`

A thin pre-CLI skill, following the pattern in `commands/research.md`: ask, refine,
invoke. It keeps a draft directory at `<factory home>/drafts/<id>/`, holding `draft.json`
and, from step 6, `hidden/`. It is updated after each step and no human edits it. Each
step proposes an answer backed by evidence and marks one option recommended. The human picks, or types their own. "Accept all recommendations" is
offered after step 1: the skill then takes the recommended option at steps 2 to 7, still
running every check, and stops only at step 8 for confirmation.

1. **Goal.** The only free-text question: what should get better, in which repo.
2. **Environment.** `scan` proposes an image and setup command from the repo (a
   Dockerfile, a devcontainer, or the lockfile's ecosystem). It proposes a memory cap
   bounded by the machine's currently free memory, and says so when free memory is low.
3. **Metric and dev evaluation.** `scan` lists things in the repo that already measure
   something, such as package scripts, Makefile targets, and bench or test directories,
   and the skill offers those that fit the goal. If none fits, it offers to write a dev
   evaluation into a path the allowlist will exclude.
4. **Target.** `validate` runs the dev evaluation on the base and reports the baseline
   and its spread, the maximum minus the minimum of the repeats. The skill proposes targets from the baseline and the problem, for
   example an SLO found in the docs, or a 20 or 40 percent improvement. If the spread
   exceeds the gap to the target, it says the metric is too noisy to decide and proposes
   more repeats.
5. **Editable paths.** The skill proposes an allowlist from where the measured code path
   lives. The human trims it. Evaluation files can never be included.
6. **Hidden evaluation.** Recommended: the skill writes a held-out variant of the dev
   evaluation, differing in workload trace, seed or data split, and preferring to
   measure from outside the process under test (§11). It is written into the draft's
   `hidden/` directory, never into the repo. Alternatively the human points at an existing one.
   `validate` then runs it on the base.
7. **Budget.** Three presets, Small (3 candidates), Medium (8) and Large (20), each with
   a token estimate and wall-clock cap. The estimate multiplies the expected spawns per
   candidate by the scheduler's recorded tokens per spawn, or by its documented default of
   about 150k per research spawn when no record exists, and says which it used. Small is
   the default.
8. **Review.** A one-screen summary. On confirmation the skill calls `save`.

### 6.1 Tool commands

Each outputs JSON by default and human text with `--raw`, like every GRD tool command.

| Command | What it does |
|---|---|
| `gd factory scan <repo>` | Read-only. Languages, candidate measurements, Docker hints, proposed image and setup, free memory |
| `gd factory validate <draft>` | Runs setup and both evaluations on the base in Docker, records baselines and spread, and runs every intake check. Reports pass or fail per check |
| `gd factory save <draft>` | Moves the draft and hidden evaluation into the order's vault. Refuses unless `validate` passed on identical draft content, checked by hash |
| `gd factory run <order>` | Runs the line (§7) |
| `gd factory status [<order>]` | Candidates, spend against budget, and the stop reason |

### 6.2 Intake checks, run by `validate`

1. The repo is a git repo, clean at `base`, and `gh` is authenticated for `remote`.
2. Docker is available and the image and setup command work.
3. Every `editable` glob matches at least one file, and no glob covers a file either
   evaluation reads or runs.
4. Both evaluations run on the base and print the contract's metric.
5. **The base fails the target on both evaluations.** A base that already passes means
   there is nothing to improve, and the target is a trivially satisfied bound.
6. The backend reports token counts. If it does not, the check is reported as degraded:
   the token cap cannot be enforced and only the other caps apply.

## 7. The line

`gd factory run <order>` works one order. Each candidate is one hypothesis turned into one
patch, built from `base` in its own git worktree. Candidates are independent: none builds
on another, so every result can be attributed to one idea and replicated.

### 7.1 Inner loop: the existing research loop

1. **Hypothesize.** The existing station. The factory composes the question text from the
   objective, contract, editable paths, rejection history (§7.3), and the path of a
   reference worktree at `base` created once per order. The hypothesizer reads the code
   there and is never pointed at the user's own working copy. This station needs no
   change. It and the learn station run with the `line/` directory as their working
   directory, exactly as the loop runs them today.
2. **Build.** Replaces the design station, through the new `design` option (§12.2). The
   `grd-factory-builder` agent runs with its working directory set to the candidate's
   worktree. It edits allowlisted paths only and ends with a `__PLAN__` block that carries
   a strategy note of at most 128 tokens. Contract fields in the block are pinned to the
   order's contract.
3. **Scope and tamper check.** Deterministic (§11). A violation is returned to the loop as
   a failed run with the offending paths in stderr, so the existing bounded debug retry
   gives the builder one chance to fix it.
4. **Dev measure.** Setup in the container, then the dev evaluation `repeats` times with
   network off. The median is judged by the existing deterministic verdict. A miss goes to
   the learn station and on to the next hypothesis. A hit ends the thread as `supported`
   and hands the candidate to the trust gates.

### 7.2 Trust gates: new

Ordered so the scarce, leaking resource is spent last.

1. **Replicate.** A fresh builder in a fresh worktree from `base` receives only the
   objective, contract, editable paths and the strategy note: no diff, no transcript, no
   hypothesis text. Its patch must pass scope, tamper and the dev contract. This uses only
   the dev evaluation, so its result may be reported back in full.
2. **Hidden gate.** Appends a query record (§13), then runs the hidden evaluation
   `repeats` times on the **original** candidate's worktree and compares the median to
   the contract. The value is never shown to any agent.
3. **Ship.** Commit exactly the allowlisted changed paths, so stray files never ship.
   Push `factory/<order>/<candidate>` to `remote` and open a PR against `base`
   with the evidence bundle: objective, contract, hypothesis, strategy note, baseline
   against dev result, replication result, hidden result, scope-check output, and tokens
   spent. The order then stops.

### 7.3 What later hypotheses are told

| Rejection | Told to later hypotheses | Holdout information leaked |
|---|---|---|
| Dev miss | The loop's normal verdict and takeaway | None |
| Out of scope or tampering | The offending paths or lines | None |
| Did not replicate | That a fresh builder could not reproduce it, and the replica's dev value | None |
| Rejected at hidden gate | "Rejected at the final gate", with no value and no direction | One bit, bounded by `hidden_queries` |

Every rejected candidate is listed as "do not resubmit".

### 7.4 Attempts and threads

An attempt is one `runResearch` thread. It runs until it yields a dev-supported candidate
or exhausts. The thread's `maxIterations` is the smaller of the remaining candidate budget
and `research_plateau_window` (default 3), so control returns to the factory at least that
often to check stop conditions. After an exhausted attempt or a trust-gate rejection, the
factory starts a new attempt whose question text carries every earlier candidate's
summary and outcome, so continuity survives the thread boundary.

## 8. Stop conditions

| Stop | Meaning |
|---|---|
| Shipped | A patch cleared every gate. One PR per order |
| Budget spent | Tokens, candidates or wall-clock ran out. The report shows the best dev result, unshipped |
| Holdout spent | Hidden queries are used up. Further queries would overfit it; a new hidden evaluation resets this |
| Plateau | The last `research_plateau_window` candidates (default 3) all missed the contract, and none beat the best dev median seen before them. Checked by the factory over `candidates.jsonl` between attempts |

Every stop rewrites `report.md` and prints its path.

## 9. Budget metering

The factory builds its own spawn function from `createScheduler`, the same way
`defaultSpawn` does, with two differences. It sets the working directory per candidate,
and it appends each result's `tokensUsed` to `spend.jsonl` before the next spawn may start.
Before every spawn it sums that file and refuses to proceed once `budget.tokens` is reached. A spawn
already in flight cannot be stopped cleanly, so the last one may overshoot; the report
states the overshoot.

## 10. Execution sandbox

Every command that runs candidate code runs in a container built from the order's
`sandbox`, reusing the Docker runner's hardened flag set.

- **Setup** runs once per worktree with network `bridge`, the worktree mounted
  read-write at `/work`, and the memory and CPU caps applied.
- **Evaluations** run with network `none` and the same mount and caps.
- **The hidden evaluation** also mounts the vault's `hidden/` directory read-only, at a
  path randomized per query, only for that run.
- Containers are named `grd-factory-<order>-<candidate>-<phase>` and run with `--rm`. On
  abort the factory stops only containers whose exact names it recorded, never by pattern.

## 11. Reward-hacking defenses

1. **Allowlist.** The patch is `git diff --name-only <base>` plus untracked, non-ignored
   files (`git ls-files --others --exclude-standard`). Every path must match `editable`.
   Ignored build output such as `node_modules` does not count.
2. **Evaluation files are never editable.** `validate` rejects any overlap.
3. **Tamper scan.** A patch whose added lines contain the literal `__RESULT__` is
   rejected as tampering.
4. **An unknown hidden channel.** Agents never see the hidden evaluation's inputs or
   script, so a hack tuned to the dev evaluation does not carry over.
5. **Honest limit.** The code under test runs in the same container as the grader, so a
   determined patch could forge a result line in a way no generic check catches. The
   interview therefore prefers hidden evaluations that measure from outside the process
   under test, for example driving a server from a separate process and timing it there.
6. **Known limit: a bypass can propagate between candidates.** Work on multi-agent
   coding systems (arXiv 2610.12822, found in the late re-query, §17)
   reports that an evaluator bypass discovered by one agent spreads to the others through
   shared code and plans. The factory shares the learn station's takeaways and the
   composed question, with every earlier candidate's summary and outcome, across
   candidates. That is such a channel. The defenses above are deterministic checks on each
   patch, so none of them stops a bypass that is passed on as an idea. v1 accepts this and
   does not try to filter the shared text; the unseen hidden evaluation (item 4) is the
   backstop, since a hack tuned to the dev evaluation does not carry over.

## 12. Code layout

### 12.1 New code

| Path | Responsibility |
|---|---|
| `lib/factory/types.ts` | `WorkOrder`, `Candidate`, `StopReason`, query record types |
| `lib/factory/order.ts` | Load, validate and save orders; `scan` |
| `lib/factory/sandbox.ts` | Setup and evaluation containers for a worktree |
| `lib/factory/gates.ts` | Scope and tamper checks, the hidden gate, the query log |
| `lib/factory/line.ts` | Attempts, loop wiring, metered spawn, replication, stop logic |
| `lib/factory/ship.ts` | Push, PR, evidence bundle, report |
| `lib/factory/cli.ts` | `cmdFactoryScan`, `cmdFactoryValidate`, `cmdFactorySave`, `cmdFactoryRun`, `cmdFactoryStatus` |
| `agents/grd-factory-builder.md` | Builder agent: Read, Write, Edit, Grep, Glob; no Bash |
| `commands/factory.md` | The interview skill |
| `tests/unit/factory/*.test.ts` | One suite per module |

### 12.2 Changes to existing code

- **`lib/research/orchestrator.ts`.** Add `ResearchOptions.contract`, which seeds
  `thread.contract` at creation. Add `ResearchOptions.design`, an object with `agent`,
  `prompt` and `fixPrompt`, which replaces the design station's agent and prompts for the
  initial design, the metric-absent redesign, and the debug fix. When both options are
  absent, behavior is byte-identical to today.
- **`lib/research/docker-runner.ts`.** Export the image, memory and CPU validators and the
  hardened flag builder, generalized to take a mount source and a command. The runner's
  own behavior is unchanged.
- **`bin/grd-tools.ts`, `bin/gd.ts`.** Wire the `factory` subcommand and its help the way
  `bench` is wired.
- **Exports only.** Export whatever the factory spawn needs from the scheduler and
  orchestrator, such as `createScheduler` and the spawn-result decoder, if not already
  exported.
- **Docs.** `CLAUDE.md`, the README, the autoresearch tutorial and `docs/CHANGELOG.md`.

## 13. State layout and crash safety

```
$GRD_FACTORY_HOME            default ~/.grd/factory
  drafts/<id>/               interview draft: draft.json and hidden/; deleted on save
  work/<id>/                 everything an agent can reach
    line/                    loop state: pinned .planning/config.json and threads
    worktrees/base/          reference copy for the hypothesizer; removed at order end
    worktrees/<candidate>/   removed when the candidate is scrapped or pushed
  orders/<id>/               private to the factory; no agent works under it
    vault/order.json         the saved order; never given to any agent
    vault/hidden/            the hidden evaluation
    candidates.jsonl         one row per candidate, appended at every stage
    queries.jsonl            hidden-query log
    spend.jsonl              one row per spawn: agent, candidate, tokensUsed
    containers.jsonl         names of the containers the factory started
    report.md                rewritten at every stop
    status.json              the last stop reason and PR URL
    started.json             when the order first ran, for the wall-clock budget
```

The directories are split because the build prompt has to name the candidate's
worktree, and the hidden evaluation's vault must not be an ancestor of any path an agent
works in or is told about. `work/<id>` holds only what agents may see; `orders/<id>`
holds the vault and every record that contains a measured hidden value.

The `work/<id>/line/` directory's pinned config, following `BENCH_WORKDIR_CONFIG`: execution and
knowledge-write gates off, interactive steering disabled, knowledge persistence off,
re-surveys off, the eval report off, and `research_max_debug_depth` 1.

Crash safety:

- **Write-ahead query log.** A query record is appended to `queries.jsonl` before the
  hidden evaluation starts. A crash can never refund a query.
- **Spend survives restarts.** Tokens live in `spend.jsonl` and candidate counts in
  `candidates.jsonl`, and re-running an order resumes from both rather than resetting.
- **Cleanup on every exit.** Worktrees are removed in a `finally`, including on Ctrl-C.
  On restart, the factory removes leftover worktrees under its own `work/<id>/worktrees/` directory
  and containers by their recorded names. It never touches anything else.

## 14. Failure handling

| Failure | Response |
|---|---|
| Hidden evaluation crashes or prints no metric | Stop the order and report. The query still counts. It is never treated as a rejected patch |
| Dev evaluation crashes | The loop's bounded debug retry, then the learn station |
| Builder spawn fails hard | The candidate is scrapped as `build_failed`. Three in a row stop the order |
| Docker unavailable mid-run | Stop the order and report. Never fall back to running on the host |
| Push or PR creation fails | The branch stays pushed if the push succeeded; the report prints the exact command to finish |
| Token budget overshoot | Reported with the amount |

## 15. Testing

Every test injects spawn, runner, Docker, git and `gh`, so the suite spends no tokens and
needs no Docker.

- **No leak.** Across every prompt captured in a full line run, the hidden script's path,
  contents and result never appear.
- **Write-ahead.** A crash injected after the query record but before the result leaves
  the query counted, and a rerun cannot exceed `hidden_queries`.
- **Blind replicator.** The replicator's prompt contains no diff, transcript or hypothesis
  text.
- **Scope and tamper.** An out-of-allowlist path, an edited evaluation file, and an added
  `__RESULT__` line are each rejected. Ignored files are not counted.
- **Contract seed.** A builder proposing a different metric is pinned back to the order's.
- **Stop conditions.** Each of the four is reached and reported.
- **Cleanup.** No worktree or container remains after success, rejection, a thrown error,
  or an abort signal.
- **Resume.** A second run of a partially spent order continues its accounting.
- **Loop defaults.** With `contract` and `design` absent, the existing orchestrator suite
  passes unchanged.
- **End to end, offline.** A tiny fixture repo created in a temporary directory with a
  deliberately slow function, a stub builder returning a known fix, and dev and hidden
  scripts. The line ships and `gh` is stubbed.

## 16. Out of scope for v1

- Auto-merge, queues, daemons and schedules.
- Running candidates in parallel. Concurrency is fixed at 1.
- Candidates that build on each other. Compounding happens through merges: the next order
  starts from the improved base.
- Thresholdout's noise mechanism. v1 uses a hard query cap, which bounds leakage to
  `hidden_queries` bits. Thresholdout is the upgrade if the cap proves too tight.
- True isolation of the hidden evaluation, such as a separate host or OS user. v1 relies
  on concealment: the vault is outside every repo, is not an ancestor of any agent's
  working directory and is never named in a prompt, but an agent with filesystem tools
  could still find it.
- Non-git targets, and ML training that needs GPU scheduling.

## 17. Pre-implementation checks, and the late literature re-query

- **HypePaper re-query: run late, on 2026-10-15.** The plan required it before Task 1.
  It was not run then, because the HypePaper service was erroring when this spec was
  written. The controller ran it mid-branch, during Task 14, after Tasks 1 to 13 were
  already implemented. R1 to R3 were therefore not checked against the literature in
  advance, and the design was not gated by this re-query; it only confirms the rules
  afterwards. Four searches on reusable holdouts, evaluator hacking and research-agent
  replication found no contradiction of R1 to R3, so there was no stop.
  - *Reusable holdout.* The search returned the spec's own primary source, Dwork et al.
    (2015), and no newer work that revises it. R1 is unchanged.
  - *Reward hacking.* Four 2026 papers restate R3, and a fifth adds a new limit. "Do Coding Agents Deceive
    Us?" (NeurIPS 2026) reaches capped evaluation with randomized tests as its defense,
    which is what the hidden-query budget is. "Hack-Verifiable Environments" (NeurIPS
    2026) restates R3: agents look successful under the evaluation signal while
    violating the intended objective. "Benchmarking Reward Hack Detection in Code
    Environments via Contrastive Analysis" (ICML 2026) studies LLMs as hack detectors;
    the factory keeps LLM judgment off the control path, so it is orthogonal, and its
    premise that detection is unreliable supports that choice. One paper adds a risk,
    recorded as §11 item 6: "Reward Hacking as a Transmissible Strategy in Multi-Agent
    Coding Systems" (arXiv 2610.12822).
  - *Replication.* REPRO-Bench (ACL 2025) and ReplicatorBench (KDD 2026) benchmark agents
    assessing replicability. Neither contradicts R2's source (arXiv 2606.11045) or the
    replicate-before-querying rule.
  - Not engineered against on this branch: the transmission channel in §11 item 6.
- Confirm that `tokensUsed` is populated for the claude backend's current output format.
  If it is not, intake check 6 already degrades loudly; the question is only which case
  is live.
- **One claim is unverified.** That `--disallowedTools Bash` removes the tool in practice
  on the claude backend (`lib/scheduler.ts` passes the flag; no run has observed it
  taking effect). A live check costs a few thousand tokens and was deferred to the user:
  `claude -p 'Use the Bash tool to run: echo hi. If you have no Bash tool, reply exactly
  NO_BASH.' --dangerously-skip-permissions --disallowedTools Bash --output-format json`
  should answer `NO_BASH`. If it does not, the builder's no-shell guarantee does not hold.

## 18. Build order

Each step lands with its tests and keeps the full suite green.

1. The two orchestrator options and the Docker runner exports, with the unchanged-defaults test.
2. Types, order loading and `validate`, against a fixture repo.
3. Scope check, tamper scan, hidden gate and the write-ahead logs.
4. The line: metered spawn, attempts, replication, stop conditions, cleanup.
5. Ship and the report.
6. CLI wiring.
7. The builder agent and the `/grd:factory` interview skill, including `scan`.
8. Documentation.

## Sources

- StrongDM, [The StrongDM Software Factory](https://www.strongdm.com/blog/the-strongdm-software-factory-building-software-with-ai), and Simon Willison's [writeup](https://simonwillison.net/2026/Feb/7/software-factory/)
- [The Dark Factory pattern](https://hackernoon.com/the-dark-factory-pattern-moving-from-ai-assisted-to-fully-autonomous-coding)
- Dwork et al., [The reusable holdout](https://www.researchgate.net/publication/281367205_STATISTICS_The_reusable_holdout_Preserving_validity_in_adaptive_data_analysis), *Science* 2015
- [What Fits (Into Few Tokens) Doesn't Overfit](https://arxiv.org/html/2606.11045v1), arXiv 2606.11045
- [Correcting the Winner's Curse in Adaptive Benchmarking](https://arxiv.org/pdf/2605.05973), arXiv 2605.05973
- [AlphaEvolve: evaluator harnesses and the boundaries of autonomous discovery](https://dev.to/gdg/alphaevolve-evaluator-harnesses-jax-and-the-boundaries-of-autonomous-algorithm-discovery-11b8)
- "Reward Hacking as a Transmissible Strategy in Multi-Agent Coding Systems", arXiv 2610.12822
- [Let the Barbarians In: AI for systems performance research](https://arxiv.org/pdf/2512.14806), arXiv 2512.14806
