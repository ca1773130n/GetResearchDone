# What actually makes GRD different — 2026-09-06

Supersedes the landscape half of [`competitive-landscape-2026-07.md`](competitive-landscape-2026-07.md)
for the categories that pass left unverified (coding harnesses, agent memory) and
refreshes the autonomous-scientist category, which moved substantially in two months.
That document remains the reference for the systems it covered in depth.

## Bottom line

**One sentence survives contact with the evidence:**

> GRD commits the metric, the comparator and the target *before the experiment runs*,
> and lets only that pre-commitment declare a verdict. Everything else in the field
> checks, post hoc, whether a claim looks supported.

That is a real difference and no source found does it. Every other differentiator this
project has claimed has been independently reinvented, published, and — unlike ours —
**measured**, in the last six months.

The uncomfortable finding is not that GRD is wrong. It is that GRD is right in a way the
field has now caught up to, while GRD is the only participant with no numbers.

Two measurements from the SOTA pass sharpen that. AiScientist ablated away its durable
artifact workspace and lost **31.82 points** of MLE-Bench Lite Any Medal — an independent
team proving the architecture GRD is built on, and beating a frontier Codex harness with it.
And EXP-Bench puts end-to-end autonomous research success at **0.5%**, which is both the
justification for GRD's refusal to accept unmeasured claims and the reason no one should
believe any demo in this category, ours included.

## How much to trust this document

Five research angles ran in parallel. **All five lost their web-fetch tooling and worked
from search-result snippets rather than primary pages.** So the *claims* below are
second-hand quotations.

What I verified myself, directly:

- **All 27 cited papers exist**, with titles matching what was claimed. I checked each
  one. Note the process: an arXiv API sweep reported four as nonexistent; fetching the
  abstract pages directly showed all four were real and correctly titled. The probe was
  wrong, not the research. Had I stopped at the API result I would have reported a 15%
  fabrication rate that did not exist.
- **Claude Science** and **Gemini Deep Research** product pages return HTTP 200 with the
  claimed titles.
- **Spec Kit's command reference**, read in full from the primary source.
- **CodeScientist's ~32% figure**, which GRD's own README leans on: confirmed as
  "19 discoveries, 6 of which were judged as being both at least minimally sound and
  incrementally novel" — 6/19 = 31.6%. See the caveat under *Weak citations* below.
- **Adoption numbers**, from the GitHub and npm APIs.

**Corrected 2026-09-07.** The first version of this document named GitHub Spec Kit as
the closest structural analogue to GRD. That was a bad call: Spec Kit is a
document-consistency layer, and the real competition is the frontier CLI harnesses and the
research line around them. The harness section was rewritten against the paper corpus
rather than web snippets. Where that changed a conclusion, it is marked.

Numeric results quoted from papers are **not** independently checked. Treat any specific
percentage below as needing one confirming read before it goes in front of anyone.

## The one defensible difference

The field has converged on GRD's diagnosis. A survey of 35 systems
([2608.05179](https://arxiv.org/abs/2608.05179)) names it the *verification gap*: code
release is now common, claim-verification artifacts are not.

And it has converged on GRD's prescription. Within the last four months:

| GRD mechanism | Independently published equivalent |
|---|---|
| No LLM judge on the control path | [2609.02246](https://arxiv.org/abs/2609.02246) demotes the judge "from oracle to advisor"; [GroundEval 2606.22737](https://arxiv.org/abs/2606.22737) is "a deterministic replacement for LLM-as-judge" |
| Refutation condition required to admit a hypothesis | [FirstResearch 2607.05682](https://arxiv.org/abs/2607.05682) issues a "Research Question Certificate" recording a falsifiable hypothesis and a decisive test; [2607.09195](https://arxiv.org/abs/2607.09195) is a hypothesis evolution protocol |
| DEAD-ENDS negative-results registry | [2606.21024](https://arxiv.org/abs/2606.21024) makes negative knowledge a shared failure-aware memory; [AutoScientists 2605.28655](https://arxiv.org/abs/2605.28655) stores rejected directions with reasons |
| Artifact-derived write gate | [EviBound 2511.05524](https://arxiv.org/abs/2511.05524) runs approval and verification gates against run IDs and artifacts |
| KNOWHOW supersede-not-overwrite | [Zep/Graphiti 2501.13956](https://arxiv.org/abs/2501.13956) sets `invalid_at` on the superseded edge instead of deleting, bi-temporally |

So "we have a deterministic gate" is no longer a differentiator. What remains is the
**ordering**, and it is a genuine distinction:

- **EviBound verifies that a claimed artifact exists.** The claim comes first; the check
  follows and asks whether evidence backs it.
- **GRD decides what would have counted before the run could produce anything.** The
  target is fixed at DESIGN, pinned across debug re-plans, and the verdict is a
  five-operator numeric comparison in `lib/research/verdict.ts` with zero model calls.

Post-hoc verification can be satisfied by whatever the run happened to produce.
Pre-commitment cannot, because the bar existed before the evidence did.

There is a ready-made name for this: [Preregistration for Experiments with AI Agents
(2606.11217)](https://arxiv.org/abs/2606.11217) catalogs "outcome-contingent redesign"
as a researcher degree of freedom that "the low cost of iteration makes easy to exploit
and difficult to detect". **GRD's DESIGN stage is machine-executable preregistration.**
That is the sharpest available positioning, and it is honest.

## Where GRD is behind, plainly

### 1. Everyone has numbers. GRD has none.

`docs/benchmark/INTERNAL-BENCH.md` specifies 30 tasks for comparison against Aider,
SWE-agent and OpenHands. `docs/benchmark/results/` does not exist. The 11 tasks under
`bench/` check whether GRD's own loop reaches an expected verdict — a self-consistency
check, not a comparison with anything.

Meanwhile: EviBound published an ablation (hallucinated claims 100% → 0%). Kosmos reports
79.4% conclusion accuracy. AARRI-Bench's best configuration reports 68.3%. Elicit
published 96.9% screening sensitivity across 994 Cochrane reviews.

A vendor with a benchmark outranks a project without one, regardless of whose methodology
is better. **This is the binding constraint on every claim in this document.**

### 2. The self-improvement gate sits inside its own blast radius

`gd harness round` patches GRD's primitives, gated by an eval that lives in the same
repository the round modifies. Two papers now target exactly this:
[Auditing Harness Tampering in Self-Improving Agents (2609.00069)](https://arxiv.org/abs/2609.00069)
and [Self-Authored Verification Is Unreliable in Heuristic Self-Improving Agents
(2607.24300)](https://arxiv.org/abs/2607.24300), which proposes a sealed exogenous
acceptance loop.

Git-reversible gives rollback. It does not give tamper-evidence. GRD has no held-out
acceptance set outside the thing being modified.

### 3. `-Infinity` may be the wrong design, not the stronger one

A DEAD-ENDS slug scores any future candidate plan citing it at `-Infinity`: permanent,
no warning tier, human-only reversal via `gd dead-end retire`. The field's version
([2606.21024](https://arxiv.org/abs/2606.21024)) is **advisory** — downstream agents
"explicitly adopt or reject those records" — and reports beating baselines on
ScienceAgentBench retry using *fewer* tokens.

We have assumed the harder block is the better one. There is published evidence for the
softer design and none for ours.

### 4. No forget, no repair, no audit trail of influence

[MemSecBench (2607.27080)](https://arxiv.org/abs/2607.27080) tests a Write–Execute–Forget
protocol: can a poisoned memory be selectively repaired? GRD has no answer. A wrong
KNOWHOW entry can be superseded going forward, but nothing identifies which past plans it
already scored. Graphiti can answer "what did we believe on date X, and when did we stop".
GRD's supersede chain is a file history.

Relatedly, [When Not to Write Memory (2607.02579)](https://arxiv.org/abs/2607.02579)
gates promotion on *dependency-adjusted* corroboration and adds a `needs-review` tier.
GRD's write gate is binary and counts artifacts without checking they are independent, so
several correlated traces from one run satisfy it.

### 5. Distribution is effectively zero

| Project | GitHub stars |
|---|---:|
| OpenHands | 86,331 |
| Cline | 67,556 |
| Goose | 53,958 |
| Aider | 48,785 |
| STORM | 31,233 |
| GPT-Researcher | 29,310 |
| SWE-agent | 20,251 |
| Sakana AI-Scientist | 14,502 |
| **GRD** | **0** |

npm downloads last month: GRD **104**, OpenAI Codex **71,337,740**.

The package is also `UNLICENSED` while published public, and single-maintainer.

## What the competitors actually are

**Autonomous research systems — the actual SOTA.** This is GRD's category, so it gets the
detail. Queried from the paper corpus by state of the art rather than by search snippets.

*The frontier system is [DeepScientist (2509.26603)](https://arxiv.org/abs/2509.26603)*,
ICLR 2026, **3,316 GitHub stars**. It formalises discovery as Bayesian optimisation over a
cumulative Findings Memory, balancing exploitation of promising avenues against exploration
of new hypotheses. The scale is the point:

| | |
|---|---|
| Compute | over 20,000 GPU hours |
| Ideas generated / experimentally validated | ~5,000 / ~1,100 |
| Margin over human 2025 SOTA on three frontier tasks | +183.7%, +1.9%, +7.9% |

It claims two weeks of autonomous progress on AI text detection comparable to three years of
cumulative human work, achieved by redesigning methodologies rather than recombining them.
Its head-to-head table is the more useful number for us: on generated papers DeepScientist
reports a 60% accept rate, while **AI Scientist, AI Scientist-v2, Zochi, CycleResearcher and
HKUSD AI Researcher all report 0%.** The previous generation of AI-scientist systems — the
ones our July landscape treated as the competition — score zero on this axis.

*The system closest to GRD's actual problem statement is
[AiScientist (2604.13018)](https://arxiv.org/abs/2604.13018)*, and it matters more to us
than DeepScientist does. It defines **long-horizon ML research engineering**: "converting a
research specification into a runnable ML system through repeated implementation,
experimentation, and refinement," where the challenge is "to sustain cumulative project
progress across heterogeneous stages under delayed, confounded feedback." That is GRD's job
description written by someone else.

Its architecture is **thin control over thick state**: a lightweight hierarchical agent team
coordinating through a *File-as-Bus* workspace that preserves decision-relevant artifacts
across roles and invocations. Results:

| Benchmark | Result |
|---|---|
| PaperBench, over strongest matched baselines | +9.92 (Gemini-3-Flash), +11.15 (GLM-5) |
| MLE-Bench Lite, Any Medal% | 81.82 under both backbones |
| MLE-Bench Lite vs a Codex/GPT-5.5 xhigh frontier harness | **+13.64 Any Medal points** |
| **Ablation: remove File-as-Bus** | **−6.41 PaperBench, −31.82 Any Medal%** |

Read that ablation carefully, because it is the single most important number in this
document for GRD. Stripping the durable, inspectable artifact workspace costs **31.82
points**. Their conclusion: "long-horizon AI research is not only a problem of stronger local
reasoning, but a systems problem of maintaining cumulative, inspectable project progress."

**GRD is that thesis, built.** `.planning/` with its ledger, KNOWHOW, DEAD-ENDS, plan
artifacts and reflections *is* a File-as-Bus. An independent team has now measured what that
architecture is worth and beaten a frontier Codex harness with it. This is the strongest
external validation GRD's design has ever received, and GRD had no part in it and no number
of its own.

*The honest ceiling is [EXP-Bench (2505.24785)](https://arxiv.org/abs/2505.24785)*, ICLR
2026: 461 research tasks from 51 top-tier papers, where an agent must form a hypothesis,
design and implement the procedure, execute it and analyse the result. Leading agents score
20–35% on individual aspects such as design or implementation correctness. On **complete,
executable experiments the success rate is 0.5%**.

That is the state of end-to-end autonomous research: essentially zero. Which is the argument
for GRD's whole posture — a loop that refuses to call something supported without a
pre-committed measurement is the right shape for a field whose end-to-end success rate is one
in two hundred. It is also the reason nobody should believe a demo.

*The benchmark shelf GRD could be scored on*, all ICLR/ICML 2026 and all newer than our July
pass: EXP-Bench (end-to-end experiments),
[HeurekaBench (2601.01678)](https://arxiv.org/abs/2601.01678) for co-scientist scenarios,
[InnovatorBench (2510.27598)](https://arxiv.org/abs/2510.27598) for innovative AI research,
[From Reproduction to Replication (2506.19724)](https://arxiv.org/abs/2506.19724) which uses
progressive code masking, [FIRE-Bench (2602.02905)](https://arxiv.org/abs/2602.02905) on
rediscovering known insights precisely because novel findings are too costly to validate,
and [InnoGym (2512.01822)](https://arxiv.org/abs/2512.01822), which argues existing
benchmarks "primarily measure correctness, overlooking the diversity of methods behind
solutions."

*Also in the category:* Microsoft's **R&D-Agent** line
([R&D-Agent-Quant](https://github.com/microsoft/RD-Agent), NeurIPS 2025, and FT-Dojo at ICML
2026) is the closest thing to a corporate-backed product in GRD's exact niche;
[SR-Scientist (2510.11661)](https://arxiv.org/abs/2510.11661) does agentic equation
discovery; [AI co-mathematician (2605.06651)](https://arxiv.org/abs/2605.06651) is the
interactive workbench framing. And the sceptical literature is arriving alongside: two 2026
studies testing frontier agentic systems on real scientific problems report "persistent gaps
between those claims and demonstrated capability."

*What this changes for GRD.* Three things, in order of how much they should hurt:

1. **Scale.** DeepScientist spends 20,000 GPU hours to redesign methodologies. GRD runs a
   single-threaded loop with a Docker sandbox. We are not competing on discovery yield and
   should stop implying we are.
2. **Validation we did not earn.** AiScientist proved the durable-artifact thesis GRD is
   built on, with an ablation. We should cite it, adopt File-as-Bus framing, and stop
   describing `.planning/` as a bookkeeping detail — it is the mechanism.
3. **The gap is still only measurement.** GRD's pre-committed metric contract remains
   orthogonal to everything above: DeepScientist optimises over a findings memory,
   AiScientist preserves artifacts, neither fixes the bar before the run. That differentiator
   survives this pass, and it is still worth exactly nothing until it appears on one of the
   six benchmarks listed above.

**Deep-research products** — Gemini Deep Research (now executing code by default in a 30s
Python sandbox), OpenAI, Perplexity, Elicit, Consensus, PaperQA2, STORM. They survey and
synthesize. The line is blurring but has not been crossed: a 30-second analysis of fetched
data is not an experiment with a pre-committed target. They beat GRD outright on breadth,
speed, polish and zero setup, for $10–200/month against our install-and-configure.

Their integrity mechanism is citation, and it is failing: ["Cited but Not Verified"
(2605.06635)](https://arxiv.org/abs/2605.06635) reports link validity above 94% alongside
factual accuracy of 39–77%, *degrading* as tool calls scale from 2 to 150. More retrieval
is not more truth. That is a real argument for our approach.

**Coding harnesses — the actual competition.** An earlier draft of this document treated
GitHub Spec Kit as the closest analogue. That was wrong, and wrong in a way worth naming:
Spec Kit is a document-consistency layer, and anchoring on it flattered us. The real
competition is the frontier CLI harnesses and the research line forming around them.

*The harness is now a measured variable, and that is the strongest evidence GRD has ever
had for its own premise.* [WildClawBench (2605.10912)](https://arxiv.org/abs/2605.10912),
516 GitHub stars, runs 60 long-horizon bilingual tasks inside Docker against **real CLI
harnesses — OpenClaw, Claude Code, Codex and Hermes Agent** — with real tools rather than
mocks. Two results matter to us:

| Finding | Number |
|---|---|
| Best model overall (Claude Opus 4.7, under OpenClaw) | 62.2% |
| Every other model | below 60% |
| **Score shift from changing harness alone, same model** | **up to 18 points** |

Eighteen points from swapping the harness, on a benchmark where the spread between
frontier models is smaller than that. GRD's whole thesis is that the discipline around
the loop is what matters. Somebody just measured it and the thesis holds. GRD is a CLI
harness on top of Claude Code, so **it can be added as a fifth harness and scored.** That
is a far better first number than the Kaggle-style suite an earlier draft recommended,
because it measures the thing GRD actually is.

*Claude Code's architecture is now documented in the literature.*
["Dive into Claude Code" (2604.14228)](https://arxiv.org/abs/2604.14228) reverse-engineers
it: a simple while-loop calling model and tools, wrapped in a seven-mode permission system
with an ML classifier, a five-layer compaction pipeline, four extensibility mechanisms
(MCP, plugins, skills, hooks), subagent delegation and orchestration, and append-oriented
session storage. It compares Claude Code against **OpenClaw** and **Hermes Agent** as
independent systems answering the same design questions differently. Those two, not Spec
Kit, are GRD's structural peers. GRD is built *on* the fourth mechanism in that list, which
is both its distribution advantage and its dependency risk.

*Dynamic workflow orchestration has a benchmark, and it already refuses LLM judges.*
[ClawArena-Team (2606.31174)](https://arxiv.org/abs/2606.31174) scores a single model's
ability to manage subagents through dynamic workflows across 41 scenarios and 258 rounds.
Its Subagent-Management Score is **execution-based with no LLM judge** — so "no judge on
the control path" is now table stakes in benchmark design, not a GRD differentiator. Three
of its findings bear directly on us: the bottleneck is privilege granting rather than
perception, with no model exceeding 50% workspace-permission precision; cost and management
quality are decoupled, with API cost spanning over 100x while scores span under 4x; and
**leaderboard scores cluster within 9.9 points while orchestration behaviours diverge by
more than an order of magnitude.** That last one is the case for caring about harness design
at all, and also a warning that a single headline number will not show it.

*Someone has built the outer harness GRD lacks.* [VeRO (ICML 2026)](https://github.com/scaleapi/vero),
from Scale AI, targets "agent harness optimization: the iterative improvement of a target
agent by editing and evaluating its code" — a one-line description of `gd harness round`.
VeRO is an **outer** harness providing versioned snapshots, budget-controlled evaluation and
structured execution traces of the *target* harness, plus VeRO-Bench. The separation of
optimizer from target is exactly the sealed exogenous acceptance this document flags as
missing from GRD, where the eval gate lives inside the repository it patches. They have the
architecture and a benchmark; we have git revert.

*Environments beat trajectories.* [Terminal-Universe (2609.04148)](https://arxiv.org/abs/2609.04148),
four days old, makes a point that lands hard here: an environment "can be re-queried into
many verifiable tasks and provides execution feedback, whereas a trajectory is a single
frozen demonstration." It reconstructs runnable environments by replaying the file
operations in agent trajectories, produces 37.3k of them, and fine-tunes on the result for
+11.9 points on Terminal-Bench 2.1. GRD accumulates trajectories — sessions compiled into a
knowledge graph — and mines them for prose takeaways. It never turns them back into
re-runnable verifiable environments. That is a gap and a good idea to take.

*Also now measured, all against GRD's surface area:* [SWE-CI (2603.03823)](https://arxiv.org/abs/2603.03823)
evaluates agents maintaining codebases through continuous integration;
[FormulaCode (2603.16011)](https://arxiv.org/abs/2603.16011) scores optimization on large
codebases and criticises "binary correctness signals";
[CentaurEval (2512.04111)](https://arxiv.org/abs/2512.04111) benchmarks the value of
human-in-the-loop in agentic coding, which is precisely what GRD's interactive checkpoints
claim to provide; [SkillMOO (2604.09297)](https://arxiv.org/abs/2604.09297) argues that
evolving agent skills on pass rate alone is insufficient; and two independent studies
([2602.11988](https://arxiv.org/abs/2602.11988),
[2601.20404](https://arxiv.org/abs/2601.20404)) ask empirically whether repository context
files such as `AGENTS.md` help at all — a live question for a project whose interface is a
large `CLAUDE.md`.

*The framing document.* ["Code as Agent Harness" (2605.18747)](https://arxiv.org/abs/2605.18747)
surveys this whole shift and lists its open challenges: evaluation beyond final task
success, verification under incomplete feedback, **regression-free harness improvement**,
consistent shared state across agents, and human oversight for safety-critical actions.
GRD has a position on every one of those. None of them is measured.

*On Tencent specifically:* I could not verify a recent Tencent coding harness in the paper
corpus. Tencent's agent-adjacent output there is
[Youtu-GraphRAG (2508.19855)](https://arxiv.org/abs/2508.19855), ICLR 2026 from Tencent
Youtu Lab, which unifies graph construction and retrieval — relevant to GRD's knowledge-graph
grounding rather than to its harness. If you have a specific Tencent release in mind, name it
and I will go at it directly rather than guessing.

**Agent memory** — Zep/Graphiti, Mem0, Letta, Cognee, GraphRAG. Supersession is standard
in the graph tier and better implemented than ours. Mem0's `DELETE`-on-contradiction is
strictly weaker. GraphRAG-style indexes cannot retract locally at all. Native memory is
arriving in Claude and Cursor, untyped.

The stance that survives: no memory product surveyed gates a write on artifacts from a
*pre-registered falsification test*, and none has a DEAD-ENDS equivalent. They decide
whether a claim is consistent with other claims; GRD decides whether it survived an
attempt to refute it.

## Two things worth correcting in our own materials

**Weak citation.** The README cites CodeScientist's ~32% to support "no LLM-judged scoring
on the control path". The figure is real (6 of 19 discoveries). But those six were judged
**by humans** in a multi-faceted evaluation, so it measures how few machine-generated
discoveries survive human scrutiny — not that LLM judges are unreliable. It is evidence for
*humility about autonomous discovery*, not for our specific architectural choice. Better
support now exists: ["More Convincing, Not More Correct" (2607.05904)](https://arxiv.org/abs/2607.05904)
reports a strict three-judge ensemble still accepting 55% of errors.

**The retired claim.** The README's 92.2% self-authorship badge is measured
deterministically from `git log --numstat`, but it counts commits whose *message* matches
an evolve-iteration pattern, and `gd evolve` is retired. It describes a historical window
under a discontinued mechanism.

## What I would do about it

1. **Get on WildClawBench as a fifth harness.** It already runs OpenClaw, Claude Code,
   Codex and Hermes Agent in Docker against real tools, and it has *measured* that
   swapping the harness moves a single model by up to 18 points. That is GRD's entire
   thesis stated as a number, on a rig built to accept exactly what GRD is. It is a
   better first target than a Kaggle-style suite, which would measure the research loop
   rather than the harness. Everything else in this document is rhetoric until a number
   exists. (MLE-bench remains the right second target, for the research half.)
2. **Reposition on preregistration**, not on determinism. Determinism is now crowded;
   pre-commitment before the run is not, and 2606.11217 gives it a name and a template.
   Pair it with AiScientist's *File-as-Bus* framing for `.planning/`: they measured that
   architecture at 31.82 points, and GRD has been describing its own version as
   bookkeeping.
3. **Add a warning tier to DEAD-ENDS**, or gather evidence that `-Infinity` beats the
   field's advisory design. Right now we have neither.
4. **Move the harness acceptance set outside the repository it patches.** Rollback is not
   tamper-evidence. Do not design this from scratch — VeRO is the outer-harness pattern
   already built and benchmarked, and it is open source. Read it before writing anything.
5. **Keep the engineering half, but cut it to the discipline.** Claude Code ships the
   mechanics natively now — plan mode, exploration and planning subagents, per-agent
   worktree isolation — so wrapping them adds nothing. What WildClawBench shows is that
   the surrounding discipline is worth up to 18 points, which is the argument for the
   half that remains. Everything in the phase workflow that is not evidence enforcement
   is now dead weight competing with a native feature.

## Sources

Verified to exist, titles matched, 2026-09-06. Numeric results within them are
second-hand and unconfirmed.

Autonomous research SOTA (queried from the paper corpus, 2026-09-07):
[DeepScientist 2509.26603](https://arxiv.org/abs/2509.26603) ·
[AiScientist 2604.13018](https://arxiv.org/abs/2604.13018) ·
[EXP-Bench 2505.24785](https://arxiv.org/abs/2505.24785) ·
[HeurekaBench 2601.01678](https://arxiv.org/abs/2601.01678) ·
[InnovatorBench 2510.27598](https://arxiv.org/abs/2510.27598) ·
[Reproduction to Replication 2506.19724](https://arxiv.org/abs/2506.19724) ·
[FIRE-Bench 2602.02905](https://arxiv.org/abs/2602.02905) ·
[InnoGym 2512.01822](https://arxiv.org/abs/2512.01822) ·
[SR-Scientist 2510.11661](https://arxiv.org/abs/2510.11661) ·
[AI co-mathematician 2605.06651](https://arxiv.org/abs/2605.06651) ·
[R&D-Agent](https://github.com/microsoft/RD-Agent)

Autonomous scientists (earlier pass): [2609.02246](https://arxiv.org/abs/2609.02246) ·
[2606.22737](https://arxiv.org/abs/2606.22737) · [2511.05524](https://arxiv.org/abs/2511.05524) ·
[2607.05682](https://arxiv.org/abs/2607.05682) · [2607.09195](https://arxiv.org/abs/2607.09195) ·
[2606.21024](https://arxiv.org/abs/2606.21024) · [2605.28655](https://arxiv.org/abs/2605.28655) ·
[2608.14905](https://arxiv.org/abs/2608.14905) · [2606.11217](https://arxiv.org/abs/2606.11217) ·
[2606.07462](https://arxiv.org/abs/2606.07462) · [2606.07591](https://arxiv.org/abs/2606.07591) ·
[2511.02824](https://arxiv.org/abs/2511.02824) · [2608.05179](https://arxiv.org/abs/2608.05179) ·
[2503.22708](https://arxiv.org/abs/2503.22708)

Verification and benchmarks: [2607.05904](https://arxiv.org/abs/2607.05904) ·
[2609.00069](https://arxiv.org/abs/2609.00069) · [2607.24300](https://arxiv.org/abs/2607.24300) ·
[2605.02651](https://arxiv.org/abs/2605.02651) · [2507.17746](https://arxiv.org/abs/2507.17746)

Deep research: [2605.06635](https://arxiv.org/abs/2605.06635) ·
[2604.03173](https://arxiv.org/abs/2604.03173) · [2409.13740](https://arxiv.org/abs/2409.13740) ·
[Claude Science](https://www.anthropic.com/news/claude-science-ai-workbench) ·
[Gemini Deep Research](https://ai.google.dev/gemini-api/docs/interactions/deep-research)

Memory: [2501.13956](https://arxiv.org/abs/2501.13956) ·
[2509.26354](https://arxiv.org/abs/2509.26354) · [2607.27080](https://arxiv.org/abs/2607.27080) ·
[2607.02579](https://arxiv.org/abs/2607.02579) · [2508.19828](https://arxiv.org/abs/2508.19828)

Harnesses and orchestration: [WildClawBench 2605.10912](https://arxiv.org/abs/2605.10912) ·
[Dive into Claude Code 2604.14228](https://arxiv.org/abs/2604.14228) ·
[ClawArena-Team 2606.31174](https://arxiv.org/abs/2606.31174) ·
[VeRO (ICML 2026)](https://github.com/scaleapi/vero) ·
[Terminal-Universe 2609.04148](https://arxiv.org/abs/2609.04148) ·
[Code as Agent Harness 2605.18747](https://arxiv.org/abs/2605.18747) ·
[SWE-CI 2603.03823](https://arxiv.org/abs/2603.03823) ·
[FormulaCode 2603.16011](https://arxiv.org/abs/2603.16011) ·
[CentaurEval 2512.04111](https://arxiv.org/abs/2512.04111) ·
[SkillMOO 2604.09297](https://arxiv.org/abs/2604.09297) ·
[AGENTS.md studies 2602.11988](https://arxiv.org/abs/2602.11988),
[2601.20404](https://arxiv.org/abs/2601.20404) ·
[Youtu-GraphRAG 2508.19855](https://arxiv.org/abs/2508.19855) ·
[Spec Kit reference](https://github.github.com/spec-kit/reference/agentic-sdd.html) (a
document-consistency layer, not a peer harness — kept for the contrast only)
