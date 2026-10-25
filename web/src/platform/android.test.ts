import { beforeEach, describe, expect, it, vi } from 'vitest';
import { autoBackupName } from '../progress/backup';

// In-memory files/ directory for the mocked @capacitor/filesystem.
const fsState = vi.hoisted(() => ({
  files: new Map<string, string>(), // "DATA:backups/x.json" -> text
  failDelete: false,
}));
const docMock = vi.hoisted(() => ({ save: vi.fn(), open: vi.fn() }));
const shareMock = vi.hoisted(() => ({ share: vi.fn() }));

vi.mock('@capacitor/core', () => ({ registerPlugin: () => docMock, Capacitor: { isNativePlatform: () => true } }));
vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications: {} }));
vi.mock('@capacitor/share', () => ({ Share: shareMock }));
vi.mock('@capacitor/filesystem', () => {
  const key = (dir: string, path: string) => `${dir}:${path}`;
  return {
    Directory: { Data: 'DATA', Cache: 'CACHE' },
    Encoding: { UTF8: 'utf8' },
    Filesystem: {
      writeFile: vi.fn(async ({ path, data, directory }: { path: string; data: string; directory: string }) => {
        fsState.files.set(key(directory, path), data);
        return { uri: `file:///${directory}/${path}` };
      }),
      readdir: vi.fn(async ({ path, directory }: { path: string; directory: string }) => {
        const prefix = key(directory, `${path}/`);
        const names = [...fsState.files.keys()].filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length));
        if (names.length === 0) throw new Error('Directory does not exist');
        return { files: names.map((name) => ({ name, type: 'file', size: 1, mtime: 0, uri: '' })) };
      }),
      deleteFile: vi.fn(async ({ path, directory }: { path: string; directory: string }) => {
        if (fsState.failDelete) throw new Error('io');
        fsState.files.delete(key(directory, path));
      }),
    },
  };
});

const { androidPlatform } = await import('./android');
const files = androidPlatform.files;

function unimplemented() {
  return Object.assign(new Error('"Document" plugin is not implemented on android'), { code: 'UNIMPLEMENTED' });
}

beforeEach(() => {
  fsState.files.clear();
  fsState.failDelete = false;
  docMock.save.mockReset();
  docMock.open.mockReset();
  shareMock.share.mockReset();
});

describe('android saveText', () => {
  it('saves through the create-document picker', async () => {
    docMock.save.mockResolvedValue({ saved: true, uri: 'content://x' });
    await expect(files.saveText('p.json', 'T')).resolves.toBe('saved');
    expect(docMock.save).toHaveBeenCalledWith({ filename: 'p.json', text: 'T', mimeType: 'application/json' });
  });

  it('reports cancelled when the picker is dismissed', async () => {
    docMock.save.mockResolvedValue({ saved: false });
    await expect(files.saveText('p.json', 'T')).resolves.toBe('cancelled');
  });

  it('rejects on write errors', async () => {
    docMock.save.mockRejectedValue(new Error('Write failed: disk full'));
    await expect(files.saveText('p.json', 'T')).rejects.toThrow('disk full');
  });

  it('falls back to the share sheet when the native plugin is missing', async () => {
    docMock.save.mockRejectedValue(unimplemented());
    shareMock.share.mockResolvedValue({});
    await expect(files.saveText('p.json', 'T')).resolves.toBe('saved');
    expect(fsState.files.get('CACHE:p.json')).toBe('T');
    expect(shareMock.share).toHaveBeenCalledWith(expect.objectContaining({ files: ['file:///CACHE/p.json'] }));

    shareMock.share.mockRejectedValue(new Error('Share canceled'));
    await expect(files.saveText('p.json', 'T')).resolves.toBe('cancelled');
  });
});

describe('android openText', () => {
  it('returns name and text, or null on cancel', async () => {
    docMock.open.mockResolvedValue({ cancelled: false, text: '{}', name: 'p.json' });
    await expect(files.openText()).resolves.toEqual({ name: 'p.json', text: '{}' });
    docMock.open.mockResolvedValue({ cancelled: true });
    await expect(files.openText()).resolves.toBeNull();
  });
});

describe('android auto backups', () => {
  const t0 = Date.UTC(2026, 9, 25, 9, 0, 0);

  it('writes to files/backups/ and keeps exactly the newest 5', async () => {
    // Write out of time order to check that rotation sorts by time, not by write order.
    const offsets = [3, 0, 6, 1, 5, 2, 4];
    for (const h of offsets) await files.writeAutoBackup!(`text-${h}`, new Date(t0 + h * 3_600_000));
    const listed = await files.listAutoBackups!();
    expect(listed.map((e) => e.at)).toEqual([6, 5, 4, 3, 2].map((h) => t0 + h * 3_600_000));
    expect(fsState.files.size).toBe(5);
    expect(fsState.files.get(`DATA:backups/${autoBackupName(new Date(t0 + 6 * 3_600_000))}`)).toBe('text-6');
  });

  it('ignores foreign files and tolerates a missing directory or failed deletes', async () => {
    await expect(files.listAutoBackups!()).resolves.toEqual([]);
    fsState.files.set('DATA:backups/notes.txt', 'keep me');
    fsState.failDelete = true;
    for (let i = 0; i < 7; i++) await files.writeAutoBackup!('x', new Date(t0 + i * 1000));
    expect(fsState.files.get('DATA:backups/notes.txt')).toBe('keep me');
    expect(await files.listAutoBackups!()).toHaveLength(7); // deletes failed, retried next time
    fsState.failDelete = false;
    const entry = await files.writeAutoBackup!('y', new Date(t0 + 60_000));
    const listed = await files.listAutoBackups!();
    expect(listed).toHaveLength(5);
    expect(listed[0]).toEqual(entry);
    expect(fsState.files.has('DATA:backups/notes.txt')).toBe(true);
  });

  it('declares the auto backup capability', () => {
    expect(androidPlatform.capabilities.autoBackup).toBe(true);
  });
});
