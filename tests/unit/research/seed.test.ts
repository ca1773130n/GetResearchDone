'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { seedThreadsFromCandidates } = require('../../../lib/research/seed');
const { readLedger } = require('../../../lib/research/ledger');
const { listThreads } = require('../../../lib/research/thread');

function tmp(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-seed-'));
  fs.mkdirSync(path.join(d, '.planning/research'), { recursive: true });
  return d;
}
const cands = (n: number) => Array.from({ length: n }, (_, i) => ({
  rank: i + 1, statement: `claim ${i + 1}`, rationale: 'r',
  predictedOutcome: 'p', sourceNodeIds: [`n${i + 1}`],
}));

describe('seedThreadsFromCandidates', () => {
  it('seeds one thread per candidate (capped) with an iter-1 synthesis hypothesis + provenance', () => {
    const cwd = tmp();
    const res = seedThreadsFromCandidates(cwd, 'topic-x', 'synthkey1', cands(5), { maxCandidates: 3 });
    expect(res.length).toBe(3);                       // capped
    expect(res[0].rank).toBe(1);
    const led = readLedger(cwd, res[0].threadId);
    expect(led.length).toBe(1);
    expect(led[0].iteration).toBe(1);
    expect(led[0].origin).toBe('synthesis');
    expect(led[0].status).toBe('testing');
    expect(led[0].parentId).toBeNull();
    expect(led[0].sourceNodeIds).toEqual(['n1']);
    expect(res.every((r: { newlySeeded: boolean }) => r.newlySeeded)).toBe(true);
  });

  it('is idempotent — re-seeding the same synthKey creates no new threads (manifest fast path)', () => {
    const cwd = tmp();
    seedThreadsFromCandidates(cwd, 'topic-x', 'k', cands(2), {});
    const before = listThreads(cwd).length;
    const again = seedThreadsFromCandidates(cwd, 'topic-x', 'k', cands(2), {});
    expect(listThreads(cwd).length).toBe(before);
    expect(again.every((r: { newlySeeded: boolean }) => !r.newlySeeded)).toBe(true);
  });

  it('is idempotent even if the seed manifest was lost (listThreads scan via seededFrom.seedKey)', () => {
    const cwd = tmp();
    const first = seedThreadsFromCandidates(cwd, 'topic-x', 'k', cands(1), {});
    fs.rmSync(path.join(cwd, '.planning/research/seed-manifest.json'), { force: true });
    const again = seedThreadsFromCandidates(cwd, 'topic-x', 'k', cands(1), {});
    expect(again[0].threadId).toBe(first[0].threadId);
    expect(again[0].newlySeeded).toBe(false);
  });
});
