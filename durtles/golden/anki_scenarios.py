# Anki mode scenarios (self-graded answers: the sessionAnswer kinds ankiCorrect / ankiIncorrect and sessionAnkiButton
# of SessionDriver). Imported by make_scenarios.py, which writes every definition.

def add(S, lvl):
    r1, k1 = lvl(1, "radical"), lvl(1, "kanji")
    due = lambda ids, stage=4: [{"id": i, "stage": stage} for i in ids]
    ANKI_REVIEW = {"enable_advanced": True, "anki_mode_review_meaning": True, "anki_mode_review_reading": True}

    S["anki-review"] = {
      "description": "Review session in Anki mode for meanings and readings (2 radicals, 2 kanji at Apprentice IV, due): the first answer is self-graded Correct, then Incorrect is pressed on the already answered question (ignored); one radical and one kanji reading are graded Incorrect once, so those items drop a stage exactly like a typed wrong answer; every finished item is reported at once with its answer time; the revealed answer text is listed per answer (ankiAnswer).",
      "mode": "WANIKANI",
      "start": {"generate": {"userLevel": 1, "rows": due(r1[:2] + k1[:2])}},
      "steps": [
        {"action": "sessionStart", "type": "REVIEW", "where": {}, "settings": ANKI_REVIEW},
        {"action": "sessionAnswer", "answer": "ankiCorrect", "advance": False},
        {"action": "sessionAnkiButton", "button": "incorrect"},
        {"action": "sessionAdvance"},
        {"action": "sessionAnswer", "until": "finishing", "spacingSeconds": 5, "answer": "ankiCorrect",
         "rules": {str(r1[0]): ["ankiIncorrect"], str(k1[0]) + ":reading": ["ankiIncorrect"]}},
        {"action": "sessionFinish"}]}

    S["anki-review-meaning-only"] = {
      "description": "Anki mode for review meanings only (anki_mode_review_meaning): 2 kanji at Apprentice IV; meanings are self-graded (one Incorrect), readings are typed (one wrong); ankiMode is true on every meaning answer; both wrong items drop a stage.",
      "mode": "WANIKANI",
      "start": {"generate": {"userLevel": 1, "rows": due(k1[:2])}},
      "steps": [
        {"action": "sessionStart", "type": "REVIEW", "ids": k1[:2],
         "settings": {"enable_advanced": True, "anki_mode_review_meaning": True}},
        {"action": "sessionAnswer", "until": "finishing", "spacingSeconds": 5,
         "rules": {str(k1[0]) + ":meaning": ["ankiIncorrect", "ankiCorrect"], "meaning": ["ankiCorrect", "ankiCorrect"],
                   str(k1[1]) + ":reading": ["wrong", "correct"]}},
        {"action": "sessionFinish"}]}

    S["anki-review-advanced-off"] = {
      "description": "The Anki review settings are on but Advanced settings are off (enable_advanced false, the pinned default): GlobalSettings.getAnkiMode is false, so the session shows the typing screen (ankiMode false on the one self-graded answer, which the session still accepts).",
      "mode": "WANIKANI",
      "start": {"generate": {"userLevel": 1, "rows": due(r1[:1])}},
      "steps": [
        {"action": "sessionStart", "type": "REVIEW", "where": {},
         "settings": {"anki_mode_review_meaning": True, "anki_mode_review_reading": True}},
        {"action": "sessionAnswer", "answer": "ankiCorrect"},
        {"action": "sessionFinish"}]}

    S["anki-lesson-quiz"] = {
      "description": "Fresh start, lesson session (5 level 1 radicals) with Anki mode for lesson meanings: the quiz's first answer is graded Incorrect (re-queued, as with typing), the rest Correct; each finished radical is reported as a lesson at once.",
      "mode": "WANIKANI", "start": None,
      "steps": [
        {"action": "sessionStart", "type": "LESSON", "where": {},
         "settings": {"enable_advanced": True, "anki_mode_lesson_meaning": True}},
        {"action": "sessionStartQuiz", "advanceSeconds": 120},
        {"action": "sessionAnswer", "until": "finishing", "spacingSeconds": 6, "answer": "ankiCorrect",
         "rules": {"meaning": ["ankiIncorrect"]}},
        {"action": "sessionFinish"}]}

    S["anki-self-study"] = {
      "description": "Self-study of 3 level 1 kanji at Guru in Anki mode (self-study meaning and reading): one meaning graded Incorrect; self-study is delayed, so Finish reports all three as SELF_STUDY with their answer times and SRS stages do not change.",
      "mode": "WANIKANI",
      "start": {"generate": {"userLevel": 2, "levels": [1], "objects": ["kanji"], "stage": 5}},
      "steps": [
        {"action": "sessionStart", "type": "SELF_STUDY", "ids": k1[:3], "atHours": 1,
         "settings": {"enable_advanced": True, "anki_mode_self_study_meaning": True,
                      "anki_mode_self_study_reading": True}},
        {"action": "sessionAnswer", "until": "finishing", "spacingSeconds": 7, "answer": "ankiCorrect",
         "rules": {str(k1[1]) + ":meaning": ["ankiIncorrect"]}},
        {"action": "sessionFinish", "advanceSeconds": 120}]}

    S["anki-test-mode"] = {
      "description": "Fixed leftover developer code: the hidden Test mode switch (test_mode, TestActivity) used to turn an item's first Correct in Anki mode into Incorrect. With it on, 2 radicals in review: every Correct now counts as correct and each item goes up a stage.",
      "mode": "WANIKANI",
      "start": {"generate": {"userLevel": 1, "rows": due(r1[:2])}},
      "steps": [
        {"action": "sessionStart", "type": "REVIEW", "where": {},
         "settings": {"enable_advanced": True, "anki_mode_review_meaning": True, "test_mode": True}},
        {"action": "sessionAnswer", "until": "finishing", "spacingSeconds": 5, "answer": "ankiCorrect"},
        {"action": "sessionFinish"}]}

    # Randomized inflections (review_randomize_inflections / self_study_randomize_inflections, advanced only, never in
    # lessons): a verb or adjective question shows an inflected form (Question.getCharacters, recorded per answer as
    # "characters") and the revealed answer names it. The pick (InflectionUtil, Math.random() in the app) comes from the
    # base reset's new Random(seed) through InflectionUtil.setRandomSourceForTesting, once per Question object.
    # 2480 入る godan, 2586 立つ godan (つ), 2490 上げる ichidan, 2499 大きい い adj, 2502 大人 (noun, な adj: the first
    # inflecting part of speech), 2501 大した ("adjective": no inflection), 9180 する (kana-only, する verb), 9219 サービス
    # (kana-only, noun + する verb: no する ending), 3174 運転する (する verb), 440 一 (kanji: no parts of speech).
    # Settings on top of BASE (every advanced session setting removed), so the device's own preferences don't leak in.
    from session_order_scenarios import BASE
    INFL = [2480, 2586, 2490, 2499, 2502, 2501, 9180, 9219, 3174, 440]
    S["anki-randomize-inflections-review"] = {
      "description": "Review session in Anki mode with randomized inflections (review_randomize_inflections): 10 subjects due at Apprentice IV (godan, ichidan and する verbs, い and な adjectives, a plain adjective, kana-only する verbs, a kanji); every answer lists the characters shown (inflected for verbs and adjectives) and the revealed answer with the form appended. The pick happens once per question: a question graded Incorrect comes back with the same form, the meaning and reading questions of one subject pick separately.",
      "mode": "WANIKANI", "exportMode": "delta", "seed": 5,
      "start": {"generate": {"userLevel": 10, "rows": due(INFL)}},
      "steps": [
        {"action": "sessionStart", "type": "REVIEW", "ids": INFL,
         "settings": dict(BASE, review_randomize_inflections=True, anki_mode_review_meaning=True,
                          anki_mode_review_reading=True)},
        {"action": "sessionAnswer", "until": "finishing", "spacingSeconds": 5, "answer": "ankiCorrect",
         "rules": {"2480:meaning": ["ankiIncorrect"], "2499:reading": ["ankiIncorrect"], "3174:meaning": ["ankiIncorrect"]}},
        {"action": "sessionFinish"}]}

    S["anki-randomize-inflections-self-study"] = {
      "description": "Self-study with randomized inflections (self_study_randomize_inflections) and typed answers (no Anki mode): the same 10 subjects at Guru; the shown characters are inflected, the typed answers are still checked against the dictionary form. Meaning questions first (readings skipped, Skip keeps the question and its form), one wrong answer (the question keeps its form when asked again), then a restart: the reloaded questions are new objects and pick again; the rest is answered.",
      "mode": "WANIKANI", "exportMode": "delta", "seed": 9,
      "start": {"generate": {"userLevel": 10, "rows": due(INFL, 5)}},
      "steps": [
        {"action": "sessionStart", "type": "SELF_STUDY", "ids": INFL, "atHours": 1,
         "settings": dict(BASE, self_study_randomize_inflections=True)},
        {"action": "sessionAnswer", "only": "meaning", "count": 6, "spacingSeconds": 5,
         "rules": {"2490:meaning": ["wrong", "correct"]}},
        {"action": "sessionRestart", "advanceSeconds": 60},
        {"action": "sessionAnswer", "until": "finishing", "spacingSeconds": 5},
        {"action": "sessionFinish", "advanceSeconds": 60}]}

    S["anki-randomize-inflections-off"] = {
      "description": "Randomized inflections where they don't apply: with enable_advanced off the review setting is ignored (no characters listed, the plain answer); a lesson session never inflects (lessons have no such setting), even with both other settings on.",
      "mode": "WANIKANI", "exportMode": "delta",
      "start": {"generate": {"userLevel": 10, "rows": due([2480, 2499]) + [{"id": 2490, "stage": 0}, {"id": 2515, "stage": 0}]}},
      "steps": [
        {"action": "sessionStart", "type": "REVIEW", "ids": [2480, 2499],
         "settings": dict(BASE, enable_advanced=False, review_randomize_inflections=True, anki_mode_review_meaning=True)},
        {"action": "sessionAnswer", "until": "finishing", "spacingSeconds": 5, "answer": "ankiCorrect"},
        {"action": "sessionFinish"},
        {"action": "sessionStart", "type": "LESSON", "ids": [2490, 2515],
         "settings": dict(BASE, review_randomize_inflections=True, self_study_randomize_inflections=True,
                          lesson_randomize_inflections=True, anki_mode_lesson_meaning=True,
                          anki_mode_lesson_reading=True)},
        {"action": "sessionStartQuiz", "advanceSeconds": 60},
        {"action": "sessionAnswer", "until": "finishing", "spacingSeconds": 5, "answer": "ankiCorrect"},
        {"action": "sessionFinish"}]}
