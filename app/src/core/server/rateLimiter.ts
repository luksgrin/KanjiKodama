/**
 * One call per 1.1 s on average with a burst of 1 (WaniKani allows 60 a minute),
 * and a pause after a 429 as if the burst were exceeded by 3. Pure state transitions; the caller
 * sleeps. The `RateLimit-Remaining` / `RateLimit-Reset` headers WaniKani sends
 * (and a 429's `Retry-After`) also hold calls until the window resets.
 */

export const RATE_LIMIT_DELAY = 1_100;
export const RATE_LIMIT_BURST = 1;

export interface RateLimiterState {
  load: number;
  lastUpdate: number;
  /** No call before this time (epoch ms; 0 none), from the server's headers. */
  holdUntil: number;
}

export function initialRateLimiter(now: number): RateLimiterState {
  return { load: 0, lastUpdate: now, holdUntil: 0 };
}

/**
 * One pass of `RateLimiter.prepare`'s loop: `{ok: true}` when a slot was taken (the call may go
 * now), else how long to sleep before calling `afterWait` and trying again.
 */
export function tryAcquire(s: RateLimiterState, now: number): { ok: true; state: RateLimiterState } | { ok: false; waitMs: number } {
  if (s.holdUntil > now) return { ok: false, waitMs: s.holdUntil - now };
  if (s.load < RATE_LIMIT_BURST) {
    const lastUpdate = s.load === 0 ? now : s.lastUpdate;
    return { ok: true, state: { ...s, load: s.load + 1, lastUpdate, holdUntil: 0 } };
  }
  const waitMs = Math.min(RATE_LIMIT_DELAY - (now - s.lastUpdate), RATE_LIMIT_DELAY);
  return { ok: false, waitMs: Math.max(0, waitMs) };
}

/** The rest of the loop body after the sleep: drain the load for the time that passed. */
export function afterWait(s: RateLimiterState, now: number): RateLimiterState {
  let { load, lastUpdate } = s;
  while (load > 0 && lastUpdate + RATE_LIMIT_DELAY <= now) {
    load--;
    lastUpdate += RATE_LIMIT_DELAY;
  }
  return { ...s, load, lastUpdate };
}

/** `RateLimiter.pause`: after a 429. */
export function pause(s: RateLimiterState): RateLimiterState {
  return { ...s, load: RATE_LIMIT_BURST + 3 };
}

/**
 * The response's rate-limit headers (lower-case names): hold until `RateLimit-Reset` (epoch
 * seconds) when `RateLimit-Remaining` is 0, or for `Retry-After` seconds on a 429. Unknown or
 * absurd values (more than 2 minutes ahead) are ignored.
 */
export function observeHeaders(s: RateLimiterState, status: number, headers: Readonly<Record<string, string>>, now: number): RateLimiterState {
  let hold = 0;
  const remaining = Number(headers['ratelimit-remaining']);
  const reset = Number(headers['ratelimit-reset']);
  if (headers['ratelimit-remaining'] !== undefined && remaining === 0 && Number.isFinite(reset)) hold = reset * 1000;
  if (status === 429) {
    const retryAfter = Number(headers['retry-after']);
    if (headers['retry-after'] !== undefined && Number.isFinite(retryAfter)) hold = Math.max(hold, now + retryAfter * 1000);
    else if (Number.isFinite(reset) && headers['ratelimit-reset'] !== undefined) hold = Math.max(hold, reset * 1000);
  }
  if (hold <= now || hold - now > 120_000) return s;
  return { ...s, holdUntil: Math.max(s.holdUntil, hold) };
}
