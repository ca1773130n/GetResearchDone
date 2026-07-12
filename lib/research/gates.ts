'use strict';
import type { ResearchThread, ThreadGates } from './types';

const { defaultGates } = require('./types') as { defaultGates: () => ThreadGates };

interface GateConfig {
  research_gates?: { experiment_execution?: boolean; kg_write?: boolean };
}

function resolveGates(config: GateConfig, noGates: boolean): ThreadGates {
  // R1 mitigation: derive the all-off object from the single defaultGates()
  // source so a future gate added to ThreadGates cannot silently default-on for
  // an unattended caller (bench/portfolio/harness/autopilot).
  if (noGates) {
    const on = defaultGates();
    return Object.fromEntries(Object.keys(on).map((k) => [k, false])) as unknown as ThreadGates;
  }
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
