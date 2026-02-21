'use strict';

const fs = require('fs');
const path = require('path');

describe('Agent frontmatter audit', () => {
  const agentDir = path.join(__dirname, '../../agents');
  const agentFiles = fs
    .readdirSync(agentDir)
    .filter((f) => f.startsWith('grd-') && f.endsWith('.md'));

  test('agent count is 20', () => {
    expect(agentFiles.length).toBe(20);
  });

  test('all agents have unique grd- prefixed names', () => {
    const names = new Set();
    for (const file of agentFiles) {
      const content = fs.readFileSync(path.join(agentDir, file), 'utf-8');
      const nameMatch = content.match(/^name:\s*(.+)$/m);
      expect(nameMatch).toBeTruthy();
      const name = nameMatch[1].trim();
      expect(name).toMatch(/^grd-/);
      expect(names.has(name)).toBe(false);
      names.add(name);
    }
  });

  test('all agent names match their filenames', () => {
    for (const file of agentFiles) {
      const content = fs.readFileSync(path.join(agentDir, file), 'utf-8');
      const nameMatch = content.match(/^name:\s*(.+)$/m);
      expect(nameMatch).toBeTruthy();
      const name = nameMatch[1].trim();
      const expectedName = file.replace(/\.md$/, '');
      expect(name).toBe(expectedName);
    }
  });

  test('all agents have descriptions under 200 characters', () => {
    for (const file of agentFiles) {
      const content = fs.readFileSync(path.join(agentDir, file), 'utf-8');
      const descMatch = content.match(/^description:\s*(.+)$/m);
      expect(descMatch).toBeTruthy();
      const desc = descMatch[1].trim();
      expect(desc.length).toBeLessThanOrEqual(200);
    }
  });

  test('no descriptions contain template variables', () => {
    for (const file of agentFiles) {
      const content = fs.readFileSync(path.join(agentDir, file), 'utf-8');
      const descMatch = content.match(/^description:\s*(.+)$/m);
      if (descMatch) {
        expect(descMatch[1]).not.toMatch(/\$\{/);
      }
    }
  });

  test('all agents have a color field', () => {
    for (const file of agentFiles) {
      const content = fs.readFileSync(path.join(agentDir, file), 'utf-8');
      const colorMatch = content.match(/^color:\s*(.+)$/m);
      expect(colorMatch).toBeTruthy();
    }
  });
});
