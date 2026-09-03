'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  extractFrontmatter,
}: {
  extractFrontmatter: (content: string) => Record<string, unknown>;
} = require('../../lib/frontmatter');

// ─── Agent frontmatter schema (W10 item 3) ──────────────────────────────────
//
// This replaces a pinned `expect(agentFiles.length).toBe(28)`, which made
// every agent addition a test edit while asserting nothing about the agent
// added. The schema checks shape rather than population: required keys
// present and non-empty, optional keys well-typed, and — the part a count
// could never give — a CLOSED key set, because the frontmatter parser keeps
// unknown keys and the agent loader ignores them, so a typo'd `efort:` or
// `maxturns:` silently disables the setting it was meant to apply.
//
// TODO(W10-follow-up / W4): once W4 ("One evidence standard, shared by both
// claim-making agents") lands, extend `auditAgentFile` to require that every
// agent emitting severity-graded findings carries the shared evidence
// standard. Today that is exactly two files: `agents/grd-verifier.md`, which
// holds the only copy as an inline `<evidence_standard>` block, and
// `agents/grd-code-reviewer.md`, which emits BLOCKER/WARNING/INFO findings
// and carries none of it. (`agents/grd-feasibility-analyst.md` uses the word
// BLOCKER as a rating, not as a graded findings table — do not include it.)
// The assertion is deliberately NOT written yet because the mechanism is
// undecided: W4 step 1 is gated on proving an `@${CLAUDE_PLUGIN_ROOT}`
// include resolves inside a subagent spawn, and if it does not, W4 ships two
// inline copies instead of one include. Asserting an include that W4 may
// never ship would be the dead pointer this slice exists to remove. The pin
// that exists today is `verifier still carries the inline evidence standard`
// below, which stops W4 deleting the inline copy without updating this file.
const REQUIRED_AGENT_FIELDS: readonly string[] = ['name', 'description', 'tools', 'color', 'effort'];
const OPTIONAL_AGENT_FIELDS: readonly string[] = ['maxTurns', 'disallowedTools'];
const EFFORT_LEVELS: readonly string[] = ['low', 'medium', 'high'];

/** Collect schema violations for one agent file. Empty array = conforms. */
function auditAgentFile(file: string, fm: Record<string, unknown>): string[] {
  const v: string[] = [];
  const keys = Object.keys(fm);
  if (keys.length === 0) return [`${file}: no parseable YAML frontmatter`];

  for (const key of REQUIRED_AGENT_FIELDS) {
    const val = fm[key];
    if (val === undefined) {
      v.push(`${file}: missing required field '${key}'`);
    } else if (typeof val !== 'string' || val.trim() === '') {
      v.push(`${file}: '${key}' must be a non-empty string, got ${JSON.stringify(val)}`);
    }
  }

  const allowed = new Set<string>([...REQUIRED_AGENT_FIELDS, ...OPTIONAL_AGENT_FIELDS]);
  for (const key of keys) {
    if (!allowed.has(key)) v.push(`${file}: unknown frontmatter field '${key}'`);
  }

  if (typeof fm.name === 'string' && !/^grd-[a-z0-9-]+$/.test(fm.name)) {
    v.push(`${file}: 'name' must match /^grd-[a-z0-9-]+$/, got ${JSON.stringify(fm.name)}`);
  }
  if (typeof fm.effort === 'string' && !EFFORT_LEVELS.includes(fm.effort)) {
    v.push(`${file}: 'effort' must be one of ${EFFORT_LEVELS.join('|')}, got ${JSON.stringify(fm.effort)}`);
  }
  // The frontmatter parser yields scalars as strings, so maxTurns arrives as
  // e.g. "15". Assert the string is a positive integer rather than its type.
  if (fm.maxTurns !== undefined && !/^[1-9][0-9]*$/.test(String(fm.maxTurns))) {
    v.push(`${file}: 'maxTurns' must be a positive integer, got ${JSON.stringify(fm.maxTurns)}`);
  }
  const dis = fm.disallowedTools;
  if (dis !== undefined) {
    const listOk =
      (typeof dis === 'string' && dis.trim() !== '') ||
      (Array.isArray(dis) && dis.length > 0 && dis.every((t) => typeof t === 'string' && t.trim() !== ''));
    if (!listOk) {
      v.push(`${file}: 'disallowedTools' must be a non-empty tool name or list, got ${JSON.stringify(dis)}`);
    }
  }
  return v;
}

/** List agent definition files in a directory, in stable order. */
function listAgentFiles(dir: string): string[] {
  return fs
    .readdirSync(dir)
    .filter((f: string) => f.startsWith('grd-') && f.endsWith('.md'))
    .sort();
}

/** Audit every agent file in a directory. Empty array = every file conforms. */
function auditAgentDir(dir: string): string[] {
  const out: string[] = [];
  for (const file of listAgentFiles(dir)) {
    out.push(...auditAgentFile(file, extractFrontmatter(fs.readFileSync(path.join(dir, file), 'utf-8'))));
  }
  return out;
}

describe('Agent frontmatter audit', () => {
  const agentDir = path.join(__dirname, '../../agents');
  const agentFiles = listAgentFiles(agentDir);

  test('agents/ is populated and every agent conforms to the frontmatter schema', () => {
    // Lower bound only: this must not need editing when an agent is added.
    expect(agentFiles.length).toBeGreaterThan(0);
    expect(auditAgentDir(agentDir)).toEqual([]);
  });

  test('all agents have unique grd- prefixed names', () => {
    const names = new Set();
    for (const file of agentFiles) {
      const content = fs.readFileSync(path.join(agentDir, file), 'utf-8');
      const nameMatch = content.match(/^name:\s*(.+)$/m);
      expect(nameMatch).toBeTruthy();
      const name = nameMatch[1].trim();
      expect(name).toMatch(/^grd-/);
      expect(names.has(name)).toBe(false);
      names.add(name);
    }
  });

  test('all agent names match their filenames', () => {
    for (const file of agentFiles) {
      const content = fs.readFileSync(path.join(agentDir, file), 'utf-8');
      const nameMatch = content.match(/^name:\s*(.+)$/m);
      expect(nameMatch).toBeTruthy();
      const name = nameMatch[1].trim();
      const expectedName = file.replace(/\.md$/, '');
      expect(name).toBe(expectedName);
    }
  });

  test('all agents have descriptions under 200 characters', () => {
    for (const file of agentFiles) {
      const content = fs.readFileSync(path.join(agentDir, file), 'utf-8');
      const descMatch = content.match(/^description:\s*(.+)$/m);
      expect(descMatch).toBeTruthy();
      const desc = descMatch[1].trim();
      expect(desc.length).toBeLessThanOrEqual(200);
    }
  });

  test('no descriptions contain template variables', () => {
    for (const file of agentFiles) {
      const content = fs.readFileSync(path.join(agentDir, file), 'utf-8');
      const descMatch = content.match(/^description:\s*(.+)$/m);
      if (descMatch) {
        expect(descMatch[1]).not.toMatch(/\$\{/);
      }
    }
  });

  // `color` presence was its own test; it is now one of REQUIRED_AGENT_FIELDS,
  // so re-asserting it here would be the duplication this slice removes.

  // The pin W4 has to update rather than step over: grd-verifier.md holds the
  // repo's only evidence standard, inline. W4 moves it; if W4 deletes it
  // without landing a replacement both claim-making agents can actually read,
  // this fails.
  test('grd-verifier still carries the inline evidence standard (W4 moves this)', () => {
    const verifier = fs.readFileSync(path.join(agentDir, 'grd-verifier.md'), 'utf-8');
    expect(verifier).toContain('<evidence_standard>');
    expect(verifier).toContain('</evidence_standard>');
  });
});

// ─── Schema check behaviour, proven against a fixture directory ─────────────
//
// The point of W10 item 3 is that adding an agent must not require editing
// this file, while a malformed agent must still fail. Both halves are proven
// here on a real directory: every shipped agent is copied to a temp dir and a
// 29th is added to it. Nothing is ever written into agents/.

describe('agent frontmatter schema — fixture proof', () => {
  const realAgentDir = path.join(__dirname, '../../agents');
  let fixtureDir = '';

  const WELL_FORMED_29TH = [
    '---',
    'name: grd-fixture-newcomer',
    'description: A legitimately added 29th agent used to prove the schema check does not pin a count.',
    'tools: Read, Write, Grep',
    'color: cyan',
    'effort: medium',
    'maxTurns: 12',
    'disallowedTools:',
    '  - Edit',
    '---',
    '',
    'Body.',
    '',
  ].join('\n');

  /** Write a 29th agent into the fixture dir and audit the whole directory. */
  function auditWith(content: string): string[] {
    const file = path.join(fixtureDir, 'grd-fixture-newcomer.md');
    fs.writeFileSync(file, content);
    try {
      return auditAgentDir(fixtureDir);
    } finally {
      fs.rmSync(file, { force: true });
    }
  }

  beforeAll(() => {
    fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-agent-audit-'));
    fs.cpSync(realAgentDir, fixtureDir, { recursive: true });
  });

  afterAll(() => {
    if (fixtureDir && fixtureDir.startsWith(os.tmpdir())) {
      fs.rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  test('the fixture is a faithful copy of agents/ and passes as-is', () => {
    expect(listAgentFiles(fixtureDir)).toEqual(listAgentFiles(realAgentDir));
    expect(auditAgentDir(fixtureDir)).toEqual([]);
  });

  test('a legitimately added agent does not break the audit', () => {
    const before = listAgentFiles(fixtureDir).length;
    const file = path.join(fixtureDir, 'grd-fixture-newcomer.md');
    fs.writeFileSync(file, WELL_FORMED_29TH);
    try {
      expect(listAgentFiles(fixtureDir).length).toBe(before + 1);
      expect(auditAgentDir(fixtureDir)).toEqual([]);
    } finally {
      fs.rmSync(file, { force: true });
    }
  });

  test('a missing required field is caught', () => {
    const noTools = WELL_FORMED_29TH.replace('tools: Read, Write, Grep\n', '');
    expect(auditWith(noTools)).toEqual([
      "grd-fixture-newcomer.md: missing required field 'tools'",
    ]);
  });

  test('a typo’d field name is caught (the case a count test cannot see)', () => {
    const typo = WELL_FORMED_29TH.replace('effort: medium', 'efort: medium');
    expect(auditWith(typo)).toEqual([
      "grd-fixture-newcomer.md: missing required field 'effort'",
      "grd-fixture-newcomer.md: unknown frontmatter field 'efort'",
    ]);
  });

  test('an out-of-range effort level is caught', () => {
    const bad = WELL_FORMED_29TH.replace('effort: medium', 'effort: extreme');
    expect(auditWith(bad)).toEqual([
      "grd-fixture-newcomer.md: 'effort' must be one of low|medium|high, got \"extreme\"",
    ]);
  });

  test('a non-integer maxTurns is caught', () => {
    const bad = WELL_FORMED_29TH.replace('maxTurns: 12', 'maxTurns: many');
    expect(auditWith(bad)).toEqual([
      "grd-fixture-newcomer.md: 'maxTurns' must be a positive integer, got \"many\"",
    ]);
  });

  test('a non-grd- name and absent frontmatter are caught', () => {
    const badName = WELL_FORMED_29TH.replace('name: grd-fixture-newcomer', 'name: Fixture_Newcomer');
    expect(auditWith(badName)).toEqual([
      'grd-fixture-newcomer.md: \'name\' must match /^grd-[a-z0-9-]+$/, got "Fixture_Newcomer"',
    ]);
    expect(auditWith('No frontmatter at all.\n')).toEqual([
      'grd-fixture-newcomer.md: no parseable YAML frontmatter',
    ]);
  });
});

// ─── plugin.json hook registration ──────────────────────────────────────────

describe('plugin.json hook registration', () => {
  const pluginJsonPath = path.join(__dirname, '..', '..', '.claude-plugin', 'plugin.json');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let pluginJson: Record<string, any>;

  beforeAll(() => {
    pluginJson = JSON.parse(fs.readFileSync(pluginJsonPath, 'utf-8'));
  });

  test('hooks object exists in plugin.json', () => {
    expect(pluginJson.hooks).toBeDefined();
    expect(typeof pluginJson.hooks).toBe('object');
  });

  test('WorktreeCreate hook is registered', () => {
    expect(pluginJson.hooks.WorktreeCreate).toBeDefined();
    expect(Array.isArray(pluginJson.hooks.WorktreeCreate)).toBe(true);
    expect(pluginJson.hooks.WorktreeCreate.length).toBeGreaterThanOrEqual(1);

    const entry = pluginJson.hooks.WorktreeCreate[0];
    expect(entry.hooks).toBeDefined();
    expect(Array.isArray(entry.hooks)).toBe(true);
    expect(entry.hooks.length).toBeGreaterThanOrEqual(1);

    const hook = entry.hooks[0];
    expect(hook.type).toBe('command');
    expect(hook.command).toContain('worktree-hook-create');
    expect(hook.command).toContain('$WORKTREE_PATH');
    expect(hook.command).toContain('$WORKTREE_BRANCH');
    expect(typeof hook.timeout).toBe('number');
    expect(hook.timeout).toBeGreaterThan(0);
  });

  test('WorktreeRemove hook is registered', () => {
    expect(pluginJson.hooks.WorktreeRemove).toBeDefined();
    expect(Array.isArray(pluginJson.hooks.WorktreeRemove)).toBe(true);
    expect(pluginJson.hooks.WorktreeRemove.length).toBeGreaterThanOrEqual(1);

    const entry = pluginJson.hooks.WorktreeRemove[0];
    expect(entry.hooks).toBeDefined();
    expect(Array.isArray(entry.hooks)).toBe(true);
    expect(entry.hooks.length).toBeGreaterThanOrEqual(1);

    const hook = entry.hooks[0];
    expect(hook.type).toBe('command');
    expect(hook.command).toContain('worktree-hook-remove');
    expect(hook.command).toContain('$WORKTREE_PATH');
    expect(hook.command).toContain('$WORKTREE_BRANCH');
    expect(typeof hook.timeout).toBe('number');
    expect(hook.timeout).toBeGreaterThan(0);
  });

  test('SessionStart hook is registered', () => {
    expect(pluginJson.hooks.SessionStart).toBeDefined();
    expect(Array.isArray(pluginJson.hooks.SessionStart)).toBe(true);
    expect(pluginJson.hooks.SessionStart.length).toBeGreaterThanOrEqual(1);

    const entry = pluginJson.hooks.SessionStart[0];
    expect(entry.hooks).toBeDefined();
    expect(Array.isArray(entry.hooks)).toBe(true);

    const commands = entry.hooks.map((h: Record<string, unknown>) => h.command);
    const hasVerifyPath = commands.some((cmd: string) => cmd.includes('verify-path-exists'));
    expect(hasVerifyPath).toBe(true);
  });

  test('StopFailure hook is registered', () => {
    expect(pluginJson.hooks.StopFailure).toBeDefined();
    expect(Array.isArray(pluginJson.hooks.StopFailure)).toBe(true);
    expect(pluginJson.hooks.StopFailure.length).toBeGreaterThanOrEqual(1);

    const entry = pluginJson.hooks.StopFailure[0];
    expect(entry.hooks).toBeDefined();
    expect(Array.isArray(entry.hooks)).toBe(true);
    expect(entry.hooks.length).toBeGreaterThanOrEqual(1);

    const hook = entry.hooks[0];
    expect(hook.type).toBe('command');
    expect(hook.command).toContain('stop-failure');
    expect(hook.command).toMatch(/2>\/dev\/null \|\| true$/);
    expect(typeof hook.timeout).toBe('number');
    expect(hook.timeout).toBeGreaterThanOrEqual(1);
    expect(hook.timeout).toBeLessThanOrEqual(60);
  });

  test('PostCompact hook is registered', () => {
    expect(pluginJson.hooks.PostCompact).toBeDefined();
    expect(Array.isArray(pluginJson.hooks.PostCompact)).toBe(true);
    expect(pluginJson.hooks.PostCompact.length).toBeGreaterThanOrEqual(1);

    const entry = pluginJson.hooks.PostCompact[0];
    expect(entry.hooks).toBeDefined();
    expect(Array.isArray(entry.hooks)).toBe(true);
    expect(entry.hooks.length).toBeGreaterThanOrEqual(1);

    const hook = entry.hooks[0];
    expect(hook.type).toBe('command');
    expect(hook.command).toContain('post-compact');
    expect(hook.command).toMatch(/2>\/dev\/null \|\| true$/);
    expect(typeof hook.timeout).toBe('number');
    expect(hook.timeout).toBeGreaterThanOrEqual(1);
    expect(hook.timeout).toBeLessThanOrEqual(60);
  });

  test('all hooks have error suppression (2>/dev/null || true)', () => {
    const hookNames = [
      'WorktreeCreate',
      'WorktreeRemove',
      'SessionStart',
      'StopFailure',
      'PostCompact',
    ];
    for (const hookName of hookNames) {
      const entries = pluginJson.hooks[hookName];
      expect(entries).toBeDefined();
      for (const entry of entries) {
        for (const hook of entry.hooks) {
          expect(hook.command).toMatch(/2>\/dev\/null \|\| true$/);
        }
      }
    }
  });

  test('hook timeout values are reasonable (between 1 and 60 seconds)', () => {
    const hookNames = [
      'WorktreeCreate',
      'WorktreeRemove',
      'SessionStart',
      'StopFailure',
      'PostCompact',
    ];
    for (const hookName of hookNames) {
      const entries = pluginJson.hooks[hookName];
      for (const entry of entries) {
        for (const hook of entry.hooks) {
          expect(hook.timeout).toBeGreaterThanOrEqual(1);
          expect(hook.timeout).toBeLessThanOrEqual(60);
        }
      }
    }
  });
});

// ─── Agent frontmatter — effort, maxTurns, disallowedTools ──────────────────

describe('Agent frontmatter — effort, maxTurns, disallowedTools', () => {
  const agentDir = path.join(__dirname, '../../agents');
  const agentFiles = listAgentFiles(agentDir);

  // `effort` presence and its low|medium|high value set are now part of the
  // schema check above; the two population-level counts below are not, because
  // they are about how many agents opt in, not about any one agent's shape.

  test('at least 6 bounded agents have maxTurns field in frontmatter', () => {
    let countWithMaxTurns = 0;
    for (const file of agentFiles) {
      const content = fs.readFileSync(path.join(agentDir, file), 'utf-8');
      const fm = extractFrontmatter(content);
      if (fm.maxTurns !== undefined) {
        countWithMaxTurns++;
      }
    }
    expect(countWithMaxTurns).toBeGreaterThanOrEqual(6);
  });

  test('at least 4 restricted agents have disallowedTools field in frontmatter', () => {
    let countWithDisallowed = 0;
    for (const file of agentFiles) {
      const content = fs.readFileSync(path.join(agentDir, file), 'utf-8');
      // disallowedTools can be a list field spanning multiple lines, check for the key
      if (content.match(/^disallowedTools:/m)) {
        countWithDisallowed++;
      }
    }
    expect(countWithDisallowed).toBeGreaterThanOrEqual(4);
  });
});
