# Scenario replay

`scenarios.golden.test.ts` replays every `scenarios/*.json` fixture on the core. The scenario
definitions (the DSL) are in `app/test/golden-scenarios/` and are read for the one option a fixture
doesn't carry (`exportMode`).

## How it works

- `runner.ts`: case `00-start` builds a fresh `LearnerDb` (core/progression: content with the extra
  kanji, WaniKani order, empty progress), seeds `rs.rng` (`SeededRandom(seed)`, the app's shared
  random source) and restores the recorded start file at T0. Every later case moves the clock
  (`advanceHours`, `advanceSeconds`, `atHours`, `atMs`, `atLastProbationSlot`), checks it against the
  recorded `atMs`, runs the action and takes the snapshot (level, curriculum, counts, fast travel
  status, level test status, sync reminder, export or `exportDelta`).
- What the action resolves (`resolved`: picked ids, timings, rounds) must equal the recorded
  `input.resolved`, or the step fails with "resolved differs". A `generate`d restore file is the one
  thing read from it (`resolved.file`).
- `TypedError`s thrown by core code are recorded as `result: {error, message}`; other errors fail
  the step. After a failed step the rest of the scenario is reported as "blocked by …".
- `actions/index.ts` merges the action groups; a name defined twice throws. An unknown action fails its
  step with `not implemented: <action>`.
- Action groups keep their own state in `rs.ext.<group>` (e.g. `rs.ext.session`); `restore` and
  `exportRestore` delete `rs.ext.session`, as a restore clears the session items.
- `select.ts`: picks available lessons/reviews with `{object, level, ids, exclude, limit}`, for
  session actions too.

Run: `npx vitest run test/golden/scenarios.golden.test.ts -t <scenario-name>`; results per file are
in `test/golden-results/scenarios__<name>.json.json`.

## Status

All 115 scenarios replay exactly (889 of 889 cases: 115 starts and 774 steps), with no exceptions.

## Action inventory

"Scenarios" counts the scenarios using the action.

| Action | Scenarios | Implemented in |
|---|---|---|
| lesson | 28 | actions/base.ts (a lesson result via `core/progression` `reportLocal`) |
| review | 28 | actions/base.ts (a review result, incl. the fast-travel probation check) |
| snapshot | 24 | actions/base.ts |
| grind | 18 | actions/base.ts (all `until` forms incl. `onlyLastProbationSlot`, `noProbation`) |
| restore | 19 | actions/base.ts (`pushed`, `inline`, `fromStep`, `generate`) |
| exportRestore | 18 | actions/base.ts |
| switchCurriculum | 16 | actions/curriculum.ts |
| fastTravel | 13 | actions/fastTravel.ts (`core/fastTravel`) |
| hideSubject | 11 | actions/base.ts (`ids`, `where`, `ids: "changed"`, `update`) |
| previewCurriculum | 6 | actions/curriculum.ts |
| unhideSubject | 6 | actions/base.ts |
| place | 1 | actions/curriculum.ts |
| advance | 1 | actions/base.ts |
| progressionUpdate | 1 | actions/base.ts |
| sessionStart | 43 | actions/session.ts (`core/session` `Session`) |
| sessionAnswer | 38 | actions/session.ts |
| sessionFinish | 32 | actions/session.ts |
| importWaniKani | 14 | actions/importer.ts (`core/importer`) |
| sessionStartQuiz | 11 | actions/session.ts |
| sessionAbandon | 8 | actions/session.ts |
| levelTestRound | 5 | actions/levelTest.ts (`core/levelTest` `startRound1/2`, `onSessionFinishing`) |
| levelTestResult | 5 | actions/levelTest.ts |
| sessionButton | 5 | actions/session.ts |
| levelTestStartAtResult | 3 | actions/levelTest.ts |
| sessionWrapUp | 3 | actions/session.ts |
| sessionRestart | 4 | actions/session.ts |
| sessionBackToPresentation | 3 | actions/session.ts |
| sessionAdvance | 2 | actions/session.ts |
| sessionPresentationNext | 2 | actions/session.ts |
| sessionInspect | 2 | actions/session.ts |
| sessionAnkiButton | 1 | actions/session.ts |
| levelTestDiscard | 1 | actions/levelTest.ts |
| dashboard | 3 | actions/dashboard.ts (`core/dashboard`: timeline, level progress, SRS breakdown; the step's `settings` go into `rs.ext.prefs`, defaults for keys never set) |
| sessionPresentationPrevious | 1 | actions/session.ts |

## Level test hooks

`sessionStart {type: SELF_STUDY, levelTestRound: 1 | 2}` picks its subjects with
`startRound1(db, rng)` / `startRound2(db, rng)` from `core/levelTest`, where `rng` is
`levelTestRandom(rs)` from `actions/levelTest.ts` (a fresh `SeededRandom` with the test seed, not the
shared `rs.rng`). Both return subject ids in pick order and set the persisted round flag
(`isRoundActive(db)`). When a session finishes (before the items are cleared) the engine calls
`onSessionFinishing(db, sessionType, items)` with every session item as
`{id, hasIncorrectAnswers, abandoned, finished}` (finished: not active, or all questions done). It
records the answers only for a round's exact ids and clears the flag; the flag is persisted state, so
a restarted session still counts.

## Session engine

`actions/session.ts` implements all 14 `session*` actions on `core/session`'s `Session` (sessions,
questions and session items). State: `rs.ext.session` is the stored part (the session item rows and
the session properties; `restore` deletes it, and the live session is then `reset()`, as a restore
does in the app), `rs.ext.sessionLive` the live `Session` (replaced on `sessionRestart`, then
`load()`), `rs.ext.prefs` the preferences the steps set. Jobs run at once in scheduling order and are
listed per step; ordering comes from `settingsOrdering`, the level test hooks from `core/levelTest`
(`onSessionFinishing`, the round flag). Randomized inflections pick from `SessionEnv.inflectionRng`,
`rs.ext.inflectionRng` = `new SeededRandom(seed)` for the whole scenario; with the setting on,
`sessionAnswer` lists `characters` (`Session.questionCharacters`) before answering.
