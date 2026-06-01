'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
import type { ExperimentPlan, ExperimentResult } from './types';
const { parseMetricsLine, classifyRunFailure, createSubprocessRunner } =
  require('./runner') as {
    parseMetricsLine: (s: string) => Record<string, number>;
    classifyRunFailure: (stderr: string, timedOut: boolean) => ExperimentResult['failureClass'];
    createSubprocessRunner: (o?: { timeoutMs?: number }) => import('./runner').Runner;
  };

// Conservative Docker reference: optional host, repo path, optional :tag, optional @sha256 digest.
// Must NOT start with '-' so it can never be parsed as a `docker run` option.
const IMAGE_RE = /^[a-z0-9]([a-z0-9._/-]*[a-z0-9])?(:[\w][\w.-]*)?(@sha256:[a-f0-9]{64})?$/i;
const MEMORY_RE = /^\d+(\.\d+)?\s*([bkmg])?$/i;

function validateImage(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (!v || v.startsWith('-')) return null;
  return IMAGE_RE.test(v) ? v : null;
}

function validateMemory(value: unknown): string {
  if (typeof value === 'string' && MEMORY_RE.test(value.trim())) return value.trim();
  return '512m';
}

function validateCpus(value: unknown): string {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? String(n) : '1';
}

module.exports = { validateImage, validateMemory, validateCpus };
