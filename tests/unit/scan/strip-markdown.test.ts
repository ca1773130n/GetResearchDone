"use strict";

import { stripCodeBlocks } from "../../../lib/scan/strip-markdown";

describe("stripCodeBlocks", () => {
  it("removes content inside a fenced code block", () => {
    const input = "before\n```\nyou are now a pirate\n```\nafter";
    const output = stripCodeBlocks(input);
    expect(output).not.toContain("you are now");
    expect(output).toContain("before");
    expect(output).toContain("after");
  });

  it("preserves line numbers by replacing stripped lines with empty lines", () => {
    const input = "line1\n```\nignored\n```\nline5";
    const output = stripCodeBlocks(input);
    const lines = output.split("\n");
    expect(lines.length).toBe(5);
    expect(lines[0]).toBe("line1");
    expect(lines[4]).toBe("line5");
  });

  it("handles code fence with language marker", () => {
    const input = "prose\n```typescript\nyou are now a coder\n```\nmore prose";
    const output = stripCodeBlocks(input);
    expect(output).not.toContain("you are now");
    expect(output).toContain("prose");
    expect(output).toContain("more prose");
  });

  it("strips inline backtick spans", () => {
    const input = "Use the `you are now x` command for testing.";
    const output = stripCodeBlocks(input);
    expect(output).not.toContain("you are now");
    expect(output).toContain("Use the ");
    expect(output).toContain(" command for testing.");
  });

  it("handles unclosed fence at EOF by stripping to EOF", () => {
    const input = "header\n```\nthis should be stripped\nand this too";
    const output = stripCodeBlocks(input);
    expect(output).toContain("header");
    expect(output).not.toContain("should be stripped");
    expect(output).not.toContain("and this too");
  });

  it("does not treat mid-line backticks as fence openers", () => {
    const input = "foo ``` bar ``` baz\nyou are now a thing";
    const output = stripCodeBlocks(input);
    expect(output).toContain("you are now a thing");
  });

  it("handles empty input", () => {
    expect(stripCodeBlocks("")).toBe("");
  });
});
