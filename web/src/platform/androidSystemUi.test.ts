// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@capacitor/core', () => ({ registerPlugin: () => ({}) }));
const { blend, imeHintsFor, isLight, parseCssColor, sampleEdges, startAndroidSystemUi, toHex } = await import('./androidSystemUi');

describe('colour helpers', () => {
  it('parses computed colours', () => {
    expect(parseCssColor('rgb(46, 71, 86)')).toEqual([46, 71, 86, 1]);
    expect(parseCssColor('rgba(0, 0, 0, 0.32)')).toEqual([0, 0, 0, 0.32]);
    expect(parseCssColor('rgba(0, 0, 0, 0)')).toEqual([0, 0, 0, 0]);
    expect(parseCssColor('#eaf7ef')).toEqual([234, 247, 239, 1]);
    expect(parseCssColor('transparent')).toBeNull();
    expect(parseCssColor('')).toBeNull();
  });
  it('blends a translucent layer on an opaque one', () => {
    expect(blend([255, 255, 255, 1], [0, 0, 0, 0.5])).toEqual([128, 128, 128, 1]);
    expect(toHex(blend([46, 71, 86, 1], [0, 0, 0, 0]))).toBe('#2e4756');
  });
  it('picks icon colours like the Java app (light icons on the dark toolbar)', () => {
    expect(isLight([46, 71, 86, 1])).toBe(false); // toolbar
    expect(isLight([245, 169, 184, 1])).toBe(true); // kanji pink
    expect(isLight([234, 247, 239, 1])).toBe(true); // page background
    expect(isLight([18, 18, 18, 1])).toBe(false); // dark theme
  });
});

describe('sampleEdges', () => {
  it('dims the colours from before a modal dialog by its backdrop', () => {
    const dialog = { matches: (q: string) => q === ':modal' };
    const doc = { querySelectorAll: () => [dialog] } as unknown as Document;
    const win = { getComputedStyle: () => ({ backgroundColor: 'rgba(0, 0, 0, 0.5)' }), innerHeight: 800 } as unknown as Window;
    const base = { top: [46, 71, 86, 1] as const, bottom: [234, 247, 239, 1] as const };
    const { page, shown } = sampleEdges(doc, win, base);
    expect(page).toBe(base);
    expect(toHex(shown.top)).toBe('#17242b');
    expect(toHex(shown.bottom)).toBe('#757c78');
  });
});

describe('imeHintsFor', () => {
  const input = (cls: string, lang: string) => {
    const el = document.createElement('input');
    el.className = cls;
    el.lang = lang;
    return el;
  };
  it('answer fields: no personalized learning; ASCII for meanings only (Java defaults)', () => {
    expect(imeHintsFor(input('kk-answer', 'en'))).toEqual({ noPersonalizedLearning: true, forceAscii: true });
    expect(imeHintsFor(input('kk-answer kana', 'ja'))).toEqual({ noPersonalizedLearning: true, forceAscii: false });
  });
  it('other fields get no flags', () => {
    expect(imeHintsFor(input('', 'en'))).toEqual({ noPersonalizedLearning: false, forceAscii: false });
    expect(imeHintsFor(document.body)).toEqual({ noPersonalizedLearning: false, forceAscii: false });
    expect(imeHintsFor(null)).toEqual({ noPersonalizedLearning: false, forceAscii: false });
  });
});

describe('startAndroidSystemUi', () => {
  let stop: (() => void) | undefined;
  afterEach(() => {
    stop?.();
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('sends the edge colours and the focused field hints, only when they change', async () => {
    vi.useFakeTimers();
    const plugin = { setBarColors: vi.fn(async (_c: unknown) => undefined), setImeHints: vi.fn(async (_h: unknown) => undefined) };
    document.body.style.backgroundColor = 'rgb(234, 247, 239)';
    stop = startAndroidSystemUi(plugin);
    await vi.advanceTimersByTimeAsync(500);
    expect(plugin.setBarColors).toHaveBeenCalledTimes(1);
    expect(plugin.setBarColors.mock.calls[0]).toEqual([{ top: '#eaf7ef', bottom: '#eaf7ef', lightTop: true, lightBottom: true }]);

    document.body.style.backgroundColor = 'rgb(46, 71, 86)';
    await vi.advanceTimersByTimeAsync(500);
    expect(plugin.setBarColors).toHaveBeenCalledTimes(2);
    expect(plugin.setBarColors.mock.calls[1]![0]).toMatchObject({ top: '#2e4756', lightTop: false });

    const field = document.createElement('input');
    field.className = 'kk-answer';
    field.lang = 'en';
    document.body.append(field);
    field.focus();
    await vi.advanceTimersByTimeAsync(10);
    expect(plugin.setImeHints).toHaveBeenLastCalledWith({ noPersonalizedLearning: true, forceAscii: true });
    field.blur();
    await vi.advanceTimersByTimeAsync(10);
    expect(plugin.setImeHints).toHaveBeenLastCalledWith({ noPersonalizedLearning: false, forceAscii: false });
    expect(plugin.setImeHints).toHaveBeenCalledTimes(2);
  });
});
