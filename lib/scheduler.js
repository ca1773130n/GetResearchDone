/**
 * Scheduler -- CommonJS re-export proxy
 */
'use strict';
const { existsSync } = require('fs');
const { join } = require('path');
const dist = join(__dirname, '..', 'dist', 'lib', 'scheduler.js');
if (existsSync(dist)) module.exports = require(dist);
else module.exports = require('./scheduler.ts');
