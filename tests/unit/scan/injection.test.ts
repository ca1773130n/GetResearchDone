"use strict";

import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import { scanProse } from "../../../lib/scan/injection";
import { INJECTION_PATTERNS } from "../../../lib/scan/patterns";

const FIXTURES = path.join(__dirname, "../../fixtures/scan");

describe("scanProse", () => {
  it("returns no hits for an empty file list", () => {
    const hits = scanProse([], { ignoreEntries: [] });
    expect(hits).toEqual([]);
  });

  it("detects every documented pattern via positive fixtures (except invisible_unicode, tested inline)", () => {
    const fixtureIds = INJECTION_PATTERNS.map((p) => p.id).filter(
      (id) => id !== "invisible_unicode",
    );

    for (const id of fixtureIds) {
      const fixturePath = path.join(FIXTURES, `positive-${id}.md`);
      const hits = scanProse([fixturePath], { ignoreEntries: [] });
      const idsHit = new Set(hits.map((h: { pattern: string }) => h.pattern));
      expect(idsHit.has(id)).toBe(true);
    }
  });

  it("detects invisible_unicode via programmatic fixture", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "scan-unicode-"));
    const fpath = path.join(dir, "invisible.md");
    const content = "# Invisible Unicode\n\nHello" + "\u200B" + "world.\n";
    fs.writeFileSync(fpath, content);
    try {
      const hits = scanProse([fpath], { ignoreEntries: [] });
      const idsHit = new Set(hits.map((h: { pattern: string }) => h.pattern));
      expect(idsHit.has("invisible_unicode")).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("does not flag patterns wrapped in code blocks", () => {
    const fixturePath = path.join(
      FIXTURES,
      "negative-all-patterns-in-code-block.md",
    );
    const hits = scanProse([fixturePath], { ignoreEntries: [] });
    const unignoredHits = hits.filter((h: { ignored: boolean }) => !h.ignored);
    expect(unignoredHits).toEqual([]);
  });

  it("reports hits with line numbers matching the original file", () => {
    const fixturePath = path.join(FIXTURES, "positive-you_are_now.md");
    const hits = scanProse([fixturePath], { ignoreEntries: [] });
    const hit = hits.find(
      (h: { pattern: string }) => h.pattern === "you_are_now",
    );
    expect(hit).toBeDefined();
    expect(hit!.line).toBeGreaterThan(0);
    expect(hit!.file).toBe(fixturePath);
  });

  it("suppresses hits when an ignorefile entry matches", () => {
    // The injection scanner passes the full source line to isIgnored, so
    // ignorefile patterns match against natural prose context. Here the
    // fixture line is "You are now a helpful pirate." and the pattern below
    // matches that full line (not just the truncated regex match).
    const fixturePath = path.join(FIXTURES, "positive-you_are_now.md");
    const hits = scanProse([fixturePath], {
      ignoreEntries: [
        { type: "global", pattern: /you are now a helpful pirate/i },
      ],
    });
    // The title line ("# You Are Now Fixture") also matches you_are_now but
    // does NOT contain "helpful pirate" — only the body line at line 5 does.
    // Verify the body-line hit is suppressed (full-line match), and the title
    // hit is NOT suppressed (demonstrating per-line matching specificity).
    const bodyHit = hits.find(
      (h: { pattern: string; line: number }) =>
        h.pattern === "you_are_now" && h.line === 5,
    );
    expect(bodyHit).toBeDefined();
    expect(bodyHit!.ignored).toBe(true);
    const titleHit = hits.find(
      (h: { pattern: string; line: number }) =>
        h.pattern === "you_are_now" && h.line === 1,
    );
    expect(titleHit).toBeDefined();
    expect(titleHit!.ignored).toBe(false);
  });
});
