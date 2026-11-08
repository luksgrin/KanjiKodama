/**
 * The search result card (normal layout, for radicals, kanji, vocabulary and kana vocabulary):
 * 12 px rounded, type-coloured, 2 dp margin, 3 dp padding. Radicals and kanji are one grid column:
 * the characters (24 sp), the meaning on one line (auto-sized 14 → 9 sp), the reading (16 sp, kanji)
 * and the progress line (14 sp). Vocabulary spans the row: characters left, meaning / reading /
 * progress right-aligned. Progress: "Guru I - 3h" (vocabulary the full stage name), the stage alone
 * without a scheduled review, nothing for the Locked stage (`bindNormal`). KanjiKodama text colours
 * (`styleCardText`): navy on radicals, raspberry on kanji, plum on vocabulary.
 */
import { useLayoutEffect, useRef, type ReactNode } from 'react';

/** `app:autoSizeTextType="uniform"`, 9..14 sp in 1 sp steps, one line. */
export function AutoFitLine({ children, className, max = 14, min = 9 }: { children: ReactNode; className: string; max?: number; min?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let size = max;
    el.style.fontSize = `${size}px`;
    while (size > min && el.scrollWidth > el.clientWidth + 0.5) {
      size -= 1;
      el.style.fontSize = `${size}px`;
    }
  });
  return <span ref={ref} className={className} style={{ fontSize: max }}>{children}</span>;
}

export interface SubjectCardProps {
  object: string;
  /** The characters, or the radical's image (`SubjectChars`). */
  characters: ReactNode;
  meaning: string | null;
  reading: string | null;
  progress: string | null;
  testId: string;
  onClick(): void;
}

export function SubjectCard({ object, characters, meaning, reading, progress, testId, onClick }: SubjectCardProps) {
  const wide = object === 'vocabulary' || object === 'kana_vocabulary';
  return (
    <button type="button" className={`kk-card ${object}${wide ? ' wide' : ''}`} data-testid={testId} onClick={onClick}>
      <span className="kk-card-chars" lang="ja">{characters}</span>
      {wide ? (
        <span className="kk-card-side">
          {meaning !== null && <AutoFitLine className="kk-card-meaning">{meaning}</AutoFitLine>}
          {reading !== null && <span className="kk-card-reading" lang="ja">{reading}</span>}
          {progress !== null && <span className="kk-card-progress">{progress}</span>}
        </span>
      ) : (
        <>
          {meaning !== null && <AutoFitLine className="kk-card-meaning">{meaning}</AutoFitLine>}
          {reading !== null && <span className="kk-card-reading" lang="ja">{reading}</span>}
          {progress !== null && <span className="kk-card-progress">{progress}</span>}
        </>
      )}
    </button>
  );
}
