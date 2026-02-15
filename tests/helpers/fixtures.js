/**
 * Test Helper: Temporary fixture directory utilities
 *
 * Creates isolated temp directories with a complete .planning/ structure
 * for tests that need filesystem state. Copies from tests/fixtures/planning/.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const FIXTURE_SOURCE = path.join(__dirname, '..', 'fixtures', 'planning');

/**
 * Create a temp directory with a copy of the fixture .planning/ structure.
 * Returns the path to the temp root (the .planning/ dir is inside it).
 *
 * @returns {string} Absolute path to the temp directory
 */
function createFixtureDir() {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-test-'));
  const dest = path.join(tmpRoot, '.planning');
  fs.cpSync(FIXTURE_SOURCE, dest, { recursive: true });
  return tmpRoot;
}

/**
 * Remove a temp directory created by createFixtureDir.
 *
 * @param {string} dir - Absolute path returned by createFixtureDir
 */
function cleanupFixtureDir(dir) {
  if (!dir || !dir.startsWith(os.tmpdir())) {
    throw new Error('Refusing to remove directory outside of tmpdir: ' + dir);
  }
  fs.rmSync(dir, { recursive: true, force: true });
}

module.exports = { createFixtureDir, cleanupFixtureDir, FIXTURE_SOURCE };
