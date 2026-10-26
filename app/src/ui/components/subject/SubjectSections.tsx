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
import type { Preferences } from '../../../core/settings';
import type { SrsSystem } from '../../../core/srs';
import { PitchAccent } from './PitchAccent';
import { SubjectChars, subjectGlyphCount } from './SubjectChars';
import { pitchBlocks, type PitchInfo } from './pitchInfo';
import { useTitleLongPress } from './TitleActionMode';
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
  /** Largest tile glyph height in px; the tile also fits the screen width minus 80 px (SubjectInfoHeadlineView). 0 hides the tile. */
  maxFontSize?: number;
  /** The settings the tile's long press reads (search engines). */
  prefs?: Preferences;
}

const NO_PREFS: Preferences = {};

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
  maxFontSize = 64,
  prefs = NO_PREFS,
}: HeadlineProps) {
  const press = useTitleLongPress(subject, null, prefs);
  const chars = subjectGlyphCount(subject);
  const tileStyle = { fontSize: `min(${maxFontSize}px, calc((100cqi - 112px) / ${chars}))` };
  const blocks = pitchInfo !== null && showReadingAnswers ? pitchBlocks(subject, pitchInfo) : [];
  return (
    <header className="kk-headline">
      {maxFontSize > 0 && (
        <div className={`kk-subject-tile kk-type--${subject.object} kk-longpress`} lang="ja" style={tileStyle} data-testid="subject-tile" {...press.handlers}>
          <span className="kk-ja"><SubjectChars subject={subject} /></span>
        </div>
      )}
      {press.node}
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
  /** Meanings only with the meaning-related info (default true). */
  showMeaning?: boolean;
  showOnInKatakana?: boolean;
  onOpenSubject?: (id: number) => void;
  /** The level to show per subject (current curriculum); omitted: no level. */
  levelOf?: (subject: ContentSubject) => number;
  /** The card's progress line ("Guru I - 3h", `useCardProgress`); omitted or null: none. */
  progressOf?: (subject: ContentSubject) => string | null;
  testId?: string;
}

/**
 * A header and a grid of subject cards (`SubjectGridView` with `subject_card_*.xml`): radicals and kanji
 * one column each (floor((width + 10) / 90) columns), vocabulary a full-width row (three columns from six);
 * each card in the subject's colour with the characters, one meaning (shrunk to fit one line, 9–14 sp), one
 * reading and the progress line. In the given id order; unknown ids are skipped.
 */
export function SubjectLinks({
  header, ids, content, showReading = true, showMeaning = true, showOnInKatakana = false, onOpenSubject, levelOf, progressOf, testId,
}: SubjectLinksProps) {
  const subjects = ids.map((id) => content.byId.get(id)).filter((s): s is ContentSubject => s !== undefined);
  if (subjects.length === 0) return null;
  return (
    <section className="kk-subject-section kk-links" data-testid={testId}>
      {header !== '' && <h3 className="kk-subject-section-header">{header}</h3>}
      <SubjectCards subjects={subjects} showReading={showReading} showMeaning={showMeaning} showOnInKatakana={showOnInKatakana}
        onOpenSubject={onOpenSubject} levelOf={levelOf} progressOf={progressOf} />
    </section>
  );
}

export interface SubjectCardsProps {
  subjects: readonly ContentSubject[];
  showReading?: boolean;
  showMeaning?: boolean;
  showOnInKatakana?: boolean;
  onOpenSubject?: (id: number) => void;
  levelOf?: (subject: ContentSubject) => number;
  progressOf?: (subject: ContentSubject) => string | null;
}

/** The card grid itself (`SubjectGridView`). */
export function SubjectCards({ subjects, showReading = true, showMeaning = true, showOnInKatakana = false, onOpenSubject, levelOf, progressOf }: SubjectCardsProps) {
  return (
    <ul className="kk-link-grid">
      {subjects.map((s) => {
        const wide = s.object === 'vocabulary' || s.object === 'kana_vocabulary';
        const meaning = showMeaning && s.meanings.length > 0 ? oneMeaning(s) : null;
        // bindCommon: the reading, or a kana vocabulary's characters.
        const reading = showReading && s.readings.length > 0 ? oneReading(s, showOnInKatakana)
          : s.object === 'kana_vocabulary' ? s.characters : null;
        const progress = progressOf?.(s) ?? null;
        const body = (
          <>
            <span className="kk-link-chars kk-ja" lang="ja"><SubjectChars subject={s} /></span>
            <span className="kk-link-text">
              {meaning !== null && (
                <span className="kk-link-meaning" style={{ ['--mlen' as string]: Math.max(4, [...meaning].length) }}>{meaning}</span>
              )}
              {reading !== null && <span className="kk-link-reading kk-ja" lang="ja">{reading}</span>}
              {progress !== null && <span className="kk-link-progress">{progress}</span>}
              {levelOf !== undefined && <span className="kk-link-level">{levelOf(s)}</span>}
            </span>
          </>
        );
        return (
          <li key={s.id} className={`kk-link kk-type--${s.object}${wide ? ' kk-link--wide' : ''}`}>
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
