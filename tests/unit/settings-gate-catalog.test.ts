'use strict';

/**
 * The settings gate catalog, asserted in both directions.
 *
 * `gd settings` draws a box of research and confirmation gates and documents
 * each one with a default. Nine of them are read by nothing: setting
 * `confirmation_gates.file_deletion: true` does not make anything confirm
 * before deleting a file. YOLO mode faithfully snapshots and restores them, so
 * the plumbing all works — there is simply no consumer at the end of it.
 *
 * That is the failure mode this repository keeps hitting: a value that crosses
 * a boundary and is read by nothing, with nothing red to show for it. Here it
 * is worse than inert, because a gate that appears in a safety UI and does
 * nothing reads as protection that is not there.
 *
 * Rather than silently deleting user-facing config or inventing nine
 * interactive pauses, `commands/settings.md` names the unwired gates in a
 * marked block and this test holds that list honest, the same way
 * `help-catalog.test.ts` holds the command list honest:
 *
 *   - a gate documented in settings.md must either HAVE a consumer or be
 *     listed as unwired;
 *   - a gate listed as unwired must have NO consumer.
 *
 * So wiring one up turns the build red until it leaves the list, and adding a
 * gate to the UI without a consumer turns it red until it joins the list.
 * Neither direction can drift silently.
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const SETTINGS = path.join(ROOT, 'commands/settings.md');

/**
 * Files that mention a gate name without ever branching on it: the settings UI
 * itself, the config scaffolder, and the init template. They write defaults
 * into a fresh `.planning/config.json` and nothing more, so counting them as
 * consumers would let every gate look wired.
 */
const NON_CONSUMERS = new Set([
  'commands/settings.md',
  'commands/init.md',
  'lib/commands/config.ts',
]);

const SEARCH_DIRS = ['commands', 'lib', 'bin', 'agents'];

function walk(dir: string): string[] {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'vendor') continue;
      out.push(...walk(rel));
    } else if (/\.(ts|js|md|py)$/.test(entry.name)) {
      out.push(rel);
    }
  }
  return out;
}

const ALL_FILES = SEARCH_DIRS.flatMap(walk).filter((f) => !NON_CONSUMERS.has(f));

/**
 * Every gate the settings UI offers, from BOTH places it names them:
 *
 *   - the dotted prose form, ``research_gates.verification_design``;
 *   - the drawn box, where they appear bare as `survey_approval: {on/off}`.
 *
 * Six gates appear only in the box. Parsing the dotted form alone silently
 * skipped them and left this suite asserting over a subset while looking
 * complete — the same vacuous-check shape the catalog exists to prevent.
 */
function documentedGates(md: string): string[] {
  const found = new Set<string>();
  for (const m of md.matchAll(/`(?:research_gates|confirmation_gates)\.([a-z_]+)`/g)) {
    // Skip the interactive sub-tree: a nested object with its own consumers
    // and its own tests, not a boolean toggle in this box.
    if (m[1] !== 'interactive') found.add(m[1]);
  }
  for (const m of md.matchAll(/^\s*║\s+([a-z_]+):\s*\{on\/off\}/gm)) {
    found.add(m[1]);
  }
  return [...found].sort();
}

/** The gate names inside the UNWIRED-GATES markers. */
function declaredUnwired(md: string): string[] {
  const block = md.match(
    /<!-- UNWIRED-GATES:START -->([\s\S]*?)<!-- UNWIRED-GATES:END -->/
  );
  if (!block) throw new Error('UNWIRED-GATES markers missing from commands/settings.md');
  return [...block[1].matchAll(/`(?:research_gates|confirmation_gates)\.([a-z_]+)`/g)]
    .map((m) => m[1])
    .sort();
}

/** Files that name this gate outside the UI/scaffolding set. */
function consumersOf(gate: string): string[] {
  const re = new RegExp(`\\b${gate}\\b`);
  return ALL_FILES.filter((f) => re.test(fs.readFileSync(path.join(ROOT, f), 'utf8')));
}

describe('settings gate catalog', () => {
  const md = fs.readFileSync(SETTINGS, 'utf8');
  const documented = documentedGates(md);
  const unwired = new Set(declaredUnwired(md));

  it('finds gates to check', () => {
    // Guards the parser: a regex that silently matches nothing would make
    // every assertion below vacuous.
    expect(documented.length).toBeGreaterThanOrEqual(14);
    expect(unwired.size).toBeGreaterThan(0);
  });

  it('every gate listed as unwired is documented in the settings UI', () => {
    const orphans = [...unwired].filter((g) => !documented.includes(g));
    expect(orphans).toEqual([]);
  });

  it.each(
    // one row per documented gate
    (() => documentedGates(fs.readFileSync(SETTINGS, 'utf8')).map((g) => [g]))()
  )('gate %s is either consumed or declared unwired', (gate: string) => {
    const consumers = consumersOf(gate);
    if (unwired.has(gate)) {
      // Declared dead: it must still be dead. Wiring it up without removing it
      // from the list would leave the catalog lying in the other direction.
      // The gate name is folded into the compared value so a failure names it.
      expect({ gate, consumers, hint: 'now read — remove it from UNWIRED-GATES' })
        .toEqual({ gate, consumers: [], hint: 'now read — remove it from UNWIRED-GATES' });
    } else {
      // Claimed live: something must actually read it.
      expect({ gate, consumed: consumers.length > 0, hint: 'wire it up or list it in UNWIRED-GATES' })
        .toEqual({ gate, consumed: true, hint: 'wire it up or list it in UNWIRED-GATES' });
    }
  });
});
