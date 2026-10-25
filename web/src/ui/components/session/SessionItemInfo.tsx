/**
 * The subject info under an answered question and in the lesson presentation (`SubjectInfoView` with
 * container type ANSWERED_QUESTION / LESSON_PRESENTATION): the item page with the info dump's flags, the
 * headline's reveal button ("Show answer" / "Show more" / "Show all") and an audio button where audio plays.
 * Synonyms ("+", `SubjectInfoView.prepareAddSynonymButton`) and notes (the session menu's "My notes...",
 * `StudyMaterialsActivity`) can be edited here as in Java; a new synonym counts for the next answer.
 */
import { useMemo } from 'react';
import { voicePreference } from '../../../core/audio';
import { contentSubject, progressRow, tableRow } from '../../../core/progression';
import type { ContentSubject } from '../../../core/content';
import type { InfoDumpFlags } from '../../../core/settings/sessionUi';
import { ItemPage, useSaveStudyMaterial, type ItemProgress } from '../subject';
import { useReady } from '../../hooks/useApp';
import { useNavigate } from '../../hooks/useRoute';
import { paths } from '../../routes';

export interface SessionItemInfoProps {
  subjectId: number;
  visibility: InfoDumpFlags;
  /** The reveal button's label; null hides it (`SubjectInfoDump.getShowRevealButton`). */
  revealLabel: string | null;
  onReveal(): void;
}

export function SessionItemInfo({ subjectId, visibility, revealLabel, onReveal }: SessionItemInfoProps) {
  const { learner, content, platform, state } = useReady();
  const navigate = useNavigate();
  const { onSave, error } = useSaveStudyMaterial();
  const subject = contentSubject(learner, subjectId);
  // The progress row object changes on every write that touches the subject.
  const progress = progressRow(learner, subjectId) as ItemProgress;
  const level = tableRow(learner, subjectId).level;
  const levelOf = useMemo(() => (s: ContentSubject) => learner.table.get(s.id)?.level ?? s.level, [learner]);
  const audio = platform.capabilities.audioPlayback && subject.object !== 'radical' && subject.object !== 'kanji' ? (
    <button type="button" className="kk-btn small secondary" aria-label="Play audio"
      onClick={() => void platform.audio.play(subjectId, voicePreference(state.prefs), null).catch(() => false)}>▶</button>
  ) : undefined;
  return (
    <div className="kk-quiz-info">
      {error !== null && <p className="kk-banner error" role="alert">{error}</p>}
      {revealLabel !== null && (
        <div className="kk-quiz-reveal">
          <button type="button" className="kk-btn small secondary" onClick={onReveal} data-testid="reveal">{revealLabel}</button>
        </div>
      )}
      <ItemPage
        subject={subject}
        content={content}
        progress={progress}
        settings={state.prefs}
        level={level}
        levelOf={levelOf}
        visibility={visibility}
        audio={audio}
        onOpenSubject={(id) => navigate(paths.subject(id))}
        onSaveStudyMaterial={onSave}
      />
    </div>
  );
}
