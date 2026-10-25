/**
 * The subject cards' third line (`SubjectCardBinder.bindNormal`): "Guru I - 3h", the stage alone when no
 * review is scheduled ("Initiate"), nothing when locked; vocabulary shows the full stage name, the others
 * the short one.
 */
import { useCallback } from 'react';
import type { ContentSubject } from '../../../core/content';
import { num, progressRow, srsSystemOf, type LearnerDb } from '../../../core/progression';
import { useReady } from '../../hooks/useApp';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** `ObjectSupport.getShortWaitTimeAsInformalString`: now, 12m, 5h, 3d (rounded). */
export function shortWaitTime(waitTime: number): string {
  if (waitTime <= 0) return 'now';
  if (waitTime < HOUR) return `${Math.trunc((waitTime + MINUTE / 2) / MINUTE)}m`;
  if (waitTime < DAY * 2) return `${Math.trunc((waitTime + HOUR / 2) / HOUR)}h`;
  return `${Math.trunc((waitTime + DAY / 2) / DAY)}d`;
}

export function cardProgressText(learner: LearnerDb, subject: ContentSubject, now: number): string | null {
  if (!learner.table.has(subject.id)) return null;
  const row = progressRow(learner, subject.id);
  const stage = srsSystemOf(learner, subject.id).getStage(num(row, 'srsStage'));
  if (stage.isLocked) return null;
  const name = subject.object === 'vocabulary' || subject.object === 'kana_vocabulary' ? stage.name : stage.shortName;
  const availableAt = num(row, 'availableAt');
  if (availableAt === 0) return name;
  return `${name} - ${shortWaitTime(availableAt - now)}`;
}

/** `cardProgressText` for the app's learner (re-created on every write). */
export function useCardProgress(): (subject: ContentSubject) => string | null {
  const { learner, state } = useReady();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useCallback((s: ContentSubject) => cardProgressText(learner, s, Date.now()), [learner, state.revision]);
}
