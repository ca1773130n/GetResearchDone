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
- `tests/unit/kernel-contract-python.test.ts` runs the Python suite inside `npm test`.
  Locally, a missing `python3 >= 3.11` skips with a loud warning; in CI (`CI=true`, or
  `KERNEL_CONTRACT_REQUIRE_PYTHON=1`) it **fails** — a green CI run can never hide an
  unrun Python side of the contract.

If either implementation changes behaviour, its conformance test fails → drift is caught
in CI, in whichever language drifted.

## The pinned contract

### `compare(value, comparator, target) → bool`
`>=`, `<=`, `>`, `<`, `==` do the obvious arithmetic; **any other comparator → `false`**.

### `evaluateVerdict(plan, result) → verdict`  *(kernel: `DeterministicVerdict.evaluate`)*
1. `exitCode != 0` → `inconclusive` (the run failed).
2. `metricKey` not an **own key** of `result.metrics` → `inconclusive` (metric not
   reported). The TS side uses `Object.prototype.hasOwnProperty.call`, **not** the `in`
   operator — `in` walks the prototype chain, so `'toString' in {}` is `true` in JS but a
   Python dict lookup returns `false`. Building this contract *caught that drift*:
   `verdict.ts` used `in` and disagreed with the kernel on prototype-name metric keys
   (`toString`, `constructor`, …); it was fixed to match, and the fixtures now pin it.
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

### `classifyRunFailure(stderr, timedOut) → FailureClass`  *(runner.ts ⇄ failures.py)*
`timedOut` → `H4`; else, first match wins: missing dependency (`command not found` /
`not found:` / `ModuleNotFoundError` / `ImportError`) → `H2`; missing file / permission
(`No such file or directory` / `ENOENT` / `permission denied`) → `H3`; empty stderr →
`none`; otherwise `H4`. **H2 is checked before H3.**

### `parseMetricsLine(stdout) → { metric: number }`  *(runner.ts ⇄ contract.py `parse_metrics_line`)*
Extract the first `__RESULT__ {json}` match and parse it, keeping only **own finite
numbers**. Non-dict → `{}`; invalid JSON → `{}`; `NaN`/`Infinity`/`-Infinity` literals are
rejected at parse time (→ `{}`); booleans, strings, and non-finite numbers (e.g. `1e400`,
which JSON parses to `Infinity`) are dropped. Building this *caught a second drift*: TS kept
every `typeof v === 'number'` — including `Infinity` — so `runner.ts` was fixed to add a
`Number.isFinite` guard, parity with the kernel's `math.isfinite`.

### `decideBranch(verdict) → 'finalize' | 'revise'`  *(verdict.ts ⇄ policy.py)*
`supported` → `finalize`, else `revise`.

### `shouldTerminate(iteration, maxIterations, lastVerdict) → { done, status }`  *(verdict.ts ⇄ policy.py)*
`supported` → `{ done: true, status: "supported" }`; `iteration >= maxIterations` →
`{ done: true, status: "exhausted" }`; else `{ done: false, status: "active" }`. (The TS
side reads `iteration`/`maxIterations` off the thread object.)

### `detectPlateau(verdicts, window=3) → bool`  *(verdict.ts ⇄ policy.py)*
`true` iff there are at least `window` verdicts and the last `window` are all non-`supported`.

## Documented divergences (intentional — NOT pinned as identical)

- **Unknown gate name.** The kernel's `check_gate` raises `ValueError` (fail-fast); the TS
  `checkGate` reads `thread.gates[gate]` (an absent gate is falsy → it *proceeds*). This is
  a deliberate difference (`gates.py` documents it) and is therefore excluded from the
  conformance cases rather than asserted equal.
- **A metric key named `__proto__` (or other object-assignment traps).** In
  `parseMetricsLine`, the kernel's dict keeps a `"__proto__"` metric, but TS assigns via
  `out[k] = v` — for `k === "__proto__"` and a numeric `v` the `__proto__` setter ignores
  the value, so the key is dropped. A metric literally named `__proto__` is pathological, so
  it is documented here rather than special-cased (`Object.defineProperty`) on the hot path.

## Scope

**Pinned** (cross-language, both sides asserted): `compare`, `evaluateVerdict`,
`resolveGates`, `checkGate` (verdict + gates); `classifyRunFailure`, `parseMetricsLine`
(runner); `decideBranch`, `shouldTerminate`, `detectPlateau` (iteration control). This is
every kernel function that declares *"Parity with GRD …"* **and** has a TypeScript twin.

**Not conformably pinned** — the TS side has an *analogous* mechanism, but not a
directly-conformable twin (different shape, algorithm, or scope), so asserting equality
would be misleading:
- `policy.should_promote_dead_end` (`verdict == "refuted" and evidence_level ==
  "deterministic"`). TS `buildDeadEndCalls` (`lib/research/promote.ts:53`) gates on
  `verdict === 'refuted'` alone — it omits the explicit `deterministic` check (harmless in
  the research loop, whose control-path verdicts are always deterministic) and has a
  different shape (it filters a hypothesis ledger rather than testing a single
  `VerdictRecord`).
- `promote.approach_hash` / `should_skip` (dead-end de-dup by `sha256(normalized)[:16]`).
  The TS loop de-dups dead-ends via a **slug** (`lib/dead-ends.ts`) — a different algorithm
  for the same purpose, so the hashes are not interchangeable. (`promote.py` never claimed
  GRD parity — it is "shape only".)
- `contract.validate_metric_spec` (metric_key non-empty + comparator valid + target
  finite). TS validates `metricKey` in pieces (`lib/research/agent-io.ts:47`,
  `reconstructability.ts:36`) but has no single validator covering all three conditions.

If any of these grows a directly-conformable TS twin, fold it into `kernel-contract.json`.
