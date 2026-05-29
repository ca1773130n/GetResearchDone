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

export interface FetchResponse {
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}
export type Fetcher = (url: string, init: { redirect: 'manual'; signal: AbortSignal }) => Promise<FetchResponse>;

interface HttpOpts { fetcher?: Fetcher; maxBytes?: number; timeoutMs?: number; maxRedirects?: number; }

/** GET a URL with manual redirect handling; every hop passes the SSRF guard. */
async function httpGet(url: string, opts: HttpOpts = {}): Promise<{ body: string; finalUrl: string; etag: string | null }> {
  const fetcher: Fetcher = opts.fetcher || ((globalThis as { fetch?: Fetcher }).fetch as Fetcher);
  const maxBytes = opts.maxBytes ?? 5_000_000;
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const maxRedirects = opts.maxRedirects ?? 5;
  let current = assertFetchableUrl(url).toString();

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let resp: FetchResponse;
    try {
      resp = await fetcher(current, { redirect: 'manual', signal: ctrl.signal });
    } catch (e) {
      throw new Error(`request failed: ${(e as Error).message}`);
    } finally {
      clearTimeout(timer);
    }
    if (resp.status >= 300 && resp.status < 400) {
      const loc = resp.headers.get('location');
      if (!loc) throw new Error(`redirect (${resp.status}) with no Location header`);
      current = assertFetchableUrl(new URL(loc, current).toString()).toString();
      continue;
    }
    if (resp.status < 200 || resp.status >= 300) throw new Error(`HTTP ${resp.status}`);
    const cl = resp.headers.get('content-length');
    if (cl && Number(cl) > maxBytes) throw new Error(`response too large (${cl} bytes > ${maxBytes})`);
    const body = await resp.text();
    if (body.length > maxBytes) throw new Error(`response too large (> ${maxBytes} bytes)`);
    return { body, finalUrl: current, etag: resp.headers.get('etag') };
  }
  throw new Error(`too many redirects (> ${maxRedirects})`);
}

module.exports = { detectSource, slugFor, httpGet };
