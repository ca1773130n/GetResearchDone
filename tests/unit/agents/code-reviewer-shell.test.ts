'use strict';

/**
 * Executable regression tests for the ```bash blocks in agents/grd-code-reviewer.md.
 *
 * Those blocks are shell, but nothing in the repo ran them: a subagent executes each
 * one as a SEPARATE Bash tool call, in production, once. Three consecutive review
 * rounds found bugs in them — a `git grep --pathspec-from-file` flag that does not
 * exist, `for P in ${PLAN_IDS}` which does not word-split under zsh, and a doubled
 * plan prefix that built `(103-103-01)` and matched nothing. Every one of those dies
 * on the first execution against a real repository.
 *
 * Two halves:
 *
 *  1. Execution — build a throwaway git repo under the OS temp dir (never inside this
 *     project), run the blocks verbatim with PHASE_NUMBER / PLAN_IDS supplied, and
 *     assert on observable outcomes: how many commits resolved, which paths landed in
 *     scope, a content check that finds a known string, and a loud non-zero exit on
 *     each degenerate scope.
 *
 *  2. Static invariants — the exact constructs that bit us, asserted against the
 *     blocks' EXECUTABLE lines. Comments are stripped first: several of the blocks
 *     name the broken construct on purpose, to explain why it is not used.
 *
 * Fixture geometry (small on purpose — the suite runs under a 15s jest timeout):
 *
 *   c1  main  chore: seed repo                      README.md, wildXcard.py, unrelated.py
 *   c2  main  feat(103-01): add trainer …           train.py, "sp ace.py", "wild*card.py",
 *                                                   "legacy helper.py"
 *   c3  main  refactor(103-01): drop legacy shim    deletes "legacy helper.py"
 *   c4  w2    feat(103-02): add loader              loader.py          (branch never merged)
 *   c5  main  docs: record follow-up                NOTES.md    (body mentions "(103-01)")
 *
 * Which makes each fixture element load-bearing:
 *   - c4 on an unmerged branch      → `git log --all`, or the wave's commits vanish.
 *   - c3's deletion                 → `git grep <sha>` reads blobs from the commit, so a
 *                                     file the scope deleted is still greppable.
 *   - "sp ace.py"                   → NUL-delimited paths through xargs -0.
 *   - "wild*card.py" + wildXcard.py → --literal-pathspecs, or git's wildmatch drags the
 *                                     out-of-scope sibling in as this phase's finding (K3).
 *   - c5's body mention             → --grep="($P):" WITH the colon, so a body reference
 *                                     does not pull an unrelated commit into scope.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const childProcess = require('child_process');

const AGENT_FILE: string = path.join(
  __dirname,
  '..',
  '..',
  '..',
  'agents',
  'grd-code-reviewer.md'
);

// ─── environment probes (skip cleanly, never fail, when a tool is absent) ───

interface RunResult {
  status: number;
  stdout: string;
  stderr: string;
}

/** Parsed [major, minor] of the installed git, or null when git is unavailable. */
function gitVersion(): [number, number] | null {
  const r = childProcess.spawnSync('git', ['--version'], { encoding: 'utf-8' });
  if (r.error || r.status !== 0 || typeof r.stdout !== 'string') return null;
  const m = /(\d+)\.(\d+)/.exec(r.stdout);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

const GIT_VERSION: [number, number] | null = gitVersion();
// `git rev-parse --path-format=absolute` (the scope key) landed in git 2.31.
const GIT_OK: boolean =
  GIT_VERSION !== null && (GIT_VERSION[0] > 2 || (GIT_VERSION[0] === 2 && GIT_VERSION[1] >= 31));

/** Shells the blocks must survive. zsh is the one that does not word-split. */
const SHELLS: string[] = ['bash', 'zsh'].filter((sh: string): boolean => {
  const r = childProcess.spawnSync(sh, ['-c', ':'], { encoding: 'utf-8' });
  return !r.error && r.status === 0;
});

const CAN_EXEC: boolean = GIT_OK && SHELLS.length > 0;
const describeExec = CAN_EXEC ? describe : describe.skip;
/** jest's `.each` rejects an empty table, and describe.skip still collects one. */
const SHELL_CASES: string[] = SHELLS.length > 0 ? SHELLS : ['sh'];

// ─── block extraction ──────────────────────────────────────────────────────

const AGENT_MD: string = fs.readFileSync(AGENT_FILE, 'utf-8');

/** Every ```bash fenced block in the agent definition, in file order. */
function extractBashBlocks(md: string): string[] {
  const blocks: string[] = [];
  const re = /^```bash\n([\s\S]*?)^```/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md)) !== null) blocks.push(m[1]);
  return blocks;
}

/**
 * The lines a shell would actually execute: comments removed, blanks dropped.
 *
 * Required, not cosmetic. The blocks deliberately mention `for P in ${PLAN_IDS}`,
 * `--pathspec-from-file`, `--no-walk` and `${WAVE}` in comments, to record why each
 * is NOT used. A static check over the raw text would flag those and be deleted as
 * noise, taking the real check with it.
 */
function executableLines(block: string): string[] {
  const out: string[] = [];
  for (const raw of block.split('\n')) {
    let inSingle = false;
    let inDouble = false;
    let cut = -1;
    for (let i = 0; i < raw.length; i++) {
      const c = raw[i];
      if (c === '\\' && inDouble) {
        i++;
        continue;
      }
      if (c === "'" && !inDouble) inSingle = !inSingle;
      else if (c === '"' && !inSingle) inDouble = !inDouble;
      else if (c === '#' && !inSingle && !inDouble && (i === 0 || /\s/.test(raw[i - 1]))) {
        cut = i;
        break;
      }
    }
    const line = (cut >= 0 ? raw.slice(0, cut) : raw).trim();
    if (line) out.push(line);
  }
  return out;
}

const BLOCKS: string[] = extractBashBlocks(AGENT_MD);
const CODE: string[] = BLOCKS.map((b: string): string => executableLines(b).join('\n'));

/** Blocks are matched by what they DO, so a reorder in the markdown does not matter. */
const loadContextBlocks: string[] = BLOCKS.filter(
  (b: string): boolean => /git log --all/.test(b) && /mv "\$BUILD"/.test(b)
);
// Identified by `grep -n` alone, deliberately: identifying them by the flags this
// file asserts on (--literal-pathspecs, xargs -0) would make those checks circular —
// deleting a flag would delete the block from the list instead of failing.
const contentCheckBlocks: string[] = BLOCKS.filter((b: string): boolean =>
  /\bgrep -n\b/.test(b)
);
const canonicalCheckBlocks: string[] = contentCheckBlocks.filter((b: string): boolean =>
  b.includes('<pattern>')
);
const reproCheckBlocks: string[] = contentCheckBlocks.filter((b: string): boolean =>
  /manual_seed/.test(b)
);
const methodCheckBlocks: string[] = contentCheckBlocks.filter((b: string): boolean =>
  /arxiv/.test(b)
);
const teardownBlocks: string[] = BLOCKS.filter((b: string): boolean =>
  /^\s*rm -rf "\$\{TMPDIR:-\/tmp\}\/grd-review-/m.test(b)
);
const deviationBlocks: string[] = BLOCKS.filter(
  (b: string): boolean =>
    /\$SCOPE_DIR\/commits/.test(b) && !/grep -n/.test(b) && !/git log/.test(b)
);
/** Every block that reads the scope dir, i.e. everything the agent runs after load_context. */
const scopeConsumerBlocks: string[] = contentCheckBlocks.concat(deviationBlocks);

/** Labelled `.each` table; never empty, so a gutted markdown fails loudly instead of crashing. */
const SCOPE_CONSUMER_CASES: [string, string][] =
  scopeConsumerBlocks.length > 0
    ? scopeConsumerBlocks.map((b: string, i: number): [string, string] => [`#${i + 1}`, b])
    : [['#none-found', '']];

/** Exactly one block must match, or the markdown was restructured and this test is stale. */
function one(list: string[], what: string): string {
  expect(`${what}: ${list.length} matching bash block(s)`).toBe(`${what}: 1 matching bash block(s)`);
  return list[0];
}

// ─── fixture ───────────────────────────────────────────────────────────────

/**
 * One shell script, one process: git init plus five commits costs ~0.2s, which keeps
 * a per-test fixture affordable under the 15s timeout.
 */
const FIXTURE_SCRIPT = [
  'set -e',
  'git init -q -b main .',
  'git config user.email test@grd.invalid',
  'git config user.name "GRD Test"',
  'git config commit.gpgsign false',
  '',
  "printf '# fixture\\n' > README.md",
  'printf \'OUT_OF_SCOPE = "seed"  # SEEDMARKER decoy\\n\' > wildXcard.py',
  "printf 'unrelated_seed = 0  # SEEDMARKER unrelated\\n' > unrelated.py",
  "git add -A && git commit -q -m 'chore: seed repo'",
  '',
  "printf 'import random\\nrandom.seed(42)  # SEEDMARKER\\n' > train.py",
  "printf 'spaced_seed = 1  # SEEDMARKER\\n' > 'sp ace.py'",
  "printf 'wildcard_seed = 2  # SEEDMARKER\\n' > 'wild*card.py'",
  "printf 'legacy_seed = 3  # SEEDMARKER\\n# based on paper 2403.22222\\n' > 'legacy helper.py'",
  "git add -A && git commit -q -m 'feat(103-01): add trainer and hostile paths'",
  '',
  "git rm -q 'legacy helper.py'",
  "git commit -q -m 'refactor(103-01): drop legacy shim'",
  '',
  'git checkout -q -b w2',
  "printf 'import numpy as np\\nnp.random.seed(1234)  # SEEDMARKER\\n' > loader.py",
  "git add -A && git commit -q -m 'feat(103-02): add loader'",
  'git checkout -q main',
  '',
  "printf 'notes seed  # SEEDMARKER\\n' > NOTES.md",
  "git add -A && git commit -q -m 'docs: record follow-up' " +
    "-m 'Follow-up to (103-01) noted in review.'",
].join('\n');

/** Paths the scope must resolve to for PLAN_IDS="103-01 103-02". */
const PHASE_SCOPE_PATHS = [
  'legacy helper.py',
  'loader.py',
  'sp ace.py',
  'train.py',
  'wild*card.py',
];
/** Paths the scope must resolve to for the single-plan wave PLAN_IDS="103-01". */
const WAVE_SCOPE_PATHS = ['legacy helper.py', 'sp ace.py', 'train.py', 'wild*card.py'];
/** Committed but never in scope. A check that prints one of these is reviewing the wrong tree. */
const OUT_OF_SCOPE_PATHS = ['README.md', 'NOTES.md', 'unrelated.py', 'wildXcard.py'];

interface Fixture {
  root: string;
  repo: string;
  tmp: string;
  notRepo: string;
}

let fixture: Fixture;

function makeFixture(): Fixture {
  const root: string = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-reviewer-shell-'));
  const repo: string = path.join(root, 'repo');
  const tmp: string = path.join(root, 'tmp');
  const notRepo: string = path.join(root, 'not-a-repo');
  fs.mkdirSync(repo);
  fs.mkdirSync(tmp);
  fs.mkdirSync(notRepo);
  const r = childProcess.spawnSync('sh', ['-c', FIXTURE_SCRIPT], {
    cwd: repo,
    encoding: 'utf-8',
    env: childEnv({ root, tmp }),
  });
  if (r.status !== 0) {
    throw new Error(`fixture build failed (${r.status}):\n${r.stdout}\n${r.stderr}`);
  }
  return { root, repo, tmp, notRepo };
}

function removeFixture(f: Fixture): void {
  if (!f || !f.root.startsWith(os.tmpdir())) {
    throw new Error(`refusing to remove a fixture outside tmpdir: ${f && f.root}`);
  }
  fs.rmSync(f.root, { recursive: true, force: true });
}

/**
 * HOME/XDG point inside the fixture and GIT_CONFIG_NOSYSTEM is set, so a developer's
 * global gitconfig (signing, hooks, templates) cannot reach in. GIT_CEILING_DIRECTORIES
 * stops the upward .git search, which is what makes the "not a git repository" case
 * deterministic. LC_ALL=C pins `sort` order so path assertions do not depend on locale.
 */
function childEnv(f: { root: string; tmp: string }, extra?: Record<string, string>): NodeJS.ProcessEnv {
  return {
    ...process.env,
    HOME: f.root,
    XDG_CONFIG_HOME: path.join(f.root, 'xdg'),
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CEILING_DIRECTORIES: path.dirname(f.root),
    TMPDIR: f.tmp,
    LC_ALL: 'C',
    ...(extra || {}),
  };
}

interface BlockOpts {
  cwd?: string;
  planIds?: string;
  phaseNumber?: string;
  shell?: string;
}

/**
 * Run one block verbatim, exactly as the agent's Bash tool would: a fresh shell with
 * no state carried over from the previous block, PLAN_IDS / PHASE_NUMBER supplied.
 */
function runBlock(block: string, opts: BlockOpts = {}): RunResult {
  const shell: string = opts.shell || SHELLS[0];
  const env = childEnv(fixture, {
    PLAN_IDS: opts.planIds === undefined ? '103-01 103-02' : opts.planIds,
    PHASE_NUMBER: opts.phaseNumber === undefined ? '103' : opts.phaseNumber,
  });
  const r = childProcess.spawnSync(shell, ['-c', block], {
    cwd: opts.cwd || fixture.repo,
    encoding: 'utf-8',
    env,
    timeout: 10000,
  });
  if (r.error) throw r.error;
  return { status: r.status === null ? -1 : r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

/** Non-empty stdout lines, for set-style assertions on a check's output. */
function lines(s: string): string[] {
  return s.split('\n').filter((l: string): boolean => l.length > 0);
}

/** `path:lineno:text` → `path`. */
function hitPaths(stdout: string): string[] {
  return lines(stdout).map((l: string): string => l.replace(/:\d+:[\s\S]*$/, ''));
}

// ─── 1. execution ──────────────────────────────────────────────────────────

describeExec('grd-code-reviewer bash blocks — execution against a real repo', () => {
  beforeEach(() => {
    fixture = makeFixture();
  });

  afterEach(() => {
    removeFixture(fixture);
  });

  describe('load_context resolves a scope', () => {
    // Parametrised over every shell present. zsh is not decoration: `for P in
    // ${PLAN_IDS}` iterated ONCE over the whole string there and resolved zero
    // commits, while passing under bash.
    test.each(SHELL_CASES)('resolves commits, files and plan ids under %s', (shell: string) => {
      const r = runBlock(one(loadContextBlocks, 'load_context'), { shell });

      expect(r.stderr).toBe('');
      expect(r.status).toBe(0);
      // Both plan ids resolved: 2 commits for 103-01 (on main) + 1 for 103-02
      // (on the unmerged branch w2, reachable only via --all).
      expect(r.stdout).toContain('commits: 3  files: 5');
      expect(r.stdout).toContain('103-01 feat(103-01): add trainer and hostile paths');
      expect(r.stdout).toContain('103-01 refactor(103-01): drop legacy shim');
      expect(r.stdout).toContain('103-02 feat(103-02): add loader');
      for (const p of PHASE_SCOPE_PATHS) expect(lines(r.stdout)).toContain(p);
      for (const p of OUT_OF_SCOPE_PATHS) expect(r.stdout).not.toContain(p);
      // The body-mention decoy ("Follow-up to (103-01) noted in review.") must not
      // be pulled in: --grep matches the whole message, so the colon is what saves it.
      expect(r.stdout).not.toContain('docs: record follow-up');
    });

    test('plan ids already carry the phase prefix — no (103-103-01) rebuild', () => {
      // The regression: `--grep="(${PHASE_NUMBER}-${P})"` yields (103-103-01) and
      // matches nothing, so a real scope resolves to zero commits and FATALs.
      const r = runBlock(one(loadContextBlocks, 'load_context'), { planIds: '103-01' });
      expect(r.status).toBe(0);
      expect(r.stdout).toContain('commits: 2  files: 4');
      expect(r.stdout).not.toContain('103-103-01');
    });

    test('scope dir is keyed by plan ids, so a wave review and a phase review do not collide', () => {
      // K2: the old key used ${WAVE}, which is interpolated into the spawn PROSE and
      // never becomes a shell variable, so both reviews landed on one directory that
      // load_context rm -rf's.
      const load = one(loadContextBlocks, 'load_context');
      const wave = runBlock(load, { planIds: '103-01' });
      const phase = runBlock(load, { planIds: '103-01 103-02' });
      const waveDir = /scope: (\S+)/.exec(wave.stdout);
      const phaseDir = /scope: (\S+)/.exec(phase.stdout);
      expect(waveDir).not.toBeNull();
      expect(phaseDir).not.toBeNull();
      expect(waveDir && waveDir[1]).not.toBe(phaseDir && phaseDir[1]);

      // The wave's scope survived the phase review that ran after it.
      const check = runBlock(one(reproCheckBlocks, 'reproducibility check'), { planIds: '103-01' });
      expect(check.status).toBe(0);
      expect(hitPaths(check.stdout).sort()).toEqual(WAVE_SCOPE_PATHS.slice().sort());
      expect(check.stdout).not.toContain('loader.py');
    });
  });

  describe('content checks read the reviewed commits', () => {
    beforeEach(() => {
      const r = runBlock(one(loadContextBlocks, 'load_context'));
      expect(r.status).toBe(0);
    });

    test('the canonical form finds a known string in every scoped file', () => {
      const block = one(canonicalCheckBlocks, 'canonical content check').replace(
        /<pattern>/g,
        'SEEDMARKER'
      );
      const r = runBlock(block);
      expect(r.stderr).toBe('');
      expect(r.status).toBe(0);
      expect(hitPaths(r.stdout).sort()).toEqual(PHASE_SCOPE_PATHS.slice().sort());
    });

    test('reproducibility check reports each scoped seed line once, with its line number', () => {
      const r = runBlock(one(reproCheckBlocks, 'reproducibility check'));
      expect(r.stderr).toBe('');
      expect(r.status).toBe(0);
      expect(lines(r.stdout)).toEqual([
        'legacy helper.py:1:legacy_seed = 3  # SEEDMARKER',
        'loader.py:2:np.random.seed(1234)  # SEEDMARKER',
        'sp ace.py:1:spaced_seed = 1  # SEEDMARKER',
        'train.py:2:random.seed(42)  # SEEDMARKER',
        'wild*card.py:1:wildcard_seed = 2  # SEEDMARKER',
      ]);
    });

    test('--literal-pathspecs keeps a glob-shaped path from dragging in a sibling (K3)', () => {
      // Control: the same check with the flag removed reports wildXcard.py, an
      // out-of-scope file this phase never touched, as one of its findings.
      const block = one(reproCheckBlocks, 'reproducibility check');
      const guarded = runBlock(block);
      const unguarded = runBlock(block.replace(/--literal-pathspecs /g, ''));

      expect(unguarded.stdout).toContain('wildXcard.py');
      expect(guarded.stdout).toContain('wild*card.py');
      expect(guarded.stdout).not.toContain('wildXcard.py');
    });

    test('a file the scope deleted is still greppable from the commit that had it', () => {
      // "legacy helper.py" does not exist in the working tree; the methodology check
      // must still find its paper reference, because git grep reads the commit's blob.
      expect(fs.existsSync(path.join(fixture.repo, 'legacy helper.py'))).toBe(false);
      const r = runBlock(one(methodCheckBlocks, 'methodology check'));
      expect(r.stderr).toBe('');
      expect(r.status).toBe(0);
      expect(lines(r.stdout)).toEqual(['legacy helper.py:2:# based on paper 2403.22222']);
    });

    test('the deviation check prints the resolved commits and paths', () => {
      const r = runBlock(one(deviationBlocks, 'deviation check'));
      expect(r.status).toBe(0);
      expect(r.stdout).toContain('103-02 feat(103-02): add loader');
      for (const p of PHASE_SCOPE_PATHS) expect(lines(r.stdout)).toContain(p);
    });

    test.each(SHELL_CASES)('every scope-consuming block runs clean under %s', (shell: string) => {
      // Generic net: any block added later that reads the scope must also survive a
      // real scope with hostile paths, without writing to stderr.
      for (const raw of scopeConsumerBlocks) {
        const r = runBlock(raw.replace(/<pattern>/g, 'SEEDMARKER'), { shell });
        expect({ shell, status: r.status, stderr: r.stderr }).toEqual({
          shell,
          status: 0,
          stderr: '',
        });
      }
    });
  });

  describe('degenerate scopes fail loudly', () => {
    test('empty PLAN_IDS exits non-zero and names the spawn bug', () => {
      const r = runBlock(one(loadContextBlocks, 'load_context'), { planIds: '' });
      expect(r.status).toBe(1);
      expect(r.stdout + r.stderr).toContain('FATAL: PLAN_IDS is empty');
    });

    test('whitespace-only PLAN_IDS is treated as empty, not as a scope', () => {
      const r = runBlock(one(loadContextBlocks, 'load_context'), { planIds: '  ,  ' });
      expect(r.status).toBe(1);
      expect(r.stdout + r.stderr).toContain('FATAL: PLAN_IDS is empty');
    });

    test('ids that match no commit exit non-zero and say to record a BLOCKER', () => {
      const r = runBlock(one(loadContextBlocks, 'load_context'), {
        planIds: '501-01',
        phaseNumber: '501',
      });
      expect(r.status).toBe(1);
      expect(r.stdout).toContain('FATAL: no commit matches (501-01)');
      expect(r.stdout).toContain('BLOCKER');
    });

    test('a plan id missing its phase prefix warns and still fails closed', () => {
      const r = runBlock(one(loadContextBlocks, 'load_context'), { planIds: '01' });
      expect(r.status).toBe(1);
      expect(r.stderr).toContain("WARNING: plan id '01' is not 103-NN");
      expect(r.stdout).toContain('FATAL: no commit matches');
    });

    test('outside a git repository it refuses to resolve a scope', () => {
      const r = runBlock(one(loadContextBlocks, 'load_context'), { cwd: fixture.notRepo });
      expect(r.status).toBe(1);
      expect(r.stdout).toContain('FATAL: not a git repository');
    });

    test.each(SCOPE_CONSUMER_CASES)(
      'scope-consuming block %s exits non-zero when load_context never ran',
      (_label: string, raw: string) => {
        // Never printing nothing and exiting 0: that reads as a completed, clean check.
        const r = runBlock(raw.replace(/<pattern>/g, 'SEEDMARKER'), { planIds: '999-99' });
        expect(r.status).not.toBe(0);
        expect(r.stdout + r.stderr).toContain('REVIEW SCOPE MISSING');
      }
    );

    test('teardown really deletes the scope, and a later check then fails closed', () => {
      const load = one(loadContextBlocks, 'load_context');
      const scope = /scope: (\S+)/.exec(runBlock(load).stdout);
      expect(scope).not.toBeNull();
      const scopeDir: string = (scope as RegExpExecArray)[1];
      expect(fs.existsSync(scopeDir)).toBe(true);

      const teardown = runBlock(one(teardownBlocks, 'teardown'));
      expect(teardown.status).toBe(0);
      expect(fs.existsSync(scopeDir)).toBe(false);

      const after = runBlock(one(reproCheckBlocks, 'reproducibility check'));
      expect(after.status).toBe(1);
      expect(after.stdout + after.stderr).toContain('REVIEW SCOPE MISSING');
    });
  });
});

// ─── 2. static invariants ──────────────────────────────────────────────────

describe('grd-code-reviewer bash blocks — static invariants', () => {
  test('the expected blocks are present exactly once each', () => {
    expect(BLOCKS.length).toBeGreaterThanOrEqual(5);
    expect(loadContextBlocks.length).toBe(1);
    expect(canonicalCheckBlocks.length).toBe(1);
    expect(reproCheckBlocks.length).toBe(1);
    expect(methodCheckBlocks.length).toBe(1);
    expect(teardownBlocks.length).toBe(1);
    expect(deviationBlocks.length).toBe(1);
    expect(contentCheckBlocks.length).toBeGreaterThanOrEqual(3);
  });

  test('no --pathspec-from-file: git grep has no such flag, paths go in argv after --', () => {
    for (const code of CODE) expect(code).not.toContain('--pathspec-from-file');
  });

  test('no `xargs -a`: it is a GNU extension, absent on macOS', () => {
    for (const code of CODE) expect(code).not.toMatch(/\bxargs\b[^\n|]*\s-a\b/);
  });

  test('no unquoted `for X in ${VAR}`: zsh does not word-split a parameter expansion', () => {
    for (const code of CODE) expect(code).not.toMatch(/\bfor\s+\w+\s+in\s+\$\{?[A-Za-z_]/);
  });

  test('every `git log --grep` for a plan id carries --all', () => {
    // Under worktree isolation a wave's commits sit on an unmerged branch; without
    // --all the review silently resolves zero of them.
    const logLines = CODE.join('\n')
      .split('\n')
      .filter((l: string): boolean => /\bgit log\b/.test(l));
    expect(logLines.length).toBeGreaterThan(0);
    for (const l of logLines) {
      expect(l).toContain('--all');
      expect(l).toContain('--grep=');
    }
  });

  test('no plan id is rebuilt with the phase prefix — ids already carry it', () => {
    for (const code of CODE) expect(code).not.toMatch(/\$\{?PHASE_NUMBER\}?-\$\{?P\b/);
  });

  test('content checks never silence stderr', () => {
    // A silenced malformed invocation produces no hits and is indistinguishable
    // from a clean pass.
    for (const b of scopeConsumerBlocks.concat(loadContextBlocks)) {
      const code = executableLines(b).join('\n');
      expect(code).not.toContain('2>/dev/null');
      expect(code).not.toContain('2>&-');
    }
  });

  test('every git grep uses --literal-pathspecs and reads paths NUL-delimited', () => {
    for (const b of contentCheckBlocks) {
      const code = executableLines(b).join('\n');
      expect(code).toContain('--literal-pathspecs');
      expect(code).toContain('core.quotePath=false');
      expect(code).toContain('xargs -0');
    }
  });

  test('every scope consumer re-derives SCOPE_DIR and guards it', () => {
    // Shell state does not survive between Bash tool calls, so a block that assumed
    // SCOPE_DIR was still set would run `grep -r` with no path operand over the
    // whole repository and read as a completed check.
    for (const b of scopeConsumerBlocks) {
      const code = executableLines(b).join('\n');
      expect(code).toContain('KEY=$(printf');
      expect(code).toMatch(/SCOPE_DIR="\$\{TMPDIR:-\/tmp\}\/grd-review-\$KEY"/);
      expect(code).toMatch(/\[ -s "\$SCOPE_DIR\/(changed|commits)" \]/);
      expect(code).toContain('exit 1');
    }
  });
});
