#!/usr/bin/env python3
"""Build app/src/main/assets/wk-content.db from the private WaniKani dump in ../wani-data.

The dump is in Smouldering Durtles' own table format. This script keeps only content
(subjects and SRS systems), converts NULL timestamps to 0 (the app's "never"), and resets all
progress so the app starts fresh. The output is git-ignored: WaniKani content is licensed to
the owner for internal use only and must never be committed.

Without a local dump, the cleaned file is downloaded from the private KanjiKodamaData release
pinned in tools/wk-content.lock.json (needs the gh CLI logged in) and checked against its sha256.
If neither is available the script exits 0, so builds without the content still succeed.

Usage: python3 tools/build_wk_asset.py [dump.sql] [out.db]
"""
import glob
import hashlib
import shutil
import subprocess
import tempfile
import json
import os
import sqlite3
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SCHEMA = os.path.join(ROOT, "app/schemas/com.smouldering_durtles.wk.db.AppDatabase/68.json")
DEFAULT_OUT = os.path.join(ROOT, "app/src/main/assets/wk-content.db")

PROGRESS_ZERO = [
    "availableAt", "burnedAt", "passedAt", "resurrectedAt", "startedAt", "unlockedAt", "srsStage",
    "lastIncorrectAnswer", "assignmentId", "studyMaterialId", "reviewStatisticId",
    "meaningCorrect", "meaningIncorrect", "meaningMaxStreak", "meaningCurrentStreak",
    "readingCorrect", "readingIncorrect", "readingMaxStreak", "readingCurrentStreak",
    "percentageCorrect", "leechScore", "levelProgressScore",
]
PROGRESS_FALSE = ["passed", "resurrected", "assignmentPatched", "studyMaterialPatched", "statisticPatched"]
PROGRESS_NULL = ["meaningNote", "meaningSynonyms", "readingNote"]


def find_dump():
    files = [f for f in glob.glob(os.path.join(ROOT, "..", "wani-data", "*.sql"))
             if not os.path.basename(f).startswith("wani-")]
    return max(files, key=os.path.getsize) if files else None


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def fetch_release(out):
    """Download the pinned, already-cleaned content file from the private data repository."""
    lock = json.load(open(os.path.join(HERE, "wk-content.lock.json")))
    if os.path.exists(out) and sha256(out) == lock["sha256"]:
        return  # already the pinned file
    if not shutil.which("gh"):
        print("build_wk_asset: no dump and no gh CLI; building without WaniKani content")
        return
    with tempfile.TemporaryDirectory() as tmp:
        r = subprocess.run(["gh", "release", "download", lock["tag"], "--repo", lock["repo"],
                            "--pattern", lock["asset"], "--dir", tmp], capture_output=True, text=True)
        got = os.path.join(tmp, lock["asset"])
        if r.returncode != 0 or not os.path.exists(got):
            print("build_wk_asset: could not download content release; building without it")
            return
        if sha256(got) != lock["sha256"]:
            raise SystemExit("build_wk_asset: downloaded content does not match the pinned sha256")
        os.makedirs(os.path.dirname(out), exist_ok=True)
        shutil.move(got, out)
        print(f"build_wk_asset: fetched {lock['tag']} from {lock['repo']}")


def main():
    dump = sys.argv[1] if len(sys.argv) > 1 else find_dump()
    out = sys.argv[2] if len(sys.argv) > 2 else DEFAULT_OUT
    if not dump or not os.path.exists(dump):
        fetch_release(out)
        return
    if os.path.exists(out) and os.path.getmtime(out) > max(os.path.getmtime(dump), os.path.getmtime(__file__)):
        return  # up to date

    entities = {e["tableName"]: [f["columnName"] for f in e["fields"]]
                for e in json.load(open(SCHEMA))["database"]["entities"]}
    src = sqlite3.connect(":memory:")
    with open(dump, encoding="utf-8") as f:
        src.executescript(f.read())

    os.makedirs(os.path.dirname(out), exist_ok=True)
    tmp = out + ".tmp"
    if os.path.exists(tmp):
        os.remove(tmp)
    dst = sqlite3.connect(tmp)
    for table in ("subject", "srs_system"):
        cols = entities[table]
        dst.execute(f"CREATE TABLE {table} ({', '.join('`%s`' % c for c in cols)})")
        rows = src.execute(f"SELECT {', '.join('`%s`' % c for c in cols)} FROM {table}").fetchall()
        dst.executemany(f"INSERT INTO {table} VALUES ({', '.join('?' * len(cols))})", rows)

    sets = [f"`{c}` = 0" for c in PROGRESS_ZERO + PROGRESS_FALSE] + [f"`{c}` = NULL" for c in PROGRESS_NULL]
    sets.append("hiddenAt = COALESCE(hiddenAt, 0)")
    dst.execute(f"UPDATE subject SET {', '.join(sets)}")
    # assignment ids must be positive for the app to treat items as having an assignment
    dst.execute("UPDATE subject SET assignmentId = id")
    dst.commit()
    counts = dict(dst.execute("SELECT object, COUNT(*) FROM subject GROUP BY object").fetchall())
    dst.execute("VACUUM")
    dst.close()
    os.replace(tmp, out)
    print(f"build_wk_asset: wrote {out} {counts}")


if __name__ == "__main__":
    main()
