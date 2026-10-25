/**
 * The item page: the Java subject info screen (`SubjectInfoView`, layout `subject_info.xml`) for one
 * subject, sections in Java's order:
 *
 * headline (title, meanings, readings or pitch accent, audio) · on'yomi / kun'yomi / nanori ·
 * components ("Used radicals:" / "Used kanji:") · meaning mnemonic, hint, my meaning note, my synonyms
 * (+) · reading mnemonic, hint, my reading note · Parts and sound (kanji) · part of speech · stroke
 * order · context sentences · "Visually similar:" and "Used in:" (swapped by
 * `swap_similar_amalgamations`) · details table.
 *
 * Visibility follows `SubjectInfoView.layoutSubjectImpl` with the four info-dump flags (all on, as in
 * the browse screen, unless `visibility` says otherwise: lessons and answered questions pass theirs).
 * The Resurrect / Burn buttons (`subject_info.xml`, below the details table) and the star rating go in
 * the `extras` slot (the subject screen fills it). Not ported: legacy radical names (no data), the image
 * titles of the 19 image-only radicals (the slug is shown).
 */
import { useMemo, type ReactNode } from 'react';
import type { Database } from 'sql.js';
import type { Content, ContentSubject } from '../../../core/content';
import { parseMeaningSynonyms } from '../../../core/answer/synonyms';
import type { Preferences } from '../../../core/settings';
import {
  fontSizeSubjectInfo,
  hideMeaningMnemonic,
  hideReadingMnemonic,
  hideSentenceTranslations,
  highlightSubjectTags,
  showOnInKatakana as showOnInKatakanaSetting,
  showPitchInfo,
  showStrokeOrder,
  strokeOrderAnimated,
  strokeOrderSize,
  swapSimilarAndAmalgamations,
} from '../../../core/settings/subjectInfo';
import { findSrsSystem, srsSystemFromData } from '../../../core/srs';
import { hasPitchInfo } from './pitchInfo';
import { dbSoundLookup, soundComponentsHtml } from './soundComponents';
import { StrokeDiagram } from './StrokeDiagram';
import { SynonymsLine, type SaveStudyMaterial } from './StudyMaterials';
import { readPitchInfo, readStrokeData, readSubjectTexts } from './subjectContent';
import {
  ContextSentences,
  DetailsTable,
  Headline,
  KanjiReadings,
  PartsOfSpeech,
  SubjectLinks,
  type DetailsProgress,
} from './SubjectSections';
import { componentsHeaderText, isEmpty, mnemonicHtml, noteHtml } from './subjectText';
import { WkMarkup } from './WkMarkup';
import './subject.css';

/** `SubjectInfoDump`'s four flags for the current state. */
export interface InfoVisibility {
  meaningAnswers: boolean;
  readingAnswers: boolean;
  meaningRelated: boolean;
  readingRelated: boolean;
}

export const SHOW_ALL: InfoVisibility = { meaningAnswers: true, readingAnswers: true, meaningRelated: true, readingRelated: true };

/** The progress row columns the page reads (a `SubjectProgressRow` fits). */
export type ItemProgress = DetailsProgress & {
  meaningNote?: string | number | null;
  readingNote?: string | number | null;
  meaningSynonyms?: string | number | null;
};

export interface ItemPageProps {
  subject: ContentSubject;
  /** The open content file and its subjects (`LoadedContent` fits). */
  content: { db: Database; content: Content };
  /** The subject's progress row (null: not started, no notes). */
  progress?: ItemProgress | null;
  /** The preferences (`SharedPreferences` keys); absent keys take Java's defaults. */
  settings?: Preferences;
  /** The subject's level in the current curriculum (defaults to `subject.level`, the WaniKani order). */
  level?: number;
  /** Level of any subject in the current curriculum (Parts and sound "L12" marks); default: content level. */
  levelOf?: (subject: ContentSubject) => number;
  visibility?: Partial<InfoVisibility>;
  /** Show pitch accent (default: the `show_pitch_info` setting). False hides it whatever the setting. */
  pitch?: boolean;
  /** Show the stroke order (default: the `show_stroke_order` setting). */
  strokeOrder?: boolean;
  /** Audio button(s) for the headline (Android). */
  audio?: ReactNode;
  /** Open a linked subject (components, visually similar, used in). Without it the links are plain. */
  onOpenSubject?: (id: number) => void;
  /** Save synonyms ("+"); without it the page is read-only. Notes: `NotesDialog` from the "My notes..." menu item. */
  onSaveStudyMaterial?: SaveStudyMaterial;
  /** The subject cards' progress line ("Guru I - 3h"; `useCardProgress`). */
  cardProgress?: (subject: ContentSubject) => string | null;
  /** Below the details table (Java's Resurrect / Burn buttons): the subject screen's extras. */
  extras?: ReactNode;
}

const textOrNull = (v: string | number | null | undefined): string | null =>
  v === null || v === undefined ? null : String(v);

function synonymsOf(column: string | null): string[] {
  try {
    return parseMeaningSynonyms(column);
  } catch {
    return [];
  }
}

/** The whole item page for one subject. */
export function ItemPage({
  subject,
  content,
  progress = null,
  settings = {},
  level,
  levelOf,
  visibility,
  pitch,
  strokeOrder,
  audio,
  onOpenSubject,
  onSaveStudyMaterial,
  cardProgress,
  extras,
}: ItemPageProps) {
  const { db } = content;
  const v = { ...SHOW_ALL, ...visibility };
  const highlight = highlightSubjectTags(settings);
  const katakana = showOnInKatakanaSetting(settings);
  const fontSize = fontSizeSubjectInfo(settings);

  const texts = useMemo(() => readSubjectTexts(db, subject.id), [db, subject.id]);
  const strokes = useMemo(
    () => (subject.object === 'radical' || subject.object === 'kanji' ? readStrokeData(db, subject.id) : []),
    [db, subject.id, subject.object],
  );
  const pitchInfo = useMemo(() => readPitchInfo(db, subject.id), [db, subject.id]);
  const soundHtml = useMemo(
    () => (subject.object === 'kanji' ? soundComponentsHtml(subject, dbSoundLookup(db, content.content, levelOf)) : null),
    [db, content.content, subject, levelOf],
  );
  const srsSystem = useMemo(
    () => findSrsSystem(content.content.srsSystems.map(srsSystemFromData), subject.srsSystemId),
    [content.content.srsSystems, subject.srsSystemId],
  );

  const meaningNote = textOrNull(progress?.meaningNote);
  const readingNote = textOrNull(progress?.readingNote);
  const synonyms = useMemo(() => synonymsOf(textOrNull(progress?.meaningSynonyms)), [progress?.meaningSynonyms]);

  const hasMeaningNote = !isEmpty(meaningNote);
  const hasReadingNote = !isEmpty(readingNote);
  const showMeaningMnemonic = !hideMeaningMnemonic(settings, hasMeaningNote);
  const showReadingMnemonic = !hideReadingMnemonic(settings, hasReadingNote);
  const hasMeaningMnemonic = !isEmpty(texts.meaningMnemonic);
  const hasReadingMnemonic = !isEmpty(texts.readingMnemonic);

  const withPitch = (pitch ?? showPitchInfo(settings)) && hasPitchInfo(subject, pitchInfo) && v.readingAnswers;
  const withStrokes = v.meaningRelated && (strokeOrder ?? showStrokeOrder(settings)) && strokes.length > 0;

  const links = (header: string, ids: readonly number[]) =>
    v.meaningRelated && ids.length > 0 ? (
      <SubjectLinks
        header={header}
        ids={ids}
        content={content.content}
        showReading={v.readingRelated}
        showOnInKatakana={katakana}
        onOpenSubject={onOpenSubject}
        progressOf={cardProgress}
      />
    ) : null;
  const similar = links('Visually similar:', subject.visuallySimilarSubjectIds);
  const usedIn = links('Used in:', subject.amalgamationSubjectIds);
  const swap = swapSimilarAndAmalgamations(settings);

  return (
    <article className={`kk-item kk-item--${subject.object}`} style={{ fontSize }} data-subject-id={subject.id}>
      <Headline
        subject={subject}
        level={level}
        showMeaningAnswers={v.meaningAnswers}
        showReadingAnswers={v.readingAnswers}
        showOnInKatakana={katakana}
        pitchInfo={withPitch ? pitchInfo : null}
        audio={audio}
        fontSize={fontSize}
      />

      {v.readingAnswers && subject.object === 'kanji' && <KanjiReadings subject={subject} showOnInKatakana={katakana} />}

      {links(componentsHeaderText(subject.object), subject.componentSubjectIds)}

      {hasMeaningMnemonic && (v.meaningRelated || (v.meaningAnswers && synonyms.length > 0)) && <hr className="kk-subject-divider" />}
      {v.meaningRelated && hasMeaningMnemonic && showMeaningMnemonic && (
        <WkMarkup as="p" className="kk-subject-line kk-mnemonic" html={mnemonicHtml('meaning', texts.meaningMnemonic)} highlight={highlight} />
      )}
      {v.meaningRelated && !isEmpty(texts.meaningHint) && showMeaningMnemonic && (
        <WkMarkup as="p" className="kk-subject-line kk-hint" html={texts.meaningHint ?? ''} highlight={highlight} />
      )}
      {v.meaningRelated && hasMeaningNote && (
        <WkMarkup as="p" className="kk-subject-line kk-note-text" html={noteHtml('meaning', meaningNote)} highlight={highlight} />
      )}
      {v.meaningAnswers && (
        <SynonymsLine
          subjectId={subject.id}
          synonyms={synonyms}
          meaningNote={meaningNote}
          readingNote={readingNote}
          onSave={onSaveStudyMaterial}
          highlight={highlight}
        />
      )}

      {v.readingRelated && hasReadingMnemonic && <hr className="kk-subject-divider" />}
      {v.readingRelated && hasReadingMnemonic && showReadingMnemonic && (
        <WkMarkup as="p" className="kk-subject-line kk-mnemonic" html={mnemonicHtml('reading', texts.readingMnemonic)} highlight={highlight} />
      )}
      {v.readingRelated && !isEmpty(texts.readingHint) && showReadingMnemonic && (
        <WkMarkup as="p" className="kk-subject-line kk-hint" html={texts.readingHint ?? ''} highlight={highlight} />
      )}
      {v.readingRelated && hasReadingNote && (
        <WkMarkup as="p" className="kk-subject-line kk-note-text" html={noteHtml('reading', readingNote)} highlight={highlight} />
      )}

      {v.readingRelated && soundHtml !== null && (
        <>
          <hr className="kk-subject-divider" />
          <WkMarkup as="p" className="kk-subject-line kk-sound" html={soundHtml} highlight={highlight} />
        </>
      )}

      {v.meaningRelated && subject.partsOfSpeech.length > 0 && (
        <>
          <hr className="kk-subject-divider" />
          <PartsOfSpeech partsOfSpeech={subject.partsOfSpeech} />
        </>
      )}

      {withStrokes && (
        <>
          <hr className="kk-subject-divider" />
          <StrokeDiagram strokes={strokes} size={strokeOrderSize(settings)} animated={strokeOrderAnimated(settings)} />
        </>
      )}

      {v.meaningRelated && texts.contextSentences.length > 0 && (
        <>
          <hr className="kk-subject-divider" />
          <ContextSentences sentences={texts.contextSentences} hideTranslations={hideSentenceTranslations(settings)} />
        </>
      )}

      {swap ? usedIn : similar}
      {swap ? similar : usedIn}

      {(v.meaningAnswers || v.readingAnswers) && (
        <>
          <hr className="kk-subject-divider" />
          <DetailsTable subject={subject} progress={progress} srsSystem={srsSystem} />
        </>
      )}

      {extras}

    </article>
  );
}
