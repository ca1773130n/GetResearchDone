/**
 * Round-trip integrity tests for lib/long-term-roadmap.js (DEFER-11-01)
 *
 * Validates the full long-term roadmap lifecycle: create -> refine -> promote ->
 * refine -> promote -> validate, ensuring no data loss at any step.
 *
 * Unlike long-term-roadmap.test.js (unit tests), these tests exercise multi-step
 * lifecycle chains with independent fixture data per test.
 */

const {
  parseLongTermRoadmap,
  validateLongTermRoadmap,
  generateLongTermRoadmap,
  refineMilestone,
  promoteMilestone,
  updateRefinementHistory,
  getMilestoneTier,
} = require('../../lib/long-term-roadmap');

// ─── Shared Fixture Data ──────────────────────────────────────────────────────

/**
 * Build a 5-milestone array: 1 Now, 2 Next, 2 Later.
 * Each test should call this fresh to avoid shared mutable state.
 */
function makeMilestones() {
  return [
    {
      name: 'Foundation',
      version: 'v1.0.0',
      goal: 'Establish core platform with full test coverage',
      success_criteria: [
        'All unit tests passing',
        'Integration tests for critical paths',
        'Documentation for public API',
      ],
      status: 'In Progress',
      start: '2026-01-15',
      target: '2026-03-01',
    },
    {
      name: 'Agent Teams',
      version: 'v2.0.0',
      goal: 'Enable parallel execution of independent phases',
      success_criteria: [
        'Execute 3 independent phases in parallel',
        'Agent team collaboration works end-to-end',
        '30% reduction in milestone completion time',
      ],
      status: 'Next',
      estimated_start: '2026-03-15',
      estimated_duration: '6 weeks',
      dependencies: 'v1.0.0 complete',
      rough_phase_sketch: [
        'Agent Team Protocol',
        'Parallel Execution Engine',
        'Coordination Primitives',
        'Integration Testing',
      ],
      open_questions: [
        'Which protocol: hierarchical vs peer-to-peer?',
        'How to handle merge conflicts in parallel execution?',
      ],
    },
    {
      name: 'Advanced Evaluation',
      version: 'v3.0.0',
      goal: 'Richer evaluation framework with A/B testing and regression detection',
      success_criteria: [
        'Automated regression detection on 5 baseline metrics',
        'A/B test support with statistical significance',
        'Performance profiling in eval reports',
      ],
      status: 'Next',
      estimated_start: '2026-05-01',
      estimated_duration: '4 weeks',
      dependencies: 'v2.0.0 complete',
      rough_phase_sketch: [
        'Regression Detection',
        'A/B Testing Framework',
        'Profiling Integration',
      ],
      open_questions: ['Baseline storage: in-repo vs external database?'],
    },
    {
      name: 'Multi-Project Management',
      version: 'v4.0.0',
      goal: 'Support multiple concurrent R&D projects with shared knowledge base',
      success_criteria: [
        'Manage 3+ projects in single workspace',
        'Cross-project research reuse',
        'Unified progress dashboard',
      ],
      status: 'Later',
      estimated_timeline: 'Q3 2026',
      dependencies: 'v3.0.0 complete',
      open_research_questions: [
        'Monorepo vs separate repos per project?',
        'How to structure shared research knowledge graph?',
      ],
    },
    {
      name: 'Community & Marketplace',
      version: 'v5.0.0',
      goal: 'Enable sharing of research artifacts and phase templates',
      success_criteria: ['10+ published research landscapes', '20+ reusable phase templates'],
      status: 'Later',
      estimated_timeline: 'Q4 2026',
      dependencies: 'v4.0.0 complete, user base >100',
      open_research_questions: ['Licensing and attribution model?', 'Quality curation mechanism?'],
    },
  ];
}

/**
 * Generate a fresh roadmap from milestone data and return the content string.
 */
function freshRoadmap() {
  return generateLongTermRoadmap(makeMilestones(), 'RoundTripTest', '12 months');
}

// ─── Test Group 1: Full Create->Parse Round-Trip ──────────────────────────────

describe('Full Create->Parse Round-Trip', () => {
  test('generated content parses back into 5 milestones in correct tiers', () => {
    const content = freshRoadmap();
    const parsed = parseLongTermRoadmap(content);

    expect(parsed).toBeDefined();
    expect(parsed.now).toBeDefined();
    expect(parsed.now.version).toBe('v1.0.0');
    expect(parsed.next).toHaveLength(2);
    expect(parsed.next[0].version).toBe('v2.0.0');
    expect(parsed.next[1].version).toBe('v3.0.0');
    expect(parsed.later).toHaveLength(2);
    expect(parsed.later[0].version).toBe('v4.0.0');
    expect(parsed.later[1].version).toBe('v5.0.0');
  });

  test('frontmatter fields survive round-trip', () => {
    const content = freshRoadmap();
    const parsed = parseLongTermRoadmap(content);

    expect(parsed.frontmatter.project).toBe('RoundTripTest');
    expect(parsed.frontmatter.roadmap_type).toBe('hierarchical');
    expect(parsed.frontmatter.planning_horizon).toBe('12 months');
    expect(parsed.frontmatter.created).toBeDefined();
    expect(parsed.frontmatter.last_refined).toBeDefined();
  });

  test('Now milestone preserves all data fields through round-trip', () => {
    const content = freshRoadmap();
    const parsed = parseLongTermRoadmap(content);

    expect(parsed.now.milestone).toContain('v1.0.0');
    expect(parsed.now.milestone).toContain('Foundation');
    expect(parsed.now.status).toBe('In Progress');
    expect(parsed.now.start).toBe('2026-01-15');
    expect(parsed.now.target).toBe('2026-03-01');
    expect(parsed.now.goal).toContain('core platform');
    expect(parsed.now.success_criteria).toHaveLength(3);
    expect(parsed.now.success_criteria).toContain('All unit tests passing');
    expect(parsed.now.success_criteria).toContain('Integration tests for critical paths');
    expect(parsed.now.success_criteria).toContain('Documentation for public API');
  });

  test('Next milestones preserve all data fields through round-trip', () => {
    const content = freshRoadmap();
    const parsed = parseLongTermRoadmap(content);

    // v2.0.0 (first Next)
    const next0 = parsed.next[0];
    expect(next0.goal).toContain('parallel execution');
    expect(next0.success_criteria).toHaveLength(3);
    expect(next0.estimated_start).toBe('2026-03-15');
    expect(next0.estimated_duration).toBe('6 weeks');
    expect(next0.dependencies).toContain('v1.0.0');
    expect(next0.rough_phase_sketch).toHaveLength(4);
    expect(next0.rough_phase_sketch[0]).toBe('Agent Team Protocol');
    expect(next0.open_questions).toHaveLength(2);

    // v3.0.0 (second Next)
    const next1 = parsed.next[1];
    expect(next1.goal).toContain('evaluation framework');
    expect(next1.success_criteria).toHaveLength(3);
    expect(next1.estimated_start).toBe('2026-05-01');
    expect(next1.estimated_duration).toBe('4 weeks');
    expect(next1.rough_phase_sketch).toHaveLength(3);
    expect(next1.open_questions).toHaveLength(1);
  });

  test('Later milestones preserve all data fields through round-trip', () => {
    const content = freshRoadmap();
    const parsed = parseLongTermRoadmap(content);

    // v4.0.0 (first Later)
    const later0 = parsed.later[0];
    expect(later0.goal).toContain('multiple concurrent');
    expect(later0.success_criteria).toHaveLength(3);
    expect(later0.estimated_timeline).toBe('Q3 2026');
    expect(later0.dependencies).toContain('v3.0.0');
    expect(later0.open_research_questions).toHaveLength(2);
    expect(later0.open_research_questions[0]).toContain('Monorepo');

    // v5.0.0 (second Later)
    const later1 = parsed.later[1];
    expect(later1.goal).toContain('sharing of research artifacts');
    expect(later1.success_criteria).toHaveLength(2);
    expect(later1.estimated_timeline).toBe('Q4 2026');
    expect(later1.dependencies).toContain('v4.0.0');
    expect(later1.open_research_questions).toHaveLength(2);
  });

  test('parsed result passes validateLongTermRoadmap with valid=true and no errors', () => {
    const content = freshRoadmap();
    const parsed = parseLongTermRoadmap(content);
    const validation = validateLongTermRoadmap(parsed);

    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });
});

// ─── Test Group 2: Refine->Parse Round-Trip ───────────────────────────────────

describe('Refine->Parse Round-Trip', () => {
  test('refining a Next milestone goal preserves all other milestones', () => {
    const content = freshRoadmap();

    const refined = refineMilestone(content, 'v2.0.0', {
      goal: 'Completely rewritten goal for Agent Teams',
    });
    expect(typeof refined).toBe('string');

    const parsed = parseLongTermRoadmap(refined);

    // Refined milestone has new goal
    expect(parsed.next[0].goal).toBe('Completely rewritten goal for Agent Teams');

    // All other milestones unchanged
    expect(parsed.now.goal).toContain('core platform');
    expect(parsed.now.success_criteria).toHaveLength(3);
    expect(parsed.next[1].goal).toContain('evaluation framework');
    expect(parsed.next[1].success_criteria).toHaveLength(3);
    expect(parsed.later[0].goal).toContain('multiple concurrent');
    expect(parsed.later[0].success_criteria).toHaveLength(3);
    expect(parsed.later[1].goal).toContain('sharing of research artifacts');
    expect(parsed.later[1].success_criteria).toHaveLength(2);
  });

  test('sequential refinements to the same milestone accumulate correctly', () => {
    let content = freshRoadmap();

    // Refine goal
    content = refineMilestone(content, 'v2.0.0', {
      goal: 'New goal for Agent Teams v2',
    });

    // Refine success_criteria
    content = refineMilestone(content, 'v2.0.0', {
      success_criteria: ['First new criterion', 'Second new criterion'],
    });

    const parsed = parseLongTermRoadmap(content);

    // Both refinements present
    expect(parsed.next[0].goal).toBe('New goal for Agent Teams v2');
    expect(parsed.next[0].success_criteria).toEqual([
      'First new criterion',
      'Second new criterion',
    ]);

    // Everything else intact
    expect(parsed.now.version).toBe('v1.0.0');
    expect(parsed.next[1].version).toBe('v3.0.0');
    expect(parsed.later).toHaveLength(2);
  });

  test('refining a DIFFERENT milestone (Later tier) preserves prior refinements', () => {
    let content = freshRoadmap();

    // Refine Next milestone
    content = refineMilestone(content, 'v2.0.0', {
      goal: 'Refined Next goal',
    });

    // Refine Later milestone
    content = refineMilestone(content, 'v4.0.0', {
      goal: 'Refined Later goal for Multi-Project',
    });

    const parsed = parseLongTermRoadmap(content);

    // Both refinements present
    expect(parsed.next[0].goal).toBe('Refined Next goal');
    expect(parsed.later[0].goal).toBe('Refined Later goal for Multi-Project');

    // Unrelated milestones unchanged
    expect(parsed.now.goal).toContain('core platform');
    expect(parsed.next[1].goal).toContain('evaluation framework');
    expect(parsed.later[1].goal).toContain('sharing of research artifacts');
  });

  test('refining multiple fields across different milestones produces valid output', () => {
    let content = freshRoadmap();

    content = refineMilestone(content, 'v2.0.0', {
      goal: 'Refined v2 goal',
      success_criteria: ['SC-A', 'SC-B'],
    });

    content = refineMilestone(content, 'v3.0.0', {
      rough_phase_sketch: ['Phase X', 'Phase Y'],
    });

    content = refineMilestone(content, 'v4.0.0', {
      open_research_questions: ['New Q1?', 'New Q2?', 'New Q3?'],
    });

    const parsed = parseLongTermRoadmap(content);
    const validation = validateLongTermRoadmap(parsed);

    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);

    // Verify each refinement
    expect(parsed.next[0].goal).toBe('Refined v2 goal');
    expect(parsed.next[0].success_criteria).toEqual(['SC-A', 'SC-B']);
    expect(parsed.next[1].rough_phase_sketch).toEqual(['Phase X', 'Phase Y']);
    expect(parsed.later[0].open_research_questions).toEqual(['New Q1?', 'New Q2?', 'New Q3?']);
  });
});

// ─── Test Group 3: Multi-Step Promotion Chain ─────────────────────────────────

describe('Multi-Step Promotion Chain', () => {
  test('Later -> Next promotion: tier counts shift correctly', () => {
    let content = freshRoadmap();

    // Start: 1 Now, 2 Next, 2 Later
    let parsed = parseLongTermRoadmap(content);
    expect(parsed.next).toHaveLength(2);
    expect(parsed.later).toHaveLength(2);

    // Promote v4.0.0: Later -> Next
    content = promoteMilestone(content, 'v4.0.0');
    expect(typeof content).toBe('string');

    parsed = parseLongTermRoadmap(content);
    expect(parsed.now.version).toBe('v1.0.0');
    expect(parsed.next).toHaveLength(3);
    expect(parsed.later).toHaveLength(1);

    // Promoted milestone preserved its data
    const promoted = parsed.next.find((m) => m.version === 'v4.0.0');
    expect(promoted).toBeDefined();
    expect(promoted.goal).toContain('multiple concurrent');
    expect(promoted.success_criteria.length).toBeGreaterThan(0);
  });

  test('Next -> Now promotion: replaces current Now', () => {
    let content = freshRoadmap();

    // Promote v2.0.0: Next -> Now
    content = promoteMilestone(content, 'v2.0.0');
    expect(typeof content).toBe('string');

    const parsed = parseLongTermRoadmap(content);
    expect(parsed.now.version).toBe('v2.0.0');
    expect(parsed.now.goal).toContain('parallel execution');
    expect(parsed.next.map((m) => m.version)).not.toContain('v2.0.0');
    // v3.0.0 still in Next
    expect(parsed.next.some((m) => m.version === 'v3.0.0')).toBe(true);
    // Later unchanged
    expect(parsed.later).toHaveLength(2);
  });

  test('each promotion step passes parse + validate', () => {
    let content = freshRoadmap();

    // Step 1: Later -> Next
    content = promoteMilestone(content, 'v4.0.0');
    let parsed = parseLongTermRoadmap(content);
    let validation = validateLongTermRoadmap(parsed);
    expect(parsed).toBeDefined();
    expect(validation.valid).toBe(true);

    // Step 2: Next -> Now
    content = promoteMilestone(content, 'v2.0.0');
    parsed = parseLongTermRoadmap(content);
    validation = validateLongTermRoadmap(parsed);
    expect(parsed).toBeDefined();
    expect(validation.valid).toBe(true);
  });
});

// ─── Test Group 4: Combined Refine + Promote Chain ────────────────────────────

describe('Combined Refine + Promote Chain', () => {
  test('refine Later, promote to Next, refine again, promote to Now: all refinements preserved', () => {
    let content = freshRoadmap();

    // Step 1: Refine v4.0.0 in Later tier
    content = refineMilestone(content, 'v4.0.0', {
      success_criteria: ['Refined criterion A', 'Refined criterion B', 'Refined criterion C'],
    });

    // Step 2: Promote v4.0.0 Later -> Next
    content = promoteMilestone(content, 'v4.0.0');
    expect(typeof content).toBe('string');

    let parsed = parseLongTermRoadmap(content);
    let promoted = parsed.next.find((m) => m.version === 'v4.0.0');
    expect(promoted).toBeDefined();
    // Refinement from step 1 should be preserved
    expect(promoted.success_criteria).toContain('Refined criterion A');
    expect(promoted.success_criteria).toContain('Refined criterion B');
    expect(promoted.success_criteria).toContain('Refined criterion C');

    // Step 3: Refine v4.0.0 in Next tier (update goal)
    content = refineMilestone(content, 'v4.0.0', {
      goal: 'Updated goal after promotion to Next',
    });

    // Step 4: Promote v4.0.0 Next -> Now (needs to remove current Now first via the function)
    // First promote the old Now's successor
    content = promoteMilestone(content, 'v4.0.0');
    expect(typeof content).toBe('string');

    parsed = parseLongTermRoadmap(content);

    // v4.0.0 is now the Now milestone
    expect(parsed.now.version).toBe('v4.0.0');
    // Goal from step 3 refinement should be present
    expect(parsed.now.goal).toBe('Updated goal after promotion to Next');
    // Success criteria from step 1 refinement should still be present
    expect(parsed.now.success_criteria).toContain('Refined criterion A');
    expect(parsed.now.success_criteria).toContain('Refined criterion B');
    expect(parsed.now.success_criteria).toContain('Refined criterion C');
  });

  test('combined chain produces valid output at every step', () => {
    let content = freshRoadmap();

    // Refine
    content = refineMilestone(content, 'v4.0.0', {
      goal: 'Detailed multi-project goal',
    });
    expect(validateLongTermRoadmap(parseLongTermRoadmap(content)).valid).toBe(true);

    // Promote Later -> Next
    content = promoteMilestone(content, 'v4.0.0');
    expect(validateLongTermRoadmap(parseLongTermRoadmap(content)).valid).toBe(true);

    // Refine again
    content = refineMilestone(content, 'v4.0.0', {
      success_criteria: ['New SC 1', 'New SC 2'],
    });
    expect(validateLongTermRoadmap(parseLongTermRoadmap(content)).valid).toBe(true);

    // Promote Next -> Now
    content = promoteMilestone(content, 'v4.0.0');
    expect(validateLongTermRoadmap(parseLongTermRoadmap(content)).valid).toBe(true);
  });
});

// ─── Test Group 5: Refinement History Accumulation ────────────────────────────

describe('Refinement History Accumulation', () => {
  test('multiple updateRefinementHistory calls accumulate entries correctly', () => {
    let content = freshRoadmap();

    // Initial history has 1 entry (from generation)
    let parsed = parseLongTermRoadmap(content);
    expect(parsed.refinement_history).toHaveLength(1);
    expect(parsed.refinement_history[0].action).toContain('Initial');

    // Add 3 more entries
    content = updateRefinementHistory(content, 'Refined', 'Updated v2.0.0 goal');
    content = updateRefinementHistory(content, 'Promoted', 'Moved v4.0.0 to Next tier');
    content = updateRefinementHistory(content, 'Refined', 'Updated v4.0.0 success criteria');

    parsed = parseLongTermRoadmap(content);

    expect(parsed.refinement_history).toHaveLength(4);

    // Check order: initial first, then appended entries
    expect(parsed.refinement_history[0].action).toContain('Initial');
    expect(parsed.refinement_history[1].action).toBe('Refined');
    expect(parsed.refinement_history[1].details).toBe('Updated v2.0.0 goal');
    expect(parsed.refinement_history[2].action).toBe('Promoted');
    expect(parsed.refinement_history[2].details).toBe('Moved v4.0.0 to Next tier');
    expect(parsed.refinement_history[3].action).toBe('Refined');
    expect(parsed.refinement_history[3].details).toBe('Updated v4.0.0 success criteria');
  });

  test('all history entries have correct date format', () => {
    let content = freshRoadmap();
    const today = new Date().toISOString().split('T')[0];

    content = updateRefinementHistory(content, 'Added', 'New milestone v6.0.0');
    content = updateRefinementHistory(content, 'Refined', 'Updated v3.0.0 goal');

    const parsed = parseLongTermRoadmap(content);

    for (const entry of parsed.refinement_history) {
      expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }

    // New entries should have today's date
    expect(parsed.refinement_history[1].date).toBe(today);
    expect(parsed.refinement_history[2].date).toBe(today);
  });

  test('history accumulation does not corrupt milestone data', () => {
    let content = freshRoadmap();

    content = updateRefinementHistory(content, 'Refined', 'First update');
    content = updateRefinementHistory(content, 'Refined', 'Second update');
    content = updateRefinementHistory(content, 'Refined', 'Third update');

    const parsed = parseLongTermRoadmap(content);

    // All milestones intact
    expect(parsed.now.version).toBe('v1.0.0');
    expect(parsed.now.success_criteria).toHaveLength(3);
    expect(parsed.next).toHaveLength(2);
    expect(parsed.later).toHaveLength(2);
    expect(parsed.later[0].open_research_questions).toHaveLength(2);
  });
});

// ─── Test Group 6: Edge Cases for Data Preservation ───────────────────────────

describe('Edge Cases for Data Preservation', () => {
  test('milestone with special characters in goal survives round-trip', () => {
    const milestones = makeMilestones();
    milestones[0].goal = 'Build the "core" platform (v1.0) - first release: alpha';
    const content = generateLongTermRoadmap(milestones, 'SpecialChars', '6 months');
    const parsed = parseLongTermRoadmap(content);

    expect(parsed.now.goal).toContain('"core"');
    expect(parsed.now.goal).toContain('(v1.0)');
    expect(parsed.now.goal).toContain('first release: alpha');
  });

  test('success criteria with markdown formatting survives round-trip', () => {
    const milestones = makeMilestones();
    milestones[0].success_criteria = [
      '**Bold criterion** with emphasis',
      'Criterion with `inline code` block',
      'Criterion with a [link](http://example.com)',
    ];
    const content = generateLongTermRoadmap(milestones, 'MarkdownTest', '6 months');
    const parsed = parseLongTermRoadmap(content);

    expect(parsed.now.success_criteria).toHaveLength(3);
    expect(parsed.now.success_criteria[0]).toContain('**Bold criterion**');
    expect(parsed.now.success_criteria[1]).toContain('`inline code`');
    expect(parsed.now.success_criteria[2]).toContain('[link](http://example.com)');
  });

  test('open questions with special characters survive round-trip', () => {
    const milestones = makeMilestones();
    milestones[1].open_questions = [
      'What is the cost: $100 or $200?',
      'Should we use approach A (fast) or B (reliable)?',
      'See https://example.com/docs for details?',
    ];
    const content = generateLongTermRoadmap(milestones, 'SpecialQTest', '6 months');
    const parsed = parseLongTermRoadmap(content);

    expect(parsed.next[0].open_questions).toHaveLength(3);
    expect(parsed.next[0].open_questions[0]).toContain('$100 or $200?');
    expect(parsed.next[0].open_questions[1]).toContain('approach A (fast)');
    expect(parsed.next[0].open_questions[2]).toContain('https://example.com/docs');
  });

  test('milestones with hyphens and colons in names survive round-trip', () => {
    const milestones = makeMilestones();
    milestones[0].name = 'Phase-1: Core - Foundation';
    const content = generateLongTermRoadmap(milestones, 'HyphenColonTest', '6 months');
    const parsed = parseLongTermRoadmap(content);

    expect(parsed.now.milestone).toContain('Phase-1: Core - Foundation');
  });
});

// ─── Test Group 7: ROADMAP.md Generation Integrity ────────────────────────────

describe('ROADMAP.md Generation Integrity', () => {
  test('after full promotion chain, Now milestone has correct data for ROADMAP.md population', () => {
    let content = freshRoadmap();

    // Refine v4.0.0 in Later
    content = refineMilestone(content, 'v4.0.0', {
      success_criteria: ['Workspace mgmt', 'Knowledge sharing', 'Dashboard'],
    });

    // Promote Later -> Next
    content = promoteMilestone(content, 'v4.0.0');

    // Promote Next -> Now
    content = promoteMilestone(content, 'v4.0.0');

    const parsed = parseLongTermRoadmap(content);

    // Now milestone has the promoted data
    expect(parsed.now.version).toBe('v4.0.0');
    expect(parsed.now.milestone).toContain('Multi-Project Management');
    expect(parsed.now.status).toBe('In Progress');
    expect(parsed.now.goal).toContain('multiple concurrent');
    expect(parsed.now.success_criteria).toContain('Workspace mgmt');
    expect(parsed.now.success_criteria).toContain('Knowledge sharing');
    expect(parsed.now.success_criteria).toContain('Dashboard');
  });

  test('generateLongTermRoadmap produces markdown that passes both parse and validate', () => {
    const milestones = makeMilestones();
    const content = generateLongTermRoadmap(milestones, 'IntegrityTest', '12 months');

    const parsed = parseLongTermRoadmap(content);
    expect(parsed).toBeDefined();
    expect(parsed.now).toBeDefined();
    expect(parsed.next).toBeInstanceOf(Array);
    expect(parsed.later).toBeInstanceOf(Array);

    const validation = validateLongTermRoadmap(parsed);
    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });

  test('Milestone Dependency Graph section is present and contains version strings', () => {
    const content = freshRoadmap();

    expect(content).toContain('## Milestone Dependency Graph');
    expect(content).toContain('v1.0.0 (Now)');
    expect(content).toContain('v2.0.0 (Next)');
    expect(content).toContain('v4.0.0 (Later)');
  });

  test('Refinement History table is well-formed after multiple operations', () => {
    let content = freshRoadmap();

    content = updateRefinementHistory(content, 'Refined', 'Updated v2.0.0 goal');
    content = refineMilestone(content, 'v2.0.0', { goal: 'New goal' });
    content = updateRefinementHistory(content, 'Promoted', 'Moved v4.0.0 to Next');
    content = promoteMilestone(content, 'v4.0.0');
    content = updateRefinementHistory(content, 'Refined', 'Updated v4.0.0 success criteria');

    const parsed = parseLongTermRoadmap(content);

    // History table should have 4 entries: initial + 3 updates
    expect(parsed.refinement_history).toHaveLength(4);

    // All entries have proper structure
    for (const entry of parsed.refinement_history) {
      expect(entry).toHaveProperty('date');
      expect(entry).toHaveProperty('action');
      expect(entry).toHaveProperty('details');
      expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(entry.action.length).toBeGreaterThan(0);
      expect(entry.details.length).toBeGreaterThan(0);
    }
  });

  test('getMilestoneTier reports correct tiers after operations', () => {
    let content = freshRoadmap();

    expect(getMilestoneTier(content, 'v1.0.0')).toBe('now');
    expect(getMilestoneTier(content, 'v2.0.0')).toBe('next');
    expect(getMilestoneTier(content, 'v4.0.0')).toBe('later');

    // Promote v4.0.0 Later -> Next
    content = promoteMilestone(content, 'v4.0.0');
    expect(getMilestoneTier(content, 'v4.0.0')).toBe('next');

    // Promote v4.0.0 Next -> Now
    content = promoteMilestone(content, 'v4.0.0');
    expect(getMilestoneTier(content, 'v4.0.0')).toBe('now');
  });

  test('full lifecycle: generate -> refine -> promote -> history -> validate', () => {
    let content = freshRoadmap();

    // Multiple operations in sequence
    content = refineMilestone(content, 'v3.0.0', {
      goal: 'Enhanced evaluation with ML-powered regression detection',
    });
    content = updateRefinementHistory(content, 'Refined', 'Updated v3.0.0 goal');

    content = refineMilestone(content, 'v4.0.0', {
      success_criteria: [
        'Multi-workspace support',
        'Shared knowledge graph',
        'Cross-project search',
      ],
    });
    content = updateRefinementHistory(content, 'Refined', 'Updated v4.0.0 success criteria');

    content = promoteMilestone(content, 'v4.0.0');
    content = updateRefinementHistory(content, 'Promoted', 'Moved v4.0.0 Later -> Next');

    // Final validation
    const parsed = parseLongTermRoadmap(content);
    const validation = validateLongTermRoadmap(parsed);

    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);

    // Verify all data integrity
    expect(parsed.now.version).toBe('v1.0.0');
    expect(parsed.next.some((m) => m.version === 'v3.0.0')).toBe(true);
    expect(parsed.next.find((m) => m.version === 'v3.0.0').goal).toContain('ML-powered');
    expect(parsed.next.some((m) => m.version === 'v4.0.0')).toBe(true);
    expect(parsed.next.find((m) => m.version === 'v4.0.0').success_criteria).toContain(
      'Multi-workspace support'
    );
    expect(parsed.later).toHaveLength(1);
    expect(parsed.later[0].version).toBe('v5.0.0');
    expect(parsed.refinement_history).toHaveLength(4);
  });
});
