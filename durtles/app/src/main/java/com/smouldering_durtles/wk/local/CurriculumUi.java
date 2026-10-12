/*
 * MojiMori local mode: dialogs for switching curriculum order and for fast travel.
 * Licensed under the Apache License 2.0 like the rest of Smouldering Durtles.
 */

package com.smouldering_durtles.wk.local;

import android.app.Activity;

import androidx.appcompat.app.AlertDialog;

import com.smouldering_durtles.wk.WkApplication;
import com.smouldering_durtles.wk.model.Session;

import java.util.Locale;

/** Dialog flows shared by the settings screen and the main menu. */
public final class CurriculumUi {
    private static final String SESSION_RUNNING = "Finish or abandon your current lesson or review session first.";

    private CurriculumUi() {
        //
    }

    private static boolean sessionRunning(final Activity activity) {
        if (Session.getInstance().isInactive()) {
            return false;
        }
        Busy.message(activity, null, SESSION_RUNNING);
        return true;
    }

    // --- curriculum order ------------------------------------------------------------------------

    public static void chooseCurriculum(final Activity activity, final Runnable onChanged) {
        if (sessionRunning(activity)) {
            return;
        }
        final Curriculum.Mode[] modes = Curriculum.Mode.values();
        final String[] labels = {
                "WaniKani order: WaniKani's 60 levels",
                "JLPT order: N5, N4, N3, N2, N1, then Obscure (kanji on no JLPT list). Allows fast travel."
        };
        new AlertDialog.Builder(activity)
                .setTitle("Curriculum order")
                .setSingleChoiceItems(labels, Curriculum.getMode().ordinal(), (d, which) -> {
                    d.dismiss();
                    if (modes[which] != Curriculum.getMode()) {
                        confirmSwitch(activity, modes[which], onChanged);
                    }
                })
                .setNegativeButton("Cancel", null)
                .show();
    }

    private static void confirmSwitch(final Activity activity, final Curriculum.Mode target, final Runnable onChanged) {
        Busy.run(activity, "Working out where you would land…",
                () -> Curriculum.preview(activity, WkApplication.getDatabase(), target),
                preview -> {
                    final StringBuilder msg = new StringBuilder();
                    msg.append("You would be placed on level ").append(preview.placement.level);
                    if (preview.levelDescription != null) {
                        msg.append(" (").append(preview.levelDescription).append(")");
                    }
                    msg.append(": the first level where you have mastered less than 60% of the kanji.\n\n");
                    if (preview.placement.backfill > 0) {
                        msg.append(preview.placement.backfill).append(" kanji below that level are not mastered yet.")
                                .append(" Any of them that are still locked unlock right away as lessons.\n\n");
                    }
                    msg.append("Your progress on every item is kept; only the order of new lessons changes."
                            + " You can switch back at any time.");
                    new AlertDialog.Builder(activity)
                            .setTitle("Switch to " + target.label + "?")
                            .setMessage(msg)
                            .setNegativeButton("Cancel", null)
                            .setPositiveButton("Switch", (d, w) -> {
                                if (sessionRunning(activity)) {
                                    return;
                                }
                                Busy.run(activity, "Reordering lessons…",
                                        () -> Curriculum.switchTo(activity, WkApplication.getDatabase(), target),
                                        placement -> {
                                            onChanged.run();
                                            final String where = Curriculum.describeLevel(placement.level);
                                            Busy.message(activity, null, "You are now in " + target.label + ", on level "
                                                    + placement.level + (where == null ? "" : " (" + where + ")") + ".");
                                        });
                            })
                            .show();
                });
    }

    // --- fast travel -----------------------------------------------------------------------------

    public static void fastTravel(final Activity activity) {
        if (sessionRunning(activity)) {
            return;
        }
        Busy.run(activity, "Checking…", () -> FastTravel.status(WkApplication.getDatabase()), status -> {
            if (status.blocked != null) {
                Busy.message(activity, "Fast travel", status.blocked);
                return;
            }
            final String[] labels = new String[status.options.size()];
            for (int i = 0; i < labels.length; i++) {
                final FastTravel.Option o = status.options.get(i);
                labels[i] = String.format(Locale.ROOT, "Level %d%s: %d to prove, about %d min a day",
                        o.target, o.targetDescription == null ? "" : " (" + o.targetDescription + ")", o.probation, o.minutesPerDay);
            }
            final String here = Curriculum.describeLevel(status.level);
            new AlertDialog.Builder(activity)
                    .setTitle("Fast travel from level " + status.level + (here == null ? "" : " (" + here + ")"))
                    .setItems(labels, (d, which) -> confirmTravel(activity, status.options.get(which)))
                    .setNegativeButton("Cancel", null)
                    .show();
        });
    }

    private static void confirmTravel(final Activity activity, final FastTravel.Option option) {
        final String msg = String.format(Locale.ROOT,
                "%d kanji and vocabulary from the levels you skip go on probation. They enter your reviews at"
                        + " Apprentice IV, spread over the next 3 days (about %d minutes a day).\n\n"
                        + "Answer one correctly and it moves to Guru. Get it wrong and it goes back to your lessons,"
                        + " so you learn it properly.\n\n"
                        + "%d radicals from those levels wait in your lessons. Nothing is burned.\n\n"
                        + "The next fast travel unlocks after 3 days, once every probation item has been answered.",
                option.probation, option.minutesPerDay, option.radicals);
        new AlertDialog.Builder(activity)
                .setTitle("Travel to level " + option.target + "?")
                .setMessage(msg)
                .setNegativeButton("Cancel", null)
                .setPositiveButton("Travel", (d, w) -> {
                    if (sessionRunning(activity)) {
                        return;
                    }
                    Busy.run(activity, "Travelling…", () -> FastTravel.travel(WkApplication.getDatabase(), option.target),
                            count -> {
                                final String where = Curriculum.describeLevel(option.target);
                                Busy.message(activity, null, "Welcome to level " + option.target
                                        + (where == null ? "" : " (" + where + ")") + ". " + count
                                        + " probation items are waiting in your reviews.");
                            });
                })
                .show();
    }
}
