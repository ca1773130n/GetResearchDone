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
