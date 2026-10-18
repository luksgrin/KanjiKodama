# Session configuration scenarios: which subjects a session picks and in what order (lesson/review/self-study order,
# priority, reversal, overdue first, shuffle after selection, session size limits, subject selection rules), how the
# questions are sequenced (back-to-back, reading first, meaning first, the 10-started cap) and lightning mode.
# Imported by make_scenarios.py, which writes every definition.

# Every advanced setting a session reads, removed (app defaults), so the owner's own preferences never leak in once a
# scenario turns enable_advanced on. Steps add the settings they test on top.
_KEYS = ["order", "order_reversed", "order_priority", "shuffle_after_selection", "back_to_back", "reading_first",
         "meaning_first", "randomize_inflections"]
_RULES = ["current", "earlier", "radical", "kanji", "vocabulary", "kana_vocabulary"]
BASE = {"enable_advanced": True, "enable_lightning_mode": None, "overdue_threshold": None,
        "shake_on_matching_kanji": None, "lesson_subjects_Kana_vocabulary_min": None}
for _t in ("lesson", "review", "self_study"):
    for _k in _KEYS:
        BASE[_t + "_" + _k] = None
    for _r in _RULES:
        BASE[_t + "_subjects_" + _r + "_min"] = None
        BASE[_t + "_subjects_" + _r + "_max"] = None
    BASE["anki_mode_" + _t] = None
    BASE["anki_mode_" + _t + "_meaning"] = None
    BASE["anki_mode_" + _t + "_reading"] = None
BASE["review_order_overdue_first"] = None
BASE["self_study_order_overdue_first"] = None
del BASE["lesson_randomize_inflections"]

REVIEW_ORDERS = ["SHUFFLE", "LEVEL", "TYPE", "SRS", "LEVEL_THEN_TYPE", "LEVEL_THEN_SRS", "TYPE_THEN_LEVEL",
                 "TYPE_THEN_SRS", "SRS_THEN_TYPE", "SRS_THEN_LEVEL", "LEVEL_THEN_TYPE_THEN_SRS",
                 "LEVEL_THEN_SRS_THEN_TYPE", "TYPE_THEN_LEVEL_THEN_SRS", "TYPE_THEN_SRS_THEN_LEVEL",
                 "SRS_THEN_TYPE_THEN_LEVEL", "SRS_THEN_LEVEL_THEN_TYPE"]
LESSON_ORDERS = ["SHUFFLE", "LEVEL_THEN_TYPE", "RADICALS_THEN_LEVEL_THEN_TYPE", "TYPE_THEN_LEVEL",
                 "LEVEL_THEN_SHUFFLE", "TYPE_THEN_SHUFFLE"]
PRIORITIES = ["NONE", "RADICALS_FIRST", "LEVEL_UP_FIRST", "CURRENT_LEVEL_RADICAL_KANJI_FIRST", "CURRENT_LEVEL_FIRST"]


def s(**kw):
    out = dict(BASE)
    out.update(kw)
    return out


def starts(kind, where, combos):
    """sessionStart + sessionAbandon per settings combination: the start records the chosen items and their order."""
    steps = []
    for c in combos:
        start = {"action": "sessionStart", "type": kind, "settings": c}
        start.update(where)
        steps.append(start)
        steps.append({"action": "sessionAbandon"})
    return steps


def add(S, lvl):
    r1, k1, v1 = lvl(1, "radical"), lvl(1, "kanji"), lvl(1, "vocabulary")
    r2, k2, v2, kv2 = lvl(2, "radical"), lvl(2, "kanji"), lvl(2, "vocabulary"), lvl(2, "kana_vocabulary")
    r3, k3, v3, kv3 = lvl(3, "radical"), lvl(3, "kanji"), lvl(3, "vocabulary"), lvl(3, "kana_vocabulary")

    # 22 due reviews over levels 1-3 (user level 3), all four types, stages 1-8, due from 1 to 300 hours ago, so every
    # order key, the overdue test (20 % of the stage interval by default) and the level-up path have ties and spreads.
    def row(i, stage, hours):
        return {"id": i, "stage": stage, "availableInHours": -hours}
    due = [row(r1[0], 8, 300), row(r1[1], 6, 2), row(k1[0], 7, 100), row(k1[1], 5, 1), row(v1[0], 4, 30),
           row(v1[1], 2, 1), row(r2[0], 5, 50), row(k2[0], 3, 3), row(k2[1], 1, 1), row(v2[0], 6, 200),
           row(kv2[0], 2, 10), row(kv2[1], 4, 1), row(r3[0], 1, 2), row(r3[1], 3, 1), row(k3[0], 2, 5),
           row(k3[1], 4, 1), row(k3[2], 1, 1), row(k3[3], 3, 12), row(v3[0], 1, 1), row(v3[1], 7, 1),
           row(kv3[0], 5, 1), row(kv3[1], 8, 2)]
    review_start = {"generate": {"userLevel": 3, "rows": due}}

    combos = [s(review_order=o) for o in REVIEW_ORDERS]
    combos += [s(review_order="LEVEL_THEN_TYPE", review_order_reversed=True),
               s(review_order="SRS", review_order_reversed=True),
               s(review_order="SHUFFLE", review_order_reversed=True),
               s(review_order="SHUFFLE", review_order_overdue_first=True),
               s(review_order="LEVEL", review_order_overdue_first=True),
               s(review_order="LEVEL", review_order_overdue_first=True, review_order_reversed=True),
               s(review_order="LEVEL", review_order_overdue_first=True, overdue_threshold="100"),
               s(review_order="LEVEL", review_order_overdue_first=True, overdue_threshold="0"),
               s(review_order="LEVEL", review_order_overdue_first=True, overdue_threshold="abc"),
               s(review_order="BOGUS"),
               s(review_order="TYPE", review_order_priority="BOGUS"),
               dict(s(review_order="LEVEL", review_order_priority="RADICALS_FIRST"), enable_advanced=False)]
    combos += [s(review_order="TYPE", review_order_priority=p) for p in PRIORITIES[1:]]
    combos += [s(review_order="SRS", review_order_priority="LEVEL_UP_FIRST", review_order_reversed=True,
                 review_order_overdue_first=True),
               s(review_order="LEVEL", review_shuffle_after_selection=True),
               s(review_order="LEVEL_THEN_TYPE", review_shuffle_after_selection=True,
                 max_review_session_size="8")]
    S["session-order-review"] = {
      "description": "Review order settings: the same 22 due reviews (levels 1-3, all four types, stages 1-8, due 1 to 300 h ago, user level 3) started under every review order, reversed, overdue first (with overdue thresholds 100 %, 0 and an invalid one: both fall back to 20 %), each priority, invalid values (SHUFFLE / no priority), enable_advanced off (the settings are ignored), and shuffle after selection (one bucket); each start is abandoned. The items' order and bucket in each start's session state are what the settings produce from the seeded shuffle.",
      "mode": "WANIKANI", "seed": 41,
      "start": review_start,
      "steps": starts("REVIEW", {"where": {}}, combos)}

    sizes = ["5", "1", "22", "50", "0", "-3", "x", "", None]
    combos = [s(review_order="LEVEL_THEN_SRS", max_review_session_size=n) for n in sizes]
    combos += [dict(s(max_review_session_size="4"), enable_advanced=False)]
    rule = lambda **kw: s(review_order="LEVEL_THEN_SRS", max_review_session_size="8",
                          **{"review_subjects_" + k: v for k, v in kw.items()})
    combos += [rule(radical_min=4), rule(radical_max=0), rule(kanji_min=5, kanji_max=5), rule(vocabulary_min=4),
               rule(current_min=6), rule(current_max=1), rule(earlier_min=7), rule(earlier_max=0, current_max=0),
               rule(kana_vocabulary_min=4), rule(kana_vocabulary_max=0), rule(vocabulary_min=3, kana_vocabulary_max=0),
               rule(kana_vocabulary_max=1, radical_max=0, kanji_max=0, vocabulary_max=0),
               rule(radical_min=3, current_min=3), rule(radical_min=8, kanji_min=8),
               rule(radical_min=-5), rule(current_max=-1),
               rule(kana_vocabulary_max=1), rule(kana_vocabulary_min=2, kana_vocabulary_max=2),
               rule(kana_vocabulary_min=3, vocabulary_max=0), rule(radical_min=0, radical_max=-1, kanji_min=0)]
    S["session-size-review"] = {
      "description": "Review session size and subject selection: the 22 due reviews of session-order-review in LEVEL_THEN_SRS order, max_review_session_size 5, 1, 22, 50, then invalid values (0, -3, x, empty, unset: 100); it applies with enable_advanced off too. Then with a size of 8 the subject selection rules (min/max per age: current level / earlier levels, and per type): the selection runs in five passes (both a min and an age min, a min without exceeding a max, any min, nothing exceeded, anything) and the chosen 8 are put back in session order. Kana-only vocabulary has its own count (ordinary vocabulary rules don't include it): a kana-only maximum of 1 takes one kana-only item in the passes that respect maximums; with every other type at 0 the last pass (anything, while the session isn't full) still fills up with the rest in order. Rules that are all explicit no-ops (min 0, max -1) take the first 8 in order, the same as no rules.",
      "mode": "WANIKANI", "seed": 43,
      "start": review_start,
      "steps": starts("REVIEW", {"where": {}}, combos)}

    # Lessons: user level 2, levels 1-2 entirely unlocked and not started (radicals, kanji, vocabulary, kana-only).
    lesson_start = {"generate": {"userLevel": 2, "levels": [1, 2], "stage": 0}}
    combos = [s(lesson_order=o) for o in LESSON_ORDERS]
    combos += [s(lesson_order=o, lesson_order_reversed=True) for o in LESSON_ORDERS]
    combos += [s(lesson_order="TYPE_THEN_LEVEL", lesson_order_priority=p) for p in PRIORITIES[1:]]
    combos += [s(lesson_order="LEVEL_THEN_TYPE", lesson_shuffle_after_selection=True, max_lesson_session_size="10"),
               s(lesson_order="BOGUS"),
               dict(s(lesson_order="TYPE_THEN_LEVEL", lesson_order_reversed=True), enable_advanced=False)]
    combos += [s(lesson_order="TYPE_THEN_LEVEL", max_lesson_session_size=n) for n in ["1", "12", "500", "0", "abc"]]
    lrule = lambda **kw: s(lesson_order="TYPE_THEN_LEVEL", max_lesson_session_size="10",
                           **{"lesson_subjects_" + k: v for k, v in kw.items()})
    combos += [lrule(vocabulary_min=3), lrule(kanji_min=4, radical_max=2), lrule(current_min=10),
               lrule(earlier_max=0), lrule(kana_vocabulary_min=2), lrule(Kana_vocabulary_min=2),
               lrule(kana_vocabulary_max=0, vocabulary_min=10),
               lrule(kana_vocabulary_min=3, vocabulary_max=0), lrule(kana_vocabulary_max=1, radical_max=0)]
    S["session-order-lesson"] = {
      "description": "Lesson order and size: user level 2 with every level 1 and 2 subject an unlocked lesson; a lesson session (abandoned in the presentation) under each lesson order, each reversed (shuffle orders shuffle first, the others keep the lesson queue order for ties), each priority, shuffle after selection, an invalid order (LEVEL_THEN_TYPE), enable_advanced off; max_lesson_session_size 1, 12, 500 and invalid values (0, abc: 5); subject selection rules with a size of 10. The kana-only vocabulary minimum is read from lesson_subjects_kana_vocabulary_min, the key the settings screen writes; the old misspelled key lesson_subjects_Kana_vocabulary_min (capital K) is ignored. Kana-only vocabulary has its own count.",
      "mode": "WANIKANI", "seed": 47,
      "start": lesson_start,
      "steps": starts("LESSON", {"where": {}}, combos)}

    study = k1[:4] + r1[:3] + v1[:3] + k2[:3] + kv2[:2] + r3[:2]
    study_start = {"generate": {"userLevel": 2, "levels": [1, 2], "stage": 5, "availableInHours": 50,
                                "rows": [{"id": r3[0], "stage": 1, "availableInHours": -1},
                                         {"id": r3[1], "stage": 0}, {"id": k1[0], "stage": 9},
                                         {"id": k1[1], "stage": 3, "availableInHours": -40}]}}
    combos = [s(self_study_order=o) for o in ["SHUFFLE", "LEVEL", "TYPE", "SRS", "SRS_THEN_LEVEL_THEN_TYPE"]]
    combos += [s(self_study_order="SRS", self_study_order_reversed=True),
               s(self_study_order="LEVEL", self_study_order_overdue_first=True),
               s(self_study_order="TYPE", self_study_order_priority="CURRENT_LEVEL_FIRST"),
               s(self_study_order="TYPE", self_study_order_priority="LEVEL_UP_FIRST"),
               s(self_study_order="LEVEL", self_study_shuffle_after_selection=True),
               s(self_study_order="LEVEL", max_self_study_session_size="6"),
               s(self_study_order="LEVEL", max_self_study_session_size="6", self_study_subjects_radical_min=4),
               s(self_study_order="LEVEL", max_self_study_session_size="6", self_study_subjects_current_max=0),
               dict(s(self_study_order="LEVEL", max_self_study_session_size="3"), enable_advanced=False)]
    S["session-order-self-study"] = {
      "description": "Self-study order and size: 17 chosen subjects (levels 1-3: Guru not due, a burned kanji, a due Apprentice kanji, a lesson radical and a level 3 radical above the user level) under self-study orders, reversed, overdue first, priorities, shuffle after selection, max_self_study_session_size with and without selection rules, and the size alone with enable_advanced off.",
      "mode": "WANIKANI", "seed": 53,
      "start": study_start,
      "steps": starts("SELF_STUDY", {"ids": study}, combos)}

    # Question sequencing: answered to the end, all correct unless noted.
    seq_due = [row(i, 3, 2) for i in k1[:12]] + [row(i, 2, 2) for i in v1[:3]] + [row(i, 4, 2) for i in r1[:2]]
    seq_start = {"generate": {"userLevel": 2, "rows": seq_due}}
    variants = [
        ("default", {}),
        ("back-to-back", {"review_back_to_back": True}),
        ("reading-first", {"review_reading_first": True}),
        ("meaning-first", {"review_meaning_first": True}),
        ("reading-and-meaning-first", {"review_reading_first": True, "review_meaning_first": True}),
        ("back-to-back-reading-first", {"review_back_to_back": True, "review_reading_first": True}),
        ("type-order-buckets", {"review_order": "TYPE"}),
    ]
    for name, extra in variants:
        S["session-sequence-review-" + name] = {
          "description": "Question sequencing in a review session of 12 kanji, 3 vocabulary and 2 radicals (" + name + "): Session.chooseQuestion picks at random among the first bucket's candidates, after the filters: back-to-back (only started items while any is), reading first / meaning first (an item with both questions pending offers only that one), at most 10 started items, and a wrongly answered item waits 3 questions (one meaning and one reading wrong). resolved.answers is the order the questions came in.",
          "mode": "WANIKANI", "seed": 59,
          "start": seq_start,
          "steps": [
            {"action": "sessionStart", "type": "REVIEW", "where": {}, "settings": s(**extra)},
            {"action": "sessionAnswer", "until": "finishing",
             "rules": {str(k1[2]) + ":meaning": ["wrong"], str(k1[5]) + ":reading": ["wrong"]}},
            {"action": "sessionFinish"}]}

    lesson_seq_start = {"generate": {"userLevel": 1, "levels": [1], "objects": ["radical"], "stage": 5,
                                     "rows": [{"id": i, "stage": 0} for i in k1[:6]]}}
    for name, extra in [("default", {}), ("back-to-back", {"lesson_back_to_back": True}),
                        ("reading-first", {"lesson_reading_first": True}),
                        ("meaning-first-back-to-back", {"lesson_meaning_first": True, "lesson_back_to_back": True})]:
        S["session-sequence-lesson-" + name] = {
          "description": "Question sequencing in a lesson quiz of 6 kanji, max_lesson_session_size 6 (" + name + "); one reading answered wrong.",
          "mode": "WANIKANI", "seed": 61,
          "start": lesson_seq_start,
          "steps": [
            {"action": "sessionStart", "type": "LESSON", "where": {}, "settings": s(max_lesson_session_size="6", **extra)},
            {"action": "sessionStartQuiz"},
            {"action": "sessionAnswer", "until": "finishing", "rules": {str(k1[1]) + ":reading": ["wrong"]}}]}

    S["session-sequence-self-study-meaning-first"] = {
      "description": "Question sequencing in self-study (self_study_meaning_first and self_study_back_to_back, LEVEL order) of 8 kanji and 2 vocabulary across levels 1 and 2.",
      "mode": "WANIKANI", "seed": 67,
      "start": {"generate": {"userLevel": 2, "levels": [1], "stage": 5}},
      "steps": [
        {"action": "sessionStart", "type": "SELF_STUDY", "ids": k1[:5] + k2[:3] + v1[:2],
         "settings": s(self_study_meaning_first=True, self_study_back_to_back=True, self_study_order="LEVEL")},
        {"action": "sessionAnswer", "until": "finishing"},
        {"action": "sessionFinish"}]}

    # Lightning mode. 444 is "Person": "Persn" is close enough (a near match).
    light_due = [row(i, 3, 2) for i in k1[:6]]
    typo = {str(k1[4]) + ":meaning": [{"text": "Persn"}], str(k1[3]) + ":meaning": ["wrong"]}
    S["session-lightning-mode"] = {
      "description": "Lightning mode (enable_lightning_mode, default on) as SessionActivity decides it after each answer (Session.lightningAdvancesNow): a correct answer advances at once, a wrong one waits for Next; with close_enough_action ACCEPT_WITH_TOAST_NO_LM a close-enough answer lingers (Next needed), with ACCEPT_WITH_TOAST it advances. The Lightning special button (TOGGLE_LIGHTNING_MODE) turns it off and on for the session only (its label is struck through while off); a new (self-study) session turns it back on; with the setting off nothing advances at once and the button cannot turn it on.",
      "mode": "WANIKANI", "seed": 71,
      "start": {"generate": {"userLevel": 1, "rows": light_due}},
      "steps": [
        {"action": "sessionStart", "type": "REVIEW", "where": {},
         "settings": s(review_order="LEVEL", close_enough_action="ACCEPT_WITH_TOAST_NO_LM")},
        {"action": "sessionAnswer", "count": 6, "advance": "app", "rules": typo},
        {"action": "sessionButton", "button": "TOGGLE_LIGHTNING_MODE"},
        {"action": "sessionAnswer", "count": 2, "advance": "app"},
        {"action": "sessionButton", "button": "TOGGLE_LIGHTNING_MODE"},
        {"action": "sessionAnswer", "until": "finishing", "advance": "app"},
        {"action": "sessionButton", "button": "TOGGLE_LIGHTNING_MODE"},
        {"action": "sessionFinish"},
        {"action": "sessionStart", "type": "SELF_STUDY", "ids": k1[:6],
         "settings": s(self_study_order="LEVEL", close_enough_action="ACCEPT_WITH_TOAST")},
        {"action": "sessionButton", "button": "TOGGLE_LIGHTNING_MODE", "count": 2},
        {"action": "sessionAnswer", "until": "finishing", "advance": "app", "rules": typo},
        {"action": "sessionFinish"},
        {"action": "sessionStart", "type": "SELF_STUDY", "ids": k1[:6],
         "settings": s(self_study_order="LEVEL", enable_lightning_mode=False)},
        {"action": "sessionButton", "button": "TOGGLE_LIGHTNING_MODE"},
        {"action": "sessionAnswer", "until": "finishing", "advance": "app"},
        {"action": "sessionFinish"}]}
