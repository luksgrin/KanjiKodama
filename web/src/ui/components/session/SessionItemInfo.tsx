/**
 * The subject info under an answered question and in the lesson presentation (`SubjectInfoView` with
 * container type ANSWERED_QUESTION / LESSON_PRESENTATION): the item page with the info dump's flags, the
 * headline's reveal button ("Show answer" / "Show more" / "Show all") and the audio button in the headline's
 * buttons column, as Java. Synonyms ("+", `SubjectInfoView.prepareAddSynonymButton`) can be added here; the
 * notes are edited from the session menu's "My notes..." (`StudyMaterialsActivity`); a new synonym counts
 * for the next answer.
 */
import { maxFontSizeQuiz } from '../../theme/fontPrefs';
import { useMemo } from 'react';
import { voicePreference } from '../../../core/audio';
import { contentSubject, progressRow, tableRow } from '../../../core/progression';
import type { ContentSubject } from '../../../core/content';
import type { InfoDumpFlags } from '../../../core/settings/sessionUi';
import { AudioButton, ItemPage, useCardProgress, useSaveStudyMaterial, type ItemProgress } from '../subject';
import { useReady } from '../../hooks/useApp';
import { useNavigate } from '../../hooks/useRoute';
import { paths } from '../../routes';

export interface SessionItemInfoProps {
  subjectId: number;
  visibility: InfoDumpFlags;
  /** The reveal button's label; null hides it (`SubjectInfoDump.getShowRevealButton`). */
  revealLabel: string | null;
  onReveal(): void;
  /** Headline tile size: 128 in the lesson presentation, 28 under an answered question (Java defaults). */
  maxFontSize?: number;
}

export function SessionItemInfo({ subjectId, visibility, revealLabel, onReveal, maxFontSize: maxFontSizeProp }: SessionItemInfoProps) {
  const { learner, content, platform, state } = useReady();
  // `max_font_size_quiz` (Font settings) unless the caller gives the lesson size.
  const maxFontSize = maxFontSizeProp ?? maxFontSizeQuiz(state.prefs);
  const navigate = useNavigate();
  const { onSave, error } = useSaveStudyMaterial();
  const cardProgress = useCardProgress();
  const subject = contentSubject(learner, subjectId);
  // The progress row object changes on every write that touches the subject.
  const progress = progressRow(learner, subjectId) as ItemProgress;
  const level = tableRow(learner, subjectId).level;
  const levelOf = useMemo(() => (s: ContentSubject) => learner.table.get(s.id)?.level ?? s.level, [learner]);
  const hasAudio = platform.capabilities.audioPlayback
    && (subject.object === 'kana_vocabulary' || (subject.object === 'vocabulary' && subject.readings.length > 0));
  // The headline's buttons column: the reveal button ("Show more" / "Show all"), then the audio button.
  const buttons = revealLabel !== null || hasAudio ? (
    <>
      {revealLabel !== null && (
        <button type="button" className="kk-btn kk-reveal-btn" onClick={onReveal} data-testid="reveal">{revealLabel}</button>
      )}
      {hasAudio && (
        <AudioButton label={subject.characters ?? ''}
          onPlay={() => platform.audio.play(subjectId, voicePreference(state.prefs), null)} />
      )}
    </>
  ) : undefined;
  return (
    <div className="kk-quiz-info">
      {error !== null && <p className="kk-banner error" role="alert">{error}</p>}
      <ItemPage
        subject={subject}
        content={content}
        progress={progress}
        settings={state.prefs}
        level={level}
        levelOf={levelOf}
        visibility={visibility}
        audio={buttons}
        onOpenSubject={(id) => navigate(paths.subject(id))}
        onSaveStudyMaterial={onSave}
        cardProgress={cardProgress}
        maxFontSize={maxFontSize}
      />
    </div>
  );
}
