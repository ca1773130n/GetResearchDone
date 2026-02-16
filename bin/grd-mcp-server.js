#!/usr/bin/env node
/**
 * GRD MCP Server — Entry point wiring lib/mcp-server.js to stdin/stdout as MCP stdio transport.
 *
 * Reads JSON-RPC 2.0 messages from stdin (newline-delimited JSON), dispatches to McpServer,
 * writes responses to stdout. Runs until stdin closes (EOF).
 *
 * Usage: node bin/grd-mcp-server.js
 *
 * Created in Phase 16 Plan 01 (MCP Server).
 */

const { McpServer } = require('../lib/mcp-server');

const server = new McpServer({ cwd: process.cwd() });

let buffer = '';

process.stdin.setEncoding('utf-8');

process.stdin.on('data', (chunk) => {
  buffer += chunk;

  // Process complete lines
  let newlineIdx;
  while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, newlineIdx).trim();
    buffer = buffer.slice(newlineIdx + 1);

    // Skip empty lines
    if (!line) continue;

    let message;
    try {
      message = JSON.parse(line);
    } catch {
      // Malformed JSON — write parse error response
      const errorResponse = {
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: 'Parse error' },
      };
      process.stdout.write(JSON.stringify(errorResponse) + '\n');
      continue;
    }

    const response = server.handleMessage(message);

    // Notifications return null — no response needed
    if (response !== null && response !== undefined) {
      process.stdout.write(JSON.stringify(response) + '\n');
    }
  }
});

process.stdin.on('end', () => {
  // Handle any remaining data in buffer
  const remaining = buffer.trim();
  if (remaining) {
    try {
      const message = JSON.parse(remaining);
      const response = server.handleMessage(message);
      if (response !== null && response !== undefined) {
        process.stdout.write(JSON.stringify(response) + '\n');
      }
    } catch {
      const errorResponse = {
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: 'Parse error' },
      };
      process.stdout.write(JSON.stringify(errorResponse) + '\n');
    }
  }

  process.exit(0);
});

process.stdin.on('error', () => {
  process.exit(0);
});
