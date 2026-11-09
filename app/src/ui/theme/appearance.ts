/**
 * Display settings → "Text size and font" (`AppearancePicker`): two stored keys, both strings.
 *
 * - `text_size`: the percentage the app's text is drawn at ('85' … '150', default '100'). It becomes
 *   `data-text-size` on <html> (app/theme.ts) and --kk-ts (tokens.css); every text size outside the quiz's question, answer field and
 *   buttons is `calc(<px> * var(--kk-ts))` (ui/theme/README.md, "Text size").
 * - `ui_font`: the body font. `PIXELIFY_SANS` keeps the theme's own (Pixelify Sans, Roboto in the
 *   WaniKani-style themes); the others replace `--font-body` in every theme (`data-ui-font` on <html>,
 *   tokens.css). Headings in Silkscreen (toolbar, menus), the quiz question and the subject glyphs keep
 *   their fonts.
 */

/** Any settings map (the stored settings, or the remembered copy in localStorage). */
type Prefs = Readonly<Record<string, unknown>>;

export const TEXT_SIZE_KEY = 'text_size';
export const UI_FONT_KEY = 'ui_font';

export const DEFAULT_TEXT_SIZE = '100';
/** [stored value, label]: the scale in percent. */
export const TEXT_SIZES: readonly (readonly [value: string, label: string])[] = [
  ['85', 'Small'],
  ['100', 'Default'],
  ['115', 'Large'],
  ['130', 'Larger'],
  ['150', 'Largest'],
];

export type UiFont = 'PIXELIFY_SANS' | 'DOTGOTHIC16' | 'ZEN_MARU_GOTHIC';
export const DEFAULT_UI_FONT: UiFont = 'PIXELIFY_SANS';
/** The fonts: stored value, name, a few words, and the CSS family the picker draws the name in. */
export const UI_FONTS: readonly { value: UiFont; name: string; note: string; family: string }[] = [
  { value: 'PIXELIFY_SANS', name: 'Pixelify Sans', note: 'Pixel font (default)', family: "'Pixelify Sans', var(--font-ja)" },
  { value: 'DOTGOTHIC16', name: 'DotGothic16', note: 'Pixel font, also for kana and kanji', family: "'DotGothic16', var(--font-ja)" },
  { value: 'ZEN_MARU_GOTHIC', name: 'Zen Maru Gothic', note: 'Smooth and rounded, easy to read', family: "'Zen Maru Gothic', var(--font-ja)" },
];

/** The stored `text_size` if it is one of the choices, else the default. */
export function textSize(prefs: Prefs): string {
  const v = prefs[TEXT_SIZE_KEY];
  return typeof v === 'string' && TEXT_SIZES.some(([s]) => s === v) ? v : DEFAULT_TEXT_SIZE;
}

/** `text_size` as a factor (1 = 100 %). */
export function textScale(prefs: Prefs): number {
  return Number(textSize(prefs)) / 100;
}

/** The stored `ui_font` if it is one of the choices, else the default. */
export function uiFont(prefs: Prefs): UiFont {
  const v = prefs[UI_FONT_KEY];
  return UI_FONTS.find((f) => f.value === v)?.value ?? DEFAULT_UI_FONT;
}

/** The picker's preview line: a former ligature ("fi"), kanji and a meaning. */
export const APPEARANCE_PREVIEW = 'fins · 漢字 · Kanji meaning';
