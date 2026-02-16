# Research: Auto-Refactoring and Document Synchronization Plan Generation

**Domain:** Code quality automation and documentation maintenance
**Researched:** 2026-02-16
**Overall confidence:** MEDIUM

## Executive Summary

This research explores automated refactoring and document synchronization strategies for GRD's phase execution workflow. The goal is to automatically generate quality maintenance plans at phase boundaries, detecting code quality issues and documentation drift after a set of changes are completed.

**Key finding:** Modern tooling supports automated detection of code smells, documentation drift, and dead code, but **integration timing is critical**. Post-commit hooks are unsuitable (too late), pre-commit hooks are too granular (per commit), and pre-push hooks are too infrequent (batch). **The ideal integration point is GRD's existing code review step**, which already operates at phase or wave boundaries.

**Recommended approach:** Extend GRD's existing code review mechanism to include refactoring detection and document drift checks, with optional plan generation for detected issues.

---

## Domain Overview

### Code Quality Automation Landscape (2026)

The 2026 code quality landscape emphasizes **AI-powered static analysis integrated into CI/CD pipelines**. Tools like [SonarQube](https://www.codeant.ai/blogs/what-is-code-smell-detection), [CodeAnt.ai](https://www.getpanto.ai/blog/best-code-smell-detection-tools-to-optimize-code-quality), and [ESLint](https://www.aikido.dev/blog/code-quality-tools) provide comprehensive code smell detection with [complexity metrics](https://eslintcc.github.io/), dead code analysis, and automated refactoring suggestions.

**State of the art:**
- **Static analysis:** Detects code smells via AST parsing and metrics-based heuristics
- **LLM-driven refactoring:** [GitHub FlightVin/automated-refactoring](https://github.com/FlightVin/automated-refactoring) demonstrates LLM-based workflows that detect design smells and automatically generate pull requests with refactored code
- **Semantic diff tools:** [RefDiff](https://github.com/aserg-ufmg/RefDiff) and [RAID](https://github.com/rodrigo-brito/refactoring-aware-diff) enrich git diffs with refactoring-aware analysis
- **Dead code detection:** [Knip](https://knip.dev/) provides comprehensive unused export/dependency detection for JavaScript/TypeScript with 100+ framework plugins

**Gap:** Most tools operate at individual commit level or continuous CI/CD checks. **GRD needs batch detection at phase boundaries** to assess cumulative impact of multiple related changes.

### Documentation Drift Detection

Documentation drift occurs when code changes but associated documentation (README, JSDoc, architecture docs, CHANGELOG) becomes stale. Detection strategies fall into three categories:

1. **Code-to-docs synchronization:** [DocSync](https://github.com/suhteevah/docsync) uses tree-sitter to detect drift across 40+ languages by comparing AST with documentation
2. **Test-based verification:** [jsdoc-tests](https://github.com/jskits/jsdoc-tests) runs JSDoc examples as tests to verify correctness
3. **Automated generation:** [semantic-release](https://github.com/semantic-release/semantic-release) auto-generates CHANGELOG from [conventional commits](https://www.conventionalcommits.org/en/v1.0.0/)

**Key insight:** Documentation drift detection is more mature for **automated generation** (CHANGELOG, API docs) than **bidirectional sync** (code ↔ manual docs). Manual README and architecture docs still require human review to detect drift.

---

## Refactoring Detection Strategies

### 1. Static Analysis & Code Smell Detection

**What to detect:**

| Category | Metrics/Patterns | Tools |
|----------|------------------|-------|
| **Complexity** | Cyclomatic complexity > 10-12 (review), > 20 (refactor) | ESLint complexity rule, SonarQube |
| **Code smells** | Long methods, large classes, duplicate code, feature envy | CodeAnt.ai, SonarQube, PMD |
| **Dead code** | Unused exports, unreachable code, orphaned dependencies | Knip, ts-unused-exports, tsr |
| **Dependency graph** | Circular dependencies, excessive coupling, modularity violations | Dependency-cruiser, Madge |

**Implementation approach:**
1. Run static analysis tools against codebase after phase execution
2. Compare metrics before/after phase (requires baseline capture)
3. Flag regressions: complexity increases, new code smells introduced, new dead code
4. Generate refactoring recommendations based on severity

**Confidence:** HIGH (well-established tooling and metrics)

### 2. Git Diff Analysis for Refactoring Triggers

**What to analyze:**

| Trigger | Detection Method | Action |
|---------|------------------|--------|
| **Large file changes** | Lines changed > threshold (e.g., 300 lines in single file) | Suggest decomposition |
| **Refactoring operations** | [RefDiff](https://github.com/aserg-ufmg/RefDiff) detects extract method, rename, move class | Verify consistency across codebase |
| **High churn files** | Frequent modifications to same files | Hotspot analysis → prioritize refactoring |
| **Cross-cutting changes** | Same pattern repeated across many files | Suggest abstraction |

**Implementation approach:**
1. Analyze git diff between phase start and end (branch diff or merge base)
2. Use [RefDiff](https://github.com/aserg-ufmg/RefDiff) or [RAID](https://github.com/rodrigo-brito/refactoring-aware-diff) for refactoring-aware diff
3. Detect manual refactorings and check for incomplete application across codebase
4. Flag large files or high-churn hotspots

**Confidence:** MEDIUM (RefDiff supports Java/JavaScript/C, limited TypeScript support; requires integration)

### 3. LLM-Driven Refactoring Suggestion

**How it works:**
[LLM-driven refactoring](https://seal-queensu.github.io/publications/pdf/IDE-Jonathan-2025.pdf) leverages pattern recognition to suggest maintainability-driven transformations. Modern approaches combine:
- **Context-aware prompts** with code snippets and detected smells
- **Multi-proposal generation** (pass@3/pass@5) to maximize correctness
- **Automated validation** with test suites and static linters

**Best practice (2026):** [Automated refactoring workflows](https://github.com/FlightVin/automated-refactoring) detect design smells → generate refactored code via LLM → create pull requests with detailed explanations.

**Challenges:**
- **Hallucinations:** 6-8% of LLM outputs produce unsafe/uncompilable code without filtering
- **Semantic preservation:** Requires comprehensive test suite to verify behavior unchanged
- **Context limits:** Large codebases need chunking strategies

**Implementation approach:**
1. Use static analysis to detect code smells
2. Pass detected smells + code snippets to LLM with refactoring prompt
3. Generate 3-5 refactoring proposals
4. Validate with linting + existing tests
5. Present best proposal in generated plan

**Confidence:** MEDIUM (emerging approach, requires careful validation)

---

## Document Synchronization Strategies

### 1. README & Markdown Documentation

**Detection methods:**

| Drift Type | Detection Strategy | Tools |
|------------|-------------------|-------|
| **Stale examples** | Run code examples as tests | [jsdoctest](https://github.com/yamadapc/jsdoctest) (JSDoc), doctest patterns |
| **Broken links** | Link validation, file reference checks | [ReadMe's Docs Audit](https://readme.com/documentation), markdown-link-check |
| **API signature drift** | Compare documented API with actual exports | DocSync (tree-sitter AST comparison) |
| **Missing documentation** | Coverage analysis (undocumented exports/functions) | ts-doc-coverage, JSDoc coverage tools |

**Implementation approach:**
1. Extract code blocks from README/docs
2. Attempt to execute/validate (syntax check or test run)
3. Check links to files/sections still exist
4. Compare documented function signatures with actual code (via AST)
5. Flag drift items with severity (broken examples HIGH, missing docs LOW)

**Confidence:** MEDIUM (tooling exists but requires integration; execution of code examples can be fragile)

### 2. JSDoc / Inline Comment Drift

**Detection methods:**
- **Type mismatches:** TypeScript JSDoc type checking via `tsc --checkJs`
- **Parameter drift:** Compare `@param` docs with actual function signatures
- **Example validation:** Run `@example` blocks as tests ([jsdoctest](https://www.npmjs.com/package/jsdoc-test))

**Limitations:** No mature tooling for detecting when JSDoc **semantically** contradicts implementation (requires LLM or human review).

**Implementation approach:**
1. Run TypeScript type checking on JSDoc annotations
2. Extract and validate `@example` blocks
3. Flag type mismatches and failed examples

**Confidence:** MEDIUM (type checking is reliable; semantic drift detection is LOW confidence)

### 3. CHANGELOG Synchronization

**Detection methods:**
- **Conventional commits:** [semantic-release](https://github.com/semantic-release/semantic-release) auto-generates CHANGELOG from commit messages following [conventional commits spec](https://www.conventionalcommits.org/en/v1.0.0/)
- **Version bumps:** Determines major/minor/patch based on commit types (`feat`, `fix`, `BREAKING CHANGE`)

**Implementation approach:**
1. Validate commits follow conventional commit format
2. Auto-generate CHANGELOG.md via semantic-release or conventional-changelog
3. Detect uncommitted changes (compare generated vs existing)

**Confidence:** HIGH (mature tooling, widely adopted standard)

### 4. Architecture Documentation Drift

**Detection methods:**
- **Architecture Decision Records (ADRs):** [AI-generated ADRs](https://adolfi.dev/blog/ai-generated-adr/) scan codebase and generate ADRs for detected architectural changes
- **Diagrams-as-code:** Structurizr, C4-PlantUML auto-generate diagrams from code structure
- **Change detection:** Compare dependency graph, module boundaries, layer violations before/after

**Limitations:** ADR generation is experimental; diagram generation requires explicit code annotations or conventions.

**Implementation approach:**
1. Generate dependency graph before/after phase
2. Detect structural changes (new modules, moved dependencies, layer boundary changes)
3. Flag when changes warrant ADR creation
4. Optionally use LLM to draft ADR based on git diff + architectural change summary

**Confidence:** LOW (emerging area, limited production-ready tooling)

---

## Integration Approach for GRD

### Current GRD Architecture

From `commands/execute-phase.md` and `config.json`:

```
execute-phase.md orchestrates:
1. Load phase context and plans
2. Execute plans in waves (parallel or sequential)
3. [CODE REVIEW: per-wave or per-phase] ← INSERT POINT
4. Spawn verification agent
5. Update roadmap
```

**Code review is already phase/wave-scoped** with configurable timing:
- `code_review.timing`: `"per_wave"` | `"per_phase"` | `"disabled"`
- `code_review.severity_gate`: `"blocker"` | `"warning"` | `"none"`
- `code_review.auto_fix_warnings`: `true` | `false`

### Recommended Integration: Extend Code Review Step

**Why code review is the right integration point:**
1. **Already exists:** GRD has `grd-code-reviewer` agent that produces `{phase}-{wave}-REVIEW.md`
2. **Right scope:** Operates at wave or phase level (batch of related changes)
3. **User review gate:** Code review already has severity_gate mechanism for human intervention
4. **Fits mental model:** Refactoring/doc checks are quality reviews, not execution steps

**Proposed enhancement:**

Extend `grd-code-reviewer` agent to:
1. Run static analysis (ESLint complexity, Knip dead code, SonarQube smells)
2. Analyze git diff for refactoring triggers
3. Check documentation drift (README examples, JSDoc types, CHANGELOG)
4. Optionally generate refactoring plan if issues exceed threshold

**Output format (extend REVIEW.md):**

```markdown
# Code Review: Phase 03, Wave 1

## Code Quality Analysis

**Complexity violations:**
- `bin/grd-tools.js`: cyclomatic complexity 24 (threshold: 20) → refactor recommended
- `lib/phase-manager.js`: 450 lines (threshold: 300) → decompose

**Dead code detected:**
- `lib/unused-helper.js`: No imports found
- `commands/deprecated-flow.md`: Orphaned file

**Code smells:**
- Duplicate code in `lib/state.js` and `lib/roadmap.js` (extract common module)

## Documentation Drift

**README.md:**
- Example in "Installation" section references deprecated command `/grd:init`
- Missing documentation for new `/grd:sync` command

**JSDoc:**
- `lib/phase-manager.js:createPlan()` @param mismatch: docs show 2 params, function accepts 3

**CHANGELOG.md:**
- 3 commits since last entry (run semantic-release to update)

## Recommendations

**Immediate actions:**
- [ ] Refactor `bin/grd-tools.js` (complexity violation)
- [ ] Update README examples (broken/deprecated commands)

**Suggested follow-up plan:**
Generate refactoring plan? [yes/no]
- Remove dead code
- Extract duplicate code
- Decompose large files
```

**User workflow:**
1. Agent presents REVIEW.md with quality issues and doc drift
2. If `severity_gate="blocker"` and HIGH priority issues found → user must ack before continuing
3. User can request auto-generation of refactoring plan: `/grd:plan-refactor {phase}`
4. Generated plan creates tasks like:
   - "Remove unused exports detected by Knip"
   - "Refactor bin/grd-tools.js to reduce complexity"
   - "Update README.md examples and add missing /grd:sync docs"
   - "Run semantic-release to update CHANGELOG.md"

### Alternative Integration Points (Rejected)

| Approach | Why Rejected |
|----------|--------------|
| **Post-commit hooks** | Too late (commit already created), unsuitable for quality gates ([source](https://switowski.com/blog/pre-commit-vs-ci/)) |
| **Pre-commit hooks** | Too granular (runs per commit, not per phase); breaks atomic task commits |
| **Pre-push hooks** | Not aligned with GRD's wave/phase structure; runs only on manual push |
| **Separate post-phase plan** | Creates extra plan step that's always the same → better as part of existing review |
| **CI/CD pipeline** | GRD is workflow orchestrator, not CI system; CI should validate, not generate plans |

### Config Schema

Extend `.planning/config.json`:

```json
{
  "code_review": {
    "enabled": true,
    "timing": "per_wave",
    "severity_gate": "blocker",
    "auto_fix_warnings": true,
    "quality_checks": {
      "complexity_analysis": true,
      "dead_code_detection": true,
      "code_smells": true,
      "doc_drift": true,
      "auto_plan_generation": false
    },
    "thresholds": {
      "cyclomatic_complexity": 20,
      "max_file_lines": 300,
      "duplicate_code_threshold": 0.1
    }
  }
}
```

**Fields:**
- `quality_checks.complexity_analysis`: Run ESLint complexity checks
- `quality_checks.dead_code_detection`: Run Knip to find unused exports
- `quality_checks.code_smells`: Run SonarQube or CodeAnt.ai analysis
- `quality_checks.doc_drift`: Check README examples, JSDoc types, CHANGELOG
- `quality_checks.auto_plan_generation`: If `true`, automatically generate refactoring plan when issues found
- `thresholds.*`: Configurable thresholds for quality metrics

**Default values:** All quality checks disabled by default (opt-in). When enabled, runs as part of existing code review step with no workflow changes.

---

## Implementation Phases

### Phase 1: Extend Code Review Agent

**Goal:** Add quality analysis to existing `grd-code-reviewer` without changing workflow.

**Tasks:**
1. Install analysis tools (ESLint, Knip, ts-unused-exports)
2. Update `grd-code-reviewer` agent prompt to run tools and include results in REVIEW.md
3. Add quality_checks config to `config.json` schema
4. Test on sample phase execution

**Effort:** 1-2 days
**Risk:** LOW (extends existing mechanism, no workflow changes)

### Phase 2: Documentation Drift Detection

**Goal:** Detect README/JSDoc drift and CHANGELOG staleness.

**Tasks:**
1. Integrate markdown-link-check for broken links
2. Add JSDoc type checking via `tsc --checkJs`
3. Check CHANGELOG.md vs recent commits
4. Include drift findings in REVIEW.md

**Effort:** 2-3 days
**Risk:** MEDIUM (README example execution can be fragile)

### Phase 3: Refactoring Plan Generation

**Goal:** Auto-generate refactoring plan from detected issues.

**Tasks:**
1. Create `/grd:plan-refactor {phase}` command
2. Read REVIEW.md quality issues
3. Generate PLAN.md with tasks for each issue category
4. Support `code_review.quality_checks.auto_plan_generation` for automatic invocation

**Effort:** 3-4 days
**Risk:** MEDIUM (plan generation heuristics need tuning)

### Phase 4: LLM-Driven Refactoring Suggestions

**Goal:** Use LLM to suggest specific refactorings for detected code smells.

**Tasks:**
1. Pass code smell + code snippet to LLM
2. Generate refactoring proposals (pass@3)
3. Validate proposals with linter
4. Include best proposal in generated plan

**Effort:** 5-7 days
**Risk:** HIGH (LLM hallucinations, validation complexity)

---

## Tooling Recommendations

### Essential Tools (Phase 1-2)

| Tool | Purpose | Installation | Confidence |
|------|---------|--------------|------------|
| **Knip** | Dead code detection (JS/TS) | `npm install -D knip` | HIGH |
| **ESLint** (complexity plugin) | Cyclomatic complexity analysis | `npm install -D eslint eslint-plugin-complexity` | HIGH |
| **ts-unused-exports** | Unused TypeScript exports | `npm install -D ts-unused-exports` | HIGH |
| **markdown-link-check** | Broken link detection in docs | `npm install -D markdown-link-check` | HIGH |
| **conventional-changelog** | CHANGELOG generation | `npm install -D conventional-changelog-cli` | HIGH |

### Advanced Tools (Phase 3-4)

| Tool | Purpose | Installation | Confidence |
|------|---------|--------------|------------|
| **SonarQube** | Comprehensive code smell detection | Cloud service or self-hosted | MEDIUM |
| **RefDiff** | Refactoring-aware git diff | Clone + build (Java) | MEDIUM |
| **DocSync** | Code-doc drift via AST (40+ langs) | `cargo install docsync` (Rust) | LOW |
| **CodeAnt.ai** | AI-powered code smell detection | Cloud service | MEDIUM |

---

## Open Questions & Deferred Validations

1. **Baseline capture timing:** Should quality metrics be captured at phase start for before/after comparison? Or always compare against absolute thresholds?
   - **Recommendation:** Absolute thresholds (simpler), with optional baseline tracking in STATE.md

2. **Refactoring plan priority:** Should generated refactoring plans execute immediately or defer to end of milestone?
   - **Recommendation:** User choice via config or prompt (default: defer to integration phase)

3. **Tool installation:** Should GRD auto-install analysis tools or assume they're in package.json?
   - **Recommendation:** Document in setup guide, check for presence, offer to install if missing

4. **README example execution safety:** How to safely execute code examples from docs without breaking environment?
   - **Recommendation:** Phase 4 validation (requires sandboxing strategy)

5. **LLM refactoring accuracy:** What's acceptable hallucination rate for auto-generated refactorings?
   - **Recommendation:** Phase 4 validation (require 95%+ validation pass rate)

---

## Success Criteria

Auto-refactoring plan generation is successful when:

- [ ] Code quality analysis runs automatically as part of code review (no workflow changes)
- [ ] REVIEW.md includes complexity violations, dead code, and code smell findings
- [ ] Documentation drift (README, JSDoc, CHANGELOG) is detected and reported
- [ ] Users can opt-in to auto-generate refactoring plans from detected issues
- [ ] Generated refactoring plans are actionable (specific files/lines, concrete tasks)
- [ ] Config options allow granular control (enable/disable checks, set thresholds)
- [ ] Zero false positives on test repository (GRD codebase itself)

**Quality bar:** Better to skip a refactoring opportunity than generate noisy/incorrect suggestions. Precision > recall.

---

## Sources

**Code Smell Detection:**
- [What is Code Smell Detection? [2026 Guide]](https://www.codeant.ai/blogs/what-is-code-smell-detection)
- [Best Code Smell Detection Tools in 2026](https://www.getpanto.ai/blog/best-code-smell-detection-tools-to-optimize-code-quality)
- [The 6 Best Code Quality Tools for 2026](https://www.aikido.dev/blog/code-quality-tools)
- [ESLint Complexity Rule](https://eslint.org/docs/latest/rules/complexity)

**Dead Code Detection:**
- [Knip - Declutter your JavaScript & TypeScript projects](https://knip.dev/)
- [ts-unused-exports](https://www.npmjs.com/package/ts-unused-exports)
- [TypeScript Remove (tsr)](https://kazushikonosu.io/en/typescript-remove-tsr)

**Git Diff Analysis:**
- [RefDiff - Mine refactorings in git history](https://github.com/aserg-ufmg/RefDiff)
- [RAID - Refactoring-aware diff enrichment](https://github.com/rodrigo-brito/refactoring-aware-diff)
- [SemanticDiff - Language-aware diff](https://semanticdiff.com/)

**LLM-Driven Refactoring:**
- [FlightVin/automated-refactoring - LLM workflow for PR generation](https://github.com/FlightVin/automated-refactoring)
- [LLM-Driven Code Refactoring: Opportunities and Limitations](https://seal-queensu.github.io/publications/pdf/IDE-Jonathan-2025.pdf)

**Documentation Drift:**
- [DocSync - Auto-detect doc drift, 40+ languages](https://github.com/suhteevah/docsync)
- [readme-sync - Check README and docs synchronization](https://github.com/zheland/readme-sync)
- [jsdoc-tests - Documentation-driven quality](https://github.com/jskits/jsdoc-tests)

**CHANGELOG Automation:**
- [semantic-release - Automated version management](https://github.com/semantic-release/semantic-release)
- [conventional-changelog - Generate changelogs from commits](https://github.com/conventional-changelog/conventional-changelog)
- [Conventional Commits Specification](https://www.conventionalcommits.org/en/v1.0.0/)

**Code Review Automation:**
- [pre-commit vs. CI](https://switowski.com/blog/pre-commit-vs-ci/)
- [Automating Code Checks with Git Hooks](https://www.antstack.com/blog/automating-code-checks-and-tests-with-git-hooks/)
- [Best Automated Code Review Tools](https://mstone.ai/blog/best-code-review-tools-for-developers/)

**Architecture Documentation:**
- [Architecture Decision Records (ADRs)](https://adr.github.io/)
- [AI-Generated ADRs](https://adolfi.dev/blog/ai-generated-adr/)
- [Building an ADR Writer Agent](https://piethein.medium.com/building-an-architecture-decision-record-writer-agent-a74f8f739271)
