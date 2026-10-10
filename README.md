# MojiMori 文字森

A personal Android app for learning kanji the WaniKani way, organised by JLPT block and built
around kanji components: what each part means, which part carries the sound, and how to guess
on'yomi from it. Open data only, no accounts, no paid services.

- [Product & technical spec](docs/spec.md)
- [Implementation plan](docs/plan.md)

## Status

Pivoted on 2026-10-10 to an offline fork of Smouldering Durtles in `durtles/`, loaded with a
private WaniKani content dump (see the pivot section of `docs/plan.md`). It runs fully offline in
WaniKani order with local unlocks and level-ups. Next: clean-up, then component/on'yomi teaching,
then a JLPT curriculum mode.

Building the fork (the content asset is generated from `wani-data/` if present):

```sh
cd durtles
./gradlew assembleDebug        # installs as "MojiMori - Debug", id app.mojimori.wk.debug
```

The sections below describe the earlier Kotlin app, kept for reference.

## Building

Requirements: JDK 17+ (Android Studio's bundled JBR works), Android SDK with platform 37 and
build-tools 36 (AGP downloads missing platforms when licences are accepted), `uv` for the
content pipeline.

```sh
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"   # macOS example
./gradlew build                      # compile, lint, unit tests, debug APK
./gradlew :app:installDebug          # install on a connected device
```

Release builds sign with the debug key unless `keystore.properties` exists
(see `keystore.properties.example`). The "Release APK (manual)" workflow in GitHub Actions builds a release APK on demand.

Content pipeline (needs the `gh` CLI logged in, because sources come from the private snapshot
repo [MojiMoriData](https://github.com/luksgrin/MojiMoriData)):

```sh
cd tools/content
uv sync
uv run mojimori-content build -b N5 -b N4   # writes out/content.db and out/report.html
uv run pytest
uv run mojimori-content fetch --refresh-upstream && uv run mojimori-content snapshot   # new data freeze
```

## Running on an emulator

Create a device once (the SDK's command-line tools must be installed; the `emulator` binary ships
with the SDK):

```sh
sdkmanager --install "system-images;android-36;google_apis;arm64-v8a"
avdmanager create avd -n mojimori -k "system-images;android-36;google_apis;arm64-v8a" -d pixel_6
emulator -avd mojimori -no-window -no-audio -gpu swiftshader_indirect &   # headless; drop -no-window to watch
./gradlew :app:installDebug && adb shell am start -n app.mojimori.debug/app.mojimori.MainActivity
```

Debug builds use the application id `app.mojimori.debug`, so they can live next to a release build.

## Layout

```
app/                Android application (navigation, DI)
core/model          Pure Kotlin domain types
core/srs            Pure Kotlin SRS, gating and practice sampler (JVM tests)
core/content        Read-only curriculum databases (Room)
core/progress       User progress database (Room)
core/ui             Theme, KanjiText, shared composables
feature/*           Screens
tools/content       Python content pipeline (uv)
content/            Hand-authored YAML and private seed word lists
docs/               Spec and plan
```
