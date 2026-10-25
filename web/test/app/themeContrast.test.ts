// The theme's text/background token pairs meet WCAG AA (4.5:1) in the light and dark themes.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const theme = join(process.cwd(), 'src/ui/theme');
const tokensCss = readFileSync(join(theme, 'tokens.css'), 'utf8');

function tokens(block: string): Record<string, string> {
  return Object.fromEntries([...block.matchAll(/(--[\w-]+):\s*(#[0-9A-Fa-f]{6})/g)].map((m) => [m[1]!, m[2]!]));
}
const light = tokens(tokensCss.split('@media')[0]!);
const darkMedia = { ...light, ...tokens(tokensCss.split('@media (prefers-color-scheme: dark)')[1]!.split(':root[data-theme="dark"]')[0]!) };
const darkForced = { ...light, ...tokens(tokensCss.split(':root[data-theme="dark"]')[1]!) };

function luminance(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

/** [text, background] as the screens pair them. */
const PAIRS: [string, string][] = [
  ['--color-text', '--color-bg'], ['--color-text', '--color-surface'],
  ['--color-text-muted', '--color-bg'], ['--color-text-muted', '--color-surface'],
  ['--color-text-toned', '--color-bg'], ['--color-text-toned', '--color-surface'],
  ['--color-level-up', '--color-surface'], ['--color-bad-text', '--color-surface'], ['--color-bad-text', '--color-bg'],
  ['--btn-text', '--btn-fill'], ['--btn-secondary-text', '--color-surface'],
  ['--color-toolbar-fg', '--color-toolbar-bg'], ['--color-text', '--color-warn-bg'], ['--color-text', '--color-chip'],
  ['--color-on-subject', '--color-radical'], ['--color-on-subject', '--color-kanji'], ['--color-on-subject', '--color-vocab'],
  ...['initial', 'apprentice', 'guru', 'master', 'enlightened', 'burned'].map((s): [string, string] => ['--color-on-pastel', `--color-stage-${s}`]),
  ['--color-text', '--color-stage-locked'],
  ['--color-q-meaning-fg', '--color-q-meaning-bg'], ['--color-q-reading-fg', '--color-q-reading-bg'],
  ['--color-text', '--color-answer-correct'], ['--color-text', '--color-answer-incorrect'],
  ...['show', 'next', 'correct', 'incorrect', 'answer-bg'].map((s): [string, string] => ['--color-anki-text', `--color-anki-${s}`]),
];

describe('theme contrast', () => {
  for (const [name, t] of [['light', light], ['dark (system)', darkMedia], ['dark (forced)', darkForced]] as const) {
    it(`meets AA in the ${name} theme`, () => {
      const failing = PAIRS.filter(([fg, bg]) => contrast(t[fg]!, t[bg]!) < 4.5)
        .map(([fg, bg]) => `${fg} on ${bg}: ${contrast(t[fg]!, t[bg]!).toFixed(2)}`);
      expect(failing).toEqual([]);
    });
  }

  it('styles secondary and coloured buttons through the tokens, with no screen-local override', () => {
    const base = readFileSync(join(theme, 'base.css'), 'utf8');
    expect(base).toMatch(/\.kk-btn\.secondary \{ --btn-text: var\(--btn-secondary-text\);/);
    expect(base).toMatch(/\.kk-btn\.danger \{ --btn-text: var\(--color-on-subject\);/);
    const session = readFileSync(join(process.cwd(), 'src/ui/components/session/session.css'), 'utf8');
    expect(session).not.toMatch(/\.kk-btn\.secondary/);
  });
});
