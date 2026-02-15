<overview>
Git integration for GRD framework.
</overview>

<core_principle>

**Commit outcomes, not process.**

The git log should read like a changelog of what shipped, not a diary of planning activity.
</core_principle>

<commit_points>

| Event                        | Commit? | Why                                              |
| ---------------------------- | ------- | ------------------------------------------------ |
| BRIEF + ROADMAP created      | YES     | Project initialization                           |
| PLAN.md created              | NO      | Intermediate - commit with plan completion       |
| RESEARCH.md created          | NO      | Intermediate                                     |
| DISCOVERY.md created         | NO      | Intermediate                                     |
| LANDSCAPE.md created         | NO      | Intermediate - commit with survey completion     |
| Evaluation plan created      | NO      | Intermediate - commit with assessment completion |
| **Task completed**           | YES     | Atomic unit of work (1 commit per task)          |
| **Plan completed**           | YES     | Metadata commit (SUMMARY + STATE + ROADMAP)      |
| **Assessment completed**     | YES     | Results commit (BENCHMARKS + BASELINE + STATE)   |
| Handoff created              | YES     | WIP state preserved                              |

</commit_points>

<git_check>

```bash
[ -d .git ] && echo "GIT_EXISTS" || echo "NO_GIT"
```

If NO_GIT: Run `git init` silently. GRD projects always get their own repo.
</git_check>

<commit_formats>

<format name="initialization">
## Project Initialization (brief + roadmap together)

```
docs: initialize [project-name] ([N] phases)

[One-liner from PROJECT.md]

Phases:
1. [phase-name]: [goal]
2. [phase-name]: [goal]
3. [phase-name]: [goal]
```

What to commit:

```bash
node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js commit "docs: initialize [project-name] ([N] phases)" --files .planning/
```

</format>

<format name="task-completion">
## Task Completion (During Plan Execution)

Each task gets its own commit immediately after completion.

```
{type}({phase}-{plan}): {task-name}

- [Key change 1]
- [Key change 2]
- [Key change 3]
```

**Commit types:**
- `feat` - New feature/functionality
- `fix` - Bug fix
- `test` - Test-only (TDD RED phase)
- `refactor` - Code cleanup (TDD REFACTOR phase)
- `perf` - Performance improvement
- `chore` - Dependencies, config, tooling
- `experiment` - R&D experimental change (new for GRD)
- `benchmark` - Assessment/evaluation-related changes (new for GRD)

**Examples:**

```bash
# Standard task
git add src/models/attention.py src/models/config.py
git commit -m "feat(03-02): implement multi-head attention module

- Self-attention with relative position encoding
- Supports window-based local attention
- Forward pass produces correct output shape
"

# Experiment task
git add src/losses/perceptual.py src/train.py
git commit -m "experiment(04-01): add VGG perceptual loss

- VGG-19 feature extraction at layers 2,7,12
- Weighted combination with L1 loss (lambda=0.1)
- Hypothesis: improves SSIM without hurting PSNR
"

# Benchmark task
git add run_benchmarks.py results/
git commit -m "benchmark(05-01): full assessment on Set5+Set14

- PSNR: 30.2 dB (target: 30.0, met)
- SSIM: 0.883 (target: 0.900, not met)
- Results saved to results/phase-05/
"
```

</format>

<format name="plan-completion">
## Plan Completion (After All Tasks Done)

After all tasks committed, one final metadata commit captures plan completion.

```
docs({phase}-{plan}): complete [plan-name] plan

Tasks completed: [N]/[N]
- [Task 1 name]
- [Task 2 name]
- [Task 3 name]

SUMMARY: .planning/phases/XX-name/{phase}-{plan}-SUMMARY.md
```

What to commit:

```bash
node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js commit "docs({phase}-{plan}): complete [plan-name] plan" --files .planning/phases/XX-name/{phase}-{plan}-PLAN.md .planning/phases/XX-name/{phase}-{plan}-SUMMARY.md .planning/STATE.md .planning/ROADMAP.md
```

**Note:** Code files NOT included - already committed per-task.

</format>

<format name="handoff">
## Handoff (WIP)

```
wip: [phase-name] paused at task [X]/[Y]

Current: [task name]
[If blocked:] Blocked: [reason]
```

What to commit:

```bash
node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js commit "wip: [phase-name] paused at task [X]/[Y]" --files .planning/
```

</format>
</commit_formats>

<example_log>

```
# Phase 05 - Assessment
9a0b1c benchmark(05-01): full assessment on Set5+Set14
8d7e6f docs(05-01): complete assessment plan

# Phase 04 - Experiment (perceptual loss)
7g8h9i docs(04-01): complete perceptual loss experiment plan
6j5k4l experiment(04-01): add VGG perceptual loss to training
5m4n3o feat(04-01): implement VGG feature extractor

# Phase 03 - Implement SwinIR
4p3q2r docs(03-02): complete attention module plan
3s2t1u feat(03-02): implement window-based attention
2v1w0x feat(03-01): create SwinIR backbone architecture
1y0z9a chore(03-01): add einops dependency

# Phase 02 - Baseline
0b9c8d benchmark(02-01): establish baseline metrics
7e6f5g feat(02-01): implement EDSR baseline model

# Phase 01 - Survey
4h3i2j docs(01-01): complete SoTA survey

# Initialization
1k0l9m docs: initialize super-resolution (6 phases)
```

Each plan produces 2-4 commits (tasks + metadata). Clear, granular, bisectable.

</example_log>

<anti_patterns>

**Still don't commit (intermediate artifacts):**
- PLAN.md creation (commit with plan completion)
- RESEARCH.md (intermediate)
- DISCOVERY.md (intermediate)
- LANDSCAPE.md (commit with survey completion)
- Minor planning tweaks

**Do commit (outcomes):**
- Each task completion (feat/fix/test/experiment/benchmark)
- Plan completion metadata (docs)
- Project initialization (docs)
- Assessment results (benchmark)

**Key principle:** Commit working code and shipped outcomes, not planning process.

</anti_patterns>

<commit_strategy_rationale>

## Why Per-Task Commits?

**Context engineering for AI:**
- Git history becomes primary context source for future Claude sessions
- `git log --grep="{phase}-{plan}"` shows all work for a plan
- `git diff <hash>^..<hash>` shows exact changes per task
- Less reliance on parsing SUMMARY.md = more context for actual work

**Failure recovery:**
- Task 1 committed, Task 2 failed
- Claude in next session: sees task 1 complete, can retry task 2
- Can `git reset --hard` to last successful task

**Experiment tracking:**
- `experiment()` commits clearly mark R&D changes
- `benchmark()` commits record quantitative results in git log
- `git log --grep="experiment"` shows all experimental changes
- Easy to revert specific experiments

</commit_strategy_rationale>
