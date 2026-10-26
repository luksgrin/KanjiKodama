#!/bin/sh
# Builds the signed Android release APK locally (issue #3, step 6; replaces .github/workflows/release.yml,
# which needs Actions minutes):
#
#   content (private WaniKani build) -> npm run build -> npx cap sync android -> ./gradlew :app:assembleRelease
#
# Output: web/release/kanjikodama-<version>.apk (git-ignored; it contains the private WaniKani content:
# never commit, upload publicly or deploy it). Prints the certificate and the commands to install and
# publish; it never publishes anything itself.
#
# Usage: sh scripts/release-android.sh [--version-code N] [--side-by-side]
#   --version-code N  default 1000 (must be higher than the installed app's; the Java releases used 100 + run number)
#   --side-by-side    build app.kanjikodama.wk.web instead (installs next to the Java app)
#
# Needs web/android/keystore.properties (git-ignored, see keystore.properties.example) pointing at the
# release key web/android/release.jks (git-ignored; the Java app's key, so updates install over the
# app on the phone; keep an offline backup, see README.md).
set -eu

cd "$(dirname "$0")/.."
WEB="$(pwd)"

VERSION_CODE=1000
SIDE_BY_SIDE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --version-code) VERSION_CODE="$2"; shift 2 ;;
    --side-by-side) SIDE_BY_SIDE="-PsideBySide"; shift ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done

VERSION="$(node -p "require('./package.json').version")"

if [ ! -f android/keystore.properties ]; then
  echo "web/android/keystore.properties is missing: copy android/keystore.properties.example and point it at release.jks." >&2
  echo "Without the release key (the Java app's) the APK can't install over the app on the phone." >&2
  exit 1
fi

if [ -z "${JAVA_HOME:-}" ] && command -v brew >/dev/null 2>&1 && brew --prefix openjdk@21 >/dev/null 2>&1; then
  JAVA_HOME="$(brew --prefix openjdk@21)/libexec/openjdk.jdk/Contents/Home"
  export JAVA_HOME
fi

echo "== KanjiKodama $VERSION (versionCode $VERSION_CODE)${SIDE_BY_SIDE:+, side by side}"
npm run build            # runs the private content build first (npm run content)
npx cap sync android
(cd android && ./gradlew :app:assembleRelease $SIDE_BY_SIDE -PversionCode="$VERSION_CODE" -PversionName="$VERSION")

SRC="android/app/build/outputs/apk/release/app-release.apk"
if [ ! -f "$SRC" ]; then
  echo "No signed APK at $SRC (check keystore.properties)." >&2
  exit 1
fi
mkdir -p release
SUFFIX=""
[ -n "$SIDE_BY_SIDE" ] && SUFFIX="-web"
OUT="release/kanjikodama-$VERSION$SUFFIX.apk"
cp "$SRC" "$OUT"

SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}"
APKSIGNER="$(ls -d "$SDK"/build-tools/*/apksigner 2>/dev/null | sort -V | tail -n 1 || true)"
if [ -n "$APKSIGNER" ]; then
  echo "== Signing certificate (must equal the Java app's: docs/cutover.md)"
  "$APKSIGNER" verify --print-certs "$OUT" | grep -E 'certificate (DN|SHA-256)'
fi

echo
echo "Built $WEB/$OUT"
echo "Install:  adb install -r $OUT"
echo "Publish (private repo, your call; not run by this script):"
echo "  gh release create v$VERSION $OUT --title \"KanjiKodama $VERSION\" --notes \"Capacitor build, versionCode $VERSION_CODE\""
