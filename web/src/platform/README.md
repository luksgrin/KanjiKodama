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
| `notifications` | spike API (`supported`, `requestPermission`, `schedule`, `cancelAll`); step 5 replaces it |

Errors (write failure, unreadable file) reject. Cancelling a picker or share sheet does not reject.

The backup policy is in `src/progress/backup.ts`, not here: `runAutoBackup(files, exportText)` after
each session, `backupReminder(lastSavedAt, now)` for the PWA reminder, `saveProgressFile(files,
store, name, text)` to save and record `lastSavedAt`, plus the name and rotation helpers.

## What each build does

| | Android (`android.ts`) | PWA (`web.ts`) |
|---|---|---|
| Save progress file | System create-document picker (`ACTION_CREATE_DOCUMENT`) through the local `Document` plugin; Drive, Downloads etc. are offered, as in the Java app. Dismissed → `'cancelled'`. If the plugin is missing (old APK), it writes to the cache dir and opens the share sheet (`@capacitor/share`). | Web Share API with a `File` when `navigator.canShare({files})` (iOS share sheet → Save to Files, iCloud Drive, Google Drive app). `AbortError` → `'cancelled'`. Any other share error, or no file sharing → Blob download, always reported `'saved'` (browsers don't say whether it was kept). |
| Open progress file | `ACTION_OPEN_DOCUMENT` through the `Document` plugin; falls back to `<input type=file>`. | Hidden `<input type=file>`; `cancel` event → `null` (very old browsers never fire it, so the promise stays pending). |
| Auto backup | After each session, `files/backups/kanjikodama-autobackup-<UTC ISO time>.json` via `@capacitor/filesystem` (`Directory.Data`); the newest 5 are kept; only files matching that name pattern are ever deleted. Android Auto Backup also covers `files/`. | None. A "last saved N days ago" reminder instead: shown when there is progress and it was never saved, or the last save is 7 or more whole days old. |
| Storage persistence | `navigator.storage.*` in the WebView (data lives in the app's private dir anyway). | `navigator.storage.persist()`; still not a guarantee (see below). |

### Why a local plugin for the Android save picker
No installed plugin can open the create-document picker: `@capacitor/filesystem` writes only to
app and public directories, and `@capacitor/share` is a share sheet (it offers "Drive" as an upload
target but not a folder choice, and gives no reliable "saved" signal). The spike already had a ~150
line `DocumentPlugin.java` (`web/android/app/src/main/java/app/kanjikodama/spike/`, registered in
`MainActivity`), so it is kept; the TS side is `registerPlugin<DocumentPlugin>('Document')` in
`android.ts`. No npm dependency was added.

## Limitations

- **PWA: no auto backup.** A web app can't write files without a user gesture; the reminder is the
  substitute.
- **PWA: storage can be cleared.** Deleting the home-screen icon, clearing website data, or iOS
  running low on space can delete IndexedDB even after `persist()`. Saving the progress file
  regularly is the only protection.
- **PWA: a download is assumed saved.** Only the share sheet reports a cancel.
- **Android: auto backups are lost with "Clear storage" or uninstall** (same directory as the data),
  except what Android Auto Backup restored to Google's cloud.
