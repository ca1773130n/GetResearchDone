'use strict';

/** GRD Commands/Watch -- Live parallel execution monitor */

const fs = require('fs') as typeof import('fs');
const path = require('path') as typeof import('path');

interface ActiveAgentStatus {
  agent_id: string;
  status: string;
  elapsed_ms: number;
  turns: number;
  phase: string;
}

interface ActiveExecutionFile {
  updated_at: string;
  agents: ActiveAgentStatus[];
}

function _renderWatchTable(agents: ActiveAgentStatus[]): string {
  const header = 'AGENT                STATUS       ELAPSED    TURNS  PHASE';
  const sep = '─'.repeat(60);
  const rows = agents.map((a) => {
    const id = a.agent_id.padEnd(20).slice(0, 20);
    const status = a.status.padEnd(12).slice(0, 12);
    const elapsed = `${Math.round(a.elapsed_ms / 1000)}s`.padStart(7);
    const turns = String(a.turns).padStart(5);
    const phase = a.phase.slice(0, 10);
    return `${id} ${status} ${elapsed}    ${turns}  ${phase}`;
  });
  return [header, sep, ...rows].join('\n');
}

/**
 * Poll .planning/active-execution.json at 500ms intervals and render a live
 * ANSI table of running agents. Exits automatically when the status file
 * disappears (execution complete) or when Ctrl-C is pressed.
 */
function cmdWatch(cwd: string, raw: boolean): void {
  const statusFile = path.join(cwd, '.planning', 'active-execution.json');
  if (!fs.existsSync(statusFile)) {
    process.stdout.write('No active execution found (.planning/active-execution.json missing).\nStart an execution with "gd execute-phase" first.\n');
    return;
  }

  process.stdout.write('\x1B[?25l'); // hide cursor
  let running = true;
  process.on('SIGINT', () => { running = false; });

  const poll = (): void => {
    if (!running) {
      process.stdout.write('\x1B[?25h\n'); // restore cursor
      return;
    }
    if (!fs.existsSync(statusFile)) {
      process.stdout.write('\x1B[?25h\nExecution complete.\n');
      return;
    }
    try {
      const data = JSON.parse(fs.readFileSync(statusFile, 'utf-8') as string) as ActiveExecutionFile;
      const table = _renderWatchTable(data.agents ?? []);
      process.stdout.write('\x1B[H\x1B[2J'); // clear screen
      process.stdout.write(`GRD Execution Monitor  (updated: ${data.updated_at ?? 'unknown'})\n\n`);
      process.stdout.write(table + '\n\nPress Ctrl-C to exit.\n');
      if (raw) process.stdout.write(JSON.stringify(data, null, 2) + '\n');
    } catch { /* file mid-write, skip */ }
    setTimeout(poll, 500);
  };

  poll();
}

module.exports = { cmdWatch };
