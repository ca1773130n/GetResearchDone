'use strict';

/**
 * GRD Commands/Watch -- Live parallel execution monitor.
 *
 * Codex r20 P2: previously polled `.planning/active-execution.json`,
 * which no existing writer produces. Switched to following
 * `.planning/autopilot/autopilot.log` — the canonical activity log
 * written by autopilot/execute-phase/evolve.
 */

const fs = require('fs') as typeof import('fs');
const path = require('path') as typeof import('path');

const TAIL_LINES = 30;
const POLL_MS = 500;

function _readTail(filePath: string, lines: number): string[] {
  try {
    const content = fs.readFileSync(filePath, 'utf-8') as string;
    const all = content.split('\n').filter((l: string) => l.trim());
    return all.slice(-lines);
  } catch {
    return [];
  }
}

function cmdWatch(cwd: string, raw: boolean): void {
  const logPath = path.join(cwd, '.planning', 'autopilot', 'autopilot.log');
  if (!fs.existsSync(logPath)) {
    process.stdout.write(
      'No autopilot log found (.planning/autopilot/autopilot.log).\n' +
      'Start an execution with `gd execute-phase` or `gd autopilot` first.\n'
    );
    return;
  }

  process.stdout.write('\x1B[?25l'); // hide cursor
  let running = true;
  process.on('SIGINT', () => { running = false; });

  let lastSize = 0;
  try { lastSize = fs.statSync(logPath).size; } catch { /* ignore */ }
  const startSize = lastSize;

  const poll = (): void => {
    if (!running) {
      process.stdout.write('\x1B[?25h\n'); // restore cursor
      return;
    }
    let stat: import('fs').Stats;
    try {
      stat = fs.statSync(logPath);
    } catch {
      process.stdout.write('\x1B[?25h\nLog file gone — execution finished.\n');
      return;
    }
    const tail = _readTail(logPath, TAIL_LINES);
    const idle = stat.size === lastSize;
    lastSize = stat.size;

    process.stdout.write('\x1B[H\x1B[2J');
    process.stdout.write(
      `GRD Execution Monitor — ${path.relative(cwd, logPath)} (${idle ? 'idle' : 'active'}, ${stat.size - startSize} bytes since start)\n`
    );
    process.stdout.write('─'.repeat(72) + '\n');
    for (const line of tail) process.stdout.write(line + '\n');
    process.stdout.write('\nPress Ctrl-C to exit.\n');

    if (raw) {
      const payload = { log: path.relative(cwd, logPath), idle, size: stat.size, tail };
      process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
    }
    setTimeout(poll, POLL_MS);
  };

  poll();
}

module.exports = { cmdWatch };
