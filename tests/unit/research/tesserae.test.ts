'use strict';
const { createFakeTesseraeClient } = require('../../../lib/research/tesserae');

describe('TesseraeClient (fake)', () => {
  it('fake client reports configured availability + compile/smoke results', async () => {
    const fake = createFakeTesseraeClient({
      available: true,
      compileStatus: 'compiled',
      smoke: { found: true, nodeIds: ['n1'], detail: 'ok' },
    });
    expect(fake.isAvailable()).toBe(true);
    expect((await fake.compile('/cwd', ['corpus'])).status).toBe('compiled');
    const s = await fake.querySmokeCheck('/cwd', 'topic');
    expect(s.found).toBe(true);
    expect(s.nodeIds).toEqual(['n1']);
  });

  it('fake client defaults to unavailable / skipped', async () => {
    const fake = createFakeTesseraeClient({});
    expect(fake.isAvailable()).toBe(false);
    expect((await fake.compile('/cwd', [])).status).toBe('skipped_no_tesserae');
  });
});

const fs = require('fs');
const os = require('os');
const path = require('path');
const { createCliTesseraeClient } = require('../../../lib/research/tesserae');

describe('TesseraeClient (CLI backend)', () => {
  it('compile invokes the real tesserae extractor with the right args', async () => {
    const calls: string[][] = [];
    const run = (bin: string, args: string[]) => { calls.push([bin, ...args]); return ''; };
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-tess-'));
    const client = createCliTesseraeClient({ run, whichOk: true });
    const res = await client.compile(cwd, [path.join(cwd, 'corpus')]);
    expect(res.status).toBe('compiled');
    const call = calls[0];
    expect(call[0]).toBe('tesserae');
    expect(call).toContain('--sqlite-output');
    expect(call).toContain('--changed-only');
    expect(call).toContain('--canonicalize');
    expect(call.join(' ')).toContain('.tesserae/graph.json');
  });

  it('compile returns compile_failed when the runner throws', async () => {
    const run = () => { throw Object.assign(new Error('boom'), { stderr: 'extract error' }); };
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-tess-'));
    const res = await createCliTesseraeClient({ run, whichOk: true }).compile(cwd, ['corpus']);
    expect(res.status).toBe('compile_failed');
    expect(res.detail).toContain('extract error');
  });

  it('compile returns skipped_no_tesserae when binary absent', async () => {
    const res = await createCliTesseraeClient({ whichOk: false }).compile('/cwd', ['corpus']);
    expect(res.status).toBe('skipped_no_tesserae');
  });
});
