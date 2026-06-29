"""Gate model. Parity with GRD gates.ts.

The config sub-key is `experiment_execution` (NOT `execute`); it controls the
runtime gate named `execute`. Any value other than literal False leaves it on.
"""
from __future__ import annotations

from typing import Any, Literal, Mapping

from .types import GateCheck, GateState


def resolve_gates(config: Mapping[str, Any], no_gates: bool) -> GateState:
    if no_gates:
        return GateState(execute=False, kg_write=False)
    _rg = config.get("research_gates")
    rg: dict[str, object] = _rg if isinstance(_rg, dict) else {}
    return GateState(
        execute=rg.get("experiment_execution") is not False,
        kg_write=rg.get("kg_write") is not False,
    )


def check_gate(gates: GateState, gate: Literal["execute", "kg_write"], approved: bool) -> GateCheck:
    """Decide whether to proceed or pause at `gate`. Parity with GRD checkGate
    (which also sets thread.status='paused'/pendingGate — the caller does that).
    Unknown gate names raise ValueError (fail-fast; GRD would silently proceed)."""
    current = getattr(gates, gate, None)
    if current is None:
        raise ValueError(f"unknown gate: {gate!r}")
    if (not current) or approved:
        return GateCheck(proceed=True, pending_gate=None)
    return GateCheck(proceed=False, pending_gate=gate)
