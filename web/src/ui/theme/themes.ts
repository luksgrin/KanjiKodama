/**
 * The Java app's eight themes (`enums/ActiveTheme.java`, `res/values/styles.xml` WK*Theme /
 * KanjiKodama*Theme, `res/values/colors.xml`), the Light Theme / Dark Theme choice
 * (`GlobalSettings.Display.getTheme`: `theme` while the system is light, `nightTheme` while it is dark)
 * and the theme customisations (`theme_customizations_<THEME>`, `ThemeCustomizationActivity`).
 *
 * The two KanjiKodama themes are `tokens.css` itself (`<html data-theme="light|dark">`). The six
 * upstream themes are applied as inline custom properties on `<html>` over the matching base
 * (`data-theme` = the AppCompat parent: light for "Wanikani", dark for the rest), with
 * `data-kk-theme` naming the active theme. Customised colours are inline properties too.
 *
 * Token ← Java attribute: `--color-text` colorPrimary, `--kk-muted` colorPrimaryLight (text on the
 * subject and browse-level colours), `--color-text-toned` colorPrimaryTonedDown, `--color-on-pastel`
 * colorPrimaryInverse, `--color-primary-dark` colorPrimaryDark, `--color-accent` colorAccent,
 * `--color-control-activated` colorControlActivated (switches, seek bars), `--color-bg`
 * colorBackground, `--color-surface` tileColorBackground, `--color-divider` colorDivider,
 * `--color-toolbar-bg` toolbarColorBackground, `--kk-bar` browseLevelButtonColorBackground,
 * `--kk-mint-hi` buttonHighlightColor, `--color-target` colorLevelProgressTarget, `--color-waterfall`
 * colorWaterfallLine, `--color-answer-*` correct/incorrectColorBackground, `--color-q-*`
 * meaning/readingHintColor, `--color-pitch-*` pitchInfo*Color, `--color-stroke-ghost`
 * strokeDiagramGhostColor, `--btn-*` / `--color-shadow` mmButton* / mmOutline / mmShadow, the subject,
 * stage, level progression and Anki colours from ActiveTheme.
 */

export type ThemeId =
  | 'KANJIKODAMA_LIGHT' | 'KANJIKODAMA_DARK' | 'LIGHT' | 'DARK_WANIKANI' | 'BLACK_WANIKANI'
  | 'DARK' | 'BLACK_BREEZE' | 'NORD_POLAR_NIGHT';

/** `@array/themes` / `@array/themeValues`, in order. */
export const THEME_OPTIONS: readonly (readonly [ThemeId, string])[] = [
  ['KANJIKODAMA_LIGHT', 'KanjiKodama'],
  ['KANJIKODAMA_DARK', 'KanjiKodama Dark'],
  ['LIGHT', 'Wanikani'],
  ['DARK_WANIKANI', 'Wanikani Dark'],
  ['BLACK_WANIKANI', 'Wanikani Black'],
  ['DARK', 'Breeze'],
  ['BLACK_BREEZE', 'Black'],
  ['NORD_POLAR_NIGHT', 'Nord'],
];

export const LIGHT_THEME_KEY = 'theme';
export const DARK_THEME_KEY = 'nightTheme';
export const DEFAULT_LIGHT_THEME: ThemeId = 'KANJIKODAMA_LIGHT';
export const DEFAULT_DARK_THEME: ThemeId = 'KANJIKODAMA_DARK';
/** `Constants.NUM_THEME_CUSTOMIZATION_OPTIONS`. */
export const NUM_THEME_CUSTOMIZATION_OPTIONS = 33;

export function customizationKey(theme: ThemeId): string {
  return `theme_customizations_${theme}`;
}

export interface ThemeDef {
  id: ThemeId;
  /** The AppCompat parent: `Theme.AppCompat.Light` or `Theme.AppCompat`. */
  kind: 'light' | 'dark';
  /** `hasIdentBackground`: subject colours are backgrounds (else they colour the text). */
  ident: boolean;
  subjectText: readonly string[];
  subjectBackground: readonly string[];
  subjectButtonBackground: readonly string[];
  subjectBucket: readonly string[];
  /** locked, initiate, apprentice, guru, master, enlightened, burned. */
  stage: readonly string[];
  prePassed: readonly string[];
  passed: readonly string[];
  /** 0 passed, 1..7 apprentice stages 7..1, 8 initiate, 9 locked. */
  levelProgression: readonly string[];
  /** show answer, next, correct, incorrect, text, answer background. */
  anki: readonly string[];
  /** Inline tokens for the upstream themes (the KanjiKodama ones are tokens.css). */
  tokens: Readonly<Record<string, string>>;
}

const WK_SUBJECT = ['#0098F0', '#E80092', '#9808F3', '#9808F3'];
const WK_STAGE = ['#EEEEEE', '#C1C0C1', '#D80088', '#7D2893', '#2344D6', '#0094EB', '#444444'];
const WK_PRE_PASSED = ['#D6AFCA', '#CB8FB3', '#D660AB', '#D80088'];
const WK_PASSED = ['#9D30A3', '#7D2893'];
const WK_LP = ['#621899', '#B24188', '#DE5FAE', '#D86CB0', '#D077AF', '#CB8FB3', '#D09FBE', '#D6AFCA', '#C1C0C1', '#EEEEEE'];
const LIGHT_ANKI = ['#909000', '#909000', '#00A000', '#A00000', '#FFFFFF', '#909000'];
const DARK_ANKI = ['#606000', '#606000', '#006000', '#600000', '#E8E8E8', '#606000'];
const BREEZE_TEXT = ['#3DAEE9', '#FDBC4B', '#2ECC71', '#2ECC71'];
const BREEZE_STAGE = ['#1D2023', '#C1C0C1', '#1D99F3', '#1CDC9A', '#C9CE3B', '#F67400', '#D53B49'];
const BREEZE_PRE_PASSED = ['#7DC9FC', '#5DB9F9', '#3DA9F6', '#0D89E3'];
const BREEZE_PASSED = ['#20FCAA', '#1CDC9A'];
const BREEZE_LP = ['#1A3A45', '#0D89E3', '#2599EC', '#3DA9F6', '#4DB1F7', '#5DB9F9', '#6DC1FA', '#7DC9FC', '#C1C0C1', '#1D2023'];
const NORD_TEXT = ['#5E81AC', '#B48EAD', '#A3BE8C', '#A3BE8C'];

/** The mm_btn colours every upstream theme declares. */
const WK_BUTTON = {
  '--btn-fill': '#DDDDDD', '--btn-light': '#F2F2F2', '--btn-shade': '#BBBBBB', '--btn-outline': '#333333',
  '--color-shadow': 'rgb(0 0 0 / 0.333)', '--kk-shadow': 'rgb(0 0 0 / 0.333)',
  '--btn-text': '#2E4756', '--btn-secondary-text': '#2E4756',
};
/** No theme fontFamily: the system font, and the buttons' own android:fontFamily (Silkscreen). */
const WK_FONTS = {
  '--font-body': 'Roboto, var(--font-ja)',
  '--font-button': "'Silkscreen', var(--font-ja)",
  // Roboto on Android (settings.css): lines 1.172 em apart, plus includeFontPadding (yMax/yMin, 1.327 em
  // in all) above the first and below the last line.
  '--pref-title-line': '1.172',
  '--pref-summary-line': '1.172',
  '--pref-line-pad': '0.0775em',
  // AppCompat's borderless buttons: Roboto Medium (the KanjiKodama themes' font has no medium).
  '--font-button-weight': '500',
};

interface Palette {
  primary: string; primaryLight: string; primaryToned: string; primaryInverse: string; primaryDark: string;
  accent: string; controlActivated: string; background: string; tile: string; divider: string; toolbar: string;
  browseLevel: string; highlight: string; target: string; waterfall: string; correct: string; incorrect: string;
  meaningHint: string; readingHint: string; pitch: readonly [string, string, string, string]; ghost: string;
  /** TimeLineBarChart: #3FA383 on a light tile, else colorAccent. */
  levelUp: string;
  /** Readable secondary text (`--color-text-muted`): colorPrimaryLight, unless that is the background. */
  muted: string;
}

const WK_PITCH = ['#D20CA3', '#0CD24D', '#27A2FF', '#EA9316'] as const;

function paletteTokens(p: Palette, kind: 'light' | 'dark', extra: Readonly<Record<string, string>> = {}): Record<string, string> {
  return {
    '--kk-ink': p.primary, '--kk-muted': p.primaryLight, '--kk-toned': p.primaryToned, '--kk-accent': p.accent,
    '--kk-ground': p.background, '--kk-window': p.tile, '--kk-mint': '#DDDDDD', '--kk-mint-hi': p.highlight,
    '--kk-mint-lo': '#BBBBBB', '--kk-divider': p.divider, '--kk-peach': p.target, '--kk-on-pastel': p.primaryInverse,
    '--kk-bar': p.browseLevel,
    '--color-text': p.primary, '--color-text-muted': p.muted, '--color-text-toned': p.primaryToned,
    '--color-primary-light': p.primaryLight, '--color-primary-dark': p.primaryDark,
    '--color-bg': p.background, '--color-surface': p.tile, '--color-divider': p.divider, '--color-accent': p.accent,
    '--color-control-activated': p.controlActivated, '--color-target': p.target, '--color-on-pastel': p.primaryInverse,
    '--color-toolbar-bg': p.toolbar, '--color-level-up': p.levelUp, '--color-waterfall': p.waterfall,
    // AppCompat's textColorPrimary (KanjiKodama overrides it with mmInk).
    '--color-pref-title': kind === 'light' ? 'rgb(0 0 0 / 0.87)' : '#FFFFFF',
    '--color-edit-line': kind === 'light' ? 'rgb(0 0 0 / 0.6)' : 'rgb(255 255 255 / 0.7)',
    // SrsBreakDownView: the counts' shadow layer only in LIGHT and the KanjiKodama themes.
    '--srs-count-shadow': kind === 'light' ? 'var(--text-shadow-3px)' : 'none',
    // Roboto's includeFontPadding (yMax 1.056 / yMin 0.271 em against ascent 0.928 / descent 0.244).
    '--fp-top': '0.128em', '--fp-bottom': '0.027em',
    '--color-answer-correct': p.correct, '--color-answer-incorrect': p.incorrect,
    '--color-q-meaning-bg': p.meaningHint, '--color-q-meaning-fg': p.readingHint,
    '--color-q-reading-bg': p.readingHint, '--color-q-reading-fg': p.meaningHint,
    '--color-pitch-heiban': p.pitch[0], '--color-pitch-odaka': p.pitch[1], '--color-pitch-nakadaka': p.pitch[2],
    '--color-pitch-atamadaka': p.pitch[3], '--color-stroke-ghost': p.ghost,
    // subject_card_*.xml: colorPrimaryLight with a black shadow (dx/dy 1 px, radius 3 px).
    '--color-card-ink-radical': p.primaryLight, '--color-card-ink-kanji': p.primaryLight,
    '--color-card-ink-vocab': p.primaryLight, '--color-card-ink-shadow': 'var(--text-shadow-3px)',
    ...WK_BUTTON, ...WK_FONTS, ...extra,
  };
}

const WK_DARK_COMMON = {
  primaryToned: '#BCBCBC', accent: '#A0A0A0', controlActivated: '#925BDC', divider: '#BCBCBC',
  browseLevel: '#404040', highlight: '#9808F3', target: '#000000', waterfall: '#1D99F3', correct: '#205020',
  incorrect: '#502020', readingHint: '#000000', pitch: WK_PITCH, ghost: '#404040', levelUp: '#A0A0A0',
};

const wkIdent = { ident: true, subjectText: ['#FFFFFF', '#FFFFFF', '#FFFFFF', '#FFFFFF'], subjectBackground: WK_SUBJECT,
  subjectButtonBackground: WK_SUBJECT, subjectBucket: WK_SUBJECT, stage: WK_STAGE, prePassed: WK_PRE_PASSED,
  passed: WK_PASSED, levelProgression: WK_LP } as const;

export const THEMES: Readonly<Record<ThemeId, ThemeDef>> = {
  KANJIKODAMA_LIGHT: {
    id: 'KANJIKODAMA_LIGHT', kind: 'light', ident: true,
    subjectText: ['#2E4756', '#2E4756', '#2E4756', '#2E4756'],
    subjectBackground: ['#9EC9F0', '#F5A9B8', '#C9B6F2', '#C9B6F2'],
    subjectButtonBackground: ['#9EC9F0', '#F5A9B8', '#C9B6F2', '#C9B6F2'],
    subjectBucket: ['#7FB2E6', '#E98BA4', '#A994E6', '#A994E6'],
    stage: ['#DDEBE2', '#B7C9BD', '#F5C1D0', '#D7C8F6', '#BBD8F4', '#B5E9E3', '#F6D7B0'],
    prePassed: ['#FADDE6', '#F5C1D0', '#F0A5BA', '#E98BA4'],
    passed: ['#E2D6FA', '#D7C8F6'],
    levelProgression: ['#7CC8AC', '#E98BA4', '#F0A5BA', '#F5C1D0', '#F7CCD8', '#F9D6E0', '#FADDE6', '#FCE8EE', '#B7C9BD', '#DDEBE2'],
    anki: LIGHT_ANKI,
    tokens: {},
  },
  KANJIKODAMA_DARK: {
    id: 'KANJIKODAMA_DARK', kind: 'dark', ident: true,
    subjectText: ['#0F1C22', '#0F1C22', '#0F1C22', '#0F1C22'],
    subjectBackground: ['#7FB2E6', '#E98BA4', '#A994E6', '#A994E6'],
    subjectButtonBackground: ['#7FB2E6', '#E98BA4', '#A994E6', '#A994E6'],
    subjectBucket: ['#7FB2E6', '#E98BA4', '#A994E6', '#A994E6'],
    stage: ['#2B414A', '#4A5F66', '#E98BA4', '#A994E6', '#7FB2E6', '#7FD3CB', '#E8B97A'],
    prePassed: ['#F4B8C8', '#EFA2B7', '#EC95AD', '#E98BA4'],
    passed: ['#C2B3EE', '#A994E6'],
    levelProgression: ['#8EE3C8', '#E98BA4', '#EC95AD', '#EFA2B7', '#F4B8C8', '#C98FA3', '#A57A8A', '#7D6370', '#4A5F66', '#2B414A'],
    anki: DARK_ANKI,
    tokens: {},
  },
  LIGHT: {
    id: 'LIGHT', kind: 'light', ...wkIdent, anki: LIGHT_ANKI,
    tokens: paletteTokens({
      primary: '#000000', primaryLight: '#FFFFFF', primaryToned: '#202020', primaryInverse: '#FFFFFF', primaryDark: '#000000',
      accent: '#202020', controlActivated: '#202020', background: '#FFFFFF', tile: '#E8E8E8', divider: '#202020',
      toolbar: '#E80092', browseLevel: '#E80092', highlight: '#9808F3', target: '#000000', waterfall: '#D80088',
      correct: '#B7DAC7', incorrect: '#EAC2BC', meaningHint: '#FFFFFF', readingHint: '#000000', pitch: WK_PITCH,
      ghost: '#D0D0D0', levelUp: '#3FA383', muted: '#202020',
    }, 'light'),
  },
  DARK_WANIKANI: {
    id: 'DARK_WANIKANI', kind: 'dark', ...wkIdent, anki: LIGHT_ANKI,
    tokens: paletteTokens({
      ...WK_DARK_COMMON, primary: '#FFFFFF', primaryLight: '#FFFFFF', primaryInverse: '#FFFFFF', primaryDark: '#404040',
      background: '#232629', tile: '#1D2023', toolbar: '#1D2023', meaningHint: '#FFFFFF', muted: '#FFFFFF',
    }, 'dark'),
  },
  BLACK_WANIKANI: {
    id: 'BLACK_WANIKANI', kind: 'dark', ...wkIdent, anki: LIGHT_ANKI,
    tokens: paletteTokens({
      ...WK_DARK_COMMON, primary: '#FFFFFF', primaryLight: '#FFFFFF', primaryInverse: '#FFFFFF', primaryDark: '#404040',
      background: '#000000', tile: '#000000', toolbar: '#000000', meaningHint: '#FFFFFF', muted: '#FFFFFF',
    }, 'dark'),
  },
  DARK: {
    id: 'DARK', kind: 'dark', ident: false,
    subjectText: BREEZE_TEXT,
    subjectBackground: ['#232629', '#232629', '#232629', '#232629'],
    subjectButtonBackground: ['#404040', '#404040', '#404040', '#404040'],
    subjectBucket: ['#3DAEE9', '#FDBC4B', '#2ECC71', '#F65700'],
    stage: BREEZE_STAGE, prePassed: BREEZE_PRE_PASSED, passed: BREEZE_PASSED, levelProgression: BREEZE_LP, anki: DARK_ANKI,
    tokens: paletteTokens({
      ...WK_DARK_COMMON, primary: '#BCBCBC', primaryLight: '#BCBCBC', primaryInverse: '#000000', primaryDark: '#000000',
      background: '#232629', tile: '#1D2023', toolbar: '#1D2023', meaningHint: '#C0C0C0', muted: '#BCBCBC',
    }, 'dark'),
  },
  BLACK_BREEZE: {
    id: 'BLACK_BREEZE', kind: 'dark', ident: false,
    subjectText: BREEZE_TEXT,
    subjectBackground: ['#000000', '#000000', '#000000', '#000000'],
    subjectButtonBackground: ['#000000', '#000000', '#000000', '#000000'],
    subjectBucket: BREEZE_TEXT,
    stage: BREEZE_STAGE, prePassed: BREEZE_PRE_PASSED, passed: BREEZE_PASSED, levelProgression: BREEZE_LP, anki: DARK_ANKI,
    tokens: paletteTokens({
      ...WK_DARK_COMMON, primary: '#BCBCBC', primaryLight: '#BCBCBC', primaryInverse: '#000000', primaryDark: '#000000',
      background: '#000000', tile: '#000000', toolbar: '#000000', meaningHint: '#C0C0C0', muted: '#BCBCBC',
    }, 'dark'),
  },
  NORD_POLAR_NIGHT: {
    id: 'NORD_POLAR_NIGHT', kind: 'dark', ident: false,
    subjectText: NORD_TEXT,
    subjectBackground: ['#2E3440', '#2E3440', '#2E3440', '#2E3440'],
    subjectButtonBackground: ['#2E3440', '#2E3440', '#2E3440', '#2E3440'],
    subjectBucket: NORD_TEXT,
    stage: ['#D8DEE9', '#81A1C1', '#5E81AC', '#A3BE8C', '#B48EAD', '#D08770', '#BF616A'],
    prePassed: ['#5E81AC', '#597AA3', '#55749C', '#516E94'],
    passed: ['#A3BE8C', '#BBDAA0'],
    levelProgression: ['#34475F', '#3F5673', '#455F7F', '#527095', '#55749C', '#527096', '#6486B1', '#6789B3', '#81A1C1', '#2E3440'],
    // The answer background is 0x2E3440 without alpha in ActiveTheme: transparent.
    anki: ['#2E3440', '#8FBCBB', '#A3BE8C', '#BF616A', '#D8DEE9', 'transparent'],
    tokens: paletteTokens({
      primary: '#E5E9F0', primaryLight: '#E5E9F0', primaryToned: '#E5E9F0', primaryInverse: '#D8DEE9', primaryDark: '#2E3440',
      accent: '#88C0D0', controlActivated: '#5E81AC', background: '#2E3440', tile: '#2E3440', divider: '#81A1C1',
      toolbar: '#2E3440', browseLevel: '#2E3440', highlight: '#88C0D0', target: '#D8DEE9', waterfall: '#88C0D0',
      correct: '#434C5E', incorrect: '#434C5E', meaningHint: '#E5E9F0', readingHint: '#434C5E',
      pitch: ['#5E81AC', '#81A1C1', '#88C0D0', '#E5E9F0'], ghost: '#2E3440', levelUp: '#88C0D0', muted: '#E5E9F0',
    }, 'dark', { '--color-alt-toast-fg': '#E5E9F0' }),
  },
};

export function parseThemeId(v: unknown, fallback: ThemeId): ThemeId {
  return typeof v === 'string' && v in THEMES ? (v as ThemeId) : fallback;
}

export function themeLabel(id: ThemeId): string {
  return THEME_OPTIONS.find(([v]) => v === id)?.[1] ?? id;
}

// ---- Customisations -----------------------------------------------------------------------------

/** `getThemeCustomizations`: the stored JSON int list, padded with 0 (= the theme's own colour). */
export function parseCustomizations(v: unknown): number[] {
  let list: unknown = null;
  if (typeof v === 'string') {
    try {
      list = JSON.parse(v);
    } catch {
      list = null;
    }
  }
  const out = Array.isArray(list) ? list.map((n) => (typeof n === 'number' && Number.isFinite(n) ? n | 0 : 0)) : [];
  while (out.length < NUM_THEME_CUSTOMIZATION_OPTIONS) out.push(0);
  return out;
}

export function serializeCustomizations(colors: readonly number[]): string {
  return JSON.stringify(colors.map((n) => n | 0));
}

/** An ARGB int (Java `int`) as `#RRGGBB`. */
export function intToHex(color: number): string {
  return '#' + ((color >>> 0) & 0xFFFFFF).toString(16).toUpperCase().padStart(6, '0');
}

/** `#RRGGBB` as an opaque ARGB Java int (`| Color.BLACK`). */
export function hexToInt(hex: string): number {
  return (parseInt(hex.slice(1), 16) | 0xFF000000) | 0;
}

/** `getBaseColor(index)` of ThemeCustomizationActivity. */
export function baseColor(t: ThemeDef, index: number): string {
  if (index < 4) return t.subjectBucket[index]!;
  if (index < 11) return t.stage[index - 4]!;
  if (index < 15) return t.prePassed[index - 11]!;
  if (index < 17) return t.passed[index - 15]!;
  if (index < 27) return t.levelProgression[index - 17]!;
  return t.anki[index - 27]!;
}

const SUBJECT_TOKENS = ['radical', 'kanji', 'vocab'] as const;
const STAGE_TOKENS = ['locked', 'initial', 'apprentice', 'guru', 'master', 'enlightened', 'burned'] as const;
const ANKI_TOKENS = ['show', 'next', 'correct', 'incorrect', 'text', 'answer-bg'] as const;

/**
 * The tokens a theme sets inline: its own (upstream themes), the per-type text colours of the
 * non-ident themes, and the customised colours (`loadCustomizations`).
 */
export function themeTokens(t: ThemeDef, custom: readonly number[]): Record<string, string> {
  const out: Record<string, string> = { ...t.tokens };
  const c = (i: number): string | null => (custom[i] ? intToHex(custom[i]!) : null);
  if (t.tokens['--color-text'] !== undefined) {
    SUBJECT_TOKENS.forEach((name, i) => {
      out[`--color-${name}`] = t.subjectBackground[i]!;
      out[`--color-${name}-strong`] = t.subjectBucket[i]!;
      out[`--color-${name}-fg`] = t.subjectText[i]!;
    });
    out['--color-on-subject'] = t.subjectText[0]!;
    STAGE_TOKENS.forEach((name, i) => { out[`--color-stage-${name}`] = t.stage[i]!; });
    t.levelProgression.forEach((v, i) => { out[`--color-lp-${i}`] = v; });
    ANKI_TOKENS.forEach((name, i) => { out[`--color-anki-${name}`] = t.anki[i]!; });
  }
  SUBJECT_TOKENS.forEach((name, i) => {
    const v = c(i);
    if (v === null) return;
    if (t.ident) out[`--color-${name}`] = v;
    else out[`--color-${name}-fg`] = v;
    out[`--color-${name}-strong`] = v;
  });
  STAGE_TOKENS.forEach((name, i) => { const v = c(i + 4); if (v !== null) out[`--color-stage-${name}`] = v; });
  for (let i = 0; i < 10; i++) { const v = c(i + 17); if (v !== null) out[`--color-lp-${i}`] = v; }
  ANKI_TOKENS.forEach((name, i) => { const v = c(i + 27); if (v !== null) out[`--color-anki-${name}`] = v; });
  return out;
}

// ---- Applying -----------------------------------------------------------------------------------

export interface ThemePrefs {
  light: ThemeId;
  dark: ThemeId;
  /** `theme_customizations_<id>` values by theme. */
  customizations: Readonly<Partial<Record<ThemeId, string>>>;
}

export function themePrefsFrom(prefs: Readonly<Record<string, unknown>>): ThemePrefs {
  const customizations: Partial<Record<ThemeId, string>> = {};
  for (const [id] of THEME_OPTIONS) {
    const v = prefs[customizationKey(id)];
    if (typeof v === 'string') customizations[id] = v;
  }
  return {
    light: parseThemeId(prefs[LIGHT_THEME_KEY], DEFAULT_LIGHT_THEME),
    dark: parseThemeId(prefs[DARK_THEME_KEY], DEFAULT_DARK_THEME),
    customizations,
  };
}

export function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/** `GlobalSettings.Display.getTheme`: the night theme while the system is in dark mode. */
export function activeTheme(p: ThemePrefs, dark: boolean = systemPrefersDark()): ThemeDef {
  return THEMES[dark ? p.dark : p.light];
}

let appliedProps: string[] = [];

/** Sets `data-theme`, `data-kk-theme` and the inline tokens on `<html>`; returns the active theme. */
export function applyThemeTokens(p: ThemePrefs, root: HTMLElement = document.documentElement, dark?: boolean): ThemeDef {
  const t = activeTheme(p, dark);
  root.setAttribute('data-theme', t.kind);
  root.setAttribute('data-kk-theme', t.id);
  const tokens = themeTokens(t, parseCustomizations(p.customizations[t.id]));
  for (const k of appliedProps) if (!(k in tokens)) root.style.removeProperty(k);
  for (const [k, v] of Object.entries(tokens)) root.style.setProperty(k, v);
  appliedProps = Object.keys(tokens);
  return t;
}

/** The toolbar colour (status bar / browser UI) of a theme with its customisations. */
export function toolbarColor(t: ThemeDef): string {
  return t.tokens['--color-toolbar-bg'] ?? (t.kind === 'light' ? '#2E4756' : '#1E3139');
}
