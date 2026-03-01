/**
 * GRD Commands -- CommonJS re-export proxy
 *
 * Canonical implementation decomposed into lib/commands/ sub-modules.
 * This proxy re-exports for runtime CJS resolution.
 */
'use strict';

module.exports = require('./commands/index.ts');
