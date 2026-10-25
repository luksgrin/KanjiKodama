# Settings inventory (draft for review)

Status: draft for the owner. It answers "Open questions for the owner" #1 (which settings are in use) and
feeds #5 (which upstream screens to keep) and Step 5 (the settings screen in the TS app).

Sources:
- Keys, titles, types and defaults: `durtles/app/src/main/res/xml/preferences.xml` (the only preference
  XML; titles are inline there, not in `strings.xml`). Enum values: `res/values/array.xml`.
- What each key does: the `GlobalSettings` getter that reads it, plus the XML summary.
- TS core: `web/src/core/settings/` plus the other core modules that read preferences
  (`core/anki/mode.ts`, `core/dashboard/settings.ts`, `core/session/session.ts`). "yes" = a getter with the
  Java default (and the `enable_advanced` gate where Java has it), covered by golden fixtures. "partial" =
  the behavior is ported but nothing reads the setting yet. "n/a (UI)" = a button or info row, not a value.
- Owner value: read-only from the owner's emulator (`emulator-5554`, `app.kanjikodama.wk.debug`,
  `shared_prefs/app.kanjikodama.wk.debug_preferences.xml`, last written 2026-10-13). Only values that
  differ from the default are shown. `encrypted_shared_prefs.xml` (API token, web password, possibly the
  server URL) was not read; secrets are never written here.

## Summary

- 185 entries in `preferences.xml`: 161 hold a value, 24 are buttons/info rows (actions such as save
  progress, font import, theme customization). The 18 "int range" rows are each stored as two ints
  (`<key>_min`, `<key>_max`), so the app stores 179 values from that screen.
- The owner has changed **one** setting from its default: `dont_know_button` = `ONLY_IF_IGNORE_HIDDEN`,
  and even that has no effect, because `enable_advanced` is off (every advanced setting then falls back to
  its default). Everything else is at the default, including `enable_advanced` itself. (The owner's file
  stores most keys explicitly: AndroidX preferences persist their XML default the first time a settings screen shows them.)
- TS core supports 64 of the 161 value keys (all the session order/selection/size settings, Anki mode,
  lightning mode, close-enough action, on'yomi-in-katakana requirement, the dashboard progression limits,
  timeline size, overdue threshold, on/kun split, matching-kanji shake, delayed results, randomized inflections) and has the
  behavior but no setting for 6 more (special buttons 1–3, Don't know behavior,
  show on'yomi in katakana, star ratings).
- Practical upshot: with the owner on all defaults, the TS app can ship with the defaults hard-wired and
  add only the settings the owner wants to keep (see the suggestions at the end).

## Inventory

### API and audio download settings

| Key | Title | Type | Default | What it does | TS core | Owner value (if not default) |
|---|---|---|---|---|---|---|
| `api_key_help` | Caution | info, hidden |  | Hidden warning text shown above the token field. | n/a (UI) |  |
| `api_key` | V2 API token | secret string |  | WaniKani v2 API token (used by server mode and the WaniKani import). | no | (encrypted store, not read) |
| `network_rule` | Network access rule | enum | `DOWNLOAD_WIFI_ONLY` | When the app may use the network: always, downloads on Wi-Fi only, or everything on Wi-Fi only. | no |  |
| `audio_location` | Audio files location | enum, hidden | `Internal` | Where downloaded vocab audio is stored (hidden; internal storage). | no |  |
| `auto_download_audio` | Auto-download audio for upcoming reviews | bool | `true` | Download audio for upcoming reviews / the current self-study session automatically. | no |  |
| `enable_background_sync` | Allow background sync | bool | `false` | Run API sync tasks periodically in the background. | no |  |
| `sync_on_open` | Sync when the app is opened | bool | `false` | Sync when the app is opened after being closed at least 3 minutes. | no |  |
| `web_password` | Web site password | secret string |  | WaniKani web site password, only for resurrecting burned items. | no | (encrypted store, not read) |

### Display settings

| Key | Title | Type | Default | What it does | TS core | Owner value (if not default) |
|---|---|---|---|---|---|---|
| `theme` | Light Theme | enum | `KANJIKODAMA_LIGHT` | Theme used in light mode. | no |  |
| `nightTheme` | Dark Theme | enum | `KANJIKODAMA_DARK` | Theme used in dark mode. | no |  |
| `theme_customization` | Theme Customisation | action |  | Opens the color editor for the current theme (stored as theme_customizations_<THEME>). | n/a (UI) |  |
| `center_caret` | Center caret in quiz answer box | bool | `false` | Center the caret/text in the quiz answer box. | no |  |
| `anki_buttons_height` | Vertical size of the Anki mode buttons | int 10–250 | `50` | Height of the Anki-mode correct/incorrect buttons. | no |  |
| `quiz_question_view_height` | Fix height of main quiz question view | int 0–500 | `0` | Fixed height of the quiz question view (0 = automatic). | no |  |
| `swap_anki_buttons` | Swap the correct/incorrect Anki mode buttons | bool | `false` | Swap the positions of the Anki-mode correct/incorrect buttons. | no |  |
| `slide_animations` | Use slide animations to transition between quiz questions | bool | `true` | Slide transition between quiz questions/screens. | no |  |
| `stretch_quiz_question_view` | Stretch the question view to fill the screen when keyboard input is active | bool | `false` | Stretch the question view to fill the screen while the keyboard is shown. | no |  |

### Dashboard settings

| Key | Title | Type | Default | What it does | TS core | Owner value (if not default) |
|---|---|---|---|---|---|---|
| `show_lesson_review_breakdown` | Show lesson/review breakdown | bool | `false` | Show the lesson/review count breakdown by type on the dashboard. | no |  |
| `show_timeline` | Show 24h review timeline | bool | `true` | Show the upcoming-reviews timeline bar chart. | no |  |
| `timeline_chart_style` | Timeline chart style | enum | `SRS_STAGE` | Bar coloring of the timeline: by SRS stage, next SRS stage, or item type. | no |  |
| `show_waterfall_line` | Show timeline waterfall line | bool | `false` | Draw the cumulative review count line on the timeline. | no |  |
| `timeline_chart_grid_style` | Timeline chart Y-axis grid style | enum | `FOR_BARS` | Timeline Y-axis grid: off, for bars, or for the waterfall line. | no |  |
| `timeline_chart_size` | Timeline chart size | enum | `24` | Hours covered by the timeline chart (12-336). | yes |  |
| `timeline_chart_size_shown` | Part of timeline chart shown at once | enum | `24` | Hours of the timeline visible at once (the rest scrolls). | no |  |
| `show_srs_breakdown` | Show SRS breakdown | bool | `true` | Show the SRS stage breakdown on the dashboard. | no |  |
| `show_level_progression` | Show level progression bars | bool | `true` | Show the per-level progression bars. | no |  |
| `show_over_level_progression` | Show level progression bars for levels higher than your own | bool | `false` | Also show bars for levels above your own (items moved up). | yes |  |
| `previous_level_progression_limit` | Limit progression bars for the completed levels to only the most recent levels | bool | `false` | Limit progression bars for completed levels. | yes |  |
| `previous_level_progression_limit_amount` | Number of previous levels to show progression bars for | string (int) | `1` | How many completed levels keep a bar when limited. | yes |  |
| `show_post60_progression` | Show post-60 progression bar | bool | `false` | Show the overall (post-60) progression bar. | no |  |
| `show_post60_subsections` | Show subsections in post-60 progression bar | bool | `false` | Split Apprentice/Guru into sub-stages in that bar. | no |  |
| `show_post60_reverse` | Reverse post-60 progression bar | bool | `false` | Reverse the post-60 bar. | no |  |
| `show_joyo_progress` | Show Jōyō progress | bool | `false` | Show Jōyō kanji progress on the dashboard. | no |  |
| `show_jlpt_progress` | Show JLPT progress | bool | `false` | Show JLPT kanji progress on the dashboard. | no |  |
| `show_recent_unlocks` | Show recently unlocked items | bool | `true` | Show the recently unlocked items table. | no |  |
| `show_critical_condition` | Show critical condition items | bool | `true` | Show the critical-condition items table. | no |  |
| `show_burned_items` | Show recently burned items | bool | `true` | Show the recently burned items table. | no |  |

### Subject Info settings

| Key | Title | Type | Default | What it does | TS core | Owner value (if not default) |
|---|---|---|---|---|---|---|
| `hide_lesson_readings` | Hide readings in lessons until tapped | bool | `false` | Hide readings in lesson presentation until tapped. | no |  |
| `hide_sentence_translations` | Hide context sentence translations until tapped | bool | `true` | Hide context sentence translations until tapped. | no |  |
| `show_pitch_info` | Show pitch information on vocabulary | bool | `false` | Show pitch accent diagrams on vocabulary (upstream pitch_info.json). | no |  |
| `swap_similar_amalgamations` | Swap 'visually similar' and 'used in' in subject info dump | bool | `false` | Swap the 'visually similar' and 'used in' tables in subject info. | no |  |
| `highlight_subject_tags` | Highlight subject tags in mnemonic texts with colours | bool | `true` | Color <kanji>/<radical>/... tags in mnemonics instead of bold. | no |  |
| `not_always_hide_wk_mnemonic` | Always hide WaniKani's own mnemonics | bool, hidden | `true` | Hidden helper: inverse of always_hide_wk_mnemonic, only enables the two options below. | no |  |
| `always_hide_wk_mnemonic` | Always hide WaniKani's own mnemonics | bool | `false` | Always hide WaniKani's own mnemonics. | no |  |
| `hide_meaning_mnemonic` | Hide WaniKani's meaning mnemonic if a user note is present | bool | `false` | Hide WaniKani's meaning mnemonic when you have a meaning note. | no |  |
| `hide_reading_mnemonic` | Hide WaniKani's reading mnemonic if a user note is present | bool | `false` | Hide WaniKani's reading mnemonic when you have a reading note. | no |  |
| `show_legacy` | Show old names and mnemonics for radicals from before the December 2018 content update | bool | `false` | Show pre-2018 radical names and mnemonics. | no |  |
| `meaning_info_dump` | Show info dump after a correct meaning answer | enum | `ANSWERS_ONLY` | Subject info shown after a correct meaning answer (lightning off): nothing / answers / hide unquizzed / all. | no |  |
| `reading_info_dump` | Show info dump after a correct reading answer | enum | `ANSWERS_ONLY` | Same, after a correct reading answer. | no |  |
| `meaning_info_dump_incorrect` | Show info dump after an incorrect meaning answer | enum | `ANSWERS_ONLY` | Same, after an incorrect meaning answer. | no |  |
| `reading_info_dump_incorrect` | Show info dump after an incorrect reading answer | enum | `ANSWERS_ONLY` | Same, after an incorrect reading answer. | no |  |
| `show_stroke_order` | Show stroke order diagrams on radicals and kanji | bool | `false` | Show stroke order diagrams for radicals and kanji (upstream stroke_data.json). | no |  |
| `stroke_order_animated` | Animate the stroke order diagrams | bool | `true` | Animate the stroke order diagrams (tap toggles). | no |  |
| `stroke_order_size` | Size of the stroke order diagrams | int 20–500 | `250` | Stroke order diagram size. | no |  |

### Audio settings

| Key | Title | Type | Default | What it does | TS core | Owner value (if not default) |
|---|---|---|---|---|---|---|
| `autoplay_lesson_presentation` | Autoplay audio during lesson presentation | bool | `true` | Play vocab audio automatically in lesson presentation. | no |  |
| `autoplay_lessons` | Autoplay audio during lessons | bool | `true` | Play audio after a correct answer in lesson quizzes. | no |  |
| `autoplay_reviews` | Autoplay audio during reviews | bool | `true` | Play audio after a correct answer in reviews/self-study. | no |  |
| `autoplay_anki_reveal` | Autoplay audio when revealing in Anki mode | bool | `true` | Play audio when revealing an Anki-mode answer. | no |  |
| `voice_preference` | Voice preference | enum | `RANDOM` | Which voice actor to use: random, male, female, alternate. | no |  |
| `use_audio_focus` | Request audio focus when playing vocab audio | bool | `true` | Ask other players to pause/duck while vocab audio plays. | no |  |

### Lesson/review settings

| Key | Title | Type | Default | What it does | TS core | Owner value (if not default) |
|---|---|---|---|---|---|---|
| `max_lesson_session_size` | Max. # of lessons per session | string (int) | `5` | Max lessons per session (string, falls back to 5). | yes |  |
| `max_review_session_size` | Max. # of reviews per session | string (int) | `100` | Max reviews per session (string, falls back to 100). | yes |  |
| `max_self_study_session_size` | Max. # of self-study items per session | string (int) | `100` | Max self-study items per session (string, falls back to 100). | yes |  |
| `delay_result_upload` | Delay processing quiz results | bool | `false` | Process results only at the end of the session (unlimited undo). | yes |  |
| `enable_lightning_mode` | Enable lightning mode | bool | `true` | Auto-advance on a correct answer. | yes |  |
| `show_answer_toast` | Enable a check mark / X animation for a correct / incorrect answer | bool | `true` | Check mark / X animation after answering. | no |  |
| `enable_srs_indicator` | Enable SRS indicator | bool | `false` | Show the item's current SRS stage during reviews. | no |  |
| `enable_srs_toast` | Enable SRS up/downgrade toast | bool | `true` | Toast when an item moves up/down an SRS stage. | no |  |
| `enable_alternatives_toast` | Enable alternative readings/meanings toast | bool | `false` | Toast listing alternative readings/meanings after a correct answer. | no |  |
| `enable_haptic_feedback_success` | Enable haptic feedback on correct answer | bool | `false` | Short vibration on a correct answer. | no |  |
| `enable_haptic_feedback_failure` | Enable haptic feedback on incorrect answer | bool | `false` | Long vibration on an incorrect answer. | no |  |
| `close_enough_action` | Action for "close enough" answer | enum | `SILENTLY_ACCEPT` | Typo-lenient meaning answers: accept silently / with toast / with toast and no lightning / shake and retry / reject. | yes |  |

### Keyboard input settings

| Key | Title | Type | Default | What it does | TS core | Owner value (if not default) |
|---|---|---|---|---|---|---|
| `keyboard_help` | Tap here to read some hints for keyboard settings | action |  | Opens keyboard hints (action). | n/a (UI) |  |
| `enable_auto_correct_meaning` | Allow keyboard auto-correct for meanings | bool | `false` | Allow keyboard auto-correct/suggestions for meanings. | no |  |
| `enable_auto_correct_reading` | Allow keyboard auto-correct for readings | bool | `false` | Allow keyboard auto-correct/suggestions for readings. | no |  |
| `force_ascii_meaning` | Force ASCII keyboard for meanings | bool | `true` | Request an ASCII keyboard for meanings. | no |  |
| `force_ascii_reading` | Force ASCII keyboard for readings | bool | `false` | Request an ASCII keyboard for readings. | no |  |
| `force_visible_password_meaning` | Force 'visible password' setting for meanings | bool | `false` | Use the 'visible password' input type for meanings (blocks suggestions). | no |  |
| `force_visible_password_reading` | Force 'visible password' setting for readings | bool | `false` | Same for readings. | no |  |
| `ime_hint_meaning` | Set keyboard language hint to English for meanings | bool, hidden | `false` | Hint English keyboard for meanings (hidden). | no |  |
| `ime_hint_reading` | Set keyboard language hint to Japanese for readings | bool, hidden | `false` | Hint Japanese keyboard for readings (hidden). | no |  |
| `enable_no_learning` | Enable 'no personalized learning' option | bool | `true` | Set the IME 'no personalized learning' flag. | no |  |
| `next_button_delay` | Delay in seconds to disable the next/submit button after typing an incorrect answer | string (int) | `0` | Seconds the next/submit button stays disabled after a wrong answer. | no |  |

### Font settings

| Key | Title | Type | Default | What it does | TS core | Owner value (if not default) |
|---|---|---|---|---|---|---|
| `font_selection` | Select fonts for quiz questions | action |  | Opens the quiz font picker (stored as selected_fonts). | n/a (UI) |  |
| `font_import` | Import fonts for quiz questions | action |  | Imports font files for quiz questions (action). | n/a (UI) |  |
| `max_font_size_lesson` | Max font size of subject title in lesson presentation | int 0–128 | `128` | Max subject title size in lesson presentation (0 hides it). | no |  |
| `max_font_size_quiz` | Max font size of subject title on the quiz screen | int 0–128 | `28` | Max subject title size on the quiz screen (0 hides it). | no |  |
| `max_font_size_browse` | Max font size of subject title on the browse screen | int 0–128 | `64` | Max subject title size when browsing (0 hides it). | no |  |
| `max_font_size_quiz_text` | Max font size of main quiz question text | int 0–500 | `104` | Max size of the big quiz question text. | no |  |
| `font_size_question_edit` | Font size of answer input text box | int 10–32 | `22` | Answer box text size. | no |  |
| `font_size_subject_info` | Font size of subject info dump | int 10–32 | `16` | Subject info body text size. | no |  |
| `font_size_live_subject_table` | Font size of dashboard subject tables | int 10–32 | `16` | Dashboard subject table text size. | no |  |
| `font_size_anki_answer` | Font size of Anki mode answers | int 10–48 | `20` | Anki-mode answer text size. | no |  |

### Notifications and other settings

| Key | Title | Type | Default | What it does | TS core | Owner value (if not default) |
|---|---|---|---|---|---|---|
| `grant_notification_permission` | Grant notification permission | action |  | Opens system settings to allow notifications (action). | n/a (UI) |  |
| `enable_notifications` | Enable notifications for new reviews | bool | `true` | Notify about new lessons/reviews. | no |  |
| `notification_update_frequency` | Notification update frequency | enum | `ONLY_NEW_REVIEWS` | When to update the notification: only new reviews / hourly / continuously. | no |  |
| `notification_priority` | Notification priority | enum | `DEFAULT` | Android notification priority. | no |  |
| `notification_category` | Notification category | enum | `RECOMMENDATION` | Android notification category. | no |  |
| `search_engine_1` | Search engine 1 | string (name+URL) | `ja.wiktionary.org/w/index.php?…` | Subject info 'search' link 1 (name + URL with %s). | no |  |
| `search_engine_2` | Search engine 2 | string (name+URL) | `jisho.org/search/%s…` | Search link 2. | no |  |
| `search_engine_3` | Search engine 3 | string (name+URL) |  | Search link 3 (empty by default). | no |  |
| `search_engine_4` | Search engine 4 | string (name+URL) |  | Search link 4 (empty by default). | no |  |
| `search_engine_5` | Search engine 5 | string (name+URL) |  | Search link 5 (empty by default). | no |  |
| `enable_star_ratings` | Enable star ratings for subjects | bool | `false` | Rate subjects with stars and filter searches by rating. | partial (star filter in core/search; no setting) |  |
| `show_onyomi_in_katakana` | Show on'yomi readings in Katakana | bool | `false` | Display on'yomi in katakana. | partial (parameter of core/anki answerText; no getter) |  |
| `require_onyomi_in_katakana` | Require on'yomi answers in Katakana | bool | `false` | On'yomi answers must be typed in katakana. | yes |  |

### Experimental (temporary) settings

| Key | Title | Type | Default | What it does | TS core | Owner value (if not default) |
|---|---|---|---|---|---|---|
| `experimental_status` | Caution | info |  | Warning text (hidden screen). | n/a (UI) |  |
| `exp_subject_card_layout_search` | Subject card layout in search results | enum | `NORMAL` | Subject card layout in search results: normal / compact / compact without progress. | no |  |
| `exp_subject_card_layout_grid` | Subject card layout in other places | enum | `NORMAL` | Same, in other subject grids. | no |  |

### Advanced settings

| Key | Title | Type | Default | What it does | TS core | Owner value (if not default) |
|---|---|---|---|---|---|---|
| `enable_advanced` | Enable advanced settings | bool | `false` | Master switch: every advanced setting below is ignored (defaults used) while off. | yes |  |

### Advanced settings > Lesson advanced settings

| Key | Title | Type | Default | What it does | TS core | Owner value (if not default) |
|---|---|---|---|---|---|---|
| `lesson_order` | Order | enum | `LEVEL_THEN_TYPE` | Lesson order (level/type/radicals-first/shuffle variants). *(advanced)* | yes |  |
| `lesson_order_reversed` | Reverse order | bool | `false` | Reverse the lesson order. *(advanced)* | yes |  |
| `lesson_order_priority` | Priority | enum | `NONE` | Put some items first: radicals, level-up items, current-level radicals/kanji, current level. *(advanced)* | yes |  |
| `lesson_shuffle_after_selection` | Shuffle after selecting items | bool | `false` | Shuffle lessons after selecting them by order. *(advanced)* | yes |  |
| `lesson_back_to_back` | Reading/meaning back-to-back | bool | `false` | Ask meaning and reading of an item back to back. *(advanced)* | yes |  |
| `lesson_reading_first` | Reading before meaning | bool | `false` | Ask reading before meaning. *(advanced)* | yes |  |
| `lesson_meaning_first` | Meaning before reading | bool | `false` | Ask meaning before reading. *(advanced)* | yes |  |
| `anki_mode_lesson_meaning` | Anki mode for meanings | bool | `false` | Anki mode (self-graded reveal) for lesson meanings. *(advanced)* | yes |  |
| `anki_mode_lesson_reading` | Anki mode for readings | bool | `false` | Anki mode for lesson readings. *(advanced)* | yes |  |
| `lesson_subject_selection` |  | info |  | Explanation text for the selection rules (info). | n/a (UI) |  |
| `lesson_subjects_current` | Current-level items | int range | `no rule` | Min/max number of current-level items per session (stored as `_min`/`_max` ints, -1 = no rule). *(advanced)* | yes |  |
| `lesson_subjects_earlier` | Earlier-level items | int range | `no rule` | Min/max number of earlier-level items per session (stored as `_min`/`_max` ints, -1 = no rule). *(advanced)* | yes |  |
| `lesson_subjects_radical` | Radicals | int range | `no rule` | Min/max number of radical items per session (stored as `_min`/`_max` ints, -1 = no rule). *(advanced)* | yes |  |
| `lesson_subjects_kanji` | Kanji | int range | `no rule` | Min/max number of kanji items per session (stored as `_min`/`_max` ints, -1 = no rule). *(advanced)* | yes |  |
| `lesson_subjects_vocabulary` | Vocabulary | int range | `no rule` | Min/max number of vocabulary items per session (stored as `_min`/`_max` ints, -1 = no rule). *(advanced)* | yes |  |
| `lesson_subjects_kana_vocabulary` | Kana Vocabulary | int range | `no rule` | Min/max number of kana-only vocabulary items per session (stored as `_min`/`_max` ints, -1 = no rule). *(advanced)* | yes |  |

### Advanced settings > Review advanced settings

| Key | Title | Type | Default | What it does | TS core | Owner value (if not default) |
|---|---|---|---|---|---|---|
| `review_order` | Order | enum | `SHUFFLE` | Review order (shuffle, or by level/type/SRS combinations). *(advanced)* | yes |  |
| `review_order_reversed` | Reverse order | bool | `false` | Reverse the review order. *(advanced)* | yes |  |
| `review_order_overdue_first` | Overdue items first | bool | `false` | Overdue items first (priority setting wins). *(advanced)* | yes |  |
| `review_order_priority` | Priority | enum | `NONE` | Put some items first (as for lessons). *(advanced)* | yes |  |
| `review_shuffle_after_selection` | Shuffle after selecting items | bool | `false` | Shuffle reviews after selecting them by order. *(advanced)* | yes |  |
| `review_back_to_back` | Reading/meaning back-to-back | bool | `false` | Meaning and reading back to back. *(advanced)* | yes |  |
| `review_reading_first` | Reading before meaning | bool | `false` | Reading before meaning. *(advanced)* | yes |  |
| `review_meaning_first` | Meaning before reading | bool | `false` | Meaning before reading. *(advanced)* | yes |  |
| `anki_mode_review_meaning` | Anki mode for meanings | bool | `false` | Anki mode for review meanings. *(advanced)* | yes |  |
| `anki_mode_review_reading` | Anki mode for readings | bool | `false` | Anki mode for review readings. *(advanced)* | yes |  |
| `review_randomize_inflections` | Randomise inflections in review | bool | `false` | Show verbs/adjectives in a random inflected form (best with Anki mode). *(advanced)* | yes (`randomizeInflections`, uncommitted work in progress) |  |
| `review_subject_selection` |  | info |  | Explanation text (info). | n/a (UI) |  |
| `review_subjects_current` | Current-level items | int range | `no rule` | Min/max number of current-level items per session (stored as `_min`/`_max` ints, -1 = no rule). *(advanced)* | yes |  |
| `review_subjects_earlier` | Earlier-level items | int range | `no rule` | Min/max number of earlier-level items per session (stored as `_min`/`_max` ints, -1 = no rule). *(advanced)* | yes |  |
| `review_subjects_radical` | Radicals | int range | `no rule` | Min/max number of radical items per session (stored as `_min`/`_max` ints, -1 = no rule). *(advanced)* | yes |  |
| `review_subjects_kanji` | Kanji | int range | `no rule` | Min/max number of kanji items per session (stored as `_min`/`_max` ints, -1 = no rule). *(advanced)* | yes |  |
| `review_subjects_vocabulary` | Vocabulary | int range | `no rule` | Min/max number of vocabulary items per session (stored as `_min`/`_max` ints, -1 = no rule). *(advanced)* | yes |  |
| `review_subjects_kana_vocabulary` | Kana Vocabulary | int range | `no rule` | Min/max number of kana-only vocabulary items per session (stored as `_min`/`_max` ints, -1 = no rule). *(advanced)* | yes |  |

### Advanced settings > Self-study advanced settings

| Key | Title | Type | Default | What it does | TS core | Owner value (if not default) |
|---|---|---|---|---|---|---|
| `self_study_order` | Order | enum | `SHUFFLE` | Self-study order (as reviews). *(advanced)* | yes |  |
| `self_study_order_reversed` | Reverse order | bool | `false` | Reverse the self-study order. *(advanced)* | yes |  |
| `self_study_order_overdue_first` | Overdue items first | bool | `false` | Overdue items first. *(advanced)* | yes |  |
| `self_study_order_priority` | Priority | enum | `NONE` | Put some items first. *(advanced)* | yes |  |
| `self_study_shuffle_after_selection` | Shuffle after selecting items | bool | `false` | Shuffle after selection. *(advanced)* | yes |  |
| `self_study_back_to_back` | Reading/meaning back-to-back | bool | `false` | Meaning and reading back to back. *(advanced)* | yes |  |
| `self_study_reading_first` | Reading before meaning | bool | `false` | Reading before meaning. *(advanced)* | yes |  |
| `self_study_meaning_first` | Meaning before reading | bool | `false` | Meaning before reading. *(advanced)* | yes |  |
| `anki_mode_self_study_meaning` | Anki mode for meanings | bool | `false` | Anki mode for self-study meanings. *(advanced)* | yes |  |
| `anki_mode_self_study_reading` | Anki mode for readings | bool | `false` | Anki mode for self-study readings. *(advanced)* | yes |  |
| `self_study_randomize_inflections` | Randomize inflections in self-study | bool | `false` | Random inflected forms in self-study. *(advanced)* | yes (`randomizeInflections`, uncommitted work in progress) |  |
| `self_study_subject_selection` |  | info |  | Explanation text (info). | n/a (UI) |  |
| `self_study_subjects_current` | Current-level items | int range | `no rule` | Min/max number of current-level items per session (stored as `_min`/`_max` ints, -1 = no rule). *(advanced)* | yes |  |
| `self_study_subjects_earlier` | Earlier-level items | int range | `no rule` | Min/max number of earlier-level items per session (stored as `_min`/`_max` ints, -1 = no rule). *(advanced)* | yes |  |
| `self_study_subjects_radical` | Radicals | int range | `no rule` | Min/max number of radical items per session (stored as `_min`/`_max` ints, -1 = no rule). *(advanced)* | yes |  |
| `self_study_subjects_kanji` | Kanji | int range | `no rule` | Min/max number of kanji items per session (stored as `_min`/`_max` ints, -1 = no rule). *(advanced)* | yes |  |
| `self_study_subjects_vocabulary` | Vocabulary | int range | `no rule` | Min/max number of vocabulary items per session (stored as `_min`/`_max` ints, -1 = no rule). *(advanced)* | yes |  |
| `self_study_subjects_kana_vocabulary` | Kana Vocabulary | int range | `no rule` | Min/max number of kana-only vocabulary items per session (stored as `_min`/`_max` ints, -1 = no rule). *(advanced)* | yes |  |

### Advanced settings > Other advanced settings

| Key | Title | Type | Default | What it does | TS core | Owner value (if not default) |
|---|---|---|---|---|---|---|
| `overdue_threshold` | Overdue threshold percentage | string (int) | `20` | Percent past its interval before an item counts as overdue. *(advanced)* | yes |  |
| `kanji_mode_onkun` | Quiz on/kun'yomi separately | bool | `false` | Ask kanji on'yomi and kun'yomi as separate questions. *(advanced)* | yes |  |
| `undo_button` | Special button 1 behavior (top right) | enum | `DISABLE` | Special button 1 (top right): off / undo+mark correct / undo+retry / undo+put back / skip / toggle lightning. *(advanced)* | partial (undo/ignore actions in core/session; no setting) |  |
| `ignore_button` | Special button 2 behavior (bottom left) | enum | `DISABLE` | Special button 2 (bottom left): same choices. *(advanced)* | partial (undo/ignore actions in core/session; no setting) |  |
| `special_button_3` | Special button 3 behavior (top left) | enum | `DISABLE` | Special button 3 (top left): same choices. *(advanced)* | partial (undo/ignore actions in core/session; no setting) |  |
| `dont_know_button` | Don't know button behavior | enum | `ENABLE` | When to show Don't know: never / always / only if special button 2 is hidden. *(advanced)* | partial (submitDontKnow in core/session; no setting) | `ONLY_IF_IGNORE_HIDDEN` (inert: enable_advanced is off) |
| `shake_on_matching_kanji` | Soft-reject on single-kanji vocabulary | bool | `true` | Single-kanji vocab: a reading valid for the kanji gets shake-and-retry instead of wrong. *(advanced)* | yes |  |
| `full_session_log` | Show full session log | bool | `false` | Show the full session log (may reveal answers). *(advanced)* | no |  |
| `indicate_kanji_reading_type` | Indicate type of reading for kanji quiz | bool | `false` | Tell whether a kanji reading question wants on'yomi or kun'yomi. *(advanced)* | no |  |

### Progress

| Key | Title | Type | Default | What it does | TS core | Owner value (if not default) |
|---|---|---|---|---|---|---|
| `progress_server` | Server connection | action |  | Choose local (offline) or server mode; server URL/token (action). | logic: core/server |  |
| `progress_curriculum` | Curriculum order | action |  | Choose curriculum order: WaniKani or JLPT (action). | logic: core/curriculum |  |
| `progress_level_test` | Kanji level test | action |  | Run the kanji level test (action). | logic: core/levelTest |  |
| `progress_fast_travel` | Fast travel | action |  | Fast travel up to 5 levels ahead, JLPT order only (action). | logic: core/fastTravel |  |
| `progress_save` | Save progress to a file | action |  | Export the progress file (action). | logic: core/progressFile |  |
| `progress_restore` | Restore progress from a file | action |  | Replace local progress from a progress file (action). | logic: core/progressFile |  |
| `progress_import_wanikani` | Import progress from WaniKani | action |  | Replace local progress with a WaniKani account's, via API token (action). | logic: core/importer |  |

### Other actions

| Key | Title | Type | Default | What it does | TS core | Owner value (if not default) |
|---|---|---|---|---|---|---|
| `about_this_app` | About this app | action |  | About screen (action). | n/a (UI) |  |
| `support_and_feedback` | Support and feedback | action |  | Support/feedback screen (action). | n/a (UI) |  |
| `data_import_export` | Data import / export | action |  | Data import/export screen (action). | n/a (UI) |  |
| `reset_tutorials` | Reset UI confirmations and tutorials | action |  | Re-enable dismissed tutorials and UI confirmations (action). | n/a (UI) |  |
| `reset_database` | Reset database | action |  | Clear all app data (action). | n/a (UI) |  |
| `backup_settings` | Backup your settings | action |  | Export all settings to a file (action). | n/a (UI) |  |
| `restore_settings` | Restore your settings | action |  | Import settings from a file (action). | n/a (UI) |  |

## Keys the code reads that are not in `preferences.xml`

Not on the settings screen; written by other screens or by the app itself.

| Key | What it is | Owner value |
|---|---|---|
| `kanjikodama_server_mode` | Server mode on/off (Progress > Server connection). Default false = local (offline). | not set (local) |
| `api_base_url` | WaniKani-compatible server base URL (Progress > Server connection). | not in the plain prefs file |
| `selected_fonts` | Quiz fonts chosen in Font settings > Select fonts (JSON list). | not set |
| `theme_customizations_<THEME>` | Per-theme color overrides from Theme Customisation (JSON). | not set |
| `anki_mode_lesson` / `_review` / `_self_study` | Older whole-session Anki switches (advanced); the per-meaning/reading keys replaced them on the screen. | not set |
| `notification_low_priority` | Older "silent notification" flag. | not set |
| `ui_confirm_abandon_session`, `ui_confirm_wrapup_session` | "Ask before abandon / wrap-up" confirmations (reset by Reset tutorials). | not set (ask) |
| `keyboard_help_dismissed`, `browse_overview_dismissed`, `search_result_dismissed`, `session_log_dismissed`, `start_self_study_dismissed` | Dismissed tutorial popups. | not set |
| `first_time_setup`, `notification_permission_asked` | First-run state. | `1`, `true` |
| `test_mode` | Developer test switch. | not set |
| `kanjikodama_theme_applied`, `kanjikodama_font_bump_applied`, `kanjikodama_quiz_font_bump_applied`, `kanjikodama_quiz_glyph_bump_applied`, `kanjikodama_answer_22_applied` | One-time KanjiKodama migrations (`WkApplication.initialize`): switch to the KanjiKodama themes, raise font defaults. Not settings. | all `true` |

## Suggested groups (for the owner to decide)

These are suggestions only. Nothing has been dropped.

**Keep (core quiz behavior, mostly ported already)**
- Session sizes: `max_lesson_session_size`, `max_review_session_size`, `max_self_study_session_size`.
- Answering: `enable_lightning_mode`, `close_enough_action`, `require_onyomi_in_katakana`,
  `show_onyomi_in_katakana`, `delay_result_upload`, `show_answer_toast`, `enable_srs_toast`,
  `meaning_info_dump*` / `reading_info_dump*`.
- Subject info basics: `hide_lesson_readings`, `hide_sentence_translations`, `highlight_subject_tags`,
  `show_legacy`.
- Dashboard: the `show_*` toggles, timeline size/style, progression limits (cheap to keep, all on the
  dashboard already ported in core).
- Audio: `autoplay_*`, `voice_preference` (Android only, unless PWA audio is allowed, question #9).
- Progress actions (KanjiKodama's own): server connection, curriculum, level test, fast travel,
  save/restore progress, WaniKani import.

**Drop (Android-specific or no longer meaningful in the TS app)**
- Keyboard/IME tweaks: `enable_auto_correct_*`, `force_ascii_*`, `force_visible_password_*`,
  `ime_hint_*`, `enable_no_learning`, `center_caret` (the TS answer field sets its own input attributes).
- Layout knobs tied to Android views: `quiz_question_view_height`, `stretch_quiz_question_view`,
  `slide_animations`, `anki_buttons_height`, the nine font size sliders (replace with one text-size
  setting if wanted), `exp_subject_card_layout_*` (hidden experimental screen).
- Theme customization and the upstream theme list (`theme`, `nightTheme`, Theme Customisation): keep only
  the KanjiKodama light/dark themes following the system setting.
- Font import / font selection (`font_import`, `font_selection`, `selected_fonts`).
- Notifications detail (`notification_priority`, `notification_category`, `notification_update_frequency`)
  and `use_audio_focus`, `audio_location`, `network_rule`, haptic feedback: Android plumbing; revisit
  only with the native shell.
- `web_password` (resurrect via the WaniKani web site), `api_key_help`, `full_session_log`,
  settings backup/restore (`backup_settings`, `restore_settings`) if settings stay few.

**Ask**
- Advanced session ordering (`enable_advanced` and the 58 keys under it, 18 of them min/max ranges: order, priority, back-to-back,
  reading/meaning first, subject selection ranges, overdue threshold). Already ported in core; the owner
  uses none of it today. Keep as one "Advanced" page, or hard-wire the defaults?
- Anki mode (`anki_mode_*`, `swap_anki_buttons`, `autoplay_anki_reveal`, randomized inflections):
  dropped earlier, but the logic is ported in core.
- Special buttons 1–3 and Don't know behavior (undo / ignore / skip). Undo and ignore exist in core.
- Kanji quiz variants: `kanji_mode_onkun`, `indicate_kanji_reading_type`, `shake_on_matching_kanji`.
- Pitch accent and stroke order (`show_pitch_info`, `show_stroke_order`, `stroke_order_*`): depends on
  the data license question (#4).
- Mnemonic hiding with user notes (`always_hide_wk_mnemonic`, `hide_*_mnemonic`): only useful if user
  notes come along.
- Star ratings (`enable_star_ratings`) and search engine links (`search_engine_1..5`).
- Sync options (`enable_background_sync`, `sync_on_open`, `auto_download_audio`) for server mode
  (question #3).
- Self-study settings: self-study itself is needed for the level test; do its own order/size settings
  matter?
