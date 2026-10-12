/*
 * MojiMori local mode: run slow database work behind a small blocking dialog.
 * Licensed under the Apache License 2.0 like the rest of Smouldering Durtles.
 */

package com.smouldering_durtles.wk.local;

import android.app.Activity;

import androidx.appcompat.app.AlertDialog;

import com.smouldering_durtles.wk.util.Logger;

import javax.annotation.Nullable;

/** Runs work off the main thread behind a non-cancelable dialog, then continues on the main thread. */
public final class Busy {
    private static final Logger LOGGER = Logger.get(Busy.class);

    /** The background part; a thrown exception's message is shown to the learner. */
    public interface Work<T> {
        T run() throws Exception;
    }

    /** The main-thread continuation. */
    public interface Then<T> {
        void accept(T value);
    }

    private Busy() {
        //
    }

    public static <T> void run(final Activity activity, final String label, final Work<T> work, final Then<T> then) {
        final AlertDialog busy = new AlertDialog.Builder(activity).setMessage(label).setCancelable(false).show();
        new Thread(() -> {
            @Nullable T result = null;
            @Nullable String error = null;
            try {
                result = work.run();
            } catch (final Exception e) {
                LOGGER.error(e, "Background action failed");
                error = e.getMessage() != null ? e.getMessage() : e.toString();
            }
            final @Nullable T r = result;
            final @Nullable String err = error;
            activity.runOnUiThread(() -> {
                busy.dismiss();
                if (activity.isFinishing() || activity.isDestroyed()) {
                    return;
                }
                if (err != null) {
                    message(activity, "Something went wrong", err);
                }
                else if (r != null) {
                    then.accept(r);
                }
            });
        }, "MojiMoriBusy").start();
    }

    public static void message(final Activity activity, final @Nullable String title, final String message) {
        new AlertDialog.Builder(activity).setTitle(title).setMessage(message).setPositiveButton("OK", null).show();
    }
}
