"use strict";

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { resolveScanFiles } from "../../../lib/cli/scan-dispatch";

function makeTmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "scan-resolve-"));
}

describe("resolveScanFiles", () => {
  it("--file mode returns the literal file when it exists", () => {
    const dir = makeTmp();
    const f = path.join(dir, "a.md");
    fs.writeFileSync(f, "# hi\n");
    try {
      const files = resolveScanFiles({ mode: "file", filePath: f, cwd: dir });
      expect(files).toEqual([f]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("--file mode throws on missing file", () => {
    expect(() =>
      resolveScanFiles({
        mode: "file",
        filePath: "/tmp/does-not-exist-xyz.md",
        cwd: "/tmp",
      }),
    ).toThrow(/not found/);
  });

  it("--all mode returns markdown files from commands/, agents/, templates/, docs/", () => {
    const dir = makeTmp();
    try {
      fs.mkdirSync(path.join(dir, "commands"));
      fs.mkdirSync(path.join(dir, "agents"));
      fs.mkdirSync(path.join(dir, "templates"));
      fs.mkdirSync(path.join(dir, "docs"));
      fs.writeFileSync(path.join(dir, "commands", "a.md"), "# a");
      fs.writeFileSync(path.join(dir, "agents", "b.md"), "# b");
      fs.writeFileSync(path.join(dir, "templates", "c.md"), "# c");
      fs.writeFileSync(path.join(dir, "docs", "d.md"), "# d");
      fs.writeFileSync(path.join(dir, "README.md"), "# readme");

      const files = resolveScanFiles({ mode: "all", cwd: dir });
      const rels = files.map((f: string) => path.relative(dir, f)).sort();
      expect(rels).toEqual([
        "agents/b.md",
        "commands/a.md",
        "docs/d.md",
        "templates/c.md",
      ]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("staged mode returns empty array when run outside a git repo", () => {
    const dir = makeTmp();
    try {
      const files = resolveScanFiles({ mode: "staged", cwd: dir });
      expect(files).toEqual([]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("--all mode skips docs/superpowers subdirectory", () => {
    const dir = makeTmp();
    try {
      fs.mkdirSync(path.join(dir, "docs", "superpowers", "plans"), {
        recursive: true,
      });
      fs.mkdirSync(path.join(dir, "docs", "user-guide"), { recursive: true });
      fs.writeFileSync(
        path.join(dir, "docs", "superpowers", "plans", "skip-me.md"),
        "# skip",
      );
      fs.writeFileSync(
        path.join(dir, "docs", "user-guide", "keep-me.md"),
        "# keep",
      );

      const files = resolveScanFiles({ mode: "all", cwd: dir });
      const rels = files.map((f: string) => path.relative(dir, f)).sort();
      expect(rels).toEqual(["docs/user-guide/keep-me.md"]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
