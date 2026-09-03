'use strict';

/**
 * Pointer audit for `commands/*.md` (W9).
 *
 * A `@${CLAUDE_PLUGIN_ROOT}/...` line only loads a file when it sits at
 * DOCUMENT level. Inside a fenced code block it is literal template text that
 * the model copies into a `Task(prompt="...")` string, where it is never
 * resolved — `commands/plan-phase.md:227` states this outright: "`@` syntax
 * doesn't work across Task() boundaries".
 *
 * That distinction is invisible on a `grep`, and it is exactly what made
 * `init.md`'s two `questioning.md` citations a no-op: the command told the
 * model to consult a 185-line file it was never given. These tests pin the
 * repaired pointer, and pin the one that is still dead so a future change to
 * it is announced rather than assumed.
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT: string = path.resolve(__dirname, '..', '..');

interface IncludeSite {
  file: string;
  line: number;
  target: string;
  fenced: boolean;
}

/**
 * Scan one markdown file for `@${CLAUDE_PLUGIN_ROOT}/<target>` references,
 * recording whether each sits inside a fenced code block. Fences may be
 * indented (the executor `Task()` templates are indented three spaces) and may
 * use backticks or tildes.
 */
function scanIncludeSites(absPath: string, label: string): IncludeSite[] {
  const sites: IncludeSite[] = [];
  const lines = fs.readFileSync(absPath, 'utf8').split('\n') as string[];
  let openFence: string | null = null;
  lines.forEach((line: string, idx: number) => {
    const fence = /^\s*(`{3,}|~{3,})/.exec(line);
    if (fence) {
      const marker = fence[1][0];
      openFence = openFence === null ? marker : openFence === marker ? null : openFence;
      return;
    }
    const ref = /@\$\{CLAUDE_PLUGIN_ROOT\}\/([\w./-]+)/.exec(line);
    if (!ref) return;
    sites.push({ file: label, line: idx + 1, target: ref[1], fenced: openFence !== null });
  });
  return sites;
}

/** Every markdown file under one repo-relative directory, as [label, absPath]. */
function markdownFiles(relDir: string): Array<[string, string]> {
  const absDir = path.join(REPO_ROOT, relDir);
  return fs
    .readdirSync(absDir)
    .filter((f: string) => f.endsWith('.md'))
    .sort()
    .map((f: string): [string, string] => [`${relDir}/${f}`, path.join(absDir, f)]);
}

/**
 * All `<tag>` ... `</tag>` block bodies found in a file, keyed by tag name.
 * Scanned line by line rather than with one regex, so nested blocks are found
 * too — `references/questioning.md` wraps its whole body in
 * `<questioning_guide>`, which a single greedy/global match would swallow.
 */
function xmlBlocks(absPath: string): Map<string, string> {
  const lines = fs.readFileSync(absPath, 'utf8').split('\n') as string[];
  const blocks = new Map<string, string>();
  lines.forEach((line: string, idx: number) => {
    const open = /^<([a-z_]+)>$/.exec(line);
    if (!open) return;
    const close = lines.indexOf(`</${open[1]}>`, idx + 1);
    if (close === -1) return;
    blocks.set(open[1], lines.slice(idx + 1, close).join('\n'));
  });
  return blocks;
}

describe('commands/init.md loads the questioning guide it cites', () => {
  const initPath = path.join(REPO_ROOT, 'commands', 'init.md');
  const guidePath = path.join(REPO_ROOT, 'references', 'questioning.md');

  it('carries a document-level include of references/questioning.md', () => {
    const sites = scanIncludeSites(initPath, 'commands/init.md').filter(
      (s) => s.target === 'references/questioning.md',
    );
    expect(sites).toHaveLength(1);
    expect(sites[0].fenced).toBe(false);
    expect(fs.existsSync(guidePath)).toBe(true);
  });

  it('cites the loaded blocks by name, never the bare filename', () => {
    const lines = fs.readFileSync(initPath, 'utf8').split('\n') as string[];
    const filenameMentions = lines
      .map((line: string, idx: number) => ({ line, n: idx + 1 }))
      .filter((r) => r.line.includes('questioning.md'));
    // The include line is the only place the filename may appear. Any other
    // occurrence is a bare-name citation of the kind this change removed.
    expect(filenameMentions.map((r) => r.n)).toHaveLength(1);
    expect(filenameMentions[0].line).toContain('@${CLAUDE_PLUGIN_ROOT}/references/questioning.md');
  });

  it('names only blocks that exist in the loaded guide', () => {
    const initText = fs.readFileSync(initPath, 'utf8') as string;
    const guideBlocks = xmlBlocks(guidePath);
    // The guide's own root element is not in `xmlBlocks` (it wraps the file),
    // so assert it separately.
    expect(fs.readFileSync(guidePath, 'utf8')).toContain('<questioning_guide>');
    for (const named of ['question_types', 'context_checklist']) {
      expect(initText).toContain(`\`<${named}>\` block`);
      expect(guideBlocks.has(named)).toBe(true);
      expect((guideBlocks.get(named) as string).trim().length).toBeGreaterThan(0);
    }
  });
});

describe('commands/execute-phase.md executor prompts have not drifted', () => {
  const execPhasePath = path.join(REPO_ROOT, 'commands', 'execute-phase.md');

  /**
   * The four `grd-executor` `Task()` templates — one per cell of the
   * teams x isolation matrix. Located structurally, not by line number.
   */
  function executorBlocks(): string[] {
    const lines = fs.readFileSync(execPhasePath, 'utf8').split('\n') as string[];
    const blocks: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      const open = /^(\s*)Task\($/.exec(lines[i]);
      if (!open) continue;
      const close = `${open[1]})`;
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j] !== close) continue;
        const span = lines.slice(i, j + 1);
        if (span.some((l: string) => l.includes('subagent_type="grd:grd-executor"'))) {
          blocks.push(span.join('\n'));
        }
        i = j;
        break;
      }
    }
    return blocks;
  }

  function sectionOf(block: string, tag: string): string {
    const m = new RegExp(`<${tag}>[\\s\\S]*?</${tag}>`).exec(block);
    return m === null ? '' : m[0];
  }

  it('finds exactly four executor Task templates', () => {
    expect(executorBlocks()).toHaveLength(4);
  });

  it('gives all four the identical <experiment_tracking> block', () => {
    // The two `use_teams=true` variants had dropped the concrete commit
    // example and the backticks the two standard variants carry. Divergence
    // here means half of all dispatches lose guidance the other half gets.
    const sections = executorBlocks().map((b) => sectionOf(b, 'experiment_tracking'));
    expect(sections.every((s) => s.length > 0)).toBe(true);
    expect(new Set(sections).size).toBe(1);
    expect(sections[0]).toContain('- Format: `param: value` on separate lines');
    expect(sections[0]).toContain('- Example: `feat(03-02): train baseline model');
  });

  it('gives all four the identical <success_criteria> block', () => {
    const sections = executorBlocks().map((b) => sectionOf(b, 'success_criteria'));
    expect(sections.every((s) => s.length > 0)).toBe(true);
    expect(new Set(sections).size).toBe(1);
  });
});

describe('references/execute-plan.md is unreachable — W9 hoist stays deferred', () => {
  /**
   * W9 proposed hoisting the executors' invariant prompt body into
   * `references/execute-plan.md`, on the premise that all four blocks
   * `@`-include it. They do not: all sixteen `@` lines inside those four
   * `Task()` templates are FENCED, so they are copied into the subagent prompt
   * as literal text and never resolved. `agents/grd-executor.md` does not
   * reference the file at all. Hoisting would therefore DELETE prompt lines
   * from every executor dispatch.
   *
   * This test pins that. When someone gives `execute-plan.md` a real load site
   * — a document-level include in `agents/grd-executor.md`, or content passed
   * through the init JSON the way `commands/plan-phase.md:227` does it — this
   * fails, and the failure is the signal that the hoist is now safe.
   */
  it('has zero document-level include sites in commands/ or agents/', () => {
    const sites = [...markdownFiles('commands'), ...markdownFiles('agents')]
      .flatMap(([label, abs]) => scanIncludeSites(abs, label))
      .filter((s) => s.target === 'references/execute-plan.md');

    expect(sites.length).toBeGreaterThan(0);
    const live = sites.filter((s) => !s.fenced).map((s) => `${s.file}:${s.line}`);
    expect(live).toEqual([]);
  });

  it('reaches the four executor Task templates only as fenced literal text', () => {
    const sites = scanIncludeSites(
      path.join(REPO_ROOT, 'commands', 'execute-phase.md'),
      'commands/execute-phase.md',
    ).filter((s) => s.target === 'references/execute-plan.md');
    expect(sites).toHaveLength(4);
    expect(sites.every((s) => s.fenced)).toBe(true);
  });
});
