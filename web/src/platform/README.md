# Platform layer

Everything that differs between the PWA (iPhone, any browser) and the Capacitor Android build goes
through `Platform` in `index.ts`. `getPlatform()` picks `android.ts` when
`Capacitor.isNativePlatform()` is true, else `web.ts`. Screens read `platform.capabilities` and
never check `platform.name`.

## Interface (what step 4 needs)

| Part | Members |
|---|---|
| `capabilities` | `notifications`, `audio`, `haptics`, `backgroundSync`, `widget`, `cleartextHttp`, `legacyMigration`, `autoBackup` |
| `storage` | `persist()`, `persisted()`, `estimate()` → `{usage, quota} \| null` |
| `files` | `saveText(name, text)` → `'saved' \| 'cancelled'`; `openText()` → `{name, text} \| null`; Android only: `writeAutoBackup(text, now?)`, `listAutoBackups()` (newest first) |
| `notifications` | `supported`, `permission()` → `'granted' \| 'denied' \| 'prompt'`, `requestPermission()`, `scheduleReviews(ReviewTime[])` → number scheduled, `cancelAll()`; `schedule(at, title, body)` is the deprecated spike test |
| `audio` | `supported`, `setCatalog(catalog)`, `play(subjectId, voicePref, reading?)` → played, `download(levels, onProgress?, signal?)`, `status()` (per level: files, bytes, expected), `deleteAll()` |
| `haptics` | `supported`, `feedback('correct' \| 'wrong' \| 'retry' \| 'tap')` |
| `lifecycle` | `onResume(cb)`, `onPause(cb)`, Android only: `onBackButton(cb → handled)`; each returns an unsubscribe function |
| `systemBars` | Android only: `setTheme('light' \| 'dark' \| 'system')` (status/navigation bar icon colours) |

Errors (write failure, unreadable file) reject. Cancelling a picker or share sheet does not reject.

The backup policy is in `src/progress/backup.ts`, not here: `runAutoBackup(files, exportText)` after
each session, `backupReminder(lastSavedAt, now)` for the PWA reminder, `saveProgressFile(files,
store, name, text)` to save and record `lastSavedAt`, plus the name and rotation helpers.

Helpers: `rescheduleReviewNotifications(api, db, prefs, now?)` (`reviewNotifications.ts`) plans and
schedules in one call (or cancels when `enable_notifications` is off); call it after each session, in
`lifecycle.onPause`, on resume and after a server-mode sync. The plan itself is pure:
`planReviewNotifications` and the Java texts in `src/core/notifications/`. The audio decisions (which
recording, which files) are pure too: `src/core/audio/`; `readAudioCatalog(db)` in
`src/content/audio.ts` builds the catalog from the content DB. Settings getters with the Java defaults:
`enableNotifications`, `voicePreference`, `hapticFeedbackOnCorrect` / `OnWrong` (all in core).

## What each build does

| | Android (`android.ts`) | PWA (`web.ts`) |
|---|---|---|
| Save progress file | System create-document picker (`ACTION_CREATE_DOCUMENT`) through the local `Document` plugin; Drive, Downloads etc. are offered, as in the Java app. Dismissed → `'cancelled'`. If the plugin is missing (old APK), it writes to the cache dir and opens the share sheet (`@capacitor/share`). | Web Share API with a `File` when `navigator.canShare({files})` (iOS share sheet → Save to Files, iCloud Drive, Google Drive app). `AbortError` → `'cancelled'`. Any other share error, or no file sharing → Blob download, always reported `'saved'` (browsers don't say whether it was kept). |
| Open progress file | `ACTION_OPEN_DOCUMENT` through the `Document` plugin; falls back to `<input type=file>`. | Hidden `<input type=file>`; `cancel` event → `null` (very old browsers never fire it, so the promise stays pending). |
| Auto backup | After each session, `files/backups/kanjikodama-autobackup-<UTC ISO time>.json` via `@capacitor/filesystem` (`Directory.Data`); the newest 5 are kept; only files matching that name pattern are ever deleted. Android Auto Backup also covers `files/`. | None. A "last saved N days ago" reminder instead: shown when there is progress and it was never saved, or the last save is 7 or more whole days old. |
| Review notifications | `@capacitor/local-notifications` (`androidNotifications.ts`): one notification per future hour in which reviews become available, next 7 days, at most 64, with the counts at that hour and the Java texts ("New reviews available" / "N reviews available", or "New lessons and reviews available" / "N lessons and M reviews available"); ids 1000–1063; channel `NewReviewsChannel` (importance default) and the Java status icon `ic_stat_name`. Inexact alarms (`setAndAllowWhileIdle`, like Java; Android may deliver up to ~¾ of the remaining time late for far-away alarms). Scheduling also clears shown review notifications (stale counts). Permission: Android 13+ system prompt from `requestPermission()` only; `scheduleReviews` never prompts. | None (known limitation): the dashboard shows the next review time. |
| Notifications after reboot / update | The plugin's `LocalNotificationRestoreReceiver` re-arms its stored notifications on `BOOT_COMPLETED` (ones missed while the phone was off fire 15 s after boot, all at once). An update force-stops the app, which drops its alarms; our manifest adds `MY_PACKAGE_REPLACED` to that receiver, so they are re-armed after an update too (checked on the emulator with `adb install -r`). The app reschedules on every resume anyway. | — |
| Audio | `androidAudio.ts`: download with `CapacitorHttp` (native, no CORS), 4 in parallel, into `files/pronunciation-audio/<WaniKani level>/<source id>.mp3` (the Java app's internal layout; MPEG preferred), via a temp file + rename. Played with `new Audio(Capacitor.convertFileSrc(uri))`; streamed from the content URL when not cached; `play` resolves false when that fails (offline). Recording choice as `AudioUtil` (matched reading, primary reading, voice preference RANDOM/MALE/FEMALE/ALTERNATE). Excluded from Android Auto Backup (`res/xml/backup_rules.xml`, `data_extraction_rules.xml`). | None (known limitation). |
| Haptics | `navigator.vibrate` in the WebView (VIBRATE permission): 100 / 300 / 200 ms for correct / wrong / retry, the Java `HapticUtil` fallback. Both Java settings are off by default, so no `@capacitor/haptics` dependency. | None (iOS Safari has no vibrate). |
| Lifecycle, back button | `@capacitor/app`: `resume` / `pause` events; `backButton` runs the handlers newest first, else `history.back()`, else `App.minimizeApp()` (state kept, like Android 12+ for a root activity). | `visibilitychange`; no back button. |
| Edge-to-edge, bar colours | `capacitor.config.ts` `SystemBars.insetsHandling: 'css'`: the page sets `viewport-fit=cover`, so with WebView 140+ it draws behind the bars (`--safe-area-inset-*` padding); older WebViews stay inside them and the decor view's padding shows. `androidSystemUi.ts` (native `KkSystemUi`, `SystemUiPlugin.java`, started by the first `systemBars.setTheme`) samples the page colour at its top and bottom edge (a modal dialog's backdrop included) and paints that padding with it, with matching icon colours, like the Java app's status bar in its toolbar colour. | Browser handles it. |
| Answer field IME flags | `KkWebView` (via `res/layout/capacitor_bridge_layout_main.xml`) adds the Java answer field's `IME_FLAG_NO_PERSONALIZED_LEARNING` and, for meanings, `IME_FLAG_FORCE_ASCII` (Java defaults of `enable_no_learning` / `force_ascii_*`) while an `input.kk-answer` has focus (`androidSystemUi.ts` reports it). | Not possible. |
| Splash | `MainActivity` keeps the system splash until `.kk-shell` (or the start-up error) is in the page, at most 6 s, so the app goes from the splash to the dashboard like the Java app; `adb logcat -s KkStartup` prints the time from process start. | — |
| Storage persistence | `navigator.storage.*` in the WebView (data lives in the app's private dir anyway). | `navigator.storage.persist()`; still not a guarantee (see below). |

### Why a local plugin for the Android save picker
No installed plugin can open the create-document picker: `@capacitor/filesystem` writes only to
app and public directories, and `@capacitor/share` is a share sheet (it offers "Drive" as an upload
target but not a folder choice, and gives no reliable "saved" signal). The spike already had a ~150
line `DocumentPlugin.java` (`web/android/app/src/main/java/app/kanjikodama/wk/`, registered in
`MainActivity`), so it is kept; the TS side is `registerPlugin<DocumentPlugin>('Document')` in
`android.ts`. No npm dependency was added.

## Android identity

Until the cutover the app installs as `app.kanjikodama.wk.web` (`applicationId "app.kanjikodama.wk"`
plus `applicationIdSuffix ".web"` on both build types; Java package and namespace already
`app.kanjikodama.wk`), next to the Java app. Step 6 removes the release suffix, sets
`appId: 'app.kanjikodama.wk'` in `capacitor.config.ts`, signs with the Java app's key and raises
`versionCode` (start at 1000). `minSdk` is 24 (Capacitor 8); the Java app's is 21.

## Limitations

- **PWA: no auto backup.** A web app can't write files without a user gesture; the reminder is the
  substitute.
- **PWA: storage can be cleared.** Deleting the home-screen icon, clearing website data, or iOS
  running low on space can delete IndexedDB even after `persist()`. Saving the progress file
  regularly is the only protection.
- **PWA: a download is assumed saved.** Only the share sheet reports a cancel.
- **Android: auto backups are lost with "Clear storage" or uninstall** (same directory as the data),
  except what Android Auto Backup restored to Google's cloud.
- **PWA: server mode needs an `https://` server that allows CORS.** `http.ts` uses `fetch`, which
  can't set User-Agent and can't reach `http://` from an https page (mixed content). Android uses
  `CapacitorHttp` (`httpAndroid.ts`): no CORS, LAN `http://` servers work where cleartext is allowed.

## Server-mode HTTP

`platform.http` (`HttpApi`): `fetchHttp` (`http.ts`) on the web, `androidHttp` (`httpAndroid.ts`,
CapacitorHttp) on Android. `getHttp()` returns `(await getPlatform()).http`.

## Secrets

`platform.secrets` (`SecretsApi`) holds the server token, outside the progress database (so no
progress file, backup or reset carries it). Android: the local `Secrets` plugin
(`SecretsPlugin.java`/`SecretStore.java`: AES-GCM, key in the Android Keystore, excluded from
Auto Backup). Web: a separate IndexedDB database `kanjikodama-secrets` (`webSecrets.ts`).
**PWA limitation:** browsers have no secure store; the token is origin-scoped but not encrypted at
rest. `src/sync/secretsTokenStore.ts` moves a token an earlier build kept in `state` on first read.

## Audio

`capabilities.audioPlayback` (both builds) and `capabilities.audioDownload` (Android only;
`capabilities.audio` is a deprecated alias of it). Web: `webAudio.ts` streams the recording's URL
with an `<audio>` element while online (no fetch, so no CORS; `play` resolves false offline);
download/status/deleteAll are unsupported. Android: `androidAudio.ts`.

## Widget and background sync (Android)

- `platform.widget` (`androidWidget.ts` → `WidgetPlugin.java`, `SessionWidgetProvider.java`, a
  port of the Java widget with its layouts and texts). The app hands over core `planWidget`'s
  counts plus later entries; the provider redraws at the next review hour from its own inexact
  alarm (and the hourly `updatePeriodMillis`), without the app.
- `platform.backgroundSync` (`androidBackgroundSync.ts` → `BackgroundSyncPlugin.java`,
  `BackgroundSyncWorker.java`): periodic WorkManager work `bgsync2` like the Java app's (1 h, flex
  5 min, network, battery not low, random first delay), on in server mode with
  `enable_background_sync`. The worker loads `index.html?kk-background-sync` in a headless WebView
  on `https://localhost` (same origin, so the same IndexedDB) and `src/sync/background.ts` runs
  one sync with the app's own engine, over native HTTP and the Keystore token injected as
  `window.KKBackground`; the widget counts come back to the worker. `@capacitor/background-runner`
  (3.0.0, Capacitor 8) was not used: its JS runtime has no IndexedDB, so it can't read the upload
  queue or write progress without a second storage. Skipped while the app is in the foreground.
  Review notifications are not rescheduled in the background (the local-notifications plugin needs
  the Capacitor bridge); the app reschedules on its next resume or pause.

The app controller (`src/sync/deviceSync.ts`) calls all of these: widget after writes, syncs,
resume and pause; notifications on resume and pause; background sync configured on start, resume,
mode switches and when the setting changes.
