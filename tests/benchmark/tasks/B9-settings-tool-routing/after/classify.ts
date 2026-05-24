'use strict';
// Classifies a `gd` command. 'effort' is a tool-mode settings subcommand
// alongside the existing two, so it routes in-process and writes config.
const SETTINGS_TOOL_SUBS = new Set(['token_profile', 'effort', 'phase_complete_llm_fallback']);

export function classify(command: string, sub?: string): 'tool' | 'agent' | 'unknown' {
  if (command === 'settings' && sub && SETTINGS_TOOL_SUBS.has(sub)) return 'tool';
  if (command === 'settings') return 'agent';
  return 'unknown';
}
