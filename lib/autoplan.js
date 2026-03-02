/**
 * GRD Autoplan -- CommonJS re-export proxy
 *
 * This file exists solely for runtime compatibility: plain Node.js
 * `require('./autoplan')` resolves to .js before .ts. The canonical
 * implementation lives in autoplan.ts; this proxy re-exports it.
 *
 * @see DEFER-59-01 in STATE.md
 */
'use strict';

module.exports = require('./autoplan.ts');
