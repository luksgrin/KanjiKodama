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
| Text shadows | `setShadowLayer(3, 1, 1, black)` (device px): Skia's blur reads darker than a 1.15 px CSS blur; cards, item tile and quiz glyph have it too | lighter shadow; no shadow on card / tile / quiz glyphs | `--text-shadow-3px`, `--text-shadow-3px-glyph` (`tokens.css`), browse / subject / session CSS |
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

Wave 5 leftovers also closed: the `visuals.spec.ts` browse-cell check on pixel-7 read two
`boundingBox()` calls in different frames of the screen's slide-in (−8 px); it now measures the grid in
one evaluation and polls until it settles.

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
| All long texts | a word occasionally wraps one word earlier or later than in Java (e.g. one line of the reading mnemonic) | Android's text layout rounds every glyph advance to whole device pixels (Pixelify Sans runs ~2 % wider than the same text in Chromium, which keeps fractional advances), and Android's line breaker (ICU, `breakStrategy=high_quality`) balances lines differently from Chromium's greedy breaker. Neither is exposed to CSS; a per-glyph spacing hack would change every text's width elsewhere. Line count and heights match in almost all paragraphs |
| About | the open-source components list (React, Dexie.js, sql.js, Workbox, Capacitor vs Jackson, Lottie, JSoup, OkHttp, Pikolo) | deliberate: a different stack |
| Settings → API settings (server mode with wanikani.com) | no "Web site password" row | its only use is Java's resurrect / burn through a login to the WaniKani web site; the TS app resurrects and burns locally and makes no WaniKani web calls (not approved) |
| Cold start | ~0.1–0.15 s slower to a dashboard with data | WebView start-up, see Start-up |

## Top remaining differences

1. Start-up ~0.1–0.15 s behind Java (WebView start-up; minor).
2. Occasional one-word line-break differences in long texts (Android's integer glyph advances and ICU line
   breaking; minor).
3. "Web site password" (server mode against wanikani.com only), see above.
