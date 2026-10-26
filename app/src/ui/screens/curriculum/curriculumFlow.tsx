/**
 * Curriculum order: `CurriculumUi.chooseCurriculum` / `confirmSwitch` as the same dialogs over
 * Settings: the single-choice dialog "Curriculum order" (radio buttons, Cancel), then "Working out
 * where you would land…", "Switch to JLPT order?" (Cancel / Switch), "Reordering lessons…" and the
 * result message. Local mode only (`LocalMode.LOCAL_PREFERENCES`).
 *
 * `useCurriculumFlow` is started from the Settings row; the `/settings/curriculum` route
 * (`CurriculumScreen`) shows Settings with the flow started.
 */
import { CURRICULUM_MODE_LABEL, type CurriculumMode, type CurriculumPreview } from '../../../core/curriculum';
import { currentLevelDescription, previewCurriculum, switchCurriculum } from '../../../core/progression';
import { useApp, useReady } from '../../hooks/useApp';
import { ChoiceList } from '../settings/AlertDialog';
import { SESSION_RUNNING, afterProgressChange, paren, sessionRunning } from '../settings/progressFlow';
import type { Alerts } from '../settings/useAlerts';

const MODES: readonly { mode: CurriculumMode; label: string }[] = [
  { mode: 'WANIKANI', label: "WaniKani order: WaniKani's 60 levels" },
  { mode: 'JLPT', label: 'JLPT order: N5, N4, N3, N2, N1, then Obscure (kanji on no JLPT list). Allows fast travel.' },
];

/** The Settings row's summary (`ProgressPreferences.attach`). */
export function curriculumSummary(mode: CurriculumMode): string {
  return `${CURRICULUM_MODE_LABEL[mode]}. Tap to switch; progress on every item is kept.`;
}

/** `confirmSwitch`'s message. */
export function switchMessage(p: CurriculumPreview): string {
  let msg = `You would be placed on level ${p.placement.level}`;
  if (p.levelDescription !== null) msg += ` (${p.levelDescription})`;
  msg += ': the first level where you have mastered less than 60% of the kanji.\n\n';
  if (p.placement.backfill > 0) {
    msg += `${p.placement.backfill} kanji below that level are not mastered yet. Any of them that are still locked unlock right away as lessons.\n\n`;
  }
  return msg + 'Your progress on every item is kept; only the order of new lessons changes. You can switch back at any time.';
}

/** Returns `start(onDone?)`; `onDone` runs when the last dialog of the flow closes. */
export function useCurriculumFlow(alerts: Alerts): (onDone?: () => void) => void {
  const app = useApp();
  const { platform } = useReady();

  const confirmSwitch = async (target: CurriculumMode, done: () => void) => {
    const preview = await alerts.run('Working out where you would land…', async () => previewCurriculum(app.requireLearner(), target));
    if (!preview) return;
    alerts.show({
      title: `Switch to ${CURRICULUM_MODE_LABEL[target]}?`,
      message: switchMessage(preview),
      testId: 'dialog-curriculum-confirm',
      onCancel: () => { alerts.close(); done(); },
      negative: { label: 'Cancel', onClick: () => { alerts.close(); done(); } },
      positive: {
        label: 'Switch',
        onClick: () => void (async () => {
          if (await sessionRunning(app)) { alerts.message(null, SESSION_RUNNING, done); return; }
          const placement = await alerts.run('Reordering lessons…',
            () => app.write((l, now) => switchCurriculum(l, target, now), { persist: 'all' }));
          if (!placement) return;
          afterProgressChange(app, platform);
          const where = currentLevelDescription(app.requireLearner(), placement.level);
          alerts.message(null, `You are now in ${CURRICULUM_MODE_LABEL[target]}, on level ${placement.level}${paren(where)}.`, done);
        })(),
      },
    });
  };

  return (onDone) => {
    const done = () => onDone?.();
    void (async () => {
      if (await sessionRunning(app)) { alerts.message(null, SESSION_RUNNING, done); return; }
      const current = app.requireLearner().progress.curriculum;
      alerts.show({
        title: 'Curriculum order',
        testId: 'dialog-curriculum',
        onCancel: () => { alerts.close(); done(); },
        negative: { label: 'Cancel', onClick: () => { alerts.close(); done(); } },
        children: (
          <ChoiceList label="Curriculum order" checked={current}
            items={MODES.map((m) => ({ key: m.mode, label: m.label, testId: `curriculum-${m.mode}` }))}
            onPick={(k) => {
              alerts.close();
              const mode = k as CurriculumMode;
              if (mode !== current) void confirmSwitch(mode, done);
              else done();
            }} />
        ),
      });
    })();
  };
}
