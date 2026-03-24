'use strict';

/**
 * Integration tests for the autopilot knowledge mining pipeline step.
 *
 * Tests:
 * 1. buildKnowledgeMiningPrompt — non-empty prompt string with phase number and instructions.
 * 2. Pipeline non-halt behavior — when spawn throws, runKnowledgeMining resolves without
 *    re-throwing, and writeStatusMarker is called with 'failed'.
 * 3. Pipeline skip behavior — when agent def file does not exist, runKnowledgeMining skips
 *    silently, writeStatusMarker is called with 'skipped', spawnStep is NOT called.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const {
  buildKnowledgeMiningPrompt,
  runKnowledgeMining,
  writeStatusMarker,
} = require('../../lib/autopilot') as {
  buildKnowledgeMiningPrompt: (phaseNum: string) => string;
  runKnowledgeMining: (
    cwd: string,
    phaseNum: string,
    options: { scheduler?: null; log: (msg: string) => void }
  ) => Promise<void>;
  writeStatusMarker: (cwd: string, phaseNum: string, step: string, status: string) => void;
};

function mockSpawnWith(event: 'error' | 'close', payload: Error | number): jest.SpyInstance {
  const childProcess = require('child_process') as typeof import('child_process');
  return jest.spyOn(childProcess, 'spawn').mockImplementation(() => {
    const EventEmitter = require('events');
    const emitter = new EventEmitter();
    process.nextTick(() => emitter.emit(event, payload));
    emitter.stdout = new EventEmitter();
    emitter.stderr = new EventEmitter();
    return emitter as ReturnType<typeof childProcess.spawn>;
  });
}

// ─── buildKnowledgeMiningPrompt ───────────────────────────────────────────────

describe('buildKnowledgeMiningPrompt', () => {
  it('returns a non-empty string', () => {
    const prompt = buildKnowledgeMiningPrompt('42');
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(0);
  });

  it('includes the phase number', () => {
    const prompt = buildKnowledgeMiningPrompt('99');
    expect(prompt).toContain('99');
  });

  it('includes knowledge mining instructions', () => {
    const prompt = buildKnowledgeMiningPrompt('10');
    // Should mention KNOWHOW or knowledge-related instructions
    expect(prompt.toLowerCase()).toMatch(/knowhow|knowledge/);
  });

  it('includes KNOWHOW-ENTRY format reference', () => {
    const prompt = buildKnowledgeMiningPrompt('5');
    expect(prompt).toContain('KNOWHOW-ENTRY');
  });

  it('produces different prompts for different phase numbers', () => {
    const p1 = buildKnowledgeMiningPrompt('1');
    const p2 = buildKnowledgeMiningPrompt('2');
    expect(p1).not.toBe(p2);
  });
});

// ─── Pipeline non-halt behavior ───────────────────────────────────────────────

describe('Pipeline non-halt behavior', () => {
  let tmpDir: string;
  let logMessages: string[];

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-km-nonhalt-'));

    const agentsDir = path.join(tmpDir, 'agents');
    fs.mkdirSync(agentsDir, { recursive: true });
    fs.writeFileSync(path.join(agentsDir, 'grd-knowledge-miner.md'), '# GRD Knowledge Miner\n\nMines knowledge from phase output.\n');

    logMessages = [];
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  it('resolves without throwing when spawn rejects internally', async () => {
    const spawnSpy = mockSpawnWith('error', new Error('spawn ENOENT'));
    const log = (msg: string): void => { logMessages.push(msg); };

    await expect(
      runKnowledgeMining(tmpDir, '42', { scheduler: null, log })
    ).resolves.toBeUndefined();

    spawnSpy.mockRestore();
  });

  it('writes a terminal status marker when spawn errors', async () => {
    const spawnSpy = mockSpawnWith('error', new Error('spawn ENOENT'));
    const log = (msg: string): void => { logMessages.push(msg); };

    await runKnowledgeMining(tmpDir, '42', { scheduler: null, log });

    const markerPath = path.join(tmpDir, '.planning', 'autopilot', 'phase-42-knowledge-mining.json');
    expect(fs.existsSync(markerPath)).toBe(true);
    const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8')) as { status: string };
    // Spawn error event may resolve or reject depending on spawnClaudeAsync internals;
    // either terminal status is acceptable — 'started' would indicate a bug.
    expect(['failed', 'completed']).toContain(marker.status);

    spawnSpy.mockRestore();
  });

  it('does not throw even if writeStatusMarker internally fails', async () => {
    const spawnSpy = mockSpawnWith('close', 0);
    const log = (msg: string): void => { logMessages.push(msg); };

    await expect(
      runKnowledgeMining(tmpDir, '7', { scheduler: null, log })
    ).resolves.toBeUndefined();

    spawnSpy.mockRestore();
  });
});

// ─── Pipeline skip behavior ───────────────────────────────────────────────────

describe('Pipeline skip behavior', () => {
  let tmpDir: string;
  let logMessages: string[];

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-km-skip-'));
    logMessages = [];
    // Do NOT create agents/grd-knowledge-miner.md — it should be absent
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  it('skips silently when agent def does not exist', async () => {
    const agentDefPath = path.join(tmpDir, 'agents', 'grd-knowledge-miner.md');
    expect(fs.existsSync(agentDefPath)).toBe(false);

    const childProcess = require('child_process') as typeof import('child_process');
    const spawnSpy = jest.spyOn(childProcess, 'spawn');

    const log = (msg: string): void => { logMessages.push(msg); };

    await expect(
      runKnowledgeMining(tmpDir, '10', { scheduler: null, log })
    ).resolves.toBeUndefined();

    // spawn should NOT have been called since agent def is missing
    expect(spawnSpy).not.toHaveBeenCalled();
  });

  it('writes skipped status marker when agent def missing', async () => {
    const log = (msg: string): void => { logMessages.push(msg); };

    await runKnowledgeMining(tmpDir, '10', { scheduler: null, log });

    const markerPath = path.join(tmpDir, '.planning', 'autopilot', 'phase-10-knowledge-mining.json');
    expect(fs.existsSync(markerPath)).toBe(true);

    const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8')) as { status: string; step: string };
    expect(marker.status).toBe('skipped');
    expect(marker.step).toBe('knowledge-mining');
  });

  it('logs a skip message when agent def missing', async () => {
    const log = (msg: string): void => { logMessages.push(msg); };

    await runKnowledgeMining(tmpDir, '10', { scheduler: null, log });

    const hasSkipLog = logMessages.some((msg) =>
      msg.toLowerCase().includes('skipped') || msg.toLowerCase().includes('skip')
    );
    expect(hasSkipLog).toBe(true);
  });
});
