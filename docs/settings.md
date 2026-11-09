# Settings

The settings screens are data: `app/src/ui/screens/settings/schema.ts` lists every row (key, type,
default, title, summary, choices), and `SettingRows.tsx` renders them. Stored keys never change, so
saved settings and settings backups keep working across versions. `app/test/fixtures/settings-layout.json`
records the screens and their rows in display order; tests check the schema against it.

## Keys that aren't settings rows

Written by other screens or by the app itself.

| Key | What it is |
|---|---|
| `kanjikodama_server_mode` | Server mode on/off (Progress → Server connection). Default false: local (offline). |
| `api_base_url` | The WaniKani-compatible server's base URL (Progress → Server connection). |
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

