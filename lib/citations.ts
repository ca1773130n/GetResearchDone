'use strict';

/**
 * GRD Citation Graph -- Parse PAPERS.md files and build typed citation graphs
 *
 * Satisfies REQ-182 (Citation Graph Data Structures), REQ-183 (buildCitationGraph),
 * REQ-184 (Citation Recovery), and REQ-185 (Citation Recovery Tests).
 *
 * Functions:
 *   - parseMissingComponents: Parse missing_components sections from PAPERS.md content
 *   - parseBorrowedComponents: Parse borrowed_components sections from PAPERS.md content
 *   - buildCitationGraph: Read a directory of .md files, construct a CitationGraph,
 *                         and write per-paper JSON to citations/{slug}.json
 *   - resolveCitations: Fetch paper metadata from arXiv/Semantic Scholar APIs
 *   - findUnresolved: Return unresolved CitationNodes, optionally filtered by priority
 *
 * @module citations
 */

import type {
  CitationNode,
  CitationEdge,
  CitationGraph,
  MissingComponent,
  BorrowedComponent,
  ApiConfig,
  TraversalOptions,
  TraversalResult,
} from './types';

const fs = require('fs') as typeof import('fs');
const path = require('path') as typeof import('path');
const { safeReadFile } = require('./utils') as { safeReadFile: (p: string) => string | null };

// --- Helpers ------------------------------------------------------------------

/**
 * Extract the content of a named section from markdown.
 * Returns the text after `## Section Name` until the next `##` heading or end of file.
 * The sectionName may be a regex pattern (e.g., 'missing.?components').
 */
function extractSection(content: string, sectionName: string): string {
  const pattern = new RegExp(
    `(?:^|\\n)#{2,3}\\s+${sectionName}[^\\n]*\\n([\\s\\S]*?)(?=\\n#{2,3}\\s|$)`,
    'i'
  );
  const match = content.match(pattern);
  return match ? match[1].trim() : '';
}

/**
 * Parse a yes/no/true/false string into a boolean.
 */
function parseBool(value: string): boolean {
  const lower = value.trim().toLowerCase();
  return lower === 'yes' || lower === 'true';
}

// --- parseMissingComponents ---------------------------------------------------

/**
 * Parse missing_components section from PAPERS.md content.
 *
 * Supports two formats:
 *   Table: | Name | Source Paper | Description | Code Available |
 *   List:  - **Name**: description (source: paper, code: yes/no)
 *
 * Also supports the plan-specified structured list format:
 *   - **name:** ComponentName
 *     - source_paper: paper-slug-or-title
 *     - description: What the component does
 *     - code_available: true|false
 *
 * Returns empty array if no section found or no entries parsed.
 *
 * @param content - Raw markdown content of a PAPERS.md entry
 * @returns Array of MissingComponent objects
 */
function parseMissingComponents(content: string): MissingComponent[] {
  const section = extractSection(content, 'missing.?components');
  if (!section) return [];

  const results: MissingComponent[] = [];

  // Table format: | Name | Source Paper | Description | Code Available |
  // Skip header row and separator row (contains ---)
  const tableRowPattern = /^\|([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|/gm;
  let tableMatch: RegExpExecArray | null;
  let hasTableRows = false;
  while ((tableMatch = tableRowPattern.exec(section)) !== null) {
    const name = tableMatch[1].trim();
    const sourcePaper = tableMatch[2].trim();
    const description = tableMatch[3].trim();
    const codeAvailableStr = tableMatch[4].trim();
    // Skip header/separator rows
    if (name.toLowerCase() === 'name' || /^[-\s]+$/.test(name)) continue;
    hasTableRows = true;
    results.push({
      name,
      source_paper: sourcePaper,
      description,
      code_available: parseBool(codeAvailableStr),
    });
  }

  if (hasTableRows) return results;

  // Structured list format:
  //   - **name:** ComponentName
  //     - source_paper: paper-slug
  //     - description: text
  //     - code_available: true/false
  const structuredBlockPattern =
    /^-\s+\*\*name:\*\*\s+(.+)\n(?:\s+-\s+source_paper:\s+(.+)\n)?(?:\s+-\s+description:\s+(.+)\n)?(?:\s+-\s+code_available:\s+(.+))?/gim;
  let structuredMatch: RegExpExecArray | null;
  let hasStructured = false;
  while ((structuredMatch = structuredBlockPattern.exec(section)) !== null) {
    hasStructured = true;
    results.push({
      name: structuredMatch[1].trim(),
      source_paper: structuredMatch[2] ? structuredMatch[2].trim() : '',
      description: structuredMatch[3] ? structuredMatch[3].trim() : '',
      code_available: structuredMatch[4] ? parseBool(structuredMatch[4]) : false,
    });
  }

  if (hasStructured) return results;

  // Inline list format: - **Name**: description (source: paper, code: yes/no)
  const listPattern =
    /^-\s+\*\*([^*]+)\*\*\s*:\s*([^(]+)\(source:\s*([^,]+),\s*code:\s*([^)]+)\)/gm;
  let listMatch: RegExpExecArray | null;
  while ((listMatch = listPattern.exec(section)) !== null) {
    results.push({
      name: listMatch[1].trim(),
      source_paper: listMatch[3].trim(),
      description: listMatch[2].trim(),
      code_available: parseBool(listMatch[4]),
    });
  }

  return results;
}

// --- parseBorrowedComponents --------------------------------------------------

/**
 * Parse borrowed_components section from PAPERS.md content.
 *
 * Supports two formats:
 *   Table: | Name | Source Paper | Description |
 *   List:  - **Name**: description (source: paper)
 *
 * The code_available field is not relevant for borrowed components.
 * Returns empty array if no section found or no entries parsed.
 *
 * @param content - Raw markdown content of a PAPERS.md entry
 * @returns Array of BorrowedComponent objects
 */
function parseBorrowedComponents(content: string): BorrowedComponent[] {
  const section = extractSection(content, 'borrowed.?components');
  if (!section) return [];

  const results: BorrowedComponent[] = [];

  // Table format: | Name | Source Paper | Description |
  const tableRowPattern = /^\|([^|]+)\|([^|]+)\|([^|]+)\|/gm;
  let tableMatch: RegExpExecArray | null;
  let hasTableRows = false;
  while ((tableMatch = tableRowPattern.exec(section)) !== null) {
    const name = tableMatch[1].trim();
    const sourcePaper = tableMatch[2].trim();
    const description = tableMatch[3].trim();
    if (name.toLowerCase() === 'name' || /^[-\s]+$/.test(name)) continue;
    hasTableRows = true;
    results.push({ name, source_paper: sourcePaper, description });
  }

  if (hasTableRows) return results;

  // Structured list format:
  //   - **name:** ComponentName
  //     - source_paper: paper-slug
  //     - description: text
  const structuredBlockPattern =
    /^-\s+\*\*name:\*\*\s+(.+)\n(?:\s+-\s+source_paper:\s+(.+)\n)?(?:\s+-\s+description:\s+(.+))?/gim;
  let structuredMatch: RegExpExecArray | null;
  let hasStructured = false;
  while ((structuredMatch = structuredBlockPattern.exec(section)) !== null) {
    hasStructured = true;
    results.push({
      name: structuredMatch[1].trim(),
      source_paper: structuredMatch[2] ? structuredMatch[2].trim() : '',
      description: structuredMatch[3] ? structuredMatch[3].trim() : '',
    });
  }

  if (hasStructured) return results;

  // Inline list format: - **Name**: description (source: paper)
  const listPattern =
    /^-\s+\*\*([^*]+)\*\*\s*:\s*([^(]+)\(source:\s*([^,)]+)[^)]*\)/gm;
  let listMatch: RegExpExecArray | null;
  while ((listMatch = listPattern.exec(section)) !== null) {
    results.push({
      name: listMatch[1].trim(),
      source_paper: listMatch[3].trim(),
      description: listMatch[2].trim(),
    });
  }

  return results;
}

// --- buildCitationGraph -------------------------------------------------------

/**
 * Read all .md files in papersDir and build a typed CitationGraph.
 *
 * For each file:
 *   - Extracts the paper slug from the filename (without .md extension)
 *   - Parses missing_components and borrowed_components sections
 *   - Creates CitationNode entries for the paper itself and all referenced papers
 *   - Creates CitationEdge entries for each dependency relationship
 *   - Writes per-paper JSON to {papersDir}/../citations/{paper-slug}.json
 *
 * Priority escalation: MissingComponent with code_available=false => dep node priority='critical'
 * All nodes start with resolved=false.
 * Returns a graph with empty arrays when the directory is empty or missing.
 *
 * @param papersDir - Absolute or relative path to directory containing .md files
 * @returns CitationGraph with nodes, edges, and built_at ISO timestamp
 */
function buildCitationGraph(papersDir: string): CitationGraph {
  const built_at = new Date().toISOString();

  // Handle missing or non-directory paths gracefully
  if (!fs.existsSync(papersDir)) {
    return { nodes: [], edges: [], built_at };
  }

  let files: string[];
  try {
    const entries = fs.readdirSync(papersDir) as string[];
    files = entries.filter((f: string) => f.endsWith('.md'));
  } catch {
    return { nodes: [], edges: [], built_at };
  }

  if (files.length === 0) {
    return { nodes: [], edges: [], built_at };
  }

  // Track nodes by slug to avoid duplicates; edges are collected in order
  const nodeMap = new Map<string, CitationNode>();
  const edges: CitationEdge[] = [];

  /**
   * Ensure a node exists for slug. Escalates priority to 'critical' if needed.
   * Merges component arrays for the primary paper node.
   */
  function ensureNode(
    slug: string,
    priority: 'critical' | 'normal' | 'low' = 'normal',
    missing: MissingComponent[] = [],
    borrowed: BorrowedComponent[] = []
  ): void {
    if (!nodeMap.has(slug)) {
      nodeMap.set(slug, {
        slug,
        title: slug,
        resolved: false,
        priority,
        technique_summary: '',
        missing_components: missing,
        borrowed_components: borrowed,
      });
    } else {
      const existing = nodeMap.get(slug)!;
      if (priority === 'critical') {
        existing.priority = 'critical';
      }
      // Merge component arrays when the primary paper node is registered
      if (missing.length > 0) existing.missing_components = missing;
      if (borrowed.length > 0) existing.borrowed_components = borrowed;
    }
  }

  for (const file of files) {
    const slug = path.basename(file, '.md');
    const filePath = path.join(papersDir, file);

    // Use safeReadFile for reading; fall back to empty string on null
    const raw = safeReadFile(filePath);
    const content: string = raw !== null ? raw : '';

    const missing = parseMissingComponents(content);
    const borrowed = parseBorrowedComponents(content);

    ensureNode(slug, 'normal', missing, borrowed);

    for (const component of missing) {
      const depSlug = component.source_paper;
      const depPriority: 'critical' | 'normal' = component.code_available ? 'normal' : 'critical';
      ensureNode(depSlug, depPriority);
      edges.push({
        from_slug: slug,
        to_slug: depSlug,
        type: 'missing',
        component_name: component.name,
      });
    }

    for (const component of borrowed) {
      const depSlug = component.source_paper;
      ensureNode(depSlug, 'normal');
      edges.push({
        from_slug: slug,
        to_slug: depSlug,
        type: 'borrowed',
        component_name: component.name,
      });
    }
  }

  const graph: CitationGraph = {
    nodes: Array.from(nodeMap.values()),
    edges,
    built_at,
  };

  // Write per-paper JSON to {papersDir}/../citations/{paper-slug}.json
  const citationsDir = path.join(papersDir, '..', 'citations');
  try {
    fs.mkdirSync(citationsDir, { recursive: true });
    for (const node of graph.nodes) {
      const jsonPath = path.join(citationsDir, `${node.slug}.json`);
      fs.writeFileSync(jsonPath, JSON.stringify(node, null, 2), 'utf-8');
    }
  } catch {
    // Non-fatal: if we cannot write JSON, still return the complete graph
  }

  return graph;
}

// --- resolveCitations ---------------------------------------------------------

/**
 * Default fetch function using Node's built-in https module.
 * Returns the response body as a string, or null on any error.
 */
function defaultFetchFn(url: string, _timeoutMs: number): Promise<string | null> {
  return new Promise((resolve) => {
    const https = require('https') as typeof import('https');
    const http = require('http') as typeof import('http');
    const parsed = new URL(url);
    const transport = parsed.protocol === 'https:' ? https : http;

    try {
      const req = transport.get(url, (res) => {
        if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
          resolve(null);
          return;
        }
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
        res.on('error', () => resolve(null));
      });
      req.on('error', () => resolve(null));
      req.setTimeout(_timeoutMs, () => {
        req.destroy();
        resolve(null);
      });
    } catch {
      resolve(null);
    }
  });
}

/**
 * Extract a text summary from an arXiv Atom XML response.
 * Returns the first 200 chars of the summary element, or null.
 */
function extractArxivSummary(xml: string): string | null {
  const match = xml.match(/<summary[^>]*>([\s\S]*?)<\/summary>/i);
  if (!match) return null;
  const text = match[1].replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, 200) : null;
}

/**
 * Extract a text abstract from a Semantic Scholar JSON response.
 * Returns the first 200 chars of the abstract field, or null.
 */
function extractSemanticAbstract(json: string): string | null {
  try {
    const data = JSON.parse(json) as Record<string, unknown>;
    // Response is { data: [ { title, abstract, ... } ] }
    const dataArr = Array.isArray(data.data) ? (data.data as Record<string, unknown>[]) : null;
    if (dataArr && dataArr.length > 0) {
      const abstract = dataArr[0].abstract;
      if (typeof abstract === 'string' && abstract.trim()) {
        return abstract.slice(0, 200);
      }
    }
  } catch {
    // not valid JSON
  }
  return null;
}

/**
 * Iterate over unresolved CitationNodes and attempt to fetch metadata from
 * arXiv and/or Semantic Scholar APIs.
 *
 * Accepts an optional fetchFn for dependency injection (enables mocking in tests).
 * The default fetchFn uses Node's built-in https.get.
 *
 * @param graph - The CitationGraph to update (mutated in place)
 * @param apiConfig - Controls which APIs are queried and timeout behaviour
 * @param fetchFn - Optional injectable fetch function for testing
 * @returns The updated CitationGraph (same reference as input)
 */
async function resolveCitations(
  graph: CitationGraph,
  apiConfig: ApiConfig,
  fetchFn?: (url: string, timeoutMs: number) => Promise<string | null>
): Promise<CitationGraph> {
  const fetch = fetchFn ?? defaultFetchFn;
  const timeoutMs = apiConfig.timeout_ms ?? 5000;

  for (const node of graph.nodes) {
    if (node.resolved) continue;

    const titleEncoded = encodeURIComponent(node.title);
    let summary: string | null = null;

    if (apiConfig.arxiv_enabled) {
      const arxivUrl = `https://export.arxiv.org/api/query?search_query=ti:${titleEncoded}&max_results=1`;
      try {
        const body = await fetch(arxivUrl, timeoutMs);
        if (body) {
          summary = extractArxivSummary(body);
        }
      } catch {
        // non-fatal
      }
    }

    if (!summary && apiConfig.semantic_scholar_enabled) {
      const ssUrl = `https://api.semanticscholar.org/graph/v1/paper/search?query=${titleEncoded}&limit=1`;
      try {
        const body = await fetch(ssUrl, timeoutMs);
        if (body) {
          summary = extractSemanticAbstract(body);
        }
      } catch {
        // non-fatal
      }
    }

    if (summary !== null) {
      node.resolved = true;
      node.technique_summary = summary;
    }
  }

  return graph;
}

// --- findUnresolved -----------------------------------------------------------

/**
 * Return all unresolved CitationNodes in the graph.
 * If priority is provided, only nodes with that priority are returned.
 *
 * @param graph - The CitationGraph to search
 * @param priority - Optional priority filter ('critical' | 'normal' | 'low')
 * @returns Array of CitationNode objects where resolved is false
 */
function findUnresolved(
  graph: CitationGraph,
  priority?: 'critical' | 'normal' | 'low'
): CitationNode[] {
  return graph.nodes.filter((node) => {
    if (node.resolved) return false;
    if (priority !== undefined) return node.priority === priority;
    return true;
  });
}

// --- traverseCitationGraph ---------------------------------------------------

/**
 * Perform BFS traversal of the citation graph from all root nodes (nodes with
 * no incoming edges), respecting depth and node-count limits.
 *
 * Cycle detection: tracks visited slugs in a Set; any slug already visited is
 * skipped, preventing infinite loops on circular citation chains.
 *
 * Limits:
 *   - max_depth: BFS depth from root nodes. Nodes at this depth are visited but
 *     their children are not enqueued.
 *   - max_nodes: Total node visit cap. Processing halts once total_visited
 *     reaches this limit.
 *
 * Unresolved leaves: A node with no outgoing edges in the adjacency map and
 * resolved=false is added to unresolved_leaves.
 *
 * @param graph - The CitationGraph to traverse
 * @param options - Optional partial TraversalOptions (merged with defaults)
 * @returns TraversalResult with visited nodes, traversed edges, and statistics
 */
function traverseCitationGraph(
  graph: CitationGraph,
  options?: Partial<TraversalOptions>
): TraversalResult {
  const opts: Required<Omit<TraversalOptions, 'fetchFn'>> = {
    max_depth: options?.max_depth ?? 3,
    max_nodes: options?.max_nodes ?? 50,
  };

  const emptyResult: TraversalResult = {
    visited_nodes: [],
    edges_traversed: [],
    unresolved_leaves: [],
    depth_reached: 0,
    total_visited: 0,
  };

  if (graph.nodes.length === 0) {
    return emptyResult;
  }

  // Build adjacency map: slug → outgoing edges
  const adjacency = new Map<string, CitationEdge[]>();
  for (const edge of graph.edges) {
    if (!adjacency.has(edge.from_slug)) {
      adjacency.set(edge.from_slug, []);
    }
    adjacency.get(edge.from_slug)!.push(edge);
  }

  // Build node lookup map: slug → CitationNode
  const nodeMap = new Map<string, CitationNode>();
  for (const node of graph.nodes) {
    nodeMap.set(node.slug, node);
  }

  // Find root nodes: nodes that appear as from_slug but never as to_slug
  // (i.e., have no incoming edges). If all nodes have incoming edges (e.g., cycle),
  // treat all nodes as roots to avoid empty traversal.
  const hasIncoming = new Set<string>();
  for (const edge of graph.edges) {
    hasIncoming.add(edge.to_slug);
  }
  const rootNodes = graph.nodes.filter((n) => !hasIncoming.has(n.slug));
  const seeds = rootNodes.length > 0 ? rootNodes : graph.nodes;

  // BFS
  const visited = new Set<string>();
  const visitedNodes: CitationNode[] = [];
  const edgesTraversed: CitationEdge[] = [];
  const unresolvedLeaves: CitationNode[] = [];
  let depthReached = 0;
  let totalVisited = 0;

  interface QueueEntry {
    node: CitationNode;
    depth: number;
  }

  const queue: QueueEntry[] = [];
  for (const seed of seeds) {
    if (!visited.has(seed.slug)) {
      visited.add(seed.slug);
      queue.push({ node: seed, depth: 0 });
    }
  }

  let qi = 0;
  while (qi < queue.length) {
    if (totalVisited >= opts.max_nodes) break;

    const { node, depth } = queue[qi++];

    visitedNodes.push(node);
    totalVisited++;
    if (depth > depthReached) depthReached = depth;

    if (totalVisited >= opts.max_nodes) break;

    const outgoing = adjacency.get(node.slug) ?? [];

    // Check if leaf (no outgoing edges)
    if (outgoing.length === 0 && !node.resolved) {
      unresolvedLeaves.push(node);
    }

    // If at max depth, do not enqueue children
    if (depth >= opts.max_depth) continue;

    for (const edge of outgoing) {
      const targetNode = nodeMap.get(edge.to_slug);
      if (!targetNode) continue;
      if (visited.has(edge.to_slug)) continue;
      if (totalVisited + (queue.length - qi) >= opts.max_nodes) {
        // Approximate cap: stop enqueuing if we're near the limit
        // (exact cap enforced at dequeue time above)
      }
      visited.add(edge.to_slug);
      edgesTraversed.push(edge);
      queue.push({ node: targetNode, depth: depth + 1 });
    }
  }

  return {
    visited_nodes: visitedNodes,
    edges_traversed: edgesTraversed,
    unresolved_leaves: unresolvedLeaves,
    depth_reached: depthReached,
    total_visited: totalVisited,
  };
}

// --- resolveTransitiveDeps ---------------------------------------------------

/**
 * Expand a CitationGraph by performing BFS traversal and merging all
 * transitively discovered nodes and edges into the graph.
 *
 * Deduplication:
 *   - Nodes: only added if their slug is not already in graph.nodes
 *   - Edges: only added if not already present (keyed by from_slug + to_slug + component_name)
 *
 * Returns a new CitationGraph (does not mutate the input).
 *
 * @param graph - The CitationGraph to expand
 * @param options - Optional partial TraversalOptions passed to traverseCitationGraph
 * @returns A new CitationGraph with merged transitive nodes and edges
 */
function resolveTransitiveDeps(
  graph: CitationGraph,
  options?: Partial<TraversalOptions>
): CitationGraph {
  const result = traverseCitationGraph(graph, options);

  // Build set of existing node slugs
  const existingSlugs = new Set(graph.nodes.map((n) => n.slug));

  // Merge new nodes (not already in graph)
  const newNodes = result.visited_nodes.filter((n) => !existingSlugs.has(n.slug));
  const mergedNodes = [...graph.nodes, ...newNodes];

  // Build set of existing edge keys for deduplication
  const edgeKey = (e: CitationEdge): string =>
    `${e.from_slug}::${e.to_slug}::${e.component_name}`;
  const existingEdgeKeys = new Set(graph.edges.map(edgeKey));

  // Merge new edges
  const newEdges = result.edges_traversed.filter((e) => !existingEdgeKeys.has(edgeKey(e)));
  const mergedEdges = [...graph.edges, ...newEdges];

  return {
    nodes: mergedNodes,
    edges: mergedEdges,
    built_at: new Date().toISOString(),
  };
}

// --- fetchExternalPaper -------------------------------------------------------

/**
 * Attempt to auto-retrieve metadata for a single paper slug from external APIs.
 *
 * Uses arXiv-first, Semantic Scholar-fallback strategy (same as resolveCitations),
 * but operates on a single slug rather than iterating over a graph.
 *
 * Accepts an optional fetchFn for dependency injection (enables mocking in tests).
 * The default fetchFn uses Node's built-in https.get with a 5-second timeout.
 *
 * On success: returns a CitationNode with resolved=true and technique_summary populated.
 * On failure (both APIs return null): writes a warning to stderr and returns null.
 * Any thrown error is caught and returns null.
 *
 * @param slug - Paper slug to look up (used as query title)
 * @param fetchFn - Optional injectable fetch function for testing
 * @returns CitationNode with resolved=true on success, null on failure
 */
async function fetchExternalPaper(
  slug: string,
  fetchFn?: (url: string, timeoutMs: number) => Promise<string | null>
): Promise<CitationNode | null> {
  const fetch = fetchFn ?? defaultFetchFn;
  const timeoutMs = 5000;

  try {
    const slugEncoded = encodeURIComponent(slug);
    let summary: string | null = null;

    // arXiv-first: search by title
    const arxivUrl = `https://export.arxiv.org/api/query?search_query=ti:${slugEncoded}&max_results=1`;
    try {
      const body = await fetch(arxivUrl, timeoutMs);
      if (body) {
        summary = extractArxivSummary(body);
      }
    } catch {
      // non-fatal
    }

    // Semantic Scholar fallback: only if arXiv returned no summary
    if (summary === null) {
      const ssUrl = `https://api.semanticscholar.org/graph/v1/paper/search?query=${slugEncoded}&limit=1`;
      try {
        const body = await fetch(ssUrl, timeoutMs);
        if (body) {
          summary = extractSemanticAbstract(body);
        }
      } catch {
        // non-fatal
      }
    }

    if (summary !== null) {
      return {
        slug,
        title: slug,
        resolved: true,
        priority: 'normal',
        technique_summary: summary,
        missing_components: [],
        borrowed_components: [],
      };
    }

    // Both APIs failed — warn and return null
    process.stderr.write(
      `[grd] WARNING: fetchExternalPaper: could not resolve "${slug}" from arXiv or Semantic Scholar\n`
    );
    return null;
  } catch {
    return null;
  }
}

// --- Exports -----------------------------------------------------------------

module.exports = {
  parseMissingComponents,
  parseBorrowedComponents,
  buildCitationGraph,
  resolveCitations,
  findUnresolved,
  traverseCitationGraph,
  resolveTransitiveDeps,
  fetchExternalPaper,
};
