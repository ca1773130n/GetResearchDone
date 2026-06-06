#!/usr/bin/env python3
"""GRD host driver for life-harness rounds.

Binds autoresearch-core's round ports to GRD's infrastructure:
  FindingsSource -> .tesserae/graph.json (Tesserae-compiled Session findings)
  PatchProposer  -> spawned backend CLI (argv via GRD_HARNESS_SPAWN_ARGV)
  RoundEvaluator -> markdown/config structural checks + npm lint/build:check/jest
  Applier        -> git branch harness/round-<id> + single commit (revert = git revert)
  RoundStore     -> .planning/harness/

Invoked by `gd harness round` — not intended to be run by agents directly.
Exit codes: 0 = round completed (any status), 2 = environment/config error.
"""
from __future__ import annotations

import argparse
import datetime as _dt
import json
import os
import re
import shutil
import subprocess
import sys
import uuid
from dataclasses import asdict
from pathlib import Path

try:
    from autoresearch_core import (
        EvalCheck, EvalReport, Finding, PatchEntry, RoundPatch, RoundRecord,
        decide_round, patch_hash, resolve_autonomy, select_evidence,
    )
except ImportError:  # pragma: no cover
    sys.stderr.write("autoresearch-core>=0.2 is required: pip install 'autoresearch-core>=0.2'\n")
    sys.exit(2)

DENY_PATHS = ("bin/harness_driver.py",)
CONFIG_PATH = ".planning/config.json"
# Session finding node types produced by Tesserae's session import/compile.
# Verified against the local tesserae version at implementation time; the
# fallback accepts a bare `kind` field carrying one of the six finding kinds.
_FINDING_KINDS = ("insight", "decision", "question", "todo", "hypothesis", "takeaway")
_FINDING_TYPE_RE = re.compile(
    r"^Session(Insight|Decision|Question|Todo|Hypothesis|Takeaway)$"
)


def _now() -> str:
    return _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _run(argv: list[str], cwd: str, timeout: int = 600) -> subprocess.CompletedProcess[str]:
    return subprocess.run(argv, cwd=cwd, capture_output=True, text=True, timeout=timeout)


# ── FindingsSource ────────────────────────────────────────────────────────────
class TesseraeFindings:
    def __init__(self, repo: Path) -> None:
        self.graph = repo / ".tesserae" / "graph.json"

    def findings(self, since: str | None) -> list[Finding]:
        if not self.graph.exists():
            raise SystemExit(
                "no .tesserae/graph.json — run `tesserae sessions-import` + `tesserae refresh` first"
            )
        data = json.loads(self.graph.read_text())
        out: list[Finding] = []
        for node in data.get("nodes", []):
            ntype = str(node.get("node_type") or node.get("type") or "")
            m = _FINDING_TYPE_RE.match(ntype)
            kind = m.group(1).lower() if m else str(node.get("kind", ""))
            if kind not in _FINDING_KINDS:
                continue
            created = str(node.get("created_at") or node.get("timestamp") or "")
            if since and created and created <= since:
                continue
            content = str(node.get("content") or node.get("description") or node.get("name") or "")
            if content:
                out.append(Finding(kind=kind, content=content,  # type: ignore[arg-type]
                                   source=str(node.get("node_id") or node.get("id") or ""),
                                   created_at=created))
        return out


# ── PatchProposer ─────────────────────────────────────────────────────────────
PROPOSAL_INSTRUCTIONS = """You are improving the GRD harness from session evidence.
Read evidence.md. Propose ONE focused patch to this repository's primitives
(commands/*.md, agents/*.md, skill markdown, .planning/config.json, lib/**.ts).
Write patch.json (and nothing else) in the current directory:
{"summary": "<one line>", "confidence": <0..1>,
 "entries": [{"path": "<repo-relative>", "kind": "markdown|config|code",
              "op": "modify|create|delete", "content": "<full post-image or null for delete>",
              "rationale": "<why>", "evidence_refs": ["<finding source>"]}]}
Rules: full file post-images (not diffs); smallest change that addresses the
evidence; never touch .git, bin/harness_driver.py, or the harness config block.
"""


class AgentProposer:
    def __init__(self, spawn_argv: list[str]) -> None:
        self.spawn_argv = spawn_argv  # e.g. ["codex", "exec", "--cd", "<replaced>"]

    def propose(self, evidence_md: str, workdir: str) -> RoundPatch:
        (Path(workdir) / "evidence.md").write_text(evidence_md)
        (Path(workdir) / "INSTRUCTIONS.md").write_text(PROPOSAL_INSTRUCTIONS)
        argv = [a.replace("{workdir}", workdir) for a in self.spawn_argv]
        proc = _run(argv + [PROPOSAL_INSTRUCTIONS], cwd=workdir, timeout=900)
        patch_file = Path(workdir) / "patch.json"
        if not patch_file.exists():
            raise ValueError(
                f"proposer wrote no patch.json (exit {proc.returncode}): {proc.stderr[-400:]}"
            )
        raw = json.loads(patch_file.read_text())
        entries = tuple(
            PatchEntry(path=str(e["path"]), kind=e["kind"], op=e["op"],
                       content=e.get("content"), rationale=str(e.get("rationale", "")),
                       evidence_refs=tuple(e.get("evidence_refs", [])))
            for e in raw.get("entries", [])
        )
        return RoundPatch(round_id=str(raw.get("round_id") or uuid.uuid4().hex[:8]),
                          entries=entries, summary=str(raw.get("summary", "")),
                          confidence=float(raw.get("confidence", 0.0)))


# ── RoundEvaluator ────────────────────────────────────────────────────────────
class RepoEvaluator:
    def __init__(self, full_eval: bool) -> None:
        self.full_eval = full_eval

    def _apply_entries(self, patch: RoundPatch, workdir: str) -> None:
        for e in patch.entries:
            target = Path(workdir) / e.path
            if e.op == "delete":
                target.unlink(missing_ok=True)
            else:
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text(e.content or "")

    def evaluate(self, patch: RoundPatch, workdir: str) -> EvalReport:
        self._apply_entries(patch, workdir)
        checks: list[EvalCheck] = []
        touched_code = False
        for e in patch.entries:
            if e.kind == "markdown" and e.op != "delete":
                body = e.content or ""
                ok = body.startswith("---") and "description:" in body.split("---")[1] \
                    if body.count("---") >= 2 else False
                checks.append(EvalCheck(f"frontmatter:{e.path}", 0 if ok else 1,
                                        "" if ok else "missing ---/description frontmatter"))
            if e.kind == "config" and e.op != "delete":
                try:
                    json.loads(e.content or "")
                    checks.append(EvalCheck(f"json:{e.path}", 0))
                except ValueError as exc:
                    checks.append(EvalCheck(f"json:{e.path}", 1, str(exc)))
            if e.kind == "code":
                touched_code = True
        if touched_code:
            env = {**os.environ, "TMPDIR": str(Path(os.environ.get("TMPDIR", "/tmp")))}
            for name, argv in (
                ("lint", ["npm", "run", "lint"]),
                ("tsc", ["npm", "run", "build:check"]),
            ):
                p = subprocess.run(argv, cwd=workdir, capture_output=True, text=True,
                                   timeout=600, env=env)
                checks.append(EvalCheck(name, p.returncode, p.stdout[-400:] + p.stderr[-400:]))
            if self.full_eval:
                p = subprocess.run(["npm", "test"], cwd=workdir, capture_output=True,
                                   text=True, timeout=1800, env=env)
                checks.append(EvalCheck("jest", p.returncode, p.stderr[-400:]))
        return EvalReport(checks=tuple(checks))


# ── Applier ───────────────────────────────────────────────────────────────────
class GitApplier:
    def __init__(self, repo: Path) -> None:
        self.repo = repo

    def apply(self, patch: RoundPatch, workdir: str) -> str:
        rid = patch.round_id
        _run(["git", "add", "-A"], cwd=workdir)
        msg = f"harness(round-{rid}): {patch.summary}\n\n[life-harness round {rid}]"
        p = _run(["git", "commit", "-m", msg], cwd=workdir)
        if p.returncode != 0:
            raise ValueError(f"commit failed: {p.stderr[-400:]}")
        return _run(["git", "rev-parse", "HEAD"], cwd=workdir).stdout.strip()

    def revert(self, sha: str) -> str:
        p = _run(["git", "revert", "--no-edit", sha], cwd=str(self.repo))
        if p.returncode != 0:
            raise ValueError(f"revert failed: {p.stderr[-400:]}")
        return _run(["git", "rev-parse", "HEAD"], cwd=str(self.repo)).stdout.strip()


# ── RoundStore ────────────────────────────────────────────────────────────────
class FsRoundStore:
    def __init__(self, repo: Path) -> None:
        self.root = repo / ".planning" / "harness"

    def save_round(self, record: RoundRecord) -> None:
        d = self.root / "rounds" / record.round_id
        d.mkdir(parents=True, exist_ok=True)
        (d / "RECORD.json").write_text(json.dumps(asdict(record), indent=2) + "\n")
        if record.patch_hash and record.status in ("applied", "rejected"):
            with (self.root / "hashes.jsonl").open("a") as f:
                f.write(json.dumps({"hash": record.patch_hash, "round": record.round_id,
                                    "status": record.status}) + "\n")

    def load_patch_hashes(self) -> set[str]:
        f = self.root / "hashes.jsonl"
        if not f.exists():
            return set()
        return {json.loads(line)["hash"] for line in f.read_text().splitlines() if line}

    def last_round_at(self) -> str | None:
        rounds = sorted((self.root / "rounds").glob("*/RECORD.json")) \
            if (self.root / "rounds").exists() else []
        if not rounds:
            return None
        return str(json.loads(rounds[-1].read_text()).get("created_at") or "") or None


# ── Orchestration ─────────────────────────────────────────────────────────────
def run_round(repo: Path, auto: bool, dry_run: bool, full_eval: bool) -> RoundRecord:
    config = json.loads((repo / CONFIG_PATH).read_text()) if (repo / CONFIG_PATH).exists() else {}
    autonomy = resolve_autonomy(config, no_gates=auto)
    store = FsRoundStore(repo)
    rid = _dt.datetime.now(_dt.timezone.utc).strftime("%Y%m%d-%H%M%S")

    if autonomy.kill_switch:
        return RoundRecord(round_id=rid, status="skipped", detail="kill switch is on",
                           created_at=_now())
    last = store.last_round_at()
    if last:
        age_h = (_dt.datetime.now(_dt.timezone.utc)
                 - _dt.datetime.strptime(last, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=_dt.timezone.utc)
                 ).total_seconds() / 3600
        if age_h < autonomy.min_interval_hours:
            return RoundRecord(round_id=rid, status="skipped", created_at=_now(),
                               detail=f"last round {age_h:.1f}h ago (< {autonomy.min_interval_hours}h)")

    h = config.get("harness") if isinstance(config.get("harness"), dict) else {}
    evidence = select_evidence(
        TesseraeFindings(repo).findings(last),
        max_items=h.get("max_evidence", 25) if isinstance(h.get("max_evidence"), int) else 25,
        min_items=h.get("min_evidence", 3) if isinstance(h.get("min_evidence"), int) else 3,
    )
    if not evidence:
        return RoundRecord(round_id=rid, status="skipped", detail="not enough evidence",
                           evidence_count=0, created_at=_now())
    evidence_md = "# Session evidence\n\n" + "\n".join(
        f"- **{f.kind}** ({f.source}): {f.content}" for f in evidence)
    if dry_run:
        sys.stdout.write(evidence_md + "\n")
        return RoundRecord(round_id=rid, status="gathered", detail="dry run",
                           evidence_count=len(evidence), created_at=_now())

    # scratch worktree on a round branch
    branch = f"harness/round-{rid}"
    workdir = Path(os.environ.get("TMPDIR", "/tmp")) / f"grd-harness-{rid}"
    _run(["git", "worktree", "add", "-b", branch, str(workdir)], cwd=str(repo))
    try:
        spawn_argv = json.loads(os.environ.get("GRD_HARNESS_SPAWN_ARGV", "[]"))
        if not spawn_argv:
            raise SystemExit("GRD_HARNESS_SPAWN_ARGV not set — invoke via `gd harness round`")
        try:
            patch = AgentProposer(spawn_argv).propose(evidence_md, str(workdir))
        except (ValueError, json.JSONDecodeError, KeyError) as exc:
            return RoundRecord(round_id=rid, status="rejected", detail=f"proposal failed: {exc}",
                               evidence_count=len(evidence), created_at=_now())
        patch = RoundPatch(round_id=rid, entries=patch.entries,
                           summary=patch.summary, confidence=patch.confidence)
        eval_report = RepoEvaluator(full_eval).evaluate(patch, str(workdir))
        status, detail = decide_round(
            patch, autonomy, store.load_patch_hashes(), eval_report,
            deny_paths=DENY_PATHS, config_path=CONFIG_PATH,
            current_harness=h if h else None,
        )
        applied_sha = None
        if status in ("applied", "evaluated"):
            applied_sha = GitApplier(repo).apply(patch, str(workdir))
            if status == "applied":
                p = _run(["git", "merge", "--no-ff", "-m",
                          f"harness: merge round {rid}", branch], cwd=str(repo))
                if p.returncode != 0:
                    status, detail = "rejected", f"merge failed: {p.stderr[-400:]}"
        return RoundRecord(round_id=rid, status=status, detail=detail,
                           evidence_count=len(evidence), patch_hash=patch_hash(patch),
                           eval_report=eval_report, applied_sha=applied_sha, created_at=_now())
    finally:
        _run(["git", "worktree", "remove", "--force", str(workdir)], cwd=str(repo))
        # keep the branch when a commit landed on it (review flow); else delete
        heads = _run(["git", "rev-parse", "--verify", branch], cwd=str(repo))
        merged = _run(["git", "merge-base", "--is-ancestor", branch, "HEAD"], cwd=str(repo))
        if heads.returncode == 0 and merged.returncode == 0:
            _run(["git", "branch", "-D", branch], cwd=str(repo))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("action", choices=["round", "revert"])
    ap.add_argument("--auto", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--full-eval", action="store_true")
    ap.add_argument("--sha", default="")
    ap.add_argument("--cwd", default=".")
    args = ap.parse_args()
    repo = Path(args.cwd).resolve()
    if args.action == "revert":
        if not args.sha:
            sys.stderr.write("revert requires --sha\n")
            return 2
        sha = GitApplier(repo).revert(args.sha)
        sys.stdout.write(json.dumps({"reverted_to": sha}) + "\n")
        return 0
    record = run_round(repo, args.auto, args.dry_run, args.full_eval)
    FsRoundStore(repo).save_round(record)
    sys.stdout.write(json.dumps(asdict(record), indent=2) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
