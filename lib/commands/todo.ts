'use strict';

/** GRD Commands/Todo -- Todo list management and completion operations */


const fs = require('fs');
const path = require('path');

const {
  output,
  error,
}: {
  output: (result: unknown, raw: boolean, rawValue?: unknown) => never;
  error: (message: string) => never;
} = require('../utils');
const {
  todosDir: getTodosDirPath,
  currentMilestone,
}: {
  todosDir: (cwd: string) => string;
  currentMilestone: (cwd: string) => string;
} = require('../paths');

// ─── Domain Types ────────────────────────────────────────────────────────────

/** A single todo item parsed from the pending directory. */
interface TodoItem {
  file: string;
  created: string;
  title: string;
  area: string;
  path: string;
}

/** Result of listing todos. */
interface TodoListResult {
  count: number;
  todos: TodoItem[];
  milestone_version: string;
}

// ─── List Todos ──────────────────────────────────────────────────────────────

/**
 * CLI command: List pending todo files in .planning/todos/ with optional area filter.
 * @param cwd - Project working directory
 * @param area - Area filter (e.g., 'general'), or null for all todos
 * @param raw - Output raw count string instead of JSON
 */
function cmdListTodos(cwd: string, area: string | null, raw: boolean): void {
  const pendingDir: string = path.join(getTodosDirPath(cwd), 'pending');

  let count = 0;
  const todos: TodoItem[] = [];

  try {
    const files: string[] = fs.readdirSync(pendingDir).filter((f: string) => f.endsWith('.md')).sort();

    for (const file of files) {
      try {
        const content: string = fs.readFileSync(path.join(pendingDir, file), 'utf-8');
        const createdMatch: RegExpMatchArray | null = content.match(/^created:\s*(.+)$/m);
        const titleMatch: RegExpMatchArray | null = content.match(/^title:\s*(.+)$/m);
        const areaMatch: RegExpMatchArray | null = content.match(/^area:\s*(.+)$/m);

        const todoArea: string = areaMatch ? areaMatch[1].trim() : 'general';

        // Apply area filter if specified
        if (area && todoArea !== area) continue;

        count++;
        todos.push({
          file,
          created: createdMatch ? createdMatch[1].trim() : 'unknown',
          title: titleMatch ? titleMatch[1].trim() : 'Untitled',
          area: todoArea,
          path: path.relative(cwd, path.join(pendingDir, file)),
        });
      } catch (readErr: unknown) {
        const err = readErr as { code?: string; message?: string };
        if (err && err.code && err.code !== 'ENOENT') {
          process.stderr.write(`[todos] error reading ${file} (${err.code}): ${err.message}\n`);
        }
      }
    }
  } catch {
    // Todos directory may not exist yet; proceed with empty list
  }

  const milestoneVersion: string = currentMilestone(cwd);
  const result: TodoListResult = { count, todos, milestone_version: milestoneVersion };
  output(result, raw, count.toString());
}

// ─── Complete Todo ───────────────────────────────────────────────────────────

/**
 * CLI command: Mark a todo file as completed by moving it from pending to completed directory.
 * @param cwd - Project working directory
 * @param filename - Name of the todo file to complete
 * @param raw - Output raw 'completed' string instead of JSON
 * @param dryRun - If true, preview changes without writing
 */
function cmdTodoComplete(cwd: string, filename: string, raw: boolean, dryRun?: boolean): void {
  if (!filename) {
    error(
      'filename required for todo complete. Usage: todos complete <filename> (run "todos list" to see pending filenames)'
    );
    return;
  }

  const pendingDir: string = path.join(getTodosDirPath(cwd), 'pending');
  const completedDir: string = path.join(getTodosDirPath(cwd), 'completed');
  const sourcePath: string = path.join(pendingDir, filename);

  if (!fs.existsSync(sourcePath)) {
    error(`Todo not found: ${filename}`);
    return;
  }

  const today: string = new Date().toISOString().split('T')[0];

  if (dryRun) {
    output(
      {
        dry_run: true,
        would_complete: filename,
        source: path.relative(cwd, sourcePath),
        destination: path.relative(cwd, path.join(completedDir, filename)),
        date: today,
      },
      raw,
      `dry-run: would complete ${filename}`
    );
    return;
  }

  // Ensure completed directory exists
  fs.mkdirSync(completedDir, { recursive: true });

  const destPath = path.join(completedDir, filename);

  const content: string = fs.readFileSync(sourcePath, 'utf-8');
  // Write to dest first so source is untouched if the write fails
  fs.writeFileSync(destPath, `completed: ${today}\n` + content, 'utf-8');
  fs.unlinkSync(sourcePath);

  output({ completed: true, file: filename, date: today }, raw, 'completed');
}

// ─── Rank Todos ──────────────────────────────────────────────────────────────

/** A scored todo item for ranked output. */
interface RankedTodo {
  rank: number;
  score: number;
  file: string;
  title: string;
  area: string;
  milestone: string;
  signals: string[];
}

/** High-value keyword signals (security, perf, user-facing score highest). */
const HIGH_VALUE_KEYWORDS = /\b(security|auth|perf|performance|user.facing|critical|export|import|diagnos|audit|rank|visual|bundle|research)\b/i;
const MED_VALUE_KEYWORDS = /\b(test|fix|bug|error|fail|slow|memory|cache|refactor)\b/i;

/**
 * CLI command: Rank pending todos by keyword signal, title quality, and milestone age.
 *
 * Scans all .planning/milestones/{milestone}/todos/pending/ directories.
 * Scores each todo by:
 *   - High-value keywords: +3 per match (security, perf, user-facing, etc.)
 *   - Medium-value keywords: +1 per match (fix, bug, error, etc.)
 *   - Title clarity (longer than 10 chars): +1
 *   - Problem/Solution sections present: +1 each
 *
 * @param cwd - Project working directory
 * @param raw - Output raw text instead of JSON
 * @param topN - How many results to return (default 20, 0 = all)
 */
function cmdTodosRank(cwd: string, raw: boolean, topN?: number): void {
  const limit = topN !== undefined ? topN : 20;
  const milestonesBase = path.join(cwd, '.planning', 'milestones');
  const ranked: RankedTodo[] = [];

  let msDirs: string[] = [];
  try {
    msDirs = (fs.readdirSync(milestonesBase) as string[]).filter((d) => {
      try {
        return fs.statSync(path.join(milestonesBase, d)).isDirectory();
      } catch {
        return false;
      }
    });
  } catch {
    // milestones dir doesn't exist
  }

  for (const ms of msDirs) {
    const pendingDir = path.join(milestonesBase, ms, 'todos', 'pending');
    let files: string[];
    try {
      files = (fs.readdirSync(pendingDir) as string[]).filter((f: string) => f.endsWith('.md'));
    } catch {
      continue;
    }

    for (const file of files) {
      try {
        const content: string = fs.readFileSync(path.join(pendingDir, file), 'utf-8');
        const titleMatch = content.match(/^title:\s*(.+)$/m);
        const areaMatch = content.match(/^area:\s*(.+)$/m);
        const title = titleMatch ? titleMatch[1].trim() : file;
        const area = areaMatch ? areaMatch[1].trim() : 'general';

        const searchText = `${title} ${content}`;
        const signals: string[] = [];
        let score = 0;

        // Keyword scoring
        const highMatches = searchText.match(HIGH_VALUE_KEYWORDS);
        if (highMatches) {
          const unique = [...new Set(highMatches.map((m) => m.toLowerCase()))];
          score += unique.length * 3;
          signals.push(...unique.map((k) => `+3 (${k})`));
        }
        const medMatches = searchText.match(MED_VALUE_KEYWORDS);
        if (medMatches) {
          const unique = [...new Set(medMatches.map((m) => m.toLowerCase()))];
          score += unique.length;
          signals.push(...unique.map((k) => `+1 (${k})`));
        }

        // Title clarity
        if (title.length > 10) { score += 1; signals.push('+1 (clear title)'); }

        // Sections present
        if (/^##\s+Problem/m.test(content)) { score += 1; signals.push('+1 (has Problem)'); }
        if (/^##\s+Solution/m.test(content)) { score += 1; signals.push('+1 (has Solution)'); }

        ranked.push({ rank: 0, score, file, title, area, milestone: ms, signals });
      } catch {
        // skip unreadable files
      }
    }
  }

  // Sort descending by score
  ranked.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));

  const results = (limit > 0 ? ranked.slice(0, limit) : ranked).map((t, i) => ({
    ...t,
    rank: i + 1,
  }));

  output(
    { total_scanned: ranked.length, returned: results.length, todos: results },
    raw,
    `${results.length} of ${ranked.length} todos ranked`
  );
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  cmdListTodos,
  cmdTodoComplete,
  cmdTodosRank,
};
