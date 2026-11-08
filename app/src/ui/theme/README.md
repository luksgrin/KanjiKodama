# Theme: Pixel Forest

The KanjiKodama theme (light and dark) as CSS custom properties. `index.css` imports `fonts.css`, `tokens.css` and `base.css`; `main.tsx` imports it once.

- **Themes:** eight (`themes.ts`): the Light Theme (`theme`) applies while the system is light, the
  Dark Theme (`nightTheme`) while it is dark. `src/app/theme.ts` `applyTheme`
  sets `<html data-theme="light|dark">` (the AppCompat parent) and `data-kk-theme="<THEME>"`. The two
  KanjiKodama themes are the token blocks below (light on `:root`, dark under `prefers-color-scheme:
  dark` unless `data-theme="light"`, and for `data-theme="dark"`); the six other themes and the
  Theme Customisation colours (`theme_customizations_<THEME>`) are inline custom properties on
  `<html>`. Never hard-code colours in components: use the tokens, so every theme works.
- **Fonts** (bundled, OFL, licenses in `public/licenses/`): `--font-body` Pixelify Sans (body Latin),
  `--font-display` Silkscreen (headings, buttons, counters, tabs), `--font-ja` the system CJK font
  (Hiragino on Apple, Noto Sans CJK on Android). Japanese text: mark it `lang="ja"` (or class
  `ja`); both Latin stacks fall back to `--font-ja`. Zen Maru Gothic stays bundled (About, licence)
  but nothing draws with it.

## Tokens

Colours are fixed by `test/app/themeColors.test.ts` (no contrast tweaks).

| Token | Use |
|---|---|
| `--color-text` | normal text (mmInk) |
| `--color-text-muted` | secondary text, panel titles (mmMuted) |
| `--color-text-toned` | tertiary text, inactive tabs, axis labels (mmToned) |
| `--color-bg` | page background (mmGround) |
| `--color-surface` | panels, tiles (mmWindow) |
| `--color-dialog` | dialog background (AppCompat `background_floating`: white / #424242) |
| `--color-dialog-item`, `--color-control-normal` | radio-list dialog items and unchecked radio rings (87 % / 54 % black, white in dark) |
| `--color-pref-summary` | preference summaries (`textColorSecondary`) |
| `--color-divider` | panel borders, row separators (mmDivider) |
| `--color-accent` | focus ring, active controls (mmAccent) |
| `--color-target` | level-up target, warning border (mmPeach) |
| `--color-on-pastel` | text on the pastel stage/subject colours |
| `--color-toolbar-bg` / `--color-toolbar-fg` | top bar |
| `--color-level-up` | level-up counts in the timeline |
| `--color-ok` / `--color-bad` | correct / wrong marks, success / error borders and banner tints |
| `--color-bad-text` | error text (`.kk-error-text`; `--color-bad` is below AA as small text in light) |
| `--color-warn-bg` | banner background (backup reminder) |
| `--color-chip` | small labels (JLPT block chip) |
| `--color-shadow` | soft shadows (mmShadow) |
| `--color-waterfall`, `--color-pitch-*`, `--color-stroke-ghost` | timeline waterfall line, pitch accent lines, stroke-order ghosts (colorWaterfallLine, pitchInfo*Color, strokeDiagramGhostColor) |
| `--color-card-ink-radical/-kanji/-vocab`, `--color-card-ink-shadow` | meaning / reading / progress text on subject cards (SubjectCardBinder.styleCardText; colorPrimaryLight with a shadow in the upstream themes) |
| `--color-edit-line` | EditText underline and hint (AppCompat hint grey) |
| `--dev-px` | one Android device pixel in CSS px (`1px / devicePixelRatio`, `devicePixels.ts`): for Android values given in raw px (shadow radius / offsets), not dp |
| `--text-shadow-3px`, `--text-shadow-3px-glyph`, `--srs-count-shadow` | Android's `setShadowLayer(3, 1, 1, black)` (device px: 1 px offset, 4.46 px CSS blur) on text and on big glyphs; the SRS counts' shadow (none in the dark upstream themes) |
| `--fp-top`, `--fp-bottom` | Android `includeFontPadding` above / below a TextView (0 for the KanjiKodama fonts, Roboto's in the upstream themes) |
| `--btn-fill` `--btn-light` `--btn-shade` `--btn-outline` `--btn-text` | the pixel pill button (layered: background = shade, `::before` = outline, `::after` = fill + light bar; both pseudo-elements are taken); override the first three for a coloured button; `--kk-btn-h` sets a button's min height (rounded to device px) |
| `--btn-secondary-text` | `.kk-btn.secondary` text (surface fill: the theme's text colour, so it reads in dark) |
| `--color-radical` `--color-kanji` `--color-vocab` | subject-type backgrounds (item headers, buttons) |
| `--color-radical-strong` `--color-kanji-strong` `--color-vocab-strong` | subject-type chart colours |
| `--color-on-subject` | text on subject-type backgrounds |
| `--color-stage-{locked,initial,apprentice,guru,master,enlightened,burned}` | SRS stage colours |
| `--color-lp-0` … `--color-lp-9` | level progress buckets: 0 passed, 1–7 apprentice stages (7 = first), 8 initiate, 9 locked |
| `--kk-ink` … `--kk-peach`, `--kk-mint(-hi/-lo)`, `--kk-bar` | the raw palette (prefer the semantic tokens) |
| `--color-q-{meaning,reading}-{bg,fg}` | question type banner (meaning white, reading black) |
| `--color-answer-correct` / `--color-answer-incorrect` | answered field background |
| `--color-anki-{show,next,correct,incorrect,text,answer-bg}` | Anki mode buttons and answer |
| `--font-body` `--font-display` `--font-ja` | fonts (above) |
| `--font-button` | `.kk-btn` (the body font in the KanjiKodama themes; Silkscreen in the others, which have no theme font) |
| `--color-primary-light` | colorPrimaryLight: text on subject / browse-level colours |
| `--color-primary-dark` | colorPrimaryDark: borderless buttons on the yellow tutorial boxes |
| `--color-control-activated` | colorControlActivated: switches, seek bars |
| `--color-pref-title` | preference titles (`textColorPrimary`) |
| `--color-waterfall` | colorWaterfallLine (timeline waterfall) |
| `--color-pitch-{heiban,odaka,nakadaka,atamadaka}` `--color-stroke-ghost` | pitch info, stroke diagram ghost |
| `--color-radical-fg` `--color-kanji-fg` `--color-vocab-fg` | text on each subject colour; `.radical`/`.kk-type--radical` etc. set `--color-on-subject` from them (Breeze, Black and Nord colour the text, not the background) |
| `--text-xs/sm/md/lg/xl/xxl` | 13/14/16/20/26/34 px (the text sizes) |
| `--space-1` … `--space-6` | 4/8/12/16/24/32 px |
| `--radius-sm/md/pill`, `--border-pixel` | 6/12/999 px, 3 px outlines |
| `--safe-top/right/bottom/left` | safe-area insets (iOS `env()`, Android SystemBars `--safe-area-inset-*`) |
| `--toolbar-height` `--main-gutter` `--content-max-width` | shell layout: 56px toolbar, 8px `.kk-main` padding (bleed with `calc(-1 * var(--main-gutter))`) |
| `--color-toast-{bg,fg}` | `toast()` (ui/shell/toast.ts) |
| `--color-custom-toast-{bg,fg}`, `--color-alt-toast-fg` | the quiz's SRS-change / close-enough toasts (#FFFF80, black, every theme) and the alternatives toast (alternativeToastColorPrimary) |

## Shared classes (`base.css`)

`.kk-btn` (pixel pill; modifiers `small`, `block`, `secondary`, `danger`, `radical`, `kanji`),
`.kk-btn-row`, `.kk-icon-btn`, `.kk-panel` (card, `h2` title), `.kk-banner` (`error`, `ok`),
`.kk-rows`/`.kk-row` (settings lists, `.kk-row-title`/`.kk-row-sub`), `.kk-dl` (key/value),
`.kk-dialog` (use `ui/components/ConfirmDialog`), `.kk-segmented`, `.kk-muted`, `.kk-small`,
`.kk-xsmall`, `.kk-error-text`, `.kk-visually-hidden`, `.ja`.

Headings use the body font in bold; Silkscreen (`--font-display`) is for the toolbar, buttons and the
quiz header. `.kk-btn.secondary` looks like `.kk-btn` (there is one button style). Transitions: `.kk-slide-rtl` /
`.kk-slide-ltr` (session fragment slides, 150 ms; off with `slide_animations`, `<html
data-slide-animations="off">`); screens slide in by themselves (AppShell).

## Toolbar and toasts (`ui/shell/`)

`useToolbar({title, subtitle, color, actions, back, searchPrefill})` from `ui/shell/toolbar` (see the
file header for the menu ids), `toast(text, {long})` from `ui/shell/toast`.

Screen-specific styles go next to the screen (`screens/dashboard/dashboard.css`), using tokens only.

Focus rings and the buttons' focus highlight show only out of Android's touch mode: `focusMode.ts` sets `:root.kk-nontouch` after Tab / arrow keys and clears it on any pointer down.
