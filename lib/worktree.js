/**
 * GRD Worktree -- CommonJS re-export proxy
 *
 * This file exists solely for runtime compatibility: plain Node.js
 * `require('./worktree')` resolves to .js before .ts. The canonical
 * implementation lives in worktree.ts; this proxy re-exports it.
 *
 * Will be removed when Phase 65 establishes a runtime TS resolution
 * strategy (ts-node, dist/ build, or Node.js --experimental-strip-types).
 *
 * @see DEFER-59-01 in STATE.md
 */
'use strict';

// Node 24+ supports require('.ts') with --experimental-strip-types,
// but without that flag we need this proxy for extensionless require().
module.exports = require('./worktree.ts');
