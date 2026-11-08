/**
 * Fast travel, as dialogs: "Checking…", then
 * either the blocked message ("Fast travel" / why) or the list dialog "Fast travel from level N"
 * (`setItems`, Cancel), then "Travel to level M?" (Cancel / Travel), "Travelling…" and the welcome
 * message. Local mode only.
 */
import { fastTravel, fastTravelStatus, type FastTravelOption } from '../../../core/fastTravel';
import { currentLevelDescription } from '../../../core/progression';
import { useApp, useReady } from '../../hooks/useApp';
import { ChoiceList } from '../settings/AlertDialog';
import { SESSION_RUNNING, afterProgressChange, paren, sessionRunning } from '../settings/progressFlow';
import type { Alerts } from '../settings/useAlerts';

/** The option label (`String.format(Locale.ROOT, "Level %d%s: %d to prove, about %d min a day", …)`). */
export function optionLabel(o: FastTravelOption): string {
  return `Level ${o.target}${paren(o.targetDescription)}: ${o.probation} to prove, about ${o.minutesPerDay} min a day`;
}

/** `confirmTravel`'s message. */
export function travelMessage(o: FastTravelOption): string {
  return `${o.probation} kanji and vocabulary from the levels you skip go on probation. They enter your reviews at`
    + ` Apprentice IV, spread over the next 3 days (about ${o.minutesPerDay} minutes a day).\n\n`
    + 'Answer one correctly and it moves to Guru. Get it wrong and it goes back to your lessons,'
    + ' so you learn it properly.\n\n'
    + `${o.radicals} radicals from those levels wait in your lessons. Nothing is burned.\n\n`
    + 'The next fast travel unlocks after 3 days, once every probation item has been answered.';
}

export function useFastTravelFlow(alerts: Alerts): (onDone?: () => void) => void {
  const app = useApp();
  const { platform } = useReady();

  const confirmTravel = (o: FastTravelOption, done: () => void) => {
    const cancel = () => { alerts.close(); done(); };
    alerts.show({
      title: `Travel to level ${o.target}?`,
      message: travelMessage(o),
      testId: 'dialog-fast-travel-confirm',
      onCancel: cancel,
      negative: { label: 'Cancel', onClick: cancel },
      positive: {
        label: 'Travel',
        onClick: () => void (async () => {
          if (await sessionRunning(app)) { alerts.message(null, SESSION_RUNNING, done); return; }
          const count = await alerts.run('Travelling…', () => app.write((l, now) => fastTravel(l, o.target, now), { persist: 'all' }));
          if (count === undefined) return;
          afterProgressChange(app, platform);
          const where = currentLevelDescription(app.requireLearner(), o.target);
          alerts.message(null, `Welcome to level ${o.target}${paren(where)}. ${count} probation items are waiting in your reviews.`, done);
        })(),
      },
    });
  };

  return (onDone) => {
    const done = () => onDone?.();
    void (async () => {
      if (await sessionRunning(app)) { alerts.message(null, SESSION_RUNNING, done); return; }
      const status = await alerts.run('Checking…', async () => fastTravelStatus(app.requireLearner(), app.clock.now()));
      if (!status) return;
      if (status.blocked !== null) { alerts.message('Fast travel', status.blocked, done); return; }
      const here = currentLevelDescription(app.requireLearner(), status.level);
      const cancel = () => { alerts.close(); done(); };
      alerts.show({
        title: `Fast travel from level ${status.level}${paren(here)}`,
        testId: 'dialog-fast-travel',
        onCancel: cancel,
        negative: { label: 'Cancel', onClick: cancel },
        children: (
          <ChoiceList label="Fast travel" items={status.options.map((o) => ({ key: String(o.target), label: optionLabel(o), testId: `fast-travel-${o.target}` }))}
            onPick={(k) => { const o = status.options.find((x) => String(x.target) === k); if (o) confirmTravel(o, done); }} />
        ),
      });
    })();
  };
}
