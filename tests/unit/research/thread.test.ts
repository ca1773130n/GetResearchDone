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

  it('re-running the same question creates a fresh isolated thread (no clobber)', () => {
    const cwd = tmp();
    const t1 = createThread(cwd, 'Same question', {});
    saveThread(cwd, { ...t1, iteration: 3, status: 'supported' }); // simulate a finished run
    const t2 = createThread(cwd, 'Same question', {});
    expect(t2.id).not.toBe(t1.id);
    expect(t2.status).toBe('active');
    expect(t2.iteration).toBe(1);
    expect(loadThread(cwd, t1.id).status).toBe('supported'); // prior run preserved, not clobbered
  });

  it('round-trips resurveyCount / pendingPivot / baseMaxIterations and shows re-surveys in THREAD.md', () => {
    const cwd = tmp();
    const t = createThread(cwd, 'Q', { maxIterations: 5 });
    expect(t.baseMaxIterations).toBe(5);
    t.resurveyCount = 2; t.pendingPivot = true;
    saveThread(cwd, t);
    const r = loadThread(cwd, t.id);
    expect(r.resurveyCount).toBe(2);
    expect(r.pendingPivot).toBe(true);
    const md = fs.readFileSync(path.join(cwd, '.planning/research/threads', t.id, 'THREAD.md'), 'utf8');
    expect(md).toMatch(/re-surveys:\*\*\s*2/);
  });
});
