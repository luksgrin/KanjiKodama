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
level test) and no stored settings other than the update check's bookkeeping and font and text size
(set in the guide itself, so a guide left halfway opens again; `ONBOARDING_IGNORED_PREF_*`). So existing learners
updating the app never see it, nor does a start straight into another screen (a widget or
notification link). Settings → Progress → Getting started guide opens it again.

## Known limits

- Long paragraphs occasionally break a line one word earlier or later than a native Android text view
  would: browsers fill lines greedily and CSS can't select Android's optimal line breaker.
- The PWA has no automatic backup (a web app can't write files without a tap); it shows a "last saved"
  reminder instead.
