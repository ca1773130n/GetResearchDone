#!/usr/bin/env node
/**
 * GRD MCP Server -- Entry point wiring lib/mcp-server.ts to stdin/stdout as MCP stdio transport.
 *
 * Reads JSON-RPC 2.0 messages from stdin (newline-delimited JSON), dispatches to McpServer,
 * writes responses to stdout. Runs until stdin closes (EOF).
 *
 * Usage: node bin/grd-mcp-server.js
 *
 * Created in Phase 16 Plan 01 (MCP Server).
 * Migrated to TypeScript in Phase 63 Plan 04.
 */

'use strict';

/** JSON-RPC 2.0 message received on stdin */
interface JsonRpcMessage {
  jsonrpc?: string;
  method?: string;
  id?: number | string | null;
  params?: Record<string, unknown>;
}

/** JSON-RPC 2.0 response written to stdout */
interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number | string | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

/** McpServer class shape for typed instantiation */
interface McpServerInstance {
  handleMessage(
    message: JsonRpcMessage
  ): JsonRpcResponse | Promise<JsonRpcResponse> | null;
}

interface McpServerConstructor {
  new (options?: { cwd?: string }): McpServerInstance;
}

const { McpServer } = require('../lib/mcp-server') as {
  McpServer: McpServerConstructor;
};

const server: McpServerInstance = new McpServer({ cwd: process.cwd() });

let buffer: string = '';

process.stdin.setEncoding('utf-8');

process.stdin.on('data', (chunk: string) => {
  buffer += chunk;

  // Process complete lines
  let newlineIdx: number;
  while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
    const line: string = buffer.slice(0, newlineIdx).trim();
    buffer = buffer.slice(newlineIdx + 1);

    // Skip empty lines
    if (!line) continue;

    let message: JsonRpcMessage;
    try {
      message = JSON.parse(line) as JsonRpcMessage;
    } catch (_e: unknown) {
      // Malformed JSON -- write parse error response
      const errorResponse: JsonRpcResponse = {
        jsonrpc: '2.0' as const,
        id: null,
        error: { code: -32700, message: 'Parse error' },
      };
      process.stdout.write(JSON.stringify(errorResponse) + '\n');
      continue;
    }

    const response: JsonRpcResponse | Promise<JsonRpcResponse> | null =
      server.handleMessage(message);

    // Notifications return null -- no response needed
    if (response !== null && response !== undefined) {
      // Handle both sync responses and async (Promise) responses
      Promise.resolve(response).then((r: JsonRpcResponse | null) => {
        if (r !== null && r !== undefined) {
          process.stdout.write(JSON.stringify(r) + '\n');
        }
      });
    }
  }
});

process.stdin.on('end', () => {
  // Handle any remaining data in buffer
  const remaining: string = buffer.trim();
  if (remaining) {
    try {
      const message: JsonRpcMessage = JSON.parse(remaining) as JsonRpcMessage;
      const response: JsonRpcResponse | Promise<JsonRpcResponse> | null =
        server.handleMessage(message);

      Promise.resolve(response).then((r: JsonRpcResponse | null) => {
        if (r !== null && r !== undefined) {
          process.stdout.write(JSON.stringify(r) + '\n');
        }
      });
    } catch (_e: unknown) {
      const errorResponse: JsonRpcResponse = {
        jsonrpc: '2.0' as const,
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
