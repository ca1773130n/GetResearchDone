'use strict';

/**
 * Test Helper: Process.exit and stdout/stderr capture utilities
 *
 * The GRD CLI uses process.exit(0) for success and process.exit(1) for errors.
 * These helpers mock process.exit with a sentinel throw so tests can verify
 * exit behavior without killing the test process.
 */

const EXIT_SENTINEL = '__GRD_TEST_EXIT__';

interface ExitSentinelError extends Error {
  __EXIT__: boolean;
  code: number;
}

interface CaptureResult {
  stdout: string;
  exitCode: number;
}

interface CaptureErrorResult {
  stderr: string;
  exitCode: number;
}

/**
 * Capture stdout output and exit code from a function that calls process.exit(0).
 *
 * @param fn - Function to execute (typically a cmd* function)
 * @returns Object with captured stdout and exitCode
 */
function captureOutput(fn: () => void): CaptureResult {
  let captured = '';
  let exitCode: number | null = null;

  const exitSpy = jest
    .spyOn(process, 'exit')
    .mockImplementation((code?: string | number | null) => {
      // Record only the FIRST exit code (subsequent calls may come from
      // catch blocks re-throwing via error() after output() sentinel)
      if (exitCode === null) exitCode = code as number;
      const err = new Error(EXIT_SENTINEL) as ExitSentinelError;
      err.__EXIT__ = true;
      err.code = code as number;
      throw err;
    });

  const writeSpy = jest
    .spyOn(process.stdout, 'write')
    .mockImplementation((data: string | Uint8Array): boolean => {
      captured += data;
      return true;
    });

  try {
    fn();
  } catch (e: unknown) {
    if (e && (e as ExitSentinelError).__EXIT__) {
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
 * @param fn - Function to execute (typically an error path)
 * @returns Object with captured stderr and exitCode
 */
function captureError(fn: () => void): CaptureErrorResult {
  let captured = '';
  let exitCode: number | null = null;

  const exitSpy = jest
    .spyOn(process, 'exit')
    .mockImplementation((code?: string | number | null) => {
      exitCode = code as number;
      const err = new Error(EXIT_SENTINEL) as ExitSentinelError;
      err.__EXIT__ = true;
      err.code = code as number;
      throw err;
    });

  const writeSpy = jest
    .spyOn(process.stderr, 'write')
    .mockImplementation((data: string | Uint8Array): boolean => {
      captured += data;
      return true;
    });

  try {
    fn();
  } catch (e: unknown) {
    if (e && (e as ExitSentinelError).__EXIT__) {
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
 * @param fn - Async function to execute (returns a Promise)
 * @returns Promise resolving to object with captured stdout and exitCode
 */
async function captureOutputAsync(
  fn: () => Promise<void>,
): Promise<CaptureResult> {
  let captured = '';
  let exitCode: number | null = null;

  const exitSpy = jest
    .spyOn(process, 'exit')
    .mockImplementation((code?: string | number | null) => {
      if (exitCode === null) exitCode = code as number;
      const err = new Error(EXIT_SENTINEL) as ExitSentinelError;
      err.__EXIT__ = true;
      err.code = code as number;
      throw err;
    });

  const writeSpy = jest
    .spyOn(process.stdout, 'write')
    .mockImplementation((data: string | Uint8Array): boolean => {
      captured += data;
      return true;
    });

  try {
    await fn();
  } catch (e: unknown) {
    if (e && (e as ExitSentinelError).__EXIT__) {
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

module.exports = {
  captureOutput,
  captureError,
  captureOutputAsync,
  EXIT_SENTINEL,
};
