/** One-time settings changes at start-up (`core/settings/migrations.ts`). */
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { READING_KIND_ON_APPLIED, settingsMigrations } from '../../src/core/settings/migrations';
import { KkDb } from '../../src/storage/db';
import { makeApp, type Harness } from './fixtures';

describe('settingsMigrations', () => {
  it("turns indicate_kanji_reading_type on once, even when it's stored as off", () => {
    const on = { indicate_kanji_reading_type: true, [READING_KIND_ON_APPLIED]: true };
    expect(settingsMigrations({})).toEqual(on);
    expect(settingsMigrations({ indicate_kanji_reading_type: false })).toEqual(on);
  });

  it('leaves the setting alone once it ran: the user may turn it off again', () => {
    expect(settingsMigrations({ indicate_kanji_reading_type: false, [READING_KIND_ON_APPLIED]: true })).toEqual({});
    expect(settingsMigrations({ [READING_KIND_ON_APPLIED]: true })).toEqual({});
  });
});

describe('at start-up', () => {
  const harnesses: Harness[] = [];
  afterEach(() => { for (const h of harnesses.splice(0)) h.app.dispose?.(); });

  async function storedAndStart(dbName?: string, values: Record<string, boolean> = {}): Promise<Harness> {
    const h = makeApp(dbName === undefined ? {} : { dbName });
    harnesses.push(h);
    const kk = new KkDb(h.dbName);
    await kk.open();
    for (const [key, value] of Object.entries(values)) await kk.settings.put({ key, value });
    kk.close();
    await h.app.start();
    return h;
  }

  it('switches a stored "off" on and keeps a later "off"', async () => {
    const first = await storedAndStart(undefined, { indicate_kanji_reading_type: false });
    expect(first.app.get().prefs.indicate_kanji_reading_type).toBe(true);
    expect(first.app.get().prefs[READING_KIND_ON_APPLIED]).toBe(true);
    // Stored, not only in memory.
    const kk = new KkDb(first.dbName);
    await kk.open();
    expect((await kk.settings.get('indicate_kanji_reading_type'))?.value).toBe(true);
    kk.close();

    await first.app.setPreference('indicate_kanji_reading_type', false);
    first.app.dispose?.();
    const again = await storedAndStart(first.dbName);
    expect(again.app.get().prefs.indicate_kanji_reading_type).toBe(false);
  });
});
