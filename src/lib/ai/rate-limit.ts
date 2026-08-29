const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 10;
let rateHits: number[] = [];

export function takeRateSlot(): string | null {
  const now = Date.now();
  rateHits = rateHits.filter((t) => now - t < RATE_WINDOW_MS);
  if (rateHits.length >= RATE_MAX) return "Rate limit: wait a minute before more AI calls.";
  rateHits.push(now);
  return null;
}
