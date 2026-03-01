/**
 * Unit tests for lib/sample.ts
 *
 * Validates TypeScript test compilation via ts-jest.
 */

const { createPhaseInfo, formatPhaseLabel, isPhaseActive } = require('../../lib/sample');

describe('sample TypeScript module', () => {
  describe('createPhaseInfo', () => {
    it('should create phase info with not_started status', () => {
      const phase = createPhaseInfo(1, 'foundation');
      expect(phase).toEqual({
        number: 1,
        name: 'foundation',
        status: 'not_started',
      });
    });

    it('should accept zero as a valid phase number', () => {
      const phase = createPhaseInfo(0, 'init');
      expect(phase.number).toBe(0);
      expect(phase.name).toBe('init');
      expect(phase.status).toBe('not_started');
    });

    it('should trim whitespace from phase name', () => {
      const phase = createPhaseInfo(5, '  toolchain  ');
      expect(phase.name).toBe('toolchain');
    });

    it('should throw for negative phase numbers', () => {
      expect(() => createPhaseInfo(-1, 'bad')).toThrow('non-negative');
    });

    it('should throw for empty phase name', () => {
      expect(() => createPhaseInfo(1, '')).toThrow('empty');
    });

    it('should throw for whitespace-only phase name', () => {
      expect(() => createPhaseInfo(1, '   ')).toThrow('empty');
    });

    it('should handle large phase numbers', () => {
      const phase = createPhaseInfo(999, 'final');
      expect(phase.number).toBe(999);
    });
  });

  describe('formatPhaseLabel', () => {
    it('should format single-digit phase with zero padding', () => {
      const phase = createPhaseInfo(3, 'toolchain');
      expect(formatPhaseLabel(phase)).toBe('Phase 03: toolchain [not_started]');
    });

    it('should format double-digit phase without extra padding', () => {
      const phase = createPhaseInfo(58, 'typescript');
      expect(formatPhaseLabel(phase)).toBe('Phase 58: typescript [not_started]');
    });

    it('should format triple-digit phase numbers', () => {
      const phase = createPhaseInfo(100, 'hundred');
      expect(formatPhaseLabel(phase)).toBe('Phase 100: hundred [not_started]');
    });

    it('should include phase status in label', () => {
      const phase = createPhaseInfo(1, 'test');
      expect(formatPhaseLabel(phase)).toContain('[not_started]');
    });
  });

  describe('isPhaseActive', () => {
    it('should return false for not_started phases', () => {
      const phase = createPhaseInfo(1, 'pending');
      expect(isPhaseActive(phase)).toBe(false);
    });

    it('should return true for in_progress phases', () => {
      const phase = createPhaseInfo(1, 'active');
      phase.status = 'in_progress';
      expect(isPhaseActive(phase)).toBe(true);
    });

    it('should return false for completed phases', () => {
      const phase = createPhaseInfo(1, 'done');
      phase.status = 'completed';
      expect(isPhaseActive(phase)).toBe(false);
    });

    it('should return false for skipped phases', () => {
      const phase = createPhaseInfo(1, 'skipped');
      phase.status = 'skipped';
      expect(isPhaseActive(phase)).toBe(false);
    });
  });
});
