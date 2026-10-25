/**
 * The kanji level test (`local/CurriculumUi.levelTest`, `offerRound2`, `showResult`, `startRound` over core
 * `levelTest/`), with Java's texts and choices. Java shows each step as a dialog over the current screen;
 * here the step is the screen's content and its buttons are the dialog's (negative, neutral, positive).
 * A round is a self-study session (`/self-study/quiz`); when it ends the app comes back here and the next
 * step shows, as Java's dashboard offers it on resume.
 */
import { useState } from 'react';
import { blockName, describeLevel } from '../../../core/curriculum';
import {
  discardLevelTest,
  levelTestBlockScores,
  levelTestBoundaryBlock,
  levelTestResult,
  levelTestStatus,
  setLevelTestPrompted,
  startAtResult,
  startRound1,
  startRound2,
  type LevelTestOutcome,
} from '../../../core/levelTest';
import { JavaRandom } from '../../../core/rng';
import { useApp, useReady } from '../../hooks/useApp';
import { useNavigate } from '../../hooks/useRoute';
import { paths } from '../../routes';
import { useSession } from '../../components/session/useSession';
import { sessionPath } from '../../components/session/SessionScreen';
import '../../components/session/session.css';

export const SESSION_RUNNING = 'Finish or abandon your current lesson or review session first.';

export const TEST_INTRO = 'This test estimates how far your kanji knowledge reaches in JLPT order.\n\n'
  + 'Round 1: about 30 kanji, six from each of N5, N4, N3, N2 and N1. Round 2: about 18 kanji from'
  + ' the block where your knowledge thins out.\n\n'
  + 'Type the meaning and the reading of each kanji. A kanji counts as known only when both are right'
  + ' the first time, so use Don\'t know freely. Kanji you have already mastered are not asked.\n\n'
  + 'Nothing changes until you decide at the end.';

export const UNFINISHED_ROUND = 'A round of the test was not finished. Start the test again?';

interface Button {
  label: string;
  run(): void;
  primary?: boolean;
}

/** `offerRound2`'s message. */
export function round1Message(scores: ReturnType<typeof levelTestBlockScores>, boundary: number): string {
  let msg = 'Round 1 results (known of asked, estimated share of the block):\n\n';
  for (const s of scores) msg += `${blockName(s.block)}: ${s.known} of ${s.asked}, about ${Math.round(s.share * 100)}%\n`;
  msg += `\n${boundary === 0
    ? 'You know most of every JLPT block. Round 2 is not needed.'
    : `Your knowledge thins out in ${blockName(boundary)}. Round 2 asks a few kanji from its levels to find where exactly.`}`;
  return msg;
}

/** `showResult`'s message. */
export function resultMessage(r: ReturnType<typeof levelTestResult>, inJlptOrder: boolean): string {
  const where = `level ${r.level}${r.description === null ? '' : ` (${r.description})`}`;
  return `Your kanji knowledge reaches about JLPT-order ${where}.\n\n`
    + 'Starting there:\n'
    + `• The ${r.proven} kanji you answered right go straight to Guru.\n`
    + `• About ${r.probation} kanji and vocabulary below that level that you have not`
    + ' started go on probation: they come up as reviews over the next 7 days (about '
    + `${r.minutesPerDay} minutes a day); right moves them to Guru, wrong sends them`
    + ' back to your lessons.\n'
    + (inJlptOrder ? '' : '• Your curriculum switches to JLPT order.\n')
    + '• Nothing moves backwards if you are already past that level.';
}

/** The message after Start there. */
export function outcomeMessage(o: LevelTestOutcome, here: string | null): string {
  return `${o.moved ? 'Welcome to level ' : 'You stay on level '}${o.level}${here === null ? '' : ` (${here})`}. `
    + `${o.proven} kanji moved to Guru${o.moved ? `, and ${o.probation} items are on probation in your reviews.` : '.'}`;
}

export function LevelTestScreen() {
  const app = useApp();
  const { learner, state } = useReady();
  const { rt, snap } = useSession();
  const navigate = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const session = snap.session;

  const work = async (label: string, f: () => Promise<void>) => {
    if (busy !== null) return;
    setBusy(label);
    try {
      await f();
    } finally {
      setBusy(null);
    }
  };

  const startRound = (round: 1 | 2) => work(round === 1 ? 'Picking kanji…' : 'Picking kanji for round 2…', async () => {
    if (rt.get().session?.state !== 'INACTIVE') return;
    const seed = Math.floor(Math.random() * 2 ** 47);
    const ids = await app.write((db) => (round === 1 ? startRound1(db, new JavaRandom(seed)) : startRound2(db, new JavaRandom(seed))));
    if (ids.length === 0) return; // the status is ROUND2_DONE now: the result shows
    if (await rt.start('SELF_STUDY', ids, { levelTestRound: round })) navigate(paths.selfStudyQuiz());
  });
  const discard = () => work('Discarding…', async () => {
    await app.write((db) => discardLevelTest(db));
  });
  const later = () => navigate.back();

  let title = 'Kanji level test';
  let message: string;
  let buttons: Button[];

  if (state.mode === 'server') {
    message = 'The level test is not available in server mode.';
    buttons = [{ label: 'OK', run: later }];
  } else if (done !== null) {
    message = done;
    buttons = [{ label: 'OK', run: () => navigate(paths.dashboard(), { replace: true }), primary: true }];
  } else if (!snap.loaded || session === null) {
    message = 'Checking…';
    buttons = [];
  } else if (session.state !== 'INACTIVE') {
    message = SESSION_RUNNING;
    buttons = [{ label: 'OK', run: later }, { label: 'Resume', run: () => navigate(sessionPath(session.type)), primary: true }];
  } else {
    const status = levelTestStatus(learner);
    switch (status) {
      case 'ROUND1_DONE': {
        const scores = levelTestBlockScores(learner);
        message = round1Message(scores, levelTestBoundaryBlock(learner));
        buttons = [
          { label: 'Later', run: () => { void app.write((db) => setLevelTestPrompted(db)); later(); } },
          { label: 'Start over', run: () => void startRound(1) },
          { label: 'Continue', run: () => void startRound(2), primary: true },
        ];
        break;
      }
      case 'ROUND2_DONE': {
        title = 'Kanji level test result';
        message = resultMessage(levelTestResult(learner), learner.progress.curriculum === 'JLPT');
        buttons = [
          { label: 'Later', run: () => { void app.write((db) => setLevelTestPrompted(db)); later(); } },
          { label: 'Discard', run: () => void discard() },
          {
            label: 'Start there',
            primary: true,
            run: () => void work('Setting things up…', async () => {
              if (rt.get().session?.state !== 'INACTIVE') return;
              const outcome = await app.write((db, now) => startAtResult(db, now));
              const l = app.requireLearner();
              setDone(outcomeMessage(outcome, describeLevel(l.ordering, l.blocks, outcome.level)));
            }),
          },
        ];
        break;
      }
      case 'ROUND1':
      case 'ROUND2':
        message = UNFINISHED_ROUND;
        buttons = [
          { label: 'Cancel', run: later },
          { label: 'Discard test', run: () => void discard() },
          { label: 'Start again', run: () => void startRound(1), primary: true },
        ];
        break;
      default:
        message = TEST_INTRO;
        buttons = [
          { label: 'Cancel', run: later },
          { label: 'Start round 1', run: () => void startRound(1), primary: true },
        ];
    }
  }

  return (
    <section className="kk-panel" data-testid="level-test">
      <h2>{title}</h2>
      <p className="kk-pre-line" data-testid="level-test-message">{busy ?? message}</p>
      <div className="kk-btn-row">
        {buttons.map((b) => (
          <button key={b.label} type="button" className={`kk-btn small${b.primary ? '' : ' secondary'}`} disabled={busy !== null}
            onClick={b.run}>{b.label}</button>
        ))}
      </div>
    </section>
  );
}
