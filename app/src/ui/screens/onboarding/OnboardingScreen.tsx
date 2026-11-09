/**
 * `/welcome`: the getting-started guide (core `onboarding/`). One card per step: what the app does,
 * font and text size, how the quizzes work, WaniKani or JLPT order, where to start, and the last
 * tips. Back / Next under the card; "Skip guide" at the top ends it at any step. Every choice
 * starts on today's default, so Next on its own skips a step.
 *
 * The shell opens it by itself on a start at the dashboard while `needsOnboarding` holds; Settings,
 * Progress, "Getting started guide" opens it again. The choices run the existing flows: the
 * curriculum switch (without its confirmation while nothing is learned yet), fast travel and the
 * WaniKani import as dialogs here, the level test on its own screen. Finishing, skipping, or leaving
 * for the level test stores `onboarding_done`.
 */
import { useState } from 'react';
import { CURRICULUM_MODE_LABEL, type CurriculumMode } from '../../../core/curriculum';
import {
  ONBOARDING_DONE_KEY,
  ONBOARDING_STEPS,
  hasProgress,
  nextStep,
  previousStep,
  startChoices,
  type OnboardingStep,
  type StartChoice,
} from '../../../core/onboarding';
import { useApp, useReady } from '../../hooks/useApp';
import { useBackHandler, useLocation, useNavigate } from '../../hooks/useRoute';
import { paths } from '../../routes';
import { useToolbar } from '../../shell/toolbar';
import { useCurriculumSwitch } from '../curriculum/curriculumFlow';
import { useFastTravelFlow } from '../fastTravel/fastTravelFlow';
import { useImportFlow } from '../import/importFlow';
import { LOCAL_ONLY_MESSAGE } from '../settings/SettingsScreen';
import { useAlerts } from '../settings/useAlerts';
import { AppearanceStep, ReadingBadge } from './placeholders';
import './onboarding.css';

const PATHS: readonly { mode: CurriculumMode; title: string; text: string }[] = [
  {
    mode: 'WANIKANI',
    title: "WaniKani order",
    text: "WaniKani's 60 levels: radicals first, then the kanji built from them, then words that use"
      + ' those kanji. A good path if you are starting from zero or know WaniKani.',
  },
  {
    mode: 'JLPT',
    title: 'JLPT order',
    text: 'Kanji grouped by the levels of the Japanese-Language Proficiency Test: N5 (the easiest),'
      + ' N4, N3, N2, N1, then kanji on no JLPT list. Includes 259 kanji WaniKani never teaches.'
      + ' A good path if you are preparing for the JLPT or already know some kanji: you can take a'
      + ' placement test or fast travel ahead.',
  },
];

const START_TEXT: Readonly<Record<StartChoice, { title: string; text: string }>> = {
  BEGINNING: { title: 'Start from the beginning', text: 'Level 1, with your first lessons waiting on the dashboard.' },
  LEVEL_TEST: {
    title: 'Take the kanji level test',
    text: 'Two short quizzes (about 30 and 18 kanji) estimate how far your kanji knowledge reaches.'
      + ' At the end you decide whether to start there; doing so uses JLPT order.',
  },
  FAST_TRAVEL: {
    title: 'Fast travel',
    text: 'Jump up to 5 levels ahead right away. The kanji and words you skip come back as reviews'
      + ' over the next 3 days: answer right and they stay learned, wrong and they return to your lessons.',
  },
  IMPORT: {
    title: 'Import my WaniKani progress',
    text: "Bring your WaniKani account's progress over, using an API token from your WaniKani settings.",
  },
};

const NOT_SURE = 'Not sure? Just tap Next: you can change this later in Settings, Progress.';

function Choice<K extends string>({ name, value, checked, title, text, onPick }: {
  name: string; value: K; checked: boolean; title: string; text: string; onPick(v: K): void;
}) {
  return (
    <label className={`kk-ob-choice${checked ? ' checked' : ''}`} data-testid={`onboarding-${name}-${value}`}>
      <input type="radio" name={name} value={value} checked={checked} onChange={() => onPick(value)} />
      <span className="kk-ob-choice-text">
        <strong>{title}</strong>
        <span className="kk-small">{text}</span>
      </span>
    </label>
  );
}

/** The dashboard's SRS breakdown tiles (its classes), without counts and not tappable. */
function StageTiles() {
  return (
    <span className="kk-dash-panel kk-srs kk-ob-srs" data-testid="onboarding-stages">
      {(['Apprentice', 'Guru', 'Master', 'Enlightened', 'Burned'] as const).map((name) => (
        <span key={name} className={`kk-srs-tile ${name.toLowerCase()}`}><span className="kk-srs-name">{name}</span></span>
      ))}
    </span>
  );
}

function WelcomeBody() {
  return (
    <>
      <p>KanjiKodama teaches radicals, kanji and Japanese words, a few at a time, and quizzes you on them
        just before you would forget.</p>
      <ul className="kk-ob-list">
        <li><strong>Lessons</strong> introduce new items with their meaning, reading and a mnemonic.</li>
        <li><strong>Reviews</strong> bring them back after hours, then days, then months. Right answers
          move an item up these stages, wrong answers move it down:
          <StageTiles /></li>
        <li>Get 90% of a level&apos;s kanji to Guru and the next level unlocks.</li>
      </ul>
      <p className="kk-small kk-muted">This short guide helps you set things up. Everything works offline and stays on this device.</p>
    </>
  );
}

function QuizBody() {
  return (
    <>
      <p>The colour of a card tells you <strong>what kind of item</strong> it is, not what to answer:</p>
      <ul className="kk-ob-types">
        <li><span className="kk-ob-swatch radical" lang="ja">亻</span><span><strong>Blue: radical.</strong> A building block of kanji. Only its meaning is asked.</span></li>
        <li><span className="kk-ob-swatch kanji" lang="ja">人</span><span><strong>Pink: kanji.</strong> Its meaning and its reading are asked.</span></li>
        <li><span className="kk-ob-swatch vocab" lang="ja">人口</span><span><strong>Purple: vocabulary.</strong> A word: its meaning and how the whole word is read.</span></li>
      </ul>
      <p>The line under the item says what to type:</p>
      <ul className="kk-ob-types">
        <li><ReadingBadge kind="meaning" /><span><strong>Meaning:</strong> answer in English.</span></li>
        <li><ReadingBadge kind="reading" /><span><strong>Reading:</strong> answer in kana. Type romaji and it turns into kana as you go.</span></li>
      </ul>
      <p>A kanji has several readings. The quiz wants the one taught in its lesson: usually the
        on&apos;yomi <ReadingBadge kind="onyomi" /> (from Chinese), sometimes the kun&apos;yomi <ReadingBadge kind="kunyomi" /> (native Japanese).</p>
      <p>Type another real reading of that kanji and the card <strong>shakes</strong>: try again, it doesn&apos;t count as wrong.</p>
    </>
  );
}

function DoneBody() {
  return (
    <>
      <p>Your first lessons are waiting on the dashboard. Reviews for them show up a few hours after you learn them.</p>
      <ul className="kk-ob-list">
        <li>Your progress stays on this device. Save a copy now and then: Settings, Progress, Save progress to a file.</li>
        <li>Curriculum order, the level test and fast travel are in Settings, Progress, as is this guide.</li>
      </ul>
    </>
  );
}

const TITLES: Readonly<Record<OnboardingStep, string>> = {
  welcome: 'Welcome to KanjiKodama',
  appearance: 'Font and text size',
  quiz: 'How the quizzes work',
  path: 'Choose your path',
  start: 'Already know some kanji?',
  done: 'You are all set',
};

export function OnboardingScreen() {
  const app = useApp();
  const { learner, state } = useReady();
  const nav = useNavigate();
  const location = useLocation();
  const alerts = useAlerts();
  const switchTo = useCurriculumSwitch(alerts);
  const fastTravel = useFastTravelFlow(alerts);
  const importFlow = useImportFlow(alerts);
  const [step, setStep] = useState<OnboardingStep>('welcome');
  const [path, setPath] = useState<CurriculumMode>(learner.progress.curriculum);
  const [start, setStart] = useState<StartChoice>('BEGINNING');
  // The order's own default when the pick isn't offered there (e.g. Import after switching to JLPT).
  const pickedStart = (m: CurriculumMode): StartChoice => (startChoices(m).includes(start) ? start : startChoices(m)[0]!);
  // Opened by the shell at start-up there is nothing to go back to: no arrow.
  useToolbar({ title: 'Welcome', back: location.depth() > 0 });

  const prev = previousStep(step);
  useBackHandler(() => { if (prev !== null) setStep(prev); return true; }, prev !== null && !alerts.open);

  const finish = (to?: string) => {
    void app.setPreference(ONBOARDING_DONE_KEY, true).then(() => {
      if (to === undefined) location.home();
      else nav(to, { replace: true });
    });
  };

  const go = (s: OnboardingStep) => {
    setStep(s);
    document.scrollingElement?.scrollTo?.({ top: 0 });
  };

  // A dialog flow that ends on the "done" step when it changed something, else stays.
  const runFlow = (flow: (onDone?: () => void) => void) => {
    const before = app.get().revision;
    flow(() => { if (app.get().revision !== before) go('done'); });
  };

  const next = () => {
    switch (step) {
      case 'path': {
        if (path === app.requireLearner().progress.curriculum) { go('start'); return; }
        switchTo(path, () => { if (app.requireLearner().progress.curriculum === path) go('start'); },
          { confirm: hasProgress(app.requireLearner()) });
        return;
      }
      case 'start': {
        const choice = pickedStart(app.requireLearner().progress.curriculum);
        if (choice === 'LEVEL_TEST') finish(paths.levelTest());
        else if (choice === 'FAST_TRAVEL') runFlow(fastTravel);
        else if (choice === 'IMPORT') runFlow(importFlow);
        else go('done');
        return;
      }
      case 'done':
        finish();
        return;
      default:
        go(nextStep(step));
    }
  };

  if (state.mode === 'server') {
    return (
      <div className="kk-onboarding" data-testid="onboarding">
        <section className="kk-panel"><p>{LOCAL_ONLY_MESSAGE}</p></section>
      </div>
    );
  }

  const index = ONBOARDING_STEPS.indexOf(step);
  const mode = learner.progress.curriculum;
  const choices = startChoices(mode);
  const picked = pickedStart(mode);
  return (
    <div className="kk-onboarding" data-testid="onboarding" data-step={step}>
      <div className="kk-ob-top">
        <ol className="kk-ob-dots" aria-label={`Step ${index + 1} of ${ONBOARDING_STEPS.length}`}>
          {ONBOARDING_STEPS.map((s, i) => <li key={s} className={i === index ? 'current' : i < index ? 'past' : undefined} />)}
        </ol>
        {step !== 'done' && (
          <button type="button" className="kk-ob-skip" data-testid="onboarding-skip" onClick={() => finish()}>Skip guide</button>
        )}
      </div>
      <section className="kk-panel kk-ob-card" aria-labelledby="kk-ob-title">
        <h2 id="kk-ob-title">{TITLES[step]}</h2>
        {step === 'welcome' && <WelcomeBody />}
        {step === 'appearance' && (
          <>
            <p>Pick the font and text size that read best for you. The rest of this guide uses them.</p>
            <AppearanceStep />
          </>
        )}
        {step === 'quiz' && <QuizBody />}
        {step === 'path' && (
          <>
            <p>In which order should new kanji come? Your progress on every item is kept if you switch later.</p>
            <div className="kk-ob-choices" role="radiogroup" aria-label="Curriculum order">
              {PATHS.map((p) => (
                <Choice<CurriculumMode> key={p.mode} name="path" value={p.mode} checked={path === p.mode} title={p.title} text={p.text} onPick={setPath} />
              ))}
            </div>
            <p className="kk-small kk-muted">{NOT_SURE}</p>
          </>
        )}
        {step === 'start' && (
          <>
            <p>You are in {CURRICULUM_MODE_LABEL[mode]}. Where would you like to start?</p>
            <div className="kk-ob-choices" role="radiogroup" aria-label="Where to start">
              {choices.map((c) => (
                <Choice<StartChoice> key={c} name="start" value={c} checked={picked === c} title={START_TEXT[c].title} text={START_TEXT[c].text} onPick={setStart} />
              ))}
            </div>
            <p className="kk-small kk-muted">{NOT_SURE}</p>
          </>
        )}
        {step === 'done' && <DoneBody />}
      </section>
      <div className="kk-btn-row kk-ob-nav">
        {prev !== null && (
          <button type="button" className="kk-btn secondary" data-testid="onboarding-back" onClick={() => go(prev)}>Back</button>
        )}
        <button type="button" className="kk-btn" data-testid={step === 'done' ? 'onboarding-finish' : 'onboarding-next'} onClick={next}>
          {step === 'done' ? 'Start learning' : step === 'welcome' ? 'Get started' : 'Next'}
        </button>
      </div>
      {alerts.node}
    </div>
  );
}
