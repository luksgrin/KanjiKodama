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
      "description": "Leftover developer code: with the hidden Test mode switch on (test_mode, TestActivity), Anki mode's Correct button counts as Incorrect while the item has no wrong answer yet. 2 radicals in review: each first Correct is recorded as wrong (the item drops a stage), the second Correct counts.",
      "mode": "WANIKANI",
      "start": {"generate": {"userLevel": 1, "rows": due(r1[:2])}},
      "steps": [
        {"action": "sessionStart", "type": "REVIEW", "where": {},
         "settings": {"enable_advanced": True, "anki_mode_review_meaning": True, "test_mode": True}},
        {"action": "sessionAnswer", "until": "finishing", "spacingSeconds": 5, "answer": "ankiCorrect"},
        {"action": "sessionFinish"}]}
