# Discussion: We want to adapt ideas from the NERFIFY paper (multi-agent paper-to-code framework) into GRD's research and execution phases. NERFIFY has 6 innovations: (1) CFG formalization — constrain LLM output to satisfy framework invariants, (2) Graph-of-Thought multi-agent synthesis — generate code in topological dependency order, (3) Compositional citation recovery — traverse citation graphs to find missing components from referenced papers, (4) Closed-loop visual refinement — iterative feedback using quality metrics, (5) Agentic knowledge enhancement — discover optimizations in existing code, (6) Evaluation benchmark. GRD already has: grd-surveyor (SoTA survey), grd-deep-diver (paper analysis), grd-feasibility-analyst, grd-phase-researcher, grd-executor (code generation), grd-verifier (tiered verification), grd-code-reviewer, multi-backend discussion, wireup discovery. Pick the 3-4 most impactful NERFIFY ideas to adapt for GRD and explain HOW to implement each one concretely. Do NOT ask clarifying questions — give direct recommendations.

**Phase:** unknown  **Type:** discussion  **Participants:** claude, codex, gemini, opencode
**Synthesizer:** claude  **Rounds:** 1  **Duration:** 477687ms
**Timestamp:** 2026-03-24T12:52:16.296Z

## Round 1

### claude Response
## NERFIFY → GRD: Top 4 Adaptations

Based on deep analysis of GRD's architecture, here are the 4 most impactful NERFIFY ideas and how to implement each:

---

### 1. Graph-of-Thought Task Ordering (from GoT multi-agent synthesis)

**Why most impactful:** GRD already has Kahn's algorithm in `lib/deps.js` for phase-level parallelism, but tasks within a plan execute strictly sequentially. NERFIFY's topological synthesis would enable **task-level dependency graphs**, unlocking parallel task execution within a single plan.

**Concrete implementation:**

- **Extend plan frontmatter** with a `task_graph` section mapping task dependencies (currently tasks are an ordered list with no declared interdependencies)
- **Extend `lib/deps.ts`** — the existing `computeParallelGroups()` already returns `string[][]` batches via Kahn's. Generalize it to accept task-level nodes, not just phase-level
- **Modify `grd-planner` agent** to emit `depends_on` per task (e.g., "task 3 depends on tasks 1,2 but not on each other"). The planner already understands `wave:` at plan level — extend the concept inward
- **Modify `grd-executor` agent** — currently iterates tasks sequentially. Add a parallel dispatch mode: group independent tasks into waves, spawn parallel subagents per wave (executor already supports worktree isolation)
- **Files modified:** `lib/deps.ts` (generalize), `agents/grd-planner.md` (task graph output), `agents/grd-executor.md` (parallel task dispatch), plan schema in `lib/plan.ts`

**Risk:** Task-level parallelism within a single plan can cause file conflicts. Mitigate with the existing `files_modified` manifest — planner must ensure parallel tasks don't touch the same files.

---

### 2. Compositional Citation Recovery (from citation graph traversal)

**Why most impactful:** This fills GRD's biggest research gap. When `grd-deep-diver` analyzes a paper that says "we use the attention mechanism from [37]" or "building on the loss function from [12]", those components are currently black boxes. NERFIFY's citation traversal would systematically resolve them.

**Concrete implementation:**

- **New agent: `grd-citation-tracer`** — given a deep-dive document, extract all referenced techniques that aren't self-contained, chase each to its source paper, and produce implementation-ready specifications
- **Trigger:** Add a `missing_components` section to deep-diver output. When deep-diver encounters "uses X from [ref]" where X isn't fully described, it logs it as a missing component with the citation
- **Pipeline integration:** After deep-diver completes → citation-tracer runs on `missing_components` → for each: WebSearch the cited paper → extract the specific algorithm/technique → append to PAPERS.md with a `component_of:` backlink
- **Modify `grd-phase-researcher`** to consume resolved citations. Currently it reads LANDSCAPE.md and PAPERS.md — add logic to check that all referenced techniques in the chosen approach have resolved citations before planning proceeds
- **Files:** New `agents/grd-citation-tracer.md`, modify `agents/grd-deep-diver.md` (missing_components output), modify `agents/grd-phase-researcher.md` (citation completeness check), new `lib/citations.ts` for graph management
- **Output:** `{research_dir}/citations/` directory with per-component specs, backlinked to PAPERS.md

**Why this beats what GRD has:** Surveyor finds papers. Deep-diver analyzes them. But neither chases the dependency tree of techniques. A paper scoring 5/5 in deep-diver might depend on 3 sub-techniques from other papers that nobody analyzed. Citation recovery closes this.

---

### 3. Closed-Loop Verification Refinement (from iterative visual refinement)

**Why most impactful:** GRD's verification is currently **open-loop** — verifier runs once, finds gaps, then a *separate* gap-closure plan is created and executed in a *new* phase. NERFIFY's closed-loop approach would create a **tight executor↔verifier feedback loop** within a single phase execution.

**Concrete implementation:**

- **Add `refinement_budget` to plan frontmatter** — max number of executor↔verifier iterations (default: 2, max: 5). Prevents infinite loops
- **Modify autopilot orchestration in `lib/autopilot.ts`** — after executor completes a plan, run verifier. If verifier returns `status: gaps_found` AND `refinement_budget > 0`:
  1. Feed gaps back to executor as a micro-plan (not a full re-plan)
  2. Executor addresses gaps with targeted fixes
  3. Re-verify with `refinement_budget - 1`
  4. Repeat until passed or budget exhausted
- **New verification mode: `re-verify`** — already partially exists (verifier has re-verification logic that skips passed items). Formalize it: verifier accepts previous VERIFICATION.md and only checks items that were `gaps_found`
- **Metrics feedback:** For quantitative targets (eval_metrics in frontmatter), verifier returns the delta: "metric X is at 0.72, target is 0.85, gap is 0.13". Executor uses this to prioritize which gaps to close first
- **Files modified:** `lib/autopilot.ts` (refinement loop), `agents/grd-verifier.md` (structured gap output with deltas), `agents/grd-executor.md` (micro-plan acceptance mode), plan schema (refinement_budget field)

**Why this beats what GRD has:** Currently, gap closure requires: verifier → human reads gaps → `/grd:plan-phase --gaps` → new plan → new execution → new verification. That's 3+ human touchpoints. Closed-loop makes it 0 human touchpoints for mechanical gaps (missing tests, threshold not met, file not created).

---

### 4. Agentic Knowledge Enhancement (from optimization discovery)

**Why most impactful:** GRD's `grd-evolve` improves the GRD tool itself, but there's no agent that mines **domain-specific optimizations from existing open-source implementations** relevant to the current research task. NERFIFY's knowledge enhancement would augment `grd-phase-researcher` with empirical knowledge from real codebases.

**Concrete implementation:**

- **Extend `grd-phase-researcher`** with a "codebase mining" step — before producing RESEARCH.md, search GitHub for repos implementing similar techniques (using code URLs from LANDSCAPE.md and PAPERS.md)
- **New section in RESEARCH.md: `## Empirical Optimizations`** — optimizations found in real implementations that papers don't mention (e.g., "all 3 repos use gradient checkpointing even though the paper doesn't mention it", "2/3 repos apply LayerNorm before attention, not after as paper states")
- **Integration with `grd-deep-diver`** — deep-diver already has "Implementation Notes" section. Enhance: when code URL is available, don't just describe structure — extract specific optimizations, workarounds, and deviations from the paper's description
- **New utility: `lib/code-mining.ts`** — given a GitHub repo URL, fetch key files (model.py, train.py, config), extract patterns (learning rate schedules, normalization strategies, initialization methods), return structured optimization list
- **Feed into planner:** `grd-planner` reads Empirical Optimizations from RESEARCH.md and incorporates proven tricks into task specifications (e.g., "use gradient checkpointing per optimization finding O-3")
- **Files:** Modify `agents/grd-phase-researcher.md` (mining step), modify `agents/grd-deep-diver.md` (optimization extraction), new `lib/code-mining.ts`, modify RESEARCH.md template

**Why this beats what GRD has:** Papers describe idealized algorithms. Real implementations contain hard-won optimizations that make the difference between "runs in theory" and "runs in practice." This bridges that gap systematically rather than hoping the executor discovers them during implementation.

---

### Priority Order

| Rank | Adaptation | Effort | Impact | Why |
|------|-----------|--------|--------|-----|
| 1 | Closed-Loop Verification | Medium | High | Eliminates most human touchpoints in gap closure; builds on existing re-verify logic |
| 2 | Citation Recovery | Medium | High | Prevents "missing technique" failures that surface late in execution |
| 3 | Knowledge Enhancement | Low | Medium | Low-hanging fruit — mostly extends existing deep-diver and researcher agents |
| 4 | GoT Task Ordering | High | Medium | Significant architecture change to executor for parallelism that's only valuable for large plans |

I'd implement **3 → 1 → 2** (knowledge enhancement first since it's cheapest, then closed-loop since it has highest ROI, then citation recovery). GoT task ordering is worth deferring — GRD's current wave-based plan parallelism already captures most of the benefit at the plan level.
---

### codex Response
The highest-leverage NERFIFY ideas for GRD are:

1. `CFG formalization`
2. `Graph-of-Thought topological synthesis`
3. `Compositional citation recovery`
4. `Agentic knowledge enhancement`

I would not prioritize NERFIFY’s visual refinement loop as a core GRD feature yet. It fits frontend-heavy phases and `wireup`, but the four above improve nearly every research-backed execution path.

**1. CFG Formalization: make research and plan outputs structurally valid before they can drive execution**

GRD already relies on informal contracts in `RESEARCH.md`, `PLAN.md`, `EVAL.md`, `must_haves`, `depends_on`, and `files_modified`. The weak point is that these are prompt-enforced, not grammar-enforced. NERFIFY’s idea maps directly to “don’t let planner/executor outputs violate framework invariants.”

Implement it like this:

- Add explicit schemas for the machine-critical parts of phase artifacts:
  - `PLAN.md` frontmatter schema: `phase`, `plan`, `wave`, `depends_on`, `files_modified`, `verification_level`, `must_haves`, `eval_metrics`.
  - Task schema: `type`, `name`, `inputs`, `outputs`, `requires`, `provides`, `checkpoint_kind`.
  - `RESEARCH.md` extraction schema: `recommendations[]`, `paper_refs[]`, `required_components[]`, `verification_strategy`.
- In `lib/frontmatter.ts` and `lib/types.ts`, define strict parse/validate helpers instead of permissive extraction.
- Extend `grd-plan-checker` from “review plans after generation” to “reject structurally invalid plans before they become executable.”
- Add a small compiler step in `cmdInitPlanPhase` or planner orchestration:
  - planner writes draft markdown
  - `grd-tools` parses it into typed objects
  - if invalid, send the exact parse/constraint errors back into the revision loop
  - only valid plans become official `*-PLAN.md`
- Add invariants beyond syntax:
  - every `depends_on` target exists
  - every `must_haves.artifacts` is produced by some task
  - every file in `files_modified` belongs to exactly one plan in a wave unless forced parallel
  - `verification_level` matches presence of eval/proxy/deferred checks

Why this is high impact: it improves the whole pipeline immediately. GRD already has rich planning artifacts; enforcing them turns them from “well-structured prose” into a real IR.

**2. Graph-of-Thought Topological Synthesis: push dependency-aware decomposition earlier, not just at execution time**

GRD already does topological execution at the phase/wave level through `depends_on`, `buildWaves`, and write-intent conflict splitting. NERFIFY’s useful extension is to make the planner synthesize implementation in dependency order, not just execute prewritten plans in dependency order.

Implement it like this:

- Add a planner-side intermediate artifact, either embedded in frontmatter or as a sidecar:
  - `implementation_graph:`
  - nodes = capabilities/artifacts
  - edges = build dependencies
  - node fields = `owner_plan`, `produces`, `consumes`, `verification_target`
- Change `grd-planner` so it first decomposes the phase into a DAG of artifacts/components before writing any plan tasks.
- Require each plan to declare:
  - `provides`
  - `requires`
  - `integration_points`
- Use that DAG in two places:
  - planning: split a phase into plans/waves from the graph, instead of mostly heuristic decomposition
  - execution: feed only the reachable subgraph for a given plan into `grd-executor`, so the executor sees upstream assumptions and downstream consumers
- Strengthen `grd-plan-checker` to verify graph completeness:
  - every `requires` is satisfied by a prior node, existing code, or an explicit external dependency
  - no orphan plan exists with no graph role
- Reuse current `files_modified` conflict logic as a second-pass scheduling constraint, not the primary decomposition method

Concrete GRD fit:
- `plan-phase` becomes “research -> build implementation graph -> emit plans”
- `execute-phase` keeps its current wave engine, but now runs a graph-derived wave plan instead of a mostly human/prompt-derived one
- this also improves multi-agent team execution, because each executor gets a bounded subgraph instead of a flat plan

Why this is high impact: GRD already has the runtime for topo execution. The missing piece is topo synthesis upstream.

**3. Compositional Citation Recovery: teach research agents to chase prerequisite methods, not just summarize the named paper**

This is the most obviously transferable research-phase improvement. GRD has `grd-surveyor`, `grd-deep-diver`, and `grd-phase-researcher`, but today the pipeline is mostly “search topic -> analyze chosen papers -> recommend.” NERFIFY’s stronger move is: if a paper depends on components from cited work, automatically recover those missing pieces.

Implement it like this:

- Extend `grd-deep-diver` to emit a structured “dependency extraction” section:
  - `core_method`
  - `borrowed_components`
  - `unstated_prerequisites`
  - `papers_to_chase`
- Add a citation-recovery pass in `grd-phase-researcher`:
  - when a recommendation depends on a component not fully explained in the target paper, spawn follow-up deep dives on the cited papers
  - examples: loss function origin paper, scheduler paper, retrieval method, benchmark protocol, training trick
- Add a new research artifact or section in `PAPERS.md`:
  - `Depends On`
  - `Provides`
  - `Reused By`
  - `Implementation-Critical`
- Build a lightweight citation graph index in `.planning/research/`, even if it is just JSON:
  - nodes = papers
  - edges = citation dependencies relevant to implementation
  - tags = `architecture`, `loss`, `training`, `eval`, `optimization`
- Make planner prompts consume not only “paper-backed recommendations” but also “recovered implementation prerequisites”

This changes GRD behavior from:
- “Use paper X”

to:
- “Use paper X, but implementation requires components from papers A, C, and F; here are the exact dependencies.”

Why this is high impact: it prevents a common failure mode in paper-to-code work, where the selected paper is only a thin wrapper around earlier techniques.

**4. Agentic Knowledge Enhancement: convert execution, review, and verification into an optimization-mining loop**

GRD already has strong execution and verification, plus `wireup` and post-phase review. What it lacks is a dedicated loop that mines the existing codebase and recent diffs for latent optimizations, then feeds those back into research/planning knowledge.

Implement it like this:

- Promote `KNOWHOW.md` from “notes” to an active optimization memory.
- After each phase, run a dedicated enhancement pass using:
  - `grd-code-reviewer`
  - `grd-verifier`
  - `wireup` findings
  - eval deltas from `EVAL.md`
- Ask a new or repurposed agent to produce three outputs:
  - `optimization opportunities`
  - `reusable implementation patterns`
  - `anti-patterns / failure signatures`
- Store these in structured sections in `KNOWHOW.md`, for example:
  - `Optimizations`
  - `When This Pattern Helps`
  - `Evidence`
  - `Affected Files/Subsystems`
- Feed that back into:
  - `grd-phase-researcher` as production evidence
  - `grd-planner` as “prefer existing optimization X”
  - `grd-executor` as “before implementing, inspect whether subsystem already has tunable hooks”
- Use actual codebase discovery, not just paper knowledge:
  - search for duplicated retry logic, parallelization gaps, missing caching, repeated prompt patterns, unstable tests, benchmark bottlenecks
- Tie it to measurable triggers:
  - if verifier finds proxy metrics below target but architecture is sound, trigger enhancement instead of research pivot
  - if wireup repeatedly finds the same class of missing integration, add it to KNOWHOW and planning constraints

Why this is high impact: it makes GRD compound knowledge across phases instead of treating each research-backed implementation as isolated work.

**Recommended rollout order**

1. `CFG formalization`
2. `Graph-of-Thought synthesis`
3. `Citation recovery`
4. `Knowledge enhancement`

That order matters. CFG gives you a reliable planning IR first. Graph synthesis then uses that IR. Citation recovery improves the quality of what goes into the graph. Knowledge enhancement closes the loop over time.

**Net-new pieces I would add**
- Typed artifact validators in [lib/context/execute.ts](/Users/neo/Developer/Projects/GetResearchDone/lib/context/execute.ts) and [lib/frontmatter.ts](/Users/neo/Developer/Projects/GetResearchDone/lib/frontmatter.ts)
- Planner-side implementation DAG generation in [commands/plan-phase.md](/Users/neo/Developer/Projects/GetResearchDone/commands/plan-phase.md)
- Citation-graph fields in [agents/grd-deep-diver.md](/Users/neo/Developer/Projects/GetResearchDone/agents/grd-deep-diver.md), [agents/grd-phase-researcher.md](/Users/neo/Developer/Projects/GetResearchDone/agents/grd-phase-researcher.md), and `PAPERS.md`
- A post-phase optimization mining step feeding [agents/grd-code-reviewer.md](/Users/neo/Developer/Projects/GetResearchDone/agents/grd-code-reviewer.md), [agents/grd-verifier.md](/Users/neo/Developer/Projects/GetResearchDone/agents/grd-verifier.md), and `KNOWHOW.md`

If you want, I can turn this into a concrete GRD phase plan with proposed artifact schemas and exact prompt/frontmatter changes.
---

### gemini Response
Based on the NERFIFY architecture, here are the 3 most impactful adaptations for the GRD framework and the concrete steps to implement them.

### 1. Compositional Citation Recovery (Recursive Research Depth)
**Impact:** Solves the "Implementation Gap" where a paper assumes the reader understands a foundational module from a previous work (e.g., "We use the backbone from Ref [12]").

*   **How to Implement:**
    *   **Agent Update:** Modify `grd-deep-diver` logic to scan the "Methods" and "Architecture" sections for specific structural citations.
    *   **Workflow:** When `grd-deep-diver` identifies a dependency it doesn't "know" (not in context), it must trigger a sub-task to `web_fetch` the referenced paper's abstract or snippets.
    *   **Data Structure:** Update `.planning/research/PAPERS.md` to support a parent-child relationship (`Relies on: [paper-slug]`).
    *   **Tooling:** Add a `recursive_dive` flag to the `/grd:deep-dive` command that allows the agent to automatically explore up to 2 levels of the citation graph to find missing hyperparameters or layer definitions.

### 2. Graph-of-Thought (Topological Execution Planning)
**Impact:** Prevents `grd-executor` from attempting to implement high-level logic before foundational utilities, data loaders, or loss functions are stable, reducing "undefined symbol" and logic errors.

*   **How to Implement:**
    *   **Planning Phase:** In `plan-phase.md`, require the agent to generate a `DEPENDENCY_GRAPH.json` (stored in `.planning/phases/{NN}/`) before any code is written.
    *   **Topological Sort:** The `grd-planner` must sort all implementation tasks such that `Wave 1` contains only zero-dependency components (data schemas, core math utilities), `Wave 2` contains modules using `Wave 1`, etc.
    *   **Strict Context injection:** When `grd-executor` starts a task in `Wave 2`, the system must force-inject the finalized file content of its `Wave 1` dependencies into the prompt to ensure interface alignment.

### 3. CFG Formalization (Structural Protocol Guards)
**Impact:** Constrains the LLM to satisfy framework invariants (e.g., specific PyTorch shapes, return types, or directory structures) that `grd-verifier` usually only catches post-facto.

*   **How to Implement:**
    *   **Invariant Definition:** Create `.planning/INVARIANTS.md`. This file defines the "Hardware/Framework Contract" (e.g., "All tensors must be on `device`," "Loss functions must return a scalar float").
    *   **Implementation Guard:** Update the `grd-executor` system prompt to include a "Protocol Check" step. Before calling `write_file`, the agent must explicitly state how the proposed code satisfies the constraints in `INVARIANTS.md`.
    *   **Linter Integration:** Use `eslint` or `ruff` with custom rules that represent these CFGs. If the code fails these specific "invariant" rules, the `Act` phase is considered failed even if it compiles, forcing immediate correction.

### 4. Agentic Knowledge Enhancement (Profile-Driven Optimization)
**Impact:** Enables the system to autonomously discover optimizations (e.g., replacing a standard loop with a CUDA kernel or a specialized library call) rather than just porting paper logic literally.

*   **How to Implement:**
    *   **New Workflow:** Create `/grd:enhance <target_file>`. 
    *   **Execution:** This triggers `grd-code-reviewer` to run a profiling command (via `run_shell_command`) to identify bottlenecks.
    *   **Knowledge Retrieval:** The agent then cross-references the bottleneck with `LANDSCAPE.md` and `KNOWHOW.md` to find "SoTA optimizations" (e.g., "Paper X used FlashAttention here").
    *   **Refinement Loop:** `grd-executor` applies the enhancement, and `grd-verifier` compares the new metrics against `BASELINE.md` to confirm the improvement.
---

### opencode Response
Let me analyze GRD's current architecture to make grounded recommendations.
Now let me check GRD's state management to understand how verification constraints could be formalized.
Based on my analysis, here are my **3-4 most impactful NERFIFY adaptations for GRD**, with concrete implementation plans:

---

## Recommendation: Top 4 NERFIFY Innovations to Adapt

### 1. 🔗 Compositional Citation Recovery *(highest priority — fills a critical gap)*

**What it solves**: GRD generates research plans that reference papers, but those papers contain implementations (GitHub repos, model checkpoints, datasets) that are never recovered. Researchers manually chase citations; GRD just stores the reference string.

**How to implement**:

Add a new command module `lib/commands/citation-recovery.ts` and wire it into `grd-phase-researcher`:

```typescript
// lib/commands/citation-recovery.ts
// Uses MCP tools (arXiv, Semantic Scholar, GitHub search) to:
// 1. Parse @-refs in plan frontmatter → extract paper identifiers
// 2. For each paper, traverse its citation graph (via Semantic Scholar API)
// 3. Query MCP tools for implementations: GitHub repos, HuggingFace models, datasets
// 4. Inject recovered implementations as additional artifacts into the plan's must_haves
// 5. Output a citation-graph.md alongside the plan

// Key function signature:
function recoverImplementations(
  paperRefs: string[],
  depth: number,  // 1 = direct refs, 2 = cited-by chain
): CitationRecoveryResult[]

// Grounded output:
// - github_repo: "https://github.com/author/repo (implements Fig. 3)"
// - huggingface_model: "author/model-v2 (trained on dataset from paper)"
// - missing_component: "optimization from [Paper X] §4.2 not yet implemented"
```

**Wire into research pipeline**: Call from `lib/context/research.ts` in `cmdInitPhaseResearch` after `extractReferences()`, before spawning `grd-phase-researcher`. Add a `--citation-depth=N` config flag to `.planning/config.json`.

**Impact**: Transforms GRD from "generates plan that references paper" to "generates plan that knows where to get the components from." Directly reduces the manual gap between research and execution.

---

### 2. ⚙️ CFG Formalization for Plan Invariants *(proactive constraint, not reactive checking)*

**What it solves**: GRD's `lib/verify.ts` is a reactive gate — it checks output *after* grd-executor runs. CFG formalization makes invariants explicit structured constraints that guide generation *in-process*.

**How to implement**:

Create `lib/invariants.ts` that formalizes three classes of constraints:

```typescript
// lib/invariants.ts

// Class 1: Structural invariants (already implicit, make explicit)
const PLAN_INVARIANTS = {
  // Every <action> must have a corresponding <verify> before <done>
  verifyBeforeDone: true,
  // Every @-ref must resolve to a file on disk or a paper in citation graph
  refResolves: true,
  // depends_on must form a DAG (no cycles)
  acyclic: true,
};

// Class 2: Semantic invariants per phase type
const PHASE_INVARIANTS: Record<PhaseType, InvariantRule[]> = {
  research: [
    // Citation graph must be non-empty
    { field: 'references', minCount: 3 },
    // Must cite at least one paper newer than training cutoff
    { field: 'recency_year', min: 2022 },
  ],
  execution: [
    // All must_haves.artifacts.paths must not conflict with other parallel plans
    { field: 'artifact_paths', noConflict: true },
    // exports must be verified by a test or lint pass
    { field: 'exports_verified', required: true },
  ],
};

// Class 3: Cross-phase coherence invariants
const CROSS_PHASE_INVARIANTS = [
  // Phase N's @-refs must be resolvable by Phase N-1's artifacts
  { name: 'ref_coverage', check: (prev: Phase, curr: Phase) => ... },
  // Replicated components must be intentional (not duplicate without purpose)
  { name: 'no_implicit_duplication', check: (plan: Plan) => ... },
];
```

**Wire into execution pipeline**: 
- Add `checkInvariant(cfg, plan)` calls in `lib/gates.ts` as **pre-flight constraints** (fail before running, not after)
- Add `invariantContext(cfg, phase)` to `lib/context/execute.ts` so grd-executor receives explicit invariant rules in its init context
- The executor then prompts itself: "Verify invariant X is satisfied before emitting artifact Y"

**Impact**: Converts GRD's gate system from "detect failure" to "prevent failure." Eliminates the common pattern where a plan passes verification but has a structural flaw (e.g., circular dependency, missing verification step) that surfaces in production.

---

### 3. 🧠 Agentic Knowledge Enhancement *(continuous optimization loop)*

**What it solves**: GRD's `grd-code-reviewer` does a one-pass structural review. Agentic knowledge enhancement adds a discovery loop: after code is generated, a subagent scans for optimization opportunities, architectural patterns, and missing cross-cutting concerns the original plan didn't anticipate.

**How to implement**:

Create `lib/commands/knowledge-enhancement.ts`:

```typescript
// lib/commands/knowledge-enhancement.ts
// Activates AFTER grd-verifier passes, before commit
// Uses a focused subagent (low effort, fast) to:
// 1. Scan generated code against a pattern library (configurable)
// 2. Compare against SoTA implementations recovered by citation-recovery
// 3. Propose targeted optimizations: perf bottlenecks, missing error handling,
//    opportunities to reuse components from other plans
// 4. Output enhancement suggestions as a PR/branch or inline comments

// Config flag in .planning/config.json:
interface KnowledgeEnhancementConfig {
  enabled: boolean;
  pattern_library: string[];  // e.g., ["error-handling", "caching", "async-patterns"]
  comparison_enabled: boolean;  // compare against recovered implementations
  auto_apply: boolean;  // apply minor optimizations automatically vs. flag for review
}
```

**Wire into `lib/context/execute.ts`**: After `cmdVerifyPhaseCompleteness()` passes and before `cmdPhaseComplete()`, insert a conditional call to `cmdInitKnowledgeEnhancement()` if `config.knowledge_enhancement.enabled`.

**Interaction with citation-recovery**: Enhancement can compare generated code against recovered SoTA implementations from step 1, flagging "paper X achieves 2x throughput with approach in §5.1 — current implementation uses naïve version."

**Impact**: Turns code review from "quality gate" to "knowledge discovery" — GRD becomes smarter with each phase, not just faithful to the plan.

---

### 4. 🔀 Graph-of-Thought Multi-Agent Synthesis *(moderate priority, highest complexity)*

**What it solves**: GRD executes plans within a phase sequentially or with crude parallelization. Graph-of-Thought treats code synthesis as a DAG traversal — generate base components first, then compose higher-level components that depend on them.

**How to implement**:

Extend `lib/autopilot.ts` (or create `lib/graph-synth.ts`):

```typescript
// lib/graph-synth.ts

// 1. Build dependency graph from plan artifacts and their exports/imports
function buildArtifactGraph(plans: Plan[]): ArtifactGraph {
  const nodes = plans.flatMap(p => p.artifacts.map(a => ({
    id: a.path,
    plan: p.id,
    exports: a.exports ?? [],
  })));
  const edges = [];
  for (const plan of plans) {
    for (const [imported, provider] of findImports(plan.code)) {
      edges.push({ from: provider, to: `${plan.id}:${imported}` });
    }
  }
  return { nodes, edges };
}

// 2. Topological sort → execution order
function topologicalOrder(graph: ArtifactGraph): ExecutionGroup[] {
  // Groups of plans that can run in parallel (same depth level)
  return computeLevels(graph);  // level 0 = no deps, level 1 = depends on level 0, etc.
}

// 3. Execute by level with parallelization within each level
async function executeWithGraphOrder(groups: ExecutionGroup[], ctx: ExecContext) {
  for (const group of groups) {
    await Promise.all(group.map(plan => executePlan(plan, ctx)));
  }
}
```

**Wire into `lib/context/execute.ts`**: Replace the flat `for (const plan of incompletePlans)` loop in `cmdInitExecutePhase` with a call to `graphSynth(plans)`, producing ordered execution groups. Config flag: `graph_synthesis: boolean`.

**Impact**: Currently GRD parallelizes *phases*, not *plans within a phase*. GoT synthesis would enable fine-grained parallel code generation within a phase — significantly faster execution when a phase has many plans with partial dependencies.

---

## Implementation Priority

| Priority | Innovation | Complexity | Impact | Time to Implement |
|----------|-----------|-----------|--------|-------------------|
| 1 | Citation Recovery | Medium | High (fills critical gap) | ~2 days |
| 2 | CFG Formalization | Medium-High | High (quality + safety) | ~3 days |
| 3 | Knowledge Enhancement | Medium | High (continuous improvement) | ~2 days |
| 4 | Graph-of-Thought | High | Medium-High (performance) | ~4 days |

**Skip**: Closed-loop visual refinement (no visual canvas in CLI tool) and evaluation benchmark (orthogonal to research/execution phases — could be a separate future work).
---

## Synthesis (claude)

## NERFIFY → GRD: Synthesized Recommendations

### Strong Consensus (all 4 backends agree)

**Compositional Citation Recovery** — unanimously ranked as high-impact. All backends identified the same gap: GRD's research agents analyze papers but don't chase dependency chains of referenced techniques. The implementation converges on:
- Extend `grd-deep-diver` to emit structured `missing_components` / `borrowed_components`
- Build a citation graph (JSON or markdown) in `.planning/research/`
- Feed resolved citations back into `grd-phase-researcher` and `grd-planner`
- Claude and OpenCode propose a dedicated agent; Codex and Gemini extend existing agents

**Agentic Knowledge Enhancement** — all 4 selected this. Consensus: mine real implementations for optimizations papers don't mention, feed findings back into planning. Disagreement on scope: Claude targets GitHub repos during research; Codex proposes a post-phase optimization memory (`KNOWHOW.md`); OpenCode ties it to citation-recovery comparisons; Gemini adds profiling.

**Graph-of-Thought Topological Synthesis** — all 4 selected this but disagree on *where* to apply it:
- Claude/OpenCode: push task-level parallelism within plans (extend `lib/deps.ts`)
- Codex: push it *upstream* into planning — planner builds an artifact DAG first, then derives plans from it
- Gemini: simpler version — topological wave ordering with context injection

Codex's framing is strongest: GRD already has runtime topo execution via `buildWaves`. The missing piece is topo *synthesis* at planning time.

### Key Disagreement: CFG Formalization vs Closed-Loop Verification

The backends split 2-2 on the 4th pick:
- **Codex + Gemini + OpenCode** chose CFG Formalization — typed schemas, structural validators, pre-flight invariant checks
- **Claude** chose Closed-Loop Verification — tight executor↔verifier feedback loops within a phase

Claude's closed-loop argument is compelling (eliminates human touchpoints for mechanical gaps), but the other three correctly note that CFG formalization is *foundational* — it makes every other improvement more reliable. CFG should come first; closed-loop refinement can layer on top.

### Unique Insights

| Backend | Insight |
|---------|---------|
| **Claude** | `refinement_budget` field to cap verification loops — prevents infinite iteration |
| **Codex** | CFG as "planning IR" — validate plans into typed objects before they become executable, not just lint after |
| **Codex** | Rollout order matters: CFG → GoT → Citation → Knowledge (each builds on the previous) |
| **Gemini** | Force-inject Wave N-1 file content into Wave N executor prompts for interface alignment |
| **OpenCode** | Three invariant classes: structural, semantic per-phase-type, cross-phase coherence |

### Unified Recommendation

**Implement these 4, in this order:**

1. **CFG Formalization** (foundation) — Typed schemas for plan/research artifacts in `lib/invariants.ts`. Pre-flight validation in gates, not just post-hoc verification. Use OpenCode's three-class model (structural, semantic, cross-phase). Wire into `grd-plan-checker` as a hard reject gate.

2. **Compositional Citation Recovery** (research quality) — Extend `grd-deep-diver` with `missing_components` output. Add citation-recovery pass in `grd-phase-researcher`. Store citation graph in `.planning/research/citations/`. Block planning if unresolved dependencies remain.

3. **Graph-of-Thought Synthesis** (planning quality) — Per Codex: planner builds an artifact DAG *before* writing tasks. Plans declare `provides`/`requires`/`integration_points`. Existing `buildWaves` consumes the DAG for execution ordering. Per Gemini: inject resolved dependency content into executor prompts.

4. **Agentic Knowledge Enhancement** (compounding returns) — Post-phase mining step producing structured `KNOWHOW.md` entries. Cross-reference generated code against recovered SoTA implementations from citation recovery. Feed findings back into planner and researcher for subsequent phases.

**Deferred:** Closed-loop verification refinement (layer on after CFG formalization is stable — Claude's `refinement_budget` concept is good but needs the invariant infrastructure first).

Want me to turn this into a concrete GRD milestone with phase plans?

## Outcome

## NERFIFY → GRD: Synthesized Recommendations

### Strong Consensus (all 4 backends agree)

**Compositional Citation Recovery** — unanimously ranked as high-impact. All backends identified the same gap: GRD's research agents analyze papers but don't chase dependency chains of referenced techniques. The implementation converges on:
- Extend `grd-deep-diver` to emit structured `missing_components` / `borrowed_components`
- Build a citation graph (JSON or markdown) in `.planning/research/`
- Feed resolved citations back into `grd-phase-researcher` and `grd-planner`
- Claude and OpenCode propose a dedicated agent; Codex and Gemini extend existing agents

**Agentic Knowledge Enhancement** — all 4 selected this. Consensus: mine real implementations for optimizations papers don't mention, feed findings back into planning. Disagreement on scope: Claude targets GitHub repos during research; Codex proposes a post-phase optimization memory (`KNOWHOW.md`); OpenCode ties it to citation-recovery comparisons; Gemini adds profiling.

**Graph-of-Thought Topological Synthesis** — all 4 selected this but disagree on *where* to apply it:
- Claude/OpenCode: push task-level parallelism within plans (extend `lib/deps.ts`)
- Codex: push it *upstream* into planning — planner builds an artifact DAG first, then derives plans from it
- Gemini: simpler version — topological wave ordering with context injection

Codex's framing is strongest: GRD already has runtime topo execution via `buildWaves`. The missing piece is topo *synthesis* at planning time.

### Key Disagreement: CFG Formalization vs Closed-Loop Verification

The backends split 2-2 on the 4th pick:
- **Codex + Gemini + OpenCode** chose CFG Formalization — typed schemas, structural validators, pre-flight invariant checks
- **Claude** chose Closed-Loop Verification — tight executor↔verifier feedback loops within a phase

Claude's closed-loop argument is compelling (eliminates human touchpoints for mechanical gaps), but the other three correctly note that CFG formalization is *foundational* — it makes every other improvement more reliable. CFG should come first; closed-loop refinement can layer on top.

### Unique Insights

| Backend | Insight |
|---------|---------|
| **Claude** | `refinement_budget` field to cap verification loops — prevents infinite iteration |
| **Codex** | CFG as "planning IR" — validate plans into typed objects before they become executable, not just lint after |
| **Codex** | Rollout order matters: CFG → GoT → Citation → Knowledge (each builds on the previous) |
| **Gemini** | Force-inject Wave N-1 file content into Wave N executor prompts for interface alignment |
| **OpenCode** | Three invariant classes: structural, semantic per-phase-type, cross-phase coherence |

### Unified Recommendation

**Implement these 4, in this order:**

1. **CFG Formalization** (foundation) — Typed schemas for plan/research artifacts in `lib/invariants.ts`. Pre-flight validation in gates, not just post-hoc verification. Use OpenCode's three-class model (structural, semantic, cross-phase). Wire into `grd-plan-checker` as a hard reject gate.

2. **Compositional Citation Recovery** (research quality) — Extend `grd-deep-diver` with `missing_components` output. Add citation-recovery pass in `grd-phase-researcher`. Store citation graph in `.planning/research/citations/`. Block planning if unresolved dependencies remain.

3. **Graph-of-Thought Synthesis** (planning quality) — Per Codex: planner builds an artifact DAG *before* writing tasks. Plans declare `provides`/`requires`/`integration_points`. Existing `buildWaves` consumes the DAG for execution ordering. Per Gemini: inject resolved dependency content into executor prompts.

4. **Agentic Knowledge Enhancement** (compounding returns) — Post-phase mining step producing structured `KNOWHOW.md` entries. Cross-reference generated code against recovered SoTA implementations from citation recovery. Feed findings back into planner and researcher for subsequent phases.

**Deferred:** Closed-loop verification refinement (layer on after CFG formalization is stable — Claude's `refinement_budget` concept is good but needs the invariant infrastructure first).

Want me to turn this into a concrete GRD milestone with phase plans?
