/**
 * Writing practice (route `/self-study/writing?ids=1,2,3&mode=study|recall`): write each kanji stroke by
 * stroke in the writing square; every stroke is checked against KanjiVG (core/writing). Study mode
 * traces over the faint kanji; recall mode shows the meaning and reading and an empty square, with the
 * next stroke as a hint after a miss or on Hint. Self-study only: nothing here touches SRS or sync.
 * At the end, a summary with "Practise the missed ones" and "Again".
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import type { ContentSubject } from '../../../core/content';
import { writingLeftHanded } from '../../../core/settings/subjectInfo';
import {
  applyVerdict, currentCard, isCardDone, isClean, isFinished, judgeStroke, missedCards, missMessage, nextCard,
  requestHint, startWriting, type Point, type WritingCard, type WritingMode, type WritingResult, type WritingState,
} from '../../../core/writing';
import { readStrokeData } from '../../components/subject/subjectContent';
import { parseStrokes, type Stroke } from '../../components/subject/strokePaths';
import { WritingPad } from '../../components/writing/WritingPad';
import { useReady } from '../../hooks/useApp';
import { useNavigate, useRoute } from '../../hooks/useRoute';
import { paths } from '../../routes';
import '../../components/writing/writing.css';

/** Writing from memory, the first stroke has nothing to line up with: more room for its position. */
const FIRST_RECALL_STROKE_ROOM = 1.5;

/** The ids in `ids=1,2,3`, in order, without repeats. */
export function parseWritingIds(raw: string | null): number[] {
  const out: number[] = [];
  for (const part of (raw ?? '').split(',')) {
    const n = Number(part);
    if (part !== '' && Number.isInteger(n) && n > 0 && !out.includes(n)) out.push(n);
  }
  return out;
}

function meaningsOf(s: ContentSubject): string {
  const accepted = s.meanings.filter((m) => m.accepted_answer && m.meaning !== null);
  const sorted = [...accepted].sort((a, b) => Number(b.primary) - Number(a.primary));
  return sorted.map((m) => m.meaning).join(', ') || (s.slug ?? '');
}

function readingsOf(s: ContentSubject): string {
  const accepted = s.readings.filter((r) => r.accepted_answer && r.reading !== null);
  return (accepted.length > 0 ? accepted : s.readings.filter((r) => r.primary)).map((r) => r.reading).join('、');
}

interface Item {
  subject: ContentSubject;
  strokes: Stroke[];
  points: Point[][];
}

export function WritingScreen() {
  const { query } = useRoute();
  const { learner, content, state } = useReady();
  const navigate = useNavigate();
  const ids = useMemo(() => parseWritingIds(query.get('ids')), [query]);
  const mode: WritingMode = query.get('mode') === 'recall' ? 'recall' : 'study';
  const leftHanded = writingLeftHanded(state.prefs);

  const items = useMemo(() => {
    const map = new Map<number, Item>();
    for (const id of ids) {
      const subject = learner.content.byId.get(id);
      if (subject === undefined || (subject.object !== 'kanji' && subject.object !== 'radical')) continue;
      const strokes = parseStrokes(readStrokeData(content.db, id));
      if (strokes.length > 0) map.set(id, { subject, strokes, points: strokes.map((s) => s.contours.flat()) });
    }
    return map;
  }, [ids, learner, content.db]);
  const cards = useMemo<WritingCard[]>(() => ids.filter((id) => items.has(id)).map((id) => ({ id, strokeCount: items.get(id)!.strokes.length })), [ids, items]);

  const [round, setRound] = useState<WritingState>(() => startWriting(cards, mode));
  const [miss, setMiss] = useState<{ key: number; points: readonly Point[] } | null>(null);
  // Another set of kanji (or mode) in the address: a new round.
  const roundKey = `${query.get('ids') ?? ''}|${mode}`;
  const [shownKey, setShownKey] = useState(roundKey);
  if (shownKey !== roundKey) {
    setShownKey(roundKey);
    setRound(startWriting(cards, mode));
    setMiss(null);
  }
  const roundRef = useRef(round);
  roundRef.current = round;

  const card = currentCard(round);
  const item = card === null ? undefined : items.get(card.id);

  const onStroke = useCallback((drawn: Point[]) => {
    const r = roundRef.current;
    const c = currentCard(r);
    const it = c === null ? undefined : items.get(c.id);
    if (it === undefined || isCardDone(r)) return;
    const verdict = judgeStroke(drawn, it.points, r.stroke, {
      positionScale: r.mode === 'recall' && r.stroke === 0 ? FIRST_RECALL_STROKE_ROOM : 1,
    });
    if (!verdict.ok) setMiss((m) => ({ key: (m?.key ?? 0) + 1, points: drawn }));
    const next = applyVerdict(r, verdict);
    roundRef.current = next;
    setRound(next);
  }, [items]);

  const restart = (next: readonly WritingCard[]): void => {
    setMiss(null);
    setRound(startWriting(next, mode));
  };

  if (cards.length === 0) {
    return (
      <div className="kk-panel" data-testid="writing-empty">
        <p>Nothing to write: these items have no stroke order data.</p>
        <button type="button" className="kk-btn" onClick={() => navigate(paths.selfStudy())}>Back to self-study</button>
      </div>
    );
  }

  if (isFinished(round)) {
    return (
      <WritingSummary
        results={round.results}
        items={items}
        onMissed={() => restart(missedCards(round))}
        onAgain={() => restart(cards)}
        onDone={() => navigate.back()}
      />
    );
  }

  if (card === null || item === undefined) return null;
  const done = isCardDone(round);
  const s = item.subject;
  const showKanji = mode === 'study' || done;
  const last = round.last;
  const message = done
    ? (isClean(round.current) ? 'Well written!' : 'Done. Have another look at the stroke order.')
    : last !== null && !last.ok && last.miss !== null
      ? (round.strokeMisses === 0 ? `${missMessage(last.miss)}. That stroke is filled in for you.` : missMessage(last.miss))
      : round.hint && mode === 'recall' ? 'Follow the highlighted stroke' : '';
  const messageClass = done ? 'kk-writing-message--ok' : last !== null && !last.ok ? 'kk-writing-message--miss' : '';
  const isLast = round.index === round.cards.length - 1;

  return (
    <div className={`kk-writing${leftHanded ? ' kk-writing--left' : ''}`} data-testid="writing-screen" data-mode={mode} data-subject-id={s.id}>
      <div className="kk-writing-head">
        <p className="kk-writing-progress" data-testid="writing-progress">
          Kanji {round.index + 1} of {round.cards.length} · stroke {Math.min(round.stroke + 1, item.strokes.length)} of {item.strokes.length}
        </p>
        <div className="kk-writing-prompt" data-testid="writing-prompt">
          {showKanji && s.characters !== null && <div className="kk-writing-prompt-kanji" lang="ja">{s.characters}</div>}
          <div className="kk-writing-prompt-meaning">{meaningsOf(s)}</div>
          {readingsOf(s) !== '' && <div className="kk-writing-prompt-reading" lang="ja">{readingsOf(s)}</div>}
        </div>
      </div>
      <div className="kk-writing-square">
        <WritingPad
          key={`${round.index}`}
          strokes={item.strokes}
          written={round.stroke}
          ghost={mode === 'study'}
          hint={round.hint}
          miss={miss}
          done={done}
          onStroke={onStroke}
          label={done ? `${s.characters ?? ''} written` : `Writing square, stroke ${round.stroke + 1} of ${item.strokes.length}`}
        />
      </div>
      <div className="kk-writing-foot">
        <p className={`kk-writing-message ${messageClass}`} role="status" data-testid="writing-message">{message}</p>
        <div className="kk-writing-actions">
          {done ? (
            <button type="button" className="kk-btn" data-testid="writing-next" onClick={() => { setMiss(null); setRound(nextCard); }}>
              {isLast ? 'Finish' : 'Next'}
            </button>
          ) : (
            mode === 'recall' && (
              <button type="button" className="kk-btn" data-testid="writing-hint" disabled={round.hint} onClick={() => setRound(requestHint)}>
                Hint
              </button>
            )
          )}
        </div>
      </div>
    </div>
  );
}

function WritingSummary({ results, items, onMissed, onAgain, onDone }: {
  results: readonly WritingResult[];
  items: ReadonlyMap<number, Item>;
  onMissed: () => void;
  onAgain: () => void;
  onDone: () => void;
}) {
  const clean = results.filter(isClean).length;
  const anyMissed = clean < results.length;
  return (
    <div className="kk-panel" data-testid="writing-summary">
      <h2>Writing practice done</h2>
      <p>{clean} of {results.length} written without a slip.</p>
      <ul className="kk-writing-results">
        {results.map((r) => {
          const ok = isClean(r);
          const note = ok ? '✓' : [r.misses > 0 ? `${r.misses} miss${r.misses === 1 ? '' : 'es'}` : '', r.hints > 0 ? `${r.hints} hint${r.hints === 1 ? '' : 's'}` : '']
            .filter((x) => x !== '').join(', ');
          return (
            <li key={r.id} className={`kk-writing-result ${ok ? 'kk-writing-result--clean' : 'kk-writing-result--missed'}`} data-testid={`writing-result-${r.id}`}>
              <span className="kk-writing-result-kanji" lang="ja">{items.get(r.id)?.subject.characters ?? '?'}</span>
              <span className="kk-writing-result-note">{note}</span>
            </li>
          );
        })}
      </ul>
      <div className="kk-writing-actions">
        {anyMissed && <button type="button" className="kk-btn" data-testid="writing-missed" onClick={onMissed}>Practise the missed ones</button>}
        <button type="button" className="kk-btn" data-testid="writing-again" onClick={onAgain}>Again</button>
        <button type="button" className="kk-btn" data-testid="writing-done" onClick={onDone}>Done</button>
      </div>
    </div>
  );
}
