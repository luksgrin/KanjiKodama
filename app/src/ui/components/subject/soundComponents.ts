/**
 * "Parts and sound": which part of a kanji carries its meaning and which its sound, the phonetic
 * series and how this kanji's on'yomi fits it. Builds HTML (rendered with `WkMarkup`). The lookups are behind {@link SoundLookup}; {@link dbSoundLookup} reads them from the
 * content file's Parts/Sound tables and the subjects.
 */
import type { Database } from 'sql.js';
import type { Content, ContentSubject } from '../../../core/content';

const MAX_MEMBERS_SHOWN = 12;

export type SoundMatch = 'exact' | 'variant' | 'irregular';

export interface KanjiPart {
  glyph: string;
  /** semantic | phonetic | both | shape */
  role: string;
  /** The open-data name (KANJIDIC2/KanjiVG). */
  name: string;
}

export interface KanjiSound {
  phonetic: string;
  seriesId: number;
  seriesReading: string;
  actualReading: string;
  match: string;
}

export interface SeriesMember {
  literal: string;
  reading: string;
  match: string;
}

/** What the HTML is built from. */
export interface SoundLookup {
  /** `kanji_part` rows of a kanji, by ordinal. */
  parts(literal: string): KanjiPart[];
  /** The `kanji_sound` row of a kanji. */
  sound(literal: string): KanjiSound | null;
  /** `series.reliability`, `series.core_members`. */
  series(id: number): { reliability: number; coreMembers: number } | null;
  /** `series_member` rows of a series other than `literal`, in table order. */
  members(seriesId: number, literal: string): SeriesMember[];
  /** WaniKani radical name, else WaniKani kanji meaning, else `fallback`. */
  displayName(glyph: string, fallback: string): string;
  /** Level of the visible kanji subject with these characters, 0 when none. */
  kanjiLevel(literal: string): number;
}

const DEVOICED = 'がかぎきぐくげけごこざさじしずすぜせぞそだたぢちづつでてどとばはびひぶふべへぼほぱはぴひぷふぺへぽほ';

/** Collapse voicing (first kana) and a trailing long vowel. */
export function soundCore(hiragana: string): string {
  let s = '';
  for (let i = 0; i < hiragana.length; i++) {
    let c = hiragana.charAt(i);
    if (i === 0) {
      const idx = DEVOICED.indexOf(c);
      if (idx >= 0 && idx % 2 === 0) c = DEVOICED.charAt(idx + 1);
    }
    s += c;
  }
  s = s.split('.').join('').split('-').join('');
  if (s.length >= 2) {
    const last = s.charAt(s.length - 1);
    const prev = s.charAt(s.length - 2);
    if (
      (last === 'う' && 'おこごそぞとどのほぼぽもよろょうくぐすずつづぬふぶぷむゆるゅ'.includes(prev)) ||
      (last === 'い' && 'えけげせぜてでねへべぺめれ'.includes(prev))
    ) {
      s = s.substring(0, s.length - 1);
    }
  }
  return s;
}

/** How the kanji's reading relates to the series reading. */
export function classifySound(actual: string, seriesReading: string): SoundMatch {
  if (actual === seriesReading) return 'exact';
  return soundCore(actual) === soundCore(seriesReading) ? 'variant' : 'irregular';
}

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const rank = (m: string): number => (m === 'exact' ? 0 : m === 'variant' ? 1 : 2);

/** The section's HTML, or null when there is nothing to say (or not a kanji). */
export function soundComponentsHtml(subject: Pick<ContentSubject, 'object' | 'characters' | 'readings'>, lookup: SoundLookup): string | null {
  const literal = subject.characters;
  if (subject.object !== 'kanji' || literal === null) return null;
  const parts = lookup.parts(literal).map((p) => ({ ...p, name: lookup.displayName(p.glyph, p.name) }));
  const sound = lookup.sound(literal);
  if (parts.length === 0 && sound === null) return null;

  let html = '';
  if (parts.length > 0) {
    html += '<b>Parts:</b> ';
    parts.forEach((p, i) => {
      if (i > 0) html += ' + ';
      html += `<ja>${esc(p.glyph)}</ja> ${esc(p.name)}`;
      if (p.role === 'semantic') html += ' <i>(meaning)</i>';
      else if (p.role === 'phonetic') html += ' <i>(sound)</i>';
      else if (p.role === 'both') html += ' <i>(meaning + sound)</i>';
    });
    html += '<br/>';
  }

  if (sound === null) {
    html += "No part of this kanji hints at its on'yomi; learn the reading directly.";
    return html;
  }
  const { phonetic, seriesReading, seriesId } = sound;

  let asked: string | null = null;
  let bestOn: string | null = null;
  let bestMatch: SoundMatch = 'irregular';
  for (const r of subject.readings) {
    if (r.type !== 'onyomi' || r.reading === null || r.reading === undefined) continue;
    const v = r.reading;
    if (r.primary && asked === null) asked = v;
    const m = classifySound(v, seriesReading);
    if (bestOn === null || rank(m) < rank(bestMatch)) {
      bestOn = v;
      bestMatch = m;
    }
  }
  html += `<b>Sound:</b> <ja>${esc(phonetic)}</ja> gives the on'yomi <ja>${esc(seriesReading)}</ja>. `;
  const askedMatch = asked === null ? null : classifySound(asked, seriesReading);
  const lit = `<ja>${esc(literal)}</ja>`;
  if (askedMatch === 'exact') {
    html += `${lit} follows it: <ja>${esc(asked as string)}</ja> ✓`;
  } else if (askedMatch === 'variant') {
    html += `${lit} reads <ja>${esc(asked as string)}</ja>, a regular variant (voicing or vowel length) ≈`;
  } else if (bestOn !== null && bestMatch !== 'irregular') {
    html += `${lit} also has the on'yomi <ja>${esc(bestOn)}</ja>, but the main one is <ja>${esc(asked ?? '?')}</ja>.`;
  } else if (sound.actualReading !== null && sound.match !== 'irregular' && asked !== null) {
    html += `${lit} reads <ja>${esc(asked)}</ja> ✗. It does have the series reading <ja>${esc(sound.actualReading)}</ja>, but only in rare words.`;
  } else {
    html += `${lit} is an exception`;
    if (asked !== null) html += `: <ja>${esc(asked)}</ja>`;
    html += ' ✗';
  }
  html += '<br/>';

  const series = lookup.series(seriesId);
  if (series !== null && series.coreMembers > 1) {
    html += `${roundHalfUp(series.reliability * 100)}% of the ${series.coreMembers} common <ja>${esc(phonetic)}</ja>-series kanji follow this reading.`;
  }
  const taught: [number, SeriesMember][] = [];
  for (const m of lookup.members(seriesId, literal)) {
    const level = lookup.kanjiLevel(m.literal);
    if (level > 0) taught.push([level, m]);
  }
  taught.sort((a, b) => a[0] - b[0]);
  const members = taught.slice(0, MAX_MEMBERS_SHOWN).map(([level, m]) => {
    const mark = m.match === 'exact' ? '✓' : m.match === 'variant' ? '≈' : '✗';
    return `<ja>${esc(m.literal)} ${esc(m.reading)}</ja> ${mark} <small>L${level}</small>`;
  });
  if (members.length > 0) html += `<br/>Also in WaniKani: ${members.join(' · ')}`;
  return html;
}

/** Round half up: floor(x + 0.5). */
function roundHalfUp(x: number): number {
  return Math.floor(x + 0.5);
}

function all(db: Database, sql: string, params: (string | number)[]): unknown[][] {
  const stmt = db.prepare(sql);
  const out: unknown[][] = [];
  try {
    stmt.bind(params);
    while (stmt.step()) out.push(stmt.get());
  } finally {
    stmt.free();
  }
  return out;
}

/**
 * The lookups over the content file (Parts/Sound tables) and the subjects. `kanjiLevel` is the subject's
 * level in `content` (WaniKani order); pass `levelOf` to use the current curriculum's level instead.
 */
export function dbSoundLookup(db: Database, content: Content, levelOf?: (subject: ContentSubject) => number): SoundLookup {
  let byChars: Map<string, ContentSubject[]> | null = null;
  const visibleByChars = (chars: string): ContentSubject[] => {
    if (byChars === null) {
      byChars = new Map();
      for (const s of content.subjects) {
        if (s.hiddenAt !== 0 || s.characters === null || (s.object !== 'radical' && s.object !== 'kanji')) continue;
        const list = byChars.get(s.characters);
        if (list === undefined) byChars.set(s.characters, [s]);
        else list.push(s);
      }
    }
    return byChars.get(chars) ?? [];
  };
  return {
    parts: (literal) =>
      all(db, 'SELECT glyph, role, name FROM kanji_part WHERE literal = ? ORDER BY ordinal', [literal]).map(([g, r, n]) => ({
        glyph: String(g),
        role: String(r),
        name: String(n),
      })),
    sound: (literal) => {
      const row = all(db, 'SELECT phonetic, series_reading, series_id, actual_reading, match FROM kanji_sound WHERE literal = ?', [literal])[0];
      if (row === undefined) return null;
      return {
        phonetic: String(row[0]),
        seriesReading: String(row[1]),
        seriesId: Number(row[2]),
        actualReading: String(row[3]),
        match: String(row[4]),
      };
    },
    series: (id) => {
      const row = all(db, 'SELECT reliability, core_members FROM series WHERE id = ?', [id])[0];
      return row === undefined ? null : { reliability: Number(row[0]), coreMembers: Number(row[1]) };
    },
    members: (seriesId, literal) =>
      all(db, 'SELECT literal, reading, match FROM series_member WHERE series_id = ? AND literal != ? ORDER BY rowid', [seriesId, literal]).map(
        ([l, r, m]) => ({ literal: String(l), reading: String(r), match: String(m) }),
      ),
    displayName: (glyph, fallback) => {
      const list = visibleByChars(glyph);
      const pick = list.find((s) => s.object === 'radical') ?? list[0];
      const meaning = pick?.meanings[0]?.meaning;
      return meaning === undefined || meaning === null ? fallback : meaning;
    },
    kanjiLevel: (literal) => {
      const s = visibleByChars(literal).find((x) => x.object === 'kanji');
      return s === undefined ? 0 : levelOf !== undefined ? levelOf(s) : s.level;
    },
  };
}
