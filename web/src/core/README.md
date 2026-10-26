# `src/core`: the learning logic, in plain TypeScript

Step 3 of issue #3 ports the Java app's logic here, module by module. A module is done when its
golden fixtures (`web/test/golden/`, see the README there) pass.

## Rules

- **No imports outside `src/core/`.** No React, DOM, Dexie, sql.js, Capacitor, no packages and no
  `node:` builtins. `node scripts/check-core-imports.mjs` (also in `npm run check`) enforces it;
  `*.test.ts` files are exempt.
- **Time is an argument.** Functions take `now: number` (epoch ms, like Java's `Clock.now()` and the
  progress file); nothing here reads a clock. Constants and `topOfHour` are in `time.ts`.
- **Randomness is an argument.** Take a `Rng` (`rng.ts`). Tests pass `new JavaRandom(seed)`, a
  bit-exact port of `java.util.Random`, so seeded draws match the Java app. Use the helper that
  matches the Java call:
  - `Collections.shuffle(list, rnd)` / `ObjectSupport.shuffleInPlace` → `shuffleInPlace(list, rng)`
  - `ObjectSupport.shuffle(list)` (remove-at-random) → `shuffleByRemoval(list, rng)`
  - `random.nextInt(n)` / `ObjectSupport.nextRandomInt(n)` → `rng.nextInt(n)`
  - `Math.random()` → `rng.nextDouble()` from a generator of its own (Java's `Math.random()` is one shared
    `new Random()`; e.g. `SessionEnv.inflectionRng` for `InflectionUtil`'s picks)
  Draw in the same order as Java, or seeded fixtures stop matching.
- **Content comes in as data**: `Content`, `ContentSubject`, `SrsSystemData` in `content.ts` (the
  static columns of the content DB, JSON parts with the stored field names such as
  `accepted_answer`). `src/content/readContent.ts` maps DB rows to them. Progress (stages, times,
  synonyms, notes) is separate and will get its own types with the progress-file module.
- **Port behavior, keep Java's quirks.** If the Java code has a bug the fixtures freeze, port the
  bug and say so in a comment; differences we accept go in `test/golden/exceptions.json` with a
  reason (see below). Name functions after their Java source and cite it in a doc comment
  (`` `util/FuzzyMatching.cleanString` ``).

## Shared helpers outside the module folders

- `settings/`: the user's settings (`Preferences`, the `SharedPreferences` values by key) and getters named
  after their `GlobalSettings` method, with Java's defaults and the `enable_advanced` gate. Add the ones
  your module needs there.
- `text/richText.ts`: `escapeHtml` and `renderHtml` (`HtmlCompat` compact mode for the small markup the
  logic builds) as `{text, spans}`, for subject info lines and Anki answers.
- `progression/`: `LearnerDb`, the in-memory learner database (content layout, progress, curriculum
  state) the local-mode logic works on, with `reportLocal` (`ReportSessionItemJob` in local mode),
  `updateProgression` (`LocalProgression.update`), restore/export, curriculum switching and placement.
  Session, level test, importer and dashboard code take a `LearnerDb`; the golden scenario runner
  (`test/golden/scenario/`) drives it.
- Java exceptions: throw `JavaException` from `kana/javaException.ts` (`javaClass` is the simple class name
  the fixtures record).

## Java vs JavaScript pitfalls

- **Integers.** Java `int` division truncates: `Math.trunc(a / b)`. `%` behaves the same for
  negatives in both. 32-bit overflow: `(x | 0)`; `long`s stay below 2^53 here (ids, ms), so plain
  numbers work, but products of two large values may not (see `rng.ts`).
- **Strings are UTF-16 in both.** `charAt`/`length` match `s[i]`/`s.length`; don't iterate with
  `for…of` or `[...s]` (code points) where Java walks `char`s.
- **`String.trim`** strips only chars `<= U+0020`. JS `trim()` also strips NBSP, U+3000 and other
  Unicode spaces: don't use it for a Java `trim()`; write `javaTrim`.
- **Regex `\s`, `\w`, `\d`** are ASCII-only in Java (without flags) but Unicode-aware in JS for
  `\s`. Use explicit classes such as `[ \t\n\x0B\f\r]`.
- **Case mapping.** Java `toLowerCase()`/`toUpperCase()` use the default locale (non-Turkish on the
  device) and Unicode's special casing; JS `toLowerCase()` is close but not identical for a few
  characters (e.g. final sigma context). `answers/unicode-android*.json` records the device's
  lower-casing and `Character.getType` for the characters that matter.
- **`Character.getType`/`isLetterOrDigit`** have no JS equivalent with identical Unicode versions:
  derive from `answers/unicode-android-table.json` or Unicode property escapes checked against it.
- **Sorting.** `Collections.sort`/`List.sort` are stable, like `Array.prototype.sort`. Java
  `String.compareTo` compares UTF-16 units, like JS `<`; never use `localeCompare`.
- **Hash order.** `HashSet`/`HashMap` iteration order leaks into some outputs (e.g. tied
  `matchedAnswer`, see `answers/check-ties*`); the fixtures say where that is accepted.
- **Doubles.** Java prints `1.0` where JS prints `1`. The fixtures hold numbers as JSON numbers, so
  compare values; only port `Double.toString`/`String.format` where Java builds text from them.

## Golden tests

Register adapters in `web/test/golden/<area>.golden.test.ts` with `goldenSuite` from
`test/golden/harness.ts`:

```ts
import { goldenSuite } from './harness';
import { osaDistance } from '../../src/core/answer/osa';

goldenSuite<{ a: string; b: string }, number>('answers/osa.json', (input) => osaDistance(input.a, input.b));

// Needs the private content DB (skipped when absent): ctx.content / ctx.db
goldenSuite('answers/check-kanji-*.jsonl', (input, c, ctx) => check(ctx.content, input), { needsContent: true });
```

- The glob is relative to `test/golden/` (`*` within a folder, `**` across). One Vitest test per
  matching file runs all its cases and reports the first 20 failures (case name, JSON path of the
  first difference, expected vs actual) with full counts.
- `ctx.state` is a fresh object per file, for stateful replays (scenarios run their steps in order).
- Options: `compare` (custom equality; return null or a difference text), `filter` (run a subset),
  `maxReported`, `timeout`, `needsContent`.
- `test/golden/exceptions.json`: `{ "<fixture file>": { "<case name>": "<reason>" } }`. An
  excepted case may fail; an exception whose case passes or doesn't exist fails the file.
- Lower level: `readFixture(file)`, `matchFixtures(glob)`, `runFixture(file, adapter, options)`,
  `firstDifference(actual, expected)`.

Run:

```sh
npx vitest run test/golden/answer          # one area
npx vitest run test/golden                 # all golden suites
npm run golden:coverage                    # per fixture: adapter? pass/fail counts (add --all)
npm run check                              # typecheck, tests, core imports, build
```

## Where the Java lived

The Java app was removed from the repository after commit `94abf2e` (read it with
`git show 94abf2e:durtles/...` or `git worktree add /tmp/java 94abf2e`). It was in
`durtles/app/src/main/java/com/smouldering_durtles/wk/`: `local/` (KanjiKodama's offline logic:
`LocalProgression`, `JlptPlan`, `Placement`, `Curriculum`, `FastTravel`, `LevelTest`,
`ProgressStore`, `ServerMode`), `model/` (`Session`, `Question`, `SrsSystem`, `SubmitPrecheck`,
`SubmitFeedback`, `SubjectSelectionRules`), `util/` (`PseudoIme`, `KanaUtil`, `FuzzyMatching`,
`OptimalStringAlignmentDistance`, `SearchUtil`, `StudyMaterialsSupport`), `enums/` (`QuestionType`,
`SubjectType`), `jobs/` (`ReportSessionItemJob`), `tasks/` (`WaniKaniImporter`). The fixture
generators were in `durtles/app/src/test/java/.../golden/` (Tier A) and
`durtles/app/src/androidTest/java/.../test/golden/` (Tier B); read them to see exactly what each
case's input and output mean. Each module's `index.ts` lists its Java sources and fixtures.
