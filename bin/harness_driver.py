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

# autoresearch-core ships vendored under bin/vendor/ so `gd harness round` works
# with no manual pip install. _REQUIRED_CORE is the version GRD's driver is
# locked to; the vendored copy always satisfies it.
_REQUIRED_CORE = (0, 4, 7)
_VENDOR_DIR = Path(__file__).resolve().parent / "vendor"


def _ver_ok(mod: object) -> bool:
    """True iff mod.__version__ ('X.Y.Z') parses to a 3-int tuple >= _REQUIRED_CORE.

    A missing or unparseable __version__ counts as incompatible (False)."""
    raw = getattr(mod, "__version__", None)
    try:
        parts = tuple(int(p) for p in str(raw).split("."))
    except (TypeError, ValueError):  # pragma: no cover - defensive
        return False
    if len(parts) != 3:
        return False
    return parts >= _REQUIRED_CORE


# The symbols harness_driver imports from the kernel. An installed copy must
# expose ALL of them (not just a compatible __version__) before we prefer it —
# otherwise a version-ok-but-broken/partial install would pass the version gate
# and then crash the `from autoresearch_core import (...)` below instead of
# falling back to the vendored copy.
_CORE_NAMES = (
    "EvalCheck", "EvalReport", "Finding", "PatchEntry", "RoundPatch", "RoundRecord",
    "decide_round", "patch_hash", "resolve_autonomy", "select_evidence",
    "validate_round_patch", "should_skip_patch",
    "FindingsSource", "PatchProposer", "RoundEvaluator", "Applier", "RoundStore",
    "classify_run_failure",
)


def _purge_core() -> None:
    for key in [k for k in list(sys.modules)
                if k == "autoresearch_core" or k.startswith("autoresearch_core.")]:
        del sys.modules[key]


def _core_usable() -> bool:
    """True iff `import autoresearch_core` yields a version-compatible copy that
    also exposes every symbol the driver needs."""
    _purge_core()
    try:
        import autoresearch_core as ac  # noqa: F401
        # Probe version + required symbols INSIDE the try: a broken install can raise
        # on attribute access too (e.g. a module-level __getattr__), not just on import.
        return _ver_ok(ac) and all(hasattr(ac, n) for n in _CORE_NAMES)
    except Exception:  # noqa: BLE001 - ANY failure (import or symbol probing) -> prefer vendored
        return False


def _ensure_core() -> None:
    """Arrange sys.path so `autoresearch_core` resolves to a usable kernel.

    Precedence: a version-compatible AND complete installed/editable copy wins
    (dev/editable workflow + power-user override), else the vendored copy under
    bin/vendor/. GRD_HARNESS_CORE=vendored forces vendored unconditionally. A
    stale, too-old, or broken install is rejected in favour of vendored — it can
    never crash the round."""
    if os.environ.get("GRD_HARNESS_CORE") != "vendored" and _core_usable():
        return  # installed copy is usable — keep the copy imported by the check
    # Vendored branch: purge the rejected copy, then put bin/vendor FIRST on sys.path
    # so the `from autoresearch_core import (...)` below resolves to the shipped
    # kernel. Remove any stale occurrence first — a vendor dir already present at a
    # LATER position (or an installed copy earlier on the path) would otherwise win,
    # notably defeating GRD_HARNESS_CORE=vendored.
    _purge_core()
    vendor = str(_VENDOR_DIR)
    while vendor in sys.path:
        sys.path.remove(vendor)
    sys.path.insert(0, vendor)


_ensure_core()

try:
    from autoresearch_core import (
        EvalCheck, EvalReport, Finding, PatchEntry, RoundPatch, RoundRecord,
        decide_round, patch_hash, resolve_autonomy, select_evidence,
        validate_round_patch, should_skip_patch,
        FindingsSource, PatchProposer, RoundEvaluator, Applier, RoundStore,
        classify_run_failure,
    )
except ImportError:  # pragma: no cover
    sys.stderr.write("autoresearch-core kernel unavailable (vendored copy missing or "
                     "incomplete — reinstall GRD); Python 3.11+ required\n")
    sys.exit(2)

DENY_PATHS = ("bin/harness_driver.py",)
CONFIG_PATH = ".planning/config.json"
# Session finding node types produced by Tesserae's session import/compile.
# Verified against the local tesserae version at implementation time; the
# fallback accepts a bare `kind` field carrying one of the six finding kinds.
_FINDING_KINDS = ("insight", "decision", "question", "todo", "hypothesis", "takeaway")
# tesserae mints "SessionTODO" (all-caps) — match kinds case-insensitively
_FINDING_TYPE_RE = re.compile(
    r"^Session(Insight|Decision|Question|Todo|Hypothesis|Takeaway)$", re.IGNORECASE
)
# AgentRunbook distilled-memory nodes (Tesserae 0.9.0). Mapped to a valid
# FindingKind; content is prefixed to preserve provenance in evidence_md.
# Event nodes (per-transition) are intentionally NOT consumed — too granular.
_DISTILLED_NODE_KINDS = {"Runbook": "takeaway", "Gotcha": "insight"}


def _now() -> str:
    return _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _drop_stale_distilled(findings, max_age_days, now):
    """Gap 6: drop distilled (runbook/gotcha) evidence older than the age horizon.

    Distilled memory can go stale faster than the codebase it describes; this
    lets a contradicting newer reality win without an LLM rewrite. Non-distilled
    and undated findings are always kept (matching the "undated evidence is still
    valid" rule). `max_age_days` falsy/<=0 -> no-op.
    """
    if not max_age_days or max_age_days <= 0:
        return list(findings)
    cutoff = (_dt.datetime.strptime(now, "%Y-%m-%dT%H:%M:%SZ")
              - _dt.timedelta(days=max_age_days)).strftime("%Y-%m-%dT%H:%M:%SZ")
    prefixes = tuple(f"[{k.lower()}] " for k in _DISTILLED_NODE_KINDS)
    return [
        f for f in findings
        if not (f.content.startswith(prefixes) and f.created_at and f.created_at < cutoff)
    ]


def _gd_version(repo: Path) -> str:
    try:
        return json.loads((repo / "package.json").read_text()).get("version", "unknown")
    except (OSError, ValueError):
        return "unknown"


def _run(argv: list[str], cwd: str, timeout: int = 600) -> subprocess.CompletedProcess[str]:
    return subprocess.run(argv, cwd=cwd, capture_output=True, text=True, timeout=timeout)


# ── FindingsSource ────────────────────────────────────────────────────────────
class TesseraeFindings(FindingsSource):
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
            prefix = ""
            if ntype in _DISTILLED_NODE_KINDS:
                kind = _DISTILLED_NODE_KINDS[ntype]
                prefix = f"[{ntype.lower()}] "
            else:
                m = _FINDING_TYPE_RE.match(ntype)
                kind = m.group(1).lower() if m else str(node.get("kind", ""))
            if kind not in _FINDING_KINDS:
                continue
            metadata = node.get("metadata") if isinstance(node.get("metadata"), dict) else {}
            # tesserae session-llm nodes carry their date as metadata.first_seen_at
            created = str(node.get("created_at") or node.get("timestamp")
                          or metadata.get("first_seen_at") or "")
            if since and created and created <= since:
                continue
            # nodes without created_at always pass — undated evidence is still valid
            content = str(node.get("content") or node.get("description") or node.get("name") or "")
            if content:
                out.append(Finding(kind=kind, content=prefix + content,  # type: ignore[arg-type]
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


class AgentProposer(PatchProposer):
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
def _as_text(x: object) -> str:
    """Coerce subprocess output to str. TimeoutExpired.stdout/stderr are bytes
    even under text=True (per the stdlib docs), so decode them defensively."""
    if isinstance(x, str):
        return x
    if isinstance(x, (bytes, bytearray)):
        return bytes(x).decode("utf-8", "replace")
    return ""


def _run_check(name: str, argv: list[str], cwd: str, env: dict, timeout: int) -> EvalCheck:
    """Run one eval subprocess as an EvalCheck, catching timeouts and missing
    tooling instead of crashing the round. Output tails are kept for both passing
    and failing checks (audit parity); failing checks are additionally prefixed
    with the autoresearch-core FailureClass ([H2]/[H3]/[H4])."""
    timed_out = False
    try:
        p = subprocess.run(argv, cwd=cwd, capture_output=True, text=True,
                           timeout=timeout, env=env)
        rc, stdout, stderr = p.returncode, p.stdout or "", p.stderr or ""
    except subprocess.TimeoutExpired as exc:
        rc, timed_out = 124, True
        stdout, stderr = _as_text(exc.stdout), _as_text(exc.stderr)
    except (FileNotFoundError, OSError) as exc:
        rc, stdout, stderr = 127, "", str(exc)
    detail = stdout[-400:] + stderr[-400:]
    if rc != 0:
        cls = classify_run_failure(stderr, timed_out)
        if cls != "none":
            detail = f"[{cls}] " + detail
    return EvalCheck(name, rc, detail)


class RepoEvaluator(RoundEvaluator):
    def __init__(self, full_eval: bool) -> None:
        self.full_eval = full_eval

    def _apply_entries(self, patch: RoundPatch, workdir: str) -> None:
        workdir_real = Path(workdir).resolve()
        for e in patch.entries:
            p = Path(e.path)
            if p.is_absolute() or any(part == ".." for part in p.parts):
                raise ValueError(f"unsafe patch path: {e.path}")
            target = (workdir_real / p).resolve()
            if not target.is_relative_to(workdir_real):
                raise ValueError(f"patch path escapes workdir: {e.path}")
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
            checks.append(_run_check("lint", ["npm", "run", "lint"], workdir, env, 600))
            checks.append(_run_check("tsc", ["npm", "run", "build:check"], workdir, env, 600))
            if self.full_eval:
                checks.append(_run_check("jest", ["npm", "test"], workdir, env, 1800))
        return EvalReport(checks=tuple(checks))


# ── Applier ───────────────────────────────────────────────────────────────────
class GitApplier(Applier):
    def __init__(self, repo: Path) -> None:
        self.repo = repo

    def apply(self, patch: RoundPatch, workdir: str) -> str:
        rid = patch.round_id
        # Stage ONLY the patch's own entry paths — never `git add -A`, which
        # would sweep in the proposer scaffolding (evidence.md / patch.json /
        # INSTRUCTIONS.md) the round writes into the worktree. Those already
        # live under .planning/harness/rounds/<id>/; they don't belong in the
        # patch commit. `git add <path>` also stages deletions.
        for e in patch.entries:
            _run(["git", "add", "--", e.path], cwd=workdir)
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
class FsRoundStore(RoundStore):
    def __init__(self, repo: Path) -> None:
        self.root = repo / ".planning" / "harness"

    def save_round(self, record: RoundRecord, extra: dict | None = None) -> None:
        d = self.root / "rounds" / record.round_id
        d.mkdir(parents=True, exist_ok=True)
        payload = asdict(record)
        if extra:
            payload.update(extra)
        (d / "RECORD.json").write_text(json.dumps(payload, indent=2) + "\n")
        # Spec §5: only deterministic refutations (eval failures) and applied rounds
        # enter the dedupe set — validation noise is not a dead-end signal.
        eval_failed = (record.eval_report is not None and
                       any(c.exit_code != 0 for c in record.eval_report.checks))
        if record.patch_hash and (
            record.status == "applied" or
            (record.status == "rejected" and eval_failed)
        ):
            with (self.root / "hashes.jsonl").open("a") as f:
                f.write(json.dumps({"hash": record.patch_hash, "round": record.round_id,
                                    "status": record.status}) + "\n")

    def load_patch_hashes(self) -> set[str]:
        f = self.root / "hashes.jsonl"
        if not f.exists():
            return set()
        return {json.loads(line)["hash"] for line in f.read_text().splitlines() if line}

    def last_round_at(self) -> str | None:
        """Timestamp of the last round that CONSUMED evidence.

        Skipped rounds (kill switch / interval / thin evidence / bootstrap
        records) must advance neither the evidence `since` cursor nor the
        interval guard — otherwise a skipped round permanently hides the
        finding backlog from the next round (first-live-round bug,
        2026-06-08: findings are back-dated to their session's
        first_seen_at, so any cursor newer than the newest session blanks
        the evidence forever).
        """
        rounds = sorted((self.root / "rounds").glob("*/RECORD.json")) \
            if (self.root / "rounds").exists() else []
        latest: str | None = None
        for rec_path in rounds:
            rec = json.loads(rec_path.read_text())
            if rec.get("status") not in ("applied", "evaluated", "rejected"):
                continue
            created = str(rec.get("created_at") or "")
            if created and (latest is None or created > latest):
                latest = created
        return latest

    def last_applied_sha(self) -> str | None:
        """Gap 2: applied_sha of the most recent APPLIED (merged-to-HEAD) round.

        This is the ancestor the next round's worktree branches from, so it is
        the lineage parent recorded in RoundRecord.parent_sha. Review-only
        ("evaluated") rounds never reach HEAD and are excluded.
        """
        rounds = sorted((self.root / "rounds").glob("*/RECORD.json")) \
            if (self.root / "rounds").exists() else []
        latest_at: str | None = None
        sha: str | None = None
        for rec_path in rounds:
            rec = json.loads(rec_path.read_text())
            if rec.get("status") != "applied" or not rec.get("applied_sha"):
                continue
            created = str(rec.get("created_at") or "")
            if latest_at is None or created > latest_at:
                latest_at, sha = created, str(rec.get("applied_sha"))
        return sha


# ── Phase E: upstream candidates (collective layer) ───────────────────────────
# Downstream projects emit GRD-referencing findings here; a round running in
# the upstream root (harness.upstream_root) consumes them as extra evidence.
# Spec: docs/superpowers/specs/2026-06-07-life-harness-phaseE-collective-design.md
# Conservative GRD-reference filter (codex plan-review P2 #6): qualified forms
# only — `gd <cmd>`, `/grd:<skill>`, `grd-<agent>`, the word GRD itself, and
# the distinctive compound "life-harness". Deliberately NOT bare "harness
# round" (collides with e.g. "test harness round-trip").
_GD_REF_RE = re.compile(
    r"\bgd [a-z][a-z-]+|/grd:[a-z-]+|\bgrd-[a-z][a-z-]+\b|\blife-harness\b|\bgrd\b",
    re.IGNORECASE,
)


def upstream_dir() -> Path:
    """$CLAUDE_PLUGIN_DATA/harness/upstream, else ~/.grd/harness/upstream.

    The env var only exists under the plugin runtime; plain-terminal `gd`
    falls back to a stable machine-local dir so both entry points share state.
    """
    base = os.environ.get("CLAUDE_PLUGIN_DATA")
    if base:
        return Path(base) / "harness" / "upstream"
    return Path.home() / ".grd" / "harness" / "upstream"


def _candidate_id(content: str) -> str:
    import hashlib
    normalized = re.sub(r"\s+", " ", content.strip().lower())
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:16]


def _origin_slug(origin: str) -> str:
    return re.sub(r"[^a-z0-9-]+", "-", origin.lower()).strip("-") or "unknown"


class UpstreamStore:
    """One JSONL file per origin project under the shared upstream dir."""

    def __init__(self, root: Path | None = None) -> None:
        self.root = root if root is not None else upstream_dir()

    def _rows(self, path: Path) -> list[dict]:
        return [json.loads(l) for l in path.read_text().splitlines() if l.strip()]

    def emit(self, origin: str, findings, *, round_id: str, round_status: str,
             gd_version: str, now: str) -> int:
        """Append GRD-referencing findings as pending candidates. Dedup by id."""
        slug = _origin_slug(origin)
        rows = [
            {
                "id": _candidate_id(f.content), "origin": slug, "created_at": now,
                "kind": f.kind, "content": f.content, "source_session": f.source,
                "gd_version": gd_version, "round_id": round_id,
                "round_status": round_status, "status": "pending",
            }
            for f in findings if _GD_REF_RE.search(f.content)
        ]
        if not rows:
            return 0
        self.root.mkdir(parents=True, exist_ok=True)
        path = self.root / f"{slug}.jsonl"
        existing = {r["id"] for r in self._rows(path)} if path.exists() else set()
        fresh, seen = [], set(existing)
        for r in rows:
            if r["id"] in seen:
                continue
            seen.add(r["id"])
            fresh.append(r)
        with path.open("a") as fh:
            for r in fresh:
                fh.write(json.dumps(r) + "\n")
        return len(fresh)

    def pending(self, *, ttl_days: int = 90, now: str) -> list[dict]:
        """Pending candidates, TTL-pruned on read, deduped across origins
        with an occurrence count (same content from N projects → count N)."""
        if not self.root.exists():
            return []
        cutoff = (
            _dt.datetime.strptime(now, "%Y-%m-%dT%H:%M:%SZ")
            - _dt.timedelta(days=ttl_days)
        ).strftime("%Y-%m-%dT%H:%M:%SZ")
        out: dict[str, dict] = {}
        for path in sorted(self.root.glob("*.jsonl")):
            keep = [r for r in self._rows(path) if r.get("created_at", "") >= cutoff]
            path.write_text("".join(json.dumps(r) + "\n" for r in keep))
            for r in keep:
                if r.get("status") != "pending":
                    continue
                cur = out.get(r["id"])
                if cur:
                    cur["count"] += 1
                    cur["origins"] = sorted(set(cur["origins"] + [r["origin"]]))
                else:
                    out[r["id"]] = {**r, "count": 1, "origins": [r["origin"]]}
        return sorted(out.values(), key=lambda c: (-c["count"], c["created_at"]))

    def mark_consumed(self, ids: set[str]) -> int:
        """Flip pending rows to consumed. Returns DEDUPED candidates consumed
        (unique ids), not origin rows — one candidate seen from N projects
        counts once (codex plan-review P2 #7)."""
        if not self.root.exists():
            return 0
        flipped: set[str] = set()
        for path in sorted(self.root.glob("*.jsonl")):
            rows = self._rows(path)
            changed = False
            for r in rows:
                if r["id"] in ids and r.get("status") == "pending":
                    r["status"] = "consumed"
                    changed = True
                    flipped.add(r["id"])
            if changed:
                path.write_text("".join(json.dumps(r) + "\n" for r in rows))
        return len(flipped)

    def clear(self, origin: str | None = None) -> int:
        """Delete candidate files; returns files removed."""
        if not self.root.exists():
            return 0
        n = 0
        for path in sorted(self.root.glob("*.jsonl")):
            if origin is None or path.stem == _origin_slug(origin):
                path.unlink()
                n += 1
        return n


class CompositeFindings(FindingsSource):
    """Local Tesserae findings + pending upstream candidates (upstream root only).

    `local_findings` is a callable so tests can inject; production passes
    `TesseraeFindings(repo).findings`. Consumption is two-phase: `findings()`
    only REMEMBERS the candidate id per emitted Finding; the driver calls
    `consumed_for(evidence)` AFTER `select_evidence` truncation so only
    candidates that actually entered the round count as consumed
    (codex plan-review P1 #3).
    """

    def __init__(self, *, local_findings, store: UpstreamStore, ttl_days: int, now: str) -> None:
        self._local = local_findings
        self._store = store
        self._ttl = ttl_days
        self._now = now
        self._id_by_key: dict[tuple[str, str], str] = {}

    def findings(self, since: str | None):
        out = list(self._local(since))
        for c in self._store.pending(ttl_days=self._ttl, now=self._now):
            kind = c["kind"] if c["kind"] in _FINDING_KINDS else "insight"
            f = Finding(
                kind=kind, content=c["content"],
                source=f"upstream:{'+'.join(c['origins'])}:{c.get('source_session','')}",
                created_at=c.get("created_at", ""),
            )
            self._id_by_key[(f.source, f.content)] = c["id"]
            out.append(f)
        return out

    def consumed_for(self, evidence) -> set[str]:
        """Candidate ids for the findings that survived selection."""
        return {
            self._id_by_key[(f.source, f.content)]
            for f in evidence
            if (f.source, f.content) in self._id_by_key
        }


# ── Orchestration ─────────────────────────────────────────────────────────────
def run_round(repo: Path, auto: bool, dry_run: bool, full_eval: bool) -> tuple[RoundRecord, dict]:
    config = json.loads((repo / CONFIG_PATH).read_text()) if (repo / CONFIG_PATH).exists() else {}
    autonomy = resolve_autonomy(config, no_gates=auto)
    store = FsRoundStore(repo)
    parent = store.last_applied_sha()  # Gap 2: lineage parent for this round
    rid = _dt.datetime.now(_dt.timezone.utc).strftime("%Y%m%d-%H%M%S")

    if autonomy.kill_switch:
        return RoundRecord(round_id=rid, status="skipped", detail="kill switch is on",
                           created_at=_now()), {}
    last = store.last_round_at()
    if last:
        age_h = (_dt.datetime.now(_dt.timezone.utc)
                 - _dt.datetime.strptime(last, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=_dt.timezone.utc)
                 ).total_seconds() / 3600
        if age_h < autonomy.min_interval_hours:
            return RoundRecord(round_id=rid, status="skipped", created_at=_now(),
                               detail=f"last round {age_h:.1f}h ago (< {autonomy.min_interval_hours}h)"), {}

    h = config.get("harness") if isinstance(config.get("harness"), dict) else {}
    upstream_root = h.get("upstream_root") is True
    upstream_emit = h.get("upstream_emit") is not False
    ttl_days = h.get("upstream_ttl_days") if isinstance(h.get("upstream_ttl_days"), int) else 90
    if upstream_root:
        source = CompositeFindings(local_findings=TesseraeFindings(repo).findings,
                                   store=UpstreamStore(), ttl_days=ttl_days, now=_now())
    else:
        source = TesseraeFindings(repo)
    _max_age = h.get("distillation_max_age_days")
    findings = _drop_stale_distilled(
        source.findings(last),
        _max_age if isinstance(_max_age, int) and not isinstance(_max_age, bool) else None,
        _now(),
    )
    evidence = select_evidence(
        findings,
        max_items=h.get("max_evidence", 25) if isinstance(h.get("max_evidence"), int) else 25,
        min_items=h.get("min_evidence", 3) if isinstance(h.get("min_evidence"), int) else 3,
    )
    if not evidence:
        return RoundRecord(
            round_id=rid, status="skipped",
            detail="not enough evidence — a rate-limited backend can cache empty "
                   "extractions; run 'tesserae config status' to check provider "
                   "liveness (Tesserae 0.9.0)",
            evidence_count=0, created_at=_now()), {}
    evidence_md = "# Session evidence\n\n" + "\n".join(
        f"- **{f.kind}** ({f.source}): {f.content}" for f in evidence)
    if dry_run:
        sys.stdout.write(evidence_md + "\n")
        return RoundRecord(round_id=rid, status="gathered", detail="dry run",
                           evidence_count=len(evidence), created_at=_now()), {}

    # Persist evidence.md into round dir so auditors can inspect what drove the round.
    round_dir = store.root / "rounds" / rid
    round_dir.mkdir(parents=True, exist_ok=True)
    (round_dir / "evidence.md").write_text(evidence_md + "\n")

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
                               evidence_count=len(evidence), created_at=_now()), {}
        patch = RoundPatch(round_id=rid, entries=patch.entries,
                           summary=patch.summary, confidence=patch.confidence)
        # Persist the normalized patch so applied/rejected rounds can be audited.
        (round_dir / "patch.json").write_text(json.dumps(asdict(patch), indent=2) + "\n")
        errors = validate_round_patch(
            patch, autonomy, deny_paths=DENY_PATHS, config_path=CONFIG_PATH,
            current_harness=h if h else None,
        )
        if errors:
            return RoundRecord(round_id=rid, status="rejected",
                               detail="validation: " + "; ".join(errors),
                               evidence_count=len(evidence), patch_hash=patch_hash(patch),
                               created_at=_now()), {}
        if should_skip_patch(patch_hash(patch), store.load_patch_hashes()):
            return RoundRecord(round_id=rid, status="skipped",
                               detail=f"duplicate of a prior round (patch_hash {patch_hash(patch)})",
                               evidence_count=len(evidence), patch_hash=patch_hash(patch),
                               created_at=_now()), {}
        try:
            eval_report = RepoEvaluator(full_eval).evaluate(patch, str(workdir))
        except ValueError as exc:
            return RoundRecord(round_id=rid, status="rejected",
                               detail=f"eval apply failed: {exc}",
                               evidence_count=len(evidence), patch_hash=patch_hash(patch),
                               created_at=_now()), {}
        # Persist eval results for audit trail.
        (round_dir / "eval.json").write_text(json.dumps(asdict(eval_report), indent=2) + "\n")
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
        rec = RoundRecord(round_id=rid, status=status, detail=detail,
                          evidence_count=len(evidence), patch_hash=patch_hash(patch),
                          eval_report=eval_report, applied_sha=applied_sha,
                          parent_sha=parent, created_at=_now())
        extra: dict[str, int] = {}
        if not dry_run and rec.status in ("applied", "evaluated", "rejected"):
            if upstream_root and isinstance(source, CompositeFindings):
                # ONLY candidates that survived select_evidence truncation count
                # as consumed (codex plan-review P1 #3).
                used = source.consumed_for(evidence)
                if used:
                    extra["upstream_consumed"] = UpstreamStore().mark_consumed(used)
            elif (not upstream_root) and upstream_emit:
                extra["upstream_emitted"] = UpstreamStore().emit(
                    repo.name, evidence, round_id=rec.round_id,
                    round_status=rec.status, gd_version=_gd_version(repo), now=_now())
        return rec, extra
    finally:
        _run(["git", "worktree", "remove", "--force", str(workdir)], cwd=str(repo))
        # keep the branch when a commit landed on it (review flow); else delete
        heads = _run(["git", "rev-parse", "--verify", branch], cwd=str(repo))
        merged = _run(["git", "merge-base", "--is-ancestor", branch, "HEAD"], cwd=str(repo))
        if heads.returncode == 0 and merged.returncode == 0:
            _run(["git", "branch", "-D", branch], cwd=str(repo))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("action", choices=["round", "revert", "upstream"])
    ap.add_argument("--op", choices=["list", "clear"], default="list")
    ap.add_argument("--origin", default="")
    ap.add_argument("--ttl", type=int, default=90)
    ap.add_argument("--auto", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--full-eval", action="store_true")
    ap.add_argument("--sha", default="")
    ap.add_argument("--cwd", default=".")
    args = ap.parse_args()
    repo = Path(args.cwd).resolve()
    if args.action == "upstream":
        store = UpstreamStore()
        if args.op == "clear":
            sys.stdout.write(json.dumps({"cleared": store.clear(args.origin or None)}) + "\n")
        else:
            sys.stdout.write(json.dumps(
                {"pending": store.pending(ttl_days=args.ttl, now=_now())}, indent=2) + "\n")
        return 0
    if args.action == "revert":
        if not args.sha:
            sys.stderr.write("revert requires --sha\n")
            return 2
        sha = GitApplier(repo).revert(args.sha)
        sys.stdout.write(json.dumps({"reverted_to": sha}) + "\n")
        return 0
    record, extra = run_round(repo, args.auto, args.dry_run, args.full_eval)
    FsRoundStore(repo).save_round(record, extra=extra or None)
    out = asdict(record); out.update(extra)
    sys.stdout.write(json.dumps(out, indent=2) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
