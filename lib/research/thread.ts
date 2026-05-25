'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
import type { ResearchThread, ThreadGates } from './types';
const { defaultGates } = require('./types') as { defaultGates: () => ThreadGates };

const THREADS_REL = '.planning/research/threads';

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}

function threadId(question: string): string {
  const hash = crypto.createHash('sha1').update(question).digest('hex').slice(0, 6);
  const slug = slugify(question) || 'thread';
  return `${slug}-${hash}`;
}

function threadDir(cwd: string, id: string): string {
  return path.join(cwd, THREADS_REL, id);
}

interface CreateOpts {
  maxIterations?: number;
  gates?: ThreadGates;
  modelProfile?: string;
  tokenProfile?: string;
}

function createThread(cwd: string, question: string, opts: CreateOpts): ResearchThread {
  const id = threadId(question);
  const thread: ResearchThread = {
    id,
    question,
    status: 'active',
    iteration: 1,
    maxIterations: opts.maxIterations ?? 5,
    gates: opts.gates ?? defaultGates(),
    budgetUsed: 0,
    modelProfile: opts.modelProfile ?? 'balanced',
    tokenProfile: opts.tokenProfile ?? 'balanced',
    currentStation: 'seed',
    pendingGate: null,
    createdAt: new Date().toISOString(),
  };
  fs.mkdirSync(threadDir(cwd, id), { recursive: true });
  saveThread(cwd, thread);
  return thread;
}

function loadThread(cwd: string, id: string): ResearchThread {
  const raw = fs.readFileSync(path.join(threadDir(cwd, id), 'thread.json'), 'utf8');
  return JSON.parse(raw) as ResearchThread;
}

function renderThreadLog(t: ResearchThread): string {
  return [
    `# Research Thread: ${t.question}`,
    '',
    `- **id:** ${t.id}`,
    `- **status:** ${t.status}`,
    `- **iteration:** ${t.iteration} / ${t.maxIterations}`,
    `- **station:** ${t.currentStation}`,
    `- **pending gate:** ${t.pendingGate ?? 'none'}`,
    `- **created:** ${t.createdAt}`,
    '',
  ].join('\n');
}

function saveThread(cwd: string, thread: ResearchThread): void {
  const dir = threadDir(cwd, thread.id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'thread.json'), JSON.stringify(thread, null, 2));
  fs.writeFileSync(path.join(dir, 'THREAD.md'), renderThreadLog(thread));
}

function listThreads(cwd: string): ResearchThread[] {
  const root = path.join(cwd, THREADS_REL);
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root)
    .filter((d: string) => fs.existsSync(path.join(root, d, 'thread.json')))
    .map((d: string) => loadThread(cwd, d));
}

module.exports = {
  THREADS_REL, slugify, threadId, threadDir,
  createThread, loadThread, saveThread, listThreads, renderThreadLog,
};
