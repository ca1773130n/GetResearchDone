/**
 * Unit tests for commands/*.md: the /grd: catalog in help.md, and the one
 * cross-file agreement between command files that a reader cannot check by
 * eye (the pause/resume handoff filename).
 *
 * help.md is hand-authored on purpose — its category grouping, workflow
 * diagram and quick start are curation a generator would flatten. So the
 * catalog is kept honest by invalidation rather than by regeneration: these
 * two assertions pin both directions of the mapping between commands/*.md
 * and the catalog, and fail naming the command that drifted.
 *
 * Both sets are derived from the filesystem. Never hardcode a command name
 * or a count here — that is the drift this test exists to catch.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const COMMANDS_DIR = path.join(__dirname, '..', '..', 'commands');
const HELP_PATH = path.join(COMMANDS_DIR, 'help.md');
const TOKEN_PREFIX = '/grd:';

/** Escape a command name for embedding in a RegExp source. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * True when help.md advertises `/grd:<name>` as a whole token.
 *
 * The right boundary is load-bearing. A bare-basename or plain-prefix match
 * lets a command whose name is a prefix of another pass vacuously:
 * `/grd:deep-research` would satisfy `research`, and `/grd:discuss-phase`
 * would satisfy `discuss`.
 */
function advertisesCommand(help: string, name: string): boolean {
  return new RegExp(TOKEN_PREFIX + escapeRegExp(name) + '(?![A-Za-z0-9_-])').test(help);
}

/** Every `/grd:<name>` token in `text`, deduped and sorted. Placeholders
 *  like `/grd:{command}` carry no name and are skipped by the character
 *  class. */
function commandTokens(text: string): string[] {
  const matches: string[] = text.match(/\/grd:[A-Za-z0-9_-]+/g) || [];
  return Array.from(new Set(matches.map((t: string) => t.slice(TOKEN_PREFIX.length)))).sort();
}

describe('commands/help.md command catalog', () => {
  const commandNames: string[] = fs
    .readdirSync(COMMANDS_DIR)
    .filter((file: string) => file.endsWith('.md'))
    .map((file: string) => file.slice(0, -'.md'.length))
    .sort();
  const help: string = fs.readFileSync(HELP_PATH, 'utf-8');

  test('every commands/*.md file is advertised in help.md', () => {
    const missing = commandNames.filter((name: string) => !advertisesCommand(help, name));
    // Compared as a joined string, not a length: the failure output has to
    // name the command that is absent, not just report how many are.
    expect(missing.join(', ')).toBe('');
  });

  test('every /grd:<name> in help.md resolves to a commands/<name>.md file', () => {
    const phantom = commandTokens(help).filter((name: string) => !commandNames.includes(name));
    // Same reason: a phantom command has to be named to be fixable.
    expect(phantom.join(', ')).toBe('');
  });
});

/**
 * pause-work.md writes a handoff file; resume-project.md goes looking for it with a shell
 * glob. Shell glob expansion is case-sensitive independently of the filesystem: executed on
 * this machine, whose APFS volume is case-INsensitive, a lowercased `.continue-here` glob
 * against a real `.CONTINUE-HERE.md` returns "No such file or directory" in bash and sh and
 * "no matches found" in zsh. So a casing difference between the two files silently breaks
 * resume — and a `2>` redirect to /dev/null swallows the only evidence. The expected spelling
 * is DERIVED from the file that WRITES the handoff, never hardcoded here.
 */
describe('commands/ pause ⇄ resume handoff filename', () => {
  const HANDOFF_RE = /[A-Za-z-]*continue-here[A-Za-z-]*/gi;

  const written: string[] = fs.readFileSync(path.join(COMMANDS_DIR, 'pause-work.md'), 'utf-8')
    .match(HANDOFF_RE) || [];

  test('pause-work.md names exactly one handoff spelling', () => {
    expect(Array.from(new Set(written)).join(', ')).toBe('CONTINUE-HERE');
  });

  test('every commands/*.md mention uses the spelling pause-work.md writes', () => {
    const expected = written[0];
    const offenders: string[] = [];
    for (const file of fs.readdirSync(COMMANDS_DIR).filter((f: string) => f.endsWith('.md'))) {
      const found: string[] = fs.readFileSync(path.join(COMMANDS_DIR, file), 'utf-8').match(HANDOFF_RE) || [];
      for (const token of found) if (token !== expected) offenders.push(`${file}: ${token}`);
    }
    // Named, not counted — a casing drift is only fixable if the file is identified.
    expect(offenders.join(', ')).toBe('');
  });
});
