# Session scenarios (the session* actions of SessionDriver): undo and ignore, wrap-up, leaving and abandoning,
# self-study, the level test's self-study session. Imported by make_scenarios.py, which writes every definition.

def add(S, lvl):
    r1, k1, v1 = lvl(1, "radical"), lvl(1, "kanji"), lvl(1, "vocabulary")
    due = lambda ids, stage=4: [{"id": i, "stage": stage} for i in ids]
    DELAY = {"delay_result_upload": True}

    S["session-ignore-after-wrong"] = {
      "description": "Review session (2 radicals, 2 kanji at Apprentice IV, due): the first answer is wrong and Ignore (special button UNDO_AND_MARK_CORRECT) turns it into a correct one, so that item is reported without a penalty; a later wrong answer is advanced past first, after which Ignore is not offered (canShow false) and the item drops a stage; the rest is answered right.",
      "mode": "WANIKANI",
      "start": {"generate": {"userLevel": 1, "rows": due(r1[:2] + k1[:2])}},
      "steps": [
        {"action": "sessionStart", "type": "REVIEW", "where": {}},
        {"action": "sessionAnswer", "answer": "wrong", "advance": False},
        {"action": "sessionButton", "button": "UNDO_AND_MARK_CORRECT"},
        {"action": "sessionAdvance"},
        {"action": "sessionAnswer", "answer": "wrong", "advance": False, "advanceSeconds": 5},
        {"action": "sessionAdvance"},
        {"action": "sessionButton", "button": "UNDO_AND_MARK_CORRECT"},
        {"action": "sessionAnswer", "until": "finishing", "spacingSeconds": 5},
        {"action": "sessionFinish"}]}

    S["session-undo-delayed"] = {
      "description": "Review session with \"delay result upload\" on (3 radicals, 1 kanji): finished items stay PENDING, so Undo (UNDO_AND_RETRY_NOW) can go back three answers in a row, turning PENDING items ACTIVE again; one re-asked answer is wrong; nothing is reported until Finish, which reports every PENDING item with its own answer time (lastAnswer) 60 s later.",
      "mode": "WANIKANI",
      "start": {"generate": {"userLevel": 1, "rows": due(r1[:3] + k1[:1])}},
      "steps": [
        {"action": "sessionStart", "type": "REVIEW", "where": {}, "settings": DELAY},
        {"action": "sessionAnswer", "count": 4, "spacingSeconds": 10},
        {"action": "sessionButton", "button": "UNDO_AND_RETRY_NOW", "count": 3, "advanceSeconds": 10},
        {"action": "sessionAnswer", "answer": "wrong", "advanceSeconds": 10},
        {"action": "sessionAnswer", "until": "finishing", "spacingSeconds": 10, "advanceSeconds": 10},
        {"action": "sessionFinish", "advanceSeconds": 60}]}

    S["session-undo-immediate"] = {
      "description": "Review session of 3 radicals without delayed reporting: a finished item is reported at once, so after advancing past it Undo is not offered (canUndo false); Undo right after a wrong answer (still on the question) takes the wrong answer back in place and the retry is right.",
      "mode": "WANIKANI",
      "start": {"generate": {"userLevel": 1, "rows": due(r1[:3])}},
      "steps": [
        {"action": "sessionStart", "type": "REVIEW", "where": {}},
        {"action": "sessionAnswer", "count": 1},
        {"action": "sessionButton", "button": "UNDO_AND_RETRY_NOW"},
        {"action": "sessionAnswer", "answer": "wrong", "advance": False, "advanceSeconds": 10},
        {"action": "sessionButton", "button": "UNDO_AND_RETRY_NOW"},
        {"action": "sessionAnswer", "until": "finishing", "spacingSeconds": 10},
        {"action": "sessionButton", "button": "UNDO_AND_PUT_BACK"},
        {"action": "sessionFinish"}]}

    S["session-wrapup-mid-session"] = {
      "description": "Review session of 8 items (4 radicals, 4 kanji): three answers, then Wrap up: every item without an answer is ABANDONED (AbandonSessionItemJob) and stays due, started items stay; the progress text gets \"Wrapup: \"; answering the rest finishes the session.",
      "mode": "WANIKANI",
      "start": {"generate": {"userLevel": 1, "rows": due(r1[:4] + k1[:4])}},
      "steps": [
        {"action": "sessionStart", "type": "REVIEW", "where": {}},
        {"action": "sessionAnswer", "count": 3, "spacingSeconds": 5, "rules": {"reading": ["wrong"]}},
        {"action": "sessionWrapUp"},
        {"action": "sessionAnswer", "until": "finishing", "spacingSeconds": 5},
        {"action": "sessionFinish"}]}

    S["session-leave-half-answered"] = {
      "description": "Review session of 2 kanji: both meanings answered (the second one wrong; reading questions are skipped), then the app process restarts (Session.load reads session_item back: meanings stay done, the undo history is gone); the first kanji's reading finishes and reports it; abandoning reports nothing for the second, half-answered kanji, which stays due with its old stage; a new session for it starts from scratch.",
      "mode": "WANIKANI",
      "start": {"generate": {"userLevel": 1, "rows": due(k1[:2])}},
      "steps": [
        {"action": "sessionStart", "type": "REVIEW", "ids": k1[:2]},
        {"action": "sessionAnswer", "only": "meaning", "count": 2, "spacingSeconds": 5,
         "rules": {str(k1[1]) + ":meaning": ["wrong"]}},
        {"action": "sessionRestart", "advanceSeconds": 300},
        {"action": "sessionAnswer", "only": str(k1[0]) + ":reading", "count": 1},
        {"action": "sessionAbandon"},
        {"action": "sessionStart", "type": "REVIEW", "where": {}, "advanceSeconds": 60},
        {"action": "sessionAnswer", "until": "finishing", "spacingSeconds": 5},
        {"action": "sessionFinish"}]}

    S["session-delayed-abandon"] = {
      "description": "Delayed reporting: two radicals answered (PENDING) and a kanji half answered, then the session is abandoned: nothing is reported, all three stay due; the abandon also forgets the one not started.",
      "mode": "WANIKANI",
      "start": {"generate": {"userLevel": 1, "rows": due(r1[:3] + k1[:1])}},
      "steps": [
        {"action": "sessionStart", "type": "REVIEW", "ids": r1[:3] + k1[:1], "settings": DELAY},
        {"action": "sessionAnswer", "count": 3, "spacingSeconds": 5},
        {"action": "sessionAbandon"}]}

    S["session-self-study-guru"] = {
      "description": "Self-study of 4 level 1 kanji at Guru (not due for 100 h) and 2 radicals: one reading and (after the Undo) one meaning wrong; Undo works after advancing (self-study is always delayed); Finish reports every item as SELF_STUDY with its own answer time: SRS stages, availableAt and the review statistics do not change, but a wrong item's lastIncorrectAnswer is set to its answer time.",
      "mode": "WANIKANI",
      "start": {"generate": {"userLevel": 2, "levels": [1], "objects": ["radical", "kanji"], "stage": 5}},
      "steps": [
        {"action": "sessionStart", "type": "SELF_STUDY", "ids": k1[:4] + r1[:2], "atHours": 1},
        {"action": "sessionAnswer", "count": 4, "spacingSeconds": 7,
         "rules": {str(k1[0]) + ":meaning": ["wrong"], str(k1[1]) + ":reading": ["wrong"]}},
        {"action": "sessionButton", "button": "UNDO_AND_RETRY_NOW"},
        {"action": "sessionAnswer", "until": "finishing", "spacingSeconds": 7,
         "rules": {str(k1[0]) + ":meaning": ["wrong"]}},
        {"action": "sessionFinish", "advanceSeconds": 120}]}

    S["session-self-study-level-test"] = {
      "description": "Level test round 1 as the app runs it: LevelTest.startRound1 picks the kanji and a self-study session starts; the first two kanji are answered wrong once: during a level-test round one wrong answer removes the kanji's remaining questions (no retry); Finish records the round (ROUND1_DONE). Then an ordinary self-study session with the same kind of wrong answer: the question comes back later and the item still finishes.",
      "mode": "JLPT", "seed": 23, "start": None,
      "steps": [
        {"action": "sessionStart", "type": "SELF_STUDY", "levelTestRound": 1},
        {"action": "sessionAnswer", "count": 2, "answer": "wrong"},
        {"action": "sessionAnswer", "until": "finishing"},
        {"action": "sessionFinish"},
        {"action": "sessionStart", "type": "SELF_STUDY", "ids": k1[:3]},
        {"action": "sessionAnswer", "count": 2, "answer": "wrong"},
        {"action": "sessionAnswer", "until": "finishing"},
        {"action": "sessionFinish"}]}

    S["session-level-test-restart"] = {
      "description": "Level test round 1 interrupted by an app restart after 10 answers: the session comes back from session_item, but LevelTest's in-memory round flag is gone, so the finished session behaves like ordinary self-study (wrong kanji are asked again) and the round is not recorded: the status stays ROUND1.",
      "mode": "JLPT", "seed": 29, "start": None,
      "steps": [
        {"action": "sessionStart", "type": "SELF_STUDY", "levelTestRound": 1},
        {"action": "sessionAnswer", "count": 10, "rules": {"meaning": ["wrong"]}},
        {"action": "sessionRestart"},
        {"action": "sessionAnswer", "count": 2, "answer": "wrong"},
        {"action": "sessionAnswer", "until": "finishing"},
        {"action": "sessionFinish"}]}

    S["session-lesson-quiz-abandon"] = {
      "description": "Fresh start: a lesson session (5 level 1 radicals, the default size) goes from presentation to the quiz; 3 answers (the first wrong, which only re-queues it; each finished radical is reported as a lesson at once), then Abandon: the other radicals, the wrongly answered one included, stay lessons. A second lesson session wrapped up during the presentation just ends (nothing reported).",
      "mode": "WANIKANI", "start": None,
      "steps": [
        {"action": "sessionStart", "type": "LESSON", "where": {}},
        {"action": "sessionStartQuiz", "advanceSeconds": 120},
        {"action": "sessionAnswer", "count": 3, "spacingSeconds": 6, "rules": {"meaning": ["wrong"]}},
        {"action": "sessionAbandon"},
        {"action": "sessionStart", "type": "LESSON", "where": {}, "advanceSeconds": 60},
        {"action": "sessionWrapUp"}]}
