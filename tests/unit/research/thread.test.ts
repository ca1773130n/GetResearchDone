'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { threadId, createThread, loadThread, saveThread, listThreads } =
  require('../../../lib/research/thread');

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'grd-research-')); }

describe('research thread', () => {
  it('threadId is a slug + short hash, stable per question', () => {
    const id = threadId('Does X improve Y?');
    expect(id).toMatch(/^does-x-improve-y-[0-9a-f]{6}$/);
    expect(threadId('Does X improve Y?')).toBe(id);
  });

  it('createThread writes thread.json + THREAD.md and is loadable', () => {
    const cwd = tmp();
    const t = createThread(cwd, 'Test question', { maxIterations: 3 });
    expect(t.status).toBe('active');
    expect(t.maxIterations).toBe(3);
    expect(t.gates).toEqual({ execute: true, kg_write: true });
    const dir = path.join(cwd, '.planning/research/threads', t.id);
    expect(fs.existsSync(path.join(dir, 'thread.json'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'THREAD.md'))).toBe(true);
    expect(loadThread(cwd, t.id).question).toBe('Test question');
  });

  it('saveThread round-trips mutated state', () => {
    const cwd = tmp();
    const t = createThread(cwd, 'Q2', {});
    t.iteration = 2; t.status = 'paused'; t.pendingGate = 'execute';
    saveThread(cwd, t);
    const loaded = loadThread(cwd, t.id);
    expect(loaded.iteration).toBe(2);
    expect(loaded.pendingGate).toBe('execute');
  });

  it('listThreads returns all created threads', () => {
    const cwd = tmp();
    createThread(cwd, 'A', {});
    createThread(cwd, 'B', {});
    expect(listThreads(cwd).length).toBe(2);
  });
});
