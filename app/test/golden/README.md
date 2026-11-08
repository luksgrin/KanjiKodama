# Golden test fixtures

About 388,000 frozen reference results for the core (`app/src/core/`), as input/output cases. A
golden test loads a fixture, feeds each case's `input` to the core function and compares the result
with `output`. A failing case means the core's behaviour changed.

The fixtures are frozen: no tool writes them. `manifest.json` lists every file with its sha256 and
case count, and `node scripts/golden-manifest.mjs --check` fails if one changed, appeared or
disappeared. The repository is private and the fixtures include real WaniKani text (the per-subject
answer checks, `curriculum/jlpt-plan-content.json`, romanized readings); the content database they
were built from (`content/private/wk-content.db`) stays git-ignored and `manifest.json` records its
sha256.

## File format

UTF-8, LF line endings, a trailing newline.

`.json`: one document, one compact case per line:

```json
{
  "area": "srs.newStage",
  "cases": [
    {"name":"system1-stage1-incorrect0","input":{...},"output":{...}},
    ...
  ]
}
```

`.jsonl` (large files): line 1 is the header `{"area":...}`, every further line one case
`{"name":...,"input":...,"output":...}`.

- `name` is unique within a file and is the test's case name.
- 64-bit integers are JSON numbers; every id and timestamp here is below 2^53.
- Doubles are written in their shortest form with an exponent for very large or small values
  (`0.6`, `1.0`, `1.0E-4`): compare them as numbers.
- A case whose call fails records the error in `output`, e.g.
  `{"ok":false,"error":"org.json.JSONException","message":...}`.

Scenario files (`scenarios/<name>.json`, area `scenario`) replay a whole learner history. Case
`00-start` holds the starting state `{mode, seed, clockStartMs, startFile}` (`startFile` is the
progress file restored first); then one case per step `NN-<action>` with
`input: {action, args, atMs, resolved}` and a snapshot `output: {clockMs, result, level, curriculum,
counts, fastTravel, levelTest, reminders, export}`. `resolved` holds the concrete ids each step used,
so a scenario replays without its random draws. The scenario definitions are in
`app/test/golden-scenarios/`; `scenario/README.md` describes the runner.

## Files

| Directory | Files | Cases | Areas |
|---|---|---|---|
| `anki/` | 4 | 10,278 | `anki.answerInflection`, `anki.answerText`, `anki.inflectionRandom`, `anki.modeSettings` |
| `answers/` | 37 | 362,635 | `answers.check`, `answers.checkSubjects`, `answers.checkTies`, `answers.fuzzy`, `answers.matchingKanjiDevice`, `answers.matchingKanji`, … |
| `curriculum/` | 3 | 1,359 | `curriculum.jlptPlan.content`, `curriculum.jlptPlan`, `curriculum.placement` |
| `kana/` | 8 | 11,091 | `kana.convert`, `kana.edge`, `kana.fixupEditText`, `kana.fixupKeys`, `kana.fixup`, `kana.keysSession`, … |
| `levelTest/` | 1 | 342 | `levelTest.estimators` |
| `progress/` | 3 | 66 | `progress.roundTrip`, `progress.describe`, `progress.tsRoundTrip` |
| `scenarios/` | 115 | 889 | `scenario` |
| `search/` | 5 | 572 | `search.advancedForm`, `search.advanced`, `search.content`, `search.level`, `search.ranking` |
| `server/` | 1 | 50 | `server.normalize` |
| `srs/` | 3 | 704 | `srs.newStage`, `srs.outcome`, `srs.systems` |
Inputs (not results, listed under `inputs` in the manifest): `progress/android-export.json` (the
owner's real progress file, 2026-10-18: JLPT order, level 6, 1,034 subjects) and
`progress/ts-export/*.json` (progress files written by the core, `progress-ts-inputs.ts`).

Files marked "needs content" in their test skip, with a message, when the private content database
is missing.

## Running

```sh
cd app
npx vitest run test/golden                # every fixture is one test
npm run golden:coverage                   # every fixture has an adapter and passes
node scripts/golden-manifest.mjs --check  # every fixture and input present with its sha256
node scripts/golden-manifest.mjs          # refreshes only the inputs list (files the core writes)
```

Adapters live in `<area>.golden.test.ts` (`goldenSuite` from `harness.ts`). A deliberate change of
behaviour goes in `exceptions.json` (the case names it no longer has to match, with the reason),
never into the fixture itself.

## What some results pin

- **Level progress** counts kana-only vocabulary in the vocabulary bar (totals, passed counts and
  stage buckets); there is no separate kana-only bar.
- **Dashboard settings:** `show_over_level_progression` makes bars for every level up to the
  highest one granted (60 in local mode). Bars with no subjects are dropped; levels above the user
  level are kept even when everything in them is locked. With `previous_level_progression_limit`
  on, bars below `userLevel - amount` are dropped; the amount is the string
  `previous_level_progression_limit_amount` parsed as an integer (default `"1"`; `"abc"`, `""` and
  `" 1"` give 1; `"0"` keeps the user level and above; `"-1"` drops the user level too).
- **Sync reminder:** never set in local mode, which unlocks on the spot; in server mode a review
  that makes a radical or kanji pass for the first time sets it and the assignment sync clears it.
- **Unknown subject ids:** the WaniKani import skips progress for unknown subjects and reports how
  many it skipped; restores drop unknown ids, including their probation rows. Hidden and extra
  subjects take progress normally but only become lessons and reviews where their curriculum level
  allows (extras in JLPT order).
- **する verbs** in randomized inflections use the stem `し` before the negative endings
  (`運転しない`, `しなくて`, `しなかった`), not a doubled `な`.
- **Search** matches characters, meanings and readings only (not notes or synonyms) and has no
  romaji-to-kana conversion.
