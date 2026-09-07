# GRD as a WildClawBench harness

**Why:** GRD has never been measured against anything. This is the cheapest path to a
first real number, and it measures the right thing.

[WildClawBench](https://github.com/internlm/WildClawBench) (arXiv
[2605.10912](https://arxiv.org/abs/2605.10912), 516 stars) runs one 60-task suite across
four CLI harnesses — OpenClaw, Claude Code, Codex and Hermes Agent — in Docker, against
real tools rather than mocks. Its headline result is the reason to care:

| | |
|---|---|
| Best model overall (Claude Opus 4.7 under OpenClaw) | 62.2% |
| **Score shift from changing harness alone, same model** | **up to 18 points** |

Eighteen points from the harness, on a rig where the spread between frontier models is
smaller. GRD's entire thesis is that the discipline around the model is what matters.
This is the only place that thesis can be scored against peers on identical tasks. It is
also where the frontier labs report: Tencent's Hunyuan3 and ByteDance Seed both publish
WildClawBench numbers.

## The comparison

The adapter subclasses their `ClaudeCodeAgent` and overrides **only the invocation**,
because GRD *is* Claude Code plus discipline — `gd` builds a prompt and spawns `claude`.
Container lifecycle, workspace prep, skills, transcript extraction and token accounting
are inherited untouched.

| Arm | Command |
|---|---|
| Baseline | `claude -p "<task>"` |
| GRD | `gd quick "<task>"` |

Same model, same tasks, same grading, one difference. **The delta between those two
columns is GRD's discipline, priced.** If it is zero or negative, the discipline is not
the product and this project needs rethinking — which is the point of running it before
writing any more positioning.

## Usage

```bash
git clone https://github.com/internlm/WildClawBench.git
bash bench/wildclaw/install.sh /path/to/WildClawBench

cd /path/to/WildClawBench
bash script/run.sh grd        --category all --model <model>   # GRD arm
bash script/run.sh claudecode --category all --model <model>   # baseline arm
```

The installer copies the adapter in and patches four registration points
(`src/utils/cli_args.py`, `eval/run_batch.py`, `script/run.sh`, plus the new
`src/agents/grd/`). It is idempotent, touches nothing else, and `git diff` in the
WildClawBench checkout shows exactly what GRD added — 13 inserted lines across 3 files.

### Knobs

| Env var | Default | For |
|---|---|---|
| `DOCKER_IMAGE_GRD` | the Claude Code image | GRD adds an npm package, not a runtime |
| `GRD_INSTALL_CMD` | `npm install -g @jokerized/getresearchdone` | point at a local tarball to test an unpublished build |
| `GRD_CLAUDE_BIN` | `claude` | their image stages Claude Code behind `/claude_code/start.sh`, which may not be a `claude` on `PATH` |

## The bootstrap, and why it counts against us

`gd quick` refuses to run without an active project — `commands/quick.md` errors with
"Quick mode requires an active project with ROADMAP.md". WildClawBench tasks are one-shot
work in arbitrary workspaces, so the adapter seeds a minimal `.planning/` first: three
small files, no agent spawn.

That overhead is GRD's and the clock should charge us for it. It is deliberately the
cheapest thing that clears the gate rather than a real `gd init`, which would burn model
calls on research and a roadmap before the task even starts. **If GRD only wins because
of a lavish bootstrap, that is not a win.** Keep it minimal.

Verified against `grd-tools init quick`: a bare workspace reports `roadmap_exists:
false`; this skeleton flips it to `true`.

The seeded config disables gates, code review and knowledge persistence, so a benchmark
run never blocks on a human and never writes into a shared registry from inside a
container.

## What is verified, and what is not

Verified locally:

- the adapter imports, subclasses `BaseAgent` correctly, and exposes every abstract
  method the interface requires;
- `--agent-backend grd` is accepted and appears in argparse's choices, while a bogus
  backend is still rejected;
- `eval/run_batch.py` and `cli_args.py` still compile after patching;
- the three-file `.planning/` skeleton satisfies GRD's roadmap gate.

**Not verified — do not report a number until these pass.** The Docker images ship
separately via HuggingFace and a full run needs API budget plus roughly eight hours of
wall clock, so none of the following has been executed:

1. that `gd` installs into their image at run time;
2. that GRD's scheduler finds a usable `claude` binary there;
3. that the inherited transcript path still fills when `claude` is spawned by `gd`
   rather than by their `start.sh`.

Each is a knob above rather than a hardcoded guess, so the first real run settles them by
configuration instead of a rewrite.

## Cost before you start

60 tasks averaging ~8 minutes and 20+ tool calls, times two arms for the comparison.
Budget the API spend deliberately — WildClawBench's own tables put a single 60-task run
between roughly $0.09 and $0.61 per task depending on model, so a two-arm comparison at
frontier pricing is real money, and a cheap open model is a legitimate first pass since
the *delta* is what matters, not the absolute score.
