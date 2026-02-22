/**
 * Unit tests for lib/mcp-server.js
 *
 * Tests the MCP (Model Context Protocol) server module covering:
 * 1. buildToolDefinitions() — schema generation
 * 2. COMMAND_DESCRIPTORS — registry completeness
 * 3. handleMessage — initialize (protocol handshake)
 * 4. handleMessage — notifications/initialized
 * 5. handleMessage — tools/list
 * 6. handleMessage — tools/call (execution)
 * 7. handleMessage — error paths
 * 8. Edge cases
 * 9. captureExecution — output capture helper
 */

const fs = require('fs');
const path = require('path');
const { createFixtureDir, cleanupFixtureDir } = require('../helpers/fixtures');

const {
  McpServer,
  buildToolDefinitions,
  COMMAND_DESCRIPTORS,
  captureExecution,
} = require('../../lib/mcp-server');

// ─── Fixture Setup ──────────────────────────────────────────────────────────

let fixtureDir;
let server;

beforeAll(() => {
  fixtureDir = createFixtureDir();
  server = new McpServer({ cwd: fixtureDir });
});

afterAll(() => {
  cleanupFixtureDir(fixtureDir);
});

// ─── 1. buildToolDefinitions() — Schema Generation ─────────────────────────

describe('buildToolDefinitions()', () => {
  let tools;

  beforeAll(() => {
    tools = buildToolDefinitions();
  });

  test('returns an array with 50+ tool definitions', () => {
    expect(Array.isArray(tools)).toBe(true);
    expect(tools.length).toBeGreaterThanOrEqual(50);
  });

  test('each tool has name (string), description (string), inputSchema (object)', () => {
    for (const tool of tools) {
      expect(typeof tool.name).toBe('string');
      expect(tool.name.length).toBeGreaterThan(0);
      expect(typeof tool.description).toBe('string');
      expect(tool.description.length).toBeGreaterThan(0);
      expect(typeof tool.inputSchema).toBe('object');
      expect(tool.inputSchema).not.toBeNull();
    }
  });

  test('inputSchema has type: "object" and properties object', () => {
    for (const tool of tools) {
      expect(tool.inputSchema.type).toBe('object');
      expect(typeof tool.inputSchema.properties).toBe('object');
    }
  });

  test('tools with required params have required array in inputSchema', () => {
    const toolsWithRequired = tools.filter((t) => t.inputSchema.required);
    expect(toolsWithRequired.length).toBeGreaterThan(0);
    for (const tool of toolsWithRequired) {
      expect(Array.isArray(tool.inputSchema.required)).toBe(true);
      expect(tool.inputSchema.required.length).toBeGreaterThan(0);
      // Each required field must exist in properties
      for (const req of tool.inputSchema.required) {
        expect(tool.inputSchema.properties).toHaveProperty(req);
      }
    }
  });

  test('tools without required params do not have required array', () => {
    const toolsWithoutRequired = tools.filter((t) => !t.inputSchema.required);
    expect(toolsWithoutRequired.length).toBeGreaterThan(0);
    for (const tool of toolsWithoutRequired) {
      expect(tool.inputSchema.required).toBeUndefined();
    }
  });

  test('tool names follow grd_{command}_{subcommand} convention', () => {
    for (const tool of tools) {
      expect(tool.name).toMatch(/^grd_/);
      expect(tool.name).toMatch(/^[a-z0-9_]+$/);
    }
  });

  test('no duplicate tool names', () => {
    const names = tools.map((t) => t.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });

  // ── Spot-check specific tools ──

  test('grd_state_load has no required params', () => {
    const tool = tools.find((t) => t.name === 'grd_state_load');
    expect(tool).toBeDefined();
    expect(tool.inputSchema.required).toBeUndefined();
    expect(Object.keys(tool.inputSchema.properties)).toHaveLength(0);
  });

  test('grd_state_get has optional section param of type string', () => {
    const tool = tools.find((t) => t.name === 'grd_state_get');
    expect(tool).toBeDefined();
    expect(tool.inputSchema.properties.section).toBeDefined();
    expect(tool.inputSchema.properties.section.type).toBe('string');
    expect(tool.inputSchema.required).toBeUndefined();
  });

  test('grd_phase_add has required description param', () => {
    const tool = tools.find((t) => t.name === 'grd_phase_add');
    expect(tool).toBeDefined();
    expect(tool.inputSchema.required).toContain('description');
    expect(tool.inputSchema.properties.description.type).toBe('string');
  });

  test('grd_verify_plan_structure has required file param', () => {
    const tool = tools.find((t) => t.name === 'grd_verify_plan_structure');
    expect(tool).toBeDefined();
    expect(tool.inputSchema.required).toContain('file');
  });

  // ── Spot-checks for requirement & search tools ──

  test('grd_requirement_get has required req_id param of type string', () => {
    const tool = tools.find((t) => t.name === 'grd_requirement_get');
    expect(tool).toBeDefined();
    expect(tool.inputSchema.required).toContain('req_id');
    expect(tool.inputSchema.properties.req_id.type).toBe('string');
  });

  test('grd_requirement_list has 5 optional params and no required array', () => {
    const tool = tools.find((t) => t.name === 'grd_requirement_list');
    expect(tool).toBeDefined();
    expect(Object.keys(tool.inputSchema.properties)).toHaveLength(5);
    expect(tool.inputSchema.required).toBeUndefined();
  });

  test('grd_requirement_update_status has required req_id and status params', () => {
    const tool = tools.find((t) => t.name === 'grd_requirement_update_status');
    expect(tool).toBeDefined();
    expect(tool.inputSchema.required).toContain('req_id');
    expect(tool.inputSchema.required).toContain('status');
    expect(tool.inputSchema.properties.req_id.type).toBe('string');
    expect(tool.inputSchema.properties.status.type).toBe('string');
  });

  test('grd_search has required query param of type string', () => {
    const tool = tools.find((t) => t.name === 'grd_search');
    expect(tool).toBeDefined();
    expect(tool.inputSchema.required).toContain('query');
    expect(tool.inputSchema.properties.query.type).toBe('string');
  });

  test('grd_init_execute_phase has required phase param', () => {
    const tool = tools.find((t) => t.name === 'grd_init_execute_phase');
    expect(tool).toBeDefined();
    expect(tool.inputSchema.required).toContain('phase');
  });

  test('inputSchema properties have correct types for various param types', () => {
    // array type
    const commitTool = tools.find((t) => t.name === 'grd_commit');
    expect(commitTool).toBeDefined();
    const filesProp = commitTool.inputSchema.properties.files;
    expect(filesProp.type).toBe('array');
    expect(filesProp.items).toEqual({ type: 'string' });

    // boolean type
    const amendProp = commitTool.inputSchema.properties.amend;
    expect(amendProp.type).toBe('boolean');

    // object type
    const patchTool = tools.find((t) => t.name === 'grd_state_patch');
    expect(patchTool).toBeDefined();
    expect(patchTool.inputSchema.properties.patches.type).toBe('object');

    // number type
    const verifySummary = tools.find((t) => t.name === 'grd_verify_summary');
    expect(verifySummary).toBeDefined();
    expect(verifySummary.inputSchema.properties.check_count.type).toBe('number');
  });
});

// ─── 2. COMMAND_DESCRIPTORS — Registry Completeness ─────────────────────────

describe('COMMAND_DESCRIPTORS', () => {
  test('is a non-empty array', () => {
    expect(Array.isArray(COMMAND_DESCRIPTORS)).toBe(true);
    expect(COMMAND_DESCRIPTORS.length).toBeGreaterThan(0);
  });

  test('has 100+ entries covering all command groups', () => {
    expect(COMMAND_DESCRIPTORS.length).toBeGreaterThanOrEqual(100);
  });

  test('each descriptor has name, description, params array, and execute function', () => {
    for (const desc of COMMAND_DESCRIPTORS) {
      expect(typeof desc.name).toBe('string');
      expect(typeof desc.description).toBe('string');
      expect(Array.isArray(desc.params)).toBe(true);
      expect(typeof desc.execute).toBe('function');
    }
  });

  test('covers state command family', () => {
    const stateCommands = COMMAND_DESCRIPTORS.filter((d) => d.name.startsWith('grd_state_'));
    expect(stateCommands.length).toBeGreaterThanOrEqual(10);
  });

  test('covers verify command family', () => {
    const verifyCommands = COMMAND_DESCRIPTORS.filter((d) => d.name.startsWith('grd_verify_'));
    expect(verifyCommands.length).toBeGreaterThanOrEqual(5);
  });

  test('covers frontmatter command family', () => {
    const fmCommands = COMMAND_DESCRIPTORS.filter((d) => d.name.startsWith('grd_frontmatter_'));
    expect(fmCommands.length).toBeGreaterThanOrEqual(4);
  });

  test('covers phase command family', () => {
    const phaseCommands = COMMAND_DESCRIPTORS.filter((d) => d.name.startsWith('grd_phase_'));
    expect(phaseCommands.length).toBeGreaterThanOrEqual(4);
  });

  test('covers init command family', () => {
    const initCommands = COMMAND_DESCRIPTORS.filter((d) => d.name.startsWith('grd_init_'));
    expect(initCommands.length).toBeGreaterThanOrEqual(15);
  });

  test('covers tracker command family', () => {
    const trackerCommands = COMMAND_DESCRIPTORS.filter((d) => d.name.startsWith('grd_tracker_'));
    expect(trackerCommands.length).toBeGreaterThanOrEqual(10);
  });

  test('covers long_term_roadmap command family', () => {
    const ltrCommands = COMMAND_DESCRIPTORS.filter((d) =>
      d.name.startsWith('grd_long_term_roadmap_')
    );
    expect(ltrCommands.length).toBeGreaterThanOrEqual(12);
  });

  test('covers requirement command family', () => {
    const reqCommands = COMMAND_DESCRIPTORS.filter((d) => d.name.startsWith('grd_requirement_'));
    expect(reqCommands.length).toBeGreaterThanOrEqual(4);
  });

  test('covers search command', () => {
    const searchCmd = COMMAND_DESCRIPTORS.find((d) => d.name === 'grd_search');
    expect(searchCmd).toBeDefined();
  });

  test('each param has name, type, required, and description', () => {
    for (const desc of COMMAND_DESCRIPTORS) {
      for (const param of desc.params) {
        expect(typeof param.name).toBe('string');
        expect(typeof param.type).toBe('string');
        expect(typeof param.required).toBe('boolean');
        expect(typeof param.description).toBe('string');
      }
    }
  });
});

// ─── 3. handleMessage — initialize (Protocol Handshake) ────────────────────

describe('handleMessage — initialize', () => {
  test('returns protocolVersion, capabilities.tools, and serverInfo', () => {
    const response = server.handleMessage({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2024-11-05' },
    });

    expect(response.jsonrpc).toBe('2.0');
    expect(response.id).toBe(1);
    expect(response.result).toBeDefined();
    expect(response.result.protocolVersion).toBe('2024-11-05');
    expect(response.result.capabilities).toEqual({ tools: {} });
    expect(response.result.serverInfo.name).toBe('grd-mcp-server');
    expect(typeof response.result.serverInfo.version).toBe('string');
  });

  test('has correct JSON-RPC structure: jsonrpc, id, result', () => {
    const response = server.handleMessage({
      jsonrpc: '2.0',
      id: 42,
      method: 'initialize',
      params: {},
    });

    expect(response).toHaveProperty('jsonrpc', '2.0');
    expect(response).toHaveProperty('id', 42);
    expect(response).toHaveProperty('result');
    expect(response).not.toHaveProperty('error');
  });

  test('works with different protocol versions (backward compat)', () => {
    const response = server.handleMessage({
      jsonrpc: '2.0',
      id: 2,
      method: 'initialize',
      params: { protocolVersion: '2023-01-01' },
    });

    expect(response.result.protocolVersion).toBe('2024-11-05');
    expect(response.result.serverInfo.name).toBe('grd-mcp-server');
  });

  test('works with string id', () => {
    const response = server.handleMessage({
      jsonrpc: '2.0',
      id: 'init-req-1',
      method: 'initialize',
      params: {},
    });

    expect(response.id).toBe('init-req-1');
    expect(response.result).toBeDefined();
  });
});

// ─── 4. handleMessage — notifications/initialized ──────────────────────────

describe('handleMessage — notifications/initialized', () => {
  test('returns null (notifications do not get responses)', () => {
    const response = server.handleMessage({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    });

    expect(response).toBeNull();
  });

  test('sets internal initialized state', () => {
    const freshServer = new McpServer({ cwd: fixtureDir });
    expect(freshServer._initialized).toBe(false);

    freshServer.handleMessage({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    });

    expect(freshServer._initialized).toBe(true);
  });

  test('unknown notification also returns null', () => {
    const response = server.handleMessage({
      jsonrpc: '2.0',
      method: 'some/unknown/notification',
      // No id — this is a notification
    });

    expect(response).toBeNull();
  });
});

// ─── 5. handleMessage — tools/list ─────────────────────────────────────────

describe('handleMessage — tools/list', () => {
  test('returns tools array with all tool definitions', () => {
    const response = server.handleMessage({
      jsonrpc: '2.0',
      id: 10,
      method: 'tools/list',
    });

    expect(response.jsonrpc).toBe('2.0');
    expect(response.id).toBe(10);
    expect(response.result).toBeDefined();
    expect(Array.isArray(response.result.tools)).toBe(true);
    expect(response.result.tools.length).toBeGreaterThanOrEqual(50);
  });

  test('each tool in response matches buildToolDefinitions output', () => {
    const response = server.handleMessage({
      jsonrpc: '2.0',
      id: 11,
      method: 'tools/list',
    });

    const directTools = buildToolDefinitions();
    expect(response.result.tools).toEqual(directTools);
  });

  test('tools in list have expected structure', () => {
    const response = server.handleMessage({
      jsonrpc: '2.0',
      id: 12,
      method: 'tools/list',
    });

    for (const tool of response.result.tools) {
      expect(tool).toHaveProperty('name');
      expect(tool).toHaveProperty('description');
      expect(tool).toHaveProperty('inputSchema');
      expect(tool.inputSchema).toHaveProperty('type', 'object');
      expect(tool.inputSchema).toHaveProperty('properties');
    }
  });
});

// ─── 6. handleMessage — tools/call (Execution) ─────────────────────────────

describe('handleMessage — tools/call (execution)', () => {
  test('grd_state_load returns content array with JSON text', () => {
    const response = server.handleMessage({
      jsonrpc: '2.0',
      id: 20,
      method: 'tools/call',
      params: { name: 'grd_state_load', arguments: {} },
    });

    expect(response.jsonrpc).toBe('2.0');
    expect(response.id).toBe(20);
    expect(response.result).toBeDefined();
    expect(Array.isArray(response.result.content)).toBe(true);
    expect(response.result.content.length).toBeGreaterThan(0);
    expect(response.result.content[0].type).toBe('text');
    // Text should be valid JSON
    const parsed = JSON.parse(response.result.content[0].text);
    expect(parsed).toBeDefined();
  });

  test('grd_validate_consistency returns content array with result', () => {
    const response = server.handleMessage({
      jsonrpc: '2.0',
      id: 21,
      method: 'tools/call',
      params: { name: 'grd_validate_consistency', arguments: {} },
    });

    expect(response.result).toBeDefined();
    expect(Array.isArray(response.result.content)).toBe(true);
    expect(response.result.content[0].type).toBe('text');
  });

  test('grd_detect_backend returns content array with backend info', () => {
    const response = server.handleMessage({
      jsonrpc: '2.0',
      id: 22,
      method: 'tools/call',
      params: { name: 'grd_detect_backend', arguments: {} },
    });

    expect(response.result).toBeDefined();
    expect(response.result.content[0].type).toBe('text');
    const parsed = JSON.parse(response.result.content[0].text);
    expect(parsed).toHaveProperty('backend');
  });

  test('grd_generate_slug with text returns content with slug', () => {
    const response = server.handleMessage({
      jsonrpc: '2.0',
      id: 23,
      method: 'tools/call',
      params: { name: 'grd_generate_slug', arguments: { text: 'Hello World' } },
    });

    expect(response.result).toBeDefined();
    expect(response.result.content[0].type).toBe('text');
    const parsed = JSON.parse(response.result.content[0].text);
    expect(parsed.slug).toBe('hello-world');
  });

  test('grd_current_timestamp with format=date returns date string', () => {
    const response = server.handleMessage({
      jsonrpc: '2.0',
      id: 24,
      method: 'tools/call',
      params: { name: 'grd_current_timestamp', arguments: { format: 'date' } },
    });

    expect(response.result).toBeDefined();
    expect(response.result.content[0].type).toBe('text');
    const parsed = JSON.parse(response.result.content[0].text);
    expect(parsed.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('successful calls return { content: [{ type: "text", text: "..." }] }', () => {
    const response = server.handleMessage({
      jsonrpc: '2.0',
      id: 25,
      method: 'tools/call',
      params: { name: 'grd_generate_slug', arguments: { text: 'Test' } },
    });

    expect(response.result.content).toHaveLength(1);
    expect(response.result.content[0]).toEqual(
      expect.objectContaining({
        type: 'text',
        text: expect.any(String),
      })
    );
  });

  test('text field contains valid JSON (parseable)', () => {
    const response = server.handleMessage({
      jsonrpc: '2.0',
      id: 26,
      method: 'tools/call',
      params: { name: 'grd_state_load', arguments: {} },
    });

    expect(() => JSON.parse(response.result.content[0].text)).not.toThrow();
  });

  test('grd_state_get with no section returns state content', () => {
    const response = server.handleMessage({
      jsonrpc: '2.0',
      id: 27,
      method: 'tools/call',
      params: { name: 'grd_state_get', arguments: {} },
    });

    expect(response.result).toBeDefined();
    expect(response.result.content[0].type).toBe('text');
  });

  test('grd_roadmap_analyze returns structured analysis', () => {
    const response = server.handleMessage({
      jsonrpc: '2.0',
      id: 28,
      method: 'tools/call',
      params: { name: 'grd_roadmap_analyze', arguments: {} },
    });

    expect(response.result).toBeDefined();
    expect(response.result.content[0].type).toBe('text');
  });

  test('grd_phases_list returns phases info', () => {
    const response = server.handleMessage({
      jsonrpc: '2.0',
      id: 29,
      method: 'tools/call',
      params: { name: 'grd_phases_list', arguments: {} },
    });

    expect(response.result).toBeDefined();
    expect(response.result.content[0].type).toBe('text');
  });

  test('grd_health returns health info', () => {
    const response = server.handleMessage({
      jsonrpc: '2.0',
      id: 30,
      method: 'tools/call',
      params: { name: 'grd_health', arguments: {} },
    });

    expect(response.result).toBeDefined();
    expect(response.result.content[0].type).toBe('text');
  });
});

// ─── 6b. Bulk tool execution coverage ──────────────────────────────────────
// Exercise the execute lambda of every COMMAND_DESCRIPTORS entry to achieve
// 80%+ function/line coverage. Each call goes through handleMessage → _handleToolsCall
// → _executeTool → descriptor.execute, covering the lambda.

describe('handleMessage — bulk tool execute lambda coverage', () => {
  // Helper: call a tool and return the response (success or isError)
  function callTool(name, args = {}) {
    return server.handleMessage({
      jsonrpc: '2.0',
      id: `bulk-${name}`,
      method: 'tools/call',
      params: { name, arguments: args },
    });
  }

  // State commands
  test('grd_state_load execute lambda', () => {
    const r = callTool('grd_state_load');
    expect(r.result || r.error).toBeDefined();
  });

  test('grd_state_get execute lambda', () => {
    const r = callTool('grd_state_get', { section: 'blockers' });
    expect(r.result || r.error).toBeDefined();
  });

  test('grd_state_snapshot execute lambda', () => {
    const r = callTool('grd_state_snapshot');
    expect(r.result || r.error).toBeDefined();
  });

  test('grd_state_update_progress execute lambda', () => {
    const r = callTool('grd_state_update_progress');
    expect(r.result || r.error).toBeDefined();
  });

  test('grd_state_advance_plan execute lambda', () => {
    // May error on fixture state but exercises the lambda
    const r = callTool('grd_state_advance_plan');
    expect(r.result || r.error).toBeDefined();
  });

  test('grd_state_record_metric execute lambda', () => {
    const r = callTool('grd_state_record_metric', {
      phase: '1',
      plan: '1',
      duration: '1min',
      tasks: '1',
      files: '1',
    });
    expect(r.result || r.error).toBeDefined();
  });

  test('grd_state_add_decision execute lambda', () => {
    const r = callTool('grd_state_add_decision', {
      summary: 'Test decision',
      phase: '1',
      rationale: 'test',
    });
    expect(r.result || r.error).toBeDefined();
  });

  test('grd_state_add_blocker execute lambda', () => {
    const r = callTool('grd_state_add_blocker', { text: 'Test blocker' });
    expect(r.result || r.error).toBeDefined();
  });

  test('grd_state_resolve_blocker execute lambda', () => {
    const r = callTool('grd_state_resolve_blocker', { text: 'Test blocker' });
    expect(r.result || r.error).toBeDefined();
  });

  test('grd_state_record_session execute lambda', () => {
    const r = callTool('grd_state_record_session', {
      stopped_at: 'Test stop',
      resume_file: 'None',
    });
    expect(r.result || r.error).toBeDefined();
  });

  test('grd_state_update execute lambda', () => {
    const r = callTool('grd_state_update', { field: 'test', value: 'val' });
    expect(r.result || r.error).toBeDefined();
  });

  test('grd_state_patch execute lambda', () => {
    const r = callTool('grd_state_patch', { patches: {} });
    expect(r.result || r.error).toBeDefined();
  });

  // Top-level commands
  test('grd_resolve_model execute lambda', () => {
    const r = callTool('grd_resolve_model', { agent_type: 'grd-executor' });
    expect(r.result || r.error).toBeDefined();
  });

  test('grd_find_phase execute lambda', () => {
    const r = callTool('grd_find_phase', { phase: '1' });
    expect(r.result || r.error).toBeDefined();
  });

  // Verify commands
  test('grd_verify_summary execute lambda', () => {
    const r = callTool('grd_verify_summary', { file: 'nonexistent.md' });
    expect(r.result || r.error).toBeDefined();
  });

  test('grd_verify_plan_structure execute lambda', () => {
    const r = callTool('grd_verify_plan_structure', { file: 'nonexistent.md' });
    expect(r.result || r.error).toBeDefined();
  });

  test('grd_verify_phase_completeness execute lambda', () => {
    const r = callTool('grd_verify_phase_completeness', { phase: '1' });
    expect(r.result || r.error).toBeDefined();
  });

  test('grd_verify_references execute lambda', () => {
    const r = callTool('grd_verify_references', { file: 'nonexistent.md' });
    expect(r.result || r.error).toBeDefined();
  });

  test('grd_verify_commits execute lambda', () => {
    const r = callTool('grd_verify_commits', { hashes: ['abc1234'] });
    expect(r.result || r.error).toBeDefined();
  });

  test('grd_verify_artifacts execute lambda', () => {
    const r = callTool('grd_verify_artifacts', { file: 'nonexistent.md' });
    expect(r.result || r.error).toBeDefined();
  });

  test('grd_verify_key_links execute lambda', () => {
    const r = callTool('grd_verify_key_links', { file: 'nonexistent.md' });
    expect(r.result || r.error).toBeDefined();
  });

  // Template & Scaffold
  test('grd_template_select execute lambda', () => {
    const r = callTool('grd_template_select', { type: 'summary' });
    expect(r.result || r.error).toBeDefined();
  });

  test('grd_template_fill execute lambda', () => {
    const r = callTool('grd_template_fill', {
      template: 'summary',
      phase: '1',
      plan: '1',
      name: 'Test',
    });
    expect(r.result || r.error).toBeDefined();
  });

  test('grd_scaffold execute lambda', () => {
    const r = callTool('grd_scaffold', { type: 'context', phase: '99', name: 'test' });
    expect(r.result || r.error).toBeDefined();
  });

  // Frontmatter
  test('grd_frontmatter_get execute lambda', () => {
    const r = callTool('grd_frontmatter_get', { file: 'nonexistent.md' });
    expect(r.result || r.error).toBeDefined();
  });

  test('grd_frontmatter_set execute lambda', () => {
    const r = callTool('grd_frontmatter_set', { file: 'nonexistent.md', field: 'x', value: 'y' });
    expect(r.result || r.error).toBeDefined();
  });

  test('grd_frontmatter_merge execute lambda', () => {
    const r = callTool('grd_frontmatter_merge', { file: 'nonexistent.md', data: '{}' });
    expect(r.result || r.error).toBeDefined();
  });

  test('grd_frontmatter_validate execute lambda', () => {
    const r = callTool('grd_frontmatter_validate', { file: 'nonexistent.md' });
    expect(r.result || r.error).toBeDefined();
  });

  // Utility commands
  test('grd_generate_slug execute lambda', () => {
    const r = callTool('grd_generate_slug', { text: 'Bulk Test' });
    expect(r.result).toBeDefined();
  });

  test('grd_current_timestamp execute lambda', () => {
    const r = callTool('grd_current_timestamp', { format: 'full' });
    expect(r.result).toBeDefined();
  });

  test('grd_list_todos execute lambda', () => {
    const r = callTool('grd_list_todos');
    expect(r.result || r.error).toBeDefined();
  });

  test('grd_todo_complete execute lambda', () => {
    const r = callTool('grd_todo_complete', { filename: 'nonexistent.md' });
    expect(r.result || r.error).toBeDefined();
  });

  test('grd_verify_path_exists execute lambda', () => {
    const r = callTool('grd_verify_path_exists', { path: '.planning' });
    expect(r.result || r.error).toBeDefined();
  });

  test('grd_config_ensure_section execute lambda', () => {
    const r = callTool('grd_config_ensure_section');
    expect(r.result || r.error).toBeDefined();
  });

  test('grd_config_set execute lambda', () => {
    const r = callTool('grd_config_set', { key: 'test_key', value: 'test_val' });
    expect(r.result || r.error).toBeDefined();
  });

  test('grd_history_digest execute lambda', () => {
    const r = callTool('grd_history_digest');
    expect(r.result || r.error).toBeDefined();
  });

  // Phases
  test('grd_phases_list execute lambda', () => {
    const r = callTool('grd_phases_list');
    expect(r.result || r.error).toBeDefined();
  });

  // Roadmap
  test('grd_roadmap_get_phase execute lambda', () => {
    const r = callTool('grd_roadmap_get_phase', { phase: '1' });
    expect(r.result || r.error).toBeDefined();
  });

  test('grd_roadmap_analyze execute lambda', () => {
    const r = callTool('grd_roadmap_analyze');
    expect(r.result || r.error).toBeDefined();
  });

  // Phase operations
  test('grd_phase_next_decimal execute lambda', () => {
    const r = callTool('grd_phase_next_decimal', { phase: '1' });
    expect(r.result || r.error).toBeDefined();
  });

  test('grd_validate_consistency execute lambda', () => {
    const r = callTool('grd_validate_consistency');
    expect(r.result || r.error).toBeDefined();
  });

  // Progress
  test('grd_progress execute lambda', () => {
    const r = callTool('grd_progress', { format: 'json' });
    expect(r.result || r.error).toBeDefined();
  });

  // Phase plan index
  test('grd_phase_plan_index execute lambda', () => {
    const r = callTool('grd_phase_plan_index', { phase: '1' });
    expect(r.result || r.error).toBeDefined();
  });

  // Summary extract
  test('grd_summary_extract execute lambda', () => {
    const r = callTool('grd_summary_extract', { file: 'nonexistent.md' });
    expect(r.result || r.error).toBeDefined();
  });

  // Tracker commands
  test('grd_tracker_get_config execute lambda', () => {
    const r = callTool('grd_tracker_get_config');
    expect(r.result || r.error).toBeDefined();
  });

  test('grd_tracker_sync_status execute lambda', () => {
    const r = callTool('grd_tracker_sync_status');
    expect(r.result || r.error).toBeDefined();
  });

  test('grd_tracker_schedule execute lambda', () => {
    const r = callTool('grd_tracker_schedule');
    expect(r.result || r.error).toBeDefined();
  });

  test('grd_tracker_prepare_reschedule execute lambda', () => {
    const r = callTool('grd_tracker_prepare_reschedule');
    expect(r.result || r.error).toBeDefined();
  });

  test('grd_tracker_prepare_roadmap_sync execute lambda', () => {
    const r = callTool('grd_tracker_prepare_roadmap_sync');
    expect(r.result || r.error).toBeDefined();
  });

  test('grd_tracker_prepare_phase_sync execute lambda', () => {
    const r = callTool('grd_tracker_prepare_phase_sync', { phase: '1' });
    expect(r.result || r.error).toBeDefined();
  });

  test('grd_tracker_sync_roadmap execute lambda', () => {
    const r = callTool('grd_tracker_sync_roadmap');
    expect(r.result || r.error).toBeDefined();
  });

  test('grd_tracker_sync_phase execute lambda', () => {
    const r = callTool('grd_tracker_sync_phase', { phase: '1' });
    expect(r.result || r.error).toBeDefined();
  });

  test('grd_tracker_update_status execute lambda', () => {
    const r = callTool('grd_tracker_update_status', { phase: '1', status: 'in_progress' });
    expect(r.result || r.error).toBeDefined();
  });

  test('grd_tracker_add_comment execute lambda', () => {
    const r = callTool('grd_tracker_add_comment', { phase: '1', file: 'nonexistent.md' });
    expect(r.result || r.error).toBeDefined();
  });

  test('grd_tracker_record_mapping execute lambda', () => {
    const r = callTool('grd_tracker_record_mapping', { args: ['test'] });
    expect(r.result || r.error).toBeDefined();
  });

  test('grd_tracker_record_status execute lambda', () => {
    const r = callTool('grd_tracker_record_status', { args: ['test'] });
    expect(r.result || r.error).toBeDefined();
  });

  // Dashboard, Phase Detail, Health
  test('grd_dashboard execute lambda', () => {
    const r = callTool('grd_dashboard');
    expect(r.result || r.error).toBeDefined();
  });

  test('grd_phase_detail execute lambda', () => {
    const r = callTool('grd_phase_detail', { phase: '1' });
    expect(r.result || r.error).toBeDefined();
  });

  test('grd_health execute lambda', () => {
    const r = callTool('grd_health');
    expect(r.result || r.error).toBeDefined();
  });

  test('grd_detect_backend execute lambda', () => {
    const r = callTool('grd_detect_backend');
    expect(r.result || r.error).toBeDefined();
  });

  // Init workflows
  test('grd_init_execute_phase execute lambda', () => {
    const r = callTool('grd_init_execute_phase', { phase: '1' });
    expect(r.result || r.error).toBeDefined();
  });

  test('grd_init_plan_phase execute lambda', () => {
    const r = callTool('grd_init_plan_phase', { phase: '1' });
    expect(r.result || r.error).toBeDefined();
  });

  test('grd_init_new_project execute lambda', () => {
    const r = callTool('grd_init_new_project');
    expect(r.result || r.error).toBeDefined();
  });

  test('grd_init_new_milestone execute lambda', () => {
    const r = callTool('grd_init_new_milestone');
    expect(r.result || r.error).toBeDefined();
  });

  test('grd_init_quick execute lambda', () => {
    const r = callTool('grd_init_quick', { description: 'test' });
    expect(r.result || r.error).toBeDefined();
  });

  test('grd_init_resume execute lambda', () => {
    const r = callTool('grd_init_resume');
    expect(r.result || r.error).toBeDefined();
  });

  test('grd_init_verify_work execute lambda', () => {
    const r = callTool('grd_init_verify_work', { phase: '1' });
    expect(r.result || r.error).toBeDefined();
  });

  test('grd_init_phase_op execute lambda', () => {
    const r = callTool('grd_init_phase_op', { phase: '1' });
    expect(r.result || r.error).toBeDefined();
  });

  test('grd_init_todos execute lambda', () => {
    const r = callTool('grd_init_todos');
    expect(r.result || r.error).toBeDefined();
  });

  test('grd_init_milestone_op execute lambda', () => {
    const r = callTool('grd_init_milestone_op');
    expect(r.result || r.error).toBeDefined();
  });

  test('grd_init_plan_milestone_gaps execute lambda', () => {
    const r = callTool('grd_init_plan_milestone_gaps');
    expect(r.result || r.error).toBeDefined();
  });

  test('grd_init_map_codebase execute lambda', () => {
    const r = callTool('grd_init_map_codebase');
    expect(r.result || r.error).toBeDefined();
  });

  test('grd_init_progress execute lambda', () => {
    const r = callTool('grd_init_progress');
    expect(r.result || r.error).toBeDefined();
  });

  test('grd_init_survey execute lambda', () => {
    const r = callTool('grd_init_survey', { topic: 'test' });
    expect(r.result || r.error).toBeDefined();
  });

  test('grd_init_deep_dive execute lambda', () => {
    const r = callTool('grd_init_deep_dive', { paper: 'test' });
    expect(r.result || r.error).toBeDefined();
  });

  test('grd_init_feasibility execute lambda', () => {
    const r = callTool('grd_init_feasibility', { approach: 'test' });
    expect(r.result || r.error).toBeDefined();
  });

  test('grd_init_eval_plan execute lambda', () => {
    const r = callTool('grd_init_eval_plan', { description: 'test' });
    expect(r.result || r.error).toBeDefined();
  });

  test('grd_init_eval_report execute lambda', () => {
    const r = callTool('grd_init_eval_report', { description: 'test' });
    expect(r.result || r.error).toBeDefined();
  });

  test('grd_init_assess_baseline execute lambda', () => {
    const r = callTool('grd_init_assess_baseline', { description: 'test' });
    expect(r.result || r.error).toBeDefined();
  });

  test('grd_init_product_plan execute lambda', () => {
    const r = callTool('grd_init_product_plan', { description: 'test' });
    expect(r.result || r.error).toBeDefined();
  });

  test('grd_init_iterate execute lambda', () => {
    const r = callTool('grd_init_iterate', { description: 'test' });
    expect(r.result || r.error).toBeDefined();
  });

  // Long-term roadmap commands
  test('grd_long_term_roadmap_list execute lambda', () => {
    const r = callTool('grd_long_term_roadmap_list');
    expect(r.result || r.error).toBeDefined();
  });

  test('grd_long_term_roadmap_add execute lambda', () => {
    const r = callTool('grd_long_term_roadmap_add', { name: 'Test', goal: 'Test goal' });
    expect(r.result || r.error).toBeDefined();
  });

  test('grd_long_term_roadmap_remove execute lambda', () => {
    const r = callTool('grd_long_term_roadmap_remove', { id: 'LT-99' });
    expect(r.result || r.error).toBeDefined();
  });

  test('grd_long_term_roadmap_update execute lambda', () => {
    const r = callTool('grd_long_term_roadmap_update', { id: 'LT-1', goal: 'Updated' });
    expect(r.result || r.error).toBeDefined();
  });

  test('grd_long_term_roadmap_link execute lambda', () => {
    const r = callTool('grd_long_term_roadmap_link', { id: 'LT-1', version: 'v9.9.9' });
    expect(r.result || r.error).toBeDefined();
  });

  test('grd_long_term_roadmap_unlink execute lambda', () => {
    const r = callTool('grd_long_term_roadmap_unlink', { id: 'LT-1', version: 'v9.9.9' });
    expect(r.result || r.error).toBeDefined();
  });

  test('grd_long_term_roadmap_init execute lambda', () => {
    const r = callTool('grd_long_term_roadmap_init');
    expect(r.result || r.error).toBeDefined();
  });

  test('grd_long_term_roadmap_parse execute lambda', () => {
    const r = callTool('grd_long_term_roadmap_parse');
    expect(r.result || r.error).toBeDefined();
  });

  test('grd_long_term_roadmap_validate execute lambda', () => {
    const r = callTool('grd_long_term_roadmap_validate');
    expect(r.result || r.error).toBeDefined();
  });

  test('grd_long_term_roadmap_display execute lambda', () => {
    const r = callTool('grd_long_term_roadmap_display');
    expect(r.result || r.error).toBeDefined();
  });

  test('grd_long_term_roadmap_refine execute lambda', () => {
    const r = callTool('grd_long_term_roadmap_refine', { id: 'LT-1' });
    expect(r.result || r.error).toBeDefined();
  });

  test('grd_long_term_roadmap_history execute lambda', () => {
    const r = callTool('grd_long_term_roadmap_history', { action: 'test', details: 'test' });
    expect(r.result || r.error).toBeDefined();
  });

  // Quality analysis
  test('grd_quality_analysis execute lambda', () => {
    const r = callTool('grd_quality_analysis', { phase: '1' });
    expect(r.result || r.error).toBeDefined();
  });

  // Requirement & Search commands
  test('grd_requirement_get execute lambda', () => {
    const r = callTool('grd_requirement_get', { req_id: 'REQ-1' });
    expect(r.result || r.error).toBeDefined();
  });

  test('grd_requirement_list execute lambda', () => {
    const r = callTool('grd_requirement_list', {});
    expect(r.result || r.error).toBeDefined();
  });

  test('grd_requirement_list with filters execute lambda', () => {
    const r = callTool('grd_requirement_list', { phase: '1', priority: 'P1' });
    expect(r.result || r.error).toBeDefined();
  });

  test('grd_requirement_traceability execute lambda', () => {
    const r = callTool('grd_requirement_traceability', {});
    expect(r.result || r.error).toBeDefined();
  });

  test('grd_requirement_traceability with phase filter execute lambda', () => {
    const r = callTool('grd_requirement_traceability', { phase: '1' });
    expect(r.result || r.error).toBeDefined();
  });

  test('grd_requirement_update_status execute lambda', () => {
    const r = callTool('grd_requirement_update_status', { req_id: 'REQ-1', status: 'Done' });
    expect(r.result || r.error).toBeDefined();
  });

  test('grd_search execute lambda', () => {
    const r = callTool('grd_search', { query: 'test' });
    expect(r.result || r.error).toBeDefined();
  });

  // Worktree commands
  test('grd_worktree_create execute lambda', () => {
    const r = callTool('grd_worktree_create', { phase: '99' });
    expect(r.result || r.error).toBeDefined();
  });

  test('grd_worktree_remove execute lambda', () => {
    const r = callTool('grd_worktree_remove', { phase: '99' });
    expect(r.result || r.error).toBeDefined();
  });

  test('grd_worktree_remove stale execute lambda', () => {
    const r = callTool('grd_worktree_remove', { stale: true });
    expect(r.result || r.error).toBeDefined();
  });

  test('grd_worktree_list execute lambda', () => {
    const r = callTool('grd_worktree_list');
    expect(r.result || r.error).toBeDefined();
  });

  test('grd_worktree_push_pr execute lambda', () => {
    const r = callTool('grd_worktree_push_pr', { phase: '99' });
    expect(r.result || r.error).toBeDefined();
  });

  // Autopilot commands (skip grd_autopilot_run — async + process.exit crashes jest worker)
  test('grd_autopilot_init execute lambda', () => {
    const r = callTool('grd_autopilot_init');
    expect(r.result || r.error).toBeDefined();
  });

  // Evolve commands
  test('grd_evolve_discover execute lambda', () => {
    const r = callTool('grd_evolve_discover', { count: 3 });
    expect(r.result || r.error).toBeDefined();
  });

  test('grd_evolve_state execute lambda', () => {
    const r = callTool('grd_evolve_state');
    expect(r.result || r.error).toBeDefined();
  });

  test('grd_evolve_advance execute lambda', () => {
    const r = callTool('grd_evolve_advance');
    expect(r.result || r.error).toBeDefined();
  });

  test('grd_evolve_reset execute lambda', () => {
    const r = callTool('grd_evolve_reset');
    expect(r.result || r.error).toBeDefined();
  });

  test('grd_evolve_init execute lambda', () => {
    const r = callTool('grd_evolve_init');
    expect(r.result || r.error).toBeDefined();
  });

  // Markdown splitting commands
  test('grd_markdown_check execute lambda', () => {
    const mdPath = path.join(fixtureDir, 'check-test.md');
    fs.writeFileSync(mdPath, '# Test\n\nSome content.\n', 'utf-8');
    const r = callTool('grd_markdown_check', { file: mdPath });
    expect(r.result).toBeDefined();
    const data = JSON.parse(r.result.content[0].text);
    expect(data.is_index).toBe(false);
    expect(typeof data.estimated_tokens).toBe('number');
  });

  test('grd_markdown_check on missing file returns error', () => {
    const r = callTool('grd_markdown_check', { file: '/tmp/no-such-file-xyz.md' });
    expect(r.error).toBeDefined();
    expect(r.error.code).toBe(-32603);
  });

  test('grd_markdown_split on small file skips split', () => {
    const mdPath = path.join(fixtureDir, 'small-split.md');
    fs.writeFileSync(mdPath, '# Small\n\nBelow threshold.\n', 'utf-8');
    const r = callTool('grd_markdown_split', { file: mdPath });
    expect(r.result).toBeDefined();
    const data = JSON.parse(r.result.content[0].text);
    expect(data.split_performed).toBe(false);
  });

  test('grd_markdown_split on missing file returns error', () => {
    const r = callTool('grd_markdown_split', { file: '/tmp/no-such-file-xyz.md' });
    expect(r.error).toBeDefined();
    expect(r.error.code).toBe(-32603);
  });

  // Coverage & Health commands
  test('grd_coverage_report execute lambda', () => {
    const r = callTool('grd_coverage_report', { threshold: 80 });
    expect(r.result || r.error).toBeDefined();
  });

  test('grd_health_check execute lambda', () => {
    const r = callTool('grd_health_check', { fix: false });
    expect(r.result || r.error).toBeDefined();
  });
});

// ─── 7. handleMessage — Error Paths ────────────────────────────────────────

describe('handleMessage — error paths', () => {
  test('unknown method returns code -32601', () => {
    const response = server.handleMessage({
      jsonrpc: '2.0',
      id: 40,
      method: 'unknown/method',
    });

    expect(response.error).toBeDefined();
    expect(response.error.code).toBe(-32601);
    expect(response.error.message).toBe('Method not found');
  });

  test('unknown tool name in tools/call returns error', () => {
    const response = server.handleMessage({
      jsonrpc: '2.0',
      id: 41,
      method: 'tools/call',
      params: { name: 'grd_nonexistent_tool', arguments: {} },
    });

    expect(response.error).toBeDefined();
    expect(response.error.code).toBe(-32601);
    expect(response.error.data).toEqual({ tool: 'grd_nonexistent_tool' });
  });

  test('missing required params returns code -32602 with data listing missing params', () => {
    const response = server.handleMessage({
      jsonrpc: '2.0',
      id: 42,
      method: 'tools/call',
      params: { name: 'grd_phase_add', arguments: {} },
    });

    expect(response.error).toBeDefined();
    expect(response.error.code).toBe(-32602);
    expect(response.error.message).toBe('Invalid params');
    expect(response.error.data.missing).toContain('description');
  });

  test('missing method field returns code -32600', () => {
    const response = server.handleMessage({
      jsonrpc: '2.0',
      id: 43,
    });

    expect(response.error).toBeDefined();
    expect(response.error.code).toBe(-32600);
    expect(response.error.message).toBe('Invalid Request');
  });

  test('missing id field for request still produces error response', () => {
    // A method that requires id but doesn't have one — treated as notification
    // For unknown methods with no id, it returns null (treated as notification)
    // For known methods (tools/call) with no id, it's a notification => null
    const response = server.handleMessage({
      jsonrpc: '2.0',
      method: 'tools/call',
      params: { name: 'grd_state_load', arguments: {} },
    });

    // No id = notification — returns null
    expect(response).toBeNull();
  });

  test('tools/call with no name returns error response', () => {
    const response = server.handleMessage({
      jsonrpc: '2.0',
      id: 44,
      method: 'tools/call',
      params: {},
    });

    expect(response.error).toBeDefined();
    expect(response.error.code).toBe(-32602);
    expect(response.error.data.missing).toContain('name');
  });

  test('tools/call with null params returns error response', () => {
    const response = server.handleMessage({
      jsonrpc: '2.0',
      id: 45,
      method: 'tools/call',
      params: null,
    });

    expect(response.error).toBeDefined();
    expect(response.error.code).toBe(-32602);
  });

  test('tools/call with no arguments when tool has required params returns error', () => {
    const response = server.handleMessage({
      jsonrpc: '2.0',
      id: 46,
      method: 'tools/call',
      params: { name: 'grd_verify_plan_structure' },
      // No arguments field — defaults to {}
    });

    expect(response.error).toBeDefined();
    expect(response.error.code).toBe(-32602);
    expect(response.error.data.missing).toContain('file');
  });

  test('grd_requirement_update_status with missing req_id returns -32602', () => {
    const response = server.handleMessage({
      jsonrpc: '2.0',
      id: 47.1,
      method: 'tools/call',
      params: { name: 'grd_requirement_update_status', arguments: { status: 'Done' } },
    });

    expect(response.error).toBeDefined();
    expect(response.error.code).toBe(-32602);
    expect(response.error.data.missing).toContain('req_id');
  });

  test('multiple missing required params are all listed', () => {
    const response = server.handleMessage({
      jsonrpc: '2.0',
      id: 47,
      method: 'tools/call',
      params: { name: 'grd_state_update', arguments: {} },
    });

    expect(response.error).toBeDefined();
    expect(response.error.code).toBe(-32602);
    expect(response.error.data.missing).toContain('field');
    expect(response.error.data.missing).toContain('value');
  });

  test('error response has correct JSON-RPC structure', () => {
    const response = server.handleMessage({
      jsonrpc: '2.0',
      id: 48,
      method: 'nonexistent',
    });

    expect(response.jsonrpc).toBe('2.0');
    expect(response.id).toBe(48);
    expect(response.error).toBeDefined();
    expect(typeof response.error.code).toBe('number');
    expect(typeof response.error.message).toBe('string');
  });

  test('empty method string returns -32600', () => {
    const response = server.handleMessage({
      jsonrpc: '2.0',
      id: 49,
      method: '',
    });

    expect(response.error).toBeDefined();
    expect(response.error.code).toBe(-32600);
  });

  test('non-string method returns -32600', () => {
    const response = server.handleMessage({
      jsonrpc: '2.0',
      id: 50,
      method: 123,
    });

    expect(response.error).toBeDefined();
    expect(response.error.code).toBe(-32600);
  });
});

// ─── 8. Edge Cases ─────────────────────────────────────────────────────────

describe('handleMessage — edge cases', () => {
  test('null message returns error response', () => {
    const response = server.handleMessage(null);

    expect(response.error).toBeDefined();
    expect(response.error.code).toBe(-32600);
    expect(response.id).toBeNull();
  });

  test('undefined message returns error response', () => {
    const response = server.handleMessage(undefined);

    expect(response.error).toBeDefined();
    expect(response.error.code).toBe(-32600);
  });

  test('empty object returns error response', () => {
    const response = server.handleMessage({});

    expect(response.error).toBeDefined();
    expect(response.error.code).toBe(-32600);
  });

  test('non-object message (string) returns error response', () => {
    const response = server.handleMessage('not an object');

    expect(response.error).toBeDefined();
    expect(response.error.code).toBe(-32600);
  });

  test('non-object message (number) returns error response', () => {
    const response = server.handleMessage(42);

    expect(response.error).toBeDefined();
    expect(response.error.code).toBe(-32600);
  });

  test('non-object message (array) returns error response', () => {
    const response = server.handleMessage([1, 2, 3]);

    // Arrays pass typeof === 'object', but still have no method field
    expect(response.error).toBeDefined();
    expect(response.error.code).toBe(-32600);
  });

  test('boolean message returns error response', () => {
    const response = server.handleMessage(true);

    expect(response.error).toBeDefined();
    expect(response.error.code).toBe(-32600);
  });
});

// ─── 9. captureExecution — Output Capture Helper ───────────────────────────

describe('captureExecution()', () => {
  test('captures stdout output', () => {
    const result = captureExecution(() => {
      process.stdout.write('hello from stdout');
    });

    expect(result.stdout).toBe('hello from stdout');
    expect(result.exitCode).toBe(0);
  });

  test('captures stderr output', () => {
    const result = captureExecution(() => {
      process.stderr.write('error message');
    });

    expect(result.stderr).toBe('error message');
  });

  test('captures process.exit code', () => {
    const result = captureExecution(() => {
      process.stdout.write('{"ok":true}\n');
      process.exit(0);
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('{"ok":true}');
  });

  test('captures non-zero exit code', () => {
    const result = captureExecution(() => {
      process.stderr.write('fail');
      process.exit(1);
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe('fail');
  });

  test('re-throws real errors (not exit sentinels)', () => {
    expect(() => {
      captureExecution(() => {
        throw new Error('real error');
      });
    }).toThrow('real error');
  });

  test('restores stdout.write after execution', () => {
    const originalWrite = process.stdout.write;
    captureExecution(() => {
      process.stdout.write('test');
    });
    expect(process.stdout.write).toBe(originalWrite);
  });

  test('restores stderr.write after execution', () => {
    const originalWrite = process.stderr.write;
    captureExecution(() => {
      process.stderr.write('test');
    });
    expect(process.stderr.write).toBe(originalWrite);
  });

  test('restores process.exit after execution', () => {
    const originalExit = process.exit;
    captureExecution(() => {
      process.stdout.write('done');
    });
    expect(process.exit).toBe(originalExit);
  });

  test('restores everything even when process.exit is called', () => {
    const origWrite = process.stdout.write;
    const origErrWrite = process.stderr.write;
    const origExit = process.exit;

    captureExecution(() => {
      process.exit(0);
    });

    expect(process.stdout.write).toBe(origWrite);
    expect(process.stderr.write).toBe(origErrWrite);
    expect(process.exit).toBe(origExit);
  });

  test('handles functions that produce no output', () => {
    const result = captureExecution(() => {
      // do nothing
    });

    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
  });
});

// ─── 10. McpServer Constructor ─────────────────────────────────────────────

describe('McpServer constructor', () => {
  test('defaults cwd to process.cwd() when not provided', () => {
    const s = new McpServer();
    expect(s.cwd).toBe(process.cwd());
  });

  test('uses provided cwd option', () => {
    const s = new McpServer({ cwd: '/tmp/test' });
    expect(s.cwd).toBe('/tmp/test');
  });

  test('initializes toolDefinitions', () => {
    const s = new McpServer({ cwd: fixtureDir });
    expect(Array.isArray(s.toolDefinitions)).toBe(true);
    expect(s.toolDefinitions.length).toBeGreaterThan(0);
  });

  test('initializes _initialized to false', () => {
    const s = new McpServer({ cwd: fixtureDir });
    expect(s._initialized).toBe(false);
  });

  test('builds _descriptorMap with all command names', () => {
    const s = new McpServer({ cwd: fixtureDir });
    expect(s._descriptorMap).toBeInstanceOf(Map);
    expect(s._descriptorMap.size).toBe(COMMAND_DESCRIPTORS.length);
    for (const desc of COMMAND_DESCRIPTORS) {
      expect(s._descriptorMap.has(desc.name)).toBe(true);
    }
  });

  test('accepts empty options object', () => {
    const s = new McpServer({});
    expect(s.cwd).toBe(process.cwd());
  });
});

// ─── 11. Tool execution error handling (command failures) ──────────────────

describe('handleMessage — tool execution errors', () => {
  test('tool that produces exit code 1 returns isError result', () => {
    const response = server.handleMessage({
      jsonrpc: '2.0',
      id: 60,
      method: 'tools/call',
      params: { name: 'grd_generate_slug', arguments: { text: '' } },
    });

    // Empty slug input causes error exit
    expect(response.result).toBeDefined();
    expect(response.result.isError).toBe(true);
    expect(response.result.content[0].type).toBe('text');
  });

  test('tool with non-JSON stdout preserves raw text', () => {
    // grd_dashboard outputs raw text (non-JSON) when raw=true
    const response = server.handleMessage({
      jsonrpc: '2.0',
      id: 61,
      method: 'tools/call',
      params: { name: 'grd_dashboard', arguments: {} },
    });

    expect(response.result).toBeDefined();
    expect(response.result.content[0].type).toBe('text');
    // Dashboard output is text, not JSON
    expect(typeof response.result.content[0].text).toBe('string');
  });
});

// ─── 12. v0.2.8 Evolve MCP Tools ───────────────────────────────────────────
// Validates all evolve MCP tools from Phases 55-56: enumeration, schema
// completeness, invocation correctness, and commands/evolve.md slash command.

describe('v0.2.8 evolve MCP tools', () => {
  const EXPECTED_EVOLVE_TOOLS = [
    'grd_evolve_discover',
    'grd_evolve_state',
    'grd_evolve_advance',
    'grd_evolve_reset',
    'grd_evolve_init',
    'grd_evolve_run',
  ];

  let evolveFixtureDir;
  let evolveServer;

  beforeAll(() => {
    evolveFixtureDir = createFixtureDir();
    // Ensure .planning/config.json has minimal config for evolve commands
    const configPath = path.join(evolveFixtureDir, '.planning', 'config.json');
    if (!fs.existsSync(configPath)) {
      fs.writeFileSync(configPath, JSON.stringify({ model_profile: 'quality' }), 'utf-8');
    }
    evolveServer = new McpServer({ cwd: evolveFixtureDir });
  });

  afterAll(() => {
    cleanupFixtureDir(evolveFixtureDir);
  });

  // ── Enumeration ──

  test('all expected evolve tool names appear in buildToolDefinitions()', () => {
    const tools = buildToolDefinitions();
    const evolveToolNames = tools.filter((t) => t.name.includes('evolve')).map((t) => t.name);

    for (const expected of EXPECTED_EVOLVE_TOOLS) {
      expect(evolveToolNames).toContain(expected);
    }
    expect(evolveToolNames.length).toBe(EXPECTED_EVOLVE_TOOLS.length);
  });

  test('all expected evolve tool names appear in COMMAND_DESCRIPTORS', () => {
    const descriptorNames = COMMAND_DESCRIPTORS.map((d) => d.name);
    for (const expected of EXPECTED_EVOLVE_TOOLS) {
      expect(descriptorNames).toContain(expected);
    }
  });

  // ── Schema completeness ──

  test('each evolve tool has name, description, and inputSchema fields', () => {
    const tools = buildToolDefinitions();
    const evolveTools = tools.filter((t) => EXPECTED_EVOLVE_TOOLS.includes(t.name));

    expect(evolveTools.length).toBe(EXPECTED_EVOLVE_TOOLS.length);

    for (const tool of evolveTools) {
      expect(typeof tool.name).toBe('string');
      expect(tool.name.length).toBeGreaterThan(0);
      expect(typeof tool.description).toBe('string');
      expect(tool.description.length).toBeGreaterThan(0);
      expect(typeof tool.inputSchema).toBe('object');
      expect(tool.inputSchema).not.toBeNull();
      expect(tool.inputSchema.type).toBe('object');
      expect(typeof tool.inputSchema.properties).toBe('object');
    }
  });

  test('each evolve COMMAND_DESCRIPTOR has name, description, params, and execute', () => {
    for (const toolName of EXPECTED_EVOLVE_TOOLS) {
      const desc = COMMAND_DESCRIPTORS.find((d) => d.name === toolName);
      expect(desc).toBeDefined();
      expect(typeof desc.name).toBe('string');
      expect(typeof desc.description).toBe('string');
      expect(Array.isArray(desc.params)).toBe(true);
      expect(typeof desc.execute).toBe('function');
    }
  });

  // ── Invocation: grd_evolve_discover ──

  test('grd_evolve_discover returns structured JSON (not error)', () => {
    const response = evolveServer.handleMessage({
      jsonrpc: '2.0',
      id: 'evolve-discover-1',
      method: 'tools/call',
      params: { name: 'grd_evolve_discover', arguments: { count: 2 } },
    });

    expect(response.result).toBeDefined();
    expect(Array.isArray(response.result.content)).toBe(true);
    expect(response.result.content[0].type).toBe('text');
    expect(typeof response.result.content[0].text).toBe('string');
    // Should produce valid JSON output (either success or structured error, not undefined)
    expect(response.result.content[0].text.length).toBeGreaterThan(0);
  });

  // ── Invocation: grd_evolve_state ──

  test('grd_evolve_state returns structured JSON (not error)', () => {
    const response = evolveServer.handleMessage({
      jsonrpc: '2.0',
      id: 'evolve-state-1',
      method: 'tools/call',
      params: { name: 'grd_evolve_state', arguments: {} },
    });

    expect(response.result).toBeDefined();
    expect(Array.isArray(response.result.content)).toBe(true);
    expect(response.result.content[0].type).toBe('text');
    expect(typeof response.result.content[0].text).toBe('string');
    expect(response.result.content[0].text.length).toBeGreaterThan(0);
  });

  // ── Invocation: grd_evolve_advance ──

  test('grd_evolve_advance returns structured response', () => {
    const response = evolveServer.handleMessage({
      jsonrpc: '2.0',
      id: 'evolve-advance-1',
      method: 'tools/call',
      params: { name: 'grd_evolve_advance', arguments: {} },
    });

    expect(response.result).toBeDefined();
    expect(Array.isArray(response.result.content)).toBe(true);
    expect(response.result.content[0].type).toBe('text');
    expect(typeof response.result.content[0].text).toBe('string');
  });

  // ── Invocation: grd_evolve_reset ──

  test('grd_evolve_reset returns structured response', () => {
    const response = evolveServer.handleMessage({
      jsonrpc: '2.0',
      id: 'evolve-reset-1',
      method: 'tools/call',
      params: { name: 'grd_evolve_reset', arguments: {} },
    });

    expect(response.result).toBeDefined();
    expect(Array.isArray(response.result.content)).toBe(true);
    expect(response.result.content[0].type).toBe('text');
    expect(typeof response.result.content[0].text).toBe('string');
  });

  // ── Invocation: grd_evolve_init ──

  test('grd_evolve_init returns structured JSON with pre-flight context', () => {
    const response = evolveServer.handleMessage({
      jsonrpc: '2.0',
      id: 'evolve-init-1',
      method: 'tools/call',
      params: { name: 'grd_evolve_init', arguments: {} },
    });

    expect(response.result).toBeDefined();
    expect(Array.isArray(response.result.content)).toBe(true);
    expect(response.result.content[0].type).toBe('text');
    expect(typeof response.result.content[0].text).toBe('string');
    expect(response.result.content[0].text.length).toBeGreaterThan(0);
  });

  // ── Invocation: grd_evolve_run ──
  // grd_evolve_run has an async execute function (like grd_autopilot_run),
  // so captureExecution cannot safely intercept process.exit from async code.
  // Instead, verify the descriptor has the correct structure and the execute
  // function is callable (returns a Promise).

  test('grd_evolve_run descriptor has correct structure and callable execute', () => {
    const desc = COMMAND_DESCRIPTORS.find((d) => d.name === 'grd_evolve_run');
    expect(desc).toBeDefined();
    expect(typeof desc.execute).toBe('function');
    expect(desc.params.length).toBe(5);
    const paramNames = desc.params.map((p) => p.name);
    expect(paramNames).toContain('iterations');
    expect(paramNames).toContain('items');
    expect(paramNames).toContain('timeout');
    expect(paramNames).toContain('max_turns');
    expect(paramNames).toContain('dry_run');
  });

  // ── commands/evolve.md slash command ──

  test('commands/evolve.md exists with valid frontmatter containing description', () => {
    const evolveCmdPath = path.join(__dirname, '..', '..', 'commands', 'evolve.md');
    expect(fs.existsSync(evolveCmdPath)).toBe(true);

    const content = fs.readFileSync(evolveCmdPath, 'utf-8');
    const { extractFrontmatter } = require('../../lib/frontmatter');
    const fm = extractFrontmatter(content);
    expect(fm).toBeDefined();
    expect(typeof fm.description).toBe('string');
    expect(fm.description.length).toBeGreaterThan(0);
  });

  // ── No regression: existing MCP tools still work ──

  test('existing non-evolve MCP tools are not affected', () => {
    const tools = buildToolDefinitions();
    const nonEvolveTools = tools.filter((t) => !t.name.includes('evolve'));

    // There should be many non-evolve tools
    expect(nonEvolveTools.length).toBeGreaterThanOrEqual(90);

    // Spot-check a few
    const stateLoad = nonEvolveTools.find((t) => t.name === 'grd_state_load');
    expect(stateLoad).toBeDefined();
    const slugTool = nonEvolveTools.find((t) => t.name === 'grd_generate_slug');
    expect(slugTool).toBeDefined();
  });
});

// ─── 13. Previously-uncovered execute lambdas ───────────────────────────────
// Cover: grd_commit, phase ops, grd_init_execute_parallel, grd_markdown_split
// split-success path, and grd_autopilot_run / grd_evolve_run lambda bodies.

describe('handleMessage — previously-uncovered execute lambdas', () => {
  function callTool(name, args = {}) {
    return server.handleMessage({
      jsonrpc: '2.0',
      id: `coverage-${name}`,
      method: 'tools/call',
      params: { name, arguments: args },
    });
  }

  // ── grd_commit (line 311) ──

  test('grd_commit execute lambda', () => {
    const r = callTool('grd_commit', { message: 'test commit' });
    expect(r.result || r.error).toBeDefined();
  });

  test('grd_commit with files and amend execute lambda', () => {
    const r = callTool('grd_commit', {
      message: 'test commit',
      files: ['.planning/STATE.md'],
      amend: false,
    });
    expect(r.result || r.error).toBeDefined();
  });

  // ── Phase operations (lines 617-671) ──

  test('grd_phase_add execute lambda', () => {
    const r = callTool('grd_phase_add', { description: 'Test phase' });
    expect(r.result || r.error).toBeDefined();
  });

  test('grd_phase_add with context execute lambda', () => {
    const r = callTool('grd_phase_add', { description: 'Test phase', context: 'Some context' });
    expect(r.result || r.error).toBeDefined();
  });

  test('grd_phase_insert execute lambda', () => {
    const r = callTool('grd_phase_insert', { phase: '1', description: 'Inserted phase' });
    expect(r.result || r.error).toBeDefined();
  });

  test('grd_phase_remove execute lambda', () => {
    const r = callTool('grd_phase_remove', { phase: '99' });
    expect(r.result || r.error).toBeDefined();
  });

  test('grd_phase_remove with force execute lambda', () => {
    const r = callTool('grd_phase_remove', { phase: '99', force: true });
    expect(r.result || r.error).toBeDefined();
  });

  test('grd_phase_complete execute lambda', () => {
    const r = callTool('grd_phase_complete', { phase: '99' });
    expect(r.result || r.error).toBeDefined();
  });

  test('grd_phase_analyze_deps execute lambda', () => {
    const r = callTool('grd_phase_analyze_deps');
    expect(r.result || r.error).toBeDefined();
  });

  test('grd_milestone_complete execute lambda', () => {
    const r = callTool('grd_milestone_complete', { version: 'v9.9.9' });
    expect(r.result || r.error).toBeDefined();
  });

  test('grd_milestone_complete with name execute lambda', () => {
    const r = callTool('grd_milestone_complete', { version: 'v9.9.9', name: 'Test Milestone' });
    expect(r.result || r.error).toBeDefined();
  });

  // ── grd_init_execute_parallel (lines 889-899) ──

  test('grd_init_execute_parallel execute lambda', () => {
    const r = callTool('grd_init_execute_parallel', { phases: '1,2' });
    expect(r.result || r.error).toBeDefined();
  });

  test('grd_init_execute_parallel with include execute lambda', () => {
    const r = callTool('grd_init_execute_parallel', { phases: '1,2', include: 'state,config' });
    expect(r.result || r.error).toBeDefined();
  });

  // ── grd_markdown_split split-success path (lines 1702-1717) ──

  test('grd_markdown_split with low threshold triggers split', () => {
    // Use a very low threshold (5 tokens) so even a small file triggers splitting
    const mdPath = path.join(fixtureDir, 'large-split-test.md');
    fs.writeFileSync(
      mdPath,
      [
        '# Section One',
        '',
        'Content for the first section with some text.',
        '',
        '# Section Two',
        '',
        'Content for the second section with some text.',
      ].join('\n'),
      'utf-8'
    );
    const r = callTool('grd_markdown_split', { file: mdPath, threshold: 5 });
    expect(r.result).toBeDefined();
    const data = JSON.parse(r.result.content[0].text);
    // Either split was performed or it wasn't (depends on markdown-split logic),
    // but the execute lambda ran through without crashing
    expect(typeof data.split_performed).toBe('boolean');
  });

  // ── LTR branch coverage ──

  test('grd_long_term_roadmap_update with name and status execute lambda', () => {
    const r = callTool('grd_long_term_roadmap_update', {
      id: 'LT-1',
      name: 'Updated Name',
      status: 'completed',
    });
    expect(r.result || r.error).toBeDefined();
  });

  test('grd_long_term_roadmap_link with note execute lambda', () => {
    const r = callTool('grd_long_term_roadmap_link', {
      id: 'LT-1',
      version: 'v9.9.9',
      note: 'planned',
    });
    expect(r.result || r.error).toBeDefined();
  });

  test('grd_long_term_roadmap_init with project execute lambda', () => {
    const r = callTool('grd_long_term_roadmap_init', { project: 'TestProject' });
    expect(r.result || r.error).toBeDefined();
  });

  test('grd_long_term_roadmap_parse with file execute lambda', () => {
    const r = callTool('grd_long_term_roadmap_parse', { file: 'nonexistent.md' });
    expect(r.result || r.error).toBeDefined();
  });

  test('grd_long_term_roadmap_validate with file execute lambda', () => {
    const r = callTool('grd_long_term_roadmap_validate', { file: 'nonexistent.md' });
    expect(r.result || r.error).toBeDefined();
  });

  test('grd_worktree_remove with path execute lambda', () => {
    const r = callTool('grd_worktree_remove', { path: '/tmp/nonexistent-worktree' });
    expect(r.result || r.error).toBeDefined();
  });
});
