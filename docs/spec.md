# MojiMori (文字森) — Product & Technical Specification

Version 0.4 (draft) — 2026-09-29

Changes from 0.3: no dependency on WaniKani at all. Vocabulary is built from open sources; a
WaniKani word list, if one is available offline, is only an optional *seed* that steers which
words are picked first. No API, no account, no WaniKani content in the app.

Changes from 0.2: MojiMori is a personal, unreleased build that costs nothing to run; the
coverage workaround, progress import, Play Store release and on-demand asset delivery are gone.

Changes from 0.1: WaniKani-style numbered levels inside JLPT blocks; "Obscure" block after N1;
cross-block Practice mode; much larger vocabulary target.

## 1. Summary

MojiMori is an Android app for learning Japanese kanji. It keeps the WaniKani loop that works
(small lesson batches → spaced-repetition reviews → unlock chains from components to kanji to
vocabulary, numbered levels with level-ups) and adds what WaniKani does not do:

1. **JLPT-structured progression.** Levels are grouped into JLPT blocks (N5 → N4 → N3 → N2 →
   N1). A block must be cleared before the next block's kanji appear. A final **Obscure** block
   continues past N1 through every remaining kanji in the reference dictionary.
2. **Explicit component teaching.** Every kanji is taught as a structure of components. Each
   component is labelled by role (meaning-bearing, sound-bearing, or both), and the learner is
   trained to *predict the on'yomi* of a new kanji from its phonetic component before being told
   the answer.
3. **Cross-block Practice mode.** A dedicated mode that quizzes everything already learned,
   weighted toward the current block but regularly surfacing older kanji as surprise refreshers,
   including Burned items.
4. **A lot of vocabulary.** Roughly 100 words per level, all from open data: JLPT vocabulary
   lists and JMdict frequency data, optionally seeded by any word list the author drops into the
   pipeline (a WaniKani-style list is the obvious first seed).

MojiMori is a personal tool for its author. It is not published, sold or distributed, uses no
paid service, and depends on no third-party learning product. It is offline-first and
single-user. Learning content is built by a reproducible pipeline from open dictionaries and
shipped inside the app.

## 2. Goals and non-goals

### Goals

- Take a learner from zero kanji to full JLPT N1 kanji coverage in a fixed, block-coherent
  order, then onward through the Obscure block for as long as they want.
- Make the phono-semantic structure of kanji (形声文字) a first-class teaching object.
- Match WaniKani's ergonomics and feel: numbered levels, level-up moments, fast keyboard-driven
  answering, meaning + reading asked separately, SRS stage feedback, due-review notifications.
- Vocabulary volume at least comparable to WaniKani's (~6,500 words) by the end of N1, built
  entirely from open sources.
- Work fully offline. Progress never leaves the device unless the user exports it.
- Be honest about data: unofficial JLPT lists are labelled as such; every source is credited.

### Non-goals (for now)

- Grammar, listening or conversation practice.
- iOS, web or desktop clients (the domain layer is kept platform-neutral so this stays possible).
- Cloud accounts, social features, leaderboards.
- Being a dictionary. Browsing is limited to the curriculum.
- Public release (not planned; the all-open content would make it possible later).
- Paid services, accounts or third-party APIs anywhere in the pipeline or the app.
- Any runtime or build-time dependency on WaniKani.

## 3. Target user

One person: the author, who likes WaniKani's method but will not pay a subscription to learn
a language whose dictionaries are open. They want JLPT-aligned progression, real component
teaching, a large vocabulary for every kanji, and a path past N1, at zero running cost and with
no dependency on WaniKani. The design
still avoids anything that would break for a second user (no hard-coded personal data in the
code; everything user-specific comes from the pipeline configuration or the app's settings).

## 4. Pedagogical model

### 4.1 Curriculum structure

**Block** = one JLPT level, plus one final block. Six blocks: N5, N4, N3, N2, N1, Obscure.
Blocks are the hard gates (4.5).

**Level** = a numbered, WaniKani-style level (Level 1, Level 2, …) holding roughly 25 kanji,
the components those kanji need, and about 90–110 vocabulary words built from them. Levels are
numbered continuously across blocks, so the learner is always "on Level 37 (N3)". Levels are
the unit of day-to-day progression and of level-up celebrations, exactly as in WaniKani.

| Block   | Kanji (measured) | Levels | Level numbers | Nickname (forest theme) |
|---------|------------------|--------|---------------|-------------------------|
| N5      | 79               | 4      | 1–4           | Sprout                  |
| N4      | 166              | 7      | 5–11          | Sapling                 |
| N3      | 367              | 15     | 12–26         | Grove                   |
| N2      | 367              | 15     | 27–41         | Forest                  |
| N1      | 1,232            | 50     | 42–91         | Canopy                  |
| Obscure | 7,896            | 317    | 92–408        | Deep Woods              |

Counts come from the pipeline's classification of KANJIDIC2 against the JLPT lists (phase 1).

Kanji membership for N5–N1 comes from a documented community list (the JLPT has published no
official kanji list since 2010; see §6).

**The Obscure block** contains every kanji in KANJIDIC2 that is not in N5–N1 and has at least
one reading and one meaning. It is ordered in sub-tiers:

1. Obscure I — remaining jōyō kanji (jōyō kanji absent from all JLPT lists): 172.
2. Obscure II — jinmeiyō kanji (the name-kanji list): 587.
3. Obscure III — hyōgai kanji in JIS X 0208 level 1, by frequency: 297.
4. Obscure IV — JIS X 0208 level 2, then JIS X 0212/0213, by frequency where known: 6,840.

Old forms (kyūjitai, e.g. 學 for 学) and variants are included and taught as linked items
("old form of 学": same readings and meaning, its own stroke order). In the Obscure block the
minimum-vocabulary rule is relaxed (a kanji may have zero words) and readings are drilled on the
kanji itself. The Obscure content is shipped as a separate download so the base app stays small.

**Ordering inside a block** is computed by the content pipeline with these priorities:

1. Component dependency: a kanji never appears before every component it is built from.
2. Phonetic-series clustering: kanji sharing a phonetic component are placed in the same or
   adjacent levels so the pattern is visible while it is being learned.
3. Frequency (KANJIDIC2 newspaper frequency), then school grade, as tie-breakers.

Hand overrides (YAML in the repo) can pin a kanji to a level when the automatic order is
pedagogically awkward.

### 4.2 Item types

1. **Component (部品).** A graphical building block. This is a superset of the 214 Kangxi
   radicals, because the parts that carry *sound* (工, 交, 青, 生, 可, 寺 …) are usually not
   radicals at all. Each component has: a glyph (a Unicode character, or an SVG from KanjiVG
   when the shape has no code point), a name, a core meaning, variant forms (氵=水, 亻=人,
   忄=心, 扌=手, 阝 left vs right, 辶 …), typical positions, a role tendency (semantic,
   phonetic, or both), stroke order, and if it is itself a kanji, its on'yomi.
2. **Kanji.** Literal, meanings, on'yomi, kun'yomi, which reading is asked in reviews, block,
   level, grade, frequency, stroke count, stroke-order SVG, six-category type (see 4.3),
   its component tree with roles, phonetic-series membership, predicted vs actual on'yomi,
   meaning mnemonic, reading mnemonic, old-form link where applicable.
3. **Vocabulary.** A word that uses only kanji the learner has reached, or a common kana-only
   word. Teaches readings in context: which reading is on vs kun, rendaku (人々 ひとびと),
   okurigana, sokuon changes (学校 がっこう). Fields: word, readings, meanings, part of speech,
   JLPT level of the word, example sentences, notes.

   **Volume target**: every word on the JLPT vocabulary lists whose kanji are taught, plus at
   least 4 words per kanji in N5–N2 and 3 per kanji in N1, plus a kana-only strand spread over
   each block's levels. Measured on N5 and N4 that is 110–170 words per level (roughly 1,600
   words by the end of N4), heavier than WaniKani; the lesson cap keeps the daily load bounded.

   **Selection**: candidates are JMdict entries whose kanji are all taught by the target level.
   They are ranked, and the top of the ranking fills each level to its quota:
   1. words on the JLPT vocabulary list of the block;
   2. words present in any **seed list** in `content/seed_words/*.csv` (plain lists of surface
      forms; a WaniKani-style word list is the intended first seed, but the pipeline runs
      identically with the directory empty);
   3. JMdict priority tags (news1, ichi1, spec1, nf01–nf48), filling each level to about 100;
   4. remaining JMdict entries by priority until every kanji has ≥ 4 (N5–N2) or ≥ 3 (N1) words.

   Words usually written in kana (JMdict `uk`) are taught in kana unless the JLPT list uses the
   kanji spelling. Rare or irregular kanji spellings are never used.

   A word is placed at the level where its last kanji is taught. Readings and meanings always
   come from JMdict. Every taught kanji outside Obscure has at least one word.
4. **Phonetic series (音符シリーズ).** A curriculum object, not an SRS item: one component,
   its canonical on'yomi, the kanji that contain it as a phonetic, and how reliably they follow
   the reading. Surfaces as lesson pages, a browsable index and drills.

### 4.3 Component roles and the on'yomi heuristic

The app teaches the six traditional categories (六書) in one short intro and then focuses on
the one that matters for guessing readings: **phono-semantic compounds (形声文字)**, which make
up the large majority of jōyō kanji. Each such kanji has a *semantic* component that hints at
meaning and a *phonetic* component that carries the on'yomi.

What the learner is taught, per kanji:

- **Structure pattern**: left-right (semantic left, phonetic right — the most common layout),
  top-bottom, enclosure, etc. The rule of thumb "the sound is usually on the right or bottom"
  is stated explicitly and reinforced every time it holds.
- **Role labels**: e.g. 江 = 氵 (semantic: water) + 工 (phonetic: コウ) → 江 is read コウ ✓.
- **Prediction before reveal**: in the lesson, the app shows the decomposition and asks
  "You know 工 = コウ. What do you expect 江 to be?" before showing the real reading. In
  reviews this is implicit; in drills (4.7) it is the whole exercise.
- **Reliability**: each series carries a reliability score computed over the N5–N1 kanji
  (Obscure rarities are excluded from the statistic). Members are classified as **exact** (same
  on'yomi), **regular variant** (voicing or vowel-length shift such as コウ→ゴウ, コウ→コ,
  ハク→バク), or **irregular** (anything else, e.g. コウ→クウ or コウ→カク). The learner sees
  "工 → コウ: 7 of 9 members follow the rule" and sees the exceptions named. Measured on the
  real data: 口→コウ 85 %, 工→コウ 78 %, 交→コウ 100 %, 寺→ジ 57 %.
- **Present but not phonetic**: some kanji contain a component that carries no sound (工 in 左).
  These are labelled so the learner learns *when not to* apply the heuristic.
- **Multi-reading components**: a component with two established series readings (生: セイ and
  ショウ) is taught with both.

Illustrative series (the pipeline computes the real membership from the data):

| Series | Reading | Follows the rule | Exceptions |
|--------|---------|------------------|------------|
| 工     | コウ    | 江 功 攻 紅 貢 項 巧 | 空 クウ (variant); 左 サ (工 not phonetic) |
| 交     | コウ    | 校 効 郊 絞      | 較 カク (irregular) |
| 青     | セイ    | 清 晴 精 請 静   | 情 ジョウ (irregular) |
| 生     | セイ/ショウ | 性 姓 星 牲  | 産 サン (irregular) |

In the Obscure block the heuristic becomes the main tool: most rare kanji are 形声 compounds
whose phonetic component the learner already knows, so lessons there lead with the prediction.

### 4.4 Spaced repetition

MojiMori uses WaniKani-style fixed SRS stages because the gating rules (4.5) are expressed in
stage names the learner understands. Intervals are configurable; defaults:

| SRS stage # | Name          | Interval to next review |
|-------------|---------------|-------------------------|
| 0           | Locked/Lesson | —                       |
| 1           | Apprentice I  | 4 h                     |
| 2           | Apprentice II | 8 h                     |
| 3           | Apprentice III| 1 day                   |
| 4           | Apprentice IV | 2 days                  |
| 5           | Guru I        | 1 week                  |
| 6           | Guru II       | 2 weeks                 |
| 7           | Master        | 1 month                 |
| 8           | Enlightened   | 4 months                |
| 9           | Burned        | never (resurrectable)   |

Rules:

- A review of an item asks **meaning** and **reading** as two separate prompts (components:
  meaning only). The item is complete when both have been answered.
- If both were correct on the first try, stage += 1.
- Otherwise `stage = max(1, stage − ceil(incorrect / 2) × penalty)` where `penalty` is 1 below
  Guru and 2 from Guru upward (WaniKani's formula), and `incorrect` counts wrong answers to
  either prompt during this review.
- `available_at = now + interval[new_stage]`, truncated to the hour so reviews arrive in
  batches.
- Lessons put an item at Apprentice I with the first review due in 4 hours.
- Lesson batch size default 5 (range 3–10), followed by a quiz over the batch. Optional daily
  lesson cap to control Apprentice load.
- Vacation mode freezes all `available_at` timestamps.
- Optional "undo last answer" (off by default).

A later version may swap the scheduler for FSRS while keeping the stage names as a presentation
layer (plan, phase 7).

### 4.5 Unlock and gating rules

- A **component** unlocks when its level becomes current.
- A **kanji** unlocks when every component it is taught with is at Guru I or above. A kanji
  that is itself an atomic component unlocks with its level.
- A **vocabulary** item unlocks when every kanji in it is at Guru I or above. Kana-only words
  unlock with their level.
- **Level n+1** (same block) unlocks when ≥ 90 % of level n's kanji are at Guru I or above
  (configurable). This is the WaniKani level-up moment: a level-up screen shows the new level,
  the block nickname, and the components about to be taught.
- **Block gate.** The next block's first level unlocks only when the current block is
  "cleared". Two settings:
  - **Strict (default)**: 100 % of the block's kanji at Guru I or above.
  - **Relaxed**: 95 %, for users stuck on a single leech.
  Vocabulary is *not* part of the gate: vocabulary from a cleared block keeps flowing as its
  kanji reach Guru, so the block boundary blocks only new kanji.
- The dashboard shows a "Block clear" panel listing exactly which kanji are holding the gate.
- The Obscure block has no exit gate; sub-tiers unlock in order under the normal level rule.

### 4.6 Lesson content

**Component lesson**: glyph, animated stroke order, name, meaning, variant forms, role note
("this component almost always carries the sound コウ"), preview of kanji it appears in.

**Kanji lesson**: decomposition diagram with role labels → on'yomi prediction card → readings
(the one asked in reviews is marked) → meanings → meaning mnemonic → reading mnemonic (for
regular series members the reading mnemonic is simply "工-series → コウ; no mnemonic needed")
→ example vocabulary → stroke order → six-category type → old form / modern form link.

**Vocabulary lesson**: word with furigana, reading breakdown per kanji (on/kun, rendaku,
sokuon marked), meanings, part of speech, two example sentences, audio, notes.

**Mnemonics** are original. The pipeline generates a structural scaffold from the component
names ("water + craftsman → 江, a river engineered by craftsmen"); hand-written text replaces
the scaffold over time; users can add their own notes and synonyms. Drafting may be assisted
by a language model during the content build, but every published mnemonic is human-reviewed.
Obscure-block items ship with scaffolds only.

### 4.7 Drills (targeted practice outside the SRS)

- **On'yomi prediction**: show a kanji (learned or not yet learned) that contains a learned
  phonetic component; the learner types the predicted reading; feedback shows whether the
  kanji is exact / variant / irregular for that series and updates a personal accuracy stat
  for the series.
- **Component spotting**: show a kanji, pick its components from a grid.
- **Series recall**: show a phonetic component, recall its reading and list members.

Drills never change SRS stages.

### 4.8 Practice mode (cross-block refresher)

A dedicated mode, separate from reviews and drills, that quizzes the learner on everything they
have already learned, weighted toward the present but deliberately reaching back.

- **Pool**: every kanji (optionally also vocabulary and components) with an assignment at
  Apprentice I or above, **including Burned items**, from the current block and every cleared
  block. Locked and never-learned items are excluded, so practice never leaks future content.
- **Sampling** is two-step.
  1. Pick a block. Weights decay with distance from the current block. Defaults: current block
     60 %, previous block 25 %, all older blocks share the remaining 15 % equally. A **Focus**
     slider in settings moves this between "almost only current" and "uniform across all".
  2. Pick an item inside that block with weight proportional to a *staleness* score: time since
     last review (or since burn), recent lapses, and low SRS stage all increase it. Items that
     share a phonetic series with kanji in the current level get a small bonus, so old members of
     a series come back exactly when the series is being extended.
- **Surprise refreshers**: an item from an older block is tagged when shown
  ("Refresher · N5 · Level 3"), so the learner knows why an easy kanji appeared, and the answer
  screen links to the item's series page.
- **Format**: identical prompt/answer UI to reviews (meaning and reading). Session lengths of
  10 / 20 / 50 / endless. Scope toggles: kanji only, kanji + vocabulary, everything.
- **Effect on SRS**: none by default. Optional **Soft** setting: a wrong practice answer never
  changes the stage, but pulls the item's next review forward to now (at most once per day per
  item) and flags it as a leech candidate on the dashboard. A Burned item answered wrong offers
  one-tap resurrection to Apprentice IV.
- Results are logged and feed Stats: accuracy per block, "forgotten Burned items", and a
  per-block staleness heat map.

### 4.9 Answer checking

- **Meaning**: trim, case-fold, accept any listed meaning or user synonym, typo tolerance via
  Damerau-Levenshtein with a threshold that scales with answer length (as WaniKani does), a
  per-item blocklist to stop near-miss collisions.
- **Reading**: kana exact match against any accepted reading. Input goes through a built-in
  romaji→kana converter (wanakana-style rules), with a setting to use the system Japanese IME
  instead.
- If a kanji review asks for on'yomi and the learner types a valid kun'yomi (or vice versa),
  the field shakes and re-asks; it is not marked wrong. Vocabulary readings must be exact.
- After a wrong answer the correct answer is shown with the item's info panel (mnemonic,
  components, series) one tap away.

## 5. Features by release

**MVP (v0.1, dogfood by the author)**
- N5 and N4 content complete (components, kanji, ~100 words per level, series).
- Dashboard, lessons, reviews, kana input, SRS, level-ups, block gate and Block-clear panel.
- Practice mode, kanji-only, default (non-Soft) behaviour.
- Item detail pages, stroke order animation, phonetic-series pages and index.
- Due-review notifications, settings, progress export/import (JSON), credits.

**v0.2**
- N3 content. Drills. Stats (review heatmap, accuracy by type, by series and by block,
  forecast, forgotten-Burned list).
- Practice mode: vocabulary scope, Soft setting, Focus slider.
- Home-screen widget (reviews due). Text-to-speech audio for vocabulary.

**v1.0**
- N2 and N1 content. Hand-written mnemonic coverage for N5–N3 at least.
- Obscure block as a second bundled database.
- Signed release build produced by CI and sideloaded.

**Later**
- Optional encrypted sync. Community-contributed mnemonics. Kotlin Multiplatform clients.
- FSRS scheduling option.

## 6. Content and data sources

| Source | Used for | Licence | Notes |
|--------|----------|---------|-------|
| KANJIDIC2 (EDRDG) | kanji readings, meanings, grade (incl. jinmeiyō grades 9–10), frequency, stroke count, JIS codes, variants/old forms, old 4-level JLPT | CC BY-SA 4.0 | The `jlpt` field is the pre-2010 scale; not used for N-levels. Defines the Obscure universe |
| JMdict (EDRDG) | vocabulary, glosses, part of speech, priority tags | CC BY-SA 4.0 | Priority tags drive vocabulary selection and ordering |
| KRADFILE / RADKFILE (EDRDG) | flat kanji → component sets | CC BY-SA 4.0 | Cross-checked against KanjiVG |
| KanjiVG | stroke-order SVGs, hierarchical decomposition, `kvg:position`, `kvg:radical`, `kvg:phon` | CC BY-SA 3.0 | `kvg:phon` marks phonetic components where known; used as the seed for series |
| JLPT kanji & vocabulary lists (Jonathan Waller, tanos.co.uk) | N-block membership for kanji; first-pass vocabulary per block | CC BY | Unofficial; labelled as such in the app |
| Tatoeba | example sentences | CC BY 2.0 FR | Prefer sentences using only learned kanji |
| Noto Sans JP, Klee One | display fonts | OFL 1.1 | Klee One for a handwriting-like large glyph |
| Android TextToSpeech | vocabulary audio (MVP) | platform | Requires a Japanese voice; degrade gracefully |
| Seed word lists (optional, `content/seed_words/*.csv`) | ranking boost for word selection only | whatever the list's origin allows for personal use | Plain CSV of surface forms. A community export of the WaniKani vocabulary list (~6,500 words) is the intended first seed. Nothing else is read from it; if the directory is empty the build still succeeds |

**Phonetic-series data** is derived, not downloaded: for each kanji, a component whose own
on'yomi (when it is a kanji in KANJIDIC2) matches the kanji's on'yomi exactly or as a regular
variant is a candidate phonetic; `kvg:phon` confirms or adds candidates; a hand-maintained
overrides file resolves the rest. Existing community datasets (e.g. the "Keisei" data used by
a WaniKani userscript) may be consulted for validation only unless their licence is confirmed
compatible.

**Seed word lists.** The app must not depend on WaniKani, so the only thing the pipeline can
take from it is *which words are worth teaching*. `content/seed_words/` holds zero or more CSV
files with one surface form per line (optional `reading` column to disambiguate homographs).
The `select` step matches each seed word to a JMdict entry by surface form (and reading if
given), logs unmatched words, and boosts matched entries in the ranking (4.2). No readings,
meanings, sentences, mnemonics, names or level assignments are ever taken from a seed file.
Seed files are git-ignored; the validation report prints how many seed words were placed, and
where, so the author can see coverage of the seed at a glance.

**Licensing notes.** Nothing is distributed, so no licence obligation is triggered. The open
sources are credited on an in-app screen. Because seed lists affect only ranking, the shipped
databases contain open data only.

## 7. Screens

- **Dashboard**: "Level 12 · N4 Sapling", lessons available, reviews available, next review
  time, review forecast (24 h / 7 d), level progress ring, "Block clear" gate panel,
  Apprentice/Guru/Master/Enlightened/Burned counts, leech candidates, Practice shortcut.
- **Lessons**: swipeable lesson pages → batch quiz.
- **Reviews**: one prompt per screen, kana/meaning input, stage-change toast, session summary.
- **Level-up**: full-screen moment on reaching a new level; special variant on clearing a block.
- **Practice**: scope and length picker → same prompt UI as reviews with refresher tags →
  summary by block.
- **Browse**: Blocks → Levels → items; Components index; Phonetic-series index (sorted by
  reliability or by reading); Obscure sub-tier index.
- **Item detail**: component / kanji / vocabulary pages as in 4.6, plus SRS and practice history.
- **Series detail**: component, reading(s), member grid coloured by exact/variant/irregular and
  by the learner's SRS stage, personal drill accuracy.
- **Drills**, **Stats**, **Settings** (intervals, batch size, lesson cap, gate strictness,
  Practice focus and Soft mode, IME mode, notifications, vacation mode, export/import),
  **Credits**.

Design notes: large kanji typography; Material 3 with dynamic colour; dark mode; SRS-stage
colours chosen to be distinguishable for colour-blind users. All Japanese text is rendered with
a Japanese locale tag so Android picks Japanese glyph forms rather than Chinese variants.

## 8. Architecture and stack

**Recommended stack**: Kotlin, Jetpack Compose (Material 3), Room, Hilt, Kotlin coroutines /
Flow, WorkManager, DataStore, Navigation Compose. `minSdk 26`, `targetSdk` = latest stable.
Alternative considered: Flutter (easier future iOS, weaker Android platform integration).
Decision is a phase-0 checkpoint in the plan.

**Modules**

```
app/                 Android application, navigation, DI wiring
core/model/          Pure Kotlin domain types (Kanji, Component, Series, Assignment …)
core/srs/            Pure Kotlin SRS, unlock/gating engine, practice sampler; JVM unit tests
core/content/        Room databases for the read-only content (content.db + obscure.db)
core/progress/       Room database for user progress, personal vocabulary; export/import
core/ui/             Design system, KanjiText, StrokeOrderCanvas, kana input field
feature/dashboard/   feature/lessons/  feature/reviews/  feature/practice/  feature/browse/
feature/drills/      feature/stats/    feature/settings/
tools/content/       Python (uv) content pipeline → content.db, obscure.db + validation report
content/             Hand-authored YAML: component names, role overrides, level pins, mnemonics
```

**Databases.** `content.db` (N5–N1) is generated by the pipeline, versioned, and opened
read-only via Room's prepackaged-database support. `obscure.db` has the same schema and is
bundled as a second read-only database (kept separate so N5–N1 builds stay fast and small). `progress.db` belongs to the user. Progress rows reference content by stable natural
keys (kanji literal, component slug, JMdict sequence id), so a content update never invalidates
progress.

**Content pipeline** (`tools/content/`): download sources with pinned versions and checksums
→ parse → classify every KANJIDIC2 kanji into a block (N5…N1 from the JLPT lists, else Obscure
sub-tier from grade / JIS level) → decompose kanji → derive phonetic series and reliability →
compute level ordering → apply YAML overrides → select vocabulary (JLPT lists, seed lists,
JMdict priorities) and sentences → emit databases and an HTML validation report. Validation rules: every
component of every kanji is taught at or before that kanji's level; every vocabulary item uses
only kanji from its level or earlier; every series member exists; no dependency cycles; no kanji
outside its block; every non-Obscure kanji has ≥ 1 word; per-level word counts within 80–120.

**Practice sampler** lives in `core/srs` as a pure function from (assignments, review history,
current level, settings, random seed) to the next item, so it is unit-testable and its block
distribution can be asserted statistically.

**Stroke order**: KanjiVG path data is stored per kanji/component and drawn on a Compose
Canvas via `PathParser`, animated stroke by stroke.

**Testing**: JVM tests for SRS, gating, sampler and answer checking; pipeline tests over the
emitted DBs; Compose UI tests for the review and practice loops; screenshot tests for item pages.

**Privacy**: no analytics, no crash reporting, no network access at all in the app.

## 9. Content data model (content.db / obscure.db)

- `block(id PK /*N5..N1, OBSCURE*/, ordinal, nickname)`
- `level(id PK, block_id, ordinal /*global level number*/, obscure_tier?)`
- `component(slug PK, glyph, svg, name, meaning, role_tendency, kangxi_no?, on_readings,
  level_id, notes)`
- `component_variant(component_slug, glyph, position_hint)`
- `kanji(literal PK, block_id, level_id, grade, freq, strokes, jis_level, svg,
  category /*六書*/, asked_reading_type, old_form_of?, meaning_mnemonic, reading_mnemonic)`
- `kanji_reading(literal, kana, type /*on|kun|nanori*/, is_primary)`
- `kanji_meaning(literal, text, is_primary)`
- `kanji_component(literal, component_slug, role /*semantic|phonetic|both|none*/, position)`
- `phonetic_series(id PK, component_slug, reading, reliability)`
- `series_member(series_id, literal, actual_reading, match /*exact|variant|irregular*/)`
- `vocab(id PK /*JMdict seq*/, word, level_id, pos, priority, is_kana_only,
  selection_source /*jlpt|seed|priority|fill*/, notes)`
- `vocab_reading(vocab_id, kana, is_primary)`, `vocab_meaning(vocab_id, text, is_primary)`
- `vocab_kanji(vocab_id, literal)`
- `sentence(id, vocab_id, ja, en, source_id)`
- `source(id, name, url, licence)`

## 10. Progress data model (progress.db)

- `assignment(item_type, item_key, stage, unlocked_at, started_at, available_at, passed_at,
  burned_at, resurrected_at)`
- `review(id, item_type, item_key, reviewed_at, stage_before, stage_after,
  meaning_incorrect, reading_incorrect)`
- `practice_result(id, item_type, item_key, block_id, correct, was_refresher, at)`
- `lesson_queue(item_type, item_key, position)`
- `personal_vocab(id, word, level_id, jmdict_seq?)` for words the user adds by hand, with
  readings and meanings resolved from JMdict at insert time and stored alongside
- `user_synonym(item_type, item_key, text)`, `user_note(item_type, item_key, text)`
- `drill_result(kind, item_key, series_id, correct, at)`
- Settings live in DataStore.

## 11. Notifications and background work

WorkManager schedules a one-off job at the next `available_at`; on completion it posts a
notification with the review count and re-schedules. Optional daily summary at a chosen time.
Respects Do Not Disturb and notification permission (Android 13+).

## 12. Backup

Progress export/import as JSON (versioned schema), including personal vocabulary and practice
history. Android Auto Backup enabled for `progress.db` and DataStore (under the 25 MB limit).
A periodic export to the device's Documents folder is offered as a belt-and-braces option.

## 13. Accessibility and localisation

UI strings in English via string resources (Spanish and Japanese UI later). Furigana rendered
above kanji in vocabulary. Respects font scaling; TalkBack labels on all controls; every
SRS-stage colour also has a text label.

## 14. Open decisions

1. Stack: Kotlin/Compose (recommended) vs Flutter.
2. Component naming: literal names (recommended, e.g. "water", "craftsman") with optional
   playful nicknames, vs invented names throughout.
3. Default block-gate strictness: Strict 100 % (recommended) vs Relaxed 95 %.
4. Obscure scope: include KANJIDIC2 entries with a reading but no English meaning (recommended:
   exclude until a meaning is authored), and whether to teach kyūjitai as separate SRS items or
   as a note on the modern kanji (recommended: separate items in Obscure I).
5. Practice-mode default weights (60/25/15) and whether Soft mode should be on by default.
6. Vocabulary volume: ~100 per level as specified vs a lighter 60–80 to keep Apprentice load
   manageable; consider a "vocabulary intensity" setting.
7. Mnemonics: how much to ship as structural scaffolds vs hand-written, and whether to write
   meaning mnemonics at all or only component-based reading explanations (recommended for a
   personal build: reading explanations first, meaning mnemonics only for kanji that resist).
8. Which JMdict gloss becomes the *primary* meaning asked in reviews (recommended: first gloss
   of the first sense, overridable in YAML).
