/**
 * The settings the subject info (item page) reads, with their keys and defaults. None of them is
 * gated by `enable_advanced`.
 */
import { prefBoolean, type Preferences } from './index';

function prefInt(prefs: Preferences, key: string, defaultValue: number): number {
  const v = prefs[key];
  return typeof v === 'number' ? v : defaultValue;
}

/** `show_onyomi_in_katakana`, default false. */
export function showOnInKatakana(prefs: Preferences): boolean {
  return prefBoolean(prefs, 'show_onyomi_in_katakana', false);
}

/** `highlight_subject_tags`: coloured subject tags in mnemonics (else bold), default true. */
export function highlightSubjectTags(prefs: Preferences): boolean {
  return prefBoolean(prefs, 'highlight_subject_tags', true);
}

/** `hide_sentence_translations`: blur context sentence translations until tapped. */
export function hideSentenceTranslations(prefs: Preferences): boolean {
  return prefBoolean(prefs, 'hide_sentence_translations', false);
}

/** `show_pitch_info`, default false. */
export function showPitchInfo(prefs: Preferences): boolean {
  return prefBoolean(prefs, 'show_pitch_info', false);
}

/** `swap_similar_amalgamations`: "Used in" before "Visually similar". */
export function swapSimilarAndAmalgamations(prefs: Preferences): boolean {
  return prefBoolean(prefs, 'swap_similar_amalgamations', false);
}

/** Hide the meaning mnemonic: always (`always_hide_wk_mnemonic`), or with a meaning note (`hide_meaning_mnemonic`). */
export function hideMeaningMnemonic(prefs: Preferences, hasMeaningNote: boolean): boolean {
  return prefBoolean(prefs, 'always_hide_wk_mnemonic', false) || (prefBoolean(prefs, 'hide_meaning_mnemonic', false) && hasMeaningNote);
}

/** Hide the reading mnemonic: always (`always_hide_wk_mnemonic`), or with a reading note (`hide_reading_mnemonic`). */
export function hideReadingMnemonic(prefs: Preferences, hasReadingNote: boolean): boolean {
  return prefBoolean(prefs, 'always_hide_wk_mnemonic', false) || (prefBoolean(prefs, 'hide_reading_mnemonic', false) && hasReadingNote);
}

/** `show_stroke_order`, default false. */
export function showStrokeOrder(prefs: Preferences): boolean {
  return prefBoolean(prefs, 'show_stroke_order', false);
}

/** `stroke_order_animated`, default true. */
export function strokeOrderAnimated(prefs: Preferences): boolean {
  return prefBoolean(prefs, 'stroke_order_animated', true);
}

/** `stroke_order_size` in dp, default 250. */
export function strokeOrderSize(prefs: Preferences): number {
  return prefInt(prefs, 'stroke_order_size', 250);
}

/** `writing_left_handed`, default false: writing practice's buttons on the left. */
export function writingLeftHanded(prefs: Preferences): boolean {
  return prefBoolean(prefs, 'writing_left_handed', false);
}

/** `font_size_subject_info` in sp, default 16. */
export function fontSizeSubjectInfo(prefs: Preferences): number {
  return prefInt(prefs, 'font_size_subject_info', 16);
}

/** `enable_star_ratings`, default false. */
export function enableStarRatings(prefs: Preferences): boolean {
  return prefBoolean(prefs, 'enable_star_ratings', false);
}

/** `show_legacy` (old radical names and mnemonics), default false. */
export function showLegacy(prefs: Preferences): boolean {
  return prefBoolean(prefs, 'show_legacy', false);
}
