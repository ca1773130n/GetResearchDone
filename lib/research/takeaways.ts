'use strict';
const fs = require('fs');
const path = require('path');
import type { Takeaway, TakeawayKind, FailureClass } from './types';

function takeawaysPath(cwd: string, id: string): string {
  return path.join(cwd, '.planning/research/threads', id, 'TAKEAWAYS.md');
}

function formatTakeaway(t: Takeaway): string {
  return [
    `### iter ${t.iteration}: ${t.kind}`,
    '',
    `- **content:** ${t.content}`,
    `- **confidence:** ${t.confidence}`,
    `- **evidence:** ${t.evidence}`,
    `- **failure_class:** ${t.failureClass}`,
    '',
  ].join('\n');
}

function field(block: string, name: string): string {
  const m = block.match(new RegExp(`\\*\\*${name}:\\*\\*\\s*(.+)`));
  return m ? m[1].trim() : '';
}

function parseTakeaways(content: string): Takeaway[] {
  const out: Takeaway[] = [];
  for (const raw of content.split(/(?=^### iter )/m)) {
    const b = raw.trim();
    if (!b.startsWith('### iter ')) continue;
    const head = b.match(/^### iter (\d+): (\w+)/);
    if (!head) continue;
    out.push({
      iteration: Number(head[1]),
      kind: head[2] as TakeawayKind,
      content: field(b, 'content'),
      confidence: Number(field(b, 'confidence')) || 0,
      evidence: field(b, 'evidence'),
      failureClass: (field(b, 'failure_class') || 'none') as FailureClass,
    });
  }
  return out;
}

function readTakeaways(cwd: string, id: string): Takeaway[] {
  const p = takeawaysPath(cwd, id);
  return fs.existsSync(p) ? parseTakeaways(fs.readFileSync(p, 'utf8')) : [];
}

function appendTakeaway(cwd: string, id: string, t: Takeaway): void {
  const all = readTakeaways(cwd, id);
  all.push(t);
  const p = takeawaysPath(cwd, id);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, all.map(formatTakeaway).join('\n'));
}

module.exports = { takeawaysPath, formatTakeaway, parseTakeaways, readTakeaways, appendTakeaway };
