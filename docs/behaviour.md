# Deliberate behaviours

Behaviours the owner asked for, with where they live. Tests cover each one (`app/test/session/`,
`app/test/e2e/`).

## Session end

Finish on the summary, or abandoning a session, goes straight to the next screen. In between, the
screen is blank for a moment (themed background, toolbar kept), the same as between the splash screen
and the dashboard at start-up. No "No session to summarize" or "Back to dashboard" stand-in flashes
past. Those empty states and their Dashboard button only appear when a session route is opened with
nothing to show.

Files: `SessionScreen.tsx`, `SummaryScreen.tsx` (`leaving`), `runtime.ts` (the snapshot carries the
state it was taken in and reports the end before the backup and notifications run).

## Don't know / Submit above the keyboard

With the keyboard open, the quiz's button row sits 8 px above it on every phone and keyboard
(`--kk-ime-gap` 4 px plus the row's 4 px padding). With the keyboard closed it sits at the bottom.

Files: `session.css` (`kk-ime-open`, `kk-keyboard-open`), `visibleViewport.ts` (the visual viewport
on iOS Safari and Android Chrome; the window size in the Android app).

## The keyboard stays on the unanswered question

While a question is unanswered, taps and long presses beside the answer field leave the keyboard open:
on the empty space, the banner, the question, the counter and the toolbar title. Buttons, links,
fields, menus and dialogs behave normally. Answered screens, the item info and the lesson presentation
let the keyboard hide.

How (`keyboardKeeper.tsx` `useKeepAnswerFocus`, mounted by `Quiz.tsx` outside Anki mode, off while a
session dialog is open):

1. A press's `mousedown` beside the field is cancelled, so the field keeps the focus.
2. On Android a touch's `pointerdown` beside the field is cancelled too. A long press in Chromium moves
   the focus without any mousedown; cancelling the pointerdown stops that and the click still fires.
3. Nothing on the unanswered question can be selected (`:root.kk-keep-answer` in `session.css`, and
   `selectstart` outside the fields is cancelled). A selection outside the focused field makes the
   WebView hide the keyboard even though the field keeps the focus.
4. Last resorts: a focus lost to nothing during such a press is taken back at once, and a selection
   moved out of the field is put back with the keyboard asked for again.

On Android there is also a native safety net (`nativeKeepKeyboard.ts`, `KkWebView.java`,
`SystemUiPlugin` `setKeepKeyboard` / `reshowKeyboard`). While the question is unanswered, the field has
the focus, no dialog is open and the page is visible, `KkWebView` watches the keyboard through the
window insets. A hide during a touch on the page, or up to 0.8 s after it, is undone at once
(`showSoftInput`, then the page re-focuses the field). The hide itself can't be prevented, so it shows
as a short dip (about 0.1 s) followed by the keyboard sliding back. The re-show is posted after the
insets dispatch: showing from inside it crashes WebView 133.

A hide the user asks for stays: the Back key, the back gesture, or the keyboard's own hide key. The page
then sets `virtualkeyboardpolicy="manual"` on the field until the field itself is tapped.

## No pale buttons while an answer goes in

After Submit or Don't know, the buttons keep their normal look for the brief moment the answer is being
processed. They ignore taps during that time (`Quiz.tsx` `run`, a ref guard) but are not `disabled`.
Next is disabled only by the `next_button_delay` setting.

## Question transitions

Moving to the next question slides the old view out and the new one in, both over 150 ms: the new view
decelerates in from a full screen width while a still copy of the old one accelerates out underneath
(`exitingFragment.ts`, `SessionScreen.tsx`, `base.css`, `session.css`). Answering a question has no
transition.

## What the question asks for

The banner under the question starts with a pixel badge for what to type: 意 meaning, 音 on'yomi,
訓 kun'yomi, 音訓 either (a kanji whose lesson taught both kinds; none in the current content), 読 a
reading (vocabulary). The
banner's colour (light: meaning, dark: reading) and the question view's colour (blue radical, pink
kanji, purple vocabulary: the subject type) are unchanged. The badge is drawn in the banner's text
colour, so it works in every theme and doesn't rely on colour.

A kanji reading question asks for the reading its lesson taught (`accepted_answer`). Another real
reading of the same kanji is not wrong: the answer field shakes and you try again. The shake now
comes with a hint over the question that says what the answer was and what is wanted, for example
"That's a kun'yomi (訓). We're looking for the on'yomi (音)." The same goes for a reading typed into a
meaning question ("That's a reading. We're looking for the meaning (意).") and, for single-kanji
vocabulary with "Soft-reject on single-kanji vocabulary", the kanji's reading.

"Show which kind of kanji reading is asked for" (Lesson/review settings, on by default, and switched on
once for everyone on the first start after it moved there) shows 音 / 訓
on kanji reading questions and names the kind in the title ("Kanji On'yomi"). Off, they show 読
"Kanji Reading". The retry hint always names the kind: the shake already tells you the answer was
another reading. The badge is the same in lessons, reviews, self-study and Anki mode (the banner is
shared).

Files: `core/answer/questionKind.ts` (the kind and the hint; `checkAnswer`'s verdicts are unchanged),
`components/session/ReadingKindBadge.tsx`, `QuestionView.tsx`, `runtime.ts` (`retryToast`).

## Keyboard diagnostics (hidden)

For tracking down a keyboard that hides on a particular phone:

1. Settings → About: tap the app version (Version → App) seven times within 3 seconds. A toast says
   "Keyboard diagnostics on".
2. Do whatever makes the keyboard hide. The last six log lines show over the top of every screen
   (they don't take touches).
3. Back in About, the full log is at the bottom with Copy, Share, Clear and Turn off. Seven more taps on
   the version also turn it off.

The log records focus and blur, selection, presses and clicks, the visible screen height (which tracks
the keyboard), routes, the keep-keyboard mode and, from `KkWebView`, keyboard shown / hidden with its
likely causes, touches, Back keys, view focus, input connections and re-shows, with millisecond
timestamps. Elements are named by tag, class and test id only and query strings are dropped from
routes: it contains no answers and no token. Files: `ui/shell/keyboardDiagnostics.ts`,
`KeyboardDiagnosticsOverlay.tsx`, `screens/about/KeyboardDiagnostics.tsx`.

## Getting-started guide

A first start at the dashboard opens the guide (`/welcome`, `ui/screens/onboarding/`, rules in
`core/onboarding/`) instead, before the dashboard paints. Six steps: what the app does (with the SRS
stage tiles), font and text size, how the quizzes work (colours are item types; meaning and reading
questions; the reading taught in the lesson, other real readings shake), WaniKani or JLPT order, where
to start (from the beginning; in JLPT order also the level test and fast travel, in WaniKani order
the WaniKani import), and the last tips. Every choice starts on the default, so Next alone skips a step;
"Skip guide" ends it at any step. Choices take effect when you tap Next: the curriculum switch
(without its confirmation while nothing is learned yet), fast travel and the import as their usual
dialogs, the level test on its own screen.

It opens only in local mode, until `onboarding_done` is set, for a learner with no progress (no item
started, passed or burned, no notes or synonyms, level 1, WaniKani order, no fast travel, probation or
level test) and no stored settings other than the update check's bookkeeping, what the one-time
setting changes write, and font and text size (set in the guide itself, so a guide left halfway opens again; `ONBOARDING_IGNORED_PREF_*`). So existing learners
updating the app never see it, nor does a start straight into another screen (a widget or
notification link). Settings → Progress → Getting started guide opens it again.

## Study garden and streaks

Every finished lesson, review and self-study item counts towards its **study day**:
- A study day is the device's local date, but it starts at Dashboard settings → "A new study day starts at" (`study_day_start_hour`, default 4 AM), so a late-night session counts for the evening it began.
- With delayed reporting, the moment of the answer decides the day, not the moment of the report.

The log holds counts only: lessons, reviews (right / wrong) and self-study, per day. Nothing about the subjects goes in.

**Where it lives:**
- Dexie table `activity`, schema v4.
- Recorded in `app.sessionHooks` (`src/app/appController.ts`) and saved with the write.
- Logic in `core/stats/`.

**Display:**
- The dashboard panel (Dashboard settings → "Show study garden", on) shows the streak and the last seven days as pixel plants, which grow with the day's total: soil, sprout (1+), sapling (20+), tree (60+), blossoming tree (150+).
- A tap opens the Garden screen (`/stats`): a month or year calendar, the current and best streak, the totals of the period and of all time, and a legend. Weeks start on Sunday, or on Monday with Dashboard settings → "Study garden weeks start on" (`garden_week_start`).
- The streak counts days in a row with study up to today. When nothing is done yet today, it counts up to yesterday ("study today to keep it").

**Progress file:** the log goes in as an optional `activity` list after `jumps`, only when there is a study day, so a file without study history is unchanged.

**Local only:**
- Never uploaded in server mode, and never imported from WaniKani. A reset keeps it, like the fast-travel jumps.
- A restore merges the file's log into the device's (each count the larger of the two), so restoring an older file never erases study days, and restoring the same file twice counts nothing twice.
## Writing practice

Self-study → Writing practice (kanji, radicals or both; learned ones, shuffled, or one level in lesson
order, radicals first; 5–50 of them), or Practise writing on a kanji's or radical's page. Image-only
radicals (no characters, no KanjiVG strokes) are never offered and are skipped if named in the
address. Each item is written stroke by stroke in a square over
KanjiVG's 109×109 box; finger, stylus and mouse all draw (pointer events, the page never scrolls
while drawing). Nothing here touches SRS, the progress file or sync.

- **Trace** (study): the kanji is faint in the square and the next stroke draws itself with a dot
  where it starts. **From memory** (recall): the meaning and reading, an empty square; a missed stroke
  (or Hint) shows the next stroke until it is written. The kanji appears once it is complete.
- Each stroke is checked as it is lifted: both strokes are resampled to 32 evenly spaced points and
  compared by position (mean distance ≤ 14 box units), shape (scaled to the same size), direction
  (start → end) and length. An accepted stroke snaps to the clean KanjiVG stroke. A missed one flashes
  red with the reason: backwards, a later stroke (wrong order; also when a later stroke fits clearly
  better than the expected one, for dense kanji), the right shape in the wrong place, too short, or
  another shape. Dots (、) are checked by position only. Writing from memory, the first stroke gets
  1.5× the position room, as nothing on the page lines it up.
- After three misses on one stroke it is filled in, so nobody gets stuck.
- The summary marks each kanji clean or with its misses and hints, with Practise the missed ones,
  Again and Done.
- The prompt is above the square and the buttons under it, on the writing hand's side: the right, or
  the left with Left-handed writing practice (Subject Info settings). On wide screens the prompt and
  buttons sit beside the square, on that side.

**Writing progress**, separate from the review SRS: each practised kanji or radical has a record
(attempts, clean writes, level 0–5, last practised, next due) in the Dexie `writing` table (schema v5).
- Writing from memory: a clean write moves the level up one (at most 5); a write with misses moves it
  down one; with a hint or a stroke filled in, down two (at least 0). A first recall starts from 0.
  Tracing counts as practice (attempts, clean, last practised) but never moves the level.
- Next due = the write's time + the interval of the new level: 4 hours, 1 day, 3 days, 1 week, 2 weeks,
  30 days (levels 0–5). Plain milliseconds, so time zones and daylight saving never shift it.
- The Self-study panel offers Due for writing (most overdue first) and Weakest first (lowest level,
  then lowest share of clean writes, then practised longest ago). The summary shows each item's level
  change ("new → level 1", "level 2 → 3"); a kanji's or radical's page shows
  "✍ Writing: level 3 · 8 clean of 10 · due in 2 days" once it has been practised.
- The progress file carries the records as an optional `writing` array after the other fields, only
  when there are any, so files without writing practice (and the golden outputs) are unchanged.
  Restoring merges them by subject: the record practised later wins; a file without them leaves them
  alone. Never synced to WaniKani or OpenKani and not touched by imports; Reset database clears them.
  Files: `core/writing/record.ts`, `progress/writingStore.ts`.

The tolerances were tuned on simulated careful handwriting over the whole KanjiVG set: practically
every stroke is accepted and under 1 % of other strokes pass for the expected one
(`core/writing/writing.test.ts` keeps that true). Files: `core/writing/` (matcher, round, selection),
`ui/components/writing/WritingPad.tsx`, `ui/screens/writing/`.

## Search by parts

Browse → "Search by parts" opens a radical picker: RADKFILE's ~240 parts, grouped by stroke count
(each group starts with its number). Picking parts keeps the kanji containing all of them; parts
that no longer occur in any of those kanji are greyed out and can't be tapped. The bar under the
toolbar stays in view while scrolling: the picked parts (tap one to drop it), the number of kanji
found (tap to jump to them) and Clear. The kanji appear below the parts as result cards in the
current curriculum's order (at most 120: pick more parts to see the rest), and open their kanji page.
Only kanji the curriculum shows count, the JLPT extras included when it shows them. The selection
is in the URL (`#/browse/parts?p=…`), so going back from a kanji page keeps it.

Some parts have no character of their own in RADKFILE, which writes them with a stand-in kanji
(化 for 亻, 込 for 辶, …); the picker shows the real part (`export_radicals.py`, `DISPLAY`).

Files: `core/search/parts.ts`, `screens/browse/PartsSearchScreen.tsx`, `content/inputs/radicals.tsv`
(`kanjikodama-content export-radicals`), the content file's `radical` table.

## Known limits

- Long paragraphs occasionally break a line one word earlier or later than a native Android text view
  would: browsers fill lines greedily and CSS can't select Android's optimal line breaker.
- The PWA has no automatic backup (a web app can't write files without a tap); it shows a "last saved"
  reminder instead.
