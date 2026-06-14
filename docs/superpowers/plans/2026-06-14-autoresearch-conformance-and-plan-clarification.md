# autoresearch-core Conformance Wiring + Planning-time Clarification — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make GRD's Python harness driver explicitly consume autoresearch-core's round-port Protocols + `classify_run_failure` (Feature 1), and let the planner ask the user to resolve ambiguous decisions mid-planning via the existing checkpoint transport (Feature 2).

**Architecture:** Feature 1 is pure Python in `bin/harness_driver.py` + a new `tests/python/` suite (TDD, monkeypatched subprocess). Feature 2 is prompt-markdown editing in `agents/grd-planner.md` + `commands/{plan-phase,discuss-phase,settings}.md` + `CLAUDE.md`, reusing the existing `## CHECKPOINT REACHED` planner→orchestrator path; verified by acceptance checks (no unit tests for markdown orchestration).

**Tech Stack:** Python 3 (`unittest`, importlib module-load, `autoresearch_core` ≥0.4.4), a jest wrapper that runs the python suite inside `npm test`, GRD skill markdown.

**Spec:** `docs/superpowers/specs/2026-06-14-autoresearch-conformance-and-plan-clarification-design.md`

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `bin/harness_driver.py` | Round port impls + evaluator | Modify: add Protocol bases; refactor `RepoEvaluator.evaluate` to use a fault-catching `_run_check` helper + `classify_run_failure` |
| `tests/python/test_harness_conformance.py` | Feature 1 unit tests | Create |
| `tests/unit/harness-conformance.test.ts` | jest wrapper running the python suite | Create |
| `agents/grd-planner.md` | Planner role/return contract | Modify: define clarification checkpoint return + pre-write gating step; reconcile `<user_decisions>` doc debt |
| `commands/plan-phase.md` | Planner orchestration | Modify: resolve `clarification_allowed`, inject into planner prompt, render clarification checkpoint via AskUserQuestion, bound the loop |
| `commands/discuss-phase.md` | Pre-planning intake | Modify: enrich gray-area taxonomy |
| `commands/settings.md` | Gate config surface | Modify: add `plan_clarification` to box + YOLO json |
| `CLAUDE.md` (GRD repo) | Config docs | Modify: document `research_gates.plan_clarification` |

---

# FEATURE 1 — Conformance wiring (Python, TDD)

## Task 1: Failing test — explicit Protocol conformance

**Files:**
- Create: `tests/python/test_harness_conformance.py`

- [ ] **Step 1: Write the failing test**

Create `tests/python/test_harness_conformance.py` with exactly:

```python
"""Unit tests for autoresearch-core port conformance + fault handling in
bin/harness_driver.py.

Run directly:  PYTHONPATH=<autoresearch-core checkout-or-site> python3 tests/python/test_harness_conformance.py
A jest wrapper (tests/unit/harness-conformance.test.ts) runs this in `npm test`
and skips when python3/autoresearch_core are unavailable.
"""
import importlib.util
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest import mock

REPO = Path(__file__).resolve().parent.parent.parent
spec = importlib.util.spec_from_file_location("hd", REPO / "bin" / "harness_driver.py")
hd = importlib.util.module_from_spec(spec)
spec.loader.exec_module(hd)

from autoresearch_core import (  # noqa: E402
    FindingsSource, PatchProposer, RoundEvaluator, Applier, RoundStore,
)


class TestPortConformance(unittest.TestCase):
    """Explicit inheritance (not just structural isinstance) — proves the
    classes carry the Protocol in their MRO, which is the documentation/static
    -typing contract Feature 1 adds."""

    def test_explicit_inheritance(self):
        self.assertIn(FindingsSource, hd.TesseraeFindings.__mro__)
        self.assertIn(PatchProposer, hd.AgentProposer.__mro__)
        self.assertIn(RoundEvaluator, hd.RepoEvaluator.__mro__)
        self.assertIn(Applier, hd.GitApplier.__mro__)
        self.assertIn(RoundStore, hd.FsRoundStore.__mro__)
        self.assertIn(FindingsSource, hd.CompositeFindings.__mro__)

    def test_classes_still_instantiable(self):
        with tempfile.TemporaryDirectory() as d:
            repo = Path(d)
            self.assertIsInstance(hd.TesseraeFindings(repo), FindingsSource)
            self.assertIsInstance(hd.RepoEvaluator(False), RoundEvaluator)
            self.assertIsInstance(hd.GitApplier(repo), Applier)
            self.assertIsInstance(hd.FsRoundStore(repo), RoundStore)
            self.assertIsInstance(hd.AgentProposer([]), PatchProposer)


if __name__ == "__main__":
    unittest.main(verbosity=2)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/neo/Developer/Projects/GetResearchDone && python3 tests/python/test_harness_conformance.py`
Expected: `test_explicit_inheritance` FAILS (`FindingsSource not in ...__mro__`) because the classes don't yet inherit the Protocols. (`test_classes_still_instantiable` may already pass structurally — that's fine.)

- [ ] **Step 3: Add Protocol bases in `bin/harness_driver.py`**

First extend the import block (`bin/harness_driver.py:29-33`) to add the five port Protocols + `classify_run_failure`:

```python
    from autoresearch_core import (
        EvalCheck, EvalReport, Finding, PatchEntry, RoundPatch, RoundRecord,
        decide_round, patch_hash, resolve_autonomy, select_evidence,
        validate_round_patch, should_skip_patch,
        FindingsSource, PatchProposer, RoundEvaluator, Applier, RoundStore,
        classify_run_failure,
    )
```

Then change each class declaration:
- `class TesseraeFindings:` → `class TesseraeFindings(FindingsSource):`
- `class AgentProposer:` → `class AgentProposer(PatchProposer):`
- `class RepoEvaluator:` → `class RepoEvaluator(RoundEvaluator):`
- `class GitApplier:` → `class GitApplier(Applier):`
- `class FsRoundStore:` → `class FsRoundStore(RoundStore):`
- `class CompositeFindings:` → `class CompositeFindings(FindingsSource):`

- [ ] **Step 4: Run test to verify it passes**

Run: `python3 tests/python/test_harness_conformance.py`
Expected: both tests PASS.

- [ ] **Step 5: Commit**

```bash
git add bin/harness_driver.py tests/python/test_harness_conformance.py
git commit -m "feat(harness): explicit autoresearch-core port conformance

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 2: Failing test — RepoEvaluator catches faults + classifies them

**Files:**
- Modify: `tests/python/test_harness_conformance.py`
- Modify: `bin/harness_driver.py` (`RepoEvaluator.evaluate`, lines ~158-190)

- [ ] **Step 1: Add the failing behavior tests**

Append this class to `tests/python/test_harness_conformance.py` (before the `if __name__` block):

```python
class TestEvaluatorFaultHandling(unittest.TestCase):
    def _code_patch(self):
        from autoresearch_core import RoundPatch, PatchEntry
        return RoundPatch(
            round_id="r1",
            entries=(PatchEntry(path="lib/x.ts", kind="code", op="modify",
                                content="export const x = 1;\n", rationale="",
                                evidence_refs=()),),
            summary="s", confidence=0.5,
        )

    def test_timeout_classified_h4_no_crash(self):
        patch = self._code_patch()
        def fake_run(argv, cwd=None, capture_output=None, text=None, timeout=None, env=None):
            raise subprocess.TimeoutExpired(argv, timeout)
        with tempfile.TemporaryDirectory() as d:
            with mock.patch.object(hd.subprocess, "run", side_effect=fake_run):
                report = hd.RepoEvaluator(full_eval=False).evaluate(patch, d)
        details = " ".join(c.detail or "" for c in report.checks)
        self.assertTrue(any(c.exit_code != 0 for c in report.checks))
        self.assertIn("[H4]", details)

    def test_missing_binary_classified_no_crash(self):
        patch = self._code_patch()
        def fake_run(argv, cwd=None, capture_output=None, text=None, timeout=None, env=None):
            raise FileNotFoundError("[Errno 2] No such file or directory: 'npm'")
        with tempfile.TemporaryDirectory() as d:
            with mock.patch.object(hd.subprocess, "run", side_effect=fake_run):
                report = hd.RepoEvaluator(full_eval=False).evaluate(patch, d)
        details = " ".join(c.detail or "" for c in report.checks)
        self.assertTrue(any(c.exit_code != 0 for c in report.checks))
        self.assertIn("[H3]", details)  # "No such file or directory" -> H3
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python3 tests/python/test_harness_conformance.py`
Expected: both new tests FAIL — `test_timeout_...` raises `TimeoutExpired` out of `evaluate` (uncaught today); `test_missing_binary_...` raises `FileNotFoundError`.

- [ ] **Step 3: Add a fault-catching helper and use it in `evaluate`**

In `bin/harness_driver.py`, add this module-level helper just above `class RepoEvaluator` (after the `_run` helper, near line 63):

```python
def _run_check(name: str, argv: list[str], cwd: str, env: dict, timeout: int) -> EvalCheck:
    """Run one eval subprocess as an EvalCheck, catching timeouts and missing
    tooling instead of crashing the round. Failing checks are prefixed with the
    autoresearch-core FailureClass ([H2]/[H3]/[H4])."""
    timed_out = False
    try:
        p = subprocess.run(argv, cwd=cwd, capture_output=True, text=True,
                           timeout=timeout, env=env)
        rc, stdout, stderr = p.returncode, p.stdout or "", p.stderr or ""
    except subprocess.TimeoutExpired as exc:
        rc, timed_out = 124, True
        stdout = exc.stdout if isinstance(exc.stdout, str) else ""
        stderr = exc.stderr if isinstance(exc.stderr, str) else ""
    except (FileNotFoundError, OSError) as exc:
        rc, stdout, stderr = 127, "", str(exc)
    detail = (stdout[-400:] + stderr[-400:]) if rc != 0 else ""
    if rc != 0:
        cls = classify_run_failure(stderr, timed_out)
        if cls != "none":
            detail = f"[{cls}] " + detail
    return EvalCheck(name, rc, detail)
```

Then replace the touched-code subprocess block in `RepoEvaluator.evaluate` (`bin/harness_driver.py:177-189`):

```python
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
```

with:

```python
        if touched_code:
            env = {**os.environ, "TMPDIR": str(Path(os.environ.get("TMPDIR", "/tmp")))}
            checks.append(_run_check("lint", ["npm", "run", "lint"], workdir, env, 600))
            checks.append(_run_check("tsc", ["npm", "run", "build:check"], workdir, env, 600))
            if self.full_eval:
                checks.append(_run_check("jest", ["npm", "test"], workdir, env, 1800))
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python3 tests/python/test_harness_conformance.py`
Expected: all four tests PASS.

- [ ] **Step 5: Commit**

```bash
git add bin/harness_driver.py tests/python/test_harness_conformance.py
git commit -m "fix(harness): catch eval timeouts/missing tooling, classify via autoresearch-core

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 3: jest wrapper so `npm test` runs the python suite

**Files:**
- Create: `tests/unit/harness-conformance.test.ts`

- [ ] **Step 1: Create the wrapper (mirrors `tests/unit/harness-upstream.test.ts`)**

```typescript
'use strict';
/**
 * Runs the conformance python unit suite (tests/python/test_harness_conformance.py)
 * inside npm test. Skips (does not fail) when python3 or autoresearch_core is
 * unavailable — mirrors harness-upstream.test.ts.
 */
const path = require('path');
const { execFileSync } = require('child_process');

const REPO = path.join(__dirname, '..', '..');

function pythonReady(): boolean {
  try {
    execFileSync('python3', ['-c', 'import autoresearch_core'], {
      encoding: 'utf-8', timeout: 15000, env: process.env,
    });
    return true;
  } catch {
    return false;
  }
}

const ready = pythonReady();
(ready ? describe : describe.skip)('harness conformance python suite', () => {
  test('python unittest passes', () => {
    const out = execFileSync(
      'python3', [path.join(REPO, 'tests', 'python', 'test_harness_conformance.py')],
      { encoding: 'utf-8', timeout: 120000, env: process.env }
    );
    expect(out).toBeDefined();
  });
});

if (!ready) {
  test('conformance python suite skipped (python3/autoresearch_core unavailable)', () => {
    expect(true).toBe(true);
  });
}
```

- [ ] **Step 2: Run the wrapper**

Run: `npx jest tests/unit/harness-conformance.test.ts`
Expected: PASS (the inner python suite runs and passes; or the suite skips if python3/autoresearch_core are absent).

- [ ] **Step 3: Lint + typecheck the new wrapper**

Run: `npm run lint && npm run build:check`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add tests/unit/harness-conformance.test.ts
git commit -m "test(harness): run conformance python suite under npm test

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

# FEATURE 2 — Planning-time clarification (markdown, acceptance-verified)

> Markdown orchestration is not unit-tested; each task verifies via `grep` that the contract text is present and internally consistent, plus the end-to-end acceptance checks in Task 8.

## Task 4: Define the clarification checkpoint return + gating in `grd-planner.md`

**Files:**
- Modify: `agents/grd-planner.md` (structured-returns area near the `## Checkpoint Reached / Revision Complete` heading ~line 1460; fidelity rules ~47-70; pre-write step before `## PLANNING COMPLETE` ~1408)

- [ ] **Step 1: Add a clarification gating + emit step before the planner writes PLAN.md**

In `agents/grd-planner.md`, immediately BEFORE the section where the planner writes PLAN.md files (the `**7. Write PLAN.md files:**` step, ~line 1040), insert:

```markdown
**6b. Clarification checkpoint (before writing any PLAN.md):**

The orchestrator passes `**Clarification:** {true|false}` in planning_context.

- If `Clarification` is `false` (autonomous, autopilot, or `--candidates N>1`):
  do NOT ask anything — exercise discretion exactly as today and continue.
- If `Clarification` is `true`: scan for genuinely ambiguous, HIGH-IMPACT,
  *unlocked* decisions (design-spec forks, library/approach choices, data-flow
  or interface decisions) NOT already fixed by `## Decisions`. If at least one
  exists, STOP before writing PLAN.md and return `## CHECKPOINT REACHED` in the
  clarification format below. If none exist, continue to write PLAN.md.

Only unlocked ambiguity qualifies. Never re-ask anything already in
`## Decisions`. Cap: emit at most the 4 highest-impact questions in one
checkpoint.
```

- [ ] **Step 2: Define the clarification return format**

Replace the stub section `## Checkpoint Reached / Revision Complete` (~line 1460, currently `Follow templates in checkpoints and revision_mode sections respectively.`) with:

```markdown
## Checkpoint Reached / Revision Complete

**Revision mode:** follow the revision_mode section.

**Clarification checkpoint** (from step 6b): return EXACTLY this shape and write
NO PLAN.md files:

​```
## CHECKPOINT REACHED

TYPE: clarification

<clarification>
<question id="q1">
  <ask>One-line question about the unlocked decision</ask>
  <why>One line: why it matters / what depends on it</why>
  <options>
    <option recommended="true">Option A — short label</option>
    <option>Option B — short label</option>
  </options>
</question>
<!-- up to 4 question blocks, ids q1..q4 -->
</clarification>
​```

Exactly one `<option recommended="true">` per question. On resume the
orchestrator re-spawns you with the answers as `## Decisions` entries; honor
them as locked, then write PLAN.md normally.
```

- [ ] **Step 3: Reconcile the `<user_decisions>` doc debt**

In `agents/grd-planner.md:47`, change:

```markdown
The orchestrator provides user decisions in `<user_decisions>` tags from `/grd:discuss-phase`.
```

to:

```markdown
The orchestrator provides user decisions inside the `**Phase Context:**` block
(from `/grd:discuss-phase`, and from resumed clarification checkpoints), keyed by
`## Decisions`, `## Deferred Ideas`, and `## Claude's Discretion`.
```

- [ ] **Step 4: Verify the contract text is present and consistent**

Run:
```bash
grep -nE "TYPE: clarification|recommended=\"true\"|6b\. Clarification|Phase Context.*Decisions" agents/grd-planner.md
```
Expected: matches for the clarification type, the recommended attribute, the 6b step, and the reconciled decisions line. Confirm no remaining `<user_decisions>` reference: `grep -n "user_decisions" agents/grd-planner.md` returns nothing.

- [ ] **Step 5: Commit**

```bash
git add agents/grd-planner.md
git commit -m "feat(planner): clarification checkpoint return + decisions-channel reconcile

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 5: Resolve & inject `clarification_allowed`; render the checkpoint in `plan-phase.md`

**Files:**
- Modify: `commands/plan-phase.md` (planner spawn §8 ~244-325; planner-return §9 ~327-331; revision/continuation §12 ~387-440)

- [ ] **Step 1: Resolve the signal before spawning the planner**

In `commands/plan-phase.md`, at the start of `## 8. Spawn grd-planner Agent` (after line 244, before the banner), insert:

```markdown
**Resolve `clarification_allowed` (one time, before spawning):**

​```bash
PLAN_CLARIFY=$(jq -r '.research_gates.plan_clarification // true' .planning/config.json 2>/dev/null)
​```

`clarification_allowed` = `true` ONLY IF all hold:
- `PLAN_CLARIFY` is `true` (default when the key is absent), AND
- `autonomous_mode` is NOT true (from init JSON), AND
- this run is NOT under autopilot (autopilot injects a "no questions" instruction — treat that as `false`), AND
- NOT `--candidates N` with N > 1.

Otherwise `clarification_allowed` = `false`. Initialize `clarification_rounds = 0`.
```

- [ ] **Step 2: Inject the signal into the planner prompt**

In the planner prompt's `<planning_context>` block, add a line right after `**Mode:** {standard | gap_closure}` (line 266):

```markdown
**Clarification:** {clarification_allowed}
```

- [ ] **Step 3: Route the clarification checkpoint to AskUserQuestion**

In `## 9. Handle Planner Return`, replace the `## CHECKPOINT REACHED` bullet (line 330):

```markdown
- **`## CHECKPOINT REACHED`:** Present to user, get response, spawn continuation (step 12)
```

with:

```markdown
- **`## CHECKPOINT REACHED`:**
  - If `TYPE: clarification` AND `clarification_rounds < 2`: parse each
    `<question>` and call **AskUserQuestion** (all questions in one call, max 4;
    for each, the `<option recommended="true">` is listed FIRST and labeled
    "(Recommended)"). Increment `clarification_rounds`. De-dupe: never re-ask a
    question `id` already answered. Then spawn the clarification continuation
    (step 12b) carrying the answers.
  - If `TYPE: clarification` AND `clarification_rounds >= 2`: stop asking; spawn
    the continuation with the planner's recommended defaults as decisions.
  - Otherwise (non-clarification checkpoint): present to user, get response,
    spawn continuation (step 12) as before.
```

- [ ] **Step 4: Add the clarification continuation (step 12b)**

In `commands/plan-phase.md`, immediately after the `## 12. Revision Loop` section (before `## 13`), add:

```markdown
## 12b. Clarification Continuation

Spawn the planner again with the answers folded in as locked decisions:

​```markdown
<resume_context>
**Phase:** {phase_number}
**Mode:** resume_after_clarification

**Phase Context:**
{context_content}

## Decisions
{for each answered question: "- {ask} → {chosen option text}"}
</resume_context>

<instructions>
These ## Decisions are now LOCKED. Do NOT raise another clarification
checkpoint for them. Write PLAN.md honoring them, then return
## PLANNING COMPLETE.
</instructions>
​```

​```
Task(
  prompt="First, read ${CLAUDE_PLUGIN_ROOT}/agents/grd-planner.md for your role and instructions.\n\n" + resume_prompt,
  subagent_type="general-purpose",
  model="{planner_model}",
  description="Resume Phase {phase} planning after clarification"
)
​```

On return, handle `## PLANNING COMPLETE` (step 9) normally. If the planner
raises another clarification checkpoint and `clarification_rounds >= 2`, proceed
with its recommended defaults (do not loop further).
```

- [ ] **Step 5: Verify**

Run:
```bash
grep -nE "plan_clarification // true|clarification_allowed|clarification_rounds < 2|12b\. Clarification|Clarification:\}" commands/plan-phase.md
```
Expected: matches for the jq read, the signal, the round cap, the 12b section, and the injected prompt line.

- [ ] **Step 6: Commit**

```bash
git add commands/plan-phase.md
git commit -m "feat(plan-phase): render clarification checkpoint via AskUserQuestion, gated + bounded

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 6: Add the `plan_clarification` gate to settings

**Files:**
- Modify: `commands/settings.md` (gate box ~91; YOLO json ~123)

- [ ] **Step 1: Add to the gate-status box**

In `commands/settings.md`, in the `Research gates:` box, add a line right after the `phase_plan_approval:` line (line 91):

```
║    plan_clarification:    {on/off}                          ║
```

- [ ] **Step 2: Add to the YOLO-disable json**

In the YOLO `research_gates` json (~line 123), add the key after `"phase_plan_approval": false,`:

```json
       "plan_clarification": false,
```

- [ ] **Step 3: Verify**

Run: `grep -n "plan_clarification" commands/settings.md`
Expected: two matches (box + YOLO json).

- [ ] **Step 4: Commit**

```bash
git add commands/settings.md
git commit -m "feat(settings): expose research_gates.plan_clarification (default on, off in YOLO)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 7: Enrich `discuss-phase.md` intake taxonomy

**Files:**
- Modify: `commands/discuss-phase.md` (`analyze_phase` step ~58-65)

- [ ] **Step 1: Expand the gray-area categories**

In `commands/discuss-phase.md`, in the `<step name="analyze_phase">` block, replace the line:

```markdown
2. **Gray areas by category** — For each relevant category, identify 1-2 specific ambiguities
```

with:

```markdown
2. **Gray areas by category** — For each relevant category, identify 1-2
   specific ambiguities. Cover at least these design-spec categories so fewer
   ambiguities survive to the planner's clarification checkpoint:
   - **Architecture / layout** — module boundaries, where new code lives
   - **Libraries / dependencies** — which lib, or build vs. reuse
   - **Interfaces / data flow** — contracts between units, data shapes
   - **Scope boundaries** — what is explicitly in vs. deferred
   - **Error-handling posture** — fail-closed vs. fallback, surfacing vs. swallowing
```

- [ ] **Step 2: Verify**

Run: `grep -nE "Error-handling posture|Scope boundaries|Interfaces / data flow" commands/discuss-phase.md`
Expected: matches present.

- [ ] **Step 3: Commit**

```bash
git add commands/discuss-phase.md
git commit -m "feat(discuss-phase): enrich design-spec gray-area taxonomy

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 8: Document the flag in CLAUDE.md + end-to-end acceptance checks

**Files:**
- Modify: `CLAUDE.md` (GRD repo root — `research_gates` mention ~line 82 of the Autoresearch-loop section)

- [ ] **Step 1: Document the gate**

In the GRD repo `CLAUDE.md`, find the sentence listing config keys (contains `` `research_gates` ``, ~line 82) and append after it:

```markdown
`research_gates.plan_clarification` (default on) makes `plan-phase` ask the user
via AskUserQuestion to resolve ambiguous, unlocked design/implementation
decisions mid-planning (planner raises a `TYPE: clarification` checkpoint);
auto-skipped under `autonomous_mode`, autopilot, and `--candidates N>1`.
```

- [ ] **Step 2: Verify docs**

Run: `grep -n "plan_clarification" CLAUDE.md`
Expected: one match.

- [ ] **Step 3: End-to-end acceptance checks (manual, document results in the commit)**

Run each and confirm:
1. Settings surface: `grep -c plan_clarification commands/settings.md` → `2`.
2. Default-on read: `jq -r '.research_gates.plan_clarification // true' .planning/config.json` → `true` (key absent ⇒ default true).
3. Gating consistency: confirm `commands/plan-phase.md` forces `clarification_allowed=false` for autonomous_mode, autopilot, and `--candidates N>1` (re-read Task 5 Step 1 block).
4. Contract wiring: planner emits `TYPE: clarification`; orchestrator parses it and answers feed back as `## Decisions` (re-read Task 4 + Task 5 step 4).

- [ ] **Step 4: Full suite + lint/typecheck**

Run (with TMPDIR outside the repo per CLAUDE.md test hygiene):
```bash
TMPDIR=$(mktemp -d) npm run lint && npm run build:check && npx jest tests/unit/harness-conformance.test.ts tests/unit/harness-upstream.test.ts
```
Expected: lint/tsc clean; both python-wrapper suites pass (or skip if python3/autoresearch_core unavailable).

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document research_gates.plan_clarification gate

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Self-Review (completed during authoring)

- **Spec coverage:** Feature 1 ports + classifier + timeout/OSError → Tasks 1-2; jest wrapper → Task 3. Feature 2 planner emit/gate → Task 4; orchestrator render/bound → Task 5; settings flag → Task 6; discuss-phase enrich → Task 7; CLAUDE.md doc + acceptance → Task 8. Existing-debt reconcile (`<user_decisions>`) → Task 4 Step 3. All spec sections mapped.
- **Placeholder scan:** none — every code/markdown step shows literal content.
- **Type/name consistency:** `_run_check` defined (Task 2) and used (Task 2); `clarification_allowed` / `clarification_rounds` introduced (Task 5 Step 1) and used (Steps 3-4); `TYPE: clarification` emitted (Task 4) and consumed (Task 5); answers→`## Decisions` channel reconciled (Task 4 Step 3) and used (Task 5 Step 4). Consistent.
```
