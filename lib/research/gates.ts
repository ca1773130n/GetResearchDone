'use strict';
import type { ResearchThread, ThreadGates } from './types';

interface GateConfig {
  research_gates?: { experiment_execution?: boolean; kg_write?: boolean };
}

function resolveGates(config: GateConfig, noGates: boolean): ThreadGates {
  if (noGates) return { execute: false, kg_write: false };
  const rg = config.research_gates || {};
  return {
    execute: rg.experiment_execution !== false,
    kg_write: rg.kg_write !== false,
  };
}

function checkGate(
  thread: ResearchThread, gate: 'execute' | 'kg_write', approved: boolean,
): { proceed: boolean; thread: ResearchThread } {
  if (!thread.gates[gate] || approved) return { proceed: true, thread };
  return {
    proceed: false,
    thread: { ...thread, status: 'paused', pendingGate: gate },
  };
}

module.exports = { resolveGates, checkGate };
