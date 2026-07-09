# Competitive Landscape — Autonomous Research Systems (as of 2026-07-09)

**Method:** deep-research workflow (5 search angles → source fetch → per-claim 3-vote
adversarial verification). 18 claims confirmed (17 at 3-0, one at 2-1), 7 claims
unverified (verification panels hit a session limit — plausible, not refuted), 0 refuted,
24 sources (15 primary). Verified claims are cited inline; unverified claims are marked.

## Category 1 — Autonomous AI-scientist / research-loop systems (direct competitors)

### Sakana AI-Scientist-v2
End-to-end autonomous research (hypothesis → experiments → analysis → manuscript);
first entirely AI-written workshop paper accepted through peer review (ICLR 2025
workshop). Core architecture is **progressive agentic best-first tree search (BFTS)**
guided by an experiment-manager agent: parallel exploration paths (`num_workers`),
node budget (`steps`), independent root trees (`num_drafts`), and **bounded debug
retries for failing nodes** (`max_debug_depth`, `debug_prob`).
[github.com/sakanaai/ai-scientist-v2]

Sakana itself documents the **template-vs-exploration tradeoff**: template-driven v1
has higher experiment success rates; template-free v2 is more exploratory with lower
success rates. GRD sits on the reliability side of this tradeoff by design — this is
citable evidence that deterministic scaffolding buys reliability.

### Agent Laboratory (arXiv 2501.04227)
Three fixed stages (literature review → experimentation → report writing) from a
human idea, outputting a code repo + report. Key empirical result: **human feedback
at each pipeline stage (co-pilot mode) significantly improves output quality** —
supports GRD's `plan_clarification` gate and argues for per-stage (not just
planning-time) checkpoints.

### CodeScientist (ACL Findings 2025)
Frames ideation + experiment construction as **genetic search over combinations of
research articles and reusable domain "codeblocks"**. Ran hundreds of automated
experiments → 19 claimed discoveries → only **6 survived multi-faceted evaluation
(~32% survival)** — quantifies the false-discovery problem GRD's deterministic
verdicts target. Its verification stack goes beyond LLM paper review: **external
conference-style review + code review + replication attempts**.
[aclanthology.org/2025.findings-acl.692]

### FutureHouse Robin
Multi-agent, end-to-end scientific discovery unifying hypothesis generation with
experimental data analysis in one continuous workflow — wet-lab biology focus, not
software R&D. [futurehouse.org/research]

### Sibyl-AutoResearch (arXiv 2605.22343, May 2026)
Self-evolving research framework; central primitive is a **"Scientific Trial-and-Error
Harness"** preserving positive AND negative trial outcomes, routing lessons into seven
downstream behaviors (planning, validation, claim scope, scheduling, critique, writing,
harness repair). Directly competes with GRD's life-harness + DEAD-ENDS registry; its
thesis explicitly rejects "paper generator" systems (Sakana lineage) as losing trial
experience. Formalizes two auditable metrics:

- **trial-to-behavior conversion** — does a trial signal at iteration t change a
  concrete action at iteration t+k?
- **trial-to-harness-behavior conversion** — do recurring process failures change
  gates, prompt overlays, telemetry requirements, scheduler policies, repair tasks,
  or protected constraints?

Its own empirical evidence is deliberately modest and non-comparative (8 high-confidence
conversion events, median latency 1 iteration; a recovered-failure registry of 5 failure
classes; no comparative benchmark) — the bar for out-benchmarking it is low.

### GEAR — Genetic AutoResearch (arXiv 2605.13874; UofT/Vector + Samsung AIC-Toronto)
Drop-in search controller replacing the **single-incumbent hill-climbing outer loop**
of AutoResearch-style agents with **population-based frontier search** (mutation +
crossover over a bounded elite set of research states). Unverified but specific numbers:
all three GEAR variants beat the AutoResearch baseline on validation bits-per-byte under
identical compute (baseline plateaus at 0.98232 after experiment 50; GEAR-Evolve reaches
0.97658 within 100), and **GEAR-Evolve (agent mutates its own search-policy controller
code) beats both fixed and prompt-only controllers in quality and sample efficiency**
(crosses baseline plateau at experiment 40 vs 72/84). *(unverified)* Directly relevant
to GRD's `research_max_candidates` + plateau-window design and the strategy GENOME.

Its related-work survey maps the 2025-2026 field GRD sits in: AI Scientist, Agent
Laboratory, AI-Researcher, InternAgent (2026), AI co-scientist, EvoScientist (2026),
AIDE, MLE-STAR, ML-Master, AIRA — and identifies **Karpathy's "AutoResearch" (2026)**
as a minimal, influential single-agent research-loop reference that multiple 2026
systems extend. *(unverified)*

### AutoResearchClaw (github.com/aiming-lab/AutoResearchClaw) — all *(unverified)*
- 23-stage, 8-phase idea-to-paper pipeline with PIVOT/REFINE decision loops, compile-ready
  LaTeX, citation verification — wider end-to-end scope than GRD.
- Opt-in cross-run self-evolution (MetaClaw bridge): auto-converts run lessons into
  reusable skills (max 3/run, severity threshold); LLM-as-judge Process Reward Model
  with majority voting — the opposite of GRD's deterministic-verdict design.
- v0.5.0 (2026-05-19): domain-specialist executors (high-energy physics, COBRApy biology,
  statistics sims, generic Docker) and **ARC-Bench** — a 55-topic open-ended
  autonomous-research benchmark with per-topic manifests + grading rubrics on Hugging Face.
- Four execution modes (simulated / local sandbox with import allowlists + memory caps /
  Docker with tiered network policies / ssh_remote to GPU servers) + complexity-scored
  routing to an external coding agent.

## Category 2 — Deep-research verification & evaluation (techniques to adopt)

### DeepVerifier (arXiv 2601.15808)
Rubric-based outcome-reward verifier built from an automatically constructed failure
taxonomy (5 major / 13 sub-categories); **outperforms vanilla agent-as-judge and
LLM-judge baselines by 12-48% meta-evaluation F1 on GAIA**. Architecture decomposes
holistic verification into verifiable information-retrieval sub-tasks, exploiting the
**asymmetry of verification** (checking ≪ generating). A plug-and-play test-time
verification-and-feedback loop yields 8-11% accuracy gains on hard GAIA subsets with
no additional training *(2-1 vote — one skeptic dissented)*.

### DR3-Eval (arXiv 2604.14683)
Makes deep-research evaluation **reproducible via a per-task static sandbox corpus**
(evidential docs + confounders + ambient noise — closed-world, fully verifiable).
Five-dimension report evaluation framework validated against human judgment:
Information Recall, Factual Accuracy, Citation Coverage, Instruction Following,
Depth Quality.

## Categories 3 & 4 — coverage note
Agentic coding harnesses (Devin/OpenHands/Aider) and KG-memory systems (mem0, Zep,
Letta, Cognee, HippoRAG) were fetched (sources on record) but their claim
verifications were largely lost to the session limit. Re-run these two angles if a
decision hinges on them.

## Where GRD already wins (defensible, now citable)
1. **Deterministic verdicts** — CodeScientist's ~32% discovery-survival rate and
   Sakana's own template-reliability tradeoff are third-party evidence for GRD's
   no-LLM-on-control-path design. Cite them in positioning.
2. **Compounding negative knowledge** (DEAD-ENDS) — Sibyl independently converged on
   the same thesis (preserve negative trials); GRD had it first but doesn't measure it.
3. **KG grounding + gates + Docker isolation + account rotation** — no surveyed
   competitor combines all four.

## Where competitors are ahead → adoption plans

| # | Plan | Learned from | Effort | Status |
|---|------|-------------|--------|--------|
| P1 | This landscape doc in `.planning/research/` | (gap: none existed) | done | ✅ |
| P2 | **Conversion metrics** — implement Sibyl's trial-to-behavior + trial-to-harness-behavior conversion audit over life-harness rounds & DEAD-ENDS (deterministic, from git + registries) | Sibyl 2605.22343 | S-M | execute now |
| P3 | **Bounded experiment debug retries** — `research_max_debug_depth`: on RUN-stage script failure, feed stderr back for bounded redesign instead of instant fail | AI-Scientist-v2 BFTS | S-M | execute now |
| P4 | **Positioning docs** — cite the 32% survival rate + template tradeoff as evidence for deterministic verdicts | CodeScientist, Sakana | S | execute now |
| P5 | **GRD-Bench** — closed-world benchmark: static corpus + task manifests + deterministic grading (answer ARC-Bench; adopt DR3-Eval's sandbox-corpus method) | ARC-Bench, DR3-Eval | L | roadmap todo |
| P6 | **Frontier search** — population-based elite set over research states to replace single-incumbent plateau loop | GEAR | L | roadmap todo |
| P7 | **Advisory rubric verifier** — failure-taxonomy rubric decomposition as an advisory (non-control-path) layer on eval reports | DeepVerifier | M | roadmap todo |
| P8 | **Per-stage research gates** — optional `hypothesis_review` gate (Agent Lab: per-stage feedback improves quality) | Agent Laboratory | M | roadmap todo |

## Sources (24, primary unless noted)
github.com/sakanaai/ai-scientist-v2 · arxiv.org/abs/2501.04227 ·
aclanthology.org/2025.findings-acl.692 · futurehouse.org/research ·
arxiv.org/pdf/2601.15808 · arxiv.org/pdf/2604.14683 · arxiv.org/pdf/2605.22343 ·
arxiv.org/pdf/2605.13874 · github.com/aiming-lab/AutoResearchClaw ·
sakana.ai/ai-scientist-nature · arxiv.org/abs/2501.13956 · arxiv.org/abs/2405.14831 ·
arxiv.org/pdf/2605.18854 · arxiv.org/pdf/2602.19320 · arxiv.org/pdf/2604.05854 ·
arxiv.org/pdf/2606.11926 · lilianweng.github.io/posts/2026-07-04-harness (blog) ·
mem0.ai/blog/state-of-ai-agent-memory-2026 (blog) ·
particula.tech/blog/agent-memory-frameworks-tested-mem0-zep-letta-cognee-2026 (blog) ·
felloai.com/ai-search-deep-research-comparison (blog) ·
buildmvpfast.com/…/scientific-research-ai (blog) ·
techcrunch.com/2026/05/14/what-happens-when-ai-starts-building-itself (secondary) ·
techcrunch.com/2026/04/21/…neocognition-lands-40m-seed (secondary) ·
hpcwire.com/…/autoscience-secures-new-funding (secondary)
