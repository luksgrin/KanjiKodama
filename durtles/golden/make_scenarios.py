import json, sqlite3, sys, os
# Writes the Tier B scenario definitions (the JSON files are the source of truth once written).
HERE = os.path.dirname(os.path.abspath(__file__))
DB = os.path.join(HERE, "..", "app", "src", "main", "assets", "wk-content.db")
OUT = os.path.join(HERE, "..", "app", "src", "androidTest", "assets", "golden-scenarios")
con = sqlite3.connect(DB)
def ids(q, *a): return [r[0] for r in con.execute(q, a)]
def lvl(level, obj): return ids("select id from subject where level=? and object=? and hiddenAt=0 order by lessonPosition, id", level, obj)

def iso(ms):
    import datetime
    return datetime.datetime.fromtimestamp(ms/1000, datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f") + "Z"
T0 = 1767604620000; H = 3600000

def api(level_user, entries, stats=(), materials=(), levels=()):
    """entries: (subject_id, type, stage, passed, burned)"""
    a = []
    for i, (sid, typ, stage, passed, burned) in enumerate(entries):
        unl = T0 - 900*H; st = T0 - 890*H if stage > 0 else None
        a.append({"id": 5000000 + i, "object": "assignment", "data": {
            "subject_id": sid, "subject_type": typ, "srs_stage": stage,
            "unlocked_at": iso(unl), "started_at": iso(st) if st else None,
            "passed_at": iso(T0 - 500*H) if passed else None,
            "burned_at": iso(T0 - 100*H) if burned else None,
            "available_at": None if (stage == 0 or stage == 9) else iso(T0 - T0 % H + (stage * 7 - 20) * H),
            "resurrected_at": None, "hidden": False}})
    s = [{"id": 6000000 + i, "object": "review_statistic", "data": d} for i, d in enumerate(stats)]
    m = [{"id": 7000000 + i, "object": "study_material", "data": d} for i, d in enumerate(materials)]
    lp = [{"id": 8000000 + i, "object": "level_progression", "data": d} for i, d in enumerate(levels)]
    return {"user": {"level": level_user, "username": "golden-user", "max_level_granted_by_subscription": 60},
            "assignments": a, "review_statistics": s, "study_materials": m, "level_progressions": lp}

def level_entries(level, stage, passed):
    out = []
    for obj, typ in (("radical", "radical"), ("kanji", "kanji"), ("vocabulary", "vocabulary"), ("kana_vocabulary", "kana_vocabulary")):
        for sid in lvl(level, obj):
            out.append((sid, typ, stage, passed, False))
    return out

r1, k1, v1 = lvl(1, "radical"), lvl(1, "kanji"), lvl(1, "vocabulary")
k4 = lvl(4, "kanji")
assert len(k4) == 40 and len(k1) == 18

S = {}
S["wk-fresh-start"] = {
  "description": "Fresh start in WaniKani order: level 1 radicals are the only lessons; five lessons, an early review attempt (nothing due), reviews with one meaning slip, the remaining lessons, then the clock moves on.",
  "mode": "WANIKANI", "start": None,
  "steps": [
    {"action": "snapshot"},
    {"action": "lesson", "where": {"object": "radical", "limit": 5}},
    {"action": "review", "advanceHours": 1, "where": {}},
    {"action": "review", "advanceHours": 1.5, "where": {}, "wrong": {"6": [1, 0]}},
    {"action": "lesson", "where": {}},
    {"action": "advance", "advanceHours": 30}]}
S["wk-grind-level1-to-level2"] = {
  "description": "Fresh start, every lesson taken and every review answered right as soon as it is due, until level 2: radicals unlock kanji, kanji unlock vocabulary, the level-up unlocks level 2 including its kana-only vocabulary.",
  "mode": "WANIKANI", "start": None,
  "steps": [
    {"action": "grind", "until": {"level": 2}},
    {"action": "lesson", "where": {"object": ["kana_vocabulary"]}}]}
S["wk-levelup-threshold-level1"] = {
  "description": "Level 1 has 18 kanji, so the level-up needs ceil(16.2) = 17 passed. 16 passed: no level-up; a wrong answer on the 17th keeps it; the right answer on the other one levels up.",
  "mode": "WANIKANI",
  "start": {"generate": {"userLevel": 1, "levels": [1], "objects": ["radical"], "stage": 5,
            "rows": [{"id": k, "stage": 5} for k in k1[:16]] + [{"id": k1[16], "stage": 4}, {"id": k1[17], "stage": 4}]}},
  "steps": [
    {"action": "snapshot"},
    {"action": "review", "ids": [k1[16]], "meaningWrong": 1},
    {"action": "review", "ids": [k1[17]]},
    {"action": "lesson", "where": {"level": 2, "object": "radical", "limit": 3}}]}
S["wk-levelup-exactly-90-percent"] = {
  "description": "Level 4 has 40 kanji: 35 passed (87.5 %) is not enough, the 36th (exactly 90 %) levels up to 5. Levels 1 to 4 are otherwise at Guru.",
  "mode": "WANIKANI",
  "start": {"generate": {"userLevel": 4, "levels": [1, 2, 3, 4], "stage": 5,
            "rows": [{"id": k4[35], "stage": 4}] + [{"id": k, "stage": 1, "availableInHours": 10} for k in k4[36:]]}},
  "steps": [
    {"action": "snapshot"},
    {"action": "review", "ids": [k4[35]]},
    {"action": "review", "advanceHours": 10, "where": {}, "wrong": {str(k4[36]): [1, 1]}}]}
S["wk-radicals-pass-out-of-order"] = {
  "description": "Kanji 三 needs radicals 一 (1) and 二 (7); 上 and 下 need ト (10) and 一 (1). Radical 7 passes first, then 10, then 1: each kanji unlocks only when its last radical passes.",
  "mode": "WANIKANI", "start": None,
  "steps": [
    {"action": "lesson", "ids": [10, 1, 7]},
    {"action": "grind", "noLessons": True, "reviewsWhere": {"ids": [7]}, "until": {"passed": [7]}},
    {"action": "grind", "noLessons": True, "reviewsWhere": {"ids": [10]}, "until": {"passed": [10]}},
    {"action": "grind", "noLessons": True, "reviewsWhere": {"ids": [1]}, "until": {"passed": [1]}}]}
S["wk-kana-vocabulary"] = {
  "description": "Level 1 fully at Guru: the level-up unlocks level 2; its kana-only vocabulary (no components) is a lesson at once, like the radicals.",
  "mode": "WANIKANI",
  "start": {"generate": {"userLevel": 1, "levels": [1], "stage": 5}},
  "steps": [
    {"action": "snapshot"},
    {"action": "lesson", "where": {"object": "kana_vocabulary"}},
    {"action": "review", "advanceHours": 3, "where": {}}]}
S["wk-hidden-subjects"] = {
  "description": "Levels 1 and 2 at Guru: level 3 opens. Hidden subjects (radicals 58, 59, 70; vocabulary 7668 on level 2 and 7564 on level 3) never unlock and are not lessons.",
  "mode": "WANIKANI",
  "start": {"generate": {"userLevel": 2, "levels": [1, 2], "stage": 5}},
  "steps": [
    {"action": "snapshot"},
    {"action": "lesson", "where": {"level": 3}},
    {"action": "grind", "noLessons": True, "until": {"passed": lvl(3, "radical")}, "maxRounds": 10}]}
S["wk-review-outcomes"] = {
  "description": "Review outcome processing on chosen stages: Apprentice to Guru (passedAt), Enlightened to Burned (burnedAt, no next review), Enlightened dropping, Guru dropping (passedAt kept), meaning and reading slips, streaks and percentage across two rounds.",
  "mode": "WANIKANI",
  "start": {"generate": {"userLevel": 1, "levels": [1], "objects": ["radical"], "stage": 5, "rows": [
      {"id": 1, "stage": 1, "passed": False}, {"id": 440, "stage": 4}, {"id": 441, "stage": 8}, {"id": 442, "stage": 8},
      {"id": 443, "stage": 6}, {"id": 444, "stage": 5}, {"id": 2467, "stage": 2}, {"id": 2468, "stage": 3},
      {"id": 445, "stage": 7, "set": {"meaningCorrect": 10, "meaningIncorrect": 3, "meaningMaxStreak": 7, "meaningCurrentStreak": 2,
                                      "readingCorrect": 9, "readingIncorrect": 1, "readingMaxStreak": 9, "readingCurrentStreak": 9, "percentageCorrect": 82}}]}},
  "steps": [
    {"action": "review", "where": {"ids": [1, 440, 441, 442, 443, 444, 2467, 2468, 445]},
     "wrong": {"1": [1, 0], "442": [1, 0], "443": [2, 3], "444": [0, 1], "2467": [0, 1], "445": [1, 0]}},
    {"action": "review", "advanceHours": 200, "where": {"ids": [1, 440, 442, 443, 444, 2467, 2468, 445]}, "wrong": {"2468": [3, 0]}}]}
S["cur-fresh-wk-to-jlpt"] = {
  "description": "Fresh learner previews and switches to JLPT order: subjects are rewritten into JLPT levels, placement at level 1, JLPT level 1 lessons.",
  "mode": "WANIKANI", "start": None,
  "steps": [
    {"action": "previewCurriculum", "mode": "JLPT"},
    {"action": "switchCurriculum", "mode": "JLPT"},
    {"action": "lesson", "where": {"limit": 10}}]}
S["cur-fresh-jlpt-to-wk"] = {
  "description": "Fresh learner in JLPT order takes a few lessons, then switches back to WaniKani order.",
  "mode": "JLPT", "start": None,
  "steps": [
    {"action": "lesson", "where": {"limit": 6}},
    {"action": "previewCurriculum", "mode": "WANIKANI"},
    {"action": "switchCurriculum", "mode": "WANIKANI"}]}
S["cur-progress-wk-to-jlpt"] = {
  "description": "WaniKani levels 1 to 4 at Guru (user level 5) switches to JLPT order: placement by mastered kanji, backfill kanji become lessons.",
  "mode": "WANIKANI",
  "start": {"generate": {"userLevel": 5, "levels": [1, 2, 3, 4], "stage": 5}},
  "steps": [
    {"action": "previewCurriculum", "mode": "JLPT"},
    {"action": "switchCurriculum", "mode": "JLPT"},
    {"action": "previewCurriculum", "mode": "WANIKANI"}]}
S["cur-progress-jlpt-to-wk"] = {
  "description": "JLPT learner fast-travels 1 level, answers some probation reviews, then switches to WaniKani order (probation and jumps stay in the tables).",
  "mode": "JLPT", "start": None,
  "steps": [
    {"action": "fastTravel", "levels": 1},
    {"action": "review", "advanceHours": 12, "where": {}, "wrongEveryNth": {"n": 3, "meaning": 1, "reading": 1}},
    {"action": "switchCurriculum", "mode": "WANIKANI"},
    {"action": "switchCurriculum", "mode": "JLPT"}]}
S["cur-preview-only"] = {
  "description": "Previews of both orders from a WaniKani learner with levels 1 to 3 at Guru, without switching: nothing changes.",
  "mode": "WANIKANI",
  "start": {"generate": {"userLevel": 4, "levels": [1, 2, 3], "stage": 5}},
  "steps": [
    {"action": "previewCurriculum", "mode": "JLPT"},
    {"action": "previewCurriculum", "mode": "WANIKANI"},
    {"action": "place"}]}
S["cur-switch-after-import"] = {
  "description": "WaniKani import (level 3, levels 1-2 at Guru, level 3 started) in WaniKani order, then switch to JLPT and back.",
  "mode": "WANIKANI", "start": None,
  "steps": [
    {"action": "importWaniKani", "api": api(3, level_entries(1, 5, True) + level_entries(2, 5, True) + [(s, "radical", 2, False, False) for s in lvl(3, "radical")])},
    {"action": "switchCurriculum", "mode": "JLPT"},
    {"action": "switchCurriculum", "mode": "WANIKANI"}]}
S["ft-blocked-wanikani-order"] = {
  "description": "Fast travel status in WaniKani order: blocked with the hint to switch order.",
  "mode": "WANIKANI", "start": None,
  "steps": [{"action": "snapshot"}, {"action": "lesson", "where": {"limit": 2}}]}
S["ft-jlpt-1-level-all-correct"] = {
  "description": "Fresh JLPT learner jumps 1 level; every probation review answered right as it comes due (to Guru); then cooldown blocks until 72 h after the jump.",
  "mode": "JLPT", "start": None,
  "steps": [
    {"action": "fastTravel", "levels": 1},
    {"action": "grind", "noLessons": True, "until": {"noProbation": True}},
    {"action": "snapshot", "atHours": 71.5},
    {"action": "snapshot", "atHours": 72}]}
S["ft-jlpt-5-levels-mixed-answers"] = {
  "description": "Fresh JLPT learner jumps the maximum 5 levels; every 4th probation review is wrong (the item goes back to the lesson queue), the rest go to Guru.",
  "mode": "JLPT", "start": None,
  "steps": [
    {"action": "fastTravel", "levels": 5},
    {"action": "grind", "noLessons": True, "until": {"noProbation": True}, "wrongEveryNth": {"n": 4, "meaning": 1, "reading": 0}},
    {"action": "snapshot", "atHours": 73}]}
S["ft-blocked-open-probation"] = {
  "description": "After a 2-level jump only the first due probation reviews are answered: status stays blocked with the remaining count, also after the cooldown.",
  "mode": "JLPT", "start": None,
  "steps": [
    {"action": "fastTravel", "levels": 2},
    {"action": "review", "where": {}},
    {"action": "review", "advanceHours": 5, "where": {"limit": 3}},
    {"action": "snapshot", "atHours": 80}]}
S["ft-window-spread"] = {
  "description": "Probation reviews spread over a 24 h window instead of the 72 h cooldown, and a second jump after the cooldown with the default window.",
  "mode": "JLPT", "start": None,
  "steps": [
    {"action": "fastTravel", "levels": 3, "windowHours": 24},
    {"action": "grind", "noLessons": True, "until": {"noProbation": True}},
    {"action": "fastTravel", "atHours": 72, "levels": 1}]}
S["ft-window-under-an-hour"] = {
  "description": "A window shorter than an hour: one slot, every probation review due at the top of the current hour.",
  "mode": "JLPT", "start": None,
  "steps": [{"action": "fastTravel", "levels": 2, "windowHours": 0.5}]}
S["ft-cooldown-boundary"] = {
  "description": "Cooldown text and boundary: 1 level jump with a 24 h probation window, all probation answered, status at 24.5 h (2 d 0 h), 70.1 h (2 h), 71.9 h (1 h) and exactly 72 h (open).",
  "mode": "JLPT", "start": None,
  "steps": [
    {"action": "fastTravel", "levels": 1, "windowHours": 24},
    {"action": "grind", "noLessons": True, "until": {"noProbation": True}},
    {"action": "snapshot", "atHours": 24.5},
    {"action": "snapshot", "atHours": 70.1},
    {"action": "snapshot", "atHours": 71.9},
    {"action": "snapshot", "atHours": 72}]}
S["ft-last-level"] = {
  "description": "JLPT learner restored at the last JLPT level (userLevel max = Curriculum.maxLevel()): fast travel is blocked.",
  "mode": "JLPT", "start": None,
  "steps": [
    {"action": "restore", "generate": {"userLevel": "max", "curriculum": "JLPT"}},
    {"action": "snapshot"}]}
S["ft-near-end-one-below"] = {
  "description": "JLPT learner restored one level below the last (userLevel max-1, nothing started): fast travel offers exactly one option, the last level; the 1-level jump puts that level's kanji and vocabulary on probation and the status is then blocked by the open probation.",
  "mode": "JLPT", "start": None,
  "steps": [
    {"action": "restore", "generate": {"userLevel": "max-1", "curriculum": "JLPT"}},
    {"action": "fastTravel", "levels": 1}]}
S["ft-near-end-few-left"] = {
  "description": "Options near the end of the JLPT order (nothing started): at max-5 all 5 options, the last one being the last level; at max-4, max-3 and max-2 the options stop at the last level (4, 3, 2 options) instead of reaching 5 levels ahead, so no jump past the last level is offered.",
  "mode": "JLPT", "start": None,
  "steps": [
    {"action": "restore", "generate": {"userLevel": "max-5", "curriculum": "JLPT"}},
    {"action": "restore", "generate": {"userLevel": "max-4", "curriculum": "JLPT"}},
    {"action": "restore", "generate": {"userLevel": "max-3", "curriculum": "JLPT"}},
    {"action": "restore", "generate": {"userLevel": "max-2", "curriculum": "JLPT"}}]}
S["ft-n1-obscure-boundary"] = {
  "description": "Boundary between N1 and Obscure: restored on the last N1 level (max-4, where the extra kanji appended to N1 sit), the 1-level jump into Obscure level 1 puts the last N1 level's kanji and vocabulary, extra kanji included, on probation.",
  "mode": "JLPT", "start": None,
  "steps": [
    {"action": "restore", "generate": {"userLevel": "max-4", "curriculum": "JLPT"}},
    {"action": "fastTravel", "levels": 1}]}
S["lt-n5-n4-known"] = {
  "description": "Level test from a fresh WaniKani learner: round 1 knows N5 and N4 kanji only, round 2 samples N3 and knows nothing there; result; starting at the result switches to JLPT and jumps with a 7-day probation window.",
  "mode": "WANIKANI", "seed": 7, "start": None,
  "steps": [
    {"action": "levelTestRound", "round": 1, "known": {"blocks": [5, 4]}},
    {"action": "levelTestRound", "round": 2, "known": "none"},
    {"action": "levelTestResult"},
    {"action": "levelTestStartAtResult"}]}
S["lt-nothing-known"] = {
  "description": "Level test where nothing is known: boundary N5, round 2 within N5, result level 1, starting at the result does not move.",
  "mode": "JLPT", "seed": 11, "start": None,
  "steps": [
    {"action": "levelTestRound", "round": 1, "known": "none"},
    {"action": "levelTestRound", "round": 2, "known": "none"},
    {"action": "levelTestResult"},
    {"action": "levelTestStartAtResult"}]}
S["lt-everything-known"] = {
  "description": "Level test where every asked kanji is known: no boundary block, round 2 is empty and the result is the first level after N1 (Obscure). Starting there is left out: it would put about 9,000 items on probation and make the fixture huge.",
  "mode": "JLPT", "seed": 13, "start": None,
  "steps": [
    {"action": "levelTestRound", "round": 1, "known": "all"},
    {"action": "levelTestRound", "round": 2, "known": "all"},
    {"action": "levelTestResult"}]}
S["lt-abandoned-round"] = {
  "description": "Round 1 mostly abandoned (20 of 30): not recorded, status stays ROUND1. Then a fresh round 1 answered (N5 known), round 2 partly known, discard.",
  "mode": "JLPT", "seed": 17, "start": None,
  "steps": [
    {"action": "levelTestRound", "round": 1, "known": "all", "abandon": 20},
    {"action": "levelTestRound", "round": 1, "known": {"blocks": [5]}},
    {"action": "levelTestRound", "round": 2, "known": "all", "abandon": 2},
    {"action": "levelTestResult"},
    {"action": "levelTestDiscard"}]}
S["lt-with-progress"] = {
  "description": "Level test from a WaniKani learner with levels 1 to 4 at Guru: mastered kanji count towards the shares; N5 known in round 1 (boundary N4), round 2 all known; starting at the result proves the right answers at Guru.",
  "mode": "WANIKANI", "seed": 19,
  "start": {"generate": {"userLevel": 5, "levels": [1, 2, 3, 4], "stage": 5}},
  "steps": [
    {"action": "levelTestRound", "round": 1, "known": {"blocks": [5]}},
    {"action": "levelTestRound", "round": 2, "known": "all"},
    {"action": "levelTestResult"},
    {"action": "levelTestStartAtResult"}]}
S["progress-roundtrip-wk"] = {
  "description": "Export, restore, export after real lessons and reviews in WaniKani order (with a wrong answer and notes-free progress): the two exports must be identical; restoring the start file again resets.",
  "mode": "WANIKANI", "start": None,
  "steps": [
    {"action": "grind", "until": {"passed": r1[:10]}, "wrongOnce": {"2": [1, 0]}, "maxRounds": 12},
    {"action": "exportRestore"},
    {"action": "restore", "fromStep": 0}]}
S["progress-roundtrip-jlpt-probation"] = {
  "description": "Export, restore, export in JLPT order with open probation and a jump: probation, jumps and curriculum survive; switching to WaniKani order and restoring the saved export brings JLPT order back.",
  "mode": "JLPT", "start": None,
  "steps": [
    {"action": "fastTravel", "levels": 1},
    {"action": "review", "where": {}, "wrongEveryNth": {"n": 2}},
    {"action": "exportRestore"},
    {"action": "switchCurriculum", "mode": "WANIKANI"},
    {"action": "restore", "fromStep": 2}]}
legacy = {"format": "mojimori-progress", "version": 1, "exportedAt": T0 - 48*H, "userLevel": 2,
  "levelProgression": [{"id": 1, "level": 1, "abandonedAt": 0, "completedAt": 0, "createdAt": T0 - 300*H, "passedAt": T0 - 100*H, "startedAt": T0 - 300*H, "unlockedAt": T0 - 300*H}],
  "subjects": [{"id": s, "srsStage": 5, "unlockedAt": T0 - 300*H, "startedAt": T0 - 299*H, "passedAt": T0 - 150*H, "passed": 1, "availableAt": T0 + 20*H - (T0 + 20*H) % H,
                "meaningCorrect": 4, "meaningMaxStreak": 4, "meaningCurrentStreak": 4, "percentageCorrect": 100} for s in r1 + k1]
              + [{"id": 2467, "unlockedAt": T0 - 100*H, "meaningNote": "note one", "meaningSynonyms": "[\"uno\"]", "readingNote": "reading note"},
                 {"id": 3000, "meaningSynonyms": "[\"syn only\"]"}],
  "curriculum": "WANIKANI"}
S["progress-restore-legacy-with-notes"] = {
  "description": "Restore of a legacy mojimori-progress file without probation/jumps keys, with notes and synonyms (including one on a locked subject), then a round trip.",
  "mode": "WANIKANI", "start": {"inline": legacy},
  "steps": [{"action": "exportRestore"}, {"action": "lesson", "where": {"limit": 3}}]}
S["import-wk-fresh"] = {
  "description": "WaniKani import into a fresh learner: user level 2, level 1 at Guru, level 2 radicals in progress, a level progression row.",
  "mode": "WANIKANI", "start": None,
  "steps": [{"action": "importWaniKani", "api": api(2, level_entries(1, 5, True) + [(s, "radical", 3, False, False) for s in lvl(2, "radical")],
            levels=[{"level": 1, "unlocked_at": iso(T0 - 900*H), "started_at": iso(T0 - 890*H), "passed_at": iso(T0 - 500*H), "completed_at": None, "abandoned_at": None, "created_at": iso(T0 - 900*H)},
                    {"level": 2, "unlocked_at": iso(T0 - 500*H), "started_at": iso(T0 - 400*H), "passed_at": None, "completed_at": None, "abandoned_at": None, "created_at": iso(T0 - 500*H)}])},
            {"action": "lesson", "where": {"limit": 5}}]}
S["import-in-jlpt-order"] = {
  "description": "WaniKani import while in JLPT order: the WaniKani level is ignored and the learner is placed by mastered kanji.",
  "mode": "JLPT", "start": None,
  "steps": [{"action": "importWaniKani", "api": api(4, level_entries(1, 5, True) + level_entries(2, 6, True) + level_entries(3, 5, True))}]}
S["import-notes-stats-replace"] = {
  "description": "WaniKani import with review statistics and study materials over existing local progress (which it replaces), then a round trip.",
  "mode": "WANIKANI", "start": {"generate": {"userLevel": 3, "levels": [1, 2], "stage": 6}},
  "steps": [{"action": "importWaniKani", "api": api(1, [(s, "radical", 4, False, False) for s in r1[:5]] + [(9177, "kana_vocabulary", 0, False, False)],
        stats=[{"subject_id": s, "subject_type": "radical", "meaning_correct": 5, "meaning_incorrect": 2, "meaning_max_streak": 3, "meaning_current_streak": 1,
                "reading_correct": 0, "reading_incorrect": 0, "reading_max_streak": 0, "reading_current_streak": 0, "percentage_correct": 71, "hidden": False} for s in r1[:5]],
        materials=[{"subject_id": r1[0], "subject_type": "radical", "meaning_note": "imported note", "reading_note": None, "meaning_synonyms": ["line", "one"]},
                   {"subject_id": 2467, "subject_type": "vocabulary", "meaning_note": None, "reading_note": "rn", "meaning_synonyms": []}])},
        {"action": "exportRestore"}]}
S["reminder-set-on-first-pass"] = {
  "description": "Sync reminder (property sync_reminder) in local mode: it stays off throughout, since local mode unlocks on the spot and never sets or shows it; a vocabulary passing, a radical passing again, a wrong answer, lessons, radical 7 and kanji 440 passing for the first time (which set it in server mode).",
  "mode": "WANIKANI",
  "start": {"generate": {"userLevel": 1, "levels": [1], "objects": ["radical"], "stage": 5, "rows": [
      {"id": 1, "stage": 4}, {"id": 6, "stage": 4, "passed": True}, {"id": 7, "stage": 4},
      {"id": 440, "stage": 4}, {"id": 2467, "stage": 4}]}},
  "steps": [
    {"action": "snapshot"},
    {"action": "review", "ids": [2467]},
    {"action": "review", "ids": [6]},
    {"action": "review", "ids": [1], "meaningWrong": 1},
    {"action": "lesson", "where": {"limit": 2}},
    {"action": "review", "ids": [7]},
    {"action": "review", "ids": [440]}]}
S["reminder-survives-levelup-and-restore"] = {
  "description": "Sync reminder in local mode around a level-up: the kanji review that levels up to 2, a round trip, a restore of the start file (level 1 again), a WaniKani import and a curriculum switch; it stays off throughout.",
  "mode": "WANIKANI",
  "start": {"generate": {"userLevel": 1, "levels": [1], "objects": ["radical"], "stage": 5,
            "rows": [{"id": k, "stage": 5} for k in k1[:16]] + [{"id": k1[16], "stage": 4}, {"id": k1[17], "stage": 4}]}},
  "steps": [
    {"action": "review", "ids": [k1[16]], "meaningWrong": 1},
    {"action": "review", "ids": [k1[17]]},
    {"action": "exportRestore"},
    {"action": "restore", "fromStep": 0},
    {"action": "importWaniKani", "api": api(1, [(s, "radical", 4, False, False) for s in r1[:3]])},
    {"action": "switchCurriculum", "mode": "JLPT"}]}
S["reminder-fast-travel"] = {
  "description": "Sync reminder in local mode around a 1-level fast travel in JLPT order: the jump itself, then the probation reviews answered right as they come due; it stays off throughout.",
  "mode": "JLPT", "start": None,
  "steps": [
    {"action": "fastTravel", "levels": 1},
    {"action": "grind", "noLessons": True, "until": {"noProbation": True}}]}
# --- subject ids the content does not have (imports and restores) ---
# Unknown: 9540, 9541, 9999 (WaniKani ids above the bundled content), 50000, 150000 (inside the extras range but not
# an extra), 300000. Hidden in the content: 58 (radical, level 3), 7668 (vocabulary, level 2), 2285 (kanji, level 55).
# Extras from extra-kanji.db: 100001 (kanji 弘), 200001 (vocabulary 旭日).
assert not ids("select id from subject where id in (9540, 9541, 9999, 50000, 150000, 300000)")
assert ids("select id from subject where hiddenAt != 0 and id in (58, 7668, 2285) order by id") == [58, 2285, 7668]
def stat(sid, typ, mc, mi, rc, ri, pct):
    return {"subject_id": sid, "subject_type": typ, "meaning_correct": mc, "meaning_incorrect": mi, "meaning_max_streak": mc,
            "meaning_current_streak": 1, "reading_correct": rc, "reading_incorrect": ri, "reading_max_streak": rc,
            "reading_current_streak": 1, "percentage_correct": pct, "hidden": False}
def mat(sid, typ, mn, rn, syn):
    return {"subject_id": sid, "subject_type": typ, "meaning_note": mn, "reading_note": rn, "meaning_synonyms": syn}
def lprog(level, passed):
    return {"level": level, "unlocked_at": iso(T0 - 900*H), "started_at": iso(T0 - 890*H), "passed_at": iso(T0 - 500*H) if passed else None,
            "completed_at": None, "abandoned_at": None, "created_at": iso(T0 - 900*H)}
mixed_api = api(2, level_entries(1, 5, True) + [(s, "radical", 2, False, False) for s in lvl(2, "radical")]
      + [(7668, "vocabulary", 1, False, False), (58, "radical", 3, False, False), (2285, "kanji", 5, True, False),
         (100001, "kanji", 1, False, False), (200001, "vocabulary", 4, False, False),
         (9540, "kanji", 1, False, False), (150000, "kanji", 1, False, False)],
    stats=[stat(r1[0], "radical", 6, 1, 0, 0, 86), stat(7668, "vocabulary", 2, 0, 2, 1, 80), stat(100001, "kanji", 1, 0, 1, 0, 100),
           stat(9540, "kanji", 3, 3, 3, 3, 50)],
    materials=[mat(r1[0], "radical", "known note", None, ["ground"]), mat(58, "radical", "hidden note", None, []),
               mat(200001, "vocabulary", None, "extra reading note", ["rising sun"]), mat(9541, "kanji", "unknown note", "unknown rn", ["x"])],
    levels=[lprog(1, True), lprog(2, False)])
S["import-unknown-ids-only"] = {
  "description": "WaniKani import whose assignments, review statistics and study materials all name subject ids the content lacks (9540, 9999, 50000, 150000; a statistic for 60000 and a note for 70000 without assignment), plus a level progression for level 61. The unknown ids are skipped (the summary counts them), the reset of the old progress applies and the user level 3 is set. Then lessons, reviews, a round trip, both curriculum switches and a restore naming unknown ids 9540 and 9600 (dropped).",
  "mode": "WANIKANI", "start": None,
  "steps": [
    {"action": "importWaniKani", "api": api(3, [(9540, "kanji", 5, True, False), (9999, "vocabulary", 1, False, False),
            (50000, "radical", 0, False, False), (150000, "kanji", 2, False, False)],
        stats=[stat(9540, "kanji", 5, 0, 5, 0, 100), stat(9999, "vocabulary", 1, 1, 1, 1, 50), stat(60000, "radical", 2, 0, 0, 0, 100)],
        materials=[mat(9999, "vocabulary", "note on unknown", None, ["syn"]), mat(70000, "kanji", None, "rn only", [])],
        levels=[lprog(1, True), lprog(61, False)])},
    {"action": "lesson", "where": {"limit": 3}},
    {"action": "review", "advanceHours": 2, "where": {}},
    {"action": "exportRestore"},
    {"action": "switchCurriculum", "mode": "JLPT"},
    {"action": "switchCurriculum", "mode": "WANIKANI"},
    {"action": "restore", "inline": {"format": "kanjikodama-progress", "version": 1, "exportedAt": T0, "userLevel": 1, "levelProgression": [],
        "subjects": [{"id": 9540, "srsStage": 3, "unlockedAt": T0 - 50*H, "startedAt": T0 - 49*H, "availableAt": T0 - T0 % H, "meaningNote": "restored on placeholder"},
                     {"id": 9600, "srsStage": 3, "unlockedAt": T0 - 50*H, "startedAt": T0 - 49*H, "availableAt": T0 - T0 % H},
                     {"id": 1, "srsStage": 1, "unlockedAt": T0 - 50*H, "startedAt": T0 - 49*H, "availableAt": T0 - T0 % H}],
        "curriculum": "WANIKANI", "probation": [], "jumps": []}}]}
S["import-unknown-mixed"] = {
  "description": "WaniKani import mixing known subjects (level 1 at Guru, level 2 radicals), hidden ones (7668, 58, 2285 with assignments, statistics, notes), extras (100001, 200001) and unknown ids (9540, 150000; a note for 9541): the unknown ids are skipped and everything else applies; hidden and extra subjects take the progress but are not lessons or reviews in WaniKani order. Then reviews, a switch to JLPT order with reviews there, back, and a round trip.",
  "mode": "WANIKANI", "start": None,
  "steps": [
    {"action": "importWaniKani", "api": mixed_api},
    {"action": "review", "where": {}},
    {"action": "switchCurriculum", "mode": "JLPT"},
    {"action": "review", "where": {}},
    {"action": "switchCurriculum", "mode": "WANIKANI"},
    {"action": "exportRestore"}]}
S["import-unknown-in-jlpt-order"] = {
  "description": "The mixed import of import-unknown-mixed (known, hidden, extra and unknown ids) while in JLPT order: the unknown ids are skipped, the rest applies and Curriculum.place places the learner by it; lessons, reviews and a round trip.",
  "mode": "JLPT", "start": None,
  "steps": [
    {"action": "importWaniKani", "api": mixed_api},
    {"action": "lesson", "where": {"limit": 3}},
    {"action": "review", "where": {}},
    {"action": "exportRestore"}]}
S["import-hidden-and-extra-ids"] = {
  "description": "The mixed import without the unknown ids: known (level 1 at Guru, level 2 radicals), hidden (7668, 58, 2285) and extra (100001, 200001) subjects with assignments, statistics and notes. Every id exists, so the import applies: hidden and extra rows take the progress but are not lessons or reviews in WaniKani order; a switch to JLPT order (extras join N1) with reviews there, back, and a round trip.",
  "mode": "WANIKANI", "start": None,
  "steps": [
    {"action": "importWaniKani", "api": api(2, level_entries(1, 5, True) + [(s, "radical", 2, False, False) for s in lvl(2, "radical")]
      + [(7668, "vocabulary", 1, False, False), (58, "radical", 3, False, False), (2285, "kanji", 5, True, False),
         (100001, "kanji", 1, False, False), (200001, "vocabulary", 4, False, False)],
      stats=[stat(r1[0], "radical", 6, 1, 0, 0, 86), stat(7668, "vocabulary", 2, 0, 2, 1, 80), stat(100001, "kanji", 1, 0, 1, 0, 100)],
      materials=[mat(r1[0], "radical", "known note", None, ["ground"]), mat(58, "radical", "hidden note", None, []),
                 mat(200001, "vocabulary", None, "extra reading note", ["rising sun"])],
      levels=[lprog(1, True), lprog(2, False)])},
    {"action": "review", "where": {}},
    {"action": "switchCurriculum", "mode": "JLPT"},
    {"action": "review", "where": {}},
    {"action": "switchCurriculum", "mode": "WANIKANI"},
    {"action": "exportRestore"}]}
S["import-unknown-only-in-notes"] = {
  "description": "Over existing progress (levels 1-2 at Guru, user level 3): a WaniKani import of level 1 at Apprentice whose only unknown id is one study material (9541): the note is skipped and the import replaces the old progress (level 1 at Apprentice).",
  "mode": "WANIKANI", "start": {"generate": {"userLevel": 3, "levels": [1, 2], "stage": 5}},
  "steps": [
    {"action": "importWaniKani", "api": api(1, level_entries(1, 2, False), materials=[mat(r1[0], "radical", "kept?", None, []), mat(9541, "kanji", "unknown", None, [])])},
    {"action": "lesson", "where": {"limit": 3}},
    {"action": "exportRestore"}]}
def prow(sid, stage, avail_h, **extra):
    o = {"id": sid, "srsStage": stage, "unlockedAt": T0 - 300*H, "startedAt": T0 - 299*H if stage else 0,
         "passedAt": T0 - 150*H if stage >= 5 else 0, "passed": 1 if stage >= 5 else 0,
         "availableAt": (T0 + avail_h*H) - (T0 + avail_h*H) % H if stage else 0,
         "meaningCorrect": stage, "meaningMaxStreak": stage, "meaningCurrentStreak": stage, "percentageCorrect": 100}
    o.update(extra)
    return o
def mixed_file(curriculum, probation=(), jumps=()):
    return {"format": "kanjikodama-progress", "version": 1, "exportedAt": T0 - 2*H, "userLevel": 2,
      "levelProgression": [{"id": 1, "level": 1, "abandonedAt": 0, "completedAt": 0, "createdAt": T0 - 300*H, "passedAt": T0 - 100*H,
                            "startedAt": T0 - 300*H, "unlockedAt": T0 - 300*H}],
      "subjects": [prow(s, 5, 20) for s in r1 + k1]
        + [prow(58, 3, -1), prow(7668, 1, -1, meaningNote="hidden note"), prow(100001, 5, -1), prow(200001, 1, -1, meaningSynonyms="[\"rising sun\"]"),
           prow(9540, 4, -1, meaningNote="unknown note"), prow(50000, 1, -1), prow(150000, 5, 3), prow(300000, 9, 0, burnedAt=T0 - 10*H)],
      "curriculum": curriculum, "probation": list(probation), "jumps": list(jumps)}
S["restore-unknown-ids-wk-order"] = {
  "description": "Restore (WaniKani order) of a file with level 1 at Guru plus hidden (58, 7668), extra (100001, 200001) and unknown (9540, 50000, 150000, 300000) subjects, all but the Guru ones due: unknown ids are dropped silently, hidden and extra rows keep their progress but are not reviews; round trip, switch to JLPT order (the extras become reviews), lessons.",
  "mode": "WANIKANI", "start": None,
  "steps": [
    {"action": "restore", "inline": mixed_file("WANIKANI")},
    {"action": "review", "where": {}},
    {"action": "exportRestore"},
    {"action": "switchCurriculum", "mode": "JLPT"},
    {"action": "lesson", "where": {"limit": 3}}]}
S["restore-unknown-ids-jlpt-order"] = {
  "description": "The same file as restore-unknown-ids-wk-order but saved in JLPT order, with probation on an unknown id (9540) and an extra (100001) and a jump: the extras are reviews in JLPT order, the probation row of the unknown id is dropped; fast travel status before and after the cooldown, a probation grind, then back to WaniKani order.",
  "mode": "WANIKANI", "start": None,
  "steps": [
    {"action": "restore", "inline": mixed_file("JLPT", probation=[[9540, T0 - 10*H], [100001, T0 - 10*H]], jumps=[[T0 - 10*H, 1, 2]])},
    {"action": "review", "where": {}},
    {"action": "snapshot", "atHours": 80},
    {"action": "grind", "noLessons": True, "until": {"noProbation": True}, "maxRounds": 3},
    {"action": "switchCurriculum", "mode": "WANIKANI"}]}
all_unknown = [prow(9540, 5, 10), prow(9541, 1, -1), prow(50000, 3, -1, meaningNote="n"), prow(150000, 9, 0, burnedAt=T0 - 10*H), prow(300000, 0, 0)]
S["restore-all-unknown"] = {
  "description": "Restore of files whose subjects are all unknown ids: WaniKani order at user level 4 (level progression for 4), then JLPT order with probation on unknown ids only; the app stays usable (level, counts, lessons) and fast travel is not blocked, since probation rows for unknown ids are dropped.",
  "mode": "WANIKANI", "start": None,
  "steps": [
    {"action": "restore", "inline": {"format": "kanjikodama-progress", "version": 1, "exportedAt": T0, "userLevel": 4,
        "levelProgression": [{"id": 9, "level": 4, "abandonedAt": 0, "completedAt": 0, "createdAt": T0 - 30*H, "passedAt": 0, "startedAt": T0 - 30*H, "unlockedAt": T0 - 30*H}],
        "subjects": all_unknown, "curriculum": "WANIKANI", "probation": [], "jumps": []}},
    {"action": "lesson", "where": {"limit": 3}},
    {"action": "exportRestore"},
    {"action": "restore", "inline": {"format": "kanjikodama-progress", "version": 1, "exportedAt": T0, "userLevel": 3, "levelProgression": [],
        "subjects": all_unknown, "curriculum": "JLPT", "probation": [[9540, T0 - 5*H], [50000, T0 - 5*H]], "jumps": [[T0 - 5*H, 1, 3]]}},
    {"action": "snapshot", "atHours": 80},
    {"action": "grind", "noLessons": True, "until": {"noProbation": True}, "maxRounds": 2},
    {"action": "lesson", "where": {"limit": 3}}]}
# Hidden subjects that are components of visible ones (hideSubject/unhideSubject change the content's hiddenAt;
# LocalProgression counts a hidden component as passed, and leaves hidden kanji out of the 90 % level-up share).
assert k1[16:] == [455, 456] and k1[0] == 440
# The WaniKani ids of the hidden-subject and unlock scenarios (descriptions name them) assume these components;
# a content change fails here instead of silently testing other subjects.
for sid, comps in {440: [1], 441: [7], 444: [9], 449: [1, 7], 450: [1, 10], 451: [1, 10], 2475: [444], 2476: [441, 444]}.items():
    assert sorted(json.loads(con.execute("select componentSubjectIds from subject where id=?", (sid,)).fetchone()[0])) == comps, sid
S["wk-hidden-radical-only-missing"] = {
  "description": "Level 1 radicals at Guru except 二 (7), an untaken lesson: kanji 二 (441, [7]) and 三 (449, [1, 7]) stay locked. Hiding radical 7 without the progression update only drops it from the lessons; the update then unlocks both kanji, because a hidden component counts as passed.",
  "mode": "WANIKANI",
  "start": {"generate": {"userLevel": 1, "levels": [1], "objects": ["radical"], "stage": 5, "rows": [{"id": 7, "stage": 0}]}},
  "steps": [
    {"action": "snapshot"},
    {"action": "hideSubject", "ids": [7], "update": False},
    {"action": "progressionUpdate"},
    {"action": "lesson", "ids": [441, 449]}]}
S["wk-hidden-radical-among-several"] = {
  "description": "Fresh start, radical ト (10) hidden at once: it is no longer a lesson, but 上 (450) and 下 (451), [10, 1], still wait for 一 (1). Passing 1 unlocks 一, 上 and 下 (not 三, which needs 二 (7) too); passing 7 then unlocks 二 and 三.",
  "mode": "WANIKANI", "start": None,
  "steps": [
    {"action": "hideSubject", "ids": [10]},
    {"action": "lesson", "ids": [1, 7]},
    {"action": "grind", "noLessons": True, "reviewsWhere": {"ids": [1]}, "until": {"passed": [1]}},
    {"action": "grind", "noLessons": True, "reviewsWhere": {"ids": [7]}, "until": {"passed": [7]}}]}
S["wk-hidden-kanji-locked-vocabulary"] = {
  "description": "Level 1 radicals at Guru except 人 (9), an untaken lesson, so kanji 人 (444) is locked. Hiding the locked kanji 444 unlocks vocabulary 人 (2475, [444]) although 444 was never learnt; 二人 (2476, [441, 444]) waits for 二 (441) and unlocks when it passes.",
  "mode": "WANIKANI",
  "start": {"generate": {"userLevel": 1, "levels": [1], "objects": ["radical"], "stage": 5, "rows": [{"id": 9, "stage": 0}]}},
  "steps": [
    {"action": "snapshot"},
    {"action": "hideSubject", "ids": [444]},
    {"action": "grind", "lessonsWhere": {"ids": [441]}, "reviewsWhere": {"ids": [441]}, "until": {"passed": [441]}}]}
S["wk-hidden-kanji-after-started"] = {
  "description": "Level 1 radicals and kanji at Guru except 三 (449, stage 3), 人 (444) and 口 (452) (stage 2), all due. Hiding the started kanji 449 drops its review (its progress stays in the export) and unlocks 三 and 三つ ([449]); 三人 ([449, 444]) waits for 444. 15 of the 17 visible kanji passed is short of 16; passing 444 levels up. Unhiding 449 brings its due review back (the level and the unlocks stay), then it is answered.",
  "mode": "WANIKANI",
  "start": {"generate": {"userLevel": 1, "levels": [1], "objects": ["radical", "kanji"], "stage": 5,
            "rows": [{"id": 449, "stage": 3}, {"id": 444, "stage": 2}, {"id": 452, "stage": 2}]}},
  "steps": [
    {"action": "snapshot"},
    {"action": "hideSubject", "ids": [449]},
    {"action": "review", "where": {}},
    {"action": "grind", "noLessons": True, "reviewsWhere": {"ids": [444]}, "until": {"passed": [444]}},
    {"action": "unhideSubject", "ids": [449]},
    {"action": "review", "ids": [449]}]}
S["wk-hidden-kanji-levelup-threshold"] = {
  "description": "Level 1: 16 of 18 kanji passed (17 needed). Hiding the passed 一 (440) leaves 15 of 17 (16 needed): no level-up. Hiding the unpassed 山 (455) leaves 15 of 16 (15 needed): level 2. Unhiding both does not take the level back.",
  "mode": "WANIKANI",
  "start": {"generate": {"userLevel": 1, "levels": [1], "objects": ["radical"], "stage": 5,
            "rows": [{"id": k, "stage": 5} for k in k1[:16]] + [{"id": 455, "stage": 4}, {"id": 456, "stage": 4}]}},
  "steps": [
    {"action": "snapshot"},
    {"action": "hideSubject", "ids": [440]},
    {"action": "hideSubject", "ids": [455]},
    {"action": "unhideSubject", "ids": [440, 455]}]}
S["jlpt-hidden-radical-component"] = {
  "description": "Fresh start in JLPT order: hiding radical 一 (1) unlocks kanji 一 (440, [1]) as a lesson at once; 三 (449, [1, 7]) still waits for 二 (7) and unlocks when it passes.",
  "mode": "JLPT", "start": None,
  "steps": [
    {"action": "hideSubject", "ids": [1]},
    {"action": "lesson", "ids": [7]},
    {"action": "grind", "noLessons": True, "reviewsWhere": {"ids": [7]}, "until": {"passed": [7]}}]}
S["jlpt-hidden-kanji-levelup"] = {
  "description": "JLPT level 1 (40 kanji with the current content, 36 needed): all but the last 5 kanji passed, those 5 at stage 4. Hiding one unpassed kanji leaves 35 of 39 (36 needed): no level-up; hiding a second leaves 35 of 38 (35 needed): level 2. The kanji are picked on the device from the app's JLPT layout (generate.tail, hideSubject.where); result.subjects records which.",
  "mode": "JLPT", "start": None,
  "steps": [
    {"action": "restore", "generate": {"userLevel": 1, "curriculum": "JLPT", "levels": [1], "stage": 5,
                                       "tail": {"objects": ["kanji"], "count": 5, "stage": 4, "availableInHours": 50}}},
    {"action": "hideSubject", "where": {"object": "kanji", "level": 1, "maxStage": 4, "limit": 1}},
    {"action": "hideSubject", "where": {"object": "kanji", "level": 1, "maxStage": 4, "limit": 1}}]}
# --- timing: per-answer time (spacingSeconds, offsetsSeconds, delayedReport, atMs, advanceSeconds) ---
HT0 = T0 - T0 % H      # 09:00 on the T0 day
M = 60000; SEC = 1000
S["time-top-of-hour-straddle"] = {
  "description": "Per-answer time around the top of the hour: availableAt = topOfHour(answer + interval + 30 s), so answers at hh:59:29.999 and hh:59:30 land an hour apart. Seven level 1 radical lessons from 09:59:00 to 10:59:30 (accelerated SRS, 2 h), the review queue 1 ms before and at 12:00, then the six due reviews answered from 12:59:00 across 12:59:30 (4 h; one slip back to 2 h).",
  "mode": "WANIKANI", "start": None,
  "steps": [
    {"action": "lesson", "atMs": HT0 + 59*M, "where": {"object": "radical", "limit": 7},
     "offsetsSeconds": [0, 29.999, 30, 45, 60, 3629.999, 3630]},
    {"action": "snapshot", "atMs": HT0 + 3*H - 1},
    {"action": "snapshot", "atMs": HT0 + 3*H},
    {"action": "review", "atMs": HT0 + 3*H + 59*M, "where": {}, "offsetsSeconds": [0, 29.999, 30, 30.001, 59.999, 60],
     "wrong": {str(r1[3]): [1, 0]}}]}
S["time-review-before-after-available"] = {
  "description": "Reviews due at 10:00: the queue is empty 1 ms before (review where {} answers nothing) and holds them at exactly 10:00:00.000. A review reported for a subject before its availableAt (ids, 10:59:59.999 for one due at 11:00) is processed anyway: ReportSessionItemJob does not check availability; the app's queue never offers it.",
  "mode": "WANIKANI",
  "start": {"generate": {"userLevel": 1, "levels": [1], "objects": ["radical"], "stage": 5, "availableInHours": 100,
            "rows": [{"id": 1, "stage": 1, "passed": False, "availableInHours": 1}, {"id": 2, "stage": 3, "passed": False, "availableInHours": 1},
                     {"id": 3, "stage": 2, "passed": False, "availableInHours": 2}]}},
  "steps": [
    {"action": "review", "atMs": HT0 + H - 1, "where": {}},
    {"action": "review", "atMs": HT0 + H, "where": {}},
    {"action": "review", "atMs": HT0 + 2*H - 1, "ids": [3]},
    {"action": "snapshot", "atMs": HT0 + 2*H}]}
S["time-same-item-twice"] = {
  "description": "The same subject reported twice minutes apart: radical 1 (stage 1) right at 09:17, not in the queue 5 min later, reported again by id (stage 3, the next review from the second time); radical 2 (stage 4) wrong at 09:25 then right at 09:27 (lastIncorrectAnswer keeps 09:25, streaks reset then restart).",
  "mode": "WANIKANI",
  "start": {"generate": {"userLevel": 1, "levels": [1], "objects": ["radical"], "stage": 5, "availableInHours": 100,
            "rows": [{"id": 1, "stage": 1, "passed": False, "availableInHours": 0}, {"id": 2, "stage": 4, "passed": False, "availableInHours": 0}]}},
  "steps": [
    {"action": "review", "ids": [1]},
    {"action": "review", "advanceSeconds": 300, "where": {"ids": [1]}},
    {"action": "review", "ids": [1]},
    {"action": "review", "advanceSeconds": 180, "ids": [2], "wrong": {"2": [1, 0]}},
    {"action": "review", "advanceSeconds": 120, "ids": [2]}]}
S["time-levelup-precise"] = {
  "description": "Level 1 needs 17 of 18 kanji passed; 15 are, three at Apprentice IV. Answered at 09:59:00, 09:59:31.5 and 09:59:45: the level-up (level_progression rows, level 2 unlocks) happens at the second answer's exact time. Then the start file again and the same answers with delayed reporting from 10:59:00, reported 2 min after the last answer: passedAt keeps the answer times, the level-up and unlocks take the report time.",
  "mode": "WANIKANI",
  "start": {"generate": {"userLevel": 1, "levels": [1], "objects": ["radical"], "stage": 5,
            "rows": [{"id": k, "stage": 5, "availableInHours": 100} for k in k1[:15]] + [{"id": k, "stage": 4, "availableInHours": 0} for k in k1[15:]]}},
  "steps": [
    {"action": "review", "atMs": HT0 + 59*M, "ids": k1[15:], "offsetsSeconds": [0, 31.5, 45]},
    {"action": "restore", "fromStep": 0},
    {"action": "review", "atMs": HT0 + H + 59*M, "ids": k1[15:], "offsetsSeconds": [0, 31.5, 45], "delayedReport": True, "reportAfterSeconds": 120}]}
S["time-unlocks-seconds-apart"] = {
  "description": "Radicals 一 (1), 二 (7) and ト (10) pass at 10:59:00, 10:59:05 and 10:59:11: kanji 一 unlocks at :00, 二 and 三 at :05, 上 and 下 at :11. Lessons 三, 上, 下 at 10:59:20, 10:59:30, 10:59:30.001: the first is due an hour before the other two.",
  "mode": "WANIKANI",
  "start": {"generate": {"userLevel": 1, "rows": [{"id": i, "stage": 4, "availableInHours": 0} for i in (1, 7, 10)]}},
  "steps": [
    {"action": "review", "atMs": HT0 + H + 59*M, "ids": [1, 7, 10], "offsetsSeconds": [0, 5, 11]},
    {"action": "lesson", "advanceSeconds": 9, "ids": [449, 450, 451], "offsetsSeconds": [0, 10, 10.001]}]}
S["time-delayed-vs-immediate-report"] = {
  "description": "All 25 level 1 radicals at Apprentice IV, answered 20 s apart from 09:59:00. Delayed reporting (reported 90 s after the last answer): passedAt and availableAt follow each answer time (the 09:59:30 boundary splits the next reviews by an hour), but every level 1 kanji unlocks at the report time. Then the start file again and immediate reporting from 10:59:00: each kanji unlocks when its last radical passes.",
  "mode": "WANIKANI",
  "start": {"generate": {"userLevel": 1, "levels": [1], "objects": ["radical"], "stage": 4, "availableInHours": 0}},
  "steps": [
    {"action": "review", "atMs": HT0 + 59*M, "where": {}, "spacingSeconds": 20, "delayedReport": True, "reportAfterSeconds": 90},
    {"action": "restore", "fromStep": 0},
    {"action": "review", "atMs": HT0 + H + 59*M, "where": {}, "spacingSeconds": 20}]}
S["time-grind-spaced"] = {
  "description": "Fresh start to level 2 like wk-grind-level1-to-level2, but every lesson and review is answered 7 s after the previous one, so later answers of a round cross hour boundaries and unlocks get distinct times.",
  "mode": "WANIKANI", "start": None,
  "steps": [{"action": "grind", "until": {"level": 2}, "spacingSeconds": 7}]}
# A 1-level jump spreads its probation items over the window's hour slots from HT0 (FastTravel.travel). Both
# scenarios are relative to the content: grind until {onlyLastProbationSlot} stops before the last used slot, and
# atLastProbationSlot (ms offset) pins the clock to that slot, read on the device. With today's content (178 items,
# see ft-jlpt-1-level-all-correct) the last slot is HT0 + 71 h (2 items) or HT0 + 167 h (1 item); with fewer items
# than hours it would be earlier. The 7-day scenario's Guru reviews of the first slot fall due at that same last slot
# only while every slot is used (178 >= 168 items today); resolved records the actual times.
# maxRounds is the window in hours, an upper bound (at most one round per slot), not a count: grind's default
# cap of 100 rounds is below the 7-day window's 168 slots.
S["time-probation-3day-edge"] = {
  "description": "1-level jump with the default 72 h window: all probation slots but the last answered; 1 ms before the last slot (HT0 + 71 h with today's content) nothing is due and fast travel is blocked by the open items of that slot (2 today); they are answered at the slot (30 s apart); the cooldown runs from the jump (T0): 1 ms before T0 + 72 h blocked, at T0 + 72 h open.",
  "mode": "JLPT", "start": None,
  "steps": [
    {"action": "fastTravel", "levels": 1},
    {"action": "grind", "noLessons": True, "until": {"onlyLastProbationSlot": True}, "maxRounds": 72},
    {"action": "snapshot", "atLastProbationSlot": -1},
    {"action": "review", "atLastProbationSlot": 0, "where": {}, "spacingSeconds": 30},
    {"action": "snapshot", "atMs": T0 + 72*H - 1},
    {"action": "snapshot", "atMs": T0 + 72*H}]}
S["time-probation-7day-edge"] = {
  "description": "1-level jump with the level test's 7-day window (168 h): all slots but the last answered; 1 ms before the last slot (HT0 + 167 h with today's content) nothing is due and the open item(s) of that slot (1 today) block fast travel (the 72 h cooldown is long over); at the last slot the last probation item and (with every slot used, as today) the Guru reviews of the first slot are due together; answering them opens fast travel.",
  "mode": "JLPT", "start": None,
  "steps": [
    {"action": "fastTravel", "levels": 1, "windowHours": 168},
    {"action": "grind", "noLessons": True, "until": {"onlyLastProbationSlot": True}, "maxRounds": 168},
    {"action": "snapshot", "atLastProbationSlot": -1},
    {"action": "review", "atLastProbationSlot": 0, "where": {}}]}
# --- leftovers: WaniKani's hidden flag, odd subject_type values, hiding in JLPT order then switching ---
# ApiAssignment and ApiReviewStatistic map neither "hidden" nor "subject_type" (Jackson ignores unknown properties),
# so the import goes by subject_id alone: these scenarios freeze that.
def with_flags(a, hidden_assignments=(), hidden_stats=(), drop_type=()):
    import copy
    a = copy.deepcopy(a)
    for e in a["assignments"]:
        if e["data"]["subject_id"] in hidden_assignments:
            e["data"]["hidden"] = True
        if e["data"]["subject_id"] in drop_type:
            del e["data"]["subject_type"]
    for e in a["review_statistics"]:
        if e["data"]["subject_id"] in hidden_stats:
            e["data"]["hidden"] = True
    return a
r2 = lvl(2, "radical")
assert k1[16:] == [455, 456] and v1[0] == 2467
hidden_flag_api = with_flags(api(1, [(s, "radical", 5, True, False) for s in r1] + [(k, "kanji", 5, True, False) for k in k1[:16]]
        + [(k, "kanji", 4, False, False) for k in k1[16:]] + [(v, "vocabulary", 1, False, False) for v in v1[:3]]
        + [(s, "radical", 0, False, False) for s in r2[:3]] + [(7668, "vocabulary", 1, False, False), (58, "radical", 3, False, False)],
    stats=[stat(k1[0], "kanji", 8, 1, 8, 0, 94), stat(v1[0], "vocabulary", 1, 0, 1, 0, 100), stat(7668, "vocabulary", 2, 1, 2, 0, 80)]),
    hidden_assignments={k1[0], k1[16], k1[17], v1[0], r2[0], 7668}, hidden_stats={k1[0], v1[0]})
S["import-assignment-hidden-flag-wk"] = {
  "description": "WaniKani import (WaniKani order, user level 1) where some assignments carry WaniKani's hidden: true: a passed kanji (440), the two unpassed level 1 kanji at Apprentice IV (455, 456), a due vocabulary (2467), a level 2 radical lesson (45) and the content-hidden vocabulary 7668; statistics of 440 and 2467 also hidden: true. The flag is not read: flagged subjects take their progress, stay lessons and reviews, and count for the level-up like any other (16 of 18 kanji passed: no level-up; passing the flagged 455 makes it 17: level 2). Content-hidden 7668 and 58 stay out of the queues either way.",
  "mode": "WANIKANI", "start": None,
  "steps": [
    {"action": "importWaniKani", "api": hidden_flag_api},
    {"action": "review", "where": {}},
    {"action": "lesson", "where": {"limit": 5}},
    {"action": "review", "advanceHours": 9, "where": {"ids": [455]}},
    {"action": "exportRestore"}]}
S["import-assignment-hidden-flag-jlpt"] = {
  "description": "The import of import-assignment-hidden-flag-wk while in JLPT order: Curriculum.place counts the passed kanji whatever their hidden flag says; then lessons, reviews and a round trip.",
  "mode": "JLPT", "start": None,
  "steps": [
    {"action": "importWaniKani", "api": hidden_flag_api},
    {"action": "lesson", "where": {"limit": 3}},
    {"action": "review", "where": {}},
    {"action": "exportRestore"}]}
all_hidden_entries = level_entries(1, 5, True) + level_entries(2, 5, True)
S["import-assignment-all-hidden-flag"] = {
  "description": "WaniKani import (user level 3) of levels 1 and 2 at Guru where every assignment and statistic says hidden: true: the result is the same as without the flag (level 3, level 3 lessons).",
  "mode": "WANIKANI", "start": None,
  "steps": [
    {"action": "importWaniKani", "api": with_flags(api(3, all_hidden_entries, stats=[stat(r1[0], "radical", 6, 1, 0, 0, 86)]),
        hidden_assignments={e[0] for e in all_hidden_entries}, hidden_stats={r1[0]})},
    {"action": "lesson", "where": {"limit": 5}},
    {"action": "exportRestore"}]}
assert r1[:4] == [1, 6, 2, 3] and r2[0] == 45 and k1[:3] == [440, 441, 442]
type_entries = ([(s, "radical", 5, True, False) for s in r1[4:]] + [(k, "kanji", 5, True, False) for k in k1[3:]]
    + [(440, "kanji_v2", 5, True, False), (441, "vocabulary", 5, True, False), (r1[0], "kanji", 5, True, False),
       (r1[1], "", 5, True, False), (r1[2], None, 5, True, False), (r1[3], "radical", 5, True, False),
       (2467, "radical", 2, False, False), (2468, "kana_vocabulary", 1, False, False),
       (442, "kanji", 5, True, False), (442, "kanji_v2", 1, False, False),
       (9540, "kanji_v2", 1, False, False), (9541, "radical", 3, False, False)])
S["import-subject-type-mismatch"] = {
  "description": "WaniKani import (user level 1, level 1 radicals and kanji at Guru) whose subject_type values are unknown (kanji_v2 for kanji 440), wrong for the id (vocabulary for kanji 441, kanji for radical 1, radical for vocabulary 2467, kana_vocabulary for vocabulary 2468), empty (radical 6), null (radical 2) or missing (radical 3); kanji 442 comes twice (Guru as kanji, then Apprentice I as kanji_v2: the later one wins, passedAt 0); unknown ids 9540 (kanji_v2) and 9541 are skipped (2 in the summary). Statistics and notes with odd types too. The type is not read: every known id takes its progress by subject_id; 17 of 18 kanji passed, so the import levels up to 2. Then reviews, lessons, a round trip and a switch to JLPT order.",
  "mode": "WANIKANI", "start": None,
  "steps": [
    {"action": "importWaniKani", "api": with_flags(api(1, type_entries,
        stats=[stat(440, "kanji_v2", 7, 0, 7, 0, 100), stat(r1[0], "vocabulary", 5, 2, 0, 0, 71), stat(2467, "kanji", 1, 1, 1, 1, 50),
               stat(9540, "kanji_v2", 3, 0, 3, 0, 100)],
        materials=[mat(441, "radical", "kanji typed as radical", None, ["two"]), mat(2467, "kanji_v2", None, "typed kanji_v2", []),
                   mat(9541, "vocabulary", "unknown", None, [])]), drop_type={r1[3]})},
    {"action": "review", "where": {}},
    {"action": "lesson", "where": {"limit": 5}},
    {"action": "exportRestore"},
    {"action": "switchCurriculum", "mode": "JLPT"}]}
# Hiding in JLPT order: hideSubject does not re-run the layout (only LocalProgression.update). Curriculum.switchTo
# always re-runs it (also to the same mode); ProgressStore.restore only when the order changes. The kanji are picked on
# the device from the app's JLPT layout (where); unhideSubject ids "changed" names every subject the scenario changed.
jlpt_start = {"action": "restore", "generate": {"userLevel": 2, "curriculum": "JLPT", "levels": [1], "stage": 5}}
S["jlpt-hide-kanji-switch-wk-and-back"] = {
  "description": "JLPT level 1 at Guru, user level 2. Hide the first two level 1 kanji (440, 441, passed) and the first level 2 kanji (503, locked): hideSubject does not re-run the layout, and a round trip (restore in the same order) keeps it, but a JLPT preview lays out afresh and already reports backfill 1. Switching to WaniKani order and back lays out without the hidden kanji: N5 shrinks by 3, so the next N5 kanji (504) moves down to JLPT level 1 and the placement unlocks it as backfill (a lesson). Unhiding the three in that layout puts them back at JLPT level 1 (result.subjects; 503 stays locked); switching to WaniKani order and back gives the original layout with backfill 0, while 504 keeps its unlock and progress.",
  "mode": "JLPT", "start": None,
  "steps": [
    jlpt_start,
    {"action": "hideSubject", "where": {"object": "kanji", "level": 1, "limit": 2}},
    {"action": "hideSubject", "where": {"object": "kanji", "level": 2, "limit": 1}},
    {"action": "previewCurriculum", "mode": "JLPT"},
    {"action": "exportRestore"},
    {"action": "switchCurriculum", "mode": "WANIKANI"},
    {"action": "switchCurriculum", "mode": "JLPT"},
    {"action": "lesson", "where": {"limit": 5}},
    {"action": "unhideSubject", "ids": "changed"},
    {"action": "switchCurriculum", "mode": "WANIKANI"},
    {"action": "switchCurriculum", "mode": "JLPT"}]}
S["jlpt-hide-unhide-kanji-switch"] = {
  "description": "As jlpt-hide-kanji-switch-wk-and-back, but the three kanji are unhidden again before switching to WaniKani order and back: original layout, placement level 2, backfill 0. Then hide them again (ids \"changed\"), switch to WaniKani order, unhide them there (503 at its WaniKani level 3) and switch back: the original layout again, backfill 0.",
  "mode": "JLPT", "start": None,
  "steps": [
    jlpt_start,
    {"action": "hideSubject", "where": {"object": "kanji", "level": 1, "limit": 2}},
    {"action": "hideSubject", "where": {"object": "kanji", "level": 2, "limit": 1}},
    {"action": "unhideSubject", "ids": "changed"},
    {"action": "switchCurriculum", "mode": "WANIKANI"},
    {"action": "switchCurriculum", "mode": "JLPT"},
    {"action": "hideSubject", "ids": "changed"},
    {"action": "switchCurriculum", "mode": "WANIKANI"},
    {"action": "unhideSubject", "ids": "changed"},
    {"action": "switchCurriculum", "mode": "JLPT"}]}
S["jlpt-hide-kanji-switch-same-mode"] = {
  "description": "JLPT level 1 at Guru, user level 2: hide 440, 441 (level 1) and 503 (level 2), then switch to JLPT order while already in it: switchTo re-runs the layout anyway (504 moves to level 1, backfill 1, a lesson). Unhiding the three keeps that layout (all three at level 1), a round trip in JLPT order does not re-run it either, and a JLPT preview (a fresh layout) reports backfill 0.",
  "mode": "JLPT", "start": None,
  "steps": [
    jlpt_start,
    {"action": "hideSubject", "where": {"object": "kanji", "level": 1, "limit": 2}},
    {"action": "hideSubject", "where": {"object": "kanji", "level": 2, "limit": 1}},
    {"action": "switchCurriculum", "mode": "JLPT"},
    {"action": "lesson", "where": {"limit": 5}},
    {"action": "unhideSubject", "ids": "changed"},
    {"action": "exportRestore"},
    {"action": "previewCurriculum", "mode": "JLPT"}]}
sys.path.insert(0, HERE)
import session_scenarios
session_scenarios.add(S, lvl)
import session_order_scenarios
session_order_scenarios.add(S, lvl)
import anki_scenarios
anki_scenarios.add(S, lvl)
import lesson_scenarios
lesson_scenarios.add(S, lvl)
import real_progress_scenarios
real_progress_scenarios.add(S, lvl)
import dashboard_scenarios
dashboard_scenarios.add(S, lvl)
os.makedirs(OUT, exist_ok=True)
for name, sc in S.items():
    with open(os.path.join(OUT, name + ".json"), "w") as f:
        json.dump(sc, f, ensure_ascii=False, indent=1)
        f.write("\n")
print(len(S))
