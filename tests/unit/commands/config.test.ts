'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  yoloEnable,
  yoloDisable,
  disableBooleanFlags,
  cmdConfigYolo,
} = require('../../../lib/commands/config') as {
  yoloEnable: (c: Record<string, unknown>) => Record<string, unknown>;
  yoloDisable: (c: Record<string, unknown>) => Record<string, unknown>;
  disableBooleanFlags: (g: Record<string, unknown>) => Record<string, unknown>;
  cmdConfigYolo: (cwd: string, mode: string, raw: boolean, dryRun?: boolean) => void;
};

function tmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'grd-config-'));
}

describe('config round-trip (R7)', () => {
  describe('disableBooleanFlags', () => {
    it('forces top-level booleans false, preserving nested objects/unknown keys', () => {
      const out = disableBooleanFlags({
        experiment_execution: true,
        kg_write: true,
        interactive: { enabled: true, design: false },
      });
      expect(out).toEqual({
        experiment_execution: false,
        kg_write: false,
        interactive: { enabled: false, design: false },
      });
    });
    it('leaves non-boolean/array values untouched', () => {
      expect(disableBooleanFlags({ list: [1, 2], name: 'x', flag: true }))
        .toEqual({ list: [1, 2], name: 'x', flag: false });
    });
  });

  describe('yoloEnable / yoloDisable', () => {
    it('snapshots then restores a nested research_gates.interactive object verbatim', () => {
      const original = {
        autonomous_mode: false,
        research_gates: {
          experiment_execution: true,
          kg_write: true,
          interactive: { enabled: true, design: false },
        },
        confirmation_gates: { commit_confirmation: true },
      };
      const enabled = yoloEnable(original);
      expect(enabled.autonomous_mode).toBe(true);
      // snapshot preserves the unknown nested key verbatim
      expect(enabled._saved_research_gates).toEqual(original.research_gates);
      // live gates have all booleans off (including nested interactive.enabled)
      expect(enabled.research_gates).toEqual({
        experiment_execution: false,
        kg_write: false,
        interactive: { enabled: false, design: false },
      });

      const restored = yoloDisable(enabled);
      expect(restored.autonomous_mode).toBe(false);
      expect(restored.research_gates).toEqual(original.research_gates);
      expect(restored._saved_research_gates).toBeUndefined();
      expect(restored._saved_confirmation_gates).toBeUndefined();
    });

    it('yoloDisable falls back to leaving gates as-is when no snapshot exists', () => {
      const out = yoloDisable({ autonomous_mode: true });
      expect(out.autonomous_mode).toBe(false);
      expect(out).not.toHaveProperty('_saved_research_gates');
    });
  });

  describe('cmdConfigYolo (persisting round-trip)', () => {
    // output()/error() call process.exit — mock it to a throw so the CLI helper
    // returns control after it has already written config.json.
    let exitSpy: jest.SpyInstance;
    let writeSpy: jest.SpyInstance;
    beforeEach(() => {
      exitSpy = jest.spyOn(process, 'exit').mockImplementation(((): never => {
        throw new Error('__exit__');
      }) as never);
      writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    });
    afterEach(() => {
      exitSpy.mockRestore();
      writeSpy.mockRestore();
    });
    const runYolo = (cwd: string, mode: string): void => {
      try {
        cmdConfigYolo(cwd, mode, true);
      } catch (e) {
        if ((e as Error).message !== '__exit__') throw e;
      }
    };

    it('preserves research_gates.interactive across on->off through config.json', () => {
      const cwd = tmp();
      fs.mkdirSync(path.join(cwd, '.planning'), { recursive: true });
      const configPath = path.join(cwd, '.planning', 'config.json');
      fs.writeFileSync(configPath, JSON.stringify({
        autonomous_mode: false,
        research_gates: {
          survey_approval: false,
          interactive: { enabled: true, design: true, method_selection: false },
        },
      }, null, 2));

      runYolo(cwd, 'on');
      const onCfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      expect(onCfg.autonomous_mode).toBe(true);
      expect(onCfg._saved_research_gates.interactive)
        .toEqual({ enabled: true, design: true, method_selection: false });

      runYolo(cwd, 'off');
      const offCfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      expect(offCfg.autonomous_mode).toBe(false);
      // verbatim preservation of the unknown nested interactive object
      expect(offCfg.research_gates.interactive)
        .toEqual({ enabled: true, design: true, method_selection: false });
    });

    it('dry-run does not write', () => {
      const cwd = tmp();
      fs.mkdirSync(path.join(cwd, '.planning'), { recursive: true });
      const configPath = path.join(cwd, '.planning', 'config.json');
      fs.writeFileSync(configPath, JSON.stringify({ autonomous_mode: false }, null, 2));
      try {
        cmdConfigYolo(cwd, 'on', true, true);
      } catch (e) {
        if ((e as Error).message !== '__exit__') throw e;
      }
      const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      expect(cfg.autonomous_mode).toBe(false);
    });
  });
});
