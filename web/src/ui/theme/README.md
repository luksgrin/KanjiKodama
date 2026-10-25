# Theme: Pixel Forest

The Java app's KanjiKodama theme (`durtles/app/src/main/res/values/colors.xml` `mm*`,
`styles.xml` `KanjiKodamaLightTheme`/`KanjiKodamaDarkTheme`, `enums/ActiveTheme.java`) as CSS custom
properties. `index.css` imports `fonts.css`, `tokens.css` and `base.css`; `main.tsx` imports it once.

- **Light / dark:** tokens on `:root` are light; dark applies under `prefers-color-scheme: dark`,
  unless `<html data-theme="light">`; `data-theme="dark"` forces dark. Set it with `applyTheme()`
  (`src/app/theme.ts`, setting `kk_theme`: `system`/`light`/`dark`). Never hard-code colours in
  components: use the tokens, so both themes work.
- **Fonts** (bundled, OFL, licenses in `public/licenses/`): `--font-body` Pixelify Sans (body Latin),
  `--font-display` Silkscreen (headings, buttons, counters, tabs), `--font-ja` Zen Maru Gothic.
  Japanese text: mark it `lang="ja"` (or class `ja`); both Latin stacks also fall back to Zen Maru
  Gothic, so stray Japanese never renders in a system font.

## Tokens

Contrast: every text/background pair the screens use meets WCAG AA (4.5:1) in both themes. A few
Java colours were nudged for that: light `--color-text-muted` (#3E7F6B → #36735F), `--color-text-toned`
(#5C8A7A → #4A7566), `--color-level-up` (#3FA383 → #2C7560), the light Anki fills (#909000 → #707000,
#00A000 → #008000) and dark `--color-stage-initial` (#4A5F66 → #7D9399); coloured buttons (`danger`,
`radical`, `kanji`) use `--color-on-subject` text. The raw `--kk-*` palette is unchanged.

| Token | Use |
|---|---|
| `--color-text` | normal text (mmInk) |
| `--color-text-muted` | secondary text, panel titles (mmMuted) |
| `--color-text-toned` | tertiary text, inactive tabs, axis labels (mmToned) |
| `--color-bg` | page background (mmGround) |
| `--color-surface` | panels, tiles, dialogs, bottom nav (mmWindow) |
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
| `--btn-fill` `--btn-light` `--btn-shade` `--btn-outline` `--btn-text` | the pixel pill button (mm_btn); override the first three for a coloured button |
| `--btn-secondary-text` | `.kk-btn.secondary` text (surface fill: the theme's text colour, so it reads in dark) |
| `--color-radical` `--color-kanji` `--color-vocab` | subject-type backgrounds (item headers, buttons) |
| `--color-radical-strong` `--color-kanji-strong` `--color-vocab-strong` | subject-type chart colours |
| `--color-on-subject` | text on subject-type backgrounds |
| `--color-stage-{locked,initial,apprentice,guru,master,enlightened,burned}` | SRS stage colours |
| `--color-lp-0` … `--color-lp-9` | level progress buckets: 0 passed, 1–7 apprentice stages (7 = first), 8 initiate, 9 locked |
| `--kk-ink` … `--kk-peach`, `--kk-mint(-hi/-lo)`, `--kk-bar` | the raw palette (prefer the semantic tokens) |
| `--color-q-{meaning,reading}-{bg,fg}` | question type banner (meaning white, reading black, as Java) |
| `--color-answer-correct` / `--color-answer-incorrect` | answered field background |
| `--color-anki-{show,next,correct,incorrect,text,answer-bg}` | Anki mode buttons and answer |
| `--font-body` `--font-display` `--font-ja` | fonts (above) |
| `--text-xs/sm/md/lg/xl/xxl` | 13/14/16/20/26/34 px (WK.TextView sizes) |
| `--space-1` … `--space-6` | 4/8/12/16/24/32 px |
| `--radius-sm/md/pill`, `--border-pixel` | 6/12/999 px, 3 px outlines |
| `--safe-top/right/bottom/left` | safe-area insets (iOS `env()`, Android SystemBars `--safe-area-inset-*`) |
| `--toolbar-height` `--main-gutter` `--content-max-width` | shell layout: 56px toolbar, 8px `.kk-main` padding (bleed with `calc(-1 * var(--main-gutter))`) |
| `--color-toast-{bg,fg}` | `toast()` (ui/shell/toast.ts) |

## Shared classes (`base.css`)

`.kk-btn` (pixel pill; modifiers `small`, `block`, `secondary`, `danger`, `radical`, `kanji`),
`.kk-btn-row`, `.kk-icon-btn`, `.kk-panel` (card, `h2` title), `.kk-banner` (`error`, `ok`),
`.kk-rows`/`.kk-row` (settings lists, `.kk-row-title`/`.kk-row-sub`), `.kk-dl` (key/value),
`.kk-dialog` (use `ui/components/ConfirmDialog`), `.kk-segmented`, `.kk-muted`, `.kk-small`,
`.kk-xsmall`, `.kk-error-text`, `.kk-visually-hidden`, `.ja`.

Colours are the Java app's exactly (no contrast tweaks, test/app/themeColors.test.ts). Headings use the
body font in bold as Java; Silkscreen (`--font-display`) is for the toolbar, buttons and the quiz header.
`.kk-btn.secondary` looks like `.kk-btn` (Java has one button style). Transitions: `.kk-slide-rtl` /
`.kk-slide-ltr` (session fragment slides, 150 ms); screens slide in by themselves (AppShell).

## Toolbar and toasts (`ui/shell/`)

`useToolbar({title, subtitle, color, actions, back, searchPrefill})` from `ui/shell/toolbar` (see the
file header for the Java menu ids), `toast(text, {long})` from `ui/shell/toast`.

Screen-specific styles go next to the screen (`screens/dashboard/dashboard.css`), using tokens only.
