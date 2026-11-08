/**
 * The quiz question text's font (`AbstractSessionFragment`: `session.getCurrentTypefaceConfiguration`,
 * tap toggles between it and the default face). One font per session item, chosen at random among the
 * selected fonts that fit the subject's characters, kept for the session (`SessionItem`'s cached
 * `typefaceConfiguration`).
 */
import { useEffect, useState } from 'react';
import type { Preferences } from '../../core/settings';
import { chooseQuizFont, DEFAULT_QUIZ_FONT, selectedFonts, type QuizFont } from './quizFonts';

const chosen = new WeakMap<object, Map<number, QuizFont>>();

export function useQuizFont(session: object, subjectId: number, characters: string, prefs: Preferences): {
  font: QuizFont; toggle(): void;
} {
  const ids = selectedFonts(prefs);
  const key = ids.join('\u0000');
  const cached = chosen.get(session)?.get(subjectId);
  const [font, setFont] = useState<QuizFont>(cached ?? DEFAULT_QUIZ_FONT);
  const [useDefault, setUseDefault] = useState(false);
  useEffect(() => {
    setUseDefault(false);
    let perItem = chosen.get(session);
    if (!perItem) { perItem = new Map(); chosen.set(session, perItem); }
    const known = perItem.get(subjectId);
    if (known) { setFont(known); return; }
    setFont(DEFAULT_QUIZ_FONT);
    if (ids.length === 0) return;
    let live = true;
    void chooseQuizFont(ids, characters, (n) => Math.floor(Math.random() * n)).then((f) => {
      perItem.set(subjectId, f);
      if (live) setFont(f);
    });
    return () => { live = false; };
    // `key` stands for `ids`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, subjectId, characters, key]);
  return { font: useDefault ? DEFAULT_QUIZ_FONT : font, toggle: () => setUseDefault((d) => !d) };
}
