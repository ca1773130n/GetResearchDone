'use strict';
const fs = require('fs');
const path = require('path');
import type { ResearchThread, Hypothesis, Takeaway, ExperimentResult } from './types';

function findingPath(cwd: string, id: string): string {
  return path.join(cwd, '.planning/research/threads', id, 'FINDING.md');
}

function buildFinding(
  thread: Pick<ResearchThread, 'id' | 'question' | 'status' | 'iteration'>,
  hyps: Hypothesis[],
  takeaways: Takeaway[],
  lastResult: ExperimentResult | { metrics: Record<string, number> } | null,
): string {
  const supported = hyps.find((h) => h.status === 'supported');
  const lines: string[] = [
    `# Finding: ${thread.question}`,
    '',
    `- **thread:** ${thread.id}`,
    `- **verdict:** ${thread.status}`,
    `- **iterations:** ${thread.iteration}`,
    '',
    '## Supported hypothesis',
    '',
    supported ? `**${supported.id}:** ${supported.statement}` : '_none — exhausted without support_',
    '',
    '## Hypothesis ledger',
    '',
    ...hyps.map((h) => `- **${h.id}** [${h.status}] — ${h.statement}`),
    '',
    '## Method & metric',
    '',
    lastResult ? '```json\n' + JSON.stringify(lastResult.metrics, null, 2) + '\n```' : '_no result_',
    '',
    '## Takeaways',
    '',
    ...takeaways.map((t) => `- _(iter ${t.iteration}, ${t.kind})_ ${t.content}`),
    '',
    '## Open questions',
    '',
    '- (next-cycle follow-ups)',
    '',
  ];
  return lines.join('\n');
}

function writeFinding(cwd: string, id: string, content: string): void {
  const p = findingPath(cwd, id);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}

module.exports = { findingPath, buildFinding, writeFinding };
