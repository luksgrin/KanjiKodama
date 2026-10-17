/*
 * KanjiKodama local mode: one-shot import of WaniKani progress through the API (or from a WaniKani-compatible server).
 * Licensed under the Apache License 2.0 like the rest of Smouldering Durtles.
 */

package com.smouldering_durtles.wk.tasks;

import android.database.Cursor;

import com.smouldering_durtles.wk.GlobalSettings;
import com.smouldering_durtles.wk.WkApplication;
import com.smouldering_durtles.wk.api.model.ApiAssignment;
import com.smouldering_durtles.wk.api.model.ApiLevelProgression;
import com.smouldering_durtles.wk.api.model.ApiReviewStatistic;
import com.smouldering_durtles.wk.api.model.ApiStudyMaterial;
import com.smouldering_durtles.wk.api.model.ApiUser;
import com.smouldering_durtles.wk.db.AppDatabase;
import com.smouldering_durtles.wk.local.Curriculum;
import com.smouldering_durtles.wk.local.ProgressStore;
import com.smouldering_durtles.wk.local.ServerMode;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import javax.annotation.Nullable;

/**
 * Pulls the learner's assignments, review statistics, study materials and level progressions from WaniKani
 * and replaces all local progress with them. This is the only place local mode talks to the WaniKani API,
 * and it only runs when the learner asks for it and confirms.
 *
 * <p>Everything is downloaded first; local progress is only touched once every download succeeded.</p>
 */
public final class WaniKaniImporter {
    private WaniKaniImporter() {
        //
    }

    /**
     * Check the token and fetch the account name and level, without changing anything.
     *
     * @param apiKey the personal access token
     * @return the user
     * @throws Exception with a readable message when the token or the network fails
     */
    public static ApiUser checkToken(final String apiKey) throws Exception {
        final AppDatabase db = WkApplication.getDatabase();
        final @Nullable String previousKey = GlobalSettings.Api.getApiKey();
        GlobalSettings.Api.setApiKey(apiKey);
        db.propertiesDao().setApiKeyRejected(false);
        db.propertiesDao().setApiInError(false);
        final @Nullable ApiUser user = ApiTask.singleEntityApiCall("/v2/user", ApiUser.class);
        final boolean rejected = db.propertiesDao().isApiKeyRejected();
        db.propertiesDao().setApiKeyRejected(false);
        db.propertiesDao().setApiInError(false);
        if (user == null) {
            GlobalSettings.Api.setApiKey(previousKey);
            final String server = ServerMode.label(ApiTask.getBaseUrl());
            throw new IllegalStateException(rejected
                    ? server + " rejected this API token."
                    : "Could not reach " + server + ". Check the connection and try again.");
        }
        return user;
    }

    /** Everything {@link #download(ApiUser)} fetched, ready for {@link #apply(Download)}. */
    public static final class Download {
        private final ApiUser user;
        private final List<ApiAssignment> assignments = new ArrayList<>();
        private final List<ApiReviewStatistic> statistics = new ArrayList<>();
        private final List<ApiStudyMaterial> materials = new ArrayList<>();
        private final List<ApiLevelProgression> levels = new ArrayList<>();

        private Download(final ApiUser user) {
            this.user = user;
        }
    }

    /**
     * Download everything and replace local progress with it.
     *
     * @param user the user returned by {@link #checkToken(String)}
     * @return a short summary of what was imported
     * @throws Exception with a readable message if a download failed; local progress is then unchanged
     */
    public static String importAll(final ApiUser user) throws Exception {
        return apply(download(user));
    }

    /**
     * Download the account's progress without changing anything.
     *
     * @param user the user returned by {@link #checkToken(String)}
     * @return the downloaded progress
     * @throws Exception with a readable message if a download failed
     */
    public static Download download(final ApiUser user) throws Exception {
        final AppDatabase db = WkApplication.getDatabase();
        final Download d = new Download(user);
        final boolean ok = ApiTask.collectionApiCall("/v2/assignments", ApiAssignment.class, d.assignments::add)
                && ApiTask.collectionApiCall("/v2/review_statistics", ApiReviewStatistic.class, d.statistics::add)
                && ApiTask.collectionApiCall("/v2/study_materials", ApiStudyMaterial.class, d.materials::add)
                && ApiTask.collectionApiCall("/v2/level_progressions", ApiLevelProgression.class, d.levels::add);
        db.propertiesDao().setApiKeyRejected(false);
        db.propertiesDao().setApiInError(false);
        if (!ok) {
            throw new IllegalStateException("The download from " + ServerMode.label(ApiTask.getBaseUrl())
                    + " was interrupted. Local progress was not changed.");
        }
        return d;
    }

    /**
     * Replace local progress with downloaded progress.
     *
     * @param d the result of {@link #download(ApiUser)}
     * @return a short summary of what was imported
     */
    public static String apply(final Download d) {
        final AppDatabase db = WkApplication.getDatabase();
        final ApiUser user = d.user;
        final List<ApiAssignment> assignments = d.assignments;
        final List<ApiReviewStatistic> statistics = d.statistics;
        final List<ApiStudyMaterial> materials = d.materials;
        final List<ApiLevelProgression> levels = d.levels;

        // KanjiKodama: skip progress for subjects the bundled content doesn't have (e.g. ones WaniKani added later).
        // The DAO would try to insert an id-only row for them, which fails and silently rolls back the whole import.
        final Set<Long> known = new HashSet<>();
        try (final Cursor c = db.getOpenHelper().getReadableDatabase().query("SELECT id FROM subject")) {
            while (c.moveToNext()) {
                known.add(c.getLong(0));
            }
        }
        final int[] skipped = {0};
        db.runInTransaction(() -> {
            ProgressStore.resetProgress(db);
            for (final @Nullable ApiAssignment a: assignments) {
                if (a != null && known.contains(a.getSubjectId())) {
                    db.subjectSyncDao().insertOrUpdateAssignment(a);
                }
                else if (a != null) {
                    skipped[0]++;
                }
            }
            for (final @Nullable ApiReviewStatistic s: statistics) {
                if (s != null && known.contains(s.getSubjectId())) {
                    db.subjectSyncDao().insertOrUpdateReviewStatistic(s);
                }
            }
            for (final @Nullable ApiStudyMaterial m: materials) {
                if (m != null && known.contains(m.getSubjectId())) {
                    db.subjectSyncDao().insertOrUpdateStudyMaterial(m, false);
                }
            }
            for (final @Nullable ApiLevelProgression p: levels) {
                if (p != null) {
                    db.levelProgressionDao().insertOrUpdate(p);
                }
            }
            db.propertiesDao().setUserLevel(Math.max(1, user.getLevel()));
            if (user.getUsername() != null) {
                db.propertiesDao().setUsername(user.getUsername());
            }
        });
        if (Curriculum.getMode() == Curriculum.Mode.JLPT) {
            // WaniKani's level means nothing in JLPT order: place the learner by what they know.
            Curriculum.place(db);
        }
        ProgressStore.afterChange(db);

        return "Imported level " + db.propertiesDao().getUserLevel() + ": " + (assignments.size() - skipped[0]) + " items, "
                + statistics.size() + " review statistics, " + materials.size() + " notes."
                + (skipped[0] > 0 ? " Skipped " + skipped[0] + " items this app's content doesn't have." : "");
    }
}
