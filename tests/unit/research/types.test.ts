'use strict';
const { defaultGates } = require('../../../lib/research/types');

describe('research types', () => {
  it('defaultGates returns both gates on', () => {
    expect(defaultGates()).toEqual({ execute: true, kg_write: true });
  });
});
