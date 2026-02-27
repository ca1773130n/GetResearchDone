/**
 * Test Helper: Process.exit and stdout/stderr capture utilities
 *
 * The GRD CLI uses process.exit(0) for success and process.exit(1) for errors.
 * These helpers mock process.exit with a sentinel throw so tests can verify
 * exit behavior without killing the test process.
 */

const EXIT_SENTINEL = '__GRD_TEST_EXIT__';

/**
 * Capture stdout output and exit code from a function that calls process.exit(0).
 *
 * @param {Function} fn - Function to execute (typically a cmd* function)
 * @returns {{ stdout: string, exitCode: number }}
 */
function captureOutput(fn) {
  let captured = '';
  let exitCode = null;

  const exitSpy = jest.spyOn(process, 'exit').mockImplementation((code) => {
    // Record only the FIRST exit code (subsequent calls may come from
    // catch blocks re-throwing via error() after output() sentinel)
    if (exitCode === null) exitCode = code;
    const err = new Error(EXIT_SENTINEL);
    err.__EXIT__ = true;
    err.code = code;
    throw err;
  });

  const writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation((data) => {
    captured += data;
    return true;
  });

  try {
    fn();
  } catch (e) {
    if (e && e.__EXIT__) {
      // Expected sentinel — process.exit was called
    } else {
      // Real error — re-throw
      writeSpy.mockRestore();
      exitSpy.mockRestore();
      throw e;
    }
  } finally {
    writeSpy.mockRestore();
    exitSpy.mockRestore();
  }

  return { stdout: captured, exitCode: exitCode ?? 0 };
}

/**
 * Capture stderr output and exit code from a function that calls process.exit(1).
 *
 * @param {Function} fn - Function to execute (typically an error path)
 * @returns {{ stderr: string, exitCode: number }}
 */
function captureError(fn) {
  let captured = '';
  let exitCode = null;

  const exitSpy = jest.spyOn(process, 'exit').mockImplementation((code) => {
    exitCode = code;
    const err = new Error(EXIT_SENTINEL);
    err.__EXIT__ = true;
    err.code = code;
    throw err;
  });

  const writeSpy = jest.spyOn(process.stderr, 'write').mockImplementation((data) => {
    captured += data;
    return true;
  });

  try {
    fn();
  } catch (e) {
    if (e && e.__EXIT__) {
      // Expected sentinel
    } else {
      writeSpy.mockRestore();
      exitSpy.mockRestore();
      throw e;
    }
  } finally {
    writeSpy.mockRestore();
    exitSpy.mockRestore();
  }

  return { stderr: captured, exitCode: exitCode ?? 1 };
}

/**
 * Capture stdout output and exit code from an async function.
 * Like captureOutput but awaits the function's returned Promise.
 *
 * @param {Function} fn - Async function to execute (returns a Promise)
 * @returns {Promise<{ stdout: string, exitCode: number }>}
 */
async function captureOutputAsync(fn) {
  let captured = '';
  let exitCode = null;

  const exitSpy = jest.spyOn(process, 'exit').mockImplementation((code) => {
    if (exitCode === null) exitCode = code;
    const err = new Error(EXIT_SENTINEL);
    err.__EXIT__ = true;
    err.code = code;
    throw err;
  });

  const writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation((data) => {
    captured += data;
    return true;
  });

  try {
    await fn();
  } catch (e) {
    if (e && e.__EXIT__) {
      // Expected sentinel — process.exit was called
    } else {
      writeSpy.mockRestore();
      exitSpy.mockRestore();
      throw e;
    }
  } finally {
    writeSpy.mockRestore();
    exitSpy.mockRestore();
  }

  return { stdout: captured, exitCode: exitCode ?? 0 };
}

module.exports = { captureOutput, captureError, captureOutputAsync, EXIT_SENTINEL };
