# Cutover: from the Java app to the TypeScript app on Android

Issue #3, step 6. The release APK built from `app/` has the Java app's id (`app.kanjikodama.wk`)
and key, so it installs **over** the Java app. Android keeps the Java app's data on such an update,
and the new app moves it once on its first start. The cutover is done: the owner uses only the new
app, and the Java app's code (`durtles/`) was removed from the repository after commit `94abf2e`
(2026-10-26; check that commit out to read or build it). The Kotlin prototype stays for now. The
checklist below is kept for the record, with paths updated where they moved.

## Checklist

1. **Finish what is open in the Java app.** No lesson or review session in progress, no unfinished
   kanji level test (neither can be moved). In server mode, let pending answers upload first.

2. **Save a progress file in the Java app** and keep it somewhere off the phone too:
   Settings → Progress → Save progress to a file (e.g. Google Drive in the picker). Optionally also
   Settings → Backup your settings. This file is the rollback path. Keep a copy outside Downloads
   (Drive or a computer): Android deletes an app's own files in Downloads when the app is uninstalled.

3. **Back up the signing key** if not done yet: `app/android/release.jks` (until 2026-10-26
   `durtles/release.jks`) and the passwords in `app/android/keystore.properties`, offline (USB
   stick, password manager). They are git-ignored, so they exist only on this Mac. Without them no
   later release can update the installed app.

4. **Build the release:**
   ```sh
   cd app && sh scripts/release-android.sh
   ```
   It needs `app/android/keystore.properties` (git-ignored, `storeFile=release.jks`, i.e.
   `app/android/release.jks`).
   Output: `app/release/kanjikodama-<version>.apk`.

5. **versionCode check.** The new APK's `versionCode` must be higher than the installed one:
   ```sh
   adb shell dumpsys package app.kanjikodama.wk | grep versionCode
   ```
   The Java releases used `100 + run number`; the first local 0.6.0 build used **1000**. Builds
   now derive it from the version (0.6.0 → 7000; see README "Installing"), so it grows with every
   release (`--version-code N` overrides it for a local build).

6. **Signature check.** The new APK must be signed with the same key as the installed app:
   ```sh
   apksigner verify --print-certs app/release/kanjikodama-<version>.apk | grep SHA-256
   # Installed app (from the phone):
   adb shell pm path app.kanjikodama.wk      # → package:/data/app/.../base.apk
   adb pull <that path> installed.apk && apksigner verify --print-certs installed.apk | grep SHA-256
   ```
   Both must print `1574375e279257ca59935c981e3e3727ce244ba727b38a5fc49a2b759e937741`
   (CN=luksgrin, O=MojiMori). Checked on 2026-10-26: the new release APK and the Java release APK
   built from `durtles/` have this same certificate (and so did the release built after the key
   moved to `app/android/`).

7. **Install over the Java app** (never uninstall first: that deletes the data to migrate):
   ```sh
   adb install -r app/release/kanjikodama-<version>.apk
   ```
   Or copy the APK to the phone and open it ("Update" in the installer).
   Android 7.0 (API 24) or newer is required.

8. **First start: "Move progress from the old app?"** The dialog shows the old progress
   ("Saved …, WaniKani order, level N, M items with progress."). **Move** replaces the new app's
   progress with it in one transaction (the same restore as a progress file), then moves the
   settings, the API token and the downloaded audio. **Not now** asks again at the next start. Then check the dashboard
   (level, review counts) against the Java app's last state.

9. **"Remove old app data?"** is offered after a successful move. **Keep** leaves the old database
   and preferences where they are (a few MB); **Remove** deletes them. Never automatic. Keep them
   until you have used the new app for a few days if you like; there is no way to bring the dialog
   back after Keep, but uninstalling (not updating) the app removes everything anyway.

## What moves

| From the Java app | How | Notes |
|---|---|---|
| Progress (subject SRS state, notes, synonyms, level progression, user level, curriculum order, probation, fast-travel jumps) | `LegacyMigrationPlugin` runs the queries of `ProgressStore.export()` on a **copy** of `databases/wanikani` (Room v68), then the normal import | The original database is never written. Same content as a saved progress file. |
| Settings (default SharedPreferences) | Same format as "Backup your settings", restored like "Restore your settings" | API token and web password are not part of it. String sets (none used) are skipped. |
| API token | Read from the Java app's `EncryptedSharedPreferences` (same uid, same Keystore master key) and stored in the new app's secret store | If it can't be decrypted, enter it again in Settings → Server connection. |
| Server mode | Server address kept; the app starts in local mode with the server's last progress | Open Settings → Server connection to connect again. |
| Session in progress, level test in progress | Not moved | Finish them first (step 1). |
| Downloaded audio | `LegacyMigrationPlugin.moveAudio` during "Move": the files in the Java app's `no_backup/pronunciation-audio` ("Internal", its default), in `pronunciation-audio` of every external files dir and in the stored `audio_location` are moved (renamed, or copied and deleted across file systems) into the new app's `files/pronunciation-audio` | Same layout (`<level>/<sourceId>.mp3`/`.ogg`), so nothing is downloaded again. The result dialog says "Downloaded audio moved (N files)." Files the new app already has are kept. |
| Home-screen widget | Kept | The new app declares its widget provider under the Java class name `com.smouldering_durtles.wk.services.SessionWidgetProvider` (an empty subclass of `app.kanjikodama.wk.SessionWidgetProvider`). Placed widgets are bound to that component name, so they stay on the home screen; the new app redraws them on the update (counts 0 until the move, then the moved counts). |
| Notification channel | Kept | Same channel id `NewReviewsChannel` (and notification id 1) as the Java app, so Android keeps the channel and the learner's changes to it (sound, importance, lock screen). |
| Scheduled notifications | Rescheduled by the new app | |

## Rollback

Android refuses to install an app with a lower `versionCode` over a newer one, so going back to
the Java app goes through the progress file:

1. In the new app: Settings → Progress → Save progress to a file (or use the file from step 2),
   and **copy it off the phone or into Google Drive**: uninstalling an app also deletes the files it
   created in Downloads (seen on the test emulator).
2. Uninstall KanjiKodama.
3. Install the Java APK (e.g. the last GitHub release, or built from `durtles/` at commit `94abf2e`).
4. In the Java app: Settings → Progress → Restore progress from a file.

Progress files saved by either app restore in the other.

## Side by side instead

To keep both apps installed (no migration, data separate), build the pre-cutover variant
`app.kanjikodama.wk.web`: `sh scripts/release-android.sh --side-by-side`, or
`./gradlew assembleDebug -PsideBySide`. Move progress with a progress file.

## How the migration was tested

On an emulator (API 36): the Java debug app `app.kanjikodama.wk.debug` with the comparison progress
restored → its own progress export → the TS debug build (same id `app.kanjikodama.wk.debug`, same
debug key) installed over it with `adb install -r` → "Move" → the TS app's progress export compared
with the Java export (`app/test/golden/progress-ts.golden.test.ts`'s semantic comparison: same
keys, types and values; key and row order ignored). Unit and render tests:
`app/test/app/legacyMigration.test.tsx`.

Widget, channel and audio (2026-10-26, same emulator): a Java widget (1×1, "R: 1034") placed on the
Pixel launcher, 318 audio files in the Java app's `no_backup/pronunciation-audio`; after `adb install -r`
of the TS debug build the widget (same id) was still bound to
`app.kanjikodama.wk.debug/com.smouldering_durtles.wk.services.SessionWidgetProvider` and showed the new
app's "R: 0"; after "Move" it showed "R: 1034", the dialog said "Downloaded audio moved (318 files).",
`no_backup` had no audio left and the new app's audio dir had them. `dumpsys notification` showed the one
`NewReviewsChannel` of the package before and after (no second channel). The Java debug app's data was
backed up before and restored afterwards (`run-as … tar`, the Java APK installed back with
`install -r -d`).

Result (2026-10-26, emulator API 36): the offer showed "Saved …, JLPT order, level 6, 1034 items
with progress."; after Move the TS app's export equalled the Java export: 0 semantic differences,
and the two files were byte-identical apart from `exportedAt`. The old database, WAL and
preference files had the same checksums before and after the move; "Remove" then deleted them and
the offer did not come back. Not covered on the device: moving a real API token (the test app had
none; the token path is covered by the unit tests only).

The test also found that saving a real-size progress file (~750 KB) crashed the app when the file
picker opened (`TransactionTooLargeException`: Capacitor kept the file text in the saved activity
state). Fixed in `DocumentPlugin.java`; the side-by-side builds made before 2026-10-26 have the
bug.
