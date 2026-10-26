# KanjiKodama unified app: spike (issue #3, step 1)

One review card, built once in TypeScript (React 19 + Vite 8, strict TS) and shipped as a PWA (for iPhone) and as an Android app through Capacitor 8. The spike exists to test the risky parts before the real port. It does not try to be a finished app.

## Layout

| Path | What |
|---|---|
| `src/kana/kanaConverter.ts` (+ `.test.ts`) | Port of `core/srs/.../KanaConverter.kt`, with all Kotlin test cases ported to Vitest |
| `src/AnswerInput.tsx` | Answer field: romaji→kana on every `input` event, left alone during IME composition |
| `src/content/contentDb.ts` | sql.js (WASM) loader for the content file (`content-manifest.json` → `content-<hash>.db`, see `src/content/contentFile.ts`), timed per phase |
| `src/content/answer.ts` | Spike answer check (exact match on accepted meanings/whitelist and readings). The real `AnswerChecker.kt` is ported later |
| `src/storage/db.ts` | Dexie/IndexedDB: per-subject progress + meta (launch count, build, load history) |
| `src/progress/progressFile.ts` | Export/import in the `ProgressStore.java` format (`kanjikodama-progress`, version 1) |
| `src/platform/` | `Platform` interface (`index.ts`), `web.ts` (spike-web), `android.ts` (spike-android) |
| `src/App.tsx` | Card + stored-progress panel + diagnostics panel |
| `scripts/build-content.ts` | `npm run content` (step 4; replaced the spike's `copy-content.mjs`): builds the content file and manifest into git-ignored `public/content/` |
| `scripts/make-icons.mjs` | `npm run icons`: renders the PNG icons from `public/icons/*.svg` (the 森 trees from `app/src/main/res/drawable/ic_launcher_foreground.xml` on #1B4332) |

The font is Zen Maru Gothic Medium from `durtles/app/src/main/res/font/`, bundled locally (SIL OFL 1.1). The license ships at `licenses/OFL-zenmarugothic.txt`, and no font comes from a CDN.

## Private data

`wk-content.db` is internal-use WaniKani data. `npm run content` (also run by `npm run build`) builds the private content file from it into `app/public/content/`, which `app/.gitignore` ignores. Vite then copies it into `dist/content/`, which is also ignored, and Capacitor copies it into `android/app/src/main/assets/public/`, which is ignored too. `git status --ignored` was checked and the DB shows only as ignored. **Never deploy `dist/` to a public host** (GitHub Pages, Netlify, a public tunnel), because it contains the DB. `node scripts/check-no-private.mjs` (part of `npm run check`) fails if WaniKani-derived data is tracked by git; add `--dir dist` to check a build output.

## Running

```sh
cd app
npm ci                 # exact pinned versions from package-lock.json
npm run content        # builds public/content/ (npm run build runs it too)
npm run dev            # dev server (no service worker in dev)
npm test               # Vitest: 60 tests
npm run build          # tsc -b + vite build -> dist/ (with sw.js + manifest.webmanifest)
npm run preview        # serve dist/ at http://localhost:4173
```

### iPhone test (the owner must do this)

A service worker and "Add to Home Screen" as a real PWA need HTTPS with a certificate the iPhone trusts. Use one of these. Both keep the DB private:

1. **Tailscale Serve** (simplest, if the Mac and the iPhone are on one tailnet): run `npm run build && npm run preview`, then `tailscale serve --bg 4173`. Open the `https://<mac>.<tailnet>.ts.net/` URL in Safari. Do **not** use `tailscale funnel`, which makes the URL public.
2. **mkcert on the LAN**: run `mkcert -install && mkcert <mac-lan-ip> <mac>.local`, then install the mkcert root CA on the iPhone. AirDrop `$(mkcert -CAROOT)/rootCA.pem`, install the profile, then enable it under Settings > General > About > Certificate Trust Settings. Then run:
   `KK_HTTPS_CERT=./<name>.pem KK_HTTPS_KEY=./<name>-key.pem npm run preview:lan` and open `https://<mac-lan-ip>:4173/`.

Check on the iPhone:
- [ ] Safari > Share > Add to Home Screen shows the name "KanjiKodama" and the tree icon. It launches standalone ("Platform: web (standalone)").
- [ ] The kanji is in Zen Maru Gothic (rounded strokes).
- [ ] Reading question, English keyboard: typing `ichi` shows `いち` while typing. A trailing `n` stays latin until the next key.
- [ ] Reading question, **Japanese romaji keyboard** (日本語ローマ字): typing works normally, nothing doubles or jumps, and the composed kana is committed as-is. "IME events" shows compositionstart/compositionend. Also try the Japanese kana keyboard (かな).
- [ ] Don't know (left) and Submit (right) sit directly under the field. After answering, Next takes Submit's place. With the keyboard open, check whether the row is still visible. There is no keyboard-tracking code, which is deliberate.
- [ ] "DB load cold" on the first launch and on later launches (note the numbers here). Answering still feels instant afterwards.
- [ ] "Persistent storage" says granted (expected for Home Screen apps on iOS 17+; may say NOT granted in plain Safari).
- [ ] Answer a few cards, force-quit the app from the app switcher and relaunch: srsStage, Times answered and Launches are kept.
- [ ] Update: rebuild on the Mac, relaunch the app twice. The Build row shows "(updated from …)" and progress is kept.
- [ ] Airplane mode, relaunch: the app and the DB load ("fetch … (sw-cache)").
- [ ] Save progress opens the share sheet with a `.json` file. "Save to Files" works. Load progress picks it back from Files. A non-progress file is rejected with "nothing changed".
- [ ] Schedule notification shows "unsupported" (expected on the web build).

## Measured (Mac, local preview, Playwright headless Chromium 156 and WebKit 27.2, 390×844 viewport)

Content DB: 28.1 MB, 2,102 kanji of 9,452 subjects. The card uses the 18 level-1 kanji (`object='kanji' AND level=1 AND hiddenAt=0`).

| | Chromium | WebKit |
|---|---|---|
| First launch (network): total | 323–577 ms (fetch ~300 ms, open 4–10 ms, query 12–15 ms) | 323–331 ms (fetch ~300 ms, open 7–8 ms) |
| Same session re-measure | 62–68 ms | 298–305 ms (WebKit re-reads the 28 MB, no HTTP cache) |
| After restart | 52–60 ms | 329–586 ms |
| Offline (from SW cache) | 33 ms | 217–276 ms |

`new SQL.Database(bytes)` itself takes only 4–19 ms, so the cost is moving the 28 MB. On localhost this says nothing about network time, and it does not show iPhone CPU or memory behaviour. **The iPhone numbers are still to be measured by the owner.** The "source" label is "sw-cache" only when the bytes were already in the content cache before the fetch. The first controlled launch still says "network" while it fills the cache.

## Results (automated, Playwright scripts kept outside the repo (scratchpad `pw/e2e.mjs`, `pw/update.mjs`), both browsers unless noted)

| Check | Result |
|---|---|
| `npm run build` (strict tsc + vite), `npm test` (60 tests) | pass |
| `sw.js` + `manifest.webmanifest` generated; precache 23 entries / 4.8 MB (shell, wasm, font, icons) | pass |
| First card 一, Zen Maru Gothic loaded (`document.fonts.check`) | pass |
| Meaning "one" → Correct; Next replaces Submit; Don't know shows the answer | pass |
| Live romaji: `ichi` typed key by key → `いち`; `ich` → `いch` | pass |
| IME (Chromium, CDP composition): latin composition `ka` left alone, then `か` on commit; kana composition `かn` untouched; commit `かんじ` kept | pass (simulated; real iOS/Gboard keyboards untested) |
| Notification button on web → "unsupported on this platform" | pass |
| Save: Chromium download, file has `format/version/exportedAt/userLevel/curriculum/levelProgression/subjects/probation/jumps` | pass. WebKit reports `canShare(files)=true`, so it takes the share-sheet path, which was not automated |
| Load: version-99 file rejected, stored progress unchanged; valid file restored | pass |
| Restart (close + relaunch same profile): progress, launch count, card position kept | pass |
| Offline reload served by SW, DB from `kk-content-v1` cache | pass |
| Update (rebuild, relaunch): new build active on the **second** launch after the rebuild, "(updated from …)" shown, progress and DB cache kept | pass |
| `navigator.storage.persist()` | **NOT granted** in both headless browsers. This is normal there and not meaningful. Check on the iPhone |

## Decisions and notes

- **Content DB is not precached.** It is runtime-cached (CacheFirst, cache `kk-content-v1`) on first fetch. Precaching it would put 28 MB into every app update. Its own cache survives SW updates. The cache name must be bumped when the DB changes.
- **Romaji conversion** rewrites the whole field per keystroke, like the Kotlin app. So typed key by key, `nn` commits ん at once (as real IMEs do), and こんにちは typed key by key needs `konnnichiwa`. Submitting resolves a trailing `n`.
- **Composition:** while composing we never touch the value, and we convert once on `compositionend`. This keeps native Japanese keyboards safe. Some latin keyboards (notably Gboard with suggestions) also compose latin words. There conversion happens only when the word is committed, not per letter. The Kotlin app solves this by dropping the composing region. The browser equivalent is risky. See the risks below.
- **Save on iOS** uses the Web Share API with a File. The export JSON is prepared before the tap so `navigator.share()` runs inside the tap's user activation. When sharing is unavailable it falls back to a Blob download.
- The SW is registered only outside Capacitor (`Capacitor.isNativePlatform()`).
- `npm audit`: 3 moderate advisories in `uuid` via `@capacitor/cli` → `xcode` (iOS tooling, dev-only, not shipped).

## Open risks

1. **iPhone load time and memory.** sql.js holds the whole 28 MB DB in WASM memory, plus a transient 28 MB JS copy. This is fine on desktop. Older iPhones may be slow or may kill the page. If that happens, the options are: a smaller extract with only the columns and subjects the app needs (most of the 28 MB is mnemonics, context sentences and audio metadata); a sharded JSON per level loaded lazily; or a pre-built IndexedDB import on first run. None of these were built.
2. **iOS storage eviction.** Safari can evict script-writable storage of sites (not Home Screen apps) after 7 days without use. The progress file export is the safety net. Persistence must be confirmed on the device.
3. **Latin keyboards that compose** would convert per word, not per letter. Gboard English on the emulator did *not* compose (per-letter conversion worked, see Android). Gboard with suggestions on a real phone and iOS predictive text still need a real-device check. A fix could convert during composition only when the composing text is pure ASCII, but it might fight the keyboard.
4. **Font size:** the full TTF is 3.8 MB in the precache (limit raised to 4 MiB). It should be subsetted to the DB's characters plus kana and converted to WOFF2 (fontTools was not available here).
5. **Update timing:** with `registerType: 'autoUpdate'` the new version became active on the second launch after a deploy. This is acceptable, but a "new version, reload" prompt may be nicer.
6. Not verified here: real iOS Safari, Home Screen install, real Japanese keyboards, the share sheet, the HTTPS path, iPhone timings. Those need the owner's device.

## Android

Capacitor 8.5.3 wraps the same `dist/` as a debug app with applicationId `app.kanjikodama.spike` ("KanjiKodama Spike"). It installs next to the current app (`app.kanjikodama.wk.debug`) and does not touch its data. Tested on emulator-5554: Android 16 (API 36), arm64, Android System WebView 133, Gboard (English).

### Files (spike-android)

| Path | What |
|---|---|
| `capacitor.config.ts` | appId, appName, `webDir: 'dist'` |
| `src/platform/android.ts` | `androidPlatform`: LocalNotifications, the native `Document` plugin for save/open, `navigator.storage.persist()` |
| `android/` | Generated by `npx cap add android`, plus the hand-written changes listed below |
| `android/app/src/main/java/app/kanjikodama/spike/DocumentPlugin.java` | Small local Capacitor plugin (about 130 lines) around the Storage Access Framework: `save` = `ACTION_CREATE_DOCUMENT`, `open` = `ACTION_OPEN_DOCUMENT`. Needs no storage permission |
| `android/app/src/main/java/app/kanjikodama/spike/MainActivity.java` | Registers `DocumentPlugin` before `super.onCreate()` |
| `android/app/src/main/AndroidManifest.xml` | Removes `SCHEDULE_EXACT_ALARM`, which the notifications plugin declares (`tools:node="remove"`) |
| `android/app/build.gradle` | versionCode 2 / versionName 1.1 (raised once for the update test) |

`@capacitor/filesystem` and `@capacitor/share` are installed but `android.ts` does not use them yet. They are kept as a fallback (write to cache, then the share sheet) if SAF ever turns out to be a problem. Both can be removed.

**Why a custom plugin for files:** the official Capacitor plugins have no "save as" document picker. Filesystem only writes into app or public folders, and Share only offers a share sheet, where "Save to Drive" works but "save to a folder I pick" does not. SAF's `ACTION_CREATE_DOCUMENT` is exactly what the current Kotlin app uses, and it lists every document provider (Downloads, Drive, and others). A third-party picker plugin would cover only the open side. `<input type=file>` would also work for open (Capacitor routes it to the system picker), and `android.ts` falls back to it if the native plugin is missing.

### Build and install

```sh
cd app
npm run build && npx cap sync android        # after every web change
cd android
export JAVA_HOME="$(brew --prefix openjdk@21)/libexec/openjdk.jdk/Contents/Home"   # JDK 21 (brew install openjdk@21)
./gradlew assembleDebug                      # about 50 s clean, about 10 s incremental
~/Library/Android/sdk/platform-tools/adb -s emulator-5554 install -r app/build/outputs/apk/debug/app-debug.apk
~/Library/Android/sdk/platform-tools/adb -s emulator-5554 shell am start -n app.kanjikodama.spike/.MainActivity
```

The git-ignored generated paths (`android/app/src/main/assets/public` with the DB, `capacitor.config.json`, `capacitor.plugins.json`, the build dirs and `local.properties`) were checked with `git status --ignored`. `git check-ignore` confirms that `android/app/src/main/assets/public/content/wk-content.db` is ignored. The largest committable file under `app/android/` is `gradle-wrapper.jar` (44 kB).

### APK size

Debug APK: **13.2 MB** (13,161,285 bytes). Most of it is `wk-content.db`, deflated from 28.1 MB to 6.0 MB, plus the font (3.8 MB to 2.3 MB) and sql-wasm (685 kB to 370 kB). As an experiment the DB was stored uncompressed (`noCompress 'db'`). The APK grew to 35.3 MB and DB load time did not measurably improve (183 to 635 ms against 202 to 655 ms), so the experiment was reverted.

### Results (emulator)

| Check | Result |
|---|---|
| Card renders, platform `android` | **pass**. 一/二 have the rounded stroke ends of Zen Maru Gothic (compare the system font in the "Subject" row) |
| Quick-action row under the field, keyboard open | **pass**. Field at y 773 to 912 px, Don't know/Submit at 941 to 1070, Gboard top at about 1515 (of 2400). Row stays visible. After a submit, Next replaces Submit |
| Romaji to kana, `adb shell input text` | **pass**. `ichi` gives いち, `kanji` gives かんじ, `kyouttonnshi` gives きょうっとんし, `shinbun` gives しんぶn (trailing n pending until submit). Meaning `one` + Enter is Correct, reading いち is Correct, `ni` (に) is counted as incorrect |
| Romaji to kana, **real Gboard key taps** (English layout, tapped with `adb shell input tap`) | **pass**. Each tap converts live: い, いc, いch, いち. "IME events: none" because Gboard did not compose on this field. Gboard's ✓ action key submits |
| Content DB load, cold (new process each time) | 187 ms on first launch. Then 202 to 655 ms over about 15 cold launches (typically 250 to 600). Example split: wasm 239 + fetch 254 (app-asset) + open 8 + query 25 = 526 ms. wasm compile varies between 11 and 239 ms. The DB comes from the APK asset through Capacitor's local server. There is no service worker in the app, and none is needed |
| Content DB load, warm (Re-measure, same process) | 308 ms (fetch 287). The WebView re-reads and re-inflates the asset each time. There is no in-memory reuse |
| App launch (`am start -W`, cold) | 650 to 1220 ms TotalTime |
| Storage: force-stop and relaunch | **pass**. srsStage 2, Times answered 2, Last answer いち and Launches were kept |
| Storage: `adb install -r` with the same APK | **pass**. All values were kept |
| Storage: real update (versionCode 2, new web build) | **pass**. The Build row showed "(updated from 2026-10-17T12:32:53Z)" and progress was kept |
| `navigator.storage.persist()` | Returns **false** ("NOT granted"). IndexedDB is in the app's private data (`app_webview/Default/IndexedDB/https_localhost_0.indexeddb.leveldb`). It is removed only by "Clear storage" or uninstall, not by browser-style eviction. So the `false` has little meaning in the WebView |
| Notification permission | POST_NOTIFICATIONS dialog on the first "Schedule notification" tap. Allow then schedules |
| Notification, app in background | **pass**. Scheduled 14:37:15, shown at about 14:38:12 (inexact, about 57 s late). Title "KanjiKodama", text "Reviews are waiting (spike test)" |
| Notification, process killed (kill -9 while backgrounded, as the low-memory killer would) | **pass**. Scheduled 14:39:32. The alarm restarted the process and the notification was shown at about 14:40:30 (about 58 s late) |
| Notification, **force-stopped** (Settings > Force stop / `am force-stop`) | **does not fire** (14:45:56 scheduled, nothing by 14:48). This is Android behaviour: force-stop deletes the app's alarms and notifications until the app is opened again. The current app behaves the same. Swiping the app away from Recents is not a force-stop |
| Save progress | **pass**. The system "Save to" dialog opened with `kanjikodama-progress-2026-10-17.json` prefilled. Saved to Downloads, 275 bytes, valid `kanjikodama-progress` v1 JSON |
| Load progress | **pass**. The system open picker loaded the file and progress was restored to the saved state (srsStage 2, reading 1/0) after it had been changed in between |
| Load a malformed file | **pass**. A truncated JSON was rejected ("not JSON") and `srsStage: "nine"` was rejected ("must be a number"). Stored progress was unchanged both times |

**Exact alarms on API 36:** `@capacitor/local-notifications` 8.3.1 declares `SCHEDULE_EXACT_ALARM`. By default (`isExactNotification: true`) it opens the "Alarms & reminders" settings screen on every `schedule()` when that permission is not granted, and on API 33+ the permission is denied by default for new installs. `android.ts` passes `isExactNotification: false` with `allowWhileIdle: true`. The plugin then calls `AlarmManager.setAndAllowWhileIdle(RTC_WAKEUP, …)`, the same call the current Kotlin app makes, and no special permission is needed. The manifest removes `SCHEDULE_EXACT_ALARM`, which Play policy also restricts. Expect delivery up to about a minute late (more in Doze), which is fine for review reminders. The plugin also has a BOOT_COMPLETED receiver that restores scheduled notifications after a reboot (not tested).

### Screenshots (scratchpad, not in the repo)

All are in `/private/tmp/claude-501/-Users-apophis-Documents-KanjiKodama/299997bf-e90a-41ff-b5a9-61d33960b12f/scratchpad/`:
- `a01-launch.png`: first launch, card 一, diagnostics with cold DB load 187 ms
- `a02-keyboard-open.png`: Gboard open, Don't know/Submit visible under the field
- `a03-meaning-answered.png`: meaning "one" Correct
- `a04-romaji-kana.png`: `ichi` typed with adb, いち shown
- `a05-reading-answered.png`: reading Correct
- `a06-after-forcestop.png`, `a07-diagnostics-relaunch.png`: values after force-stop and relaunch
- `a08-db-warm.png`: warm re-measure 308 ms
- `a09-notif-permission.png`: POST_NOTIFICATIONS dialog
- `a10-notif-shade-background.png`: notification with app in background
- `a11-notif-shade-killed.png`: notification after the process was killed
- `a12-save-picker.png`, `a13-save-picker-roots.png`, `a14-saved.png`: SAF save dialog, roots (Downloads and device only, no Drive account on the emulator), saved
- `a15-open-picker.png`, `a16-loaded.png`: SAF open picker, restore result
- `a17-reject-spike-bad-truncated.json.png`, `a17-reject-spike-bad-schema.json.png`: malformed files rejected
- `a18-after-install-r-same.png`, `a19-after-update-v2.png`: data after reinstall and after the update
- `a20-final-diagnostics.png`: diagnostics with "(app-asset)" source and the launch history
- `a21-gboard-taps.png`: いち typed by tapping Gboard keys
- `a22-next-kanji.png`: 二 in Zen Maru Gothic with the keyboard open

### Problems and workarounds

1. **JDK.** Build with JDK 21 (`brew install openjdk@21`, then `JAVA_HOME` as above). The Capacitor 8 template (Gradle 8.14.3, AGP 8.13, plugins with `jvmToolchain(21)`) then builds unchanged. Android Studio's bundled JBR 25 does not work with that template; the spike first worked around it with Gradle 9.4.1 and a toolchain override in `android/build.gradle`, both removed again on 2026-10-17 once JDK 21 was installed.
2. `cap add android` could not run its Gradle sync ("Unable to locate a Java Runtime") because `java` is not on PATH. It is harmless, since building with `JAVA_HOME` set works.
3. The notification uses the plugin's fallback small icon (a generic "i"). A real build needs a monochrome `ic_stat_*` drawable and `LocalNotifications.smallIcon` in `capacitor.config.ts`.
4. The hardware/gesture Back button closes the app (Capacitor default). The real app should handle `backButton` from `@capacitor/app`.
5. The IndexedDB origin is `https://localhost` (Capacitor default `androidScheme: 'https'`, hostname `localhost`). **Changing `server.hostname` or `androidScheme` later would hide all stored progress** (new origin). Keep them fixed.

### Still for the owner to check by hand (real phone)

- [ ] Install `app-debug.apk` on the phone (`adb install -r`). It installs next to the current app.
- [ ] **Gboard Japanese** (日本語 QWERTY romaji and 12-key かな): add Japanese in Gboard settings, then type on a reading question. Expected: Gboard composes, so the field leaves the composition alone and keeps the committed kana; "IME events" lists composition events. Watch for doubled or jumping characters. This was not testable here because the emulator has only the English layout, and adding a language would change the emulator's settings.
- [ ] Gboard English with the phone's own Gboard settings (autocorrect, glide typing): confirm that it still converts per letter as on the emulator (spike-web's risk 3). The emulator's Gboard had its suggestion strip on and did not compose on this field.
- [ ] Save progress, then choose **Google Drive** in the "Save to" roots (needs a signed-in Drive app). Load it back from Drive.
- [ ] Notification on a real device with battery optimisation: schedule, lock the phone, wait. Expect it within a few minutes.
- [ ] DB load time on the phone (diagnostics panel). Emulator numbers on an M-series Mac are not representative.

