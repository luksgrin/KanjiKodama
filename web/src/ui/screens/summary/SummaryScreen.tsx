/**
 * The session summary (`fragments/SummarySessionFragment`, `fragment_summary.xml`, shown when the session
 * is FINISHING): "Show items · Finish" right-aligned at the top, the green "correct" and red "incorrect"
 * tables (labels right-aligned, the value after them), "Resurrect items with incorrect answers", and after
 * "Show items" the two subject grids in Java's order with the bulk star ratings ("Star ratings updated"
 * toast). Finish reports the pending items (delayed results) with a progress bar, then `Session.finish`.
 * The plan's additions, not in the Java screen, at the end: the level-ups and the new unlocks of the
 * session (subjects unlocked since it started).
 */
import { useEffect, useMemo, useState } from 'react';
import type { ContentSubject } from '../../../core/content';
import { isResurrectable, num, progressRow, srsSystemOf, tableRow, type LearnerDb } from '../../../core/progression';
import { TYPE_ORDER, type Session, type SessionItem } from '../../../core/session';
import { enableStarRatings } from '../../../core/settings/sessionUi';
import { useApp, useReady } from '../../hooks/useApp';
import { useNavigate } from '../../hooks/useRoute';
import { paths } from '../../routes';
import { SessionDialog } from '../../components/session/SessionDialog';
import { sessionPath } from '../../components/session/SessionScreen';
import { useSession } from '../../components/session/useSession';
import { SubjectCards, useCardProgress, useStarRatings } from '../../components/subject';
import { useSessionMenu } from '../../components/session/SessionMenu';
import { toast } from '../../shell/toast';
import { useToolbar } from '../../shell/toolbar';
import { BurnResurrectDialog, runBurnResurrect } from '../subject/BurnResurrectDialog';
import '../../components/session/session.css';

export interface SummaryCounts {
  total: number;
  correct: number;
  /** Per type: [correct, total]. */
  byType: Record<'radical' | 'kanji' | 'vocabulary' | 'kana_vocabulary', [number, number]>;
  /** `Math.round(correctFraction * 100)`. */
  percentage: number;
}

const totalIncorrect = (i: SessionItem): number => i.incorrect.reduce((a, b) => a + b, 0);

/** `SummarySessionFragment.onViewCreatedLocal`'s counts (abandoned items left out). */
export function summaryCounts(learner: LearnerDb, items: readonly SessionItem[]): SummaryCounts {
  const byType: SummaryCounts['byType'] = { radical: [0, 0], kanji: [0, 0], vocabulary: [0, 0], kana_vocabulary: [0, 0] };
  let total = 0;
  let correct = 0;
  for (const item of items) {
    if (item.state === 'ABANDONED') continue;
    const s = learner.content.byId.get(item.id);
    if (s === undefined) continue;
    const ok = totalIncorrect(item) === 0;
    total++;
    byType[s.object][1]++;
    if (ok) {
      correct++;
      byType[s.object][0]++;
    }
  }
  // Java: Math.round((float) correctTotal / total * 100)
  const percentage = total === 0 ? 0 : Math.floor(Math.fround(Math.fround(correct / total) * 100) + 0.5);
  return { total, correct, byType, percentage };
}

/** `showItems`: the incorrect and the correct subjects, in Java's order. */
export function summaryLists(learner: LearnerDb, session: Session): { incorrect: number[]; correct: number[] } {
  const live = session.items.filter((i) => i.state !== 'ABANDONED' && learner.content.byId.has(i.id));
  const subj = (id: number): ContentSubject => learner.content.byId.get(id)!;
  const pos = (id: number) => tableRow(learner, id);
  const stageOf = (i: SessionItem) => {
    const system = srsSystemOf(learner, i.id);
    return session.type === 'REVIEW'
      ? system.getStage(i.srsStageId).getNewStage(totalIncorrect(i)) // getNewSrsStage
      : system.getStage(num(progressRow(learner, i.id), 'srsStage'));
  };
  const base = (a: number, b: number) => pos(a).level - pos(b).level || pos(a).lessonPosition - pos(b).lessonPosition || a - b;
  const incorrect = live.filter((i) => totalIncorrect(i) > 0)
    .sort((a, b) => TYPE_ORDER[subj(a.id).object] - TYPE_ORDER[subj(b.id).object] || stageOf(a).compareTo(stageOf(b)) || base(a.id, b.id))
    .map((i) => i.id);
  const correct = live.filter((i) => totalIncorrect(i) === 0).map((i) => i.id)
    .sort((a, b) => TYPE_ORDER[subj(a).object] - TYPE_ORDER[subj(b).object] || base(a, b));
  return { incorrect, correct };
}

/** Subjects unlocked since the session started (the plan's "new unlocks"), in type/level order. */
export function newUnlocks(learner: LearnerDb, since: number): number[] {
  if (since <= 0) return [];
  const out: number[] = [];
  for (const s of learner.content.subjects) {
    if (learner.table.get(s.id)?.hiddenAt !== 0) continue;
    const at = num(progressRow(learner, s.id), 'unlockedAt');
    if (at !== 0 && at >= since) out.push(s.id);
  }
  return out.sort((a, b) => TYPE_ORDER[learner.content.byId.get(a)!.object] - TYPE_ORDER[learner.content.byId.get(b)!.object]
    || tableRow(learner, a).level - tableRow(learner, b).level || tableRow(learner, a).lessonPosition - tableRow(learner, b).lessonPosition);
}

const STAR_NAMES = ['☆ ☆ ☆ ☆ ☆', '★ ☆ ☆ ☆ ☆', '★ ★ ☆ ☆ ☆', '★ ★ ★ ☆ ☆', '★ ★ ★ ★ ☆', '★ ★ ★ ★ ★'];

function SubjectGrid({ ids, learner, testId }: { ids: readonly number[]; learner: LearnerDb; testId: string }) {
  const navigate = useNavigate();
  const progressOf = useCardProgress();
  const subjects = ids.map((id) => learner.content.byId.get(id)).filter((s): s is ContentSubject => s !== undefined);
  return (
    <div className="kk-item kk-summary-grid" data-testid={testId}>
      <SubjectCards subjects={subjects} onOpenSubject={(id) => navigate(paths.subject(id))} progressOf={progressOf} />
    </div>
  );
}

/** incorrectStarSpinnerRow: the star spinner and "Bulk set star rating", with Java's confirmation and toast. */
function StarBulk({ ids, onSet }: { ids: readonly number[]; onSet(ids: readonly number[], n: number): void }) {
  const [n, setN] = useState(0);
  const [ask, setAsk] = useState(false);
  const count = ids.length;
  return (
    <div className="kk-summary-stars">
      <select aria-label="Star rating" value={n} onChange={(e) => setN(Number(e.target.value))}>
        {STAR_NAMES.map((name, i) => <option key={i} value={i}>{name}</option>)}
      </select>
      <button type="button" className="kk-btn small" onClick={() => setAsk(true)}>Bulk set star rating</button>
      <SessionDialog open={ask} title="Set star ratings?"
        message={`Do you want to set the star rating for ${count} subject${count === 1 ? '' : 's'} to ${n} star${n === 1 ? '' : 's'}?`}
        onNo={() => setAsk(false)} onYes={() => { setAsk(false); onSet(ids, n); }} />
    </div>
  );
}

/** A `TableLayout` of the summary: labels right-aligned, the value right after them. */
function CountTable({ kind, rows }: { kind: 'correct' | 'incorrect'; rows: readonly [string, string | number, string][] }) {
  return (
    <table className={`kk-summary-table ${kind}`} data-testid={`summary-${kind}`}>
      <tbody>
        {rows.map(([label, value, testId]) => (
          <tr key={testId}><th scope="row">{label}</th><td data-testid={testId}>{value}</td></tr>
        ))}
      </tbody>
    </table>
  );
}

export function SummaryScreen() {
  const app = useApp();
  const { learner, state } = useReady();
  const { rt, snap } = useSession();
  const navigate = useNavigate();
  const stars = useStarRatings();
  const [showItems, setShowItems] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resurrect, setResurrect] = useState<readonly ContentSubject[] | null>(null);
  const session = snap.session;
  const st = session?.state ?? 'INACTIVE';
  const menu = useSessionMenu(rt, session, null);
  // getToolbarTitle "Session summary" in the default toolbar colour.
  useToolbar({ title: 'Session summary', color: 'default', actions: menu.actions });

  useEffect(() => {
    if (!snap.loaded || session === null) return;
    if (st === 'INACTIVE' && snap.finished !== null) {
      const to = snap.finished.levelTestRound !== 0 ? paths.levelTest() : paths.dashboard();
      rt.clearFinished();
      navigate(to, { replace: true });
    } else if (st === 'ACTIVE' || st === 'IN_LESSON_PRESENTATION') {
      navigate(sessionPath(session.type), { replace: true });
    }
  }, [snap.loaded, snap.finished, session, st, rt, navigate]);

  const counts = useMemo(() => (session ? summaryCounts(learner, session.items) : null), [learner, session, snap.version]);
  const lists = useMemo(() => (session && showItems ? summaryLists(learner, session) : null), [learner, session, showItems, snap.version]);
  const unlocks = useMemo(() => newUnlocks(learner, snap.meta.startedAt), [learner, snap.meta.startedAt, state.revision]);

  if (!snap.loaded || session === null) return <p className="kk-muted">Loading…</p>;
  if (st !== 'FINISHING' || counts === null) {
    return (
      <div className="kk-panel" data-testid="summary-none">
        <p>No session to summarize.</p>
        <button type="button" className="kk-btn block" onClick={() => navigate(paths.dashboard(), { replace: true })}>Dashboard</button>
      </div>
    );
  }
  const levelNow = learner.progress.userLevel;
  const levelUps = snap.meta.startLevel > 0 && levelNow > snap.meta.startLevel ? levelNow - snap.meta.startLevel : 0;
  const finish = () => {
    if (busy) return;
    setBusy(true);
    void rt.finish().catch(() => setBusy(false));
  };
  const starsOn = enableStarRatings(state.prefs);
  // updateIncorrectStars / getResurrectableIds: every session item, as Java.
  const live = session.items;
  const allIncorrect = live.filter((i) => totalIncorrect(i) > 0).map((i) => i.id);
  const allCorrect = live.filter((i) => totalIncorrect(i) === 0).map((i) => i.id);
  const setStars = (ids: readonly number[], n: number) => void stars.set(ids, n).then(() => toast('Star ratings updated'));
  // hasResurrecttableIncorrect: an item with incorrect answers that can be resurrected (local mode here).
  const resurrectable = state.mode !== 'server'
    ? allIncorrect.filter((id) => isResurrectable(learner, id)).map((id) => learner.content.byId.get(id)!).filter(Boolean)
    : [];

  return (
    <div className="kk-summary" data-testid="summary">
      <div className="kk-summary-buttons">
        {!showItems && <button type="button" className="kk-btn" onClick={() => setShowItems(true)} data-testid="summary-show">Show items</button>}
        <button type="button" className="kk-btn" disabled={busy} onClick={finish} data-testid="summary-finish">Finish</button>
      </div>
      {busy && session.isDelayed() && (
        <progress className="kk-summary-progress" aria-label={`Reporting ${session.numPending()} items`} />
      )}
      {!showItems && (
        <>
          <CountTable kind="correct" rows={[
            ['Overall percentage correct:', `${counts.percentage}%`, 'summary-correct-percentage'],
            ['Radicals correct:', counts.byType.radical[0], 'summary-correct-radical'],
            ['Kanji correct:', counts.byType.kanji[0], 'summary-correct-kanji'],
            ['Vocabulary correct:', counts.byType.vocabulary[0], 'summary-correct-vocabulary'],
            ['Kana Vocabulary correct:', counts.byType.kana_vocabulary[0], 'summary-correct-kana-vocabulary'],
          ]} />
          <CountTable kind="incorrect" rows={[
            ['Overall percentage incorrect:', `${100 - counts.percentage}%`, 'summary-incorrect-percentage'],
            ['Radicals incorrect:', counts.byType.radical[1] - counts.byType.radical[0], 'summary-incorrect-radical'],
            ['Kanji incorrect:', counts.byType.kanji[1] - counts.byType.kanji[0], 'summary-incorrect-kanji'],
            ['Vocabulary incorrect:', counts.byType.vocabulary[1] - counts.byType.vocabulary[0], 'summary-incorrect-vocabulary'],
            ['Kana Vocabulary incorrect:', counts.byType.kana_vocabulary[1] - counts.byType.kana_vocabulary[0], 'summary-incorrect-kana-vocabulary'],
          ]} />
        </>
      )}
      {resurrectable.length > 0 && (
        <button type="button" className="kk-btn kk-summary-resurrect" onClick={() => setResurrect(resurrectable)}>Resurrect items with incorrect answers</button>
      )}
      {lists !== null && (
        <>
          <h2 className="kk-summary-header">Items with incorrect answers:</h2>
          {starsOn && <StarBulk ids={allIncorrect} onSet={setStars} />}
          <SubjectGrid ids={lists.incorrect} learner={learner} testId="summary-incorrect-items" />
          <h2 className="kk-summary-header">Items with only correct answers:</h2>
          {starsOn && <StarBulk ids={allCorrect} onSet={setStars} />}
          <SubjectGrid ids={lists.correct} learner={learner} testId="summary-correct-items" />
        </>
      )}
      {(levelUps > 0 || unlocks.length > 0) && (
        <section className="kk-summary-progress-section" data-testid="summary-progress">
          {levelUps > 0 && <p data-testid="summary-level-up">Level up! You are now on level {levelNow}.</p>}
          {unlocks.length > 0 && (
            <>
              <h2 className="kk-summary-header">New unlocks: {unlocks.length}</h2>
              <SubjectGrid ids={unlocks} learner={learner} testId="summary-unlocks" />
            </>
          )}
        </section>
      )}
      {resurrect !== null && (
        <BurnResurrectDialog kind="resurrect" subjects={resurrect} run={(ids) => runBurnResurrect(app, 'resurrect', ids)}
          onClose={() => setResurrect(null)} />
      )}
      {menu.dialogs}
    </div>
  );
}
