#!/usr/bin/env node
/**
 * GRD MCP Server -- CommonJS re-export proxy
 *
 * Prefers compiled dist/ for broad Node.js compatibility (v18+).
 * Falls back to .ts source for development (requires Node.js >=23.6
 * or a TypeScript loader like tsx).
 */
'use strict';
const { existsSync } = require('fs');
const { join } = require('path');
const dist = join(__dirname, '..', 'dist', 'bin', 'grd-mcp-server.js');
if (existsSync(dist)) require(dist);
else require('./grd-mcp-server.ts');
