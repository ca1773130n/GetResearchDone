'use strict';
const fs = require('fs');
const path = require('path');
import type { CandidateEvent, WorkOrder } from './types';
import type { ScanReport, ValidateReport } from './intake';
import type { RunOrderDeps, RunOrderResult } from './line';
const { output, error } = require('../utils') as {
  output: (r: unknown, raw: boolean, rawVal?: unknown) => never;
  error: (m: string) => never;
};
const { factoryHome, orderDir, loadOrder, saveOrder } = require('./order') as {
  factoryHome: () => string;
  orderDir: (h: string, id: string) => string;
  loadOrder: (h: string, id: string) => WorkOrder;
  saveOrder: (h: string, id: string) => string;
};
const { scanRepo, validateDraft } = require('./intake') as {
  scanRepo: (repo: string) => ScanReport;
  validateDraft: (h: string, id: string) => ValidateReport;
};
const { runOrder, readEvents } = require('./line') as {
  runOrder: (h: string, id: string, d: RunOrderDeps) => Promise<RunOrderResult>;
  readEvents: (od: string) => { byId: Map<string, CandidateEvent>; ids: string[] };
};
const { readSpent } = require('./spawn') as { readSpent: (od: string) => number };
const { queriesUsed } = require('./gates') as { queriesUsed: (od: string) => number };
const { readHostSpawnConfig } = require('../research/cli-bench') as {
  readHostSpawnConfig: (cwd: string) => Record<string, unknown>;
};

export interface FactoryCliDeps {
  home?: string;
  scanRepo?: (repo: string) => ScanReport;
  validateDraft?: (h: string, id: string) => ValidateReport;
  saveOrder?: (h: string, id: string) => string;
  runOrder?: (h: string, id: string, d: RunOrderDeps) => Promise<RunOrderResult>;
}

function homeOf(d: FactoryCliDeps): string { return d.home || factoryHome(); }

function cmdFactoryScan(_cwd: string, repo: string, raw: boolean, d: FactoryCliDeps = {}): never {
  let r: ScanReport;
  try { r = (d.scanRepo || scanRepo)(path.resolve(repo)); } catch (e) { return error(`factory scan: ${(e as Error).message}`); }
  const text = [
    `ecosystem: ${r.ecosystem}`,
    `image: ${r.proposedImage ?? '(ask)'}  setup: ${r.proposedSetup || '(none)'}  memory: ${r.proposedMemory} of ${r.freeMemoryMb} MB free`,
    ...r.measurements.map((m) => `${m.kind}  ${m.name}  ${m.command}`),
  ].join('\n') + '\n';
  return output(r, raw, text);
}

function cmdFactoryValidate(_cwd: string, id: string, raw: boolean, d: FactoryCliDeps = {}): never {
  let r: ValidateReport;
  try { r = (d.validateDraft || validateDraft)(homeOf(d), id); } catch (e) { return error(`factory validate: ${(e as Error).message}`); }
  return output(r, raw, r.checks.map((c) => `${c.ok ? 'PASS' : 'FAIL'}  ${c.id}  ${c.detail}`).join('\n') + '\n');
}

function cmdFactorySave(_cwd: string, id: string, raw: boolean, d: FactoryCliDeps = {}): never {
  let dir: string;
  try { dir = (d.saveOrder || saveOrder)(homeOf(d), id); } catch (e) { return error(`factory save: ${(e as Error).message}`); }
  return output({ id, orderDir: dir }, raw, `saved ${id}; start it with: gd factory run ${id}\n`);
}

async function cmdFactoryRun(cwd: string, id: string, raw: boolean, d: FactoryCliDeps = {}): Promise<never> {
  let r: RunOrderResult;
  try {
    r = await (d.runOrder || runOrder)(homeOf(d), id, { hostConfig: readHostSpawnConfig(cwd) });
  } catch (e) {
    return error(`factory run: ${(e as Error).message}`);
  }
  return output(r, raw, `${r.stop}${r.prUrl ? `  ${r.prUrl}` : ''}\nreport: ${r.reportPath}\n`);
}

function list(dir: string): string[] { return fs.existsSync(dir) ? (fs.readdirSync(dir) as string[]).sort() : []; }

function cmdFactoryStatus(_cwd: string, id: string | undefined, raw: boolean, d: FactoryCliDeps = {}): never {
  const home = homeOf(d);
  if (!id) {
    const payload = { home, drafts: list(path.join(home, 'drafts')), orders: list(path.join(home, 'orders')) };
    return output(payload, raw, `home: ${home}\ndrafts: ${payload.drafts.join(', ') || '(none)'}\norders: ${payload.orders.join(', ') || '(none)'}\n`);
  }
  let o: WorkOrder;
  try { o = loadOrder(home, id); } catch (e) { return error(`factory status: ${(e as Error).message}`); }
  const od = orderDir(home, id);
  const statusFile = path.join(od, 'status.json');
  let last: { stop: string; prUrl: string | null } | null = null;
  try {
    if (fs.existsSync(statusFile)) last = JSON.parse(String(fs.readFileSync(statusFile, 'utf8'))) as { stop: string; prUrl: string | null };
  } catch (e) { return error(`factory status: cannot read ${statusFile}: ${(e as Error).message}`); }
  const { byId, ids } = readEvents(od);
  const payload = {
    id, stop: last?.stop ?? null, prUrl: last?.prUrl ?? null,
    candidates: ids.map((c) => byId.get(c)), tokens: readSpent(od), hiddenQueries: queriesUsed(od), budget: o.budget,
  };
  const text = [
    `${id}: ${payload.stop ?? 'not finished'}${payload.prUrl ? `  ${payload.prUrl}` : ''}`,
    `tokens ${payload.tokens} of ${o.budget.tokens}; candidates ${ids.length} of ${o.budget.candidates}; hidden queries ${payload.hiddenQueries} of ${o.budget.hidden_queries}`,
    ...ids.map((c) => `${c}  ${byId.get(c)?.outcome ?? 'unfinished'}`),
  ].join('\n') + '\n';
  return output(payload, raw, text);
}

module.exports = { cmdFactoryScan, cmdFactoryValidate, cmdFactorySave, cmdFactoryRun, cmdFactoryStatus };
