/**
 * The HTML the Java app builds for each line of the subject info, rendered with `WkMarkup` (the same
 * `TextUtil.renderHtml` path). Pure.
 *
 * Java: `db/model/Subject` (`get*RichText`, `getOneMeaning`, `getOneReading`, `getJoyoGradeAsString`,
 * `getJlptLevelAsString`, `getSimpleInfoTitle`), `enums/SubjectType` (`getComponentsHeaderText`).
 */
import type { ContentSubject, Reading, SubjectObject } from '../../../core/content';
import { toKatakana } from '../../../core/kana';
import { escapeHtml } from '../../../core/text/richText';

/** Java `ObjectSupport.isEmpty(String)`. */
export function isEmpty(s: string | null | undefined): boolean {
  return s === null || s === undefined || s.length === 0;
}

const TYPE_TITLES: Readonly<Record<SubjectObject, string>> = {
  radical: 'radical',
  kanji: 'kanji',
  vocabulary: 'vocabulary',
  kana_vocabulary: 'kana-only vocabulary',
};

/** `SubjectType.getSimpleInfoTitle(level)`: "Level 5 kanji". */
export function simpleInfoTitle(object: SubjectObject, level: number): string {
  return `Level ${level} ${TYPE_TITLES[object]}`;
}

/** `SubjectType.getComponentsHeaderText`. */
export function componentsHeaderText(object: SubjectObject): string {
  return object === 'radical' ? '' : object === 'kanji' ? 'Used radicals:' : 'Used kanji:';
}

/** `Reading.getValue(showOnInKatakana)`: on'yomi in katakana when asked. */
export function readingValue(r: Reading, showOnInKatakana: boolean): string | null {
  if (r.reading === null || r.reading === undefined) return null;
  return showOnInKatakana && r.type === 'onyomi' ? toKatakana(r.reading) : r.reading;
}

const str = (s: string | null | undefined): string => s ?? 'null';

/** `getMeaningRichText("")`: the accepted meanings; the primary one bold when there are several. */
export function meaningHtml(subject: ContentSubject): string {
  const accepted = subject.meanings.filter((m) => m.accepted_answer);
  return accepted
    .map((m) => (m.primary && accepted.length > 1 ? `<b>${escapeHtml(str(m.meaning))}</b>` : escapeHtml(str(m.meaning))))
    .join(', ');
}

/** `getRegularReadingRichText("")`: the accepted readings; the primary one bold when there are several. */
export function regularReadingHtml(subject: ContentSubject, showOnInKatakana: boolean): string {
  const accepted = subject.readings.filter((r) => r.accepted_answer);
  return accepted
    .map((r) => {
      const v = escapeHtml(str(readingValue(r, showOnInKatakana)));
      return r.primary && accepted.length > 1 ? `<b>${v}</b>` : v;
    })
    .join(', ');
}

function readingsOfType(subject: ContentSubject, type: string, katakana: boolean): string {
  return subject.readings
    .filter((r) => r.type === type)
    .map((r) => escapeHtml(str(readingValue(r, katakana))))
    .join(', ');
}

/** `getOnYomiRichText`. */
export function onYomiHtml(subject: ContentSubject, showOnInKatakana: boolean): string {
  return `<b>On'yomi:</b> ${readingsOfType(subject, 'onyomi', showOnInKatakana)}`;
}

/** `getKunYomiRichText`. */
export function kunYomiHtml(subject: ContentSubject): string {
  return `<b>Kun'yomi:</b> ${readingsOfType(subject, 'kunyomi', false)}`;
}

/** `getNanoriRichText`. */
export function nanoriHtml(subject: ContentSubject): string {
  return `<b>Nanori:</b> ${readingsOfType(subject, 'nanori', false)}`;
}

export function hasReadingOfType(subject: ContentSubject, type: 'onyomi' | 'kunyomi' | 'nanori'): boolean {
  return subject.readings.some((r) => r.type === type);
}

/** `getMeaningMnemonicRichText` / `getReadingMnemonicRichText`: label, then the mnemonic with `\n` as `<br>`. */
export function mnemonicHtml(kind: 'meaning' | 'reading', mnemonic: string | null): string {
  const label = kind === 'meaning' ? 'Meaning mnemonic' : 'Reading mnemonic';
  return `<b>${label}</b>: ${(mnemonic ?? '').replace(/\n/g, '<br>')}`;
}

/** `getMeaningNoteRichText` / `getReadingNoteRichText`: the note escaped, `\n` as `<br/>`. */
export function noteHtml(kind: 'meaning' | 'reading', note: string | null): string {
  return `<b>My ${kind} note</b>: ${escapeHtml(note ?? '').replace(/\n/g, '<br/>')}`;
}

/** `getMeaningSynonymsRichText`. */
export function synonymsHtml(synonyms: readonly string[]): string {
  return `<b>My synonyms</b>: ${escapeHtml(synonyms.join(', '))}`;
}

/** `getPartsOfSpeechRichText` (not escaped, as in Java). */
export function partsOfSpeechHtml(partsOfSpeech: readonly string[]): string {
  return `<b>Part of speech</b>: ${partsOfSpeech.join(', ')}`;
}

/** `Stream.reduce` of `getOneMeaning`/`getOneReading`: the first primary, else the last accepted, else the last. */
function pickOne<T extends { primary: boolean; accepted_answer: boolean }>(list: readonly T[]): T | null {
  if (list.length === 0) return null;
  let t = list[0] as T;
  for (let i = 1; i < list.length; i++) {
    const u = list[i] as T;
    if (t.primary) continue;
    if (u.primary) t = u;
    else if (!t.accepted_answer) t = u;
  }
  return t;
}

/** `Subject.getOneMeaning`. */
export function oneMeaning(subject: ContentSubject): string {
  return pickOne(subject.meanings)?.meaning ?? '';
}

/** `Subject.getOneReading`. */
export function oneReading(subject: ContentSubject, showOnInKatakana: boolean): string {
  const r = pickOne(subject.readings);
  return r === null ? '' : (readingValue(r, showOnInKatakana) ?? '');
}

/** `getJoyoGradeAsString`. */
export function joyoGradeString(grade: number): string {
  return grade >= 1 && grade <= 6 ? String(grade) : grade === 7 ? 'Middle school' : 'None';
}

/** `getJlptLevelAsString`. */
export function jlptLevelString(level: number): string {
  return level >= 1 && level <= 5 ? `N${level}` : 'None';
}

/** The subject's title text: characters, else the slug (the 19 image-only radicals; the Java app draws an image). */
export function subjectTitle(subject: Pick<ContentSubject, 'characters' | 'slug' | 'id'>): string {
  return subject.characters ?? subject.slug ?? String(subject.id);
}

const INFO_TITLE_LABELS: Readonly<Record<SubjectObject, string>> = {
  radical: 'radical',
  kanji: 'kanji',
  vocabulary: 'vocabulary',
  kana_vocabulary: 'Kana-only Vocab',
};

/**
 * `Subject.getInfoTitle("", "")`: "力 (level 3 kanji)", the toolbar title of the item page and the lesson
 * presentation (`SubjectType.getInfoTitleLabel`).
 */
export function infoTitle(subject: Pick<ContentSubject, 'characters' | 'slug' | 'id' | 'object'>, level: number): string {
  return `${subjectTitle(subject)} (level ${level} ${INFO_TITLE_LABELS[subject.object]})`;
}
