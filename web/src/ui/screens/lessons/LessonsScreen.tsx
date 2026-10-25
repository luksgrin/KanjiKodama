/**
 * Lessons (`MainActivity` "Start lessons" → `Session.startNewLessonSession(availableLessons)`): the lesson
 * presentation, one item page per item (`fragments/LessonSessionFragment`, `SubjectInfoView` with
 * LESSON_PRESENTATION), then the lesson quiz. The batch size and order come from the lesson settings
 * (`max_lesson_session_size`, `lesson_order`, … in core `settingsOrdering`).
 */
import { useEffect, useState } from 'react';
import type { Session } from '../../../core/session';
import { autoplayLessonPresentation, infoDumpFlags, infoDumpNextStage, infoDumpRevealLabel, infoDumpShowReveal, lessonInfoDump } from '../../../core/settings/sessionUi';
import { contentSubject, tableRow } from '../../../core/progression';
import { useReady } from '../../hooks/useApp';
import { useToolbar } from '../../shell/toolbar';
import { SessionItemInfo } from '../../components/session/SessionItemInfo';
import { useSessionMenu } from '../../components/session/SessionMenu';
import { infoTitle } from '../../components/subject/subjectText';
import { SessionScreen } from '../../components/session/SessionScreen';
import type { SessionRuntime } from '../../components/session/runtime';

function LessonPresentation({ rt, session }: { rt: SessionRuntime; session: Session }) {
  const { learner, state } = useReady();
  const item = session.currentItem;
  const subject = item === null ? null : contentSubject(learner, item.id);
  const menu = useSessionMenu(rt, session, item?.id ?? null);
  // Toolbar: "一 (level 1 radical)" in the subject's colour (LessonSessionFragment.getToolbarTitle).
  useToolbar({
    title: subject === null ? '' : infoTitle(subject, tableRow(learner, subject.id).level),
    color: subject?.object ?? 'default',
    actions: menu.actions,
  });
  const [dump, setDump] = useState(() => lessonInfoDump(state.prefs));
  const [busy, setBusy] = useState(false);
  const itemId = item?.id ?? 0;
  useEffect(() => {
    setDump(lessonInfoDump(state.prefs));
    if (itemId !== 0 && autoplayLessonPresentation(state.prefs)) rt.playOnce(itemId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId]);
  if (item === null) return null;
  const index = session.items.indexOf(item);
  const last = index === session.items.length - 1;
  const run = (f: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    void f().finally(() => setBusy(false));
  };
  return (
    <section className="kk-lesson" aria-label="Lesson">
      {/* fragment_lesson.xml: Previous (gone on the first item) | space | n/m | space | Next. */}
      <div className="kk-lesson-nav">
        {index > 0 && (
          <button type="button" className="kk-btn" disabled={busy} data-testid="lesson-previous" onClick={() => run(() => rt.presentationPrevious())}>Previous</button>
        )}
        <span className="kk-lesson-space" />
        <span className="kk-lesson-progress" data-testid="session-progress">{`${index + 1}/${session.items.length}`}</span>
        <span className="kk-lesson-space" />
        <button type="button" className="kk-btn" disabled={busy} data-testid="lesson-next" onClick={() => run(() => rt.presentationNext())}>
          {last ? 'Start quiz' : 'Next'}
        </button>
      </div>
      <SessionItemInfo
        key={item.id}
        subjectId={item.id}
        visibility={infoDumpFlags(dump, null)}
        revealLabel={infoDumpShowReveal(dump) ? infoDumpRevealLabel(dump) : null}
        onReveal={() => setDump(infoDumpNextStage(dump))}
        maxFontSize={128}
      />
      {menu.dialogs}
    </section>
  );
}

export function LessonsScreen() {
  return (
    <SessionScreen
      kind="LESSON"
      start={(rt) => rt.startLessons()}
      emptyText="No lessons available."
      presentation={(rt, _snap, session) => <LessonPresentation rt={rt} session={session} />}
    />
  );
}
