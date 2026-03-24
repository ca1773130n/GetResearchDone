'use strict';

/**
 * GRD Wireup -- Discovery engine
 *
 * Pure filesystem-based analysis to identify features that exist in the codebase
 * but lack full integration. Includes both GRD-internal scanners and application-aware
 * scanners that discover routes, exports, models, and components in target projects.
 *
 * IMPORTANT: No child process spawn or exec calls. Uses only fs.readFileSync /
 * fs.readdirSync for all analysis.
 *
 * @dependencies ./types, ../utils, ../paths
 */

import type { UnwiredFeature, UnwiredFeatureCategory } from './types';

const fs = require('fs');
const path = require('path');
const {
  safeReadFile,
}: {
  safeReadFile: (filePath: string) => string | null;
} = require('../utils');

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Recursively collect all files under a directory matching given extensions.
 * Returns absolute paths.
 */
function _collectFiles(dir: string, extensions: string[]): string[] {
  const results: string[] = [];
  let entries: ReturnType<typeof fs.readdirSync>;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries as Array<{
    name: string;
    isFile: () => boolean;
    isDirectory: () => boolean;
  }>) {
    const fullPath: string = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      results.push(..._collectFiles(fullPath, extensions));
    } else if (entry.isFile()) {
      const ext: string = path.extname(entry.name);
      if (extensions.includes(ext)) {
        results.push(fullPath);
      }
    }
  }
  return results;
}

/**
 * Extract exported function/value names from a TypeScript/JavaScript source file.
 *
 * Handles CJS and ES module patterns:
 * - module.exports = { name1, name2, ... }
 * - exports.name = ...
 * - export function name / export const name / export class name
 * - export default function name
 */
function _extractExports(content: string): string[] {
  const names: string[] = [];

  // Pattern 1: module.exports = { name1, name2, ... }
  const moduleExportMatch: RegExpMatchArray | null = content.match(
    /module\.exports\s*=\s*\{([^}]+)\}/
  );
  if (moduleExportMatch) {
    const inner: string = moduleExportMatch[1];
    const parts: string[] = inner.split(',');
    for (const part of parts) {
      const trimmed: string = part.trim();
      if (!trimmed) continue;
      const colonIdx: number = trimmed.indexOf(':');
      const name: string = colonIdx >= 0 ? trimmed.slice(0, colonIdx).trim() : trimmed;
      if (/^\w+$/.test(name)) {
        names.push(name);
      }
    }
  }

  // Pattern 2: exports.name = ...
  const exportsPattern: RegExp = /\bexports\.(\w+)\s*=/g;
  let match: RegExpExecArray | null;
  while ((match = exportsPattern.exec(content)) !== null) {
    if (!names.includes(match[1])) {
      names.push(match[1]);
    }
  }

  // Pattern 3: ES module exports — export [async] function/const/class/let/var name
  const esExportPattern: RegExp = /export\s+(?:async\s+)?(?:function|const|class|let|var)\s+(\w+)/g;
  while ((match = esExportPattern.exec(content)) !== null) {
    if (!names.includes(match[1])) {
      names.push(match[1]);
    }
  }

  // Pattern 4: export default function name (skip anonymous defaults)
  const defaultExportPattern: RegExp = /export\s+default\s+(?:async\s+)?(?:function|class)\s+(\w+)/g;
  while ((match = defaultExportPattern.exec(content)) !== null) {
    if (match[1] !== 'default' && !names.includes(match[1])) {
      names.push(match[1]);
    }
  }

  return names;
}

// ─── Scanner: exported-but-uncalled ─────────────────────────────────────────

/**
 * Scan lib/*.ts files for exported functions that are never called/imported
 * in lib/, bin/, or commands/.
 */
function scanExportedButUncalled(cwd: string): UnwiredFeature[] {
  const libDir: string = path.join(cwd, 'lib');
  const binDir: string = path.join(cwd, 'bin');
  const commandsDir: string = path.join(cwd, 'commands');

  let libEntries: ReturnType<typeof fs.readdirSync>;
  try {
    libEntries = fs.readdirSync(libDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const libFiles: string[] = (
    libEntries as Array<{ name: string; isFile: () => boolean; isDirectory: () => boolean }>
  )
    .filter(
      (e: { name: string; isFile: () => boolean }) => e.isFile() && e.name.endsWith('.ts')
    )
    .map((e: { name: string }) => path.join(libDir, e.name));

  const exportMap: Map<string, string> = new Map();
  const fileContents: Map<string, string> = new Map();

  for (const filePath of libFiles) {
    const content: string | null = safeReadFile(filePath);
    if (!content) continue;
    fileContents.set(filePath, content);
    const relPath: string = path.relative(cwd, filePath);
    const exportedNames: string[] = _extractExports(content);
    for (const name of exportedNames) {
      if (!exportMap.has(name)) {
        exportMap.set(name, relPath);
      }
    }
  }

  const searchFiles: string[] = [
    ..._collectFiles(libDir, ['.ts', '.js', '.md']),
    ..._collectFiles(binDir, ['.ts', '.js', '.md']),
    ..._collectFiles(commandsDir, ['.ts', '.js', '.md']),
  ];

  const features: UnwiredFeature[] = [];

  for (const [funcName, relFilePath] of exportMap) {
    const absFilePath: string = path.join(cwd, relFilePath);
    let referenced: boolean = false;

    for (const searchFile of searchFiles) {
      if (path.resolve(searchFile) === path.resolve(absFilePath)) continue;
      const content: string | null = safeReadFile(searchFile);
      if (!content) continue;
      if (new RegExp(`\\b${funcName}\\b`).test(content)) {
        referenced = true;
        break;
      }
    }

    if (!referenced) {
      features.push({
        category: 'exported-but-uncalled' as UnwiredFeatureCategory,
        filePath: relFilePath,
        functionName: funcName,
        suggestedAction: 'Add call site in a command, route, or test',
      });
    }
  }

  return features;
}

// ─── Scanner: config-without-surface ────────────────────────────────────────

/**
 * Scan .planning/config.json for top-level config keys that are not referenced
 * in commands/*.md or bin/*.ts.
 */
function scanConfigWithoutSurface(cwd: string): UnwiredFeature[] {
  const configPath: string = path.join(cwd, '.planning', 'config.json');
  const content: string | null = safeReadFile(configPath);
  if (!content) return [];

  let configObj: Record<string, unknown>;
  try {
    configObj = JSON.parse(content) as Record<string, unknown>;
  } catch {
    return [];
  }

  const configKeys: string[] = Object.keys(configObj);
  if (configKeys.length === 0) return [];

  const searchDirs: Array<{ dir: string; exts: string[] }> = [
    { dir: path.join(cwd, 'commands'), exts: ['.md'] },
    { dir: path.join(cwd, 'bin'), exts: ['.ts', '.js'] },
    { dir: path.join(cwd, 'lib'), exts: ['.ts', '.js'] },
    { dir: path.join(cwd, 'src'), exts: ['.ts', '.js'] },
  ];
  const searchFiles: string[] = [];

  for (const { dir, exts } of searchDirs) {
    try {
      fs.readdirSync(dir);
      searchFiles.push(..._collectFiles(dir, exts));
    } catch {
      // dir doesn't exist
    }
  }

  const combinedContent: string = searchFiles
    .map((f) => safeReadFile(f) || '')
    .join('\n');

  const features: UnwiredFeature[] = [];

  for (const key of configKeys) {
    if (key.startsWith('_')) continue;
    if (!new RegExp(`\\b${key}\\b`).test(combinedContent)) {
      features.push({
        category: 'config-without-surface' as UnwiredFeatureCategory,
        filePath: '.planning/config.json',
        functionName: key,
        suggestedAction: 'Expose via CLI flag, command option, or settings UI',
      });
    }
  }

  return features;
}

// ─── Scanner: endpoint-without-integration-test ──────────────────────────────

/**
 * Scan lib/mcp-server.ts for registered MCP tool names and check if they
 * are referenced in tests/integration/.
 */
function scanEndpointsWithoutTests(cwd: string): UnwiredFeature[] {
  const serverPath: string = path.join(cwd, 'lib', 'mcp-server.ts');
  const content: string | null = safeReadFile(serverPath);
  if (!content) return [];

  const toolNamePattern: RegExp = /name:\s*['"](\w+)['"]/g;
  const toolNames: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = toolNamePattern.exec(content)) !== null) {
    const name: string = match[1];
    if (name.startsWith('grd_') && !toolNames.includes(name)) {
      toolNames.push(name);
    }
  }

  if (toolNames.length === 0) return [];

  const integrationDir: string = path.join(cwd, 'tests', 'integration');
  const integrationFiles: string[] = _collectFiles(integrationDir, ['.ts', '.js']);

  const combinedIntegration: string = integrationFiles
    .map((f) => safeReadFile(f) || '')
    .join('\n');

  const features: UnwiredFeature[] = [];

  for (const toolName of toolNames) {
    if (!combinedIntegration.includes(toolName)) {
      features.push({
        category: 'endpoint-without-integration-test' as UnwiredFeatureCategory,
        filePath: 'lib/mcp-server.ts',
        functionName: toolName,
        suggestedAction: 'Add integration test covering this endpoint',
      });
    }
  }

  return features;
}

// ─── Application-Aware Scanners ──────────────────────────────────────────────

/** Directories to skip when scanning for application source code. */
const SKIP_DIRS: Set<string> = new Set([
  'node_modules', '.git', '.planning', '.claude-plugin', 'dist', 'build', 'out',
  'coverage', '.next', '.nuxt', '.svelte-kit', '__pycache__', '.venv', 'venv',
  'vendor', 'target', '.cache', '.turbo', '.vercel', '.output',
  // GRD-internal directories — skip so we don't double-count with GRD scanners
  'agents', 'commands', 'templates', 'examples', 'docs', 'references',
]);

/**
 * Detect source directories in the project by scanning all top-level directories
 * and filtering out infrastructure/config dirs. This is NOT a whitelist — any
 * directory that contains .ts/.js/.tsx/.jsx files is a candidate.
 */
function _detectAppSourceDirs(cwd: string): string[] {
  const found: string[] = [];
  let entries: ReturnType<typeof fs.readdirSync>;
  try {
    entries = fs.readdirSync(cwd, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries as Array<{
    name: string;
    isFile: () => boolean;
    isDirectory: () => boolean;
  }>) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('.')) continue;
    if (SKIP_DIRS.has(entry.name)) continue;
    // Check if this dir contains at least one source file (quick heuristic)
    const dirPath: string = path.join(cwd, entry.name);
    const files: string[] = _collectFiles(dirPath, ['.ts', '.js', '.tsx', '.jsx']);
    if (files.length > 0) {
      found.push(entry.name);
    }
  }
  return found;
}

// ─── Route pattern definitions ───────────────────────────────────────────────

interface RouteMatch {
  method: string;
  route: string;
  filePath: string;
}

/**
 * Extract route registrations from Express/Fastify/Hono-style source files.
 *
 * Detects patterns like:
 *   app.get('/path', handler)
 *   router.post('/path', handler)
 *   export async function GET(req)  — Next.js App Router
 *   @Get('/path') — NestJS
 */
function _extractRoutes(content: string, filePath: string): RouteMatch[] {
  const routes: RouteMatch[] = [];

  // Express/Fastify/Hono: app.method('/path', ...) or router.method('/path', ...)
  const expressPattern: RegExp =
    /(?:app|router|server|fastify|hono)\s*\.\s*(get|post|put|patch|delete|all|use)\s*\(\s*['"`]([^'"`]+)['"`]/gi;
  let match: RegExpExecArray | null;
  while ((match = expressPattern.exec(content)) !== null) {
    routes.push({ method: match[1].toUpperCase(), route: match[2], filePath });
  }

  // Next.js App Router: export async function GET/POST/PUT/DELETE/PATCH
  const nextAppPattern: RegExp =
    /export\s+(?:async\s+)?function\s+(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\s*\(/gi;
  while ((match = nextAppPattern.exec(content)) !== null) {
    const routePath: string = _filePathToRoute(filePath);
    routes.push({ method: match[1].toUpperCase(), route: routePath, filePath });
  }

  // Decorator patterns: @Get('/path'), @Post('/path') etc (NestJS)
  const decoratorPattern: RegExp =
    /@(Get|Post|Put|Patch|Delete)\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/gi;
  while ((match = decoratorPattern.exec(content)) !== null) {
    routes.push({ method: match[1].toUpperCase(), route: match[2], filePath });
  }

  return routes;
}

/**
 * Convert a file path like `app/api/users/route.ts` or `pages/api/users.ts`
 * to a route path like `/api/users`.
 */
function _filePathToRoute(filePath: string): string {
  let route: string = filePath
    .replace(/\\/g, '/')
    .replace(/^.*?\b(app|pages)\//, '/')
    .replace(/\/route\.(ts|js|tsx|jsx)$/, '')
    .replace(/\.(ts|js|tsx|jsx)$/, '')
    .replace(/\/index$/, '');
  if (!route.startsWith('/')) route = '/' + route;
  return route;
}

/**
 * Scan for application routes/endpoints that have no corresponding test file.
 */
function scanAppRoutes(cwd: string): UnwiredFeature[] {
  const features: UnwiredFeature[] = [];
  const appDirs: string[] = _detectAppSourceDirs(cwd);
  if (appDirs.length === 0) return features;

  // Collect all source files from app directories
  const sourceFiles: string[] = [];
  for (const dir of appDirs) {
    sourceFiles.push(..._collectFiles(path.join(cwd, dir), ['.ts', '.js', '.tsx', '.jsx']));
  }

  // Also check root-level route files
  const rootFiles: string[] = ['routes.ts', 'routes.js', 'server.ts', 'server.js'];
  for (const file of rootFiles) {
    const fullPath: string = path.join(cwd, file);
    try {
      if (fs.statSync(fullPath).isFile()) sourceFiles.push(fullPath);
    } catch {
      // doesn't exist
    }
  }

  // Extract routes from all source files
  const allRoutes: RouteMatch[] = [];
  for (const file of sourceFiles) {
    const content: string | null = safeReadFile(file);
    if (!content) continue;
    const relPath: string = path.relative(cwd, file);
    allRoutes.push(..._extractRoutes(content, relPath));
  }

  if (allRoutes.length === 0) return features;

  // Collect test files
  const testDirs: string[] = ['tests', 'test', '__tests__', 'spec'];
  const testFiles: string[] = [];
  for (const dir of testDirs) {
    testFiles.push(..._collectFiles(path.join(cwd, dir), ['.ts', '.js', '.tsx', '.jsx']));
  }
  // Also collect *.test.* and *.spec.* from source dirs
  for (const dir of appDirs) {
    const allFiles: string[] = _collectFiles(path.join(cwd, dir), ['.ts', '.js', '.tsx', '.jsx']);
    for (const f of allFiles) {
      const basename: string = path.basename(f);
      if (basename.includes('.test.') || basename.includes('.spec.')) {
        testFiles.push(f);
      }
    }
  }

  const combinedTests: string = testFiles
    .map((f) => safeReadFile(f) || '')
    .join('\n');

  // Check each route for test coverage
  const seen: Set<string> = new Set();
  for (const route of allRoutes) {
    const key: string = `${route.method} ${route.route}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const routeEscaped: string = route.route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const routeReferenced: boolean =
      new RegExp(routeEscaped).test(combinedTests) ||
      combinedTests.includes(route.route);

    if (!routeReferenced) {
      features.push({
        category: 'app-route-without-test' as UnwiredFeatureCategory,
        filePath: route.filePath,
        functionName: `${route.method} ${route.route}`,
        suggestedAction: `Add integration test for ${route.method} ${route.route}`,
      });
    }
  }

  return features;
}

/**
 * Scan src/ (or similar) for exported functions/classes that are never imported
 * anywhere in the project.
 */
function scanAppExportedButUncalled(cwd: string): UnwiredFeature[] {
  const appDirs: string[] = _detectAppSourceDirs(cwd);
  if (appDirs.length === 0) return [];

  const exportMap: Map<string, string> = new Map();
  const allAppFiles: string[] = [];

  for (const dir of appDirs) {
    allAppFiles.push(..._collectFiles(path.join(cwd, dir), ['.ts', '.js', '.tsx', '.jsx']));
  }

  for (const filePath of allAppFiles) {
    const content: string | null = safeReadFile(filePath);
    if (!content) continue;
    const relPath: string = path.relative(cwd, filePath);

    // Skip test files
    const basename: string = path.basename(filePath);
    if (basename.includes('.test.') || basename.includes('.spec.')) continue;

    const exportedNames: string[] = _extractExports(content);

    // Also detect ES module exports: export function name / export const name
    const esExportPattern: RegExp = /export\s+(?:async\s+)?(?:function|const|class|let|var)\s+(\w+)/g;
    let match: RegExpExecArray | null;
    while ((match = esExportPattern.exec(content)) !== null) {
      if (!exportedNames.includes(match[1])) {
        exportedNames.push(match[1]);
      }
    }

    for (const name of exportedNames) {
      if (name === 'default') continue;
      if (!exportMap.has(name)) {
        exportMap.set(name, relPath);
      }
    }
  }

  // Search all project files for references
  const searchFiles: string[] = [...allAppFiles];
  const testDirs: string[] = ['tests', 'test', '__tests__'];
  for (const dir of testDirs) {
    searchFiles.push(..._collectFiles(path.join(cwd, dir), ['.ts', '.js', '.tsx', '.jsx']));
  }

  const features: UnwiredFeature[] = [];

  for (const [funcName, relFilePath] of exportMap) {
    const absFilePath: string = path.join(cwd, relFilePath);
    let referenced: boolean = false;

    for (const searchFile of searchFiles) {
      if (path.resolve(searchFile) === path.resolve(absFilePath)) continue;
      const content: string | null = safeReadFile(searchFile);
      if (!content) continue;
      if (new RegExp(`\\b${funcName}\\b`).test(content)) {
        referenced = true;
        break;
      }
    }

    if (!referenced) {
      features.push({
        category: 'app-exported-but-uncalled' as UnwiredFeatureCategory,
        filePath: relFilePath,
        functionName: funcName,
        suggestedAction: 'Exported but never imported — wire into a route, component, or remove',
      });
    }
  }

  return features;
}

/**
 * Scan for ORM model/entity definitions without corresponding CRUD route handlers.
 *
 * Detects Prisma models, TypeORM @Entity classes, and Drizzle table definitions.
 */
function scanAppModelsWithoutHandlers(cwd: string): UnwiredFeature[] {
  const features: UnwiredFeature[] = [];
  const modelNames: Array<{ name: string; filePath: string }> = [];

  // Prisma schema
  const prismaPath: string = path.join(cwd, 'prisma', 'schema.prisma');
  const prismaContent: string | null = safeReadFile(prismaPath);
  if (prismaContent) {
    const modelPattern: RegExp = /model\s+(\w+)\s*\{/g;
    let match: RegExpExecArray | null;
    while ((match = modelPattern.exec(prismaContent)) !== null) {
      modelNames.push({ name: match[1], filePath: 'prisma/schema.prisma' });
    }
  }

  // TypeORM/MikroORM entity decorators and Drizzle table definitions
  const appDirs: string[] = _detectAppSourceDirs(cwd);
  const sourceFiles: string[] = [];
  for (const dir of appDirs) {
    sourceFiles.push(..._collectFiles(path.join(cwd, dir), ['.ts', '.js']));
  }

  for (const file of sourceFiles) {
    const content: string | null = safeReadFile(file);
    if (!content) continue;
    const relPath: string = path.relative(cwd, file);

    // @Entity() class ClassName
    const entityPattern: RegExp = /@Entity\s*\([^)]*\)\s*(?:export\s+)?class\s+(\w+)/g;
    let match: RegExpExecArray | null;
    while ((match = entityPattern.exec(content)) !== null) {
      modelNames.push({ name: match[1], filePath: relPath });
    }

    // Drizzle: const <tableName> = pgTable/mysqlTable/sqliteTable(...)
    const drizzlePattern: RegExp =
      /(?:export\s+)?const\s+(\w+)\s*=\s*(?:pgTable|mysqlTable|sqliteTable)\s*\(/g;
    while ((match = drizzlePattern.exec(content)) !== null) {
      modelNames.push({ name: match[1], filePath: relPath });
    }
  }

  if (modelNames.length === 0) return features;

  // Check if each model is referenced in route/handler files
  const allSourceFiles: string[] = [];
  for (const dir of appDirs) {
    allSourceFiles.push(..._collectFiles(path.join(cwd, dir), ['.ts', '.js', '.tsx', '.jsx']));
  }

  const combinedSource: string = allSourceFiles
    .map((f) => safeReadFile(f) || '')
    .join('\n');

  for (const model of modelNames) {
    const modelLower: string = model.name.toLowerCase();
    const hasRoute: boolean =
      new RegExp(`['"\`/]${modelLower}`, 'i').test(combinedSource) ||
      new RegExp(`${model.name}\\.(find|create|update|delete|save|remove|insert|select)`, 'i').test(
        combinedSource
      );

    if (!hasRoute) {
      features.push({
        category: 'app-model-without-handler' as UnwiredFeatureCategory,
        filePath: model.filePath,
        functionName: model.name,
        suggestedAction: `Model "${model.name}" has no CRUD handlers — add routes or remove unused model`,
      });
    }
  }

  return features;
}

/**
 * Scan for React/Vue components that are defined but never imported anywhere.
 */
function scanAppComponentsWithoutImport(cwd: string): UnwiredFeature[] {
  const features: UnwiredFeature[] = [];
  const appDirs: string[] = _detectAppSourceDirs(cwd);
  if (appDirs.length === 0) return [];

  const componentFiles: string[] = [];
  for (const dir of appDirs) {
    componentFiles.push(..._collectFiles(path.join(cwd, dir), ['.tsx', '.jsx']));
  }

  const componentMap: Map<string, string> = new Map();
  for (const file of componentFiles) {
    const basename: string = path.basename(file);
    if (basename.includes('.test.') || basename.includes('.spec.')) continue;
    if (basename.startsWith('index.')) continue;

    const content: string | null = safeReadFile(file);
    if (!content) continue;

    const relPath: string = path.relative(cwd, file);

    // Detect: export default function ComponentName / export function ComponentName
    // Only PascalCase names (React components)
    const componentPattern: RegExp =
      /export\s+(?:default\s+)?(?:function|const)\s+([A-Z]\w+)/g;
    let match: RegExpExecArray | null;
    while ((match = componentPattern.exec(content)) !== null) {
      componentMap.set(match[1], relPath);
    }
  }

  // Search for imports of each component
  const allFiles: string[] = [];
  for (const dir of appDirs) {
    allFiles.push(..._collectFiles(path.join(cwd, dir), ['.ts', '.js', '.tsx', '.jsx']));
  }

  for (const [componentName, relFilePath] of componentMap) {
    const absFilePath: string = path.join(cwd, relFilePath);
    let referenced: boolean = false;

    for (const searchFile of allFiles) {
      if (path.resolve(searchFile) === path.resolve(absFilePath)) continue;
      const content: string | null = safeReadFile(searchFile);
      if (!content) continue;
      if (
        new RegExp(`import\\s+.*\\b${componentName}\\b`).test(content) ||
        new RegExp(`<${componentName}[\\s/>]`).test(content)
      ) {
        referenced = true;
        break;
      }
    }

    if (!referenced) {
      features.push({
        category: 'app-component-without-import' as UnwiredFeatureCategory,
        filePath: relFilePath,
        functionName: componentName,
        suggestedAction: `Component "${componentName}" is never imported — wire into a page or remove`,
      });
    }
  }

  return features;
}

// ─── Generic CLI/Library Scanners ────────────────────────────────────────────

/** Check if a directory exists. */
function _dirExists(dirPath: string): boolean {
  try { return fs.statSync(dirPath).isDirectory(); } catch { return false; }
}

/**
 * Scan lib/*.ts for exported functions that have no corresponding test.
 * A function is considered tested if its name appears in any tests/ file.
 */
function scanLibExportedWithoutTest(cwd: string): UnwiredFeature[] {
  const libDir: string = path.join(cwd, 'lib');
  const testDirs: string[] = ['tests', 'test', '__tests__'];
  const testFiles: string[] = [];
  for (const dir of testDirs) {
    testFiles.push(..._collectFiles(path.join(cwd, dir), ['.ts', '.js']));
  }
  if (testFiles.length === 0) return [];

  const combinedTests: string = testFiles
    .map((f: string) => safeReadFile(f) || '')
    .join('\n');

  let libEntries: ReturnType<typeof fs.readdirSync>;
  try {
    libEntries = fs.readdirSync(libDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const features: UnwiredFeature[] = [];
  for (const entry of libEntries as Array<{ name: string; isFile: () => boolean }>) {
    if (!entry.isFile() || !entry.name.endsWith('.ts')) continue;
    const filePath: string = path.join(libDir, entry.name);
    const content: string | null = safeReadFile(filePath);
    if (!content) continue;

    const exports: string[] = _extractExports(content);
    for (const funcName of exports) {
      if (!new RegExp(`\\b${funcName}\\b`).test(combinedTests)) {
        features.push({
          category: 'lib-exported-without-test' as UnwiredFeatureCategory,
          filePath: path.relative(cwd, filePath),
          functionName: funcName,
          suggestedAction: `Add test coverage for ${funcName}`,
        });
      }
    }
  }
  return features;
}

/**
 * Scan bin/*.ts entry points for scripts that have no corresponding test.
 * Checks if the bin file's basename (without extension) appears in any test filename.
 */
function scanBinEntriesWithoutTest(cwd: string): UnwiredFeature[] {
  const binDir: string = path.join(cwd, 'bin');
  const testDirs: string[] = ['tests', 'test', '__tests__'];
  const testFileNames: Set<string> = new Set();
  for (const dir of testDirs) {
    const files: string[] = _collectFiles(path.join(cwd, dir), ['.ts', '.js']);
    for (const f of files) {
      testFileNames.add(path.basename(f).toLowerCase());
    }
  }
  // Also collect all test file content for reference checks
  const testFiles: string[] = [];
  for (const dir of testDirs) {
    testFiles.push(..._collectFiles(path.join(cwd, dir), ['.ts', '.js']));
  }
  const combinedTests: string = testFiles
    .map((f: string) => safeReadFile(f) || '')
    .join('\n');

  let binEntries: ReturnType<typeof fs.readdirSync>;
  try {
    binEntries = fs.readdirSync(binDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const features: UnwiredFeature[] = [];
  for (const entry of binEntries as Array<{ name: string; isFile: () => boolean }>) {
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith('.ts') && !entry.name.endsWith('.js')) continue;
    const baseName: string = entry.name.replace(/\.(ts|js)$/, '');
    // Check if any test file references this bin entry
    const hasTestFile: boolean = testFileNames.has(`${baseName}.test.ts`) ||
      testFileNames.has(`${baseName}.test.js`) ||
      testFileNames.has(`${baseName}.spec.ts`);
    const hasReference: boolean = new RegExp(`\\b${baseName}\\b`).test(combinedTests);

    if (!hasTestFile && !hasReference) {
      features.push({
        category: 'bin-entry-without-test' as UnwiredFeatureCategory,
        filePath: path.relative(cwd, path.join(binDir, entry.name)),
        functionName: baseName,
        suggestedAction: `Add integration test for bin/${entry.name}`,
      });
    }
  }
  return features;
}

// ─── Claude Code Plugin Scanners ─────────────────────────────────────────────

/**
 * Detect if this is a Claude Code plugin project by checking for
 * commands/ and/or agents/ directories with .md files.
 */
function _isPluginProject(cwd: string): boolean {
  const commandsDir: string = path.join(cwd, 'commands');
  const agentsDir: string = path.join(cwd, 'agents');
  return _dirExists(commandsDir) || _dirExists(agentsDir);
}

/**
 * Read .md filenames from a directory, returning basenames without extension.
 */
function _readMdNames(dir: string): string[] {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true }) as Array<{
      name: string;
      isFile: () => boolean;
    }>;
    return entries
      .filter((e: { name: string; isFile: () => boolean }) => e.isFile() && e.name.endsWith('.md'))
      .map((e: { name: string }) => e.name.replace(/\.md$/, ''));
  } catch {
    return [];
  }
}

/**
 * Extract the set of registered command names from the CLI registry file.
 * Reads lib/cli/index.ts (or similar) and parses TOOL_COMMANDS and AGENT_COMMANDS sets.
 */
function _extractRegisteredCommands(cwd: string): Set<string> {
  const registered: Set<string> = new Set();
  const candidates: string[] = [
    path.join(cwd, 'lib', 'cli', 'index.ts'),
    path.join(cwd, 'lib', 'cli', 'index.js'),
    path.join(cwd, 'lib', 'cli.ts'),
    path.join(cwd, 'lib', 'cli.js'),
  ];
  for (const candidate of candidates) {
    const content: string | null = safeReadFile(candidate);
    if (!content) continue;
    // Match strings inside Set([...]) or array literals
    const stringPattern: RegExp = /['"]([a-z][\w-]*)['"],?/g;
    let match: RegExpExecArray | null;
    while ((match = stringPattern.exec(content)) !== null) {
      registered.add(match[1]);
    }
  }
  return registered;
}

/**
 * Extract agent names referenced by commands via subagent_type="grd:grd-{name}" patterns.
 */
function _extractReferencedAgents(cwd: string): Set<string> {
  const referenced: Set<string> = new Set();
  const commandsDir: string = path.join(cwd, 'commands');
  const commandFiles: string[] = _collectFiles(commandsDir, ['.md']);
  for (const file of commandFiles) {
    const content: string | null = safeReadFile(file);
    if (!content) continue;
    // Match subagent_type="grd:grd-{name}" or subagent_type="grd:{name}"
    const agentRefPattern: RegExp = /subagent_type\s*[=:]\s*["']grd:(?:grd-)?([^"']+)["']/g;
    let match: RegExpExecArray | null;
    while ((match = agentRefPattern.exec(content)) !== null) {
      referenced.add(match[1]);
    }
    // Also match Agent tool calls with description referencing agents
    const agentFilePattern: RegExp = /agents\/grd-([^."'\s]+)\.md/g;
    while ((match = agentFilePattern.exec(content)) !== null) {
      referenced.add(match[1]);
    }
  }
  // Also check lib/ files for agent references
  const libFiles: string[] = _collectFiles(path.join(cwd, 'lib'), ['.ts', '.js']);
  for (const file of libFiles) {
    const content: string | null = safeReadFile(file);
    if (!content) continue;
    const agentRefPattern: RegExp = /subagent_type\s*[=:]\s*["']grd:(?:grd-)?([^"']+)["']/g;
    let match: RegExpExecArray | null;
    while ((match = agentRefPattern.exec(content)) !== null) {
      referenced.add(match[1]);
    }
  }
  return referenced;
}

/**
 * Scan for commands/ .md files that are not registered in the CLI command registry.
 */
function scanCommandsWithoutRegistration(cwd: string): UnwiredFeature[] {
  const commandNames: string[] = _readMdNames(path.join(cwd, 'commands'));
  if (commandNames.length === 0) return [];

  const registered: Set<string> = _extractRegisteredCommands(cwd);
  if (registered.size === 0) return []; // No registry found — skip

  const features: UnwiredFeature[] = [];
  for (const name of commandNames) {
    if (!registered.has(name)) {
      features.push({
        category: 'command-without-registration' as UnwiredFeatureCategory,
        filePath: `commands/${name}.md`,
        functionName: name,
        suggestedAction: `Register "${name}" in TOOL_COMMANDS or AGENT_COMMANDS in the CLI registry`,
      });
    }
  }
  return features;
}

/**
 * Scan for agents/ .md files that are not referenced by any command.
 */
function scanAgentsWithoutCommand(cwd: string): UnwiredFeature[] {
  const agentNames: string[] = _readMdNames(path.join(cwd, 'agents'));
  if (agentNames.length === 0) return [];

  const referenced: Set<string> = _extractReferencedAgents(cwd);

  const features: UnwiredFeature[] = [];
  for (const name of agentNames) {
    // Normalize: agent files are grd-{name}.md, references may be just {name} or grd-{name}
    const shortName: string = name.replace(/^grd-/, '');
    if (!referenced.has(shortName) && !referenced.has(name)) {
      features.push({
        category: 'agent-without-command' as UnwiredFeatureCategory,
        filePath: `agents/${name}.md`,
        functionName: name,
        suggestedAction: `Agent "${name}" is not spawned by any command — wire it via subagent_type or remove`,
      });
    }
  }
  return features;
}

/**
 * Scan commands for agent references that point to non-existent agent files.
 */
function scanCommandsWithMissingAgents(cwd: string): UnwiredFeature[] {
  const commandsDir: string = path.join(cwd, 'commands');
  const agentsDir: string = path.join(cwd, 'agents');
  const commandFiles: string[] = _collectFiles(commandsDir, ['.md']);
  if (commandFiles.length === 0) return [];

  const existingAgents: Set<string> = new Set(_readMdNames(agentsDir));

  const features: UnwiredFeature[] = [];
  const seen: Set<string> = new Set();

  for (const file of commandFiles) {
    const content: string | null = safeReadFile(file);
    if (!content) continue;
    const relPath: string = path.relative(cwd, file);

    // Match subagent_type references
    const agentRefPattern: RegExp = /subagent_type\s*[=:]\s*["']grd:(?:grd-)?([^"']+)["']/g;
    let match: RegExpExecArray | null;
    while ((match = agentRefPattern.exec(content)) !== null) {
      const agentName: string = match[1];
      const fullName: string = agentName.startsWith('grd-') ? agentName : `grd-${agentName}`;
      if (!existingAgents.has(fullName) && !seen.has(fullName)) {
        seen.add(fullName);
        features.push({
          category: 'command-without-agent-file' as UnwiredFeatureCategory,
          filePath: relPath,
          functionName: fullName,
          suggestedAction: `Command references agent "${fullName}" but agents/${fullName}.md does not exist`,
        });
      }
    }
  }
  return features;
}

// ─── Public Orchestrator ─────────────────────────────────────────────────────

/**
 * Discover all unwired features in the codebase using pure filesystem analysis.
 *
 * Runs structural scanners when matching directories exist (lib/, bin/, tests/)
 * AND application-aware scanners that detect routes, exports, models, and
 * components in the target project. Works for web apps, CLI tools, and libraries.
 *
 * NEVER spawns child processes — pure fs.readFileSync/readdirSync only.
 *
 * @param cwd - Absolute path to the project root
 * @returns Array of UnwiredFeature objects describing integration gaps
 */
function discoverUnwiredFeatures(cwd: string): UnwiredFeature[] {
  const allFeatures: UnwiredFeature[] = [];

  // Structural scanners — run when matching directories exist (not gated to GRD)
  const hasLib: boolean = _dirExists(path.join(cwd, 'lib'));
  const hasBin: boolean = _dirExists(path.join(cwd, 'bin'));
  const hasMcpServer: boolean = (() => {
    try { return fs.statSync(path.join(cwd, 'lib', 'mcp-server.ts')).isFile(); } catch { return false; }
  })();

  if (hasLib) {
    allFeatures.push(...scanExportedButUncalled(cwd));
    allFeatures.push(...scanLibExportedWithoutTest(cwd));
  }
  if (hasLib || hasBin) {
    allFeatures.push(...scanConfigWithoutSurface(cwd));
  }
  if (hasMcpServer) {
    allFeatures.push(...scanEndpointsWithoutTests(cwd));
  }
  if (hasBin) {
    allFeatures.push(...scanBinEntriesWithoutTest(cwd));
  }

  // Plugin-aware scanners — run when commands/ or agents/ exist
  if (_isPluginProject(cwd)) {
    allFeatures.push(
      ...scanCommandsWithoutRegistration(cwd),
      ...scanAgentsWithoutCommand(cwd),
      ...scanCommandsWithMissingAgents(cwd)
    );
  }

  // Application-aware scanners — always run
  allFeatures.push(
    ...scanAppRoutes(cwd),
    ...scanAppExportedButUncalled(cwd),
    ...scanAppModelsWithoutHandlers(cwd),
    ...scanAppComponentsWithoutImport(cwd)
  );

  allFeatures.sort((a, b) => {
    const catCmp: number = a.category.localeCompare(b.category);
    if (catCmp !== 0) return catCmp;
    return a.filePath.localeCompare(b.filePath);
  });

  return allFeatures;
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = { discoverUnwiredFeatures };
