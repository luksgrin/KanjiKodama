/**
 * "Writing practice" on the self-study screen: which kanji (learned ones, or one level), the mode
 * (study: trace; recall: from memory) and how many, then Start opens the writing screen.
 */
import { useMemo, useState } from 'react';
import { SeededRandom } from '../../../core/rng';
import { num, progressRow } from '../../../core/progression/db';
import {
  selectWritingKanji, WRITING_ROUND_SIZES, type WritingCandidate, type WritingMode, type WritingScope,
} from '../../../core/writing';
import { strokeDataIds } from '../../../content/contentFile';
import { useReady } from '../../hooks/useApp';
import { useNavigate } from '../../hooks/useRoute';
import { paths } from '../../routes';
import { toast } from '../../shell/toast';
import '../../components/writing/writing.css';

export const NO_WRITING_KANJI = 'No kanji to practise here yet: finish some kanji lessons first';

const LEARNED = 'learned';

export function WritingStartPanel() {
  const { learner, content, state } = useReady();
  const navigate = useNavigate();
  const userLevel = learner.progress.userLevel;
  const [scope, setScope] = useState<string>(LEARNED);
  const [mode, setMode] = useState<WritingMode>('study');
  const [size, setSize] = useState<number>(10);

  const withStrokes = useMemo(() => strokeDataIds(content.db), [content.db]);
  const candidates = useMemo<WritingCandidate[]>(() => learner.content.subjects
    .filter((s) => s.object === 'kanji' && s.hiddenAt === 0)
    .map((s) => {
      const row = learner.table.get(s.id);
      return {
        id: s.id,
        level: row?.level ?? s.level,
        position: row?.lessonPosition ?? s.lessonPosition,
        started: num(progressRow(learner, s.id), 'startedAt') !== 0,
        strokeCount: withStrokes.has(s.id) ? 1 : 0,
      };
    }), [learner, withStrokes, state.revision]);
  const levels = useMemo(() => [...new Set(candidates.map((c) => c.level))].sort((a, b) => a - b), [candidates]);

  const start = (): void => {
    const chosen: WritingScope = scope === LEARNED ? { kind: 'learned' } : { kind: 'level', level: Number(scope) };
    // Learned kanji come shuffled; a level comes in lesson order.
    const ids = selectWritingKanji(candidates, chosen, size, chosen.kind === 'learned' ? new SeededRandom(Date.now()) : null);
    if (ids.length === 0) {
      toast(NO_WRITING_KANJI);
      return;
    }
    navigate(paths.writing(ids, mode));
  };

  return (
    <section className="kk-panel kk-writing-start-panel" data-testid="writing-start">
      <h2>Writing practice</h2>
      <p className="kk-small kk-muted">Write kanji stroke by stroke; each stroke is checked as you go. Doesn&apos;t affect your progress.</p>
      <div className="kk-writing-options">
        <label>
          <span>Kanji</span>
          <select className="kk-select" value={scope} onChange={(e) => setScope(e.target.value)} data-testid="writing-scope">
            <option value={LEARNED}>Kanji you&apos;ve learned</option>
            {levels.map((l) => (
              <option key={l} value={String(l)}>Level {l}{l === userLevel ? ' (your level)' : ''}</option>
            ))}
          </select>
        </label>
        <label>
          <span>How many</span>
          <select className="kk-select" value={size} onChange={(e) => setSize(Number(e.target.value))} data-testid="writing-size">
            {WRITING_ROUND_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <div className="kk-writing-modes" role="group" aria-label="Mode">
          <button type="button" className="kk-btn small" aria-pressed={mode === 'study'}
            data-testid="writing-mode-study" onClick={() => setMode('study')}>{mode === 'study' ? '✓ ' : ''}Trace</button>
          <button type="button" className="kk-btn small" aria-pressed={mode === 'recall'}
            data-testid="writing-mode-recall" onClick={() => setMode('recall')}>{mode === 'recall' ? '✓ ' : ''}From memory</button>
        </div>
      </div>
      <button type="button" className="kk-btn block" data-testid="writing-start-button" onClick={start}>Start writing</button>
    </section>
  );
}
