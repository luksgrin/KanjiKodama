# Android parity: TS app vs Java app

Side-by-side check on emulator-5556 (Pixel-class, 1080×2400, Android 16 / API 36, Android System
WebView 133) on 2026-10-25: the Java debug app `app.kanjikodama.wk.debug` (built from `durtles/`)
next to the TS app `app.kanjikodama.wk.web` (`web/`, built with `npm run build && npx cap sync android
&& ./gradlew assembleDebug`). Both had the same progress file restored ("Restore progress from a
file", level 6, JLPT order, 1034 reviews due); lesson screens were checked on fresh data (25 lessons).
Screenshots stay outside the repo (WaniKani content): scratchpad `parity/` (`j-*` Java, `t-*` TS,
`pair-*` side by side).

Severity: **blocker** = the app is clearly not "the same app" / wrong behaviour; **noticeable** = a
user switching apps sees it at once; **minor** = detail.

The TS UI is being reworked in parallel (`web/src/ui/`, `web/src/app/`); the UI rows below are for
that work. Rows marked **fixed** were Android-specific and are fixed in `web/android/` and
`web/src/platform/android*.ts` (see "Fixed here").

## Start-up

| | Java | TS before | TS after (this change) |
|---|---|---|---|
| Cold start, process start to dashboard | ~1.0–1.15 s (splash, then dashboard fades in) | 1.5–1.85 s (`am start` → JS loaded ~0.75 s → content file fetched ~1.15–1.3 s → dashboard ~1.55–1.85 s) | 1.2–1.3 s from process start (`adb logcat -s KkStartup`), `am start -W` TotalTime 1.32–1.50 s |
| What the user sees | system splash (torii) → dashboard | system splash → web start-up screen "木霊 KanjiKodama · Loading kanji… / Preparing your reviews…" for ~0.7 s → dashboard | system splash → dashboard (splash kept until `.kk-shell` exists) |

Measured with an empty and with the restored progress (the hydrate step adds ~0.1–0.2 s with 1034
items in progress). Under 2 s, so not a blocker, but still ~0.2–0.3 s behind Java. Where the time goes
(CDP CPU profile, warm and cold):

1. ~0.55–0.7 s process + WebView start until the page's time origin (Java's first frame is at ~0.55–0.85 s; this part is mostly fixed cost).
2. ~0.15–0.2 s loading/parsing `index-*.js` (631 kB) before the content fetch starts.
3. The 33 MB content file: fetched from the APK assets in ~0.15–0.28 s; the sha256 check costs ~15 ms (not a problem).
4. `readContent` (`web/src/content/readContent.ts`) runs `SELECT * FROM subject` over 9887 rows: every mnemonic, hint, context sentence, audio list and search target (26 MB of text) is decoded to JS strings (`TextDecoder.decode` 130 ms warm, more cold, plus ~70 ms GC) and then dropped, because `subjectRow` keeps 17 columns.
5. Start-up write (ordering + local progression) and first render.

Concrete fixes (not in files this check owns):
- **`web/src/content/readContent.ts`**: select only the columns `subjectRow` reads (`id, object, hiddenAt, lessonPosition, srsSystemId, level, characters, slug, meanings, auxiliaryMeanings, readings, componentSubjectIds, amalgamationSubjectIds, visuallySimilarSubjectIds, partsOfSpeech, frequency, joyoGrade, jlptLevel`); read mnemonics/sentences/audio on demand by id (like `strokeData`/`pitchInfo`). Expected gain 0.15–0.3 s on cold start.
- **`web/index.html`** (shared): `<link rel="preload" href="content/content-manifest.json" as="fetch" crossorigin>` and a preload for the sql.js wasm, so the fetches start while `index-*.js` is parsed (~0.1 s).
- **`web/vite.config.ts`** (shared): split the 631 kB entry (screens other than the dashboard via `React.lazy`), so less JS is parsed before the first screen.
- The splash hold (fixed here) removes the visible start-up screen, which is what made the TS start feel slow.

## Fixed here (Android-specific)

| Issue | Java | TS before | Fix |
|---|---|---|---|
| Status bar colour | toolbar colour (dark `#2e4756`, subject-type colour in sessions/item pages), light icons | light grey `#fafafa` band above the dark top bar, dark icons (WebView < 140 keeps the page inside the bars; the band is the decor background) | `SystemUiPlugin.setBarColors` + `androidSystemUi.ts`: the page's colour at its top/bottom edge paints the bar areas, icon colours by luminance; follows the top bar automatically once it takes the subject colour; dialogs dim the bars like Java's scrim |
| Navigation bar colour | page background | `#fafafa` band below the bottom nav | same fix (bottom edge colour) |
| Start-up screen | splash → dashboard | splash → web loading screen → dashboard | `MainActivity`: `installSplashScreen` + keep-on-screen until the app shell (or the start-up error) is rendered, max 6 s; `postSplashScreenTheme` in `styles.xml` |
| Keyboard "no personalized learning" | on (`enable_no_learning` default): incognito icon in Gboard | off | `KkWebView` (`res/layout/capacitor_bridge_layout_main.xml` override) adds `IME_FLAG_NO_PERSONALIZED_LEARNING` while an `input.kk-answer` has focus |
| Force ASCII keyboard for meanings | on (`force_ascii_meaning` default) | off | same, `IME_FLAG_FORCE_ASCII` for meaning answers (not for readings, `force_ascii_reading` default off) |
| versionName | 0.1.0 | 1.1 | `android/app/build.gradle`: `0.1.0`, with the Java app's `-PversionName/-PversionCode` overrides |

Checked unchanged and matching: suggestions off and no auto-capitalisation on answer fields
(`inputType` has `NO_SUGGESTIONS`, no `CAP_*`), keyboard opens on each question, `IME_ACTION_DONE`,
no fullscreen IME; the keyboard resizes the page (buttons stay above it); back on the dashboard
moves the app to the background; launcher icon identical; widget identical; notification texts
identical.

## Per screen

### Dashboard (`pair-dashboard`, `pair-dashboard-scroll`)

| Difference | Java | TS | Severity | Suspected TS file |
|---|---|---|---|---|
| App bar actions | Search, Mute, overflow menu (Settings, Download audio, Browse/search…, Fast travel…, Kanji level test…, Self-study quiz, About…) | title only; bottom tab bar (Home/Browse/Study/Settings) instead | blocker (navigation model differs) | `ui/shell/TopBar.tsx`, `ui/shell/BottomNav.tsx`, `ui/shell/AppShell.tsx` |
| Session counts | text row "Lessons: 0   Reviews: 1034" + one "START REVIEWS"/"START LESSONS" button | two big tiles (LESSONS / REVIEWS) | noticeable | `screens/dashboard/AvailableSessions.tsx` |
| Level line | "You are level 6 (N4, level 4 of 4). Your time on this level is 13.8 days." | missing | noticeable | `screens/dashboard/DashboardScreen.tsx` |
| Upcoming text | "1034 reviews available now" only | also "No reviews scheduled yet." while 1034 are due | noticeable (wrong text) | `screens/dashboard/UpcomingReviews.tsx` |
| Keyboard hints banner | yellow "Please take a moment to review some hints for your keyboard settings" DISMISS / VIEW (fresh install) | missing | minor | `screens/dashboard/DashboardScreen.tsx` |
| Timeline chart | no heading; y axis with 300/600/900 grid lines; bars coloured by SRS stage (legend Apprentice/Guru/Master/Enlightened); labels every 4 h; level-up arrow marker | heading "REVIEW TIMELINE"; no y axis; bars by type (Radicals/Kanji/Vocabulary); labels every 3 h; "max 1034/h" | noticeable | `screens/dashboard/TimeLineChart.tsx` |
| Section order | sessions → timeline → SRS breakdown → level progression → recent unlocks | sessions → timeline → SRS breakdown → level progress (order now as Java in the latest build); no recent unlocks | noticeable | `screens/dashboard/DashboardScreen.tsx` |
| SRS breakdown | 3+2 large tiles, label top-left, big number | 5 small tiles in one row, number above label, labels truncated ("Appren…", "Enlighte…") | noticeable | `screens/dashboard/SrsBreakdown.tsx` |
| Level progression | flat list, bar left, label right ("Lvl 4 kanji"), legend Passed/Apprentice/Initiate/Locked | grouped per level with JLPT chips ("N4, level 2 of 4"), label left, count right ("33/38"), no legend | noticeable | `screens/dashboard/LevelProgress.tsx` |
| Recent unlocks | "Recent unlocks in the last 30 days" list (character + date rows) | missing | noticeable | `screens/dashboard/DashboardScreen.tsx` |

### Lesson presentation (`pair-lesson-pres`, `pair-lesson-last`)

| Difference | Java | TS | Severity | Suspected TS file |
|---|---|---|---|---|
| Title / toolbar | "一 (level 1 radical)", toolbar + status bar in the subject colour, Search/Home/menu | "LESSONS", dark toolbar | noticeable | `screens/lessons/LessonsScreen.tsx`, `ui/shell/TopBar.tsx` |
| Character box | large (~150 dp), fills the left third | small (~100 dp) | minor | `components/subject/ItemPage.tsx` |
| Subject cards (Used in) | 4 columns, meaning + reading + SRS stage ("Initiate") | 3 columns, no SRS stage line | noticeable | `components/subject/SubjectSections.tsx` |
| Synonyms "+" | small inline "+" right after "My synonyms:" | large round button at the right | minor | `components/subject/StudyMaterials.tsx` |
| Extra "⋮" button | none (menu is in the toolbar) | "⋮" next to Next | minor | `screens/lessons/LessonsScreen.tsx` |

### Lesson quiz / review question, keyboard open (`pair-lesson-quiz`, `j-review-q1` / `t-review-q1`, `pair-review-meaning-kb`)

| Difference | Java | TS | Severity | Suspected TS file |
|---|---|---|---|---|
| Toolbar | subject colour, title = question type ("Kanji Reading", "Radical Name"), Search/Home/menu | dark, title "REVIEWS"/"LESSONS" | noticeable | `components/session/SessionScreen.tsx`, `ui/shell/TopBar.tsx` |
| Answer field | centred underlined field (~65% width), no box | full-width boxed field | noticeable | `components/session/AnswerField.tsx`, `session.css` |
| Button position | Don't know / Submit at the bottom, just above the keyboard | directly under the field (owner decision for small iPhones; keep) | minor (intended) | — |
| Character size with keyboard open | stays large | shrinks (e.g. 母 drawn smaller once the keyboard opens) | minor | `components/session/QuestionView.tsx` |
| Session menu | toolbar overflow: Settings, Mute, Download audio, Browse/search…, Session log…, Abandon session, Wrap up session, My notes…, About… | "⋮" on the subject box with Abandon / Wrap up only | noticeable | `components/session/SessionMenu.tsx` |
| IME flags | no personalized learning, force ASCII for meanings | **fixed** (same flags now) | — | — |

### Wrong answer state and item info after answering (`pair-wrong`, `pair-info-more`)

| Difference | Java | TS | Severity | Suspected TS file |
|---|---|---|---|---|
| Wrong answer row | full-width tinted band with the centred answer, no mark | boxed field with "✗" at the right | minor | `components/session/AnswerField.tsx` |
| Next buttons | NEXT on the subject box (top right) and another NEXT at the bottom of the info | one Next under the field (owner decision) | minor (intended) | — |
| Show more / Show all | inline right of the item header | separate row under Next | minor | `components/session/SessionItemInfo.tsx` |
| Info table | labels right-aligned next to the values | labels left-aligned in a column | minor | `components/subject/SubjectSections.tsx` |
| Reading in header | first/primary reading bold ("**きょう**, けい") | all readings same weight | minor | `components/subject/ItemPage.tsx` |
| Cards in info | meaning, reading and SRS stage ("Guru I - now") | meaning only (kanji in vocab info) | noticeable | `components/subject/SubjectSections.tsx` |

### Abandon / wrap-up dialogs (`pair-abandon`)

| Difference | Java | TS | Severity | Suspected TS file |
|---|---|---|---|---|
| Dialog style | Material alert: warning icon, title in body font, flat text buttons in one row ("YES AND DON'T ASK AGAIN · NO · YES") | pixel title font, raised buttons on two rows, no icon | noticeable | `components/ConfirmDialog.tsx`, `components/session/SessionDialog.tsx` |
| Scrim over status bar | dimmed | **fixed** (bars are dimmed with the backdrop) | — | — |
| Texts | — | identical | — | — |

### Session summary (`pair-summary`)

| Difference | Java | TS | Severity | Suspected TS file |
|---|---|---|---|---|
| Button order/size | "SHOW ITEMS · FINISH", compact, right-aligned | "FINISH · SHOW ITEMS", full width | noticeable | `screens/summary/SummaryScreen.tsx` |
| Correct / incorrect blocks | green-tinted block, red-tinted block | one white panel | noticeable | `screens/summary/SummaryScreen.tsx` |
| Label alignment | right-aligned labels, value right after the colon | label left, value far right | minor | `screens/summary/SummaryScreen.tsx` |
| Toast "Session wrapping up…" | Android toast on wrap-up | none | minor | `components/session/SessionScreen.tsx` (needs a toast component) |
| Bottom nav | — | hidden (correct) | — | — |

### Item pages: radical, kanji, vocabulary (`pair-item-radical`, `pair-item-kanji`, `pair-item-vocab`)

| Difference | Java | TS | Severity | Suspected TS file |
|---|---|---|---|---|
| Title / toolbar | "力 (level 3 radical)" / "電源 (level 31 vocabulary)", toolbar + status bar in the subject colour | "ITEM", dark | noticeable | `screens/subject/SubjectScreen.tsx`, `ui/shell/TopBar.tsx` |
| Subject cards | 4 columns, meaning + reading + SRS stage; long meanings shrink ("Congratulations") | 4 columns, no SRS stage; long meanings break mid-word ("Achievemen-t", "Cooperatio-n") | noticeable | `components/subject/SubjectSections.tsx` |
| Audio button | grey flat chip with speaker icon "🔊 電源" | raised pill "▶ 電源" | minor | `components/subject/ItemPage.tsx` |
| Info table at the bottom | SRS System / SRS Stage / JLPT on the vocab page | present further down (same values) | — | — |
| Line spacing | dense | ~20% more line height, so less fits | minor | `components/subject/subject.css` |

### Browse level and search results (`pair-browse`, `pair-browse-level`, `pair-search`)

| Difference | Java | TS | Severity | Suspected TS file |
|---|---|---|---|---|
| Level picker | plain 10-column grid of all levels, current level lighter | grouped by N5/N4/N3/N2/N1/Obscure, 7 columns, current level filled | noticeable | `screens/browse/BrowseScreen.tsx` |
| Tutorial banners | yellow explanation + DISMISS on Browse and on results | missing | minor | `screens/browse/*` |
| Search entry | toolbar Search action (on every screen), `SearchView` | only the "Keyword search" field on the Browse tab | noticeable | `ui/shell/TopBar.tsx` |
| Results actions | in the toolbar menu | buttons row (Refine search, Save preset, Radicals/Kanji/Vocabulary/Kana vocabulary) | noticeable | `screens/browse/SearchResultsScreen.tsx` |
| Group headers | large "30 Radicals" with chevron, "30 passed" right | small header, status on a second line | minor | `screens/browse/SearchResultsScreen.tsx` |
| Grid | 4 columns; vocabulary as full-width rows (word left, meaning/reading/stage right) | 3-column cards for every type | noticeable | `screens/browse/SearchResultsScreen.tsx` |
| Stage label of unstarted unlocked items | "Initiate" | "Locked" (item page says "Initiate") | blocker (wrong data shown) | `screens/browse/SearchResultsScreen.tsx` (line ~69, `tag === 'locked'`), `screens/browse/searchData.ts` |
| Stage band | plain text | coloured band (Guru purple) | minor | `screens/browse/browse.css` |

### Settings main (`pair-settings-main`)

| Difference | Java | TS | Severity | Suspected TS file |
|---|---|---|---|---|
| Structure | list of sub-screens (Audio download, Display, Dashboard, Subject Info, Audio, Lesson/review, Keyboard input, Font, Notifications and other), then Advanced, Progress, Other actions | one long page of cards (Progress, Progress screens, Lesson/review settings…, Appearance, Storage, Version, Known limitations) | noticeable (owner decided: basics + Advanced page; the sub-screen navigation itself still differs) | `screens/settings/SettingsScreen.tsx` |
| Progress section | "Save progress to a file" / "Restore progress from a file" rows with summaries | two big buttons in a card | minor | `screens/settings/ProgressSection.tsx` |
| Restore confirm | "Override local progress?" … "RESTORE AND OVERRIDE" / "CANCEL"; then a dialog "Progress restored, level 6." OK | "Restore progress?" … "Restore" / "Cancel"; inline text "Progress restored, level 6." | noticeable (texts) | `screens/settings/ProgressSection.tsx` |
| Keyboard input settings | own screen (force ASCII, visible password, no learning, IME hints, auto-correct) | missing (Android flags now use the Java defaults, see "Fixed here") | noticeable | `screens/settings/*` + `src/core/settings` |
| Advanced warning dialog | same text, YES / NO | same text | — | — |

### Advanced settings (`pair-advanced`)

| Difference | Java | TS | Severity | Suspected TS file |
|---|---|---|---|---|
| Layout | separate screens per area (Lesson / Review / Self-study / Other advanced settings) | one page with all areas | minor (owner decision) | `screens/settings/AdvancedSettingsScreen.tsx` |
| List settings | row with the value as summary, tap → radio dialog | inline `<select>` (WebView dropdown) | noticeable | `screens/settings/SettingRows.tsx` |
| Switches | small Material switches at the right | large pill switches | minor | `screens/settings/settings.css` |

### About (`pair-about`)

| Difference | Java | TS | Severity | Suspected TS file |
|---|---|---|---|---|
| Version | "KanjiKodama (漢字木霊) 0.1.0" | "0.0.1" (from `web/package.json` "version") | noticeable | `web/package.json` (shared) or `screens/about/AboutScreen.tsx`; the APK's versionName is 0.1.0 now |
| Title | "About KanjiKodama" | "ABOUT" + a panel heading "ABOUT" | minor | `ui/routes.ts`, `screens/about/AboutScreen.tsx` |
| Links | green underlined | dark underlined | minor | `screens/about/about.css` |
| Text | same | same | — | — |

### Curriculum order (`pair-curriculum`)

| Difference | Java | TS | Severity | Suspected TS file |
|---|---|---|---|---|
| Form | single-choice dialog over Settings (radio buttons, CANCEL) | separate screen with two cards | noticeable | `screens/curriculum/CurriculumScreen.tsx` |
| Texts | same | same | — | — |

### Kanji level test start (`pair-leveltest`)

| Difference | Java | TS | Severity | Suspected TS file |
|---|---|---|---|---|
| Form | dialog over the dashboard ("CANCEL · START ROUND 1") | separate screen, button text wraps ("START ROUND / 1") | noticeable | `screens/levelTest/LevelTestScreen.tsx` |
| Texts | same | same | — | — |

### Widget, icon, label (`widgets-crop`, `icons-crop`)

| Difference | Java | TS | Severity | Suspected file |
|---|---|---|---|---|
| Widget (1×1) | dark rounded tile "R: 1034" | identical | — | — |
| Launcher icon | torii icon | identical | — | — |
| Label | "KanjiKodama - Debug" (debug build), "KanjiKodama" (release) | "KanjiKodama" for every build type | minor (useful while both are installed) | `android/app/src/main/res/values/strings.xml` (step 6) |

### Notifications

Triggered both by finishing the same lesson session on fresh data and moving the emulator clock to the
next review hour.

| Difference | Java | TS | Severity | Suspected file |
|---|---|---|---|---|
| Title / text | "New lessons and reviews available" / "20 lessons and 5 reviews available" | identical | — | — |
| Channel | `NewReviewsChannel` | `NewReviewsChannel`, plus an extra "Default" channel created by `@capacitor/local-notifications` (visible in the app's notification settings) | minor | plugin default; `platform/androidNotifications.ts` |
| Notification id / stacking | one notification (id 1), updated in place | one per planned hour (ids 1000–1063): if the app isn't opened for several review hours, several notifications pile up instead of one updated | noticeable | `platform/androidNotifications.ts`; fix needs a native publisher (e.g. post from the widget's existing hourly alarm with id 1) |
| Lock-screen visibility | PUBLIC | PRIVATE (the plugin doesn't set it per notification; the channel is public) | minor | `platform/androidNotifications.ts` |
| Category / sound | category `recommendation` (setting default), sound on new reviews | no category, `ONLY_ALERT_ONCE` | minor | `platform/androidNotifications.ts` |
| Pending reviews after a restore | the hourly alarm posts once for reviews already due | nothing until new reviews become due | minor | `core/notifications/plan.ts` (behaviour), by design |

### Behaviour

| Difference | Java | TS | Severity | Suspected TS file |
|---|---|---|---|---|
| Back button at the dashboard | always backgrounds the app | backgrounds it, but after "Finish" on the summary one extra back press is swallowed (history has `#/` over the start entry) | minor | `web/src/app/router.ts` (`location.home()`), `web/src/app/back.ts` |
| Back from Settings (a tab) | returns to the previous screen | tabs replace each other, so back can land on an older screen (e.g. search results) | minor | `ui/shell/AppShell.tsx` (`goTab`) |
| Screen transitions | Activity slide/fade transitions between screens | instant switch | minor | `ui/shell/AppShell.tsx` |
| Toasts | Android toasts (wrap-up, SRS changes, close-enough answers) | none on the screens checked | minor | needs a shared toast component |

## Top differences (for the UI work)

1. Navigation model: toolbar with Search/Home/overflow menu (Java) vs bottom tab bar (TS) — blocker.
2. Search results show "Locked" for unlocked, unstarted items (Java: "Initiate") — blocker.
3. Toolbar (and so the status bar) not in the subject colour in sessions, lessons and item pages; toolbar title not the question type / subject — noticeable (status bar follows automatically now).
4. Dashboard session counts: text + one START button (Java) vs two tiles; missing level line and "Recent unlocks" — noticeable.
5. Dashboard "No reviews scheduled yet." shown while reviews are due — noticeable.
6. Timeline chart: SRS-stage colours, y axis, 4-h labels in Java — noticeable.
7. Subject cards everywhere lack the reading/SRS-stage lines and break long meanings mid-word — noticeable.
8. Session menu has 2 of Java's 9 entries — noticeable.
9. Answer field style (Java centred underline vs TS box) — noticeable.
10. Settings: Java's sub-screen list (incl. Keyboard input settings) vs one long page; list settings as dropdowns — noticeable.
11. Curriculum order and Level test start are dialogs in Java, full screens in TS — noticeable.
12. Summary: button order, green/red blocks — noticeable.
13. Browse level picker and results grid layout (vocabulary rows, 4 columns) — noticeable.
14. About shows version 0.0.1 instead of 0.1.0 — noticeable.
15. Notifications pile up (one per hour) instead of one updated notification — noticeable.
