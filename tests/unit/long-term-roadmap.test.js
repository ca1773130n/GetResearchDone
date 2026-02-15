/**
 * Unit tests for lib/long-term-roadmap.js
 *
 * TDD RED phase: Tests for LONG-TERM-ROADMAP.md parsing, validation,
 * mode detection, generation, and display formatting.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { createFixtureDir, cleanupFixtureDir } = require('../helpers/fixtures');

const {
  parseLongTermRoadmap,
  validateLongTermRoadmap,
  getPlanningMode,
  generateLongTermRoadmap,
  formatLongTermRoadmap,
  getMilestoneTier,
  refineMilestone,
  promoteMilestone,
  updateRefinementHistory,
} = require('../../lib/long-term-roadmap');

// ─── Test Fixtures ───────────────────────────────────────────────────────────

const VALID_ROADMAP_CONTENT = `---
project: "GRD - Get Research Done"
roadmap_type: hierarchical
created: "2026-02-16"
last_refined: "2026-02-16"
planning_horizon: "6 months"
---

# Long-Term Roadmap: GRD

## Current Milestone (Now)

**Milestone:** v0.1.0 - Foundation
**Status:** In Progress
**Start:** 2026-01-15
**Target:** 2026-03-01

### Goal
Establish core R&D workflow with research, planning, execution, and evaluation.

### Success Criteria
- All Phase 6 tests passing
- Documentation complete
- First external user onboarded

### Open Questions
- None

---

## Next Milestones

### v0.2.0 - Agent Teams & Parallelization

**Status:** Next
**Estimated Start:** 2026-03-01
**Estimated Duration:** 6 weeks
**Dependencies:** v0.1.0 complete

#### Goal
Enable parallel execution of independent phases and agent team collaboration.

#### Success Criteria
- Execute 3 independent phases in parallel
- Agent team plans and executes a multi-component feature
- 30% reduction in end-to-end milestone time

#### Rough Phase Sketch
1. Agent Team Protocol
2. Parallel Execution Engine
3. Coordination Primitives
4. Integration Testing

#### Open Questions
- Which agent team protocol: hierarchical vs peer-to-peer?
- How to handle merge conflicts in parallel execution?

---

### v0.3.0 - Advanced Evaluation & Metrics

**Status:** Next
**Estimated Start:** 2026-04-15
**Estimated Duration:** 4 weeks
**Dependencies:** v0.2.0 complete

#### Goal
Richer evaluation framework with A/B testing and regression detection.

#### Success Criteria
- Automated regression detection on 5 baseline metrics
- A/B test support with statistical significance
- Performance profiling in eval reports

#### Rough Phase Sketch
1. Regression Detection
2. A/B Testing Framework
3. Profiling Integration

#### Open Questions
- Baseline storage: in-repo vs external database?

---

## Later Milestones

### v0.4.0 - Multi-Project Management

**Status:** Later
**Estimated Timeline:** Q3 2026
**Dependencies:** v0.3.0 complete

#### Goal
Support multiple concurrent R&D projects with shared research knowledge base.

#### Success Criteria
- Manage 3+ projects in single workspace
- Cross-project research reuse
- Unified progress dashboard

#### Open Research Questions
- Monorepo vs separate repos per project?
- How to structure shared research knowledge graph?

---

### v0.5.0 - Community & Marketplace

**Status:** Later
**Estimated Timeline:** Q4 2026
**Dependencies:** v0.4.0 complete, user base >100

#### Goal
Enable sharing of research artifacts, phase templates, and evaluation frameworks.

#### Success Criteria
- 10+ published research landscapes
- 20+ reusable phase templates

#### Open Research Questions
- Licensing and attribution model?
- Quality curation mechanism?

---

## Milestone Dependency Graph

\`\`\`
v0.1.0 (Now)
  |
v0.2.0 (Next)
  |
v0.3.0 (Next)
  |
v0.4.0 (Later)
  |
v0.5.0 (Later)
\`\`\`

## Refinement History

| Date | Action | Details |
|------|--------|---------|
| 2026-02-16 | Initial roadmap | Defined v0.1.0 - v0.5.0 with Now-Next-Later tiers |
`;

const MINIMAL_ROADMAP_CONTENT = `---
project: "TestProject"
roadmap_type: hierarchical
created: "2026-01-01"
last_refined: "2026-01-01"
planning_horizon: "3 months"
---

# Long-Term Roadmap: TestProject

## Current Milestone (Now)

**Milestone:** v1.0.0 - MVP
**Status:** In Progress
**Start:** 2026-01-01
**Target:** 2026-03-01

### Goal
Build the minimum viable product.

### Success Criteria
- Core features working
- Basic tests passing
`;

const EMPTY_SECTIONS_CONTENT = `---
project: "EmptyTest"
roadmap_type: hierarchical
created: "2026-01-01"
last_refined: "2026-01-01"
planning_horizon: "3 months"
---

# Long-Term Roadmap: EmptyTest

## Current Milestone (Now)

**Milestone:** v1.0.0 - Start
**Status:** In Progress
**Start:** 2026-01-01
**Target:** 2026-02-01

### Goal
Get started with the project.

### Success Criteria
- Initial setup complete

## Next Milestones

## Later Milestones
`;

// ─── parseLongTermRoadmap ────────────────────────────────────────────────────

describe('parseLongTermRoadmap', () => {
  test('parses YAML frontmatter correctly', () => {
    const parsed = parseLongTermRoadmap(VALID_ROADMAP_CONTENT);
    expect(parsed).toBeDefined();
    expect(parsed.frontmatter).toBeDefined();
    expect(parsed.frontmatter.project).toBe('GRD - Get Research Done');
    expect(parsed.frontmatter.roadmap_type).toBe('hierarchical');
    expect(parsed.frontmatter.created).toBe('2026-02-16');
    expect(parsed.frontmatter.last_refined).toBe('2026-02-16');
    expect(parsed.frontmatter.planning_horizon).toBe('6 months');
  });

  test('parses Now milestone section', () => {
    const parsed = parseLongTermRoadmap(VALID_ROADMAP_CONTENT);
    expect(parsed.now).toBeDefined();
    expect(parsed.now.milestone).toBe('v0.1.0 - Foundation');
    expect(parsed.now.version).toBe('v0.1.0');
    expect(parsed.now.status).toBe('In Progress');
    expect(parsed.now.start).toBe('2026-01-15');
    expect(parsed.now.target).toBe('2026-03-01');
    expect(parsed.now.goal).toContain('core R&D workflow');
    expect(parsed.now.success_criteria).toBeInstanceOf(Array);
    expect(parsed.now.success_criteria.length).toBe(3);
    expect(parsed.now.success_criteria[0]).toContain('Phase 6 tests');
  });

  test('parses multiple Next milestones', () => {
    const parsed = parseLongTermRoadmap(VALID_ROADMAP_CONTENT);
    expect(parsed.next).toBeInstanceOf(Array);
    expect(parsed.next.length).toBe(2);

    // First Next milestone
    const next0 = parsed.next[0];
    expect(next0.milestone).toContain('Agent Teams');
    expect(next0.version).toBe('v0.2.0');
    expect(next0.status).toBe('Next');
    expect(next0.estimated_start).toBe('2026-03-01');
    expect(next0.estimated_duration).toBe('6 weeks');
    expect(next0.dependencies).toContain('v0.1.0');
    expect(next0.goal).toContain('parallel execution');
    expect(next0.success_criteria).toBeInstanceOf(Array);
    expect(next0.success_criteria.length).toBe(3);
    expect(next0.rough_phase_sketch).toBeInstanceOf(Array);
    expect(next0.rough_phase_sketch.length).toBe(4);
    expect(next0.rough_phase_sketch[0]).toContain('Agent Team Protocol');
    expect(next0.open_questions).toBeInstanceOf(Array);
    expect(next0.open_questions.length).toBe(2);

    // Second Next milestone
    const next1 = parsed.next[1];
    expect(next1.milestone).toContain('Advanced Evaluation');
    expect(next1.version).toBe('v0.3.0');
    expect(next1.estimated_duration).toBe('4 weeks');
  });

  test('parses multiple Later milestones', () => {
    const parsed = parseLongTermRoadmap(VALID_ROADMAP_CONTENT);
    expect(parsed.later).toBeInstanceOf(Array);
    expect(parsed.later.length).toBe(2);

    // First Later milestone
    const later0 = parsed.later[0];
    expect(later0.milestone).toContain('Multi-Project Management');
    expect(later0.version).toBe('v0.4.0');
    expect(later0.status).toBe('Later');
    expect(later0.estimated_timeline).toBe('Q3 2026');
    expect(later0.dependencies).toContain('v0.3.0');
    expect(later0.goal).toContain('multiple concurrent');
    expect(later0.success_criteria).toBeInstanceOf(Array);
    expect(later0.open_research_questions).toBeInstanceOf(Array);
    expect(later0.open_research_questions.length).toBe(2);

    // Second Later milestone
    const later1 = parsed.later[1];
    expect(later1.version).toBe('v0.5.0');
    expect(later1.estimated_timeline).toBe('Q4 2026');
  });

  test('handles empty sections gracefully', () => {
    const parsed = parseLongTermRoadmap(EMPTY_SECTIONS_CONTENT);
    expect(parsed).toBeDefined();
    expect(parsed.now).toBeDefined();
    expect(parsed.now.version).toBe('v1.0.0');
    expect(parsed.next).toBeInstanceOf(Array);
    expect(parsed.next.length).toBe(0);
    expect(parsed.later).toBeInstanceOf(Array);
    expect(parsed.later.length).toBe(0);
  });

  test('returns null for non-roadmap content', () => {
    const result = parseLongTermRoadmap('# Some Random Document\n\nJust text.\n');
    expect(result === null || (result && result.now === null)).toBeTruthy();
  });

  test('parses minimal roadmap with only Now milestone', () => {
    const parsed = parseLongTermRoadmap(MINIMAL_ROADMAP_CONTENT);
    expect(parsed).toBeDefined();
    expect(parsed.now).toBeDefined();
    expect(parsed.now.milestone).toBe('v1.0.0 - MVP');
    expect(parsed.now.goal).toContain('minimum viable product');
    expect(parsed.next).toBeInstanceOf(Array);
    expect(parsed.next.length).toBe(0);
    expect(parsed.later).toBeInstanceOf(Array);
    expect(parsed.later.length).toBe(0);
  });

  test('parses refinement history table', () => {
    const parsed = parseLongTermRoadmap(VALID_ROADMAP_CONTENT);
    expect(parsed.refinement_history).toBeInstanceOf(Array);
    expect(parsed.refinement_history.length).toBeGreaterThanOrEqual(1);
    expect(parsed.refinement_history[0].date).toBe('2026-02-16');
    expect(parsed.refinement_history[0].action).toContain('Initial');
  });
});

// ─── validateLongTermRoadmap ─────────────────────────────────────────────────

describe('validateLongTermRoadmap', () => {
  test('valid roadmap passes validation', () => {
    const parsed = parseLongTermRoadmap(VALID_ROADMAP_CONTENT);
    const result = validateLongTermRoadmap(parsed);
    expect(result.valid).toBe(true);
    expect(result.errors).toBeInstanceOf(Array);
    expect(result.errors.length).toBe(0);
  });

  test('missing Now milestone fails validation', () => {
    const parsed = {
      frontmatter: { project: 'Test' },
      now: null,
      next: [],
      later: [],
    };
    const result = validateLongTermRoadmap(parsed);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e) => /now/i.test(e))).toBe(true);
  });

  test('Now milestone missing goal fails validation', () => {
    const parsed = {
      frontmatter: { project: 'Test' },
      now: { milestone: 'v1.0 - Test', version: 'v1.0', status: 'In Progress' },
      next: [],
      later: [],
    };
    const result = validateLongTermRoadmap(parsed);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /goal/i.test(e))).toBe(true);
  });

  test('Next milestone missing goal fails validation', () => {
    const parsed = {
      frontmatter: { project: 'Test' },
      now: { milestone: 'v1.0 - Test', version: 'v1.0', goal: 'Build things', status: 'Active' },
      next: [{ milestone: 'v2.0 - Next', version: 'v2.0', status: 'Next' }],
      later: [],
    };
    const result = validateLongTermRoadmap(parsed);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /goal/i.test(e))).toBe(true);
  });

  test('warns but passes if Later milestones missing success criteria', () => {
    const parsed = {
      frontmatter: { project: 'Test' },
      now: { milestone: 'v1.0 - Test', version: 'v1.0', goal: 'Build things', status: 'Active' },
      next: [],
      later: [
        { milestone: 'v3.0 - Future', version: 'v3.0', goal: 'Future stuff', status: 'Later' },
      ],
    };
    const result = validateLongTermRoadmap(parsed);
    expect(result.valid).toBe(true);
    expect(result.warnings).toBeInstanceOf(Array);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.some((w) => /success.criteria/i.test(w))).toBe(true);
  });

  test('warns when milestone count exceeds soft limit', () => {
    const parsed = {
      frontmatter: { project: 'Test' },
      now: { milestone: 'v1.0 - Test', version: 'v1.0', goal: 'Build', status: 'Active' },
      next: [
        { milestone: 'v2.0 - A', version: 'v2.0', goal: 'Goal A', status: 'Next' },
        { milestone: 'v3.0 - B', version: 'v3.0', goal: 'Goal B', status: 'Next' },
      ],
      later: [
        {
          milestone: 'v4.0 - C',
          version: 'v4.0',
          goal: 'Goal C',
          status: 'Later',
          success_criteria: ['Done'],
        },
        {
          milestone: 'v5.0 - D',
          version: 'v5.0',
          goal: 'Goal D',
          status: 'Later',
          success_criteria: ['Done'],
        },
        {
          milestone: 'v6.0 - E',
          version: 'v6.0',
          goal: 'Goal E',
          status: 'Later',
          success_criteria: ['Done'],
        },
        {
          milestone: 'v7.0 - F',
          version: 'v7.0',
          goal: 'Goal F',
          status: 'Later',
          success_criteria: ['Done'],
        },
      ],
    };
    const result = validateLongTermRoadmap(parsed);
    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => /5|count|many/i.test(w))).toBe(true);
  });

  test('missing project in frontmatter fails validation', () => {
    const parsed = {
      frontmatter: {},
      now: { milestone: 'v1.0 - Test', version: 'v1.0', goal: 'Build', status: 'Active' },
      next: [],
      later: [],
    };
    const result = validateLongTermRoadmap(parsed);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /project/i.test(e))).toBe(true);
  });
});

// ─── getPlanningMode ─────────────────────────────────────────────────────────

describe('getPlanningMode', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-mode-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('returns hierarchical when LONG-TERM-ROADMAP.md exists', () => {
    const planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningDir, { recursive: true });
    fs.writeFileSync(
      path.join(planningDir, 'LONG-TERM-ROADMAP.md'),
      `---\nproject: Test\nroadmap_type: hierarchical\n---\n\n# Roadmap\n`
    );
    expect(getPlanningMode(tmpDir)).toBe('hierarchical');
  });

  test('returns progressive when no LONG-TERM-ROADMAP.md', () => {
    const planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningDir, { recursive: true });
    // No LONG-TERM-ROADMAP.md file
    expect(getPlanningMode(tmpDir)).toBe('progressive');
  });

  test('returns progressive when .planning/ dir missing', () => {
    // tmpDir has no .planning/ directory
    expect(getPlanningMode(tmpDir)).toBe('progressive');
  });

  test('respects roadmap_type frontmatter override to progressive', () => {
    const planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningDir, { recursive: true });
    fs.writeFileSync(
      path.join(planningDir, 'LONG-TERM-ROADMAP.md'),
      `---\nproject: Test\nroadmap_type: progressive\n---\n\n# Roadmap\n`
    );
    expect(getPlanningMode(tmpDir)).toBe('progressive');
  });
});

// ─── generateLongTermRoadmap ─────────────────────────────────────────────────

describe('generateLongTermRoadmap', () => {
  const testMilestones = [
    {
      name: 'Foundation',
      version: 'v1.0.0',
      goal: 'Build the core platform',
      success_criteria: ['Core features working', 'Tests passing'],
      status: 'In Progress',
      start: '2026-01-01',
      target: '2026-03-01',
    },
    {
      name: 'Agent Teams',
      version: 'v2.0.0',
      goal: 'Enable parallel execution',
      success_criteria: ['Parallel phases work', 'Team collaboration works'],
      status: 'Next',
      estimated_start: '2026-03-15',
      estimated_duration: '6 weeks',
      dependencies: 'v1.0.0 complete',
      rough_phase_sketch: ['Agent Protocol', 'Parallel Engine', 'Integration'],
      open_questions: ['Which protocol?'],
    },
    {
      name: 'Advanced Eval',
      version: 'v3.0.0',
      goal: 'Richer evaluation framework',
      success_criteria: ['Regression detection', 'A/B testing'],
      status: 'Next',
      estimated_start: '2026-05-01',
      estimated_duration: '4 weeks',
      dependencies: 'v2.0.0 complete',
    },
    {
      name: 'Multi-Project',
      version: 'v4.0.0',
      goal: 'Support multiple concurrent projects',
      success_criteria: ['3+ projects in workspace'],
      status: 'Later',
      estimated_timeline: 'Q3 2026',
      dependencies: 'v3.0.0 complete',
      open_research_questions: ['Monorepo vs separate repos?'],
    },
  ];

  test('generates valid YAML frontmatter', () => {
    const output = generateLongTermRoadmap(testMilestones, 'TestProject', '6 months');
    expect(output).toMatch(/^---\n/);
    expect(output).toContain('project: TestProject');
    expect(output).toContain('roadmap_type: hierarchical');
    expect(output).toContain('planning_horizon: 6 months');
    expect(output).toMatch(/created:/);
    expect(output).toMatch(/last_refined:/);
  });

  test('generates Now section from current milestone', () => {
    const output = generateLongTermRoadmap(testMilestones, 'TestProject');
    expect(output).toContain('## Current Milestone (Now)');
    expect(output).toContain('v1.0.0 - Foundation');
    expect(output).toContain('Build the core platform');
    expect(output).toContain('Core features working');
  });

  test('generates Next section from middle milestones', () => {
    const output = generateLongTermRoadmap(testMilestones, 'TestProject');
    expect(output).toContain('## Next Milestones');
    expect(output).toContain('v2.0.0 - Agent Teams');
    expect(output).toContain('v3.0.0 - Advanced Eval');
    expect(output).toContain('Enable parallel execution');
  });

  test('generates Later section from remaining milestones', () => {
    const output = generateLongTermRoadmap(testMilestones, 'TestProject');
    expect(output).toContain('## Later Milestones');
    expect(output).toContain('v4.0.0 - Multi-Project');
    expect(output).toContain('Support multiple concurrent projects');
  });

  test('generates Refinement History table', () => {
    const output = generateLongTermRoadmap(testMilestones, 'TestProject');
    expect(output).toContain('## Refinement History');
    expect(output).toContain('Initial roadmap');
    expect(output).toMatch(/\| Date \| Action \| Details \|/);
  });

  test('round-trip: generate then parse produces same data', () => {
    const output = generateLongTermRoadmap(testMilestones, 'TestProject', '6 months');
    const parsed = parseLongTermRoadmap(output);

    expect(parsed).toBeDefined();
    expect(parsed.frontmatter.project).toBe('TestProject');
    expect(parsed.frontmatter.planning_horizon).toBe('6 months');

    // Now milestone
    expect(parsed.now).toBeDefined();
    expect(parsed.now.version).toBe('v1.0.0');
    expect(parsed.now.goal).toContain('core platform');

    // Next milestones
    expect(parsed.next.length).toBe(2);
    expect(parsed.next[0].version).toBe('v2.0.0');
    expect(parsed.next[1].version).toBe('v3.0.0');

    // Later milestones
    expect(parsed.later.length).toBe(1);
    expect(parsed.later[0].version).toBe('v4.0.0');
  });

  test('uses default planning horizon when not specified', () => {
    const output = generateLongTermRoadmap(testMilestones, 'TestProject');
    expect(output).toContain('planning_horizon:');
  });

  test('handles single milestone (Now only)', () => {
    const single = [testMilestones[0]];
    const output = generateLongTermRoadmap(single, 'TestProject');
    expect(output).toContain('## Current Milestone (Now)');
    expect(output).toContain('v1.0.0');
    // Should not have Next or Later sections with content
    const parsed = parseLongTermRoadmap(output);
    expect(parsed.next.length).toBe(0);
    expect(parsed.later.length).toBe(0);
  });
});

// ─── formatLongTermRoadmap ───────────────────────────────────────────────────

describe('formatLongTermRoadmap', () => {
  test('formats summary view with tier indicators', () => {
    const parsed = parseLongTermRoadmap(VALID_ROADMAP_CONTENT);
    const formatted = formatLongTermRoadmap(parsed);
    expect(formatted).toContain('[Now]');
    expect(formatted).toContain('[Next]');
    expect(formatted).toContain('[Later]');
  });

  test('includes milestone version, name, and status', () => {
    const parsed = parseLongTermRoadmap(VALID_ROADMAP_CONTENT);
    const formatted = formatLongTermRoadmap(parsed);
    expect(formatted).toContain('v0.1.0');
    expect(formatted).toContain('Foundation');
    expect(formatted).toContain('In Progress');
    expect(formatted).toContain('v0.2.0');
    expect(formatted).toContain('v0.4.0');
  });

  test('includes milestone dependency info', () => {
    const parsed = parseLongTermRoadmap(VALID_ROADMAP_CONTENT);
    const formatted = formatLongTermRoadmap(parsed);
    // Should contain some dependency representation
    expect(formatted).toMatch(/depend|->|v0\.\d+\.0/i);
  });

  test('includes project name and planning horizon', () => {
    const parsed = parseLongTermRoadmap(VALID_ROADMAP_CONTENT);
    const formatted = formatLongTermRoadmap(parsed);
    expect(formatted).toContain('GRD');
    expect(formatted).toContain('6 months');
  });

  test('handles roadmap with no Next or Later milestones', () => {
    const parsed = parseLongTermRoadmap(MINIMAL_ROADMAP_CONTENT);
    const formatted = formatLongTermRoadmap(parsed);
    expect(formatted).toContain('[Now]');
    expect(formatted).toContain('v1.0.0');
    // Should not crash
    expect(typeof formatted).toBe('string');
  });
});

// ─── Refinement & Promotion Test Fixtures ────────────────────────────────────

const REFINE_FIXTURE = `---
project: "RefineTest"
roadmap_type: hierarchical
created: "2026-01-01"
last_refined: "2026-02-01"
planning_horizon: "6 months"
---

# Long-Term Roadmap: RefineTest

## Current Milestone (Now)

**Milestone:** v0.1.0 - Foundation
**Status:** In Progress
**Start:** 2026-01-15
**Target:** 2026-03-01

### Goal
Establish core R&D workflow with research, planning, execution, and evaluation.

### Success Criteria
- All Phase 6 tests passing
- Documentation complete
- First external user onboarded

---

## Next Milestones

### v0.2.0 - Agent Teams

**Status:** Next
**Estimated Start:** 2026-03-01
**Estimated Duration:** 6 weeks
**Dependencies:** v0.1.0 complete

#### Goal
Enable parallel execution of independent phases.

#### Success Criteria
- Execute 3 independent phases in parallel
- Agent team collaboration works
- 30% time reduction

#### Rough Phase Sketch
1. Agent Team Protocol
2. Parallel Execution Engine
3. Coordination Primitives
4. Integration Testing

#### Open Questions
- Which protocol: hierarchical vs peer-to-peer?
- How to handle merge conflicts?

---

### v0.3.0 - Advanced Evaluation

**Status:** Next
**Estimated Start:** 2026-04-15
**Estimated Duration:** 4 weeks
**Dependencies:** v0.2.0 complete

#### Goal
Richer evaluation framework with A/B testing and regression detection.

#### Success Criteria
- Automated regression detection
- A/B test support
- Performance profiling

#### Rough Phase Sketch
1. Regression Detection
2. A/B Testing Framework
3. Profiling Integration

#### Open Questions
- Baseline storage: in-repo vs external database?

---

## Later Milestones

### v0.4.0 - Multi-Project Management

**Status:** Later
**Estimated Timeline:** Q3 2026
**Dependencies:** v0.3.0 complete

#### Goal
Support multiple concurrent R&D projects with shared knowledge base.

#### Success Criteria
- Manage 3+ projects in single workspace
- Cross-project research reuse
- Unified progress dashboard

#### Open Research Questions
- Monorepo vs separate repos per project?
- How to structure shared research knowledge graph?

---

### v0.5.0 - Community & Marketplace

**Status:** Later
**Estimated Timeline:** Q4 2026
**Dependencies:** v0.4.0 complete

#### Goal
Enable sharing of research artifacts, phase templates, and evaluation frameworks.

#### Success Criteria
- 10+ published research landscapes
- 20+ reusable phase templates

#### Open Research Questions
- Licensing and attribution model?
- Quality curation mechanism?

---

## Refinement History

| Date | Action | Details |
|------|--------|---------|
| 2026-01-01 | Initial roadmap | Defined v0.1.0 - v0.5.0 with Now-Next-Later tiers |
`;

// ─── getMilestoneTier ────────────────────────────────────────────────────────

describe('getMilestoneTier', () => {
  test('returns now for the Now milestone version', () => {
    expect(getMilestoneTier(REFINE_FIXTURE, 'v0.1.0')).toBe('now');
  });

  test('returns next for a Next milestone version', () => {
    expect(getMilestoneTier(REFINE_FIXTURE, 'v0.2.0')).toBe('next');
  });

  test('returns later for a Later milestone version', () => {
    expect(getMilestoneTier(REFINE_FIXTURE, 'v0.4.0')).toBe('later');
  });

  test('returns null for unknown version', () => {
    expect(getMilestoneTier(REFINE_FIXTURE, 'v9.9.9')).toBeNull();
  });

  test('works with two-segment versions', () => {
    const twoSegContent = REFINE_FIXTURE.replace(/v0\.1\.0/g, 'v1.0');
    expect(getMilestoneTier(twoSegContent, 'v1.0')).toBe('now');
  });
});

// ─── refineMilestone ─────────────────────────────────────────────────────────

describe('refineMilestone', () => {
  test('updates goal of a Next milestone', () => {
    const result = refineMilestone(REFINE_FIXTURE, 'v0.2.0', { goal: 'Updated goal text' });
    expect(typeof result).toBe('string');
    const parsed = parseLongTermRoadmap(result);
    expect(parsed.next[0].goal).toBe('Updated goal text');
  });

  test('updates success_criteria of a Next milestone', () => {
    const result = refineMilestone(REFINE_FIXTURE, 'v0.2.0', {
      success_criteria: ['New criterion 1', 'New criterion 2'],
    });
    const parsed = parseLongTermRoadmap(result);
    expect(parsed.next[0].success_criteria).toEqual(['New criterion 1', 'New criterion 2']);
  });

  test('updates rough_phase_sketch of a Next milestone', () => {
    const result = refineMilestone(REFINE_FIXTURE, 'v0.2.0', {
      rough_phase_sketch: ['Phase A', 'Phase B', 'Phase C'],
    });
    const parsed = parseLongTermRoadmap(result);
    expect(parsed.next[0].rough_phase_sketch).toEqual(['Phase A', 'Phase B', 'Phase C']);
  });

  test('updates open_questions of a Next milestone', () => {
    const result = refineMilestone(REFINE_FIXTURE, 'v0.2.0', {
      open_questions: ['Question 1?', 'Question 2?'],
    });
    const parsed = parseLongTermRoadmap(result);
    expect(parsed.next[0].open_questions).toEqual(['Question 1?', 'Question 2?']);
  });

  test('updates goal of a Later milestone', () => {
    const result = refineMilestone(REFINE_FIXTURE, 'v0.4.0', { goal: 'Refined later goal' });
    const parsed = parseLongTermRoadmap(result);
    expect(parsed.later[0].goal).toBe('Refined later goal');
  });

  test('preserves other milestones unchanged', () => {
    const result = refineMilestone(REFINE_FIXTURE, 'v0.2.0', { goal: 'Changed goal' });
    const parsed = parseLongTermRoadmap(result);
    // v0.3.0 (another Next) should be unchanged
    expect(parsed.next[1].goal).toContain('Richer evaluation framework');
    // v0.4.0 (Later) should be unchanged
    expect(parsed.later[0].goal).toContain('multiple concurrent');
  });

  test('preserves frontmatter and other sections', () => {
    const result = refineMilestone(REFINE_FIXTURE, 'v0.2.0', { goal: 'Changed goal' });
    const parsed = parseLongTermRoadmap(result);
    expect(parsed.frontmatter.project).toBe('RefineTest');
    expect(parsed.frontmatter.roadmap_type).toBe('hierarchical');
    expect(parsed.refinement_history.length).toBeGreaterThanOrEqual(1);
  });

  test('returns error object for unknown version', () => {
    const result = refineMilestone(REFINE_FIXTURE, 'v9.9.9', { goal: 'x' });
    expect(result).toEqual(expect.objectContaining({ error: expect.any(String) }));
  });
});

// ─── promoteMilestone ────────────────────────────────────────────────────────

describe('promoteMilestone', () => {
  test('promotes Later to Next', () => {
    const result = promoteMilestone(REFINE_FIXTURE, 'v0.4.0');
    expect(typeof result).toBe('string');
    const parsed = parseLongTermRoadmap(result);
    const nextVersions = parsed.next.map((m) => m.version);
    expect(nextVersions).toContain('v0.4.0');
    const laterVersions = parsed.later.map((m) => m.version);
    expect(laterVersions).not.toContain('v0.4.0');
  });

  test('Later->Next adds required Next-tier fields', () => {
    const result = promoteMilestone(REFINE_FIXTURE, 'v0.4.0');
    const parsed = parseLongTermRoadmap(result);
    const promoted = parsed.next.find((m) => m.version === 'v0.4.0');
    expect(promoted).toBeDefined();
    expect(promoted.estimated_start).toBeDefined();
    expect(promoted.estimated_duration).toBeDefined();
    expect(promoted.rough_phase_sketch).toBeDefined();
  });

  test('Later->Next preserves existing goal and success_criteria', () => {
    const result = promoteMilestone(REFINE_FIXTURE, 'v0.4.0');
    const parsed = parseLongTermRoadmap(result);
    const promoted = parsed.next.find((m) => m.version === 'v0.4.0');
    expect(promoted.goal).toContain('multiple concurrent');
    expect(promoted.success_criteria).toBeInstanceOf(Array);
    expect(promoted.success_criteria.length).toBeGreaterThan(0);
  });

  test('promotes Next to Now', () => {
    const result = promoteMilestone(REFINE_FIXTURE, 'v0.2.0');
    expect(typeof result).toBe('string');
    const parsed = parseLongTermRoadmap(result);
    expect(parsed.now.version).toBe('v0.2.0');
    const nextVersions = parsed.next.map((m) => m.version);
    expect(nextVersions).not.toContain('v0.2.0');
  });

  test('Next->Now replaces existing Now section', () => {
    const result = promoteMilestone(REFINE_FIXTURE, 'v0.2.0');
    const parsed = parseLongTermRoadmap(result);
    // Old Now (v0.1.0) should no longer be in Now
    expect(parsed.now.version).not.toBe('v0.1.0');
    expect(parsed.now.version).toBe('v0.2.0');
  });

  test('Next->Now preserves other Next milestones', () => {
    const result = promoteMilestone(REFINE_FIXTURE, 'v0.2.0');
    const parsed = parseLongTermRoadmap(result);
    const nextVersions = parsed.next.map((m) => m.version);
    expect(nextVersions).toContain('v0.3.0');
  });

  test('returns error for Now milestone (cannot promote further)', () => {
    const result = promoteMilestone(REFINE_FIXTURE, 'v0.1.0');
    expect(result).toEqual(expect.objectContaining({ error: expect.any(String) }));
  });

  test('returns error for unknown version', () => {
    const result = promoteMilestone(REFINE_FIXTURE, 'v9.9.9');
    expect(result).toEqual(expect.objectContaining({ error: expect.any(String) }));
  });

  test('preserves Later milestones when promoting Later->Next', () => {
    const result = promoteMilestone(REFINE_FIXTURE, 'v0.4.0');
    const parsed = parseLongTermRoadmap(result);
    const laterVersions = parsed.later.map((m) => m.version);
    expect(laterVersions).toContain('v0.5.0');
  });

  test('preserves frontmatter after promotion', () => {
    const result = promoteMilestone(REFINE_FIXTURE, 'v0.4.0');
    const parsed = parseLongTermRoadmap(result);
    expect(parsed.frontmatter.project).toBe('RefineTest');
    expect(parsed.frontmatter.roadmap_type).toBe('hierarchical');
    expect(parsed.frontmatter.planning_horizon).toBe('6 months');
  });
});

// ─── updateRefinementHistory ─────────────────────────────────────────────────

describe('updateRefinementHistory', () => {
  test('appends a new row to refinement history', () => {
    const result = updateRefinementHistory(REFINE_FIXTURE, 'Refined', 'Updated v0.2.0 goal');
    expect(typeof result).toBe('string');
    const parsed = parseLongTermRoadmap(result);
    expect(parsed.refinement_history.length).toBe(2);
  });

  test('new entry has today\'s date', () => {
    const result = updateRefinementHistory(REFINE_FIXTURE, 'Refined', 'Updated v0.2.0 goal');
    const parsed = parseLongTermRoadmap(result);
    const today = new Date().toISOString().split('T')[0];
    const newEntry = parsed.refinement_history[parsed.refinement_history.length - 1];
    expect(newEntry.date).toBe(today);
  });

  test('new entry has correct action and details', () => {
    const result = updateRefinementHistory(REFINE_FIXTURE, 'Refined', 'Updated v0.2.0 goal');
    const parsed = parseLongTermRoadmap(result);
    const newEntry = parsed.refinement_history[parsed.refinement_history.length - 1];
    expect(newEntry.action).toBe('Refined');
    expect(newEntry.details).toBe('Updated v0.2.0 goal');
  });

  test('preserves existing history entries', () => {
    const result = updateRefinementHistory(REFINE_FIXTURE, 'Refined', 'Updated v0.2.0 goal');
    const parsed = parseLongTermRoadmap(result);
    expect(parsed.refinement_history[0].action).toContain('Initial');
    expect(parsed.refinement_history[0].date).toBe('2026-01-01');
  });

  test('works when Refinement History section has no prior entries', () => {
    const emptyHistory = `---
project: "EmptyHistoryTest"
roadmap_type: hierarchical
created: "2026-01-01"
last_refined: "2026-01-01"
planning_horizon: "3 months"
---

# Long-Term Roadmap: EmptyHistoryTest

## Current Milestone (Now)

**Milestone:** v1.0.0 - Start
**Status:** In Progress
**Start:** 2026-01-01
**Target:** 2026-02-01

### Goal
Get started with the project.

### Success Criteria
- Initial setup complete

## Refinement History

| Date | Action | Details |
|------|--------|---------|
`;
    const result = updateRefinementHistory(emptyHistory, 'Added', 'New milestone v2.0');
    const parsed = parseLongTermRoadmap(result);
    expect(parsed.refinement_history.length).toBe(1);
    expect(parsed.refinement_history[0].action).toBe('Added');
  });
});
