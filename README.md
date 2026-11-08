# KanjiKodama 漢字木霊

A personal, offline Android app for learning kanji with spaced repetition: radicals, kanji and
vocabulary in WaniKani's level order, with extra notes on how phonetic components predict on'yomi
readings. It began as a fork of [Smouldering Durtles](https://github.com/jerryhcooke/smouldering_durtles)
(Apache-2.0), a Java Android app. Since the cutover (issue #3, step 6) the Android app and the
iPhone web app (PWA) are built from one TypeScript codebase in `app/` (React + Vite + Capacitor).
The Java app (`durtles/`) is retired and was removed from the repository after commit `94abf2e`;
check out that commit to read or build it.

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

**Releases** come from the manual **Release** workflow (`.github/workflows/release.yml`: GitHub →
Actions → Release (manual) → Run workflow, or `gh workflow run release.yml -f version=0.6.1`). It
publishes a GitHub release `v<version>` with the signed APK (`kanjikodama-<version>.apk`), the
side-by-side APK (`kanjikodama-<version>-web.apk`, id `app.kanjikodama.wk.web`) and the web app build
(`kanjikodama-<version>-pwa.zip`), and deploys the web app to GitHub Pages at
<https://luksgrin.xyz/KanjiKodama/>. The builds contain the WaniKani content, which the owner has
WaniKani's permission to publish. To release:

1. Raise `version` in `app/package.json` (`npm version 0.6.1 --no-git-tag-version` in `app/`),
   commit and push.
2. Run the workflow with that same version. It refuses a version that differs from
   `package.json`'s, or that isn't higher than the latest `v*` tag (versions only grow;
   `app/scripts/release/version.ts`, tested in `app/test/release/`).

The Android `versionCode` is derived from the version: 1000 + major·1,000,000 + minor·1,000 +
patch (0.6.0 → 7000, 0.6.1 → 7001), so it grows with every release and stays above 1000, the
first local 0.6.0 build, and every Java release (`100 + run number`).

Local builds (for testing; nothing is published):

```sh
cd app
sh scripts/release-android.sh                  # id app.kanjikodama.wk, versionCode from the version
adb install -r release/kanjikodama-0.6.0.apk   # or copy it to the phone and open it
```

The APK has the Java app's id (`app.kanjikodama.wk`) and is signed with the same key, so it installs
over the Java app and keeps its data. Android 7.0 (API 24) or newer is needed (Capacitor 8).

**First switch from the Java app:** follow [docs/cutover.md](docs/cutover.md). In short: save a
progress file in the Java app first, install the new APK over it, and on the first start the app
offers to move the Java app's progress, settings and API token ("Move progress from the old
app?"). Removing the old app's data is offered afterwards and only done when you tap Remove.

**Rollback:** Android doesn't install an older app (the Java APK, lower `versionCode`) over a newer
one, so the progress file is the way back: save progress in the new app (to Google Drive or copy it
off the phone: uninstalling deletes the app's own files in Downloads), uninstall it, install a
Java APK (an earlier GitHub release, v0.5.0 or older), and restore the file there
(Settings → Progress → Restore progress from a file). Files from either app restore in the other.

To move to another phone, save progress to a file on the old one and restore it on the new one.

**iPhone:** open <https://luksgrin.xyz/KanjiKodama/> in Safari, then Share → Add to Home Screen.
It works offline after the first start; each release deploys a new version, which the app picks up
the next time it starts online.

## Building

Requirements: Node 22.18+, JDK 21 (`brew install openjdk@21`), the Android SDK.

```sh
cd app
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

Release builds read `app/android/keystore.properties` (git-ignored; see
`app/android/keystore.properties.example`). It points at the release key, `storeFile=release.jks`
(relative to `app/android/`, so `app/android/release.jks`, also git-ignored). This is the key the
Java app was always signed with (it used to live in `durtles/`); the Java app's own properties file
is kept next to it as `app/android/keystore.properties.legacy` (git-ignored, same passwords).

**Keep an offline backup of `app/android/release.jks` and its passwords** (for example on a USB
stick and in a password manager; not in the repository, not in a cloud folder you don't control).
If the key is lost, no later release can ever install over the app on the phone: the only way
forward would be uninstalling it (losing its data) after saving a progress file.

Check a release with `apksigner verify --print-certs app/release/kanjikodama-<version>.apk`: the
SHA-256 digest must be `1574375e279257ca59935c981e3e3727ce244ba727b38a5fc49a2b759e937741`
(`release-android.sh` prints it).

### Lesson content

`cd app && npm run content` (also the first step of `npm run build`) builds the app's content file
`app/public/content/content-<hash>.db` from:

- `content/private/wk-content.db` (git-ignored, never committed): WaniKani's content (radicals,
  kanji, vocabulary, mnemonics, context sentences), used with permission for personal use, with
  every progress field cleared. `tools/build_wk_asset.py` writes it: from a WaniKani data dump in
  `wani-data/` (git-ignored, never committed) if present, otherwise by downloading the cleaned file
  from the private release pinned in `tools/wk-content.lock.json` (needs the `gh` CLI logged in to
  an account that can read [luksgrin/KanjiKodamaData](https://github.com/luksgrin/KanjiKodamaData))
  and checking its sha256. `KK_WK_CONTENT_DB` points the build at another copy.
  `npm run content:public` builds without it (no WaniKani lessons).
- `content/inputs/` (committed, open data): `sound-components.db` (components and sound series),
  `jlpt-kanji.tsv` (the JLPT level of each kanji, with corrections in `content/jlpt_overrides.yaml`),
  `extra-kanji.db` (the JLPT kanji WaniKani lacks: KANJIDIC2 meanings and readings, JMdict words,
  Tatoeba sentences, and the mnemonics in `content/mnemonics/extra-*.yaml`), `raw/` (stroke order,
  pitch accent, JLPT levels, frequency and Jōyō grades, from the Java app; `reference-data/` holds
  the upstream scripts that made them) and `drawable/` (the radical images WaniKani has no
  character for).

The first three come from the content pipeline. `export-extra` also reads
`content/private/wk-content.db` to know which kanji are missing, and `export-extra --brief FILE`
writes what a mnemonic writer needs:

```sh
cd tools/content
uv sync
uv run kanjikodama-content export-sound
uv run kanjikodama-content export-jlpt
uv run kanjikodama-content export-extra
uv run pytest
```

### Golden tests

The TypeScript core is tested against fixtures recorded from the Java app
(`app/test/golden/`, `npx vitest run test/golden`, `npm run golden:coverage`). The Java app is
gone, so the fixtures are frozen and can't be regenerated; see `app/test/golden/README.md`.

### Logo

`tools/make_logo.py` draws the pixel logo (a torii with a sprouting kodama under it) and writes the
Android launcher icons, the monochrome themed-icon layer and the notification icon into
`app/android/app/src/main/res/`, plus `tools/kanjikodama-logo.svg` / `kanjikodama-logo-512.png`:

```sh
uv run tools/make_logo.py
```

## Repository layout

```
app/                     The app: TypeScript (React + Vite), PWA and Capacitor Android
  src/                   core/ (logic, golden-tested against Java), app/, ui/, platform/,
                         progress/ (save, restore, legacy migration), storage/, sync/
  android/               Capacitor Android project (native plugins in app/src/main/java)
  scripts/               check.sh, content build, release-android.sh
  test/golden/           Frozen fixtures recorded from the retired Java app
tools/                   build_wk_asset.py (private content DB), wk-content.lock.json,
                         make_logo.py
tools/content/           Python pipeline for open kanji data (KANJIDIC2, KRADFILE, JMdict,
                         KanjiVG, JLPT lists) that produces sound-components.db,
                         jlpt-kanji.tsv and extra-kanji.db
content/                 Hand-authored component, mnemonic, sound-series and JLPT overrides
  inputs/                Committed content-build inputs (open data)
  private/               wk-content.db (git-ignored, never committed)
docs/                    Spec and implementation plan
.github/workflows/       CI, manual only (workflow_dispatch)
```

## Credits

KanjiKodama is made by luksgrin. Infinite thanks to
[Smouldering Durtles](https://github.com/jerryhcooke/smouldering_durtles) by Jerry Cooke, and to
Flaming Durtles by Ernst Jan Plugge, on which it is based (both Apache License 2.0). The app's
About screen lists everything else: content from WaniKani (Tofugu), open data from EDRDG and KanjiVG, and the fonts Silkscreen,
Pixelify Sans and Zen Maru Gothic (SIL Open Font License).

KanjiKodama is not affiliated with or endorsed by Tofugu or WaniKani.

## License

Apache License 2.0, see [LICENSE](LICENSE).
