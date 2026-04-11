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
    // CORRECTION: ignorefile pattern must match the TRUNCATED MATCH TEXT
    // (what the regex captured), not the full source line. The you_are_now
    // regex /you are now [a-z]/i on "You are now a helpful pirate."
    // matches "You are now a" (the longer phrase is not in the regex match),
    // so the ignorefile pattern must be scoped to that substring.
    const fixturePath = path.join(FIXTURES, "positive-you_are_now.md");
    const hits = scanProse([fixturePath], {
      ignoreEntries: [{ type: "global", pattern: /you are now a/i }],
    });
    // Multiple hits may exist (e.g., "You Are Now F" in the title). Find the one
    // that is actually suppressed by the ignore pattern.
    const yourHit = hits.find(
      (h: { pattern: string; match: string }) =>
        h.pattern === "you_are_now" && h.match === "You are now a",
    );
    expect(yourHit).toBeDefined();
    expect(yourHit!.ignored).toBe(true);
  });
});
