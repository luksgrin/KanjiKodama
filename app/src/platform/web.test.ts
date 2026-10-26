// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { browserStorage } from './browserStorage';
import { openTextViaInput, saveText, webPlatform } from './web';

const nav = navigator;

function stubShare(canShare: boolean | (() => boolean), share: (data?: ShareData) => Promise<void>) {
  const canShareFn = vi.fn(typeof canShare === 'function' ? canShare : () => canShare);
  const shareFn = vi.fn(share);
  Object.defineProperty(nav, 'canShare', { value: canShareFn, configurable: true, writable: true });
  Object.defineProperty(nav, 'share', { value: shareFn, configurable: true, writable: true });
  return { canShareFn, shareFn };
}

let clicked: HTMLAnchorElement[];

beforeEach(() => {
  clicked = [];
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    clicked.push(this);
  });
  Object.defineProperty(URL, 'createObjectURL', { value: vi.fn(() => 'blob:fake'), configurable: true, writable: true });
  Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true, writable: true });
});

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(nav, 'canShare');
  Reflect.deleteProperty(nav, 'share');
});

describe('web saveText', () => {
  it('uses the share sheet with a File when canShare({files}) is true', async () => {
    const { canShareFn, shareFn } = stubShare(true, () => Promise.resolve());
    await expect(saveText('p.json', '{"a":1}')).resolves.toBe('saved');
    expect(canShareFn).toHaveBeenCalledOnce();
    const data = shareFn.mock.calls[0]![0]!;
    const file = data.files![0]!;
    expect(file.name).toBe('p.json');
    expect(file.type).toBe('application/json');
    expect(await file.text()).toBe('{"a":1}');
    expect(clicked).toHaveLength(0);
  });

  it('reports cancelled when the share sheet is dismissed (AbortError), without downloading', async () => {
    stubShare(true, () => Promise.reject(new DOMException('dismissed', 'AbortError')));
    await expect(saveText('p.json', 'x')).resolves.toBe('cancelled');
    expect(clicked).toHaveLength(0);
  });

  it('falls back to a download when share fails for another reason', async () => {
    stubShare(true, () => Promise.reject(new DOMException('no activation', 'NotAllowedError')));
    await expect(saveText('p.json', 'x')).resolves.toBe('saved');
    expect(clicked).toHaveLength(1);
    expect(clicked[0]!.download).toBe('p.json');
  });

  it('downloads when files cannot be shared', async () => {
    const { shareFn } = stubShare(false, () => Promise.resolve());
    await expect(saveText('p.json', 'x')).resolves.toBe('saved');
    expect(shareFn).not.toHaveBeenCalled();
    expect(clicked).toHaveLength(1);
    expect(clicked[0]!.href).toBe('blob:fake');
    expect(document.querySelector('a[download]')).toBeNull(); // anchor removed again
  });

  it('downloads when the Web Share API is missing or canShare throws', async () => {
    await expect(saveText('a.json', 'x')).resolves.toBe('saved');
    stubShare(() => { throw new TypeError('bad'); }, () => Promise.resolve());
    await expect(saveText('b.json', 'x')).resolves.toBe('saved');
    expect(clicked.map((a) => a.download)).toEqual(['a.json', 'b.json']);
  });
});

describe('web openText', () => {
  function pendingInput(): HTMLInputElement {
    const input = document.querySelector('input[type=file]');
    if (!(input instanceof HTMLInputElement)) throw new Error('no input');
    return input;
  }

  beforeEach(() => {
    vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => undefined);
  });

  it('returns name and text of the picked file and removes the input', async () => {
    const p = openTextViaInput();
    const input = pendingInput();
    const file = new File(['{"v":2}'], 'progress.json', { type: 'application/json' });
    Object.defineProperty(input, 'files', { value: [file] });
    input.dispatchEvent(new Event('change'));
    await expect(p).resolves.toEqual({ name: 'progress.json', text: '{"v":2}' });
    expect(document.querySelector('input[type=file]')).toBeNull();
  });

  it('returns null on cancel', async () => {
    const p = openTextViaInput();
    pendingInput().dispatchEvent(new Event('cancel'));
    await expect(p).resolves.toBeNull();
  });

  it('returns null on change without a file', async () => {
    const p = webPlatform.files.openText();
    const input = pendingInput();
    Object.defineProperty(input, 'files', { value: [] });
    input.dispatchEvent(new Event('change'));
    await expect(p).resolves.toBeNull();
  });
});

describe('web platform shape and storage', () => {
  it('has no auto backup and no notifications', () => {
    expect(webPlatform.capabilities.autoBackup).toBe(false);
    expect(webPlatform.capabilities.notifications).toBe(false);
    expect(webPlatform.files.writeAutoBackup).toBeUndefined();
    expect(webPlatform.files.listAutoBackups).toBeUndefined();
  });

  it('wraps navigator.storage and tolerates its absence', async () => {
    const original = Object.getOwnPropertyDescriptor(navigator, 'storage');
    const storage = {
      persisted: vi.fn(() => Promise.resolve(false)),
      persist: vi.fn(() => Promise.resolve(true)),
      estimate: vi.fn(() => Promise.resolve({ usage: 10, quota: 100 })),
    };
    Object.defineProperty(navigator, 'storage', { value: storage, configurable: true });
    await expect(browserStorage.persist()).resolves.toBe(true);
    expect(storage.persist).toHaveBeenCalledOnce();
    await expect(browserStorage.persisted()).resolves.toBe(false);
    await expect(browserStorage.estimate()).resolves.toEqual({ usage: 10, quota: 100 });
    storage.persisted.mockResolvedValue(true);
    await browserStorage.persist();
    expect(storage.persist).toHaveBeenCalledOnce(); // already persisted: no new request

    Object.defineProperty(navigator, 'storage', { value: undefined, configurable: true });
    await expect(browserStorage.persist()).resolves.toBe(false);
    await expect(browserStorage.persisted()).resolves.toBe(false);
    await expect(browserStorage.estimate()).resolves.toBeNull();
    if (original) Object.defineProperty(navigator, 'storage', original);
    else delete (navigator as { storage?: unknown }).storage;
  });
});
