#!/bin/zsh
# Builds, installs and runs the Tier B golden tests on the connected emulator, then pulls the output.
# Back up the debug app first: the run resets its progress.
# usage: durtles/golden/run.sh <outdir> [test-filter] [scenario,names]
# With more than one device attached, set ANDROID_SERIAL (adb reads it) to pick one.
set -e
if [[ -z "$ANDROID_SERIAL" && $(~/Library/Android/sdk/platform-tools/adb devices | grep -c 'device$') -gt 1 ]]; then
  echo "several devices attached: set ANDROID_SERIAL" >&2; exit 1
fi
OUT=$1; FILTER=${2:-com.smouldering_durtles.wk.test.golden.ScenarioGoldenTest}
SCEN=()
[[ -n "$3" ]] && SCEN=(-e scenario "$3")
export PATH=$PATH:~/Library/Android/sdk/platform-tools
cd "$(dirname "$0")/.."
export JAVA_HOME="$(brew --prefix openjdk@21)/libexec/openjdk.jdk/Contents/Home"
until mkdir /tmp/claude-501/kk-durtles-gradle.lock 2>/dev/null; do sleep 5; done
# a failed build must stop here, or the run would test the APK left over from an earlier build
if ! ./gradlew -q assembleDebug assembleDebugAndroidTest > /tmp/claude-501/kk-run-build.$$.log 2>&1; then
  grep -E "error:|FAILED|What went wrong" -A3 /tmp/claude-501/kk-run-build.$$.log | head -40 >&2
  rmdir /tmp/claude-501/kk-durtles-gradle.lock; exit 1
fi
rm -f /tmp/claude-501/kk-run-build.$$.log
# install while still holding the lock, so another build can't replace the APKs halfway
adb install -r app/build/outputs/apk/debug/app-debug.apk >/dev/null
adb install -r app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk >/dev/null
rmdir /tmp/claude-501/kk-durtles-gradle.lock
adb shell rm -rf /sdcard/Android/data/app.kanjikodama.wk.debug/files/golden
# inputs too large to keep twice in git are pushed instead of packed as test assets (ScenarioRunner.readPushed)
adb shell mkdir -p /sdcard/Android/data/app.kanjikodama.wk.debug/files/golden-in/progress
adb push ../web/test/golden/progress/android-export.json /sdcard/Android/data/app.kanjikodama.wk.debug/files/golden-in/progress/ >/dev/null
# progress files written by the TS port (ScenarioGoldenTest#progressTsExports)
adb shell rm -rf /sdcard/Android/data/app.kanjikodama.wk.debug/files/golden-in/progress/ts-export
adb push ../web/test/golden/progress/ts-export /sdcard/Android/data/app.kanjikodama.wk.debug/files/golden-in/progress/ >/dev/null
adb logcat -c
start=$(date +%s)
adb shell am instrument -w -e class $FILTER "${SCEN[@]}" com.smouldering_durtles.wk.test/androidx.test.runner.AndroidJUnitRunner | tail -8
echo "instrument took $(( $(date +%s) - start )) s"
rm -rf $OUT; mkdir -p $OUT
adb pull /sdcard/Android/data/app.kanjikodama.wk.debug/files/golden $OUT/ | tail -1
