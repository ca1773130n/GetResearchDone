#!/usr/bin/env node
/**
 * GRD Tools -- CommonJS re-export proxy
 *
 * Canonical implementation lives in grd-tools.ts; this proxy
 * re-exports it for runtime CJS resolution.
 */
'use strict';
require('./grd-tools.ts');
