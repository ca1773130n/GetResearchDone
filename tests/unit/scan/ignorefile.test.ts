"use strict";

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  parseIgnoreFile,
  loadIgnoreFile,
  isIgnored,
  IgnoreEntry,
} from "../../../lib/scan/ignorefile";

describe("parseIgnoreFile", () => {
  it("parses empty input as empty list", () => {
    expect(parseIgnoreFile("")).toEqual([]);
  });

  it("ignores comment and blank lines", () => {
    const input = "# comment\n\n# another\n\n";
    expect(parseIgnoreFile(input)).toEqual([]);
  });

  it("parses a file-scoped entry with filepath:regex", () => {
    const input = "commands/init.md:you are now so improvements";
    const entries = parseIgnoreFile(input);
    expect(entries.length).toBe(1);
    const e = entries[0] as Extract<IgnoreEntry, { type: "file" }>;
    expect(e.type).toBe("file");
    expect(e.filePath).toBe("commands/init.md");
    expect(e.pattern.test("you are now so improvements")).toBe(true);
  });

  it("parses a global entry when left side is not a file path", () => {
    const input = "some_unlikely_pattern_in_any_file";
    const entries = parseIgnoreFile(input);
    expect(entries.length).toBe(1);
    expect(entries[0].type).toBe("global");
  });

  it("handles multiple entries and mixed types", () => {
    const input = [
      "# comment",
      "commands/init.md:hello world",
      "",
      "# another",
      "global_pattern_xyz",
    ].join("\n");
    const entries = parseIgnoreFile(input);
    expect(entries.length).toBe(2);
    expect(entries[0].type).toBe("file");
    expect(entries[1].type).toBe("global");
  });

  it("drops entries with invalid regex on the right side", () => {
    const input = "some/file.md:[unclosed";
    const entries = parseIgnoreFile(input);
    expect(entries.length).toBe(0);
  });
});

describe("loadIgnoreFile", () => {
  it("returns empty list when file does not exist", () => {
    expect(loadIgnoreFile("/tmp/nonexistent-ignorefile-" + Date.now())).toEqual(
      [],
    );
  });

  it("reads and parses an existing file", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "scan-ignore-"));
    const fpath = path.join(dir, ".prompt-injection-scanignore");
    fs.writeFileSync(fpath, "commands/init.md:you are now so\n");
    try {
      const entries = loadIgnoreFile(fpath);
      expect(entries.length).toBe(1);
      expect(entries[0].type).toBe("file");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("isIgnored", () => {
  it("returns false when no entries match", () => {
    const entries: IgnoreEntry[] = [{ type: "global", pattern: /nope/ }];
    expect(isIgnored("file.md", "something else", entries)).toBe(false);
  });

  it("returns true when a global entry matches", () => {
    const entries: IgnoreEntry[] = [{ type: "global", pattern: /hello/ }];
    expect(isIgnored("any/file.md", "hello world", entries)).toBe(true);
  });

  it("returns true when a file-scoped entry matches the same file", () => {
    const entries: IgnoreEntry[] = [
      { type: "file", filePath: "commands/init.md", pattern: /hello/ },
    ];
    expect(isIgnored("commands/init.md", "hello world", entries)).toBe(true);
  });

  it("returns false when a file-scoped entry matches a different file", () => {
    const entries: IgnoreEntry[] = [
      { type: "file", filePath: "commands/init.md", pattern: /hello/ },
    ];
    expect(isIgnored("commands/other.md", "hello world", entries)).toBe(false);
  });

  it("returns true when a file-scoped entry matches by suffix", () => {
    const entries: IgnoreEntry[] = [
      { type: "file", filePath: "commands/init.md", pattern: /hello/ },
    ];
    expect(
      isIgnored(
        "/Users/neo/dev/project/commands/init.md",
        "hello world",
        entries,
      ),
    ).toBe(true);
  });

  it("does not match suffix when the path does not end at a directory boundary", () => {
    const entries: IgnoreEntry[] = [
      { type: "file", filePath: "init.md", pattern: /hello/ },
    ];
    // 'oof/init.md' ends with '/init.md', should match
    expect(isIgnored("/foo/init.md", "hello", entries)).toBe(true);
    // 'fooinit.md' does NOT end with '/init.md' (no slash before)
    expect(isIgnored("fooinit.md", "hello", entries)).toBe(false);
  });
});
