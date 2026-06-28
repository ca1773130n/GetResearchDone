'use strict';
import type { PaperBundle } from './paper';

/**
 * Off-control-path, deterministic citation verifier (Gap 7). No LLM, no network.
 * Extracts bracketed inline citations from a paper's markdown and resolves each
 * against the deterministically-assembled bundle (relatedWork + optional KG node
 * ids). Returns advisory metadata flagging unresolved / likely-fabricated cites.
 * This is REPORT-ONLY — callers must never let it block or alter the paper.
 */

/** Bundle accepted for verification: paper.ts's PaperBundle, optionally carrying KG node ids. */
export type CitationBundle = PaperBundle & { kgNodeIds?: readonly string[] };

export interface CitationReport {
  total: number;
  resolved: number;
  unresolved: string[];
}

/** Lowercase + collapse non-alphanumerics to single spaces, so "Smith et al., 2024" === "smith et al 2024". */
function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// Extract bracketed inline citations like [Name] / [Smith 2024], skipping markdown links [text](url).
// ponytail: only the bracketed-citation form is parsed — no (Author, Year), numeric [1], or footnote styles,
// and multi-ref brackets ([A; B]) are treated as a single citation token.
function extractCitations(md: string): string[] {
  const out: string[] = [];
  const re = /\[([^\]\n]+)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md)) !== null) {
    if (md[re.lastIndex] === '(') continue; // markdown link [text](url), not a citation
    const inner = m[1].trim();
    if (inner) out.push(inner);
  }
  return out;
}

function isResolved(norm: string, known: ReadonlySet<string>): boolean {
  if (known.has(norm)) return true;
  for (const k of known) {
    if (k.length >= 3 && norm.includes(k)) return true;
    if (norm.length >= 3 && k.includes(norm)) return true;
  }
  return false;
}

export function verifyCitations(paperMd: string, bundle: CitationBundle): CitationReport {
  const known = new Set<string>();
  for (const r of bundle.relatedWork || []) {
    if (r.name) known.add(normalize(r.name));
    if (r.source_path) {
      known.add(normalize(r.source_path));
      const base = r.source_path.split('/').pop();
      if (base) known.add(normalize(base));
    }
  }
  for (const id of bundle.kgNodeIds || []) {
    if (id) known.add(normalize(id));
  }
  known.delete('');

  const seen = new Set<string>();
  const unresolved: string[] = [];
  let total = 0;
  let resolved = 0;
  for (const cite of extractCitations(paperMd)) {
    const norm = normalize(cite);
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);
    total++;
    if (isResolved(norm, known)) resolved++;
    else unresolved.push(cite);
  }
  return { total, resolved, unresolved };
}

module.exports = { verifyCitations };
