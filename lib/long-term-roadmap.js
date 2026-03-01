/**
 * GRD Long-Term Roadmap -- CommonJS re-export proxy
 *
 * This file exists solely for runtime compatibility: plain Node.js
 * `require('./long-term-roadmap')` resolves to .js before .ts. The canonical
 * implementation lives in long-term-roadmap.ts; this proxy re-exports it.
 *
 * Will be removed when Phase 65 establishes a runtime TS resolution
 * strategy (ts-node, dist/ build, or Node.js --experimental-strip-types).
 *
 * @see DEFER-59-01 in STATE.md
 */
'use strict';

module.exports = require('./long-term-roadmap.ts');
