/**
 * Pitch accent records and the diagram geometry. Pure.
 *
 * Java: `model/PitchInfo`, `util/PitchInfoDeserializer`, `db/model/Subject.getPitchInfoFor` /
 * `hasPitchInfo`, `views/PitchInfoView` (labels), `views/PitchInfoDiagramView` (mora split, dots).
 */
import type { ContentSubject } from '../../../core/content';
import { toKatakana } from '../../../core/kana';

/** `model/PitchInfo`: the reading in katakana (null: applies to any reading), part of speech, accent number. */
export interface PitchInfo {
  reading: string | null;
  partOfSpeech: string | null;
  pitchNumber: number;
}

/**
 * `subject.pitchInfo` JSON (`[[reading, partOfSpeech, pitchNumber], …]`) as Jackson reads it with
 * `PitchInfoDeserializer`: malformed records are dropped; NULL, empty or unreadable text gives [].
 */
export function parsePitchInfo(json: string | null): PitchInfo[] {
  if (json === null || json === '' || json.startsWith('@')) return [];
  let v: unknown;
  try {
    v = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(v)) return [];
  const out: PitchInfo[] = [];
  for (const rec of v) {
    if (!Array.isArray(rec) || rec.length !== 3) continue;
    const [reading, pos, num] = rec as unknown[];
    if (!(typeof reading === 'string' || reading === null) || !(typeof pos === 'string' || pos === null)) continue;
    if (typeof num !== 'number') continue;
    out.push({ reading: reading === null ? null : toKatakana(reading), partOfSpeech: pos, pitchNumber: Math.trunc(num) });
  }
  return out;
}

/** `Subject.getPitchInfoFor(reading)`: records for this reading, else the reading-less fallback ones. */
export function pitchInfoFor(infos: readonly PitchInfo[], reading: string): PitchInfo[] {
  const kana = toKatakana(reading);
  const exact = infos.filter((p) => p.reading === kana);
  return exact.length > 0 ? exact : infos.filter((p) => p.reading === null);
}

/** `Subject.hasPitchInfo`: vocabulary (and kana-only) only; a record for one of its readings, or a fallback one. */
export function hasPitchInfo(subject: Pick<ContentSubject, 'object' | 'readings'>, infos: readonly PitchInfo[]): boolean {
  if (subject.object !== 'vocabulary' && subject.object !== 'kana_vocabulary') return false;
  for (const r of subject.readings) {
    if (r.reading === null || r.reading === '') continue;
    const kana = toKatakana(r.reading);
    if (infos.some((p) => p.reading === kana)) return true;
  }
  return infos.some((p) => p.reading === null);
}

/** The readings the headline shows a pitch block for, with their records (`SubjectInfoHeadlineView`). */
export function pitchBlocks(subject: Pick<ContentSubject, 'readings'>, infos: readonly PitchInfo[]): { kana: string; infos: PitchInfo[] }[] {
  const out: { kana: string; infos: PitchInfo[] }[] = [];
  for (const r of subject.readings) {
    if (r.reading === null || r.reading === '') continue;
    const list = pitchInfoFor(infos, r.reading);
    if (list.length > 0) out.push({ kana: r.reading, infos: list });
  }
  return out;
}

/** `PitchInfoDiagramView.KANA_DIGRAPHS`: small kana that join the previous kana into one mora. */
export const KANA_DIGRAPHS = 'ぁぃぅぇぉゃゅょゎゕゖァィゥェォャュョヮヵヶ';

/**
 * `PitchInfoDiagramView.prepare`'s mora split: the end offset (in chars) of each mora. A kana followed by
 * a small kana from {@link KANA_DIGRAPHS} is one mora with it (`っ` and `ー` count as their own mora).
 */
export function moraEnds(text: string): number[] {
  const ends: number[] = [];
  let i = 0;
  while (i < text.length - 1) {
    i += KANA_DIGRAPHS.includes(text.charAt(i + 1)) ? 2 : 1;
    ends.push(i);
  }
  if (i < text.length) ends.push(text.length);
  return ends;
}

/** `isDotHigh(mora)`: mora index 0..numMora (the last one is the following particle). */
export function isDotHigh(pitchNumber: number, mora: number): boolean {
  if (pitchNumber === 0) return mora !== 0;
  if (pitchNumber === 1) return mora === 0;
  return mora > 0 && mora < pitchNumber;
}

export type PitchKind = 'heiban' | 'atamadaka' | 'nakadaka' | 'odaka';

/** The pattern of an accent number (also picks the diagram color). */
export function pitchKind(pitchNumber: number, numMora: number): PitchKind {
  if (pitchNumber === 0) return 'heiban';
  if (pitchNumber === 1) return 'atamadaka';
  return pitchNumber === numMora ? 'odaka' : 'nakadaka';
}

const KIND_LABELS: Readonly<Record<PitchKind, string>> = { heiban: '平板', atamadaka: '頭高', nakadaka: '中高', odaka: '尾高' };

/** `PitchInfoView`'s label: `[n] 平板 (part of speech)`. */
export function pitchLabel(info: PitchInfo, numMora: number): string {
  let s = `[${info.pitchNumber}] ${KIND_LABELS[pitchKind(info.pitchNumber, numMora)]}`;
  if (info.partOfSpeech !== null && info.partOfSpeech !== '') s += ` (${info.partOfSpeech})`;
  return s;
}

export interface PitchDot {
  /** Center, in em from the left edge of the text. */
  x: number;
  high: boolean;
  /** The last dot (the particle after the word) is drawn hollow. */
  hollow: boolean;
}

/**
 * The dots of the diagram, x in em, assuming full-width kana (one em each), which is how the Java view's
 * measured positions come out for kana text: dot `i` sits over the middle of mora `i`, the extra dot over
 * the next (particle) position.
 */
export function pitchDots(text: string, pitchNumber: number): PitchDot[] {
  const ends = moraEnds(text);
  const xs = [0, ...ends, text.length + 1];
  const dots: PitchDot[] = [];
  for (let i = 0; i <= ends.length; i++) {
    dots.push({ x: ((xs[i] as number) + (xs[i + 1] as number)) / 2, high: isDotHigh(pitchNumber, i), hollow: i === ends.length });
  }
  return dots;
}
