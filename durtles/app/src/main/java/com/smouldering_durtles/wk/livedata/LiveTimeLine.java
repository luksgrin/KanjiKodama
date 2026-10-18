/*
 * Copyright 2019-2020 Ernst Jan Plugge <rmc@dds.nl>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

package com.smouldering_durtles.wk.livedata;

import static com.smouldering_durtles.wk.Constants.DAY;
import static com.smouldering_durtles.wk.Constants.HOUR;
import static com.smouldering_durtles.wk.util.ObjectSupport.getTopOfHour;

import android.annotation.SuppressLint;

import com.smouldering_durtles.wk.GlobalSettings;
import com.smouldering_durtles.wk.WkApplication;
import com.smouldering_durtles.wk.db.AppDatabase;
import com.smouldering_durtles.wk.db.model.Subject;
import com.smouldering_durtles.wk.local.Clock;
import com.smouldering_durtles.wk.model.TimeLine;
import com.smouldering_durtles.wk.util.AudioUtil;
import com.smouldering_durtles.wk.util.PitchInfoUtil;

import java.util.ArrayList;
import java.util.Collection;

/**
 * LiveData that tracks available and uncoming lessons and reviews, for the dashboard.
 */
public final class LiveTimeLine extends ConservativeLiveData<TimeLine> {
    /**
     * The singleton instance.
     */
    private static final LiveTimeLine instance = new LiveTimeLine();

    /**
     * Get the singleton instance.
     *
     * @return the instance
     */
    public static LiveTimeLine getInstance() {
        return instance;
    }

    /**
     * Private constructor.
     */
    private LiveTimeLine() {
        //
    }

    @SuppressLint("NewApi")
    @Override
    protected void updateLocal() {
        final AppDatabase db = WkApplication.getDatabase();
        final int userLevel = db.propertiesDao().getUserLevel();
        final Collection<Subject> scanSubjects = new ArrayList<>();
        final TimeLine timeLine = computeTimeLine(db, scanSubjects);

        instance.postValue(timeLine);

        if (GlobalSettings.Api.getAutoDownloadAudio()) {
            final long lastAudioScanDate = db.propertiesDao().getLastAudioScanDate();
            if (lastAudioScanDate == 0 || System.currentTimeMillis() - lastAudioScanDate > DAY/2) {
                scanSubjects.addAll(db.subjectCollectionsDao().getByLevelRange(userLevel, userLevel));
                AudioUtil.scheduleDownloadTasks(scanSubjects, 100);
                db.propertiesDao().setLastAudioScanDate(System.currentTimeMillis());
            }
        }

        if (GlobalSettings.SubjectInfo.getShowPitchInfo()) {
            final long lastPitchInfoScanDate = db.propertiesDao().getLastPitchInfoScanDate();
            if (lastPitchInfoScanDate == 0 || System.currentTimeMillis() - lastPitchInfoScanDate > DAY/2) {
                PitchInfoUtil.scheduleDownloadTasks(100);
                db.propertiesDao().setLastPitchInfoScanDate(System.currentTimeMillis());
            }
        }
    }

    /**
     * KanjiKodama: the timeline part of updateLocal, moved here unchanged so golden tests can run it. The cutoff reads
     * Clock.now(), which is System.currentTimeMillis() unless a golden test pinned it.
     *
     * @param db the database
     * @param scanSubjects receives the lessons and upcoming reviews, for the audio scan
     * @return the timeline
     */
    @SuppressLint("NewApi")
    public static TimeLine computeTimeLine(final AppDatabase db, final Collection<? super Subject> scanSubjects) {
        final int maxLevel = db.propertiesDao().getUserMaxLevelGranted();
        final int userLevel = db.propertiesDao().getUserLevel();
        final boolean vacationMode = db.propertiesDao().getVacationMode();

        final Collection<Long> levelUpIds = db.subjectCollectionsDao().getLevelUpIds(userLevel, maxLevel);

        final int size = GlobalSettings.Dashboard.getTimeLineChartSize();
        final TimeLine timeLine = new TimeLine(size);

        if (!vacationMode) {
            db.subjectCollectionsDao().getAvailableLessonItems(maxLevel).forEach(subject -> {
                timeLine.addLesson(subject);
                scanSubjects.add(subject);
            });

            final long ahead = size * HOUR;
            final long cutoff = Clock.now() + ahead;
            db.subjectCollectionsDao().getUpcomingReviewItems(maxLevel, cutoff).forEach(subject -> {
                timeLine.addReview(subject, !subject.isPassed() && levelUpIds.contains(subject.getId()));
                scanSubjects.add(subject);
            });

            final long longDate = db.subjectAggregatesDao().getNextLongTermReviewDate(maxLevel, getTopOfHour(cutoff));
            timeLine.setLongTermUpcomingReviewDate(longDate);
            if (longDate == 0) {
                timeLine.setNumLongTermUpcomingReviews(0);
            }
            else {
                timeLine.setNumLongTermUpcomingReviews(db.subjectAggregatesDao().getNextLongTermReviewCount(maxLevel, longDate));
            }
        }

        return timeLine;
    }

    @Override
    public TimeLine getDefaultValue() {
        return new TimeLine(24);
    }
}
