# Scenario replay

`scenarios.golden.test.ts` replays every `scenarios/*.json` fixture on the TypeScript core. The
fixtures were recorded by the Java `ScenarioRunner` and `SessionDriver`
(`durtles/app/src/androidTest/java/com/smouldering_durtles/wk/test/golden/`); the scenario
definitions (the DSL) are in `durtles/app/src/androidTest/assets/golden-scenarios/` and are read for
the one option a fixture doesn't carry (`exportMode`).

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

## Status (wave 2a)

51 of 109 scenarios pass completely; every other one fails first on an action that isn't ported yet
(no failure is a wrong result of a ported action).

| Prefix | Passing | Blocked by |
|---|---|---|
| wk-* | 13/13 | |
| time-* | 9/9 | |
| ft-* | 11/11 | |
| jlpt-* | 5/5 | |
| progress-* | 3/3 | |
| restore-* | 3/3 | |
| cur-* | 5/6 | importWaniKani |
| reminder-* | 2/3 | importWaniKani |
| import-* | 0/12 | importWaniKani |
| lt-* | 0/5 | levelTestRound |
| real-progress | 0/1 | dashboard, then session* |
| anki-* | 0/6 | session* |
| session-* | 0/32 | session* |

## Action inventory

"Scenarios" counts the scenarios using the action; "blocks" counts those where it is the first
missing action.

| Action | Scenarios | Blocks | Implemented in |
|---|---|---|---|
| lesson | 28 | | actions/base.ts (`ReportSessionItemJob` LESSON via `core/progression` `reportLocal`) |
| review | 28 | | actions/base.ts (REVIEW, incl. `FastTravel.onReviewed`) |
| snapshot | 24 | | actions/base.ts |
| grind | 18 | | actions/base.ts (all `until` forms incl. `onlyLastProbationSlot`, `noProbation`) |
| restore | 18 | | actions/base.ts (`pushed`, `inline`, `fromStep`, `generate`) |
| exportRestore | 18 | | actions/base.ts |
| switchCurriculum | 16 | | actions/curriculum.ts |
| fastTravel | 13 | | actions/fastTravel.ts (`core/fastTravel`) |
| hideSubject | 11 | | actions/base.ts (`ids`, `where`, `ids: "changed"`, `update`) |
| previewCurriculum | 6 | | actions/curriculum.ts |
| unhideSubject | 6 | | actions/base.ts |
| place | 1 | | actions/curriculum.ts |
| advance | 1 | | actions/base.ts |
| progressionUpdate | 1 | | actions/base.ts |
| sessionStart | 39 | 38 | TODO wave 2b: session engine |
| sessionAnswer | 35 | | TODO wave 2b: session engine |
| sessionFinish | 29 | | TODO wave 2b: session engine |
| importWaniKani | 14 | 14 | TODO wave 2b: importer |
| sessionStartQuiz | 10 | | TODO wave 2b: session engine (lesson presentation) |
| sessionAbandon | 7 | | TODO wave 2b: session engine |
| levelTestRound | 5 | 5 | TODO wave 2b: level test |
| levelTestResult | 5 | | TODO wave 2b: level test |
| sessionButton | 5 | | TODO wave 2b: session engine (undo, ignore, skip, lightning toggle) |
| levelTestStartAtResult | 3 | | TODO wave 2b: level test |
| sessionWrapUp | 3 | | TODO wave 2b: session engine |
| sessionRestart | 3 | | TODO wave 2b: session engine (resume from saved items) |
| sessionBackToPresentation | 3 | | TODO wave 2b: session engine (lesson presentation) |
| sessionAdvance | 2 | | TODO wave 2b: session engine |
| sessionPresentationNext | 2 | | TODO wave 2b: session engine (lesson presentation) |
| sessionInspect | 2 | | TODO wave 2b: session engine |
| sessionAnkiButton | 1 | | TODO wave 2b: session engine (Anki path, `core/anki`) |
| levelTestDiscard | 1 | | TODO wave 2b: level test |
| dashboard | 1 | 1 | TODO wave 2b: dashboard |
| sessionPresentationPrevious | 1 | | TODO wave 2b: session engine (lesson presentation) |

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
