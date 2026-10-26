# KanjiKodama 漢字木霊

A personal, offline Android app for learning kanji with spaced repetition: radicals, kanji and
vocabulary in WaniKani's level order, with extra notes on how phonetic components predict on'yomi
readings. It began as a fork of [Smouldering Durtles](https://github.com/jerryhcooke/smouldering_durtles)
(Apache-2.0, the Java app in `durtles/`). Since the cutover (issue #3, step 6) the Android app and
the iPhone web app (PWA) are built from one TypeScript codebase in `web/` (React + Vite +
Capacitor). The Java app stays in the repository for reference and rollback; it is no longer the
daily build.

## Features

- **Offline lessons and reviews.** All lesson content ships inside the app. Nothing needs an
  account or a network connection, apart from optional audio downloads.
- **Local progression.** SRS stages, unlocks and level-ups are computed on the device. A level is
  passed when 90% of its kanji reach Guru. Components unlock kanji, and kanji unlock vocabulary.
- **Parts and sound.** Kanji pages show each kanji's components and which one carries the sound,
  how reliably that component predicts the reading, and the other kanji in the same sound series,
  ordered by level.
- **Progress backup.** Settings → Progress saves all progress as a plain JSON file through the
  system file picker. Choose Google Drive there to keep the copy in the cloud. The same section can
  restore a saved file.
- **WaniKani import.** Settings → Progress → Import progress from WaniKani takes a personal API token
  and replaces local progress with the account's progress. This is the only time the app talks to
  WaniKani, and it asks for confirmation first.
- **Server mode.** Settings → Progress → Server connection switches from local mode to a
  WaniKani-compatible server such as [OpenKani](https://github.com/sarmientoF/OpenKani) (or
  WaniKani itself). The server then decides SRS stages, unlocks and level-ups, and lessons and
  reviews are sent to it, as in upstream Smouldering Durtles. Sign in with the server's token, or
  give a WaniKani token and let an OpenKani server copy your WaniKani data once and hand back its
  own token. There is no default server: progress lives on the server you enter, so use your own
  OpenKani instance or one you trust.
  JLPT order, the extra kanji, fast travel and the level test are local mode only. Switching
  either way replaces the progress on the device (with an offer to save it first); going back to
  local mode can bring the server's progress along. `http://` addresses work for a server on the
  home network.
- **Two curriculum orders.** Settings → Progress → Curriculum order switches between WaniKani's
  60 levels and JLPT order: N5, N4, N3, N2, N1, then an Obscure block for WaniKani kanji on no
  JLPT list. Progress on every item is shared; switching only changes what unlocks next, and
  places you on the first level where you have mastered less than 60% of the kanji. Locked kanji
  below that level unlock right away as lessons.
- **Fast travel (JLPT order).** From the main menu, jump up to 5 levels ahead. The kanji and
  vocabulary you skip go on probation: they come up as reviews over the next 3 days, a correct
  answer moves them to Guru and a wrong one sends them back to your lessons. The next jump
  unlocks after 3 days, once every probation item has been answered.
- **Kanji WaniKani never taught.** The 259 JLPT kanji missing from WaniKani's content (all N1,
  mostly name kanji such as 彦, 浩 and 鷹) are part of JLPT order, at the end of the N1 block. Each
  has hand-written meaning and reading mnemonics in WaniKani's style, and up to three common words
  with example sentences.
- **Kanji level test.** From the main menu: two short quizzes (about 30 kanji, then about 18 from
  the block where your knowledge thins out) estimate how far your kanji knowledge reaches in JLPT
  order. You can then start there: the kanji you answered right go to Guru, and what you skip goes
  on probation over 7 days, like a fast-travel jump.
- **Pixel Forest theme.** Pastel greens, pixel fonts for Latin text, rounded panels, in light and
  dark variants. Japanese text always uses Zen Maru Gothic and never a pixel font.

## Installing

Android releases are built locally with `web/scripts/release-android.sh` (no GitHub Actions
minutes; the workflows in `.github/workflows/` are manual only). It writes a signed
`web/release/kanjikodama-<version>.apk` and prints the commands to install and publish it; it
never publishes anything itself.

```sh
cd web
sh scripts/release-android.sh                  # versionCode 1000, id app.kanjikodama.wk
adb install -r release/kanjikodama-0.6.0.apk   # or copy it to the phone and open it
# Publishing is your call (private repository), e.g.:
gh release create v0.6.0 release/kanjikodama-0.6.0.apk --title "KanjiKodama 0.6.0"
```

The APK has the Java app's id (`app.kanjikodama.wk`) and is signed with the same key, so it installs
over the Java app and keeps its data. `versionCode` starts at 1000, above every Java release
(`100 + run number`); raise it for each later release (`--version-code 1001`). Android 7.0 (API 24)
or newer is needed (Capacitor 8); the Java app ran on API 21.

**First switch from the Java app:** follow [docs/cutover.md](docs/cutover.md). In short: save a
progress file in the Java app first, install the new APK over it, and on the first start the app
offers to move the Java app's progress, settings and API token ("Move progress from the old
app?"). Removing the old app's data is offered afterwards and only done when you tap Remove.

**Rollback:** Android doesn't install an older app (the Java APK, lower `versionCode`) over a newer
one, so the progress file is the way back: save progress in the new app (to Google Drive or copy it
off the phone: uninstalling deletes the app's own files in Downloads), uninstall it, install the
Java APK, and restore the file there (Settings → Progress → Restore progress from a file). Files
from either app restore in the other.

To move to another phone, save progress to a file on the old one and restore it on the new one.

**iPhone:** the PWA (`web/`, `npm run build`, see `web/SPIKE.md`) is added to the home screen
from Safari. It is not deployed anywhere publicly.

## Building

Requirements: Node 22.18+, JDK 21 (`brew install openjdk@21`), the Android SDK.

```sh
cd web
npm ci
npm run check                 # typecheck, tests, leak check, build
npm run build && npx cap sync android
cd android
./gradlew assembleDebug       # id app.kanjikodama.wk.debug (same id and debug key as the Java debug app)
./gradlew assembleRelease     # id app.kanjikodama.wk, signed with keystore.properties
./gradlew assembleDebug -PsideBySide   # id app.kanjikodama.wk.web, installs next to the Java app
```

`-PsideBySide` builds the pre-cutover variant `app.kanjikodama.wk.web` (both build types, also
`release-android.sh --side-by-side`), for keeping the Java app and the new app installed together.
Its data is separate from the Java app's, so it has nothing to migrate: use a progress file.

### Signing

Release builds read `web/android/keystore.properties` (git-ignored; see
`web/android/keystore.properties.example`). It points at the Java app's key,
`storeFile=../../durtles/release.jks` (relative to `web/android/`), with the same passwords as
`durtles/keystore.properties`. Both `durtles/release.jks` and the properties files are git-ignored.
**Keep an offline backup of `durtles/release.jks` and its passwords** (not in the repository, not
in a cloud folder you don't control): if the key is lost, no later release can update the
installed app. Check a release with
`apksigner verify --print-certs web/release/kanjikodama-<version>.apk`: the SHA-256 digest must be
`1574375e279257ca59935c981e3e3727ce244ba727b38a5fc49a2b759e937741` (the Java release key).

### Old Java app (`durtles/`, kept for reference)

Requirements: JDK 17+ (Android Studio's bundled JBR works), the Android SDK, Python 3, and the `gh`
CLI logged in to an account that can read
[luksgrin/KanjiKodamaData](https://github.com/luksgrin/KanjiKodamaData).

```sh
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"   # macOS example
cd durtles
./gradlew assembleDebug      # "KanjiKodama - Debug", id app.kanjikodama.wk.debug
./gradlew assembleRelease    # id app.kanjikodama.wk
```

The debug and release builds have different application ids, so both can be installed side by
side. Release builds use `durtles/keystore.properties` and `durtles/release.jks` (git-ignored, see
`durtles/keystore.properties.example`); without them they are signed with the debug key. The manual
**Release APK (manual)** workflow restores the same key from the `RELEASE_KEYSTORE_BASE64`,
`RELEASE_STORE_PASSWORD`, `RELEASE_KEY_ALIAS` and `RELEASE_KEY_PASSWORD` secrets, and reads the
lesson content with the `KANJIKODAMA_DATA_TOKEN` secret.

### Lesson content

The lesson database `durtles/app/src/main/assets/wk-content.db` is generated before every build by
`durtles/tools/build_wk_asset.py` and is git-ignored. It contains WaniKani's content (radicals,
kanji, vocabulary, mnemonics, context sentences), used with permission for personal use, with every
progress field cleared.

- If a WaniKani data dump is present in `wani-data/` (git-ignored, never committed), the script
  builds the asset from it.
- Otherwise it downloads the cleaned asset from the private release pinned in
  `durtles/tools/wk-content.lock.json` and checks its sha256.
- Without either, the app still builds, but has no lessons.

Three committed assets come from the content pipeline:
`durtles/app/src/main/assets/sound-components.db` (components and sound series),
`durtles/app/src/main/assets/jlpt-kanji.tsv` (the JLPT level of each kanji, with corrections in
`content/jlpt_overrides.yaml`) and `durtles/app/src/main/assets/extra-kanji.db` (the JLPT kanji
WaniKani lacks: KANJIDIC2 meanings and readings, JMdict words, Tatoeba sentences, and the
mnemonics in `content/mnemonics/extra-*.yaml`). `export-extra` also reads the lesson content to
know which kanji are missing, and `export-extra --brief FILE` writes what a mnemonic writer needs:

```sh
cd tools/content
uv sync
uv run kanjikodama-content export-sound
uv run kanjikodama-content export-jlpt
uv run kanjikodama-content export-extra
uv run pytest
```

App unit tests (JLPT order, placement, level test): `cd durtles && ./gradlew testDebugUnitTest`.

### Logo

`durtles/tools/make_logo.py` draws the pixel logo (a torii with a sprouting kodama under it)
and writes the launcher icons, the monochrome themed-icon layer, the notification icon, and
`kanjikodama-logo.svg` / `kanjikodama-logo-512.png`:

```sh
uv run durtles/tools/make_logo.py
```

## Repository layout

```
web/                     The app: TypeScript (React + Vite), PWA and Capacitor Android
  src/                   core/ (logic, golden-tested against Java), app/, ui/, platform/,
                         progress/ (save, restore, legacy migration), storage/, sync/
  android/               Capacitor Android project (native plugins in app/src/main/java)
  scripts/               check.sh, content build, release-android.sh
durtles/                 The old Java app (Smouldering Durtles fork), kept for reference
  app/src/main/java/com/smouldering_durtles/wk/local/
                         KanjiKodama additions: offline mode, local progression, sound
                         components, curriculum orders, fast travel, level test, extra
                         kanji, progress save / restore
  tools/                 Content asset builder, logo generator, content lock file
tools/content/           Python pipeline for open kanji data (KANJIDIC2, KRADFILE, JMdict,
                         KanjiVG, JLPT lists) that produces sound-components.db and
                         jlpt-kanji.tsv
content/                 Hand-authored component, mnemonic, sound-series and JLPT overrides
docs/                    Spec and implementation plan
app/, core/, feature/    Standalone Kotlin/Compose app built only from open data
                         (JLPT-ordered N5 and N4 content)
.github/workflows/       CI and the Java release workflow, both manual only (workflow_dispatch)
```

## Credits

KanjiKodama is made by luksgrin. Infinite thanks to
[Smouldering Durtles](https://github.com/jerryhcooke/smouldering_durtles) by Jerry Cooke, and to
Flaming Durtles by Ernst Jan Plugge, on which it is based. The app's About screen lists everything
else: content from WaniKani (Tofugu), open data from EDRDG and KanjiVG, and the fonts Silkscreen,
Pixelify Sans and Zen Maru Gothic (SIL Open Font License).

KanjiKodama is not affiliated with or endorsed by Tofugu or WaniKani.

## License

Apache License 2.0, see [LICENSE](LICENSE).
