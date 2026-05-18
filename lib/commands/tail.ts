'use strict';

/** GRD Commands/Tail -- Live tail of autopilot.log with GRD-aware formatting */

const fs = require('fs') as typeof import('fs');
const path = require('path') as typeof import('path');

const {
  output,
}: {
  output: (result: unknown, raw: boolean, rawValue?: unknown) => never;
} = require('../utils');

const POLL_INTERVAL_MS = 500;
const LOG_RELATIVE = path.join('.planning', 'autopilot', 'autopilot.log');

interface TailLine {
  timestamp: string;
  message: string;
  type: 'phase_start' | 'plan_complete' | 'error' | 'info';
}

function _classifyLine(msg: string): TailLine['type'] {
  const lower = msg.toLowerCase();
  if (lower.includes('phase') && (lower.includes('start') || lower.includes('wave'))) return 'phase_start';
  if (lower.includes('complete') || lower.includes('success') || lower.includes('done')) return 'plan_complete';
  if (lower.includes('error') || lower.includes('fail') || lower.includes('abort')) return 'error';
  return 'info';
}

function _parseLine(raw: string): TailLine | null {
  const m = raw.match(/^\[([^\]]+)\]\s+(.*)/);
  if (!m) return null;
  const msg = m[2].trim();
  return { timestamp: m[1], message: msg, type: _classifyLine(msg) };
}

function _formatLine(line: TailLine): string {
  const prefix: Record<TailLine['type'], string> = {
    phase_start: '== ',
    plan_complete: '++ ',
    error: '!! ',
    info: '   ',
  };
  return `${line.timestamp.slice(11, 19)} ${prefix[line.type]}${line.message}`;
}

interface TailResult {
  log_path: string;
  lines_shown: number;
}

/**
 * CLI command: Follow autopilot.log in real-time with GRD-aware formatting.
 * In non-follow mode, shows the last N lines.
 */
function cmdTail(cwd: string, phaseFilter: string | null, follow: boolean, raw: boolean): void {
  const logPath = path.join(cwd, LOG_RELATIVE);

  if (!fs.existsSync(logPath)) {
    output(
      { log_path: path.relative(cwd, logPath), lines_shown: 0, note: 'Log file not found — no autopilot session running' },
      raw,
      'log not found'
    );
    return;
  }

  const content = fs.readFileSync(logPath, 'utf-8') as string;
  const allLines = content.split('\n').filter((l: string) => l.trim());

  let lines = allLines.map(_parseLine).filter((l): l is TailLine => l !== null);

  if (phaseFilter) {
    lines = lines.filter((l) => l.message.includes(`phase ${phaseFilter}`) || l.message.includes(`Phase ${phaseFilter}`));
  }

  const lastN = follow ? lines : lines.slice(-50);
  for (const line of lastN) {
    process.stdout.write(_formatLine(line) + '\n');
  }

  if (!follow) {
    const result: TailResult = { log_path: path.relative(cwd, logPath), lines_shown: lastN.length };
    output(result, raw, `${lastN.length} lines`);
    return;
  }

  // Follow mode: poll for new content
  let fileSize = fs.statSync(logPath).size;
  const watcher = setInterval(() => {
    try {
      const newSize = fs.statSync(logPath).size;
      if (newSize <= fileSize) return;

      const fd = fs.openSync(logPath, 'r');
      const diff = newSize - fileSize;
      const buf = Buffer.alloc(diff);
      fs.readSync(fd, buf, 0, diff, fileSize);
      fs.closeSync(fd);
      fileSize = newSize;

      const newContent = buf.toString('utf-8');
      const newLines = newContent.split('\n').filter((l: string) => l.trim());
      for (const rawLine of newLines) {
        const parsed = _parseLine(rawLine);
        if (!parsed) continue;
        if (phaseFilter && !parsed.message.includes(`phase ${phaseFilter}`) && !parsed.message.includes(`Phase ${phaseFilter}`)) continue;
        process.stdout.write(_formatLine(parsed) + '\n');
      }
    } catch {
      // file may have been rotated
    }
  }, POLL_INTERVAL_MS);

  process.on('SIGINT', () => {
    clearInterval(watcher);
    process.exit(0);
  });
}

module.exports = { cmdTail };
