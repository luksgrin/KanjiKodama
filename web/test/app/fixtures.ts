/** Shared fakes for the app-layer tests: synthetic content, a fake platform, a started controller. */
import { vi } from 'vitest';
import type { LoadedContent } from '../../src/content/contentFile';
import type { Content } from '../../src/core/content';
import type { Capabilities, FilesApi, Platform } from '../../src/platform';
import { createAppController, type AppController } from '../../src/app/appController';
import { manualClock } from '../../src/app/clock';
import { KkDb } from '../../src/storage/db';
import { NO_JLPT, freshName, smallContent } from '../progress-storage/helpers';

export const T0 = Date.UTC(2026, 9, 25, 9, 30);

export function loaded(content: Content = smallContent()): LoadedContent {
  return { manifest: null, db: null as never, content, wkOrder: new Map(), jlptOrder: new Map(), jlptBlocks: [], jlptKanji: new Map(NO_JLPT) };
}

const WEB_CAPS: Capabilities = {
  notifications: false, audio: false, audioPlayback: false, audioDownload: false, haptics: false, backgroundSync: false, widget: false,
  cleartextHttp: false, legacyMigration: false, autoBackup: false,
};

export function fakePlatform(files: Partial<FilesApi> = {}, caps: Partial<Capabilities> = {}): Platform {
  return {
    name: 'web',
    capabilities: { ...WEB_CAPS, ...caps },
    storage: { persist: vi.fn(async () => true), persisted: vi.fn(async () => false), estimate: vi.fn(async () => ({ usage: 1e6, quota: 1e9 })) },
    files: { saveText: vi.fn(async () => 'saved' as const), openText: vi.fn(async () => null), ...files },
  } as unknown as Platform;
}

export interface Harness {
  app: AppController;
  clock: ReturnType<typeof manualClock>;
  dbName: string;
  platform: Platform;
}

export function makeApp(opts: { dbName?: string; content?: Content; platform?: Platform; loadContent?: () => Promise<LoadedContent>; at?: number } = {}): Harness {
  const dbName = opts.dbName ?? freshName();
  const clock = manualClock(opts.at ?? T0);
  const platform = opts.platform ?? fakePlatform();
  const content = opts.content ?? smallContent();
  const app = createAppController({
    db: new KkDb(dbName),
    platform,
    loadContent: opts.loadContent ?? (async () => loaded(content)),
    clock,
    tickMs: null,
  });
  return { app, clock, dbName, platform };
}
