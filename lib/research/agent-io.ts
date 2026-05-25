'use strict';

function extractTaggedJson<T>(stdout: string, tag: string): T | null {
  const idx = stdout.indexOf(`__${tag}__`);
  if (idx === -1) return null;
  const rest = stdout.slice(idx + tag.length + 4);
  const start = rest.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inStr = false;
  let escaped = false;
  for (let i = start; i < rest.length; i++) {
    const ch = rest[i];
    if (inStr) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(rest.slice(start, i + 1)) as T; } catch { return null; }
      }
    }
  }
  return null;
}

function parseHypothesisOutput(stdout: string):
  { statement: string; rationale: string; predictedOutcome: string } | null {
  const o = extractTaggedJson<Record<string, string>>(stdout, 'HYPOTHESIS');
  if (!o || !o.statement) return null;
  return {
    statement: o.statement,
    rationale: o.rationale || '',
    predictedOutcome: o.predictedOutcome || '',
  };
}

function parsePlanOutput(stdout: string):
  { procedure: string; metricKey: string; comparator: string; target: number;
    language: string; scriptPath: string } | null {
  const o = extractTaggedJson<Record<string, unknown>>(stdout, 'PLAN');
  if (!o || !o.metricKey || !o.scriptPath) return null;
  return {
    procedure: String(o.procedure || ''),
    metricKey: String(o.metricKey),
    comparator: String(o.comparator || '>='),
    target: Number(o.target ?? 0),
    language: String(o.language || 'shell'),
    scriptPath: String(o.scriptPath),
  };
}

function parseTakeawayOutput(stdout: string):
  { kind: string; content: string; confidence: number; evidence: string; failureClass: string } | null {
  const o = extractTaggedJson<Record<string, unknown>>(stdout, 'TAKEAWAY');
  if (!o || !o.content) return null;
  return {
    kind: String(o.kind || 'domain_fact'),
    content: String(o.content),
    confidence: Number(o.confidence ?? 0.5),
    evidence: String(o.evidence || ''),
    failureClass: String(o.failureClass || 'none'),
  };
}

module.exports = { extractTaggedJson, parseHypothesisOutput, parsePlanOutput, parseTakeawayOutput };
