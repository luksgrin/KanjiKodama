/**
 * The app state layer (framework-free): start-up, the observable state, and the single write path.
 *
 * Start-up (`start()`):
 * 1. open the progress DB (Dexie) and read the stored progress, while the content file loads;
 * 2. join both into the core's in-memory `LearnerDb` (`hydrateLearnerDb`: fresh WaniKani layout,
 *    stored ordering applied), then, like `WkApplication`'s start task in local mode,
 *    `Curriculum.ensureOrdering` (table re-laid when ordering != chosen curriculum) and
 *    `LocalProgression.update`, persisted;
 * 3. ready. Persistent storage (`ensurePersistence`) runs alongside and never delays start-up
 *    (Firefox shows a prompt and waits for it).
 *
 * Writes (`write(op)`): one at a time, in call order. `op` changes the `LearnerDb` in memory (core
 * operations: `reportLocal`, `switchCurriculum`, …), then the changed rows are saved and the store
 * notifies. If saving fails, the in-memory state is reloaded from the database (so memory never
 * claims what isn't stored) and the error is rethrown.
 *
 * The `LearnerDb` is mutable and shared; each change publishes a new `AppState` object with a higher
 * `revision`, so derived values can be memoized on `revision`.
 */
import type { LoadedContent } from '../content/contentFile';
import { emptyProgress, exportProgress, type ProgressState } from '../core/progressFile';
import { applyOrdering, updateProgression, type LearnerDb } from '../core/progression';
import type { Preferences, PreferenceValue } from '../core/settings';
import type { Platform } from '../platform';
import { backupReminder, saveProgressFile, type BackupReminder } from '../progress/backup';
import { progressFileName } from '../progress/exportFile';
import { importProgress, previewImport, type ImportPreview } from '../progress/importFile';
import { lastSavedStore, type KkDb } from '../storage/db';
import { ensurePersistence, type PersistenceInfo } from '../storage/persistence';
import { hydrateLearnerDb, readSnapshot, saveLearnerDb, saveSubjects, type LearnerSnapshot } from '../storage/progressRepo';
import { systemClock, type Clock } from './clock';
import { DB_BLOCKED, DB_CLOSED, contentError, dbError, type AppError } from './errors';
import { createStore, type ReadableStore } from './store';

export type LoadingStep = 'storage' | 'content' | 'progress';

export type AppStatus =
  | { kind: 'idle' }
  | { kind: 'loading'; step: LoadingStep }
  | { kind: 'error'; error: AppError }
  | { kind: 'ready' };

export interface AppState {
  status: AppStatus;
  /** Set once the platform is known (early in start-up). */
  platform: Platform | null;
  content: LoadedContent | null;
  /** The learner's state, joined with the content. Mutable: read it, change it only through `write`. */
  learner: LearnerDb | null;
  /** The settings in use (`settings` table), as the core's `Preferences`. */
  prefs: Preferences;
  /** Result of the persistent-storage request; null until it has run. */
  persistence: PersistenceInfo | null;
  /** `state.mode`: server mode (`src/sync/`) skips the local-mode start-up work. */
  mode: 'local' | 'server';
  /** Last manual progress save (epoch ms), for the backup reminder. */
  lastSavedAt: number | null;
  /** Epoch ms, refreshed every `tickMs` and on `tick()`: render time-dependent values from this. */
  now: number;
  /** Increases with every published change (learner writes included). */
  revision: number;
  /** The last write that failed to save (memory was reloaded from the database). */
  lastWriteError: string | null;
}

export interface AppDeps {
  /** The progress database (not opened yet; `start` opens it). */
  db: KkDb;
  platform: Platform | (() => Promise<Platform>);
  loadContent: () => Promise<LoadedContent>;
  clock?: Clock;
  /** How often `now` refreshes (ms); null: never (tests call `tick()`). Default 30 s. */
  tickMs?: number | null;
}

/** How a write saves its changes. */
export type PersistMode =
  /** Default: diff the learner before/after; only changed subject rows, or everything if anything else changed. */
  | 'auto'
  /** Save the whole learner state (`saveLearnerDb`). */
  | 'all'
  /** Save only these subjects' rows (`saveSubjects`); the caller guarantees nothing else changed. */
  | { subjects: Iterable<number> };

export interface WriteOptions {
  persist?: PersistMode;
}

export interface SaveOutcome {
  result: 'saved' | 'cancelled';
  name: string;
}

export interface OpenedProgressFile extends ImportPreview {
  /** File name as the picker reported it ('' when unknown). */
  name: string;
}

export interface AppController extends ReadableStore<AppState> {
  readonly clock: Clock;
  readonly db: KkDb;
  /** Starts (or, after an error, restarts) loading. Resolves when ready or failed; never rejects. */
  start(): Promise<void>;
  /** Stops the timer and closes the database. */
  dispose(): void;
  /** Refreshes `now`. */
  tick(): void;
  /** The ready learner; throws when not ready. */
  requireLearner(): LearnerDb;
  /** Applies `op` to the learner at `clock.now()`, saves, notifies; returns `op`'s result. Serialized. */
  write<R>(op: (learner: LearnerDb, now: number) => R, options?: WriteOptions): Promise<R>;
  /** Writes one setting (`settings` table) and publishes the new `prefs`. `undefined` deletes it. */
  setPreference(key: string, value: PreferenceValue): Promise<void>;
  /** The progress file to save now: name and text (synchronous, from memory incl. orphan rows). */
  exportProgressFile(): { name: string; text: string };
  /**
   * Save progress through the platform (picker / share sheet) and record `lastSavedAt`. Call it
   * directly from the tap handler: the file text is built synchronously so iOS keeps the tap's user
   * activation for `navigator.share()`.
   */
  saveProgress(): Promise<SaveOutcome>;
  /** Lets the user pick a progress file and validates it; null when cancelled. Throws `ProgressImportError`. */
  openProgressFile(): Promise<OpenedProgressFile | null>;
  /** Replaces all progress with the file's (after the user confirmed). Returns the Android message. */
  restoreProgress(text: string): Promise<string>;
  /** The backup reminder at `now` (PWA; Android has auto backups and never shows it). */
  backupReminder(): BackupReminder;
}

const DEFAULT_TICK_MS = 30_000;

function initialState(now: number): AppState {
  return {
    status: { kind: 'idle' },
    platform: null,
    content: null,
    learner: null,
    prefs: {},
    persistence: null,
    mode: 'local',
    lastSavedAt: null,
    now,
    revision: 0,
    lastWriteError: null,
  };
}

function isPreferenceValue(v: unknown): v is PreferenceValue {
  return v === null || ['boolean', 'number', 'string'].includes(typeof v);
}

/** Everything the learner stores except the subject rows, as a comparable string (it is small). */
function fingerprintOthers(l: LearnerDb): string {
  const p = l.progress;
  return JSON.stringify([
    p.userLevel, p.curriculum, l.ordering, l.blocks,
    [...p.levelProgression.entries()], [...p.probation.entries()], p.jumps,
    [...l.state.entries()], [...l.levelTest.entries()],
  ]);
}

/** Subject and probation rows the database keeps for subjects the current content doesn't have. */
interface Orphans {
  subjects: ProgressState['subjects'];
  probation: ProgressState['probation'];
}

function orphansOf(snap: LearnerSnapshot, learner: LearnerDb): Orphans {
  const o: Orphans = { subjects: new Map(), probation: new Map() };
  for (const [id, row] of snap.progress.subjects) if (!learner.table.has(id)) o.subjects.set(id, row);
  for (const [id, since] of snap.progress.probation) if (!learner.table.has(id)) o.probation.set(id, since);
  return o;
}

export function createAppController(deps: AppDeps): AppController {
  const clock = deps.clock ?? systemClock;
  const kk = deps.db;
  const store = createStore<AppState>(initialState(clock.now()));
  const saved = lastSavedStore(kk);
  let orphans: Orphans = { subjects: new Map(), probation: new Map() };
  let starting: Promise<void> | null = null;
  let queue: Promise<unknown> = Promise.resolve();
  let timer: ReturnType<typeof setInterval> | undefined;
  let disposed = false;

  const patch = (changes: Partial<AppState>, bump = false): void => {
    const prev = store.get();
    store.set({ ...prev, ...changes, revision: bump ? prev.revision + 1 : prev.revision });
  };
  const fail = (error: AppError): void => patch({ status: { kind: 'error', error } });
  const isBlocked = (): boolean => {
    const st = store.get().status;
    return st.kind === 'error' && st.error.code === 'db-blocked';
  };

  // Another tab with an older schema blocks our upgrade; a newer one asks us to close.
  kk.on('blocked', () => {
    if (store.get().status.kind === 'loading') fail(DB_BLOCKED);
  });
  kk.on('versionchange', () => {
    kk.close();
    fail(DB_CLOSED);
    return false;
  });

  async function resolvePlatform(): Promise<Platform> {
    return typeof deps.platform === 'function' ? deps.platform() : deps.platform;
  }

  async function openDb(): Promise<LearnerSnapshot> {
    if (!kk.isOpen()) await kk.open();
    return readSnapshot(kk);
  }

  async function readPrefs(): Promise<Preferences> {
    const out: Record<string, PreferenceValue> = {};
    for (const r of await kk.settings.toArray()) if (isPreferenceValue(r.value)) out[r.key] = r.value;
    return out;
  }

  async function isServerMode(): Promise<boolean> {
    return (await kk.state.get('mode'))?.value === 'server';
  }

  async function persist(learner: LearnerDb, mode: PersistMode, before?: { rows: Map<number, unknown>; others: string; progress: unknown }): Promise<void> {
    if (mode === 'all') return saveLearnerDb(kk, learner);
    if (mode !== 'auto') return saveSubjects(kk, learner, mode.subjects);
    if (!before || before.progress !== learner.progress || before.others !== fingerprintOthers(learner)) {
      return saveLearnerDb(kk, learner);
    }
    const changed: number[] = [];
    for (const [id, row] of learner.progress.subjects) if (before.rows.get(id) !== row) changed.push(id);
    for (const id of before.rows.keys()) if (!learner.progress.subjects.has(id)) changed.push(id);
    if (changed.length > 0) await saveSubjects(kk, learner, changed);
  }

  function capture(learner: LearnerDb) {
    return { rows: new Map<number, unknown>(learner.progress.subjects), others: fingerprintOthers(learner), progress: learner.progress };
  }

  async function run(): Promise<void> {
    patch({ status: { kind: 'loading', step: 'storage' }, lastWriteError: null });
    let platform: Platform;
    try {
      platform = await resolvePlatform();
    } catch (e) {
      fail({ code: 'unknown', message: 'The app could not start.', detail: String(e), retryable: true });
      return;
    }
    patch({ platform });

    const snapP = openDb().then(
      (snap) => {
        if (store.get().status.kind === 'loading' || isBlocked()) patch({ status: { kind: 'loading', step: 'content' } });
        return snap;
      },
    );
    const contentP = deps.loadContent();
    contentP.catch(() => undefined); // handled below, after the database
    // Persistent storage: in the background (may wait for a browser prompt).
    void snapP.then(() => ensurePersistence(platform.storage, kk, clock.now()))
      .then((persistence) => patch({ persistence }), () => undefined);

    let snap: LearnerSnapshot;
    try {
      snap = await snapP;
    } catch (e) {
      if (store.get().status.kind !== 'error') fail(dbError(e));
      return;
    }
    let content: LoadedContent;
    try {
      content = await contentP;
    } catch (e) {
      fail(contentError(e));
      return;
    }
    if (store.get().status.kind === 'error') return; // closed by a newer version meanwhile

    patch({ status: { kind: 'loading', step: 'progress' }, content });
    try {
      const learner = hydrateLearnerDb(content.content, content.jlptKanji, snap);
      orphans = orphansOf(snap, learner);
      const [prefs, lastSavedAt, server] = await Promise.all([readPrefs(), saved.getLastSavedAt(), isServerMode()]);
      if (!server) {
        // WkApplication start task, local mode: Curriculum.ensureOrdering, LocalProgression.update.
        const before = capture(learner);
        if (learner.ordering !== learner.progress.curriculum) applyOrdering(learner, learner.progress.curriculum);
        updateProgression(learner, clock.now());
        await persist(learner, 'auto', before);
      }
      patch({ learner, prefs, lastSavedAt, mode: server ? 'server' : 'local', now: clock.now(), status: { kind: 'ready' } }, true);
    } catch (e) {
      fail(dbError(e));
    }
  }

  function startTimer(): void {
    const ms = deps.tickMs === undefined ? DEFAULT_TICK_MS : deps.tickMs;
    if (ms === null || timer !== undefined) return;
    timer = setInterval(() => controller.tick(), ms);
  }

  async function reloadLearner(): Promise<void> {
    const content = store.get().content;
    if (!content) return;
    const snap = await readSnapshot(kk);
    const learner = hydrateLearnerDb(content.content, content.jlptKanji, snap);
    orphans = orphansOf(snap, learner);
    patch({ learner }, true);
  }

  function enqueue<R>(task: () => Promise<R>): Promise<R> {
    const p = queue.then(task, task);
    queue = p.catch(() => undefined);
    return p;
  }

  const controller: AppController = {
    clock,
    db: kk,
    get: store.get,
    subscribe: store.subscribe,

    start() {
      if (disposed) return Promise.resolve();
      const status = store.get().status.kind;
      if (starting && (status === 'loading' || status === 'ready')) return starting;
      startTimer();
      starting = run();
      return starting;
    },

    dispose() {
      disposed = true;
      if (timer !== undefined) clearInterval(timer);
      timer = undefined;
      kk.close();
    },

    tick() {
      patch({ now: clock.now() });
    },

    requireLearner() {
      const l = store.get().learner;
      if (!l || store.get().status.kind !== 'ready') throw new Error('the app is not ready');
      return l;
    },

    write(op, options = {}) {
      return enqueue(async () => {
        const learner = controller.requireLearner();
        const mode = options.persist ?? 'auto';
        const before = mode === 'auto' ? capture(learner) : undefined;
        const now = clock.now();
        let result;
        try {
          result = op(learner, now);
          await persist(learner, mode, before);
        } catch (e) {
          // The op may have changed memory partly, or the save failed: memory follows the database.
          const message = e instanceof Error ? e.message : String(e);
          try {
            await reloadLearner();
          } catch {
            // keep the in-memory state; the error below is what matters
          }
          patch({ lastWriteError: message }, true);
          throw e;
        }
        patch({ now, lastWriteError: null }, true);
        return result;
      });
    },

    setPreference(key, value) {
      return enqueue(async () => {
        if (value === undefined) await kk.settings.delete(key);
        else await kk.settings.put({ key, value });
        const prefs: Record<string, PreferenceValue> = { ...store.get().prefs };
        if (value === undefined) delete prefs[key];
        else prefs[key] = value;
        patch({ prefs }, true);
      });
    },

    exportProgressFile() {
      const learner = controller.requireLearner();
      const now = clock.now();
      const p = learner.progress;
      const state: ProgressState = { ...emptyProgress(p.curriculum), ...p };
      if (orphans.subjects.size > 0) state.subjects = new Map([...orphans.subjects, ...p.subjects]);
      if (orphans.probation.size > 0) state.probation = new Map([...orphans.probation, ...p.probation]);
      return { name: progressFileName(now), text: exportProgress(state, now) };
    },

    async saveProgress() {
      const platform = store.get().platform;
      if (!platform) throw new Error('the app is not ready');
      const { name, text } = controller.exportProgressFile();
      // saveProgressFile calls files.saveText before its first await: the user activation survives.
      const result = await saveProgressFile(platform.files, saved, name, text, () => clock.now());
      if (result === 'saved') patch({ lastSavedAt: await saved.getLastSavedAt() }, true);
      return { result, name };
    },

    async openProgressFile() {
      const platform = store.get().platform;
      if (!platform) throw new Error('the app is not ready');
      const opened = await platform.files.openText();
      if (opened === null) return null;
      return { name: opened.name, ...previewImport(opened.text) };
    },

    restoreProgress(text) {
      return enqueue(async () => {
        const content = store.get().content;
        if (!content || store.get().status.kind !== 'ready') throw new Error('the app is not ready');
        const res = await importProgress(kk, text, { content: content.content, jlptKanji: content.jlptKanji, now: clock.now() });
        orphans = { subjects: new Map(), probation: new Map() };
        patch({ learner: res.learner, now: clock.now(), lastWriteError: null }, true);
        return res.message;
      });
    },

    backupReminder() {
      const s = store.get();
      const learner = s.learner;
      const started = (rows: Iterable<{ startedAt: unknown }>): boolean => {
        for (const r of rows) if (typeof r.startedAt === 'number' && r.startedAt !== 0) return true;
        return false;
      };
      const hasProgress = learner !== null && (started(learner.progress.subjects.values()) || started(orphans.subjects.values()));
      return backupReminder(s.lastSavedAt, s.now, { hasProgress });
    },
  };
  return controller;
}
