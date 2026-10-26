# Scenario replay

`scenarios.golden.test.ts` replays every `scenarios/*.json` fixture on the TypeScript core. The
fixtures were recorded by the Java `ScenarioRunner` and `SessionDriver` of the retired Java app
(`durtles/app/src/androidTest/java/com/smouldering_durtles/wk/test/golden/`, removed after commit
94abf2e; see `../README.md`). The scenario definitions (the DSL) moved to `web/test/golden-scenarios/`
and are read for the one option a fixture doesn't carry (`exportMode`).

## How it works

- `runner.ts`: case `00-start` builds a fresh `LearnerDb` (core/progression: content with the extra
  kanji, WaniKani order, empty progress), seeds `rs.rng` (`JavaRandom(seed)`, the app's shared
  `ObjectSupport` random) and restores the recorded start file at T0. Every later case moves the clock
  (`advanceHours`, `advanceSeconds`, `atHours`, `atMs`, `atLastProbationSlot`), checks it against the
  recorded `atMs`, runs the action and records the Java snapshot (level, curriculum, counts, fast
  travel status, level test status, sync reminder, export or `exportDelta`).
- What the action resolves (`resolved`: picked ids, timings, rounds) must equal the recorded
  `input.resolved`, or the step fails with "resolved differs". A `generate`d restore file is the one
  thing read from it (`resolved.file`), as the Java runner intends.
- `JavaException`s thrown by core code are recorded as `result: {error, message}` like Java; other
  errors fail the step. After a failed step the rest of the scenario is reported as "blocked by …".
- `actions/index.ts` merges the action groups; a name defined twice throws. An unknown action fails its
  step with `not implemented: <action>`.
- Action groups keep their own state in `rs.ext.<group>` (e.g. `rs.ext.session`); `restore` and
  `exportRestore` delete `rs.ext.session`, as the Java reset deletes the session items.
- `select.ts`: `ScenarioRunner.select` (available lessons/reviews with `{object, level, ids, exclude,
  limit}`), for session actions too.

Run: `npx vitest run test/golden/scenarios.golden.test.ts -t <scenario-name>`; results per file are
in `test/golden-results/scenarios__<name>.json.json`.

## Status (end of step 3)

All 115 scenarios replay exactly (889 of 889 cases: 115 starts and 774 steps), with no exceptions. Every action in the
inventory below is implemented. Together with the other fixtures: 172 of 172 files, 387,902 of
387,902 cases pass (`npm run golden:coverage`).

## Action inventory

"Scenarios" counts the scenarios using the action; "blocks" counts those where it is the first
missing action.

| Action | Scenarios | Blocks | Implemented in |
|---|---|---|---|
| lesson | 28 | | actions/base.ts (`ReportSessionItemJob` LESSON via `core/progression` `reportLocal`) |
| review | 28 | | actions/base.ts (REVIEW, incl. `FastTravel.onReviewed`) |
| snapshot | 24 | | actions/base.ts |
| grind | 18 | | actions/base.ts (all `until` forms incl. `onlyLastProbationSlot`, `noProbation`) |
| restore | 19 | | actions/base.ts (`pushed`, `inline`, `fromStep`, `generate`) |
| exportRestore | 18 | | actions/base.ts |
| switchCurriculum | 16 | | actions/curriculum.ts |
| fastTravel | 13 | | actions/fastTravel.ts (`core/fastTravel`) |
| hideSubject | 11 | | actions/base.ts (`ids`, `where`, `ids: "changed"`, `update`) |
| previewCurriculum | 6 | | actions/curriculum.ts |
| unhideSubject | 6 | | actions/base.ts |
| place | 1 | | actions/curriculum.ts |
| advance | 1 | | actions/base.ts |
| progressionUpdate | 1 | | actions/base.ts |
| sessionStart | 43 | | actions/session.ts (`core/session` `Session`) |
| sessionAnswer | 38 | | actions/session.ts (`core/session` `Session`) |
| sessionFinish | 32 | | actions/session.ts (`core/session` `Session`) |
| importWaniKani | 14 | | actions/importer.ts (`core/importer`) |
| sessionStartQuiz | 11 | | actions/session.ts (`core/session` `Session`) |
| sessionAbandon | 8 | | actions/session.ts (`core/session` `Session`) |
| levelTestRound | 5 | | actions/levelTest.ts (`core/levelTest` `startRound1/2`, `onSessionFinishing`) |
| levelTestResult | 5 | | actions/levelTest.ts |
| sessionButton | 5 | | actions/session.ts (`core/session` `Session`) |
| levelTestStartAtResult | 3 | | actions/levelTest.ts |
| sessionWrapUp | 3 | | actions/session.ts (`core/session` `Session`) |
| sessionRestart | 4 | | actions/session.ts (`core/session` `Session`) |
| sessionBackToPresentation | 3 | | actions/session.ts (`core/session` `Session`) |
| sessionAdvance | 2 | | actions/session.ts (`core/session` `Session`) |
| sessionPresentationNext | 2 | | actions/session.ts (`core/session` `Session`) |
| sessionInspect | 2 | | actions/session.ts (`core/session` `Session`) |
| sessionAnkiButton | 1 | | actions/session.ts (`core/session` `Session`) |
| levelTestDiscard | 1 | | actions/levelTest.ts |
| dashboard | 3 | | actions/dashboard.ts (`core/dashboard`: timeline, level progress, SRS breakdown; the step's `settings` go into `rs.ext.prefs`, Java defaults for keys never set) |
| sessionPresentationPrevious | 1 | | actions/session.ts (`core/session` `Session`) |

Also outside the scenarios: `answers/synonyms-storage.json` (no adapter yet) needs the importer and
the restore/progression ported here.

## Proposed wave 2b split

Each agent owns its core module folder and its action file; nobody edits another group's files.
`core/progression` (the `LearnerDb`, `reportLocal`, `updateProgression`, restore/export, curriculum
switching) and `core/fastTravel` are done and shared: extend them only for a real gap, and say so.

1. **Importer + synonyms storage**: `core/importer/` (`tasks/WaniKaniImporter.apply`: API envelopes →
   progress, unknown ids skipped, the summary text), `actions/importer.ts` (`importWaniKani`), and the
   `answers/synonyms-storage.json` adapter. Unblocks 14 scenarios (import-*, cur-switch-after-import,
   reminder-survives-levelup-and-restore).
2. **Level test**: `core/levelTest/` rounds, block scores over the JLPT layout
   (`core/progression` `layoutFor`), result, `startAtResult` with the 7-day probation spread, and
   `LevelTest.onSessionFinishing` as a function the session engine calls; `actions/levelTest.ts`
   (`levelTestRound`, `levelTestResult`, `levelTestStartAtResult`, `levelTestDiscard`). Unblocks
   lt-* (5); session-self-study-level-test and session-level-test-restart also need the session engine.
   `levelTestStatus`/`discardLevelTest` are already in `core/levelTest/status.ts`.
3. **Session engine**: `core/session/` (`model/Session` as a pure state machine over `LearnerDb`:
   queues, question choice with `rs.rng`, submit through `core/answer`, Don't know, retry, undo,
   ignore, skip, wrap-up, finish, abandon, restart from saved items, the lesson presentation, Anki
   answers, lightning mode) and `actions/session.ts` (every `session*` action, recording what
   `SessionDriver` records: state, queue, jobs, resolved settings). Reports go through
   `reportLocal`. The biggest piece: 38 scenarios.
4. **Session settings and order**: in `core/session/order*.ts` and `core/session/selection*.ts`
   (owned by this agent; the engine imports them): `SubjectSelectionRules`, the lesson, review and
   self-study order settings and comparators, size limits, question sequencing (reading/meaning
   first, back to back). Can start at once on the pure parts; the session-order-*,
   session-size-review and session-sequence-* scenarios pass when the engine's `sessionStart` calls
   them. Coordinate the `core/session` API with agent 3 (agent 3 owns `core/session/index.ts`).
5. **Dashboard**: `core/dashboard/` (`LiveTimeLine.computeTimeLine`, `LiveLevelProgress.computeLevelProgress`,
   `LiveSrsBreakDown.computeBreakDown`) and `actions/dashboard.ts`. Unblocks real-progress's dashboard
   steps (its sessions need agent 3).

Fast travel, the probation/reminder snapshots and curriculum switching were done in wave 2a.

## Level test hooks for the session engine

`sessionStart {type: SELF_STUDY, levelTestRound: 1 | 2}` (session-self-study-level-test,
session-level-test-restart) picks its subjects with `startRound1(db, rng)` / `startRound2(db, rng)`
from `core/levelTest`, where `rng` is `levelTestRandom(rs)` from `actions/levelTest.ts` (Java's
`ObjectSupport.newRandom()`: a fresh `JavaRandom` with the test seed, not the shared `rs.rng`). Both
return subject ids in pick order and set the persisted round flag (`isRoundActive(db)`).
When a session finishes (`Session.finish`, before the items are cleared) the engine calls
`onSessionFinishing(db, sessionType, items)` with every session item as
`{id, hasIncorrectAnswers, abandoned, finished}` (`SessionItem.hasIncorrectAnswers`, `isAbandoned`,
`isFinished`: state not ACTIVE, or all questions done). It records the answers only for a round's
exact ids and clears the flag; the flag is persisted state, so a restarted session still counts.

## Session engine (wave 2b)

`actions/session.ts` implements all 14 `session*` actions on `core/session`'s `Session` (a port of
`model/Session`, `Question` and `SessionItem`). State: `rs.ext.session` is the stored part
(`session_item` rows and the session properties; `restore` deletes it, and the live session is then
`reset()` like `ProgressStore.restore` does), `rs.ext.sessionLive` the live `Session` (replaced on
`sessionRestart`, then `load()`), `rs.ext.prefs` the preferences the steps set. Jobs run at once in
scheduling order and are listed per step; ordering comes from `settingsOrdering`, the level test hooks
from `core/levelTest` (`onSessionFinishing`, the round flag). With it every scenario replays. Randomized inflections
pick from `SessionEnv.inflectionRng`, `rs.ext.inflectionRng` = `new JavaRandom(seed)` for the whole scenario (the
Java base reset's `InflectionUtil.setRandomSourceForTesting(new Random(seed)::nextDouble)`); with the setting on,
`sessionAnswer` lists `characters` (`Session.questionCharacters`) before answering, like `SessionDriver`.
