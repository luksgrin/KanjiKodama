import { describe, expect, it, vi } from 'vitest';
import type { AutoBackupEntry, FilesApi } from '../platform';
import {
  AUTO_BACKUP_KEEP,
  BACKUP_REMINDER_DAYS,
  autoBackupName,
  backupReminder,
  parseAutoBackupName,
  planRotation,
  runAutoBackup,
  saveProgressFile,
  type LastSavedStore,
} from './backup';

const DAY = 86_400_000;

describe('auto backup names', () => {
  it('round-trips and sorts by time', () => {
    const at = new Date(Date.UTC(2026, 9, 25, 9, 5, 3, 120));
    const name = autoBackupName(at);
    expect(name).toBe('kanjikodama-autobackup-2026-10-25T09-05-03-120Z.json');
    expect(parseAutoBackupName(name)).toBe(at.getTime());
    expect(autoBackupName(new Date(at.getTime() + 1)) > name).toBe(true);
  });

  it('rejects other names', () => {
    for (const n of ['progress.json', 'kanjikodama-autobackup-2026-10-25.json', 'kanjikodama-autobackup-2026-13-45T99-00-00-000Z.json']) {
      expect(parseAutoBackupName(n)).toBeNull();
    }
  });
});

describe('planRotation', () => {
  const e = (at: number, name = `b${at}`): AutoBackupEntry => ({ name, at });

  it('keeps exactly the newest 5, newest first, whatever the input order', () => {
    const { keep, remove } = planRotation([e(3), e(9), e(1), e(7), e(5), e(8), e(2)]);
    expect(AUTO_BACKUP_KEEP).toBe(5);
    expect(keep.map((x) => x.at)).toEqual([9, 8, 7, 5, 3]);
    expect(remove.map((x) => x.at)).toEqual([2, 1]);
  });

  it('removes nothing with 5 or fewer, and breaks ties by name', () => {
    expect(planRotation([e(1), e(2)]).remove).toEqual([]);
    expect(planRotation([e(1, 'a'), e(1, 'b')], 1)).toEqual({ keep: [e(1, 'b')], remove: [e(1, 'a')] });
  });
});

describe('runAutoBackup', () => {
  it('skips the export on the PWA', async () => {
    const exportText = vi.fn(() => Promise.resolve('x'));
    const files: FilesApi = { saveText: vi.fn(), openText: vi.fn() };
    await expect(runAutoBackup(files, exportText)).resolves.toBeNull();
    expect(exportText).not.toHaveBeenCalled();
  });

  it('writes the export text on Android', async () => {
    const now = new Date(0);
    const writeAutoBackup = vi.fn((_t: string, at?: Date) => Promise.resolve({ name: 'n', at: at!.getTime() }));
    const files: FilesApi = { saveText: vi.fn(), openText: vi.fn(), writeAutoBackup };
    await expect(runAutoBackup(files, () => Promise.resolve('EXPORT'), now)).resolves.toEqual({ name: 'n', at: 0 });
    expect(writeAutoBackup).toHaveBeenCalledWith('EXPORT', now);
  });
});

describe('backupReminder', () => {
  const now = Date.UTC(2026, 9, 25, 12);

  it('reminds when never saved, unless there is no progress', () => {
    expect(backupReminder(null, now)).toEqual({ state: 'never', daysAgo: null, show: true });
    expect(backupReminder(undefined, now, { hasProgress: false })).toEqual({ state: 'none', daysAgo: null, show: false });
  });

  it('is due from 7 whole days on', () => {
    expect(BACKUP_REMINDER_DAYS).toBe(7);
    expect(backupReminder(now, now)).toEqual({ state: 'ok', daysAgo: 0, show: false });
    expect(backupReminder(now - 7 * DAY + 1, now)).toEqual({ state: 'ok', daysAgo: 6, show: false });
    expect(backupReminder(now - 7 * DAY, now)).toEqual({ state: 'due', daysAgo: 7, show: true });
    expect(backupReminder(now - 30 * DAY, now).daysAgo).toBe(30);
  });

  it('treats a future lastSavedAt (clock change) as today, and honours a custom threshold', () => {
    expect(backupReminder(now + DAY, now)).toEqual({ state: 'ok', daysAgo: 0, show: false });
    expect(backupReminder(now - 2 * DAY, now, { thresholdDays: 2 }).state).toBe('due');
  });
});

describe('saveProgressFile', () => {
  function store(): LastSavedStore & { value: number | null } {
    const s = {
      value: null as number | null,
      getLastSavedAt: () => Promise.resolve(s.value),
      setLastSavedAt: (at: number) => { s.value = at; return Promise.resolve(); },
    };
    return s;
  }

  it('records lastSavedAt only when saved', async () => {
    const s = store();
    const files: FilesApi = { saveText: vi.fn().mockResolvedValueOnce('cancelled').mockResolvedValueOnce('saved'), openText: vi.fn() };
    await expect(saveProgressFile(files, s, 'p.json', 'T', () => 42)).resolves.toBe('cancelled');
    expect(s.value).toBeNull();
    await expect(saveProgressFile(files, s, 'p.json', 'T', () => 42)).resolves.toBe('saved');
    expect(s.value).toBe(42);
  });

  it('leaves lastSavedAt untouched on errors', async () => {
    const s = store();
    const files: FilesApi = { saveText: vi.fn().mockRejectedValue(new Error('boom')), openText: vi.fn() };
    await expect(saveProgressFile(files, s, 'p.json', 'T')).rejects.toThrow('boom');
    expect(s.value).toBeNull();
  });
});
