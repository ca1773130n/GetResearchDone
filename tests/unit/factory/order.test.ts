'use strict';
const fs = require('fs');
const path = require('path');
import type { WorkOrder } from '../../../lib/factory/types';
const order = require('../../../lib/factory/order') as {
  parseWorkOrder: (raw: unknown) => WorkOrder;
  factoryHome: (env?: Record<string, string | undefined>) => string;
  draftDir: (home: string, id: string) => string;
  orderDir: (home: string, id: string) => string;
  readDraft: (home: string, id: string) => WorkOrder;
  writeDraft: (home: string, o: WorkOrder) => void;
  markValidated: (home: string, id: string) => void;
  saveOrder: (home: string, id: string) => string;
  loadOrder: (home: string, id: string) => WorkOrder;
};
const { tmpDir, sampleOrder } = require('./fixtures') as {
  tmpDir: (p: string) => string;
  sampleOrder: (repo: string, over?: Partial<WorkOrder>) => WorkOrder;
};

describe('parseWorkOrder', () => {
  const good = (): Record<string, unknown> => JSON.parse(JSON.stringify(sampleOrder('/abs/repo')));

  it('accepts a complete order and keeps every field', () => {
    expect(order.parseWorkOrder(good())).toEqual(sampleOrder('/abs/repo'));
  });

  it('defaults dev_eval.files to an empty list', () => {
    const raw = good();
    delete (raw.dev_eval as Record<string, unknown>).files;
    expect(order.parseWorkOrder(raw).dev_eval.files).toEqual([]);
  });

  const cases: Array<[string, (r: Record<string, unknown>) => void, RegExp]> = [
    ['an empty object', (r) => { Object.keys(r).forEach((k) => delete r[k]); }, /version must be 1/],
    ['a bad id', (r) => { r.id = 'Search P95'; }, /id "Search P95"/],
    ['a relative repo', (r) => { r.repo = 'repo'; }, /absolute path/],
    ['an unknown comparator', (r) => { (r.contract as Record<string, unknown>).comparator = '=>'; }, /comparator must be one of/],
    ['a scoring script outside hidden/', (r) => { (r.hidden_eval as Record<string, unknown>).score = 'eval.sh'; }, /inside hidden\//],
    ['a scoring script escaping with ..', (r) => { (r.hidden_eval as Record<string, unknown>).score = 'hidden/../x.sh'; }, /no empty or ".." segment/],
    // The path is interpolated into the shell command a container runs.
    ['a scoring script holding a shell metacharacter', (r) => { (r.hidden_eval as Record<string, unknown>).score = 'hidden/e;rm -rf /.sh'; }, /letters, digits, dot, dash/],
    ['a scoring script holding a substitution', (r) => { (r.hidden_eval as Record<string, unknown>).score = 'hidden/$(id).sh'; }, /letters, digits, dot, dash/],
    ['inputs naming the whole vault', (r) => { (r.hidden_eval as Record<string, unknown>).inputs = 'hidden/'; }, /no empty or ".." segment/],
    ['a scoring script inside the disclosed inputs', (r) => { (r.hidden_eval as Record<string, unknown>).inputs = 'hidden/data'; (r.hidden_eval as Record<string, unknown>).score = 'hidden/data/score.sh'; }, /must not sit inside/],
    ['an output path escaping the repo', (r) => { (r.hidden_eval as Record<string, unknown>).output = '../out.json'; }, /relative path with no/],
    ['a legacy single-script holdout', (r) => { (r.hidden_eval as Record<string, unknown>).script = 'hidden/eval.sh'; }, /no longer accepted/],
    ['a bad memory size', (r) => { (r.sandbox as Record<string, unknown>).memory = 'lots'; }, /512m or 2g/],
    ['an invalid image', (r) => { (r.sandbox as Record<string, unknown>).image = '-evil'; }, /not a valid image/],
    ['zero repeats', (r) => { (r.dev_eval as Record<string, unknown>).repeats = 0; }, /positive integer/],
    ['an empty allowlist', (r) => { r.editable = []; }, /non-empty list/],
  ];
  it.each(cases)('rejects %s', (_name, mutate, msg) => {
    const raw = good();
    mutate(raw);
    expect(() => order.parseWorkOrder(raw)).toThrow(msg);
  });
});

describe('factory home, drafts and saved orders', () => {
  it('honors GRD_FACTORY_HOME and defaults under the home directory', () => {
    expect(order.factoryHome({ GRD_FACTORY_HOME: '/x/y' })).toBe('/x/y');
    expect(order.factoryHome({})).toMatch(/[/\\]\.grd[/\\]factory$/);
  });

  function draft(home: string): WorkOrder {
    const o = sampleOrder('/abs/repo');
    order.writeDraft(home, o);
    fs.mkdirSync(path.join(order.draftDir(home, o.id), 'hidden'), { recursive: true });
    fs.writeFileSync(path.join(order.draftDir(home, o.id), 'hidden', 'eval.sh'), 'echo hi\n');
    return o;
  }

  it('refuses to save a draft that never passed validate', () => {
    const home = tmpDir('grd-factory-home-');
    const o = draft(home);
    expect(() => order.saveOrder(home, o.id)).toThrow(/has not passed validate/);
  });

  it('refuses to save a draft edited after validate', () => {
    const home = tmpDir('grd-factory-home-');
    const o = draft(home);
    order.markValidated(home, o.id);
    fs.writeFileSync(path.join(order.draftDir(home, o.id), 'hidden', 'eval.sh'), 'echo changed\n');
    expect(() => order.saveOrder(home, o.id)).toThrow(/changed after validate/);
  });

  it('refuses to save a draft edited in draft.json after validate', () => {
    const home = tmpDir('grd-factory-home-');
    const o = draft(home);
    order.markValidated(home, o.id);
    order.writeDraft(home, { ...o, objective: 'A different objective.' });
    expect(() => order.saveOrder(home, o.id)).toThrow(/changed after validate/);
  });

  it('refuses to save a validated draft that has no baseline', () => {
    const home = tmpDir('grd-factory-home-');
    const o = sampleOrder('/abs/repo');
    delete o.baseline;
    order.writeDraft(home, o);
    order.markValidated(home, o.id);
    expect(() => order.saveOrder(home, o.id)).toThrow(/no baseline/);
  });

  it('rejects a symlink in the draft, since its target could change unnoticed', () => {
    const home = tmpDir('grd-factory-home-');
    const o = draft(home);
    const outside = path.join(tmpDir('grd-factory-outside-'), 'real.sh');
    fs.writeFileSync(outside, 'echo outside\n');
    const link = path.join(order.draftDir(home, o.id), 'hidden', 'link.sh');
    fs.symlinkSync(outside, link);
    expect(() => order.markValidated(home, o.id)).toThrow(/symlink at .*link\.sh/);
  });

  it('moves a validated draft into the vault and loads it back', () => {
    const home = tmpDir('grd-factory-home-');
    const o = draft(home);
    order.markValidated(home, o.id);
    const od = order.saveOrder(home, o.id);
    expect(od).toBe(order.orderDir(home, o.id));
    expect(fs.existsSync(order.draftDir(home, o.id))).toBe(false);
    expect(fs.existsSync(path.join(od, 'vault', 'hidden', 'eval.sh'))).toBe(true);
    expect(fs.existsSync(path.join(od, 'vault', 'validated.json'))).toBe(false);
    expect(order.loadOrder(home, o.id)).toEqual(o);
  });
});
