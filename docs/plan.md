# MojiMori — Implementation Plan

Companion to [spec.md](spec.md) (v0.4). Sizes are rough: S = a session or two, M = about a
week of part-time work, L = several weeks. Phases 1 and 2 are independent and can run in
parallel.

## Phase 0 — Decisions and scaffold (S)

Tasks
- Confirm the open decisions in spec §14 (stack, component naming, gate default, practice
  weights, vocabulary intensity).
- Create the Gradle multi-module skeleton from spec §8 with Kotlin, Compose, Hilt, Room.
- Add GitHub Actions: build, JVM tests, lint, signed APK artifact. Add `LICENSE` (Apache-2.0
  for code). Generated databases and `content/seed_words/` are git-ignored.
- `uv init tools/content` with pinned Python deps.

Exit criteria: empty app installs and shows a placeholder dashboard; CI green.

## Phase 1 — Content pipeline v1, N5 only (M)

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

Exit criteria: `uv run build --blocks N5` is deterministic, passes validation with and without
seed lists, every N5 level has 80–120 words, and the report shows correct series for 工, 交, 青,
生 as smoke tests. With a WaniKani-style seed present, the report shows near-complete placement
of its N5-kanji words.

## Phase 2 — Domain core: SRS, gating, sampler (M)

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

## Phase 3 — App MVP loop (L)

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
