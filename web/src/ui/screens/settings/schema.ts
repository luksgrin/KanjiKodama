/**
 * The settings rows as data: keys, types, defaults, titles, summaries and choices exactly as
 * `durtles/app/src/main/res/xml/preferences.xml` and `res/values/array.xml` have them, so a value
 * stored here means the same as in the Java app's `SharedPreferences`. `SettingRow` renders them.
 *
 * Storage types follow AndroidX: SwitchPreference → boolean, ListPreference and EditTextPreference
 * (also the numeric ones) → string, SeekBarPreference → number, NumberRangePreference →
 * `<key>_min` / `<key>_max` numbers (-1 = no rule).
 *
 * Gating (`LocalMode.applyToPreferences`, `PreferencesFragment`): `mode` hides a row in the other
 * mode (Java's ONLINE_PREFERENCES / LOCAL_PREFERENCES), `requires` hides it on a build without the
 * capability, `advanced` marks a value the core getters ignore (default used) while
 * `enable_advanced` is off, and `enabledWhen` is Java's `android:dependency`.
 *
 * Not listed (Android-UI only, or the inventory's "Drop", `docs/settings-inventory.md`):
 * - API/audio plumbing: api_key_help, api_key (asked by the import / server screens instead),
 *   network_rule, audio_location, use_audio_focus, web_password (resurrect via the WaniKani web
 *   site is not ported).
 * - Display: theme, nightTheme, theme_customization (the KanjiKodama themes only: Appearance below),
 *   center_caret, anki_buttons_height, quiz_question_view_height, slide_animations,
 *   stretch_quiz_question_view.
 * - Dashboard panels the TS dashboard does not have: show_lesson_review_breakdown,
 *   timeline_chart_style, show_waterfall_line, timeline_chart_grid_style, timeline_chart_size_shown,
 *   show_post60_progression, show_post60_subsections, show_post60_reverse, show_joyo_progress,
 *   show_jlpt_progress, show_recent_unlocks, show_critical_condition, show_burned_items.
 * - Keyboard/IME: keyboard_help, enable_auto_correct_meaning, enable_auto_correct_reading,
 *   force_ascii_meaning, force_ascii_reading, force_visible_password_meaning,
 *   force_visible_password_reading, ime_hint_meaning, ime_hint_reading, enable_no_learning,
 *   next_button_delay.
 * - Fonts: font_selection, font_import, max_font_size_lesson, max_font_size_quiz,
 *   max_font_size_browse, max_font_size_quiz_text, font_size_question_edit, font_size_subject_info,
 *   font_size_live_subject_table, font_size_anki_answer.
 * - Notification details (Android plumbing): notification_update_frequency, notification_priority,
 *   notification_category.
 * - search_engine_1 … search_engine_5 (inventory "Ask"; the tagged-URL editor and the item page's
 *   search links are not ported).
 * - Hidden experimental screen: experimental_status, exp_subject_card_layout_search,
 *   exp_subject_card_layout_grid. Hidden helper: not_always_hide_wk_mnemonic (enabledWhen below).
 * - Other actions: support_and_feedback (hidden in Java too), data_import_export, reset_tutorials,
 *   reset_database, backup_settings, restore_settings.
 */
import type { Capabilities } from '../../../platform';
import type { Preferences, PreferenceValue } from '../../../core/settings';

interface Base {
  key: string;
  title: string;
  /** Fixed summary (Java `app:summary`). Lists and text fields show their value instead (simple summary provider). */
  summary?: string;
  /** Shown only in this mode (`LocalMode` lists). */
  mode?: 'local' | 'server';
  /** Shown only on builds with this capability. */
  requires?: keyof Capabilities;
  /** Ignored by the core getters (defaults used) while `enable_advanced` is off. */
  advanced?: boolean;
  /** `android:dependency`: editable only when this holds. */
  enabledWhen?: (prefs: Preferences) => boolean;
}

export interface BoolSetting extends Base { type: 'bool'; default: boolean }
export interface ListSetting extends Base { type: 'list'; default: string; options: readonly (readonly [value: string, label: string])[] }
/** EditTextPreference with a number keyboard; stored as the typed string. `min`/`max`: EditLimitedIntPreference. */
export interface TextSetting extends Base { type: 'text'; default: string; min?: number; max?: number }
/** SeekBarPreference: an int. */
export interface SliderSetting extends Base { type: 'slider'; default: number; min: number; max: number }
/** NumberRangePreference: `<key>_min` and `<key>_max` ints, -1 = no rule. */
export interface RangeSetting extends Base { type: 'range' }
/** InfoPreference: a text row. */
export interface InfoRow { type: 'info'; key: string; text: string; advanced?: boolean }
/** A sub-heading inside a group (the Java sub-screen a row comes from). */
export interface HeadingRow { type: 'heading'; key: string; text: string }

export type SettingDef = BoolSetting | ListSetting | TextSetting | SliderSetting | RangeSetting;
export type Row = SettingDef | InfoRow | HeadingRow;

export interface SettingGroup {
  id: string;
  title: string;
  /** Shown above the rows. */
  note?: string;
  rows: readonly Row[];
}

// ---- array.xml ---------------------------------------------------------------------------------

type Options = readonly (readonly [string, string])[];

const LESSON_ORDERS: Options = [
  ['SHUFFLE', 'Shuffle'], ['LEVEL_THEN_TYPE', 'Level, Type'], ['RADICALS_THEN_LEVEL_THEN_TYPE', 'Radicals, Level, Type'],
  ['TYPE_THEN_LEVEL', 'Type, Level'], ['LEVEL_THEN_SHUFFLE', 'Level, then shuffle'], ['TYPE_THEN_SHUFFLE', 'Type, then shuffle'],
];
const REVIEW_ORDERS: Options = [
  ['SHUFFLE', 'Shuffle'], ['LEVEL', 'Level'], ['TYPE', 'Type'], ['SRS', 'SRS stage'],
  ['LEVEL_THEN_TYPE', 'Level, Type'], ['LEVEL_THEN_SRS', 'Level, SRS stage'], ['TYPE_THEN_LEVEL', 'Type, Level'],
  ['TYPE_THEN_SRS', 'Type, SRS stage'], ['SRS_THEN_TYPE', 'SRS stage, Type'], ['SRS_THEN_LEVEL', 'SRS stage, Level'],
  ['LEVEL_THEN_TYPE_THEN_SRS', 'Level, Type, SRS stage'], ['LEVEL_THEN_SRS_THEN_TYPE', 'Level, SRS stage, Type'],
  ['TYPE_THEN_LEVEL_THEN_SRS', 'Type, Level, SRS stage'], ['TYPE_THEN_SRS_THEN_LEVEL', 'Type, SRS stage, Level'],
  ['SRS_THEN_TYPE_THEN_LEVEL', 'SRS stage, Type, Level'], ['SRS_THEN_LEVEL_THEN_TYPE', 'SRS stage, Level, Type'],
];
// "Femminine" is the Java app's spelling.
const VOICE_PREFERENCES: Options = [
  ['RANDOM', 'Random'], ['MALE', 'Masculine'], ['FEMALE', 'Femminine'], ['ALTERNATE', 'Alternate between voices'],
];
const SUBJECT_INFO_DUMPS: Options = [
  ['NOTHING', 'Show nothing'], ['ANSWERS_ONLY', 'Show only answers'], ['HIDE_UNQUIZZED', 'Hide information not quizzed yet'],
  ['ALL', 'Show all information'],
];
const SPECIAL_BUTTON_BEHAVIORS: Options = [
  ['DISABLE', 'Disable'], ['UNDO_AND_MARK_CORRECT', 'Ignore (undo and mark correct instead)'],
  ['UNDO_AND_RETRY_NOW', 'Undo and retry immediately'], ['UNDO_AND_PUT_BACK', 'Undo and put back into queue'],
  ['SKIP', 'Skip (put back into queue)'], ['TOGGLE_LIGHTNING_MODE', 'Toggle lightning mode'],
];
const DONT_KNOW_BEHAVIORS: Options = [
  ['DISABLE', 'Disable'], ['ENABLE', 'Enable'], ['ONLY_IF_IGNORE_HIDDEN', 'Hide if Special button 2 is visible'],
];
const SESSION_PRIORITIES: Options = [
  ['NONE', 'None'], ['RADICALS_FIRST', 'Radicals first'], ['LEVEL_UP_FIRST', 'Level-up items first'],
  ['CURRENT_LEVEL_RADICAL_KANJI_FIRST', 'Current-level radicals and kanji first'], ['CURRENT_LEVEL_FIRST', 'Current-level items first'],
];
const CLOSE_ENOUGH_ACTIONS: Options = [
  ['SILENTLY_ACCEPT', 'Accept silently'], ['ACCEPT_WITH_TOAST', 'Accept and show a toast'],
  ['ACCEPT_WITH_TOAST_NO_LM', 'Accept, show a toast, disable lightning mode for this question'],
  ['SHAKE_AND_RETRY', 'Shake and retry'], ['REJECT', 'Reject'],
];
const TIME_LINE_CHART_SIZES: Options = [
  ['12', '12 hours'], ['24', '24 hours'], ['36', '36 hours'], ['48', '48 hours'], ['72', '3 days'], ['120', '5 days'],
  ['168', '7 days'], ['240', '10 days'], ['336', '14 days'],
];

// ---- Texts from Constants.java -----------------------------------------------------------------

/** `Constants.SUBJECT_SELECTION_NOTICE`. */
export const SUBJECT_SELECTION_NOTICE = 'If there are more candidates for your session than will fit,'
  + ' the settings below will let you influence how the subjects for the session are selected.';

/** `Constants.ENABLE_ADVANCED_WARNING` (bold parts as plain text). */
export const ENABLE_ADVANCED_WARNING = 'Warning: Changing advanced settings will alter the presentation'
  + ' of lessons and reviews. If used unwisely, this may cause unbalanced workloads or slower progress, and may'
  + ' harm your long-term retention. You should only change these settings if you are an experienced user and'
  + " know what you're doing. Are you sure you want to enable these settings?";

/** `NumberRangePreferenceDialogFragment`'s message. */
export const NUMBER_RANGE_MESSAGE = 'Choose a minimum and maximum value for this category. Leave a field empty to not constrain that value.';

const SHUFFLE_AFTER_SELECTION = 'Items are selected for the session according to ordering settings, but after that they are shuffled randomly.';
const RANDOMIZE_INFLECTIONS = 'Works best with Anki mode. Random inflections will be added to adjectives and verbs. Note that answers and audio will use only dictionary forms.';

const bool = (key: string, title: string, def: boolean, extra: Partial<BoolSetting> = {}): BoolSetting => ({ type: 'bool', key, title, default: def, ...extra });
const list = (key: string, title: string, options: Options, def: string, extra: Partial<ListSetting> = {}): ListSetting => ({ type: 'list', key, title, options, default: def, ...extra });
const adv = <T extends SettingDef | InfoRow>(r: T): T => ({ ...r, advanced: true });

export const ENABLE_ADVANCED: BoolSetting = bool('enable_advanced', 'Enable advanced settings', false, { summary: 'Only for experienced users!' });

// ---- The advanced keys (`PreferenceCategory "advanced"`) ---------------------------------------

type SessionKind = 'lesson' | 'review' | 'self_study';

function orderRows(kind: SessionKind): SettingDef[] {
  const rows: SettingDef[] = [
    kind === 'lesson'
      ? list('lesson_order', 'Order', LESSON_ORDERS, 'LEVEL_THEN_TYPE')
      : list(`${kind}_order`, 'Order', REVIEW_ORDERS, 'SHUFFLE'),
    bool(`${kind}_order_reversed`, 'Reverse order', false),
  ];
  if (kind !== 'lesson') rows.push(bool(`${kind}_order_overdue_first`, 'Overdue items first', false));
  rows.push(
    list(`${kind}_order_priority`, 'Priority', SESSION_PRIORITIES, 'NONE'),
    bool(`${kind}_shuffle_after_selection`, 'Shuffle after selecting items', false, { summary: SHUFFLE_AFTER_SELECTION }),
    bool(`${kind}_back_to_back`, 'Reading/meaning back-to-back', false),
    bool(`${kind}_reading_first`, 'Reading before meaning', false),
    bool(`${kind}_meaning_first`, 'Meaning before reading', false),
  );
  return rows.map((r) => adv(r));
}

function ankiRows(kind: SessionKind): SettingDef[] {
  const rows: SettingDef[] = [
    bool(`anki_mode_${kind}_meaning`, 'Anki mode for meanings', false),
    bool(`anki_mode_${kind}_reading`, 'Anki mode for readings', false),
  ];
  if (kind === 'review') rows.push(bool('review_randomize_inflections', 'Randomise inflections in review', false, { summary: RANDOMIZE_INFLECTIONS }));
  if (kind === 'self_study') rows.push(bool('self_study_randomize_inflections', 'Randomize inflections in self-study', false, { summary: RANDOMIZE_INFLECTIONS }));
  return rows.map((r) => adv(r));
}

function selectionRows(kind: SessionKind): Row[] {
  const range = (suffix: string, title: string): RangeSetting => ({ type: 'range', key: `${kind}_subjects_${suffix}`, title });
  const info: InfoRow = { type: 'info', key: `${kind}_subject_selection`, text: SUBJECT_SELECTION_NOTICE };
  return [
    info,
    range('current', 'Current-level items'),
    range('earlier', 'Earlier-level items'),
    range('radical', 'Radicals'),
    range('kanji', 'Kanji'),
    range('vocabulary', 'Vocabulary'),
    range('kana_vocabulary', 'Kana Vocabulary'),
  ].map((r) => adv<InfoRow | RangeSetting>(r));
}

const UNDO_BUTTON = adv(list('undo_button', 'Special button 1 behavior (top right)', SPECIAL_BUTTON_BEHAVIORS, 'DISABLE'));
const IGNORE_BUTTON = adv(list('ignore_button', 'Special button 2 behavior (bottom left)', SPECIAL_BUTTON_BEHAVIORS, 'DISABLE'));
const DONT_KNOW_BUTTON = adv(list('dont_know_button', "Don't know button behavior", DONT_KNOW_BEHAVIORS, 'ENABLE'));

/** The Advanced page: Java's four advanced sub-screens, all 58 values. */
export const ADVANCED_GROUPS: readonly SettingGroup[] = [
  { id: 'advanced_lesson_settings', title: 'Lesson advanced settings', rows: [...orderRows('lesson'), ...ankiRows('lesson'), ...selectionRows('lesson')] },
  { id: 'advanced_review_settings', title: 'Review advanced settings', rows: [...orderRows('review'), ...ankiRows('review'), ...selectionRows('review')] },
  { id: 'advanced_self_study_settings', title: 'Self-study advanced settings', rows: [...orderRows('self_study'), ...ankiRows('self_study'), ...selectionRows('self_study')] },
  {
    id: 'advanced_other_settings',
    title: 'Other advanced settings',
    rows: [
      adv<TextSetting>({ type: 'text', key: 'overdue_threshold', title: 'Overdue threshold percentage', default: '20' }),
      adv(bool('kanji_mode_onkun', "Quiz on/kun'yomi separately", false)),
      UNDO_BUTTON,
      IGNORE_BUTTON,
      adv(list('special_button_3', 'Special button 3 behavior (top left)', SPECIAL_BUTTON_BEHAVIORS, 'DISABLE')),
      DONT_KNOW_BUTTON,
      adv(bool('shake_on_matching_kanji', 'Soft-reject on single-kanji vocabulary', true, {
        summary: 'If an incorrect reading is an alternative reading for the kanji, do a shake-and-retry instead of failing',
      })),
      adv(bool('full_session_log', 'Show full session log', false, { summary: 'This may reveal inappropriate hints and answers' })),
      adv(bool('indicate_kanji_reading_type', 'Indicate type of reading for kanji quiz', false, {
        summary: "For a kanji reading question, indicate if the question requires an on'yomi or kun'yomi answer",
      })),
    ],
  },
];

// ---- The main screen ---------------------------------------------------------------------------

const notAlwaysHideWkMnemonic = (p: Preferences): boolean => p.always_hide_wk_mnemonic !== true;

export const MAIN_GROUPS: readonly SettingGroup[] = [
  {
    id: 'review_settings',
    title: 'Lesson/review settings',
    rows: [
      { type: 'text', key: 'max_lesson_session_size', title: 'Max. # of lessons per session', default: '5' },
      { type: 'text', key: 'max_review_session_size', title: 'Max. # of reviews per session', default: '100' },
      { type: 'text', key: 'max_self_study_session_size', title: 'Max. # of self-study items per session', default: '100' },
      bool('delay_result_upload', 'Delay processing quiz results', false, {
        mode: 'server', summary: "Doesn't process results until the session is finished. Allows unlimited undo during sessions.",
      }),
      bool('enable_lightning_mode', 'Enable lightning mode', true, { summary: 'Auto-advance to next question on a correct answer' }),
      bool('show_answer_toast', 'Enable a check mark / X animation for a correct / incorrect answer', true),
      bool('enable_srs_indicator', 'Enable SRS indicator', false, { summary: 'Show current SRS stage during reviews' }),
      bool('enable_srs_toast', 'Enable SRS up/downgrade toast', true, {
        summary: 'Show a brief notification when an item goes up or down in SRS stage during reviews',
      }),
      bool('enable_alternatives_toast', 'Enable alternative readings/meanings toast', false, {
        summary: 'Show a toast with alternative readings or meanings upon correct answer',
      }),
      bool('enable_haptic_feedback_success', 'Enable haptic feedback on correct answer', false, {
        requires: 'haptics', summary: 'The device will give a short buzz to indicate a correct answer',
      }),
      bool('enable_haptic_feedback_failure', 'Enable haptic feedback on incorrect answer', false, {
        requires: 'haptics', summary: 'The device will give a long buzz to indicate an incorrect answer',
      }),
      list('close_enough_action', 'Action for "close enough" answer', CLOSE_ENOUGH_ACTIONS, 'SILENTLY_ACCEPT'),
      bool('show_onyomi_in_katakana', "Show on'yomi readings in Katakana", false),
      bool('require_onyomi_in_katakana', "Require on'yomi answers in Katakana", false),
      bool('enable_star_ratings', 'Enable star ratings for subjects', false, {
        summary: 'If enabled you can give star ratings to subjects and use those ratings as search filters',
      }),
    ],
  },
  {
    id: 'quiz_advanced',
    title: 'Order, buttons and Anki mode',
    note: 'These are advanced settings: they apply only while "Enable advanced settings" is on. More on the Advanced page.',
    rows: [
      ENABLE_ADVANCED,
      { type: 'heading', key: 'quiz_advanced_lessons', text: 'Lessons' },
      ...[orderRows('lesson')[0]!, ...ankiRows('lesson')],
      { type: 'heading', key: 'quiz_advanced_reviews', text: 'Reviews' },
      ...[orderRows('review')[0]!, ...ankiRows('review')],
      { type: 'heading', key: 'quiz_advanced_self_study', text: 'Self-study' },
      ...[orderRows('self_study')[0]!, ...ankiRows('self_study')],
      { type: 'heading', key: 'quiz_advanced_buttons', text: 'Buttons' },
      DONT_KNOW_BUTTON,
      UNDO_BUTTON,
      IGNORE_BUTTON,
      bool('swap_anki_buttons', 'Swap the correct/incorrect Anki mode buttons', false),
    ],
  },
  {
    id: 'audio_settings',
    title: 'Audio settings',
    rows: [
      bool('autoplay_lesson_presentation', 'Autoplay audio during lesson presentation', true, { requires: 'audioPlayback' }),
      bool('autoplay_lessons', 'Autoplay audio during lessons', true, { requires: 'audioPlayback', summary: 'When answering a question correctly in a lesson session' }),
      bool('autoplay_reviews', 'Autoplay audio during reviews', true, { requires: 'audioPlayback', summary: 'When answering a question correctly in a review/self-study session' }),
      bool('autoplay_anki_reveal', 'Autoplay audio when revealing in Anki mode', true, { requires: 'audioPlayback', summary: "When clicking the 'Show answer' button in Anki mode" }),
      list('voice_preference', 'Voice preference', VOICE_PREFERENCES, 'RANDOM', { requires: 'audioPlayback' }),
      bool('auto_download_audio', 'Auto-download audio for upcoming reviews', true, { requires: 'audioDownload' }),
    ],
  },
  {
    id: 'sync_settings',
    title: 'Sync settings',
    rows: [
      bool('enable_background_sync', 'Allow background sync', false, {
        mode: 'server', requires: 'backgroundSync', summary: 'Caution - this may drain your battery faster than normal',
      }),
      bool('sync_on_open', 'Sync when the app is opened', false, { mode: 'server', summary: 'Triggers sync if the app has been closed for at least 3 min' }),
    ],
  },
  {
    id: 'other_settings',
    title: 'Notifications',
    rows: [
      bool('enable_notifications', 'Enable notifications for new reviews', true, { requires: 'notifications' }),
    ],
  },
  {
    id: 'dashboard_settings',
    title: 'Dashboard settings',
    rows: [
      bool('show_timeline', 'Show 24h review timeline', true),
      list('timeline_chart_size', 'Timeline chart size', TIME_LINE_CHART_SIZES, '24'),
      bool('show_srs_breakdown', 'Show SRS breakdown', true),
      bool('show_level_progression', 'Show level progression bars', true),
      bool('show_over_level_progression', 'Show level progression bars for levels higher than your own', false, {
        summary: 'This can happen if you unlocked subjects in the past that have since been moved above your level.',
      }),
      bool('previous_level_progression_limit', 'Limit progression bars for the completed levels to only the most recent levels', false, {
        summary: 'This can help if many new items were added to previous levels and you now have all those levels on your dashboard.',
      }),
      {
        type: 'text', key: 'previous_level_progression_limit_amount', title: 'Number of previous levels to show progression bars for',
        default: '1', min: 0, max: 60, enabledWhen: (p) => p.previous_level_progression_limit === true,
      },
    ],
  },
  {
    id: 'subject_info_settings',
    title: 'Subject Info settings',
    note: 'Settings related to the presentation of the subject info dump in various places',
    rows: [
      bool('hide_lesson_readings', 'Hide readings in lessons until tapped', false),
      bool('hide_sentence_translations', 'Hide context sentence translations until tapped', true),
      bool('show_pitch_info', 'Show pitch information on vocabulary', false),
      bool('swap_similar_amalgamations', "Swap 'visually similar' and 'used in' in subject info dump", false),
      bool('highlight_subject_tags', 'Highlight subject tags in mnemonic texts with colours', true, {
        summary: 'This replaces tags such as <kanji> with appropriate colouring instead of just making the text bold',
      }),
      bool('always_hide_wk_mnemonic', "Always hide WaniKani's own mnemonics", false),
      bool('hide_meaning_mnemonic', "Hide WaniKani's meaning mnemonic if a user note is present", false, { enabledWhen: notAlwaysHideWkMnemonic }),
      bool('hide_reading_mnemonic', "Hide WaniKani's reading mnemonic if a user note is present", false, { enabledWhen: notAlwaysHideWkMnemonic }),
      bool('show_legacy', 'Show old names and mnemonics for radicals from before the December 2018 content update', false),
      list('meaning_info_dump', 'Show info dump after a correct meaning answer', SUBJECT_INFO_DUMPS, 'ANSWERS_ONLY'),
      list('reading_info_dump', 'Show info dump after a correct reading answer', SUBJECT_INFO_DUMPS, 'ANSWERS_ONLY'),
      list('meaning_info_dump_incorrect', 'Show info dump after an incorrect meaning answer', SUBJECT_INFO_DUMPS, 'ANSWERS_ONLY'),
      list('reading_info_dump_incorrect', 'Show info dump after an incorrect reading answer', SUBJECT_INFO_DUMPS, 'ANSWERS_ONLY'),
      bool('show_stroke_order', 'Show stroke order diagrams on radicals and kanji', false),
      bool('stroke_order_animated', 'Animate the stroke order diagrams', true, { summary: 'Tap the diagram to toggle animation' }),
      { type: 'slider', key: 'stroke_order_size', title: 'Size of the stroke order diagrams', default: 250, min: 20, max: 500 },
    ],
  },
];

/**
 * Keys whose XML default differs from the `GlobalSettings` getter's default. AndroidX writes the XML
 * default the first time a settings screen shows the row, so after the learner opened settings the
 * Java app behaves as the XML says; the settings screen does the same for these (see
 * `persistShownDefaults`).
 */
export const XML_DEFAULT_DIFFERS_FROM_GETTER: readonly string[] = ['hide_sentence_translations'];

// ---- Helpers ------------------------------------------------------------------------------------

export interface RowContext {
  capabilities: Capabilities;
  mode: 'local' | 'server';
}

export function rowVisible(r: Row, c: RowContext): boolean {
  if (r.type === 'info' || r.type === 'heading') return true;
  if (r.mode !== undefined && r.mode !== c.mode) return false;
  if (r.requires !== undefined && !c.capabilities[r.requires]) return false;
  return true;
}

export function visibleRows(g: SettingGroup, c: RowContext): Row[] {
  return g.rows.filter((r) => rowVisible(r, c));
}

/** The value a row shows: the stored one, else the XML default (what AndroidX shows). */
export function shownValue(def: BoolSetting, prefs: Preferences): boolean;
export function shownValue(def: ListSetting | TextSetting, prefs: Preferences): string;
export function shownValue(def: SliderSetting, prefs: Preferences): number;
export function shownValue(def: BoolSetting | ListSetting | TextSetting | SliderSetting, prefs: Preferences): PreferenceValue {
  const v = prefs[def.key];
  switch (def.type) {
    case 'bool': return typeof v === 'boolean' ? v : def.default;
    case 'slider': return typeof v === 'number' ? v : def.default;
    default: return typeof v === 'string' ? v : def.default;
  }
}

/** `NumberRangePreference`'s summary provider. */
export function rangeSummary(min: number, max: number): string {
  if (min === -1) return max === -1 ? 'Unlimited' : `Max ${max}`;
  return max === -1 ? `Min ${min}` : `${min} - ${max}`;
}

/** The stored `<key>_min` / `<key>_max` (-1 when absent). */
export function rangeValue(prefs: Preferences, key: string): { min: number; max: number } {
  const read = (k: string): number => { const v = prefs[k]; return typeof v === 'number' ? v : -1; };
  return { min: read(`${key}_min`), max: read(`${key}_max`) };
}

/** Every key a group list stores (ranges as their two keys). For tests and the inventory. */
export function storedKeys(groups: readonly SettingGroup[]): string[] {
  const out = new Set<string>();
  for (const g of groups) {
    for (const r of g.rows) {
      if (r.type === 'info' || r.type === 'heading') continue;
      if (r.type === 'range') { out.add(`${r.key}_min`); out.add(`${r.key}_max`); } else out.add(r.key);
    }
  }
  return [...out];
}
