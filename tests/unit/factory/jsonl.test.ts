'use strict';
const fs = require('fs');
const path = require('path');
const { readJsonl } = require('../../../lib/factory/jsonl') as {
  readJsonl: <T>(file: string, warn?: (m: string) => void) => T[];
};
const { tmpDir } = require('./fixtures') as { tmpDir: (p: string) => string };

interface Row { n: number }

describe('readJsonl', () => {
  function ledger(text: string): string {
    const f = path.join(tmpDir('grd-factory-jsonl-'), 'spend.jsonl');
    fs.writeFileSync(f, text);
    return f;
  }

  it('returns nothing for a file that does not exist, and skips blank lines', () => {
    expect(readJsonl<Row>(path.join(tmpDir('grd-factory-jsonl-'), 'absent.jsonl'))).toEqual([]);
    expect(readJsonl<Row>(ledger('{"n":1}\n\n{"n":2}\n'))).toEqual([{ n: 1 }, { n: 2 }]);
  });

  it('skips a torn last line with a warning that names the file', () => {
    const f = ledger('{"n":1}\n{"n":2}\n{"n":3');
    const warnings: string[] = [];
    expect(readJsonl<Row>(f, (m) => { warnings.push(m); })).toEqual([{ n: 1 }, { n: 2 }]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain(f);
    expect(warnings[0]).toMatch(/truncated/);
  });

  it('skips a torn last line even when trailing newlines follow it', () => {
    const warnings: string[] = [];
    expect(readJsonl<Row>(ledger('{"n":1}\n{"n":2\n\n'), (m) => { warnings.push(m); })).toEqual([{ n: 1 }]);
    expect(warnings).toHaveLength(1);
  });

  it('throws naming the file and the line when an interior line is damaged', () => {
    const f = ledger('{"n":1}\n{"n":\n{"n":3}\n');
    // Not a torn append: rows after it would be lost, and they count against a budget.
    expect(() => readJsonl<Row>(f, () => undefined)).toThrow(`cannot read ${f}: line 2 is not valid JSON`);
  });

  it('warns on stderr by default, so a torn ledger is never silent', () => {
    const f = ledger('{"n":1}\n{"n":2');
    let captured = '';
    const writeSpy = jest.spyOn(process.stderr, 'write').mockImplementation((data: string | Uint8Array): boolean => {
      captured += String(data);
      return true;
    });
    try {
      expect(readJsonl<Row>(f)).toEqual([{ n: 1 }]);
    } finally {
      writeSpy.mockRestore();
    }
    expect(captured).toContain(f);
  });
});
