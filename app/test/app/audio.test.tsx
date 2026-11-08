// @vitest-environment jsdom
/** The audio download screen (Android) over a fake AudioApi. */
import 'fake-indexeddb/auto';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/App';
import { createMemoryLocation } from '../../src/app/router';
import type { AudioApi, AudioDownloadResult, Platform } from '../../src/platform';
import { brackets, bracketLabel } from '../../src/ui/screens/audio/AudioScreen';
import { fakePlatform, makeApp } from './fixtures';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let container: HTMLElement | undefined;
afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = undefined;
});

function fakeAudio() {
  let files = 0;
  let release: (() => void) | null = null;
  const api: AudioApi = {
    supported: true,
    setCatalog: vi.fn(),
    play: vi.fn(async () => true),
    download: vi.fn((_levels: readonly number[], onProgress?: (d: number, t: number) => void, signal?: AbortSignal) => new Promise<AudioDownloadResult>((resolve) => {
      onProgress?.(0, 4);
      onProgress?.(1, 4);
      release = () => { files = signal?.aborted ? 1 : 4; resolve({ downloaded: files, failed: 0, bytes: files * 1000, aborted: signal?.aborted === true }); };
      signal?.addEventListener('abort', () => release?.());
    })),
    status: vi.fn(async () => ({ levels: [{ level: 1, files, bytes: files * 1000, expected: 4 }, { level: 12, files: 0, bytes: 0, expected: 2 }], files, bytes: files * 1000 })),
    deleteAll: vi.fn(async () => { files = 0; }),
  };
  return { api, finish: () => release?.() };
}

const flush = async () => { for (let i = 0; i < 5; i++) await act(async () => { await new Promise((r) => setTimeout(r, 1)); }); };
const $ = (el: HTMLElement, id: string) => el.querySelector<HTMLElement>(`[data-testid="${id}"]`);

async function render(caps: Partial<Platform['capabilities']>, audio: AudioApi) {
  const platform = { ...fakePlatform({}, caps), audio } as Platform;
  const h = makeApp({ platform });
  await h.app.start();
  container = document.createElement('div');
  document.body.append(container);
  await act(async () => {
    root = createRoot(container!);
    root.render(<App app={h.app} location={createMemoryLocation('/settings/audio')} />);
  });
  await flush();
  return { ...h, el: container };
}

describe('audio screen', () => {
  it('brackets of ten levels with the Java labels', () => {
    const b = brackets({ levels: [{ level: 1, files: 4, bytes: 10, expected: 4 }, { level: 12, files: 1, bytes: 5, expected: 2 }], files: 5, bytes: 15 });
    expect(b.map((x) => `${x.min}-${x.max}`)).toEqual(['1-10', '11-20', '21-30', '31-40', '41-50', '51-60']);
    expect(bracketLabel(b[0]!)).toBe('Download finished');
    expect(bracketLabel(b[1]!)).toBe('1/2 available');
  });

  it('downloads a bracket with progress, aborts, deletes all', async () => {
    const { api, finish } = fakeAudio();
    const { el, app } = await render({ audioDownload: true, audioPlayback: true, audio: true }, api);
    expect(el.textContent).toContain('You can download vocabulary audio here');
    expect($(el, 'bracket-1')?.textContent).toContain('0/4 available');
    const dl = $(el, 'bracket-1')!.querySelector('button')!;
    await act(async () => dl.click());
    await flush();
    expect(api.download).toHaveBeenCalledWith([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], expect.any(Function), expect.any(AbortSignal));
    expect($(el, 'audio-active')?.textContent).toBe('Active downloads: 3');
    expect($(el, 'audio-progress')).not.toBeNull();
    await act(async () => $(el, 'audio-abort')!.click());
    await flush();
    expect($(el, 'audio-last')?.textContent).toBe('1 downloaded, aborted.');
    // Delete all, after the Java question.
    await act(async () => $(el, 'audio-delete')!.click());
    expect(el.textContent).toContain('This will delete all audio files');
    await act(async () => [...el.querySelectorAll('button')].find((b) => b.textContent === 'Yes')!.click());
    await flush();
    expect(api.deleteAll).toHaveBeenCalled();
    // The voice preference is in Settings → Audio settings, as in Java.
    expect(el.textContent).not.toContain('Masculine');
    finish();
    app.dispose();
  });

  it('web build: nothing to download', async () => {
    const { api } = fakeAudio();
    const { el, app } = await render({ audioPlayback: true }, api);
    expect($(el, 'audio-unsupported')).not.toBeNull();
    app.dispose();
  });
});
