/**
 * GRD Context -- CommonJS re-export proxy
 *
 * Canonical implementation decomposed into lib/context/ sub-modules.
 * This proxy re-exports for runtime CJS resolution.
 *
 * Will be removed when Phase 65 establishes a runtime TS resolution
 * strategy (ts-node, dist/ build, or Node.js --experimental-strip-types).
 *
 * @see DEFER-62-01 in STATE.md
 */
'use strict';

// Node 24+ supports require('.ts') with --experimental-strip-types,
// but without that flag we need this proxy for extensionless require().
module.exports = require('./context/index.ts');
