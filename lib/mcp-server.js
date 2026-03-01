/**
 * GRD MCP Server -- CommonJS re-export proxy
 *
 * Canonical implementation lives in mcp-server.ts; this proxy
 * re-exports it for runtime CJS resolution.
 *
 * Will be removed when Phase 65 establishes a runtime TS resolution
 * strategy (ts-node, dist/ build, or Node.js --experimental-strip-types).
 *
 * @see DEFER-59-01 in STATE.md
 */
'use strict';

module.exports = require('./mcp-server.ts');
