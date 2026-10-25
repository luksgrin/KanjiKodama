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
import { useLocation, useNavigate } from '../../hooks/useRoute';
import { paths } from '../../routes';
import { useSession } from '../../components/session/useSession';
import { SessionDialog } from '../../components/session/SessionDialog';
import { DashboardScreen } from '../dashboard/DashboardScreen';
import '../../components/session/session.css';

export const SESSION_RUNNING = 'Finish or abandon your current lesson or review session first.';

export const TEST_INTRO = 'This test estimates how far your kanji knowledge reaches in JLPT order.\n\n'
  + 'Round 1: about 30 kanji, six from each of N5, N4, N3, N2 and N1. Round 2: about 18 kanji from'
  + ' the block where your knowledge thins out.\n\n'
  + 'Type the meaning and the reading of each kanji. A kanji counts as known only when both are right'
  + ' the first time, so use Don\'t know freely. Kanji you have already mastered are not asked.\n\n'
  + 'Nothing changes until you decide at the end.';

export const UNFINISHED_ROUND = 'A round of the test was not finished. Start the test again?';

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

interface Step {
  title?: string;
  message: string;
  /** Java's negative, neutral and positive buttons. */
  negative?: { label: string; run(): void };
  neutral?: { label: string; run(): void };
  positive?: { label: string; run(): void };
}

export function LevelTestScreen() {
  const app = useApp();
  const { learner, state } = useReady();
  const { rt, snap } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
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
  // The dialog closes over the dashboard (Java shows it there): back to it.
  const close = () => location.home();

  let step: Step;
  if (state.mode === 'server') {
    step = { message: 'The level test is not available in server mode.', positive: { label: 'OK', run: close } };
  } else if (done !== null) {
    step = { message: done, positive: { label: 'OK', run: close } };
  } else if (!snap.loaded || session === null) {
    step = { message: 'Checking…' };
  } else if (session.state !== 'INACTIVE') {
    // sessionRunning: Busy.message(activity, null, SESSION_RUNNING).
    step = { message: SESSION_RUNNING, positive: { label: 'OK', run: close } };
  } else {
    const status = levelTestStatus(learner);
    switch (status) {
      case 'ROUND1_DONE':
        step = {
          title: 'Kanji level test',
          message: round1Message(levelTestBlockScores(learner), levelTestBoundaryBlock(learner)),
          negative: { label: 'Later', run: () => { void app.write((db) => setLevelTestPrompted(db)); close(); } },
          neutral: { label: 'Start over', run: () => void startRound(1) },
          positive: { label: 'Continue', run: () => void startRound(2) },
        };
        break;
      case 'ROUND2_DONE':
        step = {
          title: 'Kanji level test result',
          message: resultMessage(levelTestResult(learner), learner.progress.curriculum === 'JLPT'),
          negative: { label: 'Later', run: () => { void app.write((db) => setLevelTestPrompted(db)); close(); } },
          neutral: { label: 'Discard', run: () => void discard() },
          positive: {
            label: 'Start there',
            run: () => void work('Setting things up…', async () => {
              if (rt.get().session?.state !== 'INACTIVE') return;
              const outcome = await app.write((db, now) => startAtResult(db, now));
              const l = app.requireLearner();
              setDone(outcomeMessage(outcome, describeLevel(l.ordering, l.blocks, outcome.level)));
            }),
          },
        };
        break;
      case 'ROUND1':
      case 'ROUND2':
        step = {
          title: 'Kanji level test',
          message: UNFINISHED_ROUND,
          negative: { label: 'Cancel', run: close },
          neutral: { label: 'Discard test', run: () => void discard() },
          positive: { label: 'Start again', run: () => void startRound(1) },
        };
        break;
      default:
        step = {
          title: 'Kanji level test',
          message: TEST_INTRO,
          negative: { label: 'Cancel', run: close },
          positive: { label: 'Start round 1', run: () => void startRound(1) },
        };
    }
  }

  // Busy.run: a message-only box that can't be cancelled while the work runs.
  const shown: Step = busy !== null ? { message: busy } : step;
  const noButtons = shown.negative === undefined && shown.positive === undefined;
  return (
    <div className="kk-level-test" data-testid="level-test">
      <DashboardScreen />
      <SessionDialog
        open
        title={shown.title}
        message={shown.message}
        testId="level-test-dialog"
        noButtons={noButtons}
        noLabel={shown.negative?.label ?? shown.positive?.label}
        onNo={shown.negative?.run ?? shown.positive?.run ?? close}
        neutralLabel={shown.neutral?.label}
        onYesDontAsk={shown.neutral?.run}
        yesLabel={shown.positive?.label}
        onYes={shown.negative !== undefined ? shown.positive?.run : undefined}
      >
        <span hidden data-testid="level-test-message">{shown.message}</span>
      </SessionDialog>
    </div>
  );
}
