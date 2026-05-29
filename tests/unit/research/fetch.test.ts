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
  it('does NOT treat a slash-containing non-existent string as arXiv', () => {
    const cwd = tmp();
    expect(detectSource(cwd, 'docs/2401.12345').kind).toBe('unknown');
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
