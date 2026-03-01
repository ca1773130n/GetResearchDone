'use strict';

/**
 * GRD Sample TypeScript Module -- Validates TypeScript toolchain
 *
 * This module exists to prove the TypeScript compilation pipeline works
 * with strict mode, CommonJS output, declarations, and source maps.
 * It will be removed or replaced once real migrations begin in Phase 59.
 *
 * @module sample
 */

interface PhaseInfo {
  number: number;
  name: string;
  status: 'not_started' | 'in_progress' | 'completed' | 'skipped';
}

function createPhaseInfo(number: number, name: string): PhaseInfo {
  if (number < 0) {
    throw new Error(`Phase number must be non-negative, got ${number}`);
  }
  if (!name || name.trim().length === 0) {
    throw new Error('Phase name must not be empty');
  }
  return { number, name: name.trim(), status: 'not_started' };
}

function formatPhaseLabel(phase: PhaseInfo): string {
  const paddedNumber = String(phase.number).padStart(2, '0');
  return `Phase ${paddedNumber}: ${phase.name} [${phase.status}]`;
}

function isPhaseActive(phase: PhaseInfo): boolean {
  return phase.status === 'in_progress';
}

module.exports = { createPhaseInfo, formatPhaseLabel, isPhaseActive };
export type { PhaseInfo };
