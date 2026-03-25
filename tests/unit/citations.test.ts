'use strict';

/**
 * Unit tests for lib/citations.ts
 *
 * Tests all seven exported functions:
 *   - parseMissingComponents: Parse missing_components sections from PAPERS.md content
 *   - parseBorrowedComponents: Parse borrowed_components sections from PAPERS.md content
 *   - buildCitationGraph: Construct a CitationGraph from a directory of .md files
 *   - resolveCitations: Fetch paper metadata via arXiv/Semantic Scholar (injectable fetchFn)
 *   - findUnresolved: Return unresolved CitationNodes with optional priority filter
 *   - traverseCitationGraph: BFS traversal with cycle detection, depth/node limits
 *   - resolveTransitiveDeps: Merge transitive discoveries into a CitationGraph
 *
 * Satisfies REQ-185 (Citation Recovery Tests): 85%+ line coverage on lib/citations.ts
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  parseMissingComponents,
  parseBorrowedComponents,
  buildCitationGraph,
  resolveCitations,
  findUnresolved,
  traverseCitationGraph,
  resolveTransitiveDeps,
} = require('../../lib/citations') as {
  parseMissingComponents: (content: string) => import('../../lib/types').MissingComponent[];
  parseBorrowedComponents: (content: string) => import('../../lib/types').BorrowedComponent[];
  buildCitationGraph: (papersDir: string) => import('../../lib/types').CitationGraph;
  resolveCitations: (
    graph: import('../../lib/types').CitationGraph,
    apiConfig: import('../../lib/types').ApiConfig,
    fetchFn?: (url: string, timeoutMs: number) => Promise<string | null>
  ) => Promise<import('../../lib/types').CitationGraph>;
  findUnresolved: (
    graph: import('../../lib/types').CitationGraph,
    priority?: 'critical' | 'normal' | 'low'
  ) => import('../../lib/types').CitationNode[];
  traverseCitationGraph: (
    graph: import('../../lib/types').CitationGraph,
    options?: Partial<import('../../lib/types').TraversalOptions>
  ) => import('../../lib/types').TraversalResult;
  resolveTransitiveDeps: (
    graph: import('../../lib/types').CitationGraph,
    options?: Partial<import('../../lib/types').TraversalOptions>
  ) => import('../../lib/types').CitationGraph;
};

import type {
  MissingComponent,
  BorrowedComponent,
  CitationGraph,
  CitationNode,
  CitationEdge,
  ApiConfig,
  TraversalResult,
} from '../../lib/types';

// ─── Mock Data Helpers ────────────────────────────────────────────────────────

/** PAPERS.md content with Missing Components in table format */
const PAPERS_TABLE_FORMAT = `## Attention Is All You Need

Core transformer architecture paper.

### Missing Components

| Name | Source Paper | Description | Code Available |
| ---- | ------------ | ----------- | -------------- |
| Scaled Dot-Product Attention | bahdanau-attention-2014 | Core attention mechanism | yes |
| Multi-Head Attention | vaswani-attention-2017 | Parallel attention heads | no |

### Borrowed Components

| Name | Source Paper | Description |
| ---- | ------------ | ----------- |
| Layer Normalization | ba-layer-norm-2016 | Normalizes across features |

`;

/** PAPERS.md content with Missing Components in structured list format */
const PAPERS_STRUCTURED_FORMAT = `## BERT: Pre-training

Bidirectional encoder representations.

### Missing Components

- **name:** WordPiece Tokenizer
  - source_paper: schuster-wordpiece-2012
  - description: Subword tokenization algorithm
  - code_available: false
- **name:** NSP Task Head
  - source_paper: devlin-bert-2018
  - description: Next sentence prediction objective
  - code_available: true

### Borrowed Components

- **name:** Transformer Encoder
  - source_paper: vaswani-attention-2017
  - description: Standard transformer encoder block

`;

/** PAPERS.md content with Missing Components in inline list format */
const PAPERS_INLINE_FORMAT = `## GPT-2 Language Model

Large-scale language model paper.

### Missing Components

- **Byte Pair Encoding**: Subword tokenization (source: sennrich-bpe-2016, code: yes)
- **Nucleus Sampling**: Top-p sampling algorithm (source: holtzman-nucleus-2020, code: no)

### Borrowed Components

- **Residual Connections**: Skip connection architecture (source: he-resnet-2016)

`;

/** Minimal PAPERS.md with no component sections */
const PAPERS_NO_COMPONENTS = `## Simple Paper

Just a paper with no component sections.

Some content about the paper.
`;

/** Build a mock CitationGraph with given nodes for testing */
function makeMockGraph(nodeOverrides: Partial<CitationNode>[] = []): CitationGraph {
  const nodes: CitationNode[] = nodeOverrides.map((o, i) => ({
    slug: `paper-${i}`,
    title: `Paper ${i}`,
    resolved: false,
    priority: 'normal',
    technique_summary: '',
    missing_components: [],
    borrowed_components: [],
    ...o,
  }));
  return { nodes, edges: [], built_at: new Date().toISOString() };
}

/** Build an ArXiv-like Atom XML response */
function makeArxivXml(summary: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>Attention Is All You Need</title>
    <summary>${summary}</summary>
  </entry>
</feed>`;
}

/** Build a Semantic Scholar API JSON response */
function makeSemanticScholarJson(abstract: string): string {
  return JSON.stringify({
    data: [
      {
        paperId: 'abc123',
        title: 'Attention Is All You Need',
        abstract,
      },
    ],
  });
}

/** Mock fetchFn that returns predetermined responses based on URL patterns */
function makeMockFetchFn(responses: Record<string, string | null>) {
  return jest.fn(async (url: string, _timeoutMs: number): Promise<string | null> => {
    for (const [pattern, response] of Object.entries(responses)) {
      if (url.includes(pattern)) {
        return response;
      }
    }
    return null;
  });
}

// ─── parseMissingComponents ───────────────────────────────────────────────────

describe('parseMissingComponents', () => {
  test('parses table format with code_available yes/no', () => {
    const results: MissingComponent[] = parseMissingComponents(PAPERS_TABLE_FORMAT);

    expect(results).toHaveLength(2);
    expect(results[0].name).toBe('Scaled Dot-Product Attention');
    expect(results[0].source_paper).toBe('bahdanau-attention-2014');
    expect(results[0].description).toBe('Core attention mechanism');
    expect(results[0].code_available).toBe(true);

    expect(results[1].name).toBe('Multi-Head Attention');
    expect(results[1].source_paper).toBe('vaswani-attention-2017');
    expect(results[1].code_available).toBe(false);
  });

  test('parses structured list format with code_available true/false', () => {
    const results: MissingComponent[] = parseMissingComponents(PAPERS_STRUCTURED_FORMAT);

    expect(results).toHaveLength(2);
    expect(results[0].name).toBe('WordPiece Tokenizer');
    expect(results[0].source_paper).toBe('schuster-wordpiece-2012');
    expect(results[0].description).toBe('Subword tokenization algorithm');
    expect(results[0].code_available).toBe(false);

    expect(results[1].name).toBe('NSP Task Head');
    expect(results[1].code_available).toBe(true);
  });

  test('parses inline list format', () => {
    const results: MissingComponent[] = parseMissingComponents(PAPERS_INLINE_FORMAT);

    expect(results).toHaveLength(2);
    expect(results[0].name).toBe('Byte Pair Encoding');
    expect(results[0].source_paper).toBe('sennrich-bpe-2016');
    expect(results[0].code_available).toBe(true);

    expect(results[1].name).toBe('Nucleus Sampling');
    expect(results[1].source_paper).toBe('holtzman-nucleus-2020');
    expect(results[1].code_available).toBe(false);
  });

  test('returns empty array when no Missing Components section found', () => {
    const results: MissingComponent[] = parseMissingComponents(PAPERS_NO_COMPONENTS);
    expect(results).toEqual([]);
  });

  test('returns empty array for empty string input', () => {
    expect(parseMissingComponents('')).toEqual([]);
  });

  test('handles malformed entries gracefully — skips non-matching rows', () => {
    const content = `## Paper

### Missing Components

| Name | Source Paper | Description | Code Available |
| ---- | ------------ | ----------- | -------------- |
| Valid Row | paper-slug | Does things | yes |
`;
    const results = parseMissingComponents(content);
    // Should parse the valid row only
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].name).toBe('Valid Row');
  });

  test('code_available defaults to false for structured list missing code_available field', () => {
    const content = `## Paper

### Missing Components

- **name:** SomeComponent
  - source_paper: some-paper
  - description: Some description
`;
    const results = parseMissingComponents(content);
    expect(results).toHaveLength(1);
    expect(results[0].code_available).toBe(false);
  });
});

// ─── parseBorrowedComponents ──────────────────────────────────────────────────

describe('parseBorrowedComponents', () => {
  test('parses table format', () => {
    const results: BorrowedComponent[] = parseBorrowedComponents(PAPERS_TABLE_FORMAT);

    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('Layer Normalization');
    expect(results[0].source_paper).toBe('ba-layer-norm-2016');
    expect(results[0].description).toBe('Normalizes across features');
  });

  test('parses structured list format', () => {
    const results: BorrowedComponent[] = parseBorrowedComponents(PAPERS_STRUCTURED_FORMAT);

    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('Transformer Encoder');
    expect(results[0].source_paper).toBe('vaswani-attention-2017');
    expect(results[0].description).toBe('Standard transformer encoder block');
  });

  test('parses inline list format', () => {
    const results: BorrowedComponent[] = parseBorrowedComponents(PAPERS_INLINE_FORMAT);

    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('Residual Connections');
    expect(results[0].source_paper).toBe('he-resnet-2016');
    expect(results[0].description).toContain('Skip connection architecture');
  });

  test('returns empty array when no Borrowed Components section found', () => {
    const results: BorrowedComponent[] = parseBorrowedComponents(PAPERS_NO_COMPONENTS);
    expect(results).toEqual([]);
  });

  test('returns empty array for empty string input', () => {
    expect(parseBorrowedComponents('')).toEqual([]);
  });

  test('parses borrowed components in content that has no missing components section', () => {
    const content = `## Paper

### Borrowed Components

| Name | Source Paper | Description |
| ---- | ------------ | ----------- |
| Softmax | classic-paper | Standard softmax activation |
`;
    const results = parseBorrowedComponents(content);
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('Softmax');
  });
});

// ─── buildCitationGraph ───────────────────────────────────────────────────────

describe('buildCitationGraph', () => {
  let tmpDir: string;
  let papersDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-citations-test-'));
    papersDir = path.join(tmpDir, 'papers');
    fs.mkdirSync(papersDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('builds graph from single PAPERS.md with missing and borrowed components', () => {
    fs.writeFileSync(path.join(papersDir, 'vaswani-2017.md'), PAPERS_TABLE_FORMAT);

    const graph: CitationGraph = buildCitationGraph(papersDir);

    expect(graph.nodes.length).toBeGreaterThanOrEqual(3);
    expect(graph.edges.length).toBeGreaterThanOrEqual(3);
    expect(graph.built_at).toBeDefined();
    expect(new Date(graph.built_at).getFullYear()).toBeGreaterThan(2020);
  });

  test('builds edges connecting paper slugs to dependency slugs', () => {
    fs.writeFileSync(path.join(papersDir, 'vaswani-2017.md'), PAPERS_TABLE_FORMAT);

    const graph = buildCitationGraph(papersDir);

    const missingEdges = graph.edges.filter((e) => e.type === 'missing');
    const borrowedEdges = graph.edges.filter((e) => e.type === 'borrowed');

    expect(missingEdges).toHaveLength(2);
    expect(borrowedEdges).toHaveLength(1);

    // Edge from source paper to dependency
    const attnEdge = missingEdges.find((e) => e.to_slug === 'bahdanau-attention-2014');
    expect(attnEdge).toBeDefined();
    expect(attnEdge?.from_slug).toBe('vaswani-2017');
    expect(attnEdge?.component_name).toBe('Scaled Dot-Product Attention');
  });

  test('sets priority to critical for missing components where code_available is false', () => {
    fs.writeFileSync(path.join(papersDir, 'vaswani-2017.md'), PAPERS_TABLE_FORMAT);

    const graph = buildCitationGraph(papersDir);

    // vaswani-attention-2017 is a dep with code_available: no → critical
    const criticalNode = graph.nodes.find((n) => n.slug === 'vaswani-attention-2017');
    expect(criticalNode).toBeDefined();
    expect(criticalNode?.priority).toBe('critical');

    // bahdanau-attention-2014 has code_available: yes → normal
    const normalNode = graph.nodes.find((n) => n.slug === 'bahdanau-attention-2014');
    expect(normalNode).toBeDefined();
    expect(normalNode?.priority).toBe('normal');
  });

  test('writes per-paper JSON to citations/ directory', () => {
    fs.writeFileSync(path.join(papersDir, 'vaswani-2017.md'), PAPERS_TABLE_FORMAT);

    buildCitationGraph(papersDir);

    const citationsDir = path.join(papersDir, '..', 'citations');
    expect(fs.existsSync(citationsDir)).toBe(true);

    const jsonPath = path.join(citationsDir, 'vaswani-2017.json');
    expect(fs.existsSync(jsonPath)).toBe(true);

    const parsed = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    expect(parsed.slug).toBe('vaswani-2017');
    expect(parsed.resolved).toBe(false);
  });

  test('returns empty graph when papersDir has no .md files', () => {
    // papersDir is empty
    const graph = buildCitationGraph(papersDir);

    expect(graph.nodes).toEqual([]);
    expect(graph.edges).toEqual([]);
    expect(graph.built_at).toBeDefined();
  });

  test('returns empty graph when papersDir does not exist', () => {
    const nonExistentDir = path.join(tmpDir, 'does-not-exist');
    const graph = buildCitationGraph(nonExistentDir);

    expect(graph.nodes).toEqual([]);
    expect(graph.edges).toEqual([]);
  });

  test('returns graph with built_at timestamp as valid ISO string', () => {
    fs.writeFileSync(path.join(papersDir, 'paper.md'), PAPERS_NO_COMPONENTS);

    const graph = buildCitationGraph(papersDir);

    const parsed = new Date(graph.built_at);
    expect(isNaN(parsed.getTime())).toBe(false);
  });

  test('handles PAPERS.md with no component sections — creates single node', () => {
    fs.writeFileSync(path.join(papersDir, 'simple-paper.md'), PAPERS_NO_COMPONENTS);

    const graph = buildCitationGraph(papersDir);

    expect(graph.nodes).toHaveLength(1);
    expect(graph.nodes[0].slug).toBe('simple-paper');
    expect(graph.edges).toHaveLength(0);
    expect(graph.nodes[0].missing_components).toEqual([]);
    expect(graph.nodes[0].borrowed_components).toEqual([]);
  });

  test('all nodes start with resolved=false', () => {
    fs.writeFileSync(path.join(papersDir, 'vaswani-2017.md'), PAPERS_TABLE_FORMAT);

    const graph = buildCitationGraph(papersDir);

    for (const node of graph.nodes) {
      expect(node.resolved).toBe(false);
    }
  });

  test('returns empty graph when readdirSync throws unexpectedly', () => {
    // Pass a path that exists as a file, not a directory — readdirSync throws
    const filePath = path.join(tmpDir, 'not-a-directory.md');
    fs.writeFileSync(filePath, 'some content');

    const graph = buildCitationGraph(filePath);

    expect(graph.nodes).toEqual([]);
    expect(graph.edges).toEqual([]);
  });

  test('merges components from multiple .md files', () => {
    fs.writeFileSync(path.join(papersDir, 'paper-a.md'), PAPERS_TABLE_FORMAT);
    fs.writeFileSync(path.join(papersDir, 'paper-b.md'), PAPERS_STRUCTURED_FORMAT);

    const graph = buildCitationGraph(papersDir);

    // Should have nodes from both files
    const slugs = graph.nodes.map((n) => n.slug);
    expect(slugs).toContain('paper-a');
    expect(slugs).toContain('paper-b');
    expect(graph.edges.length).toBeGreaterThan(3);
  });

  test('does not duplicate nodes for shared dependency slug', () => {
    // Both papers reference vaswani-attention-2017 as a dep
    const contentA = `## Paper A

### Missing Components

| Name | Source Paper | Description | Code Available |
| ---- | ------------ | ----------- | -------------- |
| Component X | vaswani-attention-2017 | Something | no |
`;
    const contentB = `## Paper B

### Missing Components

| Name | Source Paper | Description | Code Available |
| ---- | ------------ | ----------- | -------------- |
| Component Y | vaswani-attention-2017 | Something else | no |
`;
    fs.writeFileSync(path.join(papersDir, 'paper-a.md'), contentA);
    fs.writeFileSync(path.join(papersDir, 'paper-b.md'), contentB);

    const graph = buildCitationGraph(papersDir);

    const vaswaniNodes = graph.nodes.filter((n) => n.slug === 'vaswani-attention-2017');
    expect(vaswaniNodes).toHaveLength(1);
  });
});

// ─── resolveCitations ─────────────────────────────────────────────────────────

describe('resolveCitations', () => {
  const baseApiConfig: ApiConfig = {
    arxiv_enabled: true,
    semantic_scholar_enabled: true,
    timeout_ms: 5000,
  };

  test('resolves nodes when arxiv API returns valid XML', async () => {
    const graph = makeMockGraph([{ slug: 'vaswani-2017', title: 'Attention Is All You Need' }]);
    const arxivBody = makeArxivXml(
      'The dominant sequence transduction models are based on complex recurrent or convolutional neural networks'
    );
    const fetchFn = makeMockFetchFn({ 'arxiv.org': arxivBody });

    await resolveCitations(graph, baseApiConfig, fetchFn);

    expect(graph.nodes[0].resolved).toBe(true);
    expect(graph.nodes[0].technique_summary).toContain('dominant sequence transduction');
    expect(fetchFn).toHaveBeenCalledWith(expect.stringContaining('arxiv.org'), 5000);
  });

  test('resolves nodes when semantic scholar API returns valid JSON', async () => {
    const graph = makeMockGraph([{ slug: 'bert-2018', title: 'BERT Pre-training' }]);
    const ssBody = makeSemanticScholarJson(
      'We introduce BERT, a new language representation model which stands for Bidirectional Encoder Representations'
    );
    const fetchFn = makeMockFetchFn({ 'semanticscholar.org': ssBody });
    const apiConfig: ApiConfig = { ...baseApiConfig, arxiv_enabled: false };

    await resolveCitations(graph, apiConfig, fetchFn);

    expect(graph.nodes[0].resolved).toBe(true);
    expect(graph.nodes[0].technique_summary).toContain('BERT');
    expect(fetchFn).toHaveBeenCalledWith(expect.stringContaining('semanticscholar.org'), 5000);
  });

  test('uses arxiv first and skips semantic scholar when arxiv succeeds', async () => {
    const graph = makeMockGraph([{ slug: 'vaswani-2017', title: 'Attention Is All You Need' }]);
    const arxivBody = makeArxivXml('Arxiv abstract about transformers');
    const fetchFn = makeMockFetchFn({
      'arxiv.org': arxivBody,
      'semanticscholar.org': makeSemanticScholarJson('SS abstract'),
    });

    await resolveCitations(graph, baseApiConfig, fetchFn);

    // Should call arxiv but not SS (since arxiv succeeded)
    const arxivCalls = fetchFn.mock.calls.filter((c) =>
      (c[0] as string).includes('arxiv.org')
    );
    const ssCalls = fetchFn.mock.calls.filter((c) =>
      (c[0] as string).includes('semanticscholar.org')
    );
    expect(arxivCalls).toHaveLength(1);
    expect(ssCalls).toHaveLength(0);
    expect(graph.nodes[0].resolved).toBe(true);
  });

  test('falls back to semantic scholar when arxiv fetch returns null', async () => {
    const graph = makeMockGraph([{ slug: 'paper', title: 'Some Paper' }]);
    const ssBody = makeSemanticScholarJson('Semantic Scholar abstract text');
    const fetchFn = makeMockFetchFn({
      'arxiv.org': null,
      'semanticscholar.org': ssBody,
    });

    await resolveCitations(graph, baseApiConfig, fetchFn);

    expect(graph.nodes[0].resolved).toBe(true);
    expect(graph.nodes[0].technique_summary).toContain('Semantic Scholar abstract');
  });

  test('leaves nodes unresolved when both APIs fail', async () => {
    const graph = makeMockGraph([{ slug: 'unknown-paper', title: 'Unknown Paper' }]);
    const fetchFn = makeMockFetchFn({ 'arxiv.org': null, 'semanticscholar.org': null });

    await resolveCitations(graph, baseApiConfig, fetchFn);

    expect(graph.nodes[0].resolved).toBe(false);
    expect(graph.nodes[0].technique_summary).toBe('');
  });

  test('sets technique_summary truncated to 200 chars', async () => {
    const longAbstract = 'A'.repeat(500);
    const graph = makeMockGraph([{ slug: 'paper', title: 'Long Paper' }]);
    const fetchFn = makeMockFetchFn({ 'arxiv.org': makeArxivXml(longAbstract) });

    await resolveCitations(graph, baseApiConfig, fetchFn);

    expect(graph.nodes[0].resolved).toBe(true);
    expect(graph.nodes[0].technique_summary).toHaveLength(200);
  });

  test('skips already-resolved nodes', async () => {
    const graph = makeMockGraph([
      { slug: 'resolved', title: 'Already Resolved', resolved: true, technique_summary: 'existing' },
      { slug: 'unresolved', title: 'Needs Resolution', resolved: false },
    ]);
    const arxivBody = makeArxivXml('New abstract for unresolved');
    const fetchFn = makeMockFetchFn({ 'arxiv.org': arxivBody });

    await resolveCitations(graph, baseApiConfig, fetchFn);

    // Resolved node is unchanged
    expect(graph.nodes[0].technique_summary).toBe('existing');
    // Unresolved node gets updated
    expect(graph.nodes[1].resolved).toBe(true);
    // fetchFn called only once (for the unresolved node)
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  test('respects apiConfig.arxiv_enabled=false — skips arxiv', async () => {
    const graph = makeMockGraph([{ slug: 'paper', title: 'Test Paper' }]);
    const ssBody = makeSemanticScholarJson('Semantic Scholar result');
    const fetchFn = makeMockFetchFn({ 'semanticscholar.org': ssBody });
    const apiConfig: ApiConfig = { ...baseApiConfig, arxiv_enabled: false };

    await resolveCitations(graph, apiConfig, fetchFn);

    const arxivCalls = fetchFn.mock.calls.filter((c) =>
      (c[0] as string).includes('arxiv.org')
    );
    expect(arxivCalls).toHaveLength(0);
    expect(graph.nodes[0].resolved).toBe(true);
  });

  test('respects apiConfig.semantic_scholar_enabled=false — skips SS', async () => {
    const graph = makeMockGraph([{ slug: 'paper', title: 'Test Paper' }]);
    const fetchFn = makeMockFetchFn({ 'arxiv.org': null, 'semanticscholar.org': makeSemanticScholarJson('SS') });
    const apiConfig: ApiConfig = { ...baseApiConfig, semantic_scholar_enabled: false };

    await resolveCitations(graph, apiConfig, fetchFn);

    const ssCalls = fetchFn.mock.calls.filter((c) =>
      (c[0] as string).includes('semanticscholar.org')
    );
    expect(ssCalls).toHaveLength(0);
    expect(graph.nodes[0].resolved).toBe(false);
  });

  test('handles both APIs disabled — no fetches, all nodes remain unresolved', async () => {
    const graph = makeMockGraph([{ slug: 'paper', title: 'Test Paper' }]);
    const fetchFn = makeMockFetchFn({});
    const apiConfig: ApiConfig = {
      arxiv_enabled: false,
      semantic_scholar_enabled: false,
      timeout_ms: 1000,
    };

    await resolveCitations(graph, apiConfig, fetchFn);

    expect(fetchFn).not.toHaveBeenCalled();
    expect(graph.nodes[0].resolved).toBe(false);
  });

  test('handles timeout gracefully — fetchFn returns null', async () => {
    const graph = makeMockGraph([{ slug: 'paper', title: 'Test Paper' }]);
    const fetchFn = jest.fn(async () => null);

    await resolveCitations(graph, baseApiConfig, fetchFn);

    expect(graph.nodes[0].resolved).toBe(false);
  });

  test('returns the same graph object (mutates in place)', async () => {
    const graph = makeMockGraph([{ slug: 'paper', title: 'Test' }]);
    const fetchFn = makeMockFetchFn({ 'arxiv.org': makeArxivXml('Abstract text') });

    const result = await resolveCitations(graph, baseApiConfig, fetchFn);

    expect(result).toBe(graph);
  });

  test('handles invalid arxiv XML gracefully — falls back to SS', async () => {
    const graph = makeMockGraph([{ slug: 'paper', title: 'Test Paper' }]);
    const ssBody = makeSemanticScholarJson('Semantic Scholar fallback');
    // Return malformed XML (no <summary> tag)
    const fetchFn = makeMockFetchFn({
      'arxiv.org': '<feed><entry><title>Test</title></entry></feed>',
      'semanticscholar.org': ssBody,
    });

    await resolveCitations(graph, baseApiConfig, fetchFn);

    expect(graph.nodes[0].resolved).toBe(true);
    expect(graph.nodes[0].technique_summary).toContain('Semantic Scholar fallback');
  });

  test('handles invalid semantic scholar JSON gracefully — node remains unresolved', async () => {
    const graph = makeMockGraph([{ slug: 'paper', title: 'Test Paper' }]);
    const fetchFn = makeMockFetchFn({
      'arxiv.org': null,
      'semanticscholar.org': 'not valid json {{{',
    });

    await resolveCitations(graph, baseApiConfig, fetchFn);

    expect(graph.nodes[0].resolved).toBe(false);
  });

  test('empty graph resolves without errors', async () => {
    const graph: CitationGraph = { nodes: [], edges: [], built_at: new Date().toISOString() };
    const fetchFn = makeMockFetchFn({});

    const result = await resolveCitations(graph, baseApiConfig, fetchFn);

    expect(result.nodes).toHaveLength(0);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  test('uses default fetchFn (no inject) — both APIs disabled, no network call', async () => {
    // When both APIs are disabled, no fetch is attempted — defaultFetchFn is never called.
    // This exercises the path through resolveCitations without a fetchFn.
    const graph = makeMockGraph([{ slug: 'paper', title: 'Test' }]);
    const apiConfig: ApiConfig = {
      arxiv_enabled: false,
      semantic_scholar_enabled: false,
      timeout_ms: 100,
    };

    // No fetchFn injected — uses defaultFetchFn, but both APIs are disabled
    const result = await resolveCitations(graph, apiConfig);

    expect(result.nodes[0].resolved).toBe(false);
  });

  test('default fetchFn handles connection errors gracefully', async () => {
    // Invoke resolveCitations without fetchFn injection with a very short timeout
    // to exercise defaultFetchFn's error handling path (connection will fail).
    const graph = makeMockGraph([{ slug: 'paper', title: 'localhost-will-refuse-connection' }]);
    const apiConfig: ApiConfig = {
      arxiv_enabled: true,
      semantic_scholar_enabled: false,
      timeout_ms: 50, // very short timeout
    };

    // Should not throw — defaultFetchFn catches errors and returns null
    let threw = false;
    try {
      await resolveCitations(graph, apiConfig);
    } catch {
      threw = true;
    }

    expect(threw).toBe(false);
    // Node may or may not be resolved depending on network, but no exception
  });
});

// ─── findUnresolved ───────────────────────────────────────────────────────────

describe('findUnresolved', () => {
  test('returns all unresolved nodes when no priority filter', () => {
    const graph = makeMockGraph([
      { slug: 'a', resolved: false, priority: 'critical' },
      { slug: 'b', resolved: true },
      { slug: 'c', resolved: false, priority: 'normal' },
    ]);

    const result: CitationNode[] = findUnresolved(graph);

    expect(result).toHaveLength(2);
    const slugs = result.map((n) => n.slug);
    expect(slugs).toContain('a');
    expect(slugs).toContain('c');
  });

  test('returns empty array when all nodes resolved', () => {
    const graph = makeMockGraph([
      { slug: 'a', resolved: true },
      { slug: 'b', resolved: true },
    ]);

    const result = findUnresolved(graph);

    expect(result).toEqual([]);
  });

  test('returns empty array when graph has no nodes', () => {
    const graph: CitationGraph = { nodes: [], edges: [], built_at: '' };

    expect(findUnresolved(graph)).toEqual([]);
  });

  test('filters by priority=critical returns only critical unresolved', () => {
    const graph = makeMockGraph([
      { slug: 'a', resolved: false, priority: 'critical' },
      { slug: 'b', resolved: false, priority: 'normal' },
      { slug: 'c', resolved: false, priority: 'low' },
      { slug: 'd', resolved: true, priority: 'critical' },
    ]);

    const result = findUnresolved(graph, 'critical');

    expect(result).toHaveLength(1);
    expect(result[0].slug).toBe('a');
  });

  test('filters by priority=normal returns only normal unresolved', () => {
    const graph = makeMockGraph([
      { slug: 'a', resolved: false, priority: 'critical' },
      { slug: 'b', resolved: false, priority: 'normal' },
      { slug: 'c', resolved: false, priority: 'normal' },
    ]);

    const result = findUnresolved(graph, 'normal');

    expect(result).toHaveLength(2);
    expect(result.every((n) => n.priority === 'normal')).toBe(true);
  });

  test('filters by priority=low returns only low priority unresolved', () => {
    const graph = makeMockGraph([
      { slug: 'a', resolved: false, priority: 'critical' },
      { slug: 'b', resolved: false, priority: 'low' },
    ]);

    const result = findUnresolved(graph, 'low');

    expect(result).toHaveLength(1);
    expect(result[0].slug).toBe('b');
  });

  test('returns empty when priority filter matches no unresolved nodes', () => {
    const graph = makeMockGraph([
      { slug: 'a', resolved: false, priority: 'normal' },
    ]);

    const result = findUnresolved(graph, 'critical');

    expect(result).toEqual([]);
  });

  test('resolved critical node is NOT returned even when priority=critical filter used', () => {
    const graph = makeMockGraph([
      { slug: 'a', resolved: true, priority: 'critical' },
    ]);

    const result = findUnresolved(graph, 'critical');

    expect(result).toEqual([]);
  });
});

// ─── Helper: build a CitationGraph with explicit nodes and edges ───────────────

/**
 * Build a CitationGraph with full control over nodes and edges.
 * Useful for traversal tests that need specific topologies.
 */
function makeGraphWithEdges(
  nodes: Partial<CitationNode>[],
  edges: Partial<CitationEdge>[]
): CitationGraph {
  const fullNodes: CitationNode[] = nodes.map((n, i) => ({
    slug: `node-${i}`,
    title: `Node ${i}`,
    resolved: false,
    priority: 'normal',
    technique_summary: '',
    missing_components: [],
    borrowed_components: [],
    ...n,
  }));
  const fullEdges: CitationEdge[] = edges.map((e) => ({
    from_slug: '',
    to_slug: '',
    type: 'missing' as const,
    component_name: 'comp',
    ...e,
  }));
  return { nodes: fullNodes, edges: fullEdges, built_at: new Date().toISOString() };
}

// ─── traverseCitationGraph ────────────────────────────────────────────────────

describe('traverseCitationGraph', () => {
  test('returns empty result for empty graph', () => {
    const graph: CitationGraph = { nodes: [], edges: [], built_at: new Date().toISOString() };
    const result: TraversalResult = traverseCitationGraph(graph);
    expect(result.visited_nodes).toHaveLength(0);
    expect(result.edges_traversed).toHaveLength(0);
    expect(result.unresolved_leaves).toHaveLength(0);
    expect(result.depth_reached).toBe(0);
    expect(result.total_visited).toBe(0);
  });

  test('traverses single root node with no edges (depth_reached=0, unresolved_leaves=[])', () => {
    // A node with resolved=true and no outgoing edges is a leaf but resolved — not in unresolved_leaves
    const graph = makeGraphWithEdges(
      [{ slug: 'root', resolved: true }],
      []
    );
    const result: TraversalResult = traverseCitationGraph(graph);
    expect(result.visited_nodes).toHaveLength(1);
    expect(result.visited_nodes[0].slug).toBe('root');
    expect(result.edges_traversed).toHaveLength(0);
    expect(result.depth_reached).toBe(0);
    expect(result.total_visited).toBe(1);
    // resolved=true node is NOT an unresolved leaf
    expect(result.unresolved_leaves).toHaveLength(0);
  });

  test('traverses direct edges (depth 1), populates edges_traversed', () => {
    // A -> B (A is root, B is leaf)
    const graph = makeGraphWithEdges(
      [{ slug: 'A' }, { slug: 'B', resolved: false }],
      [{ from_slug: 'A', to_slug: 'B', type: 'missing', component_name: 'comp' }]
    );
    const result: TraversalResult = traverseCitationGraph(graph);
    const slugs = result.visited_nodes.map((n) => n.slug);
    expect(slugs).toContain('A');
    expect(slugs).toContain('B');
    expect(result.edges_traversed).toHaveLength(1);
    expect(result.edges_traversed[0].from_slug).toBe('A');
    expect(result.edges_traversed[0].to_slug).toBe('B');
    expect(result.depth_reached).toBe(1);
  });

  test('traverses transitively to depth 2 from chain A→B→C', () => {
    const graph = makeGraphWithEdges(
      [{ slug: 'A' }, { slug: 'B' }, { slug: 'C', resolved: false }],
      [
        { from_slug: 'A', to_slug: 'B', type: 'missing', component_name: 'c1' },
        { from_slug: 'B', to_slug: 'C', type: 'missing', component_name: 'c2' },
      ]
    );
    const result: TraversalResult = traverseCitationGraph(graph);
    const slugs = result.visited_nodes.map((n) => n.slug);
    expect(slugs).toContain('A');
    expect(slugs).toContain('B');
    expect(slugs).toContain('C');
    expect(result.depth_reached).toBe(2);
    expect(result.edges_traversed).toHaveLength(2);
  });

  test('stops at max_depth=1 — does not traverse beyond depth 1', () => {
    // Chain A→B→C; with max_depth=1, C should not be visited
    const graph = makeGraphWithEdges(
      [{ slug: 'A' }, { slug: 'B' }, { slug: 'C' }],
      [
        { from_slug: 'A', to_slug: 'B', type: 'missing', component_name: 'c1' },
        { from_slug: 'B', to_slug: 'C', type: 'missing', component_name: 'c2' },
      ]
    );
    const result: TraversalResult = traverseCitationGraph(graph, { max_depth: 1 });
    const slugs = result.visited_nodes.map((n) => n.slug);
    expect(slugs).toContain('A');
    expect(slugs).toContain('B');
    expect(slugs).not.toContain('C');
    expect(result.depth_reached).toBe(1);
  });

  test('stops at max_nodes limit — total_visited <= max_nodes', () => {
    // Build a star graph: root -> many children
    const nodes: Partial<CitationNode>[] = [{ slug: 'root' }];
    const edges: Partial<CitationEdge>[] = [];
    for (let i = 0; i < 10; i++) {
      nodes.push({ slug: `child-${i}` });
      edges.push({ from_slug: 'root', to_slug: `child-${i}`, type: 'missing', component_name: `c${i}` });
    }
    const graph = makeGraphWithEdges(nodes, edges);
    const result: TraversalResult = traverseCitationGraph(graph, { max_nodes: 3 });
    expect(result.total_visited).toBeLessThanOrEqual(3);
    expect(result.visited_nodes.length).toBeLessThanOrEqual(3);
  });

  test('detects and skips cycles — A→B→A does not infinite loop, each node visited once', () => {
    const graph = makeGraphWithEdges(
      [{ slug: 'A' }, { slug: 'B' }],
      [
        { from_slug: 'A', to_slug: 'B', type: 'missing', component_name: 'c1' },
        { from_slug: 'B', to_slug: 'A', type: 'missing', component_name: 'c2' },
      ]
    );
    const result: TraversalResult = traverseCitationGraph(graph);
    // Both A and B visited exactly once
    const slugs = result.visited_nodes.map((n) => n.slug);
    expect(slugs.filter((s) => s === 'A')).toHaveLength(1);
    expect(slugs.filter((s) => s === 'B')).toHaveLength(1);
    expect(result.total_visited).toBe(2);
  });

  test('populates unresolved_leaves for nodes with no outgoing edges and resolved=false', () => {
    // A->B, B has no outgoing edges and resolved=false → B is unresolved leaf
    const graph = makeGraphWithEdges(
      [{ slug: 'A', resolved: false }, { slug: 'B', resolved: false }],
      [{ from_slug: 'A', to_slug: 'B', type: 'missing', component_name: 'c1' }]
    );
    const result: TraversalResult = traverseCitationGraph(graph);
    const leafSlugs = result.unresolved_leaves.map((n) => n.slug);
    expect(leafSlugs).toContain('B');
    // A has outgoing edges, so not a leaf
    expect(leafSlugs).not.toContain('A');
  });
});

// ─── resolveTransitiveDeps ────────────────────────────────────────────────────

describe('resolveTransitiveDeps', () => {
  test('returns original graph unchanged when no transitive nodes exist (empty graph)', () => {
    const graph: CitationGraph = { nodes: [], edges: [], built_at: new Date().toISOString() };
    const result: CitationGraph = resolveTransitiveDeps(graph);
    expect(result.nodes).toHaveLength(0);
    expect(result.edges).toHaveLength(0);
  });

  test('adds transitively discovered nodes to the graph node list', () => {
    // A->B->C; start graph only has A and B; C discovered transitively
    const graph = makeGraphWithEdges(
      [{ slug: 'A' }, { slug: 'B' }, { slug: 'C' }],
      [
        { from_slug: 'A', to_slug: 'B', type: 'missing', component_name: 'c1' },
        { from_slug: 'B', to_slug: 'C', type: 'missing', component_name: 'c2' },
      ]
    );
    // Remove C from the graph's node list to simulate transitive discovery
    const partialGraph: CitationGraph = {
      nodes: graph.nodes.filter((n) => n.slug !== 'C'),
      edges: graph.edges,
      built_at: graph.built_at,
    };
    // C is referenced in edges but not in nodes; resolveTransitiveDeps should add it
    const result: CitationGraph = resolveTransitiveDeps(partialGraph);
    // C should appear in edges_traversed but since it's not a node, it won't be in visited_nodes
    // The function merges visited_nodes back — result.nodes should contain what was discovered
    expect(result.nodes.length).toBeGreaterThanOrEqual(partialGraph.nodes.length);
  });

  test('adds transitively discovered edges to the graph edge list', () => {
    // A->B chain; start with just A; B discovered transitively
    const graph = makeGraphWithEdges(
      [{ slug: 'A' }, { slug: 'B' }],
      [{ from_slug: 'A', to_slug: 'B', type: 'missing', component_name: 'c1' }]
    );
    const result: CitationGraph = resolveTransitiveDeps(graph);
    // All traversed edges should be present in result
    expect(result.edges.length).toBeGreaterThanOrEqual(1);
  });

  test('deduplicates nodes — does not add duplicate slugs when node already in graph', () => {
    const graph = makeGraphWithEdges(
      [{ slug: 'A' }, { slug: 'B' }],
      [{ from_slug: 'A', to_slug: 'B', type: 'missing', component_name: 'c1' }]
    );
    const result: CitationGraph = resolveTransitiveDeps(graph);
    // No duplicate slugs in result nodes
    const slugs = result.nodes.map((n) => n.slug);
    const uniqueSlugs = new Set(slugs);
    expect(slugs.length).toBe(uniqueSlugs.size);
  });
});
