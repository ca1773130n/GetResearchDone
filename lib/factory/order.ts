'use strict';
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
import type { Comparator } from '../research/types';
import type { WorkOrder } from './types';
const { validateImage, MEMORY_RE } = require('../research/docker-runner') as {
  validateImage: (v: unknown) => string | null;
  MEMORY_RE: RegExp;
};

const ID_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;
/**
 * The hidden script's path is interpolated into the shell command a container runs, so it may
 * hold only characters no shell treats specially. Interview-authored and container-confined, so
 * this is belt-and-braces next to the `hidden/` prefix and `..` checks below.
 */
const SCRIPT_RE = /^[A-Za-z0-9._/-]+$/;
const COMPARATORS: ReadonlySet<string> = new Set(['>=', '<=', '>', '<', '==']);

function fail(msg: string): never { throw new Error(`work order: ${msg}`); }
function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function obj(o: Record<string, unknown>, k: string, where: string): Record<string, unknown> {
  const v = o[k];
  return isObj(v) ? v : fail(`${where}.${k} must be an object`);
}
function str(o: Record<string, unknown>, k: string, where: string): string {
  const v = o[k];
  return typeof v === 'string' && v.trim() !== '' ? v : fail(`${where}.${k} must be a non-empty string`);
}
function posInt(o: Record<string, unknown>, k: string, where: string): number {
  const v = o[k];
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 ? v : fail(`${where}.${k} must be a positive integer`);
}
function finite(o: Record<string, unknown>, k: string, where: string): number {
  const v = o[k];
  return typeof v === 'number' && Number.isFinite(v) ? v : fail(`${where}.${k} must be a finite number`);
}
function strList(v: unknown, where: string, allowEmpty: boolean): string[] {
  const ok = Array.isArray(v) && (allowEmpty || v.length > 0)
    && v.every((s) => typeof s === 'string' && s.trim() !== '');
  return ok ? (v as string[]) : fail(`${where} must be a ${allowEmpty ? '' : 'non-empty '}list of strings`);
}
function assertId(id: string): string {
  return ID_RE.test(id) ? id : fail(`id "${id}" must be lowercase letters, digits and dashes, at most 63 characters`);
}

/** Structural check of a work order. Throws with the offending field named. */
function parseWorkOrder(raw: unknown): WorkOrder {
  if (!isObj(raw)) return fail('must be a JSON object');
  if (raw.version !== 1) fail('version must be 1');
  const repo = str(raw, 'repo', 'order');
  if (!path.isAbsolute(repo)) fail('order.repo must be an absolute path');
  const contract = obj(raw, 'contract', 'order');
  const comparator = str(contract, 'comparator', 'contract');
  if (!COMPARATORS.has(comparator)) fail(`contract.comparator must be one of ${[...COMPARATORS].join(' ')}`);
  const sandbox = obj(raw, 'sandbox', 'order');
  const image = str(sandbox, 'image', 'sandbox');
  if (validateImage(image) === null) fail(`sandbox.image "${image}" is not a valid image reference`);
  const memory = str(sandbox, 'memory', 'sandbox');
  if (!MEMORY_RE.test(memory)) fail('sandbox.memory must look like 512m or 2g');
  if (typeof sandbox.setup !== 'string') fail('sandbox.setup must be a string, empty for no setup');
  if (typeof sandbox.cpus !== 'number' || !(sandbox.cpus > 0)) fail('sandbox.cpus must be a positive number');
  const dev = obj(raw, 'dev_eval', 'order');
  const hidden = obj(raw, 'hidden_eval', 'order');
  const script = str(hidden, 'script', 'hidden_eval');
  if (!script.startsWith('hidden/') || script.split('/').includes('..') || !SCRIPT_RE.test(script)) {
    fail('hidden_eval.script must be a path under hidden/ with no ".." segment, '
      + 'made only of letters, digits, dot, dash, underscore and slash');
  }
  const budget = obj(raw, 'budget', 'order');
  const parsed: WorkOrder = {
    version: 1,
    id: assertId(str(raw, 'id', 'order')),
    repo,
    base: str(raw, 'base', 'order'),
    remote: str(raw, 'remote', 'order'),
    objective: str(raw, 'objective', 'order'),
    contract: {
      metric: str(contract, 'metric', 'contract'),
      comparator: comparator as Comparator,
      target: finite(contract, 'target', 'contract'),
    },
    editable: strList(raw.editable, 'order.editable', false),
    sandbox: { image, setup: sandbox.setup as string, memory, cpus: sandbox.cpus as number },
    dev_eval: {
      command: str(dev, 'command', 'dev_eval'),
      repeats: posInt(dev, 'repeats', 'dev_eval'),
      files: dev.files === undefined ? [] : strList(dev.files, 'dev_eval.files', true),
    },
    hidden_eval: { script, repeats: posInt(hidden, 'repeats', 'hidden_eval') },
    budget: {
      tokens: posInt(budget, 'tokens', 'budget'),
      candidates: posInt(budget, 'candidates', 'budget'),
      hidden_queries: posInt(budget, 'hidden_queries', 'budget'),
      wall_minutes: posInt(budget, 'wall_minutes', 'budget'),
    },
  };
  if (raw.baseline !== undefined) {
    const b = obj(raw, 'baseline', 'order');
    parsed.baseline = {
      dev: finite(b, 'dev', 'baseline'),
      hidden: finite(b, 'hidden', 'baseline'),
      devSpread: finite(b, 'devSpread', 'baseline'),
    };
  }
  return parsed;
}

/** Where drafts and orders live: outside every repository. */
function factoryHome(env: Record<string, string | undefined> = process.env): string {
  const override = env.GRD_FACTORY_HOME;
  return override ? path.resolve(override) : path.join(os.homedir(), '.grd', 'factory');
}
function draftDir(home: string, id: string): string { return path.join(home, 'drafts', assertId(id)); }
function orderDir(home: string, id: string): string { return path.join(home, 'orders', assertId(id)); }

function readJson(file: string): unknown { return JSON.parse(fs.readFileSync(file, 'utf8')) as unknown; }

function readDraft(home: string, id: string): WorkOrder {
  return parseWorkOrder(readJson(path.join(draftDir(home, id), 'draft.json')));
}
function writeDraft(home: string, o: WorkOrder): void {
  const dir = draftDir(home, o.id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'draft.json'), JSON.stringify(o, null, 2) + '\n');
}

function listFiles(root: string, rel = ''): string[] {
  const out: string[] = [];
  const entries = fs.readdirSync(path.join(root, rel), { withFileTypes: true }) as Array<{ name: string; isDirectory(): boolean; isSymbolicLink(): boolean }>;
  for (const e of entries) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isSymbolicLink()) throw new Error(`draft contains a symlink at ${path.join(root, r)}; its target could change after validate, so it cannot be hashed`);
    if (e.isDirectory()) out.push(...listFiles(root, r)); else out.push(r);
  }
  return out.sort();
}

/** A hash of everything validate judged — draft.json and hidden/ — never the marker itself. */
function draftHash(home: string, id: string): string {
  const dir = draftDir(home, id);
  const h = crypto.createHash('sha256');
  for (const rel of listFiles(dir).filter((r) => r !== 'validated.json')) {
    h.update(rel); h.update('\0'); h.update(fs.readFileSync(path.join(dir, rel))); h.update('\0');
  }
  return h.digest('hex') as string;
}
function markValidated(home: string, id: string): void {
  fs.writeFileSync(path.join(draftDir(home, id), 'validated.json'), JSON.stringify({ hash: draftHash(home, id) }) + '\n');
}

/** Moves a validated, unchanged draft into `orders/<id>/vault`. Returns the order directory. */
function saveOrder(home: string, id: string): string {
  const dd = draftDir(home, id);
  const marker = path.join(dd, 'validated.json');
  if (!fs.existsSync(marker)) throw new Error(`save: draft "${id}" has not passed validate`);
  const { hash } = readJson(marker) as { hash?: string };
  if (hash !== draftHash(home, id)) throw new Error(`save: draft "${id}" changed after validate passed; run validate again`);
  if (!readDraft(home, id).baseline) throw new Error(`save: draft "${id}" has no baseline; run validate again`);
  const od = orderDir(home, id);
  if (fs.existsSync(od)) throw new Error(`save: order "${id}" already exists at ${od}`);
  fs.mkdirSync(od, { recursive: true });
  const vault = path.join(od, 'vault');
  fs.renameSync(dd, vault);
  fs.renameSync(path.join(vault, 'draft.json'), path.join(vault, 'order.json'));
  fs.rmSync(path.join(vault, 'validated.json'), { force: true });
  return od;
}

function loadOrder(home: string, id: string): WorkOrder {
  return parseWorkOrder(readJson(path.join(orderDir(home, id), 'vault', 'order.json')));
}

module.exports = {
  parseWorkOrder, factoryHome, draftDir, orderDir, readDraft, writeDraft,
  draftHash, markValidated, saveOrder, loadOrder,
};
