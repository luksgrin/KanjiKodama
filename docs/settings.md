# Settings

The settings screens are data: `app/src/ui/screens/settings/schema.ts` lists every row (key, type,
default, title, summary, choices), and `SettingRows.tsx` renders them. Stored keys never change, so
saved settings and settings backups keep working across versions. `app/test/fixtures/settings-layout.json`
records the screens and their rows in display order; tests check the schema against it.

## Settings that moved

| Key | Change |
|---|---|
| `indicate_kanji_reading_type` | Was "Indicate type of reading for kanji quiz" in Other advanced settings, default off and only read with advanced settings on. Now "Show which kind of kanji reading is asked for" in Lesson/review settings, default on, read without advanced settings. Same key and meaning. On the first start after this change it is switched on once for everyone, even where it was stored as off (the old default); turned off after that, it stays off. See `docs/behaviour.md`, "What the question asks for". |

### One-time changes

`app/src/core/settings/migrations.ts` lists changes made once per device at start-up, each with a marker
key that records it ran (`kanjikodama_reading_kind_on_applied`: `indicate_kanji_reading_type` switched
on). Restoring a settings backup doesn't run them again: the restored values are the user's choice and
are kept as they are in the file. The restore only writes the backup's keys, so the marker set before
stays.

## Keys that aren't settings rows

Written by other screens or by the app itself.

| Key | What it is |
|---|---|
| `kanjikodama_server_mode` | Server mode on/off (Progress → Server connection). Default false: local (offline). |
| `api_base_url` | The WaniKani-compatible server's base URL (Progress → Server connection). |
| `text_size` | Display settings → Text size and font: the app's text size in percent, `85`, `100` (default), `115`, `130` or `150`. Scales every text except the quiz's question, answer field and buttons (and big glyph tiles); the Font settings sizes are multiplied by it. |
| `ui_font` | Display settings → Text size and font: the body font, `PIXELIFY_SANS` (default: the theme's own font), `DOTGOTHIC16` or `ZEN_MARU_GOTHIC` (then used in every theme). Zen Maru Gothic also replaces Silkscreen (toolbar, menus); DotGothic16 keeps it. Japanese text, the quiz question and the subject glyphs keep their fonts. |
| `selected_fonts` | Quiz fonts chosen in Font settings → Select fonts (JSON list). |
| `theme_customizations_<THEME>` | Per-theme colour overrides from Theme customisation (JSON). |
| `anki_mode_lesson` / `_review` / `_self_study` | Older whole-session Anki switches (advanced); the per-meaning/reading keys replaced them on the screen. |
| `notification_low_priority` | Older "silent notification" flag. |
| `ui_confirm_abandon_session`, `ui_confirm_wrapup_session` | "Ask before abandon / wrap-up" confirmations (reset by Reset tutorials). |
| `keyboard_help_dismissed`, `browse_overview_dismissed`, `search_result_dismissed`, `session_log_dismissed`, `start_self_study_dismissed` | Dismissed tutorial pop-ups. |
| `first_time_setup`, `notification_permission_asked` | First-run state. |
| `onboarding_done` | The getting-started guide was finished or skipped (reset by Reset tutorials, which only matters before any progress). |
| `test_mode` | Developer test switch. |
| `kanjikodama_theme_applied`, `kanjikodama_font_bump_applied`, `kanjikodama_quiz_font_bump_applied`, `kanjikodama_quiz_glyph_bump_applied`, `kanjikodama_answer_22_applied` | One-time migrations (theme switch, larger font defaults). Not settings. |
| `kanjikodama_reading_kind_on_applied` | One-time change: `indicate_kanji_reading_type` switched on (see "One-time changes"). |

## Themes

Display settings → Light Theme (`theme`) applies while the system is light, Dark Theme (`nightTheme`)
while it is dark. The choices: KanjiKodama, KanjiKodama Dark, **KanjiKodama Black** (the dark theme on
a pure black ground with surfaces just above black, for OLED screens), Wanikani, Wanikani Dark,
Wanikani Black, Breeze, Black and Nord. Defaults: KanjiKodama and KanjiKodama Dark.

## Related settings that already exist

- **Meaning first, also in Anki mode:** Advanced → Lesson / Review / Self-study advanced settings →
  "Meaning before reading" (`<kind>_meaning_first`; "Reading before meaning" is the opposite). It
  orders the two questions of an item in every mode, Anki mode included.
- **New-item order:** Lesson advanced settings → Order (`lesson_order`: by level, type, shuffled, …)
  with Reverse order (`lesson_order_reversed`, i.e. last levels first); self-study has the same
  (`self_study_order`, with SRS-stage orders) plus "Shuffle after selecting items".

