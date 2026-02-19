/**
 * Unit tests for lib/long-term-roadmap.js
 *
 * Tests for flat LT-N milestone format: parsing, validation,
 * generation, display formatting, CRUD, and protection rules.
 */

const {
  parseLongTermRoadmap,
  validateLongTermRoadmap,
  generateLongTermRoadmap,
  formatLongTermRoadmap,
  updateRefinementHistory,
  parseNormalMilestoneList,
  formatNormalMilestoneList,
  parseLtMilestone,
  extractShippedVersions,
  nextLtId,
  addLtMilestone,
  removeLtMilestone,
  updateLtMilestone,
  linkNormalMilestone,
  unlinkNormalMilestone,
  getLtMilestoneById,
  initFromRoadmap,
} = require('../../lib/long-term-roadmap');

// ─── Test Fixtures ───────────────────────────────────────────────────────────

const VALID_ROADMAP_CONTENT = `---
project: GRD
created: 2026-02-17
last_refined: 2026-02-17
---

# Long-Term Roadmap: GRD

## LT-1: Foundation & Stability
**Status:** completed
**Goal:** Build core R&D workflow with security, testing, and distribution
**Normal milestones:** v0.0.5, v0.1.0, v0.1.1, v0.1.2, v0.1.3, v0.1.4

## LT-2: Distribution & Polish
**Status:** active
**Goal:** Plugin marketplace publishing, onboarding UX, documentation completeness
**Normal milestones:** v0.2.0 (planned)

## LT-3: Advanced Workflows
**Status:** planned
**Goal:** Agent Teams enhancements, async I/O, advanced eval, cross-project knowledge reuse
**Normal milestones:** (none yet)

## Refinement History

| Date | Action | Details |
|------|--------|---------|
| 2026-02-17 | Initial roadmap | Created 3 LT milestones |
`;

const MINIMAL_ROADMAP_CONTENT = `---
project: TestProject
created: 2026-01-01
last_refined: 2026-01-01
---

# Long-Term Roadmap: TestProject

## LT-1: MVP
**Status:** active
**Goal:** Build the minimum viable product
**Normal milestones:** v1.0.0 (planned)

## Refinement History

| Date | Action | Details |
|------|--------|---------|
`;

const ROADMAP_MD_CONTENT = `# Roadmap: GRD

## Milestones

- v0.0.5 Production-Ready R&D Workflow Automation - Phases 1-8 (shipped 2026-02-15)
- v0.1.0 Setup Functionality & Usability - Phases 9-13 (shipped 2026-02-16)
- v0.1.1 Completeness, Interoperability & Distribution - Phases 14-18 (shipped 2026-02-16)
- v0.1.2 Developer Experience & Requirement Traceability - Phases 19-20 (shipped 2026-02-16)
- v0.1.3 MCP Completion & Branching Fix - Phases 21-22 (shipped 2026-02-17)
- v0.1.4 Slash Command Registration & Missing Commands (shipped 2026-02-17)
`;

// ─── parseLongTermRoadmap ────────────────────────────────────────────────────

describe('parseLongTermRoadmap', () => {
  test('parses YAML frontmatter correctly', () => {
    const parsed = parseLongTermRoadmap(VALID_ROADMAP_CONTENT);
    expect(parsed).toBeDefined();
    expect(parsed.frontmatter).toBeDefined();
    expect(parsed.frontmatter.project).toBe('GRD');
    expect(parsed.frontmatter.created).toBe('2026-02-17');
    expect(parsed.frontmatter.last_refined).toBe('2026-02-17');
  });

  test('parses all LT milestones into flat array', () => {
    const parsed = parseLongTermRoadmap(VALID_ROADMAP_CONTENT);
    expect(parsed.milestones).toBeInstanceOf(Array);
    expect(parsed.milestones.length).toBe(3);
  });

  test('parses LT-1 with correct fields', () => {
    const parsed = parseLongTermRoadmap(VALID_ROADMAP_CONTENT);
    const lt1 = parsed.milestones[0];
    expect(lt1.id).toBe('LT-1');
    expect(lt1.name).toBe('Foundation & Stability');
    expect(lt1.status).toBe('completed');
    expect(lt1.goal).toContain('core R&D workflow');
    expect(lt1.normal_milestones).toBeInstanceOf(Array);
    expect(lt1.normal_milestones.length).toBe(6);
    expect(lt1.normal_milestones[0].version).toBe('v0.0.5');
  });

  test('parses LT-2 with note on normal milestone', () => {
    const parsed = parseLongTermRoadmap(VALID_ROADMAP_CONTENT);
    const lt2 = parsed.milestones[1];
    expect(lt2.id).toBe('LT-2');
    expect(lt2.name).toBe('Distribution & Polish');
    expect(lt2.status).toBe('active');
    expect(lt2.normal_milestones.length).toBe(1);
    expect(lt2.normal_milestones[0].version).toBe('v0.2.0');
    expect(lt2.normal_milestones[0].note).toBe('planned');
  });

  test('parses LT-3 with no normal milestones', () => {
    const parsed = parseLongTermRoadmap(VALID_ROADMAP_CONTENT);
    const lt3 = parsed.milestones[2];
    expect(lt3.id).toBe('LT-3');
    expect(lt3.status).toBe('planned');
    expect(lt3.normal_milestones).toEqual([]);
  });

  test('returns null for non-roadmap content', () => {
    const result = parseLongTermRoadmap('# Some Random Document\n\nJust text.\n');
    expect(result).toBeNull();
  });

  test('returns null for null/undefined input', () => {
    expect(parseLongTermRoadmap(null)).toBeNull();
    expect(parseLongTermRoadmap(undefined)).toBeNull();
    expect(parseLongTermRoadmap('')).toBeNull();
  });

  test('parses refinement history table', () => {
    const parsed = parseLongTermRoadmap(VALID_ROADMAP_CONTENT);
    expect(parsed.refinement_history).toBeInstanceOf(Array);
    expect(parsed.refinement_history.length).toBe(1);
    expect(parsed.refinement_history[0].date).toBe('2026-02-17');
    expect(parsed.refinement_history[0].action).toContain('Initial');
  });

  test('parses minimal roadmap with single milestone', () => {
    const parsed = parseLongTermRoadmap(MINIMAL_ROADMAP_CONTENT);
    expect(parsed).toBeDefined();
    expect(parsed.milestones.length).toBe(1);
    expect(parsed.milestones[0].id).toBe('LT-1');
    expect(parsed.milestones[0].name).toBe('MVP');
  });
});

// ─── parseNormalMilestoneList ────────────────────────────────────────────────

describe('parseNormalMilestoneList', () => {
  test('parses comma-separated versions', () => {
    const result = parseNormalMilestoneList('v0.0.5, v0.1.0, v0.1.1');
    expect(result).toEqual([{ version: 'v0.0.5' }, { version: 'v0.1.0' }, { version: 'v0.1.1' }]);
  });

  test('parses versions with notes', () => {
    const result = parseNormalMilestoneList('v0.0.5, v0.2.0 (planned)');
    expect(result).toEqual([{ version: 'v0.0.5' }, { version: 'v0.2.0', note: 'planned' }]);
  });

  test('returns empty for "(none yet)"', () => {
    expect(parseNormalMilestoneList('(none yet)')).toEqual([]);
  });

  test('returns empty for null/empty', () => {
    expect(parseNormalMilestoneList(null)).toEqual([]);
    expect(parseNormalMilestoneList('')).toEqual([]);
  });

  test('handles single version', () => {
    const result = parseNormalMilestoneList('v1.0.0');
    expect(result).toEqual([{ version: 'v1.0.0' }]);
  });
});

// ─── formatNormalMilestoneList ───────────────────────────────────────────────

describe('formatNormalMilestoneList', () => {
  test('formats versions with notes', () => {
    const result = formatNormalMilestoneList([
      { version: 'v0.0.5' },
      { version: 'v0.2.0', note: 'planned' },
    ]);
    expect(result).toBe('v0.0.5, v0.2.0 (planned)');
  });

  test('returns "(none yet)" for empty array', () => {
    expect(formatNormalMilestoneList([])).toBe('(none yet)');
    expect(formatNormalMilestoneList(null)).toBe('(none yet)');
  });
});

// ─── parseLtMilestone ────────────────────────────────────────────────────────

describe('parseLtMilestone', () => {
  test('parses section text with all fields', () => {
    const text = `
**Status:** active
**Goal:** Build the platform
**Normal milestones:** v0.1.0, v0.2.0 (planned)
`;
    const result = parseLtMilestone(text, 'LT-1', 'Foundation');
    expect(result.id).toBe('LT-1');
    expect(result.name).toBe('Foundation');
    expect(result.status).toBe('active');
    expect(result.goal).toBe('Build the platform');
    expect(result.normal_milestones.length).toBe(2);
  });

  test('defaults status to planned when missing', () => {
    const text = `
**Goal:** Do something
**Normal milestones:** (none yet)
`;
    const result = parseLtMilestone(text, 'LT-5', 'Future');
    expect(result.status).toBe('planned');
  });
});

// ─── validateLongTermRoadmap ─────────────────────────────────────────────────

describe('validateLongTermRoadmap', () => {
  test('valid roadmap passes validation', () => {
    const parsed = parseLongTermRoadmap(VALID_ROADMAP_CONTENT);
    const result = validateLongTermRoadmap(parsed);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('null parsed fails validation', () => {
    const result = validateLongTermRoadmap(null);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  test('missing project in frontmatter fails', () => {
    const parsed = {
      frontmatter: {},
      milestones: [{ id: 'LT-1', name: 'X', goal: 'Y', status: 'active', normal_milestones: [] }],
    };
    const result = validateLongTermRoadmap(parsed);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /project/i.test(e))).toBe(true);
  });

  test('no milestones fails validation', () => {
    const parsed = { frontmatter: { project: 'Test' }, milestones: [] };
    const result = validateLongTermRoadmap(parsed);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /no lt/i.test(e))).toBe(true);
  });

  test('missing goal fails validation', () => {
    const parsed = {
      frontmatter: { project: 'Test' },
      milestones: [{ id: 'LT-1', name: 'X', goal: '', status: 'active', normal_milestones: [] }],
    };
    const result = validateLongTermRoadmap(parsed);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /goal/i.test(e))).toBe(true);
  });

  test('invalid status fails validation', () => {
    const parsed = {
      frontmatter: { project: 'Test' },
      milestones: [{ id: 'LT-1', name: 'X', goal: 'Y', status: 'unknown', normal_milestones: [] }],
    };
    const result = validateLongTermRoadmap(parsed);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /status/i.test(e))).toBe(true);
  });

  test('duplicate IDs fail validation', () => {
    const parsed = {
      frontmatter: { project: 'Test' },
      milestones: [
        { id: 'LT-1', name: 'A', goal: 'G1', status: 'active', normal_milestones: [] },
        { id: 'LT-1', name: 'B', goal: 'G2', status: 'planned', normal_milestones: [] },
      ],
    };
    const result = validateLongTermRoadmap(parsed);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /duplicate/i.test(e))).toBe(true);
  });

  test('warns when no active milestone', () => {
    const parsed = {
      frontmatter: { project: 'Test' },
      milestones: [{ id: 'LT-1', name: 'A', goal: 'G1', status: 'planned', normal_milestones: [] }],
    };
    const result = validateLongTermRoadmap(parsed);
    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => /active/i.test(w))).toBe(true);
  });

  test('warns when multiple active milestones', () => {
    const parsed = {
      frontmatter: { project: 'Test' },
      milestones: [
        { id: 'LT-1', name: 'A', goal: 'G1', status: 'active', normal_milestones: [] },
        { id: 'LT-2', name: 'B', goal: 'G2', status: 'active', normal_milestones: [] },
      ],
    };
    const result = validateLongTermRoadmap(parsed);
    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => /multiple/i.test(w))).toBe(true);
  });
});

// ─── generateLongTermRoadmap ─────────────────────────────────────────────────

describe('generateLongTermRoadmap', () => {
  const testMilestones = [
    {
      id: 'LT-1',
      name: 'Foundation',
      status: 'completed',
      goal: 'Build core platform',
      normal_milestones: [{ version: 'v0.0.5' }, { version: 'v0.1.0' }],
    },
    {
      id: 'LT-2',
      name: 'Growth',
      status: 'active',
      goal: 'Expand features',
      normal_milestones: [{ version: 'v0.2.0', note: 'planned' }],
    },
    {
      id: 'LT-3',
      name: 'Scale',
      status: 'planned',
      goal: 'Production scale',
      normal_milestones: [],
    },
  ];

  test('generates valid YAML frontmatter', () => {
    const output = generateLongTermRoadmap(testMilestones, 'TestProject');
    expect(output).toMatch(/^---\n/);
    expect(output).toContain('project: TestProject');
    expect(output).toMatch(/created:/);
    expect(output).toMatch(/last_refined:/);
  });

  test('generates LT-N sections', () => {
    const output = generateLongTermRoadmap(testMilestones, 'TestProject');
    expect(output).toContain('## LT-1: Foundation');
    expect(output).toContain('## LT-2: Growth');
    expect(output).toContain('## LT-3: Scale');
  });

  test('includes status, goal, and normal milestones fields', () => {
    const output = generateLongTermRoadmap(testMilestones, 'TestProject');
    expect(output).toContain('**Status:** completed');
    expect(output).toContain('**Status:** active');
    expect(output).toContain('**Goal:** Build core platform');
    expect(output).toContain('**Normal milestones:** v0.0.5, v0.1.0');
    expect(output).toContain('**Normal milestones:** v0.2.0 (planned)');
    expect(output).toContain('**Normal milestones:** (none yet)');
  });

  test('generates Refinement History table', () => {
    const output = generateLongTermRoadmap(testMilestones, 'TestProject');
    expect(output).toContain('## Refinement History');
    expect(output).toContain('Initial roadmap');
    expect(output).toMatch(/\| Date \| Action \| Details \|/);
  });

  test('round-trip: generate then parse produces same data', () => {
    const output = generateLongTermRoadmap(testMilestones, 'TestProject');
    const parsed = parseLongTermRoadmap(output);

    expect(parsed).toBeDefined();
    expect(parsed.frontmatter.project).toBe('TestProject');
    expect(parsed.milestones.length).toBe(3);
    expect(parsed.milestones[0].id).toBe('LT-1');
    expect(parsed.milestones[0].status).toBe('completed');
    expect(parsed.milestones[0].normal_milestones.length).toBe(2);
    expect(parsed.milestones[1].id).toBe('LT-2');
    expect(parsed.milestones[2].normal_milestones).toEqual([]);
  });
});

// ─── formatLongTermRoadmap ───────────────────────────────────────────────────

describe('formatLongTermRoadmap', () => {
  test('formats with [done]/[active]/[planned] icons', () => {
    const parsed = parseLongTermRoadmap(VALID_ROADMAP_CONTENT);
    const formatted = formatLongTermRoadmap(parsed);
    expect(formatted).toContain('[done]');
    expect(formatted).toContain('[active]');
    expect(formatted).toContain('[planned]');
  });

  test('includes project name', () => {
    const parsed = parseLongTermRoadmap(VALID_ROADMAP_CONTENT);
    const formatted = formatLongTermRoadmap(parsed);
    expect(formatted).toContain('GRD');
  });

  test('includes milestone IDs, names, and goals', () => {
    const parsed = parseLongTermRoadmap(VALID_ROADMAP_CONTENT);
    const formatted = formatLongTermRoadmap(parsed);
    expect(formatted).toContain('LT-1');
    expect(formatted).toContain('Foundation & Stability');
    expect(formatted).toContain('LT-2');
    expect(formatted).toContain('LT-3');
  });

  test('includes normal milestone lists', () => {
    const parsed = parseLongTermRoadmap(VALID_ROADMAP_CONTENT);
    const formatted = formatLongTermRoadmap(parsed);
    expect(formatted).toContain('v0.0.5');
    expect(formatted).toContain('v0.2.0 (planned)');
    expect(formatted).toContain('(none yet)');
  });

  test('handles empty parsed result', () => {
    expect(formatLongTermRoadmap(null)).toBe('');
  });
});

// ─── extractShippedVersions ──────────────────────────────────────────────────

describe('extractShippedVersions', () => {
  test('extracts shipped versions from ROADMAP.md bullet list', () => {
    const versions = extractShippedVersions(ROADMAP_MD_CONTENT);
    expect(versions).toContain('v0.0.5');
    expect(versions).toContain('v0.1.0');
    expect(versions).toContain('v0.1.1');
    expect(versions).toContain('v0.1.2');
    expect(versions).toContain('v0.1.3');
    expect(versions).toContain('v0.1.4');
    expect(versions.length).toBe(6);
  });

  test('returns empty for null input', () => {
    expect(extractShippedVersions(null)).toEqual([]);
  });

  test('returns empty when no shipped milestones', () => {
    const content = '# Roadmap\n\n## Milestones\n\n- v1.0.0 First Release\n';
    expect(extractShippedVersions(content)).toEqual([]);
  });
});

// ─── nextLtId ────────────────────────────────────────────────────────────────

describe('nextLtId', () => {
  test('returns LT-1 for empty/null', () => {
    expect(nextLtId(null)).toBe('LT-1');
    expect(nextLtId({ milestones: [] })).toBe('LT-1');
  });

  test('computes next ID from existing milestones', () => {
    const parsed = parseLongTermRoadmap(VALID_ROADMAP_CONTENT);
    expect(nextLtId(parsed)).toBe('LT-4');
  });
});

// ─── addLtMilestone ──────────────────────────────────────────────────────────

describe('addLtMilestone', () => {
  test('adds new milestone before Refinement History', () => {
    const result = addLtMilestone(VALID_ROADMAP_CONTENT, 'New Feature', 'Build new feature');
    expect(result.id).toBe('LT-4');
    const parsed = parseLongTermRoadmap(result.content);
    expect(parsed.milestones.length).toBe(4);
    expect(parsed.milestones[3].id).toBe('LT-4');
    expect(parsed.milestones[3].name).toBe('New Feature');
    expect(parsed.milestones[3].goal).toBe('Build new feature');
    expect(parsed.milestones[3].status).toBe('planned');
  });

  test('preserves existing milestones', () => {
    const result = addLtMilestone(VALID_ROADMAP_CONTENT, 'New', 'Goal');
    const parsed = parseLongTermRoadmap(result.content);
    expect(parsed.milestones[0].id).toBe('LT-1');
    expect(parsed.milestones[1].id).toBe('LT-2');
    expect(parsed.milestones[2].id).toBe('LT-3');
  });

  test('preserves refinement history', () => {
    const result = addLtMilestone(VALID_ROADMAP_CONTENT, 'New', 'Goal');
    const parsed = parseLongTermRoadmap(result.content);
    expect(parsed.refinement_history.length).toBe(1);
  });
});

// ─── removeLtMilestone ───────────────────────────────────────────────────────

describe('removeLtMilestone', () => {
  test('removes a planned milestone', () => {
    const result = removeLtMilestone(VALID_ROADMAP_CONTENT, 'LT-3');
    expect(typeof result).toBe('string');
    const parsed = parseLongTermRoadmap(result);
    expect(parsed.milestones.length).toBe(2);
    expect(parsed.milestones.every((m) => m.id !== 'LT-3')).toBe(true);
  });

  test('returns error for non-existent ID', () => {
    const result = removeLtMilestone(VALID_ROADMAP_CONTENT, 'LT-99');
    expect(result).toEqual(expect.objectContaining({ error: expect.any(String) }));
  });

  test('refuses to remove completed milestone', () => {
    const result = removeLtMilestone(VALID_ROADMAP_CONTENT, 'LT-1');
    expect(result).toEqual(
      expect.objectContaining({ error: expect.stringContaining('completed') })
    );
  });

  test('refuses if linked milestones are shipped', () => {
    // LT-1 has shipped milestones, but it's already blocked by completed status
    // Create a scenario: active LT with shipped links
    const content = VALID_ROADMAP_CONTENT.replace(
      '## LT-2: Distribution & Polish\n**Status:** active',
      '## LT-2: Distribution & Polish\n**Status:** active'
    );
    // LT-2 has v0.2.0 (planned), not shipped. Let's create content with shipped link
    const withShipped = content.replace(
      '**Normal milestones:** v0.2.0 (planned)',
      '**Normal milestones:** v0.1.0, v0.2.0 (planned)'
    );
    const result = removeLtMilestone(withShipped, 'LT-2', ROADMAP_MD_CONTENT);
    expect(result).toEqual(expect.objectContaining({ error: expect.stringContaining('shipped') }));
  });

  test('preserves other milestones when removing', () => {
    const result = removeLtMilestone(VALID_ROADMAP_CONTENT, 'LT-3');
    const parsed = parseLongTermRoadmap(result);
    expect(parsed.milestones[0].id).toBe('LT-1');
    expect(parsed.milestones[1].id).toBe('LT-2');
  });
});

// ─── updateLtMilestone ───────────────────────────────────────────────────────

describe('updateLtMilestone', () => {
  test('updates milestone name', () => {
    const result = updateLtMilestone(VALID_ROADMAP_CONTENT, 'LT-2', { name: 'Polish & Ship' });
    const parsed = parseLongTermRoadmap(result);
    expect(parsed.milestones[1].name).toBe('Polish & Ship');
  });

  test('updates milestone goal', () => {
    const result = updateLtMilestone(VALID_ROADMAP_CONTENT, 'LT-3', { goal: 'Updated goal text' });
    const parsed = parseLongTermRoadmap(result);
    expect(parsed.milestones[2].goal).toBe('Updated goal text');
  });

  test('updates milestone status', () => {
    const result = updateLtMilestone(VALID_ROADMAP_CONTENT, 'LT-3', { status: 'active' });
    const parsed = parseLongTermRoadmap(result);
    expect(parsed.milestones[2].status).toBe('active');
  });

  test('returns error for invalid status', () => {
    const result = updateLtMilestone(VALID_ROADMAP_CONTENT, 'LT-3', { status: 'badstatus' });
    expect(result).toEqual(
      expect.objectContaining({ error: expect.stringContaining('Invalid status') })
    );
  });

  test('returns error for non-existent ID', () => {
    const result = updateLtMilestone(VALID_ROADMAP_CONTENT, 'LT-99', { name: 'X' });
    expect(result).toEqual(expect.objectContaining({ error: expect.any(String) }));
  });

  test('updates multiple fields at once', () => {
    const result = updateLtMilestone(VALID_ROADMAP_CONTENT, 'LT-3', {
      name: 'New Name',
      goal: 'New Goal',
      status: 'active',
    });
    const parsed = parseLongTermRoadmap(result);
    expect(parsed.milestones[2].name).toBe('New Name');
    expect(parsed.milestones[2].goal).toBe('New Goal');
    expect(parsed.milestones[2].status).toBe('active');
  });

  test('preserves other milestones', () => {
    const result = updateLtMilestone(VALID_ROADMAP_CONTENT, 'LT-2', { goal: 'Changed' });
    const parsed = parseLongTermRoadmap(result);
    expect(parsed.milestones[0].goal).toContain('core R&D workflow');
    expect(parsed.milestones[2].goal).toContain('Agent Teams');
  });
});

// ─── linkNormalMilestone ─────────────────────────────────────────────────────

describe('linkNormalMilestone', () => {
  test('links a new version to LT milestone', () => {
    const result = linkNormalMilestone(VALID_ROADMAP_CONTENT, 'LT-3', 'v0.3.0');
    const parsed = parseLongTermRoadmap(result);
    const lt3 = parsed.milestones[2];
    expect(lt3.normal_milestones.length).toBe(1);
    expect(lt3.normal_milestones[0].version).toBe('v0.3.0');
  });

  test('links with optional note', () => {
    const result = linkNormalMilestone(VALID_ROADMAP_CONTENT, 'LT-3', 'v0.3.0', 'planned');
    const parsed = parseLongTermRoadmap(result);
    const lt3 = parsed.milestones[2];
    expect(lt3.normal_milestones[0].note).toBe('planned');
  });

  test('returns error if already linked', () => {
    const result = linkNormalMilestone(VALID_ROADMAP_CONTENT, 'LT-1', 'v0.0.5');
    expect(result).toEqual(
      expect.objectContaining({ error: expect.stringContaining('already linked') })
    );
  });

  test('returns error for non-existent ID', () => {
    const result = linkNormalMilestone(VALID_ROADMAP_CONTENT, 'LT-99', 'v1.0.0');
    expect(result).toEqual(expect.objectContaining({ error: expect.any(String) }));
  });
});

// ─── unlinkNormalMilestone ───────────────────────────────────────────────────

describe('unlinkNormalMilestone', () => {
  test('unlinks a non-shipped version', () => {
    const result = unlinkNormalMilestone(VALID_ROADMAP_CONTENT, 'LT-2', 'v0.2.0');
    const parsed = parseLongTermRoadmap(result);
    expect(parsed.milestones[1].normal_milestones).toEqual([]);
  });

  test('refuses to unlink shipped version', () => {
    const result = unlinkNormalMilestone(
      VALID_ROADMAP_CONTENT,
      'LT-1',
      'v0.0.5',
      ROADMAP_MD_CONTENT
    );
    expect(result).toEqual(expect.objectContaining({ error: expect.stringContaining('shipped') }));
  });

  test('returns error if version not linked', () => {
    const result = unlinkNormalMilestone(VALID_ROADMAP_CONTENT, 'LT-3', 'v9.9.9');
    expect(result).toEqual(
      expect.objectContaining({ error: expect.stringContaining('not linked') })
    );
  });
});

// ─── getLtMilestoneById ──────────────────────────────────────────────────────

describe('getLtMilestoneById', () => {
  test('finds milestone by ID', () => {
    const ms = getLtMilestoneById(VALID_ROADMAP_CONTENT, 'LT-2');
    expect(ms).toBeDefined();
    expect(ms.name).toBe('Distribution & Polish');
  });

  test('returns null for non-existent ID', () => {
    expect(getLtMilestoneById(VALID_ROADMAP_CONTENT, 'LT-99')).toBeNull();
  });
});

// ─── initFromRoadmap ─────────────────────────────────────────────────────────

describe('initFromRoadmap', () => {
  test('groups all milestones into LT-1', () => {
    const result = initFromRoadmap(ROADMAP_MD_CONTENT, 'GRD');
    const parsed = parseLongTermRoadmap(result);
    expect(parsed.milestones.length).toBe(1);
    expect(parsed.milestones[0].id).toBe('LT-1');
    expect(parsed.milestones[0].name).toBe('Initial Milestone Group');
    expect(parsed.milestones[0].normal_milestones.length).toBe(6);
  });

  test('marks shipped versions without note, unshipped with "planned"', () => {
    const content = `# Roadmap

## Milestones

- v0.1.0 First (shipped 2026-01-01)
- v0.2.0 Second
`;
    const result = initFromRoadmap(content, 'Test');
    const parsed = parseLongTermRoadmap(result);
    const milestones = parsed.milestones[0].normal_milestones;
    expect(milestones[0]).toEqual({ version: 'v0.1.0' });
    expect(milestones[1]).toEqual({ version: 'v0.2.0', note: 'planned' });
  });

  test('sets status to active when shipped milestones exist', () => {
    const result = initFromRoadmap(ROADMAP_MD_CONTENT, 'GRD');
    const parsed = parseLongTermRoadmap(result);
    expect(parsed.milestones[0].status).toBe('active');
  });

  test('sets status to planned when no shipped milestones', () => {
    const content = '# Roadmap\n\n## Milestones\n\n- v1.0.0 First\n';
    const result = initFromRoadmap(content, 'Test');
    const parsed = parseLongTermRoadmap(result);
    expect(parsed.milestones[0].status).toBe('planned');
  });
});

// ─── updateRefinementHistory ─────────────────────────────────────────────────

describe('updateRefinementHistory', () => {
  test('appends a new row to refinement history', () => {
    const result = updateRefinementHistory(VALID_ROADMAP_CONTENT, 'Added', 'Added LT-4');
    const parsed = parseLongTermRoadmap(result);
    expect(parsed.refinement_history.length).toBe(2);
  });

  test("new entry has today's date", () => {
    const result = updateRefinementHistory(VALID_ROADMAP_CONTENT, 'Added', 'LT-4');
    const parsed = parseLongTermRoadmap(result);
    const today = new Date().toISOString().split('T')[0];
    expect(parsed.refinement_history[1].date).toBe(today);
  });

  test('preserves existing entries', () => {
    const result = updateRefinementHistory(VALID_ROADMAP_CONTENT, 'Added', 'LT-4');
    const parsed = parseLongTermRoadmap(result);
    expect(parsed.refinement_history[0].action).toContain('Initial');
  });
});
