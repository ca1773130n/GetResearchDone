'use strict';
const fs = require('fs');
const path = require('path');
import type { Hypothesis, HypothesisStatus, Verdict } from './types';

function ledgerPath(cwd: string, id: string): string {
  return path.join(cwd, '.planning/research/threads', id, 'HYPOTHESES.md');
}

function formatHypothesis(h: Hypothesis): string {
  return [
    `### ${h.id} (iter ${h.iteration}) [${h.status}]`,
    '',
    `- **statement:** ${h.statement}`,
    `- **rationale:** ${h.rationale}`,
    `- **predicted_outcome:** ${h.predictedOutcome}`,
    `- **parent:** ${h.parentId ?? 'none'}`,
    `- **verdict:** ${h.verdict ?? 'none'}`,
    `- **origin:** ${h.origin ?? 'loop'}`,
    `- **source_node_ids:** ${h.sourceNodeIds && h.sourceNodeIds.length ? h.sourceNodeIds.join(', ') : 'none'}`,
    '',
  ].join('\n');
}

function field(block: string, name: string): string {
  const m = block.match(new RegExp(`\\*\\*${name}:\\*\\*\\s*(.+)`));
  return m ? m[1].trim() : '';
}

function parseHypotheses(content: string): Hypothesis[] {
  const out: Hypothesis[] = [];
  for (const raw of content.split(/(?=^### h\d)/m)) {
    const b = raw.trim();
    if (!b.startsWith('### h')) continue;
    const head = b.match(/^### (h\d+) \(iter (\d+)\) \[(\w+)\]/);
    if (!head) continue;
    const parent = field(b, 'parent');
    const verdict = field(b, 'verdict');
    out.push({
      id: head[1],
      iteration: Number(head[2]),
      status: head[3] as HypothesisStatus,
      statement: field(b, 'statement'),
      rationale: field(b, 'rationale'),
      predictedOutcome: field(b, 'predicted_outcome'),
      parentId: parent === 'none' ? null : parent,
      verdict: verdict === 'none' ? null : (verdict as Verdict),
      origin: field(b, 'origin') === 'synthesis' ? 'synthesis' : 'loop',
      sourceNodeIds: (() => {
        const s = field(b, 'source_node_ids');
        return s && s !== 'none' ? s.split(',').map((x) => x.trim()).filter(Boolean) : [];
      })(),
    });
  }
  return out;
}

function nextHypothesisId(hyps: Hypothesis[]): string {
  const max = hyps.reduce((m, h) => Math.max(m, Number(h.id.slice(1)) || 0), 0);
  return `h${max + 1}`;
}

function readLedger(cwd: string, id: string): Hypothesis[] {
  const p = ledgerPath(cwd, id);
  return fs.existsSync(p) ? parseHypotheses(fs.readFileSync(p, 'utf8')) : [];
}

function writeLedger(cwd: string, id: string, hyps: Hypothesis[]): void {
  const p = ledgerPath(cwd, id);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, hyps.map(formatHypothesis).join('\n'));
}

function appendHypothesis(cwd: string, id: string, h: Hypothesis): void {
  const hyps = readLedger(cwd, id).filter((x) => x.id !== h.id);
  hyps.push(h);
  writeLedger(cwd, id, hyps);
}

function updateHypothesisStatus(
  cwd: string, id: string, hid: string, status: HypothesisStatus, verdict: Verdict | null,
): void {
  const hyps = readLedger(cwd, id).map((h) =>
    h.id === hid ? { ...h, status, verdict } : h);
  writeLedger(cwd, id, hyps);
}

module.exports = {
  ledgerPath, formatHypothesis, parseHypotheses, nextHypothesisId,
  readLedger, writeLedger, appendHypothesis, updateHypothesisStatus,
};
