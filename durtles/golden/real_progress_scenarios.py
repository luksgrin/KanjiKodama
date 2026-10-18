# The owner's real phone export (web/test/golden/progress/android-export.json, pushed to the device by run.sh):
# restored with the clock at its exportedAt, then the dashboard over the next week and a review session. Snapshots
# record export deltas (exportMode "delta") so the 750 KB file isn't repeated per step.
# Imported by make_scenarios.py, which writes every definition.
import json, os

from session_order_scenarios import BASE

HOUR = 3600000
DAY = 24 * HOUR


def add(S, lvl):
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "web", "test", "golden", "progress",
                        "android-export.json")
    with open(path) as f:
        t = json.load(f)["exportedAt"]
    S["real-progress"] = {
      "description": "The owner's phone export (JLPT, level 6, 1,034 started subjects): restore at its exportedAt from the empty base state, the dashboard (timeline, level progress, SRS breakdown) then, 1 h and 1 day later, a review session a day later (the first 3 meaning questions wrong, wrap-up after 12 answers), and the dashboard after it and a week later. The file has no lessons left (every unlocked subject is started), so there is no lesson session. Snapshots carry exportDelta (changed fields and subject rows) instead of the whole export.",
      "mode": "JLPT", "start": None, "exportMode": "delta",
      "steps": [
        {"action": "restore", "pushed": "progress/android-export.json", "atMs": t},
        {"action": "dashboard"},
        {"action": "dashboard", "advanceHours": 1},
        {"action": "dashboard", "atMs": t + DAY},
        {"action": "sessionStart", "type": "REVIEW", "where": {}, "settings": BASE},
        {"action": "sessionAnswer", "count": 12, "spacingSeconds": 8, "rules": {"meaning": ["wrong", "wrong", "wrong"]}},
        {"action": "sessionWrapUp"},
        {"action": "sessionAnswer", "until": "finishing", "spacingSeconds": 8},
        {"action": "sessionFinish"},
        {"action": "dashboard"},
        {"action": "dashboard", "atMs": t + 7 * DAY}]}
