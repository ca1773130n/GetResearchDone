# Autoresearch Shared Kernel + Project Integrations — Design (DRAFT, under review)

**Date:** 2026-06-03
**Status:** Draft — design locked via two Codex xhigh reviews (2026-06-03). Round 1: RRF de-dup, decision-contracts reframe, verdict evidence-levels, HypePaper plan-contract, security/idempotency. Round 2: the 3 open questions decided + v1 cut line (see §10).
**Goal:** Reuse GRD's recent autoresearch features in two sibling projects — **Agented** and **HypePaper** — *without duplicating what each already implements in its own way.*

---

## 1. Context

GRD (`~/Developer/Projects/GetResearchDone`, **TypeScript/CommonJS**) recently grew a deterministic autoresearch loop (SEED→GROUND→HYPOTHESIZE→DESIGN→RUN→MEASURE→LEARN→DECIDE→PERSIST→FINALIZE) plus ingestion/synthesis/hybrid-retrieval, a cross-backend scheduler + account rotation, a Docker experiment sandbox, portfolio, paper generation, per-iteration eval, and knowledge promotion (KNOWHOW / DEAD-ENDS).

Two sibling projects, **both Python**, both already GRD-planning-managed (`.planning/` + `.harness-sync`), each of which has **independently reimplemented much of GRD's functionality**:

- **Agented** (`~/Developer/Projects/Agented`) — Litestar (Python) agent/"harness-engineering" platform + Vue frontend; v0.7.101. Bots/agents/skills/hooks; shells out to AI CLIs. Already has its own scheduler+rotation, Tesserae KG integration, retrieval, a goal/experiment loop, and a self-patch "harness evolver". Already wraps `gd` as a subprocess (`grd_cli_service`).
- **HypePaper** (`~/Developer/Projects/HypePaper`) — FastAPI (Python) + PostgreSQL/pgvector paper-discovery SaaS (Railway), v0.3.0. Vision: Karpathy-style layered wiki L1→L2→**L3 "agentic research" (hypothesis→experiment→iterate→draft)**, where L3 currently runs but is LLM-judged. Already has arXiv/PDF ingestion, real RRF hybrid retrieval, paper draft+export, a native pgvector KG, APScheduler, multi-account cliproxy (`ai_accounts_core`).

**GRD coupling in both:** planning harness only — GRD is *not* a code dependency. Language mismatch (GRD = TS, targets = Python).

---

## 2. Decisions (resolved with the user)

| Decision | Choice |
|---|---|
| Scope | "Everything reusable" — **reframed by the audit** (§3): most features already exist; only the deterministic *decision discipline* is genuinely missing. |
| Integration style | **Hybrid port** — reuse existing infra; port only the unique logic. |
| Sequencing | Both projects **in parallel**. |
| Structure | **Shared core package + per-project adapters** (editable local package, mirroring Agented's existing `ai_accounts_core` pattern). |
| Core scope | **Decision kernel only** — not a loop engine. Each project keeps its own loop. |
| Reuse line | **Bind via protocols, never port** the things each repo already implements well. |

---

## 3. Duplication audit (code-grounded)

Per-feature, per-project status from deep-reading the actual implementations:

| # | GRD feature | Agented | HypePaper | Shared-core action |
|---|---|---|---|---|
| 1 | **Deterministic verdict** (metric/comparator/target) + gates + typed lineage ledger | ❌ verdict = exit-code/LLM (`goal_judge_service._run_deterministic` = `returncode==0`; else LLM judge) | ❌ verdict = LLM "reviewer" prompt (`layer3_service.run_autopilot`, L963–1009) | ✅ **OWNS IT** — the one thing neither has |
| 2 | Source ingestion (arXiv/PDF/web) | MISSING | ✅ EQUIVALENT+ (`arxiv_service`, `pdf_pipeline_service`, 5 providers, Nougat OCR) | reuse HP's; Agented = out of scope v1 |
| 3 | Synthesis → candidate hypotheses | MISSING | ✅ EQUIVALENT (`layer2_service`, L3 harvester → `research_problem` nodes) | reuse HP's |
| 4 | Hybrid retrieval (RRF) | ✅ **EQUIVALENT** (`embedding_service.hybrid_recall:196` — real RRF: `alpha/(K+rank_fts)+(1-α)/(K+rank_vec)`, K=60; corpus = agent/execution messages) | ✅ EQUIVALENT (`vector_search_service.hybrid_search`, true SQL RRF) | **REUSE both** — generalize `hybrid_recall`'s corpus; do **NOT** add a fuser (audit correction, Codex) |
| 5 | Embeddings provider | PARTIAL (local MiniLM only) | ✅ EQUIVALENT (`core/embeddings.py` local+API+cache) | reuse; Agented adds provider-swap |
| 6 | Scheduler + account rotation | ✅ EQUIVALENT+ (`rotation_service`, `agent_scheduler_service`, `provider_usage_client`, Keychain overlays) | ✅ EQUIVALENT (`ai_accounts_core.AccountScheduler`) | **REUSE both — do NOT port** (high conflict) |
| 7 | Sandbox runner | PARTIAL (subprocess + CLI-native sandbox flags; no Docker isolation) | PARTIAL (`layer3_executor` Docker+subprocess; **results untyped, fed to LLM as text**) | core defines `ExperimentRunner` + typed `__RESULT__` contract; each extends |
| 8 | Portfolio / bounded concurrency | ✅ EQUIVALENT (`execution_queue_service` durable queue + DAG) | PARTIAL (worker `asyncio.Semaphore`; no multi-thread research arbitration) | Agented reuse; core supplies portfolio *policy* HP's worker runs |
| 9 | Paper/report from ledger | MISSING (`report_service` = team digest, not a research ledger) | ✅ EQUIVALENT (`draft_paper` → `KGNode`, `layer3_export_routes` pandoc) | reuse HP's; Agented = out of scope v1 |
| 10 | Per-iteration deterministic eval | PARTIAL (`harness_evolution_eval` — a gate, part LLM, harness-scoped) | ❌ MISSING (gold corpora in `tests/evaluation/` exist, **no runner**) | core defines eval shape; HP wires a runner over its gold corpora |
| 11 | Knowledge promotion (KNOWHOW/DEAD-ENDS) | ⚠️ **DEDUPE** — already ≥3 memory subsystems (`goal_loop_dead_ends`, `harness_kg_signals`, `memory_evolution`/`memory_orchestrator`) | ❌ MISSING | core defines the *record shape*; HP ports; **Agented consolidates onto existing, must not add a 4th** |
| 12 | KG grounding | ✅ EQUIVALENT (`tesserae_integration.ask_tesserae`) | ✅ EQUIVALENT (`graph_service` pgvector KGNode/KGEdge) | **REUSE both** via `KnowledgeGraph` protocol |

**Top duplication traps to avoid:** (1) re-porting the scheduler over `rotation_service`/`ai_accounts_core`; (2) a 2nd graph store next to the shipped KGs; (3) a 4th memory system in Agented; (4) cloning `run_autopilot` / `goal_loop_runner` / `layer3_executor` when the real value is only the deterministic verdict + gates; (5) a parallel RRF fuser next to Agented's existing `embedding_service.hybrid_recall`.

**Net:** EQUIVALENT/REUSE ≈ 5 (Agented) / 7 (HypePaper); the genuinely unique GRD contribution = the deterministic **decision contracts** (verdict + gates + failure-class + lineage/promotion shapes).

---

## 4. The package: `autoresearch-core` — a *decision-contracts* library

New pure-Python package (`~/Developer/Projects/autoresearch-core`), **zero infra deps**, `pip install -e` into both backends (mirrors `ai_accounts_core`). Per the Codex review it is framed as a **decision-contracts + pure-policy** library, not a generic autoresearch engine.

```
autoresearch_core/
  types.py     # Hypothesis, MetricSpec{metric,comparator,target}, ExperimentPlan, ExperimentResult, Verdict, Takeaway, Thread, GateState
  verdict.py   # DeterministicVerdict: compare(value, comparator, target); classify_failure() → H2/H3/H4
  gates.py     # GateModel(execute, kg_write): resolve(config, no_gates), check()
  contract.py  # MetricSpec validation + __RESULT__ parse shape (the machine-readable result contract)
  lineage.py   # hypothesis lineage event shape (parent_id) + takeaway shape — NOT append-only (read-modify-rewrite, like GRD ledger.ts)
  promote.py   # KnowhowRecord / DeadEndRecord + should_skip(approach)   ← record shape only, no storage
  eval.py      # advisory EvalReport shape + read_prior_metrics()
  ports.py     # Protocols: Spawn, Retriever, KnowledgeGraph, ExperimentRunner, Store, Verdict
  policy.py    # PURE: measure() / decide() / classify_failure() / should_promote() — the project loop performs ALL writes
```

**Verdict model (the heart):** a hypothesis carries a `MetricSpec{metric, comparator, target}`; a run emits typed metrics `{metric: value}`; `measure()` → deterministic `supported / refuted / inconclusive` (+ failure-class on error, mirroring GRD's H2 missing-dep / H3 missing-file·perm / H4 runtime·timeout). `Verdict` is a **protocol** carrying `{strategy, evidence_level, raw_evidence_ref, met, verdict}`: `DeterministicVerdict` is the default and the reason the package exists; a project may register its *existing* judge (`LLMVerdict`, `ExitCodeVerdict`) for qualitative experiments. **Promotion-authority rule (Codex):** only a *deterministic* refutation may auto-promote a DEAD-END; LLM/exit-code verdicts are advisory for promotion unless human-approved (`evidence_level` is recorded on every verdict, preserving GRD's "no LLM on the control path"). The package does **not** drive SEED→RUN, nor persist — `policy.py` is pure and returns decisions + record shapes; the project loop performs all writes at MEASURE/DECIDE/PERSIST.

**What the package must NOT own:** ingestion, synthesis, retrieval impl, embeddings impl, scheduler impl, KG impl, paper-gen, the loop driver, **and storage/persistence** (it returns records; the project writes them idempotently). All bound via protocols.

---

## 5. HypePaper integration

| Kernel seam | Binds to (reused as-is unless noted) |
|---|---|
| Retriever | `vector_search_service.hybrid_search` (RRF) |
| KnowledgeGraph | `graph_service` (pgvector KGNode/KGEdge), `wiki/graph_store.py` |
| Spawn | `ai_accounts` cliproxy / `llm_service` |
| ExperimentRunner | `layer3_executor` **+ typed `__RESULT__` / `ExecutionReport.metrics` capture** (keep subprocess path env-gated) |
| Store | Postgres / SQLAlchemy (new ledger + dead-end tables, idempotent upserts) |
| Verdict | `DeterministicVerdict` (default) + existing reviewer as `LLMVerdict` fallback for qualitative experiments |
| Loop host | `run_autopilot()` calls `policy.measure / decide` at the decision point; loop persists |

- **Plan contract (critical — Codex):** today HypePaper's experiment *plan* is markdown and only operational `raw_numbers` are stored, with an **LLM-derived** verdict (`layer3_service.py:648/855/935`). Result-parsing alone is therefore insufficient — `_experiment_plan` generation must be changed to emit a machine-readable `MetricSpec{metric, comparator, target}` **up front**, and `layer3_executor` must capture typed metrics (not text fed to a reviewer).
- **Reused, not ported:** ingestion (#2), layer2 synthesis (#3), RRF retrieval (#4), embeddings (#5), scheduler (#6), portfolio worker (#8), paper draft+export (#9), KG (#12).
- **New (clean):** KNOWHOW/DEAD-ENDS via Store (#11), eval runner over existing `tests/evaluation/` gold corpora (#10).
- **Extend:** `layer3_executor` typed metrics (#7); optional multi-thread portfolio arbitration (#8).
- **Outcome:** L3 stops being LLM-judged-only and gains a deterministic, auditable verdict wherever experiments produce metrics.

**Experiment/metric model:** code-running L3 experiments (via `layer3_executor`) emit `__RESULT__ {metric: N}` → `DeterministicVerdict` against the hypothesis target. Purely-literature experiments with no measurable metric → `LLMVerdict` (existing reviewer) as the registered fallback strategy.

---

## 6. Agented integration

| Kernel seam | Binds to |
|---|---|
| Verdict | registered as a new `JudgeVerdict` source **inside** `goal_judge_service` (alongside exit-code + LLM) |
| Loop host | `goal_loop_runner` calls `kernel.measure / decide` at the judge point |
| Retriever | `embedding_service.hybrid_recall` (existing RRF, :196) — reuse/generalize corpus; **no new fuser** |
| KnowledgeGraph | `tesserae_integration.ask_tesserae` |
| Spawn / Runner | `backend_cli_service` + `rotation_service` / `cli_agent_runner_service` (+ optional Docker isolation) |
| Store | SQLite — extend `goal_loop_iterations` / add a decision-event table (idempotent) |
| Promotion | **v1: thin coexisting DEAD-ENDS** → existing `goal_loop_dead_ends` (unique-hash, `goal_loop.py:138`); **no** consolidation into `memory_evolution`/`harness_kg_signals`/`session_takeaways` |

- **Reused, not ported:** scheduler/rotation (#6), **RRF retrieval (#4 — `hybrid_recall`)**, portfolio/queue (#8), Tesserae KG (#12).
- **Extend (small):** embeddings provider-swap (#5), Docker isolation (#7), advisory per-iteration eval shape reusing `harness_evolution_eval`'s `CheckResult`/`EvalVerdict` (#10).
- **Out of scope v1:** ingestion (#2), synthesis (#3), paper-gen (#9) — Agented likely doesn't need them.
- **Experiment/metric model:** harness/benchmark experiments → metrics from `harness_evolution_eval` static checks → `DeterministicVerdict` (generalizes the current exit-code binary). Tasks with no metric keep the LLM judge as a registered strategy.
- **Safety (Codex):** the deterministic path must consume parsed `__RESULT__` from a **sandboxed runner** — it must **NOT** feed generated/untrusted commands into `goal_judge_service._run_deterministic` (`shell=True`, :172).

---

## 7. Cross-cutting

- **Testing:** kernel = pure unit tests **+ GRD parity fixtures** (port GRD's verdict/gate/ledger test vectors from `tests/unit/` to Python → guarantees behavioral parity). Adapters = contract tests against protocol fakes (offline, deterministic).
- **Degradation:** kernel is total/pure; adapters degrade like GRD (no KG → skip grounding signal; run error → `inconclusive` + failure-class; never wedge).
- **Rollout:** core first → then both adapters in parallel, each shippable behind a feature flag (`autoresearch_kernel` enabled per project).
- **Packaging/versioning:** `autoresearch-core` semver; both backends pin a version; editable install in dev. Ownership: standalone repo.
- **Idempotency & injection safety (Codex):** promotion/ledger writes must be idempotent — HypePaper's KG edge dedupe is app-level, so use DB upserts / unique keys; no generated/untrusted command may reach a `shell=True` path.
- **Verdict authority (Codex):** only a deterministic refutation auto-promotes a DEAD-END; non-deterministic verdicts are advisory for promotion (with `evidence_level` recorded) unless human-approved.

---

## 8. Spec decomposition

Three implementation specs (core first; integrations parallel):
1. `autoresearch-core` — the kernel package + protocols + parity tests.
2. HypePaper integration — adapters + `run_autopilot` wiring + eval runner + promotion tables.
3. Agented integration — `goal_judge_service` deterministic `JudgeVerdict` source + decision-event persistence + thin DEAD-ENDS via `goal_loop_dead_ends`. **No new RRF (reuse `hybrid_recall`), no memory consolidation, no generated command through `shell=True`.**

---

## 9. Open questions / risks (for review)

1. ~~**Experiment/metric definition per domain**~~ — **RESOLVED (Codex r2):** HypePaper v1 = full `MetricSpec{metric,comparator,target}` on plan metadata before execution; deterministic verdict only when `MetricSpec + metrics` exist, else LLM stays advisory. Qualitative-only L3 experiments remain LLM-advisory — acceptable; the kernel applies where measurable.
2. ~~**Pluggable `Verdict` dilution**~~ — **RESOLVED (Codex review):** verdicts carry `{strategy, evidence_level, raw_evidence_ref}`; deterministic is default and **only deterministic refutation auto-promotes DEAD-ENDS** — non-deterministic verdicts are advisory for promotion unless human-approved. GRD's control-path guarantee is preserved.
3. ~~**Agented memory consolidation**~~ — **RESOLVED (Codex r2):** v1 = thin coexisting DEAD-ENDS via existing `goal_loop_dead_ends` (unique-hash); NO consolidation into `memory_evolution`/`harness_kg_signals`/`session_takeaways`.
4. **Cross-repo package ownership** — who versions/releases `autoresearch-core`; does a shared dep across two independently-deployed products (one on Railway) create release-coupling pain?
5. **TS→Python parity drift** — the kernel is a Python re-implementation of GRD's TS logic; parity fixtures catch behavior, but GRD will keep evolving. Acceptable divergence policy?
6. **Loop-host invasiveness** — calling the kernel from inside `run_autopilot` / `goal_loop_runner` touches load-bearing code in both products. Mitigation: behind a feature flag, the deterministic path only triggers when a `MetricSpec` is present, so existing flows are unchanged by default.

---

## 10. v1 cut line (Codex-decided)

- **Core (`autoresearch-core`):** pure-Python `MetricSpec`, `__RESULT__` result parser, failure classifier (H2/H3/H4), `measure / decide / should_promote`, `Verdict{strategy, evidence_level, …}`, gates, + GRD parity fixtures. No I/O.
- **HypePaper:** interactive L3 only — emit `MetricSpec` up front, capture `ExecutionReport.metrics`, deterministic verdict when `MetricSpec + metrics` exist (LLM advisory otherwise). **Exclude** the daily skip-stub jobs (`layer3_jobs.py:145`). Add DB uniqueness for idempotent edges/ledger (`kg_edge.py:93` lacks it).
- **Agented:** add a deterministic `JudgeVerdict` source (`goal_judge_service.py:109` has no metric/evidence fields today) + decision-event persistence (extend `goal_loop_iterations`) + deterministic DEAD-ENDS write/read via `goal_loop_dead_ends`. **No** new RRF (reuse `hybrid_recall`), **no** memory consolidation, **no** generated command through `_run_deterministic` (`shell=True`, :172). Leave the existing LLM-`falsified` dead-end behavior (`goal_loop_runner.py:387`) untouched, but do not label it a kernel auto-promotion.
- **Verdict authority:** non-deterministic verdicts are advisory for kernel promotion only.
