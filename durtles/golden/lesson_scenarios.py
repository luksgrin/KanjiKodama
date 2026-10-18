# Lesson quiz scenarios (SessionDriver): going back to the lesson presentation, wrong answers in a lesson quiz, and the
# single-kanji "matching kanji" retry. Imported by make_scenarios.py, which writes every definition.

def add(S, lvl):
    r1, k1 = lvl(1, "radical"), lvl(1, "kanji")
    due = lambda ids, stage=4: [{"id": i, "stage": stage} for i in ids]
    ADV = {"enable_advanced": True}
    # Level 1 single-kanji vocabulary and their kanji (SubjectDao.getKanjiByCharacters).
    V_HITO, K_HITO = 2475, 444    # 人: vocab ひと; kanji にん, じん (accepted), ひと, と (not accepted)
    V_KUCHI = 2497                # 口: vocab くち; kanji こう, く, くち
    V_ICHI = 2467                 # 一: vocab いち = the kanji's own primary reading
    V_YAMA = 2504                 # 山: vocab やま; kanji さん, やま
    V_CHIKARA = 2484              # 力: vocab ちから; kanji りょく, りき, ちから
    V_UE = 2489                   # 上: vocab うえ; kanji じょう, ...
    V_SHITA, K_SHITA = 2493, 451  # 下: vocab した; kanji か, げ, ...
    assert V_HITO in lvl(1, "vocabulary") and K_HITO in k1 and K_SHITA in k1

    S["session-lesson-back-to-presentation"] = {
      "description": "Fresh start: a lesson session of 5 radicals. The presentation's next/previous buttons move through the items (next stops at the last one; each move stores the item for a restart). After two quiz answers (the first wrong) the menu's \"Back to lesson presentation\" (visible: LESSON and ACTIVE) opens on the item being quizzed and stores it (KanjiKodama fix; it used to show the last item and store nothing); the quiz progress stays (the finished radical stays REPORTED and is still shown in the presentation, the wrong one keeps its incorrect count and stays queued); next and previous move from there. Starting the quiz again continues where it was, until Finish; the wrong radical's lesson report carries its incorrect count.",
      "mode": "WANIKANI", "start": None,
      "steps": [
        {"action": "sessionStart", "type": "LESSON", "where": {}},
        {"action": "sessionInspect"},
        {"action": "sessionPresentationNext", "count": 2},
        {"action": "sessionPresentationPrevious"},
        {"action": "sessionPresentationNext", "count": 10},
        {"action": "sessionStartQuiz", "advanceSeconds": 120},
        {"action": "sessionAnswer", "count": 2, "spacingSeconds": 6, "rules": {"meaning": ["wrong"]}},
        {"action": "sessionBackToPresentation", "advanceSeconds": 30},
        {"action": "sessionPresentationNext"},
        {"action": "sessionPresentationPrevious", "count": 2},
        {"action": "sessionStartQuiz", "advanceSeconds": 30},
        {"action": "sessionAnswer", "until": "finishing", "spacingSeconds": 6},
        {"action": "sessionFinish"}]}

    S["session-lesson-back-answer-on-screen"] = {
      "description": "Lesson quiz of 5 radicals: \"Back to lesson presentation\" while an answer is still on screen (answered, Next not pressed). KanjiKodama fix: the answer is taken as if Next had been pressed (Session.advance), so the finished radical leaves the queue and is reported once (it used to be asked again and reported a second time), and a wrong answer gets its choice delay and undo entry. Back with the session's last answer on screen finishes the session as Next would (the presentation is not shown).",
      "mode": "WANIKANI", "start": None,
      "steps": [
        {"action": "sessionStart", "type": "LESSON", "where": {}},
        {"action": "sessionStartQuiz", "advanceSeconds": 60},
        {"action": "sessionAnswer", "advance": False},
        {"action": "sessionBackToPresentation", "advanceSeconds": 10},
        {"action": "sessionStartQuiz", "advanceSeconds": 10},
        {"action": "sessionAnswer", "count": 1, "spacingSeconds": 5},
        {"action": "sessionAnswer", "answer": "wrong", "advance": False, "advanceSeconds": 5},
        {"action": "sessionBackToPresentation", "advanceSeconds": 10},
        {"action": "sessionStartQuiz", "advanceSeconds": 10},
        {"action": "sessionAnswer", "count": 2, "spacingSeconds": 5},
        {"action": "sessionAnswer", "advance": False, "advanceSeconds": 5},
        {"action": "sessionBackToPresentation", "advanceSeconds": 10},
        {"action": "sessionFinish"},
        {"action": "snapshot"}]}

    S["session-lesson-back-restart"] = {
      "description": "App restarts around the lesson presentation (5 radicals). Session.load reloads only items that are not yet reported and opens the presentation while none of them is started, on the stored item: a restart during the presentation comes back on the item the next button stored; after one radical is finished (reported) and Back to presentation, a restart opens the presentation again on the stored item, the one Back showed (Back now opens on the quizzed item and stores it); after a wrong answer (an item started) and Back, a restart resumes the quiz.",
      "mode": "WANIKANI", "start": None,
      "steps": [
        {"action": "sessionStart", "type": "LESSON", "where": {}},
        {"action": "sessionPresentationNext", "count": 2},
        {"action": "sessionRestart", "advanceSeconds": 60},
        {"action": "sessionInspect"},
        {"action": "sessionStartQuiz", "advanceSeconds": 60},
        {"action": "sessionAnswer", "count": 1},
        {"action": "sessionBackToPresentation"},
        {"action": "sessionRestart", "advanceSeconds": 60},
        {"action": "sessionInspect"},
        {"action": "sessionStartQuiz", "advanceSeconds": 10},
        {"action": "sessionAnswer", "count": 1, "answer": "wrong"},
        {"action": "sessionBackToPresentation"},
        {"action": "sessionRestart", "advanceSeconds": 60},
        {"action": "sessionInspect"},
        {"action": "sessionAnswer", "until": "finishing", "spacingSeconds": 5},
        {"action": "sessionFinish"}]}

    S["session-lesson-wrong-answers"] = {
      "description": "Lesson quiz of 3 level 1 kanji and the vocabulary 人 (radicals at Guru): two wrong meanings on 一, Don't know on 二's reading, the not-accepted kanji reading ひと on 人 (a retry: shake, nothing counted), the kanji reading にん on the vocabulary 人 (wrong: advanced settings are off, so no matching kanji), the rest right. Wrong answers only re-queue the question (choice delay 3); each item is reported as a lesson once all its questions are done, with its incorrect counts; the snapshot after Finish shows every one at Apprentice I with no review statistics, but lastIncorrectAnswer is set for the items with a wrong answer (not for the retry).",
      "mode": "WANIKANI",
      "start": {"generate": {"userLevel": 1, "levels": [1], "objects": ["radical"], "stage": 5,
                "rows": [{"id": i, "stage": 0} for i in (k1[0], k1[1], K_HITO, V_HITO)]}},
      "steps": [
        {"action": "sessionStart", "type": "LESSON", "ids": [k1[0], k1[1], K_HITO, V_HITO]},
        {"action": "sessionStartQuiz", "advanceSeconds": 120},
        {"action": "sessionAnswer", "until": "finishing", "spacingSeconds": 6, "rules": {
            str(k1[0]) + ":meaning": ["wrong", "wrong"], str(k1[1]) + ":reading": ["dontKnow"],
            str(K_HITO) + ":reading": [{"text": "ひと"}], str(V_HITO) + ":reading": [{"text": "にん"}]}},
        {"action": "sessionFinish", "advanceSeconds": 30},
        {"action": "snapshot"}]}

    S["session-matching-kanji"] = {
      "description": "Single-kanji vocabulary in reviews (level 1 at Guru, 7 vocabulary due at Apprentice IV). With advanced settings on (shake_on_matching_kanji defaults to true): a reading of the vocabulary's kanji, accepted or not (人: にん, と; 口: こう; 山: さん), is a retry (shake, no incorrect count, the question stays on screen) any number of times; 一's いち is the vocabulary's own reading (correct); an unrelated reading is wrong. The same kind of answer is wrong with the setting off (力: りょく), with advanced settings off (上: じょう, the setting is ignored), and when the kanji is hidden (下: か, getKanjiByCharacters only finds visible kanji).",
      "mode": "WANIKANI",
      "start": {"generate": {"userLevel": 1, "levels": [1], "stage": 5,
                "rows": due([V_HITO, V_KUCHI, V_ICHI, V_YAMA, V_CHIKARA, V_UE, V_SHITA])}},
      "steps": [
        {"action": "sessionStart", "type": "REVIEW", "ids": [V_HITO, V_KUCHI, V_ICHI, V_YAMA], "settings": ADV},
        {"action": "sessionAnswer", "until": "finishing", "spacingSeconds": 5, "rules": {
            str(V_HITO) + ":reading": [{"text": "にん"}, {"text": "と"}, {"text": "にん"}, "correct"],
            str(V_KUCHI) + ":reading": [{"text": "こう"}, "correct"],
            str(V_ICHI) + ":reading": [{"text": "いち"}],
            str(V_YAMA) + ":reading": ["wrong", {"text": "さん"}, "correct"]}},
        {"action": "sessionFinish"},
        {"action": "sessionStart", "type": "REVIEW", "ids": [V_CHIKARA],
         "settings": {"enable_advanced": True, "shake_on_matching_kanji": False}},
        {"action": "sessionAnswer", "until": "finishing", "spacingSeconds": 5,
         "rules": {"reading": [{"text": "りょく"}, "correct"]}},
        {"action": "sessionFinish"},
        {"action": "sessionStart", "type": "REVIEW", "ids": [V_UE], "settings": {"shake_on_matching_kanji": True}},
        {"action": "sessionAnswer", "until": "finishing", "spacingSeconds": 5,
         "rules": {"reading": [{"text": "じょう"}, "correct"]}},
        {"action": "sessionFinish"},
        {"action": "hideSubject", "ids": [K_SHITA]},
        {"action": "sessionStart", "type": "REVIEW", "ids": [V_SHITA], "settings": ADV},
        {"action": "sessionAnswer", "until": "finishing", "spacingSeconds": 5,
         "rules": {"reading": [{"text": "か"}, "correct"]}},
        {"action": "sessionFinish"},
        {"action": "unhideSubject", "ids": "changed"}]}
