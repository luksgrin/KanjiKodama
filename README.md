# MojiMori 文字森

A personal, offline Android app for learning kanji with spaced repetition: radicals, kanji and
vocabulary in WaniKani's level order, with extra notes on how phonetic components predict on'yomi
readings. It is a fork of [Smouldering Durtles](https://github.com/jerryhcooke/smouldering_durtles)
(Apache-2.0) and lives in `durtles/`.

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
- **Pixel Forest theme.** Pastel greens, pixel fonts for Latin text, rounded panels, in light and
  dark variants. Japanese text always uses Zen Maru Gothic and never a pixel font.

## Planned

- **JLPT mode.** A second curriculum that teaches kanji in JLPT blocks (N5 → N1, then an "Obscure"
  block with the remaining KANJIDIC2 kanji), finishing each block before starting the next. It
  reuses the same SRS scheduler, and you can switch between it and WaniKani order.

## Installing

Releases are built by the **Release APK (manual)** workflow (Actions → Release APK (manual) → Run
workflow). It produces a signed `mojimori-<version>.apk`, attached to a GitHub release of this
repository and to the workflow run.

On the phone, download the APK (signed in to GitHub, since the repository is private), open it, and
allow installs from that source when Android asks. Or, from a computer:

```sh
gh release download v0.1.0 --pattern '*.apk'
adb install -r mojimori-0.1.0.apk
```

Every release is signed with the same key, so a newer APK installs over the old one and keeps your
progress. To move to another phone, save progress to a file on the old one and restore it on the
new one.

## Building

Requirements: JDK 17+ (Android Studio's bundled JBR works), the Android SDK, Python 3, and the `gh`
CLI logged in to an account that can read
[luksgrin/MojiMoriData](https://github.com/luksgrin/MojiMoriData).

```sh
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"   # macOS example
cd durtles
./gradlew assembleDebug      # "MojiMori - Debug", id app.mojimori.wk.debug
./gradlew assembleRelease    # id app.mojimori.wk
```

The debug and release builds have different application ids, so both can be installed side by side.

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

`durtles/app/src/main/assets/sound-components.db` holds the component and sound-series data. It is
committed, built from open data, and regenerated with the content pipeline:

```sh
cd tools/content
uv sync
uv run mojimori-content export-sound
uv run pytest
```

### Signing

Release builds use `durtles/keystore.properties` and `durtles/release.jks`. Both are git-ignored;
see `durtles/keystore.properties.example`. Without them, release builds are signed with the debug
key. The release workflow restores the same key from the `RELEASE_KEYSTORE_BASE64`,
`RELEASE_STORE_PASSWORD`, `RELEASE_KEY_ALIAS` and `RELEASE_KEY_PASSWORD` secrets, and reads the
lesson content with the `MOJIMORI_DATA_TOKEN` secret, a fine-grained token with read access to
MojiMoriData's contents. Keep a backup of the keystore and its password: if the key is lost, later
releases cannot update an installed app.

### Logo

`durtles/tools/make_logo.py` draws the pixel torii logo (with a Zen Maru Gothic 森 on its plaque)
and writes the launcher icons, the monochrome themed-icon layer, the notification icon, and
`mojimori-logo.svg` / `mojimori-logo-512.png`:

```sh
uv run durtles/tools/make_logo.py
```

## Repository layout

```
durtles/                 The app (Smouldering Durtles fork, Java, Gradle)
  app/src/main/java/com/smouldering_durtles/wk/local/
                         MojiMori additions: offline mode, local progression, sound
                         components, progress save / restore
  tools/                 Content asset builder, logo generator, content lock file
tools/content/           Python pipeline for open kanji data (KANJIDIC2, KRADFILE, JMdict,
                         KanjiVG) that produces sound-components.db
content/                 Hand-authored component, mnemonic and sound-series overrides
docs/                    Spec and implementation plan
app/, core/, feature/    Standalone Kotlin/Compose app built only from open data
                         (JLPT-ordered N5 and N4 content), the groundwork for the JLPT mode
.github/workflows/       CI (builds and tests on every push) and the manual release workflow
```

## Credits

MojiMori is made by luksgrin. Infinite thanks to
[Smouldering Durtles](https://github.com/jerryhcooke/smouldering_durtles) by Jerry Cooke, and to
Flaming Durtles by Ernst Jan Plugge, on which it is based. The app's About screen lists everything
else: content from WaniKani (Tofugu), open data from EDRDG and KanjiVG, and the fonts Silkscreen,
Pixelify Sans and Zen Maru Gothic (SIL Open Font License).

MojiMori is not affiliated with or endorsed by Tofugu or WaniKani.

## License

Apache License 2.0, see [LICENSE](LICENSE).
