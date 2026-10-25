/**
 * The building blocks of the item page, each matching a part of the Java subject info screen.
 *
 * Java: `views/SubjectInfoHeadlineView` (title, meanings, readings or pitch, audio buttons column),
 * `views/SubjectInfoView` + `layout/subject_info.xml` (on'yomi/kun'yomi/nanori lines, parts of speech,
 * context sentences, the subject tables and the details table), `views/SubjectGridView` (linked
 * subjects).
 */
import './subject.css';
import { useState, type ReactNode } from 'react';
import type { Content, ContentSubject } from '../../../core/content';
import type { SrsSystem } from '../../../core/srs';
import { PitchAccent } from './PitchAccent';
import { pitchBlocks, type PitchInfo } from './pitchInfo';
import type { ContextSentence } from './subjectContent';
import {
  hasReadingOfType,
  jlptLevelString,
  joyoGradeString,
  kunYomiHtml,
  meaningHtml,
  nanoriHtml,
  oneMeaning,
  oneReading,
  onYomiHtml,
  partsOfSpeechHtml,
  regularReadingHtml,
  simpleInfoTitle,
  subjectTitle,
} from './subjectText';
import { WkMarkup } from './WkMarkup';

export interface HeadlineProps {
  subject: ContentSubject;
  /** The level to show (the current curriculum's; defaults to `subject.level`). */
  level?: number;
  showMeaningAnswers?: boolean;
  showReadingAnswers?: boolean;
  showOnInKatakana?: boolean;
  /** Pitch records; shown instead of the reading line when non-null and the subject has some for its readings. */
  pitchInfo?: readonly PitchInfo[] | null;
  /** Audio button(s) slot (the Java buttons column; vocabulary only there). */
  audio?: ReactNode;
  /** Base font size in px (`font_size_subject_info`, default 16). */
  fontSize?: number;
}

/** Title tile, "Level N kanji", meanings, readings (or pitch accent) and the audio slot. */
export function Headline({
  subject,
  level = subject.level,
  showMeaningAnswers = true,
  showReadingAnswers = true,
  showOnInKatakana = false,
  pitchInfo = null,
  audio,
  fontSize = 16,
}: HeadlineProps) {
  const blocks = pitchInfo !== null && showReadingAnswers ? pitchBlocks(subject, pitchInfo) : [];
  return (
    <header className="kk-headline">
      <div className={`kk-subject-tile kk-type--${subject.object}`} lang="ja">
        <span className="kk-ja">{subjectTitle(subject)}</span>
      </div>
      <div className="kk-headline-text">
        <div className="kk-headline-title">{simpleInfoTitle(subject.object, level)}</div>
        {showMeaningAnswers && subject.meanings.length > 0 && (
          <WkMarkup as="div" className="kk-headline-meaning" html={meaningHtml(subject)} />
        )}
        {blocks.length > 0
          ? blocks.map((b, i) => <PitchAccent key={i} kana={b.kana} infos={b.infos} fontSize={fontSize + 4} />)
          : showReadingAnswers &&
            subject.readings.length > 0 && (
              <div className="kk-headline-reading kk-ja" lang="ja">
                <WkMarkup html={regularReadingHtml(subject, showOnInKatakana)} />
              </div>
            )}
      </div>
      {audio !== undefined && audio !== null && <div className="kk-headline-buttons">{audio}</div>}
    </header>
  );
}

/** Kanji on'yomi, kun'yomi and nanori lines (each only when the kanji has that kind). */
export function KanjiReadings({ subject, showOnInKatakana = false }: { subject: ContentSubject; showOnInKatakana?: boolean }) {
  return (
    <>
      {hasReadingOfType(subject, 'onyomi') && <WkMarkup as="p" className="kk-subject-line kk-onyomi" html={onYomiHtml(subject, showOnInKatakana)} />}
      {hasReadingOfType(subject, 'kunyomi') && <WkMarkup as="p" className="kk-subject-line kk-kunyomi" html={kunYomiHtml(subject)} />}
      {hasReadingOfType(subject, 'nanori') && <WkMarkup as="p" className="kk-subject-line kk-nanori" html={nanoriHtml(subject)} />}
    </>
  );
}

/** "Part of speech: noun, する verb". */
export function PartsOfSpeech({ partsOfSpeech }: { partsOfSpeech: readonly string[] }) {
  if (partsOfSpeech.length === 0) return null;
  return <WkMarkup as="p" className="kk-subject-line kk-pos" html={partsOfSpeechHtml(partsOfSpeech)} />;
}

/** Up to 10 sentences, as the Java layout has 10 slots. */
export const MAX_CONTEXT_SENTENCES = 10;

function Translation({ text, hidden }: { text: string; hidden: boolean }) {
  const [revealed, setRevealed] = useState(!hidden);
  if (revealed) return <p className="kk-sentence-en">{text}</p>;
  return (
    <p className="kk-sentence-en kk-sentence-en--hidden">
      <button type="button" className="kk-subject-reveal" onClick={() => setRevealed(true)} aria-label="Show translation">
        <span aria-hidden="true">{text}</span>
      </button>
    </p>
  );
}

/** "Context sentences:" with the Japanese and "- English" lines; translations blurred until tapped when asked. */
export function ContextSentences({ sentences, hideTranslations = false }: { sentences: readonly ContextSentence[]; hideTranslations?: boolean }) {
  if (sentences.length === 0) return null;
  return (
    <section className="kk-subject-section kk-context">
      <h3 className="kk-subject-section-header">Context sentences:</h3>
      {sentences.slice(0, MAX_CONTEXT_SENTENCES).map((s, i) => (
        <div key={i} className="kk-sentence">
          <p className="kk-sentence-ja kk-ja" lang="ja">
            {s.ja ?? 'null'}
          </p>
          <Translation text={`- ${s.en ?? 'null'}`} hidden={hideTranslations} />
        </div>
      ))}
    </section>
  );
}

export interface SubjectLinksProps {
  header: string;
  ids: readonly number[];
  content: Content;
  /** `SubjectGridView` shows readings only with the reading-related info. */
  showReading?: boolean;
  showOnInKatakana?: boolean;
  onOpenSubject?: (id: number) => void;
  /** The level to show per subject (current curriculum); omitted: no level. */
  levelOf?: (subject: ContentSubject) => number;
}

/** A header and a grid of linked subjects (characters, meaning, reading), in the given id order; unknown ids are skipped. */
export function SubjectLinks({ header, ids, content, showReading = true, showOnInKatakana = false, onOpenSubject, levelOf }: SubjectLinksProps) {
  const subjects = ids.map((id) => content.byId.get(id)).filter((s): s is ContentSubject => s !== undefined);
  if (subjects.length === 0) return null;
  return (
    <section className="kk-subject-section kk-links">
      <h3 className="kk-subject-section-header">{header}</h3>
      <ul className="kk-link-grid">
        {subjects.map((s) => {
          const body = (
            <>
              <span className="kk-link-chars kk-ja" lang="ja">
                {subjectTitle(s)}
              </span>
              <span className="kk-link-meaning">{oneMeaning(s)}</span>
              {showReading && s.readings.length > 0 && (
                <span className="kk-link-reading kk-ja" lang="ja">
                  {oneReading(s, showOnInKatakana)}
                </span>
              )}
              {levelOf !== undefined && <span className="kk-link-level">{levelOf(s)}</span>}
            </>
          );
          return (
            <li key={s.id} className={`kk-link kk-type--${s.object}${s.object === 'vocabulary' || s.object === 'kana_vocabulary' ? ' kk-link--wide' : ''}`}>
              {onOpenSubject !== undefined ? (
                <button type="button" className="kk-link-button" onClick={() => onOpenSubject(s.id)} data-subject-id={s.id}>
                  {body}
                </button>
              ) : (
                <span className="kk-link-button" data-subject-id={s.id}>
                  {body}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** The progress values the details table reads (subject progress columns). */
export interface DetailsProgress {
  srsStage?: number | null;
  unlockedAt?: number | null;
  startedAt?: number | null;
  passedAt?: number | null;
  burnedAt?: number | null;
  resurrectedAt?: number | null;
  availableAt?: number | null;
  percentageCorrect?: number | null;
  meaningCorrect?: number | null;
  meaningIncorrect?: number | null;
  meaningMaxStreak?: number | null;
  meaningCurrentStreak?: number | null;
  readingCorrect?: number | null;
  readingIncorrect?: number | null;
  readingMaxStreak?: number | null;
  readingCurrentStreak?: number | null;
}

/** `TextUtil.formatTimestampForDisplay`: medium date and short time in the user's locale; "" for 0. */
export function formatTimestamp(ms: number): string {
  if (ms === 0) return '';
  const d = new Date(ms);
  return `${d.toLocaleDateString(undefined, { dateStyle: 'medium' })} ${d.toLocaleTimeString(undefined, { timeStyle: 'short' })}`;
}

const n0 = (v: number | null | undefined): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

export interface DetailsTableProps {
  subject: ContentSubject;
  progress: DetailsProgress | null;
  srsSystem: SrsSystem;
  formatTime?: (ms: number) => string;
}

/** SRS system and stage, dates, correct percentages and streaks, frequency, JLPT level, Jōyō grade. */
export function DetailsTable({ subject, progress, srsSystem, formatTime = formatTimestamp }: DetailsTableProps) {
  const p = progress ?? {};
  const rows: [string, string][] = [
    ['SRS System:', srsSystem.name],
    ['SRS Stage:', srsSystem.getStage(n0(p.srsStage)).name],
  ];
  const date = (label: string, v: number | null | undefined): void => {
    if (n0(v) !== 0) rows.push([label, formatTime(n0(v))]);
  };
  date('Unlocked:', p.unlockedAt);
  date('Started:', p.startedAt);
  date('Passed:', p.passedAt);
  date('Burned:', p.burnedAt);
  date('Resurrected:', p.resurrectedAt);
  date('Next review:', p.availableAt);
  const meaningTotal = n0(p.meaningCorrect) + n0(p.meaningIncorrect);
  const readingTotal = n0(p.readingCorrect) + n0(p.readingIncorrect);
  if (meaningTotal + readingTotal > 0) rows.push(['Overall correct:', `${Math.trunc(n0(p.percentageCorrect))}%`]);
  if (meaningTotal > 0) {
    rows.push([
      'Meaning correct:',
      `${Math.trunc((100 * n0(p.meaningCorrect)) / meaningTotal)}%, max streak ${n0(p.meaningMaxStreak)}, current streak ${n0(p.meaningCurrentStreak)}`,
    ]);
  }
  if (readingTotal > 0) {
    rows.push([
      'Reading correct:',
      `${Math.trunc((100 * n0(p.readingCorrect)) / readingTotal)}%, max streak ${n0(p.readingMaxStreak)}, current streak ${n0(p.readingCurrentStreak)}`,
    ]);
  }
  if (subject.frequency > 0) rows.push(['Frequency:', String(subject.frequency)]);
  if (subject.jlptLevel > 0) rows.push(['JLPT level:', jlptLevelString(subject.jlptLevel)]);
  if (subject.joyoGrade > 0) rows.push(['Jōyō kanji grade:', joyoGradeString(subject.joyoGrade)]);
  return (
    <table className="kk-subject-details">
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k}>
            <th scope="row">{k}</th>
            <td>{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
