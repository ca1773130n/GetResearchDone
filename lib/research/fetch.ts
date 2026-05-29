'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { assertFetchableUrl } = require('./url-guard') as { assertFetchableUrl: (u: string) => URL };

export type SourceKind = 'local' | 'arxiv' | 'web' | 'unknown';
export interface DetectedSource { kind: SourceKind; ref: string; }

const ARXIV_BARE = /^\d{4}\.\d{4,5}(v\d+)?$/;

/** Classify an ingest argument. Existing local path wins; then arXiv; then http(s) URL. */
function detectSource(cwd: string, input: string): DetectedSource {
  const s = input.trim();
  if (fs.existsSync(path.resolve(cwd, s))) return { kind: 'local', ref: s };
  if (/^arxiv:/i.test(s)) {
    const id = s.replace(/^arxiv:/i, '');
    if (ARXIV_BARE.test(id)) return { kind: 'arxiv', ref: id };
  }
  if (ARXIV_BARE.test(s)) return { kind: 'arxiv', ref: s };
  if (/^https?:\/\//i.test(s)) {
    let host = '';
    try { host = new URL(s).hostname.toLowerCase(); } catch { return { kind: 'unknown', ref: s }; }
    if (host === 'arxiv.org' || host.endsWith('.arxiv.org')) {
      const m = s.match(/arxiv\.org\/(?:abs|pdf)\/(\d{4}\.\d{4,5}(?:v\d+)?)/i);
      if (m) return { kind: 'arxiv', ref: m[1] };
    }
    return { kind: 'web', ref: s };
  }
  return { kind: 'unknown', ref: s };
}

/** Deterministic, collision-resistant staging slug for a detected source. */
function slugFor(d: DetectedSource): string {
  if (d.kind === 'arxiv') return `arxiv-${d.ref.replace(/[^\w.]/g, '')}`;
  const host = new URL(d.ref).hostname.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 40);
  const h = crypto.createHash('sha1').update(d.ref).digest('hex').slice(0, 8);
  return `web-${host}-${h}`;
}

module.exports = { detectSource, slugFor };
