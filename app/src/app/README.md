# App state layer

Framework-free glue between `core/` (logic), `storage/` (Dexie), `content/` and `platform/`. React
binds to it in `ui/hooks/`.

## Start-up (`createAppController(deps).start()`)

Status `idle` → `loading` (`storage`, `content`, `progress`) → `ready`, or `error` with an `AppError`
(`content-missing`, `content-invalid`, `db-blocked`, `db-closed`, `db-failed`; `retryable` → "Try
again" calls `start()` again). The DB and the content load in parallel; then `hydrateLearnerDb`,
`applyOrdering` (when the stored order isn't the chosen curriculum) and `updateProgression` (local mode only: `state.mode !== 'server'`),
persisted. `ensurePersistence` runs in the background (`state.persistence`).

## Reading state

`app.get()` / `app.subscribe()`, in React `useAppState()` or `useReady()` (`ui/hooks/useApp.ts`):

| Field | |
|---|---|
| `status` | see above |
| `learner` | the core `LearnerDb` (mutable, shared: **read only**; change it through `write`) |
| `content` | `LoadedContent` (subjects, orders, the open sql.js db for stroke data / Parts and sound) |
| `platform` | `Platform` (check `capabilities`, never `name`) |
| `prefs` | the `settings` table as core `Preferences` |
| `now` | clock time, refreshed every 30 s: render time-dependent values from it |
| `revision` | bumps on every change: memoize derived values on `[learner, revision, now]` |
| `activity` | the study activity log by study day (core `stats/`); every finished session item counts, through `sessionHooks` |
| `mode`, `persistence`, `lastSavedAt`, `lastWriteError` | |

## Writing

```ts
await app.write((learner, now) => reportLocal(learner, id, …, now));   // persist: 'auto'
await app.write(op, { persist: { subjects: [id] } });                  // only these rows
await app.write(op, { persist: 'all' });                               // everything
await app.write(op, { persist: 'replace' });                           // everything, orphan rows dropped (WaniKani import)
```

Writes run one at a time. `'auto'` diffs the learner (subject rows by reference, the rest by value)
and saves only changed subject rows, or everything when anything else changed (level-ups, curriculum,
level test state). If `op` throws or saving fails, memory is reloaded from the DB, `lastWriteError`
is set and the error is rethrown. The clock is injected (`deps.clock`; tests use `manualClock`).

Rows of subjects the content lacks ("orphans", after a content update) are kept by every save and
exported in the progress file, except `'replace'` and `restoreProgress`, which replace all progress
as a full reset does.

Other actions: `setPreference(key, value)`, `saveProgress()` (call straight from the tap handler:
the file text is built synchronously so iOS keeps the user activation), `exportProgressFile()`,
`openProgressFile()` (→ `{name, text, summary}` or null; throws `ProgressImportError`),
`restoreProgress(text)`, `backupReminder()`.

## Routing and back

`router.ts`: hash routes (`#/settings`), `matchRoute`/`buildPath`, `createHashLocation()` (browser)
and `createMemoryLocation()` (tests). Routes and path builders: `ui/routes.ts`; hooks `useRoute`,
`useNavigate`, `useBackHandler` (`ui/hooks/useRoute.ts`). `back.ts`: a handler stack; the Android
back button (`main.tsx`), Escape and the top bar's back arrow call `handleBack`.

## Server mode, device glue (`src/sync/deviceSync.ts`)

- `state.mode === 'server'`: `state.content.content` is the server's subjects (`loadServerContent`;
  bundled Parts and sound, strokes and pitch still by id); `app.bundledContent()` is the file.
- `app.syncEngine()` (status, subscribe, setToken), `app.syncNow({manual})`, `app.flushUploads()`:
  the learner is reloaded (in place) after a sync that wrote something.
- **Sessions must take their hooks from `app.sessionHooks(base)`**: in server mode the `report`
  hook predicts locally (core `reportServer`) and the write queues and sends the upload. In both
  modes the `report` hook also counts the item towards its study day (`state.activity`, saved with
  the write, dropped if it fails).
- `app.tokenStore()`: the server token in `platform.secrets` (moved from `state` on first read).
- `app.reload()` after a mode switch; `app.connectionOptions()` for one-off server calls.
- Lifecycle: resume → `tick`, re-count, notifications, widget, sync (server mode); pause →
  notifications, widget. Widget after every write; background sync on in server mode with
  `enable_background_sync`.
