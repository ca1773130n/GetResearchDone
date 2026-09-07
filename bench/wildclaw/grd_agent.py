"""WildClawBench harness adapter for GRD.

WildClawBench (arXiv 2605.10912) runs one 60-task suite across four CLI harnesses —
OpenClaw, Claude Code, Codex and Hermes Agent — and reports that *swapping the harness
alone moves a single model by up to 18 points*. That measurement is the reason this file
exists: GRD's entire claim is that the discipline wrapped around the model is what
matters, and this is the only rig that scores that claim against peers on identical tasks.

GRD is a harness *on top of* Claude Code: `gd` builds a prompt and spawns the `claude`
binary. So this adapter subclasses their `ClaudeCodeAgent` and overrides only the
invocation. Container lifecycle, workspace preparation, skills setup, transcript
extraction and token accounting are all inherited unchanged, which keeps the comparison
honest — the GRD arm and the Claude Code arm differ in exactly one thing, the command.

## What is being measured

Baseline arm: `claude -p "<task>"`.
GRD arm:      `gd quick "<task>"` — the same model, reached through GRD's phase
              discipline, atomic commits and state tracking.

A difference between those two columns is GRD's discipline, priced. That is the number
this project has never had.

## The bootstrap, and why it counts against us

`gd quick` refuses to run without an active project: `commands/quick.md` errors with
"Quick mode requires an active project with ROADMAP.md". WildClawBench tasks are one-shot
work in arbitrary workspaces, so the adapter seeds a minimal `.planning/` before running.

That seeding is overhead GRD imposes and the benchmark should charge us for it. It is
deliberately the *cheapest* thing that satisfies the gate — three small files, no agent
spawn — rather than a real `gd init`, which would spend model calls on research and a
roadmap before the task even starts. Verified against `grd-tools init quick`: a bare
workspace reports `roadmap_exists: false`, and this skeleton flips it to `true`.

If GRD only wins because of a lavish bootstrap, that is not a win. Keep this minimal.

## Unverified

The container-side assumptions below have NOT been executed against the real
WildClawBench images, which ship separately via HuggingFace and need API budget plus
several hours per run. Specifically unproven:

  1. that `gd` can be installed into their image at run time (`GRD_INSTALL_CMD`);
  2. that GRD's scheduler finds a usable `claude` binary there — their image stages
     Claude Code at `/claude_code` behind a `start.sh`, which is not necessarily a
     `claude` on `PATH` (see `GRD_CLAUDE_BIN`);
  3. that the inherited transcript path still fills when `claude` is spawned by `gd`
     rather than by `start.sh`.

Every one of those is a knob below rather than a hardcoded guess, so the first real run
can settle them by configuration instead of a rewrite. Do not report a number from this
adapter until it has run green end to end.
"""

from __future__ import annotations

import json
import os
import shlex
import subprocess
from pathlib import Path
from typing import Any

from src.agents.claudecode.runner import ClaudeCodeAgent

# The workspace WildClawBench mounts into the container for every task.
WORKSPACE = "/tmp_workspace"

# Smallest `.planning/` that satisfies `gd quick`'s roadmap gate. Verified against
# `grd-tools init quick`, which flips `roadmap_exists` false -> true on exactly this.
_ROADMAP = "# Roadmap\n\n- [ ] Phase 1: Task\n"
_STATE = "# State\n\n**Current Phase:** 1\n**Status:** in_progress\n"
# Gates off so a benchmark run never blocks on a human, and knowledge writes never
# escape the container into a shared registry.
_CONFIG = json.dumps(
    {
        "autonomous_mode": True,
        "research_gates": {"experiment_execution": False, "kg_write": False},
        "research_persist_knowledge": False,
        "code_review_enabled": False,
    },
    indent=2,
)


class GRDAgent(ClaudeCodeAgent):
    """GRD driving Claude Code, scored on the Claude Code arm's own terms."""

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        # Defaults to the Claude Code image: GRD adds a node package, not a runtime.
        self.image = (
            os.environ.get("DOCKER_IMAGE_GRD")
            or os.environ.get("GRD_DOCKER_IMAGE")
            or self.image
        )
        # How `gd` gets into the container. Point at a local tarball to test an
        # unpublished build; the default takes the published package.
        self.grd_install_cmd = os.environ.get(
            "GRD_INSTALL_CMD",
            "command -v gd >/dev/null 2>&1 || npm install -g @jokerized/getresearchdone",
        )
        # GRD's scheduler spawns this binary. Their image may only stage Claude Code
        # behind /claude_code/start.sh, in which case point this at a shim.
        self.grd_claude_bin = os.environ.get("GRD_CLAUDE_BIN", "claude")

    def _bootstrap_planning(self, task_id: str) -> None:
        """Seed the minimal project `gd quick` requires. Charged to GRD's time."""
        files = {
            f"{WORKSPACE}/.planning/ROADMAP.md": _ROADMAP,
            f"{WORKSPACE}/.planning/STATE.md": _STATE,
            f"{WORKSPACE}/.planning/config.json": _CONFIG,
        }
        mk = f"mkdir -p {shlex.quote(WORKSPACE)}/.planning"
        subprocess.run(
            ["docker", "exec", task_id, "/bin/bash", "-c", mk],
            capture_output=True,
            text=True,
            check=True,
        )
        for path, body in files.items():
            # Heredoc rather than `echo`: task content is untrusted and may contain
            # anything, and a quoted delimiter stops the shell expanding it.
            script = f"cat > {shlex.quote(path)} <<'GRD_EOF'\n{body}\nGRD_EOF"
            subprocess.run(
                ["docker", "exec", task_id, "/bin/bash", "-c", script],
                capture_output=True,
                text=True,
                check=True,
            )

    def _run_prompt(
        self,
        task_id: str,
        prompt: str,
        model: str,
        timeout_seconds: int,
        output_dir: Path,
    ) -> None:
        """Run the task through `gd quick` instead of a bare `claude -p`."""
        output_dir.mkdir(parents=True, exist_ok=True)
        self._bootstrap_planning(task_id)

        cmd = (
            f"cd {shlex.quote(WORKSPACE)} && "
            f"{self.grd_install_cmd} && "
            # GRD reads the backend binary from the environment; IS_SANDBOX mirrors the
            # Claude Code arm so neither side pays a permission-prompt penalty.
            f"IS_SANDBOX=1 GRD_CLAUDE_BIN={shlex.quote(self.grd_claude_bin)} "
            f"gd quick {shlex.quote(prompt)} --model {shlex.quote(model)}"
        )
        r = subprocess.run(
            ["docker", "exec", task_id, "/bin/bash", "-c", cmd],
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
        )
        (output_dir / "agent.log").write_text(
            (r.stdout or "") + ("\n" if r.stdout else "") + (r.stderr or ""),
            encoding="utf-8",
        )
        if r.returncode != 0:
            raise RuntimeError(f"GRD run failed (rc={r.returncode}):\n{r.stderr}")
