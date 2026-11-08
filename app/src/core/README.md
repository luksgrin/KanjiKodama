# `src/core`: the learning logic, in plain TypeScript

SRS, unlocks, sessions, answer checking, search, curriculum, the level test, progress files and the
importer. Every module is pinned by the golden fixtures (`app/test/golden/`, see the README there).

## Rules

- **No imports outside `src/core/`.** No React, DOM, Dexie, sql.js, Capacitor, no packages and no
  `node:` builtins. `node scripts/check-core-imports.mjs` (also in `npm run check`) enforces it;
  `*.test.ts` files are exempt.
- **Time is an argument.** Functions take `now: number` (epoch ms, as stored in the progress file);
  nothing here reads a clock. Constants and `topOfHour` are in `time.ts`.
- **Randomness is an argument.** Take a `Rng` (`rng.ts`). Tests pass `new SeededRandom(seed)`, a
  48-bit linear congruential generator whose draws the fixtures record. Use the matching helper:
  - shuffle by swapping from the end → `shuffleInPlace(list, rng)`
  - shuffle by removing at random → `shuffleByRemoval(list, rng)`
  - a bounded integer → `rng.nextInt(n)`
  - an independent uniform double → `rng.nextDouble()` from a generator of its own (e.g.
    `SessionEnv.inflectionRng` for the randomized inflection picks)
  Draw in the same order as before, or seeded fixtures stop matching.
- **Content comes in as data**: `Content`, `ContentSubject`, `SrsSystemData` in `content.ts` (the
  static columns of the content DB, JSON parts with the stored field names such as
  `accepted_answer`). `src/content/readContent.ts` maps DB rows to them. Progress (stages, times,
  synonyms, notes) is separate.
- **Keep the pinned behaviour.** When a fixture pins an odd behaviour, keep it and say so in a
  comment; a deliberate change goes in `test/golden/exceptions.json` with a reason (see below).

## Shared helpers outside the module folders

- `settings/`: the user's settings (`Preferences`, stored values by key) and one getter per setting,
  with its default and the `enable_advanced` gate. Add the ones your module needs there.
- `text/richText.ts`: `escapeHtml` and `renderHtml` (the small markup the logic builds) as
  `{text, spans}`, for subject info lines and Anki answers.
- `progression/`: `LearnerDb`, the in-memory learner database (content layout, progress, curriculum
  state) the local-mode logic works on, with `reportLocal` (a lesson or review result in local
  mode), `updateProgression`, restore/export, curriculum switching and placement. Session, level
  test, importer and dashboard code take a `LearnerDb`; the golden scenario runner
  (`test/golden/scenario/`) drives it.
- Typed errors: throw `TypedError` from `kana/typedError.ts` (`errorType` is the name the fixtures
  record, e.g. `NullPointerException`).

## Semantics the core keeps (and JavaScript doesn't by default)

- **Integers.** Integer division truncates: `Math.trunc(a / b)`. 32-bit overflow: `(x | 0)`;
  64-bit values stay below 2^53 here (ids, ms), so plain numbers work, but products of two large
  values may not (see `rng.ts`).
- **Strings are UTF-16 units.** Index with `s[i]`/`s.length`; don't iterate with `for…of` or
  `[...s]` (code points) where the logic walks units.
- **Trimming** strips only chars `<= U+0020`. JS `trim()` also strips NBSP, U+3000 and other
  Unicode spaces: use `trimControlChars`.
- **Regex `\s`, `\w`, `\d`** are meant ASCII-only. JS `\s` is Unicode-aware: use explicit classes
  such as `[ \t\n\x0B\f\r]`.
- **Case mapping** follows Unicode's special casing in a non-Turkish locale; JS `toLowerCase()` is
  close but not identical for a few characters (e.g. final sigma context).
  `answers/unicode-android*.json` records the lower-casing and character types that matter.
- **Character types** (letter, digit, …) come from `answers/unicode-android-table.json`, or Unicode
  property escapes checked against it.
- **Sorting** is stable (`Array.prototype.sort`); strings compare by UTF-16 units (`<`), never
  `localeCompare`.
- **Hash order.** Some outputs follow the iteration order of a hash set or map (e.g. tied
  `matchedAnswer`, see `answers/check-ties*`; `answer/stringHashOrder.ts`, `search/hashOrder.ts`).
- **Doubles** print as `1.0` where JS prints `1`. The fixtures hold numbers as JSON numbers, so
  compare values; format them only where the logic builds text from them.

## Golden tests

Register adapters in `app/test/golden/<area>.golden.test.ts` with `goldenSuite` from
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
