'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { detectSource, slugFor } = require('../../../lib/research/fetch');

function tmp(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-fetch-'));
  fs.mkdirSync(path.join(d, '.planning'), { recursive: true });
  return d;
}

describe('detectSource', () => {
  it('detects an existing local path first (cwd-relative)', () => {
    const cwd = tmp();
    fs.writeFileSync(path.join(cwd, 'a.md'), '# x');
    expect(detectSource(cwd, 'a.md').kind).toBe('local');
  });
  it('detects a bare arXiv id and arxiv: prefix', () => {
    const cwd = tmp();
    expect(detectSource(cwd, '2401.12345')).toEqual({ kind: 'arxiv', ref: '2401.12345' });
    expect(detectSource(cwd, '2401.12345v2')).toEqual({ kind: 'arxiv', ref: '2401.12345v2' });
    expect(detectSource(cwd, 'arXiv:2401.12345')).toEqual({ kind: 'arxiv', ref: '2401.12345' });
  });
  it('detects arXiv abs/pdf URLs', () => {
    const cwd = tmp();
    expect(detectSource(cwd, 'https://arxiv.org/abs/2401.12345')).toEqual({ kind: 'arxiv', ref: '2401.12345' });
    expect(detectSource(cwd, 'https://arxiv.org/pdf/2401.12345v3')).toEqual({ kind: 'arxiv', ref: '2401.12345v3' });
  });
  it('detects a generic web URL', () => {
    const cwd = tmp();
    expect(detectSource(cwd, 'https://example.com/post')).toEqual({ kind: 'web', ref: 'https://example.com/post' });
  });
  it('does NOT treat a slash-containing string as arXiv (path-like → local)', () => {
    const cwd = tmp();
    expect(detectSource(cwd, 'docs/2401.12345').kind).toBe('local');
  });
  it('returns unknown for unrecognized input', () => {
    const cwd = tmp();
    expect(detectSource(cwd, 'just-some-text').kind).toBe('unknown');
  });
});

describe('httpGet', () => {
  const { httpGet } = require('../../../lib/research/fetch');
  const resp = (status: number, body: string, headers: Record<string, string> = {}) => ({
    status,
    headers: { get: (n: string) => headers[n.toLowerCase()] ?? null },
    text: async () => body,
  });

  it('returns the body on 200', async () => {
    const fetcher = async () => resp(200, 'hello', { etag: 'W/"1"' });
    const r = await httpGet('https://example.com/x', { fetcher });
    expect(r.body).toBe('hello');
    expect(r.etag).toBe('W/"1"');
  });

  it('follows a redirect and re-validates the target', async () => {
    let calls = 0;
    const fetcher = async (url: string) => {
      calls++;
      if (url === 'https://example.com/a') return resp(302, '', { location: 'https://example.com/b' });
      return resp(200, 'final');
    };
    const r = await httpGet('https://example.com/a', { fetcher });
    expect(r.body).toBe('final');
    expect(calls).toBe(2);
  });

  it('rejects a redirect to a blocked host', async () => {
    const fetcher = async () => resp(302, '', { location: 'http://169.254.169.254/latest/meta-data/' });
    await expect(httpGet('https://example.com/a', { fetcher })).rejects.toThrow(/private|loopback|link-local/i);
  });

  it('throws on non-2xx', async () => {
    const fetcher = async () => resp(404, 'nope');
    await expect(httpGet('https://example.com/x', { fetcher })).rejects.toThrow(/HTTP 404/);
  });

  it('throws when the response exceeds the size cap', async () => {
    const fetcher = async () => resp(200, 'x'.repeat(20));
    await expect(httpGet('https://example.com/x', { fetcher, maxBytes: 10 })).rejects.toThrow(/too large|size/i);
  });

  it('throws too-many-redirects past the cap', async () => {
    const fetcher = async () => resp(302, '', { location: 'https://example.com/loop' });
    await expect(httpGet('https://example.com/loop', { fetcher, maxRedirects: 2 })).rejects.toThrow(/redirect/i);
  });
});

describe('fetchSource — arXiv', () => {
  const { fetchSource } = require('../../../lib/research/fetch');
  const ATOM = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
    <entry><title>Attention Is All You Need</title>
    <summary>We propose the Transformer.</summary>
    <published>2017-06-12T00:00:00Z</published>
    <author><name>Ashish Vaswani</name></author><author><name>Noam Shazeer</name></author>
    <category term="cs.CL"/></entry></feed>`;

  it('fetches arXiv metadata → deterministic markdown + sidecar (no timestamp in body)', async () => {
    const cwd = tmp(); fs.mkdirSync(path.join(cwd, '.planning'), { recursive: true });
    const fetcher = async () => ({ status: 200, headers: { get: () => null }, text: async () => ATOM });
    const r = await fetchSource(cwd, '2401.00001', { fetcher });
    expect(r.kind).toBe('arxiv');
    expect(r.filePath).toBe(path.join(cwd, '.planning/fetched/arxiv-2401.00001.md'));
    const md = fs.readFileSync(r.filePath, 'utf8');
    expect(md).toContain('# Attention Is All You Need');
    expect(md).toContain('Ashish Vaswani');
    expect(md).toContain('We propose the Transformer.');
    expect(md).toMatch(/_Source: https:\/\/arxiv\.org\/abs\/2401\.00001_/);
    expect(md).not.toMatch(/fetched_at/i); // no fetch timestamp in body (the published date is source content)
    const sidecar = JSON.parse(fs.readFileSync(path.join(cwd, '.planning/fetched/fetch-manifest.json'), 'utf8'));
    expect(sidecar[0].slug).toBe('arxiv-2401.00001');
    expect(sidecar[0].kind).toBe('arxiv');
  });

  it('is deterministic: two fetches of identical metadata produce byte-identical markdown', async () => {
    const cwd = tmp(); fs.mkdirSync(path.join(cwd, '.planning'), { recursive: true });
    const fetcher = async () => ({ status: 200, headers: { get: () => null }, text: async () => ATOM });
    const a = await fetchSource(cwd, '2401.00001', { fetcher });
    const first = fs.readFileSync(a.filePath, 'utf8');
    const b = await fetchSource(cwd, '2401.00001', { fetcher });
    expect(fs.readFileSync(b.filePath, 'utf8')).toBe(first);
  });

  it('errors when the Atom feed has no entry', async () => {
    const cwd = tmp(); fs.mkdirSync(path.join(cwd, '.planning'), { recursive: true });
    const fetcher = async () => ({ status: 200, headers: { get: () => null }, text: async () => '<feed></feed>' });
    await expect(fetchSource(cwd, '2401.99999', { fetcher })).rejects.toThrow(/no.*entry|not found/i);
  });
});

describe('fetchSource — web', () => {
  const { fetchSource } = require('../../../lib/research/fetch');

  it('fetches HTML → markdown via the injected htmlToMd adapter (deterministic, no timestamp)', async () => {
    const cwd = tmp(); fs.mkdirSync(path.join(cwd, '.planning'), { recursive: true });
    const fetcher = async () => ({ status: 200, headers: { get: () => null }, text: async () => '<html><body><h1>T</h1><p>Body</p></body></html>' });
    const htmlToMd = (_html: string, _url: string) => '# T\n\nBody';
    const r = await fetchSource(cwd, 'https://example.com/post', { fetcher, htmlToMd });
    expect(r.kind).toBe('web');
    expect(r.slug).toMatch(/^web-example-com-[0-9a-f]{8}$/);
    const md = fs.readFileSync(r.filePath, 'utf8');
    expect(md).toContain('# T');
    expect(md).toContain('Body');
    expect(md).toMatch(/_Source: https:\/\/example\.com\/post_/);
    expect(md).not.toMatch(/fetched_at/i);
  });

  it('errors when extraction yields empty content', async () => {
    const cwd = tmp(); fs.mkdirSync(path.join(cwd, '.planning'), { recursive: true });
    const fetcher = async () => ({ status: 200, headers: { get: () => null }, text: async () => '<html></html>' });
    const htmlToMd = () => '   ';
    await expect(fetchSource(cwd, 'https://example.com/x', { fetcher, htmlToMd })).rejects.toThrow(/empty|extract/i);
  });
});

describe('httpGetBytes', () => {
  const { httpGetBytes } = require('../../../lib/research/fetch');
  const resp = (status: number, body: string, headers: Record<string, string> = {}) => ({
    status,
    headers: { get: (n: string) => headers[n.toLowerCase()] ?? null },
    arrayBuffer: async () => new TextEncoder().encode(body).buffer,
    text: async () => body,
  });

  it('returns a Buffer of the body on 200', async () => {
    const fetcher = async () => resp(200, 'PDFBYTES');
    const r = await httpGetBytes('https://example.com/x.pdf', { fetcher });
    expect(Buffer.isBuffer(r.bytes)).toBe(true);
    expect(r.bytes.toString()).toBe('PDFBYTES');
  });

  it('re-validates a redirect target (blocks metadata host)', async () => {
    const fetcher = async () => resp(302, '', { location: 'http://169.254.169.254/' });
    await expect(httpGetBytes('https://example.com/a.pdf', { fetcher })).rejects.toThrow(/private|loopback|link-local/i);
  });

  it('enforces the byte size cap', async () => {
    const fetcher = async () => resp(200, 'x'.repeat(50));
    await expect(httpGetBytes('https://example.com/x.pdf', { fetcher, maxBytes: 10 })).rejects.toThrow(/too large|size/i);
  });
});

describe('slugFor', () => {
  it('arxiv slug is stable and id-based', () => {
    expect(slugFor({ kind: 'arxiv', ref: '2401.12345v2' })).toBe('arxiv-2401.12345v2');
  });
  it('web slug embeds host and a url hash; distinct URLs never collide', () => {
    const a = slugFor({ kind: 'web', ref: 'https://example.com/a' });
    const b = slugFor({ kind: 'web', ref: 'https://example.com/b' });
    expect(a).toMatch(/^web-example-com-[0-9a-f]{8}$/);
    expect(a).not.toBe(b);
    expect(slugFor({ kind: 'web', ref: 'https://example.com/a' })).toBe(a); // deterministic
  });
});
