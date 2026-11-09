/**
 * The first-start guide (issue #5): who sees it, its steps, and the starting points each
 * curriculum order offers. Pure: the learner database and the settings come in as arguments; the
 * screen (`ui/screens/onboarding/`) runs the existing curriculum, level test, fast travel and import
 * flows for the choices.
 *
 * Shown once, on a start at the dashboard, to a learner who hasn't done anything yet: no progress
 * and no settings changed. Finishing or skipping it stores {@link ONBOARDING_DONE_KEY}; Settings,
 * Progress, "Getting started guide" opens it again.
 */

import type { CurriculumMode } from '../curriculum';
import { levelTestStatus } from '../levelTest/status';
import { sqlNonZero, type LearnerDb } from '../progression/db';
import type { Preferences } from '../settings';

/** Set once the guide was finished or skipped. */
export const ONBOARDING_DONE_KEY = 'onboarding_done';

/**
 * Stored settings that don't say the learner has used the app, by key prefix: the Android update
 * check's bookkeeping (written by itself), and font and text size (the guide's own Appearance step,
 * so a guide left halfway opens again).
 */
export const ONBOARDING_IGNORED_PREF_PREFIXES: readonly string[] = [
  // The update check (ui/update/updateController.ts: kk_update_last_check, kk_update_later_*).
  'kk_update_',
  // Font and text size: the font_size_* sliders, and (TODO: the appearance picker's own keys, a
  // guess until it lands) font_* / text_size*.
  'font_',
  'text_size',
];

/** The same, by exact key: the quiz font choice (ui/theme/quizFonts.ts SELECTED_FONTS_KEY). */
export const ONBOARDING_IGNORED_PREF_KEYS: readonly string[] = [ONBOARDING_DONE_KEY, 'selected_fonts'];

/** True when the learner has progress of any kind: an item started, notes, a level, a jump, a test. */
export function hasProgress(db: LearnerDb): boolean {
  const p = db.progress;
  if (p.userLevel !== 1 || p.curriculum !== 'WANIKANI' || p.jumps.length > 0 || p.probation.size > 0) return true;
  if (levelTestStatus(db) !== 'NONE') return true;
  for (const row of p.subjects.values()) {
    if (sqlNonZero(row.startedAt) || sqlNonZero(row.passedAt) || sqlNonZero(row.burnedAt)) return true;
    if (row.meaningNote || row.meaningSynonyms || row.readingNote) return true;
  }
  return false;
}

/** True when a setting was stored by the learner (anything but the ignored ones above). */
export function hasChangedSettings(prefs: Preferences): boolean {
  return Object.entries(prefs).some(([k, v]) => v !== undefined && v !== null && !ONBOARDING_IGNORED_PREF_KEYS.includes(k)
    && !ONBOARDING_IGNORED_PREF_PREFIXES.some((p) => k.startsWith(p)));
}

/** Whether the guide opens by itself: local mode, not done yet, a learner who hasn't started. */
export function needsOnboarding(db: LearnerDb, prefs: Preferences, mode: 'local' | 'server'): boolean {
  return mode === 'local' && prefs[ONBOARDING_DONE_KEY] !== true && !hasProgress(db) && !hasChangedSettings(prefs);
}

/**
 * The guide's steps, in order: what the app does, font and text size (early, so the rest of the
 * guide shows in them), how the quizzes work (colours are item types; meaning vs reading
 * questions), the curriculum order, where to start, and the last tips.
 */
export const ONBOARDING_STEPS = ['welcome', 'appearance', 'quiz', 'path', 'start', 'done'] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

/** The step after `step` (the last one stays). */
export function nextStep(step: OnboardingStep): OnboardingStep {
  const i = ONBOARDING_STEPS.indexOf(step);
  return ONBOARDING_STEPS[Math.min(i + 1, ONBOARDING_STEPS.length - 1)]!;
}

/** The step before `step`, or null on the first one. */
export function previousStep(step: OnboardingStep): OnboardingStep | null {
  const i = ONBOARDING_STEPS.indexOf(step);
  return i <= 0 ? null : ONBOARDING_STEPS[i - 1]!;
}

/**
 * Where to start: from the beginning, or in JLPT order the kanji level test and fast travel, in
 * WaniKani order the WaniKani progress import.
 */
export type StartChoice = 'BEGINNING' | 'LEVEL_TEST' | 'FAST_TRAVEL' | 'IMPORT';

/** The starting points offered in each order, the default first. */
export function startChoices(mode: CurriculumMode): readonly StartChoice[] {
  return mode === 'JLPT' ? ['BEGINNING', 'LEVEL_TEST', 'FAST_TRAVEL'] : ['BEGINNING', 'IMPORT'];
}
