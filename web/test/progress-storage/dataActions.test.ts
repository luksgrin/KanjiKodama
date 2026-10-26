/**
 * Settings backup / restore (Java `BackupActivity` format), data import / export (search presets,
 * star ratings) and "Reset database".
 */
import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DataImportError,
  parseSearchPresetsImport,
  parseStarRatingsImport,
  searchPresetsExportText,
  starRatingsExportText,
} from '../../src/progress/dataExport';
import { RESET_DATABASE_WARNING, resetLocalDatabase, resetServerDatabase } from '../../src/progress/resetDatabase';
import { SettingsBackupError, parseSettingsBackup, settingsBackupFileName, settingsBackupText } from '../../src/progress/settingsBackup';
import { ServerStore, KEYS } from '../../src/sync/store';
import { readSnapshot } from '../../src/storage/progressRepo';
import { NO_JLPT, openDb, smallContent } from './helpers';

const javaBackup = readFileSync(join(process.cwd(), 'test/progress-storage/fixtures/java-settings-backup.json'), 'utf8');

describe('settings backup', () => {
  it('reads a backup made by the Java app (emulator, show_legacy on)', () => {
    const s = parseSettingsBackup(javaBackup);
    expect(Object.keys(s)).toHaveLength(140);
    expect(s.show_legacy).toBe(true);
    expect(s.max_review_session_size).toBe('100'); // EditTextPreference: a String
    expect(s.stroke_order_size).toBe(250); // SeekBarPreference: an Integer
    expect(s.theme).toBe('KANJIKODAMA_LIGHT');
    expect(s.show_timeline).toBe(true);
  });

  it('writes the Java format (value as text, Java class name) and reads it back', () => {
    const prefs = { a: true, b: 'x', c: 50, d: 1.5, e: 5_000_000_000, f: null, g: undefined };
    const text = settingsBackupText(prefs);
    expect(JSON.parse(text)).toEqual({
      a: { value: 'true', type: 'Boolean' },
      b: { value: 'x', type: 'String' },
      c: { value: '50', type: 'Integer' },
      d: { value: '1.5', type: 'Float' },
      e: { value: '5000000000', type: 'Long' },
    });
    expect(parseSettingsBackup(text)).toEqual({ a: true, b: 'x', c: 50, d: 1.5, e: 5_000_000_000 });
    // A Java restore of the Java file and of ours give the same values.
    expect(parseSettingsBackup(settingsBackupText(parseSettingsBackup(javaBackup)))).toEqual(parseSettingsBackup(javaBackup));
  });

  it('fails as a whole like the Java restore', () => {
    expect(() => parseSettingsBackup('nope')).toThrow(SettingsBackupError);
    expect(() => parseSettingsBackup('[]')).toThrow(SettingsBackupError);
    expect(() => parseSettingsBackup('{"a":{"value":"x","type":"HashSet"}}')).toThrow('Unsupported type: HashSet');
    expect(() => parseSettingsBackup('{"a":{"value":"1.5","type":"Integer"}}')).toThrow(SettingsBackupError);
    expect(() => parseSettingsBackup('{"a":{"type":"String"}}')).toThrow(SettingsBackupError);
    expect(parseSettingsBackup('{"a":{"value":"TRUE","type":"Boolean"},"b":{"value":"yes","type":"Boolean"}}')).toEqual({ a: true, b: false });
  });

  it('names the file like the Java app', () => {
    expect(settingsBackupFileName(new Date(2026, 9, 6, 23, 59))).toBe('smouldering_durtles_2026-10-06.json');
  });
});

describe('data import / export', () => {
  it('exports search presets as SearchPresetExport and imports them back', () => {
    const presets = [
      { name: 'b', type: 1, data: 'fire' },
      { name: '\u0000SELF_STUDY_DEFAULT', type: 2, data: '{"x":1}' },
      { name: 'a', type: 0, data: '5' },
    ];
    const text = searchPresetsExportText(presets);
    expect(JSON.parse(text)).toEqual({
      namedPresets: [{ name: 'b', type: 1, data: 'fire' }, { name: 'a', type: 0, data: '5' }],
      selfStudyPreset: { name: '\u0000SELF_STUDY_DEFAULT', type: 2, data: '{"x":1}' },
    });
    expect(parseSearchPresetsImport(text)).toHaveLength(3);
    expect(JSON.parse(searchPresetsExportText([]))).toEqual({ namedPresets: [], selfStudyPreset: null });
  });

  it('reads search presets leniently like Jackson, and rejects what it rejects', () => {
    expect(parseSearchPresetsImport('{"namedPresets":[{"name":"x","type":"1","extra":true}],"other":1}'))
      .toEqual([{ name: 'x', type: 1, data: '' }]);
    expect(parseSearchPresetsImport('{}')).toEqual([]);
    expect(() => parseSearchPresetsImport('{"namedPresets":null}')).toThrow(DataImportError);
    expect(() => parseSearchPresetsImport('{"namedPresets":[{"type":"x"}]}')).toThrow(DataImportError);
    expect(() => parseSearchPresetsImport('[')).toThrow(DataImportError);
  });

  it('exports star ratings as StarRatingsExport and imports them in Java order', () => {
    const text = starRatingsExportText(new Map([[30, 1], [10, 1], [20, 5]]));
    expect(JSON.parse(text)).toEqual({ stars1: [10, 30], stars2: [], stars3: [], stars4: [], stars5: [20] });
    expect(parseStarRatingsImport(text)).toEqual([[1, [10, 30]], [2, []], [3, []], [4, []], [5, [20]]]);
    expect(parseStarRatingsImport('{"stars3":[1]}')).toEqual([[1, []], [2, []], [3, [1]], [4, []], [5, []]]);
    expect(() => parseStarRatingsImport('{"stars1":null}')).toThrow(DataImportError);
    expect(() => parseStarRatingsImport('{"stars1":["a"]}')).toThrow(DataImportError);
  });
});

describe('reset database', () => {
  it('has the Java warning text', () => {
    expect(RESET_DATABASE_WARNING).toMatch(/^Warning: Resetting the database will clear all content from the app's database except for your settings\./);
  });

  it('local mode: level 1 again, progress, session and stars gone, settings, presets, jumps kept', async () => {
    const kk = await openDb();
    const content = smallContent();
    await kk.subjects.bulkPut([{ id: 1, startedAt: 5, passedAt: 6, unlockedAt: 4, meaningNote: 'n' } as never]);
    await kk.state.bulkPut([{ key: 'userLevel', value: 2 }, { key: 'curriculum', value: 'WANIKANI' }]);
    await kk.jumps.add({ at: 1, fromLevel: 1, toLevel: 2 });
    await kk.session.put({ subjectId: 1, kind: 'item' });
    await kk.meta.bulkPut([{ key: 'starRatings', value: { 1: 3 } }, { key: 'searchPresets', value: [{ name: 'a', type: 0, data: '1' }] }]);
    await kk.settings.put({ key: 'show_legacy', value: true });

    await resetLocalDatabase(kk, { content, jlptKanji: NO_JLPT, now: 1000 });

    const snap = await readSnapshot(kk);
    expect(snap.progress.userLevel).toBe(1);
    expect(snap.progress.subjects.get(1)?.startedAt ?? 0).toBe(0);
    expect(snap.progress.subjects.get(1)?.meaningNote ?? null).toBeNull();
    expect(snap.progress.subjects.get(1)?.unlockedAt).toBe(1000); // LocalProgression.update unlocked level 1
    expect(snap.progress.jumps).toHaveLength(1);
    expect(await kk.session.count()).toBe(0);
    expect(await kk.meta.get('starRatings')).toBeUndefined();
    expect(await kk.meta.get('searchPresets')).toBeDefined();
    expect(await kk.settings.get('show_legacy')).toEqual({ key: 'show_legacy', value: true });
  });

  it('server mode: downloads, queue and stars gone, the connection kept', async () => {
    const kk = await openDb();
    const store = new ServerStore(kk);
    await store.set(KEYS.baseUrl, 'https://example.test');
    await kk.subjects.put({ id: 1, startedAt: 5 } as never);
    await kk.meta.put({ key: 'starRatings', value: { 1: 3 } });
    await resetServerDatabase(kk, store);
    expect(await kk.subjects.count()).toBe(0);
    expect(await kk.meta.get('starRatings')).toBeUndefined();
    expect(await store.baseUrl()).toBe('https://example.test');
  });
});
