/**
 * Round-trip integrity tests for lib/long-term-roadmap.js
 *
 * Validates the full long-term roadmap lifecycle: create -> update -> link ->
 * unlink -> add -> remove -> validate, ensuring no data loss at any step.
 */

const {
  parseLongTermRoadmap,
  validateLongTermRoadmap,
  generateLongTermRoadmap,
  formatLongTermRoadmap,
  updateRefinementHistory,
  addLtMilestone,
  removeLtMilestone,
  updateLtMilestone,
  linkNormalMilestone,
  unlinkNormalMilestone,
  nextLtId,
} = require('../../lib/long-term-roadmap');

// ─── Shared Fixture Data ──────────────────────────────────────────────────────

function makeMilestones() {
  return [
    {
      id: 'LT-1',
      name: 'Foundation',
      status: 'completed',
      goal: 'Establish core platform with full test coverage',
      normal_milestones: [{ version: 'v0.0.5' }, { version: 'v0.1.0' }, { version: 'v0.1.1' }],
    },
    {
      id: 'LT-2',
      name: 'Growth & Polish',
      status: 'active',
      goal: 'Expand features and improve developer experience',
      normal_milestones: [{ version: 'v0.2.0', note: 'planned' }],
    },
    {
      id: 'LT-3',
      name: 'Advanced Workflows',
      status: 'planned',
      goal: 'Agent Teams, async I/O, advanced evaluation',
      normal_milestones: [],
    },
  ];
}

function freshRoadmap() {
  return generateLongTermRoadmap(makeMilestones(), 'RoundTripTest');
}

// ─── Test Group 1: Full Create->Parse Round-Trip ──────────────────────────────

describe('Full Create->Parse Round-Trip', () => {
  test('generated content parses back into correct milestones', () => {
    const content = freshRoadmap();
    const parsed = parseLongTermRoadmap(content);

    expect(parsed).toBeDefined();
    expect(parsed.milestones).toHaveLength(3);
    expect(parsed.milestones[0].id).toBe('LT-1');
    expect(parsed.milestones[0].status).toBe('completed');
    expect(parsed.milestones[1].id).toBe('LT-2');
    expect(parsed.milestones[1].status).toBe('active');
    expect(parsed.milestones[2].id).toBe('LT-3');
    expect(parsed.milestones[2].status).toBe('planned');
  });

  test('frontmatter fields survive round-trip', () => {
    const content = freshRoadmap();
    const parsed = parseLongTermRoadmap(content);

    expect(parsed.frontmatter.project).toBe('RoundTripTest');
    expect(parsed.frontmatter.created).toBeDefined();
    expect(parsed.frontmatter.last_refined).toBeDefined();
  });

  test('normal milestones survive round-trip', () => {
    const content = freshRoadmap();
    const parsed = parseLongTermRoadmap(content);

    expect(parsed.milestones[0].normal_milestones).toHaveLength(3);
    expect(parsed.milestones[0].normal_milestones[0].version).toBe('v0.0.5');
    expect(parsed.milestones[1].normal_milestones).toHaveLength(1);
    expect(parsed.milestones[1].normal_milestones[0].note).toBe('planned');
    expect(parsed.milestones[2].normal_milestones).toEqual([]);
  });

  test('goals survive round-trip', () => {
    const content = freshRoadmap();
    const parsed = parseLongTermRoadmap(content);

    expect(parsed.milestones[0].goal).toContain('core platform');
    expect(parsed.milestones[1].goal).toContain('Expand features');
    expect(parsed.milestones[2].goal).toContain('Agent Teams');
  });

  test('parsed result passes validation', () => {
    const content = freshRoadmap();
    const parsed = parseLongTermRoadmap(content);
    const validation = validateLongTermRoadmap(parsed);

    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });
});

// ─── Test Group 2: Update->Parse Round-Trip ───────────────────────────────────

describe('Update->Parse Round-Trip', () => {
  test('updating goal preserves other milestones', () => {
    let content = freshRoadmap();
    content = updateLtMilestone(content, 'LT-2', { goal: 'Completely rewritten goal' });

    const parsed = parseLongTermRoadmap(content);
    expect(parsed.milestones[1].goal).toBe('Completely rewritten goal');
    expect(parsed.milestones[0].goal).toContain('core platform');
    expect(parsed.milestones[2].goal).toContain('Agent Teams');
  });

  test('updating name preserves other fields', () => {
    let content = freshRoadmap();
    content = updateLtMilestone(content, 'LT-2', { name: 'Renamed Milestone' });

    const parsed = parseLongTermRoadmap(content);
    expect(parsed.milestones[1].name).toBe('Renamed Milestone');
    expect(parsed.milestones[1].goal).toContain('Expand features');
    expect(parsed.milestones[1].status).toBe('active');
  });

  test('updating status preserves other fields', () => {
    let content = freshRoadmap();
    content = updateLtMilestone(content, 'LT-3', { status: 'active' });

    const parsed = parseLongTermRoadmap(content);
    expect(parsed.milestones[2].status).toBe('active');
    expect(parsed.milestones[2].goal).toContain('Agent Teams');
    expect(parsed.milestones[2].name).toBe('Advanced Workflows');
  });

  test('sequential updates to same milestone accumulate', () => {
    let content = freshRoadmap();
    content = updateLtMilestone(content, 'LT-2', { goal: 'New goal' });
    content = updateLtMilestone(content, 'LT-2', { name: 'New name' });
    content = updateLtMilestone(content, 'LT-2', { status: 'completed' });

    const parsed = parseLongTermRoadmap(content);
    expect(parsed.milestones[1].goal).toBe('New goal');
    expect(parsed.milestones[1].name).toBe('New name');
    expect(parsed.milestones[1].status).toBe('completed');
  });

  test('updates across different milestones all preserved', () => {
    let content = freshRoadmap();
    content = updateLtMilestone(content, 'LT-2', { goal: 'Goal 2 updated' });
    content = updateLtMilestone(content, 'LT-3', { goal: 'Goal 3 updated' });

    const parsed = parseLongTermRoadmap(content);
    expect(parsed.milestones[1].goal).toBe('Goal 2 updated');
    expect(parsed.milestones[2].goal).toBe('Goal 3 updated');
    expect(parsed.milestones[0].goal).toContain('core platform');
  });

  test('updated content passes validation', () => {
    let content = freshRoadmap();
    content = updateLtMilestone(content, 'LT-2', { goal: 'Updated goal' });
    content = updateLtMilestone(content, 'LT-3', { status: 'active' });

    const parsed = parseLongTermRoadmap(content);
    const validation = validateLongTermRoadmap(parsed);
    expect(validation.valid).toBe(true);
  });
});

// ─── Test Group 3: Link/Unlink Round-Trip ─────────────────────────────────────

describe('Link/Unlink Round-Trip', () => {
  test('link adds version to normal milestones', () => {
    let content = freshRoadmap();
    content = linkNormalMilestone(content, 'LT-3', 'v0.3.0');

    const parsed = parseLongTermRoadmap(content);
    expect(parsed.milestones[2].normal_milestones).toHaveLength(1);
    expect(parsed.milestones[2].normal_milestones[0].version).toBe('v0.3.0');
  });

  test('link with note preserves note', () => {
    let content = freshRoadmap();
    content = linkNormalMilestone(content, 'LT-3', 'v0.3.0', 'planned');

    const parsed = parseLongTermRoadmap(content);
    expect(parsed.milestones[2].normal_milestones[0].note).toBe('planned');
  });

  test('multiple links accumulate', () => {
    let content = freshRoadmap();
    content = linkNormalMilestone(content, 'LT-3', 'v0.3.0');
    content = linkNormalMilestone(content, 'LT-3', 'v0.4.0', 'planned');

    const parsed = parseLongTermRoadmap(content);
    expect(parsed.milestones[2].normal_milestones).toHaveLength(2);
    expect(parsed.milestones[2].normal_milestones[0].version).toBe('v0.3.0');
    expect(parsed.milestones[2].normal_milestones[1].version).toBe('v0.4.0');
  });

  test('unlink removes version from normal milestones', () => {
    let content = freshRoadmap();
    content = linkNormalMilestone(content, 'LT-3', 'v0.3.0');
    content = unlinkNormalMilestone(content, 'LT-3', 'v0.3.0');

    const parsed = parseLongTermRoadmap(content);
    expect(parsed.milestones[2].normal_milestones).toEqual([]);
  });

  test('link/unlink preserves other milestones', () => {
    let content = freshRoadmap();
    content = linkNormalMilestone(content, 'LT-3', 'v0.3.0');

    const parsed = parseLongTermRoadmap(content);
    expect(parsed.milestones[0].normal_milestones).toHaveLength(3);
    expect(parsed.milestones[1].normal_milestones).toHaveLength(1);
  });
});

// ─── Test Group 4: Add/Remove Round-Trip ──────────────────────────────────────

describe('Add/Remove Round-Trip', () => {
  test('add milestone increases count', () => {
    let content = freshRoadmap();
    const result = addLtMilestone(content, 'New Feature', 'Build something new');
    content = result.content;

    const parsed = parseLongTermRoadmap(content);
    expect(parsed.milestones).toHaveLength(4);
    expect(parsed.milestones[3].id).toBe('LT-4');
    expect(parsed.milestones[3].name).toBe('New Feature');
  });

  test('remove milestone decreases count', () => {
    let content = freshRoadmap();
    content = removeLtMilestone(content, 'LT-3');

    const parsed = parseLongTermRoadmap(content);
    expect(parsed.milestones).toHaveLength(2);
  });

  test('add then remove returns to original state', () => {
    let content = freshRoadmap();
    const result = addLtMilestone(content, 'Temp', 'Temporary');
    content = result.content;
    content = removeLtMilestone(content, result.id);

    const parsed = parseLongTermRoadmap(content);
    expect(parsed.milestones).toHaveLength(3);
    expect(parsed.milestones[0].id).toBe('LT-1');
    expect(parsed.milestones[1].id).toBe('LT-2');
    expect(parsed.milestones[2].id).toBe('LT-3');
  });

  test('multiple adds increment ID correctly', () => {
    let content = freshRoadmap();
    let result = addLtMilestone(content, 'A', 'Goal A');
    content = result.content;
    result = addLtMilestone(content, 'B', 'Goal B');
    content = result.content;

    const parsed = parseLongTermRoadmap(content);
    expect(parsed.milestones).toHaveLength(5);
    expect(parsed.milestones[3].id).toBe('LT-4');
    expect(parsed.milestones[4].id).toBe('LT-5');
  });

  test('add/remove preserves existing milestones', () => {
    let content = freshRoadmap();
    const result = addLtMilestone(content, 'Extra', 'Extra goal');
    content = result.content;

    const parsed = parseLongTermRoadmap(content);
    expect(parsed.milestones[0].goal).toContain('core platform');
    expect(parsed.milestones[1].goal).toContain('Expand features');
    expect(parsed.milestones[2].goal).toContain('Agent Teams');
  });
});

// ─── Test Group 5: Refinement History Accumulation ────────────────────────────

describe('Refinement History Accumulation', () => {
  test('multiple history updates accumulate entries', () => {
    let content = freshRoadmap();

    let parsed = parseLongTermRoadmap(content);
    expect(parsed.refinement_history).toHaveLength(1);

    content = updateRefinementHistory(content, 'Added', 'Added LT-4');
    content = updateRefinementHistory(content, 'Updated', 'Changed LT-2 goal');
    content = updateRefinementHistory(content, 'Linked', 'Linked v0.3.0 to LT-3');

    parsed = parseLongTermRoadmap(content);
    expect(parsed.refinement_history).toHaveLength(4);
    expect(parsed.refinement_history[0].action).toContain('Initial');
    expect(parsed.refinement_history[1].action).toBe('Added');
    expect(parsed.refinement_history[2].action).toBe('Updated');
    expect(parsed.refinement_history[3].action).toBe('Linked');
  });

  test('history entries have correct date format', () => {
    let content = freshRoadmap();
    const today = new Date().toISOString().split('T')[0];

    content = updateRefinementHistory(content, 'Test', 'Test entry');

    const parsed = parseLongTermRoadmap(content);
    for (const entry of parsed.refinement_history) {
      expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    expect(parsed.refinement_history[1].date).toBe(today);
  });

  test('history accumulation does not corrupt milestone data', () => {
    let content = freshRoadmap();
    content = updateRefinementHistory(content, 'A', 'First');
    content = updateRefinementHistory(content, 'B', 'Second');
    content = updateRefinementHistory(content, 'C', 'Third');

    const parsed = parseLongTermRoadmap(content);
    expect(parsed.milestones).toHaveLength(3);
    expect(parsed.milestones[0].normal_milestones).toHaveLength(3);
    expect(parsed.milestones[1].normal_milestones).toHaveLength(1);
  });
});

// ─── Test Group 6: Combined Operations ────────────────────────────────────────

describe('Combined Operations', () => {
  test('full lifecycle: add, update, link, history, validate', () => {
    let content = freshRoadmap();

    // Add LT-4
    const addResult = addLtMilestone(content, 'Scale', 'Scale to production');
    content = addResult.content;
    content = updateRefinementHistory(content, 'Added', 'Added LT-4: Scale');

    // Update LT-2 goal
    content = updateLtMilestone(content, 'LT-2', { goal: 'Enhanced dev experience' });
    content = updateRefinementHistory(content, 'Updated', 'Changed LT-2 goal');

    // Link v0.3.0 to LT-3
    content = linkNormalMilestone(content, 'LT-3', 'v0.3.0', 'planned');
    content = updateRefinementHistory(content, 'Linked', 'Linked v0.3.0 to LT-3');

    // Validate
    const parsed = parseLongTermRoadmap(content);
    const validation = validateLongTermRoadmap(parsed);

    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);

    // Verify data integrity
    expect(parsed.milestones).toHaveLength(4);
    expect(parsed.milestones[1].goal).toBe('Enhanced dev experience');
    expect(parsed.milestones[2].normal_milestones[0].version).toBe('v0.3.0');
    expect(parsed.milestones[3].id).toBe('LT-4');
    expect(parsed.milestones[3].name).toBe('Scale');
    expect(parsed.refinement_history).toHaveLength(4);
  });

  test('format produces expected output after multiple operations', () => {
    let content = freshRoadmap();
    content = updateLtMilestone(content, 'LT-2', { status: 'completed' });
    content = updateLtMilestone(content, 'LT-3', { status: 'active' });

    const parsed = parseLongTermRoadmap(content);
    const formatted = formatLongTermRoadmap(parsed);

    // Two completed, one active
    const doneCount = (formatted.match(/\[done\]/g) || []).length;
    const activeCount = (formatted.match(/\[active\]/g) || []).length;
    expect(doneCount).toBe(2);
    expect(activeCount).toBe(1);
  });

  test('nextLtId works after add/remove operations', () => {
    let content = freshRoadmap();

    // Add LT-4
    const result1 = addLtMilestone(content, 'A', 'Goal A');
    content = result1.content;
    expect(result1.id).toBe('LT-4');

    // Remove LT-3
    content = removeLtMilestone(content, 'LT-3');

    // Next ID should be LT-5 (based on max existing, which is LT-4)
    const parsed = parseLongTermRoadmap(content);
    expect(nextLtId(parsed)).toBe('LT-5');
  });
});

// ─── Test Group 7: Edge Cases ─────────────────────────────────────────────────

describe('Edge Cases', () => {
  test('milestone with special characters in goal survives round-trip', () => {
    const milestones = makeMilestones();
    milestones[0].goal = 'Build the "core" platform (v1) - first: alpha';
    const content = generateLongTermRoadmap(milestones, 'SpecialChars');
    const parsed = parseLongTermRoadmap(content);

    expect(parsed.milestones[0].goal).toContain('"core"');
    expect(parsed.milestones[0].goal).toContain('(v1)');
    expect(parsed.milestones[0].goal).toContain('first: alpha');
  });

  test('milestone with colons and hyphens in name survives round-trip', () => {
    const milestones = makeMilestones();
    milestones[0].name = 'Phase-1: Core - Foundation';
    const content = generateLongTermRoadmap(milestones, 'HyphenTest');
    const parsed = parseLongTermRoadmap(content);

    expect(parsed.milestones[0].name).toContain('Phase-1: Core - Foundation');
  });

  test('empty normal milestones list round-trips correctly', () => {
    const milestones = [
      { id: 'LT-1', name: 'Solo', status: 'active', goal: 'Only one', normal_milestones: [] },
    ];
    const content = generateLongTermRoadmap(milestones, 'EmptyTest');
    const parsed = parseLongTermRoadmap(content);

    expect(parsed.milestones[0].normal_milestones).toEqual([]);
  });

  test('large number of normal milestones round-trips', () => {
    const milestones = [
      {
        id: 'LT-1',
        name: 'Mega',
        status: 'active',
        goal: 'Many milestones',
        normal_milestones: Array.from({ length: 10 }, (_, i) => ({ version: `v0.${i}.0` })),
      },
    ];
    const content = generateLongTermRoadmap(milestones, 'LargeTest');
    const parsed = parseLongTermRoadmap(content);

    expect(parsed.milestones[0].normal_milestones).toHaveLength(10);
  });
});
