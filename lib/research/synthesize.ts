'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
import type { TesseraeClient, TesseraeStatus } from './tesserae';
const { createCliTesseraeClient } = require('./tesserae');
const { readManifest, upsertManifest } = require('./manifest');
const { extractTaggedJson } = require('./agent-io') as {
  extractTaggedJson: <T>(stdout: string, tag: string) => T | null;
};

// v2: output contract gained the __CANDIDATES__ block (SP2-C). Bumping invalidates
// pre-SP2-C manifest entries so previously-synthesized topics re-run and emit candidates.
const SYNTH_VERSION = 2;

export type SynthSpawnFn = (prompt: string, agentType: string) => Promise<string>;
export interface SynthesisDoc { frontmatter: Record<string, unknown>; body: string; raw: string; }
export interface Candidate {
  rank: number;
  statement: string;
  rationale: string;
  predictedOutcome: string;
  sourceNodeIds: string[];
}
export interface SynthesizeResult {
  status: TesseraeStatus; topicId: string; docPath: string | null; detail: string;
  candidates: Candidate[];
}
interface SynthesizeOpts { spawn: SynthSpawnFn; client?: TesseraeClient; }

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'topic';
}
function synthDir(cwd: string): string { return path.join(cwd, '.planning/research/synthesis'); }
function synthManifest(cwd: string): string { return path.join(synthDir(cwd), 'manifest.json'); }

function parseSynthesisDoc(stdout: string): SynthesisDoc | null {
  const idx = stdout.indexOf('__SYNTHESIS__');
  if (idx === -1) return null;
  const raw = stdout.slice(idx + '__SYNTHESIS__'.length).trim();
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return null;
  const frontmatter: Record<string, unknown> = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([a-z_]+):\s*(.*)$/);
    if (!kv) continue;
    let val: unknown = kv[2].trim();
    const arr = (val as string).match(/^\[(.*)\]$/);
    if (arr) val = arr[1].split(',').map((x) => x.trim()).filter(Boolean);
    frontmatter[kv[1]] = val;
  }
  if (frontmatter.type !== 'synthesis' || !frontmatter.topic_id || !Array.isArray(frontmatter.source_node_ids)) {
    return null;
  }
  return { frontmatter, body: m[2], raw };
}

/**
 * Parse the `__CANDIDATES__` object-wrapper block emitted after the synthesis doc.
 * Defensive: missing/malformed input → []; candidates lacking statement or
 * predicted_outcome are skipped; output sorted by (rank asc, original-index asc).
 */
function parseCandidates(stdout: string): Candidate[] {
  const wrap = extractTaggedJson<{ candidates?: unknown }>(stdout, 'CANDIDATES');
  if (!wrap || !Array.isArray(wrap.candidates)) return [];
  const parsed: Candidate[] = [];
  wrap.candidates.forEach((raw, i) => {
    const o = (raw || {}) as Record<string, unknown>;
    const statement = typeof o.statement === 'string' ? o.statement.trim() : '';
    const predictedOutcome = typeof o.predicted_outcome === 'string' ? o.predicted_outcome.trim() : '';
    if (!statement || !predictedOutcome) return; // skip incomplete
    parsed.push({
      rank: Number.isFinite(Number(o.rank)) ? Number(o.rank) : i + 1,
      statement,
      rationale: typeof o.rationale === 'string' ? o.rationale : '',
      predictedOutcome,
      sourceNodeIds: Array.isArray(o.source_node_ids) ? o.source_node_ids.map(String) : [],
    });
  });
  return parsed
    .map((c, i) => ({ c, i }))
    .sort((a, b) => a.c.rank - b.c.rank || a.i - b.i)
    .map((x) => x.c);
}

function buildSynthesizePrompt(topic: string): string {
  return [
    'You are grd-synthesizer. Query the Tesserae knowledge graph (search_nodes, ask, node_context)',
    `for the topic: "${topic}". Produce a domain compendium + ranked open questions.`,
    '',
    'Emit two final blocks to stdout (__SYNTHESIS__ then __CANDIDATES__), in that order,',
    'with no prose after them:',
    '__SYNTHESIS__',
    '---',
    'type: synthesis',
    `topic_id: ${slug(topic)}`,
    `input_query: "${topic}"`,
    'generated_at: <iso8601>',
    `synthesizer_version: ${SYNTH_VERSION}`,
    'source_node_ids: [<kg node ids you used>]',
    'supersedes: <prior synthesis doc id | none>',
    '---',
    '## Compendium',
    '<synthesized domain summary>',
    '## Open Questions',
    '- <ranked candidate research questions>',
    '',
    'Then emit a SECOND block — testable, loop-ready hypotheses derived from the synthesis,',
    'ranked best-first. Each MUST include a measurable predicted_outcome:',
    '__CANDIDATES__',
    '{ "candidates": [',
    '  { "rank": 1, "statement": "<testable claim>", "rationale": "<why, grounded in the KG>",',
    '    "predicted_outcome": "<measurable expectation if true>", "source_node_ids": ["<kg id>"] }',
    '] }',
  ].join('\n');
}

async function synthesize(cwd: string, topic: string, opts: SynthesizeOpts): Promise<SynthesizeResult> {
  const client: TesseraeClient = opts.client || createCliTesseraeClient();
  const topicId = slug(topic);
  const docPath = path.join(synthDir(cwd), `${topicId}.md`);

  if (!client.isAvailable()) {
    return { status: 'skipped_no_tesserae', topicId, docPath: null, detail: 'tesserae not available', candidates: [] };
  }

  const graphPath = path.join(cwd, '.tesserae', 'graph.json');
  const graphExists = fs.existsSync(graphPath);
  const kgMarker = graphExists ? String((fs.statSync(graphPath) as { mtimeMs: number }).mtimeMs) : 'none';
  const prior = readManifest(synthManifest(cwd)).find((e: { key: string }) => e.key === topicId) as
    { synthKey?: string; kgMarker?: string; synthVersion?: number; status?: TesseraeStatus } | undefined;

  // Level 1 (cheap, PRE-SPAWN): the KG is unchanged since this topic was last synthesized
  // (same graph marker + synthesizer version) and the doc still exists — skip the agent run.
  if (prior && graphExists && fs.existsSync(docPath)
      && prior.kgMarker === kgMarker && prior.synthVersion === SYNTH_VERSION) {
    return { status: prior.status || 'compiled', topicId, docPath, detail: 'unchanged (pre-spawn idempotent)', candidates: [] };
  }

  const out = await opts.spawn(buildSynthesizePrompt(topic), 'grd-synthesizer');
  const ci = out.indexOf('__CANDIDATES__');
  const synthPart = ci >= 0 ? out.slice(0, ci) : out;
  const candidates = ci >= 0 ? parseCandidates(out.slice(ci)) : [];
  const doc = parseSynthesisDoc(synthPart);
  if (!doc) return { status: 'compile_failed', topicId, docPath: null, detail: 'invalid synthesis doc (missing tag/frontmatter)', candidates: [] };

  const sourceIds = (doc.frontmatter.source_node_ids as string[]).slice().sort();
  const key = crypto.createHash('sha256').update(`${topicId}|${sourceIds.join(',')}|${SYNTH_VERSION}`).digest('hex');

  // Level 2 (POST-SPAWN): the specific source nodes this synthesis drew on are unchanged —
  // skip the rewrite/compile, but refresh the KG marker so the next pre-spawn check can short-circuit.
  if (prior && prior.synthKey === key && fs.existsSync(docPath) && graphExists) {
    upsertManifest(synthManifest(cwd), topicId, {
      key: topicId, synthKey: key, kgMarker, synthVersion: SYNTH_VERSION,
      docPath: path.relative(cwd, docPath), status: prior.status || 'compiled',
      lastAttemptAt: new Date().toISOString(), nodeIds: [],
    });
    return { status: prior.status || 'compiled', topicId, docPath, detail: 'unchanged (idempotent)', candidates: [] };
  }

  fs.mkdirSync(synthDir(cwd), { recursive: true });
  let raw = doc.raw;
  if (fs.existsSync(docPath) && prior && prior.synthKey && prior.synthKey !== key) {
    // Preserve the superseded version AND point the new doc's lineage at it.
    const archivedName = `${topicId}.${String(prior.synthKey).slice(0, 8)}.md`;
    fs.renameSync(docPath, path.join(synthDir(cwd), archivedName));
    raw = raw.replace(/^supersedes:.*$/m, `supersedes: ${archivedName}`);
  }
  fs.writeFileSync(docPath, raw);

  // Compile the FULL research tree (corpus + synthesis + findings), not just the synthesis
  // dir, so this compile never overwrites the previously ingested KB.
  const compileRes = await client.compile(cwd, [path.join(cwd, '.planning/research')]);
  let status: TesseraeStatus = compileRes.status;
  let nodeIds: string[] = [];
  if (compileRes.status === 'compiled') {
    const smoke = await client.querySmokeCheck(cwd, topicId);
    nodeIds = smoke.nodeIds;
    if (!smoke.found) status = 'partial';
  }
  const newMarker = fs.existsSync(graphPath) ? String((fs.statSync(graphPath) as { mtimeMs: number }).mtimeMs) : 'none';
  upsertManifest(synthManifest(cwd), topicId, {
    key: topicId, synthKey: key, kgMarker: newMarker, synthVersion: SYNTH_VERSION,
    docPath: path.relative(cwd, docPath), status, lastAttemptAt: new Date().toISOString(), nodeIds,
  });
  return { status, topicId, docPath, detail: compileRes.detail, candidates };
}

module.exports = { parseSynthesisDoc, parseCandidates, buildSynthesizePrompt, synthesize, SYNTH_VERSION };
