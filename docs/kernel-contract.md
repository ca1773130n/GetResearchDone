# Kernel contract — autoresearch-core ⇄ lib/research parity

GRD has two closed-loop engines that deliberately share a decision *philosophy* but
are implemented in two languages, bound to different subjects:

- **`autoresearch-core`** (Python kernel, `bin/vendor/autoresearch_core/`) — powers the
  **life-harness rounds** (`gd harness`). It self-improves *the repo*.
- **`lib/research/`** (TypeScript) — powers the **autoresearch loop** (`gd research`). It
  answers *a research question* via sandboxed experiments.

Several kernel modules already declare parity in their docstrings (e.g.
`verdict.py`: *"Parity with GRD verdict.ts (compare + evaluateVerdict)"*,
`gates.py`: *"Parity with GRD gates.ts"*). That parity was **documented but
unenforced** — nothing stopped one side from drifting. This contract pins it.

## How it's enforced

One canonical golden-fixture file — [`tests/conformance/kernel-contract.json`](../tests/conformance/kernel-contract.json) —
holds neutral input → expected-outcome cases. **Both** implementations must satisfy
every case:

- `tests/python/test_kernel_contract.py` runs the Python kernel against the fixtures.
- `tests/unit/research/kernel-contract.test.ts` runs the TS loop against the *same* fixtures.
- `tests/unit/kernel-contract-python.test.ts` runs the Python suite inside `npm test`
  (skipped only when `python3 >= 3.11` is absent).

If either implementation changes behaviour, its conformance test fails → drift is caught
in CI, in whichever language drifted.

## The pinned contract (v1)

### `compare(value, comparator, target) → bool`
`>=`, `<=`, `>`, `<`, `==` do the obvious arithmetic; **any other comparator → `false`**.

### `evaluateVerdict(plan, result) → verdict`  *(kernel: `DeterministicVerdict.evaluate`)*
1. `exitCode != 0` → `inconclusive` (the run failed).
2. `metricKey` not in `result.metrics` → `inconclusive` (metric not reported).
3. otherwise `compare(metrics[metricKey], comparator, target)` → `supported` (true) / `refuted` (false).

Only the **verdict outcome** is pinned. The human-readable `detail` string is explicitly
*not* a parity guarantee (the kernel renders numbers via `_fmt`, the TS side does not).

### `resolveGates(config, noGates) → { execute, kg_write }`
- `noGates` → both `false`.
- else `execute = config.research_gates.experiment_execution !== false`,
  `kg_write = config.research_gates.kg_write !== false` (missing `research_gates` → both on;
  only a literal `false` disables a gate).

### `checkGate` proceed decision
`proceed = (gate is off) OR approved`; when it does not proceed, the gate becomes the
pending/paused gate. Pinned at the level of `(gateEnabled, approved) → proceed`.

## Documented divergences (intentional — NOT pinned as identical)

- **Unknown gate name.** The kernel's `check_gate` raises `ValueError` (fail-fast); the TS
  `checkGate` reads `thread.gates[gate]` (an absent gate is falsy → it *proceeds*). This is
  a deliberate difference (`gates.py` documents it) and is therefore excluded from the
  conformance cases rather than asserted equal.

## Scope

v1 pins the pure control-path decisions (`verdict`, `gates`). The kernel also declares
parity for `contract.py` (result parsing: NaN/Infinity rejection, non-numeric drop ⇄
`runner.ts`), `failures.py` (`classify_run_failure` ⇄ `runner.ts`), and part of
`promote.py` (dead-end hashing) — natural follow-ups to fold into the same fixture file.
