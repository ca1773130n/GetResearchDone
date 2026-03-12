/**
 * GRD Overstory Adapter -- CommonJS re-export proxy
 *
 * This file exists solely for runtime compatibility: plain Node.js
 * `require('./overstory')` resolves to .js before .ts. The canonical
 * implementation lives in overstory.ts; this proxy re-exports it.
 */
'use strict';

module.exports = require('./overstory.ts');
