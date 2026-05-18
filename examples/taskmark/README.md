# TaskMark — GRD Tutorial Project

> Learn GRD by improving a real (deliberately imperfect) CLI tool.

TaskMark is a simple markdown task manager with **intentional bugs and gaps**. You'll use GRD's multi-agent system to discover, plan, and fix these issues automatically — then watch the self-evolution loop find even more.

## Prerequisites

- **Node.js 18+** — `node --version`
- **Claude Code** — installed and working ([install guide](https://docs.anthropic.com/en/docs/claude-code))

## Step 0: Install GRD

Open Claude Code in any directory and run:

```
/install-plugin https://github.com/Get-Research-Done/grd
```

Verify it's installed:

```
/grd:help
```

You should see a list of GRD commands. If you see "unknown command", the plugin isn't installed correctly.

## Step 1: Start the Tutorial

```bash
cd examples/taskmark
./start-tutorial.sh
```

If you use a custom binary name or config directory (e.g., multiple Claude Code accounts):

```bash
./start-tutorial.sh --bin my-claude
./start-tutorial.sh --config ~/.claude-work
./start-tutorial.sh --bin my-claude --config ~/.claude-work
```

This launches Claude Code with an initial prompt that auto-starts the interactive tutorial. It will demo the bugs, then guide you step-by-step through GRD commands.

## Step 2: Explore TaskMark (try it, break it)

Run some commands to see TaskMark in action:

```bash
node bin/taskmark.js list
```

You should see 7 sample tasks with checkboxes.

```bash
node bin/taskmark.js add "My new task"
node bin/taskmark.js done 1
node bin/taskmark.js search "GRD"
```

Now trigger some bugs:

```bash
# Bug: adding with no text adds "undefined"
node bin/taskmark.js add

# Bug: invalid ID crashes with TypeError
node bin/taskmark.js done 999

# Bug: search is case-sensitive
node bin/taskmark.js search "grd"    # finds nothing
node bin/taskmark.js search "GRD"    # finds results

# Bug: delete tasks.md and try to list
mv tasks.md tasks.md.bak
node bin/taskmark.js list            # crashes with ENOENT
mv tasks.md.bak tasks.md
```

These are real problems. Now let's let GRD fix them.

---

## Choose Your Path

### Quick Path (5 minutes)

Jump straight to seeing GRD work. Best if you want a fast demo.

[Go to Quick Path](#quick-path)

### Deep Path (30 minutes)

Walk through GRD's full R&D workflow step by step. Best if you want to understand how the system operates.

[Go to Deep Path](#deep-path)

---

## Quick Path

### QP-1: Initialize GRD (30 seconds)

Even the quick path needs a project scaffold. In Claude Code, run:

```
/grd:init
```

GRD will ask what you're building. Answer something like: *"A markdown task manager CLI called TaskMark. I want to make it production-quality with tests, error handling, and good architecture. No research needed — pure engineering."*

When asked about research, select **Skip research** — TaskMark doesn't need a literature survey.

**What you should see:** A `.planning/` directory with `PROJECT.md`, `STATE.md`, `config.json`, and `ROADMAP.md`.

### QP-2: Run a Quick Task

```
/grd:quick "add input validation and error handling to the taskmark CLI"
```

**What happens:** GRD creates a mini-plan, dispatches an executor agent, makes changes with atomic commits, and verifies the result. You'll see it:

1. Analyze the codebase
2. Create a plan in `.planning/milestones/anonymous/quick/`
3. Execute the plan (edit files, add validation, commit)
4. Summarize what it did

**What you should see:** After it completes, run `node bin/taskmark.js add` — it should now show an error message instead of adding "undefined". Run `node bin/taskmark.js done 999` — it should show a helpful error instead of crashing.

### QP-3: Run the Self-Evolution Loop

```
/grd:evolve
```

**What happens:** GRD scans the entire codebase looking for improvements across multiple dimensions: missing tests, code quality issues, documentation gaps, architecture problems, and feature ideas.

**What you should see:** A list of discovered improvements grouped by category. GRD will report items like:
- Missing test coverage
- Functions without JSDoc
- Monolithic file structure
- Missing `--help` flag
- No CI configuration

These discoveries are saved as todos in `.planning/milestones/*/todos/pending/`.

### QP-4: Review What Changed

```bash
git log --oneline -10
git diff HEAD~3
```

Look at the commits GRD made. Each one is atomic and focused on a specific improvement.

**You're done with the Quick Path!** You've seen GRD plan, execute, and discover issues autonomously. To understand the full workflow, continue with the [Deep Path](#deep-path-1).

---

## Deep Path

### DP-1: Initialize a GRD Project

```
/grd:init
```

GRD will ask open-ended questions about the project through an interactive dialogue. Here's how to respond:

- **"What do you want to build?"** — "A markdown task manager CLI called TaskMark. I want to make it production-quality with tests, error handling, and good architecture."
- **Research question** — When asked about researching the domain ecosystem, select **Skip research**. TaskMark is a pure engineering project, not an R&D one.
- **Follow-up questions** — GRD may ask about scope, priorities, or constraints. Keep answers focused on code quality improvements.

**What you should see:** A new `.planning/` directory appears with several files:

```
.planning/
├── PROJECT.md          # Your project vision and objectives
├── STATE.md            # Living memory (position, decisions, blockers)
├── ROADMAP.md          # Phase structure with verification levels
├── REQUIREMENTS.md     # Requirements with traceability
├── config.json         # GRD configuration and settings
└── milestones/         # Milestone-scoped work directory
```

The exact files may vary depending on your answers. The key ones are `PROJECT.md` (your vision), `ROADMAP.md` (what to build), and `STATE.md` (where you are).

**Checkpoint:** Run `cat .planning/PROJECT.md` — it should describe TaskMark and your goals.

### DP-2: Assess the Baseline

```
/grd:assess-baseline
```

**What happens:** GRD analyzes the current state of the codebase — test coverage (0%), code quality issues, architecture, documentation gaps. It records everything in BASELINE.md.

**What you should see:** `.planning/BASELINE.md` with metrics like:

- Test coverage: 0%
- Functions with JSDoc: 0/6
- Error handling: none
- Input validation: none

This becomes the "before" snapshot that GRD will measure improvements against.

**Checkpoint:** Run `cat .planning/BASELINE.md` to see the baseline metrics.

### DP-3: Create a Product Plan

```
/grd:product-plan
```

**What happens:** GRD's product-owner agent analyzes the baseline findings and creates a phased roadmap. It decides what to fix first (critical bugs), what comes next (tests, architecture), and what's lower priority (features, CI).

**What you should see:** `.planning/ROADMAP.md` populated with phases like:

1. **Input validation & error handling** — fix the crashes
2. **Test suite** — add comprehensive tests
3. **Architecture refactor** — split monolithic file
4. **Documentation & DX** — JSDoc, --help, README
5. **Features** — dates, priorities, config file

**Checkpoint:** Run `cat .planning/ROADMAP.md` to see the phase structure.

### DP-4: Plan Phase 1

```
/grd:plan-phase 1
```

**What happens:** GRD's planner agent breaks Phase 1 into executable plans. Each plan is a discrete unit of work with clear inputs, outputs, and verification criteria. A plan-checker agent reviews the plans for feasibility.

**What you should see:** Plan files appear in `.planning/milestones/*/phases/01-*/`:

```
01-01-PLAN.md    # e.g., "Add input validation to all commands"
01-02-PLAN.md    # e.g., "Add file I/O error handling"
```

Each plan has:
- **Goal:** what it achieves
- **Files to modify:** specific paths
- **Verification:** how to confirm it works
- **Must-haves:** artifacts and key links

**Checkpoint:** Read one of the plan files to see the level of detail.

### DP-5: Execute Phase 1

```
/grd:execute-phase 1
```

**What happens:** GRD dispatches executor agents (potentially in parallel) to carry out each plan. Each agent:

1. Reads its plan
2. Makes code changes
3. Creates atomic git commits
4. Writes a SUMMARY.md with what it did

If code review is enabled (default), a reviewer agent checks each wave of changes for issues.

**What you should see:**
- Git commits appearing for each change
- SUMMARY.md files recording what was done
- Possibly REVIEW.md files with code review findings
- The taskmark CLI now handles invalid input gracefully

**Checkpoint:** Run the bug-triggering commands from Step 2 again — they should all be fixed now.

```bash
node bin/taskmark.js add              # error message, not "undefined"
node bin/taskmark.js done 999         # error message, not crash
```

### DP-6: Verify Phase Results

```
/grd:verify-phase 1
```

**What happens:** GRD's verifier agent checks whether Phase 1 achieved its goals. It examines the code changes, runs verification checks (sanity tests, artifact existence), and produces a verification report.

**What you should see:** A `VERIFICATION.md` file in the phase directory confirming what was delivered. The verifier checks that:
- All planned artifacts exist
- The code changes match the plan goals
- No regressions were introduced

**Checkpoint:** The verification report should show the phase goals were met.

> **Note:** For research projects with quantitative metrics (ML benchmarks, performance targets), you'd use `/grd:eval-report N` instead. That command requires an `EVAL.md` evaluation plan — appropriate for R&D phases, not pure engineering ones like this.

### DP-7: Check Progress

```
/grd:progress
```

**What happens:** GRD shows you a dashboard of the entire project — which phases are done, what's next, any blockers.

**What you should see:** Phase 1 marked as complete. Remaining phases shown with their status (planned/unplanned). A recommendation for what to do next.

### DP-8: Run the Self-Evolution Loop

```
/grd:evolve
```

**What happens:** Even after completing Phase 1, there are improvements GRD can discover autonomously. The evolve loop scans the codebase across multiple dimensions:

- **Code quality:** missing JSDoc, long functions, dead code
- **Testing:** uncovered functions, missing edge cases
- **Architecture:** monolithic files, tight coupling
- **Product ideas:** features that would improve the tool

**What you should see:** A categorized list of discoveries, saved as todos. These feed back into future phases — GRD can plan and execute improvements from its own discoveries.

### DP-9: Continue the Cycle (Optional)

You can keep going:

```
/grd:plan-phase 2
/grd:execute-phase 2
/grd:verify-phase 2
```

Each phase builds on the last. By Phase 3-4, TaskMark will have tests, modular architecture, documentation, and CI — all created by GRD's agents.

---

## What You've Learned

| Concept | What It Does | Command |
|---------|-------------|---------|
| **Quick tasks** | One-shot plan+execute for simple changes | `/grd:quick` |
| **Project init** | Scaffold .planning/ with vision and config | `/grd:init` |
| **Baseline** | Measure current quality metrics | `/grd:assess-baseline` |
| **Product planning** | Create a phased roadmap from findings | `/grd:product-plan` |
| **Phase planning** | Break phases into executable plans | `/grd:plan-phase N` |
| **Phase execution** | Multi-agent parallel execution with commits | `/grd:execute-phase N` |
| **Verification** | Confirm phase goals were achieved | `/grd:verify-phase N` |
| **Progress** | Dashboard of project state | `/grd:progress` |
| **Self-evolution** | Autonomous codebase improvement discovery | `/grd:evolve` |

## GRD Agent Architecture

During this tutorial, you interacted with several specialized agents:

- **Product Owner** — high-level planning and roadmap decisions
- **Planner** — breaks phases into executable plans
- **Plan Checker** — validates plans before execution
- **Executor** — carries out plans with atomic commits
- **Code Reviewer** — reviews changes for quality issues
- **Verifier** — confirms phase goals were achieved
- **Eval Reporter** — collects and analyzes metrics
- **Evolve Discovery** — scans codebase for improvement opportunities

These agents coordinate autonomously. You set the direction; they handle the execution.

## Next Steps

- **Your own project:** Run `/grd:init` in your real codebase
- **Research workflows:** Try `/grd:survey "your topic"` for paper-driven R&D
- **Full reference:** Run `/grd:help` for all commands
- **Advanced features:** Explore `/grd:settings` for model profiles, autonomous mode, and agent teams

### Self-monitoring (added in v0.3.24)

After running a few phases, GRD can introspect its own progress:

```bash
gd-tools think                          # one-shot briefing: phase, drift, verdicts, dead-ends, todos
gd health                               # weighted drift score (goal / constraint / ontology)
gd-tools dead-end promote-from-phase 1  # auto-record falsified hypotheses from VERIFICATION.md
gd-tools genome init                    # scaffold .planning/GENOME.md (project-scoped strategy notes)
gd-tools genome snapshot                # append a dated snapshot of current state
```

Each `VERIFICATION.md` now contains a `<reflection>` block with
`hypothesis`, `predicted_outcome`, `actual_outcome`, and a `verdict`
of `confirmed` / `partial` / `falsified`. The planner reads these on
the next phase and refuses to re-propose anything marked falsified.

Opt-in `evolve.auto_genome_snapshot: true` in `.planning/config.json`
makes `/grd:evolve` auto-append a snapshot after every successful
cycle, so the genome accumulates over time.
