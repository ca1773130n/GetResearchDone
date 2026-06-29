'use strict';

export type TesseraeStatus = 'compiled' | 'skipped_no_tesserae' | 'compile_failed' | 'partial';
export interface CompileResult { status: TesseraeStatus; detail: string; graphPath: string | null; }
export interface SmokeResult { found: boolean; nodeIds: string[]; detail: string; }

export interface TesseraeClient {
  isAvailable(): boolean;
  compile(cwd: string, sources: string[]): Promise<CompileResult>;
  querySmokeCheck(cwd: string, topic: string): Promise<SmokeResult>;
}

interface FakeOpts {
  available?: boolean;
  compileStatus?: TesseraeStatus;
  smoke?: SmokeResult;
}

function createFakeTesseraeClient(opts: FakeOpts): TesseraeClient {
  return {
    isAvailable: () => opts.available === true,
    compile: async (cwd: string) => {
      const status = opts.available === true ? (opts.compileStatus || 'compiled') : 'skipped_no_tesserae';
      let graphPath: string | null = null;
      if (status === 'compiled' || status === 'partial') {
        const dir = path.join(cwd, '.tesserae');
        fs.mkdirSync(dir, { recursive: true });
        graphPath = path.join(dir, 'graph.json');
        fs.writeFileSync(graphPath, JSON.stringify({ nodes: [{ id: 'fake', name: 'fake' }] }));
      }
      return { status, detail: 'fake', graphPath };
    },
    querySmokeCheck: async () => opts.smoke || { found: false, nodeIds: [], detail: 'fake' },
  };
}

const fs = require('fs');
const path = require('path');
// execFileSync only (NOT a shell): no shell is spawned, args are passed as an array.
const { execFileSync } = require('child_process');

type RunFn = (bin: string, args: string[], cwd: string) => string;
interface CliOpts { run?: RunFn; whichOk?: boolean; }

function tesseraeDir(cwd: string): string { return path.join(cwd, '.tesserae'); }
function graphJsonPath(cwd: string): string { return path.join(tesseraeDir(cwd), 'graph.json'); }
function sqlitePath(cwd: string): string { return path.join(tesseraeDir(cwd), 'sqlite.db'); }

// tesserae 0.13 flipped `extract --extractor` default to `llm` (the configured
// provider — codex/claude/anthropic). GRD pins its OWN default — `deterministic`
// (fast, key-free, byte-stable) — explicitly, so `gd ingest` never silently inherits
// LLM extraction (cost + latency) when tesserae's default changes under it. Accepts
// the 0.13 provider-agnostic values (`llm`/`selective-llm`) and the legacy 0.12 ones
// (`claude-cli`/`selective-claude`); unset/unknown → `deterministic`. The selective
// modes read optional include/limit knobs (new `--llm-*` vs legacy `--claude-*`).
const _EXTRACTORS = new Set(['deterministic', 'llm', 'selective-llm', 'claude-cli', 'selective-claude']);
function readExtractorConfig(cwd: string): { extractor: string; include: string | null; limit: number | null } {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(cwd, '.planning/config.json'), 'utf8')) as {
      research_tesserae_extractor?: unknown;
      research_tesserae_extract_include?: unknown;
      research_tesserae_extract_limit?: unknown;
    };
    const v = raw.research_tesserae_extractor;
    const inc = raw.research_tesserae_extract_include;
    const lim = raw.research_tesserae_extract_limit;
    return {
      extractor: typeof v === 'string' && _EXTRACTORS.has(v) ? v : 'deterministic',
      include: typeof inc === 'string' && inc.length > 0 ? inc : null,
      limit: typeof lim === 'number' && Number.isInteger(lim) && lim > 0 ? lim : null,
    };
  } catch { return { extractor: 'deterministic', include: null, limit: null }; }
}

// tesserae's concept/claim layer node types (cli.py _CONCEPT_LAYER_TYPES, 0.12).
const _CONCEPT_LAYER_TYPES = new Set([
  'Concept', 'TechnicalTerm', 'MethodologicalConcept', 'MathematicalConcept', 'Algorithm',
  'ArchitecturePattern', 'TrainingParadigm', 'InferenceStrategy', 'ObjectiveFunction', 'Task',
  'Capability', 'ResearchTopic', 'ProblemArea', 'ApproachFamily', 'Claim', 'ContributionClaim',
  'PerformanceClaim', 'ComparisonClaim', 'LimitationClaim', 'CausalClaim', 'OpenQuestion',
]);

// tesserae 0.12 warns (to stderr, which GRD does not capture) when a deterministic
// compile yields >=20 nodes but no concept/claim layer. Mirror that check on the
// graph.json we already produce so `gd ingest` can nudge toward the LLM extractor.
function conceptPoorHint(graphPath: string): string | null {
  try {
    const data = JSON.parse(fs.readFileSync(graphPath, 'utf8')) as {
      nodes?: Array<{ node_type?: string; type?: string }>;
    };
    const nodes = data.nodes || [];
    if (nodes.length < 20) return null;
    const conceptual = nodes.filter(
      (n) => _CONCEPT_LAYER_TYPES.has(String(n.node_type || n.type || '')),
    ).length;
    if (conceptual > 0) return null;
    return `compiled ${nodes.length} nodes but no concept/claim layer — the deterministic `
      + 'extractor only mints concepts for known headings. For a richer typed graph set '
      + '`research_tesserae_extractor: llm` (tesserae 0.13, uses your configured provider).';
  } catch { return null; }
}

function binaryResolves(): boolean {
  try { execFileSync('tesserae', ['--help'], { encoding: 'utf8', timeout: 15000 }); return true; }
  catch { return false; }
}

function createCliTesseraeClient(opts: CliOpts = {}): TesseraeClient {
  const run: RunFn = opts.run
    || ((bin, args, cwd) => execFileSync(bin, args, { cwd, encoding: 'utf8', timeout: 600000 }));
  const available = opts.whichOk !== undefined ? opts.whichOk : binaryResolves();

  return {
    isAvailable: () => available,

    async compile(cwd: string, sources: string[]): Promise<CompileResult> {
      if (!available) return { status: 'skipped_no_tesserae', detail: 'tesserae CLI not found', graphPath: null };
      fs.mkdirSync(tesseraeDir(cwd), { recursive: true });
      const graph = graphJsonPath(cwd);
      // tesserae 0.11.0 retired the bare `tesserae <paths>` form ("bare extraction
      // has moved → tesserae extract <paths>"). --distill is now a compile-only flag,
      // unsupported by `extract`, so it is dropped here (distilled memory is populated
      // by `tesserae refresh`/`compile --distill` at the project level, not corpus extract).
      const args = ['extract', ...sources, '-o', graph, '--sqlite-output', sqlitePath(cwd), '--changed-only', '--canonicalize'];
      const ex = readExtractorConfig(cwd);
      // Always pin the extractor explicitly (tesserae 0.13's own default is `llm`;
      // GRD's is `deterministic` unless opted in) so ingest cost stays predictable.
      args.push('--extractor', ex.extractor);
      if (ex.extractor === 'selective-llm') {
        if (ex.include) args.push('--llm-include', ex.include);
        if (ex.limit !== null) args.push('--llm-limit', String(ex.limit));
      } else if (ex.extractor === 'selective-claude') {
        if (ex.include) args.push('--claude-include', ex.include);
        if (ex.limit !== null) args.push('--claude-limit', String(ex.limit));
      }
      try {
        run('tesserae', args, cwd);
        // Nudge toward the LLM extractor only when on deterministic; best-effort, never blocks.
        const detail = ex.extractor === 'deterministic' ? (conceptPoorHint(graph) || 'compiled') : 'compiled';
        return { status: 'compiled', detail, graphPath: graph };
      } catch (e: unknown) {
        const err = e as { stderr?: string; message?: string };
        return { status: 'compile_failed', detail: err.stderr || err.message || String(e), graphPath: null };
      }
    },

    async querySmokeCheck(cwd: string, topic: string): Promise<SmokeResult> {
      const graph = graphJsonPath(cwd);
      if (!fs.existsSync(graph)) return { found: false, nodeIds: [], detail: 'no graph.json' };
      let nodes: Array<{ id?: string; name?: string; source_path?: string }> = [];
      try {
        const parsed = JSON.parse(fs.readFileSync(graph, 'utf8')) as { nodes?: typeof nodes };
        nodes = parsed.nodes || [];
      } catch { return { found: false, nodeIds: [], detail: 'unreadable graph.json' }; }
      const needle = topic.toLowerCase();
      const matched = nodes.filter((n) =>
        (n.name || '').toLowerCase().includes(needle) || (n.source_path || '').toLowerCase().includes(needle));
      return {
        found: matched.length > 0,
        nodeIds: matched.map((n) => String(n.id)).filter(Boolean),
        detail: `${matched.length} match(es)`,
      };
    },
  };
}

module.exports = { createFakeTesseraeClient, createCliTesseraeClient };
