/**
 * The app's clock. Core never reads a clock (`core/time.ts`: time is an argument); the app layer
 * reads it here, so tests pin time by passing their own `Clock`.
 */
export interface Clock {
  /** Epoch milliseconds. */
  now(): number;
}

export const systemClock: Clock = { now: () => Date.now() };

/** A clock that stays at `at` until moved (tests, previews). */
export function manualClock(at: number): Clock & { set(at: number): void; advance(ms: number): void } {
  let t = at;
  return {
    now: () => t,
    set: (v) => { t = v; },
    advance: (ms) => { t += ms; },
  };
}
