/*
 * MojiMori local mode: the app runs fully offline on bundled WaniKani content.
 * Licensed under the Apache License 2.0 like the rest of Smouldering Durtles.
 */

package com.smouldering_durtles.wk.local;

/**
 * Global switch for the offline fork. When enabled, nothing talks to the WaniKani API:
 * content comes from the bundled asset and unlocks and level-ups are computed locally.
 */
public final class LocalMode {
    /** MojiMori always runs offline. Kept as a constant so upstream code paths stay readable. */
    public static final boolean ENABLED = true;

    /** Highest level available locally (no subscription cap). */
    public static final int MAX_LEVEL = 60;

    private LocalMode() {
        //
    }
}
