'use strict';
const { existsSync } = require('fs');
const { join } = require('path');
const dist = join(__dirname, '..', '..', 'dist', 'lib', 'cli', 'adapters.js');
if (existsSync(dist)) module.exports = require(dist);
else module.exports = require('./adapters.ts');
