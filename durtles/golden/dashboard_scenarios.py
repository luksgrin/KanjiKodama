# Dashboard level progress settings (GlobalSettings.Dashboard: show_over_level_progression,
# previous_level_progression_limit, previous_level_progression_limit_amount), through the dashboard action with
# settings. Imported by make_scenarios.py, which writes every definition.
import json, os

# Each step sets all three keys (null removes one: the app default), so no step depends on an earlier one.
def dash(show=None, limit=None, amount=None, **kw):
    step = {"action": "dashboard", "settings": {"show_over_level_progression": show,
                                                "previous_level_progression_limit": limit,
                                                "previous_level_progression_limit_amount": amount}}
    step.update(kw)
    return step

COMBOS = [dash(), dash(show=False, limit=False), dash(show=True), dash(limit=True), dash(limit=True, amount="0"),
          dash(limit=True, amount="1"), dash(limit=True, amount="2"), dash(limit=True, amount="4"),
          dash(limit=True, amount="100"), dash(limit=True, amount="-1"), dash(limit=True, amount="abc"),
          dash(limit=True, amount=""), dash(limit=True, amount=" 1"), dash(limit=False, amount="0"),
          dash(show=True, limit=True, amount="1"), dash(show=True, limit=True, amount="0")]


def add(S, lvl):
    r1, k1, v1 = lvl(1, "radical"), lvl(1, "kanji"), lvl(1, "vocabulary")
    r2, k2, v2, kv2 = lvl(2, "radical"), lvl(2, "kanji"), lvl(2, "vocabulary"), lvl(2, "kana_vocabulary")
    k3, v3, kv3 = lvl(3, "kanji"), lvl(3, "vocabulary"), lvl(3, "kana_vocabulary")
    v4 = lvl(4, "vocabulary")
    r5, k5 = lvl(5, "radical"), lvl(5, "kanji")
    v7, kv7 = lvl(7, "vocabulary"), lvl(7, "kana_vocabulary") or lvl(8, "kana_vocabulary")
    rows = ([{"id": i, "stage": 3, "passed": False} for i in v1[:2]]
            + [{"id": i, "stage": 2, "passed": False} for i in kv2[:2]]
            + [{"id": k3[0], "stage": 4, "passed": False}, {"id": kv3[0], "stage": 1, "passed": False}]
            + [{"id": i, "stage": 1, "passed": False} for i in v4[:3]]
            + [{"id": i, "stage": s} for i, s in zip(r5, [1, 2, 3, 4, 5, 6, 7, 8, 9])]
            + [{"id": k5[0], "stage": 1}]
            + [{"id": v7[0], "stage": 2}, {"id": kv7[0], "stage": 5}])
    S["dashboard-level-progress-settings"] = {
      "description": "Dashboard level progress bars under the dashboard settings, WaniKani order, user level 5: levels 1-4 at Guru except unpassed vocabulary on level 1, kana-only vocabulary on levels 2 and 3, a kanji on level 3, vocabulary on level 4; level 5 radicals at every stage (one burned) and one kanji started; a level 7 vocabulary and a kana-only vocabulary above the user level already started. Each step sets show_over_level_progression, previous_level_progression_limit and its amount: defaults, show over level (bars up to the max level granted: levels above with only locked subjects stay, since computeLevelProgress never sets numLocked), the limit with amount unset (1), 0, 1, 2, 4, 100, -1 (drops the user level's own bars too), unparsable values (abc, empty, ' 1': 1), the amount without the limit (ignored), and both settings together.",
      "mode": "WANIKANI", "exportMode": "delta",
      "start": {"generate": {"userLevel": 5, "levels": [1, 2, 3, 4], "stage": 5, "rows": rows}},
      "steps": COMBOS}

    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "web", "test", "golden", "progress",
                        "android-export.json")
    with open(path) as f:
        t = json.load(f)["exportedAt"]
    S["dashboard-level-progress-settings-real"] = {
      "description": "The owner's phone export (JLPT, level 6) restored at its exportedAt, then the dashboard under the same settings combinations as dashboard-level-progress-settings (show over level: JLPT has 58 levels, so the empty levels 59-60 are dropped; previous level limit 0, 1, 2, 4, 100, -1, unparsable).",
      "mode": "JLPT", "start": None, "exportMode": "delta",
      "steps": [{"action": "restore", "pushed": "progress/android-export.json", "atMs": t}] + COMBOS}
