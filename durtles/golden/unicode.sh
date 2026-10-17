#!/bin/zsh
# Runs the Tier B UnicodeGoldenTest: pushes the JVM answer fixtures to the device, re-runs them there, pulls the
# device fixtures (answers/unicode-android*.json) and the comparison report. The test touches no app data.
# usage: durtles/golden/unicode.sh <outdir>
set -e
OUT=$1
export PATH=$PATH:~/Library/Android/sdk/platform-tools
HERE="$(cd "$(dirname "$0")" && pwd)"
FIX="$HERE/../../web/test/golden/answers"
DEV=/sdcard/Android/data/app.kanjikodama.wk.debug/files
adb shell rm -rf $DEV/golden-in $DEV/golden-report
adb shell mkdir -p $DEV/golden-in/answers
for f in "$FIX"/fuzzy.json "$FIX"/fuzzy-wk-*.jsonl "$FIX"/check-subjects.jsonl "$FIX"/check-synthetic.json \
    "$FIX"/check-{radical-name,kanji-meaning,kanji-reading,kanji-onyomi,kanji-kunyomi,vocab-meaning,vocab-reading,kana-vocab-meaning}-*.jsonl; do
  adb push "$f" $DEV/golden-in/answers/ >/dev/null
done
"$HERE/run.sh" "$OUT" com.smouldering_durtles.wk.test.golden.UnicodeGoldenTest
adb pull $DEV/golden-report "$OUT/" | tail -1
adb shell rm -rf $DEV/golden-in $DEV/golden-report
