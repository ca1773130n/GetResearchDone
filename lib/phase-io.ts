'use strict';

/**
 * GRD Phase/IO -- Shared file I/O helpers for ROADMAP.md and STATE.md.
 *
 * Extracted from lib/phase.ts and lib/phase-complete.ts as a post-Spec-3
 * cleanup. Both modules now import from here instead of duplicating the
 * implementation. A single shared write-through cache lives in this
 * module so reads and writes are consistent across both callers.
 */

import * as fs from 'fs';

// ─── File Caches ──────────────────────────────────────────────────────────────

// Module-level cache with write-through for roadmap file reads.
// Prevents redundant disk reads across phase operations; writes update the cache.
const _roadmapFileCache = new Map<string, string>();

/**
 * Read ROADMAP.md from disk (or from write-through cache on repeated reads).
 * @param roadmapPath - Absolute path to the ROADMAP.md file
 * @returns File contents as a UTF-8 string
 */
function readRoadmapFile(roadmapPath: string): string {
  if (!_roadmapFileCache.has(roadmapPath)) {
    _roadmapFileCache.set(roadmapPath, fs.readFileSync(roadmapPath, 'utf-8') as string);
  }
  return _roadmapFileCache.get(roadmapPath) as string;
}

/**
 * Write ROADMAP.md to disk and update the write-through cache.
 * @param roadmapPath - Absolute path to the ROADMAP.md file
 * @param content - New file contents to write
 */
function writeRoadmapFile(roadmapPath: string, content: string): void {
  fs.writeFileSync(roadmapPath, content, 'utf-8');
  _roadmapFileCache.set(roadmapPath, content);
}

// Module-level cache with write-through for state file reads.
// Prevents redundant disk reads across phase operations; writes update the cache.
const _stateFileCache = new Map<string, string>();

/**
 * Read STATE.md from disk (or from write-through cache on repeated reads).
 * @param statePath - Absolute path to the STATE.md file
 * @returns File contents as a UTF-8 string
 */
function readStateFile(statePath: string): string {
  if (!_stateFileCache.has(statePath)) {
    _stateFileCache.set(statePath, fs.readFileSync(statePath, 'utf-8') as string);
  }
  return _stateFileCache.get(statePath) as string;
}

/**
 * Write STATE.md to disk and update the write-through cache.
 * @param statePath - Absolute path to the STATE.md file
 * @param content - New file contents to write
 */
function writeStateFile(statePath: string, content: string): void {
  fs.writeFileSync(statePath, content, 'utf-8');
  _stateFileCache.set(statePath, content);
}

/**
 * Invalidates the cached content for a specific ROADMAP.md path, or
 * the entire cache if no path is given. Used by phase-complete-llm
 * after LLM fallback writes, and by _phaseCompleteCore at the start
 * of a run to guarantee a fresh read.
 */
function clearRoadmapCache(filePath?: string): void {
  if (filePath === undefined) {
    _roadmapFileCache.clear();
  } else {
    _roadmapFileCache.delete(filePath);
  }
}

/**
 * Invalidates the cached content for a specific STATE.md path, or
 * the entire cache if no path is given.
 */
function clearStateCache(filePath?: string): void {
  if (filePath === undefined) {
    _stateFileCache.clear();
  } else {
    _stateFileCache.delete(filePath);
  }
}

module.exports = {
  readRoadmapFile,
  writeRoadmapFile,
  readStateFile,
  writeStateFile,
  clearRoadmapCache,
  clearStateCache,
};
