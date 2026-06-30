'use strict';

import {
  ULTRACODE_MODELS,
  codexEffort,
  detectUltracode,
  applyUltracodeEnv,
  maybeApplyUltracode,
  resolveEffort,
} from '../../lib/ultracode';
import { ADAPTERS } from '../../lib/scheduler';

describe('ultracode', () => {
  const saved = { ult: process.env.GRD_ULTRACODE, eff: process.env.GRD_EFFORT };
  beforeEach(() => {
    delete process.env.GRD_ULTRACODE;
    delete process.env.GRD_EFFORT;
  });
  afterAll(() => {
    if (saved.ult === undefined) delete process.env.GRD_ULTRACODE;
    else process.env.GRD_ULTRACODE = saved.ult;
    if (saved.eff === undefined) delete process.env.GRD_EFFORT;
    else process.env.GRD_EFFORT = saved.eff;
  });

  describe('detectUltracode', () => {
    it('matches the flag and the bare keyword', () => {
      expect(detectUltracode(['autopilot', '--ultracode'])).toBe(true);
      expect(detectUltracode(['autopilot', 'ultracode'])).toBe(true);
      expect(detectUltracode(['autopilot', '5'])).toBe(false);
    });
  });

  describe('codexEffort', () => {
    it('clamps max to codex xhigh (codex has no max level)', () => {
      expect(codexEffort('max')).toBe('xhigh');
      expect(codexEffort('high')).toBe('high');
      expect(codexEffort('low')).toBe('low');
    });
  });

  describe('resolveEffort', () => {
    it('ultracode implies max effort', () => {
      expect(resolveEffort({ ultracode: true })).toEqual({ effort: 'max', ultracode: true });
    });
    it('honors the env carrier set by applyUltracodeEnv', () => {
      applyUltracodeEnv();
      expect(process.env.GRD_ULTRACODE).toBe('1');
      expect(resolveEffort({})).toEqual({ effort: 'max', ultracode: true });
    });
    it('explicit opts win over env; no ultracode → no effort', () => {
      expect(resolveEffort({ effort: 'high' })).toEqual({ effort: 'high', ultracode: false });
      expect(resolveEffort({})).toEqual({ effort: undefined, ultracode: false });
    });
    it('ignores a garbage GRD_EFFORT value', () => {
      process.env.GRD_EFFORT = 'bogus';
      expect(resolveEffort({})).toEqual({ effort: undefined, ultracode: false });
    });
  });

  describe('maybeApplyUltracode', () => {
    it('sets the env carrier and returns true when the ultracode token is present', () => {
      expect(maybeApplyUltracode(['autopilot', 'ultracode'])).toBe(true);
      expect(process.env.GRD_ULTRACODE).toBe('1');
      expect(process.env.GRD_EFFORT).toBe('max');
    });
    it('also matches the --ultracode flag', () => {
      expect(maybeApplyUltracode(['autopilot', '--ultracode'])).toBe(true);
      expect(process.env.GRD_ULTRACODE).toBe('1');
    });
    it('is a no-op returning false when absent', () => {
      expect(maybeApplyUltracode(['autopilot', '5'])).toBe(false);
      expect(process.env.GRD_ULTRACODE).toBeUndefined();
    });
  });

  describe('adapters under ultracode', () => {
    it('claude injects the keyword, max effort, and best model', () => {
      const args = ADAPTERS.claude.buildArgs('/grd:autopilot', { ultracode: true });
      expect(args).toContain('--effort');
      expect(args).toContain('max');
      expect(args).toContain('--model');
      expect(args).toContain(ULTRACODE_MODELS.claude);
      const promptIdx = args.indexOf('-p') + 1;
      expect(args[promptIdx].startsWith('ultracode')).toBe(true);
    });
    it('claude without ultracode does not inject or force effort', () => {
      const args = ADAPTERS.claude.buildArgs('/grd:autopilot', {});
      const promptIdx = args.indexOf('-p') + 1;
      expect(args[promptIdx]).toBe('/grd:autopilot');
      expect(args).not.toContain('--effort');
    });
    it('codex maps ultracode to xhigh reasoning + best model', () => {
      const args = ADAPTERS.codex.buildArgs('hi', { ultracode: true });
      expect(args).toContain('-c');
      expect(args).toContain('model_reasoning_effort=xhigh');
      expect(args).toContain('-m');
      expect(args).toContain(ULTRACODE_MODELS.codex);
    });
    it('antigravity uses the verified agy interface (no effort flag exists)', () => {
      expect(ADAPTERS.antigravity.binary).toBe('agy');
      const args = ADAPTERS.antigravity.buildArgs('hi', { ultracode: true });
      expect(args).toContain('-p');
      expect(args).toContain('--dangerously-skip-permissions');
      // agy exposes no reasoning-effort flag, and no verified ultracode model.
      expect(args).not.toContain('--effort');
      expect(ULTRACODE_MODELS.antigravity).toBeUndefined();
    });
  });
});
