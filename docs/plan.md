# MojiMori — Implementation Plan

## Pivot 2026-10-10: fork Smouldering Durtles

WaniKani provided a full content dump (in Smouldering Durtles' own database format) with
permission for internal use. The app is now an offline fork of
[Smouldering Durtles](https://github.com/jerryhcooke/smouldering_durtles) (Apache-2.0), imported
under `durtles/` as a git subtree so upstream fixes can still be pulled. The dump lives in
`wani-data/` and the generated `durtles/app/src/main/assets/wk-content.db` is built from it by
`durtles/tools/build_wk_asset.py`; both are git-ignored and never pushed.

There is one scheduler and two curricula. SRS timing is identical in both. A curriculum is only
the `level` and `lessonPosition` of each subject, so switching modes re-sorts what unlocks next
without touching progress.

| Step | Scope | Status |
|------|-------|--------|
| B1 | Offline fork in WaniKani order: bundled content import, local unlocks and level-ups (`durtles/.../local/`), no API calls, no login, no level cap | done 2026-10-10, verified on an API 36 emulator |
| B2 | Clean-up: account/API/sync settings and menu items hidden; resurrect and burn work locally; notes and synonyms stay local; local tasks (reference data, audio, pitch) run; provider ids renamed so it installs next to Smouldering Durtles; release signing via keystore.properties; manual release workflow builds the fork with content from MojiMoriData | done 2026-10-10 |
| B2b | Audio: the dump only has links to WaniKani's public file server. Decided: not vendored. Audio stays an on-demand download cached on the device ("Download audio" screen; levels 1-10 are about 2,300 files, 56 MB) and can be deleted from the same screen | decided 2026-10-10 |
| B3 | Component and on'yomi teaching: a "Parts / Sound" section on every kanji page (lessons and item pages) showing each part's role, the phonetic component and its on'yomi, whether this kanji follows it, the series reliability over common kanji, and the other series members WaniKani teaches with their levels. Data: `durtles/app/src/main/assets/sound-components.db`, built from open data by `mojimori-content export-sound` (2,033 of 2,101 WaniKani kanji get parts, 1,307 a sound component). Follow-ups: a prediction prompt before the reading is revealed in lessons; fix questionable phonetic picks via `content/series_overrides.yaml` | done 2026-10-10 |
| A | JLPT curriculum mode with placement on switching and fast travel (design below). Follow-up: the N1 kanji WaniKani lacks would need content from open data | done 2026-10-12, verified on an API 36 emulator |

### Step A: JLPT order, placement and fast travel

- **Order.** Kanji are grouped into blocks N5, N4, N3, N2, N1 and Obscure (WaniKani kanji on no
  JLPT list), keep WaniKani's relative order inside a block, and are split evenly into levels of
  at least 30 kanji so all blocks fit in 60 levels (currently N5 3, N4 5, N3 11, N2 10, N1 27,
  Obscure 4). A radical goes to the level of the first kanji using it, a vocabulary item to the
  level of its last kanji, everything else by its WaniKani level. Code: `local/JlptPlan.java`.
  The kanji list is `durtles/app/src/main/assets/jlpt-kanji.tsv`, exported by
  `mojimori-content export-jlpt` from Waller's lists, KANJIDIC2's old JLPT field for gaps, and
  `content/jlpt_overrides.yaml`.
- **Shared progress.** Progress is per subject and shared by both orders. Switching rewrites the
  subject table's `level` and `lessonPosition`; WaniKani's own order is kept in the raw table
  `mm_wk_order` so switching back restores it exactly. Anything unlocked stays unlocked.
- **Placement.** After a switch (or a WaniKani import while in JLPT order) the learner lands on
  the first level where less than 60% of the kanji are mastered (Guru or above). Locked kanji
  below that level unlock right away as lessons (backfill). Code: `local/Placement.java`,
  `local/Curriculum.java`.
- **Fast travel (JLPT order only).** Jump up to 5 levels. Kanji and vocabulary of the skipped
  levels that were not started go on probation: Apprentice IV, first reviews spread hourly over
  3 days. Correct moves them to Guru; wrong sends them back to the lesson queue. Radicals of
  skipped levels wait in the lesson queue. The next jump needs 3 days and every probation item
  answered. Code: `local/FastTravel.java`; state in `mm_probation` and `mm_jump`.
- Saved progress files carry the mode, probation items and jumps.

### Extra kanji and the level test (done 2026-10-12, verified on an API 36 emulator)

- **Extra kanji.** The 259 JLPT kanji the WaniKani content lacks (258 N1 kanji WaniKani never
  taught plus 昌, which it retired) ship in `assets/extra-kanji.db`, exported by
  `mojimori-content export-extra`: KANJIDIC2 meanings and readings, the primary meaning and
  reading and both mnemonics from `content/mnemonics/extra-*.yaml` (hand-written, validated on
  export), up to three common JMdict words each (176 words for 118 kanji) with Tatoeba sentences
  and generated word mnemonics. The app imports them with ids from 100000 (`local/ExtraContent`),
  resolving components to WaniKani radicals by character. They sit on level 61 in WaniKani order
  (never unlocked) and at the end of N1 in JLPT order.
- **Level test** (`local/LevelTest`, `CurriculumUi`). Round 1: six unmastered kanji from each of
  N5..N1 in a self-study quiz; a kanji is known only if meaning and reading are both right, and
  one wrong answer settles it (the round ends on its own). The share of each block known is
  estimated from mastered kanji plus the sample; the boundary is the first block under 60%.
  Round 2: three kanji from up to six evenly spaced levels of that block; the result is the
  level after the last sampled level still at 60% or more. Starting there switches to JLPT order
  if needed, sends the kanji answered right to Guru and travels to the result with probation
  spread over 7 days.

The earlier Kotlin app (`app/`, `core/`, `feature/`) and the open-data pipeline (`tools/content`)
stay in the repo. The pipeline supplies the phonetic-series and JLPT data for B3 and A; the Kotlin
app is superseded and kept for reference until those steps no longer need it.

---

## Next: one codebase for Android and iOS (planned 2026-10-12)

### Stack

Kotlin Multiplatform with Compose Multiplatform: logic, data and UI are shared, and each
platform only implements a short list of system services behind small interfaces.

| Option | What carries over | Verdict |
|---|---|---|
| Kotlin Multiplatform + Compose Multiplatform | All logic (Java converts almost line by line), the existing Kotlin/Compose app and its plain-Kotlin core modules; Room already runs on both | Chosen |
| Flutter | Nothing (Dart rewrite) | Viable, no head start |
| React Native | Nothing (TypeScript rewrite) | Weaker for a heavily custom UI |

The fork is about 67,000 lines of Java, much of it for things MojiMori does not use (around 150
settings, a dozen themes, Anki mode, upstream's view-system screens). We rebuild the behaviour
we use, reading the Java as the reference, rather than converting files one by one. Expected
size: roughly 15,000-20,000 lines of Kotlin, plus the sync engine.

### Layout

```
shared/core   Plain Kotlin: SRS stages and intervals, answer checking (typo tolerance, synonyms,
              on'yomi/kun'yomi rules), romaji-to-kana, local progression, both curriculum
              orders, placement, fast travel, the progress file format
shared/data   content.db (read-only, built at build time), one progress DB per profile,
              the WaniKani sync engine (Ktor)
shared/ui     Compose screens and the Pixel Forest theme, fonts bundled as resources
androidApp/   Thin Android shell
iosApp/       Thin Xcode project hosting the shared Compose UI
```

Platform-specific code (Android / iOS):

| Feature | Android | iOS |
|---|---|---|
| Audio playback | Android media player | AVPlayer |
| Review notifications | Local notifications scheduled at known review times | Same |
| Save / restore files | System file picker (Google Drive works) | Files picker (Google Drive if its app is installed; iCloud Drive) |
| WaniKani token | Encrypted preferences | Keychain |
| Background sync | WorkManager | Background app refresh (best effort) |
| HTTP | Ktor, shared | Ktor, shared |

Design changes from the fork:

- The content DB stores both orders (WaniKani level/position and JLPT level/position) at build
  time; progress lives in a separate DB keyed by subject id. Switching curriculum becomes a
  setting instead of rewriting the subject table.
- The `mojimori-progress` JSON file stays the exchange format, so progress saved from the Android
  fork restores into the new app on either platform.

### Profiles

Each profile has its own progress DB; several can live on one phone, with a switcher on the
dashboard.

| | Local profile | WaniKani profile |
|---|---|---|
| Source of truth | The device | WaniKani's servers |
| Unlocks and level-ups | Computed locally | From WaniKani |
| Lessons and reviews | Saved locally | Sent to WaniKani, queued while offline |
| Content | Bundled | Bundled, kept current from the API |
| Curriculum | WaniKani or JLPT order, fast travel | WaniKani order only |
| Notes and synonyms | Local | Synced both ways |

The one-time WaniKani import stays as a way to start a local profile from an account. The sync
engine follows upstream's behaviour: incremental downloads (assignments, review statistics,
study materials, level progressions, subject updates), an offline queue for reviews, lessons and
notes with rate-limit-aware retries, a rejected-token state, and subscription level limits
(WaniKani only accepts lessons and reviews up to the account's subscribed level). Upstream's
web-login extras and support screens are not carried over.

### Phases

| # | Phase | Done when | Size |
|---|---|---|---|
| 0 | Setup and iOS spike: Xcode, convert the repo to Kotlin Multiplatform, one screen with a Zen Maru kanji and a romaji-to-kana answer field | Runs on the Android emulator, the iOS simulator and a real iPhone; Japanese answer input works on iOS | S |
| 1 | Shared logic ported with tests | The same test cases give identical results in the Java fork and the Kotlin code | M |
| 2 | Data: content DB builder (WaniKani content + sound components + JLPT list), progress DBs per profile, profile switcher, progress file import/export | A save file from the Android fork restores into the new app | M |
| 3 | Study loop: dashboard, lessons, reviews, summary | Usable daily on both platforms | L |
| 4 | Subject pages: mnemonics with WaniKani's markup, context sentences, parts and sound, stroke order, pitch accent, audio | Matches the fork's item pages | M-L |
| 5 | The rest: browse/search, self-study, notes/synonyms, curriculum and fast travel, WaniKani import, backups, notifications, the settings in use | Feature checklist complete | M |
| 5b | WaniKani profile: sync engine, offline queue, background sync | Reviews and lessons done in MojiMori appear on wanikani.com and the reverse; tested carefully on the real account, a few items at a time | M-L |
| 6 | Cutover: a week on both phones, move progress over, remove `durtles/` and the old prototype, iOS build job in CI | One codebase, two apps | S |

The Android fork stays the daily app until phase 6 and only gets bug fixes. The biggest
technical risk, Japanese text input in Compose on iOS, is tested in phase 0 before anything else
is built.

### Open decisions

1. iPhone installs: free Apple ID (Xcode install, expires after 7 days, up to 3 apps) or the Apple
   Developer Program ($99/year: one-year installs, TestFlight from the release workflow).
2. Which iPhone the app is for (with a free Apple ID it must be connected to the Mac weekly).
3. Xcode is not installed on the development Mac yet (free, about 15 GB); phase 0 needs it.
4. Settings to drop: Anki mode, upstream's other themes and most of upstream's settings, unless
   some are in use.

---

## Original plan (pre-pivot)

Companion to [spec.md](spec.md) (v0.4). Sizes are rough: S = a session or two, M = about a
week of part-time work, L = several weeks. Phases 1 and 2 are independent and can run in
parallel.

## Phase 0 — Decisions and scaffold (S) — done 2026-10-03

Tasks
- Confirm the open decisions in spec §14 (stack, component naming, gate default, practice
  weights, vocabulary intensity).
- Create the Gradle multi-module skeleton from spec §8 with Kotlin, Compose, Hilt, Room.
- Add GitHub Actions: build, JVM tests, lint, signed APK artifact. Add `LICENSE` (Apache-2.0
  for code). Generated databases and `content/seed_words/` are git-ignored.
- `uv init tools/content` with pinned Python deps.

Exit criteria: empty app installs and shows a placeholder dashboard; CI green.

## Phase 1 — Content pipeline v1, N5 only (M) — done 2026-10-03 (N5 and N4 both build)

Tasks
1. `fetch`: download KANJIDIC2, JMdict, KRADFILE/RADKFILE, KanjiVG, Tanos N5 kanji and
   vocabulary lists, Tatoeba pairs; pin URLs and checksums; cache under `tools/content/.cache/`.
   No network access to anything but these open sources.
2. `parse`: typed loaders for each format (KANJIDIC2 XML incl. grade, JIS codes and variant
   fields; JMdict XML incl. priority tags; KanjiVG SVG groups with `kvg:element`,
   `kvg:position`, `kvg:phon`).
3. `classify`: assign every KANJIDIC2 kanji to a block: N5…N1 from the JLPT lists, otherwise
   Obscure I–IV from grade and JIS level. Emit block counts to the report even though only N5 is
   built now, so the Obscure sizing is known early.
4. `select`: N5 vocabulary at ~100 words per level, ranked JLPT N5 word list → seed lists →
   JMdict priority tags → priority fill until each kanji has ≥ 4 words; kana-only strand. Seed
   loader: CSV of surface forms (+ optional reading), matched to JMdict, unmatched words logged.
   The build must pass with `content/seed_words/` empty.
5. `decompose`: per-kanji component tree from KanjiVG, flattened to the taught component set;
   component slugs and variant grouping; hand-named components in `content/components.yaml`.
6. `series`: derive phonetic candidates (component on'yomi vs kanji on'yomi, exact / regular
   variant rules), confirm with `kvg:phon`, apply `content/series_overrides.yaml`; compute
   reliability over the *whole* N5–N1 set even when building only N5.
7. `order`: topological sort on component dependencies → series clustering → frequency; cut
   into levels of ~25 kanji with global level numbers; apply `content/level_pins.yaml`.
8. `mnemonics`: generate structural scaffolds; merge hand-written text from
   `content/mnemonics/*.yaml`.
9. `sentences`: pick up to two Tatoeba sentences per word, preferring sentences whose kanji
   are all taught by that level.
10. `emit`: write `content.db` (schema in spec §9) and `report.html` (validation rules in
    spec §8, plus series tables, level listings, per-level word counts, block sizes).

Exit criteria: `uv run mojimori-content build -b N5` is deterministic, passes validation with
and without seed lists, every level has 80–180 words, and the report shows correct series for
工, 交, 寺 as smoke tests. With a seed list present, the report shows its placement.

Data freeze: raw upstream files are frozen in the private repo `luksgrin/MojiMoriData` as dated
GitHub releases (first snapshot `2026-10-03`, 14 files, 52 MB). `sources.lock.json` names the
snapshot and pins every checksum; `fetch` reads the snapshot first and only `fetch
--refresh-upstream` followed by `snapshot` moves to new upstream data.

Notes from the first builds: tanos.co.uk was unreachable, so the JLPT lists come from two MIT
mirrors of the same data (kanji-data JSON for kanji, elzup/jlpt-word-list for vocabulary).
KanjiVG leaves some stroke groups unnamed (the right half of 行, the top of 白); the pipeline
turns them into synthetic components named in `content/components.yaml`. Series reliability is
computed over N5–N1 and frozen before the build is trimmed to the requested blocks.

## Phase 2 — Domain core: SRS, gating, sampler (M) — done 2026-10-03

Pure Kotlin in `core/model` and `core/srs`, no Android dependencies.

Tasks
- Stage/interval table, review outcome → new stage, `available_at` truncation, vacation
  offset (spec §4.4).
- Unlock, level-up and block-gate evaluator (spec §4.5) over an in-memory snapshot.
- Lesson queue builder (components → kanji → vocabulary order within the current level).
- **Practice sampler** (spec §4.8): block weights from distance + Focus setting, staleness score,
  series bonus, refresher tagging, Soft-mode side effects as a returned list of actions.
- Answer checker: meaning normalisation + typo tolerance + blocklist; romaji→kana converter;
  on/kun "shake" detection.
- Tests: stage never below 1 or above 9; gate opens only when the rule says so; sampler block
  distribution over 10,000 draws matches configured weights within tolerance; sampler never
  returns locked items; converter round-trips every reading in the N5 content DB.

Exit criteria: 100 % of spec rules covered by JVM tests.

Delivered in `core/model` (Curriculum, Assignment, ReviewRecord, PracticeRecord, SrsSettings,
PracticeSettings) and `core/srs` (SrsStage, StageTransition, Scheduler, UnlockEngine,
LessonQueue, ReviewQueue, PracticeSampler, AnswerChecker, KanaConverter); 75 JVM tests. Times
are epoch milliseconds so the modules stay free of JVM/Android date types. Two behaviours worth
knowing: `KanaConverter.toHiragana` turns a trailing lone "n" into ん (for submitted answers)
while `toHiraganaLive` keeps it latin (for typing); the sampler's block weights are 60/25/15 at
Focus 0.5, uniform at 0, current-block-only at 1.

## Phase 3 — App MVP loop (L) — done 2026-10-03 (verified on an API 36 emulator)

Tasks
- `core/content`: Room entities/DAOs for `content.db`, prepackaged from assets, versioned,
  designed so a second database file (Obscure) can be attached later.
- `core/progress`: Room for progress, repository exposing Flows of assignments and due counts.
- Dashboard: "Level N · block nickname", counts, next review, level ring, Block-clear panel.
- Lessons: pager UI for the three item types, batch quiz, commit to Apprentice I.
- Reviews: prompt screen, kana input field, meaning field, stage-change feedback, session
  summary, wrong-answer info panel.
- Level-up screen and block-clear variant.
- Practice mode (kanji only): scope/length picker, shared prompt UI with refresher tag, summary
  by block, `practice_result` logging.
- Browse: blocks → levels → items; basic item detail pages.
- Japanese locale text rendering utility (`KanjiText`) and Klee One / Noto Sans JP fonts.

Exit criteria: full loop (lesson → 4 h → review → stage up → level-up) works on a device with
N5 content; a practice session draws N5 items with refresher tags once N4 is current; Compose
UI tests cover one review session and one practice session.

Delivered: `core/content` (asset copy + SQLite DAO), `core/progress` (Room), `core/study`
(StudyRepository, Hilt), `core/ui` (StrokeCanvas, SrsColors, QuestionCard), features
dashboard, lessons, reviews, practice, browse (blocks → levels → item and series detail), and
type-safe Navigation Compose routes. Verified by driving the app on a headless API 36 emulator
with adb (lesson batches and quizzes, dashboard, browse). Compose UI tests are still open and
move to phase 5. Known follow-up: a kanji that is also a component is taught twice at the same
level (component lesson + kanji lesson), as in WaniKani; consider merging the component lesson
into the kanji lesson when both share a level.

## Phase 4 — Component and phonetic teaching (M)

Tasks
- Decomposition diagram component with role colouring and position labels.
- On'yomi prediction card inside kanji lessons.
- Phonetic-series index and detail pages (member grid coloured by match type and SRS stage).
- Stroke-order canvas from KanjiVG paths with play/step controls, on component and kanji pages.
- Six-category intro page shown before the first 形声 kanji.

Exit criteria: every N5 kanji page shows a correct decomposition and, where applicable, its
series; a first-time user can explain why 江 is コウ after the lesson.

## Phase 5 — Notifications, settings, backup, polish (M)

Tasks
- WorkManager due-review notification and optional daily summary; notification permission flow.
- Settings screen (intervals, batch size, lesson cap, gate strictness, Practice focus, IME mode,
  undo, vacation).
- JSON export/import (incl. practice history); Auto Backup config.
- Credits screen generated from the `source` table.
- Dark mode pass, colour-blind check on stage colours, TalkBack pass.

Exit criteria: MVP checklist in spec §5 complete for N5.

## Phase 6 — Dogfood and N4 (M)

Tasks
- Run the pipeline for N5+N4; review the report; fix ordering, series overrides and per-level
  word counts.
- Use the app daily for two weeks; log friction in `docs/dogfood.md`; fix.
- Write hand mnemonics for N5 components and kanji.

Exit criteria: author is past N5 in the app with no blocking bugs; N4 content validated.

## Phase 7 — Expansion: N3–N1, drills, stats (L, ongoing)

Tasks
- Blocks N3, N2, N1 through the pipeline; review seed-list placement in the report (seed words
  whose kanji fall outside N5–N1 land in Obscure; unmatched ones are listed for a manual mapping
  in YAML).
- Practice mode: vocabulary scope, Soft setting, Focus slider, forgotten-Burned list.
- Drills (prediction, spotting, series recall) with per-series accuracy.
- Stats screen: heatmap, accuracy by type / series / block, forecast.
- Widget; TTS audio for vocabulary.
- Evaluate FSRS as an alternative scheduler behind a setting.

## Phase 8 — Obscure block (L)

Tasks
- Pipeline: build `obscure.db` for tiers I–IV with the same schema; kyūjitai/variant linking
  (`old_form_of`); scaffold-only mnemonics; zero-vocabulary allowed; size report (target well
  under 30 MB for ~10,000 SVG path sets).
- App: bundle and attach the second read-only database; Obscure sub-tier index; "old form of"
  link on kanji pages; Practice and gating treat Obscure as the block after N1.
- Validate the on'yomi heuristic pays off: report the share of Obscure kanji whose phonetic
  component is already taught by the end of N1.

Exit criteria: after clearing N1, level-ups continue into Obscure I without any extra step.

## Phase 9 — Personal deployment (S)

- CI builds a signed release APK on every tag; install by sideloading.
- In-app update check is unnecessary; a new tag means a new sideload. Progress survives because
  `progress.db` is separate from the content databases.
- Credits screen lists the open sources.

## Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Phonetic-series derivation is noisy | Reliability scores shown honestly; overrides YAML; validation report reviewed per block |
| JLPT lists are unofficial and disagree | Pick one source, document it, keep a "list version" field so lists can be swapped later |
| ~100 words per level overloads Apprentice | Vocabulary intensity setting; daily lesson cap; per-level counts validated at 80–120 |
| Mnemonic authoring is a large writing job | Ship structural scaffolds first; prioritise N5–N3; allow user notes from day one |
| No seed list available | Selection still works from JLPT lists + JMdict priorities alone; seeds only reorder |
| Obscure pack size and quality | Separate on-demand pack; exclude entries without meanings; scaffolds only |
| Leech kanji stall a Strict gate | Relaxed setting; leech surfacing on dashboard and via Practice Soft mode; reset/resurrect tools |
| Practice mode feels random or too easy | Staleness weighting + series bonus; Focus slider; refresher tags explain each pick |
| Stack lock-in for future iOS | Keep `core/model` and `core/srs` free of Android imports so KMP is possible |

## First three tasks to start with

1. Phase 0 scaffold: Gradle modules, CI, licences.
2. Phase 1 steps 1–3: fetchers, parsers and block classification with a report of block sizes
   (the real size of Obscure), and a KanjiVG parser test that prints the decomposition tree of
   江, 校, 清.
3. Phase 2: SRS stage transition function and the practice sampler, with tests.
