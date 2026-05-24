'use strict';
// Classifies a `gd` command as a tool command (runs in-process) or an agent
// command (spawns a skill). BUG: `gd settings effort <v>` is implemented as a
// tool, but 'effort' is missing from SETTINGS_TOOL_SUBS, so it misroutes to
// the agent path and never writes config.
const SETTINGS_TOOL_SUBS = new Set(['token_profile', 'phase_complete_llm_fallback']);

export function classify(command: string, sub?: string): 'tool' | 'agent' | 'unknown' {
  if (command === 'settings' && sub && SETTINGS_TOOL_SUBS.has(sub)) return 'tool';
  if (command === 'settings') return 'agent';
  return 'unknown';
}
