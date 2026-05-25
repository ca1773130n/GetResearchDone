'use strict';

const fs = require('fs');
const path = require('path');
const {
  extractFrontmatter,
}: {
  extractFrontmatter: (content: string) => Record<string, unknown>;
} = require('../../lib/frontmatter');

describe('Agent frontmatter audit', () => {
  const agentDir = path.join(__dirname, '../../agents');
  const agentFiles = fs
    .readdirSync(agentDir)
    .filter((f: string) => f.startsWith('grd-') && f.endsWith('.md'));

  test('agent count is 24', () => {
    expect(agentFiles.length).toBe(24);
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

  test('all agents have a color field', () => {
    for (const file of agentFiles) {
      const content = fs.readFileSync(path.join(agentDir, file), 'utf-8');
      const colorMatch = content.match(/^color:\s*(.+)$/m);
      expect(colorMatch).toBeTruthy();
    }
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
  const agentFiles = fs
    .readdirSync(agentDir)
    .filter((f: string) => f.startsWith('grd-') && f.endsWith('.md'));

  test('all agents have effort field in frontmatter', () => {
    const validLevels = ['low', 'medium', 'high'];
    for (const file of agentFiles) {
      const content = fs.readFileSync(path.join(agentDir, file), 'utf-8');
      const fm = extractFrontmatter(content);
      expect(fm.effort).toBeDefined();
      expect(validLevels).toContain(fm.effort);
    }
  });

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
