/** The parts of a Smouldering Durtles `subject` row the spike card needs (see Subject.java). */
export interface Meaning { meaning: string; primary: boolean; accepted_answer: boolean }
export interface AuxMeaning { meaning: string; type: 'whitelist' | 'blacklist' | string }
export interface Reading { reading: string; primary: boolean; accepted_answer: boolean; type?: string }

export interface KanjiSubject {
  id: number;
  level: number;
  characters: string;
  meanings: Meaning[];
  auxiliaryMeanings: AuxMeaning[];
  readings: Reading[];
}

function parseArray<T>(json: unknown): T[] {
  if (typeof json !== 'string' || json === '') return [];
  const v: unknown = JSON.parse(json);
  return Array.isArray(v) ? (v as T[]) : [];
}

export function subjectFromRow(row: Record<string, unknown>): KanjiSubject {
  return {
    id: Number(row.id),
    level: Number(row.level),
    characters: String(row.characters ?? ''),
    meanings: parseArray<Meaning>(row.meanings),
    auxiliaryMeanings: parseArray<AuxMeaning>(row.auxiliaryMeanings),
    readings: parseArray<Reading>(row.readings),
  };
}
