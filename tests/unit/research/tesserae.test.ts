'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createFakeTesseraeClient, createCliTesseraeClient } = require('../../../lib/research/tesserae');

describe('TesseraeClient (fake)', () => {
  it('fake client reports configured availability + compile/smoke results', async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-tess-'));
    const fake = createFakeTesseraeClient({
      available: true,
      compileStatus: 'compiled',
      smoke: { found: true, nodeIds: ['n1'], detail: 'ok' },
    });
    expect(fake.isAvailable()).toBe(true);
    const compiled = await fake.compile(cwd, ['corpus']);
    expect(compiled.status).toBe('compiled');
    expect(fs.existsSync(path.join(cwd, '.tesserae/graph.json'))).toBe(true); // fake now writes the KG artifact
    const s = await fake.querySmokeCheck(cwd, 'topic');
    expect(s.found).toBe(true);
    expect(s.nodeIds).toEqual(['n1']);
  });

  it('fake client defaults to unavailable / skipped', async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-tess-'));
    const fake = createFakeTesseraeClient({});
    expect(fake.isAvailable()).toBe(false);
    expect((await fake.compile(cwd, [])).status).toBe('skipped_no_tesserae');
  });
});

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
    // tesserae 0.11.0: bare extraction moved to the `extract` subcommand.
    expect(call[1]).toBe('extract');
    expect(call).toContain('--sqlite-output');
    expect(call).toContain('--changed-only');
    expect(call).toContain('--canonicalize');
    // --distill is a compile-only flag in 0.11.0; `extract` rejects it.
    expect(call).not.toContain('--distill');
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

describe('querySmokeCheck', () => {
  function withGraph(nodes: object[]) {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-tess-'));
    fs.mkdirSync(path.join(cwd, '.tesserae'), { recursive: true });
    fs.writeFileSync(path.join(cwd, '.tesserae/graph.json'), JSON.stringify({ nodes }));
    return cwd;
  }
  it('finds nodes whose name matches the topic (case-insensitive)', async () => {
    const cwd = withGraph([{ id: 'n1', name: 'Retrieval Augmented Generation' }, { id: 'n2', name: 'Other' }]);
    const r = await createCliTesseraeClient({ whichOk: true }).querySmokeCheck(cwd, 'retrieval augmented');
    expect(r.found).toBe(true);
    expect(r.nodeIds).toContain('n1');
  });
  it('returns found:false when no node matches or no graph', async () => {
    const cwd = withGraph([{ id: 'n1', name: 'Other' }]);
    expect((await createCliTesseraeClient({ whichOk: true }).querySmokeCheck(cwd, 'nope')).found).toBe(false);
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-tess-'));
    expect((await createCliTesseraeClient({ whichOk: true }).querySmokeCheck(empty, 'x')).found).toBe(false);
  });
  it('returns found:false on unreadable graph.json', async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-tess-'));
    fs.mkdirSync(path.join(cwd, '.tesserae'), { recursive: true });
    fs.writeFileSync(path.join(cwd, '.tesserae/graph.json'), '{not json');
    expect((await createCliTesseraeClient({ whichOk: true }).querySmokeCheck(cwd, 'x')).found).toBe(false);
  });
});
