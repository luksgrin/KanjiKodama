/**
 * The item page screen (`/subject/:id`): Java's `SubjectInfoFragment` with `views/SubjectInfoView`
 * opened from browse, search results, the dashboard or a session. The page itself is
 * `ui/components/subject/ItemPage`; this screen wires it to the app:
 *
 * - levels of the current curriculum (`learner.table`), links → other item pages;
 * - notes and synonyms: the subject columns `SaveStudyMaterialJob.runLocal` writes, persisted, and in
 *   server mode also the study-material upload (`db.assertSubmitStudyMaterialTask`);
 * - the audio button (`SubjectInfoHeadlineView`: vocabulary and kana vocabulary, Android only);
 * - the toolbar: "力 (level 3 kanji)" in the subject's colour, Java's menu (My notes..., and the session
 *   items while a session runs);
 * - the Resurrect / Burn buttons (`SubjectInfoView.java:731-745`, `ResurrectActivity`, `BurnActivity`)
 *   in local mode, and the star rating (`StarRatingView`, `enable_star_ratings`).
 */
import { useCallback, useMemo, useState } from 'react';
import { voicePreference } from '../../../core/audio';
import type { ContentSubject } from '../../../core/content';
import { isBurnable, isResurrectable } from '../../../core/progression';
import { enableStarRatings } from '../../../core/settings/subjectInfo';
import {
  AudioButton, InfoTitle, ItemPage, StarRating, useCardProgress, useSaveStudyMaterial, useStarRatings, type ItemProgress,
} from '../../components/subject';
import { useSessionMenu } from '../../components/session/SessionMenu';
import { useSession } from '../../components/session/useSession';
import { useToolbar } from '../../shell/toolbar';
import { NUMERIC_COLUMNS, TEXT_COLUMNS, numberOf, type SubjectProgressRow } from '../../../core/progressFile/format';
import { useApp, useReady } from '../../hooks/useApp';
import { useNavigate, useRoute } from '../../hooks/useRoute';
import { paths } from '../../routes';
import { BurnResurrectDialog, runBurnResurrect, type BurnResurrectKind } from './BurnResurrectDialog';
import './subjectScreen.css';

/** The progress row as the item page reads it (numeric columns as Java's long fields: NULL/text → 0). */
function itemProgress(row: SubjectProgressRow | undefined): ItemProgress | null {
  if (row === undefined) return null;
  const out: Record<string, number | string | null> = {};
  for (const c of NUMERIC_COLUMNS) out[c] = numberOf(row[c]);
  for (const c of TEXT_COLUMNS) out[c] = row[c];
  return out as ItemProgress;
}

/** `SubjectInfoHeadlineView`: one play button (the characters) for vocabulary with readings and kana vocabulary. */
function hasAudioButton(s: ContentSubject): boolean {
  return s.object === 'kana_vocabulary' || (s.object === 'vocabulary' && s.readings.length > 0);
}

export function SubjectScreen() {
  const { params } = useRoute();
  const id = Number(params.id);
  const app = useApp();
  const { learner, content, platform, state } = useReady();
  const navigate = useNavigate();
  const stars = useStarRatings();
  const [dialog, setDialog] = useState<BurnResurrectKind | null>(null);
  const { rt, snap } = useSession();
  const cardProgress = useCardProgress();

  const subject = Number.isInteger(id) ? learner.content.byId.get(id) : undefined;
  const progress = useMemo(() => (subject ? itemProgress(learner.progress.subjects.get(subject.id)) : null), [learner, subject, state.revision]);
  const level = subject ? learner.table.get(subject.id)?.level : undefined;
  // The session's menu items while one runs (the Java menu is the same in every activity), My notes...
  const menu = useSessionMenu(rt, snap.session, subject?.id ?? null, { onSessionScreen: false });
  // Toolbar: "力 (level 3 kanji)" in the subject's colour (SubjectInfoHeadlineView.layoutSubject).
  useToolbar({
    title: subject ? <InfoTitle subject={subject} level={level ?? subject.level} /> : undefined,
    color: subject?.object,
    actions: menu.actions,
  });
  const levelOf = useCallback((s: ContentSubject) => learner.table.get(s.id)?.level ?? s.level, [learner, state.revision]);
  const onOpenSubject = useCallback((target: number) => navigate(paths.subject(target)), [navigate]);

  const { onSave, error } = useSaveStudyMaterial();

  const local = state.mode !== 'server';
  const canResurrect = useMemo(() => subject !== undefined && local && isResurrectable(learner, subject.id),
    [learner, subject, local, state.revision]);
  const canBurn = useMemo(() => subject !== undefined && local && isBurnable(learner, subject.id),
    [learner, subject, local, state.revision]);

  if (!subject) {
    return <p className="kk-muted kk-subject-missing">No such item.</p>;
  }

  // AudioUtil.playAudio(subject, null). The web build streams (online only): play() is false offline.
  const audio = platform.capabilities.audioPlayback && hasAudioButton(subject) ? (
    <AudioButton label={subject.characters ?? ''} onPlay={() => platform.audio.play(subject.id, voicePreference(state.prefs), null)} />
  ) : undefined;

  const showStars = enableStarRatings(state.prefs);
  const extras = (showStars || canResurrect || canBurn) ? (
    <section className="kk-subject-section kk-subject-extras">
      {showStars && (
        <div className="kk-subject-stars">
          <span className="kk-subject-label">Star rating:</span>
          <StarRating
            value={stars.ratings.get(subject.id) ?? 0}
            disabled={!stars.loaded}
            onChange={(n) => void stars.set([subject.id], n)}
          />
        </div>
      )}
      {(canResurrect || canBurn) && (
        <div className="kk-btn-row">
          {canResurrect && (
            <button type="button" className="kk-btn small" onClick={() => setDialog('resurrect')}>Resurrect</button>
          )}
          {canBurn && (
            <button type="button" className="kk-btn small danger" onClick={() => setDialog('burn')}>Burn</button>
          )}
        </div>
      )}
    </section>
  ) : null;

  return (
    <div className="kk-subject-screen">
      {error !== null && <p className="kk-banner error" role="alert">{error}</p>}
      <ItemPage
        key={subject.id}
        subject={subject}
        content={content}
        progress={progress}
        settings={state.prefs}
        level={level}
        levelOf={levelOf}
        audio={audio}
        onOpenSubject={onOpenSubject}
        onSaveStudyMaterial={onSave}
        cardProgress={cardProgress}
        extras={extras}
      />
      {menu.dialogs}
      {dialog !== null && (
        <BurnResurrectDialog
          kind={dialog}
          subjects={[subject]}
          run={(ids) => runBurnResurrect(app, dialog, ids)}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}
