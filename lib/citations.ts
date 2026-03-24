'use strict';

/**
 * GRD Citation Graph -- Parse PAPERS.md files and build typed citation graphs
 *
 * Satisfies REQ-182 (Citation Graph Data Structures) and REQ-183 (buildCitationGraph).
 *
 * Functions:
 *   - parseMissingComponents: Parse missing_components sections from PAPERS.md content
 *   - parseBorrowedComponents: Parse borrowed_components sections from PAPERS.md content
 *   - buildCitationGraph: Read a directory of .md files and construct a CitationGraph
 *
 * @module citations
 */

import type {
  CitationNode,
  CitationEdge,
  CitationGraph,
  MissingComponent,
  BorrowedComponent,
} from './types';

const fs = require('fs') as typeof import('fs');
const path = require('path') as typeof import('path');

// --- Helpers ------------------------------------------------------------------

/**
 * Extract the content of a named section from markdown.
 * Returns the text after `## Section Name` until the next `##` heading or end of file.
 */
function extractSection(content: string, sectionName: string): string {
  const pattern = new RegExp(
    `##\\s+${sectionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^\\n]*\\n([\\s\\S]*?)(?=\\n##\\s|$)`,
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
 * Returns empty array if no section found or no entries parsed.
 *
 * @param content - Raw markdown content of a PAPERS.md file
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

  // List format: - **Name**: description (source: paper, code: yes/no)
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
 *   List:  - **Name**: description (source: paper, code: yes/no)
 *
 * The code field is ignored for borrowed components.
 * Returns empty array if no section found or no entries parsed.
 *
 * @param content - Raw markdown content of a PAPERS.md file
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

  // List format: - **Name**: description (source: paper, code: yes/no)
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
 *
 * Priority escalation: MissingComponent with code_available=false => priority='critical'
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
   */
  function ensureNode(slug: string, priority: 'critical' | 'normal' = 'normal'): void {
    if (!nodeMap.has(slug)) {
      nodeMap.set(slug, {
        slug,
        title: slug,
        resolved: false,
        priority,
        technique_summary: '',
        source: 'unknown',
      });
    } else if (priority === 'critical') {
      const existing = nodeMap.get(slug)!;
      existing.priority = 'critical';
    }
  }

  for (const file of files) {
    const slug = path.basename(file, '.md');
    ensureNode(slug, 'normal');

    const filePath = path.join(papersDir, file);
    let content: string;
    try {
      content = fs.readFileSync(filePath, 'utf-8') as string;
    } catch {
      continue;
    }

    const missing = parseMissingComponents(content);
    const borrowed = parseBorrowedComponents(content);

    for (const component of missing) {
      const depSlug = component.source_paper;
      const depPriority: 'critical' | 'normal' = component.code_available ? 'normal' : 'critical';
      ensureNode(depSlug, depPriority);
      edges.push({ from: slug, to: depSlug, relation: 'missing_component' });
    }

    for (const component of borrowed) {
      const depSlug = component.source_paper;
      ensureNode(depSlug, 'normal');
      edges.push({ from: slug, to: depSlug, relation: 'borrowed_component' });
    }
  }

  return {
    nodes: Array.from(nodeMap.values()),
    edges,
    built_at,
  };
}

// --- Exports -----------------------------------------------------------------

module.exports = {
  parseMissingComponents,
  parseBorrowedComponents,
  buildCitationGraph,
};
