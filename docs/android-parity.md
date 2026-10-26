# Android parity: TS app vs Java app

Side-by-side check (round 2) on emulator-5556 (Pixel-class, 1080×2400, density 420 = 2.625, Android 16 /
API 36, Android System WebView 133) on 2026-10-25: the Java debug app `app.kanjikodama.wk.debug`
(built from `durtles/`) next to the TS app `app.kanjikodama.wk.web` (`web/`, built with
`npm run build && npx cap sync android && ./gradlew assembleDebug`). Both had the same progress file
restored ("Restore progress from a file": JLPT order, level 6, 1034 reviews due); lesson screens were
checked on fresh data (level 1, 20 lessons). Screenshots stay outside the repo (WaniKani content):
scratchpad `parity2/` (`j-*` Java, `t-*` TS, `pair-*` side by side; round 1 in `parity/`).

Severity: **blocker** = clearly not "the same app" / wrong behaviour; **noticeable** = a user switching
apps sees it at once; **minor** = detail. "Deliberate" = an owner decision or a web/platform limit.

Round 1's blockers (bottom tab bar, "Locked" stage on search results) and most noticeable items
(toolbar colours and titles, dashboard layout, session menu, dialogs, settings sub-screens, curriculum
and level-test dialogs, summary, version) were fixed in wave 4 (commit 46e09cc). Round 2 fixed the
items listed under "Fixed in round 2"; what is left is listed per screen.

## Start-up

Same restored progress, cold start (`am force-stop`, then `am start`), 5 runs each.

| | Java | TS round 1 | TS before round 2 | TS after round 2 |
|---|---|---|---|---|
| `am start -W` TotalTime (first frame) | 0.89–0.95 s | 1.32–1.50 s | 1.31–1.41 s | ≈ first frame of the dashboard (splash held until the shell exists) |
| Process start → dashboard with counts | ~0.95–1.0 s (dashboard fades in with its data) | 1.2–1.3 s | 1.24–1.34 s | **1.03–1.15 s** |
| In-page time (time origin → dashboard) | — | — | 640–710 ms | 500–555 ms |

Where the time goes now: ~0.55–0.6 s Android process + WebView + Capacitor bridge start until the page's
time origin (fixed cost, the Java app's activity is ready at about the same time); ~0.16–0.2 s until the
first script and asset responses arrive (all of them land together, the WebView's asset loader is
cold); the content file is then read in ~0.1 s; `readContent` + hydrate + first render ~0.2 s.

Fixed in round 2:
- `web/android/app/build.gradle`: `noCompress 'db'`: the 33 MB content file is stored uncompressed in the
  APK, so the WebView streams it without inflating it first (−0.1 s; the APK grows from 16 to 41 MB,
  still less on disk than the Java app, which keeps a compressed copy in the APK and an expanded copy in
  its files).
- `web/vite.config.ts`: a `<link rel=preload>` for the content file named in the bundled manifest, so its
  download starts with the HTML instead of after the manifest (−0.05 s).
- `web/src/content/readContent.ts`: all subject rows come from one SQL result (SQLite builds one JSON
  text, decoded and parsed once) instead of ~180 000 wasm→JS string conversions (sql.js `UTF8ToString`
  85 ms → 22 ms on the emulator). Falls back to the row-by-row read if the JSON path fails; the output
  is identical (checked against the real content DB).
- Tried and reverted: copying a frozen template in `core/progressFile/format.ts emptySubjectRow`
  (object spread of a 40-key object is ~8× slower in V8 than the key loop).

Remaining (minor): ~0.05–0.15 s behind Java. Left: `emptySubjectRow` is called ~100 000 times during
start-up (~40 ms, core progression getters returning fresh empty rows; a shared read-only row would need
core changes), and the cold asset-loader delay before the first responses.

## Fixed in round 2 (all screens)

| Area | Java | TS before | Fix (file) |
|---|---|---|---|
| Button font | AppCompat applies the theme's `app:fontFamily` (Pixelify Sans) over the styles' `android:fontFamily` (Silkscreen): every Button is Pixelify Sans in capitals | Silkscreen, so all buttons were ~25 % wider with wide letter gaps | `.kk-btn`, quiz special buttons, tutorial Dismiss: body font + `text-transform: uppercase` (`ui/theme/base.css`, `session.css`) |
| Quiz buttons | 18 sp, letterSpacing 0.06 | 13–18 px, 0.04 em | `session.css` |
| Dialogs | white (`background_floating`), Pixelify 14 sp button text without spacing, message line height ~1.2, red warning icon, no focused button on open | mint surface, Silkscreen buttons with spacing, line height 1.4, dark icon, first button focused (outline) | `--color-dialog` token, `.kk-dialog`/`.kk-alert`/`.kk-sdialog` styles, `ConfirmDialog` flat buttons, `SessionDialog` focuses the dialog and gives the focus back (the answer field) on close |
| Radio list dialogs | item text 87 % black, unchecked rings 54 % black, text 73 dp from the edge | ink text, green rings, 64 dp | `--color-dialog-item`, `--color-control-normal`, `alert.css` |
| Preference summaries | `textColorSecondary` (grey) | green (`--color-text-muted`) | `--color-pref-summary`, `settings.css`; row line heights as Java |
| Overflow menu | top at the toolbar's top, no list padding, Silkscreen without letter spacing, max(50 %, 320 dp) wide with ellipsis, keyboard stays open, Back closes it | 8 px lower, padded, spaced, full width, keyboard closed, Back left the app | `base.css`, `ToolbarView.tsx` |
| Toolbar SearchView | magnifier inside the field, no hint, clear "×", other actions (Mute, overflow) stay | wide field with a hint, no other actions | `ToolbarView.tsx`, `base.css` (+ `test/app/shell.test.tsx`) |
| Dashboard | "Lessons:"/"Reviews:" 26 sp at ≥ 360 dp (`layout-w360dp`); level bars all end at the same x (TableLayout); hairline chart grid; 1-px-device text shadows; SRS tiles in one row ≥ 480 dp (`layout-w480dp`) | 20 px labels, bars as wide as each label allowed, 1 px grid, 3 px blurred shadows, always 3 + 2 | `dashboard.css` |
| Headline tile | glyph = `max_font_size_lesson` 128 / `_quiz` 28 / `_browse` 64 sp, bounded by the screen width − 80 dp | 3.5 em everywhere (small in lessons, big under answers) | `ItemPage`/`Headline` `maxFontSize`, `SessionItemInfo`, `LessonsScreen`, `subject.css` |
| Quiz question (Android) | question view = progress line + 104 sp text (~133 dp) with the keyboard open | 88 px (the keyboard allowance was subtracted twice: the WebView already shrinks) | `kk-viewport-resizes` class (`main.tsx`) + `session.css` |
| Answer mark | Lottie: white mark on a filled red/green circle | coloured ✗ glyph | `session.css` |
| Item info | dividers above Used radicals / Visually similar / Used in; reveal button normal size; Pixelify line height ~1.21; fake-bold primary meaning (same width as regular) | no dividers, small reveal button, 1.3 line height, real bold (long meanings wrapped earlier) | `ItemPage.tsx`, `SessionItemInfo.tsx`, `subject.css` |
| Search results | (width + 10) / 90 columns; tutorial box edge to edge; card text 24 sp glyph box, 1.21 lines | 5 columns after the toolbar search (WebView reported a wrong width while the keyboard closed and sent no second resize); inset box; taller cards | `SearchResultsScreen.tsx`/`BrowseScreen.tsx` width via `ResizeObserver`, `browse.css` |
| Browse | level cells with gaps, crisp numbers; Search buttons normal size | 1 px gaps, blurred numbers, small Search buttons | `browse.css`, `AdvancedSearchFormView.tsx` |
| Settings | sub-screens open at the top; advanced warning with its bold parts | sub-screen kept the root's scroll position; plain text | `AppShell.tsx` (scroll reset on query change), `SettingRows.tsx` |
| Level test | dialog over the dashboard with the dashboard's toolbar | toolbar "Level test" with a back arrow | `ToolbarView.tsx` (level test counts as the main screen) |
| Summary | rows 25 dp apart | 23 px | `session.css` |
| About | "• item" lines without indent | indented list | `about.css` |

## Per screen: what still differs

### Dashboard (`pair-dashboard`, `pair-dashboard2`, `pair-overflow-menu`)

| Difference | Java | TS | Severity | Why / file |
|---|---|---|---|---|
| Keyboard hints banner | yellow "Please take a moment to review some hints for your keyboard settings" DISMISS / VIEW until dismissed; VIEW opens Keyboard help | same box (first on the dashboard, `keyboard_help_dismissed`, reset by "Reset UI confirmations and tutorials"); Android build only: the hints are about Android keyboard flags a browser can't set | — | fixed (wave 5, `dashboard/KeyboardHelpBanner.tsx`) |
| Recent-unlocks rows | 32 dp rows, 4 dp apart | same (wave 5; e2e exemption `subject-row-*`) | — | fixed |
| App label in the toolbar | "KanjiKodama - Debug" (debug build) | "KanjiKodama" | — | build label only |

### Lesson presentation and quiz (`pair-lesson-pres`, `pair-lesson-last`, `pair-lesson-quiz`)

Wave 5 closed the remaining differences:
- Don't know / Submit at the bottom, on the keyboard (Java's spacer + quickActionRow). The quiz fills the
  height above the keyboard (`visibleViewport.ts`: `visualViewport.height` on iOS / Chrome, the resized
  viewport in the Android app); on very short screens (320 × 568 with the keyboard: 300 px visible) the
  question view gives up height first, so the row stays visible. Checked with the keyboard simulated both
  ways in WebKit, Chromium and Firefox (`checkQuickActions`, `session-layout.spec.ts`).
- Subject card grid: 4 dp apart across, 6 dp down, 2 dp from the edges (`subject_card_*_compact.xml`
  margins; `session.css` for the session screens).
- Fragment slides between questions and lesson items (`slide_animations`, Java's `getAnimation`).

### Review question, wrong answer, item info (`pair-review-meaning-kb`, `pair-review-reading-kb`, `pair-wrong`, `pair-info-more`)

Wave 5: NEXT after answering is in the coloured header (bottom right, focused with Java's highlight; the
header grows to ~193 px) and pinned at the bottom (`nextButton2`); the keyboard closes as in Java and
opens again for the next question (`keyboardKeeper.tsx`). Session dialogs (wrap-up, abandon, level
test, self-study, summary) are an overlay that leaves the focus in the answer field, so the keyboard stays
open (`SessionDialog.tsx`; Enter/typing don't reach the field while it is open, Tab moves into it).
Anki mode: the flat full-width button bar pinned at the bottom, `anki_buttons_height` dp high. Display
settings read: `center_caret`, `anki_buttons_height`, `quiz_question_view_height`,
`stretch_quiz_question_view`, `slide_animations`; Keyboard settings: `enable_auto_correct_*` →
`autocorrect`/`spellcheck`, `lang` per question kind (the other IME flags are native, `KkWebView`).

### Session menu, wrap-up / abandon dialogs, summary, session log (`pair-session-menu`, `pair-wrapup-dialog`, `pair-summary`)

Match (entries and order, dialog look and texts, summary blocks and buttons, FINISH focused with Java's
highlight). The full session log (`full_session_log`) has Java's "Events" list (session started /
re-loaded, lesson quiz started, back to presentation, every submit, Anki grade, Don't know, undo, skip,
ignore; "12s ago"; in memory only, as Java).

### Item pages (`pair-item-radical`, `pair-item-kanji`, `pair-item-vocab`)

| Difference | Java | TS | Severity | Why / file |
|---|---|---|---|---|
| Radicals without characters (e.g. "Yurt") | the radical's image | same: the Java drawables converted into the content file's `title_image` table, drawn by `SubjectChars` (headline, cards, results, toolbar title, dashboard tables, session question and log) | — | fixed (wave 5) |
| Japanese face | system CJK font everywhere (the bundled Zen Maru Gothic is never used) | same (`--font-ja` = system CJK stack) | — | fixed (wave 5) |

### Browse and search results (`pair-browse`, `pair-browse-level`, `pair-search`, `pair-search-open`)

| Difference | Java | TS | Severity | Why / file |
|---|---|---|---|---|
| Advanced search | Level range, Frequency range, Only leeches… | same (JLPT block row removed, wave 5) | — | fixed |
| Level cells | ~37 × 31 dp, 2 dp / 8 dp apart | same (wave 5; e2e exemption `browse-level-*`) | — | fixed |
| DISMISS on the results tutorial | grey pressed/focus background | same state layer on press / keyboard focus (the Java capture showed it focused because adb key input leaves touch mode) | — | fixed (wave 5) |
| Results list | edge to edge (headers full width, cards 2 dp from the screen edge) | same (wave 5) | — | fixed |

### Settings (`pair-settings-main`, `pair-settings-display`, `pair-list-dialog`, `pair-advanced-warning`, `pair-advanced`, `pair-curriculum`, `pair-restore-confirm`, `pair-restore-done`)

| Difference | Java | TS | Severity | Why / file |
|---|---|---|---|---|
| Keyboard input settings | own sub-screen, 11 rows | same rows, titles, summaries, defaults (`force_ascii_meaning` XML default written when settings open); Android sets every flag natively (`KkWebView`: no personalized learning, force ASCII, auto-correct, visible password, language hint; checked with `dumpsys input_method`). Web: only auto-correct and the Next delay (the other rows are hidden, as Java hides the language hints below Android 7) | — | fixed (wave 5) |
| Display settings | Light Theme / Dark Theme lists (8 themes), Theme customisation, centre caret, Anki button size, fixed question height, slide animations, stretch question view | same rows, order, summaries ("… theme is currently selected", "… is used in system wide dark mode"), defaults; all 8 themes with Java's colours (`ui/theme/themes.ts`, compared on the emulator in Wanikani and Nord); Theme customization screen with the 33 samples and the HSL picker; switch and seek bar geometry measured from Java | — | fixed (wave 5) |
| Sub-screen back stack | the root keeps its scroll position when you come back | same: Back restores every screen's scroll position (`AppShell.tsx`) | — | fixed (wave 5) |

List dialogs, the advanced warning, the curriculum dialog and the restore dialogs match (texts, layout,
colours).

Other actions (wave 5): About this app, Data import / export, Reset UI confirmations and tutorials,
Reset database, Backup your settings, Restore your settings, in Java's order with Java's summaries,
warning dialogs (No / Yes) and toasts. "Known limitations" stays on the web build only (Android has
none, so the row is hidden there). Data import/export is Java's screen (title "Data import/export",
the two texts, four buttons; search presets and star ratings as Java's JSON, shared through the share
sheet on Android). Settings backups use the Java file format (`smouldering_durtles_<date>.json`): a
backup made by the Java app restores in the new app and the other way round. The API settings screen
has "Network access rule" again (it gates the Android audio auto-download, `auto_download_audio`, as
Java does); `show_legacy` shows the old radical names and mnemonics on the item page.

### About (`pair-about`)

| Difference | Java | TS | Severity | Why |
|---|---|---|---|---|
| Open-source components | Jackson, Lottie, JSoup, OkHttp, Pikolo | React, Dexie.js, sql.js, Workbox, Capacitor | — | deliberate: different stack |
| URL wrapping | the GitHub link breaks at "/" | same (`<wbr>` after each "/"); paragraph spacing one empty line as Java | — | fixed (wave 5) |

### Kanji level test start (`pair-leveltest`)

Matches (dialog over the dashboard, toolbar, texts, buttons).

### Widget (`widgets-crop`), icon, notification (`notifications`)

| Difference | Java | TS | Severity | Why / file |
|---|---|---|---|---|
| Widget | dark rounded 1×1 tile "R: 1033 / More at …" | identical layout and texts | — | (the two showed different "More at" hours only because the two apps' progress diverged during the test sessions) |
| Notification | one notification (id 1) on `NewReviewsChannel`, category recommendation, public, "New reviews available" / "1034 reviews available" | identical (checked by moving the emulator clock forward a day; id, channel, category, visibility, title and text the same) | — | native `ReviewNotifications.java` since wave 4 |
| App label | "KanjiKodama - Debug" (debug build) | "KanjiKodama" | minor | `android/app/src/main/res/values/strings.xml` (step 6) |

## Top remaining differences

1. ~~Keyboard help banner + Keyboard input settings sub-screen missing~~ — fixed in wave 5.
2. ~~Display settings: TS has only Theme (system/light/dark) and the Anki swap~~ — fixed in wave 5 (all 8 themes, Theme customization).
3. ~~Radicals without characters show their slug~~ — fixed in wave 5.
5. Start-up still ~0.05–0.15 s behind Java — minor.
6. ~~40 px tap-target floor on recent-unlock rows and browse level cells~~ — fixed in wave 5 (Java sizes, documented e2e exemptions).
