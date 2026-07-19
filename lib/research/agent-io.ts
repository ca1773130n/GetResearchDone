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

/**
 * Parse a __HYPOTHESES__ block (Phase 104 multi-candidate) into a ranked, capped candidates
 * array. Mirrors parseClarifyOutput's degrade contract: a missing/empty/malformed block, an
 * absent/non-array `candidates`, or invalid JSON yields { candidates: [] } — NEVER null, NEVER
 * throws (the caller degrades to the single-block cold path). Candidates are kept in emit (rank)
 * order; entries with no statement are dropped; rationale/predictedOutcome default to '' but do
 * not drop the entry. The array is capped to `n` (default 5 = config clamp max), order preserved.
 */
function parseHypothesesOutput(stdout: string, n?: number):
  { candidates: Array<{ statement: string; rationale: string; predictedOutcome: string }> } {
  const cap = typeof n === 'number' && n > 0 ? n : 5;
  const o = extractTaggedJson<Record<string, unknown>>(stdout, 'HYPOTHESES');
  if (!o || !Array.isArray(o.candidates)) return { candidates: [] };
  const candidates: Array<{ statement: string; rationale: string; predictedOutcome: string }> = [];
  for (const rawCand of o.candidates as unknown[]) {
    if (candidates.length >= cap) break;
    if (!rawCand || typeof rawCand !== 'object') continue;
    const c = rawCand as Record<string, unknown>;
    const statement = String(c.statement || '').trim();
    if (!statement) continue;
    candidates.push({
      statement,
      rationale: String(c.rationale || ''),
      predictedOutcome: String(c.predictedOutcome || ''),
    });
  }
  return { candidates };
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

/** A single normalized clarification dimension (maps 1:1 to a checkpoint question). */
export interface ClarifyDimension {
  ask: string;
  options: Array<{ label: string; description?: string; recommended?: boolean }>;
  freeform?: boolean;
}

/**
 * Parse a __CLARIFY__ block into normalized dimensions (Phase 103 SEED). Zero ambiguous
 * dimensions is the well-formed-question path — a missing/empty/malformed block, a missing
 * `dimensions` array, or any dimension with no usable options yields fewer/zero dimensions;
 * this parser NEVER surfaces junk. Caps at 4 dimensions; each surviving dimension is
 * guaranteed to have >=1 option with EXACTLY one recommended (checkpoint validation contract).
 */
function parseClarifyOutput(stdout: string): { dimensions: ClarifyDimension[] } {
  const o = extractTaggedJson<Record<string, unknown>>(stdout, 'CLARIFY');
  if (!o || !Array.isArray(o.dimensions)) return { dimensions: [] };
  const dimensions: ClarifyDimension[] = [];
  for (const rawDim of o.dimensions as unknown[]) {
    if (dimensions.length >= 4) break; // cap
    if (!rawDim || typeof rawDim !== 'object') continue;
    const d = rawDim as Record<string, unknown>;
    const ask = typeof d.ask === 'string' ? d.ask.trim() : '';
    if (!ask) continue;
    const rawOpts = Array.isArray(d.options) ? (d.options as unknown[]) : [];
    const options: ClarifyDimension['options'] = [];
    for (const rawOpt of rawOpts) {
      if (!rawOpt || typeof rawOpt !== 'object') continue;
      const op = rawOpt as Record<string, unknown>;
      const label = typeof op.label === 'string' ? op.label.trim() : '';
      if (!label) continue;
      const opt: ClarifyDimension['options'][number] = { label };
      if (typeof op.description === 'string') opt.description = op.description;
      if (op.recommended === true) opt.recommended = true;
      options.push(opt);
    }
    if (options.length === 0) continue; // a dimension needs >=1 option
    // Exactly one recommended: if none marked, mark the first (checkpoint validation requires it).
    if (options.filter((op) => op.recommended === true).length !== 1) {
      for (const op of options) delete op.recommended;
      options[0].recommended = true;
    }
    const dim: ClarifyDimension = { ask, options };
    if (typeof d.freeform === 'boolean') dim.freeform = d.freeform;
    dimensions.push(dim);
  }
  return { dimensions };
}

module.exports = { extractTaggedJson, parseHypothesisOutput, parseHypothesesOutput, parsePlanOutput, parseTakeawayOutput, parseClarifyOutput };
