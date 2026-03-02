#!/usr/bin/env node
/**
 * GRD MCP Server -- CommonJS re-export proxy
 *
 * Canonical implementation lives in grd-mcp-server.ts; this proxy
 * re-exports it for runtime CJS resolution.
 */
'use strict';
require('./grd-mcp-server.ts');
