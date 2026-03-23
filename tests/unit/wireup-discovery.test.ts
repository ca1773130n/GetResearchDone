/**
 * Unit tests for lib/wireup/discovery.ts
 *
 * Tests for discoverUnwiredFeatures() covering all three discovery categories:
 * 1. exported-but-uncalled
 * 2. config-without-surface
 * 3. endpoint-without-integration-test
 *
 * Uses jest.mock for fs and ../utils to enable controlled testing.
 */

import type { UnwiredFeature } from '../../lib/wireup/types';

const path = require('path');

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockReaddirSync = jest.fn();
const mockStatSync = jest.fn();
const mockSafeReadFile = jest.fn();

jest.mock('fs', () => ({
  readdirSync: mockReaddirSync,
  statSync: mockStatSync,
}));

jest.mock('../../lib/utils', () => ({
  safeReadFile: mockSafeReadFile,
}));

const {
  discoverUnwiredFeatures,
}: {
  discoverUnwiredFeatures: (cwd: string) => UnwiredFeature[];
} = require('../../lib/wireup/discovery');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeEntry(
  name: string,
  isFile: boolean
): { name: string; isFile: () => boolean; isDirectory: () => boolean } {
  return {
    name,
    isFile: () => isFile,
    isDirectory: () => !isFile,
  };
}

const FAKE_CWD = '/fake/project';
const GRD_PLUGIN_JSON = '{ "name": "grd", "version": "0.0.0" }';

/**
 * Configure mocks so that structural scanners detect lib/, bin/, and mcp-server.ts.
 * Call this in tests that exercise structural scanners (exported-but-uncalled,
 * config-without-surface, endpoint-without-integration-test).
 */
function setupGrdProjectMocks(
  extraStatSync?: (p: string) => { isDirectory: () => boolean; isFile?: () => boolean } | never,
  extraSafeReadFile?: (filePath: string) => string | null,
): void {
  const prevStatSync = mockStatSync.getMockImplementation();
  mockStatSync.mockImplementation((p: string) => {
    // Structural detection: lib/ and bin/ must exist as directories
    if (p === path.join(FAKE_CWD, 'lib')) return { isDirectory: () => true, isFile: () => false };
    if (p === path.join(FAKE_CWD, 'bin')) return { isDirectory: () => true, isFile: () => false };
    // MCP server detection
    if (p === path.join(FAKE_CWD, 'lib', 'mcp-server.ts')) return { isDirectory: () => false, isFile: () => true };
    if (extraStatSync) return extraStatSync(p);
    if (prevStatSync) return prevStatSync(p);
    throw new Error('ENOENT');
  });

  const prevSafeReadFile = mockSafeReadFile.getMockImplementation();
  mockSafeReadFile.mockImplementation((filePath: string) => {
    if (extraSafeReadFile) return extraSafeReadFile(filePath);
    if (prevSafeReadFile) return prevSafeReadFile(filePath);
    return null;
  });
}

// ─── Test Suite ──────────────────────────────────────────────────────────────

describe('discoverUnwiredFeatures()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockReaddirSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });
    mockStatSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });
    mockSafeReadFile.mockReturnValue(null);
  });

  // ─── 1. Empty codebase ─────────────────────────────────────────────────────

  describe('empty codebase', () => {
    test('returns empty array when no directories exist', () => {
      const result: UnwiredFeature[] = discoverUnwiredFeatures(FAKE_CWD);
      expect(result).toEqual([]);
    });

    test('returns empty array when lib/ exists but is empty', () => {
      mockReaddirSync.mockImplementation((dir: string) => {
        if (dir === path.join(FAKE_CWD, 'lib')) return [];
        throw new Error('ENOENT');
      });
      const result: UnwiredFeature[] = discoverUnwiredFeatures(FAKE_CWD);
      expect(result).toEqual([]);
    });
  });

  // ─── 2. exported-but-uncalled ──────────────────────────────────────────────

  describe('exported-but-uncalled category', () => {
    test('detects exported function not referenced elsewhere', () => {
      mockStatSync.mockImplementation((p: string) => {
        if (p === path.join(FAKE_CWD, 'lib')) return { isDirectory: () => true, isFile: () => false };
        throw new Error('ENOENT');
      });

      mockReaddirSync.mockImplementation((dir: string, _opts?: unknown) => {
        if (dir === path.join(FAKE_CWD, 'lib')) {
          return [makeEntry('myModule.ts', true)];
        }
        throw new Error('ENOENT');
      });

      mockSafeReadFile.mockImplementation((filePath: string) => {
        if (filePath === path.join(FAKE_CWD, 'lib', 'myModule.ts')) {
          return 'module.exports = { myOrphanFunc };';
        }
        return null;
      });

      const result: UnwiredFeature[] = discoverUnwiredFeatures(FAKE_CWD);
      const match = result.find((f: UnwiredFeature) => f.functionName === 'myOrphanFunc');
      expect(match).toBeDefined();
      expect(match!.category).toBe('exported-but-uncalled');
      expect(match!.filePath).toBe('lib/myModule.ts');
      expect(match!.suggestedAction).toBe('Add call site in a command, route, or test');
    });

    test('does NOT flag export that is referenced in another lib file', () => {
      mockStatSync.mockImplementation((p: string) => {
        if (p === path.join(FAKE_CWD, 'lib', 'wireup')) return { isDirectory: () => true };
        throw new Error('ENOENT');
      });

      mockReaddirSync.mockImplementation((dir: string, _opts?: unknown) => {
        if (dir === path.join(FAKE_CWD, 'lib')) {
          return [makeEntry('provider.ts', true), makeEntry('consumer.ts', true)];
        }
        throw new Error('ENOENT');
      });

      mockSafeReadFile.mockImplementation((filePath: string) => {
        if (filePath === path.join(FAKE_CWD, '.claude-plugin', 'plugin.json'))
          return GRD_PLUGIN_JSON;
        if (filePath === path.join(FAKE_CWD, 'lib', 'provider.ts')) {
          return "module.exports = { usedFunc };";
        }
        if (filePath === path.join(FAKE_CWD, 'lib', 'consumer.ts')) {
          return "const { usedFunc } = require('./provider'); usedFunc();";
        }
        return null;
      });

      const result: UnwiredFeature[] = discoverUnwiredFeatures(FAKE_CWD);
      const match = result.find((f: UnwiredFeature) => f.functionName === 'usedFunc');
      expect(match).toBeUndefined();
    });

    test('detects exports.name = ... pattern', () => {
      mockStatSync.mockImplementation((p: string) => {
        if (p === path.join(FAKE_CWD, 'lib')) return { isDirectory: () => true, isFile: () => false };
        throw new Error('ENOENT');
      });

      mockReaddirSync.mockImplementation((dir: string, _opts?: unknown) => {
        if (dir === path.join(FAKE_CWD, 'lib')) {
          return [makeEntry('legacy.ts', true)];
        }
        throw new Error('ENOENT');
      });

      mockSafeReadFile.mockImplementation((filePath: string) => {
        if (filePath === path.join(FAKE_CWD, 'lib', 'legacy.ts')) {
          return 'exports.legacyHelper = function() {};';
        }
        return null;
      });

      const result: UnwiredFeature[] = discoverUnwiredFeatures(FAKE_CWD);
      const match = result.find((f: UnwiredFeature) => f.functionName === 'legacyHelper');
      expect(match).toBeDefined();
      expect(match!.category).toBe('exported-but-uncalled');
    });
  });

  // ─── 3. config-without-surface ────────────────────────────────────────────

  describe('config-without-surface category', () => {
    test('detects config key not referenced in commands or bin', () => {
      mockStatSync.mockImplementation((p: string) => {
        if (p === path.join(FAKE_CWD, 'lib')) return { isDirectory: () => true, isFile: () => false };
        throw new Error('ENOENT');
      });

      mockReaddirSync.mockImplementation((dir: string, _opts?: unknown) => {
        if (dir === path.join(FAKE_CWD, 'lib')) return [];
        throw new Error('ENOENT');
      });

      mockSafeReadFile.mockImplementation((filePath: string) => {
        if (filePath === path.join(FAKE_CWD, '.planning', 'config.json')) {
          return JSON.stringify({ orphanKey: true, model_profile: 'balanced' });
        }
        return null;
      });

      const result: UnwiredFeature[] = discoverUnwiredFeatures(FAKE_CWD);
      const orphan = result.find((f: UnwiredFeature) => f.functionName === 'orphanKey');
      expect(orphan).toBeDefined();
      expect(orphan!.category).toBe('config-without-surface');
      expect(orphan!.filePath).toBe('.planning/config.json');
      expect(orphan!.suggestedAction).toBe('Expose via CLI flag, command option, or settings UI');
    });

    test('skips private keys starting with underscore', () => {
      mockReaddirSync.mockImplementation((dir: string, _opts?: unknown) => {
        if (dir === path.join(FAKE_CWD, 'lib')) return [];
        throw new Error('ENOENT');
      });

      mockSafeReadFile.mockImplementation((filePath: string) => {
        if (filePath === path.join(FAKE_CWD, '.planning', 'config.json')) {
          return JSON.stringify({ _privateKey: 'value', publicKey: 'value' });
        }
        return null;
      });

      const result: UnwiredFeature[] = discoverUnwiredFeatures(FAKE_CWD);
      expect(result.find((f: UnwiredFeature) => f.functionName === '_privateKey')).toBeUndefined();
    });

    test('returns empty array when config.json is missing', () => {
      mockReaddirSync.mockImplementation(() => {
        throw new Error('ENOENT');
      });
      mockSafeReadFile.mockReturnValue(null);
      const result: UnwiredFeature[] = discoverUnwiredFeatures(FAKE_CWD);
      expect(result.filter((f: UnwiredFeature) => f.category === 'config-without-surface')).toEqual([]);
    });

    test('returns empty array when config.json is malformed JSON', () => {
      mockReaddirSync.mockImplementation((dir: string, _opts?: unknown) => {
        if (dir === path.join(FAKE_CWD, 'lib')) return [];
        throw new Error('ENOENT');
      });
      mockSafeReadFile.mockImplementation((filePath: string) => {
        if (filePath === path.join(FAKE_CWD, '.planning', 'config.json')) {
          return '{ invalid json <<<';
        }
        return null;
      });
      const result: UnwiredFeature[] = discoverUnwiredFeatures(FAKE_CWD);
      expect(result.filter((f: UnwiredFeature) => f.category === 'config-without-surface')).toEqual([]);
    });
  });

  // ─── 4. endpoint-without-integration-test ─────────────────────────────────

  describe('endpoint-without-integration-test category', () => {
    test('detects MCP tool not referenced in integration tests', () => {
      mockStatSync.mockImplementation((p: string) => {
        if (p === path.join(FAKE_CWD, 'lib')) return { isDirectory: () => true, isFile: () => false };
        if (p === path.join(FAKE_CWD, 'lib', 'mcp-server.ts')) return { isDirectory: () => false, isFile: () => true };
        throw new Error('ENOENT');
      });

      mockReaddirSync.mockImplementation((dir: string, _opts?: unknown) => {
        if (dir === path.join(FAKE_CWD, 'lib')) return [];
        if (dir === path.join(FAKE_CWD, 'tests', 'integration')) return [];
        throw new Error('ENOENT');
      });

      mockSafeReadFile.mockImplementation((filePath: string) => {
        if (filePath === path.join(FAKE_CWD, 'lib', 'mcp-server.ts')) {
          return "tools.push({ name: 'grd_my_tool', description: 'test' });";
        }
        return null;
      });

      const result: UnwiredFeature[] = discoverUnwiredFeatures(FAKE_CWD);
      const match = result.find((f: UnwiredFeature) => f.functionName === 'grd_my_tool');
      expect(match).toBeDefined();
      expect(match!.category).toBe('endpoint-without-integration-test');
      expect(match!.filePath).toBe('lib/mcp-server.ts');
      expect(match!.suggestedAction).toBe('Add integration test covering this endpoint');
    });

    test('does NOT flag tool that is referenced in integration tests', () => {
      mockStatSync.mockImplementation((p: string) => {
        if (p === path.join(FAKE_CWD, 'lib')) return { isDirectory: () => true, isFile: () => false };
        if (p === path.join(FAKE_CWD, 'lib', 'mcp-server.ts')) return { isDirectory: () => false, isFile: () => true };
        throw new Error('ENOENT');
      });

      mockReaddirSync.mockImplementation((dir: string, _opts?: unknown) => {
        if (dir === path.join(FAKE_CWD, 'lib')) return [];
        if (dir === path.join(FAKE_CWD, 'tests', 'integration')) {
          return [makeEntry('mcp.test.ts', true)];
        }
        throw new Error('ENOENT');
      });

      mockSafeReadFile.mockImplementation((filePath: string) => {
        if (filePath === path.join(FAKE_CWD, 'lib', 'mcp-server.ts')) {
          return "tools.push({ name: 'grd_tested_tool' });";
        }
        if (filePath === path.join(FAKE_CWD, 'tests', 'integration', 'mcp.test.ts')) {
          return "it('calls grd_tested_tool', async () => { expect(true).toBe(true); });";
        }
        return null;
      });

      const result: UnwiredFeature[] = discoverUnwiredFeatures(FAKE_CWD);
      expect(result.find((f: UnwiredFeature) => f.functionName === 'grd_tested_tool')).toBeUndefined();
    });

    test('returns empty array when mcp-server.ts is missing', () => {
      mockReaddirSync.mockImplementation(() => {
        throw new Error('ENOENT');
      });
      mockSafeReadFile.mockReturnValue(null);
      const result: UnwiredFeature[] = discoverUnwiredFeatures(FAKE_CWD);
      expect(result.filter((f: UnwiredFeature) => f.category === 'endpoint-without-integration-test')).toEqual([]);
    });
  });

  // ─── 5. Output structure ───────────────────────────────────────────────────

  describe('output structure', () => {
    test('all returned features have required fields', () => {
      mockReaddirSync.mockImplementation((dir: string, _opts?: unknown) => {
        if (dir === path.join(FAKE_CWD, 'lib')) {
          return [makeEntry('mod.ts', true)];
        }
        throw new Error('ENOENT');
      });
      mockSafeReadFile.mockImplementation((filePath: string) => {
        if (filePath === path.join(FAKE_CWD, 'lib', 'mod.ts')) {
          return 'module.exports = { someFunc };';
        }
        return null;
      });

      const result: UnwiredFeature[] = discoverUnwiredFeatures(FAKE_CWD);
      for (const feature of result) {
        expect(typeof feature.category).toBe('string');
        expect(typeof feature.filePath).toBe('string');
        expect(typeof feature.functionName).toBe('string');
        expect(typeof feature.suggestedAction).toBe('string');
      }
    });

    test('results are sorted by category then filePath', () => {
      mockReaddirSync.mockImplementation((dir: string, _opts?: unknown) => {
        if (dir === path.join(FAKE_CWD, 'lib')) {
          return [makeEntry('zebra.ts', true)];
        }
        if (dir === path.join(FAKE_CWD, 'tests', 'integration')) return [];
        throw new Error('ENOENT');
      });

      mockSafeReadFile.mockImplementation((filePath: string) => {
        if (filePath === path.join(FAKE_CWD, 'lib', 'zebra.ts')) {
          return 'module.exports = { orphan };';
        }
        if (filePath === path.join(FAKE_CWD, 'lib', 'mcp-server.ts')) {
          return "tools.push({ name: 'grd_untested' });";
        }
        if (filePath === path.join(FAKE_CWD, '.planning', 'config.json')) {
          return JSON.stringify({ unsurfaced: true });
        }
        return null;
      });

      const result: UnwiredFeature[] = discoverUnwiredFeatures(FAKE_CWD);
      for (let i = 1; i < result.length; i++) {
        const prev: UnwiredFeature = result[i - 1];
        const curr: UnwiredFeature = result[i];
        const cmp: number = prev.category.localeCompare(curr.category);
        if (cmp === 0) {
          expect(prev.filePath.localeCompare(curr.filePath)).toBeLessThanOrEqual(0);
        } else {
          expect(cmp).toBeLessThanOrEqual(0);
        }
      }
    });
  });

  // ─── 6. app-route-without-test ────────────────────────────────────────────

  describe('app-route-without-test category', () => {
    test('detects Express routes without tests', () => {
      mockReaddirSync.mockImplementation((dir: string, _opts?: unknown) => {
        if (dir === FAKE_CWD) return [makeEntry('src', false)];
        if (dir === path.join(FAKE_CWD, 'src')) {
          return [makeEntry('routes.ts', true)];
        }
        throw new Error('ENOENT');
      });

      mockSafeReadFile.mockImplementation((filePath: string) => {
        if (filePath === path.join(FAKE_CWD, 'src', 'routes.ts')) {
          return `
            app.get('/api/users', getUsers);
            app.post('/api/users', createUser);
          `;
        }
        return null;
      });

      const result: UnwiredFeature[] = discoverUnwiredFeatures(FAKE_CWD);
      const appRoutes = result.filter(
        (f: UnwiredFeature) => f.category === 'app-route-without-test'
      );
      expect(appRoutes.length).toBe(2);
      expect(appRoutes[0].functionName).toBe('GET /api/users');
      expect(appRoutes[1].functionName).toBe('POST /api/users');
    });

    test('does NOT flag routes that are covered in tests', () => {
      mockReaddirSync.mockImplementation((dir: string, _opts?: unknown) => {
        if (dir === FAKE_CWD) return [makeEntry('src', false)];
        if (dir === path.join(FAKE_CWD, 'src')) {
          return [makeEntry('routes.ts', true)];
        }
        if (dir === path.join(FAKE_CWD, 'tests')) {
          return [makeEntry('api.test.ts', true)];
        }
        throw new Error('ENOENT');
      });

      mockSafeReadFile.mockImplementation((filePath: string) => {
        if (filePath === path.join(FAKE_CWD, 'src', 'routes.ts')) {
          return "app.get('/api/users', getUsers);";
        }
        if (filePath === path.join(FAKE_CWD, 'tests', 'api.test.ts')) {
          return "it('gets users', () => { request.get('/api/users'); });";
        }
        return null;
      });

      const result: UnwiredFeature[] = discoverUnwiredFeatures(FAKE_CWD);
      const appRoutes = result.filter(
        (f: UnwiredFeature) => f.category === 'app-route-without-test'
      );
      expect(appRoutes.length).toBe(0);
    });

    test('detects Next.js App Router handlers', () => {
      mockReaddirSync.mockImplementation((dir: string, _opts?: unknown) => {
        if (dir === FAKE_CWD) return [makeEntry('app', false)];
        if (dir === path.join(FAKE_CWD, 'app')) {
          return [makeEntry('api', false)];
        }
        if (dir === path.join(FAKE_CWD, 'app', 'api')) {
          return [makeEntry('users', false)];
        }
        if (dir === path.join(FAKE_CWD, 'app', 'api', 'users')) {
          return [makeEntry('route.ts', true)];
        }
        throw new Error('ENOENT');
      });

      mockSafeReadFile.mockImplementation((filePath: string) => {
        if (filePath === path.join(FAKE_CWD, 'app', 'api', 'users', 'route.ts')) {
          return `
            export async function GET(request: Request) { return Response.json([]); }
            export async function POST(request: Request) { return Response.json({}); }
          `;
        }
        return null;
      });

      const result: UnwiredFeature[] = discoverUnwiredFeatures(FAKE_CWD);
      const appRoutes = result.filter(
        (f: UnwiredFeature) => f.category === 'app-route-without-test'
      );
      expect(appRoutes.length).toBe(2);
      const methods = appRoutes.map((r: UnwiredFeature) => r.functionName.split(' ')[0]);
      expect(methods).toContain('GET');
      expect(methods).toContain('POST');
    });
  });

  // ─── 7. app-model-without-handler ─────────────────────────────────────────

  describe('app-model-without-handler category', () => {
    test('detects Prisma models without handlers', () => {
      mockReaddirSync.mockImplementation((dir: string, _opts?: unknown) => {
        if (dir === FAKE_CWD) return [];
        throw new Error('ENOENT');
      });

      mockSafeReadFile.mockImplementation((filePath: string) => {
        if (filePath === path.join(FAKE_CWD, 'prisma', 'schema.prisma')) {
          return `
            model User { id Int @id }
            model OrphanModel { id Int @id }
          `;
        }
        return null;
      });

      const result: UnwiredFeature[] = discoverUnwiredFeatures(FAKE_CWD);
      const models = result.filter(
        (f: UnwiredFeature) => f.category === 'app-model-without-handler'
      );
      expect(models.length).toBe(2);
      const names = models.map((m: UnwiredFeature) => m.functionName);
      expect(names).toContain('User');
      expect(names).toContain('OrphanModel');
    });
  });

  // ─── 8. No app dirs returns no app features ───────────────────────────────

  describe('app scanners on project without app dirs', () => {
    test('returns no app features when no src/app/server dirs exist', () => {
      // mockStatSync already throws ENOENT by default from beforeEach
      mockReaddirSync.mockImplementation(() => {
        throw new Error('ENOENT');
      });

      const result: UnwiredFeature[] = discoverUnwiredFeatures(FAKE_CWD);
      const appFeatures = result.filter((f: UnwiredFeature) =>
        f.category.startsWith('app-')
      );
      expect(appFeatures).toEqual([]);
    });
  });
});
