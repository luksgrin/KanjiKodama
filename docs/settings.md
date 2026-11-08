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
| `test_mode` | Developer test switch. |
| `kanjikodama_theme_applied`, `kanjikodama_font_bump_applied`, `kanjikodama_quiz_font_bump_applied`, `kanjikodama_quiz_glyph_bump_applied`, `kanjikodama_answer_22_applied` | One-time migrations (theme switch, larger font defaults). Not settings. |
