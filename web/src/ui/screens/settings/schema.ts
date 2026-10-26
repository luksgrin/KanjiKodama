/**
 * The settings rows as data: keys, types, defaults, titles, summaries and choices exactly as
 * `durtles/app/src/main/res/xml/preferences.xml` and `res/values/array.xml` have them, so a value
 * stored here means the same as in the Java app's `SharedPreferences`. `SettingRows.tsx` renders them
 * as AndroidX rows: `SETTINGS_SCREENS` are the root's sub-screens, `ADVANCED_GROUPS` the four
 * advanced sub-screens shown while `enable_advanced` is on.
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
 * Not listed (see `docs/settings-inventory.md`):
 * - API plumbing: api_key_help, api_key (asked by the import / server screens instead),
 *   audio_location (hidden in Java too: one location), web_password (resurrect through the WaniKani
 *   web site is not ported).
 * - Hidden experimental screen (`isPreferenceVisible="false"` in Java): experimental_status,
 *   exp_subject_card_layout_search, exp_subject_card_layout_grid. Hidden helper:
 *   not_always_hide_wk_mnemonic (enabledWhen below).
 * - Other actions: support_and_feedback (hidden in Java too), data_import_export, reset_database,
 *   backup_settings, restore_settings. (reset_tutorials is an action on the root screen.)
 */
import { DARK_THEME_KEY, DEFAULT_DARK_THEME, DEFAULT_LIGHT_THEME, LIGHT_THEME_KEY, THEME_OPTIONS } from '../../theme/themes';
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
export interface ListSetting extends Base {
  type: 'list'; default: string; options: readonly (readonly [value: string, label: string])[];
  /** A summary provider around the chosen entry (`%s` = the entry), e.g. the theme lists. */
  entrySummary?: string;
}
/**
 * EditTextPreference with a number keyboard; stored as the typed string. `min`/`max`:
 * EditLimitedIntPreference. `decimal`: `setDecimalNumberInputType` (a decimal point allowed).
 */
export interface TextSetting extends Base { type: 'text'; default: string; min?: number; max?: number; decimal?: boolean }
/** SeekBarPreference: an int. */
export interface SliderSetting extends Base { type: 'slider'; default: number; min: number; max: number }
/** NumberRangePreference: `<key>_min` and `<key>_max` ints, -1 = no rule. */
export interface RangeSetting extends Base { type: 'range' }
/** InfoPreference: a text row. */
export interface InfoRow { type: 'info'; key: string; text: string; advanced?: boolean }
/**
 * TaggedUrlPreference (search engines): `<key>_tag` holds the name, `<key>` the URL; the summary is
 * the name. Defaults from the XML (`defaultTag`, `defaultValue`).
 */
export interface TaggedUrlSetting extends Base { type: 'taggedUrl'; default: string; defaultTag: string }
/** A plain `Preference` that runs an action (the screen supplies the handler by key). */
export interface ActionRow { type: 'action'; key: string; title: string; summary?: string; mode?: 'local' | 'server'; requires?: keyof Capabilities }

export type SettingDef = BoolSetting | ListSetting | TextSetting | SliderSetting | RangeSetting | TaggedUrlSetting;
export type Row = SettingDef | InfoRow | ActionRow;

/** A Java sub-`PreferenceScreen`: `id` is its key, `note` its summary on the parent screen. */
export interface SettingGroup {
  id: string;
  title: string;
  /** Title in server mode, when it differs (`LocalMode.applyToPreferences`). */
  serverTitle?: string;
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
const NETWORK_RULES: Options = [
  ['ALWAYS', 'Download audio on any connection'],
  ['DOWNLOAD_WIFI_ONLY', 'Download audio only on unmetered connections (WiFi)'],
  ['WIFI_ONLY', 'Download audio only on unmetered connections (WiFi), same as above'],
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
const NOTIFICATION_UPDATE_FREQUENCIES: Options = [
  ['ONLY_NEW_REVIEWS', 'Only for new reviews'], ['ONCE_PER_HOUR', 'Once per hour'], ['CONTINUOUSLY', 'Continuously'],
];
const NOTIFICATION_PRIORITIES: Options = [['MIN', 'Minimum'], ['LOW', 'Low'], ['DEFAULT', 'Default'], ['HIGH', 'High'], ['MAX', 'Maximum']];
const NOTIFICATION_CATEGORIES: Options = [
  ['CALL', 'Incoming call'], ['NAVIGATION', 'Navigation'], ['MESSAGE', 'Incoming message'], ['EMAIL', 'Email'],
  ['EVENT', 'Calendar event'], ['PROMO', 'Promotion / Ad'], ['ALARM', 'Alarm'], ['PROGRESS', 'Progress'],
  ['SOCIAL', 'Social media'], ['ERROR', 'Error'], ['TRANSPORT', 'Media transport'], ['SYSTEM', 'System'],
  ['SERVICE', 'Service'], ['REMINDER', 'Reminder'], ['RECOMMENDATION', 'Recommendation (default)'], ['STATUS', 'Status'],
];
const TIME_LINE_CHART_STYLES: Options = [['SRS_STAGE', 'SRS Stage'], ['NEXT_SRS_STAGE', 'Next SRS Stage'], ['ITEM_TYPE', 'Item type']];
const TIME_LINE_CHART_GRID_STYLES: Options = [['OFF', 'Off'], ['FOR_BARS', 'Scaled for bars'], ['FOR_WATERFALL', 'Scaled for cumulative review count']];
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
const taggedUrl = (key: string, title: string, def = '', defaultTag = ''): TaggedUrlSetting => ({ type: 'taggedUrl', key, title, default: def, defaultTag });
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

// ---- The sub-screens of the root screen ---------------------------------------------------------

const notAlwaysHideWkMnemonic = (p: Preferences): boolean => p.always_hide_wk_mnemonic !== true;

/** The summary of the subject title size sliders. */
const HIDE_TITLE = 'Set to 0 to hide the title';

/** `PreferencesFragment`: shown on the web build only where a browser can honour it (`imeFlags`). */
const VISIBLE_PASSWORD_SUMMARY = 'This may be necessary to prevent auto-suggest on some keyboards';

/**
 * Java's root `PreferenceScreen` children before the "Advanced settings" category, in XML order. A
 * sub-screen without a visible value row is hidden (e.g. "Audio download settings" on the web build).
 * Keyboard input settings: the rows a browser can't honour (Android IME flags, set by `KkWebView`)
 * need `imeFlags`, as Java hides the language hints below Android 7 (`setVisibility`); the web build
 * keeps auto-correct (the `autocorrect` attribute) and the Next delay. The notification rows need
 * `notifications` (the web build has none) and "Request audio focus" `audioFocus` (Android), as Java
 * hides rows its device can't use.
 */
export const SETTINGS_SCREENS: readonly SettingGroup[] = [
  {
    id: 'api_settings',
    // `LocalMode.applyToPreferences` retitles it.
    title: 'Audio download settings',
    serverTitle: 'API and audio download settings',
    rows: [
      list('network_rule', 'Network access rule', NETWORK_RULES, 'DOWNLOAD_WIFI_ONLY', { requires: 'audioDownload' }),
      bool('auto_download_audio', 'Auto-download audio for upcoming reviews', true, {
        requires: 'audioDownload',
      }),
      bool('enable_background_sync', 'Allow background sync', false, {
        mode: 'server', requires: 'backgroundSync', summary: 'Caution - this may drain your battery faster than normal',
      }),
      bool('sync_on_open', 'Sync when the app is opened', false, { mode: 'server', summary: 'Triggers sync if the app has been closed for at least 3 min' }),
    ],
  },
  {
    id: 'display_settings',
    title: 'Display settings',
    rows: [
      list(LIGHT_THEME_KEY, 'Light Theme', THEME_OPTIONS, DEFAULT_LIGHT_THEME, { entrySummary: '%s theme is currently selected' }),
      list(DARK_THEME_KEY, 'Dark Theme', THEME_OPTIONS, DEFAULT_DARK_THEME, { entrySummary: '%s is used in system wide dark mode' }),
      { type: 'action', key: 'theme_customization', title: 'Theme Customisation', summary: 'Customise colors in the current theme' },
      bool('center_caret', 'Center caret in quiz answer box', false),
      { type: 'slider', key: 'anki_buttons_height', title: 'Vertical size of the Anki mode buttons', default: 50, min: 10, max: 250 },
      {
        type: 'slider', key: 'quiz_question_view_height', title: 'Fix height of main quiz question view', default: 0, min: 0, max: 500,
        summary: 'Set to 0 to not force a fixed size',
      },
      bool('swap_anki_buttons', 'Swap the correct/incorrect Anki mode buttons', false),
      bool('slide_animations', 'Use slide animations to transition between quiz questions', true),
      bool('stretch_quiz_question_view', 'Stretch the question view to fill the screen when keyboard input is active', false),
    ],
  },
  {
    id: 'dashboard_settings',
    title: 'Dashboard settings',
    rows: [
      bool('show_lesson_review_breakdown', 'Show lesson/review breakdown', false),
      bool('show_timeline', 'Show 24h review timeline', true),
      list('timeline_chart_style', 'Timeline chart style', TIME_LINE_CHART_STYLES, 'SRS_STAGE'),
      bool('show_waterfall_line', 'Show timeline waterfall line', false, { summary: 'Show cumulative amount of reviews over time in the timeline chart' }),
      list('timeline_chart_grid_style', 'Timeline chart Y-axis grid style', TIME_LINE_CHART_GRID_STYLES, 'FOR_BARS'),
      list('timeline_chart_size', 'Timeline chart size', TIME_LINE_CHART_SIZES, '24'),
      list('timeline_chart_size_shown', 'Part of timeline chart shown at once', TIME_LINE_CHART_SIZES, '24'),
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
      bool('show_post60_progression', 'Show post-60 progression bar', false, {
        summary: "Can be used at any level, but intended for level 60! Does NOT include a legend, so only enable this if you're cool with that.",
      }),
      bool('show_post60_subsections', 'Show subsections in post-60 progression bar', false, {
        summary: 'Show separate bar segments for the different Apprentice and Guru levels',
      }),
      bool('show_post60_reverse', 'Reverse post-60 progression bar', false),
      bool('show_joyo_progress', 'Show Jōyō progress', false),
      bool('show_jlpt_progress', 'Show JLPT progress', false),
      bool('show_recent_unlocks', 'Show recently unlocked items', true),
      bool('show_critical_condition', 'Show critical condition items', true),
      bool('show_burned_items', 'Show recently burned items', true),
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
  {
    id: 'audio_settings',
    title: 'Audio settings',
    rows: [
      bool('autoplay_lesson_presentation', 'Autoplay audio during lesson presentation', true, { requires: 'audioPlayback' }),
      bool('autoplay_lessons', 'Autoplay audio during lessons', true, { requires: 'audioPlayback', summary: 'When answering a question correctly in a lesson session' }),
      bool('autoplay_reviews', 'Autoplay audio during reviews', true, { requires: 'audioPlayback', summary: 'When answering a question correctly in a review/self-study session' }),
      bool('autoplay_anki_reveal', 'Autoplay audio when revealing in Anki mode', true, { requires: 'audioPlayback', summary: "When clicking the 'Show answer' button in Anki mode" }),
      list('voice_preference', 'Voice preference', VOICE_PREFERENCES, 'RANDOM', { requires: 'audioPlayback' }),
      bool('use_audio_focus', 'Request audio focus when playing vocab audio', true, {
        requires: 'audioFocus', summary: 'Asks other player apps to pause or lower their volume when playing vocab audio',
      }),
    ],
  },
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
    ],
  },
  {
    id: 'keyboard_settings',
    title: 'Keyboard input settings',
    rows: [
      { type: 'action', key: 'keyboard_help', title: 'Tap here to read some hints for keyboard settings', requires: 'imeFlags' },
      bool('enable_auto_correct_meaning', 'Allow keyboard auto-correct for meanings', false),
      bool('enable_auto_correct_reading', 'Allow keyboard auto-correct for readings', false),
      bool('force_ascii_meaning', 'Force ASCII keyboard for meanings', true, { requires: 'imeFlags' }),
      bool('force_ascii_reading', 'Force ASCII keyboard for readings', false, { requires: 'imeFlags' }),
      bool('force_visible_password_meaning', "Force 'visible password' setting for meanings", false, {
        requires: 'imeFlags', summary: VISIBLE_PASSWORD_SUMMARY,
      }),
      bool('force_visible_password_reading', "Force 'visible password' setting for readings", false, {
        requires: 'imeFlags', summary: VISIBLE_PASSWORD_SUMMARY,
      }),
      bool('ime_hint_meaning', 'Set keyboard language hint to English for meanings', false, {
        requires: 'imeFlags', summary: 'Enable this to suggest a keyboard language for meaning questions',
      }),
      bool('ime_hint_reading', 'Set keyboard language hint to Japanese for readings', false, {
        requires: 'imeFlags', summary: 'Enable this to suggest a keyboard language for reading questions',
      }),
      bool('enable_no_learning', "Enable 'no personalized learning' option", true, {
        requires: 'imeFlags', summary: 'Disable this to get rid of the annoying incognito icon in Swiftkey',
      }),
      { type: 'text', key: 'next_button_delay', title: 'Delay in seconds to disable the next/submit button after typing an incorrect answer', default: '0', decimal: true },
    ],
  },
  {
    id: 'font_settings',
    title: 'Font settings',
    rows: [
      { type: 'action', key: 'font_selection', title: 'Select fonts for quiz questions' },
      { type: 'action', key: 'font_import', title: 'Import fonts for quiz questions' },
      { type: 'slider', key: 'max_font_size_lesson', title: 'Max font size of subject title in lesson presentation', default: 128, min: 0, max: 128, summary: HIDE_TITLE },
      { type: 'slider', key: 'max_font_size_quiz', title: 'Max font size of subject title on the quiz screen', default: 28, min: 0, max: 128, summary: HIDE_TITLE },
      { type: 'slider', key: 'max_font_size_browse', title: 'Max font size of subject title on the browse screen', default: 64, min: 0, max: 128, summary: HIDE_TITLE },
      {
        type: 'slider', key: 'max_font_size_quiz_text', title: 'Max font size of main quiz question text', default: 104, min: 0, max: 500,
        summary: 'This is the large question text in the center of the quiz screen',
      },
      { type: 'slider', key: 'font_size_question_edit', title: 'Font size of answer input text box', default: 22, min: 10, max: 32 },
      { type: 'slider', key: 'font_size_subject_info', title: 'Font size of subject info dump', default: 16, min: 10, max: 32 },
      {
        type: 'slider', key: 'font_size_live_subject_table', title: 'Font size of dashboard subject tables', default: 16, min: 10, max: 32,
        summary: 'Critical condition items, recent unlocks, and recently burned',
      },
      { type: 'slider', key: 'font_size_anki_answer', title: 'Font size of Anki mode answers', default: 20, min: 10, max: 48 },
    ],
  },
  {
    id: 'other_settings',
    title: 'Notifications and other settings',
    rows: [
      {
        type: 'action', key: 'grant_notification_permission', title: 'Grant notification permission',
        summary: 'Open system settings to allow this app to send notifications', requires: 'notifications',
      },
      bool('enable_notifications', 'Enable notifications for new reviews', true, { requires: 'notifications' }),
      list('notification_update_frequency', 'Notification update frequency', NOTIFICATION_UPDATE_FREQUENCIES, 'ONLY_NEW_REVIEWS', { requires: 'notifications' }),
      list('notification_priority', 'Notification priority', NOTIFICATION_PRIORITIES, 'DEFAULT', { requires: 'notifications' }),
      list('notification_category', 'Notification category', NOTIFICATION_CATEGORIES, 'RECOMMENDATION', { requires: 'notifications' }),
      taggedUrl('search_engine_1', 'Search engine 1', 'https://ja.wiktionary.org/w/index.php?search=%s', 'Wiktionary'),
      taggedUrl('search_engine_2', 'Search engine 2', 'https://jisho.org/search/%s', 'Jisho'),
      taggedUrl('search_engine_3', 'Search engine 3'),
      taggedUrl('search_engine_4', 'Search engine 4'),
      taggedUrl('search_engine_5', 'Search engine 5'),
      bool('enable_star_ratings', 'Enable star ratings for subjects', false, {
        summary: 'If enabled you can give star ratings to subjects and use those ratings as search filters',
      }),
      bool('show_onyomi_in_katakana', "Show on'yomi readings in Katakana", false),
      bool('require_onyomi_in_katakana', "Require on'yomi answers in Katakana", false),
    ],
  },
];

/** The root's "Advanced settings" category: the switch, then (while it is on) the four sub-screens. */
export const ADVANCED_CATEGORY_TITLE = 'Advanced settings';

/**
 * Keys whose XML default differs from the `GlobalSettings` getter's default. AndroidX writes the XML
 * default the first time a settings screen shows the row, so after the learner opened settings the
 * Java app behaves as the XML says; the settings screen does the same for these (see
 * `persistShownDefaults`).
 */
export const XML_DEFAULT_DIFFERS_FROM_GETTER: readonly string[] = ['hide_sentence_translations', 'force_ascii_meaning'];

// ---- Helpers ------------------------------------------------------------------------------------

export interface RowContext {
  capabilities: Capabilities;
  mode: 'local' | 'server';
}

export function rowVisible(r: Row, c: RowContext): boolean {
  if (r.type === 'info') return true;
  if (r.mode !== undefined && r.mode !== c.mode) return false;
  if (r.requires !== undefined && !c.capabilities[r.requires]) return false;
  return true;
}

export function visibleRows(g: SettingGroup, c: RowContext): Row[] {
  return g.rows.filter((r) => rowVisible(r, c));
}

/** A sub-screen is listed when it has a visible row other than info text. */
export function groupVisible(g: SettingGroup, c: RowContext): boolean {
  return visibleRows(g, c).some((r) => r.type !== 'info');
}

export function groupTitle(g: SettingGroup, mode: 'local' | 'server'): string {
  return mode === 'server' && g.serverTitle !== undefined ? g.serverTitle : g.title;
}

/** Every sub-screen by id (root and advanced). */
export function findGroup(id: string): SettingGroup | undefined {
  return [...SETTINGS_SCREENS, ...ADVANCED_GROUPS].find((g) => g.id === id);
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
      if (r.type === 'info' || r.type === 'action') continue;
      if (r.type === 'range') { out.add(`${r.key}_min`); out.add(`${r.key}_max`); } else out.add(r.key);
      if (r.type === 'taggedUrl') out.add(`${r.key}_tag`);
    }
  }
  return [...out];
}
