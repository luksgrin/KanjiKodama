/*
 * KanjiKodama local mode: the current time, which golden tests can pin.
 * Licensed under the Apache License 2.0 like the rest of Smouldering Durtles.
 */

package com.smouldering_durtles.wk.local;

/**
 * The wall clock used by local progression. In the app it is always {@link System#currentTimeMillis()}.
 * Tests pin it with {@link #pin(long)} so that unlock, review and export timestamps are deterministic,
 * move it forward with {@link #advance(long)} and go back to the real clock with {@link #reset()}.
 */
public final class Clock {
    /** The pinned time in ms, or a negative value when the real clock is used. */
    private static volatile long pinned = -1;

    private Clock() {
        //
    }

    /**
     * The current time.
     *
     * @return the pinned time if a test pinned one, otherwise {@link System#currentTimeMillis()}
     */
    public static long now() {
        final long p = pinned;
        return p >= 0 ? p : System.currentTimeMillis();
    }

    /**
     * Pin the clock to a fixed time (tests only).
     *
     * @param ts the Unix timestamp in ms that {@link #now()} returns from now on, must not be negative
     */
    public static void pin(final long ts) {
        if (ts < 0) {
            throw new IllegalArgumentException("ts must not be negative");
        }
        pinned = ts;
    }

    /**
     * Move the clock forward (tests only). Pins the clock first if it is not pinned yet.
     *
     * @param delta the number of ms to add
     */
    public static synchronized void advance(final long delta) {
        pin(now() + delta);
    }

    /** Go back to the real clock. */
    public static void reset() {
        pinned = -1;
    }
}
