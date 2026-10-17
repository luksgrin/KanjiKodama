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
counts: {lessons, reviews, reviewsNext24h}, fastTravel: {level, blocked, options}, levelTest, export}`.
`resolved` holds the concrete ids each step used (lessons, reviews `[id, meaningIncorrect,
readingIncorrect]`, grind rounds, level-test picks and answers, imported or restored files), so a
consumer can replay a scenario without the generator or Java's RNG. The subjects in `export` are in
SQLite rowid order: compare them ignoring order. The scenario DSL is documented in the
`ScenarioRunner` javadoc; the scenario definitions are in
`durtles/app/src/androidTest/assets/golden-scenarios/`.

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
| `kana/table.json`, `kana/edge.json`, `kana/convert.json` | `PseudoIme.simulateInput`, `toKatakana`, `KanaUtil` | A |
| `kana/readings.jsonl` | every distinct reading, romanized, through `PseudoIme` | A, needs content DB |
| `kana/fixup-sequences.json` | `PseudoIme.fixup`, keystroke by keystroke | A |
| `server/normalize.json` | `ServerMode.normalize`, `label` | A |
| `scenarios/*.json` | progression, curriculum switch, fast travel, level test rounds, import, restore | B |

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
  `FuzzyMatching.cleanString` uses `Character.getType`, so results follow the Unicode tables of the
  generating JDK (21), not Android's.
- `answers/check-*`: input `{subject, questionType, answer, matchingKanji, meaningSynonyms}`, where
  `subject` is an id (look it up in `check-subjects.jsonl`) or an inline object (synthetic), and
  `matchingKanji` is `null`, an id or an object. Meaning types are keyed by `CloseEnoughAction`
  (with `requireOnInKatakana=false`; meaning types ignore it); reading types are keyed
  `"requireOnInKatakana=false"` / `"requireOnInKatakana=true"` (with `SILENTLY_ACCEPT`; reading
  types ignore the action). The answer is exactly what `checkAnswer` receives: what
  `Session.submit` does before (trailing n → ん, kana-only check, expected-kana regex, trim) is not
  covered, because `Session` is Android-bound. Case names carry a kind label (`correct`, `typo1`,
  `rejected`, `reading-romaji`, `accepted-onyomi-katakana`, `…-digraph`, `kanji-<type>`,
  `synonym`, …). Synonyms are synthetic (the content DB has none).
- `kana/fixup-sequences.json`: edits are `{insert, at}` (`at` −1 = end) or `{backspace}`; after
  each edit `fixup(s, at, at + len)` runs once on PseudoIme's own `DummyEditable`. The EditText
  re-entrancy (the TextWatcher firing again for fixup's own replacements) is not modelled.
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
`ScenarioRunner`, `GoldenWriter`). The debug APK needs `wk-content.db` in the assets.

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
