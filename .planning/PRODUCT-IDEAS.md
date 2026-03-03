---
generated: 2026-03-03
source: evolve/product-ideation
category: product-ideation
item_count: 237
---

# GRD Product Ideas

Captured product feature ideas from evolve discovery cycle. These represent potential enhancements
to the GRD workflow automation system. Each idea includes a problem statement and proposed solution.

---

## ML Experiment Tracking

### 1. Weights & Biases / MLflow Integration
**Problem:** Users doing ML R&D context-switch between GRD and their experiment tracker, losing traceability between 'why we tried this' (GRD plan) and 'what happened' (W&B run).
**Solution:** Automatically log phase execution metrics, eval results, and model comparisons to W&B or MLflow runs. Push EVAL.md results and SUMMARY.md metrics into experiment tracker runs with GRD phase metadata as tags.

---

## Research Discovery

### 2. Inline Paper Search from CLI
**Problem:** Users leave their terminal to Google papers, then manually paste citations into RESEARCH.md.
**Solution:** Add `/grd:find-paper <query>` that searches Semantic Scholar and arXiv, returning ranked results with citation count, year, and one-line abstract. Auto-formats citations for PAPERS.md.

### 3. Research Citation Graph
**Problem:** Researchers don't realize two papers in their stack are from the same lab with contradictory assumptions.
**Solution:** Generate a Mermaid or DOT graph showing how papers in PAPERS.md cite each other, which phases reference which papers, and which papers share authors/venues.

### 10. Automated Research Gap Analysis
**Problem:** Users manually reconcile survey findings with project goals, which is error-prone and time-consuming.
**Solution:** After `/grd:survey`, automatically identify gaps between what the literature covers and what REQUIREMENTS.md demands, outputting a ranked list of open questions.

### 28. Public Benchmark Leaderboard Tracker
**Problem:** Research landscapes shift fast; users may not realize their baseline is no longer SOTA.
**Solution:** Subscribe to benchmark leaderboards (Papers with Code, HELM, LMSYS) and automatically alert when a new SOTA result supersedes methods in LANDSCAPE.md, triggering a targeted re-survey.

### 34. One-Click Paper Implementation Kickoff
**Problem:** The journey from 'I found an interesting paper' to 'I have a plan to implement it' takes hours of manual GRD commands.
**Solution:** Given a paper URL or DOI, automatically run deep-dive → feasibility → product-plan → generate initial roadmap in a single command.

---

## Planning & Execution

### 4. Token & Time Cost Estimator
**Problem:** Users routinely underestimate how long multi-plan phases take and get surprised by API costs.
**Solution:** Before executing a phase, estimate token consumption and wall-clock time based on plan count, ceremony level, and historical SUMMARY.md metrics from similar phases. Show a breakdown by agent.

### 5. Phase Rollback / Undo
**Problem:** If a phase produces bad output, users must manually undo git changes and reset planning state.
**Solution:** Add `/grd:rollback-phase <N>` that reverts git changes from a phase execution (using the worktree branch), marks the phase back to unstarted, and archives the failed SUMMARY.md as a learning artifact.

### 15. Phase Template Library
**Problem:** Users designing phases from scratch repeatedly make the same structural mistakes.
**Solution:** Ship a curated library of reusable phase templates for common R&D patterns (benchmark evaluation, dataset preprocessing, ablation study, baseline comparison, model fine-tuning).

### 16. Phase Dry Run Simulation
**Problem:** Users are unsure what a phase will do before running it, especially with complex ceremony levels.
**Solution:** Add `--dry-run` to `/grd:execute-phase` that renders exactly what agents would be spawned, what prompts they'd receive, and what artifacts they'd produce — without actually calling Claude.

### 19. Intelligent Phase Scheduler
**Problem:** Users manually sequence phases, often leaving parallelizable work sequential.
**Solution:** Analyze the dependency graph and resource constraints to produce an optimal execution schedule with a Gantt-style preview. Find the critical path and surface quick wins for timeline reduction.

### 21. Multi-Hypothesis Experiment Designer
**Problem:** Researchers design experiments ad hoc and miss confounders.
**Solution:** Given a research question, generate a structured experiment plan testing multiple hypotheses in parallel — with control groups, ablations, and statistical significance criteria — as a set of linked phases.

### 25. Automated Regression Watchdog
**Problem:** Silent regressions compound across phases and are expensive to root-cause later.
**Solution:** After each phase, automatically re-run a configurable set of proxy eval metrics from BASELINE.md and alert if any regress beyond a threshold, blocking autopilot from proceeding.

### 35. Phase Confidence Score
**Problem:** Users don't know which plans are under-specified until they fail.
**Solution:** Before execution, score each phase's plan on a confidence scale (0-100) based on clarity of success criteria, research backing, dependency completeness, and historical similar-phase success rates.

---

## Knowledge Management

### 6. Knowledge Base Export / Import
**Problem:** Teams working on related problems repeatedly survey the same papers from scratch.
**Solution:** Export LANDSCAPE.md, PAPERS.md, and KNOWHOW.md from one project and import them into another as a research seed. A shareable knowledge bundle with a `--from-project` flag on `/grd:survey`.

### 8. Natural Language Planning Search
**Problem:** Users lose track of decisions made in earlier phases and re-litigate them.
**Solution:** Add `/grd:find <query>` that does semantic search across all .planning/ artifacts — phases, summaries, decisions, requirements — and returns ranked snippets.

### 29. Decision Archaeology Tool
**Problem:** Teams forget the reasoning behind architectural decisions, leading to re-litigation in code review.
**Solution:** Add `/grd:why <topic>` that traces back through all phase decisions, gate approvals, and CONTEXT.md files to explain why the current implementation approach was chosen.

### 33. Persistent Agent Memory Across Projects
**Problem:** Every project reinvents the wheel.
**Solution:** Let agents store and retrieve project-agnostic knowledge — common pitfalls, effective prompting patterns, recurring code structures — in a shared memory store that persists across GRD projects.

---

## Notifications & Monitoring

### 7. Async Phase Completion Notifications
**Problem:** Users running long autopilot sessions currently have to poll for completion.
**Solution:** Send a Slack/Discord webhook message when a phase finishes (success or failure), including key metrics from SUMMARY.md and a link to the relevant planning artifact.

### 13. Live Interactive TUI Dashboard
**Problem:** The current dashboard is a static render; users lack visibility during autopilot runs.
**Solution:** A full-screen terminal dashboard with real-time phase status, token burn rate, eval metric trends over time, and keyboard shortcuts to drill into any phase.

### 23. Claude API Cost & Usage Dashboard
**Problem:** Teams using GRD at scale don't know their actual AI spend or which workflow choices are expensive.
**Solution:** Aggregate token counts and estimated costs across all phases, broken down by agent type and ceremony level, with trend charts and budget alerts.

---

## Artifact Generation

### 11. Jupyter Notebook Artifact Sync
**Problem:** Researchers produce notebooks during experiments but manually transcribe results into planning documents.
**Solution:** After phase execution, automatically extract key outputs (plots, metrics tables, code cells) from referenced .ipynb files and embed them as markdown in SUMMARY.md.

### 14. Auto-Generated Changelog from Phases
**Problem:** Writing changelogs is a tedious afterthought.
**Solution:** On `/grd:complete-milestone`, automatically generate a CHANGELOG.md entry by summarizing SUMMARY.md files from all completed phases, grouping by type (feature, fix, experiment).

### 15. HuggingFace Model Card Integration
**Problem:** ML researchers publishing models on HuggingFace manually write model cards from memory.
**Solution:** After eval phases, auto-generate or update a HuggingFace model card with benchmark results, training details from SUMMARY.md files, and the research lineage from PAPERS.md.

### 24. Paper-to-Code Scaffold Generator
**Problem:** The gap between reading a paper and writing the first line of code is where most R&D momentum dies.
**Solution:** After `/grd:deep-dive`, generate a starter code scaffold implementing the paper's core algorithm — classes, interfaces, placeholder functions with docstrings referencing equation numbers.

### 30. Auto-Generated PR Descriptions from Phases
**Problem:** Writing PR descriptions for R&D work is tedious and often skipped.
**Solution:** When creating a PR from a phase branch, automatically generate a rich PR description from the phase's PLAN.md goals, SUMMARY.md results, and REVIEW.md findings.

---

## Analytics & Retrospectives

### 17. Automated Phase Retrospectives
**Problem:** Teams repeat the same mistakes across phases.
**Solution:** After each phase, generate a structured retrospective comparing planned vs. actual duration, success criteria hit rate, and blockers encountered, with AI-generated lessons-learned suggestions.

### 26. Team Contribution Analytics
**Problem:** In team R&D projects, it's unclear who decided what and why.
**Solution:** Track which human made which decisions, approved which gates, and contributed which reviews across phases — with a summary per milestone.

### 32. Eval Metric Anomaly Detector
**Problem:** Researchers sometimes record results from runs with bugs and don't notice until the final report.
**Solution:** Use statistical methods (z-score, IQR) to flag eval results that are unusually high or low compared to historical phase data, prompting the user to verify before accepting.

---

## Quality & Coverage

### 12. Phase Change Impact Analyzer
**Problem:** Users break downstream phases without realizing it when they modify upstream deliverables.
**Solution:** When a user edits a plan or marks a phase complete, automatically surface which downstream phases have dependencies on it and flag any that may need re-planning.

### 18. Requirements Coverage Heatmap
**Problem:** Users often complete a milestone and discover entire requirements were never addressed.
**Solution:** Visualize which requirements are covered by which phases, highlight orphaned requirements (no phases), and flag phases with no requirement traceability.

---

## Integrations

### 20. Notion / Obsidian Sync
**Problem:** Product managers and researchers want visibility into R&D progress but won't use a CLI.
**Solution:** Bidirectional sync of .planning/ artifacts with a Notion database or Obsidian vault, so non-technical stakeholders can read research progress without touching the terminal.

### 22. Blocker Escalation & Auto-Resolution
**Problem:** Blockers sit in STATE.md passively.
**Solution:** When a blocker is recorded in STATE.md, automatically attempt to find resolution paths by searching LANDSCAPE.md, prior phase summaries, and GitHub issues, then surface suggestions.

---

## Multi-Project

### 31. Multi-Project Portfolio Dashboard
**Problem:** Research leads managing multiple projects have no single place to see what's moving and what's stuck.
**Solution:** A unified view across multiple GRD projects showing active phases, upcoming milestones, cross-project blockers, and aggregate cost/velocity metrics.

---

## Accessibility

### 27. Voice Command Interface
**Problem:** Developers in flow hate breaking to type commands.
**Solution:** Accept voice input via a local Whisper model to trigger GRD commands hands-free — 'start phase 12', 'show me the progress dashboard', 'add a blocker about GPU availability'.

---

## Additional Product Ideas (Batch 2)

### 36. Cross-Project Knowledge Base
**Problem:** Teams doing NLP work re-survey transformers from scratch every new project.
**Solution:** A shared ~/.grd/knowledge/ directory that extracts reusable research findings, architectural patterns, and evaluation results from completed projects and makes them searchable when starting new phases. Eliminates redundant research work across related projects.

---

### 37. Conversational Phase Creation
**Problem:** The blank-page problem when adding new phases — users struggle to fill templates accurately.
**Solution:** Let users describe what they want in plain English ('I need to add streaming support to the inference pipeline') and have GRD automatically draft a phase with goal, success criteria, duration estimate, and plan breakdown for review. Captures intent more accurately than manually filling templates.

---

### 38. AI Cost Budget Guardrails
**Problem:** Teams running overnight autopilot sessions often wake up to unexpectedly large bills.
**Solution:** Track token usage and estimated cost per phase/plan/agent in real time, with configurable budget caps that pause autopilot and alert the user before overrunning. A $50 budget cap with a checkpoint prompt would prevent runaway costs entirely.

---

### 39. Auto-Generate Stakeholder Reports
**Problem:** Researchers spend hours translating technical progress into stakeholder language.
**Solution:** A /grd:report command that synthesizes SUMMARY.md files, eval results, and baselines into a concise, non-technical progress report (Markdown or PDF) suitable for sharing with engineering managers or clients. GRD already has all the data needed to do this automatically.

---

### 40. Continuous Literature Monitor
**Problem:** R&D projects are often invalidated or improved by papers published mid-development — staying current manually is too slow.
**Solution:** Background service (or scheduled /grd:watch command) that monitors arXiv RSS feeds for keywords extracted from your project's LANDSCAPE.md and PAPERS.md, and surfaces newly published relevant papers as todos.

---

### 41. Phase Replay for A/B Comparison
**Problem:** Researchers need to validate that their chosen approach is actually better than alternatives — right now there's no structured way to do this.
**Solution:** Re-execute a completed phase with different parameters (different model, different prompt strategy, or different implementation approach) and produce a side-by-side comparison of eval metrics and code changes.

---

### 42. Visual Roadmap & Dependency Graph
**Problem:** Text-based roadmaps are hard to reason about at scale — dependency chains and bottlenecks are not immediately obvious.
**Solution:** A /grd:visualize command that renders ROADMAP.md as a Mermaid or SVG dependency graph showing phase status, blockers, parallel groups, and critical path.

---

### 43. Phase Completion Webhooks
**Problem:** Long-running autonomous phases run unattended but users need to know when to review results or unblock the next step.
**Solution:** Configurable webhooks (Slack, Discord, email, generic HTTP) that fire when a phase completes, fails, or hits a blocker — with a summary of results and a link to the VERIFICATION.md.

---

### 44. Research Hypothesis Tracker
**Problem:** Research projects often lose track of what assumptions were made and whether they were ever validated.
**Solution:** Structured hypothesis management: propose a hypothesis during planning, track it through phases, and mark it confirmed/refuted/inconclusive with evidence links to eval results. Creates a permanent, traceable hypothesis ledger.

---

### 45. Semantic Search Across Planning Artifacts
**Problem:** Planning knowledge is scattered across dozens of files and becomes unsearchable at project scale.
**Solution:** A /grd:search command that lets users run natural language queries across all .planning/ files — 'when did we decide to use cosine similarity?' or 'which phases touched the inference module?' — with ranked results.

---

### 46. Metrics Trend Over Time
**Problem:** Right now BASELINE.md is a snapshot — there's no way to visualize whether quality is improving, stagnating, or degrading as the project evolves.
**Solution:** Extend /grd:progress to render a time-series chart of key eval metrics across phases, automatically detecting regressions, plateaus, and breakthrough moments.

---

### 47. Decision Archaeology — Trace Code to Research
**Problem:** Onboarding new engineers and debugging unexplained design choices is painful — there's no 'why' trail.
**Solution:** Given a file or function, trace backwards through git history, SUMMARY.md files, and PLAN.md docs to explain why that code was written that way, which research supported it, and what alternatives were rejected.

---

### 48. Multi-Model Agent Benchmarking
**Problem:** Teams choosing between Opus and Sonnet for autonomous work have no data to guide the cost/quality tradeoff.
**Solution:** Run the same phase plan with two different model profiles (e.g., quality vs. budget) and compare the outputs, code quality scores, and eval metrics. Generates systematic data for model selection decisions.

---

### 49. Auto-Generate CHANGELOG from Phases
**Problem:** Writing changelogs manually at release time is tedious — GRD already has all the structured data needed.
**Solution:** A /grd:changelog command that compiles SUMMARY.md files across milestones into a structured, user-facing CHANGELOG.md with version headers, feature descriptions, and breaking change notices.

---

### 50. AI Confidence Scores for Phase Estimates
**Problem:** Users chronically underestimate R&D phase duration — no calibrated confidence intervals exist.
**Solution:** Analyze historical phase execution data (planned vs. actual duration, plan count vs. completion rate) and display confidence intervals on new phase estimates to set better expectations and prompt earlier scope negotiation.

---

### 51. Safe Phase Rollback
**Problem:** When a phase makes things worse, there's currently no structured way to undo it without manual git archaeology.
**Solution:** A /grd:rollback command that reverts code changes from a phase (via git), archives the SUMMARY.md, and resets the roadmap status — with a confirmation prompt showing the blast radius.

---

### 52. Research Gap Analysis
**Problem:** Researchers often realize too late they made assumptions that could have been validated by existing work.
**Solution:** Analyze LANDSCAPE.md, PAPERS.md, and phase goals to identify research questions the project hasn't addressed — areas where implementation choices are made without supporting literature.

---

### 53. Agent Template Marketplace
**Problem:** Power users develop specialized agents for their domain but currently have no way to share or reuse them across projects.
**Solution:** Export custom agent definitions and command templates to a shareable format, and import community-contributed agents via /grd:agent install <url> or a curated registry.

---

### 54. Sprint / Iteration Cycle Mapping
**Problem:** Teams using GRD alongside Scrum/Kanban can't currently see how R&D phases fit into their delivery cadence.
**Solution:** Map GRD phases onto sprint boundaries — specify sprint length and start date, and GRD automatically schedules phases, flags overloaded sprints, and generates a sprint planning summary.

---

### 55. Regression Bisect — Which Phase Broke It?
**Problem:** Debugging metric regressions in multi-phase projects requires painful manual binary search through git history.
**Solution:** When a metric regresses, /grd:bisect automatically checkouts phase boundaries and reruns the eval to identify which phase introduced the regression, then links to the responsible PLAN.md and commits.

---

### 56. Paper-to-Code Annotation Layer
**Problem:** The gap between 'we implemented Section 3.2 of the paper' and actually finding where in the code is a daily friction point for research engineers.
**Solution:** Annotate paper sections in PAPERS.md with links to the specific functions or files that implement them, and display these backlinks inline in code comments.

---

### 57. Pre-Execution Impact Preview
**Problem:** Executing a phase is a high-commitment action — surprises happen and confidence is low without a preview.
**Solution:** Before running /grd:execute-phase, show a structured preview: estimated files changed, test coverage impact prediction, modules affected, and an AI-generated risk assessment based on the plan.

---

### 58. Team Handoff Digest
**Problem:** Knowledge transfer on R&D projects is notoriously lossy.
**Solution:** A /grd:handoff command that generates a briefing document for someone taking over a project — covering active phase, key decisions made, blockers, deferred validations, and recommended next actions.

---

### 59. Shared Eval Benchmark Library
**Problem:** Teams repeatedly set up the same benchmarks (GLUE, MMLU, HumanEval) from scratch.
**Solution:** A curated, versioned library of standard evaluation datasets and metric scripts that can be imported into any GRD project with /grd:benchmark add <name>. Ensures consistent measurement across projects.

---

### 60. Live Phase Execution Log Stream
**Problem:** Currently users can only check in after the fact — live streaming lets them catch bad directions early and kill the run if needed.
**Solution:** Stream real-time agent execution logs to a web UI or terminal pane (similar to a CI build log) with structured sections per plan, so users can watch progress without interrupting the agent.

---

### 61. Dependency Impact Analysis Before Phases
**Problem:** Executing a phase that upgrades a core dependency can cascade failures across the codebase.
**Solution:** Analyze which npm/pip packages, internal modules, and APIs a phase plan will touch and surface known breaking changes, security advisories, or compatibility issues before execution begins.

---

### 62. Goal Drift Detector
**Problem:** Long phases often deliver something subtly different from what was planned — systematic drift detection catches this before verification.
**Solution:** Periodically compare phase success criteria against what was actually built (based on SUMMARY.md and commit diffs) and flag when the implementation has drifted from the stated goal.

---

### 63. Smart Phase Batching Recommendations
**Problem:** Users with many small phases pay full planning ceremony costs for each one.
**Solution:** Analyze the roadmap and suggest which small phases could be safely merged into a single execution to reduce ceremony overhead, based on shared module scope, low dependency risk, and similar verification levels.

---

### 64. Interactive Eval Notebook Export
**Problem:** Data scientists want to explore results interactively, not just read structured markdown files.
**Solution:** Export phase eval plans and results as Jupyter notebooks with pre-filled code cells for running experiments, visualizing metrics, and comparing baselines — synced back to EVAL.md on save.

---

### 65. Scope Creep Guard
**Problem:** Agents frequently solve adjacent problems they encounter — a scope guard keeps phases focused.
**Solution:** During plan generation, analyze whether proposed tasks fall outside the phase goal and surface a warning with specific out-of-scope items highlighted.

---

### 66. Cross-Milestone Requirement Traceability
**Problem:** Teams lose sight of whether their tactical work is advancing their strategic goals.
**Solution:** Extend REQUIREMENTS.md traceability to span milestone boundaries — show which LT-N goals each requirement contributes to and which milestones have addressed each requirement.

---

### 67. Collaborative Phase Planning Session
**Problem:** Current planning is too unidirectional — a Socratic planning session surfaces blind spots early.
**Solution:** An interactive back-and-forth planning session where GRD asks clarifying questions, surfaces assumptions, proposes alternatives, and refines the phase goal before generating the final plan.

---

### 68. Failure Pattern Library
**Problem:** Teams repeatedly hit the same failure patterns — a searchable record compresses the learning curve.
**Solution:** Automatically catalog failed phases (timeout, test failures, verification failures) with their root causes and resolutions into a searchable failure pattern library, so future phases can proactively avoid known failure modes.

---

### 69. Phase Complexity Forecaster
**Problem:** Ceremony level is currently inferred from plan count alone; code complexity is a better signal.
**Solution:** Before planning, analyze the codebase areas a phase will touch (via phase goal and module scope) to produce a complexity forecast: cyclomatic complexity of affected modules, test coverage of those areas, and a risk score.

---

### 70. Multi-Repo Project Orchestration
**Problem:** Many production ML systems are split across repos — GRD currently assumes single-repo projects and breaks for this common case.
**Solution:** Support R&D projects that span multiple repositories (e.g., a model repo + a serving repo + a data pipeline repo) with cross-repo phase planning, synchronized execution, and unified progress tracking.

---

## Additional Product Ideas (Batch 3)

### 71. Phase Velocity & Burndown Dashboard
**Problem:** Users flying blind on 'how long is this milestone taking?' have no data to answer 'will we hit the deadline?'
**Solution:** Track actual vs estimated duration per phase, compute velocity trends, and render burndown charts for the active milestone. Surface time-remaining and deadline risk based on current burn rate.

---

### 72. Token Cost Tracker per Phase
**Problem:** R&D teams budgeting AI spend have zero visibility into which phases and agents are the most expensive — GRD is a black box for token costs.
**Solution:** Record approximate token usage and dollar cost for each agent invocation (planner, executor, reviewer, etc.) and surface totals per phase, milestone, and project. Add cost thresholds with alerts.

---

### 73. Natural Language Phase Creation
**Problem:** Creating a phase requires knowing the exact YAML/frontmatter format, which is high-friction for new users.
**Solution:** Let users describe a phase in plain English — 'add caching to the API with Redis' — and have GRD generate the full phase entry including goal, success criteria, verification level, and estimated duration.

---

### 74. arXiv Paper Import & Citation Tracking
**Problem:** Researchers copy-paste paper metadata manually into PAPERS.md — there is no traceability between papers and implementation phases.
**Solution:** Given an arXiv URL or paper ID, automatically fetch abstract, authors, date, and key claims, then add the paper to PAPERS.md with structured metadata and link it to the relevant research phase.

---

### 75. Phase Template Library
**Problem:** New projects waste hours re-inventing standard phase shapes like fine-tuning baseline, RAG pipeline, benchmark evaluation, or API integration.
**Solution:** A curated set of reusable phase templates that pre-fill goal, success criteria, plan structure, and verification level. New projects select from the library instead of starting from scratch.

---

### 76. Slack/Discord Phase Completion Notifications
**Problem:** Teams running overnight autopilot sessions wake up to zero visibility — they must manually poll GRD for phase status.
**Solution:** Post a formatted summary card to Slack or Discord when a phase completes, including goal achieved, key metrics, and any deferred validations.

---

### 77. Phase Dependency Graph Visualization
**Problem:** Large roadmaps with 20+ phases become incomprehensible — teams can't see what's blocking what at a glance.
**Solution:** Render an ASCII or Mermaid diagram of phase dependencies, highlighting the critical path, parallelizable groups, and blocked phases.

---

### 78. Milestone Retrospective Generator
**Problem:** Teams lose institutional memory between milestones — there is no systematic synthesis of what went well and what failed.
**Solution:** After milestone completion, synthesize all SUMMARY.md files, eval results, and blockers into a structured retrospective covering what went well, what was underestimated, which phases ran over, and what to improve.

---

### 79. Cross-Project Knowledge Search
**Problem:** Researchers solving the same problem across projects re-discover the same papers and pitfalls — there is no cross-project search.
**Solution:** Index LANDSCAPE.md, PAPERS.md, KNOWHOW.md, and phase SUMMARY.md files across multiple GRD projects and expose a semantic search command.

---

### 80. Pre-Execution Phase Risk Analysis
**Problem:** Problems like underspecified success criteria, missing baselines, or external API dependencies are only caught after burning tokens.
**Solution:** Before executing a phase, analyze its plan for risk signals: underspecified success criteria, missing baselines, external API dependencies, no rollback strategy, or novel research approaches with no prior art.

---

### 81. Weights & Biases Experiment Sync
**Problem:** ML teams use W&B for experiment tracking but GRD phases are not visible there — cross-run comparison requires manual entry.
**Solution:** Sync eval results from EVAL.md and SUMMARY.md to W&B runs, including metrics, hyperparameters, and phase metadata, making GRD phases first-class W&B experiments.

---

### 82. Auto Changelog Generation from Phases
**Problem:** Every release requires writing a changelog manually — there is no automated synthesis from phase goals and summaries.
**Solution:** Generate a CHANGELOG.md entry from all completed phases in a milestone, organized by type (feature, fix, improvement) and written for an end-user audience.

---

### 83. Phase Replay with Modified Context
**Problem:** When a phase produces mediocre results, users have no systematic way to retry with variation — there is no controlled experimentation.
**Solution:** Re-execute a completed phase with a different model, different research context, or updated success criteria, producing a new branch for comparison.

---

### 84. Technical Debt Accumulation Tracker
**Problem:** Teams accumulate invisible debt as they ship — deferred validations and unfixed code review findings pile up silently.
**Solution:** Track deferred validations, known gaps from PRODUCT-QUALITY.md, and flagged-but-unresolved code review findings across milestones. Display a 'debt score' that trends over time.

---

### 85. Interactive Phase Planning TUI
**Problem:** The current /grd:plan-phase flow is a single-shot prompt — interactive planning could catch misalignment before the agent writes 500 lines of plan.
**Solution:** A terminal UI that shows research context, asks clarifying questions interactively, and lets users select from suggested success criteria and verification approaches before committing.

---

### 86. Paper-to-Phase Auto-Conversion
**Problem:** The journey from 'we found a paper' to 'we have a plan to implement it' is entirely manual.
**Solution:** Given a deep-dive analysis in PAPERS.md, automatically generate a complete implementation phase including goal, research references, success criteria keyed to paper claims, and verification strategy.

---

### 87. Agent Performance Analytics
**Problem:** Teams have no data on which agents are performing well — there is no visibility into planner quality, executor pass rate, or reviewer effectiveness.
**Solution:** Track per-agent metrics over time: planner quality score (from checker), executor pass rate on first try, reviewer severity distribution, verifier pass/fail ratio.

---

### 88. Research Hypothesis Tracker
**Problem:** R&D teams lose track of which research bets paid off — there is no explicit scientific method layer on top of phases.
**Solution:** A structured command to state, track, and resolve research hypotheses ('we believe X will improve metric Y by Z%'), linking each hypothesis to phases and eval results.

---

### 89. Linear / Notion Integration
**Problem:** Many developer-tool companies use Linear or Notion as their primary planning tool — GRD state and team planning state are always out of sync.
**Solution:** Sync milestones and phases to Linear projects or Notion databases as a third tracker option alongside GitHub Issues and Jira.

---

### 90. Phase Clone for Experiments
**Problem:** Running controlled experiments requires duplicating phase structure manually — clone makes it a one-command operation.
**Solution:** Clone an existing phase with a new name and optional parameter overrides (model, approach, hyperparameters), enabling A/B experimentation between phase variants.

---

### 91. CI-Triggered Phase Execution
**Problem:** The manual 'now run the phase' step is disconnected from CI/CD muscle memory.
**Solution:** GitHub Actions workflow that detects a phase marked 'ready' and triggers /grd:execute-phase automatically when a PR merges to main, posting results as PR comments.

---

### 92. Research Coverage Audit
**Problem:** Research effort gets wasted when surveyed approaches are never tried — there is no audit of which papers were used vs. ignored.
**Solution:** Analyze which papers in PAPERS.md are actually cited in phase plans vs which were surveyed but never used, and flag gaps between LANDSCAPE.md methods and implemented phases.

---

### 93. Smart Phase Ordering Suggestions
**Problem:** Phase ordering bugs are only discovered at integration time — catching them at planning time saves days.
**Solution:** Analyze a milestone's phases for implicit dependencies (shared files, shared types, shared APIs) beyond declared depends_on, and suggest a reordering or flag likely integration conflicts.

---

### 94. Plain-English Phase Explainer
**Problem:** Phase plan files are too technical for stakeholders or team leads who don't read PLAN.md files.
**Solution:** A /grd:explain command that translates a phase plan's technical goals, success criteria, and verification steps into a non-technical summary suitable for leadership communication.

---

### 95. Deferred Validation Auto-Scheduler
**Problem:** Deferred validations silently pile up and get forgotten — there is no automatic scheduling into the roadmap.
**Solution:** Scan STATE.md for all pending deferred validations, estimate which integration phase they belong to, and create a prioritized validation queue with suggested phase assignments.

---

### 96. Multi-Model Phase Comparison
**Problem:** Teams don't know whether paying for opus over sonnet is worth it for their specific task type — there is no data to make that call.
**Solution:** Execute the same phase plan against two different model profiles (e.g. quality vs balanced) and produce a diff of outputs, plan quality, and token cost.

---

### 97. Research Knowledge Graph Export
**Problem:** GRD's .planning/ directory is a rich knowledge base but it's flat files — the connections between papers, phases, and metrics are not explorable.
**Solution:** Export the relationships between papers, methods, phases, metrics, and hypotheses as a graph (JSON-LD, Obsidian-compatible markdown, or DOT format) for visualization in external tools.

---

### 98. Phase Before/After Diff Viewer
**Problem:** Post-phase review today requires manually comparing two files — the gap between plan and reality is hard to see at a glance.
**Solution:** Show a structured diff between a phase's planned success criteria and its actual SUMMARY.md outcomes, highlighting where goals were met, exceeded, or missed.

---

### 99. HuggingFace Benchmark & Leaderboard Sync
**Problem:** Researchers manually look up leaderboard numbers — there is no automation for 'what is SoTA today?' which every new project starts with.
**Solution:** Pull standard benchmark scores for a model family from HuggingFace leaderboards and auto-populate BASELINE.md and BENCHMARKS.md with current SoTA numbers.

---

### 100. Blocker Escalation & Aging Alerts
**Problem:** Blockers get added to STATE.md and then forgotten — there is no accountability mechanism for resolution.
**Solution:** Track how long each blocker in STATE.md has been open, surface blockers older than a configurable threshold in /grd:progress, and optionally post aging alerts to Slack.

---

### 101. Batch Phase Operations
**Problem:** Bulk changes to roadmap structure currently require editing ROADMAP.md by hand — batch ops make restructuring fast.
**Solution:** Execute the same operation (status update, verification level change, dependency add) across multiple phases matching a filter (e.g. all phases in a milestone, all phases with verification_level=1).

---

### 102. Research Contradiction Detector
**Problem:** Researchers miss contradictions in literature and end up building on flawed assumptions — early flagging prevents wasted phases.
**Solution:** Scan LANDSCAPE.md and PAPERS.md for conflicting claims between papers (paper A says X improves metric, paper B says X hurts it) and surface these conflicts before phase planning.

---

### 103. Project Snapshot Sharing
**Problem:** Knowledge transfer between engineers on a project requires manually explaining GRD state — there is no one-command handoff.
**Solution:** Bundle a project's .planning/ directory into a shareable ZIP or gist with sensitive data redacted, enabling easy handoff between teammates or posting as a public example.

---

### 104. Phase Impact Analysis Before Removal
**Problem:** Removing a phase today only checks direct depends_on — indirect artifact dependencies that would silently break downstream phases are not caught.
**Solution:** Before /grd:remove-phase runs, analyze which future phases depend on the target phase's outputs (artifacts, metrics, baselines) and show a concrete impact report.

---

### 105. Contextual Research Recommendations
**Problem:** Planners forget to consult the research KB when writing plans — prior art is not proactively surfaced.
**Solution:** During phase planning, automatically suggest relevant papers from PAPERS.md and LANDSCAPE.md based on the phase goal's semantic similarity to known research.

---

## Workflow Reproducibility

### 106. Experiment Replay & Comparison
**Problem:** Users have no way to know exactly what the agent did in a previous phase execution, making R&D results feel non-reproducible.
**Solution:** Record the exact sequence of prompts, agent calls, and decisions made during a phase execution, then replay or fork it with different parameters. Users can A/B test planning approaches, compare two executor runs on the same phase, or share reproducible experiment traces with teammates.

---

## Knowledge Management

### 107. Cross-Project Knowledge Graph
**Problem:** Teams re-discover the same dead ends across projects because there is no way to query prior R&D work from a new project.
**Solution:** Index LANDSCAPE.md, PAPERS.md, and KNOWHOW.md files across all GRD projects on a machine into a queryable knowledge graph. When starting a new project, automatically surface relevant prior research, known failure modes, and proven patterns from past projects.

---

## Cost Management

### 108. Phase Cost & Token Estimator
**Problem:** Users flying blind on costs get surprised by runaway agent spending when executing expensive phases.
**Solution:** Before executing a phase, estimate the number of API tokens and approximate cost based on plan count, ceremony level, verification tier, and historical execution data from STATE.md metrics. Show a cost confirmation gate for expensive phases.

---

## Team Collaboration

### 109. Team Handoff Packets
**Problem:** Teams lose days when a developer leaves mid-milestone and nobody knows the context.
**Solution:** Generate a self-contained handoff document (PDF or markdown bundle) for any phase or milestone that includes: the research rationale, decisions made, what was built, test results, known gaps, and the exact GRD commands to resume work.

### 110. Slack/Discord Webhook Notifications
**Problem:** Engineers running overnight autonomous phases have no visibility without polling STATE.md manually.
**Solution:** Push real-time phase lifecycle events (phase started, plan completed, eval failed, phase verified) to Slack or Discord via webhooks. Include a summary card with key metrics and a link to the relevant planning artifact.

---

## Quality Assurance

### 111. Spec Drift Detector
**Problem:** The common pattern where early phases build the right thing but later refactors silently break the original spec goes undetected.
**Solution:** Continuously compare the current codebase against REQUIREMENTS.md and PLAN.md success criteria, flagging when implemented behavior diverges from specified intent. Runs as a lightweight post-commit hook.

### 112. Paper-to-Code Linker
**Problem:** Code review and auditing are hard because there is no living audit trail between 'what the paper says' and 'what we built'.
**Solution:** Parse arxiv URLs and DOIs in RESEARCH.md files, extract algorithm pseudocode or equations, and annotate the corresponding implementation files with inline comments linking back to the specific paper section.

### 113. Metric Regression Alerts
**Problem:** Teams discover metric regressions weeks later when the cause is buried in git history.
**Solution:** After each phase, automatically compare eval metrics against BASELINE.md and flag regressions above a configurable threshold. Block merge/push if a P0 metric regresses beyond the allowed delta.

---

## Reporting & Visibility

### 114. Visual Roadmap Export (Gantt / Timeline)
**Problem:** PMs and leads need a way to present R&D progress without decoding markdown files.
**Solution:** Export ROADMAP.md as an interactive Gantt chart HTML file or Mermaid diagram, showing phase dependencies, durations, current status, and critical path. Share with stakeholders who don't live in the terminal.

### 115. PR Context Auto-Injection
**Problem:** Reviewers spend most of their PR review time asking 'why was this built this way?' — context is buried in .planning/.
**Solution:** When a phase branch is pushed and a PR is created, automatically attach the relevant PLAN.md, SUMMARY.md, EVAL.md, and VERIFICATION.md as PR body sections or comments.

---

## Planning Safety

### 116. Phase Time Machine
**Problem:** When planning goes wrong mid-milestone, users have no way to undo agent decisions without manual git archaeology.
**Solution:** Snapshot the complete .planning/ state at the start of each phase execution and store it in a lightweight versioned archive. Allow reverting the planning state to any prior phase boundary without touching the codebase.

---

## Research Tracking

### 117. Competitive Benchmark Tracker
**Problem:** R&D teams often don't realize their target has become obsolete until the paper is already submitted.
**Solution:** Pull public benchmark leaderboard results (Papers With Code, HuggingFace Spaces) for the methods in LANDSCAPE.md and update BENCHMARKS.md when new SOTA results are published. Alert when a competitor surpasses the user's target metric.

---

## Developer Experience

### 118. Decision Rationale Explainer
**Problem:** New team members lose days trying to understand why the codebase is structured the way it is.
**Solution:** Add a `/grd:why <decision|phase|command>` command that traces back through STATE.md decisions, RESEARCH.md findings, and PRINCIPLES.md to explain why a particular architectural choice was made and what alternatives were considered.

### 119. Automated Ablation Study Scheduler
**Problem:** Ablation studies are the most tedious part of research but the most required for publications and rigorous engineering.
**Solution:** Given an EVAL.md with multiple components, automatically generate and schedule ablation experiments that test each component's contribution independently. Produces a contribution table showing which components drive which metrics.

### 120. Mid-Phase Model Switcher
**Problem:** Users currently have to abort and re-initiate a phase to change model profiles, losing all progress.
**Solution:** Allow switching the model used by executor/planner agents mid-phase via a config command without restarting the workflow. Include a cost/quality tradeoff preview showing what each model tier would cost for the remaining plans.

---

## Compliance & Coverage

### 121. Requirement Coverage Heatmap
**Problem:** Compliance gaps are not immediately visible and require manual matrix review.
**Solution:** Generate a visual heatmap showing which REQUIREMENTS.md items are covered by tests, which are only covered by plan success criteria, and which have no verification at all.

---

## Audit & History

### 122. Git Blame Phase Annotator
**Problem:** Raw git history has no connection to the R&D rationale behind each commit.
**Solution:** Augment `git log` and `git blame` output with GRD phase context: which phase produced each commit, the success criteria it was addressing, and the eval results at the time. Turns raw git history into a structured R&D audit trail with zero manual annotation required.

---

## Dependency Management

### 123. Dependency Impact Preview
**Problem:** Dependency choices made during rapid R&D phases often create technical debt that's painful to unwind later.
**Solution:** Before running `npm install` / `pip install` for a new dependency in a phase, analyze the dependency's license, bundle size impact, known CVEs, and transitive dependency tree. Surface a risk summary inside the agent context.

---

## Multi-Repo Coordination

### 124. Multi-Repo Phase Sync
**Problem:** Large ML systems routinely span 3-5 repos and manual coordination is error-prone.
**Solution:** Coordinate phases across multiple repositories (e.g., a model repo and a serving repo) by treating them as sub-phases of a parent phase. Track cross-repo dependencies and surface blocking states when one repo's phase completes before the other.

---

## Research Discovery

### 125. Research Gap Finder
**Problem:** Researchers spend weeks finding gaps that structured analysis could surface in minutes.
**Solution:** Given a LANDSCAPE.md, automatically identify evaluation dimensions where no published method has strong results, or where methods have been compared on different benchmarks (making direct comparison impossible). Surfaces novel research angles and under-explored problem formulations.

---

## Templates & Scaffolding

### 126. Phase Template Library
**Problem:** Starting from scratch every phase is wasteful when the structure repeats.
**Solution:** Curated library of reusable phase templates for common R&D patterns (data pipeline, model training, API integration, evaluation harness, benchmarking). Instantiate a template with `/grd:add-phase --template training-loop` and get a pre-populated RESEARCH.md, EVAL.md skeleton, and recommended plan structure.

---

## Debugging & Troubleshooting

### 127. Interactive Phase Debugger
**Problem:** Debugging failed phases currently requires reading through dense log output with no structure.
**Solution:** Step through a failed phase execution plan-by-plan in an interactive TUI, showing the exact agent prompt sent, the response received, and what verification check failed. Allow re-running individual plans with modified prompts without re-executing the entire phase.

---

## Documentation

### 128. Auto-Changelog from Phase Summaries
**Problem:** Engineering teams consistently ship without proper changelogs because writing them manually is painful.
**Solution:** Generate a user-facing CHANGELOG.md entry by distilling all SUMMARY.md files from a milestone into plain-English feature bullets, grouped by impact area. Replaces the tedious manual process of writing release notes by synthesizing what was actually built and verified.

---

## Risk Management

### 129. Phase Risk Scorer
**Problem:** Engineers regularly execute high-risk phases with the same ceremony as trivial ones.
**Solution:** Before executing a phase, score it on a risk rubric: number of files touched, presence of db migrations, external API dependencies, lack of test coverage on affected modules, and whether deferred validations are pending. Flag high-risk phases and suggest additional verification steps.

---

## Multi-Project Visibility

### 130. GRD Cloud Dashboard
**Problem:** Engineering leads lack visibility across all R&D workstreams without SSH-ing into developer machines.
**Solution:** A web dashboard that ingests .planning/ artifacts from multiple projects (via git push or CLI sync) and shows a unified view of all active milestones, phase health, metric trends, and team activity.

---

## Natural Language Interface

### 131. Natural Language Phase Query
**Problem:** Answering questions like 'why did we switch approach?' requires manually searching through .planning/ artifacts.
**Solution:** Add a `/grd:ask <question>` command that answers questions about the project in natural language by searching across all .planning/ artifacts. 'What was the reason we switched from approach A to approach B?' or 'Which phases touched the authentication module?' instantly answered from documented context.

---

## Test Coverage

### 132. Test Gap Auto-Filler
**Problem:** Phase-boundary coverage gaps accumulate into a debt that's expensive to pay down later.
**Solution:** Analyze coverage reports after each phase and automatically generate a list of specific missing test cases (not just line coverage but behavioral gaps) as a TODO list appended to the phase SUMMARY.md. Optionally spawn a targeted test-writing sub-agent.

---

## Retrospectives

### 133. Milestone Retrospective Generator
**Problem:** Teams skip retrospectives because they're time-consuming — automation makes them free.
**Solution:** After milestone completion, synthesize a retrospective document from all phase summaries, blockers, decision logs, and metric trajectories: what went well, what slowed us down, which estimates were accurate, and what to do differently next milestone.

---

## Performance Optimization

### 134. Context Window Optimizer
**Problem:** As projects grow, context bloat slows agents and increases cost — users have no visibility into what's being sent.
**Solution:** Analyze which .planning/ documents are loaded into agent context for each workflow and trim, summarize, or chunk them to minimize token usage without losing critical information. Show the before/after token count.

---

## Research Integrity

### 135. Inline Citation Validator
**Problem:** Researchers frequently misremember paper results under time pressure, leading to plans built on incorrect baselines.
**Solution:** Scan RESEARCH.md files for arxiv links, DOIs, and paper titles and verify they exist, are accessible, and match the claimed results. Flag papers where the cited claim doesn't appear in the abstract or key sections.

---

## Agent Configuration

### 136. Agent Persona Profiles
**Problem:** Different projects have different quality emphases — a security product needs a different executor mindset than a research prototype.
**Solution:** Allow users to configure named agent profiles with custom system prompt overlays (e.g., 'security-focused reviewer', 'latency-obsessed optimizer', 'skeptical researcher'). Apply a profile to any agent at runtime.

---

## Visualization

### 137. Phase Dependency Visualizer
**Problem:** Complex milestones with 10+ phases become impossible to reason about from a flat ROADMAP.md list.
**Solution:** Render the full phase dependency graph as an interactive SVG or Mermaid diagram with real-time status colors (pending, in-progress, complete, blocked). Clickable nodes link to the phase planning artifacts.

---

## Security

### 138. Pre-Execution Secrets Scanner
**Problem:** Agents modifying config files can accidentally include test credentials in committed artifacts.
**Solution:** Before any phase execution that touches files, run a lightweight secrets scan (API keys, tokens, credentials patterns) on files flagged for modification and block execution if potential secrets are detected.

---

## Git Strategy

### 139. Milestone-Level Branching Strategies
**Problem:** Large teams need to run multiple milestones in parallel without conflicts, but only phase-level isolation currently exists.
**Solution:** Support configurable milestone-level git strategies: trunk-based (all phases on main), milestone branch (single branch per milestone with phase PRs into it), or full isolation (separate worktree per milestone).

---

## Evaluation Planning

### 140. Eval Target Negotiator
**Problem:** Teams routinely set eval targets that are either trivially easy or physically impossible.
**Solution:** Before locking in eval targets for a phase, run a quick feasibility sub-agent that checks whether the proposed target is achievable given current BASELINE.md, the state of the art from LANDSCAPE.md, and the planned approach. Suggests calibrated targets with confidence levels.

---

## Data Export

### 141. Knowledge Base Export for RAG
**Problem:** Teams that want to query their R&D history in custom chatbots or internal tools have no clean export path.
**Solution:** Export all .planning/ artifacts in a structured format (JSON-L, LlamaIndex-compatible, or LangChain document store) suitable for use as a retrieval-augmented generation knowledge base in other tools.

---

## Research Knowledge Sharing

### 142. Cross-Project Research Library
**Problem:** Every new project starts from scratch even if you've already surveyed the same domain. Users waste hours re-discovering papers they've already analyzed.
**Solution:** A shared research registry that lets users import LANDSCAPE.md, PAPERS.md, and deep-dive artifacts from past projects into a new one. A `grd:import-research` command pulls indexed research from a local or team-shared library, with semantic deduplication to avoid stale imports.

### 143. Research Topic Alert Subscriptions
**Problem:** Users miss relevant new papers published after their initial survey, causing stale LANDSCAPE.md entries.
**Solution:** Subscribe to arXiv search queries tied to your LANDSCAPE.md topics with `grd:watch-topic '<query>'`, and get a weekly digest of new papers matching your research area. `grd:check-alerts` fetches new papers, pre-filters by relevance score, and appends candidates to PAPERS.md for review.

### 144. Research Contradiction Detector (Deep-Dive Mode)
**Problem:** Contradictions between papers are the hardest part of literature review — Paper A says method X outperforms Y, Paper B says the opposite on the same benchmark.
**Solution:** `grd:deep-dive` gets a `--contradiction-check` mode that, when adding a new paper to LANDSCAPE.md, flags specific claims that conflict with your existing research base and explains the likely source of discrepancy (different datasets, evaluation protocols, etc.).

### 145. Research Report Generator
**Problem:** Users have rich phase data scattered across .planning/ but no way to synthesize it into a shareable artifact.
**Solution:** `grd:export-report --milestone v0.3.0` compiles all phase artifacts (research, plans, results, metrics) into a publishable research report in Markdown or PDF: executive summary, methodology, results table, appendix with full experiment logs — usable as an internal tech report or conference workshop paper.

---

## Experiment Management

### 146. Experiment Run Diff
**Problem:** Users iterate through multiple attempts at a phase and lose track of what changed between runs.
**Solution:** `grd:diff-runs phase N --run 2 --run 4` compares two phase SUMMARY.md files side-by-side, highlighting metric deltas, changed hyperparameters, and different conclusions in a structured diff table showing exactly what improved, degraded, or was unchanged.

### 147. Experiment Reproducibility Audit
**Problem:** Reproducibility is the most common failure mode in ML research — missing seeds, dataset versions, and hardware specs make results unverifiable.
**Solution:** `grd:audit-reproducibility` scans all SUMMARY.md files for experiments and flags any missing: random seeds, dataset versions, hardware specs, or dependency versions. Scores each phase's experimental rigor and generates a checklist of missing metadata required for third-party reproduction.

### 148. Dataset Version Registry
**Problem:** ML research is riddled with silent dataset inconsistencies — different phases using different dataset versions makes results incomparable.
**Solution:** Track which dataset version, split, and preprocessing config was used in each phase's evaluation. A dataset registry in STATE.md with `grd:dataset register` creates a canonical reference, and eval reports automatically warn when the current phase uses a different dataset version than the baseline.

### 149. Built-in A/B Phase Comparison
**Problem:** Users often aren't sure which of two approaches will win and run them serially, wasting time.
**Solution:** `grd:plan-phase N --variant B` creates a sibling phase that runs a different approach on the same eval suite. `grd:compare-variants N` renders a head-to-head table of metrics, time, and complexity — making the choice data-driven rather than gut-feel.

### 150. Personal Model Performance Leaderboard
**Problem:** Users lose track of their best-performing configurations as projects grow across multiple phases.
**Solution:** `grd:leaderboard` aggregates eval results across all phases to build a project-specific leaderboard comparing different model configurations, hyperparameter settings, or architectural choices tried across the project lifecycle — ranked by primary metric.

---

## Team Coordination

### 151. Multi-Engineer Phase Assignment
**Problem:** On a team, it's unclear who owns which phase and reviews are uncoordinated.
**Solution:** Let roadmap phases be assigned to specific team members, with ownership tracked in ROADMAP.md frontmatter. `grd:assign-phase N --to @alice` sets ownership, and `grd:team-status` shows each engineer's in-progress phases, blockers, and upcoming work — bridging GRD's planning artifacts and team coordination.

### 152. Daily Standup Digest
**Problem:** Async teams lose context overnight — there's no quick summary of what changed in GRD artifacts since yesterday.
**Solution:** `grd:standup` generates a concise daily standup summary from the previous day's phase activity: what was completed, what's in progress, what's blocked, and what's planned next. Produces a 5-bullet summary pasteable into Slack — no reading through planning files, no manual assembly.

### 153. Code Review Issue Trend Analysis
**Problem:** Reviewers flag the same issues repeatedly because there's no feedback loop back to the team's coding patterns.
**Solution:** `grd:review-trends` aggregates REVIEW.md files across phases to identify recurring issue patterns — e.g. 'missing input validation' appeared in 8 of 12 code reviews — and surfaces them as project-level quality gaps enabling targeted improvements to standards, templates, or linting rules.

---

## Cost & Performance Awareness

### 154. Phase Cost Estimator
**Problem:** Users are often surprised by large bills after a complex phase runs with opus-tier agents.
**Solution:** `grd:estimate-phase N` gives a cost range before executing a phase, showing an estimated token/API cost breakdown based on the number of plans, ceremony level, and agent model profile — so users can downgrade the ceremony level or switch to a budget model profile before committing.

### 155. Phase Budget Guardrails
**Problem:** Autopilot phases can spiral in cost without warning, with no mechanism to pause or downgrade mid-run.
**Solution:** Set a maximum token/cost budget per phase in config.json. When 80% is consumed, GRD pauses execution and prompts the user with options: continue anyway, downgrade to a cheaper model mid-phase, or terminate and save results so far.

### 156. Agent Performance Profiler
**Problem:** Users tune ceremony level blindly — they don't know if the planner agent is taking 80% of the time or if the verifier is the expensive part.
**Solution:** `grd:profile-agents` tracks per-agent latency, token consumption, and output quality scores across phases, surfacing which agents are bottlenecks. Enables targeted optimizations like downgrading specific agents while keeping others at full quality.

### 157. Phase Duration Analytics
**Problem:** Everyone underestimates how long phases take, with no feedback loop to improve future estimates.
**Solution:** `grd:time-report` tracks actual wall-clock time per phase against estimated duration and builds a personal calibration model. After 10+ phases, shows your personal velocity, which phase types are always underestimated, and applies a calibration multiplier when estimating new phases.

---

## Quality & Governance

### 158. Codebase Health Trend Charts
**Problem:** Today's phase-cleanup produces a one-time report with no historical context — no way to see if quality is improving or degrading.
**Solution:** Track phase-boundary quality metrics (complexity, file sizes, test coverage, dead exports) over time and surface trends in `grd:progress health`. Shows whether code quality is improving or degrading across milestones, catching 'quality debt creep' before it becomes a crisis.

### 159. Deferred Validation Tracker Dashboard
**Problem:** Deferred validations in STATE.md are invisible until they're due, creating hidden risk.
**Solution:** `grd:progress deferred` shows a dedicated dashboard of all pending deferred validations across the project — their originating phase, expected integration phase, and current status. Makes it obvious when many phases have shipped with unchecked deferred work piling up.

### 160. Principles Conflict Checker
**Problem:** Teams write principles they never enforce — there's no mechanism to catch plan violations before execution.
**Solution:** `grd:check-principles N` runs a structured analysis of the phase plan against each principle in PRINCIPLES.md before finalizing, flags potential conflicts (e.g. principle says 'no external APIs' but plan introduces one), and requires explicit acknowledgment before proceeding.

### 161. Multi-Milestone Burndown View
**Problem:** Users tracking LT-1 through LT-4 goals have no way to see if they're on track for the long-term roadmap.
**Solution:** Show a burndown chart across multiple milestones mapping completed phases against long-term roadmap goals, with a velocity-based completion forecast. Makes long-term planning conversations data-driven with projected completion dates.

### 162. Auto-Generated PR Descriptions
**Problem:** Developers write weak PR descriptions because the context lives in planning artifacts they have to manually copy.
**Solution:** When a phase completes with git worktree isolation, `grd:create-pr N` automatically generates a rich PR description from the phase SUMMARY.md, eval results, and key decisions — including: what changed, why (research backing), metrics before/after, deferred validations, and reviewer guidance.

---

## Paper & Requirements Tracking

### 163. Paper → Code Section Mapper
**Problem:** There's no machine-readable link between papers in PAPERS.md and the code that implements them.
**Solution:** Let users annotate which code files or functions implement which section of a paper (e.g. 'Algorithm 1 → lib/model.py:train_step'). `grd:paper-coverage` checks implementation completeness: did every key algorithm from the paper get implemented?

### 164. Paper Implementation Status Board
**Problem:** Large projects reference dozens of papers but lose track of what's been implemented, leading to duplicate or missed work.
**Solution:** For each paper in PAPERS.md, `grd:paper-status` renders a board showing implementation coverage per paper (none / partial / complete / superseded) and by which phase — helping avoid re-implementing things already done or missing key contributions.

### 165. Requirements Coverage Heatmap
**Problem:** Requirements drift is invisible — you can be 80% done but have an entire category of requirements untouched.
**Solution:** `grd:requirement coverage` renders a heatmap grouped by requirement category, visualizing which requirements have been addressed by completed phases, which are in-progress, and which are orphaned with no planned work. Surfaces coverage gaps before a milestone review.

### 166. Research Gap Analysis
**Problem:** Users spend days wondering 'has anyone solved this?' before realizing it's genuinely novel.
**Solution:** `grd:gap-analysis` cross-references REQUIREMENTS.md against LANDSCAPE.md and flags gaps where no SoTA method exists, prompting targeted survey work. Analyzes which requirements have no corresponding paper coverage or known implementation approach.

---

## Workflow Automation

### 167. Promote Todo to Phase
**Problem:** Todos pile up and never become real work because the friction of creating a new phase is high.
**Solution:** `grd:promote-todo <id>` converts a captured todo item directly into a fully scaffolded phase with one command, preserving the todo's context and notes as phase research seeds. Pre-populates RESEARCH.md with the todo's description and any links, and removes the todo — zero re-typing.

### 168. Phase Template Library
**Problem:** New projects waste time writing the same boilerplate phase structures for common R&D patterns.
**Solution:** `grd:new-phase --from-template ablation-study` scaffolds a phase from a curated library of reusable templates: 'baseline establishment', 'ablation study', 'dataset preprocessing', 'model finetuning', 'benchmark evaluation'. Pre-fills RESEARCH.md structure, suggested eval metrics, and a starter PLAN.md outline.

### 169. Intelligent Phase Splitter
**Problem:** Users often create phases that are too large, leading to long execution times and hard-to-verify outcomes.
**Solution:** `grd:split-phase N` reads the phase goal and plans, identifies natural seams (e.g. infrastructure vs logic vs tests), and proposes a split with estimated effort for each sub-phase — with one command to apply the split and update the roadmap.

### 170. Phase Risk Scoring
**Problem:** Users don't know where to invest ceremony level until it's too late — risky phases get light ceremony and fail.
**Solution:** Before planning begins, score each phase on technical risk (novelty of approach, number of unknowns, dependency on unproven techniques) and schedule risk (blocking many downstream phases, short duration estimate for high complexity). Helps users decide whether to use light vs full ceremony.

---

## Post-Milestone Analysis

### 171. Automated Milestone Retrospective
**Problem:** Teams never do retrospectives because the data is hard to gather manually from scattered planning artifacts.
**Solution:** `grd:complete-milestone` gets a retrospective mode that auto-compiles data from all phase artifacts: what was estimated vs actual, which phases regressed metrics, what deferred validations were missed, which approaches worked and which were abandoned. Produces a 'lessons learned' document.

### 172. Institutional Knowledge Distillation
**Problem:** Tacit knowledge evaporates between projects and between team members — there's no synthesis of hard-won insights.
**Solution:** After a milestone completes, `grd:distill-knowledge --milestone v0.3.0` distills all decisions, learnings, and failed experiments into a compact KNOWHOW.md capturing what would be lost if the project sat dormant for 6 months — distinct from raw artifacts, focused on transferable insights.

### 173. Multi-Milestone Burndown
**Problem:** Users tracking multiple milestones toward a long-term goal have no aggregate velocity view.
**Solution:** Show a burndown chart across multiple milestones with velocity-based completion forecasts. Tracks how many phases were completed per week and projects when the long-term roadmap goals will be achieved based on current pace.

---

## Notifications & Integrations

### 174. Phase Completion Notifications
**Problem:** Autopilot can run for hours — users currently have to poll or watch the terminal to know when it's done.
**Solution:** A configurable `notifications` section in config.json with webhook URL, email, or desktop notification support. Engineers get a Slack message when their overnight autopilot run finishes, including the pass/fail status and key metrics from the phase summary.

---

## Interactive Visualization

### 175. Interactive Phase Dependency Graph
**Problem:** Dependencies are buried in ROADMAP.md text — there's no visual way to spot bottlenecks or parallelizable work.
**Solution:** `grd:progress graph` or a generated Mermaid diagram renders the roadmap as an ASCII or Mermaid dependency graph showing which phases block others, what's parallel-safe, and the critical path to milestone completion. Lets users spot bottlenecks and plan team assignments.

---

## Quality Baselines

### 176. Metric Regression Detection
**Problem:** Users currently have to manually compare eval tables — silent quality drops (accuracy up, latency doubled) go unnoticed.
**Solution:** After each eval-report, automatically diff current metrics against BASELINE.md and surface any regressions as warnings before marking a phase complete. Can block phase completion until the user explicitly acknowledges the tradeoff.

---

## Cost & Budget Management

### 177. Phase Cost Tracking & Budget Caps
**Problem:** Users running autonomous multi-phase autopilot sessions have no visibility into API token spend. Coming back to find $50 burned overnight is a real fear that prevents adoption of autonomous modes.
**Solution:** Track estimated token usage and API cost per phase, plan, and milestone. Show cumulative spend in the `/grd:progress` dashboard. Allow users to set budget caps in config.json (`budget.max_per_run`, `budget.warn_at`) that pause autopilot and ask for confirmation before continuing. Surface cost breakdowns in SUMMARY.md so cost-per-insight becomes a measurable research metric.

---

## Workflow Templates

### 178. Reusable Phase Templates
**Problem:** Every time a researcher needs to 'benchmark a new model' or 'add test coverage to a module', they start from a blank phase — writing the same success criteria and plan structure from scratch.
**Solution:** A library of pre-built phase templates for common R&D patterns: 'benchmark-new-model', 'integrate-third-party-api', 'add-test-coverage', 'migrate-file-format', 'literature-review'. `/grd:add-phase --template benchmark-new-model` populates the phase with a pre-structured plan skeleton, suggested success criteria, and relevant evaluation metrics from the template. Stored in `commands/templates/` and extensible by users.

---

## Evaluation & Metrics

### 179. Eval Metric Trend Visualization
**Problem:** Comparing eval metrics across phases and iterations requires manually diffing SUMMARY.md files. Regression and improvement trends are invisible at a glance.
**Solution:** Chart evaluation metrics (PSNR, accuracy, latency, or any custom metric) across iterations and phases. Renders as ASCII sparklines in the terminal dashboard (`/grd:progress metrics`) or exports as CSV for charting. A `grd-tools.js progress metrics --phase N` command shows a per-metric trend table with delta indicators (↑/↓) across all phase iterations.

### 180. Public Benchmark Comparison
**Problem:** A locally measured PSNR of 34.2 means nothing without context. Users don't know if they're above or below the field.
**Solution:** When eval metrics are recorded, optionally compare against published benchmarks from LANDSCAPE.md entries or Papers With Code. Show 'your PSNR: 34.2 dB | SoTA: 36.1 dB | baseline: 31.5 dB' in eval reports. Configure benchmark references in EVAL.md frontmatter under `benchmarks:` and have `grd-tools.js eval-report` pull them into the comparison table automatically.

---

## Reporting & Documentation

### 181. Non-Technical Stakeholder Report
**Problem:** Researchers have no way to explain to product managers or clients what they've been building without manually writing a summary from scratch.
**Solution:** Generate a polished Markdown (or PDF) progress report targeted at non-technical stakeholders: what was researched, what was built, what was measured, what comes next — with zero jargon. `/grd:progress report --format pdf` synthesizes SUMMARY.md files and eval results into a readable briefing. Separate from the research-focused export; this uses plain language templates, hides implementation details, and surfaces only business-relevant outcomes.

### 182. Auto-Generated CHANGELOG from Phases
**Problem:** Developers must manually write CHANGELOGs at release time. The information already exists in SUMMARY.md files but is never collated.
**Solution:** Synthesize a user-facing CHANGELOG.md from completed phase SUMMARY.md files and milestone completion markers. `/grd:complete-milestone --changelog` generates a formatted, categorized changelog section (Features, Fixes, Research, Improvements) by parsing phase goals and outcomes. Stores the changelog entry in `docs/CHANGELOG.md` and links it from the milestone record.

### 183. Auto-Updated Research Log from Phase Summaries
**Problem:** After 20+ phases, the project README is stale while all real knowledge lives in .planning/ where external collaborators can't see it.
**Solution:** Maintain a `docs/RESEARCH-LOG.md` that automatically stays in sync with completed phase summaries and eval results. `/grd:progress sync-docs` regenerates the research log from structured data in all SUMMARY.md files. The log is human-readable and suitable for GitHub wikis or internal documentation portals.

### 184. Research Brief PDF Export
**Problem:** Researchers need to present survey findings to collaborators or archive them, but LANDSCAPE.md is not a shareable artifact.
**Solution:** Export the current research state as a shareable PDF brief: survey findings, key papers, feasibility analysis, and recommended approach. `/grd:survey export --format pdf` synthesizes LANDSCAPE.md, PAPERS.md, and feasibility reports into a document suitable for sharing with collaborators or archiving as an internal tech report.

---

## Research Hygiene

### 185. Research Staleness Detection
**Problem:** Building on a 2-month-old survey may have missed key papers that change the recommended approach. There's no alert when research context becomes stale.
**Solution:** Alert when LANDSCAPE.md or PAPERS.md files are older than a configurable threshold (e.g., 30 days) or when the survey predates significant new arXiv papers in tracked topics. Surfaces a warning in `/grd:progress` and `/grd:plan-phase` output if the research context is stale: 'LANDSCAPE.md is 45 days old — consider running /grd:survey to check for recent papers.' Threshold configurable in config.json under `research.staleness_days`.

---

## CI/CD Integration

### 186. PR-Triggered Phase Evaluation
**Problem:** Phases are verified manually and the results aren't visible in the PR review flow, breaking the loop between code review and formal phase verification.
**Solution:** A GitHub Actions workflow that automatically runs `/grd:verify-phase N` or `/grd:eval-report N` when a PR is opened that touches a phase's outputs. Posts results as a PR comment including pass/fail status, metric deltas from baseline, and any failed verification checks. Closes the loop so reviewers can see formal phase verification alongside code diffs.

---

## Discovery & Search

### 187. Full-Text Planning Search
**Problem:** 'I remember we decided something about X six phases ago but I can't find it' — currently finding past decisions requires manual grep across dozens of files.
**Solution:** A `grd-tools search <query>` command that performs full-text search across all `.planning/` artifacts — ROADMAP.md, SUMMARY.md files, LANDSCAPE.md, todos, decisions. Returns ranked results with file paths and snippets. Supports field-scoped search: `grd-tools search "authentication" --in decisions` or `--in summaries --phase 5-12`. Backed by a lightweight inverted index cached at `.planning/search-index.json`.

---

## Decision Management

### 188. Searchable Decision Audit Trail
**Problem:** Decisions are scattered across SUMMARY.md files with no unified search. There is no way to query 'what decisions were made about authentication across all phases?'
**Solution:** A unified, searchable timeline of all decisions logged across phases — `grd-tools decisions list --phase 12 --keyword authentication`. Includes which agent or human made the decision, what options were considered, and why the chosen path was taken. Decisions are indexed in STATE.md under a structured `decisions_index` section, queryable from the CLI and exposed as an MCP tool.

---

## Onboarding

### 189. Initialize GRD from Existing Repository
**Problem:** Adopting GRD mid-project means staring at blank PROJECT.md and ROADMAP.md files with no guidance.
**Solution:** Analyze an existing codebase (via `/grd:new-project --from-existing`) to auto-detect: language/framework, existing test suite, CI setup, test coverage baseline, and what kinds of R&D phases would be most relevant. Pre-populates PROJECT.md with inferred goals, suggests a starter ROADMAP.md with 3-5 phases based on detected gaps, and runs `/grd:assess-baseline` automatically to establish initial quality metrics.

---

## Estimation & Forecasting

### 190. Actual vs Estimated Duration Tracking
**Problem:** Duration estimates (`**Duration:** 3d`) are pure guesses with no feedback loop. There is no mechanism to improve estimation accuracy over time.
**Solution:** Track actual wall-clock time for each phase execution (start/end timestamps in STATE.md) versus the estimated duration in ROADMAP.md. Show variance in `/grd:progress` dashboard (e.g., 'Phase 12: estimated 3d, actual 5d, +67%'). Use historical data to suggest better estimates for new phases based on similar phase complexity scores.

---

## Multi-Repository

### 191. Cross-Repository Milestone Sync
**Problem:** Multi-repo features (backend API + frontend change) require manual coordination across repositories, with no visibility into cross-repo dependencies.
**Solution:** Coordinate a milestone that spans multiple repositories — define phase dependencies across repos in a shared `.planning/CROSS-REPO.md` file. A `grd-tools cross-repo status` command queries each linked repo's GRD state and surfaces a unified dependency view. Block execution in repo B if a required phase in repo A hasn't completed. Sync via GitHub Actions or a shared webhook endpoint.

---

## Roadmap Management

### 192. Natural Language Roadmap Modification
**Problem:** Roadmap editing requires knowing exact CLI syntax — natural language lowers the barrier for roadmap maintenance.
**Solution:** Accept conversational roadmap edits: 'move phase 15 before phase 12', 'split phase 8 into two phases', 'merge phases 4 and 5', 'what phases depend on phase 6?' GRD translates these to safe grd-tools operations, shows a diff preview with the proposed ROADMAP.md changes, and asks for confirmation before applying. Implemented as a Claude-powered `/grd:roadmap edit` command that calls grd-tools operations under the hood.

---

## Planning & Validation

### 193. Interactive Assumption Validation Before Planning
**Problem:** Phase plans often assume libraries are available, previous phases completed, or certain data formats exist. These assumptions fail silently during execution.
**Solution:** Before generating a phase plan, interactively surface and validate all assumptions the planner is making: 'This plan assumes library X is installed — is it?', 'This plan assumes Phase 5 completed — it's blocked. Should I adapt?' Expands on `/grd:list-phase-assumptions` into a blocking validation dialog that runs before plan generation and records validated assumptions in the plan's frontmatter.

### 194. Promote Captured Todos into Full Phases
**Problem:** Todos sit in `.planning/milestones/*/todos/pending/` indefinitely because there's no easy path from 'captured idea' to 'actual roadmap phase'.
**Solution:** When a todo captures enough detail, promote it to a full roadmap phase with one command: `/grd:check-todos promote 3` — GRD generates a phase stub from the todo's description, links it to the right milestone, asks for placement in the roadmap, and archives the todo as completed. Creates the phase directory, adds the phase to ROADMAP.md, and optionally runs `/grd:discuss-phase` to clarify the goal.

---

## Agent Configuration

### 195. Agent Team Configuration Presets
**Problem:** Switching between 'quick iteration' and 'rigorous research' modes requires remembering and reconfiguring multiple settings: model profile, ceremony level, parallel limits, and agent selection.
**Solution:** Save and recall named agent team configurations: `grd-tools config save-preset fast-prototype` captures the current model profile, ceremony level, parallelization, and team settings. `grd-tools config use-preset research-heavy` restores them. Presets stored in `.planning/config.json` under `presets:` and listed by `/grd:settings presets`. Lets users switch modes instantly without reconfiguring each setting individually.

---

## Knowledge Graph

### 196. Planning Knowledge Graph Explorer
**Problem:** Institutional knowledge about 'what requirements drove phase 8' or 'which papers are referenced in the current milestone' is buried in files with no unified query interface.
**Solution:** Build and expose a queryable knowledge graph connecting: phases → papers → decisions → requirements → artifacts → metrics. Query it conversationally: 'what requirements drove phase 8?', 'which papers are referenced in the current milestone?', 'what artifacts does phase 15 depend on?' Exposed via `grd-tools graph query "<natural language>"` and as MCP tool `grd_graph_query`.

---

## Issue Tracker Integration

### 197. GitHub Issue → Phase Import
**Problem:** The workflow of 'issue is filed → plan it in GRD' requires manual copy-paste of issue description, acceptance criteria, and labels into phase files.
**Solution:** Convert a GitHub Issue (or Jira ticket) into a GRD phase with one command: `/grd:add-phase --from-issue 247`. GRD reads the issue description, acceptance criteria, and labels to populate the phase goal, success criteria, and type automatically. Links back to the issue in the phase frontmatter and optionally creates a tracker mapping entry.

---

## Project Health

### 198. Milestone Health Audit Report
**Problem:** Health problems — phases with no plans, plans with no summaries, deferred validations never collected — are only visible if you know to look.
**Solution:** A comprehensive audit of a milestone's health: phases with no plans, plans with no summaries, deferred validations never collected, requirements with no phase coverage, eval targets never measured. `/grd:progress health --full` generates a prioritized action list with severity levels (critical/warning/info). Run automatically before milestone completion as a gate check.

---

## Duplicate Detection

### 199. Semantic Phase Duplicate Detection
**Problem:** Researchers re-do work from previous milestones without realizing it, wasting time on problems already solved.
**Solution:** When adding or planning a new phase, check semantically whether a similar phase already exists or was completed in a previous milestone. Alert: 'Phase 42 looks similar to completed Phase 23 (similarity: 87%) — should you reference that work instead?' Uses TF-IDF or embedding similarity on phase descriptions and goals. Surface the alert in `/grd:plan-phase` output with a link to the similar phase's SUMMARY.md.

---

## Autopilot Enhancements

### 200. Autopilot Completion Notifications (Multi-Channel)
**Problem:** Users run `/grd:autopilot` and walk away — without notifications they have to poll manually to know if a long-running session completed or failed.
**Solution:** Push a notification when a long-running autopilot or autonomous evolve session completes (or fails). Integrations: macOS/Linux desktop notification (via `osascript` or `notify-send`), Slack webhook, email (SMTP), or Discord webhook. Configure under `notifications:` in `.planning/config.json`. The notification includes pass/fail status, phases completed, and a link to the latest SUMMARY.md. Builds on the existing Phase Completion Notifications (#174) with richer payload and multi-channel support.

---

## Miscellaneous Improvements (Batch 3)

### 201. Cross-Project Research Library
**Problem:** Teams working on related projects repeatedly survey the same papers and re-discover the same findings from scratch, with no shared institutional memory across projects.
**Solution:** A shared knowledge base at `~/.grd/library/` that indexes LANDSCAPE.md, PAPERS.md, and deep-dive artifacts across all GRD projects on the user's machine. When starting a new survey or phase, GRD searches this library first and surfaces relevant prior findings. Solves the pain of re-researching the same papers across related projects and lets teams accumulate institutional knowledge over time.

---

### 202. Research-to-Code Traceability Links
**Problem:** Months after implementation, engineers can't tell why a specific algorithm was chosen, which paper motivated it, or what alternatives were considered.
**Solution:** Embed source annotations in generated code (as comments or a sidecar JSON file) that link specific implementation decisions to the paper section or RESEARCH.md passage that motivated them. A `/grd:trace` command surfaces 'why was this written this way?' for any file. Solves the critical pain of understanding months-later why a particular algorithm was chosen.

---

### 203. Phase Template Marketplace
**Problem:** Users face blank-canvas paralysis when starting a new phase, unsure what structure to use for common R&D workflows.
**Solution:** A curated library of pre-built phase templates for common R&D workflows: 'Fine-tune a language model', 'Add RAG to an existing system', 'Benchmark a new algorithm against baselines', 'Migrate a monolith to microservices'. Each template includes pre-filled RESEARCH.md stubs, suggested eval metrics, and known risks. Removes the blank-canvas paralysis when starting a new phase.

---

### 204. Natural Language Project Query
**Problem:** Getting a status picture of a project requires navigating dozens of markdown files — blockers in STATE.md, metrics in EVAL.md, decisions in SUMMARY files — with no unified query interface.
**Solution:** A `/grd:ask` command that lets users query their entire project in plain English: 'Which phases are blocked and why?', 'What decisions have we deferred?', 'Summarize progress since last week', 'Which metrics are below target?'. Backed by a RAG index over all .planning/ artifacts. Solves the pain of navigating dozens of markdown files to get a status picture.

---

### 205. Hypothesis Tracking & Validation
**Problem:** Research teams state hypotheses informally in chat or documents, then lose track of whether they were ever validated or refuted.
**Solution:** A formal system for stating, tracking, and resolving research hypotheses: 'We hypothesize that adding contrastive loss will improve accuracy by 5%'. Hypotheses are first-class objects in STATE.md with status (open/confirmed/rejected/superseded) and linked to the eval results that settled them. Builds an institutional record of what the team tried and learned.

---

### 206. AI API Cost Tracking Per Phase
**Problem:** Teams get surprise bills without knowing which phase or agent caused the expense, with no per-phase cost visibility.
**Solution:** Track token usage and estimated API cost for every agent invocation within a phase, rolled up to milestone and project totals. Show cost breakdowns in `/grd:progress` and warn when a phase is trending over a user-defined budget. Solves the pain of getting a surprise bill without knowing which phase or agent caused it.

---

### 207. Daily Standup Generator
**Problem:** Writing manual standup updates requires recalling what happened yesterday, which decisions were made, and what blockers appeared — cognitive overhead that GRD already tracks.
**Solution:** A `/grd:standup` command that reads the last 24 hours of phase activity, decisions, and blockers and generates a human-readable standup summary: 'Yesterday: completed plan 3 of phase 12. Today: starting plan 4. Blockers: waiting on dataset access.' Pipe it to Slack, email, or a shared doc. Eliminates the cognitive overhead of writing manual status updates.

---

### 208. Papers with Code Benchmark Integration
**Problem:** Users manually copy-paste SOTA benchmark scores from Papers with Code into EVAL.md, a tedious and error-prone process.
**Solution:** When running `/grd:survey` or `/grd:assess-baseline`, automatically query the Papers with Code API to fetch SOTA leaderboard scores for the relevant task. Inject these as baseline targets into EVAL.md so the team always knows where they stand relative to the field. Eliminates the manual copy-paste of benchmark tables from external sites.

---

### 209. Interactive Phase Dependency Graph
**Problem:** Complex dependency chains across 20+ phases in ROADMAP.md are impossible to reason about in text — bottlenecks and parallel opportunities are invisible.
**Solution:** Generate an SVG/Mermaid dependency graph of all phases showing the critical path, blocked phases, and parallel groups. Embed it in a generated HTML file that updates on each `/grd:progress` run. Solves the pain of mentally modeling complex dependency chains across 20+ phases in a text-only ROADMAP.md.

---

### 210. Research Debt Register
**Problem:** Deferred research decisions — papers not yet read, feasibility questions punted, evaluation corners cut — silently accumulate until they cause integration failures.
**Solution:** A structured ledger of deferred research decisions: papers not yet read, feasibility questions punted, evaluation corners cut. Each debt item has an estimated impact score and a suggested payoff phase. Surface this in `/grd:progress` health view. Prevents R&D projects from silently accumulating risky unknowns.

---

### 211. Team Notification Integration (Slack / Discord)
**Problem:** Teams using GRD collaboratively have no ambient awareness of project state without manually checking planning files.
**Solution:** Post phase completions, milestone achievements, blocker additions, and verification failures to a configured Slack or Discord webhook. Include a summary card with key metrics. Turns GRD events into shared team moments and gives teams ambient project awareness without manual polling.

---

### 212. CI/CD Phase Triggers
**Problem:** Teams want lightweight GRD phases (eval-report, verify-phase) to run automatically as part of their CI pipeline, but there's no integration path.
**Solution:** A GitHub Actions workflow template that triggers GRD phase execution on events like PR merge, tag push, or a scheduled cron. The workflow calls the GRD MCP server headlessly, runs a phase, and posts results as PR comments. Enables teams to run lightweight GRD phases (eval-report, verify-phase) automatically as part of their existing CI pipeline.

---

### 213. Phase Experiment Replay
**Problem:** R&D teams need to ablate variables — 'what would phase 5 have produced with a different model profile?' — but there's no structured replay mechanism.
**Solution:** Re-run any completed phase with different parameters (different model profile, different ceremony level, different research context) and compare the outputs side-by-side. Store replay results as versioned SUMMARY variants. Solves the core R&D need to ablate variables: 'what would phase 5 have produced if we'd used the quality model profile?'

---

### 214. Automated Milestone Retrospective
**Problem:** Milestone completion is treated as an archive step, not a learning opportunity — teams miss the chance to extract systematic lessons.
**Solution:** When `/grd:complete-milestone` runs, generate a comprehensive retrospective document: what we planned vs. shipped, which phases ran over time, which hypotheses were confirmed/rejected, cost breakdown, and three auto-surfaced 'lessons learned' based on recurring patterns in SUMMARY files. Turns milestone completion into a learning artifact, not just an archive step.

---

### 215. Multi-Model Phase Output Comparison
**Problem:** Teams guess which model tier (Opus vs. Sonnet) to use for a given phase type without data — there's no structured way to compare outputs.
**Solution:** Run the same phase plan with two different AI models (e.g., Opus vs. Sonnet) in parallel worktrees and produce a structured diff of their outputs: code quality, test pass rates, eval metrics, token cost. Helps teams make data-driven model selection decisions rather than guessing which tier to use for a given phase type.

---

### 216. Jupyter Notebook Export
**Problem:** Data science teams cannot share GRD phase outputs with stakeholders who don't use Claude Code — the markdown format doesn't bridge the gap to notebook-centric workflows.
**Solution:** Export any phase's research and results as a self-contained Jupyter notebook: RESEARCH.md becomes markdown cells, code artifacts become code cells, eval metrics become visualization cells. Lets data science teams share GRD phase outputs with stakeholders who don't use Claude Code, bridging the tool gap between researchers and reviewers.

---

### 217. AI Phase Risk Scorer
**Problem:** Teams commit compute to phases without understanding the risk profile — unresolved blockers, thin research, and many external dependencies are invisible before execution.
**Solution:** Before executing a phase, run a lightweight risk analysis: how many external dependencies does this phase add? Does it modify critical paths? Are there unresolved blockers in prior phases? Is the research coverage thin? Output a risk score (low/medium/high) with specific callouts. Lets teams make informed go/no-go decisions before committing compute.

---

### 218. Metric Drift Alerts
**Problem:** Regressions in key metrics compound across phases and are expensive to root-cause at integration time when the source is distant.
**Solution:** After each phase execution, compare key metrics against the BASELINE.md values and alert when any metric regresses beyond a configurable threshold. Send alerts via the notification integration or surface them prominently in `/grd:progress` health. Catches regressions early instead of discovering them at integration phase when they're expensive to fix.

---

### 219. Contextual Paper Recommender
**Problem:** Researchers manually chase citation chains to find follow-up work, spending hours on what could be automated with a simple API query.
**Solution:** When writing a RESEARCH.md or running `/grd:survey`, GRD queries Semantic Scholar or arXiv to recommend papers based on the phase goal text and existing LANDSCAPE.md entries. Surfaces 'papers that cite your cited papers' to find follow-up work. Reduces the time researchers spend manually chasing citation chains.

---

### 220. Phase Handoff Context Packet
**Problem:** When work switches hands or resumes after a break, reconstructing context from scattered planning files takes 30-60 minutes of archaeology.
**Solution:** A `/grd:handoff <N>` command that generates a concise briefing document for handing a phase to another team member or resuming after a break: current status, key decisions made, open questions, the three most important files to read, and suggested next action. Solves the expensive context-reconstruction problem when work switches hands.

---

### 221. Natural Language Roadmap Editor
**Problem:** Restructuring a roadmap mid-project requires memorizing CLI commands and manually verifying ROADMAP.md diffs — a high-friction operation that discourages adaptive planning.
**Solution:** Accept roadmap mutations in plain English via `/grd:roadmap edit`: 'move phase 7 after phase 9', 'split phase 4 into evaluation and implementation parts', 'add a phase for documentation before the final integration'. GRD translates to the correct grd-tools calls and confirms the resulting ROADMAP.md diff before applying. Lowers the barrier to roadmap restructuring mid-project.

---

### 222. Requirement Coverage Heatmap
**Problem:** Structural planning problems — orphaned requirements, unanchored phases, over-fragmented requirements — are invisible until execution is underway.
**Solution:** Visualize which requirements are covered by which phases in a heatmap grid. Highlight requirements with no owning phase (orphaned), phases with no requirements (unanchored), and requirements touched by too many phases (fragmented). Surfaces structural planning problems before execution begins.

---

### 223. Semantic Changelog from Phase Summaries
**Problem:** Writing changelogs manually at release time is tedious — GRD already has all structured data needed to generate one automatically.
**Solution:** Generate a CHANGELOG.md entry from SUMMARY.md files when completing a milestone, extracting user-facing changes, performance improvements, and breaking changes. Apply semantic versioning rules automatically based on the nature of the changes. Eliminates the manual changelog-writing bottleneck at release time.

---

### 224. Research Knowledge Graph
**Problem:** A flat folder of markdown files doesn't reveal the conceptual relationships between papers, decisions, hypotheses, and implementation choices.
**Solution:** Build and maintain a persistent knowledge graph from all papers, findings, decisions, and hypotheses across the project's lifetime. Nodes are concepts/papers/decisions; edges are 'cites', 'supports', 'contradicts', 'led-to'. Queryable via `/grd:ask`. Turns a flat folder of markdown files into a navigable intellectual map of the project.

---

### 225. Parallel Research Thread Merge
**Problem:** Users must run surveys sequentially on different subtopics, even though these are entirely independent — parallelism is left on the table.
**Solution:** Launch multiple `/grd:survey` sub-agents on different research subtopics simultaneously, then automatically merge their LANDSCAPE.md outputs with conflict detection. Currently users must run surveys sequentially. Parallelizing research could cut landscape survey time by 60-80% on complex, multi-faceted topics.

---

### 226. Data-Driven Phase Duration Estimator
**Problem:** The **Duration:** field in ROADMAP.md is a gut-feel estimate with no calibration, leading to chronic underestimation and schedule overruns.
**Solution:** After accumulating historical execution data, train a lightweight estimator that predicts phase duration based on features: plan count, ceremony level, phase type, model profile, dependency count. Show confidence intervals alongside estimates in ROADMAP.md. Turns the gut-feel **Duration:** field into a data-backed forecast.

---

### 227. Failure Pattern Recognition & Mitigation
**Problem:** Teams hit the same failure patterns repeatedly — verification failures, timeout blockers, test failures — without a systematic way to surface past mitigations.
**Solution:** When a phase verification fails or a blocker is recorded, GRD searches a local pattern library built from the project's own history for similar past failures and surfaces the mitigation that worked. Over time, builds a project-specific failure playbook. Turns repeated mistakes into a self-correcting institutional memory.

---

### 228. Figma Design-to-Phase Scaffolder
**Problem:** The gap between design handoff and development planning is manual: engineers read Figma exports and manually translate them into phase goals, component lists, and acceptance criteria.
**Solution:** Accept a Figma file URL or a folder of exported design assets and generate a GRD phase plan for implementing the UI: component list, interaction requirements, acceptance criteria, and suggested eval metrics (visual regression, accessibility score). Bridges the gap between design handoff and development planning.

---

### 229. OpenAPI Spec to Phase Plan Generator
**Problem:** Converting an OpenAPI/Swagger spec into a development plan requires manually reading the spec and translating endpoints, data models, and auth requirements into phase tasks.
**Solution:** Given an OpenAPI/Swagger spec, generate a structured GRD phase plan for implementing the API: endpoint list, data model requirements, authentication requirements, suggested test cases, and a baseline performance eval target. Turns a spec file into an immediately executable phase in seconds.

---

### 230. Searchable Decision Log
**Problem:** The 'I know we decided something about auth 3 months ago but I can't find it' problem — decisions are scattered across STATE.md, SUMMARY files, and CONTEXT files with no unified search.
**Solution:** Index all decisions recorded across STATE.md, SUMMARY files, and CONTEXT files into a full-text searchable log accessible via `/grd:decisions search <query>`. Filter by phase, date range, or decision type. Solves the painful 'I know we decided something about auth 3 months ago but I can't find it' problem.

---

### 231. Live Progress Web Dashboard
**Problem:** Stakeholders want read-only visibility into ongoing execution without needing Claude Code access — there's no 'can I watch?' path today.
**Solution:** A locally-served web UI (accessible at localhost:PORT) that shows real-time phase execution progress, live log streaming, and the dependency graph. Updates via SSE without page refresh. Gives stakeholders a read-only view of ongoing execution without needing Claude Code access, solving the 'can I watch?' problem from non-technical collaborators.

---

### 232. Project Pattern Library Extractor
**Problem:** Recurring implementation patterns — how the team handles errors, structures modules, names things — exist implicitly in the codebase but are never extracted as reusable standards.
**Solution:** After multiple phases complete, analyze SUMMARY files and committed code to extract recurring implementation patterns: how the team handles errors, structures modules, names things. Add these to `.planning/standards/` automatically. Builds a project-specific pattern library that future phases can reference in their research context.

---

### 233. Scope Creep Early Warning
**Problem:** Scope creep is caught at review time, not planning time — when it's expensive to undo. Plans quietly expand beyond the phase goal without triggering any alert.
**Solution:** During phase planning, compare the proposed plan set against the original phase goal using semantic similarity. If plans collectively address topics not in the original goal, flag specific out-of-scope items and suggest either a goal revision or splitting into two phases. Catches scope creep at planning time, not at review time.

---

### 234. Obsidian / Notion Knowledge Sync
**Problem:** Researchers who live in Obsidian or Notion have to context-switch to CLI to see GRD research artifacts — there's no bridge to their primary knowledge management system.
**Solution:** Export GRD research artifacts (LANDSCAPE.md, PAPERS.md, deep-dives, decision log) to an Obsidian vault or Notion database with proper backlinks and tags. Run as a post-phase hook. Lets researchers who live in Obsidian/Notion keep their GRD project knowledge in their primary knowledge management system.

---

### 235. Milestone-over-Milestone Analytics
**Problem:** Teams have no data-backed answer to 'are we getting better at this?' — there's no cross-milestone trend view.
**Solution:** A `/grd:analytics` command that compares key metrics across consecutive milestones: average phase duration, cost per phase, verification pass rate, metric improvement rate, scope accuracy. Show trends as sparklines in the terminal. Helps teams answer 'are we getting better at this?' with data instead of intuition.

---

### 236. Real-Time Research Feed Subscription
**Problem:** Relevant papers published mid-project are missed because manual monitoring of arXiv feeds is too slow and inconsistent.
**Solution:** Subscribe to arXiv categories, author feeds, or keyword searches and automatically surface new papers relevant to open phases as a daily digest in `/grd:progress`. When a directly relevant paper is detected, create a draft deep-dive stub and notify via the notification integration. Keeps the research context current without manual monitoring.

---

### 237. Auto-Calibrated Eval Targets
**Problem:** Eval targets in EVAL.md are set arbitrarily — either trivially easy or physically impossible — because there's no systematic way to calibrate against baseline and SOTA.
**Solution:** When creating EVAL.md, analyze the current BASELINE.md and LANDSCAPE.md SOTA scores, then automatically suggest realistic but ambitious eval targets with confidence ranges. Show where the project currently sits on the performance curve. Replaces the common anti-pattern of setting arbitrary targets that are either too easy or physically impossible.

---

## Miscellaneous Improvements (Batch 4)

### 238. Research Knowledge Sharing Across Projects
**Problem:** Teams repeatedly re-survey the same literature every time they start a related project, wasting days of research effort that was already done elsewhere.
**Solution:** A registry where teams can publish and consume LANDSCAPE.md, PAPERS.md, and deep-dive artifacts from other GRD projects. When starting a new project in a related domain, GRD suggests existing research artifacts to import. Solves the pain of re-surveying the same literature every time a team starts a related project.

---

### 239. Phase Cost Estimator Before Execution
**Problem:** Engineers are surprised by high token costs when a multi-plan phase unexpectedly consumes $40+ in a single run with no prior warning.
**Solution:** Before running execute-phase, analyze the plan files and estimate token usage and dollar cost based on agent count, plan complexity, and model profile. Show a breakdown by agent (researcher, planner, executor, reviewer). Prevents sticker shock when a 10-plan phase costs $40 unexpectedly.

---

### 240. Natural Language to Roadmap Generation
**Problem:** Starting a new R&D project from scratch requires manually creating milestone structure, phases, and eval criteria — the blank-slate problem slows teams down.
**Solution:** Accept a plain-English product description (e.g. 'Build a RAG pipeline with hybrid retrieval and reranking, targeting 85% NDCG on MS-MARCO') and generate a full milestone with phased roadmap, success criteria, and evaluation metrics automatically. Eliminates the blank-slate problem when starting new R&D projects.

---

### 241. Reusable Phase Templates Library
**Problem:** Every phase starts from scratch — users spend hours writing boilerplate for common R&D patterns that have the same structure every time.
**Solution:** A library of pre-built phase templates for common R&D patterns (e.g. 'Benchmark Baseline', 'Data Pipeline', 'Model Fine-tuning', 'Ablation Study', 'Human Eval Setup'). Users run /grd:add-phase --template ablation-study and get a pre-structured phase with correct verification levels, success criteria patterns, and eval plans. Saves hours of boilerplate writing.

---

### 242. A/B Phase Execution for Competing Approaches
**Problem:** R&D teams often need to compare two implementation approaches but can only run one at a time, serializing experiments and losing days waiting for results.
**Solution:** Run two alternative implementations of the same phase goal in parallel worktrees, then compare eval metrics side-by-side and promote the winner. Solves the common R&D decision: 'should we use approach A or B?' without serializing the experiment.

---

### 243. Auto-Suggest Papers Based on Phase Goals
**Problem:** The gap between 'I know what I want to build' and 'I know what prior work to study' requires researchers to manually search arXiv and Papers With Code before every phase.
**Solution:** When planning a phase, GRD searches arXiv, Semantic Scholar, and Papers With Code for papers relevant to the phase goal and success criteria, then surfaces the top 5 with a one-line relevance explanation. Closes the gap between 'I know what I want to build' and 'I know what prior work to study'.

---

### 244. Visual Paper Citation and Influence Graph
**Problem:** Months after implementation, teams cannot easily answer 'why did we implement it this way?' because the connection between papers and code decisions is buried in text files.
**Solution:** Generate an interactive visual graph showing how papers referenced in PAPERS.md influenced specific phases and implementation decisions. Nodes are papers and phases; edges show 'used-in' relationships extracted from RESEARCH.md and PLAN.md files. Makes it easy to answer 'why did we implement it this way?' months later.

---

### 245. Phase Rollback and Undo
**Problem:** Fear of irreversible mistakes discourages bold experimentation — engineers hesitate to run phases that might break things because there's no clean undo path.
**Solution:** Snapshot project state (git commit, planning artifacts, STATE.md) before each phase execution. Allow one-command rollback to any phase boundary if an approach fails or breaks things. Removes the anxiety of 'what if this phase makes things worse?' and encourages bolder experimentation.

---

### 246. Stakeholder Progress Digests
**Problem:** R&D engineers waste hours every week writing status updates for non-technical stakeholders who need visibility without needing Claude Code access.
**Solution:** Auto-generate and send weekly progress digest emails or Slack messages to stakeholders with phase completions, eval metric deltas, blockers, and next planned work — formatted for non-technical audiences. Eliminates the manual 'write a status update' tax that R&D engineers dread.

---

### 247. Metric Performance Timeline Dashboard
**Problem:** Key eval metrics (BLEU, F1, PSNR, latency, etc.) are buried in individual SUMMARY.md files with no visual trend view, making regressions hard to spot.
**Solution:** A time-series chart showing how key eval metrics evolved across all phases. Annotate the chart with phase names so you can see 'phase 12 caused the ROUGE regression'. Currently buried in SUMMARY.md files — making it visual unlocks trend analysis.

---

### 248. Pre-Execution Risk Assessment
**Problem:** Risk signals in plans — circular dependencies, missing baselines, untested assumptions — are only discovered mid-execution when they're expensive to fix.
**Solution:** Before running execute-phase, analyze the plan for risk signals: circular dependencies, missing baselines, untested assumptions, plans that mutate shared state, or phases that lack deferred validation. Surface a risk score with specific warnings. Prevents 'we should have thought about this before running 6 hours of execution'.

---

### 249. Automated Sprint Retrospective Generator
**Problem:** Writing a milestone retrospective takes 2-3 hours of manual synthesis across SUMMARY files, eval results, and blockers — work that no one enjoys but everyone values.
**Solution:** At milestone completion, synthesize all SUMMARY.md files, eval results, and blockers into a structured retrospective document: what worked, what didn't, time vs estimate accuracy, deferred items, and lessons learned. Saves 2-3 hours of retrospective prep and surfaces patterns humans miss.

---

### 250. Cross-Model Evaluation Runner
**Problem:** Comparing LLM backends on a custom task requires manual orchestration — run model A, run model B, collect results, build comparison table — repeating error-prone steps each time.
**Solution:** Run the same eval harness against multiple LLM backends (Claude, GPT-4o, Gemini) and produce a comparison table. Useful when the research question is 'which model performs best on our task?'. Currently requires manual orchestration; GRD could automate the fan-out and aggregation.

---

### 251. Intelligent Next-Phase Suggestions
**Problem:** After completing a phase, engineers must manually assess what to do next — reading eval results, checking deferred validations, and scanning blockers to decide priority.
**Solution:** After completing a phase, analyze eval results, deferred validations, and blockers to suggest the most valuable next phases to add or prioritize. If ROUGE dropped 3 points, suggest a regression investigation phase. If a deferred validation is now unblocked, surface it. Turns GRD from a task tracker into a research advisor.

---

### 252. Research Knowledge Base Export
**Problem:** When publishing a technical report or onboarding a new team member, research artifacts are scattered across dozens of markdown files with no unified export path.
**Solution:** Export all .planning/ research artifacts (LANDSCAPE.md, PAPERS.md, deep-dives, decisions, eval results) into a single well-structured document or Notion/Confluence page. Useful when publishing a technical report, onboarding a new team member, or archiving a completed project.

---

### 253. Phase Complexity and Duration Estimator
**Problem:** Phase duration estimates in ROADMAP.md are guesses that rarely match reality, and teams have no data-backed way to calibrate their planning.
**Solution:** Use historical execution data from all SUMMARY.md files to train a simple estimator: given phase type, plan count, and ceremony level, predict actual duration vs the estimate in ROADMAP.md. Surface accuracy scores over time so teams can calibrate their planning estimates.

---

### 254. Multi-Developer Collaboration Mode
**Problem:** GRD is single-developer today — large projects with multiple engineers have no coordination mechanism, leading to conflicting STATE.md updates and duplicate work.
**Solution:** Allow multiple developers to claim and execute different phases simultaneously, with conflict detection on shared files and a merge protocol for STATE.md updates. Currently GRD is single-developer; adding team mode unblocks parallel R&D sprints on large projects.

---

### 255. Paper Implementation Fidelity Tracker
**Problem:** Teams drift from the original paper during implementation without realizing it, then can't answer 'did we actually implement what the paper proposed?'
**Solution:** For each paper referenced in a phase, track which specific claims and techniques from the paper were actually implemented vs deferred vs skipped. Surface a 'fidelity score' per paper. Helps answer 'did we actually implement what the paper proposed or did we drift?'

---

### 256. Natural Language Project History Query
**Problem:** Answering questions like 'when did we first achieve >80% F1?' or 'what did we decide about the retrieval architecture?' requires archaeology through dozens of planning files.
**Solution:** Ask questions like 'when did we first achieve >80% F1?', 'which phase introduced the memory leak?', or 'what did we decide about the retrieval architecture?' and get answers synthesized from SUMMARY.md, DECISIONS, and eval history. Eliminates archaeology through planning artifacts.

---

### 257. Phase Dependency and Blocker Graph
**Problem:** Project risk is invisible — there's no visual way to see which phases are blocked, what they're waiting on, and whether a failure cascades to dependent phases.
**Solution:** Visualize the full dependency graph of all phases including which are blocked, what they're waiting on, and the critical path to milestone completion. Alert when a phase dependency has failed or been deprioritized, causing a cascade. Makes project risk visible at a glance.

---

### 258. Eval Harness Code Generator
**Problem:** Writing eval harness code for each new metric/dataset combination is tedious boilerplate that delays getting real numbers by days.
**Solution:** From an EVAL.md file specifying metrics and datasets, automatically generate boilerplate eval harness code (Python/TypeScript) that loads the model, runs inference, and computes the specified metrics. Eliminates the 'now write the eval script' step that often delays getting real numbers.

---

### 259. Research Quality Score for Phases
**Problem:** Phases launch without adequate research groundwork — missing baselines, no hypothesis, no eval plan — because there's no quality gate before planning begins.
**Solution:** Score each phase's research artifacts on dimensions like: papers cited (count and recency), hypothesis clearly stated, baselines defined before coding, eval plan exists before execution, claims traceable to evidence. A low score triggers a warning before planning begins. Enforces research discipline without being prescriptive.

---

### 260. Real-Time Phase Notifications via Webhooks
**Problem:** Team members have no visibility into phase completion, eval failures, or blockers without manually polling the dashboard or being in the same terminal session.
**Solution:** Send Slack or Discord notifications when phases start, complete, fail eval gates, or surface blockers — with a summary of what happened and a link to the relevant artifact. Keeps the whole team informed without requiring anyone to poll the dashboard.

---

### 261. Weights & Biases / MLflow Experiment Sync
**Problem:** GRD tracks phases and eval metrics separately from ML experiment trackers, creating a split between 'why we tried this' (GRD plan) and 'what happened' (W&B run).
**Solution:** Automatically log eval metrics from GRD EVAL.md results to W&B or MLflow runs, with phase name and git commit as run metadata. Bidirectional: also pull W&B run metrics back into GRD's metric timeline. Bridges the gap between GRD's workflow tracking and the ML experiment tracking ecosystem teams already use.

---

### 262. Automatic Phase Changelog and Diff Summary
**Problem:** Manual changelog writing is tedious and inconsistent — important decisions and metric changes get lost because no one remembers to update CHANGELOG.md after a phase.
**Solution:** After each phase completes, generate a human-readable changelog entry summarizing: what code changed (from git diff), what metrics moved (from eval), what decisions were made, and what was deferred. Auto-append to CHANGELOG.md. Eliminates manual changelog writing and ensures nothing gets lost.

---

### 263. Milestone Health Audit with Gap Analysis
**Problem:** Teams think they're done with a milestone but deferred validations were never collected, success criteria lack measurable metrics, and phases are missing verification reports.
**Solution:** On demand, run a comprehensive audit of the active milestone: deferred validations never collected, success criteria without measurable metrics, phases missing VERIFICATION.md, eval targets set but never measured. Output a prioritized gap list with suggested remediation phases. Prevents 'we thought we were done' surprises.

---

### 264. Interactive Conversation-Based Phase Scoping
**Problem:** The full agent stack repeatedly mis-scopes phases because scope, constraints, and assumptions were never captured before planning began.
**Solution:** Before plan-phase runs the full agent stack, a lightweight conversational pre-flight asks 3-5 targeted questions about scope, constraints, and assumptions — and captures answers directly into the phase context. Reduces the 're-plan because the agent assumed wrong scope' loop that wastes planning cycles.

---

### 265. Auto-Generate Tests from Verification Criteria
**Problem:** Verification criteria in VERIFICATION.md and EVAL.md exist as documentation but never become actual test code, leaving a gap between stated checks and executed coverage.
**Solution:** Parse VERIFICATION.md and EVAL.md sanity/proxy checks and automatically scaffold matching test stubs (Jest, pytest, etc.) with the assertion logic pre-filled from the criteria. Turns 'verification level 1 checks format output is valid JSON' into an actual test file. Bridges the gap between documentation and coverage.

---

### 266. Searchable Decision Audit Trail
**Problem:** Decisions recorded across STATE.md and SUMMARY.md files are scattered, unsearchable, and provide no way to trace contradictions or reversals over time.
**Solution:** Index all decisions recorded in STATE.md and SUMMARY.md files into a searchable timeline with filters by phase, topic, and outcome. Surface when a decision was later contradicted or reversed. Answers 'why did we decide X?' and 'have we changed our mind on Y?' without reading dozens of files.

---

### 267. Execution Budget and Time-Boxing Controls
**Problem:** Autonomous phase execution can consume unexpected resources — $50 in tokens or 6 hours of wall time — with no mechanism to pause or limit before the damage is done.
**Solution:** Set per-phase token and time budgets. GRD monitors usage during execute-phase and auto-pauses with a checkpoint when limits are approached, prompting the user to extend, stop, or continue with reduced scope. Prevents runaway autonomous executions from consuming unexpected resources.

---

## Miscellaneous Enhancements

### 268. Contextual Paper Recommendations
**Problem:** After spending time building something, researchers often discover too late that a directly relevant paper existed and could have saved significant effort or suggested a better approach.
**Solution:** After each phase execution, analyze the SUMMARY.md and suggest 3-5 arXiv papers that are directly relevant to what was built or the problems encountered. Uses the phase goal, metrics, and key decisions as signals. Solves the 'I didn't know this paper existed' problem that leads to reinventing approaches.

---

### 269. Formal Hypothesis Tracker
**Problem:** Researchers lose track of what they were actually trying to prove across multi-phase projects, leading to phases that drift from their original scientific intent.
**Solution:** Add a structured hypothesis workflow: state a hypothesis before a phase, define success criteria, then automatically link eval results back to confirm or refute it. Track hypothesis status (proposed/testing/confirmed/refuted) in STATE.md. Solves the problem where researchers lose track of what they were actually trying to prove.

---

### 270. Claude API Cost Per Phase
**Problem:** Teams running autonomous multi-phase workflows are surprised by large API invoices with no breakdown of which phases consumed the most budget.
**Solution:** Track estimated token usage and API cost per phase and milestone. Show cost breakdown in the dashboard and emit warnings when a phase is burning budget faster than expected. Solves the surprise invoice problem that plagues teams running autonomous multi-phase workflows.

---

### 271. Experiment Registry with Diff Views
**Problem:** After multiple experiment runs, researchers can't recall what was different about the run that worked — configs, seeds, dataset splits, and hyperparameters all blur together.
**Solution:** Track every experiment run with its config, metrics, and git commit hash in a structured EXPERIMENTS.md. Provide a /grd:compare-experiments command that renders a side-by-side table of any two experiment runs. Solves the 'what was different about that run that worked?' pain point.

---

### 272. Multi-Project Dashboard
**Problem:** Engineers managing multiple R&D threads must context-switch between directories to understand the state of each project, with no aggregate view.
**Solution:** A /grd:workspace command that scans a parent directory for all GRD projects and renders an aggregate dashboard: active milestones, phase completion rates, blocked projects, and recent activity. Solves the context-switching overhead for engineers managing multiple R&D threads.

---

### 273. Proactive Blocker Prediction
**Problem:** Teams hit unexpected blockers on day 3 of a phase that could have been predicted from the plan, codebase state, and historical failure patterns.
**Solution:** Before a phase starts, analyze its plan against the current codebase, existing blockers in STATE.md, and historical failure patterns to predict likely blockers. Output a risk score and specific warnings. Solves the 'we hit a wall on day 3' problem that derails sprint planning.

---

### 274. Slack / Discord Phase Notifications
**Problem:** Async teams running autonomous workflows have no visibility into phase completions, new blockers, or missed eval targets without manually checking planning artifacts.
**Solution:** Push notifications to a configured webhook when phases complete, when blockers are added, or when eval targets are missed. Include a summary of what happened and a link to the relevant planning artifact. Solves the async coordination problem on teams where the autonomous executor runs unattended.

---

### 275. Documentation Export to Confluence / Notion
**Problem:** After completing R&D work, researchers must manually convert planning artifacts into stakeholder-friendly documents — a tedious step that often gets skipped or delayed.
**Solution:** Export a milestone's planning artifacts as a structured document to Confluence or Notion: research findings, decisions, eval results, and final verification report. Solves the 'now write this up for stakeholders' step that researchers dread after completing R&D work.

---

### 276. Gradual Autonomy with Preference Learning
**Problem:** Users repeatedly approve the same low-risk confirmation prompts, adding friction without adding safety. Manual approval of routine actions wastes time.
**Solution:** Track which confirmation prompts users routinely approve vs reject across sessions. Surface a 'you always approve X, want to automate it?' suggestion after 5+ approvals. Progressively expand YOLO scope based on demonstrated trust. Solves the tedium of re-approving the same low-risk actions repeatedly.

---

### 277. Compute Budget Planning
**Problem:** Teams with fixed compute budgets (GPU hours, API credits) have no way to track estimated vs actual consumption across phases, leading to running out of credits mid-milestone.
**Solution:** Let users annotate phases with estimated GPU hours / API calls. Track actuals from eval runs. Show a milestone-level compute budget view: estimated vs actual, remaining budget, and projected overage. Solves the 'we ran out of credits halfway through' problem on teams with fixed compute budgets.

---

### 278. AI Peer Review for Research Plans
**Problem:** Research methodology flaws — confounders, weak baselines, missing ablations — are not caught until expensive execution reveals them, or worse, during external review.
**Solution:** A /grd:peer-review phase N command that spawns an adversarial agent to critique the phase's research methodology, flag confounders, question baselines, and suggest missing ablations — simulating a tough academic reviewer. Catches methodological flaws before expensive execution.

---

### 279. Changelog Auto-Writer
**Problem:** Writing changelogs after completing a milestone is tedious, often delayed, and results in sparse release notes that don't reflect the actual work done.
**Solution:** Generate a human-readable CHANGELOG entry for a completed milestone by synthesizing all phase SUMMARY.md files. Output user-facing language (not implementation jargon). Solves the 'writing changelogs is tedious and always delayed' problem that leads to sparse or missing release notes.

---

### 280. Phase Dependency Impact Analysis
**Problem:** When one phase slips or changes scope, teams have no automated way to understand which downstream phases are affected and by how much.
**Solution:** When a phase is delayed or its scope changes, automatically compute which downstream phases are affected, by how many days, and what their revised start dates would be. Show a cascading impact view. Solves the 'one slipped phase ruins the whole milestone' planning problem.

---

### 281. Phase-Level Team Assignment
**Problem:** Multi-person teams working on a milestone have no visibility into who owns which phase or plan, leading to coordination overhead and duplicate work.
**Solution:** Annotate phases and plans with assignees (GitHub usernames). When syncing to GitHub Issues or Jira, set issue assignees automatically. Show an assignment heatmap in the dashboard to surface overloaded team members. Solves the visibility gap on teams where multiple people contribute to a milestone.

---

### 282. R&D Knowledge Graph
**Problem:** Tracing the provenance of decisions ('which paper led to which implementation decision that drove which metric improvement?') is impossible without a structured graph connecting artifacts.
**Solution:** Build a graph linking papers → decisions → phases → metrics → outcomes. Export as a Mermaid diagram or interactive HTML. Answers 'which paper led to which implementation decision that drove which metric improvement?' Solves the provenance problem that makes R&D hard to explain to others.

---

### 283. Phase Failure Autopsy
**Problem:** When a phase ends with missed eval targets or unresolved blockers, teams are left guessing at root causes with no structured process for learning from failure.
**Solution:** When a phase ends with missed eval targets or unresolved blockers, run an autopsy agent that reads all artifacts and produces a structured root cause analysis: what was expected, what happened, most likely cause, and what to try next. Removes the guesswork from 'why did this phase not work?'

---

### 284. Effort Estimation Calibration
**Problem:** Software effort estimation is systematically wrong — teams consistently over or under-estimate by a predictable factor that they never measure or correct.
**Solution:** Track estimated vs actual duration for every completed phase. Surface a calibration multiplier ('your estimates run 1.4x short on implementation phases, 0.9x on research phases'). Use this to auto-adjust future estimates. Solves the universal problem of software effort estimation being systematically wrong.

---

### 285. Backend Capability Parity Report
**Problem:** Users switching between Claude Code and alternative backends (Codex, Gemini, OpenCode) have no way to know which GRD features are available or fall back gracefully.
**Solution:** A /grd:backend-parity command that tests which GRD features are available under the current backend (Codex, Gemini, OpenCode) vs Claude Code, and which fall back gracefully. Renders a feature support matrix. Solves the 'does this work on my setup?' confusion when users switch backends.

---

### 286. Research Gap Detector
**Problem:** Teams plan phases based on insufficient research — techniques referenced in the roadmap aren't covered in the survey, leading to planning with unknown unknowns.
**Solution:** After a survey, compare what LANDSCAPE.md covers against the phase goals in ROADMAP.md. Highlight phases that reference techniques not covered in the survey, flagging them as 'research gaps' that need a deep-dive before planning. Prevents planning phases with insufficient research grounding.

---

### 287. VS Code Extension for GRD
**Problem:** Developers constantly context-switch between their terminal (for GRD commands) and their editor (for code), losing flow when tracking research progress during implementation.
**Solution:** A VS Code extension that renders the ROADMAP.md as a visual kanban board, highlights files touched by the active phase, and provides a sidebar for the dashboard. Solves the context-switching overhead between the terminal and the editor when tracking research progress.
