'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { assertFetchableUrl } = require('./url-guard') as { assertFetchableUrl: (u: string) => URL };
const { pdfToMarkdown: defaultPdfToMarkdown } = require('./pdf') as {
  pdfToMarkdown: (bytes: Uint8Array, opts?: Record<string, unknown>) => Promise<string>;
};
const { sessionJsonlToMarkdown } = require('./session') as {
  sessionJsonlToMarkdown: (text: string) => string;
};

export type SourceKind = 'local' | 'arxiv' | 'web' | 'pdf' | 'session' | 'unknown';
export interface DetectedSource { kind: SourceKind; ref: string; }

const ARXIV_BARE = /^\d{4}\.\d{4,5}(v\d+)?$/;

/** Extract a bare arXiv id from an `arxiv:`/bare/`arxiv.org/abs|pdf` form, else null. */
function arxivIdFrom(s: string): string | null {
  if (/^arxiv:/i.test(s)) { const id = s.replace(/^arxiv:/i, ''); return ARXIV_BARE.test(id) ? id : null; }
  if (ARXIV_BARE.test(s)) return s;
  if (/^https?:\/\//i.test(s)) {
    try {
      const u = new URL(s);
      if (u.hostname === 'arxiv.org' || u.hostname.endsWith('.arxiv.org')) {
        const m = s.match(/arxiv\.org\/(?:abs|pdf)\/(\d{4}\.\d{4,5}(?:v\d+)?)/i);
        return m ? m[1] : null;
      }
    } catch { return null; }
  }
  return null;
}

/**
 * Classify an ingest argument. Suffix-based pdf/session checks run BEFORE the existing-local-path
 * check (an existing .pdf would otherwise be 'local' and ingest() — which only collects .md —
 * would silently ignore it). `pdfBody` (the --pdf flag) forces arXiv inputs to the PDF body path.
 */
function detectSource(cwd: string, input: string, opts: { pdfBody?: boolean } = {}): DetectedSource {
  const s = input.trim();
  const isUrl = /^https?:\/\//i.test(s);
  const arxiv = arxivIdFrom(s);
  // 1. --pdf on an arXiv id/URL → pdf body
  if (opts.pdfBody && arxiv) return { kind: 'pdf', ref: arxiv };
  // 2. local .pdf suffix
  if (!isUrl && /\.pdf$/i.test(s)) return { kind: 'pdf', ref: s };
  // 3. remote non-arXiv .pdf URL
  if (isUrl && !arxiv) {
    let u: URL;
    try { u = new URL(s); } catch { return { kind: 'unknown', ref: s }; }
    if (/\.pdf$/i.test(u.pathname)) return { kind: 'pdf', ref: s };
  }
  // 4. local .jsonl suffix
  if (!isUrl && /\.jsonl$/i.test(s)) return { kind: 'session', ref: s };
  // 5. existing local path (.md files, directories)
  if (fs.existsSync(path.resolve(cwd, s))) return { kind: 'local', ref: s };
  // 6. arXiv metadata (no --pdf)
  if (arxiv) return { kind: 'arxiv', ref: arxiv };
  // 7. other http(s) URL → web
  if (isUrl) {
    try { new URL(s); } catch { return { kind: 'unknown', ref: s }; }
    return { kind: 'web', ref: s };
  }
  // 8. path-like local (typo'd .md / directory): let ingest() report a clear not-found error
  if (/\.md$/i.test(s) || s.includes('/') || s.includes('\\')) return { kind: 'local', ref: s };
  return { kind: 'unknown', ref: s };
}

/** Deterministic, collision-resistant staging slug for a detected source. */
function slugFor(d: DetectedSource): string {
  if (d.kind === 'arxiv') return `arxiv-${d.ref.replace(/[^\w.]/g, '')}`;
  if (d.kind === 'pdf') {
    if (ARXIV_BARE.test(d.ref)) return `arxiv-pdf-${d.ref.replace(/[^\w.]/g, '')}`;
    const base = path.basename(d.ref.split('?')[0]).replace(/\.pdf$/i, '')
      .replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 40) || 'doc';
    return `pdf-${base}-${crypto.createHash('sha1').update(d.ref).digest('hex').slice(0, 8)}`;
  }
  if (d.kind === 'session') {
    const base = path.basename(d.ref).replace(/\.jsonl$/i, '')
      .replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 40) || 'session';
    return `session-${base}-${crypto.createHash('sha1').update(d.ref).digest('hex').slice(0, 8)}`;
  }
  const host = new URL(d.ref).hostname.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 40);
  const h = crypto.createHash('sha1').update(d.ref).digest('hex').slice(0, 8);
  return `web-${host}-${h}`;
}

export interface FetchResponse {
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
  arrayBuffer?(): Promise<ArrayBuffer>;
}
export type Fetcher = (url: string, init: { redirect: 'manual'; signal: AbortSignal }) => Promise<FetchResponse>;

interface HttpOpts { fetcher?: Fetcher; maxBytes?: number; timeoutMs?: number; maxRedirects?: number; }

/** Resolve a URL through manual redirects (each hop SSRF-guarded) to a 2xx response. */
async function httpResolve(url: string, opts: HttpOpts = {}): Promise<{ resp: FetchResponse; finalUrl: string; maxBytes: number }> {
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
      throw new Error(`request failed: ${(e as Error).message}`, { cause: e });
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
    return { resp, finalUrl: current, maxBytes };
  }
  throw new Error(`too many redirects (> ${maxRedirects})`);
}

/** GET text (≤5 MB default); manual redirect, every hop SSRF-guarded. */
async function httpGet(url: string, opts: HttpOpts = {}): Promise<{ body: string; finalUrl: string; etag: string | null }> {
  const { resp, finalUrl, maxBytes } = await httpResolve(url, opts);
  const body = await resp.text();
  if (body.length > maxBytes) throw new Error(`response too large (> ${maxBytes} bytes)`);
  return { body, finalUrl, etag: resp.headers.get('etag') };
}

/** GET binary bytes (≤25 MB default — for PDFs); manual redirect, every hop SSRF-guarded. */
async function httpGetBytes(url: string, opts: HttpOpts = {}): Promise<{ bytes: Buffer; finalUrl: string; etag: string | null }> {
  const { resp, finalUrl, maxBytes } = await httpResolve(url, { maxBytes: 25_000_000, ...opts });
  if (!resp.arrayBuffer) throw new Error('response has no binary body');
  const bytes = Buffer.from(await resp.arrayBuffer());
  if (bytes.length > maxBytes) throw new Error(`response too large (> ${maxBytes} bytes)`);
  return { bytes, finalUrl, etag: resp.headers.get('etag') };
}

function fetchedDir(cwd: string): string { return path.join(cwd, '.planning/fetched'); }
function sidecarPath(cwd: string): string { return path.join(fetchedDir(cwd), 'fetch-manifest.json'); }

function xmlTag(block: string, tag: string): string {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  return m ? m[1].replace(/\s+/g, ' ').trim() : '';
}
function xmlAll(block: string, tag: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'gi');
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) out.push(m[1].replace(/\s+/g, ' ').trim());
  return out;
}

/** Parse an arXiv Atom feed entry into deterministic markdown. Throws if no entry/abstract. */
function arxivAtomToMarkdown(xml: string, id: string): string {
  const entry = (xml.match(/<entry[\s\S]*?<\/entry>/i) || [])[0];
  if (!entry) throw new Error(`arXiv: no entry found for ${id}`);
  const title = xmlTag(entry, 'title') || `arXiv:${id}`;
  const summary = xmlTag(entry, 'summary');
  if (!summary) throw new Error(`arXiv: empty abstract for ${id}`);
  const authors = xmlAll(entry, 'name');
  const published = xmlTag(entry, 'published');
  const cats: string[] = [];
  const catRe = /<category[^>]*term="([^"]+)"/gi;
  let cm: RegExpExecArray | null;
  while ((cm = catRe.exec(entry)) !== null) cats.push(cm[1]);
  const lines = [
    `# ${title}`,
    '',
    `_Source: https://arxiv.org/abs/${id}_`,
    '',
    authors.length ? `**Authors:** ${authors.join(', ')}` : '',
    published ? `**Published:** ${published}` : '',
    cats.length ? `**Categories:** ${cats.join(', ')}` : '',
    '',
    '## Abstract',
    '',
    summary,
    '',
  ].filter((l, i, a) => !(l === '' && a[i - 1] === '')); // collapse double blanks
  return lines.join('\n');
}

function writeStaging(cwd: string, slug: string, markdown: string): string {
  const dir = fetchedDir(cwd);
  fs.mkdirSync(dir, { recursive: true });
  const finalPath = path.join(dir, `${slug}.md`);
  const tmpPath = path.join(dir, `.${slug}.tmp`);
  fs.writeFileSync(tmpPath, markdown);
  fs.renameSync(tmpPath, finalPath); // atomic
  return finalPath;
}

function recordSidecar(cwd: string, entry: { slug: string; kind: string; canonicalUrl: string; etag: string | null }): void {
  const p = sidecarPath(cwd);
  let all: Array<Record<string, unknown>>;
  try { all = JSON.parse(fs.readFileSync(p, 'utf8')); } catch { all = []; }
  all = all.filter((e) => e.slug !== entry.slug);
  all.push({ ...entry, fetchedAt: new Date().toISOString() });
  fs.writeFileSync(p, JSON.stringify(all, null, 2));
}

/** Default HTML→markdown: lazy-loads readability+turndown+jsdom only when invoked. */
function defaultHtmlToMd(html: string, url: string): string {
  const { JSDOM } = require('jsdom') as { JSDOM: new (h: string, o?: { url?: string }) => { window: { document: unknown } } };
  const { Readability } = require('@mozilla/readability') as { Readability: new (d: unknown) => { parse(): { title?: string; content?: string } | null } };
  const TurndownService = require('turndown') as new () => { turndown(html: string): string };
  const dom = new JSDOM(html, { url });
  const article = new Readability((dom.window as { document: unknown }).document).parse();
  const td = new TurndownService();
  const title = article && article.title ? article.title : '';
  const bodyHtml = article && article.content ? article.content : html;
  const body = td.turndown(bodyHtml);
  return (title ? `# ${title}\n\n` : '') + body;
}

export interface FetchSourceResult { filePath: string; slug: string; kind: SourceKind; }
interface FetchSourceOpts {
  fetcher?: Fetcher;
  htmlToMd?: (html: string, url: string) => string;
  pdfBody?: boolean;
  pdfToMarkdown?: (bytes: Uint8Array, opts?: Record<string, unknown>) => Promise<string>;
}

const ARXIV_API = 'https://export.arxiv.org/api/query?id_list=';

async function fetchSource(cwd: string, input: string, opts: FetchSourceOpts = {}): Promise<FetchSourceResult> {
  const d = detectSource(cwd, input, { pdfBody: opts.pdfBody });
  if (d.kind === 'local') throw new Error(`fetchSource called on a local path: ${input}`);
  if (d.kind === 'unknown') {
    throw new Error(`unrecognized input "${input}" — expected a local .md/.pdf/.jsonl path, an arXiv id/URL, or an http(s) URL`);
  }
  const slug = slugFor(d);
  let markdown: string;
  let canonicalUrl: string;
  const etag: string | null = null;

  if (d.kind === 'arxiv') {
    const { body } = await httpGet(`${ARXIV_API}${encodeURIComponent(d.ref)}`, { fetcher: opts.fetcher });
    markdown = arxivAtomToMarkdown(body, d.ref);
    canonicalUrl = `https://arxiv.org/abs/${d.ref}`;
  } else if (d.kind === 'web') {
    const html = (await httpGet(d.ref, { fetcher: opts.fetcher })).body;
    const conv = opts.htmlToMd || defaultHtmlToMd;
    const converted = conv(html, d.ref).trim();
    if (!converted) throw new Error(`web: extraction produced empty content for ${d.ref}`);
    markdown = `${converted}\n\n_Source: ${d.ref}_\n`;
    canonicalUrl = d.ref;
  } else if (d.kind === 'pdf') {
    const toMd = opts.pdfToMarkdown || defaultPdfToMarkdown;
    let bytes: Buffer;
    if (/^https?:\/\//i.test(d.ref)) {
      bytes = (await httpGetBytes(d.ref, { fetcher: opts.fetcher })).bytes;
      canonicalUrl = d.ref;
    } else if (ARXIV_BARE.test(d.ref)) {
      canonicalUrl = `https://arxiv.org/pdf/${d.ref}`;
      bytes = (await httpGetBytes(canonicalUrl, { fetcher: opts.fetcher })).bytes;
    } else {
      bytes = fs.readFileSync(path.resolve(cwd, d.ref));
      canonicalUrl = d.ref;
    }
    const text = (await toMd(new Uint8Array(bytes))).trim();
    if (!text) throw new Error(`pdf: extraction produced empty content for ${d.ref}`);
    markdown = `${text}\n\n_Source: ${canonicalUrl}_\n`;
  } else if (d.kind === 'session') {
    const raw = fs.readFileSync(path.resolve(cwd, d.ref), 'utf8');
    const conv = sessionJsonlToMarkdown(raw).trim();
    if (!conv) throw new Error(`session: no parseable turns in ${d.ref}`);
    markdown = `${conv}\n\n_Source: ${d.ref}_\n`;
    canonicalUrl = d.ref;
  } else {
    throw new Error(`fetchSource: unsupported kind ${d.kind}`);
  }

  const filePath = writeStaging(cwd, slug, markdown);
  recordSidecar(cwd, { slug, kind: d.kind, canonicalUrl, etag });
  return { filePath, slug, kind: d.kind };
}

module.exports = { detectSource, slugFor, httpGet, httpGetBytes, arxivAtomToMarkdown, fetchSource };
