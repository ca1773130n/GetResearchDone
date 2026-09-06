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

**Autonomous scientists** — Sakana, CodeScientist, Kosmos, FirstResearch, EviBound,
AutoScientists. Closest to GRD's research half. Several now have the same mechanisms and
published results. Kosmos runs ~42,000 lines of code and 1,500 papers per run; GRD gates
every claim and hard-blocks dead ends, which by construction lowers throughput. On any
benchmark scoring *discovery yield*, GRD loses by design.

**Deep-research products** — Gemini Deep Research (now executing code by default in a 30s
Python sandbox), OpenAI, Perplexity, Elicit, Consensus, PaperQA2, STORM. They survey and
synthesize. The line is blurring but has not been crossed: a 30-second analysis of fetched
data is not an experiment with a pre-committed target. They beat GRD outright on breadth,
speed, polish and zero setup, for $10–200/month against our install-and-configure.

Their integrity mechanism is citation, and it is failing: ["Cited but Not Verified"
(2605.06635)](https://arxiv.org/abs/2605.06635) reports link validity above 94% alongside
factual accuracy of 39–77%, *degrading* as tool calls scale from 2 to 150. More retrieval
is not more truth. That is a real argument for our approach.

**Coding harnesses** — Claude Code, Codex, Cursor, Devin, Aider, OpenHands, Goose, Cline.
Claude Code now ships natively what GRD's engineering half wraps: plan mode, planning and
exploration subagents, and per-agent git worktree isolation. I can confirm the last two
from this session's own runtime rather than documentation. **GRD's mechanical advantages
here are gone.** What remains is the discipline, not the plumbing.

**Spec-driven layers** — GitHub Spec Kit is the closest structural analogue, and reading
its reference makes the distinction crisp. Its pipeline runs
`constitution → specify → clarify → plan → checklist → tasks → analyze → implement → converge`.
`/speckit.analyze` is "a read-only cross-artifact consistency and quality analysis across
spec.md, plan.md, and tasks.md". `/speckit.converge` "assesses the codebase against the
feature's spec, plan, and tasks".

Both ask whether the documents and the code agree with each other. Neither runs anything or
measures an outcome. **Spec Kit converges on internal consistency; GRD converges on an
external measurement.** That one line is the clearest statement of the difference, against
the most credible comparable.

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

1. **Run MLE-bench.** It is 75 Kaggle tasks with deterministic programmatic scoring —
   the same shape as GRD's metric/comparator/target, so the harness fits as built. It
   produces the first head-to-head number GRD has ever had. Everything else in this
   document is rhetoric until that exists.
2. **Reposition on preregistration**, not on determinism. Determinism is now crowded;
   pre-commitment before the run is not, and 2606.11217 gives it a name and a template.
3. **Add a warning tier to DEAD-ENDS**, or gather evidence that `-Infinity` beats the
   field's advisory design. Right now we have neither.
4. **Move the harness acceptance set outside the repository it patches.** Rollback is not
   tamper-evidence.
5. **Decide whether the engineering half still earns its keep.** Claude Code ships the
   mechanics natively now. The phase workflow's remaining value is the evidence
   discipline; if that is the product, it should be a much smaller surface.

## Sources

Verified to exist, titles matched, 2026-09-06. Numeric results within them are
second-hand and unconfirmed.

Autonomous scientists: [2609.02246](https://arxiv.org/abs/2609.02246) ·
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

Harnesses: [Spec Kit reference](https://github.github.com/spec-kit/reference/agentic-sdd.html)
