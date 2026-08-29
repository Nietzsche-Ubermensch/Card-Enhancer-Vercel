/** JUG-4: 60s timeout on every provider request. */
export const AI_TIMEOUT_MS = 60_000;

export async function timedFetch(url: string, init: RequestInit, timeoutMs = AI_TIMEOUT_MS) {
  try {
    return await fetch(url, { ...init, signal: init.signal ?? AbortSignal.timeout(timeoutMs) });
  } catch {
    return null;
  }
}
