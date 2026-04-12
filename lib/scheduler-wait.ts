'use strict';

/**
 * GRD Scheduler/Wait -- Cancellable wait primitive for the scheduler's
 * all-accounts-exhausted fallback.
 *
 * Sleeps until a target timestamp or SIGINT, whichever fires first.
 * Registers a process-level SIGINT handler lazily on first use — GRD has
 * no other SIGINT handlers in lib/, so this is the first. If another
 * module adds one later they should coordinate via a shared registry.
 *
 * Pattern adopted from gsd-2 v2.67 auto-supervisor.ts signal handling.
 */

let _sigintRegistered = false;
const _activeControllers: Set<AbortController> = new Set();

function _ensureSigintHandler(): void {
  if (_sigintRegistered) return;
  _sigintRegistered = true;
  process.on('SIGINT', () => {
    for (const ctl of _activeControllers) ctl.abort();
    _activeControllers.clear();
  });
}

/**
 * Sleep until `targetMs` (ms since epoch) or SIGINT, whichever fires first.
 *
 * @param targetMs - absolute timestamp at which to resume
 * @returns 'waited' if the delay elapsed normally, 'aborted' if SIGINT was received
 */
async function waitUntilOrAbort(targetMs: number): Promise<'waited' | 'aborted'> {
  _ensureSigintHandler();
  const delay = Math.max(0, targetMs - Date.now());
  if (delay === 0) return 'waited';

  const controller = new AbortController();
  _activeControllers.add(controller);

  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, delay);
      controller.signal.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(new Error('SIGINT'));
      });
    });
    return 'waited';
  } catch (e) {
    if ((e as Error).message === 'SIGINT') return 'aborted';
    throw e;
  } finally {
    _activeControllers.delete(controller);
  }
}

module.exports = { waitUntilOrAbort };
