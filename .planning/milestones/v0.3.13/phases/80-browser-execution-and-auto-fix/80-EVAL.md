# Evaluation Plan: Phase 80 — Browser Execution and Auto-Fix

**Designed:** 2026-03-20
**Designer:** Claude (grd-eval-planner)
**Method(s) evaluated:** Playwright MCP detection, browser scenario execution, confidence-gated auto-fix, WIREUP-REPORT.md generation
**Reference:** Milestone ROADMAP.md — Phase 80 success criteria; REQ-124, REQ-127, REQ-129

## Evaluation Overview

Phase 80 is a pure implementation phase across three plans in two waves. Wave 1 (plans 80-01 and 80-02) is independently executable: Playwright detection and browser scenario execution (plan 80-01) have no dependency on auto-fix (plan 80-02), and both can be verified structurally before Wave 2. Wave 2 (plan 80-03) depends on wave 1 artifacts and adds report generation wired into the orchestrator from Phase 79.

No research papers or external benchmarks apply. All targets trace directly to requirement language in REQ-124, REQ-127, and REQ-129, and to the `must_haves` truths in each plan file.

The key risks for this phase are: (1) the lib/wireup/ directory does not exist yet — all three plans create new files into it, and if Phase 78/79 artifacts are absent the TypeScript compiler will fail on imports; (2) the auto-fix confidence gating must be tested without a live Playwright session or real git worktree, making full end-to-end verification impossible at this stage; (3) WIREUP-REPORT.md iteration history preservation is stateful and depends on disk I/O that cannot be exercised via type-checking alone. All three risks are addressed explicitly in the deferred tier.

### Metric Sources

| Metric | Source | Why This Metric |
|--------|--------|----------------|
| detectPlaywright() returns structured result with available/source/reason | REQ-124 / plan 80-01 must_haves | Direct structural contract from the requirement |
| Playwright detection waterfall: config -> env -> mcp-config -> default | REQ-124 / plan 80-01 must_haves | Waterfall priority order is explicitly required |
| executeBrowserScenario() returns status 'skipped' when playwright_available=false | REQ-124 / plan 80-01 must_haves | Graceful degradation is the core safety requirement |
| executeBrowserScenario() returns manual_steps when skipping | REQ-124 / plan 80-01 must_haves | Manual steps are the user-facing output when browser is unavailable |
| autoFixIssue() only attempts high-confidence issues | REQ-127 / plan 80-02 must_haves | Confidence gate is the primary safety invariant |
| autoFixIssue() uses SONNET_MODEL (imported, not redeclared) | REQ-127 / plan 80-02 must_haves | Model ceiling is a hard product requirement across the milestone |
| classifyFixConfidence() returns 'high' for missing-import/missing-export/missing-route | REQ-127 / plan 80-02 must_haves | Classification accuracy drives fix safety |
| classifyFixConfidence() returns 'low' for broken-nav-link/missing-env-var | REQ-127 / plan 80-02 must_haves | Low-confidence issues must never be auto-applied |
| partitionByConfidence() separates high from medium/low | REQ-127 / plan 80-02 must_haves | Partition correctness is the prerequisite for the manual review section |
| generateWireupReport() writes WIREUP-REPORT.md to milestone wireup/ directory | REQ-129 / plan 80-03 must_haves | File location is specified in the requirement |
| Report contains all required sections (Summary, Issues, Fixes, Manual Review, Remaining, History) | REQ-129 / plan 80-03 must_haves | Section completeness is the content contract |
| Second call appends a new row to Iteration History without losing existing rows | REQ-129 / plan 80-03 must_haves | History preservation is the trend-tracking invariant |
| npm run build:check passes | CLAUDE.md / TypeScript strict mode | Type safety is a project-level quality gate |
| npm run lint passes | CLAUDE.md / ESLint pre-commit hook | Lint is enforced on every commit |

### Verification Level Summary

| Level | Count | Purpose |
|-------|-------|---------|
| Sanity (L1) | 10 | Structural and compile-time correctness — files exist, types compile, exports are present |
| Proxy (L2) | 9 | Behavioral correctness via runtime node invocations and grep-based contract checks |
| Deferred (L3) | 3 | End-to-end browser execution and fix application — requires live Playwright MCP or Phase 81 integration fixture |

## Level 1: Sanity Checks

**Purpose:** Verify basic structural and compile-time correctness. These MUST ALL PASS before proceeding.

### S1: TypeScript compiles without errors (full project)
- **What:** `npx tsc --noEmit` passes on the full project including all new wireup files
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && npx tsc --noEmit`
- **Expected:** Exit 0, no output
- **Failure means:** Type errors in new files or import resolution failures (likely missing Phase 78/79 artifacts or incorrect import paths)

### S2: ESLint passes on new files
- **What:** `npm run lint` passes (pre-commit hook runs this automatically)
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && npm run lint`
- **Expected:** Exit 0, no lint errors
- **Failure means:** Code style violations that would block commits

### S3: lib/wireup/autofix.ts exists and is non-empty
- **What:** The auto-fix module was created as an artifact of plan 80-02
- **Command:** `test -s /Users/neo/Developer/Projects/GetResearchDone/lib/wireup/autofix.ts`
- **Expected:** Exit 0 (file exists and has size > 0)
- **Failure means:** Plan 80-02 did not complete; all auto-fix checks will fail

### S4: lib/wireup/report.ts exists and is non-empty
- **What:** The report generation module was created as an artifact of plan 80-03
- **Command:** `test -s /Users/neo/Developer/Projects/GetResearchDone/lib/wireup/report.ts`
- **Expected:** Exit 0
- **Failure means:** Plan 80-03 did not complete

### S5: detectPlaywright exported from lib/backend.ts
- **What:** The detection function is defined and exported from the backend module
- **Command:** `grep -c "detectPlaywright" /Users/neo/Developer/Projects/GetResearchDone/lib/backend.ts`
- **Expected:** Count >= 2 (definition line + export line)
- **Failure means:** Plan 80-01 task 1 did not complete or export was omitted

### S6: executeBrowserScenario and generateManualSteps exist in lib/wireup/execution.ts
- **What:** Both functions are defined in execution.ts and re-exported from lib/wireup/index.ts
- **Command:** `grep -c "executeBrowserScenario\|generateManualSteps" /Users/neo/Developer/Projects/GetResearchDone/lib/wireup/execution.ts && grep -c "executeBrowserScenario\|generateManualSteps" /Users/neo/Developer/Projects/GetResearchDone/lib/wireup/index.ts`
- **Expected:** Both counts >= 1
- **Failure means:** Plan 80-01 task 2 did not complete or barrel re-export was omitted

### S7: All four auto-fix functions defined in lib/wireup/autofix.ts
- **What:** autoFixIssue, classifyFixConfidence, updateFixOutcome, partitionByConfidence all exist
- **Command:** `grep -c "autoFixIssue\|classifyFixConfidence\|updateFixOutcome\|partitionByConfidence" /Users/neo/Developer/Projects/GetResearchDone/lib/wireup/autofix.ts`
- **Expected:** Count >= 4
- **Failure means:** Plan 80-02 is incomplete

### S8: All four auto-fix functions re-exported from lib/wireup/index.ts
- **What:** The barrel exports all auto-fix functions
- **Command:** `grep -c "autoFixIssue\|classifyFixConfidence\|updateFixOutcome\|partitionByConfidence" /Users/neo/Developer/Projects/GetResearchDone/lib/wireup/index.ts`
- **Expected:** Count >= 4
- **Failure means:** Consumers of lib/wireup cannot import auto-fix functions

### S9: SONNET_MODEL imported in autofix.ts, not redeclared
- **What:** autofix.ts imports SONNET_MODEL from ./state rather than hardcoding a model string
- **Command:** `grep "SONNET_MODEL" /Users/neo/Developer/Projects/GetResearchDone/lib/wireup/autofix.ts | grep -q "require\|import"`
- **Expected:** Exit 0 (at least one line importing SONNET_MODEL)
- **Failure means:** Model ceiling enforcement broken — autofix.ts has its own constant that could drift

### S10: generateWireupReport and formatReportPath re-exported from lib/wireup/index.ts
- **What:** The barrel exports the two primary report functions
- **Command:** `grep -c "generateWireupReport\|formatReportPath" /Users/neo/Developer/Projects/GetResearchDone/lib/wireup/index.ts`
- **Expected:** Count >= 2
- **Failure means:** Report generation is not accessible to the orchestrator via the barrel

**Sanity gate:** ALL sanity checks must pass. Any failure blocks progression.

## Level 2: Proxy Metrics

**Purpose:** Behavioral correctness via runtime node invocations and grep-based contract inspection.
**IMPORTANT:** Proxy metrics are NOT validated substitutes for full end-to-end evaluation. Results are informative but do not confirm correct behavior under live Playwright or real git conditions.

### P1: executeBrowserScenario returns 'skipped' with manual_steps when playwright_available=false
- **What:** The graceful degradation path produces the correct structured output
- **How:** Require the module and call executeBrowserScenario with a minimal scenario and playwrightAvailable=false
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && node -e "const {executeBrowserScenario} = require('./lib/wireup'); const result = executeBrowserScenario('.', {steps:[{action:'navigate',url:'http://localhost:3000'}]}, false); console.log(JSON.stringify({status:result.status,hasSkipReason:!!result.skip_reason,hasManualSteps:Array.isArray(result.manual_steps)&&result.manual_steps.length>0}))"`
- **Target:** `{"status":"skipped","hasSkipReason":true,"hasManualSteps":true}`
- **Evidence:** Plan 80-01 must_haves truth 3 directly specifies this behavior
- **Correlation with full metric:** HIGH — this exercises the exact code path required by REQ-124's graceful-skip contract
- **Blind spots:** Does not verify the manual_steps text is human-readable or accurate for all step types
- **Validated:** No — awaiting deferred validation at phase-81-integration

### P2: executeBrowserScenario returns steps array matching scenario length when playwright_available=true
- **What:** The execution plan path produces a result with one step entry per input step
- **How:** Call executeBrowserScenario with playwrightAvailable=true and a 2-step scenario
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && node -e "const {executeBrowserScenario} = require('./lib/wireup'); const steps=[{action:'navigate',url:'http://localhost:3000'},{action:'snapshot'}]; const result = executeBrowserScenario('.', {steps}, true); console.log(JSON.stringify({status:result.status,stepCount:result.steps.length,expected:steps.length,match:result.steps.length===steps.length}))"`
- **Target:** `match: true` (step count equals input step count)
- **Evidence:** Plan 80-01 must_haves truth 5 specifies step-level results
- **Correlation with full metric:** MEDIUM — verifies structure but not that the MCP tool payloads are correct; actual execution delegated to orchestrator agent
- **Blind spots:** Does not verify MCP tool name mappings (navigate -> browser_navigate, etc.); no browser is invoked
- **Validated:** No — awaiting deferred validation at phase-81-integration

### P3: classifyFixConfidence returns correct tier for high-confidence issue types
- **What:** missing-import, missing-export, missing-route all return 'high'
- **How:** Call classifyFixConfidence for each high-confidence issue type
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && node -e "const {classifyFixConfidence} = require('./lib/wireup'); const types=['missing-import','missing-export','missing-route']; const results=types.map(t=>({type:t,confidence:classifyFixConfidence({issue_type:t,source_file:'a.ts',target_file:'b.ts',suggested_fix:'x',confidence:'high'})})); console.log(JSON.stringify(results.every(r=>r.confidence==='high')))"`
- **Target:** `true`
- **Evidence:** Plan 80-02 must_haves and task 1 step 3 specify this classification rule explicitly
- **Correlation with full metric:** HIGH — directly exercises the decision logic that gates auto-fix attempts
- **Blind spots:** Does not test edge cases (e.g., issue_type values not in the enum)
- **Validated:** No — awaiting deferred validation at phase-81-integration

### P4: classifyFixConfidence returns 'low' for broken-nav-link and missing-env-var
- **What:** Low-confidence types are never escalated to auto-fix
- **How:** Call classifyFixConfidence for both low-confidence types
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && node -e "const {classifyFixConfidence} = require('./lib/wireup'); const types=['broken-nav-link','missing-env-var']; const results=types.map(t=>classifyFixConfidence({issue_type:t,source_file:'a.ts',target_file:'b.ts',suggested_fix:'x',confidence:'low'})); console.log(JSON.stringify(results.every(r=>r==='low')))"`
- **Target:** `true`
- **Evidence:** Plan 80-02 task 1 step 3 lists these as low-confidence by issue type
- **Correlation with full metric:** HIGH — safety invariant: these types must never be auto-applied
- **Blind spots:** Does not test that autoFixIssue actually refuses low-confidence issues at the call site
- **Validated:** No — awaiting deferred validation at phase-81-integration

### P5: autoFixIssue returns fix_status 'skipped' for non-high-confidence issues without calling reRunFn
- **What:** The confidence gate in autoFixIssue prevents fix attempts for medium/low issues
- **How:** Call autoFixIssue with a low-confidence issue and a reRunFn that throws if called
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && node -e "const {autoFixIssue} = require('./lib/wireup'); const issue={issue_type:'missing-env-var',source_file:'a.ts',target_file:'b.ts',suggested_fix:'add KEY=value to .env',confidence:'low'}; const reRunFn=async()=>{throw new Error('reRunFn must not be called for low-confidence issues')}; autoFixIssue('.', issue, reRunFn).then(r=>console.log(JSON.stringify({fix_status:r.fix_status,correct:r.fix_status==='skipped'}))).catch(e=>console.error('FAIL:',e.message))"`
- **Target:** `{"fix_status":"skipped","correct":true}` with no error output
- **Evidence:** Plan 80-02 must_haves truth 1 and task 1 step 4 guard clause
- **Correlation with full metric:** HIGH — this is the primary safety invariant for the auto-fix feature
- **Blind spots:** Does not test that high-confidence issues actually invoke reRunFn; cannot test fix application without a real git repo
- **Validated:** No — awaiting deferred validation at phase-81-integration

### P6: partitionByConfidence correctly separates high from medium/low issues
- **What:** High-confidence issues go to the auto-fix bucket; medium/low go to manual review
- **How:** Call partitionByConfidence with a mixed list and verify the partition
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && node -e "const {partitionByConfidence} = require('./lib/wireup'); const issues=[{issue_type:'missing-import',confidence:'high'},{issue_type:'unconnected-handler',confidence:'medium'},{issue_type:'missing-env-var',confidence:'low'}]; const result=partitionByConfidence(issues); console.log(JSON.stringify({manualReviewCount:result.requires_manual_review.length,hasModelUsed:!!result.model_used,correctPartition:result.requires_manual_review.length===2}))"`
- **Target:** `{"manualReviewCount":2,"hasModelUsed":true,"correctPartition":true}`
- **Evidence:** Plan 80-02 task 1 step 7 specifies partition logic
- **Correlation with full metric:** HIGH — partition drives what appears in the Manual Review section of the report
- **Blind spots:** Does not verify the model_used value is a sonnet-tier string
- **Validated:** No — awaiting deferred validation at phase-81-integration

### P7: generateWireupReport is callable as a function from the barrel
- **What:** The report function is importable and is of type 'function'
- **How:** Require the barrel and check the type
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && node -e "const w = require('./lib/wireup'); console.log(JSON.stringify({generateWireupReport:typeof w.generateWireupReport,formatReportPath:typeof w.formatReportPath}))"`
- **Target:** `{"generateWireupReport":"function","formatReportPath":"function"}`
- **Evidence:** Plan 80-03 must_haves and artifact exports list
- **Correlation with full metric:** LOW — confirms importability only; does not verify report content or disk write
- **Blind spots:** Does not call the function or verify the markdown output
- **Validated:** No — awaiting deferred validation at phase-81-integration

### P8: generateWireupReport writes a file with expected heading structure (disk smoke test)
- **What:** Calling generateWireupReport with minimal sample data creates a markdown file on disk
- **How:** Call the function with a temp cwd, verify file exists and contains required headings
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && node -e "const fs=require('fs'),os=require('os'),path=require('path'); const {generateWireupReport}=require('./lib/wireup'); const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'wireup-')); fs.mkdirSync(path.join(tmp,'.planning','milestones','v0.3.13','wireup'),{recursive:true}); fs.writeFileSync(path.join(tmp,'.planning','config.json'),JSON.stringify({milestone:'v0.3.13'})); const data={milestone:'v0.3.13',iteration:1,timestamp:'2026-03-20T00:00:00Z',features_tested:1,scenarios:{total:1,passed:1,failed:0,skipped:0},issues_found:[],fixes:{applied:[],verified:0,failed:0,skipped:0},remaining_unwired:[],manual_review:[]}; generateWireupReport(tmp,data); const report=path.join(tmp,'.planning','milestones','v0.3.13','wireup','WIREUP-REPORT.md'); const content=fs.readFileSync(report,'utf8'); const hasAllSections=['## Summary','## Issues Found','## Fixes Applied','## Requires Manual Review','## Remaining Unwired Features','## Iteration History'].every(h=>content.includes(h)); console.log(JSON.stringify({fileExists:fs.existsSync(report),hasAllSections}))"`
- **Target:** `{"fileExists":true,"hasAllSections":true}`
- **Evidence:** Plan 80-03 must_haves lists all required sections explicitly
- **Correlation with full metric:** MEDIUM — verifies section presence but not content accuracy or history append behavior
- **Blind spots:** Does not test the iteration history append path (second call); uses a temp directory not a real milestone path
- **Validated:** No — awaiting deferred validation at phase-81-integration

### P9: Second generateWireupReport call appends history row without losing existing rows
- **What:** Iteration history preservation across calls is the trend-tracking invariant
- **How:** Call generateWireupReport twice with different iteration numbers; verify history table has 2 rows
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && node -e "const fs=require('fs'),os=require('os'),path=require('path'); const {generateWireupReport}=require('./lib/wireup'); const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'wireup2-')); fs.mkdirSync(path.join(tmp,'.planning','milestones','v0.3.13','wireup'),{recursive:true}); fs.writeFileSync(path.join(tmp,'.planning','config.json'),JSON.stringify({milestone:'v0.3.13'})); const base={milestone:'v0.3.13',timestamp:'2026-03-20T00:00:00Z',features_tested:1,scenarios:{total:1,passed:1,failed:0,skipped:0},issues_found:[],fixes:{applied:[],verified:0,failed:0,skipped:0},remaining_unwired:[],manual_review:[]}; generateWireupReport(tmp,{...base,iteration:1}); generateWireupReport(tmp,{...base,iteration:2}); const report=path.join(tmp,'.planning','milestones','v0.3.13','wireup','WIREUP-REPORT.md'); const content=fs.readFileSync(report,'utf8'); const historySection=content.split('## Iteration History')[1]||''; const dataRows=(historySection.match(/^\|[^-|]/mg)||[]).length; console.log(JSON.stringify({dataRows,correct:dataRows===2}))"`
- **Target:** `{"dataRows":2,"correct":true}`
- **Evidence:** Plan 80-03 must_haves truth 3 specifically requires history append without data loss
- **Correlation with full metric:** HIGH — directly tests the stateful invariant that enables trend tracking
- **Blind spots:** Uses a synthetic temp directory; does not test with a real existing report that has complex content
- **Validated:** No — awaiting deferred validation at phase-81-integration

## Level 3: Deferred Validations

**Purpose:** Full validation requiring live browser infrastructure or a real project integration fixture not available during this phase.

### D1: Live Playwright MCP browser scenario execution — DEFER-80-01
- **What:** executeBrowserScenario() correctly drives a real browser via Playwright MCP tools (navigate, fill, click, snapshot) and returns accurate step pass/fail results
- **How:** Configure @anthropic/mcp-playwright in the test environment, run executeBrowserScenario against a running local app, and verify DOM snapshots and console errors are captured
- **Why deferred:** No Playwright MCP server is available in the CI environment; executing browser tool calls requires an agent context (orchestrator), not direct function invocation; the wireup command itself does not exist until Phase 81 integration
- **Validates at:** phase-81-mcp-tools-testing-and-integration
- **Depends on:** Phase 81 integration test fixture with a running app; Playwright MCP server configured in test environment
- **Target:** All 5 step types (navigate, fill, click, snapshot, evaluate) execute without error; step results have status 'passed' when selectors exist; console_errors array captures JavaScript errors from the page
- **Risk if unmet:** Browser scenarios silently produce empty or wrong results in production; teams get false confidence from 'skipped' reports — REQ-124 is not validated
- **Fallback:** Manual testing via the tutorial project in examples/taskmark/ with Playwright MCP enabled

### D2: Auto-fix applies a real code change and verifies via re-run — DEFER-80-02
- **What:** autoFixIssue() for a high-confidence missing-import issue produces a fix prompt that, when executed by a sonnet-tier subagent, correctly modifies the source file and the subsequent re-run passes
- **How:** In Phase 81 integration fixture, inject a known missing-import issue, run the wireup auto-fix flow, and verify the file is modified correctly and the re-run scenario passes
- **Why deferred:** autoFixIssue() returns a prompt + metadata but delegates actual file modification to the orchestrator agent; testing real fix application requires a git repo, subagent invocation, and a re-runnable scenario — none of which exist in unit test scope
- **Validates at:** phase-81-mcp-tools-testing-and-integration
- **Depends on:** Phase 81 integration fixture; running wireup orchestrator; a scenario that fails predictably due to a missing import
- **Target:** fix_status is 'verified'; rerun_passed is true; the modified file contains the expected import statement; git history shows a wireup: fix commit
- **Risk if unmet:** Auto-fix applies changes that do not fix the scenario (or causes regressions); REQ-127 re-run verification is untested — medium probability of silent failure
- **Fallback:** Disable auto-fix (confidence gate set to never-apply) until manual testing confirms fix quality

### D3: Full orchestrator integration with report generation — DEFER-80-03
- **What:** A complete wireup iteration (discover -> generate -> execute -> detect -> autofix -> report) produces a correct WIREUP-REPORT.md in the live milestone wireup/ directory, with the orchestrator correctly populating iteration_history in WIREUP-STATE.json
- **How:** Run /grd:wireup against the Phase 81 integration fixture; verify the report file content, the iteration_history array in state, and that a second run appends a new history row
- **Why deferred:** The generateWireupReport -> orchestrator connection (plan 80-03 task 2) requires the Phase 79 orchestrator to be wired correctly; full pipeline testing requires the wireup command from Phase 81 to be functional
- **Validates at:** phase-81-mcp-tools-testing-and-integration
- **Depends on:** Phase 81 integration fixture; wireup command wired in; Phase 78/79/80 artifacts all present
- **Target:** WIREUP-REPORT.md exists in .planning/milestones/{milestone}/wireup/; contains all 6 required sections; WIREUP-STATE.json has at least one entry in iteration_history; second run appends without truncating history
- **Risk if unmet:** Report is generated but with wrong data (e.g., zero scenarios reported despite successful execution) — trend tracking is unreliable; REQ-129 not met
- **Fallback:** Direct unit tests for report content with mocked orchestrator state

## Ablation Plan

**No ablation plan** — Phase 80 implements three distinct capabilities (detection, auto-fix, reporting) with no sub-components or algorithm alternatives to compare. Each capability has a single specified implementation.

## WebMCP Tool Definitions

WebMCP tool definitions skipped — phase does not modify frontend views. All files modified are TypeScript library modules in lib/wireup/.

## Baselines

| Baseline | Description | Expected Score | Source |
|----------|-------------|----------------|--------|
| Phase 79 detectWebMcp() pattern | detectPlaywright() must follow the same waterfall structure | Identical structural pattern (config -> env -> mcp-config -> default) | Phase 79 EVAL.md + lib/backend.ts line 569 |
| Phase 79 SONNET_MODEL usage | autofix.ts must import SONNET_MODEL from ./state, not redeclare it | grep confirms single import source, zero redeclarations | Phase 79 must_haves + plan 80-02 must_haves truth 2 |
| Evolve orchestrator model pattern | Wireup auto-fix uses sonnet tier only, same as evolve | No opus-class model strings in lib/wireup/autofix.ts | lib/evolve/orchestrator.ts pattern |

## Evaluation Scripts

**Location of evaluation code:**
```
Inline node -e calls in each proxy metric above (no separate script files needed)
```

**How to run all Level 1 sanity checks:**
```bash
cd /Users/neo/Developer/Projects/GetResearchDone

# S1: TypeScript
npx tsc --noEmit

# S2: Lint
npm run lint

# S3-S4: File existence
test -s lib/wireup/autofix.ts && echo "S3 PASS" || echo "S3 FAIL"
test -s lib/wireup/report.ts && echo "S4 PASS" || echo "S4 FAIL"

# S5: detectPlaywright
grep -c "detectPlaywright" lib/backend.ts

# S6: execution functions
grep -c "executeBrowserScenario\|generateManualSteps" lib/wireup/execution.ts
grep -c "executeBrowserScenario\|generateManualSteps" lib/wireup/index.ts

# S7-S8: autofix functions
grep -c "autoFixIssue\|classifyFixConfidence\|updateFixOutcome\|partitionByConfidence" lib/wireup/autofix.ts
grep -c "autoFixIssue\|classifyFixConfidence\|updateFixOutcome\|partitionByConfidence" lib/wireup/index.ts

# S9: SONNET_MODEL import
grep "SONNET_MODEL" lib/wireup/autofix.ts | grep -q "require\|import" && echo "S9 PASS" || echo "S9 FAIL"

# S10: report exports
grep -c "generateWireupReport\|formatReportPath" lib/wireup/index.ts
```

## Results Template

*To be filled by grd-eval-reporter after phase execution.*

### Sanity Results

| Check | Status | Output | Notes |
|-------|--------|--------|-------|
| S1: TypeScript compiles | | | |
| S2: ESLint passes | | | |
| S3: lib/wireup/autofix.ts exists | | | |
| S4: lib/wireup/report.ts exists | | | |
| S5: detectPlaywright exported from backend.ts | | | |
| S6: executeBrowserScenario + generateManualSteps in execution.ts + index.ts | | | |
| S7: All 4 autofix functions in autofix.ts | | | |
| S8: All 4 autofix functions in index.ts | | | |
| S9: SONNET_MODEL imported not redeclared | | | |
| S10: generateWireupReport + formatReportPath in index.ts | | | |

### Proxy Results

| Metric | Target | Actual | Status | Notes |
|--------|--------|--------|--------|-------|
| P1: executeBrowserScenario skip path | status=skipped, skip_reason set, manual_steps non-empty | | | |
| P2: executeBrowserScenario execute path step count | steps.length matches input | | | |
| P3: classifyFixConfidence high-confidence types | all return 'high' | | | |
| P4: classifyFixConfidence low-confidence types | all return 'low' | | | |
| P5: autoFixIssue skips low-confidence without calling reRunFn | fix_status='skipped', no error | | | |
| P6: partitionByConfidence separates high from medium/low | manualReviewCount=2, correct=true | | | |
| P7: generateWireupReport callable from barrel | both 'function' | | | |
| P8: generateWireupReport writes file with all sections | fileExists=true, hasAllSections=true | | | |
| P9: Second call appends history row | dataRows=2, correct=true | | | |

### Deferred Status

| ID | Metric | Status | Validates At |
|----|--------|--------|-------------|
| DEFER-80-01 | Live Playwright MCP browser execution | PENDING | phase-81-mcp-tools-testing-and-integration |
| DEFER-80-02 | Auto-fix real code change + re-run verification | PENDING | phase-81-mcp-tools-testing-and-integration |
| DEFER-80-03 | Full orchestrator integration with report generation | PENDING | phase-81-mcp-tools-testing-and-integration |

## Evaluation Confidence

**Overall confidence in evaluation design:** MEDIUM

**Justification:**
- Sanity checks: Adequate — TypeScript compilation and grep-based structural checks cover all required exports and the SONNET_MODEL import invariant
- Proxy metrics: Well-evidenced for behavior that is independently testable (classification logic, partition logic, skip path, history append). Weak for behavior that requires the orchestrator agent context (actual fix application, actual browser tool invocation) — those are honestly deferred
- Deferred coverage: Comprehensive for the three gaps identified — live browser, real fix application, and full pipeline integration are all addressed in Phase 81

**What this evaluation CAN tell us:**
- All required functions exist, compile cleanly, and are exported correctly from the barrel
- The confidence gate in autoFixIssue correctly refuses non-high-confidence issues
- classifyFixConfidence correctly categorizes all specified issue types
- partitionByConfidence correctly separates the auto-fix and manual review populations
- generateWireupReport writes a valid markdown file with all required sections
- Iteration history appends without losing existing rows across two calls

**What this evaluation CANNOT tell us:**
- Whether Playwright MCP tool payloads (browser_navigate, browser_fill_form, etc.) are correct — deferred to phase-81 with live browser
- Whether a real auto-fix agent produces a correct code change that makes a re-run pass — deferred to phase-81 with real git repo
- Whether the orchestrator correctly passes all required data to generateWireupReport in a live wireup iteration — deferred to phase-81 full pipeline test
- Whether manual_steps text is readable and accurate for all step types — untested at proxy level, requires human review

---

*Evaluation plan by: Claude (grd-eval-planner)*
*Design date: 2026-03-20*
