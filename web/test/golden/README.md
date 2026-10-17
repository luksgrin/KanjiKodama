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
| `progress/describe.json` | `ProgressStore.describe` (Android's `org.json`) | B |
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
| `answers/synonyms-ui.json` | `StudyMaterialsSupport` (extracted from `SubjectInfoView.addSynonym` and `StudyMaterialsActivity`): add-synonym input, list and job data; the 10-row form and its save | A |
| `answers/synonyms-ui-device.json` | `getMeaningSynonymsRichText` and the note rich texts (`HtmlCompat`); the real `StudyMaterialsActivity`: form shown, edits, arrows, save | B |
| `search/ranking.json` | `SearchUtil` term splitting, `getRanking`, `getSearchRanking` on inline subjects | A |
| `search/content.jsonl` | `SearchUtil.searchSubjects(1, q)` (results screen, with its type order) and `searchSubjectSuggestions` over the real content, with and without notes/synonyms | B |
| `answers/unicode-android.json`, `answers/unicode-android-table.json` | `FuzzyMatching.cleanString`/`matches` and `Character.getType`/lower-casing on the device (Android 16, ICU 76.1, Unicode 16.0) | B |
| `answers/unicode-android-overrides.json` | device outputs of `fuzzy*`/`check-*` cases that differ from the JVM fixtures (currently none) | B |
| `kana/table.json`, `kana/edge.json`, `kana/convert.json` | `PseudoIme.simulateInput`, `toKatakana`, `KanaUtil` | A |
| `kana/readings.jsonl` | every distinct reading, romanized, through `PseudoIme` | A, needs content DB |
| `kana/fixup-sequences.json` | `PseudoIme.fixup`, keystroke by keystroke, on `DummyEditable` | A |
| `kana/fixup-edittext.json` | `PseudoIme.fixup` from the answer field's TextWatcher on a real EditText | B |
| `kana/fixup-keys.json` | the answer field fed by hardware key events and the real clipboard (paste, cut, undo), and which Enter keys submit | B |
| `server/normalize.json` | `ServerMode.normalize`, `label` | A |
| `scenarios/*.json` | progression, curriculum switch, fast travel (also near the last level), level test rounds, import, restore, unknown and hidden subjects, hidden components, per-answer time, sync reminder, sessions (`session-*`: undo, ignore, wrap-up, abandon, restart, self-study, the level test's session) | B |

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
  whitespace (newline, tab, space) is removed by `fixup` as usual. Submit: only `KEYCODE_ENTER`
  down without modifiers submits (once per down, so auto-repeat submits again); Enter up is
  consumed without submit; shift/ctrl/alt+Enter, `NUMPAD_ENTER` and `DPAD_CENTER` never submit
  (shift+Enter inserts a `\n` that `fixup` removes); an IME's `performEditorAction` submits for
  any action id but 0 (`IME_ACTION_UNSPECIFIED`); the field's EditorInfo action is
  `IME_ACTION_DONE`. Not covered: the IME stage of `ViewRootImpl` (a soft keyboard that intercepts
  hardware keys), non-QWERTY or kana hardware layouts, what happens after a submit that is not a
  retry.
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
  `node scripts/golden-describe-inputs.mjs <that path>`).

## Scenario notes

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
- **Other behavior the port keeps:** a review increments `readingCorrect` and the reading streak
  even for radicals; switching order keeps already unlocked items; `ProgressStore.describe`
  throws a `NullPointerException` when `subjects` is missing.

## Java bugs fixed before freezing (2026-10-17)

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

Not changed on purpose: search matches characters, meanings and readings only (not notes or
synonyms) and has no romaji-to-kana conversion. These are upstream design choices, not bugs.

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
`ScenarioRunner`, `FixupEditTextGoldenTest`, `FixupKeysGoldenTest`, `SynonymStorageGoldenTest`, `SynonymUiGoldenTest`,
`SearchGoldenTest`, `UnicodeGoldenTest`,
`GoldenWriter`). The debug APK needs `wk-content.db` in the assets. The easiest way is the two
scripts in `durtles/golden/` (back up first, see below):

```sh
G=com.smouldering_durtles.wk.test.golden
durtles/golden/run.sh /tmp/golden "$G.ScenarioGoldenTest,$G.FixupEditTextGoldenTest,$G.FixupKeysGoldenTest,$G.SynonymStorageGoldenTest,$G.SynonymUiGoldenTest,$G.SearchGoldenTest"
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

The run takes about 80 s and is deterministic (two runs give identical files). Subsets: one test
with `class=…ScenarioGoldenTest#scenarios`, `#srsOutcome` or `#progressDescribe`; some scenarios
with `-Pandroid.testInstrumentationRunnerArguments.scenario=name1,name2`.

Then, after both tiers:

```sh
cd web
node scripts/golden-manifest.mjs          # writes manifest.json
node scripts/golden-manifest.mjs --check  # verifies files against manifest.json
git diff --stat test/golden               # review what changed, and why
```
