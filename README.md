# KanjiKodama 漢字木霊

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

Releases are built by the **Release APK (manual)** workflow (Actions → Release APK (manual) → Run
workflow). It produces a signed `kanjikodama-<version>.apk`, attached to a GitHub release of this
repository and to the workflow run.

On the phone, download the APK (signed in to GitHub, since the repository is private), open it, and
allow installs from that source when Android asks. Or, from a computer:

```sh
gh release download v0.1.0 --pattern '*.apk'
adb install -r kanjikodama-0.1.0.apk
```

Every release is signed with the same key, so a newer APK installs over the old one and keeps your
progress. To move to another phone, save progress to a file on the old one and restore it on the
new one.

## Building

Requirements: JDK 17+ (Android Studio's bundled JBR works), the Android SDK, Python 3, and the `gh`
CLI logged in to an account that can read
[luksgrin/KanjiKodamaData](https://github.com/luksgrin/KanjiKodamaData).

```sh
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"   # macOS example
cd durtles
./gradlew assembleDebug      # "KanjiKodama - Debug", id app.kanjikodama.wk.debug
./gradlew assembleRelease    # id app.kanjikodama.wk
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

### Signing

Release builds use `durtles/keystore.properties` and `durtles/release.jks`. Both are git-ignored;
see `durtles/keystore.properties.example`. Without them, release builds are signed with the debug
key. The release workflow restores the same key from the `RELEASE_KEYSTORE_BASE64`,
`RELEASE_STORE_PASSWORD`, `RELEASE_KEY_ALIAS` and `RELEASE_KEY_PASSWORD` secrets, and reads the
lesson content with the `KANJIKODAMA_DATA_TOKEN` secret, a fine-grained token with read access to
KanjiKodamaData's contents. Keep a backup of the keystore and its password: if the key is lost, later
releases cannot update an installed app.

### Logo

`durtles/tools/make_logo.py` draws the pixel logo (a torii with a sprouting kodama under it)
and writes the launcher icons, the monochrome themed-icon layer, the notification icon, and
`kanjikodama-logo.svg` / `kanjikodama-logo-512.png`:

```sh
uv run durtles/tools/make_logo.py
```

## Repository layout

```
durtles/                 The app (Smouldering Durtles fork, Java, Gradle)
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
.github/workflows/       CI (builds and tests on every push) and the manual release workflow
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
