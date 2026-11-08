# Developing KanjiKodama

How the app is built, tested and released. For what the app is and how to install it, see the
[README](../README.md).

## Releasing

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
patch (0.6.0 → 7000, 0.6.1 → 7001), so it grows with every release and stays above every earlier
build.

Local builds (for testing; nothing is published):

```sh
cd app
sh scripts/release-android.sh                  # id app.kanjikodama.wk, versionCode from the version
adb install -r release/kanjikodama-0.6.0.apk   # or copy it to the phone and open it
```

The APK's id is `app.kanjikodama.wk`; every release is signed with the same key, so each one
installs over the previous one and keeps its data. Android 7.0 (API 24) or newer is needed
(Capacitor 8).

**Rollback:** Android doesn't install an older version (lower `versionCode`) over a newer one, so
the progress file is the way back: save progress (to Google Drive, or copy it off the phone:
uninstalling deletes the app's own files in Downloads), uninstall, install the older APK from its
GitHub release, and restore the file (Settings → Progress → Restore progress from a file).

## Building

Requirements: Node 22.18+, JDK 21 (`brew install openjdk@21`), the Android SDK.

```sh
cd app
npm ci
npm run check                 # typecheck, tests, leak check, build
npm run build && npx cap sync android
cd android
./gradlew assembleDebug       # id app.kanjikodama.wk.debug
./gradlew assembleRelease     # id app.kanjikodama.wk, signed with keystore.properties
./gradlew assembleDebug -PsideBySide   # id app.kanjikodama.wk.web, installs next to the main app
```

`-PsideBySide` builds the id `app.kanjikodama.wk.web` (both build types, also
`release-android.sh --side-by-side`), for a second copy installed next to the main app. Its data is
separate; move progress with a progress file.

### Signing

Release builds read `app/android/keystore.properties` (git-ignored; see
`app/android/keystore.properties.example`). It points at the release key, `storeFile=release.jks`
(relative to `app/android/`, so `app/android/release.jks`, also git-ignored). Every release has
been signed with this key.

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
  pitch accent, JLPT levels, frequency and Jōyō grades; `reference-data/` holds the scripts that
  made them) and `drawable/` (the radical images WaniKani has no
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

The core is tested against about 388,000 frozen reference results (`app/test/golden/`,
`npx vitest run test/golden`, `npm run golden:coverage`); see `app/test/golden/README.md`.

### Logo

`tools/make_logo.py` draws the pixel logo (a torii with a sprouting kodama under it) and writes the
Android launcher icons, the monochrome themed-icon layer and the notification icon into
`app/android/app/src/main/res/`, the web app's icons into `app/public/` (`npm run icons` in `app/`
renders their PNGs), plus `tools/kanjikodama-logo.svg` / `kanjikodama-logo-512.png`:

```sh
uv run tools/make_logo.py
```

## Repository layout

```
app/                     The app: TypeScript (React + Vite), PWA and Capacitor Android
  src/                   core/ (logic, golden-tested), app/, ui/, platform/,
                         progress/ (save, restore), storage/, sync/
  android/               Capacitor Android project (native plugins in app/src/main/java)
  scripts/               check.sh, content build, release-android.sh
  test/golden/           Frozen reference results for the core
tools/                   build_wk_asset.py (private content DB), wk-content.lock.json,
                         make_logo.py
tools/content/           Python pipeline for open kanji data (KANJIDIC2, KRADFILE, JMdict,
                         KanjiVG, JLPT lists) that produces sound-components.db,
                         jlpt-kanji.tsv and extra-kanji.db
content/                 Hand-authored component, mnemonic, sound-series and JLPT overrides
  inputs/                Committed content-build inputs (open data)
  private/               wk-content.db (git-ignored, never committed)
docs/                    Deliberate behaviours, settings notes, the original spec
.github/workflows/       CI, manual only (workflow_dispatch)
```
