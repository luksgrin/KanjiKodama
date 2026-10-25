/**
 * Settings → Fast travel: `CurriculumUi.fastTravel` / `confirmTravel`. The status (`FastTravel.status`)
 * either says why no jump is possible or lists the targets; pick one, confirm, travel
 * (`FastTravel.travel` through `app.write`). Local mode only.
 */
import { useMemo, useState } from 'react';
import { fastTravel, fastTravelStatus, type FastTravelOption } from '../../../core/fastTravel';
import { currentLevelDescription } from '../../../core/progression';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Panel } from '../../components/Panel';
import { useApp, useReady } from '../../hooks/useApp';
import { LocalOnly } from '../settings/LocalOnly';
import { SESSION_RUNNING, afterProgressChange, errorMessage, paren, sessionRunning } from '../settings/progressFlow';
import '../settings/settings.css';

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

function FastTravel() {
  const app = useApp();
  const { learner, platform, state } = useReady();
  const status = useMemo(() => fastTravelStatus(learner, state.now), [learner, state.revision, state.now]);
  const [pick, setPick] = useState<FastTravelOption | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);

  const choose = async (o: FastTravelOption) => {
    setMessage(null);
    if (await sessionRunning(app)) { setMessage({ error: true, text: SESSION_RUNNING }); return; }
    setPick(o);
  };

  const travel = async () => {
    if (!pick) return;
    const target = pick.target;
    if (await sessionRunning(app)) { setPick(null); setMessage({ error: true, text: SESSION_RUNNING }); return; }
    setBusy(true);
    try {
      const count = await app.write((l, now) => fastTravel(l, target, now), { persist: 'all' });
      const where = currentLevelDescription(app.requireLearner(), target);
      setMessage({ error: false, text: `Welcome to level ${target}${paren(where)}. ${count} probation items are waiting in your reviews.` });
      afterProgressChange(app, platform);
    } catch (e) {
      setMessage({ error: true, text: `Fast travel failed, nothing changed: ${errorMessage(e)}` });
    } finally {
      setBusy(false);
      setPick(null);
    }
  };

  const here = currentLevelDescription(learner, status.level);
  return (
    <>
      {message && (
        <div className={`kk-banner${message.error ? ' error' : ' ok'}`} role="status" data-testid="fast-travel-message">
          <span className="kk-banner-text">{message.text}</span>
        </div>
      )}
      {status.blocked !== null ? (
        <Panel title="Fast travel">
          <p data-testid="fast-travel-blocked">{status.blocked}</p>
        </Panel>
      ) : (
        <Panel title={`Fast travel from level ${status.level}${paren(here)}`}>
          <ul className="kk-choice-list" data-testid="fast-travel-options">
            {status.options.map((o) => (
              <li key={o.target}>
                <button type="button" className="kk-choice" disabled={busy} data-testid={`fast-travel-${o.target}`} onClick={() => void choose(o)}>
                  {optionLabel(o)}
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      )}
      <ConfirmDialog open={pick !== null} title={pick ? `Travel to level ${pick.target}?` : ''} confirmLabel="Travel" busy={busy}
        onConfirm={() => void travel()} onCancel={() => setPick(null)}>
        <p className="kk-pre-line" data-testid="fast-travel-confirm">{pick ? travelMessage(pick) : ''}</p>
      </ConfirmDialog>
    </>
  );
}

export function FastTravelScreen() {
  return <LocalOnly><FastTravel /></LocalOnly>;
}
