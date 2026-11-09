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
 * Settings the app writes by itself (the Android update check's bookkeeping), so they don't say the
 * learner has used the app.
 */
const AUTOMATIC_PREF_PREFIXES: readonly string[] = ['kk_update_'];

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

/** True when a setting was stored by the learner (anything but the guide's own key and automatic ones). */
export function hasChangedSettings(prefs: Preferences): boolean {
  return Object.entries(prefs).some(([k, v]) => v !== undefined && v !== null && k !== ONBOARDING_DONE_KEY
    && !AUTOMATIC_PREF_PREFIXES.some((p) => k.startsWith(p)));
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
 * Where to start: from the beginning, the kanji level test (it places you in JLPT order), fast
 * travel (JLPT order only) or the WaniKani progress import (WaniKani order).
 */
export type StartChoice = 'BEGINNING' | 'LEVEL_TEST' | 'FAST_TRAVEL' | 'IMPORT';

/** The starting points offered in each order, the default first. */
export function startChoices(mode: CurriculumMode): readonly StartChoice[] {
  return mode === 'JLPT' ? ['BEGINNING', 'LEVEL_TEST', 'FAST_TRAVEL'] : ['BEGINNING', 'IMPORT', 'LEVEL_TEST'];
}
