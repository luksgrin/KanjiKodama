// The theme tokens' colours, pinned: no contrast tweaks (owner decision).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const tokensCss = readFileSync(join(process.cwd(), 'src/ui/theme/tokens.css'), 'utf8');

function tokens(block: string): Record<string, string> {
  return Object.fromEntries([...block.matchAll(/(--[\w-]+):\s*(#[0-9A-Fa-f]{6})/g)].map((m) => [m[1]!, m[2]!.toUpperCase()]));
}
const light = tokens(tokensCss.split('@media')[0]!);
const darkMedia = tokens(tokensCss.split('@media (prefers-color-scheme: dark)')[1]!.split(':root[data-theme="dark"]')[0]!);
const darkForced = tokens(tokensCss.split(':root[data-theme="dark"]')[1]!);

const EXPECTED_LIGHT: Record<string, string> = {
  '--color-text': '#2E4756', '--color-text-muted': '#3E7F6B', '--color-text-toned': '#5C8A7A', '--color-bg': '#EAF7EF',
  '--color-surface': '#F8FDF9', '--color-divider': '#BFD9CB', '--color-accent': '#7CC8AC', '--color-toolbar-bg': '#2E4756',
  '--color-toolbar-fg': '#FFFFFF', '--btn-fill': '#A8E6CF', '--btn-light': '#D9F7EA', '--btn-shade': '#7CC8AC', '--btn-text': '#2E4756',
  '--color-radical': '#9EC9F0', '--color-kanji': '#F5A9B8', '--color-vocab': '#C9B6F2', '--color-on-subject': '#2E4756',
  '--color-stage-initial': '#B7C9BD', '--color-level-up': '#3FA383',
  '--color-anki-show': '#909000', '--color-anki-next': '#909000', '--color-anki-correct': '#00A000', '--color-anki-incorrect': '#A00000',
};
const EXPECTED_DARK: Record<string, string> = {
  '--color-text': '#E3F4EA', '--color-text-muted': '#A9C9BC', '--color-text-toned': '#7FA898', '--color-bg': '#14232B',
  '--color-surface': '#1E3139', '--color-divider': '#2B414A', '--color-toolbar-bg': '#1E3139', '--color-toolbar-fg': '#FFFFFF',
  '--btn-fill': '#8EE3C8', '--btn-text': '#2E4756', '--color-radical': '#7FB2E6', '--color-kanji': '#E98BA4', '--color-vocab': '#A994E6',
  '--color-on-subject': '#0F1C22', '--color-stage-initial': '#4A5F66',
};

describe('theme colours', () => {
  it('uses the light theme colours', () => {
    expect(Object.fromEntries(Object.keys(EXPECTED_LIGHT).map((k) => [k, light[k]]))).toEqual(EXPECTED_LIGHT);
  });
  for (const [name, t] of [['system', darkMedia], ['forced', darkForced]] as const) {
    it(`uses the dark theme colours (${name})`, () => {
      expect(Object.fromEntries(Object.keys(EXPECTED_DARK).map((k) => [k, t[k]]))).toEqual(EXPECTED_DARK);
    });
  }
  it('defines the same colours for the system and the forced dark theme', () => {
    expect(darkForced).toEqual(darkMedia);
  });
});

describe('Android raw-pixel sizes', () => {
  it('draws setShadowLayer(3, 1, 1, black) in device pixels, not CSS px (crisp on 3× phones)', async () => {
    expect(tokensCss).toMatch(/--dev-px: calc\(1px \/ var\(--kk-dpr, 1\)\);/);
    // Skia: sigma = 3 × 0.57735 + 0.5 = 2.23 device px; a CSS blur radius is 2 sigma; one layer.
    expect(tokensCss).toMatch(/--text-shadow-3px: var\(--dev-px\) var\(--dev-px\) calc\(4\.46 \* var\(--dev-px\)\) #000;/);
    const { trackDevicePixelRatio } = await import('../../src/ui/theme/devicePixels');
    const root = { style: { values: {} as Record<string, string>, setProperty(k: string, v: string) { this.values[k] = v; } } };
    const g = globalThis as { window?: unknown };
    const before = g.window;
    g.window = { devicePixelRatio: 2.625 };
    try {
      trackDevicePixelRatio(root as unknown as HTMLElement);
    } finally {
      g.window = before;
    }
    expect(root.style.values['--kk-dpr']).toBe('2.625');
  });
  it('gives the SRS-change toast its fixed colours in every theme', () => {
    expect(light['--color-custom-toast-bg']).toBe('#FFFF80');
    expect(light['--color-custom-toast-fg']).toBe('#000000');
  });
});
