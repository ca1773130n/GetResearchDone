'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '../..');
const DIST_GRD_TOOLS = path.join(ROOT, 'dist', 'bin', 'grd-tools.js');

describe('Deferred Validations (Phase 65)', () => {
  describe('DEFER-58-01: Strict mode full codebase', () => {
    test('tsc --noEmit with strict:true passes', () => {
      // Run tsc --noEmit and verify clean exit
      execFileSync('npx', ['tsc', '--noEmit'], {
        cwd: ROOT,
        encoding: 'utf-8',
        stdio: 'pipe',
      });
      // If we reach here, exit code was 0
      expect(true).toBe(true);
    });
  });

  describe('DEFER-59-01: CJS interop with downstream consumers', () => {
    test('all lib/ .js proxies can be required via plain Node', () => {
      // Each .js proxy should load without error
      const proxies = fs
        .readdirSync(path.join(ROOT, 'lib'))
        .filter(
          (f: string) =>
            f.endsWith('.js') && !f.endsWith('.d.ts') && !f.endsWith('.d.js')
        );
      expect(proxies.length).toBeGreaterThanOrEqual(20);
      for (const proxy of proxies) {
        expect(() => {
          require(path.join(ROOT, 'lib', proxy));
        }).not.toThrow();
      }
    });
  });

  describe('DEFER-61-01: Runtime CJS interop for Phase 61 modules', () => {
    const phase61Modules = [
      'tracker',
      'worktree',
      'autopilot',
      'parallel',
      'long-term-roadmap',
      'evolve',
    ];
    test.each(phase61Modules)(
      'lib/%s.js proxy loads under plain Node',
      (mod) => {
        expect(() => {
          require(path.join(ROOT, 'lib', `${mod}.js`));
        }).not.toThrow();
      }
    );
  });

  describe('DEFER-61-02: Subprocess typed interfaces', () => {
    test('tracker.ts exports have proper function signatures', () => {
      const tracker = require(path.join(ROOT, 'lib', 'tracker.js'));
      expect(typeof tracker.cmdTracker).toBe('function');
      expect(typeof tracker.createTracker).toBe('function');
      expect(typeof tracker.loadTrackerConfig).toBe('function');
    });
    test('worktree.ts exports have proper function signatures', () => {
      const worktree = require(path.join(ROOT, 'lib', 'worktree.js'));
      expect(typeof worktree.cmdWorktreeCreate).toBe('function');
      expect(typeof worktree.cmdWorktreeRemove).toBe('function');
      expect(typeof worktree.cmdWorktreeList).toBe('function');
    });
    test('autopilot.ts exports have proper function signatures', () => {
      const autopilot = require(path.join(ROOT, 'lib', 'autopilot.js'));
      expect(typeof autopilot.cmdAutopilot).toBe('function');
      expect(typeof autopilot.cmdInitAutopilot).toBe('function');
    });
  });

  describe('DEFER-61-03: Evolve state JSON round-trip', () => {
    test('EVOLVE-STATE.json write/read round-trip preserves all EvolveState fields', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-evolve-'));
      // Create .planning subdir (writeEvolveState writes to cwd/.planning/EVOLVE-STATE.json)
      fs.mkdirSync(path.join(tmpDir, '.planning'), { recursive: true });

      // Load the actual evolve/state module (via CJS proxy chain)
      const evolveState = require(path.join(
        ROOT,
        'lib',
        'evolve',
        'state.ts'
      ));

      // Create a valid EvolveState using the module's own factory function
      const state = evolveState.createInitialState('v0.3.0', 5);

      // Write using the module's writeEvolveState
      evolveState.writeEvolveState(tmpDir, state);

      // Read back using the module's readEvolveState
      const loaded = evolveState.readEvolveState(tmpDir);

      // Validate ALL fields from the EvolveState interface (lib/evolve/types.ts):
      // iteration, timestamp, milestone, items_per_iteration, selected, remaining,
      // bugfix, completed, failed, history
      const expectedFields = [
        'iteration',
        'timestamp',
        'milestone',
        'items_per_iteration',
        'selected',
        'remaining',
        'bugfix',
        'completed',
        'failed',
        'history',
      ];
      for (const field of expectedFields) {
        expect(loaded).toHaveProperty(field);
      }
      expect(loaded.iteration).toBe(state.iteration);
      expect(loaded.milestone).toBe(state.milestone);
      expect(loaded.items_per_iteration).toBe(state.items_per_iteration);
      expect(loaded.selected).toEqual(state.selected);
      expect(loaded.remaining).toEqual(state.remaining);
      expect(loaded.history).toEqual(state.history);

      fs.rmSync(tmpDir, { recursive: true, force: true });
    });
  });

  describe('DEFER-62-01: Barrel re-export backward compatibility', () => {
    test('lib/commands.js re-exports all command functions', () => {
      const commands = require(path.join(ROOT, 'lib', 'commands.js'));
      // Should export key command functions used by bin/grd-tools.ts
      expect(typeof commands.cmdCurrentTimestamp).toBe('function');
      expect(typeof commands.cmdGenerateSlug).toBe('function');
      expect(typeof commands.cmdDashboard).toBe('function');
      expect(typeof commands.cmdHealth).toBe('function');
      expect(typeof commands.cmdSearch).toBe('function');
      expect(typeof commands.cmdLongTermRoadmap).toBe('function');
      expect(typeof commands.cmdCommit).toBe('function');
      // Verify sufficient export count (30+ functions)
      const fnKeys = Object.keys(commands).filter(
        (k) => typeof commands[k] === 'function'
      );
      expect(fnKeys.length).toBeGreaterThanOrEqual(30);
    });
    test('lib/context.js re-exports all context functions', () => {
      const ctx = require(path.join(ROOT, 'lib', 'context.js'));
      expect(typeof ctx.cmdInitExecutePhase).toBe('function');
      expect(typeof ctx.cmdInitPlanPhase).toBe('function');
      expect(typeof ctx.cmdInitNewProject).toBe('function');
      expect(typeof ctx.cmdInitSurveyor).toBe('function');
      expect(typeof ctx.inferCeremonyLevel).toBe('function');
      // Verify sufficient export count
      const fnKeys = Object.keys(ctx).filter(
        (k) => typeof ctx[k] === 'function'
      );
      expect(fnKeys.length).toBeGreaterThanOrEqual(40);
    });
    test('lib/evolve.js re-exports all evolve functions', () => {
      const evolve = require(path.join(ROOT, 'lib', 'evolve.js'));
      expect(typeof evolve.cmdEvolveDiscover).toBe('function');
      expect(typeof evolve.cmdEvolve).toBe('function');
      expect(typeof evolve.cmdEvolveState).toBe('function');
      expect(typeof evolve.runEvolve).toBe('function');
      expect(typeof evolve.createInitialState).toBe('function');
      // Verify sufficient export count
      const fnKeys = Object.keys(evolve).filter(
        (k) => typeof evolve[k] === 'function'
      );
      expect(fnKeys.length).toBeGreaterThanOrEqual(25);
    });
  });

  describe('DEFER-63-01: Plugin manifest with dist/ paths', () => {
    // NOTE: The SessionStart hook continues to use the CJS proxy
    // (bin/grd-tools.js -> bin/grd-tools.ts) in source mode. This is correct
    // because plugin.json runs in the source context, not the dist/ context.
    // The "dist/ path" portion of DEFER-63-01 is validated by the separate
    // dist/ CLI functional test below, not by modifying plugin.json to
    // reference dist/ paths.
    test('plugin.json exists and has valid structure', () => {
      const pluginPath = path.join(ROOT, '.claude-plugin', 'plugin.json');
      const plugin = JSON.parse(fs.readFileSync(pluginPath, 'utf-8'));
      expect(plugin.hooks).toBeDefined();
      expect(plugin.hooks.SessionStart).toBeDefined();
    });
    test('SessionStart hook command references existing CJS proxy file', () => {
      const pluginPath = path.join(ROOT, '.claude-plugin', 'plugin.json');
      const plugin = JSON.parse(fs.readFileSync(pluginPath, 'utf-8'));
      const cmd = plugin.hooks.SessionStart[0].hooks[0].command;
      // Command references bin/grd-tools.js (the CJS proxy) -- verify it exists
      expect(cmd).toContain('grd-tools.js');
      // Verify the CJS proxy file actually exists on disk
      const proxyPath = path.join(ROOT, 'bin', 'grd-tools.js');
      expect(fs.existsSync(proxyPath)).toBe(true);
    });
    test('dist/ build exists and grd-tools.js is functional', () => {
      expect(fs.existsSync(DIST_GRD_TOOLS)).toBe(true);
      const result = execFileSync(
        'node',
        [DIST_GRD_TOOLS, 'current-timestamp', '--raw'],
        {
          cwd: ROOT,
          encoding: 'utf-8',
          stdio: 'pipe',
        }
      );
      // current-timestamp --raw returns either YYYY-MM-DD or full ISO timestamp
      expect(result.trim()).toMatch(/^\d{4}-\d{2}-\d{2}/);
    });
  });
});
