'use strict';
const research = require('../../../lib/research');

describe('research barrel', () => {
  it('re-exports the public surface', () => {
    for (const name of ['runResearch', 'resumeResearch', 'cmdResearchStart',
      'cmdResearchResume', 'cmdResearchStatus', 'createThread', 'listThreads']) {
      expect(typeof research[name]).toBe('function');
    }
  });
});
