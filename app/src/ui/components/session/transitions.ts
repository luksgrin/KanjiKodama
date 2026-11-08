/**
 * Session screen transitions (with `slide_animations`): when the session shows a different screen,
 * the old one and the new one's choice reason pick the slide.
 */
import type { QuestionChoiceReason, Session } from '../../../core/session';

export type SlideAnimation = 'NONE' | 'RTL' | 'LTR';

/** `QuestionChoiceReason.getAnimation`. */
export function reasonAnimation(reason: QuestionChoiceReason): SlideAnimation {
  switch (reason) {
    case 'MOVE_TO_PREVIOUS_LESSON_ITEM':
    case 'BACK_TO_PRESENTATION':
    case 'UNDO_AND_RETRY':
    case 'UNDO_AND_PUT_BACK':
      return 'LTR';
    case 'LOAD':
    case 'STARTING_LESSON_SESSION':
    case 'STARTING_REVIEW_SESSION':
    case 'STARTING_SELF_STUDY_SESSION':
    case 'FINISHED':
      return 'NONE';
    default:
      return 'RTL';
  }
}

/** What the session screen shows. */
export interface FragmentInfo {
  kind: 'lesson' | 'unanswered' | 'answered' | 'anki';
  /** The lesson item, or the question as `itemId:type`. */
  id: string;
}

export function fragmentOf(session: Session, anki: (s: Session) => boolean): FragmentInfo | null {
  if (session.state === 'IN_LESSON_PRESENTATION') {
    return session.currentItem === null ? null : { kind: 'lesson', id: String(session.currentItem.id) };
  }
  const q = session.currentQuestion;
  if (q === null) return null;
  const id = `${q.item.id}:${q.type}`;
  if (anki(session)) return { kind: 'anki', id };
  return { kind: session.answered ? 'answered' : 'unanswered', id };
}

/** Whether the screen is replaced (an Anki question keeps its screen when answered). */
export function sameFragment(a: FragmentInfo, b: FragmentInfo): boolean {
  return a.kind === b.kind && a.id === b.id;
}

/** `oldFragment.getAnimation(newFragment)`; null old (first fragment): none. */
export function transitionAnimation(from: FragmentInfo | null, to: FragmentInfo, reason: QuestionChoiceReason): SlideAnimation {
  if (from === null || sameFragment(from, to)) return 'NONE';
  const otherQuestion = to.kind !== 'lesson' && to.id !== from.id;
  switch (from.kind) {
    case 'unanswered':
      if (to.kind === 'answered' && to.id === from.id) return 'NONE';
      return otherQuestion ? reasonAnimation(reason) : 'RTL';
    case 'answered':
      if (to.kind === 'unanswered' && to.id === from.id) return reasonAnimation(reason);
      return otherQuestion ? reasonAnimation(reason) : 'RTL';
    case 'anki':
      return otherQuestion ? reasonAnimation(reason) : 'RTL';
    case 'lesson':
      return to.kind === 'lesson' && to.id !== from.id ? reasonAnimation(reason) : 'RTL';
  }
}
