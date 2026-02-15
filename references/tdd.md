<overview>
TDD is about design quality, not coverage metrics. The red-green-refactor cycle forces you to think about behavior before implementation, producing cleaner interfaces and more testable code.

**Principle:** If you can describe the behavior as `expect(fn(input)).toBe(output)` before writing `fn`, TDD improves the result.

**Key insight:** TDD work is fundamentally heavier than standard tasks -- it requires 2-3 execution cycles (RED, GREEN, REFACTOR), each with file reads, test runs, and potential debugging. TDD features get dedicated plans to ensure full context is available throughout the cycle.
</overview>

<when_to_use_tdd>
## When TDD Improves Quality

**TDD candidates (create a TDD plan):**
- Data processing pipelines with defined inputs/outputs
- Metric computation functions (PSNR, SSIM, custom metrics)
- Data augmentation transforms
- Configuration parsing and validation
- API endpoints with request/response contracts
- Utility functions with clear specifications
- Loss function implementations

**Skip TDD (use standard plan with `type="auto"` tasks):**
- Model architecture definition (hard to test before training)
- Training loop orchestration
- Visualization/plotting code
- Configuration changes
- Glue code connecting existing components
- Exploratory prototyping
- One-off scripts

**Heuristic:** Can you write `expect(fn(input)).toBe(output)` before writing `fn`?
If yes: Create a TDD plan.
If no: Use standard plan, add tests after if needed.
</when_to_use_tdd>

<tdd_plan_structure>
## TDD Plan Structure

Each TDD plan implements **one feature** through the full RED-GREEN-REFACTOR cycle.

```markdown
---
phase: XX-name
plan: NN
type: tdd
phase_type: implement
verification_level: sanity
---

<objective>
[What feature and why]
Purpose: [Design benefit of TDD for this feature]
Output: [Working, tested feature]
</objective>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@relevant/source/files.py
</context>

<feature>
  <name>[Feature name]</name>
  <files>[source file, test file]</files>
  <behavior>
    [Expected behavior in testable terms]
    Cases: input -> expected output
  </behavior>
  <implementation>[How to implement once tests pass]</implementation>
</feature>

<verification>
[Test command that proves feature works]
</verification>

<success_criteria>
- Failing test written and committed
- Implementation passes test
- Refactor complete (if needed)
- All 2-3 commits present
</success_criteria>

<output>
After completion, create SUMMARY.md with:
- RED: What test was written, why it failed
- GREEN: What implementation made it pass
- REFACTOR: What cleanup was done (if any)
- Commits: List of commits produced
</output>
```

**One feature per TDD plan.** If features are trivial enough to batch, they are trivial enough to skip TDD -- use a standard plan and add tests after.
</tdd_plan_structure>

<execution_flow>
## Red-Green-Refactor Cycle

**RED - Write failing test:**
1. Create test file following project conventions
2. Write test describing expected behavior (from `<behavior>` element)
3. Run test - it MUST fail
4. If test passes: feature exists or test is wrong. Investigate.
5. Commit: `test({phase}-{plan}): add failing test for [feature]`

**GREEN - Implement to pass:**
1. Write minimal code to make test pass
2. No cleverness, no optimization - just make it work
3. Run test - it MUST pass
4. Commit: `feat({phase}-{plan}): implement [feature]`

**REFACTOR (if needed):**
1. Clean up implementation if obvious improvements exist
2. Run tests - MUST still pass
3. Only commit if changes made: `refactor({phase}-{plan}): clean up [feature]`

**Result:** Each TDD plan produces 2-3 atomic commits.
</execution_flow>

<test_quality>
## Good Tests vs Bad Tests

**Test behavior, not implementation:**
- Good: "returns PSNR value within expected range for known input pair"
- Bad: "calls torch.log10 with correct params"
- Tests should survive refactors

**One concept per test:**
- Good: Separate tests for valid input, empty input, mismatched dimensions
- Bad: Single test checking all edge cases with multiple assertions

**Descriptive names:**
- Good: "should compute PSNR correctly for identical images", "returns inf for zero MSE"
- Bad: "test1", "handles error", "works correctly"

**No implementation details:**
- Good: Test public API, observable behavior
- Bad: Mock internals, test private methods, assert on internal state
</test_quality>

<framework_setup>
## Test Framework Setup (If None Exists)

When executing a TDD plan but no test framework is configured, set it up as part of the RED phase:

**1. Detect project type:**
```bash
# Python (most common in R&D)
if [ -f requirements.txt ] || [ -f pyproject.toml ] || [ -f setup.py ]; then echo "python"; fi

# JavaScript/TypeScript
if [ -f package.json ]; then echo "node"; fi
```

**2. Install minimal framework:**
| Project | Framework | Install |
|---------|-----------|---------|
| Python | pytest | `pip install pytest` |
| Node.js | Jest | `npm install -D jest` |
| Node.js (Vite) | Vitest | `npm install -D vitest` |

Framework setup is a one-time cost included in the first TDD plan's RED phase.
</framework_setup>

<commit_pattern>
## Commit Pattern for TDD Plans

TDD plans produce 2-3 atomic commits (one per phase):

```
test(08-02): add failing test for PSNR computation

- Tests PSNR for identical images (expected: inf)
- Tests PSNR for known difference (expected: 30.0 dB)
- Tests edge case: zero-valued images

feat(08-02): implement PSNR computation

- Uses MSE-based formula: 10 * log10(MAX^2 / MSE)
- Handles identical images (returns inf)
- Supports batch computation

refactor(08-02): extract max_val to parameter (optional)

- Made max_val configurable (default 1.0 for normalized images)
- No behavior changes
- Tests still pass
```

Both follow same format: `{type}({phase}-{plan}): {description}`
</commit_pattern>

<context_budget>
## Context Budget

TDD plans target **~40% context usage** (lower than standard plans' ~50%).

Why lower:
- RED phase: write test, run test, potentially debug why it didn't fail
- GREEN phase: implement, run test, potentially iterate on failures
- REFACTOR phase: modify code, run tests, verify no regressions

Each phase involves reading files, running commands, analyzing output. The back-and-forth is inherently heavier than linear task execution.

Single feature focus ensures full quality throughout the cycle.
</context_budget>
