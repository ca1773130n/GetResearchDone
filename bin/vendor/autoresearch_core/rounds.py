"""Pure life-harness round policy. No I/O — hosts bind the ports.

Spec: docs/superpowers/specs/2026-06-06-life-harness-rounds-design.md
"""
from __future__ import annotations

import hashlib
import json
import re
from typing import Any, Iterable, Mapping, Sequence

from .types import (
    AutonomyState, EvalReport, Finding, GateCheck, PatchKind, RoundPatch, RoundStatus,
)

_ALL_TARGETS: tuple[PatchKind, ...] = ("markdown", "config", "code")


def resolve_autonomy(config: Mapping[str, Any], no_gates: bool = False) -> AutonomyState:
    """Read the host's `harness` config block (tolerant, like resolve_gates).

    `no_gates=True` forces auto mode but NEVER overrides the kill switch.
    """
    _h = config.get("harness")
    h: dict[str, object] = _h if isinstance(_h, dict) else {}

    raw_targets = h.get("allowed_targets")
    if isinstance(raw_targets, list):
        targets = tuple(t for t in raw_targets if t in _ALL_TARGETS)
    else:
        targets = ()
    if not targets:
        targets = _ALL_TARGETS

    conf = h.get("min_confidence")
    _conf_float = float(conf) if isinstance(conf, (int, float)) and not isinstance(conf, bool) else None
    min_confidence = _conf_float if _conf_float is not None and 0.0 <= _conf_float <= 1.0 else 0.7

    hours = h.get("min_interval_hours")
    min_interval = hours if isinstance(hours, int) and not isinstance(hours, bool) and hours >= 0 else 24

    return AutonomyState(
        mode="auto" if (no_gates or h.get("autonomy") == "auto") else "review",
        kill_switch=h.get("kill_switch") is True,
        min_confidence=min_confidence,
        min_interval_hours=min_interval,
        allowed_targets=targets,
    )


_PRIORITY: dict[str, int] = {
    "takeaway": 0, "decision": 1, "insight": 2, "hypothesis": 3, "todo": 4, "question": 5,
}


def select_evidence(
    findings: Sequence[Finding], *, max_items: int = 25, min_items: int = 3
) -> tuple[Finding, ...]:
    """Deterministic evidence selection: kind priority, then recency.

    Returns () when there is too little evidence to justify a round.
    """
    pool = sorted(findings, key=lambda f: f.created_at, reverse=True)
    pool.sort(key=lambda f: _PRIORITY.get(f.kind, 99))  # stable: keeps recency order
    if len(pool) < min_items:
        return ()
    return tuple(pool[:max_items])


def patch_hash(patch: RoundPatch) -> str:
    """Stable, case/whitespace-insensitive dedupe hash (round_id/confidence excluded)."""
    parts = sorted(f"{e.op} {e.kind} {e.path}".lower() for e in patch.entries)
    normalized = re.sub(r"\s+", " ", "\x00".join(parts + [patch.summary.strip().lower()]))
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:16]


def should_skip_patch(hash_: str, seen_hashes: set[str]) -> bool:
    """Don't re-propose a patch already applied OR deterministically rejected."""
    return hash_ in seen_hashes


def _bad_path(p: str) -> str | None:
    if not p:
        return "empty path"
    if p.startswith("/") or "\\" in p or re.match(r"^[A-Za-z]:", p):
        return "absolute or non-posix path"
    parts = p.split("/")
    if ".." in parts:
        return "path traversal"
    if parts[0] == ".git":
        return "may not touch .git"
    return None


def validate_round_patch(
    patch: RoundPatch,
    autonomy: AutonomyState,
    deny_paths: Iterable[str] = (),
    config_path: str = ".planning/config.json",
    current_harness: Mapping[str, Any] | None = None,
) -> list[str]:
    """Return validation errors ([] = valid). Pure — no filesystem access.

    `deny_paths` is the host's self-protection list (its driver file etc.);
    `current_harness` (the live `harness` config block) lets the kernel reject
    a config patch that rewrites the loop's own controls.
    """
    errors: list[str] = []
    if not patch.entries:
        errors.append("patch has no entries")
    if not (
        isinstance(patch.confidence, (int, float))
        and not isinstance(patch.confidence, bool)
        and 0.0 <= patch.confidence <= 1.0
    ):
        errors.append("confidence must be within [0, 1]")

    denied = {d.strip() for d in deny_paths}
    for i, e in enumerate(patch.entries):
        tag = f"entries[{i}] ({e.path or '?'})"
        reason = _bad_path(e.path)
        if reason:
            errors.append(f"{tag}: {reason}")
        if e.kind not in autonomy.allowed_targets:
            errors.append(f"{tag}: kind {e.kind!r} not in allowed_targets")
        if e.op == "delete":
            if e.content is not None:
                errors.append(f"{tag}: delete must not carry content")
        elif not e.content:
            errors.append(f"{tag}: {e.op} requires content")
        if not e.rationale.strip():
            errors.append(f"{tag}: rationale required")
        if e.path in denied:
            errors.append(f"{tag}: path is deny-listed")
        if e.path == config_path and e.op == "delete":
            errors.append(f"{tag}: may not delete the project config")
        if e.kind == "config" and e.op != "delete" and e.content:
            try:
                parsed = json.loads(e.content)
            except ValueError:
                errors.append(f"{tag}: config patch is not valid JSON")
            else:
                if (
                    e.path == config_path
                    and current_harness is not None
                    and isinstance(parsed, dict)
                    and parsed.get("harness") != dict(current_harness)
                ):
                    errors.append(f"{tag}: round may not modify its own harness config block")
    return errors


def should_apply(eval_report: EvalReport, autonomy: AutonomyState, confidence: float) -> GateCheck:
    """The apply gate. Order matters: kill switch > eval > mode > confidence."""
    if autonomy.kill_switch:
        return GateCheck(proceed=False, pending_gate="kill_switch")
    if not eval_report.passed:
        return GateCheck(proceed=False, pending_gate="eval_failed")
    if autonomy.mode == "review":
        return GateCheck(proceed=False, pending_gate="harness_review")
    if confidence < autonomy.min_confidence:
        return GateCheck(proceed=False, pending_gate="low_confidence")
    return GateCheck(proceed=True, pending_gate=None)


def decide_round(
    patch: RoundPatch,
    autonomy: AutonomyState,
    seen_hashes: set[str],
    eval_report: EvalReport,
    *,
    deny_paths: Iterable[str] = (),
    config_path: str = ".planning/config.json",
    current_harness: Mapping[str, Any] | None = None,
) -> tuple[RoundStatus, str]:
    """Facade: validate -> dedupe -> apply gate, as one (status, detail)."""
    if autonomy.kill_switch:
        return ("skipped", "kill switch is on")
    errors = validate_round_patch(patch, autonomy, deny_paths, config_path, current_harness)
    if errors:
        return ("rejected", "; ".join(errors))
    h = patch_hash(patch)
    if should_skip_patch(h, seen_hashes):
        return ("skipped", f"duplicate of a prior round (patch_hash {h})")
    gate = should_apply(eval_report, autonomy, patch.confidence)
    if gate.proceed:
        return ("applied", "eval passed; autonomy approved")
    if gate.pending_gate == "eval_failed":
        return ("rejected", "eval failed")
    return ("evaluated", f"awaiting review ({gate.pending_gate})")
