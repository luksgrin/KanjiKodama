/*
 * KanjiKodama golden fixtures: drives the real Session state machine (lesson, review and self-study sessions) for
 * the scenario actions session*.
 * Licensed under the Apache License 2.0 like the rest of Smouldering Durtles.
 */

package com.smouldering_durtles.wk.test.golden;

import static com.smouldering_durtles.wk.test.golden.GoldenWriter.obj;

import android.content.Context;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.preference.PreferenceManager;

import androidx.test.platform.app.InstrumentationRegistry;

import com.fasterxml.jackson.databind.JsonNode;
import com.smouldering_durtles.wk.GlobalSettings;
import com.smouldering_durtles.wk.WkApplication;
import com.smouldering_durtles.wk.api.model.Meaning;
import com.smouldering_durtles.wk.api.model.Reading;
import com.smouldering_durtles.wk.db.AppDatabase;
import com.smouldering_durtles.wk.db.model.SessionItem;
import com.smouldering_durtles.wk.db.model.Subject;
import com.smouldering_durtles.wk.enums.CloseEnoughAction;
import com.smouldering_durtles.wk.enums.QuestionChoiceReason;
import com.smouldering_durtles.wk.enums.QuestionType;
import com.smouldering_durtles.wk.enums.ReviewOrder;
import com.smouldering_durtles.wk.enums.SessionState;
import com.smouldering_durtles.wk.enums.SessionType;
import com.smouldering_durtles.wk.enums.SpecialButtonBehavior;
import com.smouldering_durtles.wk.fragments.SummarySessionFragment;
import com.smouldering_durtles.wk.jobs.AbandonSessionItemJob;
import com.smouldering_durtles.wk.jobs.FinishSessionJob;
import com.smouldering_durtles.wk.jobs.Job;
import com.smouldering_durtles.wk.jobs.ReportSessionItemJob;
import com.smouldering_durtles.wk.jobs.UpdateSessionItemJob;
import com.smouldering_durtles.wk.local.Clock;
import com.smouldering_durtles.wk.local.LevelTest;
import com.smouldering_durtles.wk.model.AnswerVerdict;
import com.smouldering_durtles.wk.model.FloatingUiState;
import com.smouldering_durtles.wk.model.MatchingKanji;
import com.smouldering_durtles.wk.model.Question;
import com.smouldering_durtles.wk.model.Session;
import com.smouldering_durtles.wk.model.SubmitPrecheck;
import com.smouldering_durtles.wk.services.JobRunnerService;

import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.Deque;
import java.util.HashMap;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.BiFunction;
import java.util.function.Consumer;

/**
 * The {@code session*} scenario actions: they drive {@link Session} the way SessionActivity and its fragments do, and
 * record per step the session state, the question queue and every job the session scheduled.
 *
 * <p>Jobs: while a scenario uses sessions, {@link JobRunnerService#testInterceptor} takes over the jobs that the
 * session schedules from the test thread (ReportSessionItemJob, UpdateSessionItemJob, AbandonSessionItemJob,
 * FinishSessionJob) and runs each one at once, in scheduling order (the app queues them for its single job thread).
 * {@code result.jobs} lists them as {@code [simple class name, data string]}. The time of an answer is the pinned
 * clock ({@code Question.markCorrect} stamps {@code lastAnswer} with {@code Clock.now()}).</p>
 *
 * <p>Settings: the first session action of a scenario pins these preferences (the app defaults unless noted), plus
 * the step's {@code settings} (key → boolean, number or string; null removes the key): enable_advanced false,
 * delay_result_upload false, auto_download_audio false (the app default is true; off so no download tasks run),
 * show_pitch_info false, kanji_mode_onkun false, require_onyomi_in_katakana false; close_enough_action and the three
 * max_*_session_size keys removed (SILENTLY_ACCEPT, 5 lessons, 100 reviews, 100 self-study). The originals are put
 * back by the next base reset. {@code resolved.settings} records what the step applied.</p>
 *
 * <p>After every action the driver calls {@code Session.chooseQuestion()} (SessionActivity.updateFragment does that
 * on every state change; it does nothing while a question is chosen) and waits for the main thread to be idle
 * (subject change callbacks are posted there).</p>
 *
 * <p>Actions:</p>
 * <ul>
 *     <li>{@code sessionStart} {type: LESSON | REVIEW | SELF_STUDY, ids | where | levelTestRound: 1 | 2, settings}:
 *     {@code where} selects available lessons (LESSON), due reviews (REVIEW) or any visible subjects (SELF_STUDY, in
 *     level/lesson order); {@code levelTestRound} picks with LevelTest.startRound1/2 and starts a self-study session,
 *     like the level test dialog. The subjects go to Session.startNew*Session in {@code resolved.ids} order.</li>
 *     <li>{@code sessionStartQuiz}: Session.startQuiz (end of the lesson presentation).</li>
 *     <li>{@code sessionAnswer} {answer, rules, count (default 1) | until: "finishing", max (default 500),
 *     advance (default true), spacingSeconds}: answers the current question, then (with advance) Session.advance
 *     (Next, or lightning mode), {@code count} times or until the session is FINISHING. {@code answer} is
 *     "correct" (the first of the subject's meanings or readings that the question type accepts without a typo),
 *     "wrong" (a fixed wrong text that passes the pre-checks), "dontKnow" (Session.submitDontKnow), "ankiCorrect" / "ankiIncorrect" (Anki mode's
 *     Correct button, Session.submitAnkiCorrect, and Incorrect button, Session.submitAnkiIncorrect; these
 *     answers also list {@code ankiMode}, GlobalSettings.getAnkiMode for the question, which SessionActivity uses to
 *     pick AnkiSessionFragment, and {@code ankiAnswer}, the revealed text Question.getAnkiAnswerRichText) or
 *     {@code {"text": "..."}}; {@code rules} overrides it per question: keys "id:meaning", "id:reading", "id",
 *     "meaning", "reading" (first match wins), each a list of answers used up in order. {@code spacingSeconds}
 *     moves the clock before every answer but the first. {@code only} ("meaning" | "reading" | "id:meaning" | "id:reading") answers
 *     only those questions and presses Skip (Session.skip) on the others, listed with answer "skip". {@code resolved.answers} lists {id, questionType, answer,
 *     text, verdict {ok, retry, nearMatch}, atMs}; text is what was submitted (null for dontKnow). With a matching
 *     kanji (MatchingKanji + SubjectDao.getKanjiByCharacters, like UnansweredSessionFragment; only while the setting is
 *     on, which needs enable_advanced) the entry also has {@code matchingKanji} (its id) and Session.submit gets it.
 *     With randomized inflections on for the session (GlobalSettings.getRandomizeInflections), every entry, skips
 *     included, has {@code characters}: Question.getCharacters, called before answering like the question header
 *     does, which picks the question's inflection (InflectionUtil, seeded per scenario by the base reset).</li>
 *     <li>{@code sessionAdvance}: Session.advance.</li>
 *     <li>{@code sessionButton} {button: SpecialButtonBehavior name, count (default 1)}: the special button, e.g.
 *     UNDO_AND_MARK_CORRECT ("Ignore"), UNDO_AND_RETRY_NOW, UNDO_AND_PUT_BACK, SKIP. {@code resolved.pressed} lists
 *     canShow before each press (perform does nothing when it is false); for TOGGLE_LIGHTNING_MODE
 *     {@code resolved.labels} lists the button's label after each press ("Lightning", struck through when off).</li>
 *     <li>{@code sessionAnswer} with {@code advance: "app"}: before advancing, SessionActivity's lightning-mode
 *     decision runs (Session.lightningAdvancesNow) and each answer lists {@code lightning} {active
 *     (isLightningModeActive), linger (FloatingUiState.lingerOnAnswer), autoAdvanced}; when it does not advance at
 *     once, the driver presses Next (Session.advance) anyway.</li>
 *     <li>{@code sessionAnkiButton} {button: "correct" | "incorrect"}: the Anki button pressed once on the current
 *     question even if it is already answered (the session ignores it then); {@code resolved.before} is
 *     {answered, correct} before the press.</li>
 *     <li>{@code sessionWrapUp}: Session.wrapup (menu "Wrap up").</li>
 *     <li>{@code sessionBackToPresentation}: Session.goBackToPresentation (menu "Back to lesson presentation");
 *     {@code resolved.menuVisible} is the menu item's visibility (a LESSON session in state ACTIVE), the call is made
 *     either way. {@code sessionPresentationNext} / {@code sessionPresentationPrevious} {count (default 1)}: the
 *     presentation's next/previous buttons (Session.moveToNextLessonItem / moveToPreviousLessonItem).
 *     {@code sessionInspect}: nothing. These four add {@code result.presentation} {item (the item shown, or null),
 *     index (in the item list), storedItemId (properties' current item id, what a restart restores)}.</li>
 *     <li>{@code sessionFinish}: the summary's Finish button: with delayed reporting (the setting, or any
 *     self-study session) every PENDING item in the session_item table is reported like
 *     SummarySessionFragment.doInBackground does (it is called), then Session.finish. {@code resolved.pending} lists
 *     those items {id, meaningIncorrect, readingIncorrect, lastAnswer}.</li>
 *     <li>{@code sessionAbandon}: Session.finish without reporting (menu "Abandon session").</li>
 *     <li>{@code sessionRestart}: a process restart: the Session singleton's fields go back to their initial values,
 *     LevelTest's in-memory "round active" flag to false, then Session.load reads session_item back.</li>
 * </ul>
 *
 * <p>{@code result} of every session action: {@code {..., session, jobs}}; {@code session} is {type, state,
 * delayed, answered, correct, canUndo, canBeWrappedUp, progressText, current [id, questionType] | null, reason,
 * queue (the pending questions in list order), history (top first), items [{id, state, order, bucket,
 * choiceDelay, numAnswers, lastAnswer, done [q1..q4], incorrect [q1..q4]}], db {sessionType, items [{id, state,
 * done, incorrect, numAnswers, lastAnswer}]}}.</p>
 */
final class SessionDriver {
    private static final String WRONG_MEANING = "qqqqqqqq";
    private static final String[] WRONG_READINGS = {"ぬぬぬぬ", "へへへへ", "ゑゑゑゑ"};
    private static final Map<String, Object> PINNED = new LinkedHashMap<>();
    static {
        PINNED.put("enable_advanced", false);
        PINNED.put("delay_result_upload", false);
        PINNED.put("auto_download_audio", false);
        PINNED.put("show_pitch_info", false);
        PINNED.put("kanji_mode_onkun", false);
        PINNED.put("require_onyomi_in_katakana", false);
        PINNED.put("close_enough_action", null);
        PINNED.put("max_lesson_session_size", null);
        PINNED.put("max_review_session_size", null);
        PINNED.put("max_self_study_session_size", null);
    }
    private static final List<Class<? extends Job>> TAKEN = Arrays.asList(ReportSessionItemJob.class,
            UpdateSessionItemJob.class, AbandonSessionItemJob.class, FinishSessionJob.class);
    /** The preferences as they were before the first change of this scenario (key → value, absent = null). */
    private static final Map<String, Object> ORIGINAL_PREFS = new LinkedHashMap<>();

    private final Context context;
    private final AppDatabase db;
    private final BiFunction<JsonNode, Boolean, List<Long>> select;
    private final Session session = Session.getInstance();
    private final List<Object> jobs = new ArrayList<>();
    private volatile Thread owner = null;

    SessionDriver(final Context context, final BiFunction<JsonNode, Boolean, List<Long>> select) {
        this.context = context;
        db = WkApplication.getDatabase();
        this.select = select;
    }

    // --- base reset ------------------------------------------------------------------------------

    /** Part of the scenario base reset: preferences back, job interceptor off, Session as in a fresh process. */
    static void baseReset(final Context context) throws Exception {
        JobRunnerService.testInterceptor = null;
        if (!ORIGINAL_PREFS.isEmpty()) {
            final SharedPreferences.Editor e = PreferenceManager.getDefaultSharedPreferences(context).edit();
            for (final Map.Entry<String, Object> p: ORIGINAL_PREFS.entrySet()) {
                put(e, p.getKey(), p.getValue());
            }
            e.commit();
            ORIGINAL_PREFS.clear();
        }
        freshSession();
    }

    private static void put(final SharedPreferences.Editor e, final String key, final Object value) {
        if (value == null) {
            e.remove(key);
        }
        else if (value instanceof Boolean) {
            e.putBoolean(key, (Boolean) value);
        }
        else if (value instanceof Integer) {
            e.putInt(key, (Integer) value);
        }
        else if (value instanceof Long) {
            e.putLong(key, (Long) value);
        }
        else if (value instanceof Float) {
            e.putFloat(key, (Float) value);
        }
        else {
            e.putString(key, value.toString());
        }
    }

    private static void setField(final Object target, final Class<?> cls, final String name, final Object value) throws Exception {
        final Field f = cls.getDeclaredField(name);
        f.setAccessible(true);
        f.set(target, value);
    }

    private static Object getField(final Object target, final String name) throws Exception {
        final Field f = Session.class.getDeclaredField(name);
        f.setAccessible(true);
        return f.get(target);
    }

    /** The Session singleton's fields as the constructor leaves them (a new app process). */
    private static void freshSession() throws Exception {
        final Session s = Session.getInstance();
        s.reset();
        setField(s, Session.class, "loaded", false);
        setField(s, Session.class, "type", SessionType.NONE);
        setField(s, Session.class, "onkun", false);
        setField(s, Session.class, "backToBack", false);
        setField(s, Session.class, "readingFirst", false);
        setField(s, Session.class, "meaningFirst", false);
        setField(s, Session.class, "delayed", false);
        setField(s, Session.class, "lightningModeTemporarilyDisabled", false);
        setField(s, Session.class, "state", SessionState.INACTIVE);
        setField(s, Session.class, "currentItem", null);
        setField(s, Session.class, "currentQuestion", null);
        setField(s, Session.class, "questionChoiceReason", QuestionChoiceReason.STARTING_REVIEW_SESSION);
        setField(s, Session.class, "lastFinishedSubjectId", -1L);
        setField(s, Session.class, "answered", false);
        setField(s, Session.class, "correct", false);
        setField(s, Session.class, "items", new ArrayList<SessionItem>());
        setField(s, Session.class, "questions", new ArrayList<Question>());
        setField(s, Session.class, "comparator", ReviewOrder.SHUFFLE.getComparator());
        setField(s, Session.class, "lastTypedIncorrectAnswer", 0L);
        setField(s, Session.class, "forceNewFragment", false);
        FloatingUiState.setCurrentAnswer("");
    }

    // --- settings and jobs -----------------------------------------------------------------------

    private void applySettings(final JsonNode overrides, final Map<String, Object> resolved) {
        apply(context, new LinkedHashMap<>(PINNED), overrides, resolved);
    }

    /**
     * Only the given preferences (no pinned session defaults), e.g. for the dashboard action; like the session
     * settings they stay until the next base reset, which puts the originals back. {@code resolved.settings} records them.
     */
    static void applyPreferences(final Context context, final JsonNode overrides, final Map<String, Object> resolved) {
        apply(context, new LinkedHashMap<>(), overrides, resolved);
    }

    private static void apply(final Context context, final Map<String, Object> wanted, final JsonNode overrides,
                              final Map<String, Object> resolved) {
        final SharedPreferences prefs = PreferenceManager.getDefaultSharedPreferences(context);
        if (overrides != null) {
            for (final Iterator<Map.Entry<String, JsonNode>> it = overrides.fields(); it.hasNext();) {
                final Map.Entry<String, JsonNode> e = it.next();
                final JsonNode v = e.getValue();
                wanted.put(e.getKey(), v.isNull() ? null : v.isBoolean() ? (Object) v.asBoolean()
                        : v.isIntegralNumber() ? (Object) v.asInt() : v.isNumber() ? (Object) (float) v.asDouble() : v.asText());
            }
        }
        final Map<String, ?> all = prefs.getAll();
        final SharedPreferences.Editor e = prefs.edit();
        for (final Map.Entry<String, Object> w: wanted.entrySet()) {
            if (!ORIGINAL_PREFS.containsKey(w.getKey())) {
                ORIGINAL_PREFS.put(w.getKey(), all.get(w.getKey()));
            }
            put(e, w.getKey(), w.getValue());
        }
        e.commit();
        resolved.put("settings", wanted);
    }

    private void installInterceptor() {
        owner = Thread.currentThread();
        JobRunnerService.testInterceptor = (cls, data) -> {
            if (Thread.currentThread() != owner || !TAKEN.contains(cls)) {
                return false;
            }
            jobs.add(Arrays.asList(cls.getSimpleName(), data));
            try {
                cls.getConstructor(String.class).newInstance(data).run();
            } catch (final Exception ex) {
                throw new RuntimeException(ex);
            }
            return true;
        };
    }

    // --- actions ---------------------------------------------------------------------------------

    Object perform(final String action, final JsonNode step, final Map<String, Object> resolved) throws Exception {
        jobs.clear();
        final Map<String, Object> result = new LinkedHashMap<>();
        switch (action) {
            case "sessionStart":
                start(step, resolved, result);
                break;
            case "sessionStartQuiz":
                session.startQuiz();
                break;
            case "sessionAnswer":
                answer(step, resolved, result);
                break;
            case "sessionAdvance":
                session.advance();
                break;
            case "sessionButton": {
                final SpecialButtonBehavior b = SpecialButtonBehavior.valueOf(step.get("button").asText());
                final List<Object> pressed = new ArrayList<>();
                final List<Object> labels = new ArrayList<>();
                for (int i = 0; i < step.path("count").asInt(1); i++) {
                    pressed.add(b.canShow());
                    b.perform();
                    session.chooseQuestion();
                    if (b == SpecialButtonBehavior.TOGGLE_LIGHTNING_MODE) {
                        labels.add(b.getLabel());
                    }
                }
                resolved.put("pressed", pressed);
                if (b == SpecialButtonBehavior.TOGGLE_LIGHTNING_MODE) {
                    resolved.put("labels", labels);
                }
                break;
            }
            case "sessionAnkiButton": {
                resolved.put("before", obj("answered", session.isAnswered(), "correct", session.isCorrect()));
                if ("correct".equals(step.get("button").asText())) {
                    session.submitAnkiCorrect();
                }
                else {
                    session.submitAnkiIncorrect();
                }
                break;
            }
            case "sessionWrapUp":
                session.wrapup();
                break;
            case "sessionBackToPresentation":
                // The menu item's visibility (AbstractActivity/SessionActivity): a lesson session in the quiz.
                resolved.put("menuVisible", session.getType() == SessionType.LESSON && session.isActive());
                session.goBackToPresentation();
                result.put("presentation", presentation());
                break;
            case "sessionPresentationNext":
            case "sessionPresentationPrevious":
                for (int i = 0; i < step.path("count").asInt(1); i++) {
                    if ("sessionPresentationNext".equals(action)) {
                        session.moveToNextLessonItem();
                    }
                    else {
                        session.moveToPreviousLessonItem();
                    }
                }
                result.put("presentation", presentation());
                break;
            case "sessionInspect":
                result.put("presentation", presentation());
                break;
            case "sessionFinish":
                finish(resolved);
                break;
            case "sessionAbandon":
                session.finish();
                joinLevelTest();
                break;
            case "sessionRestart":
                freshSession();
                // A process restart drops the in-memory cache; LevelTest reads the persisted round state again.
                setField(null, LevelTest.class, "roundActive", null);
                session.load();
                break;
            default:
                throw new IllegalArgumentException("unknown action " + action);
        }
        session.chooseQuestion();
        InstrumentationRegistry.getInstrumentation().waitForIdleSync();
        result.put("session", state());
        result.put("jobs", new ArrayList<>(jobs));
        return result;
    }

    private void start(final JsonNode step, final Map<String, Object> resolved, final Map<String, Object> result) throws Exception {
        applySettings(step.get("settings"), resolved);
        installInterceptor();
        final SessionType type = SessionType.valueOf(step.get("type").asText());
        final List<Subject> subjects;
        final List<Long> ids;
        if (step.has("levelTestRound")) {
            subjects = step.get("levelTestRound").asInt() == 1 ? LevelTest.startRound1(context, db) : LevelTest.startRound2(context, db);
            ids = new ArrayList<>();
            for (final Subject s: subjects) {
                ids.add(s.getId());
            }
        }
        else {
            ids = new ArrayList<>();
            if (step.has("ids")) {
                for (final JsonNode id: step.get("ids")) {
                    ids.add(id.asLong());
                }
            }
            else if (type == SessionType.SELF_STUDY) {
                final StringBuilder q = new StringBuilder("SELECT id FROM subject WHERE hiddenAt = 0 AND object IS NOT NULL");
                ScenarioRunner.appendFilter(q, step.get("where"));
                q.append(" ORDER BY level, lessonPosition, id");
                if (step.path("where").has("limit")) {
                    q.append(" LIMIT ").append(step.get("where").get("limit").asInt());
                }
                try (Cursor c = db.getOpenHelper().getWritableDatabase().query(q.toString())) {
                    while (c.moveToNext()) {
                        ids.add(c.getLong(0));
                    }
                }
            }
            else {
                ids.addAll(select.apply(step.get("where"), type == SessionType.LESSON));
            }
            final Map<Long, Subject> byId = new HashMap<>();
            for (final Subject s: db.subjectCollectionsDao().getByIds(ids)) {
                byId.put(s.getId(), s);
            }
            subjects = new ArrayList<>();
            for (final long id: ids) {
                final Subject s = byId.get(id);
                if (s == null) {
                    throw new IllegalArgumentException("no subject " + id);
                }
                subjects.add(s);
            }
        }
        resolved.put("ids", ids);
        result.put("count", subjects.size());
        if (subjects.isEmpty()) {
            return;
        }
        switch (type) {
            case LESSON:
                session.startNewLessonSession(subjects);
                break;
            case REVIEW:
                session.startNewReviewSession(subjects);
                break;
            case SELF_STUDY:
                session.startNewSelfStudySession(subjects);
                break;
            default:
                throw new IllegalArgumentException("bad session type " + type);
        }
    }

    private static String kind(final QuestionType t) {
        return t.isMeaning() ? "meaning" : "reading";
    }

    /** The answer spec for this question: the first matching rule list that still has entries, else the default. */
    private static JsonNode spec(final JsonNode step, final Map<String, Integer> used, final long id, final QuestionType t) {
        final JsonNode rules = step.path("rules");
        for (final String key: new String[] {id + ":" + kind(t), Long.toString(id), kind(t)}) {
            final JsonNode list = rules.get(key);
            if (list == null) {
                continue;
            }
            final int n = used.containsKey(key) ? used.get(key) : 0;
            if (n < list.size()) {
                used.put(key, n + 1);
                return list.get(n);
            }
        }
        return step.has("answer") ? step.get("answer") : ScenarioRunner.JSON.getNodeFactory().textNode("correct");
    }

    private static boolean passesPrecheck(final QuestionType t, final Subject s, final String text) {
        return SubmitPrecheck.check(t, s.getCharacters(), text).getRejection() == null;
    }

    private static String correctText(final QuestionType t, final Subject s) {
        final List<String> candidates = new ArrayList<>();
        if (t.isMeaning()) {
            for (final Meaning m: s.getMeanings()) {
                candidates.add(m.getMeaning());
            }
        }
        else {
            for (final Reading r: s.getReadings()) {
                candidates.add(r.getReading());
            }
        }
        for (final String c: candidates) {
            if (c == null || c.isEmpty() || !passesPrecheck(t, s, c)) {
                continue;
            }
            final AnswerVerdict v = t.checkAnswer(s, null, c, CloseEnoughAction.SILENTLY_ACCEPT, false);
            if (v.isOk() && !v.isNearMatch()) {
                return c;
            }
        }
        throw new IllegalStateException("no correct answer for " + s.getId() + " " + t);
    }

    private static String wrongText(final QuestionType t, final Subject s) {
        final List<String> candidates = t.isMeaning() ? Arrays.asList(WRONG_MEANING) : Arrays.asList(WRONG_READINGS);
        for (final String c: candidates) {
            if (!passesPrecheck(t, s, c)) {
                continue;
            }
            final AnswerVerdict v = t.checkAnswer(s, null, c, CloseEnoughAction.SILENTLY_ACCEPT, false);
            if (!v.isOk() && !v.isRetry()) {
                return c;
            }
        }
        throw new IllegalStateException("no wrong answer for " + s.getId() + " " + t);
    }

    private void answer(final JsonNode step, final Map<String, Object> resolved, final Map<String, Object> result) {
        final boolean untilFinishing = "finishing".equals(step.path("until").asText());
        final int count = untilFinishing ? Integer.MAX_VALUE : step.path("count").asInt(1);
        final int max = step.path("max").asInt(500);
        final String only = step.path("only").asText(null);
        // "app": SessionActivity's lightning-mode decision picks between advancing at once and the Next button.
        final boolean app = "app".equals(step.path("advance").asText());
        final boolean advance = app || step.path("advance").asBoolean(true);
        final long spacing = Math.round(step.path("spacingSeconds").asDouble(0) * 1000);
        final Map<String, Integer> used = new HashMap<>();
        final List<Object> answers = new ArrayList<>();
        String stopped = null;
        int done = 0;
        for (int i = 0; done < count; i++) {
            if (i >= max) {
                stopped = "max";
                break;
            }
            session.chooseQuestion();
            final Question q = session.getCurrentQuestion();
            if (q == null || session.isAnswered() || !session.isActive()) {
                stopped = q == null ? "noQuestion" : session.isAnswered() ? "answered" : "notActive";
                break;
            }
            // With randomized inflections on, the question header shows Question.getCharacters (SubjectInfoButtonView),
            // which picks the question's inflection on first use; the driver does the same before answering.
            final boolean inflections = GlobalSettings.getRandomizeInflections(session.getType());
            final String shown = inflections ? q.getCharacters(q.getItem().getSubject(), session.getType()) : null;
            if (only != null && !only.equals(kind(q.getType())) && !only.equals(q.getItem().getId() + ":" + kind(q.getType()))) {
                // Not the wanted kind of question: the Skip button puts it back.
                final Map<String, Object> skipped = obj("id", q.getItem().getId(), "questionType", q.getType().name(),
                        "answer", "skip", "text", null, "verdict", null, "atMs", Clock.now());
                if (inflections) {
                    skipped.put("characters", shown);
                }
                answers.add(skipped);
                session.skip();
                continue;
            }
            if (done > 0 && spacing > 0) {
                Clock.advance(spacing);
            }
            done++;
            final Subject s = q.getItem().getSubject();
            final JsonNode spec = spec(step, used, q.getItem().getId(), q.getType());
            final String kind = spec.isObject() ? "text" : spec.asText();
            final String text;
            final AnswerVerdict verdict;
            Map<String, Object> anki = null;
            Subject matchingKanji = null;
            if ("dontKnow".equals(kind)) {
                text = null;
                session.submitDontKnow();
                verdict = null;
            }
            else if ("ankiCorrect".equals(kind) || "ankiIncorrect".equals(kind)) {
                text = null;
                verdict = null;
                anki = obj("ankiMode", GlobalSettings.getAnkiMode(session.getType(), q.getType()),
                        "ankiAnswer", q.getAnkiAnswerRichText(s, session.getType()).toString());
                if ("ankiCorrect".equals(kind)) {
                    session.submitAnkiCorrect();
                }
                else {
                    session.submitAnkiIncorrect();
                }
            }
            else {
                text = "text".equals(kind) ? spec.get("text").asText()
                        : "correct".equals(kind) ? correctText(q.getType(), s)
                        : "wrong".equals(kind) ? wrongText(q.getType(), s) : null;
                if (text == null) {
                    throw new IllegalArgumentException("bad answer " + spec);
                }
                FloatingUiState.setCurrentAnswer(text);
                // UnansweredSessionFragment: the matching kanji of a single-character vocabulary, when the setting is on.
                final String lookup = MatchingKanji.lookupCharacters(s, GlobalSettings.AdvancedOther.getShakeOnMatchingKanji());
                matchingKanji = lookup == null ? null : db.subjectDao().getKanjiByCharacters(lookup);
                verdict = session.submit(matchingKanji);
            }
            final Map<String, Object> entry = obj("id", q.getItem().getId(), "questionType", q.getType().name(), "answer", kind,
                    "text", text, "verdict", verdict == null ? null : obj("ok", verdict.isOk(), "retry", verdict.isRetry(),
                            "nearMatch", verdict.isNearMatch()),
                    "atMs", Clock.now());
            if (inflections) {
                entry.put("characters", shown);
            }
            if (anki != null) {
                entry.putAll(anki);
            }
            if (matchingKanji != null) {
                entry.put("matchingKanji", matchingKanji.getId());
            }
            if (app) {
                final boolean active = session.isLightningModeActive();
                final boolean auto = session.lightningAdvancesNow(active);
                entry.put("lightning", obj("active", active, "linger", FloatingUiState.lingerOnAnswer, "autoAdvanced", auto));
            }
            answers.add(entry);
            if (advance) {
                session.advance();
                session.chooseQuestion();
            }
            if (untilFinishing && !session.isActive()) {
                break;
            }
        }
        resolved.put("answers", answers);
        result.put("answered", done);
        result.put("stopped", stopped);
    }

    @SuppressWarnings("unchecked")
    private void finish(final Map<String, Object> resolved) throws Exception {
        final List<Object> pending = new ArrayList<>();
        if (session.isDelayed()) {
            for (final SessionItem item: db.sessionItemDao().getAll()) {
                if (item.isPending()) {
                    pending.add(obj("id", item.getId(), "meaningIncorrect", item.getQuestion1Incorrect(),
                            "readingIncorrect", item.getQuestion2Incorrect() + item.getQuestion3Incorrect() + item.getQuestion4Incorrect(),
                            "lastAnswer", item.getLastAnswer()));
                }
            }
            final Method m = SummarySessionFragment.class.getDeclaredMethod("doInBackground", Consumer.class);
            m.setAccessible(true);
            m.invoke(null, (Consumer<Object[]>) values -> { });
        }
        resolved.put("pending", pending);
        session.finish();
        joinLevelTest();
    }

    private static void joinLevelTest() throws InterruptedException {
        for (final Thread t: Thread.getAllStackTraces().keySet()) {
            if ("KanjiKodamaLevelTest".equals(t.getName())) {
                t.join(30000);
            }
        }
    }

    // --- state -----------------------------------------------------------------------------------

    private static List<Object> slots(final SessionItem item, final boolean done) {
        final List<Object> out = new ArrayList<>();
        for (int slot = 1; slot <= 4; slot++) {
            out.add(done ? (Object) item.isQuestionDone(slot) : (Object) item.getQuestionIncorrect(slot));
        }
        return out;
    }

    private static List<Object> questionList(final Collection<Question> questions) {
        final List<Object> out = new ArrayList<>();
        for (final Question q: questions) {
            out.add(Arrays.asList(q.getItem().getId(), q.getType().name()));
        }
        return out;
    }

    /** The lesson presentation's item: {@code {item: id | null, index}} (index in the session's item list, -1 if none). */
    private Map<String, Object> presentation() throws Exception {
        final SessionItem item = (SessionItem) getField(session, "currentItem");
        return obj("item", item == null ? null : item.getId(), "index", item == null ? -1 : session.getItems().indexOf(item),
                "storedItemId", db.propertiesDao().getCurrentItemId());
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> state() throws Exception {
        final Question current = session.getCurrentQuestion();
        final List<Object> items = new ArrayList<>();
        for (final SessionItem item: session.getItems()) {
            items.add(obj("id", item.getId(), "state", item.getState().name(), "order", item.getOrder(),
                    "bucket", item.getBucket(), "choiceDelay", item.getChoiceDelay(), "numAnswers", item.getNumAnswers(),
                    "lastAnswer", item.getLastAnswer(), "done", slots(item, true), "incorrect", slots(item, false)));
        }
        final List<Object> dbItems = new ArrayList<>();
        for (final SessionItem item: db.sessionItemDao().getAll()) {
            dbItems.add(obj("id", item.getId(), "state", item.getState().name(), "done", slots(item, true),
                    "incorrect", slots(item, false), "numAnswers", item.getNumAnswers(), "lastAnswer", item.getLastAnswer()));
        }
        return obj(
                "type", session.getType().name(),
                "state", ((SessionState) getField(session, "state")).name(),
                "delayed", session.isDelayed(),
                "answered", session.isAnswered(),
                "correct", session.isCorrect(),
                "canUndo", session.canUndo(),
                "canBeWrappedUp", session.canBeWrappedUp(),
                "progressText", session.getProgressText(),
                "current", current == null ? null : Arrays.asList(current.getItem().getId(), current.getType().name()),
                "reason", session.getQuestionChoiceReason().name(),
                "queue", questionList((List<Question>) getField(session, "questions")),
                "history", questionList((Deque<Question>) getField(session, "history")),
                "items", items,
                "db", obj("sessionType", db.propertiesDao().getSessionType().name(), "items", dbItems));
    }
}
