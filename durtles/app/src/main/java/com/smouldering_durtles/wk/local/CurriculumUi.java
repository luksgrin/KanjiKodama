/*
 * MojiMori local mode: dialogs for switching curriculum order and for fast travel.
 * Licensed under the Apache License 2.0 like the rest of Smouldering Durtles.
 */

package com.smouldering_durtles.wk.local;

import android.app.Activity;

import androidx.appcompat.app.AlertDialog;

import com.smouldering_durtles.wk.Actment;
import com.smouldering_durtles.wk.WkApplication;
import com.smouldering_durtles.wk.activities.SessionActivity;
import com.smouldering_durtles.wk.db.model.Subject;
import com.smouldering_durtles.wk.model.Session;

import java.util.List;
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

    // --- kanji level test ------------------------------------------------------------------------

    private static final String TEST_INTRO = "This test estimates how far your kanji knowledge reaches in JLPT order.\n\n"
            + "Round 1: about 30 kanji, six from each of N5, N4, N3, N2 and N1. Round 2: about 18 kanji from"
            + " the block where your knowledge thins out.\n\n"
            + "Type the meaning and the reading of each kanji. A kanji counts as known only when both are right"
            + " the first time, so use Don't know freely. Kanji you have already mastered are not asked.\n\n"
            + "Nothing changes until you decide at the end.";

    /** Entry point from the menu and the settings screen. */
    public static void levelTest(final Activity activity) {
        if (sessionRunning(activity)) {
            return;
        }
        Busy.run(activity, "Checking…", () -> LevelTest.status(WkApplication.getDatabase()), status -> {
            switch (status) {
                case ROUND1_DONE:
                    offerRound2(activity);
                    break;
                case ROUND2_DONE:
                    showResult(activity);
                    break;
                case ROUND1:
                case ROUND2:
                    new AlertDialog.Builder(activity)
                            .setTitle("Kanji level test")
                            .setMessage("A round of the test was not finished. Start the test again?")
                            .setNegativeButton("Cancel", null)
                            .setNeutralButton("Discard test", (d, w) -> Busy.run(activity, "Discarding…", () -> {
                                LevelTest.discard(WkApplication.getDatabase());
                                return true;
                            }, x -> { }))
                            .setPositiveButton("Start again", (d, w) -> startRound(activity, 1))
                            .show();
                    break;
                default:
                    new AlertDialog.Builder(activity)
                            .setTitle("Kanji level test")
                            .setMessage(TEST_INTRO)
                            .setNegativeButton("Cancel", null)
                            .setPositiveButton("Start round 1", (d, w) -> startRound(activity, 1))
                            .show();
                    break;
            }
        });
    }

    /** Called when the dashboard resumes: offer the next step of a level test once. */
    public static void onDashboardResumed(final Activity activity) {
        if (!LocalMode.ENABLED || !Session.getInstance().isInactive()) {
            return;
        }
        Busy.Work<LevelTest.Status> check = () -> {
            final LevelTest.Status status = LevelTest.status(WkApplication.getDatabase());
            if ((status == LevelTest.Status.ROUND1_DONE || status == LevelTest.Status.ROUND2_DONE)
                    && !LevelTest.prompted(WkApplication.getDatabase())) {
                LevelTest.setPrompted(WkApplication.getDatabase());
                return status;
            }
            return LevelTest.Status.NONE;
        };
        new Thread(() -> {
            try {
                final LevelTest.Status status = check.run();
                activity.runOnUiThread(() -> {
                    if (activity.isFinishing() || activity.isDestroyed()) {
                        return;
                    }
                    if (status == LevelTest.Status.ROUND1_DONE) {
                        offerRound2(activity);
                    }
                    else if (status == LevelTest.Status.ROUND2_DONE) {
                        showResult(activity);
                    }
                });
            } catch (final Exception e) {
                //
            }
        }, "MojiMoriLevelTestCheck").start();
    }

    private static void startRound(final Activity activity, final int round) {
        if (sessionRunning(activity)) {
            return;
        }
        Busy.run(activity, round == 1 ? "Picking kanji…" : "Picking kanji for round 2…", () -> {
            final List<Subject> subjects = round == 1
                    ? LevelTest.startRound1(activity, WkApplication.getDatabase())
                    : LevelTest.startRound2(activity, WkApplication.getDatabase());
            if (!subjects.isEmpty()) {
                Session.getInstance().startNewSelfStudySession(subjects);
            }
            return subjects.size();
        }, count -> {
            if (count == 0) {
                showResult(activity);
            }
            else if (activity instanceof Actment) {
                ((Actment) activity).goToActivity(SessionActivity.class);
            }
        });
    }

    private static void offerRound2(final Activity activity) {
        Busy.run(activity, "Scoring round 1…", () -> {
            final List<LevelTest.BlockScore> scores = LevelTest.blockScores(activity, WkApplication.getDatabase());
            final StringBuilder msg = new StringBuilder("Round 1 results (known of asked, estimated share of the block):\n\n");
            for (final LevelTest.BlockScore s: scores) {
                msg.append(String.format(Locale.ROOT, "%s: %d of %d, about %d%%\n",
                        JlptPlan.blockName(s.block), s.known, s.asked, Math.round(s.share * 100)));
            }
            final int boundary = LevelTest.boundaryBlock(scores);
            msg.append('\n').append(boundary == 0
                    ? "You know most of every JLPT block. Round 2 is not needed."
                    : "Your knowledge thins out in " + JlptPlan.blockName(boundary)
                            + ". Round 2 asks a few kanji from its levels to find where exactly.");
            return msg.toString();
        }, msg -> new AlertDialog.Builder(activity)
                .setTitle("Kanji level test")
                .setMessage(msg)
                .setNegativeButton("Later", null)
                .setNeutralButton("Start over", (d, w) -> startRound(activity, 1))
                .setPositiveButton("Continue", (d, w) -> startRound(activity, 2))
                .show());
    }

    private static void showResult(final Activity activity) {
        Busy.run(activity, "Working out your level…", () -> LevelTest.result(activity, WkApplication.getDatabase()), result -> {
            final String where = "level " + result.level + (result.description == null ? "" : " (" + result.description + ")");
            final String msg = "Your kanji knowledge reaches about JLPT-order " + where + ".\n\n"
                    + "Starting there:\n"
                    + "• The " + result.proven + " kanji you answered right go straight to Guru.\n"
                    + "• About " + result.probation + " kanji and vocabulary below that level that you have not"
                    + " started go on probation: they come up as reviews over the next 7 days (about "
                    + result.minutesPerDay + " minutes a day); right moves them to Guru, wrong sends them"
                    + " back to your lessons.\n"
                    + (Curriculum.getMode() == Curriculum.Mode.JLPT ? "" : "• Your curriculum switches to JLPT order.\n")
                    + "• Nothing moves backwards if you are already past that level.";
            new AlertDialog.Builder(activity)
                    .setTitle("Kanji level test result")
                    .setMessage(msg)
                    .setNegativeButton("Later", null)
                    .setNeutralButton("Discard", (d, w) -> Busy.run(activity, "Discarding…", () -> {
                        LevelTest.discard(WkApplication.getDatabase());
                        return true;
                    }, x -> { }))
                    .setPositiveButton("Start there", (d, w) -> {
                        if (sessionRunning(activity)) {
                            return;
                        }
                        Busy.run(activity, "Setting things up…", () -> LevelTest.startAtResult(activity, WkApplication.getDatabase()),
                                outcome -> {
                                    final String here = Curriculum.describeLevel(outcome.level);
                                    Busy.message(activity, null, (outcome.moved ? "Welcome to level " : "You stay on level ")
                                            + outcome.level + (here == null ? "" : " (" + here + ")") + ". "
                                            + outcome.proven + " kanji moved to Guru"
                                            + (outcome.moved ? ", and " + outcome.probation + " items are on probation in your reviews." : "."));
                                });
                    })
                    .show();
        });
    }
}
