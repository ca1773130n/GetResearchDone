/** GRD Commands/Todo -- Todo list management and completion operations */

'use strict';

const fs = require('fs');
const path = require('path');

const { output, error }: {
  output: (result: unknown, raw: boolean, rawValue?: unknown) => never;
  error: (message: string) => never;
} = require('../utils');
const { todosDir: getTodosDirPath }: {
  todosDir: (cwd: string) => string;
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
    const files: string[] = fs
      .readdirSync(pendingDir)
      .filter((f: string) => f.endsWith('.md'));

    for (const file of files) {
      try {
        const content: string = fs.readFileSync(
          path.join(pendingDir, file),
          'utf-8'
        );
        const createdMatch: RegExpMatchArray | null =
          content.match(/^created:\s*(.+)$/m);
        const titleMatch: RegExpMatchArray | null =
          content.match(/^title:\s*(.+)$/m);
        const areaMatch: RegExpMatchArray | null =
          content.match(/^area:\s*(.+)$/m);

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
          process.stderr.write(
            `[todos] error reading ${file} (${err.code}): ${err.message}\n`
          );
        }
      }
    }
  } catch {
    // Todos directory may not exist yet; proceed with empty list
  }

  const result: TodoListResult = { count, todos };
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
function cmdTodoComplete(
  cwd: string,
  filename: string,
  raw: boolean,
  dryRun?: boolean
): void {
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

  // Read, add completion timestamp, move
  let content: string = fs.readFileSync(sourcePath, 'utf-8');
  content = `completed: ${today}\n` + content;

  fs.writeFileSync(path.join(completedDir, filename), content, 'utf-8');
  fs.unlinkSync(sourcePath);

  output({ completed: true, file: filename, date: today }, raw, 'completed');
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  cmdListTodos,
  cmdTodoComplete,
};
