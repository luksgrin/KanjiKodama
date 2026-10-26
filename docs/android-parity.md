# Android parity: TS app vs Java app

Side-by-side check (round 3) on emulator-5556 (Pixel-class, 1080×2400, density 420 = 2.625, Android 16 /
API 36, Android System WebView 133) on 2026-10-26: the Java debug app `app.kanjikodama.wk.debug`
(built from `durtles/`) next to the TS app `app.kanjikodama.wk.web` (`web/`, built with
`npm run build && npx cap sync android && ./gradlew assembleDebug`). Both had the same progress file
restored ("Restore progress from a file": JLPT order, level 6, 1034 reviews due); the lesson screens and
dialogs were also checked on fresh data (Reset database, level 1). Every screen was captured in the
KanjiKodama theme (light), KanjiKodama Dark (system dark mode) and Nord. Screenshots stay outside the repo
(WaniKani content): scratchpad `parity3/` (`j-*` Java, `t-*` TS, `pair-*` side by side, `cpair-*`
full-resolution crops; rounds 1 and 2 in `parity/` and `parity2/`).

Rounds 1 and 2 (waves 4 and 5) closed the structural differences (tab bar, toolbar, dashboard, session
screens, settings sub-screens, dialogs, Display / Keyboard settings, radical images, Japanese face, tap
sizes). Round 3 measured what was left pixel by pixel and fixed it; the list is below.

## Start-up

Same restored progress, cold start (`am force-stop`, then `am start -W`), 6 runs each, round 3.

| | Java | TS round 1 | TS round 2 | TS round 3 |
|---|---|---|---|---|
| `am start -W` TotalTime | 0.87–0.95 s (first frame: the splash, then the dashboard fades in with its data) | 1.32–1.50 s | — | 1.13–1.23 s (the splash is held until the dashboard's first frame) |
| Process start → dashboard with counts | ~0.95–1.0 s (round 2; this round's burst capture shows the counts between 1.15 and 1.4 s after `am start` including screencap overhead, consistent with it) | 1.2–1.3 s | 1.03–1.15 s | **1.10–1.16 s** |
| In-page time (time origin → dashboard) | — | — | 500–555 ms | 515–547 ms |

Where the TS time goes: ~0.58–0.63 s Android process + WebView + Capacitor bridge start until the page's
time origin (fixed cost; the Java activity is ready at about the same time); ~0.16–0.2 s until the first
script and asset responses (all land together, the WebView's asset loader is cold); the content file is
read by ~0.26 s; `readContent` + hydrate + first render ~0.25 s.

Remaining: TS is ~0.1–0.15 s behind Java to a dashboard with data. Not closable in the page: the WebView's
own start-up and its cold asset loader (~0.75 s together before the first script runs) are fixed costs a
native activity does not have. The page's own part was cut in round 2 (uncompressed content in the APK,
content preload, one-JSON subject read); what is left in it is `emptySubjectRow` (~40 ms, core
progression getters returning fresh empty rows; a shared read-only row would change core).

## Fixed in round 3

| Area | Java | TS before | Fix (file) |
|---|---|---|---|
| Line heights everywhere | a TextView line is as tall as the font's ascent + descent, each rounded up to whole device px (Pixelify Sans 16 sp: 1.214 em; lines with Japanese grow to the CJK face's height) | fixed `line-height: 1.2`/`1.21`/`1.25`: long texts drifted (About ~10 px, item page and Keyboard help more) | `fonts.css` `ascent-/descent-override` with Android's rounding for Pixelify Sans and Silkscreen, `line-height: normal` in `base.css` and the item page / dialogs / keyboard help; Roboto's `includeFontPadding` for the upstream themes (`--fp-top/--fp-bottom`, `themes.ts`) |
| Buttons (`mm_btn`) | the pill is drawn inside the 52 dp view: 3 dp outline, fill, 4 dp shade, 8 dp of outline at the bottom; 88 dp min width; pressed = `mm_btn_pressed` | outline + 4 px box-shadow outside the view (4 px taller) and 3 px wider side padding | `.kk-btn` (`base.css`) |
| Quiz buttons (`WK.Button.Borderless.Light`) | 54 dp, padding 4 / 12 dp | 48 px | `session.css` (Don't know / Submit / Next) |
| Dialogs (all) | 26.7 dp from the screen edges, 18 dp above the title, 15.6 dp title → message, 54 dp buttons 12 dp from the sides, list items closer to the title | 24 px edges, 20 px, 12 px, 40 px buttons | `alert.css`, `.kk-dialog` (`base.css`), `.kk-sdialog` (`session.css`) |
| Text shadows | `setShadowLayer(3, 1, 1, black)` (device px); cards, item tile and quiz glyph have it too | lighter shadow; no shadow on card / tile / quiz glyphs | `--text-shadow-3px`, `--text-shadow-3px-glyph` (`tokens.css`), browse / subject / session CSS (round 3 made it two CSS-px layers; replaced in round 4, below) |
| SRS breakdown counts | shadow only in LIGHT and the KanjiKodama themes | shadow in every theme | `--srs-count-shadow` (`themes.ts`, `dashboard.css`) |
| SRS breakdown tiles | 8 dp inside the panel padding, 4 dp apart | 5 px | `dashboard.css` |
| Timeline chart | 250 dp view incl. the panel's shadow band; always Pixelify Sans | SVG 250 px inside the border (12 px taller); Roboto in upstream themes | `TimeLineChart.tsx`, `dashboard.css` |
| Keyboard hints banner | above the scroll view (stays while the dashboard scrolls), 16 dp to the content | scrolled away, 8 px | `keyboardHelpBanner.css` |
| Bottom of every screen | 8 dp padding | 16 px | `.kk-main` (`base.css`) |
| Colours that follow the theme | waterfall line, pitch accent, stroke ghosts and the card meaning/reading/progress text (deep shade in the KanjiKodama themes, colorPrimaryLight with a shadow in the others), WaniKani tags (each type's text colour), EditText hint and underline | hard-coded KanjiKodama values | `--color-waterfall`, `--color-pitch-*`, `--color-stroke-ghost`, `--color-card-ink-*`, `--color-edit-line` (`tokens.css`, `themes.ts`) |
| Toolbar | title ellipsized ~12 dp before the actions ("SEARCH RESUL…"); overflow dots 2.67 dp left of centre; SearchView: the first tap expands it iconified (Collapse + magnifier), the magnifier opens the field (16 dp magnifier, 8 dp insets) | title ran to the actions; field opened at once | `ToolbarView.tsx`, `base.css` (+ `shell.test.tsx`, e2e `toolbarSearch`) |
| Browse | heading 8 dp under the tutorial box's 12 dp (margins add up); EditTexts 43 dp with 4 dp insets, 1 dp underline in the hint colour, 18 sp; spinner = text + grey triangle, no underline | margins collapsed (−9 dp), 2 px green underline, 16 px, underlined select | `browse.css`, `BrowseScreen.tsx` |
| Advanced search form | a `TableLayout` (`shrinkColumns="*"`): label column and value column, Min/Max `ems=2` / `ems=4`, SwitchCompat rows (27 dp) with the labels right-aligned, group headers 16 dp above, Search at the start of column 2 | free grid, wide Min/Max fields, checkboxes, fieldsets with dividers | `AdvancedSearchFormView.tsx`, `tableColumns.ts` (Android's column shrinking), `browse.css`; also on Self-study and Refine |
| Search results | the tutorial and the count stay above the list (only the RecyclerView scrolls); margins add up | scrolled with the list; collapsed margins | `SearchResultsScreen.tsx`, `browse.css` |
| Item page | vertical LinearLayout: every view's 4 dp top margin counts (no collapsing); subject grids are `SubjectGridView` (NORMAL cards, `RigidGridLayout` 2 dp child margin: 4 dp apart across and down, 2 dp edges; the cards' own XML margins are ignored); card glyph 24 sp; details rows 2 + 2 dp; synonym "+" 24 × 22 dp | collapsed margins, 5.3 px gaps, 26 px glyph, 0 / 2 px rows, 40 px "+" | `subject.css`, `StudyMaterials.tsx` (e2e exemption `add-synonym`) |
| Session subject grids | the same `SubjectGridView` as the item page (`getSubjectCardLayoutOther()` is NORMAL; the `*_compact.xml` margins wave 5 used are never applied) | 4 / 6 px | `session.css` |
| Lesson presentation | Previous / Next row above the scroll view (stays); 52 dp buttons | scrolled away; 48 px | `session.css` |
| Quiz with the keyboard open | the quick-action row ends one navigation-bar height above the keyboard (the fragment pads by the IME inset inside a view already above the navigation bar); progress text Pixelify bold; answer hint in the hint grey; visible-password fields in monospace | row on the keyboard; Silkscreen progress; green hint | `visibleViewport.ts` (`kk-ime-open`), `SystemUiPlugin.getNavigationBarHeight` → `--kk-nav-bar`, `displayPrefs.ts`, `AnswerField.tsx`, `session.css` |
| Keyboard IME hints between questions | Java's one `questionEdit` keeps its flags | the invisible keyboard keeper got Chromium's flags, so the keyboard was restarted twice per question | `answerKeyboard.ts` (the keeper reports the last answer field's hints) |
| Settings | category titles 7 dp lower and 8 dp above the first row; summaries 14 sp at Android's line height; text wraps where Java's does (breaks after "/", 17 px widget gap for the WebView's 412 px width); InfoPreference keeps its 41 dp widget frame | 16 px / 0; 1.25 lines; other breaks; full width | `settings.css`, `SettingRows.tsx` |
| Fast travel (menu) | the dialogs over the dashboard | over the Settings screen | `FastTravelScreen.tsx`, `ToolbarView.tsx` |
| Keyboard help | 8 dp button padding, blank lines 16 sp × 1.214 | 22 dp side padding, 19 px | `keyboardHelp.css` |
| "Known limitations" settings row | none (the text is in About) | web-only row and sub-screen | removed (`OtherActions.tsx`, `SettingsScreen.tsx`); About keeps the list |

Final touches (2026-10-26):

| Area | Java | TS before | Fix (file) |
|---|---|---|---|
| Dashboard panels (`main_activity_view_background`) | 3 dp stroke = 8 device px at 2.625 (the shape rounds) | 7 px (Chromium floors border widths to device px) | `calc(var(--border-pixel) + 0.05px)` in `dashboard.css`: 8 px at 2.625, still 6 / 9 px at 2 / 3 |
| Right edge of everything in the page flow | content ends 8 dp from the 1080 px screen edge | ~2 device px further right: Android's WebView lays the page out 412.19 CSS px wide for a 1080 px view (1082 px at 2.625), the last 2 px are cut off | `KkSystemUi.getViewWidth` + `androidSystemUi.ts` narrow the root element to the WebView's real width (411.43 dp) when the excess is under 2 px; panel outlines now end at x = 1048 in both apps |

Wave 5 leftovers also closed: the `visuals.spec.ts` browse-cell check on pixel-7 read two
`boundingBox()` calls in different frames of the screen's slide-in (−8 px); it now measures the grid in
one evaluation and polls until it settles.

## Round 4: the owner's phone (2026-10-26)

The owner's Samsung (1080 × 2520, KanjiKodama Dark) showed three things the 420 dpi emulator round had
hidden or missed. Re-checked on the spare AVD `kk-golden2` (emulator-5558, 1080 × 2400 at 420 dpi, and
1080 × 2340 at 480 dpi, 1080 × 1900 at 420 dpi via `wm size` / `wm density`, reset afterwards), Java
debug app next to the TS app, dark mode, same restored progress; captures in the scratchpad
`shadowfix/` (`j-*` / `t-*`, `z-*` zoomed crops, `pair-*`).

| Area | Java | TS before | Fix (file) |
|---|---|---|---|
| Text shadows (SRS counts, recent unlocks and dates, cards, item tile, quiz glyph, post-60 labels) | `setShadowLayer(3, 1, 1, black)` / `android:shadowRadius="3" shadowDx/Dy="1"` are raw **device pixels** (not dp): a 1 px offset and a Gaussian of sigma 3 × 0.57735 + 0.5 = 2.23 px, one layer, whatever the density | two layers of a 2.2 **CSS** px blur at 0.4 CSS px: the blur and offset grew with the density (5.8 device px of blur radius per layer at 2.625, 6.6 at 3), so black text looked smudged ("odd shadow, blurry"); the quiz glyph's 1.7 CSS px likewise | `--dev-px` = `1px / devicePixelRatio` (`devicePixels.ts` sets `--kk-dpr`, `main.tsx`); `--text-shadow-3px` = 1 device px offset, 4.46 device px blur (2 sigma), one layer (`tokens.css`); radical image copies at +2 / −1 device px (`titleImage.css`); the post-60 canvas `shadowBlur` 3 → 4.46 (`Post60Progress.tsx`). Edge profiles beside the strokes now match Java within 1–3 levels of 255 at 1–4 px (before: 8–15 darker and wider); a sweep of 3 / 4.46 / 6 / 8 px confirmed 4.46. Java's stroke edges stay ~20 levels darker on the first anti-aliased pixel (Android's text rasteriser), not a shadow difference |
| Quiz question size and gap above the type banner | `questionText` is at most `max_font_size_quiz_text` (104) dp **including** the quiz margins `setQuizMargins(4, 4)`: text 96 dp; the view is centred between the top row and the bottom row and shrinks with the room (keyboard open); Anki mode keeps the view's 28 / 24 dp margins (text 52 dp) | font size 104 px with no margins, line-height 1: the CJK ink ran to the banner and was clipped there (worse with the keyboard open on the owner's phone) | `.kk-quiz-glyph` (`session.css`): view = min(max, room), text = view − margins, the font's top padding % as Java's `TypefaceConfiguration`; `.anki` 28 / 24 px; radical images fill the text box |
| Glyph vertical position (quiz question, item title tile, subject cards) | `SubjectInfoButtonView` draws at `textHeight / 2 − (ascent + descent) / 2` with the default Typeface's (Roboto's) metrics; the CJK face only supplies outlines | a `lang="ja"` element in the WebView centres on Noto Sans CJK's taller metrics: glyphs ~0.09 em low (quiz 22 device px, tile 14 px, cards 5 px) | `'KK Android Metrics'` face (only U+0020, Roboto's hhea ascent / descent as overrides) first in `--font-glyph` (`fonts.css`, `tokens.css`), used by the quiz glyph, the item tile and the cards; same word on both: quiz ink rows 358–592 vs Java 359–593 (420 dpi), 387–652 vs 390–654 (480 dpi); tile 326–481 vs 328–482 |
| SRS change toast ("▲ Apprentice II") | `WK.TextView.CustomToast` in every theme: black text on `rounded_corners` (#FFFF80, 10 dp corners), elevation 4 dp; a 20 dp green up (#00A000) / red down (#A00000) block arrow (`ic_arrow_up` / `ic_arrow_down`), a space, the new stage name | the surface colour (grey in the dark themes) with the text colour and a "▲ / ▼" character | `SrsArrow` (`QuestionView.tsx`), `--color-custom-toast-bg/-fg`, `--color-alt-toast-fg` (`tokens.css`, Nord in `themes.ts`), `session.css`; the close-enough toast uses the same style, the alternatives toast is transparent with alternativeToastColorPrimary as in Java |
| Item tile and subject card corners | `small_rounded_corners`: 12 dp | 6 px | `subject.css` |
| Anki mode question banner | `fragment_anki.xml`'s `questionType` has no textSize: 16 sp | 22 px | `session.css` |

Still differing: with the keyboard open on a short screen (1080 × 1900) the TS question view is
~8 device px shorter than Java's (the banner / field / row budget of `--kk-qv-avail` is 144 px, Java's
views add up to ~3 dp less), so the glyph there is 94 instead of 96 px; it no longer touches the banner.

## Remaining settings ported (wave 5, "remaining settings")

Checked side by side on emulator-5556 (scratchpad `parity4/`, `j-*` / `t-*` / `pair-*`):

| Area | Java | TS now |
|---|---|---|
| Font settings | Select fonts / Import fonts and the eight size sliders | the same ten rows (titles, summaries, ranges, defaults); the sizes apply where Java applies them: lesson / quiz / item page title (`max_font_size_*`, 0 hides it), question text cap, answer field, subject info, dashboard tables, Anki answer |
| Font selection | intro text, eight built-in fonts + imported ones, "日本語の書体" in each, a switch; one font per item at random among those with glyphs, tap on the question toggles the default face | same screen; the seven bundled faces are Java's `res/font` files (`public/fonts/quiz/`, fetched when used, not precached); glyph coverage read from the font's cmap; sample line heights from the font's box as Android's `includeFontPadding` (within 1–2 px) |
| Font import | hint, IMPORT (system document picker), rows with SAMPLE / DELETE, "Overwrite file?", "Delete file?", "Font sample", "File imported" | the same; the Android app's file input opens the same DocumentsUI picker, files kept in IndexedDB `kk-fonts` |
| Notifications and other | update frequency, priority, category; Search engine 1–5 (TaggedUrlPreference dialog) | the same rows and dialog (Android build; the web build has no notifications, so those three are hidden like Java hides rows by API level); the native notification uses them (channel importance, compat priority, category, update frequency) |
| Subject title long press | action mode bar above the toolbar (#303030, 2 dp accent line, content pushed down 56 dp): Done, COPY TITLE, the engines (2 + overflow on 411 dp), "Subject title copied"; image radicals: Java's toast | the same on the item page title and the quiz question (`TitleActionMode.tsx`); the engine URL opens in the browser |
| Audio → Request audio focus | MediaPlayer with a transient may-duck focus request when on | vocab audio now plays natively (`KkAudioPlugin.java`, the Java code path); verified with `dumpsys audio` (GAIN_TRANSIENT_MAY_DUCK while playing, none with the switch off); hidden on the web build (a browser can't) |
| Dashboard → post-60 progression | title + 24 dp bar of every subject by stage group, subsections / reverse options, % labels | the same (canvas, Java's label rules and colours); positions within 1–3 px |

## Per screen: what still differs

Everything else matched in the three themes (positions within 1 dp, colours from the same tokens, texts
identical). What is left cannot match, with the reason:

| Screen | Difference | Why |
|---|---|---|
| Toolbar | Java debug build's label "KanjiKodama - Debug" | build label only; the release Java app says "KanjiKodama" like the TS app |
| All long texts | a line occasionally breaks one word earlier or later than in Java | Measured on emulator-5556 (About, Keyboard help, five item pages; line breaks read from stitched screenshots, word gaps counted per line): **157 of 172 line breaks match** (About 20/21, Keyboard help 38/47, item pages 99/104). Line widths are not the cause: lines with the same words are within 0.2 % (median Java/TS 1.002), so the "2 % wider" estimate was wrong and a letter-spacing correction does not help (+0.02 px: 153/167, +0.05 px: 154/171). The cause is Android's line breaker: TextView's `breakStrategy=high_quality` (Minikin's optimal breaker) evens out the slack of all lines of a paragraph, and in the samples it never breaks after a hyphen inside a word (`auto-correct`), while Chromium fills each line greedily and does break there. `text-wrap: pretty` (Chromium only re-balances the last lines) made it worse: 142/167. Neither behaviour can be selected from CSS; matching it would need a JS line breaker that inserts line breaks into React-rendered text, not done |
| About | the open-source components list (React, Dexie.js, sql.js, Workbox, Capacitor vs Jackson, Lottie, JSoup, OkHttp, Pikolo) | deliberate: a different stack |
| Settings → API settings (server mode with wanikani.com) | no "Web site password" row | its only use is Java's resurrect / burn through a login to the WaniKani web site; the TS app resurrects and burns locally and makes no WaniKani web calls (not approved) |
| Cold start | ~0.1–0.15 s slower to a dashboard with data | WebView start-up, see Start-up |

## Top remaining differences

1. Start-up ~0.1–0.15 s behind Java (WebView start-up; minor).
2. Occasional one-word line-break differences in long texts (Android's optimal line breaker vs Chromium's
   greedy one; 157 of 172 breaks match; minor).
3. "Web site password" (server mode against wanikani.com only), see above.
