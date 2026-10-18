# Golden test fixtures

These files freeze the behavior of the Java app (`durtles/`) as input/output cases. The TypeScript
port must reproduce every case exactly: a TS test loads a fixture, feeds each case's `input` to the
ported function and compares the result with `output`. When a case fails, the port is wrong (or the
Java code has a bug that the port intentionally keeps; see "When to regenerate").

The repository is private, so all fixtures are committed here, including those that contain real
WaniKani text (`curriculum/jlpt-plan-content.json`, the per-subject answer checks, the romanized
readings). The content database they were built from, `durtles/app/src/main/assets/wk-content.db`,
stays git-ignored; `manifest.json` records its sha256.

## File format

Every fixture is UTF-8 with LF line endings and a trailing newline. Regenerating from the same Java
code gives byte-identical files (the manifest's sha256 values then do not change).

`.json`, one document, one compact case per line:

```json
{
  "area": "srs.newStage",
  "javaSource": "model/SrsSystem.Stage.getNewStage",
  "cases": [
    {"name":"system1-stage1-incorrect0","input":{...},"output":{...}},
    ...
  ]
}
```

`.jsonl` (JSON Lines, for large files): line 1 is the header `{"area":...,"javaSource":...}`,
every further line is one case `{"name":...,"input":...,"output":...}`.

- `name` is unique within a file; use it as the TS test name.
- `input` and `output` are plain JSON. Object keys are in the order the generator wrote them.
- Java `long`s are written as JSON numbers. All ids and timestamps in these files are below 2^53,
  so they are safe as JS numbers.
- Java `double`s are written with Java's `Double.toString` (e.g. `0.6`, `1.0`, `1.0E-4`); compare
  them as numbers, not as text.
- A case whose Java call throws records the exception in `output` as described by that file's
  generator (for example `{"ok":false,"error":"org.json.JSONException","message":...}`).

Scenario files (`scenarios/<name>.json`, Tier B) use the same document format with
`"area": "scenario"`: case `00-start` holds the starting state
`{mode, seed, clockStartMs, startFile}` (`startFile` is the literal progress file that was
restored), then one case per step `NN-<action>` with `input: {action, args, atMs, resolved}` and
`output: {clockMs, result, level, curriculum: {mode, maxLevel, levelDescription},
counts: {lessons, reviews, reviewsNext24h}, fastTravel: {level, blocked, options}, levelTest,
reminders: {syncReminder}, export}`. When an action throws from app code, `result` is
`{"error": <class>, "message"}` and the snapshot is still taken.
`resolved` holds the concrete ids each step used (lessons, reviews `[id, meaningIncorrect,
readingIncorrect]`, grind rounds, level-test picks and answers, imported or restored files), so a
consumer can replay a scenario without the generator or Java's RNG. The subjects in `export` are in
SQLite rowid order: compare them ignoring order. The scenario DSL is documented in the
`ScenarioRunner` javadoc; the scenario definitions are in
`durtles/app/src/androidTest/assets/golden-scenarios/`, written by `durtles/golden/make_scenarios.py`
(edit the script, not the JSON; it rewrites every definition).

`manifest.json` lists every fixture with its area, case count, size and sha256, plus the durtles
commit (`durtlesCommit`, and `durtlesDirty` if `durtles/` had uncommitted changes), the generator
version, the generation time and the sha256 of the content DB.

## Files

| File | Java source | Tier |
|---|---|---|
| `srs/systems.json` | `LiveSrsSystems` fallback systems, `SrsSystem.finish` (stage names, flags) | A |
| `srs/new-stage.json` | `SrsSystem.Stage.getNewStage`: 2 systems × 11 stages (incl. Locked, Initiate, Burned) × 0–8 incorrect | A |
| `srs/outcome.json` | `ReportSessionItemJob.runLocal` lesson/review outcome | B |
| `curriculum/placement.json` | `Placement.of` | A |
| `curriculum/jlpt-plan-synthetic.json` | `JlptPlan.build` on the cases of `JlptPlanTest` plus edge and seeded random cases | A |
| `curriculum/jlpt-plan-content.json` | `JlptPlan.build` on the real content (every subject's placement, `blockOfLevel`) | A, needs content DB |
| `levelTest/estimators.json` | `LevelTest.boundaryBlock`, `sampledLevels`, `share`, `Result.minutesPerDay` | A |
| `progress/describe.json` | `ProgressStore.describe` (Android's `org.json`), including the owner's phone export | B |
| `progress/android-export.json` | the owner's real phone export (2026-10-18; JLPT, level 6, 1,034 subjects): an input, not an output | input |
| `progress/android-roundtrip.json` | `ProgressStore.restore` then `export` of `android-export.json`, twice | B |
| `scenarios/real-progress.json` | `android-export.json` restored, then the dashboard (`LiveTimeLine`, `LiveLevelProgress`, `LiveSrsBreakDown`) over a week and a review session | B |
| `answers/osa.json` | `OptimalStringAlignmentDistance` | A |
| `answers/fuzzy.json`, `answers/fuzzy-wk-N.jsonl` | `FuzzyMatching.matches`: synthetic; every WK meaning/auxiliary meaning with a 1- and 2-edit typo | A, WK part needs content DB |
| `answers/check-subjects.jsonl` | every subject row as `checkAnswer` sees it, plus `getPossibleQuestionTypes(false/true)` | A, needs content DB |
| `answers/check-synthetic.json` | `QuestionType.checkAnswer` on inline synthetic subjects × all 8 question types | A |
| `answers/check-<type>[-N].jsonl` | `QuestionType.checkAnswer` per question type on every subject | A, needs content DB |
| `answers/check-ties.jsonl`, `answers/check-ties-cases.json` | the tied candidates behind `matchedAnswer` for meaning cases (`AnswerTies`) | A |
| `answers/submit-precheck.json`, `answers/submit-precheck-content-N.jsonl` | `Session.submitHelper` → `SubmitPrecheck.check` (empty, trailing n → ん, kana-only, expected-kana regex), then trim and `checkAnswer` | A, content part needs content DB |
| `answers/submit-alternatives.json`, `answers/submit-alternatives-content-N.jsonl` | `Session.submitHelper` after the verdict → `SubmitFeedback` (alternatives list, "lower-case, drop leading the, drop matched and duplicates"), the `FloatingUiState` fields submit sets, and the alternatives-toast, close-enough and digraph texts | A, content part needs content DB |
| `answers/synonyms.json` | user meaning synonyms: column parsing, checks per action, save-job and API parsing | A, needs content DB |
| `answers/synonyms-storage.json` | synonyms and notes through Room: save, import, restore, export, check | B |
| `answers/matching-kanji.json` | `MatchingKanji.lookupCharacters` (extracted from `UnansweredSessionFragment`): which subjects get a matching kanji, per object type, characters and setting | A |
| `answers/matching-kanji-device.json` | `GlobalSettings.AdvancedOther.getShakeOnMatchingKanji` for every `enable_advanced` × `shake_on_matching_kanji` value; for every subject that qualifies, the kanji `SubjectDao.getKanjiByCharacters` returns | B |
| `answers/synonyms-ui.json` | `StudyMaterialsSupport` (extracted from `SubjectInfoView.addSynonym` and `StudyMaterialsActivity`): add-synonym input, list and job data; the 10-row form and its save | A |
| `answers/synonyms-ui-device.json` | `getMeaningSynonymsRichText` and the note rich texts (`HtmlCompat`); the real `StudyMaterialsActivity`: form shown, edits, arrows, save | B |
| `answers/synonyms-dialog-device.json` | the real "Add synonym" dialog (`SubjectInfoView`, on the subject info screen): typed, pasted and IME input, Save, Cancel, Back, Enter keys and editor actions; stored list, save job, what the screen shows | B |
| `search/ranking.json` | `SearchUtil` term splitting, `getRanking`, `getSearchRanking` on inline subjects | A |
| `search/content.jsonl` | `SearchUtil.searchSubjects(1, q)` (results screen, with its type order) and `searchSubjectSuggestions` over the real content, with and without notes/synonyms | B |
| `search/level.json` | Browse's level buttons: `SearchUtil.searchSubjects(0, level)` for levels 1-60 and odd inputs, with and without hidden subjects; the results screen's list (`SearchResultAdapter.setResult`, type order) | B |
| `search/advanced.jsonl` | `SearchUtil.searchSubjects(2, json)` (advanced search and presets) from a progress file, with star ratings and hidden subjects: every filter, sort order, odd preset JSON; the results screen's headers and order | B |
| `search/advanced-form.json` | the real advanced search form (`AdvancedSearchFormView`): visible switches, typed text, switches and sort order to parameters, and parameters injected back (Refine) | B |
| `answers/unicode-android.json`, `answers/unicode-android-table.json` | `FuzzyMatching.cleanString`/`matches` and `Character.getType`/lower-casing on the device (Android 16, ICU 76.1, Unicode 16.0) | B |
| `answers/unicode-android-overrides.json` | device outputs of `fuzzy*`/`check-*` cases that differ from the JVM fixtures (currently none) | B |
| `kana/table.json`, `kana/edge.json`, `kana/convert.json` | `PseudoIme.simulateInput`, `toKatakana`, `KanaUtil` | A |
| `kana/readings.jsonl` | every distinct reading, romanized, through `PseudoIme` | A, needs content DB |
| `kana/fixup-sequences.json` | `PseudoIme.fixup`, keystroke by keystroke, on `DummyEditable` | A |
| `kana/fixup-edittext.json` | `PseudoIme.fixup` from the answer field's TextWatcher on a real EditText | B |
| `kana/fixup-keys.json` | the answer field fed by hardware key events and the real clipboard (paste, cut, undo), and which Enter keys submit | B |
| `kana/keys-session.json` | hardware keys and IME editor actions on the real answer field of a running session (`SessionActivity`): submit, retry, the answered state, focus moving to the buttons | B |
| `server/normalize.json` | `ServerMode.normalize`, `label` | A |
| `anki/mode-settings.json` | `GlobalSettings.getAnkiMode(sessionType, questionType)` (which screen a question gets) for every combination of `enable_advanced` and the six `anki_mode_*_{meaning,reading}` preferences | B |
| `anki/answer-text.jsonl` | the answer Anki mode reveals (`Question.getAnkiAnswerRichText`) for every visible subject and question type, with its intended bold ranges, with and without on'yomi in katakana; the "My synonyms" line | B |
| `anki/answer-inflection.json` | the revealed answer and question characters with randomized inflections, for every form `InflectionUtil` can pick | B |
| `scenarios/session-lesson-back-*.json`, `scenarios/session-lesson-wrong-answers.json`, `scenarios/session-matching-kanji.json` | the lesson quiz: presentation next/previous, Back to lesson presentation (also with an answer on screen and around restarts), wrong, Don't know and retry answers in a lesson, the single-kanji matching kanji retry in a session | B |
| `scenarios/anki-*.json` | Anki mode sessions: self-graded answers in reviews, lesson quiz and self-study, meaning-only Anki, Advanced off, the Test mode quirk | B |
| `scenarios/*.json` | progression, curriculum switch, fast travel (also near the last level), level test rounds, import, restore, unknown and hidden subjects, hidden components, per-answer time, sync reminder, sessions (`session-*`: undo, ignore, wrap-up, abandon, restart, self-study, the level test's session; session configuration: `session-order-*`, `session-size-review`, `session-sequence-*`, `session-lightning-mode`) | B |

Sharded files are always numbered (`-1`, `-2`, …) and hold at most 25,000 cases; a TS test reads
all shards of a group.

Notes per area:

- Answer verdicts are `{ok, retry, nearMatch, givenAnswer, matchedAnswer, digraph}` with
  `digraph` `null` or `[regularKana, smallKana]`.
- Exceptions: in `kana/*` and `server/*` the output is `{"value": x}` or
  `{"error": SimpleClassName, "message": ...}`; in `answers/check-*` a variant's verdict is replaced
  by `{"error": SimpleClassName}` (e.g. `checkAnswer` on `""` throws
  `StringIndexOutOfBoundsException` from `PseudoIme.simulateInput`; the app never gets there because
  `Session.submit` rejects empty answers).
- `answers/fuzzy*`: one case per answer, output keyed by every `CloseEnoughAction` name;
  `accepted`/`rejected` are ordered lists (the order decides `matchedAnswer` on ties).
  `FuzzyMatching.cleanString` uses `Character.getType`. These fixtures come from JDK 21 (Unicode
  15.0), but every case was re-run on the device with identical results
  (`answers/unicode-android-overrides.json` is empty). JDK and Android differ only on characters
  that occur in no case here; for those the port follows `answers/unicode-android*.json` (see below).
- `answers/check-*`: input `{subject, questionType, answer, matchingKanji, meaningSynonyms}`, where
  `subject` is an id (look it up in `check-subjects.jsonl`) or an inline object (synthetic), and
  `matchingKanji` is `null`, an id or an object. Meaning types are keyed by `CloseEnoughAction`
  (with `requireOnInKatakana=false`; meaning types ignore it); reading types are keyed
  `"requireOnInKatakana=false"` / `"requireOnInKatakana=true"` (with `SILENTLY_ACCEPT`; reading
  types ignore the action). The answer is exactly what `checkAnswer` receives; what
  `Session.submit` does before is in `answers/submit-precheck*`. Case names carry a kind label
  (`correct`, `typo1`, `rejected`, `reading-romaji`, `accepted-onyomi-katakana`, `…-digraph`,
  `kanji-<type>`, `synonym`, …). Synonyms here are synthetic (the content DB has none); see
  `answers/synonyms*` for user synonyms.
- `answers/check-ties*`: meaning types collect accepted answers in a Java `HashSet`, so when several
  reach the same fuzzy score, `matchedAnswer` follows hash order. `check-ties.jsonl` lists every
  `check-<meaning type>` case with a tie under the same case name: output `{score, ties,
  subjectOrderFirst, javaPick}`, `ties` in subject order (meanings, whitelisted auxiliary meanings,
  synonyms, exact duplicates removed). For those cases assert `matchedAnswer ∈ ties` (the port may
  use `subjectOrderFirst`) and every other verdict field exactly; elsewhere assert `matchedAnswer`
  exactly. Ties only change the close-enough toast text and which meanings the alternatives toast
  lists, never ok/retry/nearMatch or SRS.
- `answers/submit-precheck*`: input `{subject, questionType, answer, matchingKanji}` with `answer`
  the raw field text; output `{answer, trailingNFixed, rejectedBy, checkedAnswer, verdicts}`.
  `rejectedBy` is `empty`, `non-kana`, `missing-kana`, `blank` or `null`. Only a lower-case final
  `n` is fixed, and only for kana types; whitespace makes a kana answer non-kana; the subject's
  characters go into the regex unescaped (`.` matches anything); ・, ー and ゠ count as kana. The
  content files record only the app defaults (`SILENTLY_ACCEPT`, `requireOnInKatakana=false`) and
  leave out kanji on'yomi/kun'yomi. What submit does after the verdict is in
  `answers/submit-alternatives*`.
- `answers/submit-alternatives*`: input `{subject, questionType, answer, matchingKanji,
  meaningSynonyms, closeEnoughAction, requireOnInKatakana}`, `answer` the raw field text (run
  through the pre-checks and `checkAnswer` as in `submit-precheck*`). Output `{verdict,
  sessionAnswer, candidates, alternatives, sets, ui, ties}` (only `{verdict: {error}}` when
  `checkAnswer` throws). `sessionAnswer` is the answer after the n fix, untrimmed: that is what the
  filter compares. `candidates` (only for ok verdicts; `null` otherwise or when not applicable) are
  all meanings, accepted or not, when there are more than one (synonyms and auxiliary meanings never
  appear), for any reading type all accepted readings when there are more than one (so an on'yomi
  question lists kun'yomi too). `alternatives` keeps a candidate unless, lower-cased (Java
  `toLowerCase()`, non-Turkish default locale) and with one leading `"the "` removed, it equals the
  same transform of `sessionAnswer` or of `matchedAnswer`, or of an earlier kept candidate; kept
  entries keep their case and "The". `sets` lists only the `FloatingUiState` fields submit assigns
  (`lastVerdict`, `alternativesForLastCorrectAnswer` = the list joined with `", "` or `null`,
  `showAlternativesToast`, `showCloseToast`); a retry assigns nothing, an incorrect answer leaves
  the alternatives fields as they were, and with no candidates `showAlternativesToast` is not
  assigned. `ui` is what the screen shows next, starting from cleared flags with the alternatives
  toast setting on (`alternativesToast` = `"Alt: " + joined` when non-empty), `closeEnough` when the
  verdict is a near match and the action shows a toast (toast in lightning mode, message otherwise;
  same text), `digraph` for an incorrect verdict with a digraph match. A null meaning or reading
  throws `NullPointerException` (in `checkAnswer`, or in the filter: `alternatives` is then
  `{error}`). `ties` is the `check-ties` record plus `byPick: {candidate: {alternatives,
  alternativesToast, closeEnough}}` for every tied pick: for those cases accept the port's pick if
  its result matches that pick's entry. The content files hold every subject with more than one
  meaning (each meaning, without a leading "The", each whitelisted auxiliary meaning, one 1-edit
  typo of the primary meaning under `ACCEPT_WITH_TOAST`) or more than one accepted reading (each
  reading and its katakana), plus a digraph slip (first small ゃゅょ written large) of every
  accepted reading for the reading and vocabulary reading types.
- `answers/synonyms*`: the `meaningSynonyms` column is Jackson JSON array text (no separator; an
  empty list is stored as `[]`). `Subject.getMeaningSynonyms` drops null and blank entries and
  `SaveStudyMaterialJob` drops whitespace-only ones (fixed 2026-10-17, see below). Jackson is
  lenient where `JSON.parse` is not: trailing text after the array is ignored and scalars become
  strings; a BOM or trailing comma gives an empty list. Restoring a non-text value stores it as
  text. Clearing via the UI stores `[]` and `""`, and the subject is still exported.
- `answers/synonyms-ui*`: the "Add synonym" dialog trims with `String.trim` (only chars <= U+0020),
  skips a blank value (`StudyMaterialsSupport.isBlank`: whitespace and space characters, NBSP and
  U+3000 included), and appends unless the list already contains the value exactly
  (case-sensitive); it does not truncate. The notes form shows only the first 10 synonyms; saving it
  keeps the rest unchanged after the 10 rows (fixed 2026-10-17; some case names such as
  `unchanged-twelve-drops-two` predate the fix). Rows and notes are saved untrimmed (blank rows are
  dropped by the job). The note
  fields turn NULL into `""` and cut text to 500 UTF-16 units (499 if that would split a surrogate
  pair), also for notes that came from the API. Synonym rows keep newlines. In the rich texts,
  `escapeHtml` escapes only `&`, `<`, `>`; HTML then collapses runs of spaces and newlines in synonyms
  to one space (tabs stay); notes turn `\n` into a line break. Spans are `[type, start, end]`.
- `answers/synonyms-dialog-device.json` (`SynonymDialogGoldenTest`): the real dialog, opened from
  the subject info screen (`BrowseActivity` with `id`). The answered-question screen uses the same
  `SubjectInfoView` code. Ops DSL in the class javadoc; each step records `dialogShowing`, `field`
  and `shown` (the "My synonyms:" line); then `saved` (the save job ran), `stored`,
  `storedSynonyms`, `shownReopened`. The field is a single-line `EditText` (input type `TEXT`,
  1; ime options `DONE`) with an input filter that turns line breaks into a space. Findings:
  - Save takes `StudyMaterialsSupport.synonymInput` of the text: `String.trim()` plus NBSP,
    U+3000 and the other chars `isBlank` counts, at both ends (`save-nbsp-padded`,
    `save-ideographic-padded`); runs of line breaks inside become one space. An empty or blank
    value does nothing and runs no job. Inner spaces are stored as typed, and the line shows them
    collapsed. There is no length limit.
  - A value already in the list (exact, case-sensitive, after trim) does nothing: no job runs
    (`saved` false). `Papa` next to `papa` is added. Blank entries already in the column are
    dropped on the next save.
  - Enter (no modifiers) closes the dialog and saves, like Save. A second Enter does nothing.
    The listener accepts numpad Enter too, but this dialog runs with the emulator's Gboard bound,
    which passes numpad Enter on only for an empty field (`hardware-numpad-enter-empty`); after
    typing, Gboard commits it, like Shift+Enter, as a `\n`. Every IME editor action (DONE, GO,
    UNSPECIFIED) closes and saves: the listener accepts only DONE, but TextView's Enter fallback
    (see `keys-session.json`) reaches it as an Enter key. A newline that arrives as text
    (Shift+Enter or numpad Enter through Gboard, an IME `commitText("\n")`, a paste) becomes a
    space: `line\nbreak` is stored as `line break`, a trailing one is trimmed.
  - Cancel and Back close without saving. The screen shows the new line at once; reopening shows
    the stored list.
- `search/*`: matching is SQL `LIKE '%term%'` per term (AND) on the subject's `searchTarget`
  column (from the content DB: characters, slug, meanings, readings; extras: characters twice,
  meanings, readings), never on notes or synonyms, with `hiddenAt = 0`. LIKE is case-insensitive
  for ASCII only; `%`, `_` and `\` in the query match literally (`splitTermsForSql` escapes them and
  the queries declare `ESCAPE '\'`; fixed 2026-10-17, before that `%` matched every subject). No
  romaji-to-kana conversion. The ranking (all fields, notes
  and synonyms included) only orders the results: descending, ties in ascending id (SQL scan order).
  The results screen then re-sorts stably by type (`display`). Suggestions need `query.trim()` of
  at least 3 chars; they first query `smallSearchTarget` (characters) with `LIMIT 250` and, if that
  gives fewer than 250, query `searchTarget` with `LIMIT 250` instead; the limit cuts in scan order
  before ranking. `content.jsonl` holds the WaniKani content plus the extra kanji and words
  (ids >= 100000) as the device has them.
- `search/level.json`, `search/advanced*`: the level search is `Integer.parseInt(level)` (so `+1`,
  `01` and full-width `１` work; `""`, ` 1`, `1.0` throw and the screen shows nothing), then
  `level = n AND hiddenAt = 0` ordered by level, lessonPosition, id (no `object IS NOT NULL`, no row
  has a NULL object). Browse offers levels 1 to the highest subject level (61 holds the extra kanji
  and words). The advanced search parses the JSON with Jackson (`FAIL_ON_UNKNOWN_PROPERTIES` off:
  numbers as strings and floats are coerced, floats truncated; enum names must match exactly;
  an explicit `null` for `sortOrder` or a collection keeps the default, i.e. no filter and the
  type order; a JSON whole number outside the int range in any number field or int collection is
  clamped to `Integer.MIN_VALUE`/`MAX_VALUE` like the form (`raw/huge*`, `raw/int*`), but the same
  number as a string (`raw/hugeAsString`) or a float out of range (`raw/hugeAsFloat`, `1e20`) still
  fails; a single string for an array, a bad enum or such a failure fails the parse, and the search
  returns nothing). Filters are ANDed:
  levels and frequency inclusive, `leechesOnly` = `srsStage` strictly between initial and burned and
  `leechScore > 1000`; upcoming review needs `availableAt != 0` and compares `availableAt <= now +
  h` / `>= now + h`; burned needs `burnedAt != 0` and `burnedAt >= now - d` (less than) / `<= now - d`
  (more than); incorrect is `lastIncorrectAnswer != 0 AND >= now - h`. Star ratings (stored in
  `typeCode`, 0 = unrated) filter only when the setting is on. Stage tags turn into `(srsSystemId,
  srsStage)` pairs ORed, except `locked` = `unlockedAt = 0` and `initial` = `srsStage = 0 AND
  unlockedAt != 0`; a tag no SRS system has adds nothing, and a selection of only unknown tags
  matches nothing. Type, JLPT and Jōyō are `IN` lists. Results are ordered by level,
  lessonPosition, id; the screen re-sorts stably by the sort order (next review clamps overdue
  times to the search time, so overdue items share one header) and groups consecutive equal items
  under headers (`view`: `Class:tag` strings and ids, in screen order). Sets in the serialized JSON (`srsStages` especially) are Java
  `HashSet`s, so compare them as sets. The form reads its number fields with `Integer.parseInt`
  (digits only on the keyboard); a whole number outside the int range is clamped to
  `Integer.MIN_VALUE`/`MAX_VALUE`, and other text that does not parse (`1.5`, `abc`, ` 5`) is
  silently dropped. Injecting parameters (Refine) keeps the values the form has no switch for
  (`prepass:5`, JLPT 6, Jōyō 8, star 7) and adds them back on extract, so a Refine round trip
  doesn't change the search; the next inject replaces them (`reinject/00`). Test seams: `SearchUtil`'s time filters and `SearchResultAdapter`'s search time read
  `Clock`.
- Locked subjects: in local mode they keep `srsStage = 0` (`ProgressStore` resets every subject to
  0); only the WaniKani sync writes `-999`, exactly when `unlockedAt = 0`. So the stage filters and
  the "SRS Stage" sort go by `unlockedAt` (`Subject.isLocked`): a locked subject sorts and groups
  under the Locked stage whatever its `srsStage`. The `progress-synced` group re-runs the stage
  cases with `-999` on the locked rows (as server mode stores them) and gets the same results as
  `progress`.
- `AdvancedSearchGoldenTest` runs the real `LoadReferenceDataTask` in its setup: the JLPT, Jōyō and
  frequency columns come from that background task, which may not have run yet on a fresh install
  (the JLPT, Jōyō and frequency cases then found nothing or everything). The output is identical on
  a fresh emulator and on one with an existing database.
- `answers/unicode-android*`: made on the device. The port takes general categories for
  `cleanString` from `unicode-android-table.json` (Unicode 16), uses the device's lower-casing for
  the 27 newer case pairs, and copies Android's final sigma: Σ is final from the UTF-16 units right
  next to it, unless the string has a supplementary character or U+0130 (`context-*` cases; the
  rule is inferred from results).
- `kana/fixup-sequences.json`: edits are `{insert, at}` (`at` −1 = end) or `{backspace}`; after
  each edit `fixup(s, at, at + len)` runs once on PseudoIme's own `DummyEditable`. A key inserts a
  whole character (emoji are not split).
- `kana/fixup-edittext.json`: the same 200 sequences plus targeted and random edits on a real
  EditText with a copy of `UnansweredSessionFragment`'s TextWatcher (keep it in sync). The watcher
  fires again for every replacement `fixup` makes, so each `replace(st, en, text)` inside `fixup`
  runs a nested `fixup(s, st, st + text.length)` before the outer loop continues with its old
  indices. The visible effect: an unconverted `n` right before replaced text becomes `ん`
  (`n`, `n` at 0, `k` → `んんk`), which only happens after edits in the middle. The port must model
  the nested call. Each step records `value`, `selStart`, `selEnd`, `fixupCalls`, `maxDepth`.
- `kana/fixup-keys.json` (`FixupKeysGoldenTest`): the same watcher plus a copy of
  `handleEditorAction` on a real, focused EditText, driven by `KeyEvent`s from the virtual full
  keyboard (`QwertyKeyListener`; capitals are shift down, letter, shift up) and by
  `ClipboardManager` + `onTextContextMenuItem` (paste, paste as plain text, cut, copy, select all,
  undo, redo) and ctrl+V/X/C/A/Z. Input `ops` (DSL in the class javadoc); each step records
  `value`, `selStart`, `selEnd`, `fixupCalls`, `maxDepth`, plus `actions` (editor-action listener
  calls), `submits` (field text handed to submit), `handled`, `clip`. `inputConnection` replays the
  same ops as soft-keyboard calls; `firstDiffFromInputConnection` marks where they part. Findings:
  typing, DEL, FORWARD_DEL, cursor keys and plain-text paste give exactly the InputConnection
  results (and the `keys-*`/`paste-*` cases equal those of `fixup-edittext.json`). Two differences:
  DEL removes a whole surrogate pair where `deleteSurroundingText(1, 0)` leaves a lone surrogate
  (`del-emoji`), and a styled paste (`clip-html-*`, `paste`, not `pasteAsPlainText`) inserts the
  clip's HTML text, not its plain text. A paste of several clip items joins them with `\n`;
  whitespace (newline, tab, space) is removed by `fixup` as usual. The field also has the
  fragment's `OnKeyListener` (`swallowFocusKey`), so Tab and every Enter or numpad Enter release
  are consumed before TextView sees them (`handled` true, and the editor action listener records
  no `up` calls). Submit: `KEYCODE_ENTER` or `KEYCODE_NUMPAD_ENTER` down without modifiers submits
  (once per down, so auto-repeat submits again); shift/ctrl/alt+Enter and `DPAD_CENTER` never
  submit (shift+Enter inserts a `\n` that `fixup` removes); an IME's `performEditorAction` submits for
  any action id but 0 (`IME_ACTION_UNSPECIFIED`); the field's EditorInfo action is
  `IME_ACTION_DONE`. Not covered here: the real fragment (see `kana/keys-session.json`), non-QWERTY
  or kana hardware layouts.
- `kana/keys-session.json` (`KeysSessionGoldenTest`): the real `SessionActivity` running a
  self-study session of kanji 一 (440; seed 1, so the reading question comes first), keys injected
  with `Instrumentation.sendKeySync` (InputManager → ViewRootImpl → the focused view), IME calls
  through the field's InputConnection, buttons clicked. Ops DSL in the class javadoc; each step
  records `fragment`, `current`, `answered`, `correct`, `field`, `fieldActive`, `focus`,
  `progress`. The field: input type `TEXT | NO_SUGGESTIONS` (524289), ime options
  `DONE | NO_FULLSCREEN | NO_PERSONALIZED_LEARNING`, single line. Findings:
  - Enter or numpad Enter down (no modifiers) submits, for meaning and reading; auto-repeat downs
    after it do nothing (the field is inactive once submitted). An Enter or numpad Enter up alone
    does nothing. Shift/ctrl/alt+Enter and `DPAD_CENTER` do nothing.
  - Focus stays on the field on Tab, Shift+Tab and a lone Enter or numpad Enter up (fixed
    2026-10-18: before, these moved focus to the Don't know button, so typed keys were lost and
    the next Enter answered "Don't know"). DPAD_DOWN doesn't move it either. Escape clears focus;
    after it, keys and Enter do nothing.
  - After a submit, the answered screen focuses Next: Enter goes to the next question, and
    keys typed before that are lost. After a retry verdict (kanji reading answered with the
    kun'yomi), the field stays active and keeps its text; Enter again gives the retry again.
    An empty field ignores Enter.
  - An IME's `performEditorAction` submits for every action id, 0 (`IME_ACTION_UNSPECIFIED`)
    included. `handleEditorAction` rejects 0, but TextView then sends an Enter key itself, and
    that submits. (`fixup-keys.json`, on its copy of the field and listener, records no submit for
    0. The real field submits, and the port follows the real field.) `sendKeyEvent(ENTER)`
    submits. `commitText("\n")` inserts nothing (`fixup` drops it).
  - Hardware letters on a reading question go through `PseudoIme` like soft-keyboard text
    (capitals become katakana: `ONE` → `オネ`).
  - **The IME stage is left out on purpose.** The session window gets `FLAG_ALT_FOCUSABLE_IM`, so
    no soft keyboard binds to the field. With the emulator's Gboard (15.1, English layout) bound,
    every hardware key goes to Gboard first. Gboard passed ASCII keys through and the results
    matched these, except two that were not deterministic: in 1 of 5 runs, an Enter right
    after a retry reached the field as an editor action plus a lone Enter up. Focus then moved
    to Don't know, and the next Enter answered Don't know (fixed 2026-10-18: the field now
    swallows a lone Enter up; not re-checked with Gboard, since it isn't deterministic). Also, after Escape, keys still reached
    the field through Gboard's InputConnection. This depends on the IME, its version and timing.
    The port can only match what it does itself (no Android IME on the web or in the Capacitor
    WebView).
- `kana/readings.jsonl`: the romaji come from a test-side romanizer
  (`AnswerGoldenSupport.romanize`), katakana as upper-case romaji. 25 readings do not round-trip
  (upper-case N and doubled upper-case consonants are not handled by `fixup`); that is frozen Java
  behavior.

- `curriculum/jlpt-plan-*.json`: input rows are tuples
  `[id, object, wkLevel, wkPosition, components, hidden, characters]`, `jlpt` maps a kanji to its
  JLPT level (5 = N5 … 1 = N1); output `placement` is `[id, level, lessonPosition]` sorted by id.
  The content case uses the rows `Curriculum.layout` builds from a freshly imported subject table
  (WaniKani order = the subject's own `level` and `lessonPosition`), without the extra
  (non-WaniKani) kanji of `extra-kanji.db`; the order with extras is covered by the scenarios.
- `curriculum/placement.json`, `levelTest/estimators.json`: random cases come from a seeded
  `java.util.Random`, but their inputs are recorded, so the TS port never needs Java's RNG. The
  Level test rounds themselves pick kanji at random; the TS port tests those by invariants.
- `srs/outcome.json`: input `{subject: {id, object, srsSystemId}, type: LESSON|REVIEW,
  meaningIncorrect, readingIncorrect, timestamp, before}`, output `{after}`, where `before`/`after`
  are the subject's 18 progress columns (`srsStage`, `unlockedAt`, `startedAt`, `availableAt`,
  `passedAt`, `burnedAt`, `resurrectedAt`, `passed`, the 8 meaning/reading correct/incorrect/streak
  columns, `percentageCorrect`, `lastIncorrectAnswer`) around
  `new ReportSessionItemJob(id, 0, type, m, r, ts, false).runLocal()` in local mode. Only that
  subject's row is recorded (unlock side effects are in the scenarios). Seven fixed subjects
  (radical, kanji and vocabulary in both SRS systems, plus kana vocabulary); every third timestamp
  is 0–45 s before the top of an hour, so the +30 s crosses it.
- `progress/describe.json`: input `{text}`, output `{ok: true, summary, exportedAt}` or
  `{ok: false, error: <exception class>, message, exportedAt}`; `exportedAt` is what
  `new JSONObject(text).optLong("exportedAt")` gave, or `null` if that threw. The summary contains
  a locale-dependent date: it is generated with `Locale.US` and time zone UTC; compare the date
  part separately from the rest of the summary. Android's `org.json` is lenient: trailing garbage,
  single quotes and a BOM are accepted, while missing, null or non-array `subjects` throw
  `java.lang.NullPointerException`. The inputs are in
  `durtles/app/src/androidTest/assets/golden-inputs/progress-describe.json` (generated by
  `node scripts/golden-describe-inputs.mjs <that path>`). The last case, `real-android-export`, has
  input `{file: "progress/android-export.json"}` instead of `{text}`: the owner's phone export,
  pushed by `run.sh` rather than kept twice in git.
- `progress/android-export.json`: the owner's real export from the phone app (exported
  2026-10-18, `exportedAt` 1792298260372, JLPT order, level 6, 1,034 subjects, one jump, no
  probation). Personal data: the repo is private; never publish it. `run.sh` pushes it to the
  device's `golden-in/progress/` (`ScenarioRunner.readPushed`).
- `progress/android-roundtrip.json`: from the empty base state, with the clock pinned to the file's
  `exportedAt`, `restore` then `export`. `differences` lists every JSON difference from the input
  (arrays of objects with an `id` matched by id), and `textIdentical` compares the bytes. Both
  rounds: no differences, byte-identical. The port's restore + export must do the same.

## Scenario notes

- **The owner's real progress** (`real-progress`): mode JLPT, empty start, then `restore`
  `{pushed: "progress/android-export.json"}` with `atMs` = the file's `exportedAt`. The `dashboard`
  action records what the dashboard computes (`LiveTimeLine.computeTimeLine`,
  `LiveLevelProgress.computeLevelProgress`, `LiveSrsBreakDown.computeBreakDown`, moved out of their
  `updateLocal` unchanged; the timeline's clock is `Clock.now()`): the settings it read, available
  lessons and reviews (ids), the non-empty hourly slots from the top of the current hour (ids and
  level-up counts), the next long-term review date and count, the level progress bars (`buckets`:
  0 passed, 1–7 Apprentice IV–I order of `getLevelProgressBucket`, 8 initiate, 9 locked) and the
  SRS breakdown buckets 0–4. Taken at `exportedAt`, +1 h and +1 day; then a review session (the
  first 3 meaning questions wrong, wrap-up after 12 answers: 11 items reported, 3 drop a stage), the
  dashboard again and a week later. The file has no lessons left, so there is no lesson session.
  The scenario sets `exportMode: "delta"`: the first snapshot keeps `export`, later ones carry
  `exportDelta` `{fields, subjectsChanged, subjectsRemoved, subjectCount}` against the previous
  snapshot (changed top-level fields with their new value, changed subject rows in full).
- **Level progress includes kana-only vocabulary in the vocabulary bar** (fixed 2026-10-18, see the
  bug list): its totals, passed counts and stage buckets count `vocabulary` and `kana_vocabulary`
  together; there is no separate kana-only bar.

- **Sync reminder** (`reminders.syncReminder`, the `sync_reminder` property): since 2026-10-17 it
  is never set or shown in local mode, which unlocks on the spot; in server mode a review that makes
  a radical or kanji pass for the first time sets it and the assignment sync clears it. The base
  reset turns it off before each scenario.
- **Unknown subject ids** (`import-unknown-*`, `import-hidden-and-extra-ids`,
  `restore-unknown-ids-*`, `restore-all-unknown`; unknown ids 9540, 9541, 9999, 50000, 60000,
  70000, 150000, 300000; hidden 58, 7668, 2285; extras 100001, 200001): the WaniKani import skips
  progress for unknown subjects and reports how many items it skipped; restores drop unknown ids,
  including their probation rows. Hidden and extra subjects take progress normally but are lessons
  and reviews only where their curriculum level allows (extras in JLPT order). Restored level
  progression rows are kept next to generated ones, so duplicate levels are possible.
- **Fast travel near the end** (`ft-near-end-*`, `ft-n1-obscure-boundary`): options run from
  level + 1 to `min(maxLevel, level + 5)`; with the current content maxLevel is 58, N1 ends at 54
  and the last N1 level holds only extra content. `FastTravel.travel` does not check its target;
  the app only passes targets `status()` offered, and the fixtures never call it otherwise.
- **Hidden components** (`wk-hidden-*`, `jlpt-hidden-*`): `hideSubject`/`unhideSubject`
  `{ids | where, update}` change `subject.hiddenAt` inside the test (the base reset restores the
  content's values); the port replays them on its own subject table. A hidden radical or kanji
  counts as passed for its users' unlocks; hidden kanji leave both the total and the passed count of
  the 90 % level-up; hidden subjects drop out of lessons and reviews but keep their progress;
  unhiding revokes neither unlocks nor levels.
- **Per-answer time** (`time-*`): `lesson`/`review` with `spacingSeconds`, `offsetsSeconds` or
  `delayedReport` stamp each answer separately (`resolved.answers`: `{id, answeredAtMs,
  reportedAtMs}`). `availableAt` is `topOfHour(answeredAt + interval + 30 s)`. With
  `delayedReport` (the "delay result upload" setting) each job uses its answer time for the
  subject's own columns, while unlocks and `level_progression` use the report time. The probation
  edge scenarios (`time-probation-3day-edge`, `-7day-edge`) are content-independent: `grind` with
  `until: {onlyLastProbationSlot}` stops before the last hour slot FastTravel used, and the step key
  `atLastProbationSlot` (ms offset) pins the clock to that slot (`resolved.lastProbationSlotMs`).
  With today's content (178 items) the last slot is HT0 + 71 h / + 167 h.
- **WaniKani's `hidden` flag and `subject_type`** (`import-assignment-*-flag*`,
  `import-subject-type-mismatch`): the import reads neither. `hidden: true` on an assignment or
  review statistic changes nothing (the subject counts, is a lesson or review and passes levels
  like any other; only the content's `hiddenAt` hides). An unknown, wrong, empty, null or missing
  `subject_type` is ignored: progress goes to `subject_id`. Two assignments for one subject: the
  later one wins (all its columns, `passedAt` 0 included). Unknown ids are skipped whatever their type.
- **Hiding in JLPT order** (`jlpt-hide-kanji-*`, `jlpt-hide-unhide-kanji-switch`): `hideSubject`
  and `unhideSubject` never re-run the layout, and neither does a restore in the current order;
  `previewCurriculum` lays out afresh, and `switchCurriculum` re-runs the layout and placement on
  every call, also to the order already in use. A layout made while kanji are hidden leaves them out
  of the JLPT blocks (they go to the first JLPT level holding kanji of their WaniKani level), so
  later N5 kanji move down a level and the placement unlocks them as backfill; that unlock stays
  after unhiding and switching back. `unhideSubject {ids: "changed"}` names every subject the
  scenario's earlier hide/unhide steps changed (the ids are in `result.subjects`).
- **Sessions** (`session-*`, `SessionDriver` in the Tier B harness): the `session*` actions drive the
  real `Session` like SessionActivity does (`chooseQuestion` after every action, `advance` after an
  answer unless `advance: false`). The question order comes from Java's seeded RNG, so the port
  replays it: `result.session.current` is the question on screen after each step, `queue` the
  pending questions in list order, `history` the undo stack (top first), and `resolved.answers`
  every question answered `{id, questionType, answer, text, verdict, atMs}` (`skip` entries are
  Skip presses). `result.session.items` / `db.items` are the in-memory and `session_item` rows
  (`done`/`incorrect` per question slot 1–4; slots a subject has no question for start done).
  `result.jobs` lists every job the session scheduled, in order, as `[class, data]`; the jobs run
  at once. A report's timestamp is the item's `lastAnswer`, the clock at its last correct answer.
  The first session step pins the preferences listed in the `SessionDriver` javadoc (app defaults,
  but no audio download; `resolved.settings`). Behavior frozen here: Ignore marks the wrong answer
  correct and, if that finishes the item, reports it at once with no incorrect count; it is only
  offered while the wrong answer is on screen. Without delayed reporting a finished item is
  reported at once and can no longer be undone; with it (and always in self-study) items wait as
  `PENDING`, Undo can go back any number of answers, Finish reports every `PENDING` item in
  `session_item` order with its own `lastAnswer` (subject columns), while unlocks use the finish
  time. Wrap-up abandons every item without an answer (`AbandonSessionItemJob`); Abandon
  (`Session.finish`) reports nothing more: `PENDING` and half-answered items stay as they were.
  The progress text gets `Wrapup: ` whenever every active item is started, also without a wrap-up.
  A restart (`sessionRestart`) reloads `session_item` (half-answered items keep their done
  questions and wrong counts) but loses the undo history. Self-study never changes SRS, `availableAt`
  or review statistics, but a wrong item's report sets `lastIncorrectAnswer` to its last answer
  time. In a level-test round one wrong answer removes the kanji's other questions, the item stays
  `ACTIVE` and is not reported. The round flag is persisted (`mm_state` `level_test_round_active`,
  fixed 2026-10-17), so a round resumed after a restart still runs and records as the round
  (`session-level-test-restart`: status `ROUND1_DONE` after Finish). A lesson quiz
  reports each finished item as a lesson at once (a wrong answer only re-queues it); wrap-up during the lesson presentation ends the session. Test seams:
  `Question.markCorrect` and `Subject.isEligibleForSessionType(REVIEW)` read `Clock`, and
  `JobRunnerService.testInterceptor` lets the harness run the session's jobs itself.
- **Session configuration** (`session-order-review`, `session-order-lesson`, `session-order-self-study`,
  `session-size-review`, `session-sequence-*`, `session-lightning-mode`; definitions in
  `durtles/golden/session_order_scenarios.py`): these turn `enable_advanced` on and pin every advanced
  session preference (unset = app default) plus what the step tests, so `resolved.settings` lists them all.
  The `session-order-*` / `session-size-review` steps start a session and abandon it; the start's
  `result.session.items` (`order`, `bucket`) is what the settings produce. How a session is built
  (`Session.populateItems`): the subjects are shuffled with the seeded RNG (reviews and self-study
  always, lessons only for `SHUFFLE`, `LEVEL_THEN_SHUFFLE`, `TYPE_THEN_SHUFFLE`), stably sorted by the
  comparator, cut to the size limit (below), and given buckets (a new bucket whenever the comparator
  sees the next subject as different). The comparator is the order, then reversed, then "overdue
  first" (reviews and self-study) in front, then the priority in front of everything. With
  `enable_advanced` off, or an invalid value, the order is `LEVEL_THEN_TYPE` (lessons) / `SHUFFLE`
  (reviews, self-study) and the priority `NONE`. "Shuffle after selection" only makes every bucket 0
  (the items keep the sorted order; the question choice is then random over all of them). Overdue:
  `availableAt` set and the stage not locked; an initial stage is always overdue, a completed one never;
  otherwise elapsed time / stage interval ≥ `overdue_threshold` % (an integer ≥ 1, else 20 %).
  Size limits are string preferences `max_lesson_session_size` / `max_review_session_size` /
  `max_self_study_session_size` (default 5 / 100 / 100, also for empty, unparsable or < 1 values) and
  apply with `enable_advanced` off too. Over the limit, the selection rules
  (`<type>_subjects_<current|earlier|radical|kanji|vocabulary|kana_vocabulary>_<min|max>`, ints, -1
  unset; current = the user's level, earlier = below it, a subject above it counts as neither) pick in
  five passes over the sorted list (a subject that helps both an age and a type minimum; one that helps a
  minimum without exceeding a maximum; any minimum; nothing exceeded; anything), then the chosen ones are
  sorted again. With no effective rules (every min 0 or unset, every max unset) `isEmpty()` skips the
  passes and cuts the list, which gives the same result. Kana-only vocabulary has its own count: the
  `vocabulary` rules count ordinary vocabulary only (`SubjectType.isVocabulary` is false for
  kana-only), the `kana_vocabulary` rules count kana-only vocabulary only. Maximums are soft: the last
  pass still fills the session past them. The lesson kana-only minimum is read from
  `lesson_subjects_kana_vocabulary_min`, the key the settings screen writes (`session-order-lesson`
  also sets the old misspelled `lesson_subjects_Kana_vocabulary_min`, which is ignored).
  Question order (`Session.chooseQuestion`, `session-sequence-*`, `resolved.answers` in order): the
  candidates are filtered in turn, each filter skipped when it would leave nothing: back-to-back (only
  questions of started items), reading first (an item with both questions pending offers only its
  reading), meaning first (the same for the meaning; with both settings on, single-question items such as
  radicals come first, then reading first applies), at most 10 started items, and within the first
  candidate's bucket the items without a choice delay (a wrong answer sets 3, every choice counts it
  down). The question is then picked at random among the leading candidates that share the first one's
  bucket. Lightning mode (`session-lightning-mode`, answers with `advance: "app"` list `lightning`):
  `enable_lightning_mode` (default on) and not turned off for this session with the Lightning special
  button (`TOGGLE_LIGHTNING_MODE`, label struck through while off; a new session turns it back on; it
  cannot turn lightning on when the setting is off). After a correct answer it advances at once, except
  a close-enough answer under `ACCEPT_WITH_TOAST_NO_LM`, which lingers until Next; wrong answers always
  wait for Next. Test seams: `Subject.isOverdue` reads `Clock`, and SessionActivity's lightning
  decision moved unchanged to `Session.lightningAdvancesNow`.
- **Anki mode** (`anki-*`, `anki/*`): Anki mode is on for a question when Advanced settings are on and the
  `anki_mode_<lesson|review|self_study>_<meaning|reading>` preference for its session type and kind is on
  (`NONE` uses the self-study ones; the old single `anki_mode_*` keys are only read by a one-time
  upgrade migration in `WkApplication`, which the port does not need). The Anki screen: "Show answer"
  reveals the answer text (`ankiAnswer`; "My synonyms" below it for a meaning question when the subject has
  user synonyms) and plays the reading audio if `autoplay_anki_reveal`; then Correct / Incorrect
  (`swap_anki_buttons` swaps them), then Next (`Session.advance`); after grading the subject info is shown.
  Grading goes through `Session.submitAnkiCorrect` / `submitAnkiIncorrect`, which mark the question
  exactly like a typed right or wrong answer (same session_item updates, reports, SRS outcome, re-queue;
  no `lastTypedIncorrectAnswer`, no verdict, no close-match toast) and ignore a second press on an
  answered question. Test mode (`test_mode`, the hidden TestActivity switch) has no effect on grading
  (`anki-test-mode`, see fix 11). The revealed text keeps its bold (the primary meaning/reading when
  there are several): `bold` lists the ranges in the shown text, `shownStyled` is true exactly when
  there are some. Meanings and readings are HTML-escaped like synonyms (`escape/*` cases).
- **Lesson quiz** (`session-lesson-*`, `session-matching-kanji`; `sessionBackToPresentation`,
  `sessionPresentationNext`/`Previous` and `sessionInspect` add `result.presentation` {item, index, storedItemId}).
  Back to lesson presentation (menu visible while a LESSON session is `ACTIVE`) opens on the item being quizzed
  and stores it; everything about the quiz stays (finished items stay `REPORTED` and are shown
  in the presentation, wrong ones keep their counts and stay queued) and Start quiz continues. With an answer still on
  screen, it first acts as Next (`Session.advance`): a finished question leaves the queue (reported once), a wrong
  one gets its choice delay and undo entry, and if that was the last question the session finishes instead of
  showing the presentation. A restart reloads only unreported items and opens the presentation while none of them is
  started, on the stored item. A lesson report carries the item's incorrect counts, but the lesson still lands on
  Apprentice I with no review statistics; a wrong answer sets `lastIncorrectAnswer`, a retry does not. **Matching
  kanji:** only `SubjectType.isVocabulary` subjects (not kana-only vocabulary) with exactly one UTF-16 char qualify,
  and only with `enable_advanced` on (`shake_on_matching_kanji` defaults to true); the lookup finds visible kanji
  only. A reading of that kanji, accepted or not, that is not the vocabulary's own is a retry (no incorrect count,
  the question stays), as often as it is typed. The session driver resolves the matching kanji for every typed
  answer like the fragment does; with advanced settings off (all other scenarios) it is null.
- **Other behavior the port keeps:** a review increments `readingCorrect` and the reading streak
  even for radicals; switching order keeps already unlocked items; `ProgressStore.describe`
  throws a `NullPointerException` when `subjects` is missing.

## Java bugs fixed before freezing (2026-10-17, 2026-10-18)

Found while generating these fixtures, fixed in `durtles/` first, then regenerated:

1. **WaniKani import thrown away by one unknown subject id.** The DAO tried to insert an id-only row,
   which broke a NOT NULL constraint inside a nested Room transaction and silently rolled back the
   whole import. `WaniKaniImporter.apply` now skips unknown ids and reports them.
2. **Probation that can never be answered blocked fast travel forever.** Restores now drop probation
   rows for unknown subjects, and `FastTravel` counts only visible subjects.
3. **The sync reminder never cleared in local mode.** Local mode now neither sets nor shows it.
4. **A blank synonym accepted every short answer, and a null one crashed the check.** Null and blank
   synonyms are ignored when read, and blank ones are no longer saved. "Blank" includes no-break and
   ideographic spaces (`StudyMaterialsSupport.isBlank`).
5. **Saving the notes form dropped every synonym past the 10th**, even without edits. The extra ones
   are now kept after the form's rows.
6. **`%` and `_` in a search matched anything**, because the escaping wrote a bare `%`. They now
   match literally.
7. **A level-test round was forgotten when the app was killed mid-round**, so it finished as plain
   self-study and was never recorded. The round flag is now persisted.
8. **Back to lesson presentation with an answer still on screen reported the item twice.** The
   answered question was never removed, so the item was asked again and reported a second time
   (moving its `startedAt`/`availableAt`), and a wrong answer got no choice delay or undo entry.
   It now acts as Next first; with the last answer on screen the session finishes.
9. **Back to lesson presentation opened on the last item** and stored nothing, so a restart opened
   a different item. It now opens on the item being quizzed (else the stored one) and stores it.
10. **`Session.goBackToPresentation`'s guard only logged** outside an active lesson; it now returns.

11. **Anki mode's Correct counted as Incorrect with the hidden test mode on** (an item's first
   Correct). Leftover developer code, removed: Correct is always correct.
12. **Anki mode's revealed answer lost its bold**, because `Question.getAnkiAnswerRichText` joined it
   to a String. It now uses `TextUtils.concat`, so the primary meaning or reading stays bold.
13. **Meanings and readings went into HTML unescaped** (revealed answer and the subject headline), so a
   `<` or `&` could be swallowed or turned into markup. No current content has one; they are now
   escaped like synonyms and notes already were.
14. **The "Locked" stage filter matched nothing in local mode**, "Initiate" matched locked subjects
   too, and the "SRS Stage" sort put them under Initiate. Locked now means `unlockedAt = 0`, the same
   as before in server mode, where the sync writes `-999` exactly for those rows.
15. **A stage selection with only unknown tags returned every subject.** It now matches nothing.
16. **An advanced search with `"itemTypes": null` (or another collection set to null) came back
   empty**, and **`"sortOrder": null` blanked the results screen.** Both could only come from a preset or
   an import. An explicit null now keeps the default (no filter, type order).
17. **A number above 2^31−1 in an advanced search field was silently dropped**, so a huge minimum
   level matched everything. Whole numbers outside the int range are now clamped to the int range.
18. **Refine dropped values the form has no switch for** (JLPT 6, Jōyō 8, a star rating of 7, an
   unknown stage tag), so refining a preset changed its search. They are now kept through the form.
19. **The lesson kana-only vocabulary minimum never applied**: it was read from
   `lesson_subjects_Kana_vocabulary_min` (capital K), which nothing writes, while the settings screen
   writes `lesson_subjects_kana_vocabulary_min`. It now reads the screen's key. A value under the old
   key could only have been set by hand, so it isn't migrated.
20. **The kana-only selection rules counted the wrong items**: they were compared with the ordinary
   vocabulary count, and kana-only items were never counted, so a kana-only maximum of 1 took every
   kana-only item. Kana-only vocabulary now has its own count.
21. **`SubjectSelectionRules.isEmpty()` was never true** (it compared normalized values with -1). It
   now recognizes "no rules"; the selected subjects are the same either way.
22. **Numpad Enter, Tab or a lone Enter release moved focus from the answer field to Don't know**, so
   the keys typed next were lost and the next Enter answered "Don't know" (a wrong answer). Numpad
   Enter now submits like Enter, and the field swallows Tab and every Enter release
   (`UnansweredSessionFragment.isEnterKey`/`swallowFocusKey`, an `OnKeyListener`). This also covers
   the Gboard case where a quick Enter after a retry arrived as an editor action plus a lone release.
23. **"Add synonym" kept no-break and ideographic spaces around a word.** `synonymInput` now strips
   the chars `isBlank` counts as blank as well as `String.trim`'s.
24. **Newlines could get into a synonym** (multi-line field: Shift+Enter, numpad Enter, an IME or a
   paste). The field is single-line, an input filter turns line breaks into a space, and
   `synonymInput` does the same, so `line\nbreak` is saved as `line break`. Enter and every IME action
   save; numpad Enter saves when the keyboard passes it on as a key.
25. **Adding a synonym already in the list still ran the save job.** `StudyMaterialsSupport.addSynonym`
   now returns null for it, so nothing is saved.
26. **A whole number outside the int range in a preset's JSON failed the whole parse**, so the preset
   found nothing (`raw/hugeLevel`). `AdvancedSearchParameters.ClampedInteger` now clamps it to the int
   range, like the form (fix 17); strings and floats are read as before.

Not changed on purpose: search matches characters, meanings and readings only (not notes or
synonyms) and has no romaji-to-kana conversion. These are upstream design choices, not bugs.
27. **The dashboard's level progress bars left out kana-only vocabulary.** `computeLevelProgress` meant
   to fold `kana_vocabulary` into the vocabulary bar, but `setTotalCount`/`setNumPassed` assigned, so the
   vocabulary row overwrote it, and the bar's stage buckets read `vocabulary` only. The counts now add
   up and the buckets include kana-only items. Display only; levelling up never used these bars.


## Regenerating

Only regenerate when the Java behavior changes on purpose (a bug fix in `durtles/` first, then
the fixtures, then the TS port). Fixtures freeze the Java behavior as it is, bugs included.
Regenerate from a clean `durtles/` (commit the Java change first) so the manifest records the
right commit.

Tier A, plain JVM unit tests (no device; the content-based tests are skipped when
`wk-content.db` or the `sqlite3` CLI is missing):

```sh
cd durtles
export JAVA_HOME="$(brew --prefix openjdk@21)/libexec/openjdk.jdk/Contents/Home"
GOLDEN_DIR=$PWD/../web/test/golden \
  ./gradlew testDebugUnitTest --tests 'com.smouldering_durtles.wk.golden.*' --rerun
```

`--rerun` is required: `GOLDEN_DIR` is not an input of the Gradle test task, so without it a
second run is "up to date" and writes nothing. Without `GOLDEN_DIR` the same tests just run and
write nothing. `GOLDEN_CONTENT_DB` overrides the content DB path.

Tier B, instrumented tests on an emulator or device (harness in
`durtles/app/src/androidTest/java/com/smouldering_durtles/wk/test/golden/`: `ScenarioGoldenTest`,
`ScenarioRunner`, `FixupEditTextGoldenTest`, `FixupKeysGoldenTest`, `KeysSessionGoldenTest`, `SynonymStorageGoldenTest`, `SynonymUiGoldenTest`, `SynonymDialogGoldenTest`,
`SearchGoldenTest`, `AdvancedSearchGoldenTest`, `AnkiGoldenTest`, `MatchingKanjiGoldenTest`, `UnicodeGoldenTest`,
`GoldenWriter`). The debug APK needs `wk-content.db` in the assets. The easiest way is the two
scripts in `durtles/golden/` (back up first, see below):

```sh
G=com.smouldering_durtles.wk.test.golden
durtles/golden/run.sh /tmp/golden "$G.ScenarioGoldenTest,$G.FixupEditTextGoldenTest,$G.FixupKeysGoldenTest,$G.SynonymStorageGoldenTest,$G.SynonymUiGoldenTest,$G.SynonymDialogGoldenTest,$G.KeysSessionGoldenTest,$G.SearchGoldenTest,$G.AdvancedSearchGoldenTest,$G.AnkiGoldenTest,$G.MatchingKanjiGoldenTest"
durtles/golden/unicode.sh /tmp/golden-unicode     # pushes the JVM answer fixtures, re-runs them on the device
rsync -a /tmp/golden/golden/ /tmp/golden-unicode/golden/ web/test/golden/
```

`run.sh <out> [classes] [scenario,names]` builds, installs with `adb install -r` (never uninstalls)
and runs; the third argument limits `ScenarioGoldenTest#scenarios` to some scenarios.
`FixupEditTextGoldenTest` reads a copy of `kana/fixup-sequences.json` from
`durtles/app/src/androidTest/assets/golden-inputs/`; refresh it after regenerating Tier A.

**The run resets the debug app's progress.** Back it up first, and keep
`leaveApksInstalledAfterRun=true`: without it Gradle uninstalls the debug app afterwards, which
wipes the progress and the keystore key behind the encrypted shared preferences.

```sh
# backup
adb shell am force-stop app.kanjikodama.wk.debug
adb exec-out run-as app.kanjikodama.wk.debug tar -cf - databases shared_prefs files no_backup > backup.tar

cd durtles
./gradlew connectedDebugAndroidTest \
  -Pandroid.testInstrumentationRunnerArguments.class=com.smouldering_durtles.wk.test.golden.ScenarioGoldenTest \
  -Pandroid.injected.androidTest.leaveApksInstalledAfterRun=true
adb pull /sdcard/Android/data/app.kanjikodama.wk.debug/files/golden/. ../web/test/golden/

# restore: force-stop, delete databases shared_prefs files no_backup in the app's data dir, then
adb shell am force-stop app.kanjikodama.wk.debug
adb shell run-as app.kanjikodama.wk.debug rm -rf databases shared_prefs files no_backup
adb exec-in run-as app.kanjikodama.wk.debug tar -xf - < backup.tar
# and relaunch the app
```

**Two emulators.** `emulator-5554` (AVD `mojimori`) holds the owner's progress: back it up and restore
it around every run as above. `emulator-5556` (AVD `kk-golden2`, same `android-36` google_apis arm64
image, Pixel 6 profile, same Gboard and animation settings) holds no owner data and needs no backup;
prefer it. Start it headless with
`emulator -avd kk-golden2 -port 5556 -no-window -no-audio -no-boot-anim -no-snapshot-save`.
With both attached, `run.sh` and `unicode.sh` need `ANDROID_SERIAL=emulator-5556` (or 5554); `run.sh`
refuses to guess. Every Tier B fixture comes out byte-identical on both (checked 2026-10-18).
Agents coordinate with `mkdir` locks: `/tmp/claude-501/kk-emulator.lock` (5554),
`/tmp/claude-501/kk-emulator2.lock` (5556), `/tmp/claude-501/kk-durtles-gradle.lock` (builds and installs).

The run takes about 80 s and is deterministic (two runs give identical files). Subsets: one test
with `class=…ScenarioGoldenTest#scenarios`, `#srsOutcome`, `#progressDescribe` or `#progressRealExport`; some scenarios
with `-Pandroid.testInstrumentationRunnerArguments.scenario=name1,name2`.

Then, after both tiers:

```sh
cd web
node scripts/golden-manifest.mjs          # writes manifest.json
node scripts/golden-manifest.mjs --check  # verifies files against manifest.json
git diff --stat test/golden               # review what changed, and why
```
