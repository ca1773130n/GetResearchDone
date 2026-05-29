'use strict';
const { assertFetchableUrl, isBlockedHost } = require('../../../lib/research/url-guard');

describe('assertFetchableUrl', () => {
  it('accepts a normal public http(s) URL and returns a URL', () => {
    expect(assertFetchableUrl('https://export.arxiv.org/api/query').hostname).toBe('export.arxiv.org');
    expect(assertFetchableUrl('http://example.com/p').protocol).toBe('http:');
  });

  it('rejects non-http(s) schemes', () => {
    expect(() => assertFetchableUrl('file:///etc/passwd')).toThrow(/scheme/i);
    expect(() => assertFetchableUrl('ftp://example.com')).toThrow(/scheme/i);
    expect(() => assertFetchableUrl('data:text/html,x')).toThrow(/scheme/i);
  });

  it('rejects embedded credentials', () => {
    expect(() => assertFetchableUrl('http://user:pass@example.com')).toThrow(/credential/i);
  });

  it('rejects an invalid URL', () => {
    expect(() => assertFetchableUrl('not a url')).toThrow(/invalid url/i);
  });

  it('blocks localhost, loopback, private, link-local, metadata, unspecified', () => {
    for (const h of ['localhost', 'sub.localhost', '127.0.0.1', '10.0.0.1', '172.16.5.5',
      '192.168.1.1', '169.254.169.254', '0.0.0.0']) {
      expect(isBlockedHost(h)).toBe(true);
    }
  });

  it('blocks alternate IPv4 encodings via WHATWG normalization', () => {
    // new URL normalizes these to dotted-quad before our range check.
    expect(() => assertFetchableUrl('http://2130706433/')).toThrow(/private|loopback/i);   // 127.0.0.1
    expect(() => assertFetchableUrl('http://0177.0.0.1/')).toThrow(/private|loopback/i);    // 127.0.0.1
    expect(() => assertFetchableUrl('http://0x7f.0.0.1/')).toThrow(/private|loopback/i);    // 127.0.0.1
  });

  it('blocks IPv6 loopback, link-local, and IPv4-mapped loopback', () => {
    expect(() => assertFetchableUrl('http://[::1]/')).toThrow(/private|loopback/i);
    expect(() => assertFetchableUrl('http://[fe80::1]/')).toThrow(/private|loopback/i);
    expect(() => assertFetchableUrl('http://[::ffff:127.0.0.1]/')).toThrow(/private|loopback/i);
  });

  it('allows a public IPv4', () => {
    expect(isBlockedHost('93.184.216.34')).toBe(false);
  });
});
