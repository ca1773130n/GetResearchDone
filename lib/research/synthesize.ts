'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
import type { TesseraeClient, TesseraeStatus } from './tesserae';
const { createCliTesseraeClient } = require('./tesserae');
const { readManifest, upsertManifest } = require('./manifest');

const SYNTH_VERSION = 1;

export type SynthSpawnFn = (prompt: string, agentType: string) => Promise<string>;
export interface SynthesisDoc { frontmatter: Record<string, unknown>; body: string; raw: string; }
export interface SynthesizeResult { status: TesseraeStatus; topicId: string; docPath: string | null; detail: string; }
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

function buildSynthesizePrompt(topic: string): string {
  return [
    'You are grd-synthesizer. Query the Tesserae knowledge graph (search_nodes, ask, node_context)',
    `for the topic: "${topic}". Produce a domain compendium + ranked open questions.`,
    '',
    'Emit exactly one final block to stdout (no prose after it):',
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
  ].join('\n');
}

async function synthesize(cwd: string, topic: string, opts: SynthesizeOpts): Promise<SynthesizeResult> {
  const client: TesseraeClient = opts.client || createCliTesseraeClient();
  const topicId = slug(topic);
  const docPath = path.join(synthDir(cwd), `${topicId}.md`);

  if (!client.isAvailable()) {
    return { status: 'skipped_no_tesserae', topicId, docPath: null, detail: 'tesserae not available' };
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
    return { status: prior.status || 'compiled', topicId, docPath, detail: 'unchanged (pre-spawn idempotent)' };
  }

  const out = await opts.spawn(buildSynthesizePrompt(topic), 'grd-synthesizer');
  const doc = parseSynthesisDoc(out);
  if (!doc) return { status: 'compile_failed', topicId, docPath: null, detail: 'invalid synthesis doc (missing tag/frontmatter)' };

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
    return { status: prior.status || 'compiled', topicId, docPath, detail: 'unchanged (idempotent)' };
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

  const compileRes = await client.compile(cwd, [synthDir(cwd)]);
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
  return { status, topicId, docPath, detail: compileRes.detail };
}

module.exports = { parseSynthesisDoc, buildSynthesizePrompt, synthesize, SYNTH_VERSION };
