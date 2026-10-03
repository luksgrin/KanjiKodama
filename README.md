# MojiMori 文字森

A personal Android app for learning kanji the WaniKani way, organised by JLPT block and built
around kanji components: what each part means, which part carries the sound, and how to guess
on'yomi from it. Open data only, no accounts, no paid services.

- [Product & technical spec](docs/spec.md)
- [Implementation plan](docs/plan.md)

## Status

Phase 0 done: Gradle multi-module scaffold, CI, content-pipeline skeleton. Phase 1 (content
pipeline for N5) is next.

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

Content pipeline:

```sh
cd tools/content
uv sync
uv run mojimori-content build --blocks N5
uv run pytest
```

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
