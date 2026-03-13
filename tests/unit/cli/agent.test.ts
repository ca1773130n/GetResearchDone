'use strict';

import { buildPromptForCommand } from '../../../lib/cli/agent';

describe('agent command handler', () => {
  it('builds prompt for simple command', () => {
    const prompt = buildPromptForCommand('progress', []);
    expect(prompt).toContain('/grd:progress');
  });

  it('builds prompt with args', () => {
    const prompt = buildPromptForCommand('plan-phase', ['3']);
    expect(prompt).toContain('/grd:plan-phase 3');
  });

  it('builds prompt for survey with topic', () => {
    const prompt = buildPromptForCommand('survey', ['neural', 'rendering']);
    expect(prompt).toContain('/grd:survey neural rendering');
  });
});
