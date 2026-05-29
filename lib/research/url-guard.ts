'use strict';
const net = require('net') as { isIP: (s: string) => number };

function ipv4Blocked(ip: string): boolean {
  const o = ip.split('.').map(Number);
  if (o.length !== 4 || o.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = o;
  if (a === 0 || a === 127 || a === 10) return true;       // unspecified-ish, loopback, private
  if (a === 169 && b === 254) return true;                  // link-local incl. 169.254.169.254 (cloud metadata)
  if (a === 172 && b >= 16 && b <= 31) return true;         // 172.16/12
  if (a === 192 && b === 168) return true;                  // 192.168/16
  if (a === 100 && b >= 64 && b <= 127) return true;        // CGNAT 100.64/10
  return false;
}

// Expand a (possibly ::-compressed, possibly IPv4-tailed) IPv6 to 16 bytes, or null if unparseable.
function ipv6Bytes(host: string): number[] | null {
  let s = host;
  let tail4: number[] = [];
  const lastColon = s.lastIndexOf(':');
  const lastSeg = s.slice(lastColon + 1);
  if (lastSeg.includes('.')) {
    const q = lastSeg.split('.').map(Number);
    if (q.length === 4 && q.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) {
      tail4 = q;
      s = s.slice(0, lastColon + 1) + '0:0';
    }
  }
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  let groups: string[];
  if (halves.length === 2) {
    const missing = 8 - (head.length + tail.length);
    if (missing < 0) return null;
    groups = [...head, ...Array(missing).fill('0'), ...tail];
  } else {
    groups = head;
  }
  if (groups.length !== 8) return null;
  const bytes: number[] = [];
  for (const g of groups) {
    const v = parseInt(g || '0', 16);
    if (Number.isNaN(v) || v < 0 || v > 0xffff) return null;
    bytes.push((v >> 8) & 0xff, v & 0xff);
  }
  if (tail4.length === 4) bytes.splice(12, 4, ...tail4);
  return bytes.length === 16 ? bytes : null;
}

function ipv6Blocked(host: string): boolean {
  const b = ipv6Bytes(host);
  if (!b) return true;                                          // unparseable → block
  if (b.every((x) => x === 0)) return true;                     // ::
  if (b.slice(0, 15).every((x) => x === 0) && b[15] === 1) return true; // ::1
  if (b[0] === 0xfe && (b[1] & 0xc0) === 0x80) return true;     // fe80::/10 link-local
  if ((b[0] & 0xfe) === 0xfc) return true;                      // fc00::/7 unique-local
  if (b.slice(0, 10).every((x) => x === 0) && b[10] === 0xff && b[11] === 0xff) {
    return ipv4Blocked(`${b[12]}.${b[13]}.${b[14]}.${b[15]}`); // ::ffff:a.b.c.d
  }
  return false;
}

/** True if the host is loopback/private/link-local/localhost. No DNS resolution (scoped out). */
function isBlockedHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, ''); // strip IPv6 brackets + trailing dot
  if (h === 'localhost' || h.endsWith('.localhost')) return true;
  const kind = net.isIP(h);
  if (kind === 4) return ipv4Blocked(h);
  if (kind === 6) return ipv6Blocked(h);
  return false; // a non-IP hostname; we do not resolve it (DNS-rebinding residual is accepted)
}

/** Validate a URL is safe to fetch; returns the parsed URL or throws. */
function assertFetchableUrl(raw: string): URL {
  let u: URL;
  try { u = new URL(raw); } catch { throw new Error(`invalid URL: ${raw}`); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error(`unsupported scheme "${u.protocol}" (only http/https)`);
  }
  if (u.username || u.password) throw new Error('credentials in URL are not allowed');
  if (isBlockedHost(u.hostname)) {
    throw new Error(`refusing to fetch private/loopback/link-local host: ${u.hostname}`);
  }
  return u;
}

module.exports = { assertFetchableUrl, isBlockedHost };
