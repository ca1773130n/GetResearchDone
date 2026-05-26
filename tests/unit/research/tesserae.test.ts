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
